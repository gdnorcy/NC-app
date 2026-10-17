import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 名片详情品牌 5 色消费回归（2026-10-15 真机报修「品牌配色-品牌外观没生效」根因修复）：
// 真实名片几乎都带 template_id → templateTheme 恒非空，原「模板优先」把品牌色盖死。
// 修复后：新增 resolvedTheme = 品牌色覆盖模板配色、保留模板布局（布局开关仍来自模板）；
// 所有 color 类 computed（heroStyle/nmStyle/subStyle/accentStyle/avatarStyle/barTopStyle/
// textureBg/heroColor/badgeInline*/isLightHero）改用 resolvedTheme，而非裸 heroTheme。
const here = import.meta.url;
const SRC = readFileSync(fileURLToPath(new URL('./cardDetail.vue', here)), 'utf8');

describe('cardDetail 品牌 5 色覆盖模板（设了品牌就要生效）', () => {
  test('引入 brandPalette + hexLuma + shadeHex', () => {
    // 🔴 2026-10-XX 真机报修「预览空白」根因：resolvedTheme/brandFg 用到 shadeHex 但漏 import，
    //    computed 惰性求值 → 渲染数据函数首字段即 ReferenceError → 整页空 data（静态在、数据全灭）。
    //    原测试逐字钉死了漏 import 的错误语句，谁修谁挂 —— 改为钉正确语句。
    expect(SRC).toContain("import { heroGradient, brandPalette, hexLuma, shadeHex } from '../../utils/color.js';");
    // resolvedTheme 用到 shadeHex（派生渐变深端），必须已导入
    expect(SRC).toContain('parseTheme, heroBgStyle, heroTextStyle, heroText2Style, heroAccentStyle,');
  });

  test('brand 归一化 computed = brandPalette(card.value)', () => {
    expect(SRC).toContain('const brand = computed(() => brandPalette(card.value));');
  });

  test('resolvedTheme：品牌主色覆盖模板配色、保留布局', () => {
    expect(SRC).toContain('const resolvedTheme = computed(() => {');
    // 无模板 / 未设品牌主色 → 原样（模板或兜底）
    expect(SRC).toContain('if (!t || !b.primary) return t;');
    // 品牌色盖过模板配色字段
    expect(SRC).toContain('bgStart: b.primary,');
    expect(SRC).toContain('bgEnd: grad,');
    // 🔴 前景色不再照抄品牌配置（五色可能自相矛盾：亮黄底+白字），统一走 heroForeground 裁决：
    //    按 hero 背景亮度判明暗 + 对配置色做对比度校验，不合格自动回落可读前景。
    expect(SRC).toContain('const fg = heroForeground(b.primary, grad, { text: b.text, text2: b.subText, accent: b.secondary });');
    expect(SRC).toContain('textColor: fg.text,');
    expect(SRC).toContain('text2Color: fg.text2,');
    expect(SRC).toContain('accent: fg.accent,');
    expect(SRC).toContain('borderColor: fg.border,');
  });

  test('heroStyle 改用 resolvedTheme（模板+品牌合并后渲染）', () => {
    expect(SRC).toContain('const heroStyle = computed(() => {');
    expect(SRC).toContain('const t = resolvedTheme.value;');
    expect(SRC).toContain('if (t) return { ...heroPadStyle.value, ...heroBgStyle(t), color: t.textColor };');
    // 无模板分支仍消费 brand 5 色
    expect(SRC).toContain('background: heroGradient(b.primary, b.gradient,');
    // 无模板分支同样走 heroForeground（否则与有模板分支两个判据 → 同屏黑字+白图标混搭）
    expect(SRC).toContain('color: brandFg.value.text');
  });

  test('nmStyle / subStyle / accentStyle / avatarStyle / barTopStyle / textureBg 均改用 resolvedTheme', () => {
    expect(SRC).toContain('const t = resolvedTheme.value;\n  if (t) return { ...heroTextStyle(t)');
    expect(SRC).toContain('resolvedTheme.value ? heroText2Style(resolvedTheme.value)');
    expect(SRC).toContain('resolvedTheme.value ? heroAccentStyle(resolvedTheme.value)');
    expect(SRC).toContain('resolvedTheme.value ? { borderRadius: heroRadius(resolvedTheme.value, true) }');
    expect(SRC).toContain('resolvedTheme.value ? heroBarTopStyle(resolvedTheme.value)');
    expect(SRC).toContain('resolvedTheme.value ? heroTextureBg(resolvedTheme.value)');
  });

  test('heroColor 改用 resolvedTheme.textColor', () => {
    expect(SRC).toContain('const heroColor = computed(() => (resolvedTheme.value?.textColor || brandFg.value.text));');
  });

  test('badgeInlineAccent / badgeInlineStyle 改用 resolvedTheme', () => {
    expect(SRC).toContain('const badgeInlineAccent = computed(() => (resolvedTheme.value?.accent || ');
    expect(SRC).toContain('borderColor: resolvedTheme.value?.borderColor || badgeInlineAccent.value,');
  });

  test('isLightHero 按 resolvedTheme（品牌主色）亮度翻转，而非裸模板', () => {
    expect(SRC).toContain('const t = resolvedTheme.value;');
    expect(SRC).toContain('if (!t) {');
    // 无模板分支复用 brandFg.light：此处曾重复实现一遍 hexLuma 判据 → 与 heroForeground 漂移
    expect(SRC).toContain('return brandFg.value.light;');
  });

  test('布局开关仍来自裸 heroTheme（品牌只覆盖配色，不抢布局）', () => {
    expect(SRC).toContain('const showGuide = computed(() => !layoutFull.value && heroTheme.value?.guide);');
    expect(SRC).toContain('const squareCls = computed(() => (heroTheme.value?.quickSquare ? ');
    expect(SRC).toContain('const nameBigCls = computed(() => (heroTheme.value?.nameBig ? ');
    expect(SRC).toContain('const showCompaniesCard = computed(() => !layoutFull.value && heroTheme.value?.companiesCard);');
  });

  test('品牌主色覆盖页面主题变量：hero 之下的页面主体（评论区等 var(--design-primary) 消费点）也跟随品牌色', () => {
    expect(SRC).toContain("import { useDesignTheme, brandThemeOverride } from '../../utils/design.js';");
    expect(SRC).toContain('const brandVars = computed(() => brandThemeOverride(brand.value));');
    expect(SRC).toContain(':style="[navVars, themeStyle, brandVars, tabBarPad]"');
  });
});
