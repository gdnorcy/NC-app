import { describe, it, expect } from 'vitest';
import {
  STYLE_SCHEMA, defaultStyle, styleSchema, migrateStyle, componentStyleVars,
} from './componentStyle.js';

// ew 超级表单 29 种组件（基础 17 / 特殊 5 / 装修 7）
const ALL_TYPES = [
  'text', 'textarea', 'image', 'radio', 'checkbox', 'select', 'number', 'date', 'time',
  'location', 'attachment', 'sms', 'agreement', 'rate', 'filedownload', 'phoneauth', 'carplate',
  'pagebreak', 'submit', 'backdesc', 'realtime', 'pay',
  'swiper', 'bigimage', 'title', 'richtext', 'blank', 'line', 'video',
];

describe('超级表单组件样式 schema', () => {
  it('29 种组件全部有专用样式 schema（杜绝回落到别组件的通用面板）', () => {
    const missing = ALL_TYPES.filter((t) => !STYLE_SCHEMA[t]);
    expect(missing).toEqual([]);
    expect(Object.keys(STYLE_SCHEMA).length).toBe(ALL_TYPES.length);
  });

  it('每种组件默认样式都含四段：组件背景 + 组件整体', () => {
    ALL_TYPES.forEach((t) => {
      const s = defaultStyle(t);
      ['bgType', 'bgColor', 'bgImage', 'bgRepeat', 'bgPosX', 'bgPosY', 'bgImgStyle', 'bgImgW', 'bgImgH'].forEach((k) => {
        expect(s[k], `${t}.${k}`).not.toBeUndefined();
      });
      ['outMarginTop', 'marginY', 'marginX', 'radius'].forEach((k) => {
        expect(s[k], `${t}.${k}`).not.toBeUndefined();
      });
    });
  });

  it('组件风格/颜色字段按类型区分，不串台', () => {
    // radio/checkbox 有选项相关颜色，line/blank 没有
    ['radio', 'checkbox'].forEach((t) => {
      const keys = (STYLE_SCHEMA[t].colorRows || []).map((r) => r.key);
      expect(keys).toContain('radioColor');
      expect(keys).toContain('activeColor');
      expect(keys).not.toContain('dividerColor');
    });
    const lineKeys = (STYLE_SCHEMA.line.colorRows || []).map((r) => r.key);
    expect(lineKeys).toContain('dividerColor');
    expect(lineKeys).not.toContain('radioColor');
    // 提交按钮：ew 默认蓝底白字圆角 22
    const submit = defaultStyle('submit');
    expect(submit.inputBg).toBe('#0076F0');
    expect(submit.labelColor).toBe('#FFFFFF');
    expect(submit.inputRadius).toBe(22);
    // 评分用图标卡而非框/线卡（boxLine 为风格卡数组，评分用 icons）
    expect(STYLE_SCHEMA.rate.icons).toBe(true);
    expect(STYLE_SCHEMA.rate.boxLine).toBeUndefined();
    expect(Array.isArray(STYLE_SCHEMA.text.boxLine) && STYLE_SCHEMA.text.boxLine.length > 0).toBe(true);
  });

  it('styleSchema 对未知类型返回空 schema 而不是别的组件的', () => {
    const s = styleSchema('__unknown__');
    expect(s.boxLine).toBe(false);
    expect(s.styleRows).toEqual([]);
    expect(s.colorRows).toEqual([]);
  });

  it('图片上传：ew 实测面板（单行展示/上传边框枚举 + 布局相关行 + 颜色行标签）', () => {
    const img = STYLE_SCHEMA.image;
    // 组件风格枚举默认值：单行展示 2 张、上传边框 直线
    expect(img.extraDefs).toEqual({ rowsShow: 2, borderType: 'solid' });
    expect(defaultStyle('image').rowsShow).toBe(2);
    expect(defaultStyle('image').borderType).toBe('solid');
    // 框/线风格卡仅左右布局显示
    expect(img.hOnlyBoxLine).toBe(true);
    expect(img.boxLine.map((r) => r.label)).toEqual(['框风格', '线风格']);
    // 上传框大小/图片圆角 仅左右布局；左右边距 max 44、标题/提示 max 30（ew 实测）
    const row = (k) => img.styleRows.find((r) => r.key === k);
    expect(row('uploadBoxSize').hOnly).toBe(true);
    expect(row('imgRadius').hOnly).toBe(true);
    expect(row('inputMarginX').max).toBe(44);
    expect(row('titleSize').max).toBe(30);
    expect(row('promptSize').max).toBe(30);
    // 颜色行：图片背景/图片边框 仅左右布局；标签对齐 ew（背景颜色/底框边框/提示文本）
    const crow = (k) => img.colorRows.find((r) => r.key === k);
    expect(crow('imgBg').hOnly).toBe(true);
    expect(crow('imgBorder').hOnly).toBe(true);
    expect(crow('inputBg').label).toBe('背景颜色');
    expect(crow('borderColor').label).toBe('底框边框');
    expect(crow('promptColor').label).toBe('提示文本');
  });

  it('单行/多行文本滑杆上限对齐 ew：左右边距 60、标题/输入文本 30、输入区高度 300', () => {
    const trow = (k) => STYLE_SCHEMA.text.styleRows.find((r) => r.key === k);
    expect(trow('inputMarginX').max).toBe(60);
    expect(trow('titleSize').max).toBe(30);
    expect(trow('inputSize').max).toBe(30);
    const arow = (k) => STYLE_SCHEMA.textarea.styleRows.find((r) => r.key === k);
    expect(arow('inputMarginX').max).toBe(60);
    expect(arow('inputHeight').max).toBe(300);
    expect(arow('titleSize').max).toBe(30);
  });
});

