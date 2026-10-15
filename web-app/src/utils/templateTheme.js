// 名片模板主题工具：新 Schema（heroLayout + 视觉字段）+ 旧 Schema（primary/background/radius）兼容
// 供名片详情页 hero、创建页实时预览卡、模板缩略图复用
import { shadeHex, mixHex, isReadableOn, hexLuma, heroGradient } from './color.js';

// 解析并归一化模板主题配置
export function parseTheme(tc) {
  if (!tc || typeof tc !== 'object') return null;
  const t = { ...tc };
  t.primary = t.primary || '';
  t.background = t.background || '';
  // 🔴 同样是 0 值陷阱：`Number(t.radius) || 18` 让「零圆角」永远设不出来。
  //    统一在解析层做数值规范化 + 夹取（0~48），下游所有位置共享同一口径。
  const radiusRaw = Number(t.radius);
  t.radius = Number.isFinite(radiusRaw) ? Math.max(0, Math.min(48, radiusRaw)) : 18;
  t.heroLayout = ['cls', 'ctr', 'mag', 'royal', 'pano1', 'pano2', 'pano3', 'pano4', 'pano5', 'pano6'].includes(t.heroLayout) ? t.heroLayout : 'cls';
  t.bgType = ['solid', 'gradient', 'glass', 'paper'].includes(t.bgType) ? t.bgType : 'gradient';
  t.bgStart = t.bgStart || t.background || t.primary || '#165dff';
  const dark = shadeHex(t.bgStart, -0.3);
  t.bgEnd = t.bgEnd || dark || t.bgStart;
  // 🔴 0 是合法值（0deg 渐变角 / 零圆角）：`Number(x) || 默认` 会把 0 吞成默认值，
  //   必须用 Number.isFinite 判定，非法值才回落。
  const angle = Number(t.bgAngle);
  t.bgAngle = Number.isFinite(angle) ? Math.max(0, Math.min(360, angle)) : 160;
  t.textColor = t.textColor || '#ffffff';
  t.text2Color = t.text2Color || 'rgba(255,255,255,.85)';
  t.accent = t.accent || t.primary || '#165dff';
  t.fontFamily = t.fontFamily === 'serif' ? 'serif' : 'sans';
  t.border = ['gold', 'glow', 'none'].includes(t.border) ? t.border : 'none';
  t.borderColor = t.borderColor || t.accent || '#c9a25e';
  t.texture = ['spots', 'dots', 'grid', 'none'].includes(t.texture) ? t.texture : 'none';
  t.barTop = !!t.barTop;
  t.cardStyle = t.cardStyle === 'glass' ? 'glass' : 'solid';
  // 新皮肤开关（5版效果图 + 6款形象照版）
  t.guide = !!t.guide;
  t.companyCorner = !!t.companyCorner;
  t.companiesCard = !!t.companiesCard;
  t.cleanCard = !!t.cleanCard;
  t.quickSquare = !!t.quickSquare;
  t.nameBig = !!t.nameBig;
  t.guideSolid = !!t.guideSolid;
  t.maskLeft = !!t.maskLeft;
  t.maskBottom = !!t.maskBottom;
  t.photoFull = !!t.photoFull;
  t.circlePhoto = !!t.circlePhoto;
  t.photoLeft = !!t.photoLeft;
  t.magazineCard = !!t.magazineCard;
  t.bigPhoto = !!t.bigPhoto;
  return t;
}

/**
 * 🔴 hero 前景色唯一裁决口（2026-10-15 新增）：背景「实际亮度」决定明暗方向，
 * 再对配置色（模板 textColor / 租户品牌 text·subText·secondary）做对比度校验，
 * 不合格就用自动推导值。全站 hero 前景（姓名/职务/图标/徽章/分隔线/描边/导航栏）
 * 必须全部走这里，禁止各处自行取品牌色另判断据——否则「一部分按背景算、一部分照抄配置」
 * 就会出现同屏「黑字 + 白图标 + 黄职务色」的混搭（真机截图报修）。
 *
 * 典型场景：租户配 primary=#FCB801 亮黄 + text=#FFFFFF 白（自相矛盾的五色）
 *   → 背景判浅色 → text 白 对比度 1.75 不达标 → 自动回落 #1d2129 深灰；
 *     subText 黄字压黄底（1.03）→ 自动回落半透明深灰；secondary 奶油点缀（1.3）→ 回落主色暗阶。
 *
 * @param {string} bgStart hero 背景起点色 @param {string} bgEnd hero 背景终点色
 * @param {object} cfg { text, text2, accent } 期望前景（可为空，缺失即自动）
 * @returns {{ light, bg, text, text2, accent, border }}
 */
export function heroForeground(bgStart, bgEnd, cfg = {}) {
  const bg = mixHex(bgStart, bgEnd, 0.5) || shadeHex(bgStart, 0) || '#165dff';
  const l = hexLuma(bg);
  const light = l !== null && l > 180;
  const c = cfg || {};
  return {
    light,
    bg,
    // 主文字/次级文字按可读线 3.0 裁决；点缀/描边是装饰，1.6 可见即可（否则误杀深色描边）
    text: isReadableOn(c.text, bg, 3) ? c.text : (light ? '#1d2129' : '#ffffff'),
    text2: isReadableOn(c.text2, bg, 2.4) ? c.text2 : (light ? 'rgba(29,33,41,.78)' : 'rgba(255,255,255,.85)'),
    accent: isReadableOn(c.accent, bg, 1.6) ? c.accent : (light ? (shadeHex(bgStart, -0.45) || '#8a6f00') : (shadeHex(bgStart, 0.35) || '#ffffff')),
    border: light ? 'rgba(0,0,0,.14)' : (isReadableOn(c.accent, bg, 1.6) ? c.accent : 'rgba(255,255,255,.38)'),
  };
}

