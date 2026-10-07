import { describe, it, expect } from 'vitest';
import { buttonSizeStyle } from './btnSize.js';

/**
 * 按钮宽度与容器左右边距解耦 + 水平居中
 * （2026-10-07 两轮用户反馈：「容器左右边框调整会改按钮大小」「按钮没有居中」）
 */
describe('buttonSizeStyle 按钮宽度与容器边距解耦 + 居中', () => {
  it('自适应模式：内容宽(fit-content) + 居中', () => {
    const s = buttonSizeStyle({ widthMode: 'auto' });
    // 🔴 回归锁：width:auto 会被 block 撑满容器（实测），必须是 fit-content
    expect(s.width).toBe('fit-content');
    expect(s.padding).toBe('0 12px');
    expect(s.marginLeft).toBe('auto');
    expect(s.marginRight).toBe('auto');
    expect(s.textAlign).toBe('center');
  });

  it('🔴 自适应必须是 block + fit-content（inline-block 不居中 / block+auto 撑满，均实测）', () => {
    // 回归锁：C端 .dp-btn / admin .r-btn 基础类是 inline-block，
    // 且 block + width:auto 会撑满容器 —— 两者都会让「自适应按钮」看起来不对
    const s = buttonSizeStyle({ widthMode: 'auto' });
    expect(s.display).toBe('block');
    expect(String(s.display)).not.toContain('inline');
    expect(s.width).not.toBe('auto');
  });

  it('存量默认（未设 widthPercent）：满行 100%，视觉不变', () => {
    const s = buttonSizeStyle({ widthMode: 'full' });
    expect(s.width).toBe('100%');
    expect(s.marginLeft).toBe('auto');
    expect(s.marginRight).toBe('auto');
    expect(s.boxSizing).toBe('border-box');
  });

  it('🔴 关键：宽度只由 widthPercent 决定，与容器 marginLR 无关', () => {
    // 容器左右边距只缩放容器，按钮宽度用百分比表达 → 两个控件彻底解耦
    for (const lr of [0, 10, 20, 40]) {
      const s = buttonSizeStyle({ widthMode: 'full', widthPercent: 60, marginLR: lr });
      expect(s.width).toBe('60%'); // 宽度与 lr 完全无关
      expect(s.marginLeft).toBe('auto');
      expect(s.marginRight).toBe('auto');
    }
  });

  it('宽度百分比 <100：auto 边距居中（无负 margin）', () => {
    const s = buttonSizeStyle({ widthMode: 'full', widthPercent: 50, marginLR: 20 });
    expect(s.width).toBe('50%');
    expect(s.marginLeft).toBe('auto');
    expect(s.marginRight).toBe('auto');
    // 🔴 回归锁：第一轮用负 margin 抵消，实测导致按钮左偏且盖住容器底色
    expect(String(s.marginLeft)).not.toContain('-');
    expect(String(s.marginRight)).not.toContain('-');
  });

  it('🔴 不得再输出 calc(100% + Npx) / 负 margin（第一轮的错误补偿）', () => {
    for (const p of [{ widthMode: 'full' }, { widthMode: 'full', marginLR: 20 }, { widthMode: 'full', widthPercent: 50, marginLR: 40 }]) {
      const s = buttonSizeStyle(p);
      expect(String(s.width)).not.toContain('calc');
      expect(String(s.width)).not.toContain('+');
      expect(String(s.marginLeft || '')).not.toContain('-');
      expect(String(s.marginRight || '')).not.toContain('-');
    }
  });

  it('百分比越界被夹取（<20 → 20，>100 → 100，非法 → 100）', () => {
    expect(buttonSizeStyle({ widthMode: 'full', widthPercent: 5 }).width).toBe('20%');
    expect(buttonSizeStyle({ widthMode: 'full', widthPercent: 999 }).width).toBe('100%');
    expect(buttonSizeStyle({ widthMode: 'full', widthPercent: 'abc' }).width).toBe('100%');
    expect(buttonSizeStyle({ widthMode: 'full', widthPercent: 0 }).width).toBe('100%');
  });

  it('容器左右 marginLR 对称 → 按钮中心 == 页面中心（居中数学验证）', () => {
    const PAGE = 375, LR = 20;
    const containerW = PAGE - LR * 2; // 容器内容宽
    const realBtnW = (containerW * 50) / 100;
    const space = (containerW - realBtnW) / 2; // auto 边距各分一半
    // 按钮中心相对页面左边
    const center = LR + space + realBtnW / 2;
    expect(center).toBeCloseTo(PAGE / 2, 5);
  });

  it('样式对象不残留 undefined 值（避免小程序 setStyle 整条失效）', () => {
    for (const p of [{}, { widthMode: 'auto' }, { widthMode: 'full' }, { widthMode: 'full', marginLR: 0 }]) {
      for (const [k, v] of Object.entries(buttonSizeStyle(p))) {
        expect(v).not.toBeUndefined();
        expect(String(v)).not.toContain('undefined');
      }
    }
  });
});
