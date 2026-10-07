/**
 * 容器内「子组件宽度」计算（C端 `DesignPage.vue` / `home.vue` 与 admin
 * `ComponentRender.vue` 共用）
 *
 * 🔴 为什么要这个模块（2026-10-07 用户反馈，三轮迭代）：
 *   1「组件『按钮』容器的左右边框调整，会调整按钮的大小，要区分按钮的大小调节和窗口的大小调节。」
 *   2「容器左右边距调了会同步调小搜索框，没有单独调搜索框大小的了。」
 *   —— 「按钮」和「名片搜索栏」是**同一个病**：子组件用 `width:100%` 或 `flex:1`
 *   撑满容器 → 容器左右边距一变，子组件跟着变 → **两个控件缠死在一个参数上**。
 *
 * ── 解法（两端统一）─────────────────────────────────────────
 * 子组件宽度改用**百分比 + auto 边距**：
 *   - 百分比参照「容器内容宽」，容器左右 marginLR 对称 → 容器中心 == 页面中心
 *     → auto 边距即正确居中；
 *   - 「容器左右边距」只缩放容器，子组件宽度只由 `widthPercent` 决定 → **彻底解耦**。
 *
 * ⚠️ 三个必须显式声明的点（都是实测踩出来的）：
 *   ① **必须显式 `display:block`**。组件自带 CSS 类是 `inline-block`
 *      （`.r-btn`）或 flex 子项（`.search-box{flex:1}`），
 *      而 **inline-block/inline-flex 的 `margin-left/right:auto` 会被当成 0**
 *      → 设了百分比就贴左边（实测偏移 -179px）。
 *      且 flex 子项设了 `width` 也可能被 `flex:1` 压过 → 必须同时覆盖 `flex`。
 *   ② **auto 模式必须配 `width:fit-content`**：`block` + `width:auto` 会撑满容器。
 *   ③ **`flex-basis` 与 `width` 会互相覆盖**（flex 布局里 flex-basis 优先），
 *      只设 width 而留着 `flex:1` 是无效的 —— 必须显式给 `flex:none`。
 *
 * ⚠️ 三端必须共用本函数，否则「设计器预览」与「真机」会再次不一致
 *   （这个项目已因各处私藏一份副本踩过多次）。
 */

/** 宽度模式：full=按百分比占容器宽（默认，视觉同存量）、auto=内容宽 */
export const WIDTH_MODES = { full: '整行', auto: '自适应' };

/**
 * 生成容器内子组件的宽度 style。
 * @param {object} p 组件 props（读 widthMode / widthPercent）
 * @param {object} [opts]
 * @param {boolean} [opts.flexChild=false] 子项是否处于 flex 容器中
 *        （搜索框是：需额外覆盖 `flex` 才能让 width 生效）
 * @returns {object} 可直接内联的 style
 */
export function containerChildSizeStyle(p, opts = {}) {
  const props = p || {};
  const s = {};

  // 自适应：内容宽 + 左右内边距 + 居中
  if (props.widthMode === 'auto') {
    s.display = 'block';
    s.width = 'fit-content';
    s.marginLeft = 'auto';
    s.marginRight = 'auto';
    s.textAlign = 'center';
    if (opts.flexChild) {
      // 🔴 flex 子项必须显式 `flex:none`，否则 CSS 里的 `flex:1` 会把 width 压掉
      s.flex = 'none';
      s.maxWidth = '100%';
    }
    return s;
  }

  // 整行：百分比宽度 + auto 边距居中（与容器左右边距解耦）
  const pct = clampPercent(props.widthPercent);
  s.display = 'block';
  s.width = `${pct}%`;
  s.marginLeft = 'auto';
  s.marginRight = 'auto';
  s.boxSizing = 'border-box';
  s.textAlign = 'center';
  if (opts.flexChild) {
    // 🔴 同上：必须覆盖 flex:1，否则「调宽度百分比没反应」
    s.flex = 'none';
    s.maxWidth = '100%';
  }
  return s;
}

/**
 * 按钮宽度（C端 `DesignPage.vue` / admin `ComponentRender.vue` 共用）
 *
 * 🔴 病史（详见本文件顶部）：第一轮曾用「负margin 抵消容器 marginLR」，
 *   实测失败—— 容器有 MIN_BG_PADDING 内边距时，按钮会盖住容器底色并溢出、还偏左。
 *   ⚠️ 勿复活：`marginLeft:-LR` + `width:calc(100% + 2*LR)`。
 *
 * @param {object} p 组件 props
 * @returns {object}
 */
export function buttonSizeStyle(p) {
  const s = containerChildSizeStyle(p, { flexChild: false });
  // 按钮 auto 模式要左右内边距（内容紧贴文字不好看），搜索框自身有 padding 不需要
  if ((p || {}).widthMode === 'auto') s.padding = '0 12px';
  return s;
}

/**
 * 名片搜索栏内的搜索框宽度。
 *
 * 🔴 病根（2026-10-07 用户反馈「容器左右边距调了会同步调小搜索框」）：
 *   `.search-box{flex:1}` 自动撑满容器 → 容器边距一变它就跟着变，无法单独控制。
 *   解法与按钮同源：改用百分比宽度 + auto 边距，且**必须覆盖 `flex`**，
 *   否则 `flex:1` 会把 width 压掉、表现为「宽度百分比滑块完全没反应」。
 *
 * 🔴 边距策略与按钮不同（2026-10-07 用户反馈「铃铛一直居左，感觉是多余的」）：
 *   搜索框**右边有铃铛**。若沿用按钮的两侧 `margin:0 auto`，剩余空间被平分 →
 *   铃铛被推到中间（截图里就是这样）。所以这里只给 **margin-right:auto**，
 *   把全部剩余空间让给铃铛 → **铃铛永远贴右**、搜索框靠左。
 *   ⚠️ 这是「同一模块、两套边距」，改前先确认调用方是按钮还是搜索框。
 *
 * @param {object} p 组件 props
 * @returns {object}
 */
export function searchBoxSizeStyle(p) {
  const s = containerChildSizeStyle(p, { flexChild: true });
  // 🔴 覆盖通用实现的两侧 auto → 改成只有右侧 auto，把剩余空间全让给铃铛（贴右）
  s.marginLeft = '0';
  s.marginRight = 'auto';
  return s;
}

/** 百分比夹取到 20~100；未设/非法一律 100（保持存量「整行」视觉不变） */
function clampPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(100, Math.max(20, Math.round(n)));
}