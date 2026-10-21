/**
 * 容器内「子组件宽度」计算（C端 `home.vue` / `DesignPage.vue` 与 admin
 * `ComponentRender.vue` 共用）
 *
 * 🔴 为什么要这个模块（2026-10-07 用户反馈，四轮迭代）：
 *   1「组件『按钮』容器的左右边框调整，会调整按钮的大小，要区分按钮的大小调节和窗口的大小调节。」
 *   2「容器左右边距调了会同步调小搜索框，没有单独调搜索框大小的了。」
 *   3「容器左右边距还是会影响搜索框的大小，还是之前的坑。」
 *   —— 前两轮都用**百分比**解耦，实测证明**从根上就是错的**（见下方「实测」）。
 *
 * ── 实测：为什么百分比方案必然失败 ──────────────────────────
 *   写独立 HTML 复刻真实结构（375px 容器 + `display:flex` 容器 + 60% 宽搜索框），
 *   改容器的 margin-left/right，用 `getBoundingClientRect()` 量搜索框：
 *     marginLR=0  → 宽 225px，左 0
 *     marginLR=20 → 宽 201px，左 20      ← 宽度掉了 24px
 *     marginLR=40 → 宽 177px，左 40      ← 又掉了 24px
 *   🔴 **百分比永远参照「容器内容宽」** → 容器一变窄，子组件就跟着变窄。
 *   无论怎么调 margin / auto 边距都改变不了这一点 —— 只要用百分比，两个控件必然缠死。
 *   这也是用户第 2、3 轮反馈「还是之前的坑」的原因：不是漏了某个声明，是方案选错了。
 *
 * ── ✅ 正解：宽度用**视口单位**，彻底脱离容器 ──────────────
 *   宽度 = 视口宽 × 百分比（C 端 `vw`、admin 侧换算成 px）
 *   → 与容器左右边距**完全无关**。「容器左右边距」只缩放容器本身（这才是它该管的事）。
 *
 * ⚠️ 三个必须显式声明的点（都是实测踩出来的）：
 *   ① **必须显式 `display:block`**。组件自带 CSS 类是 `inline-block`
 *      （`.r-btn`）或 flex 子项（`.search-box{flex:1}`），
 *      而 **inline-block/inline-flex 的 `margin-left/right:auto` 会被当成 0**
 *      → 设了宽度就贴左边。且 flex 子项只设 `width` 会被 `flex:1` 压过，
 *      必须同时覆盖 `flex`。
 *   ② **auto 模式必须配 `width:fit-content`**：`block` + `width:auto` 会撑满容器。
 *   ③ **flex 布局里 `flex-basis` 优先于 `width`**，只设 width 而留着 `flex:1`
 *      是无效的 —— 必须显式给 `flex:none`。
 *
 * ⚠️ 三端必须共用本函数，否则「设计器预览」与「真机」会再次不一致
 *   （这个项目已因各处私藏一份副本踩过多次）。
 *
 * 🔴 视口基准：C 端是 750rpx 设计稿（`vw` 直接可用）；admin 画布手机壳固定 375px
 *   → admin 侧用 `px = 375 × pct / 100`（见 `DESIGN_VIEWPORT_PX` / `opts.unit`）。
 *
 * ── 附加参数：`boxOffsetX`（组件自身左边偏移）────────────────────
 *   用户反馈「宽度百分比调小时左边位置固定，没法跟别的组件左边对齐」。
 *   病根：宽度用视口单位后，组件左边 = 容器左边（受容器 marginLR 影响），
 *   而别的组件（宫格/卡片）有自己的 marginLR → 两边对不齐，且没法单独微调。
 *   ✅ 正解：加 `boxOffsetX`（px 语义，C 端转 rpx），在容器左边基础上再平移。
 *     与 `widthPercent` 一样用视口语义，因此**互不影响**。
 *   ⚠️ boxOffsetX 用 `margin-left` 表达（不是 left+relative，避免脱离文档流）。
 */

import { normalizeAlign, offsetShiftStyle } from './boxAlignOffset.js';

/** 宽度模式：full=按视口百分比定宽（默认，视觉同存量）、auto=内容宽 */
export const WIDTH_MODES = { full: '整行', auto: '自适应' };

/** admin 画布手机壳宽度（`.pe-phone{max-width:375px}`），与 C 端 750rpx 同一设计稿 */
export const DESIGN_VIEWPORT_PX = 375;

