// 超级表单组件定义与默认值（后台设计器 / C 端渲染共用）
let __seq = 0;
export function genId() {
  return 'c_' + Date.now().toString(36) + (_seq++).toString(36);
}

// 组件调色板（P1 核心 8 + P2 基础 9 + P3 特殊 3 + 装修 7 + P4 支付 1）
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
      { type: 'date', label: '日期' },
      { type: 'number', label: '数字' },
      { type: 'time', label: '时间' },
      { type: 'location', label: '定位' },
      { type: 'attachment', label: '附件' },
      { type: 'agreement', label: '协议' },
      { type: 'rate', label: '评分' },
      { type: 'filedownload', label: '文件下载' },
      { type: 'phoneauth', label: '手机号授权' },
      { type: 'carplate', label: '车牌号' },
      { type: 'submit', label: '提交按钮' },
    ],
  },
  {
    category: '特殊组件',
    items: [
      { type: 'pagebreak', label: '分页' },
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

export const COMPONENT_LABEL = {
  text: '单行文本', textarea: '多行文本', image: '图片上传', radio: '单项选择',
  checkbox: '多项选择', select: '下拉选择', date: '日期', number: '数字', time: '时间',
  location: '定位', attachment: '附件', agreement: '协议', rate: '评分', filedownload: '文件下载',
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
      return { label: '评分', required: true, max: 5, defaultValue: 0 };
    case 'filedownload':
      return { label: '文件下载', fileUrl: '', fileName: '', required: false };
    case 'phoneauth':
      return { ...base, placeholder: '点击授权获取手机号' };
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

export function defaultStyle() {
  return { styleType: 'box', marginX: 10, radius: 3, titleSize: 16, inputSize: 14 };
}

export function createComponent(type) {
  return { id: genId(), type, content: defaultContent(type), style: defaultStyle() };
}

export function defaultSettings() {
  return {
    basic: { name: '', collectStart: '', collectEnd: '', collectLimit: 0, allowModify: true, shareTitle: '', shareImage: '' },
    submit: { secondConfirm: true, jumpLink: '' },
    logic: [],
    layout: 'vertical',
    globalStyle: { marginTop: 0, marginY: 20, marginX: 0, radius: 0, inputRadius: 3 },
  };
}

export function emptyConfig() {
  return { components: [], settings: defaultSettings() };
}