/**
 * 品牌渐变 hero 的统一出口（会员中心 / 分销各页等「非模板 hero」）：
 * 背景 = heroGradient（品牌渐变），前景 = heroForeground 裁决出的可读文字色。
 * 🔴 这些页过去把 SIcon color 写死 #ffffff、CSS 写死 color:#fff——品牌色一旦是亮黄
 *    （如 #FCB801）就变成白字压黄底，对比度只剩 1.67，不可读。统一走这里后深浅自动。
 * @returns {{ background: string, color: string }} 直接喂给 hero 根 :style
 */
export function heroBrandStyle(b, fallbackBg = '') {
  const primary = (b && b.primary) || '';
  const fg = heroForeground(primary || '#165dff', (b && b.gradient) || primary || '#165dff', { text: '#ffffff' });
  return {
    background: heroGradient(primary, (b && b.gradient) || '', fallbackBg),
    color: fg.text,
  };
}

// hero 背景 + 描边（内联 style）
export function heroBgStyle(theme) {
  const t = parseTheme(theme);
  if (!t) return {};
  const style = {};
  if (t.bgType === 'solid') {
    style.background = t.bgStart;
  } else {
    style.background = `linear-gradient(${t.bgAngle}deg, ${t.bgStart}, ${t.bgEnd})`;
  }
  if (t.border === 'gold') {
    style.border = `1px solid ${t.borderColor}`;
    style.boxShadow = `0 0 24rpx rgba(201,162,94,.28)`;
  } else if (t.border === 'glow') {
    style.border = `1px solid ${t.borderColor}`;
    style.boxShadow = `0 0 30rpx rgba(77,141,255,.45)`;
  }
  return style;
}

// hero 主文字样式（颜色）
// 🔴 只返回 color：**font-family 绝不能放内联**。小程序 setStyle 对含双引号的值
// （'"Songti SC","STSong","SimSun",serif'）会让**整条 style 失效** → 浅色 hero 上的
// 深色文字退回 CSS 的 #fff 变白字（真机才复现）。衬线体改走 CSS 类 hero-serif。
export function heroTextStyle(theme) {
  const t = parseTheme(theme);
  if (!t) return {};
  return { color: t.textColor };
}

// hero 衬线字体类名（配合页面 CSS：.hero-serif .nm/.ctr-name/.mag-name 等）
export function heroFontClass(theme) {
  const t = parseTheme(theme);
  return t && t.fontFamily === 'serif' ? 'hero-serif' : '';
}

// hero 次级文字样式
export function heroText2Style(theme) {
  const t = parseTheme(theme);
  if (!t) return {};
  return { color: t.text2Color };
}

// 点缀色样式（分隔线/标签/强调）
export function heroAccentStyle(theme) {
  const t = parseTheme(theme);
  if (!t) return {};
  return { color: t.accent };
}

// 顶部渐变条（barTop）
export function heroBarTopStyle(theme) {
  const t = parseTheme(theme);
  if (!t || !t.barTop) return null;
  return {
    background: `linear-gradient(90deg, ${t.accent}, ${t.bgEnd})`,
  };
}

// 纹理背景（radial/linear-gradient data uri，H5+小程序均支持 background-image 渐变）
export function heroTextureBg(theme) {
  const t = parseTheme(theme);
  if (!t) return '';
  if (t.texture === 'spots') {
    return 'radial-gradient(rgba(255,255,255,.15) 2rpx, transparent 3rpx), radial-gradient(rgba(255,255,255,.09) 3rpx, transparent 4rpx)';
  }
  if (t.texture === 'dots') {
    return 'radial-gradient(rgba(201,162,94,.22) 2rpx, transparent 3rpx), radial-gradient(rgba(201,162,94,.12) 3rpx, transparent 5rpx)';
  }
  if (t.texture === 'grid') {
    return 'linear-gradient(rgba(255,255,255,.09) 1rpx, transparent 1rpx), linear-gradient(90deg, rgba(255,255,255,.09) 1rpx, transparent 1rpx)';
  }
  return '';
}

// hero 版式 class 后缀（cls/ctr/mag）
export function heroLayoutClass(theme) {
  const t = parseTheme(theme);
  return t ? t.heroLayout : 'cls';
}

// 头像/卡片的圆角
export function heroRadius(theme, avatar = false) {
  const t = parseTheme(theme);
  if (!t) return avatar ? '32rpx' : '24rpx';
  // 🔴 同上：`Number(t.radius) || 18` 让「零圆角」永远设不出来（模板明确配 0 会被改成 18）。
  const radiusRaw = Number(t.radius);
  const base = Number.isFinite(radiusRaw) ? Math.max(0, Math.min(48, radiusRaw)) : 18;
  // 头像圆角比卡片略大，杂志版式/圆像明净用圆形
  if (avatar) {
    return t.heroLayout === 'mag' || t.heroLayout === 'pano3' ? '50%' : `${Math.min(base + 14, 36)}rpx`;
  }
  if (t.heroLayout === 'pano6') return `${Math.min(base + 6, 26)}rpx`;
  return `${Math.min(base, 24)}rpx`;
}

// 毛玻璃卡片（cardStyle=glass）
export function heroGlassStyle(theme) {
  const t = parseTheme(theme);
  if (!t || t.cardStyle !== 'glass') return null;
  return {
    background: 'rgba(255,255,255,.10)',
    border: '1px solid rgba(255,255,255,.18)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
  };
}
