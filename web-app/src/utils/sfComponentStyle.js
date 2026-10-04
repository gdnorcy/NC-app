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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 60 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 60 },
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
    { key: 'countColor', label: '字数统计颜色', def: '#909399' },
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
      { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 44 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
    // 对标站 --align-items：选项文字对齐（左右布局下生效最明显）
    { key: 'optTextAlign', label: '选项文字对齐', type: 'select', def: 'left', options: [
      { value: 'left', label: '左对齐' }, { value: 'center', label: '居中' }
    ] },
    // ── 图片/图文选项的排布（对标站 CSSOM 实测：.static-radio 是纵向大图列表，
    //    img height:95px; max-width:200px，无横向网格）──
    // optImgLayout: list=纵向列表（对标站默认，图片固定高 95px）
    //               grid=网格（扩展能力，格子数由 optImgPerRow 决定，图片大小用 optionImgSize）
    { key: 'optImgLayout', label: '选项排布', type: 'select', def: 'list', optImgOnly: true, options: [
      { value: 'list', label: '纵向列表' }, { value: 'grid', label: '网格排列' }
    ] },
    { key: 'optImgPerRow', label: '每行选项数', type: 'select', def: 3, optImgOnly: true, optImgGridOnly: true, options: [
      { value: 2, label: '2 个' }, { value: 3, label: '3 个' }, { value: 4, label: '4 个' }, { value: 5, label: '5 个' }
    ] },
    // 「选项类型」= 图片/图文 时生效：网格模式下的选项图尺寸与圆角
    { key: 'optionImgSize', label: '选项图片大小', def: 64, max: 160, optImgOnly: true, optImgGridOnly: true },
    { key: 'optionImgRadius', label: '选项图片圆角', def: 3, max: 60, optImgOnly: true, optImgGridOnly: true },
  ], colorRows: [
    // optImgHide：「图片/图文选项」时隐藏（对标站实测该状态下这 5 个颜色字段整块消失）
    { key: 'inputBg', label: '选项背景', def: '#F7F9FA', optImgHide: true },
    { key: 'borderColor', label: '选项边框', def: '#F5F2F2', optImgHide: true },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'promptColor', label: '提示文字', def: '#999999', optImgHide: true },
    { key: 'radioColor', label: '选项文字', def: '#333333', optImgHide: true },
    { key: 'otherColor', label: '未选中边框', def: '#F5F2F2', optImgHide: true },
    { key: 'activeColor', label: '选中颜色', def: '#2667EC' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
  ] },
  checkbox: { boxLine: [{value:'s1',label:'风格1'},{value:'s2',label:'风格2'},{value:'s3',label:'风格3'}], styleRows: [
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '输入框圆角', def: 3, max: 20 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
    // 对标站 --align-items：选项文字对齐
    { key: 'optTextAlign', label: '选项文字对齐', type: 'select', def: 'left', options: [
      { value: 'left', label: '左对齐' }, { value: 'center', label: '居中' }
    ] },
    // ── 图片/图文选项的排布（对标站 CSSOM 实测：.static-radio 是纵向大图列表，
    //    img height:95px; max-width:200px，无横向网格）──
    // optImgLayout: list=纵向列表（对标站默认，图片固定高 95px）
    //               grid=网格（扩展能力，格子数由 optImgPerRow 决定，图片大小用 optionImgSize）
    { key: 'optImgLayout', label: '选项排布', type: 'select', def: 'list', optImgOnly: true, options: [
      { value: 'list', label: '纵向列表' }, { value: 'grid', label: '网格排列' }
    ] },
    { key: 'optImgPerRow', label: '每行选项数', type: 'select', def: 3, optImgOnly: true, optImgGridOnly: true, options: [
      { value: 2, label: '2 个' }, { value: 3, label: '3 个' }, { value: 4, label: '4 个' }, { value: 5, label: '5 个' }
    ] },
    // 「选项类型」= 图片/图文 时生效：网格模式下的选项图尺寸与圆角
    { key: 'optionImgSize', label: '选项图片大小', def: 64, max: 160, optImgOnly: true, optImgGridOnly: true },
    { key: 'optionImgRadius', label: '选项图片圆角', def: 3, max: 60, optImgOnly: true, optImgGridOnly: true },
  ], colorRows: [
    // optImgHide：「图片/图文选项」时隐藏（对标站实测该状态下这 5 个颜色字段整块消失）
    { key: 'inputBg', label: '选项背景', def: '#F7F9FA', optImgHide: true },
    { key: 'borderColor', label: '选项边框', def: '#F5F2F2', optImgHide: true },
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'promptColor', label: '提示文字', def: '#999999', optImgHide: true },
    { key: 'radioColor', label: '选项文字', def: '#333333', optImgHide: true },
    { key: 'otherColor', label: '未选中边框', def: '#F5F2F2', optImgHide: true },
    { key: 'activeColor', label: '选中颜色', def: '#2667EC' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
  ] },
  select: { boxLine: [{value:'s1',label:'风格1'},{value:'s2',label:'风格2'},{value:'s3',label:'风格3'}], styleRows: [
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
    { key: 'titleSize', label: '标题大小', def: 16, max: 24 },
  ], colorRows: [
    { key: 'labelColor', label: '标题颜色', def: '#000000' },
    { key: 'errorColor', label: '错误提示', def: '#ED4F4F' },
    { key: 'descColor', label: '描述文字', def: '#999999' },
    { key: 'inactiveColor', label: '未激活颜色', def: '#C6D1DE' },
    { key: 'activeColor', label: '选中颜色', def: '#F7BA2A' },
  ] },
  filedownload: { boxLine: [{value:'s1',label:'风格1'},{value:'s2',label:'风格2'}], styleRows: [
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
    // 按钮高 96rpx(48px) → 圆角 24px 即 height/2 = 全胶囊（对标图实测为真全圆角）。
    // 上限锁 24：超过 height/2 视觉不再变化，避免滑杆出现「拉满却没反应」的死区。
    { key: 'inputRadius', label: '按钮圆角', def: 24, max: 24 },
  ], colorRows: [
    { key: 'inputBg', label: '按钮背景', def: '#0076F0' },
    { key: 'borderColor', label: '按钮边框', def: '#0076F0' },
    { key: 'labelColor', label: '按钮文字', def: '#FFFFFF' },
  ] },
  backdesc: { boxLine: false, styleRows: [
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
    { key: 'titleSize', label: '文字大小', def: 14, max: 24 },
  ], colorRows: [
    { key: 'enterTextColor', label: '文字颜色', def: '#333333' },
  ] },
  realtime: { boxLine: [{value:'box',label:'框风格'},{value:'line',label:'线风格'}], styleRows: [
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
    { key: 'inputRadius', label: '圆角', def: 10, max: 30 },
  ], colorRows: [] },
  pay: { boxLine: [{value:'box',label:'框风格'},{value:'line',label:'线风格'}], styleRows: [
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
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
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
    { key: 'imgRadius', label: '图片圆角', def: 0, max: 20 },
    { key: 'dotGap', label: '圆点间距', def: 6, max: 30 },
    { key: 'dotBottom', label: '圆点底边距', def: 8, max: 30 },
    { key: 'switchSpeed', label: '切换速度', def: 3, max: 10 },
  ], colorRows: [
    { key: 'activeColor', label: '选中按钮色', def: '#FFFFFF' },
  ] },
  bigimage: { boxLine: false, styleRows: [
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
    { key: 'imgRadius', label: '图片圆角', def: 3, max: 20 },
  ], colorRows: [] },
  title: { boxLine: false, styleRows: [
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
    { key: 'titleSize', label: '主标题大小', def: 17, max: 30 },
    { key: 'subTitleSize', label: '副标题大小', def: 13, max: 24 },
  ], colorRows: [
    { key: 'labelColor', label: '主标题颜色', def: '#000000' },
    { key: 'subTitleColor', label: '副标题颜色', def: '#999999' },
    { key: 'promptColor', label: '提示文字', def: '#999999' },
    { key: 'lineColor', label: '线条颜色', def: '#434343' },
  ] },
  richtext: { boxLine: false, styleRows: [
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
  ], colorRows: [] },
  blank: { boxLine: false, styleRows: [
    { key: 'dividerHeight', label: '空白高度', def: 42, max: 200 },
  ], colorRows: [] },
  line: { boxLine: false, styleRows: [
    { key: 'dividerHeight', label: '线条粗细', def: 1, max: 20 },
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
  ], colorRows: [
    { key: 'dividerColor', label: '线条颜色', def: '#000000' },
  ] },
  video: { boxLine: false, styleRows: [
    { key: 'inputMarginX', label: '输入框左右边距', def: 10, max: 40 },
  ], colorRows: [] },
};

