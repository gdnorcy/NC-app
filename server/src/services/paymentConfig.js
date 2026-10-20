/**
 * 支付配置读写（平台级 + 租户级统一口径）
 * ------------------------------------------------------------
 * 设计背景（对标菜鸟云/有赞的「参数设置」）：
 *   租户在后台**明文填写**自己的 mchId / AppID / APIv3 密钥 / 商户私钥——这是行业惯例，
 *   租户填的是自己名下商户号的密钥，看自己的密钥天经地义。
 *   但「允许明文填写」≠「明文存库」：数据库会进备份、会被人拿到，
 *   一旦明文存密钥，泄漏的就是可直接发起扣款/伪造回调的凭据。
 *
 *   故本模块的纪律是：**写入加密、读取解密、回显脱敏、更新时密钥留空即不改**。
 *   前端可以完全对齐菜鸟云的表单体验（密钥框有值、显示 ****），安全性在服务端保证。
 *
 * 为什么不放 .env：
 *   .env 是**平台级**单份配置，SaaS 下每个租户一套商户号，
 *   租户自助配置就必须落库；而平台自有商户号密钥仍建议走 env（见 WECHAT_PAY_* 兜底）。
 */
import { encryptSecret, decryptSecret, maskSecretValue, mergeSecretInput } from '../crypto.js';

/**
 * 支付配置里的敏感字段：APIv3 密钥、商户 API 私钥、商户 API 证书。
 * cert 也要加密——它虽不是私钥，但与私钥成对使用，且序列号可被用于伪造请求特征；
 * 更实际的原因：它和私钥一样是「能发起扣款请求」的材料，不该明文躺在库里。
 */
export const PAYMENT_SECRET_FIELDS = ['apiV3Key', 'privateKey', 'apiKey', 'mchKey', 'secret', 'cert'];

/** 明文非敏感字段（便于前端渲染表单，避免回显一堆内部字段） */
const PUBLIC_FIELDS = [
  'enabled', 'mchId', 'appid', 'serialNo', 'notifyUrl',
  'privateKeyPath', 'certPath', 'platformCertPath', 'platformId', 'mode',
  // 平台证书是微信公开签发的（任何人可从商户平台下载），不是机密；
  // 但体量大且运维很少手填，允许内联填写而不做加解密
  'platformCertPem',
];

/**
 * 加密一个渠道配置对象的敏感字段。
 * @param {object} ch 形如 { enabled, mchId, apiV3Key, privateKey, ... }
 * @param {object} prev 上一次保存的配置（含密文），用于「留空即不改」
 */
export function encryptChannelConfig(ch, prev = {}) {
  const out = { ...ch };
  for (const k of PAYMENT_SECRET_FIELDS) {
    if (!(k in out)) continue;
    out[k] = mergeSecretInput(out[k], prev[k]);
  }
  return out;
}

/** 解密一个渠道配置对象（供服务端内部使用，如签名/下单） */
export function decryptChannelConfig(ch) {
  if (!ch || typeof ch !== 'object') return {};
  const out = { ...ch };
  for (const k of PAYMENT_SECRET_FIELDS) {
    if (!out[k]) continue;
    try { out[k] = decryptSecret(out[k]); } catch { /* 历史明文原样保留 */ }
  }
  return out;
}

/** 脱敏一个渠道配置对象（供 API 回显，绝不返回明文密钥） */
export function maskChannelConfig(ch) {
  if (!ch || typeof ch !== 'object') return {};
  const out = {};
  for (const k of Object.keys(ch)) {
    if (PAYMENT_SECRET_FIELDS.includes(k)) {
      out[k] = maskSecretValue(decryptChannelConfig({ [k]: ch[k] })[k]);
      out[`has${k[0].toUpperCase()}${k.slice(1)}`] = !!out[k];
    } else if (PUBLIC_FIELDS.includes(k) || typeof ch[k] !== 'string') {
      out[k] = ch[k];
    }
  }
  return out;
}

/**
 * 把支付配置合并进已有的 projects.config 纯对象（不落库）。
 *
 * 为什么需要它：projects.config 同时被两处写——
 *   ① PUT /api/customer/config（租户「参数设置」总表单，含 payment 段）
 *   ② PUT /api/payment/tenant-config（支付专项配置）
 * 两处若各写一套加密逻辑，必然出现「一处加密了一处没加密」的漏洞
 * （历史 bug：customer.js 的加密循环只处理 section 顶层字段，
 *   payment.wechat.apiV3Key 是嵌套的 → 静默以明文落库）。
 * 故统一走 encryptChannelConfig。
 *
 * @param {object} cfg 已解析的 projects.config（会被就地修改）
 * @param {object} patch 本次提交的 payment 段
 */
