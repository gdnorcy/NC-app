import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 「我的名片」myCard.vue 配色收敛（单一主题色 + 中性 + 语义克制）回归锁。
// 背景：原页一屏混用 5 种强调色相——金头像(brandColor)、琥珀供需标签 #f59e0b、
//   微信绿操作 #07c160、藏蓝列表图标 #1d4e8f、主题红 CTA —— 根因是平台蓝 #165dff/#1d4e8f
//   与绿/琥珀被当作默认强调色散落各处，和租户主题红打架。
// 方案：--design-primary 唯一强调色（列表图标/文字链接/激活态/头像兜底/标签底/CTA）；
//   预览/分享/二维码等工具操作降中性深灰；语义色只留真实状态（已上架=绿、待审核=琥珀、退出=红）。
//   SIcon 的 color 是 prop、不能吃 var() → 用 computed themeColor 传真实 hex。

const here = import.meta.url;
const src = readFileSync(fileURLToPath(new URL('./myCard.vue', here)), 'utf8');

function ruleBlock(s, sel) {
  const re = new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`, 'g');
  const m = re.exec(s);
  return m ? m[0] : '';
}

describe('我的名片 myCard 配色收敛（跟随租户主题）', () => {
  test('装饰性杂色令牌清零（平台蓝/深蓝/微信绿/旧标签底色）', () => {
    expect(src).not.toContain('var(--primary-deep)');
    expect(src).not.toContain('var(--primary)');
    expect(src).not.toContain('#1d4e8f');
    expect(src).not.toContain('#07c160');
    expect(src).not.toContain('#e9f1fb');
    expect(src).not.toContain('#2e6bb8');
    expect(src).not.toContain('#fef3e2');
  });

  test('死代码会员横幅 mb-* 已移除', () => {
    expect(src).not.toContain('.mb-banner');
    expect(src).not.toContain('.mb-tag');
  });

  test('列表图标/集市标题统一主题色（computed themeColor，禁硬编码 hex）', () => {
    expect(src).toContain("themeStyle.value['--design-primary']");
    expect(src).toContain(':color="themeColor"');
    expect((src.match(/:color="themeColor"/g) || []).length).toBeGreaterThanOrEqual(9);
  });

  test('工具型操作（预览/分享/二维码）图标降中性深灰，不再用绿', () => {
    // 2026-10-16 方案 A：原 #5b5b5b → ICON_T1 令牌（= token.scss $t1 #1d2129）
    // （SIcon 的 color 不能吃 var()，会被烘焙进 SVG data-URI / 构建期 PNG）
    expect(src).toContain('size="default" :color="ICON_T1"');
    expect(src).not.toContain('color="#07c160"');
  });

  test('身份元素用主题色：头像兜底/供需标签/列表图标底/文字链接', () => {
    expect(ruleBlock(src, '.oc-avatar')).toContain('var(--design-primary');
    expect(ruleBlock(src, '.oc-need')).toContain('rgba(var(--design-primary-rgb');
    expect(ruleBlock(src, '.oc-need')).not.toContain('#f59e0b');
    expect(ruleBlock(src, '.osr-icon')).toContain('rgba(var(--design-primary-rgb');
    expect(ruleBlock(src, '.om-locate')).toContain('var(--design-primary');
    expect(ruleBlock(src, '.ov-more')).toContain('var(--design-primary');
    expect(ruleBlock(src, '.ov-avatar')).toContain('var(--design-primary');
  });

  test('语义色克制保留：仅状态/危险（已上架=绿、待审核=琥珀、退出=红）', () => {
    expect(ruleBlock(src, '.om-status.on')).toContain('var(--success)');
    expect(ruleBlock(src, '.om-status.pend')).toContain('#f59e0b');
    expect(src).toContain('#f53f3f');
  });

  test('根视图绑定 [themeStyle, brandVars, tabBarPad]（MP 端注入主题 var + 品牌覆盖 + 底部导航实测占位）', () => {
    expect((src.match(/:style="\[themeStyle, brandVars\]"/g) || []).length).toBe(3); // 加载/失败/未登录三个态；正文态另加 tabBarPad
    expect(src).toContain(':style="[themeStyle, brandVars, tabBarPad]"');
  });

  test('品牌主色覆盖全页主题变量（设了品牌外观，标签/图标/悬浮球/tab 都跟随品牌色）', () => {
    // 🔴 反例（曾踩）：只覆盖 hero/头像层，页面主体仍消费 --design-primary（设计中心系统色）
    //   → 截图报「头像黄了但标签/图标/悬浮球/tab 还是蓝」。品牌变量覆盖必须合并进页面根 style。
    expect(src).toContain("import { useDesignTheme, brandThemeOverride } from '../../utils/design.js';");
    expect(src).toContain('const brandVars = computed(() => brandThemeOverride(brand.value));');
    // SIcon 不吃 var() → themeColor 品牌主色优先喂真实 hex
    expect(src).toContain("const themeColor = computed(() => brand.value.primary || (themeStyle.value && themeStyle.value['--design-primary']) || '#165dff');");
  });

  test('头像背景：品牌主色优先于模板配色（设了品牌外观就要生效）', () => {
    // 🔴 反例（曾踩）：const c = card.value.templateTheme?.primary || b.primary;
    //   真实名片几乎都带 template_id → 模板 primary 恒非空 → 品牌色被盖死、视觉上「没生效」。
    expect(src).toContain('const c = b.primary || card.value.templateTheme?.primary;');
  });
});
