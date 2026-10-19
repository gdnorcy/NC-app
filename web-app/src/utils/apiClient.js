/**
 * C 端 uni 请求工厂（2026-09-18 新增，方案C）
 * - 统一封装：token 注入 / 401 清凭证跳登录 / 响应解包 / 错误 reject
 * - cardApi = createApiClient('/api/card')，mallApi = createApiClient('/api/mall')
 *   逻辑一份代码，各自前缀；未来新增 C 端应用（live/store/content）同法生成
 * - 登录态统一：默认读 uni storage 'card_token'（H5/小程序一致），避免多套 token 不同步
 * - 401 跳登录统一走 loginEntryUrl()（必带 manual=1）：登录页同时是冷启动首页，
 *   不带该标记会被它onShow 的首页联动立刻弹走（「点登录没反应」）
 */
import { loginEntryUrl, LOGIN_PATH } from './loginEntry.js';

export function createApiClient(baseURL, options = {}) {
  const tokenKey = options.tokenKey || 'card_token';
  const loginPath = options.loginPath || LOGIN_PATH;

  // 读登录态：H5 端 uni storage 与 localStorage 直写可能不同步（uni H5 有内存缓存），
  // 优先直读 localStorage（同源，token 字符串一致）；小程序端无 localStorage 走 uni 原生。
  function readToken() {
    try {
      if (typeof localStorage !== 'undefined') {
        const v = localStorage.getItem(tokenKey);
        if (v) return v;
      }
    } catch { /* 忽略 */ }
    return uni.getStorageSync(tokenKey);
  }

  function clearToken() {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(tokenKey);
    } catch { /* 忽略 */ }
    try { uni.removeStorageSync(tokenKey); } catch { /* 忽略 */ }
  }

  /** 当前页站内路径（用于登录后回跳），取不到返回空 */
  function currentPath() {
    try {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
      const cur = pages[pages.length - 1];
      if (!cur || !cur.route) return '';
      const q = cur.options || {};
      const qs2 = Object.keys(q)
        .filter((k) => q[k] !== undefined && q[k] !== null && q[k] !== '')
        .map((k) => `${k}=${encodeURIComponent(q[k])}`)
        .join('&');
      return '/' + cur.route + (qs2 ? '?' + qs2 : '');
    } catch { return ''; }
  }

  function request(url, method = 'GET', data = {}, opts = {}) {
    return new Promise((resolve, reject) => {
      const token = readToken();
      uni.request({
        url: url.startsWith('http') ? url : baseURL + url,
        method,
        data,
        header: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        success: (res) => {
          if (res.statusCode === 401) {
            // 401 处理：调用方显式 skipAuthRedirect，或未持有 token（游客模式）→ 只降级不跳登录；
            // 已登录但 token 失效才清凭证跳登录页（避免游客浏览名片/商城首页时被反复踢回登录页）
            const hasToken = !!token;
            console.warn('[apiClient-401]', url, 'skip:', !!(opts && opts.skipAuthRedirect) || !hasToken);
            if (opts.skipAuthRedirect || !hasToken) {
              reject(new Error('未登录'));
              return;
            }
            clearToken();
            try { uni.removeStorageSync('card_user'); } catch { /* 忽略 */ }
            const back = currentPath();
            uni.reLaunch({ url: loginEntryUrl(loginPath, back) });
            reject(new Error('未登录'));
            return;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            // 挂上 status/data：调用方可按业务 code 分支（如 videos 409 duplicated / 403 limitHit）
            const err = new Error(res.data?.error || '请求失败');
            err.status = res.statusCode;
            err.data = res.data;
            reject(err);
          }
        },
        fail: (err) => reject(err),
      });
    });
  }

  return { request, baseURL };
}

/** URL query 拼装辅助：{a:1,b:'x'} → '?a=1&b=x'；空参数跳过 */
export function qs(params) {
  if (!params) return '';
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? '?' + parts.join('&') : '';
}
