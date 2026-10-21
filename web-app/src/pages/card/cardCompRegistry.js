/**
 * 名片自定义装修组件 · 移动端轻量注册表（2026-10-20 V1）
 *
 * 与 web-admin 的 componentRegistry 是「同一套组件、两端复用」：
 * - defaultProps 与 admin 逐字一致（一致性单测 cardCompRegistry.test.js 钉死，防漂移）；
 * - schema 只收移动端装修页（cardEdit.vue）实际渲染的控件子集
 *   （input/image/color/slider/radio/switch/link/richtext），键必须存在于 admin schema
 *   （单测同样钉死：mobile schema key ⊆ admin schema key）；`when` 条件显隐同 admin 语义。
 * - 图标复用设计中心（web-admin componentRegistry）同款 PNG 资产：反馈 #279 要求
 *   「添加组件」面板图标与设计中心一致，同类型直接取设计中心的图标。源 PNG 拷贝到
 *   web-app/src/assets/comp-icons/（非 admin 构建物，仅 6 个约 11KB，不进分包体积风险区）。
 *
 * 🔴 反馈 #294（真机小程序 4 个图标纯白不显示）——图标改为 base64 内联，**不用 vite import**：
 *   import PNG → Vite 产物 `/assets/<name>.<hash>.png`（MP 端在主包根目录），该路径随构建
 *   内容变化；真机跑的包一旦是历史版本（顶层无 assets/ 目录、图标还是 emoji <text> 机制），
 *   新代码里的 /assets/*.png 必然落空 → <image> 加载失败**渲染纯白**（实测 8649/8649 像素
 *   纯白 = 完全未加载，不是渲染错/被裁/被遮挡）。开发者工具能显示是因为它走当前工程目录，
 *   不受「包版本」影响。
 *   base64 内联后图标数据在 JS 里，与包版本、资源目录、/card/ 子路径 base 全部解耦
 *   （MP 端 <image src="data:image/png;base64,..."> 原生支持，gen-mp-sicons.js 已验证）。
 *   生成脚本：web-app/scripts/gen-comp-icons-base64.js（换图标须重跑，单测会验字节）。
 *
 * 🔴 新增组件类型时必须同步：admin componentRegistry + 本文件 + server card.js 的
 *    COMP_TYPES 白名单 + cardDetail.vue 渲染分支，五处一致（单测会抓漂移）。
 */
import { sampleUrl } from '../../utils/sampleImages.js';
// 设计中心同款组件图标（copy from web-admin/src/assets/comp-icons），与设计中心「添加组件」面板一致。
// 🔴 base64 内联而非 vite import：见文件头「反馈 #294」说明（真机图标纯白根因与修法）。
import { COMP_ICON_DATA_URI } from '../../utils/compIconsBase64.js';
// 🔴 #321 收尾：公告前置符号面板选项引用共享表（与两端渲染、admin 端同一份）
import { NOTICE_SYMBOL_OPTIONS } from '../../utils/noticeSymbol.js';

