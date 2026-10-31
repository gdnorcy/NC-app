/**
 * 防伪溯源 trace —— C 端公开 API 封装（/api/trace/public/*）
 *
 * 🔴 基址单一来源 = utils/apiBase.js 的 API_HOST（禁在本文件硬编码 '/api/trace'）：
 *    H5 端同源相对路径（任意域名/端口部署可用）；小程序端 uni.request 必须完整 URL。
 *    写死 '/api/trace' 会导致 H5 非同源部署 404 + MP 端缺 host。
 *
 * 🔴 死接口零容忍：每个方法都必须有后端真实路由（server/src/routes/trace.js）。
 *    - scanEntry  → GET  /public/scan-entry
 *    - verifyTrace → POST /public/verify
 *    - traceHistory→ GET  /public/history
 *    - myGoods    → GET  /public/mygoods
 *    - claimReward→ POST /public/claim
 *    - traceSceneQr→ POST /public/mp-scene（临时引导二维码，供公众号推送方案使用）
 *
 * 🔴 租户定位：公开段租户只认「URL ?tid=」或「登录态」，前端必须带 tid
 *    （与 mall 的 requireGoodsApp 同款口径）；本页由 pages/trace/index.vue 透传。
 *
 * ⚠️ 认证：公开段不强制登录，但登录后可解析出 openid（领奖/我的奖品用）。
 *    createApiClient 会自动注入 card_token，401 时按既有约定处理。
 */
import { createApiClient, qs } from './apiClient.js';
import { API_HOST } from './apiBase.js';

const BASE_URL = API_HOST + '/api/trace/public';
const { request } = createApiClient(BASE_URL);

/** 公开段防伪码清洗结果 */
export function scanEntry(co, tid) {
  return request('/scan-entry' + qs({ co, tid }));
}

/** 防伪码验真（首次查询会写查询记录并可能触发奖励） */
export function verifyTrace(data, tid) {
  return request('/verify' + qs({ tid }), 'POST', data);
}

/** 单码公开查询历史（不含 openid/ip 等隐私字段） */
export function traceHistory(code, tid) {
  return request('/history' + qs({ code, tid }));
}

/** 我的奖品列表（需登录态，否则 401） */
export function myGoods(params, tid) {
  return request('/mygoods' + qs({ ...params, tid }));
}

/** 领取奖品 / 红包（需登录态；手机号 sj 必填） */
export function claimReward(data, tid) {
  return request('/claim' + qs({ tid }), 'POST', data);
}

/**
 * 网页授权跳转地址（服务端签发，前端只负责跳过去）。
 * 🔴 openid 的取法只能由服务端决定 —— 前端直传 openid 等于谁都能冒充谁。
 * @param {string} redirectPath **本站相对路径**（含 hash），服务端只放行这类地址
 */
export function wxAuthStartUrl(tid, redirectPath) {
  return `${API_HOST}/api/trace/public/wx-auth/start?tid=${encodeURIComponent(tid || '')}&redirect=${encodeURIComponent(redirectPath || '')}`;
}

/**
 * 当前商户的扫码查询方案（**必须在验真之前问**）。
 * GET /public/scan-mode
 * 🔴 顺序反了会重复计数：先验真再去网页授权 → 授权回来页面重载再验一次，
 *    两次 openid 不同 → 21 秒去重窗口拦不住 → 查询次数被同一个人刷成 2 次。
 */
export function traceScanMode(tid) {
  return request('/scan-mode' + qs({ tid }));
}

/**
 * 取一张「长按识别 → 公众号推送验真结果」用的临时引导二维码。
 * POST /public/mp-scene
 *
 * 🔴 服务端已经做了 60 秒幂等复用：同一个人反复打开溯源页不会每次
 *    烧一个公众号二维码额度，图也不会变（换了图用户手里那张就废了）。
 * @returns {Promise<{imageUrl:string, expiresAt:string, sceneId:number}>} imageUrl 是同源相对地址
 */
export function traceSceneQr(code, tid, oc) {
  return request('/mp-scene' + qs({ tid }), 'POST', { code, oc });
}

/**
 * 经销商自助激活批次（P2 先印后绑）。
 *
 * 🔴 租户标识只能走 URL ?tid=（公开段不认 body 里的 tid，否则改一个参数就能激活别人家的批次）。
 * @param {string} batch 批次号
 * @param {string} pin 8 位激活口令
 * @param {string} tid 租户 ID
 */
export function activateBatch(batch, pin, tid) {
  return request('/batch-activate' + qs({ tid }), 'POST', { batch, pin });
}

/**
 * H5 跳转小程序：向服务端换取微信 URL Link（仅本平台小程序可用，凭证约束见服务端）。
 * POST /public/urllink
 * @param {{appId:string, path:string, query?:string, envVersion?:string}} payload
 * @returns {Promise<{urlLink:string}>}
 */
export function fetchMiniUrlLink(payload) {
  return request('/urllink', 'POST', payload);
}
