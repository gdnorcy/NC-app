import { describe, it, expect } from 'vitest';
import { shadeHex, heroGradient, brandPalette, hexLuma } from './color.js';

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

describe('heroGradient（品牌色渐变·双色）', () => {
  const fallback = 'linear-gradient(155deg, #b45309, #f59e0b)';

  it('无品牌色回退默认渐变（第三参 fallback）', () => {
    expect(heroGradient('', '', fallback)).toBe(fallback);
    expect(heroGradient(null)).toBe('linear-gradient(155deg, #b45309, #f59e0b)');
    expect(heroGradient('invalid!')).toBe(fallback);
  });

  it('仅主色生成主色渐变（深→主色推导）', () => {
    // -0.3 减 77 → R0 G16 B178
    expect(heroGradient('#165dff', '', '')).toBe('linear-gradient(155deg, #0010b2, #165dff)');
  });

  it('渐变色优先于推导', () => {
    // 渐变辅色优先
    expect(heroGradient('#165dff', '#ff0000', '')).toBe('linear-gradient(155deg, #ff0000, #165dff)');
  });

  it('非法渐变色回退推导', () => {
    expect(heroGradient('#165dff', 'garbage', '')).toBe('linear-gradient(155deg, #0010b2, #165dff)');
  });

  it('自定义回退可用（必须显式传第三参）', () => {
    const custom = 'linear-gradient(0deg, #000, #fff)';
    expect(heroGradient('', '', custom)).toBe(custom);
  });
});

describe('brandPalette（品牌 5 色归一化）', () => {
  it('空卡片返回全空 5 色', () => {
    expect(brandPalette({})).toEqual({ primary: '', gradient: '', secondary: '', text: '', subText: '' });
  });

  it('老数据仅 brandColor 时回落到 primary', () => {
    expect(brandPalette({ brandColor: '#FA8C16' }).primary).toBe('#FA8C16');
  });

  it('brandColors 5 色全量输出', () => {
    const c = {
      brandColors: { primary: '#FA8C16', gradient: '#FFD8A8', secondary: '#FFE8D6', text: '#3a2a1a', subText: '#7a5c3a' },
    };
    expect(brandPalette(c)).toEqual(c.brandColors);
  });

  it('brandColors 缺色时回落（不与 primary 混淆）', () => {
    const p = brandPalette({ brandColors: { primary: '#FA8C16' } });
    expect(p.primary).toBe('#FA8C16');
    expect(p.gradient).toBe('');
    expect(p.text).toBe('');
  });
});

describe('hexLuma（背景亮度判据·用于浅色 hero 文字翻转）', () => {
  it('返回感知亮度 0-255', () => {
    expect(hexLuma('#000000')).toBe(0);
    expect(hexLuma('#ffffff')).toBeCloseTo(255, 0);
  });

  it('浅色（>180）识别为浅底', () => {
    // 草绿 #4FA140 luma 约 121（偏深），米白 #F5F5F5 约 245（浅）
    expect(hexLuma('#F5F5F5') > 180).toBe(true);
    expect(hexLuma('#4FA140') > 180).toBe(false);
  });

  it('非法返回 null', () => {
    expect(hexLuma('')).toBeNull();
    expect(hexLuma('red')).toBeNull();
  });
});
