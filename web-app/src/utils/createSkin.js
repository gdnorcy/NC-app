/**
 * 创建名片页配色 token（2026-10-06 抽出便于单测）
 *
 * 单一事实来源：创建页（pages/card/create.vue）整页 UI 外壳的配色 token。
 *
 * ⚠️ 历史包袱（本模块存在的原因）：这套配色原本取自**名片模板的 themeConfig**
 * （lpTheme.accent / bgStart），于是「换一个名片模板 → 整页表单换色」。但名片预览卡
 * 已在 d467254 删除，页面里已不存在「需按模板真实色渲染」的元素 → 配色源改为**系统主题**
 *（设计中心「系统风格」），用户改配色方案时本页立即跟随。
 *
 * 🎨 画布定稿（2026-10-07，两轮用户反馈后）：**统一浅色画布，取消明暗双分支**。
 *    - v1 整页泼主题色：高饱和色（红/橙）整页泼彩，不可看；
 *    - v2 墨色画布：太暗、与 C 端其它浅色页面脱节，「跟系统不同步」；
 *    - v3 终案：#f6f7fb 系统灰底 + 顶部主题色晕染 + 白卡，与 C 端同一观感；
 *      主题色主场 = hero 头部渐变 / 主按钮 / 焦点圈 / 分隔线 / 输入框描边(淡)。
 *    - 文字对色按主色亮度：主色偏浅（浅金 luma>160）时头部/按钮用深字。
 *    - 兜底主色仍是品牌蓝 #165dff；未配置配色时本页=浅色皮肤（v2 及以前是 dark，已变）。
 * 语义色（成功绿/警示橙/VIP 金/钥匙绿/免费标签绿）刻意**不**跟随主题。
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
 * 生成创建页全套 CSS 变量（单一浅色分支，任何主色都成立）。
 * @param {object} theme designThemeVars() 的产物（--design-* ）
 * @returns {object} 可直接绑到根视图 :style 的 CSS 变量表
 */
export function buildCreateSkinVars(theme) {
  const t = theme || {};
  const accent = t['--design-primary'] || '#165dff';
  const tint = t['--design-secondary'] || '#E8F3FF';
  // 主色偏浅（浅金等）→ 头部/按钮上的文字改深色，白字会看不清
  const onAccent = hexLuma(accent) > 160;
  const v = {};
  v['--primary'] = accent;
  v['--success'] = accent;
  // 系统主题辅助色（浅底）：品牌方配色里本就配好的淡底，比自己调透明度更准
  v['--theme-tint'] = tint;
  // 浅色画布：顶部主题色晕染过渡到系统灰底
  v['--sk-bg'] = `linear-gradient(180deg, ${hexA(accent, 0.16)}, transparent 300rpx), #f6f7fb`;
  // hero 头部与主按钮：主题色渐变（主题色的主场）
  v['--sk-header'] = `linear-gradient(135deg, ${accent}, ${shadeHex(accent, 0.28)})`;
  v['--sk-btn'] = `linear-gradient(135deg, ${accent}, ${shadeHex(accent, 0.28)})`;
  v['--sk-btn-text'] = onAccent ? '#1d2129' : '#ffffff';
  v['--sk-btn-glow'] = `0 4rpx 12rpx ${hexA(accent, 0.35)}`;
  v['--sk-btn-shine'] = 'inset 0 2rpx 0 rgba(255,255,255,0.35)';
  v['--bg-card'] = '#ffffff';
  v['--bg-hover'] = '#f2f3f5';
  v['--sk-card-bg'] = '#ffffff';
  // 头部文字坐在主题色渐变上 → 按主色亮度对色（skin-step 透明头部的深字由 create.vue 覆写）
  v['--sk-hd-text'] = onAccent ? '#1d2129' : '#ffffff';
  v['--sk-hd-sub'] = onAccent ? '#4e5969' : 'rgba(255,255,255,0.8)';
  v['--t1'] = '#1d2129';
  v['--t2'] = '#4e5969';
  v['--t3'] = '#86909c';
  v['--border'] = '#e5e6eb';
  v['--border-strong'] = '#c9cdd4';
  v['--sk-skin'] = 'light';
  v['--sk-input-border'] = `1px solid ${hexA(accent, 0.32)}`;
  v['--sk-input-shadow'] = '0 2rpx 8rpx rgba(0,0,0,0.04)';
  v['--sk-input-bg'] = '#ffffff';
  v['--sk-input-text'] = '#1d2129';
  v['--sk-input-ph'] = '#a8b1bd';
  // 聚焦圈跟主色（旧代码写死 #2f6bff / rgba(47,107,255,.12) 是另一套蓝，永远对不上主题）
  v['--sk-input-focus'] = accent;
  v['--sk-card-frame'] = `0 0 0 1px ${hexA(accent, 0.16)}, 0 10rpx 24rpx ${hexA(accent, 0.12)}`;
  // 两支共用的分隔线渐变
  v['--sk-line'] = `linear-gradient(90deg, transparent, ${accent}, transparent)`;
  return v;
}
