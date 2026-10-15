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
    expect(SRC).toContain("import { heroGradient, brandPalette, hexLuma } from '../../utils/color.js';");
    // resolvedTheme 用到 shadeHex（派生渐变深端），必须已导入
    expect(SRC).toContain("parseTheme, heroBgStyle, heroTextStyle, heroText2Style, heroAccentStyle,");
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
    expect(SRC).toContain('textColor: b.text || (lightBg ? ');
    expect(SRC).toContain('accent: b.secondary || t.accent,');
    expect(SRC).toContain('borderColor: b.secondary || t.borderColor,');
  });

  test('heroStyle 改用 resolvedTheme（模板+品牌合并后渲染）', () => {
    expect(SRC).toContain('const heroStyle = computed(() => {');
    expect(SRC).toContain('const t = resolvedTheme.value;');
    expect(SRC).toContain('if (t) return { ...heroPadStyle.value, ...heroBgStyle(t), color: t.textColor };');
    // 无模板分支仍消费 brand 5 色
    expect(SRC).toContain('background: heroGradient(b.primary, b.gradient,');
    expect(SRC).toContain('color: b.text || \'#fff\'');
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
    expect(SRC).toContain("const heroColor = computed(() => (resolvedTheme.value?.textColor || brand.value.secondary || '#ffffff'));");
  });

  test('badgeInlineAccent / badgeInlineStyle 改用 resolvedTheme', () => {
    expect(SRC).toContain('const badgeInlineAccent = computed(() => (resolvedTheme.value?.accent || ');
    expect(SRC).toContain('borderColor: resolvedTheme.value?.borderColor || badgeInlineAccent.value,');
  });

  test('isLightHero 按 resolvedTheme（品牌主色）亮度翻转，而非裸模板', () => {
    expect(SRC).toContain('const t = resolvedTheme.value;');
    expect(SRC).toContain('if (!t) {');
    expect(SRC).toContain('const l = hexLuma(brand.value.primary);');
    expect(SRC).toContain('return l !== null && l > 180;');
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
    expect(SRC).toContain(':style="[navVars, themeStyle, brandVars]"');
  });
});
