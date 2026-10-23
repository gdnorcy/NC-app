/**
 * 名片分享海报风格库（2026-10-23 新增）
 *
 * 背景：#312-13 用户反馈 ①原海报「经营领域文字与需求标签 chips 叠在一起」
 *  —— 原因：drawPoster 里经营领域基线 y=285，chips 矩形 y=260..300（文字基线 288），
 *     两行内容画进了同一区间；
 *  ②希望有几款不同风格的海报可选。
 *
 * 本模块提供 4 款 600×960 竖版海报绘制函数，全部只依赖标准 Canvas 2D API
 * （H5 与微信小程序 canvas type="2d" 通用），无 MP 模板参与，不涉两端漂移。
 *
 * 🔴 布局铁律（来自本次叠字反馈）：每个风格的**每一行内容 y 区间必须两两不重叠**，
 *    posterStyles.test.js 会按数值钉死各行的 y 断言，改 y 值须同步改测试。
 */

export const POSTER_W = 600;
export const POSTER_H = 960;

/** 风格注册表（顺序即 UI 展示顺序） */
export const POSTER_STYLES = [
  { key: 'classic', label: '经典商务' },
  { key: 'dark', label: '曜石深色' },
  { key: 'minimal', label: '极简白' },
  { key: 'gradient', label: '渐变全屏' },
];

// ---------------------------------------------------------------- 小工具

