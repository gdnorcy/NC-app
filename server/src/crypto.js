import crypto from 'node:crypto';

/**
 * 密钥加密：AES-256-GCM，主密钥来自环境变量 STORAGE_KEY（至少 32 字节）。
 * 默认值为开发密钥，生产环境必须设置 STORAGE_KEY。
 */
function masterKey() {
  const raw = process.env.STORAGE_KEY || 'panorama-dev-storage-key-0123456789ab';
  return crypto.createHash('sha256').update(raw).digest(); // 32 字节
}

const ALGO = 'aes-256-gcm';

/** 加密敏感配置（如云存储 SecretKey），返回 base64(iv.tag.cipher) */
export function encryptSecret(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/** 解密；内容非法或主密钥变化时抛出异常 */
export function decryptSecret(encoded) {
  if (!encoded) return '';
  const buf = Buffer.from(encoded, 'base64');
  if (buf.length < 28) throw new Error('密钥数据损坏');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
