/**
 * 个性化分享封面 —— canvas 绘制（6 款风格，两端通用：MP + H5）
 *
 * 2026-10-21 新增。设计稿见 docs/share-styles/（Python 版 PIL 脚本是同一套版式的原型）。
 *
 * 🔴 微信硬约束（官方文档 onShareAppMessage）：
 *   - imageUrl **显示比例固定 5:4** → 画布必须是 750×600，不能传方图（会被裁）
 *   - imageUrl **支持本地临时文件路径** → 不必服务端存图、不必图片 CDN
 *   - 返回值支持 promise（3 秒内 resolve）→ 可现场绘制完再 resolve
 *
 * 🔴 本项目已踩过的两个坑（别再犯）：
 *   1. `getCurrentInstance()` 只能在 setup 顶层调 —— 事件处理器里 / await 之后调一律返 null
 *      → `q.in(null.proxy)` 抛 TypeError → 被 catch 吞成 toast（canvas 节点测量类需求全中）
 *   2. `ctx.roundRect` 在部分基础库不存在 → 圆角矩形自己写路径
 */

/** 封面风格单一事实来源（服务端 routes/card.js 的 SHARE_STYLES 必须与此一致） */
import { absUrl } from '../../utils/apiBase.js';
export const SHARE_STYLES = [
  { key: 'cover-1', name: '品牌渐变', desc: '最通用 · 品牌色铺满' },
  { key: 'cover-2', name: '名片卡', desc: '白底悬浮卡 · 信息清晰' },
  { key: 'cover-3', name: '暗调商务', desc: '深色金边 · 高端稳重' },
  { key: 'cover-4', name: '全幅人像', desc: '人像为主 · 视觉冲击' },
  { key: 'cover-5', name: '极简白', desc: '留白干净 · 打印友好' },
  { key: 'cover-6', name: '通知卡', desc: '社交感 · 强调新名片' },
];

/** 5:4 比例（微信转发图硬约束） */
export const SHARE_COVER_W = 750;
export const SHARE_COVER_H = 600;
export const SHARE_TITLE_MAX = 30;

/** 品牌色回落（与 web-app/src/utils/color.js 的 brandPalette 回落一致） */
const FALLBACK_PRIMARY = '#165DFF';

function isHex(s) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(s || ''));
}

/** 归一品牌色：非法值一律回落默认蓝（避免把 #zzz 画进 canvas） */
export function resolveBrandColors(card, themePrimary) {
  const bc = (card && card.brandColors) || {};
  const primary = isHex(bc.primary) ? bc.primary : (isHex(themePrimary) ? themePrimary : FALLBACK_PRIMARY);
  const gradient = isHex(bc.gradient) ? bc.gradient : shade(primary, -0.25);
  const secondary = isHex(bc.secondary) ? bc.secondary : mix(primary, '#FFFFFF', 0.45);
  return { primary, gradient, secondary };
}

/** hex → [r,g,b] */
function rgb(hex) {
  let s = String(hex || '').replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
}

