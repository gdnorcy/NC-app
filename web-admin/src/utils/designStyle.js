// 设计中心「系统风格」1:1 复刻菜鸟云：14 套预设配色 + 方案应用纯函数
// 色值顺序 = 主题/渐变/辅助/文字/文字辅色，与对标 stylediy 页 colors_arr 实测一致

export const STYLE_SCHEMES = [
  { name: '碳黑', primaryColor: '#373C46', gradientColor: '#484D58', secondaryColor: '#EBEBEC', textColor: '#FFFFFF', subTextColor: '#373C46' },
  { name: '克莱因蓝', primaryColor: '#002FA4', gradientColor: '#1149D2', secondaryColor: '#E5EAF6', textColor: '#FFFFFF', subTextColor: '#002FA4' },
  { name: '琉璃蓝', primaryColor: '#165AE2', gradientColor: '#407cf6', secondaryColor: '#D0DEF9', textColor: '#FFFFFF', subTextColor: '#165AE2' },
  { name: '青蓝', primaryColor: '#0DA29D', gradientColor: '#0FBBB5', secondaryColor: '#CFECEB', textColor: '#FFFFFF', subTextColor: '#0DA29D' },
  { name: '深绿', primaryColor: '#0E9069', gradientColor: '#0E9082', secondaryColor: '#CFE9E1', textColor: '#FFFFFF', subTextColor: '#0E9069' },
  { name: '草绿', primaryColor: '#4FA140', gradientColor: '#20AD80', secondaryColor: '#DCECD9', textColor: '#FFFFFF', subTextColor: '#4FA140' },
  { name: '姜黄', primaryColor: '#FCB801', gradientColor: '#FCC601', secondaryColor: '#FFF8E5', textColor: '#FFFFFF', subTextColor: '#FCB801' },
  { name: '香槟金', primaryColor: '#AA7646', gradientColor: '#D29256', secondaryColor: '#EEE4DA', textColor: '#FFFFFF', subTextColor: '#AA7646' },
  { name: '赤橙', primaryColor: '#FF4400', gradientColor: '#FF884F', secondaryColor: '#FFDACC', textColor: '#FFFFFF', subTextColor: '#FF4400' },
  { name: '绯红', primaryColor: '#F7201E', gradientColor: '#FD674D', secondaryColor: '#FEE8E8', textColor: '#FFFFFF', subTextColor: '#F7201E' },
  { name: '玫红', primaryColor: '#FE0137', gradientColor: '#FF5169', secondaryColor: '#FFE5EB', textColor: '#FFFFFF', subTextColor: '#FE0137' },
  { name: '粉红', primaryColor: '#FF3A68', gradientColor: '#FF547C', secondaryColor: '#FFEBF0', textColor: '#FFFFFF', subTextColor: '#FF3A68' },
  { name: '深紫', primaryColor: '#722ED1', gradientColor: '#7C72E0', secondaryColor: '#E3D5F6', textColor: '#FFFFFF', subTextColor: '#722ED1' },
  { name: '蓝紫', primaryColor: '#6954F0', gradientColor: '#4068F9', secondaryColor: '#DBD5FF', textColor: '#FFFFFF', subTextColor: '#6954F0' },
];

/** 默认系统风格 = 玫红（11 号方案）；headColor 1=跟随主色 / 2=白色头部 */
export const DEFAULT_STYLE = {
  headColor: '1', headText: '#ffffff', colorScheme: 11,
  primaryColor: '#FE0137', gradientColor: '#FF5169', secondaryColor: '#FFE5EB',
  textColor: '#FFFFFF', subTextColor: '#FE0137',
};

/** 应用配色方案：n=1-14 预设 / n=0 自定义（保留当前 5 色，仅标记自定义） */
export function applyScheme(style, n) {
  if (n === 0) return { ...style, colorScheme: 0 };
  const s = STYLE_SCHEMES[n - 1];
  if (!s) return { ...style };
  return { ...style, colorScheme: n, primaryColor: s.primaryColor, gradientColor: s.gradientColor, secondaryColor: s.secondaryColor, textColor: s.textColor, subTextColor: s.subTextColor };
}

/**
 * 预览头部样式（菜鸟云 choose_style_head 实测规则，2026-09-17 定案）：
 * - 跟随主色：主色底 + 头部文字色（radio 值）
 * - 白色头部：白底；切到白色头部瞬间文字强制黑（forceBlack=true，radio 值不动）；
 *   用户点击过文字选项后（forceBlack=false）按 radio 值渲染（白头部+白字可生效）
 */
export function headPreviewStyle(style, forceBlack = false) {
  if (style.headColor === '2') return { background: '#FFFFFF', color: forceBlack ? '#000000' : style.headText };
  return { background: style.primaryColor, color: style.headText };
}

/** hex 颜色 → rgba（覆盖层浅色底用，如上门自提浅青背景 = 主色 25% 透明） */
export function hexA(hex, alpha) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return hex || '#000';
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
