import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 名片详情品牌 5 色消费回归（2026-10-15 真机报修「品牌主色设置无效」根因修复）：
// 原 heroStyle「模板 theme 优先」永命中（默认模板兜底）→ brandColor 是死代码。
// 修复后：无模板分支消费 brandPalette 5 色（主/渐变/辅/主文字/次文字），且 isLightHero 按品牌主色亮度翻转。
const here = import.meta.url;
const SRC = readFileSync(fileURLToPath(new URL('./cardDetail.vue', here)), 'utf8');

describe('cardDetail 品牌 5 色消费', () => {
  test('引入 brandPalette + hexLuma', () => {
    expect(SRC).toContain("import { heroGradient, brandPalette, hexLuma } from '../../utils/color.js';");
  });

  test('brand 归一化 computed = brandPalette(card.value)', () => {
    expect(SRC).toContain('const brand = computed(() => brandPalette(card.value));');
  });

  test('heroStyle 无模板分支消费主色+渐变+主文字', () => {
    expect(SRC).toContain('background: heroGradient(b.primary, b.gradient,');
    expect(SRC).toContain('color: b.text || \'#fff\'');
  });

  test('nmStyle 无模板分支消费主文字色', () => {
    expect(SRC).toContain("return { color: brand.value.text || '#fff', fontWeight: 700 };");
  });

  test('subStyle 无模板分支消费次文字色', () => {
    expect(SRC).toContain("color: brand.value.subText || 'rgba(255,255,255,.88)'");
  });

  test('accentStyle / heroColor 无模板分支消费辅助色', () => {
    expect(SRC).toContain("color: brand.value.secondary || '#fff'");
    expect(SRC).toContain("const heroColor = computed(() => (heroTheme.value?.textColor || brand.value.secondary || '#ffffff'));");
  });

  test('isLightHero 无模板分支按品牌主色亮度翻转（>180 浅底用深字）', () => {
    expect(SRC).toContain('const l = hexLuma(brand.value.primary);');
    expect(SRC).toContain('return l !== null && l > 180;');
  });
});
