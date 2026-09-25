// 智能名片底部Tab页状态保留工具
// 底部4个Tab切换时页面整页重建，本工具在离开时保存关键状态、返回时恢复，
// 让切换体验接近"常驻不重载"：滚动位置、筛选条件、列表数据不丢失。
export function saveCardTabState(pageKey, state) {
  try {
    uni.setStorageSync('cardTab_' + pageKey, state);
  } catch (e) {}
}
export function loadCardTabState(pageKey) {
  try {
    return uni.getStorageSync('cardTab_' + pageKey) || null;
  } catch (e) {
    return null;
  }
}
// 当前页面滚动位置（H5用window，其它端返回0）
export function h5ScrollTop() {
  // #ifdef H5
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  // #endif
  // #ifndef H5
  return 0;
  // #endif
}
// 恢复滚动位置
export function restoreScrollTop(pageKey) {
  const s = loadCardTabState(pageKey);
  if (s && typeof s.scrollTop === 'number' && s.scrollTop > 0) {
    setTimeout(() => {
      try {
        uni.pageScrollTo({ scrollTop: s.scrollTop, duration: 0 });
      } catch (e) {}
    }, 60);
  }
}
