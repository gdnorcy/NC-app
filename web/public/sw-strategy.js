/**
 * Service Worker 缓存策略判定（classic 脚本，SW 以 importScripts 加载；测试用 vm 沙箱执行同一份代码）
 *
 * 规则：
 * - /api/*            → network-first（在线拿最新，离线回退缓存）
 * - /uploads/* 及图片 → cache-first（文件名唯一，内容不可变）
 * - 其余同源 GET      → stale-while-revalidate（缓存秒开 + 后台更新）
 * - 跨源 / 非 GET     → skip（不拦截；method 判断由 SW fetch 层负责）
 */
(function (root) {
  function planRequest(url, origin) {
    var base = origin || (typeof location !== 'undefined' ? location.origin : 'http://localhost');
    var u;
    try {
      u = new URL(url, base);
    } catch (e) {
      return { strategy: 'skip' };
    }
    if (!u.origin || u.origin !== new URL(base).origin) return { strategy: 'skip' };
    if (u.pathname.indexOf('/api/') === 0) return { strategy: 'network-first' };
    if (u.pathname.indexOf('/uploads/') === 0 || /\.(webp|jpe?g|png|avif)$/i.test(u.pathname)) {
      return { strategy: 'cache-first' };
    }
    return { strategy: 'stale-while-revalidate' };
  }

  root.planRequest = planRequest;
})(typeof self !== 'undefined' ? self : globalThis);
