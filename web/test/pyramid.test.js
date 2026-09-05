import { describe, it, expect } from 'vitest';
import { pickTargetLevel, tileUrl, visibleTiles } from '../src/viewer/pyramid.js';

const LEVELS = [
  { width: 8192, height: 4096, cols: 8, rows: 8 },
  { width: 4096, height: 2048, cols: 4, rows: 4 },
  { width: 2048, height: 1024, cols: 2, rows: 2 },
  { width: 1024, height: 512, cols: 1, rows: 1 },
];

describe('pickTargetLevel', () => {
  it('手机屏（390px, dpr2）选 2048 层', () => {
    expect(pickTargetLevel(LEVELS, 390, 2).width).toBe(2048);
  });
  it('桌面（1440px, dpr1）选 4096 层', () => {
    expect(pickTargetLevel(LEVELS, 1440, 1).width).toBe(4096);
  });
  it('超大屏仍不超过最高层', () => {
    expect(pickTargetLevel(LEVELS, 3840, 2).width).toBe(8192);
  });
  it('空输入返回 null', () => {
    expect(pickTargetLevel(null, 390, 2)).toBeNull();
    expect(pickTargetLevel([], 390, 2)).toBeNull();
  });
});

describe('tileUrl', () => {
  it('模板替换 width/col/row', () => {
    const template = '/uploads/x-tiles/{width}/{col}_{row}.webp';
    expect(tileUrl(template, { width: 4096 }, 3, 1)).toBe('/uploads/x-tiles/4096/3_1.webp');
  });
  it('云端 CDN 模板同样替换', () => {
    const template = 'https://cdn.example.com/panorama/{width}/{col}_{row}.webp';
    expect(tileUrl(template, { width: 1024 }, 0, 0)).toBe('https://cdn.example.com/panorama/1024/0_0.webp');
  });
});

describe('visibleTiles', () => {
  const dir = { x: 0, y: 0, z: -1 }; // yaw=0,pitch=0，朝 -Z
  const hfov = ((75 * Math.PI) / 180) * 1.5 * 0.5; // fov75 + aspect1.5
  const vfov = ((75 * Math.PI) / 180) * 0.5;

  it('朝 -Z 时可见 4x4 层中部两列（phi 180°/270° 附近）', () => {
    const tiles = visibleTiles(LEVELS[1], dir, hfov, vfov); // 4096 层 4x4
    const keys = new Set(tiles.map(([c, r]) => `${c}_${r}`));
    expect(keys.has('2_1')).toBe(true);
    expect(keys.has('2_2')).toBe(true);
    expect(keys.has('3_1')).toBe(true);
    expect(keys.has('3_2')).toBe(true);
  });

  it('背对方向的极远瓦片不可见', () => {
    const tiles = visibleTiles(LEVELS[1], dir, hfov, vfov);
    const keys = new Set(tiles.map(([c, r]) => `${c}_${r}`));
    expect(keys.has('0_0')).toBe(false); // phi45°/theta22.5° 正背面
  });

  it('转 180° 后可见集切到对面', () => {
    const back = { x: 0, y: 0, z: 1 }; // 朝 +Z
    const keys = new Set(visibleTiles(LEVELS[1], back, hfov, vfov).map(([c, r]) => `${c}_${r}`));
    expect(keys.has('0_1')).toBe(true);
    expect(keys.has('1_1')).toBe(true);
    expect(keys.has('2_2')).toBe(false);
  });

  it('窄视场只加载更少瓦片', () => {
    const narrow = ((30 * Math.PI) / 180) * 0.5;
    const wide = ((110 * Math.PI) / 180) * 1.6 * 0.5;
    const n = visibleTiles(LEVELS[1], dir, narrow, narrow).length;
    const w = visibleTiles(LEVELS[1], dir, wide, wide).length;
    expect(n).toBeLessThan(w);
  });
});
