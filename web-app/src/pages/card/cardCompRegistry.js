/**
 * 名片自定义装修组件 · 移动端轻量注册表（2026-10-20 V1）
 *
 * 与 web-admin 的 componentRegistry 是「同一套组件、两端复用」：
 * - defaultProps 与 admin 逐字一致（一致性单测 cardCompRegistry.test.js 钉死，防漂移）；
 * - schema 只收移动端装修页（cardEdit.vue）实际渲染的控件子集
 *   （input/image/color/slider/radio/switch/link），键必须存在于 admin schema
 *   （单测同样钉死：mobile schema key ⊆ admin schema key）。
 * - 不含 admin 的 PNG 图标资产（移动端用 SIcon/emoji 呈现，避免把 admin 构建物拖进分包）。
 *
 * 🔴 新增组件类型时必须同步：admin componentRegistry + 本文件 + server card.js 的
 *    COMP_TYPES 白名单 + cardDetail.vue 渲染分支，五处一致（单测会抓漂移）。
 */
import { sampleUrl } from '../../utils/sampleImages.js';

export const CARD_COMP_REGISTRY = [
  {
    type: 'image',
    name: '图片',
    defaultProps: { url: sampleUrl('banner'), link: '', widthMode: 'full', radius: 0, marginTop: 0, marginBottom: 0, mode: 'standard', style: 'single', items: [], bgColor: '', gap: 0, marginLR: 0, radiusTop: 0, radiusBottom: 0, cardStyle: 'default', borderColor: '#E5E6EB', imgFill: 'cover', imgPos: 'center', memberLevel: 'all' },
    schema: [
      { key: 'url', label: '图片', control: 'image', section: 'content' },
      { key: 'link', label: '跳转', control: 'link', section: 'content' },
      { key: 'marginTop', label: '上边距', control: 'slider', section: 'style', min: 0, max: 40 },
      { key: 'marginBottom', label: '下边距', control: 'slider', section: 'style', min: 0, max: 40 },
    ],
  },
  {
    type: 'channel-video',
    name: '视频号',
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
    defaultProps: { text: '欢迎来到本店', bgColor: '#FFF7E8', color: '#FF7D00', url: '', items: [], iconType: 'system', iconImage: sampleUrl('square'), dataSource: 'custom', fontSize: 14, bold: false, style: 'default', borderColor: '#E5E6EB', marginTop: 0, marginBottom: 0, radiusTop: 8, radiusBottom: 8, memberLevel: 'all' },
    schema: [
      { key: 'text', label: '文字', control: 'input', section: 'content', required: true },
      { key: 'fontSize', label: '字号', control: 'slider', section: 'style', min: 12, max: 20 },
      { key: 'bold', label: '加粗', control: 'switch', section: 'style' },
      { key: 'bgColor', label: '背景色', control: 'color', section: 'style' },
      { key: 'color', label: '文字色', control: 'color', section: 'style' },
      { key: 'marginTop', label: '上边距', control: 'slider', section: 'style', min: 0, max: 40 },
      { key: 'marginBottom', label: '下边距', control: 'slider', section: 'style', min: 0, max: 40 },
    ],
  },
  {
    type: 'divider',
    name: '分割线',
    defaultProps: { text: '', color: '#E5E6EB', thickness: 1, lineStyle: 'solid', marginTop: 14, marginBottom: 14, memberLevel: 'all' },
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
    defaultProps: { height: 20, bgColor: '', memberLevel: 'all' },
    schema: [
      { key: 'height', label: '空白高度', control: 'slider', section: 'content', min: 4, max: 120 },
      { key: 'bgColor', label: '颜色选择', control: 'color', section: 'style' },
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
