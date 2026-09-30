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

// 组件分类底色（对齐 ew：基础=绿 / 特殊=紫 / 装修=蓝）
export const CATEGORY_COLORS = {
  '基础组件': '#5fc396',
  '特殊组件': '#7e5bef',
  '装修组件': '#3fa1f0',
};

// 组件调色板（29 个，对齐 ew 原版：基础 17 / 特殊 5 / 装修 7；提交按钮归特殊组件，含短信认证）
export const COMPONENT_PALETTE = [
  {
    category: '基础组件',
    color: CATEGORY_COLORS['基础组件'],
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
    color: CATEGORY_COLORS['特殊组件'],
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
    color: CATEGORY_COLORS['装修组件'],
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

// 组件库图标（白色线条 SVG inner 内容，配合分类底色的圆角方块渲染，对齐 ew 图标网格）
export const COMPONENT_ICONS = {
  text: '<path d="M6 5.5h12M12 5.5v13"/>',
  textarea: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M7.5 9.5h9M7.5 13h6"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m6 17 3.5-3.5 2.5 2.5 3-3 3 3"/>',
  radio: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2" fill="#fff" stroke="none"/>',
  checkbox: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.3 12.3 2.5 2.5 5-5.4"/>',
  select: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="m9 10.5 3 3.2 3-3.2"/>',
  number: '<path d="M9.5 6 8 18M16 6l-1.5 12M5.5 10h13.5M5 14.5h13.5"/>',
  date: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M8 3v5M16 3v5M3.5 10.5h17"/>',
  time: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  location: '<path d="M12 21c-4.2-3.7-6.3-6.9-6.3-9.6a6.3 6.3 0 1 1 12.6 0C18.3 14.1 16.2 17.3 12 21z"/><circle cx="12" cy="11" r="2.3"/>',
  attachment: '<path d="m20.5 11.5-8 8a5 5 0 0 1-7.1-7.1l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-2.9-2.9l7.2-7.1"/>',
  sms: '<path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H10l-4.5 4v-4H7a3 3 0 0 1-3-3z"/><path d="M8.5 10h.01M12 10h.01M15.5 10h.01"/>',
  agreement: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  rate: '<path d="m12 3.8 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z"/>',
  filedownload: '<path d="M12 4v10.5M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/>',
  phoneauth: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M10.8 17.8h2.4"/>',
  carplate: '<rect x="3" y="7.5" width="18" height="9" rx="2"/><path d="M7 12h.01M10.5 12h.01M14 12h.01M17 12h.01"/>',
  submit: '<circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.2 2.5 2.5 4.9-5.4"/>',
  pagebreak: '<path d="m6 5 6.5 7L6 19M12.5 5 19 12l-6.5 7"/>',
  backdesc: '<rect x="4" y="4.5" width="16" height="15" rx="2.5"/><path d="M8 9h8M8 12.5h8M8 16h5"/>',
  realtime: '<path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5c0 4.5 3.5 5.5 4.5 6.5 1-1 4.5-2 4.5-6.5M7.5 20.5c0-4.5 3.5-5.5 4.5-6.5 1 1 4.5 2 4.5 6.5"/>',
  pay: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="m9 7.5 3 3.5 3-3.5M12 11v6M9.5 12.5h5M9.5 14.8h5"/>',
  swiper: '<rect x="2.5" y="6" width="13.5" height="12" rx="2"/><path d="M18.5 8v8M21 9.5v5"/>',
  bigimage: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="9.5" r="1.6"/><path d="m5.5 16.5 4.5-4.5 3 3 3.5-3.5 2.5 2.5"/>',
  title: '<path d="M5.5 6h13M12 6v12M9 18h6"/>',
  richtext: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8h8M8 11.5h8M8 15h4.5"/>',
  blank: '<rect x="5" y="5" width="14" height="14" rx="2.5" stroke-dasharray="3.5 3"/>',
  line: '<path d="M3.5 12h17"/>',
  video: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M10 9l5.2 3L10 15z" fill="#fff" stroke="none"/>',
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
  const base = { label: COMPONENT_LABEL[type] || '未命名', required: false, placeholder: '', prefill: '' };
  switch (type) {
    case 'text':
      return { ...base, maxLength: 400, minLength: 0, contentType: 'normal', syncName: false, inputType: [], readonly: false, verifyRepeat: false };
    case 'textarea':
      return { ...base, maxLength: 400, minLength: 0, contentType: 'normal', readonly: false, verifyRepeat: false };
    case 'image':
      return { ...base, maxCount: 9 };
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
