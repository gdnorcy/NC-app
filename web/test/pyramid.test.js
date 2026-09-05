import { describe, it, expect } from 'vitest';
import { pickTargetLevel, tileUrl, visibleTiles, expandTiles } from '../src/viewer/pyramid.js';

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

describe('expandTiles', () => {
  it('可见集四周扩展一圈，可见优先级 1 预取 0', () => {
    const expanded = expandTiles([[1, 1]], LEVELS[1]); // 4x4 层
    const byKey = new Map(expanded.map((e) => [`${e.col}_${e.row}`, e.priority]));
    expect(byKey.get('1_1')).toBe(1); // 原瓦片保持可见优先级
    expect(byKey.get('0_1')).toBe(0); // 左邻预取
    expect(byKey.get('2_1')).toBe(0); // 右邻
    expect(byKey.get('1_0')).toBe(0); // 上邻
    expect(byKey.get('1_2')).toBe(0); // 下邻
  });

  it('经度环绕：col-1 在 0 处环绕到最后列', () => {
    const expanded = expandTiles([[0, 0]], LEVELS[1]);
    const cols = expanded.filter((e) => e.col === 3 && e.row === 0);
    expect(cols.length).toBe(1);
  });

  it('纬度钳制：顶行无越界行', () => {
    const expanded = expandTiles([[1, 0]], LEVELS[1]);
    expect(expanded.every((e) => e.row >= 0 && e.row <= 3)).toBe(true);
  });
});
