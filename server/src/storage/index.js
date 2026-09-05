import { decryptSecret } from '../crypto.js';
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

/** 从数据库读取存储配置（解密密钥） */
export function readStorageConfig(db) {
  const row = db.prepare('SELECT * FROM storage_config WHERE id = 1').get() || {};
  return {
    provider: row.provider || 'local',
    accessKey: row.access_key || '',
    secretKey: decryptSecret(row.secret_key || ''),
    bucket: row.bucket || '',
    region: row.region || '',
    cdnDomain: row.cdn_domain || '',
  };
}

/** 创建指定配置对应的存储实例（不传 cfg 时读取数据库配置） */
export async function getStorage(db, cfg) {
  const resolved = cfg || readStorageConfig(db);
  const Cls = registry.get(resolved.provider) || LocalStorage;
  return new Cls(resolved);
}
