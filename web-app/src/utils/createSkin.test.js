/**
 * 创建名片页配色 token 测试（2026-10-06）
 *
 * 锁定两件事：
 * 1. 配色**源**是系统主题（--design-*），不是名片模板 themeConfig
 *    —— 历史 bug：原本取模板色，换模板就整页换色；预览卡删了后已无理由。
 * 2. 明暗分支由主色亮度决定，且两支都发全 token（缺一个 → 页面某处回落兜底色，看着像"主题没生效"）。
 */
import { describe, it, expect } from 'vitest';
import { buildCreateSkinVars, hexLuma, hexA } from './createSkin.js';

/** 构造 designThemeVars() 产物风格的输入 */
const theme = (primary, extra = {}) => ({
  '--design-primary': primary,
  '--design-gradient': extra.gradient || '#4d8dff',
  '--design-secondary': extra.secondary || '#E8F3FF',
  ...extra,
});

describe('hexLuma / hexA', () => {
  it('hexLuma：白亮蓝暗；3 位hex 展开；非 hex 按浅色 200', () => {
    expect(hexLuma('#ffffff')).toBeCloseTo(255);
    expect(hexLuma('#000000')).toBeCloseTo(0);
    expect(hexLuma('#165dff')).toBeLessThan(160); // 品牌蓝→ 暗色皮肤分支
    expect(hexLuma('#f5f7fa')).toBeGreaterThan(160); // 浅色 → 浅色皮肤分支
    expect(hexLuma('#fff')).toBeCloseTo(255); // 3 位等价 #ffffff
    expect(hexLuma('rgba(0,0,0,.5)')).toBe(200);
    expect(hexLuma('')).toBe(200);
  });

  it('hexA：hex → rgba 覆盖alpha；rgba 入参改写 alpha；空值走兜底', () => {
    expect(hexA('#165dff', 0.35)).toBe('rgba(22,93,255,0.35)');
    expect(hexA('#fff', 0.5)).toBe('rgba(255,255,255,0.5)');
    expect(hexA('rgba(255,255,255,.85)', 0.2)).toBe('rgba(255,255,255,0.2)');
    expect(hexA('', 0.3)).toBe('rgba(22,93,255,0.3)');
  });
});

