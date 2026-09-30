/**
 * 超级表单「组件样式」单一事实来源（web-admin 设计器 与 web-app 填写页 共用同一份）
 *
 * ew 里每个组件的「样式设置」= 组件背景 + 组件整体 + 组件风格 + 组件颜色，
 * 29 种组件各有专用字段（如 radio 的 radioColor/activeColor、submit 的 inputBg、line 的 dividerColor）。
 * 之前所有组件共用一套「框/线 + 四个通用项」，是错的；修正后由本文件统一描述各组件的
 * 样式字段（STYLE_SCHEMA）并翻译成 CSS 变量（componentStyleVars），渲染层只消费变量。
 *
 * 注意：改这里的字段名/变量名，设计器面板与 C 端渲染会同时变化。
 */

/**
 * 组件样式 schema（对齐 ew 实测：每个组件的样式设置 = 组件背景 + 组件整体 + 组件风格 + 组件颜色）
 * 说明：ew 里 29 种组件各有专用样式面板，此前统一套用「框/线 + 四个通用项」是错的。
 * - boxLine：是否显示「框风格 / 线风格」选择卡（rate 用图标卡 icons 代替）
 * - styleRows：组件风格里的数值行 { key, label, def, max }
 * - colorRows：组件颜色行 { key, label, def }
 */