// 组件整体（所有组件一致的四段之一）
// 对齐 ew 内部键名（对标笔记第 89 行，rate options 实测）：
//   outMarginTop          外·上边距   = 卡片与上一组件的间距
//   outLeftRightMargin    外·左右边距 = 卡片与页面左右边距（对标图实测恰为 10px）
//   innerTopBottomPadding 内·上下边距 = 卡片内部上下留白（ew 默认 10）
//   innerLeftRightMargin  内·左右边距 = 卡片内部左右留白
//   componentFillet       组件圆角 —— ew 是「四角独立圆角选择器」（对标笔记第 86 行），
//                          故拆成 radiusTL/TR/BR/BL 四个键；radius 作为「四角统一」快捷值保留。
// 此前把「左右边距」一个键同时当内距用（= innerLeftRightMargin），外左右完全写死在三端 CSS 的
// 页面 padding 里 → 组件级无法调、页面左右留白恒 16px（对标图是 10px）。故拆成 out/inner 两键。
// 三个默认值 10/10/16 均取自对标图实测：外左右 10px、灰缝 10px、卡内左右约 14px（取 16）。
const COMMON_WHOLE = {
  outMarginTop: 10, outMarginX: 10, marginY: 10, marginX: 16,
  // 四角圆角：ew 四角独立选择器，默认全 0（直角）；radius 保留为「四角统一」快捷值（默认 0）
  radius: 0, radiusTL: 0, radiusTR: 0, radiusBR: 0, radiusBL: 0,
};
// 组件背景（所有组件一致）
const COMMON_BG = { bgType: 'color', bgColor: '#FFFFFF', bgImage: '', bgRepeat: 'repeat-x', bgPosX: 'left', bgPosY: 'top', bgImgStyle: 'custom', bgImgW: 20, bgImgH: 20 };

