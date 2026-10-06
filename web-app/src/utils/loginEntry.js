/**
 * 登录入口参数判定（纯函数，可单测）—— 2026-10-06
 *
 * 背景：pages/cardMain/login 同时承担两个角色
 *   1) **冷启动首页**（pages.json 第一个页面）：onShow 里 checkGlobalHome() 会在检测到
 *      装修中心「首页」配置时立刻 uni.reLaunch 走。
 *   2) **真实登录页**：未登录引导、401 踢回、退出平台都跳它。
 * 角色 1 会把角色 2 的使用者**刚到页面就弹走**，表现为「点登录没反应」。
 * 所以任何**主动**跳登录都必须带 manual=1 让冷启动让路。
 *
 * - isManualEntry(opts)：带 manual=1 → 跳过冷启动首页联动
 * - loginEntryUrl(path, opts)：拼出登录页 URL，自动带 manual=1（+ 可选 redirect 回跳）
 * - safeRedirect(raw)：校验 redirect 只接受站内绝对路径（排除协议相对地址 '//'）
 */

const DEFAULT_LOGIN_PATH = '/pages/cardMain/login';

/** 是否「人为进入登录页」 */
export function isManualEntry(opts) {
  const o = opts || {};
  return String(o.manual === undefined || o.manual === null ? '' : o.manual) === '1';
}

/**
 * 登录后回跳目标校验：只接受站内绝对路径。
 * 排除 '//evil.com'（协议相对地址，会被当成外链）和非 '/' 开头的相对路径。
 */
export function safeRedirect(raw) {
  const r = String(raw || '');
  if (!r || r.charAt(0) !== '/') return '';
  if (r.slice(0, 2) === '//') return '';
  return r;
}

/**
 * 拼登录页 URL。
 * @param {string} loginPath 登录页路径，默认 /pages/cardMain/login
 * @param {string} [redirect] 登录成功后回跳的站内路径，会被校验+encode
 * @returns {string} 始终带 manual=1
 */
export function loginEntryUrl(loginPath, redirect) {
  const base = loginPath || DEFAULT_LOGIN_PATH;
  const r = safeRedirect(redirect);
  return r
    ? `${base}?manual=1&redirect=${encodeURIComponent(r)}`
    : `${base}?manual=1`;
}

export const LOGIN_PATH = DEFAULT_LOGIN_PATH;