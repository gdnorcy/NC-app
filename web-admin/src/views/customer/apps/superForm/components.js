// 超级表单组件定义与默认值（后台设计器 / C 端渲染共用）
let __seq = 0;
// 组件样式 schema / CSS 变量映射与 C 端填写页共用（web-app/src/pages/superForm/componentStyle.js）
import {
  STYLE_SCHEMA, defaultStyle, styleSchema, migrateStyle, componentStyleVars,
} from '../../../../../../web-app/src/pages/superForm/componentStyle.js';
export { STYLE_SCHEMA, defaultStyle, styleSchema, migrateStyle, componentStyleVars };

export function genId() {
  return 'c_' + Date.now().toString(36) + (__seq++).toString(36);
}

// 组件调色板（29 个，对齐 ew 原版：基础 17 / 特殊 5 / 装修 7；提交按钮归特殊组件，含短信认证）
// 图标配色：三层蜜桃橙（浅 #ffc4a8 / 标准 #ff8a6a / 深 #f0503a），填充为主、大圆角、透明底，
// 对齐 docs/规范/07-UI设计.md 与 web-admin/src/assets/comp-icons/ 原版 PNG 风格
export const ICON_C = {
  light: '#ffc4a8',
  mid: '#ff8a6a',
  dark: '#f0503a',
  white: '#ffffff',
};

// 组件调色板（29 个，对齐 ew 原版：基础 17 / 特殊 5 / 装修 7；提交按钮归特殊组件，含短信认证）
// 分组标题色仅用于分组条，图标本身不再用分类色方块
export const COMPONENT_PALETTE = [
  {
    category: '基础组件',
    items: [
      { type: 'text', label: '单行文本' },
      { type: 'textarea', label: '多行文本' },
      { type: 'image', label: '图片上传' },
      { type: 'radio', label: '单项选择' },
      { type: 'checkbox', label: '多项选择' },
      { type: 'select', label: '下拉选择' },
      { type: 'number', label: '数字' },
      { type: 'date', label: '日期' },
      { type: 'time', label: '时间' },
      { type: 'location', label: '定位' },
      { type: 'attachment', label: '附件' },
      { type: 'sms', label: '短信认证' },
      { type: 'agreement', label: '协议' },
      { type: 'rate', label: '评分' },
      { type: 'filedownload', label: '文件下载' },
      { type: 'phoneauth', label: '手机号授权' },
      { type: 'carplate', label: '车牌号' },
    ],
  },
  {
    category: '特殊组件',
    items: [
      { type: 'pagebreak', label: '分页' },
      { type: 'submit', label: '提交按钮' },
      { type: 'backdesc', label: '后台描述' },
      { type: 'realtime', label: '实时动态' },
      { type: 'pay', label: '表单支付' },
    ],
  },
  {
    category: '装修组件',
    items: [
      { type: 'swiper', label: '轮播图' },
      { type: 'bigimage', label: '大图模块' },
      { type: 'title', label: '标题' },
      { type: 'richtext', label: '富文本' },
      { type: 'blank', label: '空白块' },
      { type: 'line', label: '辅助线' },
      { type: 'video', label: '视频' },
    ],
  },
];

