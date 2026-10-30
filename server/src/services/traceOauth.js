/**
 * 网页授权结果凭据（openid 载体）。
 *
 * 🔴 为什么需要它：openid 是「这个人是谁」的唯一凭据，一旦允许前端直传，
 *    任何人都能冒充别人的 openid 去领首查奖励、污染查询记录、拿别人的场景码。
 *    所以流程是：**只有服务端网页授权能签发**，前端只是在后续请求里原样回传这张凭据。
 *
 * 🔴 为什么用自己的 AES-GCM 密文而不是 JWT：本平台已有统一密钥体系
 *    （crypto.js 的 STORAGE_KEY 主密钥），不引入第二套密钥与第二个签名算法。
 *    密文带 auth tag → 没有主密钥就伪造不出来，也不需要额外存表。
 */
import { decryptSecret, encryptSecret } from '../crypto.js';

/** 凭据有效期（秒）。它只在「扫码 → 出引导码」这一小段里用，没必要活很久。 */
export const OPENID_TICKET_TTL = 10 * 60;

/**
 * 签发凭据。
 * @param {number} tenantId 租户（**绑进凭据里**：换租户用同一张凭据必须失效）
 * @param {string} openid 授权得到的 openid
 */
export function issueOpenidTicket(tenantId, openid, ttlSeconds = OPENID_TICKET_TTL) {
  if (!openid) return '';
  const payload = JSON.stringify({
    t: Number(tenantId) || 0,
    o: String(openid),
    e: Date.now() + (Number(ttlSeconds) || OPENID_TICKET_TTL) * 1000,
  });
  return encryptSecret(payload);
}

/**
 * 读出凭据里的 openid。
 * @returns {string} 空串 = 没传 / 被改过 / 过期 / **换了租户**（一律当作没授权，不报错、不泄露原因）
 */
export function readOpenidTicket(ticket, tenantId) {
  const raw = String(ticket || '').trim();
  if (!raw) return '';
  try {
    const o = JSON.parse(decryptSecret(raw));
    if (Number(o?.t) !== Number(tenantId)) return ''; // 跨租户借用 = 无效
    if (!Number(o?.e) || Number(o.e) < Date.now()) return ''; // 过期
    return String(o?.o || '');
  } catch {
    return '';
  }
}
