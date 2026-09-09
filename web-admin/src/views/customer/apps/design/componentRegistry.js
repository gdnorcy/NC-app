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
import iconImageText from '../../../../assets/comp-icons/bannerGoods.png';
import iconSwiper from '../../../../assets/comp-icons/banner.png';
import iconMyCard from '../../../../assets/comp-icons/member_inviter.png';
import iconGridNav from '../../../../assets/comp-icons/listmenu.png';
import iconStats from '../../../../assets/comp-icons/goodsRanking.png';
import iconPanorama from '../../../../assets/comp-icons/storeLocation.png';
import iconCube from '../../../../assets/comp-icons/cube.png';
import iconChannelProfile from '../../../../assets/comp-icons/followaccount.png';
import iconChannelVideo from '../../../../assets/comp-icons/channelvideo.png';
import iconChannelLive from '../../../../assets/comp-icons/wxlive.png';

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
  'image-text': iconImageText,
  swiper: iconSwiper,
  'my-card': iconMyCard,
  'grid-nav': iconGridNav,
  stats: iconStats,
  panorama: iconPanorama,
  cube: iconCube,
  'channel-profile': iconChannelProfile,
  'channel-video': iconChannelVideo,
  'channel-live': iconChannelLive,
};

// 宫格导航图标选择器选项（系统 SVG 图标库，SIcon 双端通用）
export const ICON_OPTIONS = [
  { value: 'card', label: '名片' },
  { value: 'radar', label: '访客' },
  { value: 'customer', label: '客户' },
  { value: 'market', label: '集市' },
  { value: 'exchange', label: '交换' },
  { value: 'pool', label: '公海' },
  { value: 'wallet', label: '钱包' },
  { value: 'crown', label: '会员' },
  { value: 'dynamic', label: '动态' },
  { value: 'team', label: '员工' },
  { value: 'building', label: '企业' },
  { value: 'panorama', label: '全景' },
  { value: 'template', label: '模板' },
  { value: 'analytics', label: '分析' },
  { value: 'audit', label: '审核' },
  { value: 'key', label: '口令' },
  { value: 'badge', label: '徽章' },
  { value: 'chart', label: '图表' },
  { value: 'notice', label: '公告' },
  { value: 'devices', label: '设备' },
];

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
    defaultProps: { url: '', poster: '', autoplay: false, loop: false },
    schema: [
      { key: 'url', label: '视频地址', control: 'input', section: 'content', required: true, placeholder: 'mp4 链接，可到素材中心上传视频' },
      { key: 'poster', label: '封面图', control: 'image', section: 'content' },
      { key: 'autoplay', label: '自动播放', control: 'switch', section: 'style' },
      { key: 'loop', label: '循环播放', control: 'switch', section: 'style' },
    ],
  },
  {
    type: 'image-text',
    name: '图文卡片',
    group: 'basic',
    icon: 'image-text',
    defaultProps: { url: '', title: '图文标题', desc: '描述文字', link: '', textPos: 'below' },
    schema: [
      { key: 'url', label: '图片', control: 'image', section: 'content', required: true },
      { key: 'title', label: '标题', control: 'input', section: 'content' },
      { key: 'desc', label: '描述', control: 'input', section: 'content' },
      { key: 'link', label: '跳转', control: 'link', section: 'content', placeholder: '如 /pages/card/market' },
      { key: 'textPos', label: '文字位置', control: 'radio', section: 'style', options: [{ label: '图下方', value: 'below' }, { label: '图上叠加', value: 'overlay' }] },
    ],
  },
  {
    type: 'swiper',
    name: '轮播图',
    group: 'basic',
    icon: 'swiper',
    defaultProps: { items: [{ url: '', link: '' }, { url: '', link: '' }], height: 150, interval: 4000 },
    schema: [
      {
        key: 'items', label: '轮播图片', control: 'list', section: 'content',
        itemFields: [
          { key: 'url', label: '图片', control: 'image' },
          { key: 'link', label: '跳转', control: 'link', placeholder: '如 /pages/card/market' },
        ],
      },
      { key: 'height', label: '高度', control: 'slider', section: 'style', min: 80, max: 320 },
      { key: 'interval', label: '轮播间隔(ms)', control: 'slider', section: 'style', min: 2000, max: 8000, step: 500 },
    ],
  },
  {
    type: 'my-card',
    name: '名片卡',
    group: 'function',
    icon: 'my-card',
    defaultProps: { name: '我的名片', sub: '点击查看我的名片', bgColor: '#F0F7FF' },
    schema: [
      { key: 'name', label: '标题', control: 'input', section: 'content', required: true },
      { key: 'sub', label: '副标题', control: 'input', section: 'content' },
      { key: 'bgColor', label: '背景色', control: 'color', section: 'style' },
    ],
  },
  {
    type: 'grid-nav',
    name: '宫格导航',
    group: 'function',
    icon: 'grid-nav',
    defaultProps: {
      columns: 4,
      items: [
        { icon: 'card', text: '我的名片', url: '/pages/card/myCard' },
        { icon: 'radar', text: '访客雷达', url: '/pages/card/visitors' },
        { icon: 'customer', text: '客户管理', url: '/pages/card/customers' },
        { icon: 'market', text: '人脉集市', url: '/pages/card/market' },
      ],
    },
    schema: [
      {
        key: 'items', label: '导航项', control: 'list', section: 'content',
        itemFields: [
          { key: 'icon', label: '图标', control: 'select', options: ICON_OPTIONS },
          { key: 'text', label: '文字', control: 'input' },
          { key: 'url', label: '跳转', control: 'link', placeholder: '如 /pages/card/myCard' },
        ],
      },
      { key: 'columns', label: '列数', control: 'radio', section: 'style', options: [{ label: '3列', value: 3 }, { label: '4列', value: 4 }, { label: '5列', value: 5 }] },
    ],
  },
  {
    type: 'stats',
    name: '数据统计',
    group: 'function',
    icon: 'stats',
    defaultProps: { showToday: true, showTotal: true, showExchange: true, color: '#165DFF' },
    schema: [
      { key: 'showToday', label: '今日访客', control: 'switch', section: 'content' },
      { key: 'showTotal', label: '累计访客', control: 'switch', section: 'content' },
      { key: 'showExchange', label: '名片交换', control: 'switch', section: 'content' },
      { key: 'color', label: '主题色', control: 'color', section: 'style' },
    ],
  },
  {
    type: 'panorama',
    name: '全景方案',
    group: 'function',
    icon: 'panorama',
    defaultProps: { title: '360 全景', desc: '沉浸式全景展示', link: '/?plan=1&scene=1' },
    schema: [
      { key: 'title', label: '标题', control: 'input', section: 'content', required: true },
      { key: 'desc', label: '描述', control: 'input', section: 'content' },
      { key: 'link', label: '跳转', control: 'link', section: 'content', placeholder: '如 /?plan=1&scene=1' },
    ],
  },
  {
    type: 'cube',
    name: '魔方',
    group: 'basic',
    icon: 'cube',
    defaultProps: { items: [{ url: '', link: '' }, { url: '', link: '' }, { url: '', link: '' }, { url: '', link: '' }, { url: '', link: '' }, { url: '', link: '' }], rows: 2, cols: 3, gap: 4, radius: 8 },
    schema: [
      {
        key: 'items', label: '格子图片', control: 'list', section: 'content',
        itemFields: [
          { key: 'url', label: '图片', control: 'image' },
          { key: 'link', label: '跳转', control: 'link', placeholder: '如 /pages/card/market' },
        ],
      },
      { key: 'rows', label: '行数', control: 'slider', section: 'style', min: 1, max: 3 },
      { key: 'cols', label: '列数', control: 'slider', section: 'style', min: 2, max: 4 },
      { key: 'gap', label: '间距', control: 'slider', section: 'style', min: 0, max: 8 },
      { key: 'radius', label: '圆角', control: 'slider', section: 'style', min: 0, max: 16 },
    ],
  },
  {
    type: 'channel-profile',
    name: '视频号主页',
    group: 'marketing',
    icon: 'channel-profile',
    badge: 'new',
    defaultProps: { finderUserName: '', nickname: '', avatar: '', desc: '', bgColor: '#F7F8FA' },
    schema: [
      { key: 'finderUserName', label: '视频号ID', control: 'input', section: 'content', required: true, placeholder: '如 sPh7vD5...' },
      { key: 'nickname', label: '昵称', control: 'input', section: 'content' },
      { key: 'avatar', label: '头像', control: 'image', section: 'content' },
      { key: 'desc', label: '简介', control: 'input', section: 'content' },
      { key: 'bgColor', label: '背景色', control: 'color', section: 'style' },
    ],
  },
  {
    type: 'channel-video',
    name: '视频号视频',
    group: 'marketing',
    icon: 'channel-video',
    badge: 'new',
    defaultProps: { finderUserName: '', feedId: '', cover: '', title: '', desc: '', bgColor: '#F7F8FA' },
    schema: [
      { key: 'finderUserName', label: '视频号ID', control: 'input', section: 'content', required: true, placeholder: '如 sPh7vD5...' },
      { key: 'feedId', label: '视频ID', control: 'input', section: 'content', required: true, placeholder: '如 106511204134634884' },
      { key: 'cover', label: '封面图', control: 'image', section: 'content' },
      { key: 'title', label: '标题', control: 'input', section: 'content' },
      { key: 'desc', label: '描述', control: 'input', section: 'content' },
      { key: 'bgColor', label: '背景色', control: 'color', section: 'style' },
    ],
  },
  {
    type: 'channel-live',
    name: '视频号直播',
    group: 'marketing',
    icon: 'channel-live',
    badge: 'new',
    defaultProps: { finderUserName: '', cover: '', title: '', statusText: '直播中', bgColor: '#F7F8FA' },
    schema: [
      { key: 'finderUserName', label: '视频号ID', control: 'input', section: 'content', required: true, placeholder: '如 sPh7vD5...' },
      { key: 'cover', label: '封面图', control: 'image', section: 'content' },
      { key: 'title', label: '标题', control: 'input', section: 'content' },
      { key: 'statusText', label: '状态文字', control: 'input', section: 'content' },
      { key: 'bgColor', label: '背景色', control: 'color', section: 'style' },
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