// 组件库图标（三层蜜桃橙填充 SVG inner，viewBox 24×24，透明底无方块）
// 浅 #ffc4a8 大块底 / 中 #ff8a6a 中间层 / 深 #f0503a 强调
export const COMPONENT_ICONS = {
  // 单行文本：三行深浅横条
  text: '<rect x="4" y="6" width="16" height="3" rx="1.5" fill="#ffc4a8"/><rect x="4" y="11" width="12" height="3" rx="1.5" fill="#ff8a6a"/><rect x="4" y="16" width="14" height="3" rx="1.5" fill="#f0503a"/>',
  // 多行文本：浅橙块 + 三行深浅线
  textarea: '<rect x="3.5" y="4.5" width="17" height="15" rx="3" fill="#ffc4a8"/><rect x="6.5" y="8" width="11" height="2" rx="1" fill="#ff8a6a"/><rect x="6.5" y="11.5" width="11" height="2" rx="1" fill="#fff"/><rect x="6.5" y="15" width="8" height="2" rx="1" fill="#f0503a"/>',
  // 图片上传：浅橙块 + 深橙山 + 中橙太阳
  image: '<rect x="3.5" y="5" width="17" height="14" rx="3" fill="#ffc4a8"/><circle cx="9" cy="9.5" r="1.8" fill="#ff8a6a"/><path d="m6 17 3.5-3.5 2.5 2.5 3-3 3 3z" fill="#f0503a"/>',
  // 单选：浅橙圆底 + 深橙内点
  radio: '<circle cx="12" cy="12" r="8.5" fill="#ffc4a8"/><circle cx="12" cy="12" r="3.2" fill="#f0503a"/>',
  // 多选：浅橙圆角方块 + 白勾
  checkbox: '<rect x="4" y="4" width="16" height="16" rx="5" fill="#ffc4a8"/><path d="m8.5 12.3 2.3 2.3 4.7-5.2" stroke="#f0503a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  // 下拉：浅橙块 + 深橙箭头
  select: '<rect x="3.5" y="5" width="17" height="14" rx="3" fill="#ffc4a8"/><path d="m9.5 10 2.5 2.8 2.5-2.8z" fill="#f0503a"/>',
  // 数字：浅橙块 + 深橙数字符号
  number: '<rect x="3.5" y="5" width="17" height="14" rx="3" fill="#ffc4a8"/><path d="M9 8.5l-1.5 7M16 8.5l-1.5 7" stroke="#f0503a" stroke-width="1.8" stroke-linecap="round"/><path d="M6 11h12" stroke="#ff8a6a" stroke-width="1.5" stroke-linecap="round"/>',
  // 日期：浅橙日历块 + 中橙顶条 + 深橙日期格
  date: '<rect x="3.5" y="5.5" width="17" height="15" rx="3" fill="#ffc4a8"/><rect x="3.5" y="5.5" width="17" height="5" rx="2.5" fill="#ff8a6a"/><rect x="7" y="13" width="3.5" height="3.5" rx="1" fill="#f0503a"/>',
  // 时间：浅橙圆底 + 深橙指针
  time: '<circle cx="12" cy="12" r="8.5" fill="#ffc4a8"/><path d="M12 8v4.5l3 2" stroke="#f0503a" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  // 定位：浅橙水滴 + 深橙中心点
  location: '<path d="M12 21s-7.5-6.5-7.5-12a7.5 7.5 0 1 1 15 0c0 5.5-7.5 12-7.5 12z" fill="#ffc4a8"/><circle cx="12" cy="10.5" r="2.8" fill="#f0503a"/>',
  // 附件：浅橙文件 + 深橙回形针
  attachment: '<rect x="5" y="4" width="14" height="16" rx="2.5" fill="#ffc4a8"/><path d="m9.5 13.5 3-3a2.2 2.2 0 0 1 3.1 3.1l-3 3" stroke="#f0503a" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  // 短信认证：浅橙气泡 + 深浅三点
  sms: '<path d="M5 8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-6l-4 4v-4H8a3 3 0 0 1-3-3z" fill="#ffc4a8"/><circle cx="9" cy="10.5" r="1" fill="#f0503a"/><circle cx="12" cy="10.5" r="1" fill="#ff8a6a"/><circle cx="15" cy="10.5" r="1" fill="#f0503a"/>',
  // 协议：浅橙文档 + 深橙勾
  agreement: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5" fill="#ffc4a8"/><path d="m8.5 12 2.3 2.3 4.7-5" stroke="#f0503a" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  // 评分：浅橙星底 + 深橙描边
  rate: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8z" fill="#ffc4a8" stroke="#f0503a" stroke-width="1.2" stroke-linejoin="round"/>',
  // 文件下载：浅橙向下箭头
  filedownload: '<rect x="4" y="4" width="16" height="16" rx="4" fill="#ffc4a8"/><path d="M12 7.5v7M8.5 11l3.5 3.5L15.5 11M7 18h10" stroke="#f0503a" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  // 手机号授权：浅橙手机 + 深橙按钮条
  phoneauth: '<rect x="7" y="3" width="10" height="18" rx="3" fill="#ffc4a8"/><rect x="10.5" y="18" width="3" height="1.6" rx="0.8" fill="#f0503a"/>',
  // 车牌号：浅橙车牌块 + 深橙字
  carplate: '<rect x="3" y="7" width="18" height="10" rx="2.5" fill="#ffc4a8"/><circle cx="7" cy="12" r="1" fill="#f0503a"/><circle cx="10.5" cy="12" r="1" fill="#ff8a6a"/><circle cx="14" cy="12" r="1" fill="#ff8a6a"/><circle cx="17" cy="12" r="1" fill="#f0503a"/>',
  // 分页：深浅箭头
  pagebreak: '<path d="m5 6 4 6-4 6" fill="none" stroke="#ffc4a8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m11 6 4 6-4 6" fill="none" stroke="#ff8a6a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m17 6 4 6-4 6" fill="none" stroke="#f0503a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  // 提交按钮：深橙圆 + 白勾
  submit: '<circle cx="12" cy="12" r="9" fill="#f0503a"/><path d="m8.3 12.2 2.5 2.5 4.9-5.4" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  // 后台描述：浅橙文档 + 深浅线
  backdesc: '<rect x="4" y="4.5" width="16" height="15" rx="2.5" fill="#ffc4a8"/><rect x="7" y="8" width="10" height="2" rx="1" fill="#ff8a6a"/><rect x="7" y="11.5" width="10" height="2" rx="1" fill="#fff"/><rect x="7" y="15" width="6" height="2" rx="1" fill="#f0503a"/>',
  // 实时动态：浅橙波纹
  realtime: '<circle cx="12" cy="12" r="3" fill="#f0503a"/><path d="M12 5a7 7 0 0 1 7 7M12 8a4 4 0 0 1 4 4" stroke="#ff8a6a" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  // 表单支付：浅橙卡片 + 深橙¥
  pay: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5" fill="#ffc4a8"/><path d="m9 7.5 3 3.5 3-3.5M12 11v6M9.5 12.5h5" stroke="#f0503a" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  // 轮播图：浅橙块 + 中橙图 + 深橙箭头
  swiper: '<rect x="3" y="6" width="14" height="12" rx="2" fill="#ffc4a8"/><path d="m6 15 3-3 2.5 2.5L14 12l3 3z" fill="#ff8a6a"/><path d="M19 8v8M21.5 9.5v5" stroke="#f0503a" stroke-width="1.5" stroke-linecap="round"/>',
  // 大图模块：浅橙块 + 深橙山 + 中橙太阳
  bigimage: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="#ffc4a8"/><circle cx="9" cy="9" r="1.8" fill="#ff8a6a"/><path d="m6 16.5 4-4 3 3 3.5-3.5 2.5 2.5z" fill="#f0503a"/>',
  // 标题：中橙横条 + 深橙竖
  title: '<rect x="5" y="6" width="14" height="4" rx="2" fill="#ff8a6a"/><rect x="10.5" y="6" width="3" height="13" rx="1.5" fill="#f0503a"/>',
  // 富文本：浅橙块 + 深浅行
  richtext: '<rect x="4" y="3.5" width="16" height="17" rx="3" fill="#ffc4a8"/><rect x="7" y="7.5" width="10" height="2" rx="1" fill="#ff8a6a"/><rect x="7" y="11" width="10" height="2" rx="1" fill="#fff"/><rect x="7" y="14.5" width="6" height="2" rx="1" fill="#f0503a"/>',
  // 空白块：浅橙虚线块
  blank: '<rect x="5" y="5" width="14" height="14" rx="2.5" fill="none" stroke="#ffc4a8" stroke-width="1.5" stroke-dasharray="3 2.5"/>',
  // 辅助线：三段深浅
  line: '<rect x="3" y="11" width="5.5" height="2" rx="1" fill="#ffc4a8"/><rect x="9.25" y="11" width="5.5" height="2" rx="1" fill="#ff8a6a"/><rect x="15.5" y="11" width="5.5" height="2" rx="1" fill="#f0503a"/>',
  // 视频：浅橙块 + 深橙播放三角
  video: '<rect x="3" y="4.5" width="18" height="15" rx="4" fill="#ffc4a8"/><path d="M10 9.5l5.5 3-5.5 3z" fill="#f0503a"/>',
};

