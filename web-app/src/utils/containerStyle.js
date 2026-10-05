/**
 * 装修组件**容器层**样式（C 端 `DesignPage.vue` 与 admin 设计器 `PageEditor.vue` /
 * `ComponentRender.vue` 共用）。
 *
 * 🔴 字段语义（2026-10-05 用户定规，勿回退）：
 * 容器底色读 **`compBgColor`**，不是 `bgColor`。
 *
 * 此前容器与组件自身共用 `bgColor`，导致「改一个字段两层一起变」，
 * 用户无法单独设置组件底色。更糟的是面板按 key 去重后**只露出一个**「背景色」，
 * 而它在 button 上指向按钮自身、在 superform 上指向容器 —— 语义随组件漂移。
 * 现在拆成两个独立字段：
 *   - `bgColor`     = 组件**自身**底色（button 的 label 叫「按钮色」）
 *   - `compBgColor` = 组件**容器**底色（commonStyleSchema 的「组件背景色」）
 *
 *🔴 上一轮曾用 `HIDDEN_BG_TYPES` 黑名单「让容器不上色」来绕开同名字段，
 *   该方案已废弃：它是逐类型手工维护的易腐清单（28 项），
 *   实际已漏判 goods-list / goods-featured / goods-tabs，还会误伤 goods-show，
 *   且导致 9/13 单测断言依赖黑名单。**不要复活黑名单。**
 *
 * 跨包import 模式沿用既有的 `sfComponentStyle.js`（admin 侧用
 * `import { xxx } from '../../../../../../web-app/src/utils/xxx.js'`）。
 */

/** 有「左右边距」参数、属性面板不注入「内边距」滑块的组件：忽略容器 p.padding */
export const HIDDEN_PADDING_TYPES = ['image', 'countdown', 'countdown2', 'image-text', 'cube', 'title-bar'];

/** 容器底色的字段名（唯一事实来源，测试与迁移脚本都从这里取） */
export const CONTAINER_BG_KEY = 'compBgColor';

/**
 * 生成组件容器样式。
 * @param {object} comp 装修组件对象（读 type + props）
 * @param {object} [opts]
 * @param {number} [opts.cardGap=12]     未设 marginBottom 时的默认下边距
 * @param {number} [opts.cardRadius=8]    未设 radius 时的默认圆角
 * @param {boolean} [opts.withPadding=true] 是否输出 padding（HIDDEN_PADDING_TYPES 自动忽略）
 * @param {boolean} [opts.withMargin=true]  是否输出外边距（title-bar 特例交给自身）
 * @param {boolean} [opts.withBg=true]      是否输出容器底色
 * @param {boolean} [opts.withRadius=true]   是否输出容器圆角
 */
export function containerStyle(comp, opts = {}) {
  const {
    cardGap = 12,
    cardRadius = 8,
    withPadding = true,
    withMargin = true,
    withBg = true,
    withRadius = true,
  } = opts;
  const type = (comp && comp.type) || '';
  const p = (comp && comp.props) || {};
  const s = {};

  if (withPadding && p.padding !== undefined && p.padding !== '' && !HIDDEN_PADDING_TYPES.includes(type)) {
    s.padding = `${p.padding}px`;
  }
  if (withRadius) {
    const r = p.radius ?? cardRadius;
    if (r !== '') s.borderRadius = `${r}px`;
  }
  // 容器底色：读 compBgColor（独立字段），**不再读 bgColor**。
  // 未设/空串 → 不输出 background（透明），让页面底色或卡片缝透出。
  if (withBg && p[CONTAINER_BG_KEY]) s.background = p[CONTAINER_BG_KEY];

  if (withMargin && type !== 'title-bar') {
    s.marginTop = `${p.marginTop ?? 0}px`;
    s.marginBottom = `${p.marginBottom ?? cardGap}px`;
    s.marginLeft = `${p.marginLR ?? p.marginLeft ?? 0}px`;
    s.marginRight = `${p.marginLR ?? p.marginRight ?? 0}px`;
  }
  return s;
}

/**
 * 存量数据迁移：容器型组件的旧 `bgColor` → `compBgColor`（2026-10-05）。
 *
 * 背景：拆分前，**没有自带 `bgColor` 的组件**（superform / goods-group / goods-all /
 * goods-swiper / goods-rank / goods-like 等容器型）其「背景色」是靠
 * commonStyleSchema 的通用项打到**容器**上的，即它们的 `bgColor` 语义就是「容器底色」。
 * 拆分后 `bgColor` 归为「组件自身底色」，而这些组件的根节点**根本不读 bgColor**
 *（根节点只绑 CSS 变量/其它字段）→ 不迁移的话，运营之前设的容器底色会**直接消失**。
 *
 * 判据：**根节点自身不消费 bgColor 的组件**才需要迁移（它们旧值本就只作用于容器）。
 * 自身消费 bgColor 的组件（button/notice/image/...）旧值是自身色，**不动**。
 *
 * ⚠️ `SELF_COLORED_TYPES` 必须与各组件根节点实际绑定的字段一致。
 *   加入前先确认该类型根节点真的不读 props.bgColor，否则会把自身色搬去容器（错）。
 */
export const SELF_COLORED_TYPES = [
  'button', 'notice', 'image', 'image-text', 'cube', 'countdown', 'countdown2',
  'title-bar', 'search', 'swiper', 'grid', 'tabs', 'form', 'form-pro',
  'channel-live', 'fab-cart', 'float-btn', 'my-card', 'channel-profile',
  'channel-video', 'article-list', 'pic-list', 'video-list', 'live-list',
  'spacer', 'goods-show',
];

/** 该组件的根节点是否自身消费 props.bgColor */
export function selfColored(type) {
  return SELF_COLORED_TYPES.includes(type);
}

/**
 * 就地迁移单个组件的 props。**只在「旧 bgColor 有值且新字段未设」时才搬**，
 * 保证幂等：已迁过的新数据不会被二次搬运，也不会覆盖运营新设的值。
 * @returns {boolean} 是否发生了迁移
 */
export function migrateLegacyBgColor(comp) {
  if (!comp || !comp.props) return false;
  const p = comp.props;
  if (selfColored(comp.type)) return false;
  if (p[CONTAINER_BG_KEY]) return false;
  if (!p.bgColor) return false;
  p[CONTAINER_BG_KEY] = p.bgColor;
  return true;
}
