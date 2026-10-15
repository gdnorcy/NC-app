// 品牌色工具：hex 变暗/变浅，供 hero 渐变等场景使用
export function shadeHex(hex, percent = -0.25) {
  let h = String(hex || '').trim();
  if (!h) return '';
  if (h[0] === '#') h = h.slice(1);
  // 支持 3 位简写
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '';
  const num = parseInt(h, 16);
  const amt = Math.round(255 * Math.abs(percent));
  const sign = percent <= 0 ? -1 : 1;
  const rr = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + sign * amt));
  const gg = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + sign * amt));
  const bb = Math.max(0, Math.min(255, (num & 0xff) + sign * amt));
  return '#' + [rr, gg, bb].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** 感知亮度（0-255）：用于「浅色 hero 用深色文字」判据，判的是背景不是文字色 */
export function hexLuma(hex) {
  const c = shadeHex(hex, 0); // 借 shadeHex 归一化（3位简写/非法→''）
  if (!c) return null;
  const n = parseInt(c.slice(1), 16);
  return 0.299 * ((n >> 16) & 0xff) + 0.587 * ((n >> 8) & 0xff) + 0.114 * (n & 0xff);
}

/**
 * hero 渐变：品牌主色 + 渐变色（双色）。
 * 渐变色未配/非法时由主色推导深色端（保持单色时代的观感）；主色未配走 fallback。
 * 🔴 三参签名：所有调用点必须显式传 fallback（曾有两参时代把 fallback 当渐变色的误用）。
 */
export function heroGradient(brandColor, gradientColor, fallback = 'linear-gradient(155deg, #b45309, #f59e0b)') {
  if (!brandColor) return fallback;
  const to = gradientColor && /^#[0-9a-fA-F]{3,6}$/.test(String(gradientColor).trim())
    ? String(gradientColor).trim()
    : shadeHex(brandColor, -0.3);
  if (!to) return fallback;
  return `linear-gradient(155deg, ${to}, ${brandColor})`;
}

/**
 * 归一化品牌 5 色（服务端 toCard 出口 brandColors，兼容老数据仅 brandColor）：
 * 主题/渐变/辅助/主文字/次文字，与设计中心 STYLE_SCHEMES 语义一一对应。
 * 未配置的色返回 ''，由调用方按 hero 语义回落（渐变→主色推导、文字→白、辅→白）。
 */
export function brandPalette(card) {
  const c = (card && card.brandColors) || {};
  return {
    primary: c.primary || (card && card.brandColor) || '',
    gradient: c.gradient || '',
    secondary: c.secondary || '',
    text: c.text || '',
    subText: c.subText || '',
  };
}
