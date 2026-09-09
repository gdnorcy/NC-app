/**
 * 设计中心组件注册表（数据驱动）
 *
 * 新增组件 = registry 加一条 + ComponentRender.vue 加一个渲染分支：
 * 组件库（分组/搜索/图标）、属性面板（schema 自动渲染）自动生效，无需改编辑器页面。
 *
 * 组件图标：直接使用 eweishop 原版 PNG 图标（用户指定照抄），76×76。
 */
import iconTitle from '../../../../assets/comp-icons/title.png';
import iconText from '../../../../assets/comp-icons/richtext.png';
import iconImage from '../../../../assets/comp-icons/picture.png';
import iconButton from '../../../../assets/comp-icons/menu.png';
import iconDivider from '../../../../assets/comp-icons/line.png';
import iconNotice from '../../../../assets/comp-icons/notice.png';
import iconCountdown from '../../../../assets/comp-icons/countdown.png';
import iconForm from '../../../../assets/comp-icons/form.png';
import iconVideo from '../../../../assets/comp-icons/video.png';

export const componentGroups = [
  { key: 'basic', name: '基础组件' },
  { key: 'marketing', name: '营销组件' },
  { key: 'function', name: '功能组件' },
];

// 组件图标（eweishop 原版）
export const COMP_ICONS = {
  title: iconTitle,
  text: iconText,
  image: iconImage,
  button: iconButton,
  divider: iconDivider,
  notice: iconNotice,
  countdown: iconCountdown,
  form: iconForm,
  video: iconVideo,
};

export const componentRegistry = [
  {
    type: 'title',
    name: '标题',
    group: 'basic',
    icon: 'title',
    defaultProps: { text: '页面标题', color: '#1d2129', align: 'center', size: 22 },
    schema: [
      { key: 'text', label: '文字', control: 'input', section: 'content', required: true },
      { key: 'color', label: '颜色', control: 'color', section: 'style' },
      { key: 'align', label: '对齐', control: 'radio', section: 'style', options: [{ label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' }] },
      { key: 'size', label: '字号', control: 'slider', section: 'style', min: 12, max: 32 },
    ],
  },
  {
    type: 'text',
    name: '文本',
    group: 'basic',
    icon: 'text',
    defaultProps: { text: '这里填写文本内容', color: '#1d2129', align: 'center', size: 14 },
    schema: [
      { key: 'text', label: '文字', control: 'input', section: 'content', required: true },
      { key: 'color', label: '颜色', control: 'color', section: 'style' },
      { key: 'align', label: '对齐', control: 'radio', section: 'style', options: [{ label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' }] },
      { key: 'size', label: '字号', control: 'slider', section: 'style', min: 12, max: 32 },
    ],
  },
  {
    type: 'image',
    name: '图片',
    group: 'basic',
    icon: 'image',
    defaultProps: { url: '', link: '' },
    schema: [
      { key: 'url', label: '图片', control: 'image', section: 'content', required: true },
      { key: 'link', label: '跳转', control: 'link', section: 'content', placeholder: '如 /pages/card/market' },
    ],
  },
  {
    type: 'button',
    name: '按钮',
    group: 'basic',
    icon: 'button',
    defaultProps: { text: '立即查看', textColor: '#ffffff', bgColor: '#165DFF', radius: 8, url: '' },
    schema: [
      { key: 'text', label: '文字', control: 'input', section: 'content', required: true },
      { key: 'url', label: '跳转', control: 'link', section: 'content', placeholder: '如 /pages/card/market' },
      { key: 'textColor', label: '文字色', control: 'color', section: 'style' },
      { key: 'bgColor', label: '背景色', control: 'color', section: 'style' },
      { key: 'radius', label: '按钮圆角', control: 'slider', section: 'style', min: 0, max: 24 },
    ],
  },
  {
    type: 'divider',
    name: '分割线',
    group: 'basic',
    icon: 'divider',
    defaultProps: { text: '' },
    schema: [{ key: 'text', label: '文字', control: 'input', section: 'content', placeholder: '选填，显示在分割线中间' }],
  },
  {
    type: 'notice',
    name: '公告',
    group: 'basic',
    icon: 'notice',
    defaultProps: { text: '欢迎来到本店', bgColor: '#FFF7E8', color: '#FF7D00', url: '' },
    schema: [
      { key: 'text', label: '文字', control: 'input', section: 'content', required: true },
      { key: 'url', label: '跳转', control: 'link', section: 'content', placeholder: '如 /pages/card/market' },
      { key: 'bgColor', label: '背景色', control: 'color', section: 'style' },
      { key: 'color', label: '文字色', control: 'color', section: 'style' },
    ],
  },
  {
    type: 'countdown',
    name: '倒计时',
    group: 'marketing',
    icon: 'countdown',
    badge: 'new',
    defaultProps: { title: '限时活动', days: '02', hours: '12', minutes: '30', seconds: '00', color: '#165DFF' },
    schema: [
      { key: 'title', label: '活动名称', control: 'input', section: 'content', required: true },
      { key: 'days', label: '天数', control: 'input', section: 'content' },
      { key: 'hours', label: '小时', control: 'input', section: 'content' },
      { key: 'minutes', label: '分钟', control: 'input', section: 'content' },
      { key: 'seconds', label: '秒', control: 'input', section: 'content' },
      { key: 'color', label: '主题色', control: 'color', section: 'style' },
    ],
  },
  {
    type: 'form',
    name: '表单',
    group: 'marketing',
    icon: 'form',
    badge: 'new',
    defaultProps: { title: '留资表单', namePlaceholder: '请输入姓名', phonePlaceholder: '请输入手机号', submitText: '提交', btnColor: '#165DFF' },
    schema: [
      { key: 'title', label: '表单标题', control: 'input', section: 'content', required: true },
      { key: 'namePlaceholder', label: '姓名字段', control: 'input', section: 'content' },
      { key: 'phonePlaceholder', label: '手机字段', control: 'input', section: 'content' },
      { key: 'submitText', label: '按钮文字', control: 'input', section: 'content' },
      { key: 'btnColor', label: '按钮色', control: 'color', section: 'style' },
    ],
  },
  {
    type: 'video',
    name: '视频',
    group: 'marketing',
    icon: 'video',
    badge: 'new',
    defaultProps: { url: '', poster: '' },
    schema: [
      { key: 'url', label: '视频地址', control: 'input', section: 'content', required: true, placeholder: '支持 mp4 链接' },
      { key: 'poster', label: '封面图', control: 'image', section: 'content' },
    ],
  },
];

// 通用样式：自动注入属性面板「通用样式」分组（跳过组件 schema 已有同名 key）
export const commonStyleSchema = [
  { key: 'padding', label: '内边距', control: 'slider', min: 0, max: 24 },
  { key: 'radius', label: '圆角', control: 'slider', min: 0, max: 24 },
  { key: 'bgColor', label: '背景色', control: 'color' },
];
export const commonStyleProps = { padding: 8, radius: 8, bgColor: '' };

export function findComponent(type) {
  return componentRegistry.find((c) => c.type === type) || null;
}

export function groupComponents(groupKey) {
  return componentRegistry.filter((c) => c.group === groupKey);
}
