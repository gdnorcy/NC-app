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

export function heroGradient(brandColor, fallback = 'linear-gradient(155deg, #b45309, #f59e0b)') {
  if (!brandColor) return fallback;
  const dark = shadeHex(brandColor, -0.3);
  if (!dark) return fallback;
  return `linear-gradient(155deg, ${dark}, ${brandColor})`;
}
