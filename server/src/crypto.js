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

/**
 * 安全读取：自动兼容历史明文数据，解密失败不抛（返回原值）。
 * 所有「读密钥」的地方都必须走这个函数，而不是直接用库里的字符串。
 */
export function readSecret(cipher) {
  if (!cipher) return '';
  try { return decryptSecret(cipher); } catch { return String(cipher); }
}

/** 脱敏回显：前端展示用，永不把明文密钥送回浏览器 */
export function maskSecretValue(plain) {
  if (!plain) return '';
  const s = String(plain);
  if (s.length <= 8) return '****';
  return s.slice(0, 4) + '****' + s.slice(-4);
}

/**
 * 合并「本次提交的密钥」到「库中已有密文」。
 * 语义：空串或**脱敏占位符** = 「不修改」，保留原密文。
 * 占位符判定用 contains('****') 而不是 startsWith —— maskSecretValue 回显的是
 * `S_T1****` / `KEY****1234` 这种前缀+****+后缀形态，只判前缀会漏判，
 * 导致前端把展示值原样提交 → 密钥被占位符覆盖（等于静默清空凭据）。
 * 这样后台可以像菜鸟云那样把 AppSecret/私钥做成可回显的输入框，
 * 而前端保存其它字段时不会把密钥擦空。
 */
export function mergeSecretInput(submitted, existingCipher) {
  const v = typeof submitted === 'string' ? submitted.trim() : '';
  if (!v || v.includes('****')) return existingCipher || '';
  // 值未改动时原样保留密文（避免二次加密导致历史数据膨胀）
  try {
    if (existingCipher && decryptSecret(existingCipher) === v) return existingCipher;
  } catch { /* 非密文历史数据，继续加密 */ }
  return encryptSecret(v);
}