export const COMPONENT_LABEL = {
  text: '单行文本', textarea: '多行文本', image: '图片上传', radio: '单项选择',
  checkbox: '多项选择', select: '下拉选择', date: '日期', number: '数字', time: '时间',
  location: '定位', attachment: '附件', sms: '短信认证', agreement: '协议', rate: '评分', filedownload: '文件下载',
  phoneauth: '手机号授权', carplate: '车牌号', submit: '提交按钮',
  pagebreak: '分页', backdesc: '后台描述', realtime: '实时动态', pay: '表单支付',
  swiper: '轮播图', bigimage: '大图模块', title: '标题', richtext: '富文本',
  blank: '空白块', line: '辅助线', video: '视频',
};

export function defaultContent(type) {
  const base = { label: COMPONENT_LABEL[type] || '未命名', required: false, visible: true, placeholder: '', prefill: '' };
  switch (type) {
    case 'text':
      return { ...base, maxLength: 400, minLength: 0, contentType: 'normal', syncName: false, inputType: [], readonly: false, verifyRepeat: false };
    case 'textarea':
      return { ...base, maxLength: 400, minLength: 0, contentType: 'normal', readonly: false, verifyRepeat: false };
    case 'image':
      return { ...base, maxCount: 9, minCount: 0, imageType: 'normal', sampleImg: '' };
    case 'radio':
    case 'checkbox':
      return { ...base, options: [{ label: '选项一', value: '1' }, { label: '选项二', value: '2' }], min: 0, max: 0 };
    case 'select':
      return { ...base, options: [{ label: '选项一', value: '1' }, { label: '选项二', value: '2' }] };
    case 'date':
      return { ...base, dateType: 'date' };
    case 'number':
      return { ...base, min: 0, max: 999999, defaultValue: '' };
    case 'time':
      return { ...base, dateType: 'datetime' };
    case 'location':
      return { ...base, tipText: '点击获取定位' };
    case 'attachment':
      return { ...base, maxCount: 3 };
    case 'agreement':
      return { label: '我已阅读并同意', required: true, linkText: '《用户协议》', linkUrl: '' };
    case 'rate':
      return { label: '评分', required: true, desc: '', allowHalf: false, max: 3 };
    case 'filedownload':
      return { label: '文件下载', fileUrl: '', fileName: '', required: false };
    case 'phoneauth':
      return { ...base, placeholder: '点击授权获取手机号' };
    case 'sms':
      return { ...base, placeholder: '请输入手机号', buttonText: '获取验证码' };
    case 'carplate':
      return { ...base, placeholder: '请输入车牌号' };
    case 'pagebreak':
      return { label: '分页' };
    case 'backdesc':
      return { text: '这是一段后台描述文字，仅用于填写页展示说明。' };
    case 'realtime':
      return { label: '实时动态', title: '已有 0 人参与' };
    case 'pay':
      return { label: '报名费', amount: 0, specs: [], payType: 'wechat' };
    case 'swiper':
      return { images: [], height: 160 };
    case 'bigimage':
      return { image: '', link: '' };
    case 'title':
      return { text: '标题文字', size: 18, align: 'left', color: '#303133' };
    case 'richtext':
      return { html: '<p>这里是一段富文本内容</p>' };
    case 'blank':
      return { height: 20 };
    case 'line':
      return { style: 'solid', color: '#dcdfe6' };
    case 'video':
      return { src: '', poster: '' };
    case 'submit':
      return { label: '确认', tipText: '提交成功', lightTip: false };
    default:
      return { ...base };
  }
}

