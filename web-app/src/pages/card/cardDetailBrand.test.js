import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 名片详情品牌 5 色消费回归：
// 2026-10-15 真机报修「品牌配色没生效」→ 曾改为品牌覆盖模板配色；
// 2026-10-18 用户报修「名片模板不对，对应不上」（选曜石黑金显示品牌绿）→
// 最终分层 = 自选模板 > 品牌主色：有自选模板时模板配色原样生效，
// 品牌色只在无自选模板时接管 hero（heroStyle else 分支，仍走 heroForeground 裁决前景）。
const here = import.meta.url;
const SRC = readFileSync(fileURLToPath(new URL('./cardDetail.vue', here)), 'utf8');

describe('cardDetail hero 配色分层（自选模板 > 品牌主色）', () => {
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

  test('resolvedTheme：自选模板配色原样生效（品牌不再覆盖），分层=自选模板>品牌主色', () => {
    // 🔴 2026-10-18 用户报修「名片模板不对，对应不上」：旧实现让品牌 5 色盖掉自选模板配色
    //    （bgStart/bgEnd/accent/textColor 全换品牌色只留布局）→ 模板市场 6 套配色在详情页
    //    全变品牌绿，换模板形同虚设。改为与 server toCard 分层注释一致：
    //    自选模板 > 品牌主色 > 兜底模板 > 装修中心主题色。品牌色只在无自选模板时接管。
    expect(SRC).toContain('const resolvedTheme = computed(() => {');
    expect(SRC).toContain('if (!t) return null;');
    // 有自选模板 → 模板原样（不再被品牌改写）
    expect(SRC).toContain('if (!card.value.templateId) return t;');
    expect(SRC).toContain('return t;');
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
    // 注：原先的 showGuide（hero 引导条开关）已随「拨号/收藏并入统一操作栏栅格」下线，
    //     拨号/收藏改由 !isMine && card.phone 判定，不再受模板 guide 开关影响。
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
