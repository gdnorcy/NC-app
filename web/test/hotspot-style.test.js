import { describe, it, expect } from 'vitest';
import { normalizeHotspotStyle, hotspotColor, themeColors, hotspotArrowAngle } from '../src/viewer/hotspot-style.js';

describe('normalizeHotspotStyle 热点样式归一', () => {
  it('空配置 → 默认蓝主题 + pulse', () => {
    expect(normalizeHotspotStyle()).toEqual({
      effect: 'pulse', theme: 'blue', jumpColor: '#165DFF', infoColor: '#FF7D00',
    });
  });

  it('主题切换：商务金/活力橙/生态绿', () => {
    expect(normalizeHotspotStyle({ theme: 'gold' }).jumpColor).toBe('#C8893B');
    expect(normalizeHotspotStyle({ theme: 'orange' }).jumpColor).toBe('#FF7D00');
    expect(normalizeHotspotStyle({ theme: 'green' }).jumpColor).toBe('#00B42A');
  });

  it('自定义色值优先于主题', () => {
    const s = normalizeHotspotStyle({ theme: 'blue', jumpColor: '#123456', infoColor: '#abcdef' });
    expect(s.jumpColor).toBe('#123456');
    expect(s.infoColor).toBe('#abcdef');
  });

  it('非法值回退：无效主题/颜色/动效', () => {
    const s = normalizeHotspotStyle({ theme: 'pink', effect: 'flash', jumpColor: 'red' });
    expect(s.theme).toBe('blue');
    expect(s.effect).toBe('pulse');
    expect(s.jumpColor).toBe('#165DFF');
  });

  it('动效三态合法', () => {
    expect(normalizeHotspotStyle({ effect: 'ripple' }).effect).toBe('ripple');
    expect(normalizeHotspotStyle({ effect: 'none' }).effect).toBe('none');
  });
});

describe('hotspotColor 类型取色', () => {
  it('scene 类型用跳转色，info 用信息色', () => {
    const s = { theme: 'blue' };
    expect(hotspotColor(s, 'scene')).toBe('#165DFF');
    expect(hotspotColor(s, 'info')).toBe('#FF7D00');
  });
});

describe('themeColors 主题预设', () => {
  it('返回主题双色', () => {
    expect(themeColors('green')).toEqual({ jump: '#00B42A', info: '#722ED1' });
    expect(themeColors('unknown')).toEqual({ jump: '#165DFF', info: '#FF7D00' });
  });
});

describe('hotspotArrowAngle 方位感知箭头', () => {
  // 归一化到 [-180, 180]（atan2 输出等价角度）
  const norm = (d) => ((d % 360) + 540) % 360 - 180;
  const round = (r) => norm(Math.round((r * 180) / Math.PI));
  it('热点在左 → 箭头指向右（-90°）', () => {
    expect(round(hotspotArrowAngle(-0.3, 0))).toBe(-90);
  });
  it('热点在右 → 箭头指向左（90°）', () => {
    expect(round(hotspotArrowAngle(0.3, 0))).toBe(90);
  });
  it('热点在上 → 箭头指向下（-180°≡180°）', () => {
    expect(round(hotspotArrowAngle(0, 0.3))).toBe(-180);
  });
  it('热点在下 → 箭头指向上（0°）', () => {
    expect(round(hotspotArrowAngle(0, -0.3))).toBe(0);
  });
  it('左上 → 指向右下（-135°）', () => {
    expect(round(hotspotArrowAngle(-0.3, 0.3))).toBe(-135);
  });
});
