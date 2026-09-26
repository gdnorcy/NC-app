/**
 * C 端 uni 请求工厂（2026-09-18 新增，方案C）
 * - 统一封装：token 注入 / 401 清凭证跳登录 / 响应解包 / 错误 reject
 * - cardApi = createApiClient('/api/card')，mallApi = createApiClient('/api/mall')
 *   逻辑一份代码，各自前缀；未来新增 C 端应用（live/store/content）同法生成
 * - 登录态统一：默认读 uni storage 'card_token'（H5/小程序一致），避免多套 token 不同步
 */
export function createApiClient(baseURL, options = {}) {
  const tokenKey = options.tokenKey || 'card_token';
  const loginPath = options.loginPath || '/pages/cardMain/login';

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
            // 默认 401 清凭证跳登录；调用方传 opts.skipAuthRedirect=true 时只降级不跳转
            // （会员中心等"游客也可浏览"的页面，登录数据失败应保持页面可见）
            console.warn('[apiClient-401]', url, 'skip:', !!(opts && opts.skipAuthRedirect));
            if (opts.skipAuthRedirect) {
              reject(new Error('未登录'));
              return;
            }
            clearToken();
            try { uni.removeStorageSync('card_user'); } catch { /* 忽略 */ }
            uni.reLaunch({ url: loginPath });
            reject(new Error('未登录'));
            return;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            reject(new Error(res.data?.error || '请求失败'));
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