/**
 * 生成容器内子组件的宽度 style。
 *
 * 🔴 宽度单位的选择（本轮最重要的修正）：
 *   - `widthMode === 'auto'` → `fit-content`（内容宽）
 *   - `full` → **视口单位**（C 端 `vw`、admin 换算 px）
 *     ❌ 不用百分比：百分比参照容器内容宽，容器边距一变宽度就变（实测 20px 边距 → 少 24px 宽）。
 *
 * 🔴 `align`（横向对齐，2026-10-21 反馈 #321）决定 auto 边距给哪边：
 *   - `left`：左贴容器左边（marginLeft=0，右侧留白）
 *   - `center`：两侧平分（marginLeft/Right=auto）
 *   - `right`：右贴容器右边（marginRight=0，左侧留白）
 *
 * 🔴🔴 **与 boxOffsetX 的联动（#327 改口径，2026-10-22）**：
 *   旧口径是「设了偏移就以偏移为准，align 让位」——**错的**。用户实测反馈
 *   「居左/居右/居中三个参数感觉不太对」，病根正是偏移用 `margin-left` 表达、
 *   直接覆盖了对齐写好的 `margin-left:auto` → 居中/居右当场失效，
 *   且偏移 ≠ 0 时切换对齐界面毫无反应。
 *   ✅ 新口径：**对齐是基准，偏移叠加在基准之上**（两者同时生效）。
 *      偏移改用 `position:relative + left`，不再碰 marginLeft（详见 boxAlignOffset.js）。
 *
 * @param {object} p 组件 props（读 widthMode / widthPercent / align / boxOffsetX）
 * @param {object} [opts]
 * @param {boolean} [opts.flexChild=false] 子项是否处于 flex 容器中（搜索框是）
 * @param {'vw'|'px'} [opts.unit='vw'] 宽度单位：'vw'=视口百分比（C 端）、
 *        'px'=以 DESIGN_VIEWPORT_PX 为基准的固定像素（admin 画布）
 * @param {'left'|'center'|'right'} [opts.defaultAlign='center'] align 未设/非法时的回落
 *        ⚠️ **按组件给**：按钮默认 center，搜索框默认 left（存量视觉就是靠左）
 * @returns {object} 可直接内联的 style
 */
export function containerChildSizeStyle(p, opts = {}) {
  const props = p || {};
  const s = {};
  const defaultAlign = opts.defaultAlign || 'center';

  // 自适应：内容宽 + 左右内边距 + 横向对齐
  if (props.widthMode === 'auto') {
    s.display = 'block';
    s.width = 'fit-content';
    applyAlign(s, props.align, defaultAlign);
    // 🔴 textAlign 管的是**按钮内部**文字居中，与 align（按钮在容器里的位置）是两件事。
    //   删掉它会导致 align=left 时按钮内文字贴左（历史行为是居中，别改）。
    s.textAlign = 'center';
    if (opts.flexChild) {
      // 🔴 flex 子项必须显式 `flex:none`，否则 CSS 里的 `flex:1` 会把 width 压掉
      s.flex = 'none';
      // 🔴 同上：不用 `max-width:100%`（参照容器内容宽 → 会破坏解耦）
      s.maxWidth = opts.unit === 'px' ? `${DESIGN_VIEWPORT_PX}px` : '100vw';
    }
    applyOffsetX(s, props.boxOffsetX, opts.unit);
    return s;
  }

  // 定宽：视口单位 → 与容器左右边距**完全无关**
  const pct = clampPercent(props.widthPercent);
  s.display = 'block';
  s.width = opts.unit === 'px' ? `${(pct * DESIGN_VIEWPORT_PX) / 100}px` : `${pct}vw`;
  applyAlign(s, props.align, defaultAlign);
  s.boxSizing = 'border-box';
  s.textAlign = 'center';
  if (opts.flexChild) {
    // 🔴 同上：必须覆盖 flex:1，否则「调宽度没反应」
    s.flex = 'none';
    // 🔴🔴 **不要加 `max-width:100%`** —— 它是百分比、参照**容器内容宽**，
    //   会把容器边距重新引入宽度。像素实测：marginLR=0/20/40 时搜索框宽
    //   300/300/295px（最后一行被压 5px）→ 刚做好的解耦被破坏。
    //   `vw`/`px` 本身以视口为基准、不会溢出屏幕；要防溢出用 `max-width:100vw`
    //   （仍是视口基准，与容器无关）。
    s.maxWidth = opts.unit === 'px' ? `${DESIGN_VIEWPORT_PX}px` : '100vw';
  }
  // 🔴 组件自身左边偏移（与宽度一样互不影响的独立控件）
  applyOffsetX(s, props.boxOffsetX, opts.unit);
  return s;
}

/**
 * 按 `align` 写 auto 边距（横向对齐）。
 * 🔴 未设/非法 → 居中（与 #321 之前的行为一致，存量视觉不变）。
 * ⚠️ 只写需要「让出空间」的那一侧：另一侧必须显式 0，
 *    否则残留的 auto 会与已写的 auto 打架（inline-block 的 auto 边距行为不可靠）。
 */
