// 名片模板主题工具：新 Schema（heroLayout + 视觉字段）+ 旧 Schema（primary/background/radius）兼容
// 供名片详情页 hero、创建页实时预览卡、模板缩略图复用
import { shadeHex } from './color.js';

// 解析并归一化模板主题配置
export function parseTheme(tc) {
  if (!tc || typeof tc !== 'object') return null;
  const t = { ...tc };
  t.primary = t.primary || '';
  t.background = t.background || '';
  t.radius = t.radius ?? 18;
  t.heroLayout = ['cls', 'ctr', 'mag'].includes(t.heroLayout) ? t.heroLayout : 'cls';
  t.bgType = ['solid', 'gradient', 'glass', 'paper'].includes(t.bgType) ? t.bgType : 'gradient';
  t.bgStart = t.bgStart || t.background || t.primary || '#165dff';
  const dark = shadeHex(t.bgStart, -0.3);
  t.bgEnd = t.bgEnd || dark || t.bgStart;
  t.bgAngle = Number(t.bgAngle) || 160;
  t.textColor = t.textColor || '#ffffff';
  t.text2Color = t.text2Color || 'rgba(255,255,255,.85)';
  t.accent = t.accent || t.primary || '#165dff';
  t.fontFamily = t.fontFamily === 'serif' ? 'serif' : 'sans';
  t.border = ['gold', 'glow', 'none'].includes(t.border) ? t.border : 'none';
  t.borderColor = t.borderColor || t.accent || '#c9a25e';
  t.texture = ['spots', 'dots', 'grid', 'none'].includes(t.texture) ? t.texture : 'none';
  t.barTop = !!t.barTop;
  t.cardStyle = t.cardStyle === 'glass' ? 'glass' : 'solid';
  return t;
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

// hero 主文字样式（颜色+字体）
export function heroTextStyle(theme) {
  const t = parseTheme(theme);
  if (!t) return {};
  return {
    color: t.textColor,
    fontFamily: t.fontFamily === 'serif' ? '"Songti SC","STSong","SimSun",serif' : 'inherit',
  };
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
  const base = Number(t.radius) || 18;
  // 头像圆角比卡片略大，杂志版式用圆形
  if (avatar) {
    return t.heroLayout === 'mag' ? '50%' : `${Math.min(base + 14, 36)}rpx`;
  }
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
