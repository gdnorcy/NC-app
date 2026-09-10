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
import iconSearch from '../../../../assets/comp-icons/search.png';
import iconFloat from '../../../../assets/comp-icons/float.png';
import iconContact from '../../../../assets/comp-icons/contact.png';
import iconArticle from '../../../../assets/comp-icons/article.png';
import iconWeb from '../../../../assets/comp-icons/web.png';
import iconFollow from '../../../../assets/comp-icons/follow.png';

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
  'rich-text': iconText,
  'image-gallery': iconImage,
  'title-bar': iconTitle,
  search: iconSearch,
  tabs: iconButton,
  'form-pro': iconForm,
  contact: iconContact,
  'float-btn': iconFloat,
  'article-list': iconArticle,
  'web-container': iconWeb,
  spacer: iconDivider,
  'follow-official': iconFollow,
  'video-feed': iconVideo,
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
    defaultProps: {
      source: 'local',
      // 本地视频
      url: '', poster: '', ratio: '16:9', displayMode: 'direct', autoplayLocal: false, loopLocal: false,
      // 视频号视频（eweishop 复刻）：风格一列/两列、相同主体、视频号id/视频id、自动播放+静音+循环、多视频、背景色/背景图、间距/高度/上圆角/下圆角
      style: 'single', sameOwner: true, finderUserName: '', feedId: '',
      autoplay: 'auto', muted: false, loop: false,
      videos: [{ finderUserName: '', feedId: '' }],
      bgType: 'color', bgColor: '', bgImage: '',
      vSpacing: 0, spaceTop: 0, spaceBottom: 0, height: 0, radiusTop: false, radiusBottom: false,
    },
    schema: [
      { key: 'source', label: '视频来源', control: 'radio', section: 'content', options: [{ label: '本地视频', value: 'local' }, { label: '视频号视频', value: 'channels' }] },
      // ===== 本地视频 =====
      { key: 'url', label: '视频链接', control: 'input', section: 'content', required: true, placeholder: 'mp4 链接，可到素材中心上传视频', when: { source: 'local' } },
      { key: 'poster', label: '视频封面', control: 'image', section: 'content', when: { source: 'local' } },
      { key: 'ratio', label: '视频样式', control: 'radio', section: 'style', options: [{ label: '16:9', value: '16:9' }, { label: '4:3', value: '4:3' }, { label: '1:1', value: '1:1' }, { label: '9:16', value: '9:16' }], when: { source: 'local' } },
      { key: 'displayMode', label: '视频显示', control: 'radio', section: 'style', options: [{ label: '直接显示', value: 'direct' }, { label: '弹出显示', value: 'popup' }], when: { source: 'local' } },
      { key: 'autoplayLocal', label: '自动播放', control: 'switch', section: 'style', when: { source: 'local' } },
      { key: 'loopLocal', label: '循环播放', control: 'switch', section: 'style', when: { source: 'local' } },
      // ===== 视频号视频（eweishop 复刻） =====
      { key: 'hint', label: '该组件只支持微信小程序', control: 'hint', section: 'content', when: { source: 'channels' } },
      { key: 'style', label: '选择风格', control: 'radio', graphic: true, section: 'content', options: [{ label: '一列', value: 'single' }, { label: '两列并排', value: 'double' }], when: { source: 'channels' } },
      { key: 'sameOwner', label: '相同主体', control: 'radio', section: 'content', options: [{ label: '是', value: true }, { label: '否', value: false }], when: { source: 'channels' } },
      { key: 'finderUserName', label: '视频号id', control: 'input', section: 'content', placeholder: '微信视频号ID', when: { source: 'channels' } },
      { key: 'feedId', label: '视频id', control: 'input', section: 'content', placeholder: '视频ID，可留空用上方列表', when: { source: 'channels' } },
      { key: 'videos', label: '视频列表', control: 'list', section: 'content', when: { source: 'channels' }, itemFields: [
        { key: 'finderUserName', label: '视频号id', control: 'input' },
        { key: 'feedId', label: '视频id', control: 'input' },
      ] },
      { key: 'autoplay', label: '自动播放', control: 'radio', section: 'style', options: [{ label: '自动', value: 'auto' }, { label: '不自动', value: 'no' }], when: { source: 'channels' } },
      { key: 'muted', label: '静音', control: 'switch', section: 'style', when: { source: 'channels' } },
      { key: 'loop', label: '循环', control: 'switch', section: 'style', when: { source: 'channels' } },
      { key: 'bgType', label: '背景', control: 'radio', section: 'style', options: [{ label: '背景色', value: 'color' }, { label: '背景图片', value: 'image' }], when: { source: 'channels' } },
      { key: 'bgColor', label: '背景色', control: 'color', section: 'style', when: { source: 'channels', bgType: 'color' } },
      { key: 'bgImage', label: '背景图片', control: 'image', section: 'style', when: { source: 'channels', bgType: 'image' } },
      { key: 'vSpacing', label: '视频间距', control: 'slider', section: 'style', min: 0, max: 40, when: { source: 'channels' } },
      { key: 'spaceTop', label: '上边距', control: 'slider', section: 'style', min: 0, max: 40, when: { source: 'channels' } },
      { key: 'spaceBottom', label: '下边距', control: 'slider', section: 'style', min: 0, max: 40, when: { source: 'channels' } },
      { key: 'height', label: '视频高度', control: 'slider', section: 'style', min: 0, max: 600, when: { source: 'channels' } },
      { key: 'radiusTop', label: '上圆角', control: 'switch', section: 'style', when: { source: 'channels' } },
      { key: 'radiusBottom', label: '下圆角', control: 'switch', section: 'style', when: { source: 'channels' } },
    ],
  },
  {
    type: 'live-list',
    name: '直播列表',
    group: 'marketing',
    icon: 'video',
    badge: 'new',
    defaultProps: { listStyle: '1', contentType: 'all', sort: 'latest', limit: 6, pullLoad: false },
    schema: [
      { key: 'listStyle', label: '列表样式', control: 'radio', section: 'style', options: [{ label: '样式一', value: '1' }, { label: '样式二', value: '2' }, { label: '样式三', value: '3' }] },
      { key: 'contentType', label: '内容类型', control: 'radio', section: 'content', options: [{ label: '所有', value: 'all' }, { label: '推荐', value: 'recommend' }] },
      { key: 'sort', label: '排序', control: 'radio', section: 'content', options: [{ label: '最新', value: 'latest' }, { label: '人气', value: 'hot' }, { label: '后台序号', value: 'seq' }] },
      { key: 'limit', label: '显示数量', control: 'slider', section: 'content', min: 1, max: 20 },
      { key: 'pullLoad', label: '下拉加载', control: 'switch', section: 'style' },
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
  {
    type: 'rich-text',
    name: '富文本',
    group: 'basic',
    icon: 'rich-text',
    defaultProps: { html: '<p style="font-size:14px;color:#1d2129;line-height:1.7;">这里是富文本内容，支持图文混排。</p>' },
    schema: [
      { key: 'html', label: '内容', control: 'textarea', section: 'content', rows: 6, placeholder: '支持 HTML 富文本（文字/图片/列表等）' },
    ],
  },
  {
    type: 'image-gallery',
    name: '组图橱窗',
    group: 'basic',
    icon: 'image-gallery',
    defaultProps: { items: [{ url: '', link: '' }, { url: '', link: '' }, { url: '', link: '' }, { url: '', link: '' }], columns: 2, radius: 8 },
    schema: [
      {
        key: 'items', label: '组图', control: 'list', section: 'content',
        itemFields: [
          { key: 'url', label: '图片', control: 'image' },
          { key: 'link', label: '跳转', control: 'link', placeholder: '如 /pages/card/market' },
        ],
      },
      { key: 'columns', label: '列数', control: 'radio', section: 'style', options: [{ label: '2列', value: 2 }, { label: '3列', value: 3 }, { label: '4列', value: 4 }] },
      { key: 'radius', label: '圆角', control: 'slider', section: 'style', min: 0, max: 16 },
    ],
  },
  {
    type: 'title-bar',
    name: '标题栏',
    group: 'basic',
    icon: 'title-bar',
    defaultProps: { title: '标题文字', sub: '副标题', moreText: '更多', moreUrl: '', color: '#1d2129' },
    schema: [
      { key: 'title', label: '标题', control: 'input', section: 'content', required: true },
      { key: 'sub', label: '副标题', control: 'input', section: 'content' },
      { key: 'moreText', label: '更多文字', control: 'input', section: 'content' },
      { key: 'moreUrl', label: '更多跳转', control: 'link', section: 'content', placeholder: '如 /pages/card/market' },
      { key: 'color', label: '文字色', control: 'color', section: 'style' },
    ],
  },
  {
    type: 'search',
    name: '搜索框',
    group: 'basic',
    icon: 'search',
    defaultProps: { placeholder: '搜索名片 / 内容', radius: 16, bgColor: '#F2F3F5', link: '' },
    schema: [
      { key: 'placeholder', label: '占位文字', control: 'input', section: 'content' },
      { key: 'link', label: '搜索跳转', control: 'link', section: 'content', placeholder: '如 /pages/card/market' },
      { key: 'radius', label: '圆角', control: 'slider', section: 'style', min: 0, max: 24 },
      { key: 'bgColor', label: '背景色', control: 'color', section: 'style' },
    ],
  },
  {
    type: 'tabs',
    name: '选项卡',
    group: 'basic',
    icon: 'tabs',
    defaultProps: { items: [{ text: '选项一', link: '' }, { text: '选项二', link: '' }, { text: '选项三', link: '' }], color: '#165DFF' },
    schema: [
      {
        key: 'items', label: '选项卡', control: 'list', section: 'content',
        itemFields: [
          { key: 'text', label: '文字', control: 'input' },
          { key: 'link', label: '跳转', control: 'link', placeholder: '如 /pages/card/market' },
        ],
      },
      { key: 'color', label: '主题色', control: 'color', section: 'style' },
    ],
  },
  {
    type: 'form-pro',
    name: '万能表单',
    group: 'marketing',
    icon: 'form-pro',
    badge: 'new',
    defaultProps: {
      title: '留资表单',
      fields: [
        { label: '姓名', type: 'input', placeholder: '请输入姓名', required: true },
        { label: '手机号', type: 'phone', placeholder: '请输入手机号', required: true },
      ],
      submitText: '提交', btnColor: '#165DFF',
    },
    schema: [
      { key: 'title', label: '表单标题', control: 'input', section: 'content', required: true },
      {
        key: 'fields', label: '表单项', control: 'list', section: 'content',
        itemFields: [
          { key: 'label', label: '字段名', control: 'input' },
          { key: 'type', label: '类型', control: 'select', options: [{ value: 'input', label: '文本' }, { value: 'phone', label: '手机号' }, { value: 'number', label: '数字' }, { value: 'date', label: '日期' }, { value: 'radio', label: '单选' }, { value: 'select', label: '下拉' }, { value: 'multi', label: '多选' }] },
          { key: 'placeholder', label: '占位文字', control: 'input' },
          { key: 'options', label: '选项(逗号分隔)', control: 'input', placeholder: '单选/下拉/多选时填写，如 男,女' },
          { key: 'required', label: '必填', control: 'switch' },
        ],
      },
      { key: 'submitText', label: '按钮文字', control: 'input', section: 'content' },
      { key: 'btnColor', label: '按钮色', control: 'color', section: 'style' },
    ],
  },
  {
    type: 'contact',
    name: '客服联系',
    group: 'function',
    icon: 'contact',
    defaultProps: { title: '联系我们', phone: '', qr: '', address: '', btnText: '拨打电话' },
    schema: [
      { key: 'title', label: '标题', control: 'input', section: 'content', required: true },
      { key: 'phone', label: '电话', control: 'input', section: 'content', placeholder: '手机号或座机' },
      { key: 'qr', label: '微信二维码', control: 'image', section: 'content' },
      { key: 'address', label: '地址', control: 'input', section: 'content' },
      { key: 'btnText', label: '按钮文字', control: 'input', section: 'content' },
    ],
  },
  {
    type: 'float-btn',
    name: '悬浮按钮',
    group: 'function',
    icon: 'float-btn',
    defaultProps: { text: '联系我们', link: '', color: '#165DFF', position: 'right' },
    schema: [
      { key: 'text', label: '按钮文字', control: 'input', section: 'content' },
      { key: 'link', label: '跳转', control: 'link', section: 'content', placeholder: '如 /pages/card/market 或 tel:13800138000' },
      { key: 'color', label: '背景色', control: 'color', section: 'style' },
      { key: 'position', label: '位置', control: 'radio', section: 'style', options: [{ label: '右下', value: 'right' }, { label: '左下', value: 'left' }] },
    ],
  },
  {
    type: 'article-list',
    name: '文章列表',
    group: 'marketing',
    icon: 'article-list',
    defaultProps: {
      title: '最新资讯',
      items: [
        { title: '文章标题一', desc: '这里是文章摘要内容，可点击查看详情…', date: '2026-09-09', image: '', link: '' },
        { title: '文章标题二', desc: '这里是文章摘要内容，可点击查看详情…', date: '2026-09-08', image: '', link: '' },
      ],
      showDate: true,
      columns: 1,
    },
    schema: [
      { key: 'title', label: '板块标题', control: 'input', section: 'content' },
      { key: 'items', label: '文章列表', control: 'list', section: 'content', itemTitleKey: 'title', itemFields: [
        { key: 'title', label: '标题', control: 'input' },
        { key: 'desc', label: '摘要', control: 'input' },
        { key: 'date', label: '日期', control: 'input', placeholder: '如 2026-09-09' },
        { key: 'image', label: '封面图', control: 'image' },
        { key: 'link', label: '跳转链接', control: 'link' },
      ] },
      { key: 'showDate', label: '显示日期', control: 'switch', section: 'content' },
      { key: 'columns', label: '每行几个', control: 'radio', section: 'content', options: [{ label: '单列', value: 1 }, { label: '双列', value: 2 }] },
    ],
  },
  {
    type: 'web-container',
    name: '网页容器',
    group: 'function',
    icon: 'web-container',
    defaultProps: { url: '', height: 400 },
    schema: [
      { key: 'url', label: '网页地址', control: 'input', section: 'content', placeholder: 'https://…' },
      { key: 'height', label: '容器高度(px)', control: 'slider', section: 'content', min: 100, max: 1200 },
    ],
  },
  {
    type: 'spacer',
    name: '辅助间距',
    group: 'basic',
    icon: 'spacer',
    defaultProps: { height: 20, style: 'solid', color: '#E5E6EB', margin: 16 },
    schema: [
      { key: 'height', label: '线高(px)', control: 'slider', section: 'content', min: 1, max: 24 },
      { key: 'style', label: '线型', control: 'radio', section: 'content', options: [{ label: '实线', value: 'solid' }, { label: '虚线', value: 'dashed' }, { label: '无线', value: 'none' }] },
      { key: 'color', label: '颜色', control: 'color', section: 'style' },
      { key: 'margin', label: '上下间距(px)', control: 'slider', section: 'style', min: 0, max: 48 },
    ],
  },
  {
    type: 'follow-official',
    name: '关注公众号',
    group: 'function',
    icon: 'follow-official',
    defaultProps: { title: '关注公众号', desc: '获取更多行业资讯与会员服务', qr: '', btnText: '长按识别关注' },
    schema: [
      { key: 'title', label: '标题', control: 'input', section: 'content' },
      { key: 'desc', label: '说明文字', control: 'input', section: 'content' },
      { key: 'qr', label: '二维码图', control: 'image', section: 'content' },
      { key: 'btnText', label: '提示文字', control: 'input', section: 'content' },
    ],
  },
  {
    type: 'video-feed',
    name: '短视频瀑布流',
    group: 'marketing',
    icon: 'video-feed',
    defaultProps: {
      title: '精彩视频',
      items: [
        { title: '视频标题一', cover: '', video: '', link: '' },
        { title: '视频标题二', cover: '', video: '', link: '' },
        { title: '视频标题三', cover: '', video: '', link: '' },
        { title: '视频标题四', cover: '', video: '', link: '' },
      ],
      columns: 2,
    },
    schema: [
      { key: 'title', label: '板块标题', control: 'input', section: 'content' },
      { key: 'items', label: '视频列表', control: 'list', section: 'content', itemTitleKey: 'title', itemFields: [
        { key: 'title', label: '标题', control: 'input' },
        { key: 'cover', label: '封面图', control: 'image' },
        { key: 'video', label: '视频地址', control: 'input', placeholder: 'mp4 链接' },
        { key: 'link', label: '跳转链接', control: 'link' },
      ] },
      { key: 'columns', label: '每行几个', control: 'radio', section: 'content', options: [{ label: '双列', value: 2 }, { label: '三列', value: 3 }] },
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
