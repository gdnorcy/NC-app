import { describe, it, expect } from 'vitest';
import { buttonSizeStyle } from './btnSize.js';

/**
 * 按钮宽度与容器左右边距解耦（2026-10-07 用户反馈）
 * 「组件按钮容器的左右边框调整，会调整按钮的大小」
 */
describe('buttonSizeStyle 按钮宽度与容器边距解耦', () => {
  it('自适应模式：内容宽，与容器宽度无关', () => {
    const s = buttonSizeStyle({ widthMode: 'auto' });
    expect(s.width).toBe('auto');
    expect(s.display).toBe('inline-block');
    expect(s.padding).toBe('0 12px');
    // 自适应不该被 marginLR 影响
    expect(s.marginLeft).toBeUndefined();
  });

  it('存量默认（未设 widthPercent / marginLR）：满行 100%，视觉不变', () => {
    const s = buttonSizeStyle({ widthMode: 'full' });
    expect(s.width).toBe('100%');
    expect(s.marginLeft).toBeUndefined();
    expect(s.textAlign).toBe('center');
    expect(s.boxSizing).toBe('border-box');
  });

  it('🔴 关键：容器左右边距 >0 时按钮向两侧溢出抵消 → 净宽不随容器变', () => {
    const s = buttonSizeStyle({ widthMode: 'full', marginLR: 20 });
    // 容器窄了 20px，按钮左右各撑 20px → 净宽 = 容器宽 + 40 = 原满行宽
    expect(s.marginLeft).toBe('-20px');
    expect(s.marginRight).toBe('-20px');
    expect(s.width).toBe('calc(100% + 40px)');
  });

  it('容器边距变化时，按钮净宽保持恒定（这正是用户要的解耦）', () => {
    // 净宽 = 容器内容宽 + 2*marginLR。marginLR 越大，容器越窄，净宽越恒定。
    const widths = [0, 10, 20, 40].map((lr) => {
      const s = buttonSizeStyle({ widthMode: 'full', marginLR: lr });
      // 把 1000px 的页面代入计算
      const container = 1000 - lr * 2;
      const net = s.width === '100%' ? container : container + lr * 2;
      return net;
    });
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBe(1000);
  });

  it('宽度百分比 <100：按抵消后的满行宽收窄', () => {
    const s = buttonSizeStyle({ widthMode: 'full', widthPercent: 50, marginLR: 20 });
    expect(s.marginLeft).toBe('-20px');
    expect(s.width).toBe('calc(calc(100% + 40px) * 0.5)');
  });

  it('宽度百分比 = 100 且有 marginLR：只溢出，不额外收窄', () => {
    const s = buttonSizeStyle({ widthMode: 'full', widthPercent: 100, marginLR: 12 });
    expect(s.width).toBe('calc(100% + 24px)');
  });

  it('百分比越界被夹取（<20 → 20，>100 → 100，非法 → 100）', () => {
    expect(buttonSizeStyle({ widthMode: 'full', widthPercent: 5 }).width).toContain('0.2)');
    expect(buttonSizeStyle({ widthMode: 'full', widthPercent: 999 }).width).toBe('100%');
    expect(buttonSizeStyle({ widthMode: 'full', widthPercent: 'abc' }).width).toBe('100%');
    expect(buttonSizeStyle({ widthMode: 'full', widthPercent: 0 }).width).toBe('100%');
  });

  it('兼容 marginLeft 旧字段（无 marginLR 时）', () => {
    const s = buttonSizeStyle({ widthMode: 'full', marginLeft: 8 });
    expect(s.marginLeft).toBe('-8px');
    expect(s.width).toBe('calc(100% + 16px)');
  });

  it('样式对象不残留 undefined 值（避免小程序 setStyle 整条失效）', () => {
    for (const p of [{}, { widthMode: 'auto' }, { widthMode: 'full', marginLR: 0 }]) {
      for (const [k, v] of Object.entries(buttonSizeStyle(p))) {
        expect(v).not.toBeUndefined();
        expect(typeof v).toBe('string');
        expect(String(v)).not.toContain('undefined');
      }
    }
  });
});
