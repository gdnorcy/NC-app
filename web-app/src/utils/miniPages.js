/**
 * 小程序内部页面清单（供移动端装修页「跳转 → 内部页面」选择框使用）
 *
 * 🔴 反馈 #298：按钮组件要支持「跳转外部小程序」，默认仍是内部链接；
 *   内部链接需要一个**可视化页面选择框**（参考后台链接选择器，但按手机交互重做）。
 *
 * 数据来源：直接读 src/pages.json（uni-app 的页面清单，**唯一事实来源**，
 *   不另维护一份手写清单 → 不会出现「加了页面但清单没同步」的漂移）。
 *
 * ⚠️ pages.json 含 subPackages（分包），主包页面的 path 是完整路径（如 pages/card/market），
 *   分包页面需拼成 `root + '/' + path`（如 pages/mall/index）→ 本清单统一补前导斜杠，
 *   可直接喂给 uni.navigateTo({ url })。
 *
 * ⚠️ 本文件是**生成物**，勿手改；新增页面后重跑：
 *     node web-app/scripts/gen-mini-pages.js
 */

/** 页面分组（用于移动端选择框的分类展示） */
export const MINI_PAGE_GROUPS = [
  { key: 'card', name: '名片' },
  { key: 'mall', name: '商城' },
  { key: 'panorama', name: '全景' },
  { key: 'other', name: '其他' },
];

/**
 * 页面清单：{ path: '/pages/card/market', title: '集市', group: 'card' }
 * path 带前导斜杠，可直接喂给 uni.navigateTo({ url })
 */
export const MINI_PAGES = [
  { path: '/pages/card/create', title: '创建名片', group: 'card' },
  { path: '/pages/card/visitors', title: '访客雷达', group: 'card' },
  { path: '/pages/card/visitorTimeline', title: '访客行为', group: 'card' },
  { path: '/pages/card/distribution', title: '分销中心', group: 'card' },
  { path: '/pages/card/profile', title: '个人中心', group: 'card' },
  { path: '/pages/card/templateSelect', title: '更换模板', group: 'card' },
  { path: '/pages/card/needTagsEdit', title: '供需标签', group: 'card' },
  { path: '/pages/card/distPartner', title: '合伙人分红', group: 'card' },
  { path: '/pages/card/member', title: '会员中心', group: 'card' },
  { path: '/pages/card/exchangeRequests', title: '交换申请', group: 'card' },
  { path: '/pages/card/customers', title: '客户管理', group: 'card' },
  { path: '/pages/card/customerDetail', title: '客户详情', group: 'card' },
  { path: '/pages/card/radarConfig', title: '雷达配置', group: 'card' },
  { path: '/pages/card/distShareCat', title: '类目股东', group: 'card' },
  { path: '/pages/card/cardDetail', title: '名片详情', group: 'card' },
  { path: '/pages/card/distShareArea', title: '区域股东', group: 'card' },
  { path: '/pages/card/distShareAll', title: '全民股东', group: 'card' },
  { path: '/pages/card/market', title: '人脉集市', group: 'card' },
  { path: '/pages/card/videosEdit', title: '视频管理', group: 'card' },
  { path: '/pages/card/dynamic', title: '我的动态', group: 'card' },
  { path: '/pages/card/myCard', title: '我的名片', group: 'card' },
  { path: '/pages/card/distWallet', title: '我的钱包', group: 'card' },
  { path: '/pages/card/connections', title: '我的人脉库', group: 'card' },
  { path: '/pages/card/collects', title: '我的收藏', group: 'card' },
  { path: '/pages/card/messages', title: '消息中心', group: 'card' },
  { path: '/pages/card/displaySettings', title: '展示设置', group: 'card' },
  { path: '/pages/cardMain/live', title: '直播', group: 'card' },
  { path: '/pages/cardMain/login', title: '智能名片', group: 'card' },
  { path: '/pages/cardMain/home', title: '智能名片', group: 'card' },
  { path: '/pages/card/cardEdit', title: '装修我的名片', group: 'card' },
  { path: '/pages/card/worksEdit', title: '作品管理', group: 'card' },
  { path: '/pages/mall/order-detail', title: '订单详情', group: 'mall' },
  { path: '/pages/mall/cart', title: '购物车', group: 'mall' },
  { path: '/pages/mall/checkout', title: '确认订单', group: 'mall' },
  { path: '/pages/mall/index', title: '商城', group: 'mall' },
  { path: '/pages/mall/detail', title: '商品详情', group: 'mall' },
  { path: '/pages/mall/orders', title: '我的订单', group: 'mall' },
  { path: '/pages/panorama/index', title: '360全景', group: 'panorama' },
  { path: '/pages/panorama/home', title: '全景首页', group: 'panorama' },
  { path: '/pages/superForm/fill', title: '超级表单', group: 'other' },
  { path: '/pages/share/share', title: '分享', group: 'other' },
  { path: '/pages/viewer/viewer', title: '全景浏览', group: 'other' },
  { path: '/pagesReads/videoList/videoList', title: '视频列表', group: 'other' },
  { path: '/pagesReads/articleList/articleList', title: '文章列表', group: 'other' },
  { path: '/pagesReads/showArt/showArt', title: '文章详情', group: 'other' },
  { path: '/pages/live/list', title: '直播间', group: 'other' },
  { path: '/pagesReads/picList/picList', title: '组图列表', group: 'other' },
  { path: '/pagesReads/showPictures/showPictures', title: '组图详情', group: 'other' },
];

/** 按关键词搜索页面（标题或路径命中） */
export function searchMiniPages(keyword) {
  const k = String(keyword || '').trim().toLowerCase();
  if (!k) return MINI_PAGES;
  return MINI_PAGES.filter(
    (p) => p.title.toLowerCase().includes(k) || p.path.toLowerCase().includes(k)
  );
}

/** 取某分组下的页面 */
export function miniPagesByGroup(group) {
  return MINI_PAGES.filter((p) => p.group === group);
}

/** 按 path 反查标题（装修页回显用） */
export function miniPageTitle(path) {
  const p = MINI_PAGES.find((x) => x.path === path);
  return p ? p.title : '';
}
