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
};

export const componentRegistry = [
  {
    type: 'title',
    name: '标题',
    group: 'basic',
    icon: 'title',
    defaultProps: { text: '页面标题', color: '#1d2129', align: 'center', size: 22 },
    schema: [
      { key: 'text', label: '文字', control: 'input' },
      { key: 'color', label: '颜色', control: 'color' },
      { key: 'align', label: '对齐', control: 'radio', options: [{ label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' }] },
      { key: 'size', label: '字号', control: 'slider', min: 12, max: 32 },
    ],
  },
  {
    type: 'text',
    name: '文本',
    group: 'basic',
    icon: 'text',
    defaultProps: { text: '这里填写文本内容', color: '#1d2129', align: 'center', size: 14 },
    schema: [
      { key: 'text', label: '文字', control: 'input' },
      { key: 'color', label: '颜色', control: 'color' },
      { key: 'align', label: '对齐', control: 'radio', options: [{ label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' }] },
      { key: 'size', label: '字号', control: 'slider', min: 12, max: 32 },
    ],
  },
  {
    type: 'image',
    name: '图片',
    group: 'basic',
    icon: 'image',
    defaultProps: { url: '', link: '' },
    schema: [
      { key: 'url', label: '图片', control: 'image' },
      { key: 'link', label: '跳转', control: 'link', placeholder: '如 /pages/card/market' },
    ],
  },
  {
    type: 'button',
    name: '按钮',
    group: 'basic',
    icon: 'button',
    defaultProps: { text: '立即查看', textColor: '#ffffff', bgColor: '#165DFF', radius: 8, url: '' },
    schema: [
      { key: 'text', label: '文字', control: 'input' },
      { key: 'textColor', label: '文字色', control: 'color' },
      { key: 'bgColor', label: '背景色', control: 'color' },
      { key: 'radius', label: '圆角', control: 'slider', min: 0, max: 24 },
      { key: 'url', label: '跳转', control: 'link', placeholder: '如 /pages/card/market' },
    ],
  },
  {
    type: 'divider',
    name: '分割线',
    group: 'basic',
    icon: 'divider',
    defaultProps: { text: '' },
    schema: [{ key: 'text', label: '文字', control: 'input', placeholder: '选填，显示在分割线中间' }],
  },
  {
    type: 'notice',
    name: '公告',
    group: 'basic',
    icon: 'notice',
    defaultProps: { text: '欢迎来到本店', bgColor: '#FFF7E8', color: '#FF7D00', url: '' },
    schema: [
      { key: 'text', label: '文字', control: 'input' },
      { key: 'bgColor', label: '背景色', control: 'color' },
      { key: 'color', label: '文字色', control: 'color' },
      { key: 'url', label: '跳转', control: 'link', placeholder: '如 /pages/card/market' },
    ],
  },
];

export function findComponent(type) {
  return componentRegistry.find((c) => c.type === type) || null;
}

export function groupComponents(groupKey) {
  return componentRegistry.filter((c) => c.group === groupKey);
}
