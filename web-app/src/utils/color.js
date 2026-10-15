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
 * hex/rgba → rgba(..., alpha)，覆盖原透明度（单一事实来源）。
 * ⚠️ 全仓曾有三份同名副本（TplThumb / CardTabBar / createSkin），
 *    规则各自略异 → 新代码一律从这里取，旧副本逐步收敛。
 */
export function hexA(color, alpha) {
  if (!color) return `rgba(22,93,255,${alpha})`;
  let c = String(color).trim();
  if (c.startsWith('#')) {
    c = c.slice(1);
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const n = parseInt(c, 16);
    if (!Number.isNaN(n) && c.length === 6) {
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
    }
  }
  const m = String(color).match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((x) => x.trim());
    return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
  }
  return color;
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
 * 🔴 浅底（白卡 / 白底占位头像）上**可读**的主色文字。
 *
 * 存在原因：品牌主色一换，白卡上照抄 var(--design-primary) 的文字就可能不可读
 * （亮黄 #FCB801 在白底只有 1.75:1，肉眼几乎消失——真机报修「头像里的白字/黄字看不见」）。
 * 判据是**文字所坐的那块底**（白卡/白圆），不是页面 hero 背景——沿用
 * 「凡是明暗/可读性布尔量，先问判的是前景还是背景」这条元规则。
 *
 * @param {string} primary 品牌主色 @param {string} bg 文字所坐底色（默认白）
 * @returns {string} 白底上达 WCAG 3.0 的可读色（主色本身达标则原样返回）
 */
export function inkOnLightBg(primary, bg = '#ffffff', fallback = '#165dff') {
  const p = /^#[0-9a-fA-F]{6}$/.test(String(primary || '').trim()) ? String(primary).trim() : fallback;
  if (isReadableOn(p, bg, 3)) return p;
  // 太浅 → 逐级压暗直到达标（亮黄 #FCB801 压到 -0.45 ≈ #894501，约 7.2:1）
  for (const k of [-0.3, -0.45, -0.6, -0.75]) {
    const d = shadeHex(p, k);
    if (d && isReadableOn(d, bg, 3)) return d;
  }
  return fallback;
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