export function mergePaymentIntoConfig(cfg, patch) {
  const prev = cfg.payment || {};
  const next = { ...prev, ...patch };
  if (patch.wechat) next.wechat = encryptChannelConfig({ ...(prev.wechat || {}), ...patch.wechat }, prev.wechat || {});
  if (patch.alipay) next.alipay = encryptChannelConfig({ ...(prev.alipay || {}), ...patch.alipay }, prev.alipay || {});
  cfg.payment = next;
  return cfg;
}

/** 脱敏一个 projects.config 中可能存在的 payment 段（供 /customer/profile 回显） */
export function maskConfigPayment(cfg) {
  if (!cfg || typeof cfg !== 'object' || !cfg.payment) return cfg;
  const out = { ...cfg.payment };
  if (cfg.payment.wechat) out.wechat = maskChannelConfig(cfg.payment.wechat);
  if (cfg.payment.alipay) out.alipay = maskChannelConfig(cfg.payment.alipay);
  return { ...cfg, payment: out };
}

function parseJSON(v, fallback) {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

/** 读平台级支付配置（明文）。来源优先级：settings.payment */
export function readPlatformPaymentConfig(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('payment');
  const cfg = parseJSON(row?.value, { wechat: { enabled: false }, alipay: { enabled: false } });
  const out = { ...cfg };
  if (cfg.wechat) out.wechat = decryptChannelConfig(cfg.wechat);
  if (cfg.alipay) out.alipay = decryptChannelConfig(cfg.alipay);
  return out;
}

/** 读平台级支付配置（脱敏，用于 API 回显） */
export function readPlatformPaymentConfigMasked(db) {
  const cfg = readPlatformPaymentConfig(db);
  const out = { ...cfg };
  if (cfg.wechat) out.wechat = maskChannelConfig(cfg.wechat);
  if (cfg.alipay) out.alipay = maskChannelConfig(cfg.alipay);
  return out;
}

/**
 * 写平台级支付配置（敏感字段加密）。
 * @param {object} incoming { wechat?, alipay? }
 * @param {object} prevRaw 上一次的原样 JSON（未解密），用于保留未提交的密钥
 */
export function writePlatformPaymentConfig(db, incoming, prevRaw) {
  const prev = parseJSON(prevRaw, {});
  const next = { ...prev };
  if (incoming.wechat) next.wechat = encryptChannelConfig({ ...prev.wechat, ...incoming.wechat }, prev.wechat || {});
  if (incoming.alipay) next.alipay = encryptChannelConfig({ ...prev.alipay, ...incoming.alipay }, prev.alipay || {});
  if (!('wechat' in next)) next.wechat = { enabled: false };
  if (!('alipay' in next)) next.alipay = { enabled: false };
  const value = JSON.stringify(next);
  const exists = db.prepare('SELECT key FROM settings WHERE key = ?').get('payment');
  if (exists) {
    db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?").run(value, 'payment');
  } else {
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('payment', ?, datetime('now'))").run(value);
  }
  return value;
}

/** 读租户 projects.config.payment（明文） */
export function readTenantPaymentConfig(db, customerId) {
  const row = db.prepare('SELECT config FROM projects WHERE id = ?').get(customerId);
  const cfg = parseJSON(row?.config, {});
  const payment = cfg.payment || { mode: 'platform', wechat: { enabled: false }, alipay: { enabled: false } };
  const out = { ...payment };
  if (payment.wechat) out.wechat = decryptChannelConfig(payment.wechat);
  if (payment.alipay) out.alipay = decryptChannelConfig(payment.alipay);
  return out;
}

/** 读租户支付配置（脱敏） */
export function readTenantPaymentConfigMasked(db, customerId) {
  const payment = readTenantPaymentConfig(db, customerId);
  const out = { ...payment };
  if (payment.wechat) out.wechat = maskChannelConfig(payment.wechat);
  if (payment.alipay) out.alipay = maskChannelConfig(payment.alipay);
  return out;
}

/**
 * 写租户 projects.config.payment（敏感字段加密，保留未提交字段）。
 * ⚠️ 租户 payment 配置与 customer.js 的 /config 接口共享同一份 projects.config，
 *    这里必须「读-改-写」整体 JSON，不能只覆盖 payment 段。
 */
export function writeTenantPaymentConfig(db, customerId, patch) {
  const row = db.prepare('SELECT config FROM projects WHERE id = ?').get(customerId);
  const cfg = parseJSON(row?.config, {});
  const prev = cfg.payment || {};
  const next = { ...prev, ...patch };
  if (patch.wechat) next.wechat = encryptChannelConfig({ ...(prev.wechat || {}), ...patch.wechat }, prev.wechat || {});
  if (patch.alipay) next.alipay = encryptChannelConfig({ ...(prev.alipay || {}), ...patch.alipay }, prev.alipay || {});
  cfg.payment = next;
  db.prepare("UPDATE projects SET config = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(cfg), customerId);
  return readTenantPaymentConfigMasked(db, customerId);
}
