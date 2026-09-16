// 系统风格（1:1 菜鸟云）工具测试：14 套预设色值 / applyScheme / 头部预览联动
import { describe, it, expect } from 'vitest';
import { STYLE_SCHEMES, DEFAULT_STYLE, applyScheme, headPreviewStyle } from './designStyle.js';

describe('系统风格（1:1 菜鸟云）', () => {
  it('14 套预设全量色值（主题/渐变/辅助/文字/文字辅色，与对标 colors_arr 实测一致）', () => {
    expect(STYLE_SCHEMES).toHaveLength(14);
    expect(STYLE_SCHEMES[0]).toEqual({ name: '碳黑', primaryColor: '#373C46', gradientColor: '#484D58', secondaryColor: '#EBEBEC', textColor: '#FFFFFF', subTextColor: '#373C46' });
    expect(STYLE_SCHEMES[1]).toEqual({ name: '克莱因蓝', primaryColor: '#002FA4', gradientColor: '#1149D2', secondaryColor: '#E5EAF6', textColor: '#FFFFFF', subTextColor: '#002FA4' });
    expect(STYLE_SCHEMES[2]).toEqual({ name: '琉璃蓝', primaryColor: '#165AE2', gradientColor: '#407cf6', secondaryColor: '#D0DEF9', textColor: '#FFFFFF', subTextColor: '#165AE2' });
    expect(STYLE_SCHEMES[3]).toEqual({ name: '青蓝', primaryColor: '#0DA29D', gradientColor: '#0FBBB5', secondaryColor: '#CFECEB', textColor: '#FFFFFF', subTextColor: '#0DA29D' });
    expect(STYLE_SCHEMES[4]).toEqual({ name: '深绿', primaryColor: '#0E9069', gradientColor: '#0E9082', secondaryColor: '#CFE9E1', textColor: '#FFFFFF', subTextColor: '#0E9069' });
    expect(STYLE_SCHEMES[5]).toEqual({ name: '草绿', primaryColor: '#4FA140', gradientColor: '#20AD80', secondaryColor: '#DCECD9', textColor: '#FFFFFF', subTextColor: '#4FA140' });
    expect(STYLE_SCHEMES[6]).toEqual({ name: '姜黄', primaryColor: '#FCB801', gradientColor: '#FCC601', secondaryColor: '#FFF8E5', textColor: '#FFFFFF', subTextColor: '#FCB801' });
    expect(STYLE_SCHEMES[7]).toEqual({ name: '香槟金', primaryColor: '#AA7646', gradientColor: '#D29256', secondaryColor: '#EEE4DA', textColor: '#FFFFFF', subTextColor: '#AA7646' });
    expect(STYLE_SCHEMES[8]).toEqual({ name: '赤橙', primaryColor: '#FF4400', gradientColor: '#FF884F', secondaryColor: '#FFDACC', textColor: '#FFFFFF', subTextColor: '#FF4400' });
    expect(STYLE_SCHEMES[9]).toEqual({ name: '绯红', primaryColor: '#F7201E', gradientColor: '#FD674D', secondaryColor: '#FEE8E8', textColor: '#FFFFFF', subTextColor: '#F7201E' });
    expect(STYLE_SCHEMES[10]).toEqual({ name: '玫红', primaryColor: '#FE0137', gradientColor: '#FF5169', secondaryColor: '#FFE5EB', textColor: '#FFFFFF', subTextColor: '#FE0137' });
    expect(STYLE_SCHEMES[11]).toEqual({ name: '粉红', primaryColor: '#FF3A68', gradientColor: '#FF547C', secondaryColor: '#FFEBF0', textColor: '#FFFFFF', subTextColor: '#FF3A68' });
    expect(STYLE_SCHEMES[12]).toEqual({ name: '深紫', primaryColor: '#722ED1', gradientColor: '#7C72E0', secondaryColor: '#E3D5F6', textColor: '#FFFFFF', subTextColor: '#722ED1' });
    expect(STYLE_SCHEMES[13]).toEqual({ name: '蓝紫', primaryColor: '#6954F0', gradientColor: '#4068F9', secondaryColor: '#DBD5FF', textColor: '#FFFFFF', subTextColor: '#6954F0' });
  });

  it('默认系统风格 = 玫红 11 号方案（头部跟随主色/白字）', () => {
    expect(DEFAULT_STYLE.colorScheme).toBe(11);
    expect(DEFAULT_STYLE.primaryColor).toBe('#FE0137');
    expect(DEFAULT_STYLE.headColor).toBe('1');
    expect(DEFAULT_STYLE.headText).toBe('#ffffff');
  });

  it('applyScheme：n=1-14 填充对应方案 5 色；n=0 仅标记自定义保留当前色', () => {
    const s1 = applyScheme(DEFAULT_STYLE, 3);
    expect(s1.colorScheme).toBe(3);
    expect(s1.primaryColor).toBe('#165AE2');
    expect(s1.gradientColor).toBe('#407cf6');
    expect(s1.secondaryColor).toBe('#D0DEF9');
    expect(s1.textColor).toBe('#FFFFFF');
    expect(s1.subTextColor).toBe('#165AE2');
    const custom = applyScheme(DEFAULT_STYLE, 0);
    expect(custom.colorScheme).toBe(0);
    expect(custom.primaryColor).toBe(DEFAULT_STYLE.primaryColor);
  });

  it('applyScheme：越界编号不改变原值', () => {
    const s = applyScheme(DEFAULT_STYLE, 99);
    expect(s.colorScheme).toBe(11);
    expect(s.primaryColor).toBe('#FE0137');
  });

  it('headPreviewStyle：跟随主色→主题色底+头部文字色；白色头部→白底黑字', () => {
    const follow = headPreviewStyle({ headColor: '1', headText: '#000000', primaryColor: '#0DA29D' });
    expect(follow).toEqual({ background: '#0DA29D', color: '#000000' });
    const white = headPreviewStyle({ headColor: '2', headText: '#ffffff', primaryColor: '#FE0137' });
    expect(white).toEqual({ background: '#FFFFFF', color: '#000000' });
  });
});
