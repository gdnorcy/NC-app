/**
 * 创建名片页配色 token（2026-10-06 抽出便于单测）
 *
 * 单一事实来源：创建页（pages/card/create.vue）整页 UI 外壳的配色 token。
 *
 * ⚠️ 历史包袱（本模块存在的原因）：这套餐色原本取自**名片模板的 themeConfig**
 * （lpTheme.accent / bgStart），于是「换一个名片模板 → 整页表单换色」。但名片预览卡
 * 已在 d467254 删除，页面里已不存在「需按模板真实色渲染」的元素 → 配色源改为**系统主题**
 *（设计中心「系统风格」），用户改配色方案时本页立即跟随。
 *
 * 明暗分支按主色亮度判定（深色主题 →暗色皮肤），与原行为一致。
 * ⚠️ 兜底主色是品牌蓝 `#165dff`（亮度 92 < 160）→ **未配置配色时本页走 dark 皮肤**。
 *    这是历史行为；若想改成浅色兜底，必须同时确认视觉稿，不要只改这一个色值。
 * 语义色（成功绿/警示橙/VIP 金/钥匙绿/免费标签绿）刻意**不**跟随主题。
 *
 * 🎨 dark 皮肤画布原则（2026-10-07 用户反馈定稿）：**中性墨色画布 + 主题色只作点缀**。
 *    曾把整页背景铺成主色（shadeHex(accent,0.06)），蓝色时代勉强像「暗夜科技」，
 *    换高饱和红/橙就是整页泼彩，不可看。主题色的主场 = hero 头部、主按钮、焦点圈、
 *    分隔线、顶部光晕；画布/卡片/输入框一律中性（墨色底、白色发丝线），任何主色都成立。
 */
import { shadeHex } from './color.js';

/** 颜色亮度（0~255）。非 hex（rgba 等）按浅色 200 处理，与历史行为一致 */
export function hexLuma(color) {
  let c = String(color || '').trim();
  if (c.startsWith('#')) {
    c = c.slice(1);
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const n = parseInt(c, 16);
    if (!Number.isNaN(n) && c.length === 6) {
      return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    }
  }
  return 200; // 非 hex（rgba 等）按浅色处理
}

/** hex/rgba → rgba(..., alpha)，覆盖原透明度 */
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
 * 生成创建页全套 CSS 变量。
 * @param {object} theme designThemeVars() 的产物（--design-* ）
 * @returns {object} 可直接绑到根视图 :style 的 CSS 变量表
 */
