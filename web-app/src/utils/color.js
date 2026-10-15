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

/** 两色等比混合（渐变取代表色用）；任一非法则返回另一原色 */
export function mixHex(a, b, w = 0.5) {
  const norm = (h) => (/^#[0-9a-fA-F]{6}$/.test(String(h || '').trim()) ? String(h).trim() : '');
  const ca = norm(a); const cb = norm(b);
  if (!ca) return cb; if (!cb) return ca;
  const na = parseInt(ca.slice(1), 16); const nb = parseInt(cb.slice(1), 16);
  const ch = (sh) => Math.round(((na >> sh) & 0xff) * (1 - w) + ((nb >> sh) & 0xff) * w);
  return '#' + [16, 8, 0].map((sh) => Math.max(0, Math.min(255, ch(sh))).toString(16).padStart(2, '0')).join('');
}

/**
 * WCAG 相对亮度（0~1）与对比度（1~21）。用于「配置色是否真能在该底色上读得清」，
 * 替代肉眼判断——后台能配出自相矛盾的五色（亮黄底 + 白字），必须靠数值裁掉。
 */
export function relLum(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(String(hex || '').trim())) return null;
  const n = parseInt(String(hex).trim().slice(1), 16);
  const ch = (sh) => {
    const v = ((n >> sh) & 0xff) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(16) + 0.7152 * ch(8) + 0.0722 * ch(0);
}

/** 前景色（支持 #rgb/#rrggbb/rgba()）压在 bgHex 上的实际对比度；无法解析返回 null */
export function contrastOn(fg, bgHex) {
  const bgL = relLum(bgHex);
  if (bgL === null) return null;
  let f = String(fg || '').trim();
  let alpha = 1;
  const rgba = f.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const p = rgba[1].split(',').map((s) => parseFloat(s));
    alpha = p.length > 3 && Number.isFinite(p[3]) ? p[3] : 1;
    f = '#' + p.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  if (f.length === 4 && f[0] === '#') f = '#' + f.slice(1).split('').map((c) => c + c).join('');
  const fL = relLum(f);
  if (fL === null) return null;
  // 半透明前景按 alpha 与底色合成后再比（职务等次级文字常用 rgba）
  const eff = fL * alpha + bgL * (1 - alpha);
  const hi = Math.max(eff, bgL); const lo = Math.min(eff, bgL);
  return (hi + 0.05) / (lo + 0.05);
}

/** 前景色在 bgHex 上的对比度是否达标（min 默认 3.0≈大字号可读线） */
export function isReadableOn(fg, bgHex, min = 3) {
  const c = contrastOn(fg, bgHex);
  return c !== null && c >= min;
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
