/**
 * 系统链接分类配置（配置驱动）
 * 后续新增页面/功能只需在此加一行，链接选择器自动出现。
 * value 与小程序/H5 路由保持一致。
 *
 * ⚠️ key 为选择器内唯一标识（选中态/列表 v-for key 用它，不用 value）：
 *    value 允许在不同分类重复（如「智能名片首页」与「首页」同路径，
 *    「会员中心」与「套餐与续费」同路径），但 key 必须全目录唯一，
 *    否则选择器会「一齐选中」（曾因「个人中心」误写 home 路径，
 *    与「首页」同 value 双双高亮——见 linkCatalog.test.js 的路径注册校验）。
 *
 * 动态分类：写 `dynamic: '<key>'` + `items: []`，由 LinkPicker 在打开时按 key 拉真实数据，
 * 避免把客户数据（表单 id / 方案 id）硬编码成示例链接。需要接后端数据的分类用这个机制，
 * 静态页面/功能才写 items（动态项 value 带唯一 id，无需 key）。
 */
export const LINK_CATALOG = [
  {
    name: '行业应用首页',
    items: [
      { key: 'app-home-card', label: '智能名片首页', value: '/pages/cardMain/home' },
      { key: 'app-home-panorama', label: '360全景首页', value: '/pages/panorama/index', desc: '360°全景方案列表（全景应用内首页）' },
      { key: 'app-home-goods', label: '商城首页', value: '/pages/mall/index', desc: '商城（建设中占位页）' },
    ],
  },
  {
    name: '页面',
    items: [
      { key: 'page-home', label: '首页', value: '/pages/cardMain/home' },
      { key: 'page-mycard', label: '我的名片', value: '/pages/card/myCard' },
      { key: 'page-create', label: '创建名片', value: '/pages/card/create' },
      { key: 'page-profile', label: '个人中心', value: '/pages/card/profile' },
      { key: 'page-dynamic', label: '动态', value: '/pages/card/dynamic' },
      { key: 'page-login', label: '登录页', value: '/pages/cardMain/login' },
    ],
  },
  {
    name: '名片功能',
    items: [
      { key: 'fn-market', label: '人脉集市', value: '/pages/card/market' },
      { key: 'fn-connections', label: '名片交换', value: '/pages/card/connections' },
      { key: 'fn-exchange-requests', label: '交换请求', value: '/pages/card/exchangeRequests' },
      { key: 'fn-messages', label: '消息中心', value: '/pages/card/messages' },
      { key: 'fn-visitors', label: '访客雷达', value: '/pages/card/visitors' },
      { key: 'fn-visitor-timeline', label: '访客时间线', value: '/pages/card/visitorTimeline' },
      { key: 'fn-customers', label: '客户管理', value: '/pages/card/customers' },
      { key: 'fn-profile', label: '我的资料', value: '/pages/card/profile' },
    ],
  },
  {
    name: '分销体系',
    items: [
      { key: 'dist-center', label: '分销中心', value: '/pages/card/distribution' },
      { key: 'dist-partner', label: '合伙人分红', value: '/pages/card/distPartner' },
      { key: 'dist-share-all', label: '全民股东', value: '/pages/card/distShareAll' },
      { key: 'dist-share-cat', label: '类目股东', value: '/pages/card/distShareCat' },
      { key: 'dist-share-area', label: '区域股东', value: '/pages/card/distShareArea' },
      { key: 'dist-wallet', label: '钱包提现', value: '/pages/card/distWallet' },
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
      { key: 'me-member', label: '会员中心', value: '/pages/card/member' },
      { key: 'me-member-plan', label: '套餐与续费', value: '/pages/card/member' },
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
