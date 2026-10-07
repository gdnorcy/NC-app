/**
 * 按钮宽度计算（C 端 `DesignPage.vue` / admin 设计器 `ComponentRender.vue` 共用）
 *
 * 🔴 为什么需要这个模块（2026-10-07 用户反馈）：
 *   「组件『按钮』容器的左右边框调整，会调整按钮的大小，要区分按钮的大小调节
 *    和窗口的大小调节。」
 *
 * 病根：`width:100%` 的**参照系是父容器（.dp-item/.pe-comp 的内容盒）**。
 * 而通用项的 `marginLR`（容器左右边距）恰好就是缩放这个父容器的 →
 * 于是「调窗口大小」必然连带「改按钮大小」，两个控件缠死在一个几何量上，
 * 面板上再怎么改名字都没用（运营看到的现象就是"按钮自己变窄了"）。
 *
 * 修法：**让按钮宽度参照页面可用宽度，而不是参照容器**。
 *   满宽且 widthPercent=100 时，按钮向两侧各溢出 `marginLR`
 *   （`marginLeft:-LR / width:calc(100% + 2*LR)`），视觉上仍是满行、
 *   且**容器怎么缩放它都不动** —— 这样「容器左右边距」就只影响窗口了。
 *   widthPercent < 100 时按钮居中，宽度 = 页面可用宽 ×百分比，
 *   同样与 marginLR 解耦。
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

  // 自适应：内容宽 + 左右内边距，与容器宽度无关
  if (props.widthMode === 'auto') {
    s.display = 'inline-block';
    s.width = 'auto';
    s.padding = '0 12px';
    return s;
  }

  // 整行：宽度基准 = 容器宽度 + 两侧溢出补偿（= 页面可用宽度）
  const pct = clampPercent(props.widthPercent);
  const lr = Number(props.marginLR ?? props.marginLeft ?? 0) || 0;
  if (lr > 0) {
    // 先抵消容器的左右边距：容器缩窄多少，按钮就向外撑多少 → 净宽不变
    s.marginLeft = `-${lr}px`;
    s.marginRight = `-${lr}px`;
    s.width = `calc(100% + ${lr * 2}px)`;
  } else {
    s.width = '100%';
  }
  if (pct !== 100) {
    // 按百分比收窄：以「抵消后的满行宽」为 100%
    const base = lr > 0 ? `calc(100% + ${lr * 2}px)` : '100%';
    s.width = `calc(${base} * ${pct / 100})`;
  }
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
