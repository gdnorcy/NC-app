/**
 * 装修组件**容器层**样式（C 端 `DesignPage.vue` 与 admin 设计器画布 `PageEditor.vue` 共用）。
 *
 * 🔴 为什么要抽成共享模块（2026-10-05）：
 * 此前只有 C 端有 `containerStyle()`，admin 画布的 `.pe-comp` 完全不绑背景/圆角
 * → **同一个组件在画布里看不到容器底色、在真机却有一层底色**，
 * 用户表现为「背景色改不动 / 分不清改的是哪一层」。
 * 两端共用同一份实现，从根上消除漂移
 *（跨包 import 模式沿用既有的 `sfComponentStyle.js`：admin 用
 *   `import { xxx } from '../../../../../../web-app/src/utils/xxx.js'`）。
 *
 * 容器负责：padding / 圆角 / 背景色 / 外边距。
 * 「自身根节点就是色块」的组件（按钮、公告、图片…）背景色与圆角交给自身收敛，
 * 容器不再二次上色 —— 否则同一个 `bgColor` 被上两次色，
 * 改「背景色」时两层一起变，**无法单独设置组件自身的底色**。
 */

/** 有「左右边距」参数、属性面板不注入「内边距」滑块的组件：忽略容器 p.padding */
export const HIDDEN_PADDING_TYPES = ['image', 'countdown', 'countdown2', 'image-text', 'cube', 'title-bar'];

/**
 * 容器「不上背景色 / 不套圆角」的组件类型。
 *
 * 判据：**该类型根节点自身消费 p.bgColor**。
 * 子元素里的彩色按钮（goods-* 的 `buyBtnBg`、channel-* 的 `btnBg`、表单的 `btnColor`）**不算**。
 * 新增这类组件时必须同步本表，否则又会出现「背景色改不动 / 外层多一圈同色边框」。
 */
export const HIDDEN_BG_TYPES = [
  // 根节点自身是「色块」的组件
  'button',            // .dp-btn← dpBtnStyle
  'notice',            // .dp-notice ← dpNoticeStyle
  'image',             // .dp-image ← dpImageBoxStyle
  'image-text',        // .dp-imagetext ← dpImageTextStyle
  'cube',              // .dp-cube
  'countdown', 'countdown2', // cdBoxStyle / cd2BoxStyle
  'title-bar',         // dpTbOuterStyle / dpTbWrapStyle
  'search',            // dpSearchStyle
  'swiper',            // dpSwiperBoxStyle
  'grid',              // dpGridStyle（grid-nav 网格容器）
  'tabs',              // dpTabsStyle
  'form', 'form-pro',  // dpFormStyle / .dp-form
  'channel-live',      // dpChannelLiveStyle
  'fab-cart', 'float-btn', // dpFabCartStyle / 悬浮容器自身有色
  'goods-list',        // dpGoodsListStyle
  'goods-show', 'goods-featured', // dpShowStyle
  'my-card',           // .dp-mycard
  'channel-profile', 'channel-video', // .dp-channel / .dp-chvideo
  'article-list', 'pic-list', 'video-list', // .dp-article
  'live-list',         // .dp-livelist
  'spacer',            // .dp-spacer
  'goods-tabs',        // .ew-tabs（tabBg）
];

/** 容器是否自己上背景色 */
export function containerTakesBg(type) {
  return !HIDDEN_BG_TYPES.includes(type);
}

/**
 * 生成组件容器样式。
 * @param {object} comp 装修组件对象（读type + props）
 * @param {object} [opts]
 * @param {number} [opts.cardGap=12]    未设 marginBottom 时的默认下边距
 * @param {number} [opts.cardRadius=8]   未设 radius 时的默认圆角
 * @param {boolean} [opts.withPadding=true] 是否输出 padding（HIDDEN_PADDING_TYPES 自动忽略）
 * @param {boolean} [opts.withMargin=true]  是否输出外边距（title-bar 特例交给自身）
 */
export function containerStyle(comp, opts = {}) {
  const { cardGap = 12, cardRadius = 8, withPadding = true, withMargin = true } = opts;
  const type = (comp && comp.type) || '';
  const p = (comp && comp.props) || {};
  const s = {};
  if (withPadding && p.padding !== undefined && p.padding !== '' && !HIDDEN_PADDING_TYPES.includes(type)) {
    s.padding = `${p.padding}px`;
  }
  if (containerTakesBg(type)) {
    const r = p.radius ?? cardRadius;
    if (r !== '') s.borderRadius = `${r}px`;
    if (p.bgColor) s.background = p.bgColor;
  }
  if (withMargin && type !== 'title-bar') {
    s.marginTop = `${p.marginTop ?? 0}px`;
    s.marginBottom = `${p.marginBottom ?? cardGap}px`;
    s.marginLeft = `${p.marginLR ?? p.marginLeft ?? 0}px`;
    s.marginRight = `${p.marginLR ?? p.marginRight ?? 0}px`;
  }
  return s;
}