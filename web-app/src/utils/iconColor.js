// ============================================================
// SIcon 颜色令牌（单一事实来源 = styles/token.scss 的同名值）
//
// 🔴 为什么是 JS 常量而不是 CSS var(--t1)：
//   SIcon 的 color 会被**烘焙**进产物，var() 到不了：
//     ① H5：buildSvgDataUri 把 color 写死进 SVG data-URI（background-image），
//        data-URI 里的 currentColor 不解析外部 CSS color → 回落黑；
//     ② MP：mpIconSrc 按 `name-hex` 查构建期 PNG（sicons-base64.js），
//        var() 不是 hex → 查不到 → 回落黑色兜底 / 走服务端渲染。
//   故此处必须是真实 hex。与 token.scss 的同步由 iconColor.test.js 锁定
//   （改 token.scss 不同步改这里 → 测试失败）。
//
// 语义（与 token.scss 注释一致）：
//   T1   主文本（标题、强图标）
//   T2   次文本（菜单图标等）
//   T3   可读次要文本（WCAG AA 达标，原 #86909c 2.92:1 不达标）
//   DECOR 装饰灰：空态大图标 / 占位 / 禁用——**非阅读内容**，不套 WCAG 文字标准
//        （原散落 #c9cdd4 / #9a9a9a / #8a8f99 / #86909c 四种，2026-10-16 收敛）
// ============================================================

export const ICON_T1 = '#1d2129';
export const ICON_T2 = '#4e5969';
export const ICON_T3 = '#5c6470';
export const ICON_DECOR = '#86909c';

/** 令牌名 → hex（供 gen-mp-sicons.js 静态扫描时解析模板里的 ICON_* 字面量） */
export const ICON_COLOR_TOKENS = {
  ICON_T1,
  ICON_T2,
  ICON_T3,
  ICON_DECOR,
};

/**
 * 把「可能是令牌名」的颜色表达式解析成 hex；已是 hex 原样返回。
 * 供脚本/测试复用；运行期模板统一写 :color="ICON_T1"（Vue 先求值成 hex），
 * 故 SIcon.vue 内部不需要调它。
 */
export function resolveIconColor(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (v.startsWith('#')) return v.toLowerCase();
  return ICON_COLOR_TOKENS[v] || v;
}