describe('componentStyleVars', () => {
  it('把组件样式翻译成 CSS 变量（含组件整体与背景）', () => {
    const comp = { type: 'radio', style: { ...defaultStyle('radio'), marginY: 20, marginX: 8, radius: 6, activeColor: '#123456' } };
    const s = componentStyleVars(comp, { compMarginX: 20 });
    expect(s.paddingTop).toBe('20px');
    expect(s.paddingLeft).toBe('8px');
    expect(s.borderRadius).toBe('6px');
    expect(s['--c-active-color']).toBe('#123456');
    expect(s['--c-option-color']).toBe('#333333');
    expect(s['--c-input-radius']).toBe('3px');
  });

  it('图片+颜色背景输出平铺/位置/尺寸', () => {
    const comp = {
      type: 'text',
      style: { ...defaultStyle('text'), bgType: 'imgcolor', bgImage: 'http://x/a.png', bgRepeat: 'no-repeat', bgPosX: 'center', bgPosY: 'bottom', bgImgStyle: 'fill' },
    };
    const s = componentStyleVars(comp, {});
    expect(s.backgroundImage).toBe('url("http://x/a.png")');
    expect(s.backgroundRepeat).toBe('no-repeat');
    expect(s.backgroundPosition).toBe('center bottom');
    expect(s.backgroundSize).toBe('cover');
  });

  it('组件左右边距缺省时回落到全局 compMarginX', () => {
    const comp = { type: 'text', style: { marginX: undefined, marginY: undefined } };
    const s = componentStyleVars(comp, { compMarginX: 20 });
    expect(s.paddingLeft).toBe('20px');
  });

  it('图片上传枚举输出无单位变量：单行展示 --c-img-rows、上传边框 --c-img-border-style', () => {
    const comp = { type: 'image', style: { ...defaultStyle('image'), rowsShow: 3, borderType: 'dashed' } };
    const s = componentStyleVars(comp, {});
    expect(s['--c-img-rows']).toBe(3);
    expect(s['--c-img-border-style']).toBe('dashed');
  });
});

describe('migrateStyle 旧数据迁移', () => {
  it('旧通用样式 { styleType, marginX, radius, titleSize, inputSize } 迁移到按类型 schema', () => {
    const comp = { type: 'text', style: { styleType: 'line', marginX: 10, radius: 3, titleSize: 16, inputSize: 14 } };
    migrateStyle(comp);
    expect(comp.style.styleType).toBe('line');
    expect(comp.style.inputMarginX).toBe(10); // 旧 marginX 实为输入框左右边距
    expect(comp.style.inputRadius).toBe(3); // 旧 radius 实为输入框圆角
    expect(comp.style.titleSize).toBe(16);
    expect(comp.style.inputSize).toBe(14);
    expect(comp.style.marginX).toBe(0); // 组件整体左右边距走 ew 默认
    // 补齐该组件专用字段
    expect(comp.style.borderColor).toBe('#F5F2F2');
    expect(comp.style.scanCodeIcon).toBe('#666666');
  });

  it('迁移后所有旧组件都能拿到本类型的 ew 默认颜色', () => {
    const comp = { type: 'submit', style: { marginX: 10 } };
    migrateStyle(comp);
    expect(comp.style.inputBg).toBe('#0076F0');
    expect(comp.style.labelColor).toBe('#FFFFFF');
  });
});
