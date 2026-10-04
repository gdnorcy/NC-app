/**
 * 系统链接分类配置（配置驱动）
 * 后续新增页面/功能只需在此加一行，链接选择器自动出现。
 * value 与小程序/H5 路由保持一致。
 *
 * 动态分类：写 `dynamic: '<key>'` + `items: []`，由 LinkPicker 在打开时按 key 拉真实数据，
 * 避免把客户数据（表单 id / 方案 id）硬编码成示例链接。需要接后端数据的分类用这个机制，
 * 静态页面/功能才写 items。
 */
export const LINK_CATALOG = [
  {
    name: '行业应用首页',
    items: [
      { label: '智能名片首页', value: '/pages/cardMain/home' },
      { label: '360全景首页', value: '/pages/panorama/index', desc: '360°全景方案列表（全景应用内首页）' },
      { label: '商城首页', value: '/pages/mall/index', desc: '商城（建设中占位页）' },
    ],
  },
  {
    name: '页面',
    items: [
      { label: '首页', value: '/pages/cardMain/home' },
      { label: '我的名片', value: '/pages/card/myCard' },
      { label: '创建名片', value: '/pages/card/create' },
      { label: '个人中心', value: '/pages/cardMain/home' },
      { label: '动态', value: '/pages/card/dynamic' },
      { label: '登录页', value: '/pages/cardMain/login' },
    ],
  },
  {
    name: '名片功能',
    items: [
      { label: '人脉集市', value: '/pages/card/market' },
      { label: '名片交换', value: '/pages/card/connections' },
      { label: '交换请求', value: '/pages/card/exchangeRequests' },
      { label: '消息中心', value: '/pages/card/messages' },
      { label: '访客雷达', value: '/pages/card/visitors' },
      { label: '访客时间线', value: '/pages/card/visitorTimeline' },
      { label: '客户管理', value: '/pages/card/customers' },
      { label: '我的资料', value: '/pages/card/profile' },
    ],
  },
  {
    name: '分销体系',
    items: [
      { label: '分销中心', value: '/pages/card/distribution' },
      { label: '合伙人分红', value: '/pages/card/distPartner' },
      { label: '全民股东', value: '/pages/card/distShareAll' },
      { label: '类目股东', value: '/pages/card/distShareCat' },
      { label: '区域股东', value: '/pages/card/distShareArea' },
      { label: '钱包提现', value: '/pages/card/distWallet' },
    ],
  },
  {
    name: '全景应用',
    dynamic: 'plans',
    items: [],
  },
  {
    name: '超级表单',
    dynamic: 'superform',
    items: [],
  },
  {
    name: '我的',
    items: [
      { label: '会员中心', value: '/pages/card/member' },
      { label: '套餐与续费', value: '/pages/card/member' },
    ],
  },
];

/** 自定义链接分类（保留手输兜底） */
export const CUSTOM_LINK = { name: '自定义链接', custom: true };

/**
 * 动态分类的数据源与链接模板集中在这里，LinkPicker 只认 key。
 * path(r) 由 LinkPicker 传入行数据，返回该行的 C 端路由。
 */
export const DYNAMIC_SOURCES = {
  // 超级表单填写页：按已建表单逐个列出
  superform: {
    path: (r) => `/pages/superForm/fill?formId=${r.id}`,
  },
  // 全景方案浏览页：按本客户方案逐个列出
  plans: {
    path: (r) => `/pages/viewer/viewer?planId=${r.id}`,
  },
};

/**
 * 回显用：从动态链接里解析出目标 id。
 * 返回 { key, id } 或 null。用于打开弹窗时静态目录匹配不到的场景
 * （历史配置指向真实数据，静态 items 已不再硬编码）。
 */
export function parseDynamicLink(key, link) {
  const src = DYNAMIC_SOURCES[key];
  if (!src || !link) return null;
  const param = key === 'superform' ? 'formId' : 'planId';
  const m = String(link).match(new RegExp(`[?&]${param}=(\\d+)`));
  return m ? { key, id: Number(m[1]) } : null;
}
