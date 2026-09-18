/**
 * 系统链接分类配置（配置驱动）
 * 后续新增页面/功能只需在此加一行，链接选择器自动出现。
 * value 与小程序/H5 路由保持一致。
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
    items: [
      { label: '场景预览', value: '/pages/viewer/viewer?planId=1', desc: '示例链接：按实际方案替换 planId（如 ?planId=8）' },
    ],
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
