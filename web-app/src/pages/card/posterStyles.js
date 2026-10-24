/**
 * 名片分享海报风格库（#312-15 重构）
 *
 * 背景：
 *  - #312-13 用户反馈「①文字叠在一起 ②要多款风格可选」→ 绘制逻辑迁此模块，每行 y 区间
 *    两两不重叠，弹层内风格切换即重绘，选择持久化 cardPosterStyle。当时落地 4 款
 *    （classic/dark/minimal/gradient）。
 *  - #312-15 用户重新选了 8 款候选里的 5 款（奶油暖白/晨雾蓝/樱粉柔光/薄荷清新/曜石黑金），
 *    并明确：①地名（东莞）不在名片上显示 → infoLine 只留公司；②各款顶部横线去掉；
 *    ③电话从页脚小灰字改为高亮胶囊条（更醒目）。原 4 款删除，换成这 5 款各自固定配色。
 *
 * 本模块仅依赖标准 Canvas 2D API（H5 与微信小程序 canvas type="2d" 通用），无 MP 模板参与。
 *
 * 🔴 布局铁律（来自 #312-13 叠字反馈）：每一款**每一行内容 y 区间必须两两不重叠**，
 *   posterStyles.test.js 按数值钉死各行 y 断言，改 y 值须同步改测试。
 * 🔴 各款用自身固定配色，不读用户模板 primary/gradient/ink（与「设计不同风格」意图一致）。
 */

export const POSTER_W = 600;
export const POSTER_H = 960;

/** 风格注册表（顺序即 UI 展示顺序） */
export const POSTER_STYLES = [
  { key: 'cream', label: '奶油暖白' },
  { key: 'misty', label: '晨雾蓝' },
  { key: 'sakura', label: '樱粉柔光' },
  { key: 'mint', label: '薄荷清新' },
  { key: 'obsidian', label: '曜石黑金' },
];

// ---------------------------------------------------------------- 小工具

function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** hex → rgba() 字符串（画布半透明用） */
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
// 🔴 #312-17：微信返回的小程序码是 JPEG、底色纯白（实测四角像素 255,255,255），直接
// drawImage 就是一块硬白方块，跟白卡 36px 圆角/电话胶囊完全不是一套语言。
// 统一垫一层「白色圆角底板」：半径取边长 ~11%（220→24、200→22，与深色款 24 对齐），
// 底板内缩 pad 再画码 —— 码本体一个像素都不裁不缩，静默区完整，识别率不变。
const QR_PLATE_RATIO = 0.11;
const QR_PLATE_PAD = 12;
function drawQrPanel(ctx, qr, x, y, size, radius, pad) {
  if (!qr) return;
  const p = pad == null ? 20 : pad;
  fillRound(ctx, x, y, size, size, radius == null ? 24 : radius, '#FFFFFF');
  ctx.drawImage(qr, x + p, y + p, size - p * 2, size - p * 2);
}

/**
 * 🔴 #312-15 电话胶囊条：放在标签下方、accent 高亮加粗（替代页脚小灰字，更醒目）。
 * 结构：圆点 + 「电话」+ 号码，浅色胶囊底。
 */