export const CARD_COMP_REGISTRY = [
  {
    type: 'image',
    name: '图片',
    icon: COMP_ICON_DATA_URI.picture,
    iconKey: 'picture',
    defaultProps: { url: sampleUrl('banner'), link: '', widthMode: 'full', radius: 6, marginTop: 6, marginBottom: 0, mode: 'standard', style: 'single', items: [], bgColor: '', gap: 0, marginLR: 0, radiusTop: 0, radiusBottom: 0, cardStyle: 'default', borderColor: '#E5E6EB', imgFill: 'cover', imgPos: 'center', memberLevel: 'all', maxHeight: 0 },
    schema: [
      { key: 'url', label: '图片', control: 'image', section: 'content' },
      { key: 'link', label: '跳转', control: 'link', section: 'content' },
      { key: 'marginTop', label: '上边距', control: 'slider', section: 'style', min: 0, max: 40 },
      { key: 'marginBottom', label: '下边距', control: 'slider', section: 'style', min: 0, max: 40 },
      { key: 'maxHeight', label: '限高', control: 'slider', section: 'style', min: 0, max: 600, tips: '0 = 不限制。设置后图片按比例缩放到不超过该高度（不变形、不裁切），避免过长竖图撑爆版面' },
    ],
  },
  {
    type: 'channel-video',
    name: '视频号',
    icon: COMP_ICON_DATA_URI.channelVideo,
    iconKey: 'channelVideo',
    defaultProps: { finderUserName: '', feedId: '', cover: sampleUrl('banner'), title: '', desc: '', bgColor: '#F7F8FA' },
    schema: [
      { key: 'finderUserName', label: '视频号ID', control: 'input', section: 'content', required: true, placeholder: '如 sPh7vD5...' },
      { key: 'feedId', label: '视频ID', control: 'input', section: 'content', required: true, placeholder: '如 106511204134634884' },
      { key: 'title', label: '标题', control: 'input', section: 'content' },
      { key: 'desc', label: '描述', control: 'input', section: 'content' },
      { key: 'cover', label: '封面图', control: 'image', section: 'content' },
    ],
  },
  {
    type: 'notice',
    name: '文本',
    icon: COMP_ICON_DATA_URI.notice,
    iconKey: 'notice',
    defaultProps: { text: '欢迎来到本店', bgColor: '#FFF7E8', color: '#FF7D00', url: '', items: [], iconType: 'system', iconImage: sampleUrl('square'), dataSource: 'custom', fontSize: 14, bold: false, style: 'default', borderColor: '#E5E6EB', marginTop: 6, marginBottom: 0, radiusTop: 6, radiusBottom: 6, memberLevel: 'all', align: 'left', offsetX: 0, symbol: 'none' },
    schema: [
      { key: 'text', label: '文字', control: 'input', section: 'content', required: true },
      { key: 'fontSize', label: '字号', control: 'slider', section: 'style', min: 12, max: 20 },
      { key: 'bold', label: '加粗', control: 'switch', section: 'style' },
      // 🔴 反馈 #321：原来渲染里**写死**一个小圆点（.cc-notice-dot），用户输入文字后左边
      //   就凭空多个点。改成可选前置符号，默认「无」。
      //   🔴 options 引用共享表 utils/noticeSymbol.js（与渲染层、admin 端同一份）——
      //   手抄一份迟早漂移成「配了没反应」，且加符号时会漏改面板。
      { key: 'symbol', label: '前置符号', control: 'radio', default: 'none', section: 'style', options: NOTICE_SYMBOL_OPTIONS, tips: '显示在文字前面的符号。选「无」则只有文字（默认）' },
      { key: 'align', label: '对齐', control: 'radio', section: 'style', options: [{ label: '居左', value: 'left' }, { label: '居中', value: 'center' }, { label: '居右', value: 'right' }], tips: '整条公告（图标+文字）的对齐方式；居中/居右时文字不再撑满整行' },
      { key: 'offsetX', label: '左边偏移', control: 'slider', section: 'style', min: -20, max: 60, tips: '整条公告相对容器左边再平移。负数向左；不影响宽度' },
      { key: 'bgColor', label: '背景色', control: 'color', section: 'style' },
      { key: 'color', label: '文字色', control: 'color', section: 'style' },
      { key: 'marginTop', label: '上边距', control: 'slider', section: 'style', min: 0, max: 40 },
      { key: 'marginBottom', label: '下边距', control: 'slider', section: 'style', min: 0, max: 40 },
    ],
  },
  {
    type: 'button',
    name: '按钮',
    icon: COMP_ICON_DATA_URI.menu,
    iconKey: 'menu',
    // defaultProps 与 admin 逐字一致（含 widthPercent/boxOffsetX：C 端渲染走共享
    // buttonSizeStyle，宽度基准=视口，与 admin 画布同语义，防两端漂移）
    defaultProps: { text: '立即查看', textColor: '#ffffff', bgColor: '#165DFF', radius: 6, url: '', linkType: 'internal', miniAppId: '', miniAppPath: '', miniAppEnv: 'release', align: 'center', btnStyle: 'fill', strokeColor: '#165DFF', widthMode: 'full', widthPercent: 100, boxOffsetX: 0, marginTop: 6, marginBottom: 0, memberLevel: 'all' },
    schema: [
      { key: 'text', label: '文字', control: 'input', section: 'content', required: true },
      { key: 'url', label: '跳转', control: 'link', section: 'content', placeholder: '如 /pages/card/market' },
      // 🔴 反馈 #321：内部链接**恢复为一等类型**（#321 推翻 #301 的做法）。
      //   用户要的是「内联手填、不弹选择器」，不是「取消这一类型」——两件事不冲突。
      //   ⚠️ default:'internal' 必须显式给：admin 表单引擎对 radio 在值为空时取 options[0].value
      //   （见 PageEditor 的 listVal / addListItem）；default 与 options[0].value 同值才是真默认。
      { key: 'linkType', label: '跳转类型', control: 'radio', default: 'internal', section: 'content', options: [{ label: '内部链接', value: 'internal' }, { label: '外部小程序', value: 'miniapp' }, { label: '网页链接', value: 'web' }, { label: '拨打电话', value: 'phone' }], tips: '内部链接：在上面「跳转」框直接填页面路径（如 /pages/card/market）；外部小程序需填 AppID（须与当前小程序同一微信开放平台）' },
      { key: 'miniAppId', label: '小程序 AppID', control: 'input', section: 'content', when: { linkType: 'miniapp' }, placeholder: 'wx1234567890abcdef' },
      { key: 'miniAppPath', label: '小程序页面路径', control: 'input', section: 'content', when: { linkType: 'miniapp' }, placeholder: 'pages/index/index，可留空进首页' },
      { key: 'miniAppEnv', label: '跳转版本（高级）', control: 'radio', section: 'content', when: { linkType: 'miniapp' }, options: [{ label: '正式版', value: 'release' }, { label: '体验版', value: 'trial' }, { label: '开发版', value: 'develop' }], tips: '仅开发者调试时使用，普通用户请保持正式版' },
      // 🔴 反馈 #321：按钮横向对齐。与 boxOffsetX（左边偏移）**联动**：
      //   align 决定 auto 边距给哪边（left=左右空让右侧 / center=两边平分 / right=全给左侧），
      //   boxOffsetX 是在这个基准上再平移（设了偏移就以偏移为准，与容器ChildSize 同一纪律）。
      { key: 'align', label: '按钮对齐', control: 'radio', section: 'style', options: [{ label: '居左', value: 'left' }, { label: '居中', value: 'center' }, { label: '居右', value: 'right' }], tips: '按钮在容器内的横向位置。设了「左边偏移」时以偏移为准' },
      { key: 'btnStyle', label: '按钮样式', control: 'radio', section: 'style', options: [{ label: '填充', value: 'fill' }, { label: '描边', value: 'outline' }] },
      { key: 'strokeColor', label: '描边色', control: 'color', section: 'style', when: { btnStyle: 'outline' } },
      { key: 'widthMode', label: '按钮宽度', control: 'radio', section: 'style', options: [{ label: '整行', value: 'full' }, { label: '自适应', value: 'auto' }] },
      { key: 'widthPercent', label: '宽度百分比', control: 'slider', section: 'style', min: 20, max: 100, when: { widthMode: 'full' }, tips: '相对整屏宽度计算（不是相对容器），所以调容器边距不会影响它' },
      { key: 'boxOffsetX', label: '左边偏移', control: 'slider', section: 'style', min: -20, max: 60, tips: '按钮相对容器左边再平移。用来跟其他组件左边对齐；不影响宽度' },
      { key: 'bgColor', label: '按钮色', control: 'color', section: 'style' },
      { key: 'textColor', label: '文字色', control: 'color', section: 'style' },
      { key: 'radius', label: '按钮圆角', control: 'slider', section: 'style', min: 0, max: 24 },
      { key: 'marginTop', label: '上边距', control: 'slider', section: 'style', min: 0, max: 40 },
      { key: 'marginBottom', label: '下边距', control: 'slider', section: 'style', min: 0, max: 40 },
    ],
  },
  {
    type: 'rich-text',
    name: '富文本',
    icon: COMP_ICON_DATA_URI.richtext,
    iconKey: 'richtext',
    defaultProps: { html: '<p>富文本内容</p>', bottomBg: 'transparent', compBgColor: '#ffffff', style: 'default', borderColor: '#E5E6EB', marginTop: 6, marginBottom: 0, marginLR: 0, radiusTop: 6, radiusBottom: 6, memberLevel: 'all' },
    schema: [
      { key: 'html', label: '内容', control: 'richtext', section: 'content' },
      { key: 'style', label: '样式', control: 'radio', section: 'style', options: [{ label: '默认', value: 'default' }, { label: '投影', value: 'shadow' }, { label: '描边', value: 'border' }] },
      { key: 'borderColor', label: '描边颜色', control: 'color', section: 'style', when: { style: 'border' } },
      { key: 'compBgColor', label: '组件背景', control: 'color', section: 'style' },
      { key: 'marginTop', label: '上边距', control: 'slider', section: 'style', min: 0, max: 40 },
      { key: 'marginBottom', label: '下边距', control: 'slider', section: 'style', min: 0, max: 40 },
    ],
  },
  {
    type: 'divider',
    name: '分割线',
    icon: COMP_ICON_DATA_URI.line,
    iconKey: 'line',
    defaultProps: { text: '', color: '#E5E6EB', thickness: 1, lineStyle: 'solid', marginTop: 6, marginBottom: 14, memberLevel: 'all' },
    schema: [
      { key: 'text', label: '文字', control: 'input', section: 'content', placeholder: '选填，显示在分割线中间' },
      { key: 'color', label: '颜色', control: 'color', section: 'style' },
      { key: 'lineStyle', label: '风格', control: 'radio', section: 'style', options: [{ label: '实线', value: 'solid' }, { label: '虚线', value: 'dashed' }, { label: '点线', value: 'dotted' }] },
      { key: 'thickness', label: '线宽', control: 'slider', section: 'style', min: 1, max: 8 },
      { key: 'marginTop', label: '上边距', control: 'slider', section: 'style', min: 0, max: 40 },
      { key: 'marginBottom', label: '下边距', control: 'slider', section: 'style', min: 0, max: 40 },
    ],
  },
  {
    type: 'spacer',
    name: '空白占位',
    icon: COMP_ICON_DATA_URI.line,
    iconKey: 'line',
    defaultProps: { height: 20, bgColor: '', memberLevel: 'all' },
    schema: [
      { key: 'height', label: '空白高度', control: 'slider', section: 'content', min: 4, max: 120 },
      { key: 'bgColor', label: '颜色选择', control: 'color', section: 'style' },
    ],
  },
  {
    type: 'button-group',
    name: '按钮组',
    icon: COMP_ICON_DATA_URI.menu,
    iconKey: 'menu',
    // 2-5 个按钮的横排操作组；buttons 由装修页自定义编辑器维护（移动端 schema 不含 list 控件，
    // 故按钮明细走 cardEdit 的专属编辑器，间距/边距走通用滑块）。defaultProps 与 admin 逐字一致。
    defaultProps: {
      buttons: [
        { text: '按钮一', url: '', linkType: 'internal', miniAppId: '', miniAppPath: '', miniAppEnv: 'release', btnStyle: 'fill', bgColor: '#165DFF', textColor: '#ffffff' },
        { text: '按钮二', url: '', linkType: 'internal', miniAppId: '', miniAppPath: '', miniAppEnv: 'release', btnStyle: 'fill', bgColor: '#165DFF', textColor: '#ffffff' },
      ],
      gap: 16,
      marginTop: 6,
      marginBottom: 0,
      memberLevel: 'all',
    },
    schema: [
      { key: 'gap', label: '按钮间距', control: 'slider', section: 'style', min: 0, max: 40 },
      { key: 'marginTop', label: '上边距', control: 'slider', section: 'style', min: 0, max: 40 },
      { key: 'marginBottom', label: '下边距', control: 'slider', section: 'style', min: 0, max: 40 },
    ],
  },
];

const BY_TYPE = Object.fromEntries(CARD_COMP_REGISTRY.map((c) => [c.type, c]));

export function getCompDef(type) {
  return BY_TYPE[type] || null;
}

export function compDefaultProps(type) {
  const def = getCompDef(type);
  return def ? JSON.parse(JSON.stringify(def.defaultProps)) : {};
}
