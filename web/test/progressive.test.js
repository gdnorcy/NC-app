import { describe, it, expect } from 'vitest';
import { planProgressiveLoad } from '../src/viewer/progressive.js';

describe('planProgressiveLoad', () => {
  it('有低清图时先加载预览再加载主图', () => {
    const steps = planProgressiveLoad('/uploads/a-preview.webp', '/uploads/a-main.webp');
    expect(steps).toEqual([
      { url: '/uploads/a-preview.webp', kind: 'preview' },
      { url: '/uploads/a-main.webp', kind: 'main' },
    ]);
  });

  it('无低清图时退化为单步主图（历史数据兼容）', () => {
    const steps = planProgressiveLoad('', '/uploads/old.jpg');
    expect(steps).toEqual([{ url: '/uploads/old.jpg', kind: 'main' }]);
  });

  it('两个路径都缺失时返回空计划', () => {
    expect(planProgressiveLoad('', '')).toEqual([]);
    expect(planProgressiveLoad(null, undefined)).toEqual([]);
  });
});