function applyAlign(s, align, fallback = 'center') {
  const a = normalizeAlign(align, fallback);
  if (a === 'center') {
    s.marginLeft = 'auto';
    s.marginRight = 'auto';
    return;
  }
  if (a === 'left') {
    s.marginLeft = '0';
    s.marginRight = 'auto';
    return;
  }
  s.marginLeft = 'auto';
  s.marginRight = '0';
}

/**
 * 把 `boxOffsetX`（组件左边偏移，px 语义）**叠加**在对齐基准之上。
 *
 * 🔴🔴 #327：旧实现是 `s.marginLeft = ...`，直接覆盖 `applyAlign` 写好的
 *   `marginLeft:auto` → 居中/居右失效、切对齐无反应（用户报「三个参数不太对」）。
 *   ✅ 现在走共享 `offsetShiftStyle`：写 `position:relative + left`，
 *      不碰 marginLeft，对齐的 auto 边距照样生效 → **基准 + 偏移**两者叠加。
 *      `unit==='px'`（admin 画布）直接用 px；C 端按 750 设计稿转 rpx（×2）。
 */
function applyOffsetX(s, boxOffsetX, unit) {
  // rpx 分支：C 端；px 分支：admin 画布（unit==='px'）
  Object.assign(s, offsetShiftStyle(boxOffsetX, { unit: unit === 'px' ? 'px' : 'rpx' }));
}

/**
 * 按钮宽度（C端 `DesignPage.vue` / admin `ComponentRender.vue` 共用）
 *
 * 🔴 病史（详见本文件顶部）：第一轮曾用「负 margin 抵消容器 marginLR」，
 *   实测失败 —— 容器有 MIN_BG_PADDING 内边距时，按钮会盖住容器底色并溢出、还偏左。
 *   第二轮改百分比也失败（见顶部实测）。第三轮才换成视口单位。
 *   ⚠️ 勿复活：`marginLeft:-LR` + `width:calc(100% + 2*LR)`；也勿改回百分比。
 *
 * @param {object} p 组件 props
 * @param {object} [opts] 透传 containerChildSizeStyle（admin 侧传 `{unit:'px'}`）
 * @returns {object}
 */
export function buttonSizeStyle(p, opts = {}) {
  const s = containerChildSizeStyle(p, { flexChild: false, ...opts });
  // 按钮 auto 模式要左右内边距（内容紧贴文字不好看），搜索框自身有 padding 不需要
  if ((p || {}).widthMode === 'auto') s.padding = '0 12px';
  return s;
}

/**
 * 名片搜索栏内的搜索框宽度。
 *
 * 🔴 病根（2026-10-07 用户反馈三轮：「容器左右边距调了会同步调小搜索框」
 *   →「还是会影响搜索框的大小，还是之前的坑」）：
 *   `.search-box{flex:1}` 自动撑满容器 → 容器边距一变它就跟着变，无法单独控制。
 *   改百分比也没用（见顶部实测：边距 0/20/40 → 宽 225/201/177px）。
 *   ✅ 现在宽度用**视口单位**，与容器边距彻底无关。
 *
 * 🔴 铃铛约束（用户反馈「铃铛一直居左，感觉是多余的」）：
 *   搜索框**右边有铃铛**，它是 flex 行的下一个兄弟。剩余空间如何分配由搜索框的
 *   auto 边距决定——搜索框把剩余空间让给右侧，铃铛就贴右（align='left' 时正是如此）。
 *   ⚠️ 因此 align 三档在搜索框上的效果是「搜索框在**铃铛左侧那片空间**里的位置」，
 *      铃铛始终贴右，不会跟着跑到中间。
 *
 * 🔴 #327：搜索框原本**没有** align 字段，本函数只好写死 `marginLeft:0; marginRight:auto`
 *   （注释里已预告「将来给它加 align 时这行会把它拽回左边，届时要改」）。
 *   现在按用户要求补齐 align（与按钮/公告同口径）→ 那两行强制必须删掉，
 *   否则又是「面板能配、渲染不认」。默认回落到 `left` 以保证存量视觉不变。
 *
 * @param {object} p 组件 props
 * @param {object} [opts] 透传 containerChildSizeStyle（admin 侧传 `{unit:'px'}`）
 * @returns {object}
 */
export function searchBoxSizeStyle(p, opts = {}) {
  return containerChildSizeStyle(p, { flexChild: true, defaultAlign: 'left', ...opts });
}

/** 百分比夹取到 20~100；未设/非法一律 100（保持存量「整行」视觉不变） */
function clampPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(100, Math.max(20, Math.round(n)));
}