function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** hex → rgba() 字符串（画布半透明用；不支持透明度叠加错误的 fillStyle=hex+globalAlpha 混用） */
function alphaColor(hex, a) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(255,255,255,${a})`;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRound(ctx, x, y, w, h, r, fill) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRound(ctx, x, y, w, h, r, stroke, lw) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw || 2;
  ctx.stroke();
}

/** 截断到 maxWidth（含省略号）；canvas 文字一律先过这里，防溢出画布 */
function fitText(ctx, text, maxWidth) {
  let t = String(text == null ? '' : text);
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function drawLine(ctx, text, x, y, font, color, maxWidth, align) {
  if (!text) return;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.fillText(fitText(ctx, text, maxWidth || 10000), x, y);
  ctx.textAlign = 'left';
}

/** 无头像图时的首字母圆 */
function avatarDisc(ctx, cx, cy, r, name, bg, fg) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  const ch = (name || '名').charAt(0);
  ctx.font = `bold ${Math.round(r)}px sans-serif`;
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, cx, cy + 2);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
}

/** 头像：有图裁圆，无图回落首字母盘 */
function drawAvatar(ctx, av, cx, cy, r, name, bg, fg) {
  if (av) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(av, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  } else {
    avatarDisc(ctx, cx, cy, r, name, bg, fg);
  }
}

/**
 * 需求标签 chip 行。返回结束 x。
 * 🔴 防叠字/溢出：chip 只往右排，超出 maxRight 就截字加省略号，不再继续画下一枚。
 */
function drawChips(ctx, tags, x0, y, chipH, opts) {
  const { font, fg, bg, border, radius, gap, padX, maxRight } = opts;
  let tx = x0;
  ctx.font = font;
  (tags || []).forEach((t) => {
    const label = fitText(ctx, t, maxRight - tx - padX * 2 - gap);
    if (!label) return;
    const tw = ctx.measureText(label).width + padX * 2;
    if (tx + tw > maxRight) return;
    if (border) {
      strokeRound(ctx, tx, y, tw, chipH, radius, border, 2);
    } else {
      fillRound(ctx, tx, y, tw, chipH, radius, bg);
    }
    ctx.font = font;
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, tx + padX, y + chipH / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    tx += tw + gap;
  });
  return tx;
}

/** 二维码白色圆角面板（深色底上的二维码必须垫白） */
function drawQrPanel(ctx, qr, x, y, size, radius, pad) {
  const p = pad == null ? 20 : pad;
  fillRound(ctx, x, y, size, size, radius == null ? 24 : radius, '#FFFFFF');
  if (qr) ctx.drawImage(qr, x + p, y + p, size - p * 2, size - p * 2);
}

function footerPhone(ctx, c, H, color) {
  if (!c.phone) return;
  ctx.font = '22px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(`电话 ${c.phone}`, POSTER_W / 2, H - 40);
  ctx.textAlign = 'left';
}

function infoLine(c) {
  return [c.company, c.city].filter(Boolean).join(' · ');
}

function parseTags(raw) {
  try {
    const a = JSON.parse(raw || '[]');
    return Array.isArray(a) ? a.slice(0, 3).map(String) : [];
  } catch (e) {
    return [];
  }
}

// ---------------------------------------------------------------- 4 款风格

/**
 * 1 经典商务（原版式修复版）
 * 🔴 叠字修复：头部各行 y 区间严格分层——
 *    name 基线 130 / position 185 / 公司·城市 235 / 经营领域 282（24px 文字≈258..282）
 *    / chips 矩形 296..336（文字居中基线区）→ 任何两行区间不相交。
 *    头部渐变高度 330 → 370（给足 chips 行空间）。
 */
function drawClassic(ctx, d) {
  const { W, H, c, name, primary, gradient, ink, qr } = d;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const HEAD_H = 370;
  const g = ctx.createLinearGradient(0, 0, W * 0.35, HEAD_H);
  g.addColorStop(0, primary);
  g.addColorStop(1, gradient);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HEAD_H);

  drawLine(ctx, name, 48, 130, 'bold 64px sans-serif', ink, W - 96);
  drawLine(ctx, c.position || '', 48, 185, '30px sans-serif', alphaColor(ink === '#ffffff' ? '#ffffff' : '#ffffff', 0.9), W - 96);
  drawLine(ctx, infoLine(c), 48, 235, '30px sans-serif', alphaColor('#ffffff', 0.9), W - 96);
  // 经营领域行（y 258..282）：与 chips（296 起）不相交
  drawLine(ctx, c.businessField || '', 48, 282, '24px sans-serif', alphaColor('#ffffff', 0.75), W - 96);
  // 需求标签 chips（y 296..336）
  drawChips(ctx, d.tags, 48, 296, 40, {
    font: '24px sans-serif', fg: '#ffffff', bg: alphaColor('#ffffff', 0.18),
    radius: 20, gap: 16, padX: 16, maxRight: W - 48,
  });

  drawLine(ctx, '扫码查看电子名片', 48, 440, 'bold 34px sans-serif', '#1d2129');
  drawLine(ctx, '长按或微信扫一扫', 48, 484, '24px sans-serif', '#86909c');
  if (qr) ctx.drawImage(qr, W / 2 - 190, 530, 380, 380);
  footerPhone(ctx, c, H, '#c9cdd4');
}

/** 2 曜石深色：深底 + 品牌色点缀 + 白垫二维码 */
function drawDark(ctx, d) {
  const { W, H, c, name, primary, qr, av } = d;
  ctx.fillStyle = '#10141c';
  ctx.fillRect(0, 0, W, H);
  // 顶部品牌光晕
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = primary;
  ctx.beginPath();
  ctx.arc(W - 60, -40, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 品牌色小杠
  ctx.fillStyle = primary;
  ctx.fillRect(48, 96, 56, 8);

  // 文字区右侧让开头像（头像圆心 W-108、半径 52 → 左缘约 440），maxWidth 收到 W-216
  drawLine(ctx, name, 48, 200, 'bold 68px sans-serif', '#ffffff', W - 216);
  drawLine(ctx, c.position || '', 48, 252, '26px sans-serif', 'rgba(255,255,255,0.72)', W - 216);
  drawLine(ctx, infoLine(c), 48, 296, '26px sans-serif', 'rgba(255,255,255,0.55)', W - 216);
  // 分隔线（y 330）
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(48, 330, W - 96, 2);
  // 经营领域（y 344..372）
  drawLine(ctx, c.businessField || '', 48, 372, '24px sans-serif', 'rgba(255,255,255,0.62)', W - 96);
  // chips（y 396..436，描边款）
  drawChips(ctx, d.tags, 48, 396, 40, {
    font: '24px sans-serif', fg: '#ffffff', border: 'rgba(255,255,255,0.28)',
    radius: 20, gap: 16, padX: 16, maxRight: W - 48,
  });

  // 头像（右上圆）
  drawAvatar(ctx, av, W - 108, 176, 52, name, primary, '#ffffff');

  drawQrPanel(ctx, qr, W / 2 - 170, 500, 340, 24, 24);
  ctx.font = '26px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.66)';
  ctx.textAlign = 'center';
  ctx.fillText('长按或微信扫一扫，查看电子名片', W / 2, 890);
  ctx.textAlign = 'left';
  footerPhone(ctx, c, H, 'rgba(255,255,255,0.4)');
}

/** 3 极简白：留白 + 细线 + 左文右码 */
function drawMinimal(ctx, d) {
  const { W, H, c, name, primary, ink, qr } = d;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  // 顶部品牌方块
  ctx.fillStyle = primary;
  ctx.fillRect(48, 76, 16, 16);
  drawLine(ctx, name, 48, 180, 'bold 72px sans-serif', ink, W - 96);
  drawLine(ctx, c.position || '', 48, 232, '28px sans-serif', '#4e5969', W - 96);
  // 细分隔线（y 276）
  ctx.fillStyle = '#f0f1f3';
  ctx.fillRect(48, 276, W - 96, 2);
  drawLine(ctx, infoLine(c), 48, 330, '26px sans-serif', '#4e5969', W - 96);
  // 经营领域（y 354..380）
  drawLine(ctx, c.businessField || '', 48, 380, '24px sans-serif', '#86909c', W - 96);
  // chips（y 404..444，浅灰底深字）
  drawChips(ctx, d.tags, 48, 404, 40, {
    font: '24px sans-serif', fg: '#1d2129', bg: '#f5f6f7',
    radius: 20, gap: 16, padX: 16, maxRight: W - 48,
  });

  // 二维码左置 + 右侧引导文案
  if (qr) ctx.drawImage(qr, 48, 560, 320, 320);
  ctx.font = 'bold 32px sans-serif';
  ctx.fillStyle = ink;
  ctx.fillText('扫码查看', 408, 690);
  ctx.fillText('电子名片', 408, 734);
  ctx.font = '24px sans-serif';
  ctx.fillStyle = '#86909c';
  ctx.fillText('长按或扫一扫', 408, 776);
  // 品牌色小点缀
  ctx.fillStyle = primary;
  ctx.fillRect(408, 820, 48, 6);
  footerPhone(ctx, c, H, '#c9cdd4');
}

/** 4 渐变全屏：整页品牌渐变 + 居中头像 + 白垫二维码 */
function drawGradient(ctx, d) {
  const { W, H, c, name, primary, gradient, qr, av } = d;
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, primary);
  g.addColorStop(1, gradient);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(W - 40, 80, 190, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(30, H - 60, 150, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  drawAvatar(ctx, av, W / 2, 180, 72, name, 'rgba(255,255,255,0.9)', primary);
  drawLine(ctx, name, W / 2, 306, 'bold 60px sans-serif', '#ffffff', W - 96, 'center');
  drawLine(ctx, c.position || '', W / 2, 352, '28px sans-serif', 'rgba(255,255,255,0.85)', W - 96, 'center');
  drawLine(ctx, infoLine(c), W / 2, 396, '26px sans-serif', 'rgba(255,255,255,0.72)', W - 96, 'center');
  // 经营领域（居中，y 418..444）
  drawLine(ctx, c.businessField || '', W / 2, 444, '24px sans-serif', 'rgba(255,255,255,0.66)', W - 96, 'center');

  // chips 居中（y 470..510）：先算总宽再起点居中
  const tags = d.tags || [];
  ctx.font = '24px sans-serif';
  const gap = 16, padX = 16;
  const widths = tags.map((t) => ctx.measureText(fitText(ctx, t, 160)).width + padX * 2);
  const total = widths.reduce((s, w) => s + w, 0) + gap * Math.max(0, tags.length - 1);
  if (total <= W - 96) {
    let tx = (W - total) / 2;
    tags.forEach((t, i) => {
      const label = fitText(ctx, t, 160);
      const tw = widths[i];
      fillRound(ctx, tx, 470, tw, 40, 20, 'rgba(255,255,255,0.18)');
      ctx.font = '24px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, tx + padX, 470 + 21);
      ctx.textBaseline = 'alphabetic';
      tx += tw + gap;
    });
  }

  drawQrPanel(ctx, qr, W / 2 - 160, 580, 320, 24, 22);
  ctx.font = '24px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.textAlign = 'center';
  ctx.fillText('长按或微信扫一扫，查看电子名片', W / 2, 942);
  ctx.textAlign = 'left';
}

const DRAWERS = {
  classic: drawClassic,
  dark: drawDark,
  minimal: drawMinimal,
  gradient: drawGradient,
};

/**
 * 按风格绘制海报。
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} opts { W, H, card, primary, gradient, ink, qrImg, avatarImg, styleKey }
 */
export function drawPosterByStyle(ctx, opts = {}) {
  const W = opts.W || POSTER_W;
  const H = opts.H || POSTER_H;
  const c = opts.card || {};
  const key = DRAWERS[opts.styleKey] ? opts.styleKey : 'classic';
  DRAWERS[key](ctx, {
    W, H, c,
    name: c.name || '电子名片',
    tags: parseTags(c.needTags),
    primary: opts.primary || '#165dff',
    gradient: opts.gradient || '#165dff',
    ink: opts.ink || '#ffffff',
    qr: opts.qrImg || null,
    av: opts.avatarImg || null,
  });
}
