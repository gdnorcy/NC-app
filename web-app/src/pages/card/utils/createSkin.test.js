/**
 * 创建名片页配色 token 测试（2026-10-06 抽出；2026-10-07 改统一浅色画布）
 *
 * 锁定四件事：
 * 1. 配色**源**是系统主题（--design-*），不是名片模板 themeConfig
 *    —— 历史 bug：原本取模板色，换模板就整页换色；预览卡删了后已无理由。
 * 2. 画布统一浅色（v3 定稿）：v1 整页泼主题色（高饱和色刺眼）、v2 墨色画布（太暗、
 *    与 C 端浅色页面脱节）先后被否 → 现在任何主色都是 #f6f7fb 浅底 + 白卡 + 主题色点缀。
 * 3. 头部是主题色**纯色**（v3.3 定稿）：v3.1 透明化被否 → v3.2 恢复渐变（135→180deg）
 *    → v3.3 用户反馈「渐变不太美观」改纯色；步骤数字用 --sk-hd-sub 同色系。
 * 4. 文字对色按主色亮度：头部/按钮文字（主色偏浅（浅金 luma≈166）时转深字）——
 *    判据走 heroForeground 的渐变中值口径，纯色也不改口（灰区主色按纯色判会误落白字）。
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
    expect(hexLuma('#165dff')).toBeLessThan(160);
    expect(hexLuma('#f5f7fa')).toBeGreaterThan(160);
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

describe('buildCreateSkinVars（配色源= 系统主题，统一浅色画布）', () => {
  it('主色/渐变/辅助色全部来自 --design-*，改主题整页跟随', () => {
    const v = buildCreateSkinVars(theme('#FE0137', { gradient: '#FF5169', secondary: '#FFE5EB' }));
    expect(v['--primary']).toBe('#FE0137');
    expect(v['--success']).toBe('#FE0137');
    expect(v['--theme-tint']).toBe('#FFE5EB');
    // 主题色主场：头部纯色 / 主按钮 / 聚焦圈 / 分隔线 含主色原文（v3.3 纯色头）
    expect(v['--sk-header']).toContain('#FE0137');
    expect(v['--sk-btn']).toContain('#FE0137');
    expect(v['--sk-input-focus']).toBe('#FE0137');
    expect(v['--sk-line']).toContain('#FE0137');
    // 整份产物不含任何写死蓝 / 旧聚焦蓝 / 旧按钮 glow 微信绿
    expect(JSON.stringify(v)).not.toContain('22,93,255');
    expect(JSON.stringify(v)).not.toContain('#2f6bff');
    expect(JSON.stringify(v)).not.toContain('7,193,96');
  });

  it('统一浅色画布（v3）：任何主色都是 #f6f7fb 浅底 + 白卡 + 深字层级 + 纯色头部', () => {
    for (const primary of ['#FE0137', '#165dff', '#1a1a2e', '#c9a25e', '#f5f7fa']) {
      const v = buildCreateSkinVars(theme(primary));
      expect(v['--sk-skin']).toBe('light');
      expect(v['--sk-bg']).toContain('#f6f7fb'); // 系统灰底
      expect(v['--sk-bg']).not.toContain('radial-gradient'); // v2 墨色画布勿复活
      expect(v['--sk-header']).toContain(primary); // v3.3 纯色头部（勿回透明，也别整页泼色）
      // v3.3（2026-10-16 用户反馈「渐变不太美观」）：头部/按钮恒等于主色本身，
      // 不是 linear-gradient——防回退渐变（渐变方向 135→180deg 那两轮也一并封死）
      expect(v['--sk-header']).toBe(primary);
      expect(v['--sk-btn']).toBe(primary);
      expect(v['--sk-header']).not.toContain('gradient');
      expect(v['--sk-btn']).not.toContain('gradient');
      expect(v['--sk-card-bg']).toBe('#ffffff');
      expect(v['--t1']).toBe('#1d2129');
      expect(v['--sk-title-font']).toBeUndefined(); // 衬线标题随 dark 皮肤一并移除
    }
    // 顶部晕染用主题色（红主题 → rgba(254,1,55,0.16)）
    expect(buildCreateSkinVars(theme('#FE0137'))['--sk-bg']).toContain('rgba(254,1,55,0.16)');
  });

  it('文字对色（v3.3 同口径）：饱和主色头部/按钮白字，浅主色（浅金 luma≈166）转深字', () => {
    // 红（亮度~83）→ 头部/按钮白字
    const red = buildCreateSkinVars(theme('#FE0137'));
    expect(red['--sk-hd-text']).toBe('#ffffff');
    expect(red['--sk-btn-text']).toBe('#ffffff');
    expect(red['--sk-hd-sub']).toBe('rgba(255,255,255,0.8)');
    // 浅金（亮度 162，落在 140~180 灰区）→ 深字（按纯主色判会误落白字：白/浅金仅 2.4:1；
    // 渐变中值口径 ≈199>180 才正确落深字 6.8:1）——v3.3 改纯色也不改这个判据
    const gold = buildCreateSkinVars(theme('#c9a25e'));
    expect(gold['--sk-hd-text']).toBe('#1d2129');
    expect(gold['--sk-btn-text']).toBe('#1d2129');
    expect(gold['--sk-hd-sub']).toBe('#4e5969');
  });

  it('必须发全 token（缺一个 → 该处回落兜底色，看着像主题没生效）', () => {
    const keys = Object.keys(buildCreateSkinVars(theme('#FE0137')));
    for (const k of ['--sk-line', '--bg-hover', '--sk-btn', '--sk-header', '--sk-input-focus', '--sk-card-frame', '--theme-tint']) {
      expect(keys).toContain(k);
    }
    expect(keys.length).toBeGreaterThan(18);
  });

  it('空/异常主题 → 落回品牌蓝，不崩不返回空对象', () => {
    for (const bad of [null, undefined, {}]) {
      const v = buildCreateSkinVars(bad);
      expect(v['--primary']).toBe('#165dff');
      expect(Object.keys(v).length).toBeGreaterThan(18);
      // v3 起兜底也是浅色画布（v2 及以前品牌蓝亮度 92<160 会落 dark 分支，已无分支）
      expect(v['--sk-skin']).toBe('light');
      expect(v['--sk-card-bg']).toBe('#ffffff');
    }
  });
});
