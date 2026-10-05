import { describe, it, expect } from 'vitest';
import { componentRegistry as COMPONENTS } from './componentRegistry.js';
import { menuIconUrl, MENU_ICON_COUNT } from '../../../../../../web-app/src/utils/sampleImages.js';

/**
 * 按钮组（menu-group）schema 契约测试。
 * 三条用户反馈（2026-10-05）在此锁定，防止无声回归：
 *   ① 按钮类型=图标 → 必须有「图标」选择框（whenProps.iconType='2'）
 *   ② 图片字段 → 40px 缩略图（mini）且不要说明文字（help:''）
 *   ③ 默认 10 项，默认图标取自 sampleImages 的 menu-icon-1~10
 */
describe('按钮组 menu-group schema', () => {
  const comp = COMPONENTS.find((c) => c.type === 'menu-group');
  const itemsField = comp.schema.find((f) => f.key === 'items');
  const field = (k) => itemsField.itemFields.find((f) => f.key === k);

  it('挂在基础组件分组且已注册', () => {
    expect(comp).toBeTruthy();
    expect(comp.name).toBe('按钮组');
    expect(comp.group).toBe('basic');
  });

  it('③ 默认 10 项，且每项都带默认图标 URL', () => {
    expect(comp.defaultProps.items).toHaveLength(10);
    for (const it of comp.defaultProps.items) {
      expect(it.imgUrl).toMatch(/menu-icon-\d+\.jpg$/);
      expect(it.text).toBe('按钮文字');
    }
  });

  it('③ 默认图标 1..10 各用一张，不重复', () => {
    const urls = comp.defaultProps.items.map((i) => i.imgUrl);
    expect(new Set(urls).size).toBe(10);
  });

  it('menuIconUrl 越界按 10 取模循环，不返回 undefined', () => {
    expect(MENU_ICON_COUNT).toBe(10);
    expect(menuIconUrl(1)).toContain('menu-icon-1.jpg');
    expect(menuIconUrl(10)).toContain('menu-icon-10.jpg');
    expect(menuIconUrl(11)).toContain('menu-icon-1.jpg');
    // 非法入参（0 / NaN / undefined）都按第 1 张兜底，绝不返回 undefined
    expect(menuIconUrl(0)).toContain('menu-icon-1.jpg');
    expect(menuIconUrl(undefined)).toContain('menu-icon-1.jpg');
    expect(menuIconUrl('x')).toContain('menu-icon-1.jpg');
  });

  it('① 按钮类型=图标 时有图标选择框', () => {
    const f = field('icon');
    expect(f).toBeTruthy();
    expect(f.control).toBe('select');
    expect(f.options.length).toBeGreaterThan(0);
    expect(f.whenProps).toEqual({ iconType: '2' });
  });

  it('① 图片字段只在「按钮类型=图片 + 样式含图」时出现', () => {
    expect(field('imgUrl').whenProps).toEqual({ iconType: '1', navStyle: ['style1', 'style2'] });
  });

  it('① 文字字段只在「样式含文字」时出现', () => {
    expect(field('text').whenProps).toEqual({ navStyle: ['style1', 'style3'] });
  });

  it('② 图片字段是缩略图且不要说明文字', () => {
    const f = field('imgUrl');
    expect(f.mini).toBe(true);
    // 说明文字用显式空串表达「不要」；undefined 才会回落默认文案
    expect(f.help).toBe('');
  });

  it('按钮类型默认值是图片，与图片字段互斥关系自洽', () => {
    expect(comp.defaultProps.iconType).toBe('1');
    expect(comp.defaultProps.navStyle).toBe('style1');
  });

  // ── 2026-10-06 三条反馈 ──
  it('样式区新增 标签大小/标签文字大小 滑杆（组件级，仅含图档位显示）', () => {
    const mark = comp.schema.filter((f) => f.key === 'markSize' || f.key === 'markFontSize');
    expect(mark.map((f) => f.key)).toEqual(['markSize', 'markFontSize']);
    for (const f of mark) {
      expect(f.control).toBe('slider');
      expect(f.section).toBe('style');
      expect(f.when).toEqual({ navStyle: ['style1', 'style2'] });
    }
    expect(comp.defaultProps.markSize).toBe(14); // 实测视觉值，存量数据零变化
    expect(comp.defaultProps.markFontSize).toBe(8);
  });

  it('图标设置的字段全部左右排列（inline）', () => {
    for (const f of itemsField.itemFields) expect(f.inline).toBe(true);
  });

  it('按钮样式/按钮形状 显示标题 + 小示意图，样式示意图三档可辨', () => {
    const navStyle = comp.schema.find((f) => f.key === 'navStyle');
    const navShape = comp.schema.find((f) => f.key === 'navShape');
    for (const f of [navStyle, navShape]) {
      expect(f.graphic).toBe(true);
      expect(f.graphicLabel).toBe(true); // 图形化 radio 也显示字段名
      expect(f.graphicSmall).toBe(true); // 示意图收小（56→36px）
    }
    // 三档各带 menuStyle 预览标识，值与档位一一对应
    expect(navStyle.options.map((o) => o.menuStyle)).toEqual(['style1', 'style2', 'style3']);
    expect(navShape.options.every((o) => 'shapePreview' in o)).toBe(true);
  });
});
