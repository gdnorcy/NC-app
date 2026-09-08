import { describe, it, expect } from 'vitest';
import { normalizeHotspotStyle, themeColors, HOTSPOT_THEMES } from './hotspot-style.js';

describe('normalizeHotspotStyle（管理端）', () => {
  it('默认蓝 + pulse', () => {
    expect(normalizeHotspotStyle()).toEqual({
      effect: 'pulse', theme: 'blue', jumpColor: '#165DFF', infoColor: '#FF7D00',
    });
  });
  it('主题与自定义色', () => {
    expect(normalizeHotspotStyle({ theme: 'green' }).jumpColor).toBe('#00B42A');
    expect(normalizeHotspotStyle({ theme: 'blue', jumpColor: '#123456' }).jumpColor).toBe('#123456');
  });
  it('非法回退', () => {
    const s = normalizeHotspotStyle({ theme: 'x', effect: 'flash', jumpColor: 'red' });
    expect(s.theme).toBe('blue');
    expect(s.effect).toBe('pulse');
    expect(s.jumpColor).toBe('#165DFF');
  });
});

describe('themeColors', () => {
  it('返回主题双色', () => {
    expect(themeColors('gold')).toEqual({ jump: '#C8893B', info: '#722ED1' });
    expect(themeColors('bad')).toEqual({ jump: '#165DFF', info: '#FF7D00' });
  });
});
