// 超级表单组件定义与默认值（后台设计器 / C 端渲染共用）
let __seq = 0;
export function genId() {
  return 'c_' + Date.now().toString(36) + (_seq++).toString(36);
}

// 组件调色板（P1 核心 8 个；其余在后续分期补齐）
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
      { type: 'submit', label: '提交按钮' },
    ],
  },
];

export const COMPONENT_LABEL = {
  text: '单行文本', textarea: '多行文本', image: '图片上传', radio: '单项选择',
  checkbox: '多项选择', select: '下拉选择', date: '日期', submit: '提交按钮',
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
