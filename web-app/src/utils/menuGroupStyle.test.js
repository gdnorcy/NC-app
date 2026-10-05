import { describe, it, expect } from 'vitest';
import {
  MENU_SHAPE_RADIUS, MENU_STYLE_PARTS, MENU_LIMITS,
  menuRootClass, menuRootStyle, menuItemStyle,
  menuIconStyle, menuImgStyle, menuTextStyle, menuMarkStyle,
} from './menuGroupStyle.js';

// 基准值全部来自对标站（eweishop，内部键名 menu）CDP 实测，改动前请先复核对标站
const P = {
  navStyle: 'style1', navShape: 'circle', iconType: '1',
  newStyle: '', showStyle: '',
  columns: 4, imgSize: 43, fontSize: 14, bold: false,
  compBgColor: '', itemBgColor: 'transparent',
  textColor: '#333333', borderColor: '#EDEDED',
  marginTop: 8, marginBottom: 8, marginLR: 0,
  radiusTop: 0, radiusBottom: 0,
};

describe('menuGroupStyle · 对标站实测值锁定', () => {
  it('形状 → 圆角：square=0 / arc=10px / circle=50%', () => {
    expect(MENU_SHAPE_RADIUS.square).toBe(0);
    expect(MENU_SHAPE_RADIUS.arc).toBe(10);
    expect(MENU_SHAPE_RADIUS.circle).toBe('50%');
  });

  it('🔴 square 的圆角 0 必须真的发射（写 if(r) 会回落基础圆角→看着还是圆的）', () => {
    const s = menuImgStyle({ ...P, navShape: 'square' });
    expect(s.borderRadius).toBe('0px');
  });
  it('arc 发10px / circle 发 50%', () => {
    expect(menuImgStyle({ ...P, navShape: 'arc' }).borderRadius).toBe('10px');
    expect(menuImgStyle({ ...P, navShape: 'circle' }).borderRadius).toBe('50%');
  });

  it('按钮样式 → 图/文字的显隐（style2 仅图、style3 仅文）', () => {
    expect(MENU_STYLE_PARTS.style1).toEqual({ img: true, text: true });
    expect(MENU_STYLE_PARTS.style2).toEqual({ img: true, text: false });
    expect(MENU_STYLE_PARTS.style3).toEqual({ img: false, text: true });
  });

  it('根 class 带列数（3/4/5 都要吃得下）与形状', () => {
    expect(menuRootClass({ ...P, columns: 3 })).toContain('mg-col-3');
    expect(menuRootClass({ ...P, columns: '4' })).toContain('mg-col-4');
    expect(menuRootClass({ ...P, columns: 5 })).toContain('mg-col-5');
    expect(menuRootClass({ ...P, navShape: 'arc' })).toContain('mg-arc');
  });

  it('单行滑动才加 mg-scroll，固定/分页不加', () => {
    expect(menuRootClass({ ...P, showStyle: 'scroll' })).toContain('mg-scroll');
    expect(menuRootClass({ ...P, showStyle: 'swiper' })).not.toContain('mg-scroll');
    expect(menuRootClass({ ...P, showStyle: '' })).not.toContain('mg-scroll');
  });

  it('🔴 非法列数必须回落默认 4（不能生成 mg-col-0，那会让 CSS 失配→整行拉满）', () => {
    expect(menuRootClass({ ...P, columns: 0 })).toContain('mg-col-4');
    expect(menuRootClass({ ...P, columns: '' })).toContain('mg-col-4');
    expect(menuRootClass({ ...P, columns: undefined })).toContain('mg-col-4');
    expect(menuRootClass({ ...P, columns: NaN })).toContain('mg-col-4');
    // 越界上限夹到 5
    expect(menuRootClass({ ...P, columns: 99 })).toContain('mg-col-5');
  });

  it('组件样式：描边用 border（占布局）、投影用 boxShadow（不占布局）', () => {
    const b = menuRootStyle({ ...P, newStyle: 'border' });
    expect(b.border).toBe('1px solid #EDEDED');
    expect(b.boxShadow).toBeUndefined();
    const sh = menuRootStyle({ ...P, newStyle: 'shadow' });
    expect(sh.boxShadow).toBe('rgba(226, 231, 244, 0.7) 0px 0px 10px 0px');
    expect(sh.border).toBeUndefined();
  });

  it('根 padding 恒为 4px 0（实测值，不是 0 —— 上下各留 4px 给阴影/描边）', () => {
    expect(menuRootStyle(P).padding).toBe('4px 0');
  });

  it('四项圆角都发射（即使为 0），左右边距拆成 marginLeft/Right', () => {
    const s = menuRootStyle({ ...P, radiusTop: 0, radiusBottom: 6, marginLR: 12 });
    expect(s.borderTopLeftRadius).toBe('0px');
    expect(s.borderTopRightRadius).toBe('0px');
    expect(s.borderBottomLeftRadius).toBe('6px');
    expect(s.borderBottomRightRadius).toBe('6px');
    expect(s.marginLeft).toBe('12px');
    expect(s.marginRight).toBe('12px');
  });

  it('固定显示时列宽 = 100/列数%（实测 4 列 = 25% → 375/4 = 93.75）', () => {
    expect(menuItemStyle({ ...P, columns: 4 }).width).toBe('25.0000%');
    expect(menuItemStyle({ ...P, columns: 3 }).width).toBe('33.3333%');
    expect(menuItemStyle({ ...P, columns: 5 }).width).toBe('20.0000%');
  });

  it('单行滑动时列宽固定 64.61px + 8px 间距（实测值，不是均分）', () => {
    const s = menuItemStyle({ ...P, showStyle: 'scroll' });
    expect(s.width).toBe('64.61px');
    expect(s.marginRight).toBe('8px');
    expect(s.flexShrink).toBe('0');
  });

  it('图区 = 图 + 7（实测 imgSize 43 → .icon 50）', () => {
    expect(menuIconStyle(P).width).toBe('50px');
    expect(menuIconStyle({ ...P, imgSize: 60 }).height).toBe('67px');
  });

  it('文字 lh = fontSize + 7（实测 14 → 21），加粗走 bold', () => {
    expect(menuTextStyle(P).lineHeight).toBe('21px');
    expect(menuTextStyle(P).fontWeight).toBe('normal');
    expect(menuTextStyle({ ...P, bold: true }).fontWeight).toBe('bold');
  });

  it('滑块范围与实测反推一致（边距 0~50 / 圆角 0~20 / 字号 8~17 / 图 20~60）', () => {
    expect(MENU_LIMITS.margin).toEqual({ min: 0, max: 50 });
    expect(MENU_LIMITS.radius).toEqual({ min: 0, max: 20 });
    expect(MENU_LIMITS.fontSize).toEqual({ min: 8, max: 17 });
    expect(MENU_LIMITS.imgSize).toEqual({ min: 20, max: 60 });
  });

  // ── 标签（角标）尺寸：2026-10-06 新增组件级参数 markSize / markFontSize ──
  // 语义（用户 2026-10-06 二次纠正）：标签大小 = 整块缩放（**宽高都变**，宽=高×2.07）；
  // 标签文字大小 = 只改字号，标签盒子（宽+高）完全不动。
  it('角标默认尺寸 = 实测视觉值（29×14 / 字 8），props 缺省也回落同值', () => {
    const it = { labelBgColor: '#F83287', labelTextColor: '#FFFFFF' };
    for (const p of [{}, undefined, { markSize: 14, markFontSize: 8 }]) {
      const s = menuMarkStyle(it, p);
      expect(s.width).toBe('29px');   // round(14*2.07)=29，与实测 29×14 吻合
      expect(s.height).toBe('14px');
      expect(s.lineHeight).toBe('14px');
      expect(s.fontSize).toBe('8px');
      expect(s.textAlign).toBe('center');
      expect(s.overflow).toBe('hidden');
    }
  });

  it('标签大小整块缩放：宽高同步变大（宽=高×2.07）', () => {
    const s = menuMarkStyle({}, { markSize: 28 });
    expect(s.height).toBe('28px');
    expect(s.width).toBe('58px'); // round(28*2.07)
    expect(s.lineHeight).toBe('28px');
    expect(menuMarkStyle({}, { markSize: 10 }).width).toBe('21px');
  });

  it('标签文字大小只改字号：标签盒子（宽+高）纹丝不动', () => {
    const s = menuMarkStyle({}, { markFontSize: 16 });
    expect(s.fontSize).toBe('16px');
    expect(s.width).toBe('29px');
    expect(s.height).toBe('14px');
    expect(menuMarkStyle({}, { markSize: 20 }).width).toBe('41px'); // round(20*2.07)
    expect(menuMarkStyle({}, { markSize: 20 }).fontSize).toBe('8px');
  });

  it('角标尺寸夹紧到滑杆范围（高 10~28 / 字 6~16），颜色仍取项级字段', () => {
    const s = menuMarkStyle({ labelBgColor: '#FF0000', labelTextColor: '#00FF00' }, { markSize: 99, markFontSize: 1 });
    expect(s.height).toBe('28px');
    expect(s.fontSize).toBe('6px');
    expect(s.background).toBe('#FF0000');
    expect(s.color).toBe('#00FF00');
    expect(menuMarkStyle({}, { markSize: 5 }).height).toBe('10px');
  });
});