function toHex(c) {
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** 两色混合，t=0 取 a，t=1 取 b */
export function mix(a, b, t) {
  const ra = rgb(a), rb = rgb(b);
  return toHex([0, 1, 2].map((i) => ra[i] + (rb[i] - ra[i]) * t));
}

/** 明度调整：t<0 变暗，t>0 变亮 */
export function shade(hex, t) {
  return t < 0 ? mix(hex, '#000000', -t) : mix(hex, '#FFFFFF', t);
}

/** 在底色上叠一层白（alpha）→ 返回不透明色（canvas fillStyle 不吃 alpha 叠加语义） */
function overWhite(base, alpha) {
  return mix(base, '#FFFFFF', alpha);
}

// ---------------------------------------------------------------- 画布基础

/** 圆角矩形路径（不依赖 ctx.roundRect —— 部分基础库没有） */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function fillRound(ctx, x, y, w, h, r, color) {
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function linearGradient(ctx, x0, y0, x1, y1, c0, c1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  return g;
}

/** 品牌色圆 + 姓名首字（头像缺失时的占位） */
function drawAvatar(ctx, cx, cy, r, name, bg, fg) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  const ch = (name || '名').charAt(0);
  ctx.fillStyle = fg;
  ctx.font = `500 ${Math.round(r * 1.05)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, cx, cy + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** 极简电话听筒 */
function drawPhone(ctx, x, y, s, color) {
  const w = Math.max(2, Math.round(s / 7));
  ctx.fillStyle = color;
  fillRound(ctx, x, y + s * 0.18, s * 0.30, s * 0.32, w, color);
  fillRound(ctx, x + s * 0.16, y + s * 0.40, s * 0.68, s * 0.32, w, color);
  fillRound(ctx, x + s * 0.70, y + s * 0.18, s * 0.30, s * 0.32, w, color);
}

/** 定位针 */
function drawPin(ctx, x, y, s, color) {
  const w = Math.max(2, Math.round(s / 7));
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s / 2, s / 2 - w / 2, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s / 2, s * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** 画一段居中/左对齐的文字（自动截断） */
function drawText(ctx, text, x, y, font, color, maxWidth) {
  if (!text) return;
  ctx.font = font;
  ctx.fillStyle = color;
  let t = String(text);
  if (maxWidth) {
    while (t.length > 1 && ctx.measureText(t).width > maxWidth) t = t.slice(0, -1);
    if (t !== String(text) && t.length > 1) t = t.slice(0, -1) + '…';
  }
  ctx.fillText(t, x, y);
}

// ---------------------------------------------------------------- 6 款版式

/**
 * 绘制一张分享封面到 ctx。
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} card 名片数据（name/position/company/phone/city/slogan/needTags/avatar）
 * @param {String} styleKey cover-1..cover-6
 * @param {Object} colors { primary, gradient, secondary }
 * @param {Object} opts { W, H, qrImage, avatarImage }
 */
export function drawShareCover(ctx, card, styleKey, colors, opts = {}) {
  const W = opts.W || SHARE_COVER_W;
  const H = opts.H || SHARE_COVER_H;
  const c = card || {};
  const { primary, gradient, secondary } = colors;
  const name = c.name || '电子名片';
  const position = c.position || '';
  const company = c.company || '';
  const phone = c.phone || '';
  const city = c.city || '';
  const slogan = c.slogan || '连接资源 · 共创价值';
  const tags = parseTags(c.needTags);
  const qr = opts.qrImage || null;
  const av = opts.avatarImage || null;

  const switcher = {
    'cover-1': drawCover1,
    'cover-2': drawCover2,
    'cover-3': drawCover3,
    'cover-4': drawCover4,
    'cover-5': drawCover5,
    'cover-6': drawCover6,
  };
  const fn = switcher[styleKey] || drawCover1;
  fn(ctx, { W, H, c, name, position, company, phone, city, slogan, tags, primary, gradient, secondary, qr, av });
}

function parseTags(raw) {
  try {
    const a = JSON.parse(raw || '[]');
    return Array.isArray(a) ? a.slice(0, 3).map(String) : [];
  } catch (e) {
    return [];
  }
}

/** 1 品牌渐变 */
function drawCover1(ctx, d) {
  const { W, H, name, position, company, phone, slogan, tags, primary, gradient, qr, av } = d;
  ctx.fillStyle = linearGradient(ctx, 0, 0, W * 0.35, H, primary, gradient);
  ctx.fillRect(0, 0, W, H);
  // 装饰大圆（半透明白）
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(W - 30, 60, 200, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(20, H - 30, 150, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // 头像
  if (av) {
    ctx.save();
    ctx.beginPath(); ctx.arc(92, 120, 46, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(av, 46, 74, 92, 92);
    ctx.restore();
  } else {
    drawAvatar(ctx, 92, 120, 46, name, '#FFFFFF', primary);
  }
  drawText(ctx, name, 162, 132, 'bold 62px sans-serif', '#FFFFFF');
  drawText(ctx, position, 162, 186, '30px sans-serif', overWhite(primary, 0.82));
  drawText(ctx, company, 56, 302, 'bold 40px sans-serif', '#FFFFFF', W - 112);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(56, 340, 64, 5);
  // 标签 chip：用**不透明调和色**（半透明白底 + 白字 = 看不见）
  let tx = 56;
  const chipBg = mix(primary, '#FFFFFF', 0.22);
  tags.forEach((t) => {
    ctx.font = '22px sans-serif';
    const tw = ctx.measureText(t).width + 30;
    fillRound(ctx, tx, 372, tw, 40, 20, chipBg);
    drawText(ctx, t, tx + 15, 399, '22px sans-serif', '#FFFFFF');
    tx += tw + 12;
  });
  // 底部触达条（半透明黑 → 先算好实色再用实色画）
  ctx.fillStyle = overWhite(shade(primary, -0.45), 0.0);
  ctx.fillStyle = shade(primary, -0.5);
  ctx.globalAlpha = 0.28;
  ctx.fillRect(0, H - 118, W, 118);
  ctx.globalAlpha = 1;
  drawPhone(ctx, 56, H - 92, 26, '#FFFFFF');
  drawText(ctx, phone, 94, H - 70, '30px sans-serif', '#FFFFFF');
  drawText(ctx, slogan, 94, H - 30, '22px sans-serif', overWhite(shade(primary, -0.5), 0.78));
  if (qr) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(W - 142, H - 160, 110, 110);
    ctx.drawImage(qr, W - 132, H - 150, 90, 90);
  }
}

/** 2 名片卡 */
function drawCover2(ctx, d) {
  const { W, H, name, position, company, phone, city, slogan, primary, gradient, qr, av } = d;
  ctx.fillStyle = linearGradient(ctx, 0, 0, W, H, '#F2F5FF', '#E8EEFF');
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = primary;
  ctx.beginPath(); ctx.arc(W - 90, 20, 150, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(90, H, 120, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // 卡面阴影
  ctx.save();
  ctx.shadowColor = 'rgba(16,24,40,0.12)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  fillRound(ctx, 60, 92, W - 120, 400, 28, '#FFFFFF');
  ctx.restore();
  // 卡面渐变头
  ctx.save();
  roundRect(ctx, 60, 92, W - 120, 150, 28);
  ctx.clip();
  ctx.fillStyle = linearGradient(ctx, 60, 92, 60 + (W - 120) * 0.6, 242, primary, gradient);
  ctx.fillRect(60, 92, W - 120, 150);
  ctx.restore();
  if (av) {
    ctx.save();
    ctx.beginPath(); ctx.arc(128, 167, 42, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(av, 86, 125, 84, 84);
    ctx.restore();
  } else {
    drawAvatar(ctx, 128, 167, 42, name, '#FFFFFF', primary);
  }
  drawText(ctx, name, 190, 148, 'bold 46px sans-serif', '#FFFFFF');
  drawText(ctx, `${position} · ${company}`, 190, 196, '26px sans-serif', overWhite(primary, 0.84), W - 260);
  // 信息行
  drawPhone(ctx, 92, 292, 22, primary);
  drawText(ctx, phone, 128, 310, '30px sans-serif', '#1D2129');
  drawPin(ctx, 92, 340, 22, primary);
  drawText(ctx, `${city} · ${slogan}`, 128, 358, '26px sans-serif', '#4E5969', W - 300);
  // 二维码（卡内右下）
  if (qr) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(W - 178, 366, 98, 98);
    ctx.drawImage(qr, W - 172, 372, 86, 86);
  }
  // 底部 CTA
  fillRound(ctx, 60, H - 96, W - 120, 52, 26, primary);
  drawText(ctx, '长按识别，查看完整电子名片', 104, H - 62, '30px sans-serif', '#FFFFFF');
}

/** 3 暗调商务 */
function drawCover3(ctx, d) {
  const { W, H, name, position, company, phone, city, primary, qr, av } = d;
  ctx.fillStyle = linearGradient(ctx, 0, 0, W, H, '#141821', '#232B3A');
  ctx.fillRect(0, 0, W, H);
  // 细网格纹理
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();
  const accent = mix(primary, '#C9A25E', 0.55);
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  ctx.strokeRect(26, 26, W - 53, H - 53);
  ctx.globalAlpha = 1;
  drawText(ctx, 'E-CARD', 60, 90, '22px sans-serif', accent);
  ctx.font = '22px sans-serif';
  drawText(ctx, '2026', W - 60 - ctx.measureText('2026').width, 90, '22px sans-serif', '#969EB1');
  ctx.fillStyle = accent;
  ctx.fillRect(60, 104, 56, 4);
  if (av) {
    ctx.save();
    ctx.beginPath(); ctx.arc(96, 196, 40, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(av, 56, 156, 80, 80);
    ctx.restore();
  }
  drawText(ctx, name, 60, 190, 'bold 62px sans-serif', '#FFFFFF');
  drawText(ctx, position, 60, 254, '34px sans-serif', accent);
  drawText(ctx, company, 60, 300, '30px sans-serif', overWhite('#1B212C', 0.76), W - 120);
  ctx.strokeStyle = overWhite('#1B212C', 0.16);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(60, 350); ctx.lineTo(W - 60, 350); ctx.stroke();
  drawPhone(ctx, 60, 384, 24, accent);
  drawText(ctx, phone, 96, 402, '30px sans-serif', overWhite('#1B212C', 0.88));
  drawText(ctx, city, 60, 450, '26px sans-serif', overWhite('#1B212C', 0.55));
  if (qr) {
    ctx.fillStyle = '#1B212C';
    ctx.fillRect(W - 162, H - 188, 122, 122);
    ctx.drawImage(qr, W - 156, H - 182, 110, 110);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.strokeRect(W - 162, H - 188, 122, 122);
    ctx.globalAlpha = 1;
  }
}

/** 4 全幅人像 */
function drawCover4(ctx, d) {
  const { W, H, name, position, company, primary, qr, av } = d;
  const deep = mix(primary, '#0B1B4B', 0.35);
  ctx.fillStyle = linearGradient(ctx, 0, 0, W, H, deep, mix(primary, '#0B1B4B', 0.6));
  ctx.fillRect(0, 0, W, H);
  // 斜切色带
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(0, 300); ctx.lineTo(W, 180); ctx.lineTo(W, 300); ctx.lineTo(0, 420);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.07;
  ctx.beginPath();
  ctx.moveTo(0, 400); ctx.lineTo(W, 280); ctx.lineTo(W, 330); ctx.lineTo(0, 450);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // 人像（有图用图，无图用抽象剪影）
  if (av) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(av, W / 2 - 150, 60, 300, 300);
    ctx.restore();
  } else {
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(W / 2, 210, 150, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W / 2, 525, 210, 195, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // 底部压暗
  const g = ctx.createLinearGradient(0, H - 220, 0, H);
  g.addColorStop(0, 'rgba(8,12,24,0)');
  g.addColorStop(1, 'rgba(8,12,24,0.88)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H - 220, W, 220);
  drawText(ctx, name, 56, H - 178, 'bold 62px sans-serif', '#FFFFFF');
  drawText(ctx, `${position} · ${company}`, 56, H - 124, '30px sans-serif', overWhite('#0B1B4B', 0.8), W - 200);
  // CTA 按钮（宽度按文字实测，避免文字溢出按钮）
  const ctaText = '保存名片';
  ctx.font = '30px sans-serif';
  const ctaW = ctx.measureText(ctaText).width + 72;
  fillRound(ctx, 56, H - 84, ctaW, 52, 26, '#FFFFFF');
  drawText(ctx, ctaText, 56 + 36, H - 48, '30px sans-serif', primary);
  if (qr) {
    ctx.fillStyle = mix(primary, '#0B1B4B', 0.5);
    ctx.fillRect(W - 150, H - 228, 110, 110);
    ctx.drawImage(qr, W - 140, H - 218, 90, 90);
  }
}

/** 5 极简白 */
function drawCover5(ctx, d) {
  const { W, H, name, position, company, phone, city, primary, qr, av } = d;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, 14, H);
  fillRound(ctx, 56, 62, 172, 40, 20, mix(primary, '#FFFFFF', 0.88));
  drawText(ctx, '电子名片', 72, 90, '22px sans-serif', primary);
  if (av) {
    ctx.save();
    ctx.beginPath(); ctx.arc(108, 186, 52, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(av, 56, 134, 104, 104);
    ctx.restore();
  } else {
    drawAvatar(ctx, 108, 186, 52, name, mix(primary, '#FFFFFF', 0.86), primary);
  }
  drawText(ctx, name, 188, 162, 'bold 62px sans-serif', '#1D2129');
  drawText(ctx, position, 188, 232, '30px sans-serif', '#4E5969');
  drawText(ctx, company, 56, 330, 'bold 40px sans-serif', '#1D2129', W - 112);
  ctx.fillStyle = primary;
  ctx.fillRect(56, 358, 48, 4);
  drawPhone(ctx, 56, 396, 22, primary);
  drawText(ctx, phone, 92, 414, '30px sans-serif', '#1D2129');
  drawPin(ctx, 56, 448, 22, primary);
  drawText(ctx, city, 92, 466, '26px sans-serif', '#4E5969');
  if (qr) {
    ctx.fillStyle = '#1D2129';
    ctx.fillRect(W - 132, H - 152, 92, 92);
    ctx.drawImage(qr, W - 127, H - 147, 82, 82);
    drawText(ctx, '扫一扫', W - 132, H - 36, '22px sans-serif', '#5C6470');
  }
}

/** 6 通知卡 */
function drawCover6(ctx, d) {
  const { W, H, name, position, company, slogan, primary, gradient, secondary, qr, av } = d;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  // 顶部通知条
  ctx.fillStyle = linearGradient(ctx, 0, 0, W, 150, primary, mix(gradient, secondary, 0.4));
  ctx.fillRect(0, 0, W, 150);
  fillRound(ctx, 44, 46, 46, 46, 12, overWhite(primary, 0.24));
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(56, 60, 22, 18);
  drawText(ctx, '您收到一张新名片', 106, 76, 'bold 40px sans-serif', '#FFFFFF');
  drawText(ctx, '点击查看 · 立即联系', 106, 110, '22px sans-serif', overWhite(primary, 0.78));
  // 主体白卡（顶部必须低于通知条，否则盖住标题）
  // ⚠️ 高度别给太大：白卡只包住内容（渐变名片 300 + 上下留白），否则底部大片留白
  fillRound(ctx, 40, 130, W - 80, 372, 24, '#FFFFFF');
  // 卡内渐变名片（右侧留出二维码位：渐变卡到 570，码 590..694 都在白卡内）
  const innerW = W - 260;
  ctx.save();
  roundRect(ctx, 80, 168, innerW, 300, 20);
  ctx.clip();
  ctx.fillStyle = linearGradient(ctx, 80, 168, 80 + innerW, 468, mix(primary, '#FFFFFF', 0.9), mix(secondary, '#FFFFFF', 0.92));
  ctx.fillRect(80, 168, innerW, 300);
  ctx.restore();
  if (av) {
    ctx.save();
    ctx.beginPath(); ctx.arc(148, 236, 40, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(av, 108, 196, 80, 80);
    ctx.restore();
  } else {
    drawAvatar(ctx, 148, 236, 40, name, primary, '#FFFFFF');
  }
  drawText(ctx, name, 206, 226, 'bold 46px sans-serif', '#1D2129');
  drawText(ctx, `${position} · ${company}`, 206, 268, '26px sans-serif', '#4E5969', innerW - 146);
  drawText(ctx, slogan, 106, 336, '22px sans-serif', '#5C6470', W - 200);
  // 按钮（宽度按文字实测，避免溢出）
  const btnText = '保存到通讯录';
  ctx.font = '30px sans-serif';
  const bw = ctx.measureText(btnText).width + 76;
  fillRound(ctx, 106, 366, bw, 56, 28, primary);
  drawText(ctx, btnText, 144, 402, '30px sans-serif', '#FFFFFF');
  if (qr) {
    // 二维码：白卡内、渐变名片右侧的空白（不压名片信息）
    ctx.fillStyle = '#1D2129';
    ctx.fillRect(590, 208, 104, 104);
    ctx.drawImage(qr, 595, 213, 94, 94);
  }
}

// ---------------------------------------------------------------- 绘制入口

/** 跨端取图：MP 用 canvas.createImage，H5 用 Image */
function loadImage(canvas, src) {
  return new Promise((resolve, reject) => {
    if (!src) { reject(new Error('no src')); return; }
    // 🔴 #312-9：库里存的是 /uploads/ 相对路径。MP 的 canvas.createImage 会把它当
    //   **小程序包内路径**解析 → 加载失败 → 转发封面/缩略图里没有头像。
    //   在取图入口单一收口补基址（H5 同源相对不变），调用方（cardDetail/shareStyle）无需各自补。
    const url = absUrl(src);
    let img;
    // #ifdef MP-WEIXIN
    img = canvas.createImage();
    // #endif
    // #ifndef MP-WEIXIN
    img = new Image();
    // #endif
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * 在给定 canvas 上画好分享封面（不导出文件）。
 * @param {HTMLCanvasElement|Object} canvas MP 的 type=2d canvas 节点
 * @param {Object} card
 * @param {String} styleKey
 * @param {Object} colors
 * @param {Object} opts { qrImage, avatarImage, dpr }
 */
export async function renderShareCover(canvas, card, styleKey, colors, opts = {}) {
  const W = opts.W || SHARE_COVER_W;
  const H = opts.H || SHARE_COVER_H;
  const dpr = opts.dpr || 2;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  // 底色先铺白（避免透明区域在 MP 上变黑）
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  let qrImage = null;
  let avatarImage = null;
  try {
    if (opts.qrImage) qrImage = await loadImage(canvas, opts.qrImage);
  } catch (e) { qrImage = null; }
  try {
    if (opts.avatarImage) avatarImage = await loadImage(canvas, opts.avatarImage);
  } catch (e) { avatarImage = null; }
  drawShareCover(ctx, card, styleKey, colors, { W, H, qrImage, avatarImage });
  return ctx;
}

/** 转发标题兜底：空 → 「姓名 · 职位 · 公司」 */
export function resolveShareTitle(card) {
  const c = card || {};
  const custom = String(c.shareTitle || '').trim();
  if (custom) return custom.slice(0, SHARE_TITLE_MAX);
  return [c.name, c.position, c.company].filter(Boolean).join(' · ') || '这是我的名片';
}