export function buildCreateSkinVars(theme) {
  const t = theme || {};
  const accent = t['--design-primary'] || '#165dff';
  const bgEnd = t['--design-gradient'] || '#4d8dff';
  const tint = t['--design-secondary'] || '#E8F3FF';
  const light = hexLuma(accent) > 160;
  const v = {};
  v['--primary'] = accent;
  v['--success'] = accent;
  // 系统主题辅助色（浅底）：品牌方配色里本就配好的淡底，比自己调透明度更准
  v['--theme-tint'] = tint;
  v['--sk-bg'] = light
    ? `linear-gradient(180deg, ${hexA(accent, 0.12)}, transparent 280rpx), #f6f7fb`
    // 中性墨色画布 + 主题色顶部光晕（呼应 hero 头部色），不再整页泼主题色
    : `radial-gradient(120% 42% at 85% -6%, ${hexA(accent, 0.26)}, transparent 58%), radial-gradient(85% 38% at -10% 16%, ${hexA(accent, 0.12)}, transparent 55%), linear-gradient(180deg, #17171e, #0b0b0f)`;

  if (light) {
    v['--sk-header'] = `linear-gradient(135deg, ${accent}, ${shadeHex(accent, 0.28)})`;
    v['--sk-btn'] = `linear-gradient(135deg, ${accent}, ${shadeHex(accent, 0.28)})`;
    v['--sk-btn-text'] = '#ffffff';
    v['--sk-btn-glow'] = `0 4rpx 12rpx ${hexA(accent, 0.35)}`;
    v['--sk-btn-shine'] = 'inset 0 2rpx 0 rgba(255,255,255,0.35)';
    v['--bg-card'] = '#ffffff';
    v['--bg-hover'] = '#f2f3f5';
    v['--sk-card-bg'] = '#ffffff';
    v['--sk-hd-text'] = '#1d2129';
    v['--sk-hd-sub'] = '#a2a9b5';
    v['--t1'] = '#1d2129';
    v['--t2'] = '#4e5969';
    v['--t3'] = '#86909c';
    v['--border'] = '#e5e6eb';
    v['--border-strong'] = '#c9cdd4';
    v['--sk-skin'] = 'light';
    v['--sk-input-border'] = `1px solid ${hexA(accent, 0.45)}`;
    v['--sk-input-shadow'] = '0 2rpx 8rpx rgba(0,0,0,0.04)';
    v['--sk-input-bg'] = '#ffffff';
    v['--sk-input-text'] = '#1d2129';
    v['--sk-input-ph'] = '#a8b1bd';
    // 聚焦圈跟主色（旧代码写死 #2f6bff / rgba(47,107,255,.12) 是另一套蓝，永远对不上主题）
    v['--sk-input-focus'] = accent;
    v['--sk-card-frame'] = `0 0 0 1px ${hexA(accent, 0.16)}, 0 10rpx 24rpx ${hexA(accent, 0.12)}`;
  } else {
    v['--sk-header'] = `linear-gradient(155deg, ${accent}, ${bgEnd})`;
    v['--sk-btn'] = `linear-gradient(135deg, ${hexA(accent, 0.92)}, ${hexA(accent, 0.55)} 48%, ${shadeHex(accent, 0.1)})`;
    // 鎏金/亮色点缀按钮配深色文字（黑金=金钮深字，方案 3 G 同款）
    v['--sk-btn-text'] = hexLuma(accent) > 170 ? '#1d2129' : '#ffffff';
    v['--sk-btn-glow'] = `0 6rpx 18rpx ${hexA(accent, 0.4)}`;
    v['--sk-btn-shine'] = 'inset 0 2rpx 0 rgba(255,255,255,0.35)';
    v['--bg-card'] = 'rgba(255,255,255,0.09)';
    v['--bg-hover'] = 'rgba(255,255,255,0.16)';
    v['--sk-card-bg'] = 'rgba(255,255,255,0.08)';
    v['--sk-hd-text'] = '#ffffff';
    v['--sk-hd-sub'] = 'rgba(255,255,255,0.8)';
    v['--sk-title-font'] = '"Songti SC", "Noto Serif SC", serif';
    v['--t1'] = '#ffffff';
    v['--t2'] = 'rgba(255,255,255,0.8)';
    v['--t3'] = 'rgba(255,255,255,0.55)';
    v['--border'] = 'rgba(255,255,255,0.22)';
    v['--border-strong'] = 'rgba(255,255,255,0.45)';
    v['--sk-skin'] = 'dark';
    v['--sk-input-border'] = '1px solid rgba(255,255,255,0.16)';
    v['--sk-input-shadow'] = 'inset 0 2rpx 10rpx rgba(0,0,0,0.45)';
    v['--sk-input-bg'] = 'rgba(255,255,255,0.07)';
    v['--sk-input-text'] = '#ffffff';
    v['--sk-input-ph'] = 'rgba(255,255,255,0.45)';
    v['--sk-input-focus'] = accent;
    // 品牌发丝线 + 深投影（曾发三层 accent 光晕，高饱和色下描边比内容还抢眼）
    v['--sk-card-frame'] = `0 0 0 1px ${hexA(accent, 0.22)}, 0 14rpx 34rpx rgba(0,0,0,0.38)`;
  }
  // 两支共用的分隔线渐变
  v['--sk-line'] = `linear-gradient(90deg, transparent, ${accent}, transparent)`;
  return v;
}