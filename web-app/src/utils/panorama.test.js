import { describe, it, expect } from 'vitest';
import { hotspotDir, projectHotspots } from './panorama.js';

describe('hotspotDir', () => {
  it('yaw=0, pitch=0 指向初始视线 -X', () => {
    const d = hotspotDir({ yaw: 0, pitch: 0 });
    expect(d[0]).toBeCloseTo(-1, 5);
    expect(d[1]).toBeCloseTo(0, 5);
    expect(d[2]).toBeCloseTo(0, 5);
  });

  it('pitch=90 指向上方', () => {
    const d = hotspotDir({ yaw: 0, pitch: 90 });
    expect(d[1]).toBeGreaterThan(0.99);
  });

  it('yaw=90 指向 -Z 侧（右转 90°）', () => {
    const d = hotspotDir({ yaw: 90, pitch: 0 });
    expect(d[2]).toBeLessThan(-0.99);
  });

  it('非法/缺失角度兜底为 0', () => {
    const d = hotspotDir({});
    expect(d[0]).toBeCloseTo(-1, 5);
    expect(d[1]).toBeCloseTo(0, 5);
  });
});

describe('projectHotspots', () => {
  it('初始视角下 yaw=0 热点在屏幕中心', () => {
    const p = projectHotspots([{ yaw: 0, pitch: 0 }], 0, 0, 800, 600);
    expect(p[0].visible).toBe(true);
    expect(p[0].x).toBe(400);
    expect(p[0].y).toBe(300);
  });

  it('yaw=45 热点投影在屏幕右侧', () => {
    const p = projectHotspots([{ yaw: 45, pitch: 0 }], 0, 0, 800, 600);
    expect(p[0].visible).toBe(true);
    expect(p[0].x).toBeGreaterThan(400);
  });

  it('yaw=90 正侧面在初始视场外隐藏（水平半视场约53°）', () => {
    const p = projectHotspots([{ yaw: 90, pitch: 0 }], 0, 0, 800, 600);
    expect(p[0].visible).toBe(false);
  });

  it('pitch>0 热点投影在屏幕上方（y 更小）', () => {
    const p = projectHotspots([{ yaw: 0, pitch: 30 }], 0, 0, 800, 600);
    expect(p[0].visible).toBe(true);
    expect(p[0].y).toBeLessThan(300);
  });

  it('视线背后的热点隐藏（depth<=0.15）', () => {
    const p = projectHotspots([{ yaw: 180, pitch: 0 }], 0, 0, 800, 600);
    expect(p[0].visible).toBe(false);
  });

  it('视角旋转 90° 后，对应方向（yaw=90）热点回到中心', () => {
    const p = projectHotspots([{ yaw: 90, pitch: 0 }], 90, 0, 800, 600);
    expect(p[0].visible).toBe(true);
    expect(p[0].x).toBeCloseTo(400, 0);
    expect(p[0].y).toBeCloseTo(300, 0);
  });

  it('空热点列表返回空对象', () => {
    expect(projectHotspots([], 0, 0, 800, 600)).toEqual({});
  });

  it('lat 越界被钳制在 ±85', () => {
    const p = projectHotspots([{ yaw: 0, pitch: 0 }], 0, 200, 800, 600);
    // 不抛错且结果可读
    expect(p[0]).toBeDefined();
  });
});
