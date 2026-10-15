/**
 * 名片模板主题 schema 解析回归（2026-10-08 审查）
 *
 * 本项目的信息：`|| 默认值` 是「0 值陷阱」的高发写法 —— 0 是合法配置
 * （0deg 渐变角 / 零圆角 / 零间距），用 truthy 回退会让运营**永远设不出 0**，
 * 表现为「我改成 0 了保存后又变回去」。本文件锁住这两处。
 */
import { describe, it, expect } from 'vitest';
import { parseTheme, heroRadius, heroForeground } from './templateTheme.js';

describe('parseTheme 零值与非法值处理', () => {
  it('🔴 bgAngle=0 必须保留 0（原 Number(x)||160 会改成 160）', () => {
    expect(parseTheme({ bgAngle: 0 }).bgAngle).toBe(0);
  });

  it('bgAngle 越界/非法回落 160', () => {
    expect(parseTheme({ bgAngle: 999 }).bgAngle).toBe(360);   // 夹上限
    expect(parseTheme({ bgAngle: -10 }).bgAngle).toBe(0);     // 夹下限
    expect(parseTheme({ bgAngle: 'abc' }).bgAngle).toBe(160); // 非法回落默认
    expect(parseTheme({}).bgAngle).toBe(160);
  });

  it('🔴 radius=0 必须保留 0（原 Number(x)||18 会改成 18，零圆角设不出来）', () => {
    expect(parseTheme({ radius: 0 }).radius).toBe(0);
    expect(heroRadius({ radius: 0 })).toBe('0rpx');
  });

  it('radius 越界/非法回落安全值', () => {
    expect(parseTheme({ radius: 999 }).radius).toBe(48);
    expect(parseTheme({ radius: 'x' }).radius).toBe(18);
    expect(parseTheme({}).radius).toBe(18);
  });

  it('heroRadius 头像分支：杂志/圆像明净走圆形，其余为 base+14 且不超过 36', () => {
    expect(heroRadius({ radius: 12 }, true)).toBe('26rpx');
    expect(heroRadius({ radius: 40 }, true)).toBe('36rpx');    // min(40+14,36)
    expect(heroRadius({ heroLayout: 'mag', radius: 12 }, true)).toBe('50%');
    expect(heroRadius({ heroLayout: 'pano3', radius: 12 }, true)).toBe('50%');
  });
});

/**
 * hero 前景单一裁决：2026-10-15 真机报修「同一张 hero 里黑字 + 白图标 + 黄职务色」
 * 根因是「一部分元素按背景亮度算、一部分照抄后台配置的品牌前景色」。
 * 后台能配出自相矛盾的五色（亮黄底 #FCB801 + 白字 #FFFFFF + 奶油点缀 #FFF8E5），
 * 照抄必然不可读 → 必须按对比度裁掉，且全站前景只能从 heroForeground 出。
 */
describe('heroForeground 前景裁决（背景亮度 + 对比度双重闸门）', () => {
  // 真实租户配置：亮黄主色 + 白字 + 黄次文字 + 奶油点缀（自相矛盾的一套）
  const BRAND = { text: '#FFFFFF', text2: '#FCB801', accent: '#FFF8E5' };

  it('亮黄 hero：配置白字不达标 → 回落深灰 #1d2129（而不是白字压黄底）', () => {
    const fg = heroForeground('#FCB801', '#FCC601', BRAND);
    expect(fg.light).toBe(true);
    expect(fg.text).toBe('#1d2129');
  });

  it('亮黄 hero：配置次文字是同色系黄 → 回落半透明深灰（职务不再消失）', () => {
    const fg = heroForeground('#FCB801', '#FCC601', BRAND);
    // .78 是实测值：再低职务文字对比度掉到 3.0 以下（职务是用户最先抱怨的元素）
    expect(fg.text2).toBe('rgba(29,33,41,.78)');
  });

  it('亮黄 hero：奶油点缀不可见 → 回落主色暗阶（分隔线/圆点看得见）', () => {
    const fg = heroForeground('#FCB801', '#FCC601', BRAND);
    expect(fg.accent).toBe('#894500'); // shadeHex('#FCB801', -0.45)：深棕，压在黄底上才看得见
    expect(fg.border).toBe('rgba(0,0,0,.14)');
  });

  it('深色 hero：白字/浅辅色本来合格则保留（不误杀正常配置）', () => {
    const fg = heroForeground('#1a1a2e', '#0f3460', { text: '#ffffff', text2: 'rgba(255,255,255,.85)', accent: '#ffd166' });
    expect(fg.light).toBe(false);
    expect(fg.text).toBe('#ffffff');
    expect(fg.text2).toBe('rgba(255,255,255,.85)');
    expect(fg.accent).toBe('#ffd166');
  });

  it('浅底 + 深字配置（如纸艺模板）合格 → 尊重配置不自作主张', () => {
    const fg = heroForeground('#fdfcf9', '#f4efe6', { text: '#2b2723', text2: '#6b6459', accent: '#c9a25e' });
    expect(fg.light).toBe(true);
    expect(fg.text).toBe('#2b2723');
    expect(fg.text2).toBe('#6b6459');
  });

  it('空配置 → 按背景自动出前景（无品牌色时也能用）', () => {
    expect(heroForeground('#165dff', '#0e42d2', {}).text).toBe('#ffffff');
    expect(heroForeground('#FCB801', '#FCC601', {}).text).toBe('#1d2129');
  });
});
