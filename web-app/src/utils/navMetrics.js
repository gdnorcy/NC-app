/**
 * 小程序沉浸式导航度量（跨端）
 *
 * 背景：pages.json 里绝大多数页面配了 navigationStyle: 'custom'，此时微信原生
 * navigationBar 不渲染（navigationBarTitleText 也不显示），头部完全由页面自绘。
 * 自绘就必须自己处理两件事，否则一定出问题：
 *   1) 状态栏占位：内容顶到屏幕最上方，被刘海/信号栏压住；
 *   2) 胶囊避让：右上角「最小化 + 三个点」是微信原生控件，开发者不可自定义、
 *      不可覆盖，点击事件还会冲突 —— 官方设计指南明确要求「预留该区域空间」。
 *
 * 度量公式（微信官方社区通用做法）：
 *   statusBarHeight = 系统状态栏高度
 *   navBarHeight    = (胶囊 top - statusBarHeight) * 2 + 胶囊 height
 *                     （上下留白对称，保证自绘标题与胶囊纵向居中对齐）
 *   capsuleRightPad = 屏宽 - 胶囊 right（右侧需避让的宽度）
 *
 * H5 / App 端没有胶囊概念，退化为「无状态栏占位、无右侧避让」，保持原视觉。
 */

/** 默认值：非小程序端（无状态栏、无胶囊） */
const FALLBACK = {
  isMp: false,
  statusBarHeight: 0,
  navBarHeight: 44, // 常规标题栏高度（iOS 44pt 语义）
  capsuleWidth: 0,
  capsuleRightPad: 0,
  menuTop: 0,
  screenWidth: 375,
};

let cached = null;

/** 读取（并缓存）导航度量。跨端安全：任何一步失败都退回 H5 默认值。 */
export function getNavMetrics() {
  if (cached) return cached;

  // #ifdef MP-WEIXIN
  try {
    // getWindowInfo 是 getSystemInfoSync 的新版替代（后者已不推荐）
    let info = null;
    if (typeof uni.getWindowInfo === 'function') {
      info = uni.getWindowInfo();
    } else if (typeof uni.getSystemInfoSync === 'function') {
      info = uni.getSystemInfoSync();
    }
    const statusBarHeight = (info && info.statusBarHeight) || 20;
    const screenWidth = (info && info.screenWidth) || 375;

    // 胶囊 rect：拿不到时（极端机型/开发者工具）用经验值兜底
    let rect = null;
    try {
      if (typeof uni.getMenuButtonBoundingClientRect === 'function') {
        rect = uni.getMenuButtonBoundingClientRect();
      }
    } catch (e) {
      rect = null;
    }
    if (!rect || !rect.height) {
      rect = { top: statusBarHeight + 7, height: 32, right: screenWidth - 7, width: 87 };
    }

    cached = {
      isMp: true,
      statusBarHeight,
      navBarHeight: (rect.top - statusBarHeight) * 2 + rect.height,
      capsuleWidth: rect.width || 87,
      capsuleRightPad: Math.max(0, screenWidth - (rect.right || screenWidth - 7)),
      menuTop: rect.top,
      screenWidth,
    };
    return cached;
  } catch (e) {
    cached = { ...FALLBACK };
    return cached;
  }
  // #endif

  // #ifndef MP-WEIXIN
  cached = { ...FALLBACK };
  return cached;
  // #endif
}

/**
 * 导航条根节点样式：状态栏占位 + 标题栏高度。
 * @param {object} opt
 * @param {string} opt.bg    背景色（默认白）
 * @param {string} opt.color 前景色（默认 #1d2129）
 * @param {boolean} opt.sticky 是否 sticky 定位（默认 true，保持原页面行为）
 */
export function navRootStyle(opt = {}) {
  const m = getNavMetrics();
  return {
    paddingTop: m.statusBarHeight + 'px',
    background: opt.bg || '#ffffff',
    color: opt.color || '#1d2129',
    boxSizing: 'border-box',
  };
}

/** 标题栏那一行的样式：高度按设备算，左右按胶囊宽度对称留白（标题真正视觉居中） */
export function navBarRowStyle(opt = {}) {
  const m = getNavMetrics();
  return {
    height: m.navBarHeight + 'px',
    paddingLeft: '24rpx',
    paddingRight: m.capsuleRightPad + 'px',
    boxSizing: 'border-box',
  };
}

/** 页面内容需要额外让出的头部总高度（供 scroll-view / sticky 元素使用） */
export function navTotalHeight() {
  const m = getNavMetrics();
  return m.statusBarHeight + m.navBarHeight;
}

/**
 * 统一返回：优先 navigateBack；没有上一页（reLaunch 进来的首页）时兜底回退，
 * 避免「点了没反应」或直接退出小程序。
 * @param {string} fallback 兜底页面（默认回名片首页）
 */
export function goBack(fallback = '/pages/cardMain/home') {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  if (pages.length > 1) {
    uni.navigateBack({ delta: 1 });
    return;
  }
  uni.reLaunch({
    url: fallback,
    fail: () => uni.switchTab({ url: fallback, fail: () => {} }),
  });
}
