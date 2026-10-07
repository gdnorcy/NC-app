/**
 * 按钮宽度计算（C 端 `DesignPage.vue` / admin 设计器 `ComponentRender.vue` 共用）
 *
 * 🔴 为什么需要这个模块（2026-10-07 用户反馈，两轮）：
 *   1. 「组件『按钮』容器的左右边框调整，会调整按钮的大小，
 *       要区分按钮的大小调节和窗口的大小调节。」
 *   2. 「按钮没有居中。」
 *
 * ── 第一轮的错误做法（勿复活）────────────────────────────────
 * 当时以为「满宽 = 按钮向两侧溢出抵消容器 marginLR」能解耦，实测**行不通**：
 *   `.dp-item` 有 `padding`（MIN_BG_PADDING 兜底），负 margin 会让按钮
 *   **盖住容器底色并溢出到容器外**，视觉上按钮比满行还宽、还偏左。
 *   ⚠️ 教训：`calc(100% + Npx)` + 负 margin 的「溢出抵消」只在容器
 *   **无 padding** 时成立；一旦容器有内边距，几何关系就不再自洽。
 *
 * ── 正确做法 ────────────────────────────────────────────────
 * 按钮宽度用**百分比 + `margin:0 auto`**：
 *   - 百分比参照系是容器内容宽，而容器左右 marginLR 对称
 *     → 容器中心 == 页面中心 → `auto` 边距即正确居中；
 *   - 「容器左右边距」缩放容器 → 按钮跟着缩放，**这正是用户要的解耦**
 *     （按钮大小只由 `widthPercent` 决定，与容器边距无关）。
 *
 * ⚠️ `display:inline-block`（自适应模式）**即使设 `margin:auto` 也不会居中**
 *   —— 实测确认：inline-block 的 auto 边距在 shrink-to-fit 下按内容宽算，
 *   两侧 auto 被当成 0。必须显式给一个块级上下文（见下方 auto 分支）。
 *
 * 🔴 为什么**两个分支都必须显式写 `display:block`**（2026-10-07 第三次实测）：
 *   组件自带 CSS 类 `.r-btn` 是 `display:inline-block`（admin 与 C 端各有一份），
 *   而 **inline-block / inline-flex 的 `margin-left/right:auto` 会被当成 0** ——
 *   于是「整行 + 宽度百分比 < 100」时，按钮直接**贴左边**（实测偏移 -179px）。
 *   ⚠️ 之前只在自适应分支写了 `display:block`、整行分支漏了 → 用户反馈「还是不居中」。
 *   ⚠️ 且这跟 `width:100%` 无关（100% 时看起来正常，只有 <100% 才暴露），
 *   所以「宽度百分比拖小一点」就能复现 —— 别以为是百分比算错了。
 *
 * ⚠️ `display:inline-block` + `width:auto` 时 shrink-to-fit，两侧 auto 同样按 0 处理。
 *
 * ⚠️ 三端必须共用本函数，否则「设计器预览」与「真机」会再次不一致
 *   （这个项目已因各处私藏一份副本踩过多次）。
 */

/**
 * @param {object} p 组件 props
 * @returns {object} 可直接内联的 style
 */
export function buttonSizeStyle(p) {
  const props = p || {};
  const s = {};

  // 自适应：内容宽 + 左右内边距 + 居中
  if (props.widthMode === 'auto') {
    // 🔴 `block` 是**居中的前提**：配 `width:fit-content` 才有「内容宽 + 居中」两者兼得。
    //   只给 fit-content 不给 block → 仍是 `.r-btn` 的 inline-block，auto 边距被当0 → 贴左边。
    s.display = 'block';
    s.width = 'fit-content';
    s.padding = '0 12px';
    s.marginLeft = 'auto';
    s.marginRight = 'auto';
    s.textAlign = 'center';
    return s;
  }

  // 整行：百分比宽度 + auto 边距居中（与容器左右边距解耦）
  const pct = clampPercent(props.widthPercent);
  // 🔴 同样必须 `display:block` —— 见文件头「两个分支都必须显式写 display:block」。
  //   漏了它，widthPercent < 100 时按钮会贴左边（inline-block 的 auto 边距无效）。
  s.display = 'block';
  s.width = `${pct}%`;
  s.marginLeft = 'auto';
  s.marginRight = 'auto';
  s.boxSizing = 'border-box';
  s.textAlign = 'center';
  return s;
}

/** 百分比夹取到 20~100；未设/非法一律 100（保持存量「整行」视觉不变） */
function clampPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(100, Math.max(20, Math.round(n)));
}
