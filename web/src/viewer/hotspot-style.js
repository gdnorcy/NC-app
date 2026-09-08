/**
 * 热点指向样式：预设主题 / 配色归一 / 动效类型（纯函数，H5 与小程序共用）
 *
 * 场景 meta.hotspotStyle 结构：
 *   { effect: 'pulse' | 'ripple' | 'none', theme: 'blue'|'gold'|'orange'|'green', jumpColor, infoColor }
 * - theme 提供跳转/信息点默认配色；自定义色值（#RRGGBB）优先于主题。
 */
export const HOTSPOT_THEMES = {
  blue: { jump: '#165DFF', info: '#FF7D00', label: '默认蓝' },
  gold: { jump: '#C8893B', info: '#722ED1', label: '商务金' },
  orange: { jump: '#FF7D00', info: '#165DFF', label: '活力橙' },
  green: { jump: '#00B42A', info: '#722ED1', label: '生态绿' },
};

export const HOTSPOT_EFFECTS = ['pulse', 'ripple', 'none'];

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** 归一化热点样式：非法值回退主题/默认，保证渲染端永远拿到合法配置 */
export function normalizeHotspotStyle(style = {}) {
  const theme = HOTSPOT_THEMES[style.theme] || HOTSPOT_THEMES.blue;
  return {
    effect: HOTSPOT_EFFECTS.includes(style.effect) ? style.effect : 'pulse',
    theme: style.theme in HOTSPOT_THEMES ? style.theme : 'blue',
    jumpColor: COLOR_RE.test(style.jumpColor) ? style.jumpColor : theme.jump,
    infoColor: COLOR_RE.test(style.infoColor) ? style.infoColor : theme.info,
  };
}

/** 取某类型热点的显示色（jump=跳转点 / 其他=信息点） */
export function hotspotColor(style, type) {
  const s = normalizeHotspotStyle(style);
  return type === 'scene' ? s.jumpColor : s.infoColor;
}

/** 主题预设快速生成（三端同构） */
export function themeColors(theme) {
  const t = HOTSPOT_THEMES[theme] || HOTSPOT_THEMES.blue;
  return { jump: t.jump, info: t.info };
}

/**
 * 方位感知箭头旋转角（弧度，用于 SpriteMaterial.rotation）。
 * dx/dy = 热点相对当前视角中心的方向（相机局部坐标：右/上）。
 * 箭头默认朝上（90°），旋转后指向画面中心 v=(-dx,-dy)。
 * 热点在左(dx<0)→指向右(≈-π/2)；在上(dy>0)→指向下(≈±π)。
 */
export function hotspotArrowAngle(dx, dy) {
  return Math.atan2(-dy, -dx) - Math.PI / 2;
}
