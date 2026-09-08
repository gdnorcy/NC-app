/**
 * 热点指向样式（编辑端/管理端共用纯函数）：
 * 预设主题 / 配色归一 / 动效类型。渲染端(web/src/viewer/hotspot-style.js)保持同构。
 */
export const HOTSPOT_THEMES = {
  blue: { jump: '#165DFF', info: '#FF7D00', label: '默认蓝' },
  gold: { jump: '#C8893B', info: '#722ED1', label: '商务金' },
  orange: { jump: '#FF7D00', info: '#165DFF', label: '活力橙' },
  green: { jump: '#00B42A', info: '#722ED1', label: '生态绿' },
};

export const HOTSPOT_EFFECTS = ['pulse', 'ripple', 'none'];

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function normalizeHotspotStyle(style = {}) {
  const theme = HOTSPOT_THEMES[style.theme] || HOTSPOT_THEMES.blue;
  return {
    effect: HOTSPOT_EFFECTS.includes(style.effect) ? style.effect : 'pulse',
    theme: style.theme in HOTSPOT_THEMES ? style.theme : 'blue',
    jumpColor: COLOR_RE.test(style.jumpColor) ? style.jumpColor : theme.jump,
    infoColor: COLOR_RE.test(style.infoColor) ? style.infoColor : theme.info,
  };
}

/** 主题预设：选择主题后自动填充双色 */
export function themeColors(theme) {
  const t = HOTSPOT_THEMES[theme] || HOTSPOT_THEMES.blue;
  return { jump: t.jump, info: t.info };
}
