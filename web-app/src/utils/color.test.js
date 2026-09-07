import { describe, it, expect } from 'vitest';
import { shadeHex, heroGradient } from './color.js';

describe('shadeHex（hex 明暗处理）', () => {
  it('6 位 hex 正常变暗', () => {
    // 0x165dff: R22 G93 B255，减 64 → R0 G29 B191
    expect(shadeHex('#165dff', -0.25)).toBe('#001dbf');
  });

  it('3 位简写自动扩展', () => {
    // #f00 -> #ff0000，变暗 25% -> #bf0000
    expect(shadeHex('#f00', -0.25)).toBe('#bf0000');
  });

  it('带 # 前缀与不带均可', () => {
    expect(shadeHex('165dff', -0.25)).toBe(shadeHex('#165dff', -0.25));
  });

  it('非法输入返回空串', () => {
    expect(shadeHex('')).toBe('');
    expect(shadeHex(null)).toBe('');
    expect(shadeHex('#12g')).toBe('');
    expect(shadeHex('red')).toBe('');
  });

  it('变亮方向（正百分比）', () => {
    // #000000 +64 → #404040
    expect(shadeHex('#000', 0.25)).toBe('#404040');
  });

  it('边界夹紧 0-255 不溢出', () => {
    expect(shadeHex('#000000', -1)).toBe('#000000');
    expect(shadeHex('#ffffff', 1)).toBe('#ffffff');
  });
});

describe('heroGradient（品牌色渐变）', () => {
  const fallback = 'linear-gradient(155deg, #b45309, #f59e0b)';

  it('无品牌色回退默认渐变', () => {
    expect(heroGradient('')).toBe(fallback);
    expect(heroGradient(null)).toBe(fallback);
    expect(heroGradient('invalid!')).toBe(fallback);
  });

  it('品牌色生成主色渐变（深→主色）', () => {
    // -0.3 减 77 → R0 G16 B178
    expect(heroGradient('#165dff')).toBe('linear-gradient(155deg, #0010b2, #165dff)');
  });

  it('自定义回退可用', () => {
    const custom = 'linear-gradient(0deg, #000, #fff)';
    expect(heroGradient('', custom)).toBe(custom);
  });
});
