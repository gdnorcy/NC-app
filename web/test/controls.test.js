import { describe, it, expect } from 'vitest';
import {
  clamp,
  clampPitch,
  clampFov,
  directionFromYawPitch,
  applyDrag,
  DEG,
} from '../src/viewer/controls.js';

describe('clamp', () => {
  it('钳制到区间内', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('clampPitch', () => {
  it('默认限制在 ±89°', () => {
    expect(clampPitch(95 * DEG)).toBeCloseTo(89 * DEG);
    expect(clampPitch(-95 * DEG)).toBeCloseTo(-89 * DEG);
    expect(clampPitch(30 * DEG)).toBeCloseTo(30 * DEG);
  });
});

describe('clampFov', () => {
  it('限制在 30~110 度', () => {
    expect(clampFov(20)).toBe(30);
    expect(clampFov(120)).toBe(110);
    expect(clampFov(75)).toBe(75);
  });
});

describe('directionFromYawPitch', () => {
  it('yaw=0 pitch=0 看向 -Z', () => {
    const d = directionFromYawPitch(0, 0);
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(-1);
  });

  it('yaw=90° 看向 -X（左转 90°）', () => {
    const d = directionFromYawPitch(90 * DEG, 0);
    expect(d.x).toBeCloseTo(-1);
    expect(d.z).toBeCloseTo(0);
  });

  it('pitch=90° 仰视正上方', () => {
    const d = directionFromYawPitch(0, 90 * DEG);
    expect(d.y).toBeCloseTo(1);
    expect(d.x).toBeCloseTo(0);
  });

  it('方向向量为单位长度', () => {
    for (const [yaw, pitch] of [[0.3, 0.2], [-1.2, 0.8], [2.5, -1.0]]) {
      const d = directionFromYawPitch(yaw, pitch);
      const len = Math.hypot(d.x, d.y, d.z);
      expect(len).toBeCloseTo(1, 6);
    }
  });
});

describe('applyDrag', () => {
  it('向右拖（dx>0）yaw 减小（视野右转）', () => {
    const next = applyDrag(0, 0, 100, 0);
    expect(next.yaw).toBeLessThan(0);
  });

  it('向下拖（dy>0）pitch 增大（视野上转）', () => {
    const next = applyDrag(0, 0, 0, 100);
    expect(next.pitch).toBeGreaterThan(0);
  });

  it('pitch 被钳制不越界', () => {
    const next = applyDrag(0, 88 * DEG, 0, 10000);
    expect(next.pitch).toBeLessThanOrEqual(89 * DEG);
  });

  it('灵敏度可配置', () => {
    const low = applyDrag(0, 0, 100, 0, 0.001);
    const high = applyDrag(0, 0, 100, 0, 0.01);
    expect(Math.abs(low.yaw)).toBeLessThan(Math.abs(high.yaw));
  });
});
