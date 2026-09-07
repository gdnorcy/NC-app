import fs from 'node:fs';
import path from 'node:path';
import { decryptSecret } from '../crypto.js';
import { config } from '../config.js';
import { LocalStorage } from './local.js';
import { OssStorage } from './oss.js';
import { QiniuStorage } from './qiniu.js';

/** 已注册的存储实现（默认三家，测试可注册 fake 验证链路） */
const registry = new Map([
  ['local', LocalStorage],
  ['oss', OssStorage],
  ['qiniu', QiniuStorage],
]);

export function registerStorageProvider(name, cls) {
  registry.set(name, cls);
}

/**
 * 从任意存储读取文件内容（供金字塔重建等异步任务回读素材）
 * - /uploads/ 开头：本地磁盘读取
 * - 其余：按 URL 拉取（OSS/Qiniu 外链）
 */
export async function readStorageFile(storage, publicUrl) {
  if (!publicUrl) return null;
  if (publicUrl.startsWith('/uploads/')) {
    const rel = decodeURIComponent(publicUrl.replace(/^\/uploads\//, ''));
    const root = path.resolve(config.uploadsDir);
    const target = path.resolve(path.join(root, rel));
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('非法存储路径');
    return fs.readFileSync(target);
  }
  const resp = await fetch(publicUrl);
  if (!resp.ok) throw new Error(`远程文件读取失败: HTTP ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

export const STORAGE_PROVIDERS = ['local', 'oss', 'qiniu'];

function emptyParams() {
  return { accessKey: '', secretKey: '', bucket: '', region: '', zone: '', folder: '', cdnDomain: '' };
}

/** 读取全部厂商配置（providers JSON），密钥解密为明文 */
export function readAllProviders(db) {
  const row = db.prepare('SELECT * FROM storage_config WHERE id = 1').get() || {};
  let raw = {};
  try {
    raw = JSON.parse(row.providers || '{}');
  } catch {
    raw = {};
  }
  const providers = {};
  for (const name of STORAGE_PROVIDERS) {
    const p = { ...emptyParams(), ...(raw[name] || {}) };
    providers[name] = {
      accessKey: p.accessKey || '',
      secretKey: decryptSecret(p.secretKey || ''),
      bucket: p.bucket || '',
      region: p.region || '',
      zone: p.zone || '',
      folder: p.folder || '',
      cdnDomain: p.cdnDomain || '',
    };
  }
  return { provider: row.provider || 'local', providers, updatedAt: row.updated_at || '' };
}

/** 读取当前激活厂商的存储配置 */
export function readStorageConfig(db) {
  const { provider, providers } = readAllProviders(db);
  return { provider, ...providers[provider] };
}

/** 创建指定配置对应的存储实例（不传 cfg 时读取激活厂商配置） */
export async function getStorage(db, cfg) {
  const resolved = cfg || readStorageConfig(db);
  const Cls = registry.get(resolved.provider) || LocalStorage;
  return new Cls(resolved);
}