// 按 schema 生成组件默认样式（兼容旧数据：老 key 映射过来）
export function defaultStyle(type) {
  const sc = STYLE_SCHEMA[type] || {};
  const s = { ...COMMON_BG, ...COMMON_WHOLE };
  // 风格卡默认值：取 boxLine 的**首个选项**。此前写死 'box'，但 textarea/date/time 的选项是
  // box1/box2/line（date/time 首项还是 line），根本没有 'box' 这个值 → 默认态是个不存在的 class，
  // 三端都要靠「落到默认分支」兜底。现按 schema 取真实首项。
  if (sc.boxLine) s.styleType = (Array.isArray(sc.boxLine) ? sc.boxLine[0].value : 'box');
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
 * 「组件风格」styleType 值 → 渲染端语义 class（sfv-*）。
 *
 * 为什么需要这层映射：styleType 的取值按组件各自命名，跨组件会撞名 ——
 *   radio/checkbox/select : s1 / s2 / s3
 *   number                : step / slider
 *   text/textarea/date…   : box / box1 / box2 / line
 * 此前渲染端直接 `cs-${styleType}`，导致 s2/s3/slider 无对应规则、点了没反应。
 * 这里统一收敛成语义 class，三端只认语义、不认原始值：
 *   sfv-box   描边 + 浅底（box / box1 / s1）
 *   sfv-plain 白底 + 无描边（box2 / s2）
 *   sfv-line  去框仅底线（line / s3）
 *   sfv-step  数字步进器（number 独有）
 *   sfv-slider 滑块（number 独有）
 * 选择类组件（radio/checkbox）的 s1/s2/s3 作用在**选项区**而非输入框，
 * 故再由 sfx-optbox / sfx-optplain / sfx-optline 三个 class 表达，与输入类区分。
 * 选择类组件（radio/checkbox/select）的 s1/s2/s3 作用在**选项区**而非输入框，
 * 故再由 sfx-optbox / sfx-optplain / sfx-optline 三个 class 表达，与输入类区分。
 * ⚠️ **select 不属于选项类**：它渲染的是下拉输入框（`.sf-input`/`.cmpv-input`），
 * 并没有选项区，若挂`sfx-opt*` 会让三个风格全部落空（审计脚本已抓出此错）。
 * 只有 radio / checkbox 才是真正的「选项区三态」。
 */
export function styleVariant(comp) {
  const type = (comp && comp.type) || '';
  const st = (comp && comp.style && comp.style.styleType) || '';
  const OPTION_TYPES = { radio: 1, checkbox: 1 };
  if (OPTION_TYPES[type]) {
    // 对标站 CSSOM 实测：
    //   s1 top-box1-radio → 每选项独立卡片（浅底+描边, min-height 41px）
    //   s2 top-box2-radio → 纯文字+圆点，无底框，**选中态文字也不变色**
    //   s3 top-box3-radio → 胶囊按钮，**选中态填 --c-active-color 蓝底白字**
    // sfx-optfill 标记「选中态需要填色」，只有 s3 有。
    if (st === 's2') return { 'sfv-plain': true, 'sfx-optplain': true };
    if (st === 's3') return { 'sfv-line': true, 'sfx-optline': true, 'sfx-optfill': true };
    return { 'sfv-box': true, 'sfx-optbox': true };  // s1 = 描边 + 浅底
  }
  if (type === 'number') {
    if (st === 'slider') return { 'sfv-slider': true };
    if (st === 'step') return { 'sfv-step': true };
    return { 'sfv-box': true };                        // 未知/空值兜底
  }
  // 非选择类的 s1/s2（目前仅 filedownload：风格1/风格2）按输入类语义分派，
  // 否则两档都落到 sfv-box = 视觉完全相同 = 风格2 是死参数（单测已捕获）。
  if (st === 's1') return { 'sfv-box': true };
  if (st === 's2') return { 'sfv-plain': true };
  if (st === 's3') return { 'sfv-line': true };
  if (st === 'box2') return { 'sfv-plain': true };
  if (st === 'line') return { 'sfv-line': true };
  return { 'sfv-box': true };                          // box / box1 / 未知值
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
  // 选择类「图片/图文选项」：选项图尺寸与圆角（content.optionType=image/imageText 才生效）
  optionImgSize: '--c-option-img-size',
  optionImgRadius: '--c-option-img-radius',
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
 * 「选项类型」三档（content.optionType：text 文字 / image 图片 / imageText 图文）。
 * 老数据没有该字段（undefined）时兜底 'text'。
 * @param {Object} comp
 * @returns {'text'|'image'|'imageText'}
 */
export function optType(comp) {
  const t = comp && comp.content && comp.content.optionType;
  return t === 'image' || t === 'imageText' ? t : 'text';
}

/**
 * 是否为「图片/图文选项」。面板据此：
 *   1) 隐藏「添加其他选项」「批量添加」；
 *   2) 隐藏风格三档 + 底框边框/底框背景/提示文本/选项文字/其他线条 5 个颜色字段。
 * 与对标站实测一致（对标站图片选项下风格切换本身就是失效的，照抄不做"修好"）。
 * @param {Object} comp
 * @returns {boolean}
 */
export function isImgOptionType(comp) {
  return optType(comp) !== 'text';
}

/**
 * 组件样式 → 内联样式对象（四段：组件背景 / 组件整体 / 组件风格 / 组件颜色）
 * @param {Object} comp 组件（含 style）
 * @param {Object} globalStyle 全局样式（仅用于组件左右边距兜底）
 */
/**
 * 组件是否可见（C 端渲染 / 分页 / 校验的判定入口）。
 * 设计器「是否显示 = 隐藏」写入 content.visible === false 时隐藏；
 * 缺省（undefined / true）按显示处理，与 ew 默认一致。
 * @param {Object} c 组件对象（含 content）
 * @returns {boolean}
 */
export function isVisible(c) {
  return !(c && c.content && c.content.visible === false);
}

export function componentStyleVars(comp, globalStyle, layout) {
  const st = comp.style || {};
  const g = globalStyle || {};
  const s = {};
  // —— 组件整体：顶外边距 / 左右外边距 / 上下内边距 / 左右内边距 / 组件圆角（对齐 ew 四件套）——
  // 顶外边距 = 卡片与上一组件的外部间距（「组件即卡片」的灰缝唯一来源，三端不再写死 margin-bottom）。
  // null/undefined（老数据未迁移）按默认 10 处理以保持原外观；显式 0 = 真正紧贴上一组件。
  // 左右布局：间距由容器 gap 统一提供，逐组件 marginTop 归零，避免每行再叠一层纵向偏移。
  s.marginTop = (layout === 'horizontal' ? 0 : (st.outMarginTop != null ? st.outMarginTop : 10)) + 'px';
  // 外·左右边距 = 卡片与页面左右边距（ew outLeftRightMargin）。此前写死在三端页面 padding 里、组件级不可调，
  // 对标图实测应为 10px（页面 373 宽 → 左右灰带恰为 15..24 / 348..357）。用 margin 与页面 padding 叠加。
  const ox = st.outMarginX != null ? st.outMarginX : 10;
  s.marginLeft = ox + 'px';
  s.marginRight = ox + 'px';
  // 内·上下边距 = 卡片内部上下留白（ew innerTopBottomPadding，默认 10）
  s.paddingTop = (st.marginY != null ? st.marginY : 10) + 'px';
  s.paddingBottom = s.paddingTop;
  const mx = st.marginX != null ? st.marginX : (g.compMarginX || 0);
  // 内·左右边距（ew inputLeftRightMargin）：**始终内联**，0 也发。
  //   此前是「仅 >0 才发、0 回落三端 CSS 基础 16px」，导致该参数设 0 无效（实测 paddingLeft 恒 16px）——
  //   参数被架空。现把 16px 基础值上移为 COMMON_WHOLE.marginX 的默认值，三端 CSS 基础内距改为 0，
  //   于是「默认 = 16px 卡片内距」外观不变，而「设 0 = 真正贴边」可用。
  s.paddingLeft = mx + 'px';
  s.paddingRight = mx + 'px';
  // —— 组件圆角（ew componentFillet = 四角独立选择器，对标笔记第 86 行）——
  // 四角独立优先（radiusTL/TR/BR/BL 各自有值时按角发射）；四角全 0 时回落 radius 统一值。
  // 此前是 `if (st.radius)` —— 0 属 falsy 会被整段跳过，导致「设 0 无效」且被三端 CSS
  // 基础 border-radius 接管（设计器 .sf-comp-wrap 有 8px 会盖掉内联）。现改为**始终发射**，
  // 0 也发，四角才能真正生效。
  const r = (k) => (st[k] != null ? st[k] : 0);
  const uni = st.radius != null ? st.radius : 0;
  const rTL = r('radiusTL') || uni;
  const rTR = r('radiusTR') || uni;
  const rBR = r('radiusBR') || uni;
  const rBL = r('radiusBL') || uni;
  s.borderTopLeftRadius = rTL + 'px';
  s.borderTopRightRadius = rTR + 'px';
  s.borderBottomRightRadius = rBR + 'px';
  s.borderBottomLeftRadius = rBL + 'px';
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
    // 选项文字对齐（对标站 --align-items）：字符串枚举，需显式发射，
    // 否则会被下面的兜底分支跳过（既非 number 也非 # 开头）→ 面板调了没反应。
    else if (k === 'optTextAlign') { s['--c-opt-align'] = (v === 'center' ? 'center' : 'left'); }
    // 图片/图文选项排布：list=纵向列表（对标站默认）/ grid=网格。
    // 字符串枚举同样要显式发射，否则兜底分支会把它当普通字符串丢掉。
    else if (k === 'optImgLayout') { s['--c-opt-img-layout'] = (v === 'grid' ? 'grid' : 'list'); }
    // 网格模式每行格子数：clamp 到 2~5，防止手改数据写出 0 列/超大列
    else if (k === 'optImgPerRow') { s['--c-opt-img-per-row'] = String(Math.min(5, Math.max(2, parseInt(v, 10) || 3))); }
    else if (SIZE_VAR[k]) s[SIZE_VAR[k]] = v + 'px';
    else if (COLOR_VAR[k]) s[COLOR_VAR[k]] = v;
    else if (typeof v === 'number') s['--st-' + k] = v + 'px';
    else if (typeof v === 'string' && v.charAt(0) === '#') s['--cl-' + k] = v;
  });
  return s;
}
