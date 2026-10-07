import { describe, it, expect } from 'vitest';
import { searchBoxSizeStyle, buttonSizeStyle, containerChildSizeStyle } from './containerChildSize.js';

/**
 * 容器内子组件宽度与「容器左右边距」解耦（2026-10-07）
 *
 * 🔴 用户反馈两则，是**同一个病**：
 *   1「组件『按钮』容器的左右边框调整，会调整按钮的大小，要区分按钮的大小调节和窗口的大小调节。」
 *   2「容器左右边距调了会同步调小搜索框，没有单独调搜索框大小的了。」
 *
 * 病根：子组件用 `width:100%`（按钮）或 `flex:1`（搜索框）撑满容器
 *      → 容器左右边距一变，子组件跟着变 → 两个控件缠死。
 *
 * 🔴 关键实测结论（写进断言，避免后人只改 width 忘了 flex）：
 *   搜索框是 **flex 子项**，CSS 兜底 `.search-box{flex:1}`。
 *   只内联 `width` 而**不覆盖 flex** → `flex:1` 会把 width 压掉
 *   → 表现为「宽度百分比滑块完全没反应」，很容易误判成「功能没实现」。
 */
describe('containerChildSizeStyle 容器内子组件宽度', () => {
  it('🔴 flex 子项必须覆盖 flex（否则 flex:1 会把 width 压掉、滑块没反应）', () => {
    const s = searchBoxSizeStyle({ widthMode: 'full', widthPercent: 60 });
    expect(s.flex).toBe('none');
    expect(s.width).toBe('60%');
    // 反例对照：非 flex 容器的按钮不需要 flex 字段
    expect(buttonSizeStyle({ widthMode: 'full', widthPercent: 60 }).flex).toBeUndefined();
  });

  it('🔴 两个分支都必须显式 display:block（inline 类里 auto 边距被当0）', () => {
    for (const p of [{ widthMode: 'full' }, { widthMode: 'full', widthPercent: 60 }, { widthMode: 'auto' }]) {
      const s = searchBoxSizeStyle(p);
      expect(s.display, JSON.stringify(p)).toBe('block');
      expect(String(s.display)).not.toContain('inline');
      // 搜索框：左侧不auto，剩余空间全让给右侧铃铛（见下方「铃铛贴右」用例）
      expect(s.marginLeft).toBe('0');
      expect(s.marginRight).toBe('auto');
      // 按钮：容器内居中，两侧 auto
      const b = buttonSizeStyle(p);
      expect(b.display, JSON.stringify(p)).toBe('block');
      expect(b.marginLeft).toBe('auto');
      expect(b.marginRight).toBe('auto');
    }
  });

  it('🔴 搜索框 margin-right:auto 把剩余空间让给铃铛（否则铃铛被推到中间/居左）', () => {
    // 用户反馈「搜索框右边的信息提示图标一直居左，感觉是多余的」：
    // 两侧 auto 会平分剩余空间 → 铃铛既不贴右也不贴左。
    for (const p of [{ widthMode: 'full' }, { widthMode: 'full', widthPercent: 60 }, { widthMode: 'auto' }]) {
      const s = searchBoxSizeStyle(p);
      expect(s.marginLeft, JSON.stringify(p)).toBe('0');
      expect(s.marginRight, JSON.stringify(p)).toBe('auto');
    }
  });

  it('宽度只由 widthPercent 决定，与容器 marginLR 无关（解耦核心）', () => {
    for (const lr of [0, 10, 20, 40]) {
      const s = searchBoxSizeStyle({ widthMode: 'full', widthPercent: 60, marginLR: lr });
      expect(s.width).toBe('60%'); // 与 lr 完全无关
      expect(s.flex).toBe('none');
    }
  });

  it('auto 模式：fit-content + flex:none（内容宽；搜索框靠左、按钮居中）', () => {
    const s = searchBoxSizeStyle({ widthMode: 'auto' });
    expect(s.width).toBe('fit-content');
    expect(s.flex).toBe('none');
    expect(s.marginLeft).toBe('0');
    expect(s.textAlign).toBe('center');
    // 按钮是容器里唯一元素 → 仍然居中
    const b = buttonSizeStyle({ widthMode: 'auto' });
    expect(b.width).toBe('fit-content');
    expect(b.marginLeft).toBe('auto');
    expect(b.marginRight).toBe('auto');
  });

  it('max-width:100% 兜底（百分比 +铃铛图标时别溢出）', () => {
    expect(searchBoxSizeStyle({ widthMode: 'full' }).maxWidth).toBe('100%');
    expect(searchBoxSizeStyle({ widthMode: 'auto' }).maxWidth).toBe('100%');
  });

  it('存量默认（未设 widthPercent）：满行 100%，视觉不变', () => {
    for (const fn of [searchBoxSizeStyle, buttonSizeStyle]) {
      const s = fn({});
      expect(s.width).toBe('100%');
      expect(s.boxSizing).toBe('border-box');
    }
  });

  it('百分比夹取到 20~100（非法 → 100）', () => {
    const f = (v) => containerChildSizeStyle({ widthMode: 'full', widthPercent: v }, { flexChild: true }).width;
    expect(f(5)).toBe('20%');
    expect(f(999)).toBe('100%');
    expect(f('abc')).toBe('100%');
    expect(f(0)).toBe('100%');
  });

  it('按钮 auto 模式额外加左右内边距（搜索框自身有 padding，不要重复加）', () => {
    expect(buttonSizeStyle({ widthMode: 'auto' }).padding).toBe('0 12px');
    expect(searchBoxSizeStyle({ widthMode: 'auto' }).padding).toBeUndefined();
  });

  it('🔴 不得再出现负margin / calc 溢出补偿（按钮第一轮的错误方案）', () => {
    for (const fn of [searchBoxSizeStyle, buttonSizeStyle]) {
      for (const p of [{ widthMode: 'full' }, { widthMode: 'full', marginLR: 20 }, { widthMode: 'auto', marginLR: 20 }]) {
        const s = fn(p);
        expect(String(s.width)).not.toContain('calc');
        expect(String(s.marginLeft || '')).not.toContain('-');
        expect(String(s.marginRight || '')).not.toContain('-');
      }
    }
  });

  it('样式对象不残留 undefined（小程序 setStyle 整条失效）', () => {
    for (const p of [{}, { widthMode: 'auto' }, { widthMode: 'full' }, { widthMode: 'full', marginLR: 0 }]) {
      for (const [k, v] of Object.entries(searchBoxSizeStyle(p))) {
        expect(v).not.toBeUndefined();
        expect(String(v)).not.toContain('undefined');
      }
    }
  });
});