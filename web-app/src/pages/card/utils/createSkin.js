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
 * 🎨 画布定稿（2026-10-07，用户多轮反馈后）：**统一浅色画布，取消明暗双分支**。
 *    - v1 整页泼主题色：高饱和色（红/橙）整页泼彩，不可看；
 *    - v2 墨色画布：太暗、与 C 端其它浅色页面脱节，「跟系统不同步」；
 *    - v3 终案：#f6f7fb 系统灰底 + 顶部主题色晕染 + 白卡，与 C 端同一观感；
 *    - v3.1 头部透明化被否（用户澄清：**红色渐变头部本身是对的**，他指是「1/3」步骤
 *      数字的灰色不配）→ **v3.2 恢复头部主题色渐变**；步骤数字改用 --sk-hd-sub
 *      （渐变头上=半透明白，浅金主色=深灰，step 透明头部=深灰）。
 *    - v3.3（2026-10-16 用户反馈「渐变不太美观」）：头部/主按钮 **渐变 → 纯色**。
 *      纯色更干净，与 --sk-bg 顶部晕染、--sk-line 分隔线不打架；文字对色判据不变。
 *    - 主题色主场 = hero 头部纯色 / 主按钮 / 焦点圈 / 分隔线 / 输入框描边(淡)。
 *    - 文字对色按主色亮度：头部/按钮文字（浅金 luma>160 时转深字）。
 *    - 兜底主色仍是品牌蓝 #165dff；未配置配色时本页=浅色皮肤（v2 及以前是 dark，已变）。
 * 语义色（成功绿/警示橙/VIP 金/钥匙绿/免费标签绿）刻意**不**跟随主题。
 */
import { shadeHex, hexA } from '../../../utils/color.js';
// hexA 已上收为全仓单一事实来源（utils/color.js），此处转出以兼容既有引用
export { hexA };
// 🔴 明暗判据必须与名片详情 hero 同源（utils/templateTheme.js 的 heroForeground）：
//    此前本模块自定「主色 luma>160」，详情 hero 用「渐变中值 luma>180」→ 同一品牌色
//    两页可能一个深字一个白字（真机混搭报修）。v3.3 起头部/按钮实际画纯色，但判据仍按
//    「主色→亮化 28% 的渐变中值」口径走同一裁决口（两个原因见下方 fg 处注释）。
import { heroForeground } from '../../../utils/templateTheme.js';

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

/**
 * 生成创建页全套 CSS 变量（单一浅色分支，任何主色都成立）。
 * @param {object} theme designThemeVars() 的产物（--design-* ）
 * @returns {object} 可直接绑到根视图 :style 的 CSS 变量表
 */
export function buildCreateSkinVars(theme) {
  const t = theme || {};
  const accent = t['--design-primary'] || '#165dff';
  // 辅助浅底：品牌方配色里本就配好的淡底优先；缺失时由主色现调，
  // 🔴 绝不能兜 #E8F3FF（那是品牌蓝的淡底，品牌色一换就成了「蓝底配黄按钮」）
  const tint = t['--design-secondary'] || hexA(accent, 0.1);
  // 前景判据的「参照背景」= 主色亮化 28%（gradEnd）。v3.3 起头部/按钮实际画的是纯色，
  // 判据却仍走渐变中值口径，两个原因：
  // ① 与名片详情 hero 同源——判定口全仓只有 heroForeground 一个，不能自造第二套；
  // ② 主色落在 luma 140~180 灰区时（如浅金 #c9a25e≈166），按纯主色判会落白字，
  //    而白/浅金对比仅 2.4:1 不可读；中值口径（≈199>180）正确落深字（6.8:1）。
  const gradEnd = shadeHex(accent, 0.28) || accent;
  const fg = heroForeground(accent, gradEnd, { text: '#ffffff' });
  const v = {};
  v['--primary'] = accent;
  v['--success'] = accent;
  // 系统主题辅助色（浅底）：品牌方配色里本就配好的淡底，比自己调透明度更准
  v['--theme-tint'] = tint;
  // 浅色画布：顶部主题色晕染过渡到系统灰底
  v['--sk-bg'] = `linear-gradient(180deg, ${hexA(accent, 0.16)}, transparent 300rpx), #f6f7fb`;
  // v3.3（2026-10-16）：头部**改纯色**。历程：v3.1 透明化被否 → v3.2 恢复渐变
  //（135deg 斜切 → 180deg 纵向）→ v3.3 用户反馈「渐变不太美观」→ 纯主色。
  // 纯色与顶部晕染/分隔线语言不打架，也避免斜切在窄屏的明暗分界。文字对色不变（见上）。
  v['--sk-header'] = accent;
  // 主按钮：主题色纯色（与头部同色，v3.3 起）
  v['--sk-btn'] = accent;
  v['--sk-btn-text'] = fg.text;
  v['--sk-btn-glow'] = `0 4rpx 12rpx ${hexA(accent, 0.35)}`;
  v['--sk-btn-shine'] = 'inset 0 2rpx 0 rgba(255,255,255,0.35)';
  v['--bg-card'] = '#ffffff';
  v['--bg-hover'] = '#f2f3f5';
  v['--sk-card-bg'] = '#ffffff';
  // 头部文字坐在主题色纯色上 → 按主色亮度对色（step 透明头部深字由 create.vue 覆写；
  // 「1/3」步骤数字同用 --sk-hd-sub——渐变头上是半透明白，与标题/副标题同体系）
  v['--sk-hd-text'] = fg.text;
  v['--sk-hd-sub'] = fg.light ? '#4e5969' : 'rgba(255,255,255,0.8)';
  v['--t1'] = '#1d2129';
  v['--t2'] = '#4e5969';
  v['--t3'] = '#5c6470';   // 可读次要文本：原 #86909c 仅 2.92:1 不达标，收敛到 #5c6470 过 WCAG AA（见 docs/card-visual-audit.html）
  v['--border'] = '#e5e6eb';
  v['--border-strong'] = '#e5e6eb';   // 原 #c9cdd4：1.59:1 边界不可辨，提亮至 #e5e6eb（层级由 --card-shadow 撑）
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
