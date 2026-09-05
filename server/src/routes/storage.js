import express from 'express';
import { encryptSecret } from '../crypto.js';
import { readAllProviders, readStorageConfig, getStorage, STORAGE_PROVIDERS } from '../storage/index.js';
import { requireAuth, requireRole } from '../auth.js';
import { addOperationLog } from '../db.js';

const PARAM_FIELDS = ['accessKey', 'bucket', 'region', 'zone', 'folder', 'cdnDomain'];

/** 配置出参：永不回传密钥明文 */
function toPublicConfig(db) {
  const { provider, providers, updatedAt } = readAllProviders(db);
  const out = {};
  for (const name of STORAGE_PROVIDERS) {
    const p = providers[name];
    const pub = {};
    for (const f of PARAM_FIELDS) pub[f] = p[f] || '';
    pub.hasSecretKey = Boolean(p.secretKey);
    out[name] = pub;
  }
  return { provider, providers: out, updatedAt };
}

function sanitizeConfig(body) {
  const cfg = {};
  for (const f of PARAM_FIELDS) {
    cfg[f] = typeof body[f] === 'string' ? body[f].trim() : '';
  }
  cfg.cdnDomain = cfg.cdnDomain.replace(/\/+$/, '');
  cfg.folder = cfg.folder.replace(/^\/+|\/+$/g, '');
  return cfg;
}

export function createStorageRouter(db) {
  const router = express.Router();
  router.use(requireAuth);
  // 存储配置涉及云存储密钥，仅 admin 可操作
  router.use(requireRole('admin'));

  router.get('/storage', (_req, res) => {
    res.json({ config: toPublicConfig(db) });
  });

  router.put('/storage', (req, res) => {
    const body = req.body || {};
    const provider = STORAGE_PROVIDERS.includes(body.provider) ? body.provider : 'local';
    const form = sanitizeConfig(body);
    // 写库用密文版配置（readAllProviders 返回的是解密版，不能直接回写）
    const rawRow = db.prepare('SELECT providers FROM storage_config WHERE id = 1').get();
    let raw = {};
    try {
      raw = JSON.parse(rawRow.providers || '{}');
    } catch {
      raw = {};
    }
    const existing = raw[provider] || {};
    // 密钥留空表示保持原值（按厂商独立保存）
    const secretKey =
      typeof body.secretKey === 'string' && body.secretKey.trim()
        ? encryptSecret(body.secretKey.trim())
        : (existing.secretKey || '');
    raw[provider] = { ...existing, ...form, secretKey };
    db.prepare(
      "UPDATE storage_config SET provider = ?, providers = ?, updated_at = datetime('now') WHERE id = 1"
    ).run(provider, JSON.stringify(raw));
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'update_storage', targetType: 'storage', detail: `切换存储为: ${provider}`, ip: req.ip });
    res.json({ config: toPublicConfig(db) });
  });

  router.post('/storage/test', async (req, res) => {
    try {
      const body = req.body || {};
      const provider = STORAGE_PROVIDERS.includes(body.provider) ? body.provider : null;
      let cfg;
      if (provider && typeof body.secretKey === 'string') {
        // 传入表单配置则用表单值测试（不落库）
        cfg = { provider, ...sanitizeConfig(body) };
      } else {
        // 否则测试已保存配置（读激活厂商或指定厂商）
        const all = readAllProviders(db);
        cfg = { provider: provider || all.provider, ...all.providers[provider || all.provider] };
      }
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