function phonePill(ctx, c, opts) {
  if (!c.phone) return;
  const { y, accent, tint, sub, x, cx } = opts;
  ctx.font = '24px sans-serif';
  const lw = ctx.measureText('电话').width;
  ctx.font = 'bold 34px sans-serif';
  const nw = ctx.measureText(c.phone).width;
  const w = 24 * 2 + 14 + 20 + lw + 12 + nw;
  const h = 56;
  const px = cx != null ? cx - w / 2 : x;
  fillRound(ctx, px, y, w, h, 28, tint);
  ctx.beginPath();
  ctx.arc(px + 24 + 7, y + h / 2, 7, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.textBaseline = 'middle';
  let tx = px + 24 + 20;
  ctx.font = '24px sans-serif';
  ctx.fillStyle = sub;
  ctx.fillText('电话', tx, y + h / 2 + 1);
  tx += lw + 12;
  ctx.font = 'bold 34px sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(c.phone, tx, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
}

/** 二维码 + 右侧两行引导文案（左对齐浅底风格共用） */
function qrWithGuide(ctx, d, t, qrX, qrY, qrS, guideX) {
  // 走圆角白板，不再裸贴（二维码图片自带白底，底板圆角 = 看到的就是圆边矩形）
  drawQrPanel(ctx, d.qr, qrX, qrY, qrS, Math.round(qrS * QR_PLATE_RATIO), QR_PLATE_PAD);
  const cy = qrY + qrS / 2;
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = t.nameColor;
  ctx.fillText('扫码查看', guideX, cy - 24);
  ctx.fillText('电子名片', guideX, cy + 18);
  ctx.font = '22px sans-serif';
  ctx.fillStyle = t.subColor;
  ctx.fillText('长按或微信扫一扫', guideX, cy + 62);
  ctx.textBaseline = 'alphabetic';
}

// 🔴 #312-15：公司·城市 → 只留公司。用户明确「东莞这个区域不要在名片上显示」。
function infoLine(c) {
  return c.company || '';
}

function parseTags(raw) {
  try {
    const a = JSON.parse(raw || '[]');
    return Array.isArray(a) ? a.slice(0, 3).map(String) : [];
  } catch (e) {
    return [];
  }
}

// 纵向节奏（左对齐风格共用，行区间两两不重叠）：
// 头像 144..256 / 名 360 / 职 414 / 组织 458 / 领域 502 / chips 530..570 /
// 电话胶囊 606..662 / 二维码 696..916
const NAME_Y = 360, POS_Y = 414, ORG_Y = 458, FIELD_Y = 502, CHIPS_Y = 530, PILL_Y = 606, QR_Y = 696, QR_S = 220;

/** 浅底无卡片风格共用主体（misty/sakura）：头像在左上，整页浅底渐变 */
function bodyPlain(ctx, d, t) {
  const { W, c, name, tags } = d;
  drawAvatar(ctx, d.av, 110, 200, 56, name, t.discBg, t.discFg);
  drawLine(ctx, name, 48, NAME_Y, 'bold 64px sans-serif', t.nameColor, W - 96);
  drawLine(ctx, c.position || '', 48, POS_Y, '28px sans-serif', t.subColor, W - 96);
  drawLine(ctx, infoLine(c), 48, ORG_Y, '26px sans-serif', t.subColor, W - 96);
  drawLine(ctx, c.businessField || '', 48, FIELD_Y, '24px sans-serif', t.faint, W - 96);
  drawChips(ctx, tags, 48, CHIPS_Y, 40, { font: '24px sans-serif', fg: t.chipFg, bg: t.chipBg, border: t.chipBorder, radius: 20, gap: 16, padX: 16, maxRight: W - 48 });
  phonePill(ctx, c, { x: 48, y: PILL_Y, accent: t.accent, tint: t.pillTint, sub: t.subColor });
  qrWithGuide(ctx, d, t, 48, QR_Y, QR_S, 300);
}

/** 浅底白卡片风格共用主体（cream/mint）：内容内缩到卡片内 (x=98)，卡片 90..930 */
function bodyCard(ctx, d, t) {
  const { W, c, name, tags } = d;
  const X = 98;
  drawAvatar(ctx, d.av, X + 56, 200, 56, name, t.discBg, t.discFg);
  drawLine(ctx, name, X, NAME_Y, 'bold 64px sans-serif', t.nameColor, W - X * 2);
  drawLine(ctx, c.position || '', X, POS_Y, '28px sans-serif', t.subColor, W - X * 2);
  drawLine(ctx, infoLine(c), X, ORG_Y, '26px sans-serif', t.subColor, W - X * 2);
  drawLine(ctx, c.businessField || '', X, FIELD_Y, '24px sans-serif', t.faint, W - X * 2);
  // 卡片右缘 = 50 + (W-100) = 550；chips 右界取卡片内缩 48 = 502（与文本行 maxWidth 终点一致）
  drawChips(ctx, tags, X, CHIPS_Y, 40, { font: '24px sans-serif', fg: t.chipFg, bg: t.chipBg, border: t.chipBorder, radius: 20, gap: 16, padX: 16, maxRight: X + (W - X * 2) });
  phonePill(ctx, c, { x: X, y: PILL_Y, accent: t.accent, tint: t.pillTint, sub: t.subColor });
  qrWithGuide(ctx, d, t, X, QR_Y, 200, X + 220 + 24);
}

// ---------------------------------------------------------------- 5 款风格

// 1 奶油暖白：米白底 + 暖棕描边卡片 + 柔和阴影（#312-15：去顶部横线）
function drawCream(ctx, d) {
  const { W, H } = d;
  const t = {
    discBg: '#B08968', discFg: '#fff', nameColor: '#3A2E25', subColor: '#7A6A5C',
    faint: '#9A8A7C', chipFg: '#7A6A5C', chipBorder: '#D9C7B5', accent: '#B08968',
    pillTint: 'rgba(176,137,104,0.12)',
  };
  ctx.fillStyle = '#FBF7F0'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.shadowColor = 'rgba(120,90,60,0.18)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
  fillRound(ctx, 50, 90, W - 100, 840, 36, '#FFFFFF');
  ctx.restore();
  bodyCard(ctx, d, t);
}

// 2 晨雾蓝：浅蓝渐变 + 清爽科技
function drawMisty(ctx, d) {
  const { W, H } = d;
  const t = {
    discBg: '#3E7CB1', discFg: '#fff', nameColor: '#16324B', subColor: '#3E7CB1',
    faint: '#6E92B0', chipFg: '#16324B', chipBorder: '#BBD3EA', accent: '#3E7CB1',
    pillTint: 'rgba(62,124,177,0.1)',
  };
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#EAF2FB'); g.addColorStop(1, '#D8E8F8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  bodyPlain(ctx, d, t);
}

// 3 樱粉柔光：极浅粉 + 珊瑚点缀 + 柔光圆
function drawSakura(ctx, d) {
  const { W, H } = d;
  const t = {
    discBg: '#E8738C', discFg: '#fff', nameColor: '#7A2E44', subColor: '#C25F79',
    faint: '#D98FA0', chipFg: '#7A2E44', chipBorder: '#F3C2CE', accent: '#E8738C',
    pillTint: 'rgba(232,115,140,0.1)',
  };
  ctx.fillStyle = '#FCEEF3'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#FBD0DC';
  ctx.beginPath(); ctx.arc(W - 80, 120, 160, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  bodyPlain(ctx, d, t);
}

// 4 薄荷清新：白卡 + 浅薄荷底
function drawMint(ctx, d) {
  const { W, H } = d;
  const t = {
    discBg: '#2E9E6B', discFg: '#fff', nameColor: '#1E5C40', subColor: '#2E9E6B',
    faint: '#5BA683', chipFg: '#1E5C40', chipBg: '#D6F0E3', chipBorder: '#A9DCC3',
    accent: '#2E9E6B', pillTint: 'rgba(46,158,107,0.1)',
  };
  ctx.fillStyle = '#E6F7EE'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.shadowColor = 'rgba(30,92,64,0.14)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 8;
  fillRound(ctx, 50, 90, W - 100, 840, 36, '#FFFFFF');
  ctx.restore();
  bodyCard(ctx, d, t);
}

// 5 曜石黑金：深黑底 + 金色点缀（#312-15：去顶部小金杠，保留右上角光晕）
function drawObsidian(ctx, d) {
  const { W, c, name, tags, qr, av } = d;
  ctx.fillStyle = '#0E0F13'; ctx.fillRect(0, 0, 600, 960);
  ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = '#C9A24B';
  ctx.beginPath(); ctx.arc(550, 40, 240, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  drawAvatar(ctx, av, 110, 190, 56, name, 'rgba(201,162,75,0.18)', '#C9A24B');
  drawLine(ctx, name, 48, 330, 'bold 64px sans-serif', '#F4ECD8', 600 - 96);
  drawLine(ctx, c.position || '', 48, 382, '26px sans-serif', 'rgba(244,236,216,0.78)', 600 - 96);
  drawLine(ctx, infoLine(c), 48, 422, '26px sans-serif', 'rgba(244,236,216,0.62)', 600 - 96);
  drawLine(ctx, c.businessField || '', 48, 460, '24px sans-serif', 'rgba(244,236,216,0.5)', 600 - 96);
  drawChips(ctx, tags, 48, 492, 40, { font: '24px sans-serif', fg: '#C9A24B', border: 'rgba(201,162,75,0.4)', radius: 20, gap: 16, padX: 16, maxRight: 600 - 48 });
  phonePill(ctx, c, { x: 48, y: 562, accent: '#C9A24B', tint: 'rgba(201,162,75,0.12)', sub: 'rgba(244,236,216,0.66)' });
  drawQrPanel(ctx, qr, 48, 650, 280, 24, 22);
  ctx.font = 'bold 24px sans-serif'; ctx.fillStyle = '#C9A24B';
  ctx.fillText('扫码查看电子名片', 344, 760);
  ctx.font = '22px sans-serif'; ctx.fillStyle = 'rgba(244,236,216,0.6)';
  ctx.fillText('长按或微信扫一扫', 344, 800);
}

const DRAWERS = {
  cream: drawCream,
  misty: drawMisty,
  sakura: drawSakura,
  mint: drawMint,
  obsidian: drawObsidian,
};

/**
 * 按风格绘制海报。
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} opts { W, H, card, primary, gradient, ink, qrImg, avatarImg, styleKey }
 *   primary/gradient/ink 仅保留签名兼容（本模块各款用自身固定配色，不读模板色）。
 */
export function drawPosterByStyle(ctx, opts = {}) {
  const W = opts.W || POSTER_W;
  const H = opts.H || POSTER_H;
  const c = opts.card || {};
  const key = DRAWERS[opts.styleKey] ? opts.styleKey : 'cream';
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
