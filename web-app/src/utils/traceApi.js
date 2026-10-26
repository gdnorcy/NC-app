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
