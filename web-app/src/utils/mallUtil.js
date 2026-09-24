// 商城金额工具：服务端金额口径不一（商品列表/详情=元，购物车/订单/支付=分），统一转换展示
// 分 → 元字符串（两位小数，如 1100 → '11.00'）
export function fen2yuan(fen) {
  const n = Number(fen) || 0;
  return (n / 100).toFixed(2);
}

// 元 → 元字符串（两位小数，如 5.5 → '5.50'；商品列表/详情的 price 是元）
export function yuanFmt(price) {
  const n = Number(price) || 0;
  return n.toFixed(2);
}

// 租户上下文：首页/分享进入时记录 tid，供后续页面透传（未登录浏览场景）
// 兼容三种入口：Page.onLoad(options.tid，分享直带) / App.onLaunch(options.query.tid，分享卡片)
// / 扫码场景值 options.scene（URL 编码的 query 串，如 "tid%3D1"）
export function getTid(options) {
  let tid = '';
  if (options) {
    tid = options.tid || (options.query && options.query.tid) || '';
    if (!tid && options.scene) {
      try {
        const scene = decodeURIComponent(options.scene);
        const m = scene.match(/(?:[?&]|^)tid=(\d+)/);
        tid = m ? m[1] : '';
      } catch { /* 忽略解析失败 */ }
    }
  }
  if (tid) {
    try { uni.setStorageSync('mall_tid', String(tid)); } catch { /* 忽略 */ }
    return String(tid);
  }
  try { return uni.getStorageSync('mall_tid') || ''; } catch { return ''; }
}

// 读登录态 token：H5 端 localStorage 直读优先（uni H5 storage 有内存缓存，与 localStorage 直写可能不同步），小程序端 fallback uni
export function getToken() {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem('card_token');
      if (v) return v;
    }
  } catch { /* 忽略 */ }
  try { return uni.getStorageSync('card_token'); } catch { return ''; }
}