describe('buildCreateSkinVars（配色源= 系统主题）', () => {
  it('主色/渐变/辅助色全部来自 --design-*，改主题整页跟随', () => {
    const v = buildCreateSkinVars(theme('#FE0137', { gradient: '#FF5169', secondary: '#FFE5EB' }));
    expect(v['--primary']).toBe('#FE0137');
    expect(v['--success']).toBe('#FE0137');
    expect(v['--theme-tint']).toBe('#FFE5EB');
    // header / 聚焦圈 / 分隔线含主色原文；按钮在 dark 分支转成 rgba + shadeHex(仍同色系)
    expect(v['--sk-header']).toContain('#FE0137');
    expect(v['--sk-input-focus']).toBe('#FE0137');
    expect(v['--sk-line']).toContain('#FE0137');
    expect(v['--sk-btn']).toContain('rgba(254,1,55'); // 主色 rgba 化，无写死蓝
    // 整份产物不含任何写死蓝/ 旧聚焦蓝
    expect(JSON.stringify(v)).not.toContain('22,93,255');
    expect(JSON.stringify(v)).not.toContain('#2f6bff');
    expect(JSON.stringify(v)).not.toContain('7,193,96'); // 旧按钮 glow 的微信绿
  });

  it('深色主色 → dark 皮肤：白字 + 半透明卡 + 衬线字体', () => {
    const v = buildCreateSkinVars(theme('#1a1a2e'));
    expect(v['--sk-skin']).toBe('dark');
    expect(v['--t1']).toBe('#ffffff');
    expect(v['--sk-hd-text']).toBe('#ffffff');
    expect(v['--sk-card-bg']).toBe('rgba(255,255,255,0.08)');
    expect(v['--sk-title-font']).toContain('serif');
    expect(v['--sk-bg']).toContain('radial-gradient');
  });

  it('浅色主色 → light 皮肤：深字 + 白卡 + 衬线字体**不**启用', () => {
    const v = buildCreateSkinVars(theme('#f5f7fa'));
    expect(v['--sk-skin']).toBe('light');
    expect(v['--t1']).toBe('#1d2129');
    expect(v['--sk-card-bg']).toBe('#ffffff');
    // dark 分支专属的 --sk-title-font 在 light 下必须不存在（存在会让标题变宋体）
    expect(v['--sk-title-font']).toBeUndefined();
    expect(v['--sk-bg']).toContain('#f6f7fb');
  });

  it('两支都必须发全 token（缺一个 → 该处回落兜底色，看着像主题没生效）', () => {
    const lightKeys = Object.keys(buildCreateSkinVars(theme('#f5f7fa'))).sort();
    const darkKeys = Object.keys(buildCreateSkinVars(theme('#1a1a2e'))).sort();
    // dark 支允许多 --sk-title-font（浅色下不能有）
    const missing = lightKeys.filter((k) => !darkKeys.includes(k));
    expect(missing).toEqual([]);
    // --sk-line 两支共有
    expect(lightKeys).toContain('--sk-line');
    expect(darkKeys).toContain('--sk-line');
    // --bg-hover 曾缺失（.btn-secondary 引用它）→ 暗色下按钮会透明
    expect(lightKeys).toContain('--bg-hover');
    expect(darkKeys).toContain('--bg-hover');
  });

  it('空/异常主题 → 落回品牌蓝，不崩不返回空对象', () => {
    for (const bad of [null, undefined, {}]) {
      const v = buildCreateSkinVars(bad);
      expect(v['--primary']).toBe('#165dff');
      expect(Object.keys(v).length).toBeGreaterThan(15);
      // ⚠️ 品牌蓝 #165dff 亮度 92 < 160 → 兜底走 dark 皮肤分支（历史行为，非笔误）。
      // 这意味着「设计中心未配置配色」时创建页是暗色皮肤；改兜底色亮度会翻转整页皮肤。
      expect(v['--sk-skin']).toBe('dark');
      expect(v['--sk-card-bg']).toBe('rgba(255,255,255,0.08)');
    }
  });

  it('鎏金亮色主色 → 走 light 分支（亮度 162>160），按钮白字', () => {
    expect(buildCreateSkinVars(theme('#c9a25e'))['--sk-skin']).toBe('light');
    // dark 分支内：点缀色够亮时按钮文字转深色（黑金=金钮深字）
    expect(buildCreateSkinVars(theme('#1a1a2e'))['--sk-btn-text']).toBe('#ffffff');
  });

  it('明暗分界：主色亮度 160 附近翻转（回归锁，防阈值误改导致整页变另一支）', () => {
    expect(buildCreateSkinVars(theme('#e8e8e8'))['--sk-skin']).toBe('light'); // 232
    expect(buildCreateSkinVars(theme('#8a8a8a'))['--sk-skin']).toBe('dark'); // 138
  });

  it('dark 画布=中性墨色，主题色只作光晕/按钮/焦点（2026-10-07 反馈：整页泼主题色不可看）', () => {
    const v = buildCreateSkinVars(theme('#FE0137', { gradient: '#FF5169' }));
    // 画布底是墨色（任何主色都成立），主题色仅作顶部光晕
    expect(v['--sk-bg']).toContain('#17171e');
    expect(v['--sk-bg']).toContain('rgba(254,1,55,0.26)');
    // 输入框描边改中性发丝线（曾每个框一圈主题色），焦点圈才是主题色主场
    expect(v['--sk-input-border']).toBe('1px solid rgba(255,255,255,0.16)');
    expect(v['--sk-input-border']).not.toContain('rgba(254,1,55');
    expect(v['--sk-input-focus']).toBe('#FE0137');
    // 卡片描边去三层 accent 光晕，改品牌发丝线 + 深投影
    expect(v['--sk-card-frame']).not.toContain('inset');
    expect(v['--sk-card-frame']).not.toContain('26rpx');
    // 主题色主场仍在：hero 头部渐变 / 主按钮 / 分隔线
    expect(v['--sk-header']).toContain('#FE0137');
    expect(v['--sk-btn']).toContain('rgba(254,1,55');
    expect(v['--sk-line']).toContain('#FE0137');
  });
});