export function createComponent(type) {
  return { id: genId(), type, content: defaultContent(type), style: defaultStyle(type) };
}

export function defaultSettings() {
  return {
    // 基础信息 + 填写设置（对齐 ew：填表人群四选一 / 提交周期五档 / 次数为按人次数）
    basic: { name: '', collectStart: '', collectEnd: '', collectLimit: 0, allowModify: true, shareTitle: '', shareImage: '', fillCrowd: 'all', crowdLevels: [], crowdPwd: '', submitCycle: 'permanent', submitTimes: 0 },
    submit: { secondConfirm: true, jumpLink: '' },
    logic: [],
    layout: 'vertical',
    globalStyle: {
      marginTop: 0, marginY: 20, marginX: 0, radius: 0, compMarginX: 20, inputRadius: 3,
      // 页面背景（对齐 ew：嵌入式表单不生效；图片+颜色含平铺/位置/图片样式/宽高）
      pageBgType: 'color', pageBgColor: '#f3f3f3', pageBgImage: '',
      bgRepeat: 'repeat-x', bgPosX: 'left', bgPosY: 'top', bgImgStyle: 'custom', bgImgW: 20, bgImgH: 20,
      // 组件颜色（对齐 ew）
      cBorder: '#F5F2F2', cTitle: '#000000', cInput: '#333333', cError: '#ED4F4F',
    },
  };
}

export function emptyConfig() {
  return { components: [], settings: defaultSettings() };
}