export const STYLE_SCHEMA = {
  text: { boxLine: [{value:'box',label:'框风格'},{value:'line',label:'线风格'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 60 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 100 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 30 },
    { key: 'inputSize', label: '输入文本大小', def: 14, max: 30 },
  ], colorRows: [
    { key: 'borderColor', label: '底框边框', def: '#F5F2F2' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'promptColor', label: '提示文字', def: '#CCCCCC' },
    { key: 'enterTextColor', label: '输入文本', def: '#333333' },
    { key: 'inputBg', label: '输入背景', def: '#F7F9FA' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
    { key: 'scanCodeIcon', label: '扫码图标', def: '#666666' },
  ] },
  textarea: { boxLine: [{value:'box1',label:'框风格1'},{value:'box2',label:'框风格2'},{value:'line',label:'线风格'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 60 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 100 },
    { key: 'inputHeight', label: '输入区高度', def: 166, max: 300 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 30 },
    { key: 'inputSize', label: '输入文本大小', def: 14, max: 30 },
  ], colorRows: [
    { key: 'borderColor', label: '底框边框', def: '#F5F2F2' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'promptColor', label: '提示文字', def: '#CCCCCC' },
    { key: 'enterTextColor', label: '输入文本', def: '#333333' },
    { key: 'inputBg', label: '输入背景', def: '#F7F9FA' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
  ] },
  image: {
    // ew 实测：上下布局 组件风格 = 单行展示(2/3/4张→rowsShow) + 上传边框(直线/虚线→borderType)
    //          + 左右边距(max44) + 底框圆角 + 标题大小(max30) + 提示文字大小(max30)，无 上传框大小/图片圆角；
    //   左右布局 组件风格 = 框风格/线风格卡 + 上传边框 + 上传框大小(max120,def45) + 左右边距 + 底框圆角
    //          + 图片圆角 + 标题大小 + 提示文字大小；组件颜色里 图片背景/图片边框 仅左右布局显示。
    boxLine: [{value:'box',label:'框风格'},{value:'line',label:'线风格'}],
    hOnlyBoxLine: true,
    extraDefs: { rowsShow: 2, borderType: 'solid' },
    styleRows: [
      { key: 'uploadBoxSize', label: '上传框大小', def: 45, max: 120, hOnly: true },
      { key: 'inputMarginX', label: '左右边距', def: 10, max: 44 },
      { key: 'inputRadius', label: '底框圆角', def: 3, max: 100 },
      { key: 'imgRadius', label: '图片圆角', def: 3, max: 100, hOnly: true },
      { key: 'titleSize', label: '标题大小', def: 16, max: 30 },
      { key: 'promptSize', label: '提示文字大小', def: 14, max: 30 },
    ], colorRows: [
      { key: 'labelColor', label: '标题颜色', def: '#000000' },
      { key: 'borderColor', label: '底框边框', def: '#F5F2F2' },
      { key: 'inputBg', label: '背景颜色', def: '#F7F9FA' },
      { key: 'imgBg', label: '图片背景', def: '#FFFFFF', hOnly: true },
      { key: 'imgBorder', label: '图片边框', def: '#CED3D6', hOnly: true },
      { key: 'promptColor', label: '提示文本', def: '#999999' },
      { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
    ] },
  radio: { boxLine: [{value:'s1',label:'风格1'},{value:'s2',label:'风格2'},{value:'s3',label:'风格3'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
  ], colorRows: [
    { key: 'inputBg', label: '选项背景', def: '#F7F9FA' },
    { key: 'borderColor', label: '选项边框', def: '#F5F2F2' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'promptColor', label: '提示文字', def: '#999999' },
    { key: 'radioColor', label: '选项文字', def: '#333333' },
    { key: 'otherColor', label: '未选中边框', def: '#F5F2F2' },
    { key: 'activeColor', label: '选中颜色', def: '#2667EC' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
  ] },
  checkbox: { boxLine: [{value:'s1',label:'风格1'},{value:'s2',label:'风格2'},{value:'s3',label:'风格3'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
  ], colorRows: [
    { key: 'inputBg', label: '选项背景', def: '#F7F9FA' },
    { key: 'borderColor', label: '选项边框', def: '#F5F2F2' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'promptColor', label: '提示文字', def: '#999999' },
    { key: 'radioColor', label: '选项文字', def: '#333333' },
    { key: 'otherColor', label: '未选中边框', def: '#F5F2F2' },
    { key: 'activeColor', label: '选中颜色', def: '#2667EC' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
  ] },
  select: { boxLine: [{value:'s1',label:'风格1'},{value:'s2',label:'风格2'},{value:'s3',label:'风格3'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
    { key: 'inputSize', label: '输入文本大小', def: 14, max: 20 },
  ], colorRows: [
    { key: 'borderColor', label: '底框边框', def: '#F5F2F2' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'promptColor', label: '提示文字', def: '#CCCCCC' },
    { key: 'enterTextColor', label: '输入文本', def: '#333333' },
    { key: 'inputBg', label: '输入背景', def: '#F7F9FA' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
    { key: 'iconColor', label: '下拉图标', def: '#000000' },
  ] },
  number: { boxLine: [{value:'step',label:'增减类型'},{value:'slider',label:'滑块风格'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'operateRadius', label: '按钮圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
    { key: 'inputSize', label: '输入文本大小', def: 14, max: 20 },
  ], colorRows: [
    { key: 'inputBg', label: '输入背景', def: '#F7F9FA' },
    { key: 'operateBg', label: '按钮背景', def: '#FFFFFF' },
    { key: 'borderColor', label: '底框边框', def: '#F5F2F2' },
    { key: 'activeColor', label: '按钮颜色', def: '#0076F0' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'enterTextColor', label: '输入文本', def: '#333333' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
  ] },
  date: { boxLine: [{value:'line',label:'线风格'},{value:'box1',label:'框风格1'},{value:'box2',label:'框风格2'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
    { key: 'inputSize', label: '输入文本大小', def: 14, max: 20 },
  ], colorRows: [
    { key: 'inputBg', label: '输入背景', def: '#F7F9FA' },
    { key: 'borderColor', label: '底框边框', def: '#F5F2F2' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'promptColor', label: '提示文字', def: '#CCCCCC' },
    { key: 'enterTextColor', label: '输入文本', def: '#333333' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
  ] },
  time: { boxLine: [{value:'line',label:'线风格'},{value:'box1',label:'框风格1'},{value:'box2',label:'框风格2'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
    { key: 'inputSize', label: '输入文本大小', def: 14, max: 20 },
  ], colorRows: [
    { key: 'inputBg', label: '输入背景', def: '#F7F9FA' },
    { key: 'borderColor', label: '底框边框', def: '#F5F2F2' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'promptColor', label: '提示文字', def: '#CCCCCC' },
    { key: 'enterTextColor', label: '输入文本', def: '#333333' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
    { key: 'iconColor', label: '图标颜色', def: '#FFFFFF' },
  ] },
  location: { boxLine: [{value:'box',label:'框风格'},{value:'line',label:'线风格'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
    { key: 'inputSize', label: '输入文本大小', def: 14, max: 20 },
  ], colorRows: [
    { key: 'inputBg', label: '输入背景', def: '#F7F9FA' },
    { key: 'borderColor', label: '底框边框', def: '#F5F2F2' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'promptColor', label: '提示文字', def: '#CCCCCC' },
    { key: 'enterTextColor', label: '输入文本', def: '#333333' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
    { key: 'iconColor', label: '图标颜色', def: '#000000' },
  ] },
  attachment: { boxLine: false, styleRows: [
    { key: 'uploadBoxSize', label: '上传框尺寸', def: 45, max: 120 },
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'imgRadius', label: '图片圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
    { key: 'promptSize', label: '提示文字大小', def: 14, max: 20 },
  ], colorRows: [
    { key: 'inputBg', label: '上传框背景', def: '#F7F9FA' },
    { key: 'borderColor', label: '上传框边框', def: '#F5F2F2' },
    { key: 'imgBg', label: '图片背景', def: '#FFFFFF' },
    { key: 'imgBorder', label: '图片边框', def: '#CED3D6' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'promptColor', label: '提示文字', def: '#999999' },
    { key: 'fileTitleColor', label: '文件标题', def: '#333333' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
  ] },
  sms: { boxLine: [{value:'box',label:'框风格'},{value:'line',label:'线风格'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'innerMargin', label: '内部间距', def: 15, max: 60 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
    { key: 'inputSize', label: '输入文本大小', def: 14, max: 20 },
  ], colorRows: [
    { key: 'borderColor', label: '底框边框', def: '#F5F2F2' },
    { key: 'inputBg', label: '输入背景', def: '#F7F9FA' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'enterTextColor', label: '输入文本', def: '#333333' },
    { key: 'promptColor', label: '提示文字', def: '#CCCCCC' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
    { key: 'msgTextColor', label: '验证码文字', def: '#4385FF' },
  ] },
  agreement: { boxLine: false, styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
  ], colorRows: [
    { key: 'checkColor', label: '勾选颜色', def: '#4385FF' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'enterTextColor', label: '协议文字', def: '#2667EC' },
    { key: 'promptColor', label: '提示文字', def: '#898989' },
    { key: 'aggreementBtnColor', label: '按钮颜色', def: '#0076F0' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
  ] },
  rate: { icons: true, styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
  ], colorRows: [
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
    { key: 'descColor', label: '描述文字', def: '#999999' },
    { key: 'inactiveColor', label: '未激活颜色', def: '#C6D1DE' },
    { key: 'activeColor', label: '选中颜色', def: '#F7BA2A' },
  ] },
  filedownload: { boxLine: [{value:'s1',label:'风格1'},{value:'s2',label:'风格2'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'fileSize', label: '文件文字大小', def: 13, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
  ], colorRows: [
    { key: 'inputBg', label: '底框背景', def: '#F7F9FA' },
    { key: 'borderColor', label: '底框边框', def: '#F5F2F2' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'promptColor', label: '提示文字', def: '#999999' },
    { key: 'fileTitleColor', label: '文件标题', def: '#333333' },
    { key: 'downTextColor', label: '下载文字', def: '#4385FF' },
  ] },
  phoneauth: { boxLine: [{value:'box',label:'框风格'},{value:'line',label:'线风格'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'innerMargin', label: '内部间距', def: 15, max: 60 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
    { key: 'inputSize', label: '输入文本大小', def: 14, max: 20 },
  ], colorRows: [
    { key: 'borderColor', label: '底框边框', def: '#F5F2F2' },
    { key: 'inputBg', label: '输入背景', def: '#F7F9FA' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'enterTextColor', label: '输入文本', def: '#333333' },
    { key: 'promptColor', label: '提示文字', def: '#CCCCCC' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
    { key: 'empowerColor', label: '授权按钮', def: '#4385FF' },
  ] },
  carplate: { boxLine: [{value:'box',label:'框风格'},{value:'line',label:'线风格'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'innerMargin', label: '内部间距', def: 15, max: 60 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
    { key: 'inputSize', label: '输入文本大小', def: 14, max: 20 },
  ], colorRows: [
    { key: 'borderColor', label: '底框边框', def: '#F5F2F2' },
    { key: 'inputBg', label: '输入背景', def: '#F7F9FA' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'enterTextColor', label: '输入文本', def: '#333333' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
  ] },
  pagebreak: { boxLine: false, styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '按钮圆角', def: 19, max: 30 },
  ], colorRows: [
    { key: 'prevBg', label: '上一步背景', def: '#EDF1F3' },
    { key: 'prevLabelColor', label: '上一步文字', def: '#333333' },
    { key: 'prevBorderColor', label: '上一步边框', def: '#EDF1F3' },
    { key: 'nextBg', label: '下一步背景', def: '#0076F0' },
    { key: 'nextLabelColor', label: '下一步文字', def: '#FFFFFF' },
    { key: 'nextBorderColor', label: '下一步边框', def: '#0076F0' },
  ] },
  submit: { boxLine: false, styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '按钮圆角', def: 22, max: 30 },
  ], colorRows: [
    { key: 'inputBg', label: '按钮背景', def: '#0076F0' },
    { key: 'borderColor', label: '按钮边框', def: '#0076F0' },
    { key: 'labelColor', label: '按钮文字', def: '#FFFFFF' },
  ] },
  backdesc: { boxLine: false, styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'titleSize', label: '文字大小', def: 14, max: 24 },
  ], colorRows: [
    { key: 'enterTextColor', label: '文字颜色', def: '#333333' },
  ] },
  realtime: { boxLine: [{value:'box',label:'框风格'},{value:'line',label:'线风格'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '圆角', def: 10, max: 30 },
  ], colorRows: [] },
  pay: { boxLine: [{value:'box',label:'框风格'},{value:'line',label:'线风格'}], styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'modelTopBottomMargin', label: '规格上下边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'operateRadius', label: '按钮圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
  ], colorRows: [
    { key: 'inputBg', label: '输入背景', def: '#F7F9FA' },
    { key: 'borderColor', label: '底框边框', def: '#F7F9FA' },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'specColor', label: '规格文字', def: '#000000' },
    { key: 'priceColor', label: '价格文字', def: '#FF1C1C' },
    { key: 'countColor', label: '库存文字', def: '#79797B' },
    { key: 'operateBg', label: '按钮背景', def: '#F0F3F5' },
    { key: 'increaseBorderColor', label: '按钮边框', def: '#F0F3F5' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
    { key: 'bottomColor', label: '底部文字', def: '#000000' },
  ] },
  swiper: { boxLine: false, styleRows: [
    { key: 'inputHeight', label: '图片高度', def: 194, max: 500 },
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'imgRadius', label: '图片圆角', def: 0, max: 20 },
    { key: 'dotGap', label: '圆点间距', def: 6, max: 30 },
    { key: 'dotBottom', label: '圆点底边距', def: 8, max: 30 },
    { key: 'switchSpeed', label: '切换速度', def: 3, max: 10 },
  ], colorRows: [
    { key: 'activeColor', label: '选中按钮色', def: '#FFFFFF' },
  ] },
  bigimage: { boxLine: false, styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'imgRadius', label: '图片圆角', def: 3, max: 20 },
  ], colorRows: [] },
  title: { boxLine: false, styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
    { key: 'titleSize', label: '主标题大小', def: 17, max: 30 },
    { key: 'subTitleSize', label: '副标题大小', def: 13, max: 24 },
  ], colorRows: [
    { key: 'labelColor', label: '主标题颜色', def: '#000000' },
    { key: 'subTitleColor', label: '副标题颜色', def: '#999999' },
    { key: 'promptColor', label: '提示文字', def: '#999999' },
    { key: 'lineColor', label: '线条颜色', def: '#434343' },
  ] },
  richtext: { boxLine: false, styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
  ], colorRows: [] },
  blank: { boxLine: false, styleRows: [
    { key: 'dividerHeight', label: '空白高度', def: 42, max: 200 },
  ], colorRows: [] },
  line: { boxLine: false, styleRows: [
    { key: 'dividerHeight', label: '线条粗细', def: 1, max: 20 },
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
  ], colorRows: [
    { key: 'dividerColor', label: '线条颜色', def: '#000000' },
  ] },
  video: { boxLine: false, styleRows: [
    { key: 'inputMarginX', label: '左右边距', def: 10, max: 40 },
  ], colorRows: [] },
};

// 组件整体（所有组件一致的四段之一）
const COMMON_WHOLE = { outMarginTop: 0, marginY: 10, marginX: 0, radius: 0 };
// 组件背景（所有组件一致）
const COMMON_BG = { bgType: 'color', bgColor: '#FFFFFF', bgImage: '', bgRepeat: 'repeat-x', bgPosX: 'left', bgPosY: 'top', bgImgStyle: 'custom', bgImgW: 20, bgImgH: 20 };

// 按 schema 生成组件默认样式（兼容旧数据：老 key 映射过来）
export function defaultStyle(type) {
  const sc = STYLE_SCHEMA[type] || {};
  const s = { ...COMMON_BG, ...COMMON_WHOLE };
  if (sc.boxLine) s.styleType = 'box';
  if (sc.icons) s.icon = 'smile';
  // 非滑杆类枚举默认值（如图片上传 rowsShow/borderType）
  if (sc.extraDefs) Object.assign(s, sc.extraDefs);
  (sc.styleRows || []).forEach((r) => { s[r.key] = r.def; });
  (sc.colorRows || []).forEach((r) => { s[r.key] = r.def; });
  return s;
}

export function styleSchema(type) {
  return STYLE_SCHEMA[type] || { boxLine: false, styleRows: [], colorRows: [] };
}

/**
 * 旧版通用样式 → 新版按类型 schema 样式（老数据迁移用）
 * 旧结构只有 { styleType, marginX, radius, titleSize, inputSize }，其中：
 *   marginX/radius 其实是「输入框」的内边距与圆角 → 映射到 inputMarginX / inputRadius
 * 其余同名键直接继承，缺失的按该组件 ew 默认值补齐。
 */
export function migrateStyle(comp) {
  const base = defaultStyle(comp.type);
  const old = comp.style || {};
  // 旧结构判定：没有 outMarginTop / bgType（新版每个组件都带），说明是老的通用样式
  const isOld = old.outMarginTop === undefined && old.bgType === undefined;
  Object.keys(base).forEach((k) => {
    if (old[k] !== undefined && old[k] !== null) base[k] = old[k];
  });
  if (isOld) {
    // 旧 marginX / radius 实为「输入框」的左右边距与圆角，组件整体的边距/圆角走 ew 默认
    if (old.marginX !== undefined) { base.inputMarginX = old.marginX; base.marginX = 0; }
    if (old.radius !== undefined) { base.inputRadius = old.radius; base.radius = 0; }
  }
  comp.style = base;
  return comp;
}

/** 组件风格（数值 px）→ CSS 变量 */
export const SIZE_VAR = {
  inputMarginX: '--c-input-pad-x',
  inputRadius: '--c-input-radius',
  inputHeight: '--c-input-height',
  titleSize: '--c-title-size',
  inputSize: '--c-input-size',
  promptSize: '--c-prompt-size',
  innerMargin: '--c-inner-margin',
  uploadBoxSize: '--c-upload-size',
  imgRadius: '--c-img-radius',
  fileSize: '--c-file-size',
  operateRadius: '--c-operate-radius',
  modelTopBottomMargin: '--c-model-margin-y',
  subTitleSize: '--c-subtitle-size',
  dividerHeight: '--c-divider-height',
};

/** 组件颜色 → CSS 变量 */
export const COLOR_VAR = {
  borderColor: '--c-border-color',
  labelColor: '--c-title-color',
  promptColor: '--c-prompt-color',
  enterTextColor: '--c-input-color',
  inputBg: '--c-input-bg',
  errorColor: '--c-error-color',
  activeColor: '--c-active-color',
  inactiveColor: '--c-inactive-color',
  otherColor: '--c-inactive-border',
  radioColor: '--c-option-color',
  iconColor: '--c-icon-color',
  imgBg: '--c-img-bg',
  imgBorder: '--c-img-border',
  descColor: '--c-desc-color',
  msgTextColor: '--c-msg-color',
  checkColor: '--c-check-color',
  aggreementBtnColor: '--c-agree-btn',
  fileTitleColor: '--c-file-title',
  downTextColor: '--c-down-color',
  empowerColor: '--c-empower-color',
  specColor: '--c-spec-color',
  priceColor: '--c-price-color',
  countColor: '--c-count-color',
  operateBg: '--c-operate-bg',
  increaseBorderColor: '--c-operate-border',
  bottomColor: '--c-bottom-color',
  dividerColor: '--c-divider-color',
  lineColor: '--c-line-color',
  subTitleColor: '--c-subtitle-color',
  scanCodeIcon: '--c-scan-color',
  prevBg: '--c-prev-bg',
  prevLabelColor: '--c-prev-color',
  prevBorderColor: '--c-prev-border',
  nextBg: '--c-next-bg',
  nextLabelColor: '--c-next-color',
  nextBorderColor: '--c-next-border',
};

/**
 * 组件样式 → 内联样式对象（四段：组件背景 / 组件整体 / 组件风格 / 组件颜色）
 * @param {Object} comp 组件（含 style）
 * @param {Object} globalStyle 全局样式（仅用于组件左右边距兜底）
 */
export function componentStyleVars(comp, globalStyle) {
  const st = comp.style || {};
  const g = globalStyle || {};
  const s = {};
  // —— 组件整体：顶外边距 / 上下边距 / 左右边距 / 组件圆角 ——
  s.marginTop = (st.outMarginTop || 0) + 'px';
  s.paddingTop = (st.marginY != null ? st.marginY : 10) + 'px';
  s.paddingBottom = s.paddingTop;
  const mx = st.marginX != null ? st.marginX : (g.compMarginX || 0);
  s.paddingLeft = mx + 'px';
  s.paddingRight = mx + 'px';
  if (st.radius) s.borderRadius = st.radius + 'px';
  // —— 组件背景：颜色 / 图片+颜色（平铺·位置·图片样式）——
  if (st.bgColor) s.backgroundColor = st.bgColor;
  if (st.bgType === 'imgcolor' && st.bgImage) {
    s.backgroundImage = 'url("' + st.bgImage + '")';
    s.backgroundRepeat = st.bgRepeat || 'repeat-x';
    s.backgroundPosition = (st.bgPosX || 'left') + ' ' + (st.bgPosY || 'top');
    if (st.bgImgStyle === 'fill') s.backgroundSize = 'cover';
    else if (st.bgImgStyle === 'fixed') s.backgroundSize = 'contain';
    else s.backgroundSize = (st.bgImgW != null ? st.bgImgW : 20) + '% ' + (st.bgImgH != null ? st.bgImgH : 20) + '%';
  }
  // —— 组件风格 / 组件颜色：未在映射表里的键走 --st-<key> / --cl-<key> 兜底 ——
  Object.keys(st).forEach((k) => {
    const v = st[k];
    if (v == null || v === '') return;
    if (k === 'rowsShow') { s['--c-img-rows'] = v; }          // 图片上传 单行展示（无单位）
    else if (k === 'borderType') { s['--c-img-border-style'] = v; } // 图片上传 上传边框 solid/dashed
    else if (SIZE_VAR[k]) s[SIZE_VAR[k]] = v + 'px';
    else if (COLOR_VAR[k]) s[COLOR_VAR[k]] = v;
    else if (typeof v === 'number') s['--st-' + k] = v + 'px';
    else if (typeof v === 'string' && v.charAt(0) === '#') s['--cl-' + k] = v;
  });
  return s;
}
