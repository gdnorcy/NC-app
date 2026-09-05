import express from 'express';
import { encryptSecret } from '../crypto.js';
import { readStorageConfig, getStorage } from '../storage/index.js';
import { requireAuth } from '../auth.js';

const PROVIDERS = ['local', 'oss', 'qiniu'];

/** 配置出参：永不回传密钥明文 */
function toPublicConfig(row) {
  return {
    provider: row.provider || 'local',
    accessKey: row.access_key || '',
    hasSecretKey: Boolean(row.secret_key),
    bucket: row.bucket || '',
    region: row.region || '',
    cdnDomain: row.cdn_domain || '',
    updatedAt: row.updated_at || '',
  };
}

export function createStorageRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/storage', (_req, res) => {
    const row = db.prepare('SELECT * FROM storage_config WHERE id = 1').get();
    res.json({ config: toPublicConfig(row || {}) });
  });

  router.put('/storage', (req, res) => {
    const body = req.body || {};
    const provider = PROVIDERS.includes(body.provider) ? body.provider : 'local';
    const accessKey = typeof body.accessKey === 'string' ? body.accessKey.trim() : '';
    const bucket = typeof body.bucket === 'string' ? body.bucket.trim() : '';
    const region = typeof body.region === 'string' ? body.region.trim() : '';
    const cdnDomain = (typeof body.cdnDomain === 'string' ? body.cdnDomain.trim() : '').replace(/\/+$/, '');

    const current = db.prepare('SELECT * FROM storage_config WHERE id = 1').get();
    // 密钥留空表示保持原值
    const secretKey =
      typeof body.secretKey === 'string' && body.secretKey.trim()
        ? encryptSecret(body.secretKey.trim())
        : (current && current.secret_key) || '';

    db.prepare(
      `UPDATE storage_config
       SET provider = ?, access_key = ?, secret_key = ?, bucket = ?, region = ?, cdn_domain = ?, updated_at = datetime('now')
       WHERE id = 1`
    ).run(provider, accessKey, secretKey, bucket, region, cdnDomain);

    const updated = db.prepare('SELECT * FROM storage_config WHERE id = 1').get();
    res.json({ config: toPublicConfig(updated) });
  });

  router.post('/storage/test', async (req, res) => {
    try {
      const body = req.body || {};
      // 传入了表单配置则用表单值测试（不落库）；否则测试已保存配置
      const cfg =
        body.provider && PROVIDERS.includes(body.provider)
          ? {
              provider: body.provider,
              accessKey: typeof body.accessKey === 'string' ? body.accessKey.trim() : '',
              secretKey: typeof body.secretKey === 'string' ? body.secretKey.trim() : '',
              bucket: typeof body.bucket === 'string' ? body.bucket.trim() : '',
              region: typeof body.region === 'string' ? body.region.trim() : '',
              cdnDomain: (typeof body.cdnDomain === 'string' ? body.cdnDomain.trim() : '').replace(/\/+$/, ''),
            }
          : readStorageConfig(db);
      const storage = await getStorage(db, cfg);
      // 云厂商 SDK 网络请求可能长时间挂起，统一 10 秒超时兜底
      const result = await Promise.race([
        storage.testConnection(),
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: false, message: '连接超时（10 秒），请检查网络与云服务状态' }), 10000)
        ),
      ]);
      res.json(result);
    } catch (err) {
      res.status(400).json({ ok: false, message: `测试失败：${err.message || err}` });
    }
  });

  return router;
}
