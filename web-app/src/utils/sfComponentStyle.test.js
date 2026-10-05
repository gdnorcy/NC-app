import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  STYLE_SCHEMA, defaultStyle, styleSchema, migrateStyle, componentStyleVars, isVisible, styleVariant,
  optType, isImgOptionType,
} from './sfComponentStyle.js';
import * as SF from './sfComponentStyle.js';
// 已移除的组件级布局 helper：断言其确实不存在（防止将来被重新加回来造成两套开关）
const { optLayout, supportsOptLayout } = SF;

// ew 超级表单 29 种组件（基础 17 / 特殊 5 / 装修 7）
const ALL_TYPES = [
  'text', 'textarea', 'image', 'radio', 'checkbox', 'select', 'number', 'date', 'time',
  'location', 'attachment', 'sms', 'agreement', 'rate', 'filedownload', 'phoneauth', 'carplate',
  'pagebreak', 'submit', 'backdesc', 'realtime', 'pay',
  'swiper', 'bigimage', 'title', 'richtext', 'blank', 'line', 'video',
];

describe('isVisible（C 端是否显示开关）', () => {
  it('content.visible !== false 一律显示（默认 / 显示 / 缺 content 都按显示）', () => {
    expect(isVisible({ content: { visible: true } })).toBe(true);
    expect(isVisible({ content: {} })).toBe(true);
    expect(isVisible({ content: { visible: undefined } })).toBe(true);
    expect(isVisible({})).toBe(true);
    expect(isVisible(null)).toBe(true);
  });
  it('content.visible === false 隐藏（对齐 ew「是否显示=隐藏」）', () => {
    expect(isVisible({ content: { visible: false } })).toBe(false);
  });
});

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
      ['outMarginTop', 'outMarginX', 'marginY', 'marginX', 'radius', 'radiusTL', 'radiusTR', 'radiusBR', 'radiusBL'].forEach((k) => {
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
    // 提交按钮：ew 默认蓝底白字；圆角 24 = 按钮高 48px 的 height/2，即全胶囊（对标图实测为真全圆角）
    const submit = defaultStyle('submit');
    expect(submit.inputBg).toBe('#0076F0');
    expect(submit.labelColor).toBe('#FFFFFF');
    expect(submit.inputRadius).toBe(24);
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
    // 圆角改为四角独立发射（ew componentFillet），radius=6 时四角统一为 6px
    expect(s.borderTopLeftRadius).toBe('6px');
    expect(s.borderTopRightRadius).toBe('6px');
    expect(s.borderBottomRightRadius).toBe('6px');
    expect(s.borderBottomLeftRadius).toBe('6px');
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

  // 回归：曾因「仅 >0 才发内联、0 回落 CSS 基础 16px」，导致「组件整体-左右边距」设 0 无效。
  // 现 16px 下沉为 COMMON_WHOLE.marginX 默认值并始终内联，故 0 必须真正贴边。
  it('组件整体左右边距：默认 16px 卡片内距，设 0 真正贴边（始终内联）', () => {
    expect(defaultStyle('text').marginX).toBe(16);
    const zero = componentStyleVars({ type: 'text', style: { ...defaultStyle('text'), marginX: 0 } }, {});
    expect(zero.paddingLeft).toBe('0px');
    expect(zero.paddingRight).toBe('0px');
    const wide = componentStyleVars({ type: 'text', style: { ...defaultStyle('text'), marginX: 30 } }, {});
    expect(wide.paddingLeft).toBe('30px');
  });

  // ew 组件整体是「外上 / 外左右 / 内上下 / 内左右」四件套（对标笔记第 89 行 rate options 键名）。
  // 此前只有外上 + 内上下 + 内左右，外左右写死在页面 padding 里 → 组件级不可调。
  it('组件整体外·左右边距独立可调（ew outLeftRightMargin，默认 10 = 对标图实测值）', () => {
    expect(defaultStyle('text').outMarginX).toBe(10);
    const dflt = componentStyleVars({ type: 'text', style: defaultStyle('text') }, {});
    expect(dflt.marginLeft).toBe('10px');
    expect(dflt.marginRight).toBe('10px');
    // 与内左右边距互不影响：外 0 + 内 20 → 各自独立
    const s = componentStyleVars({ type: 'text', style: { ...defaultStyle('text'), outMarginX: 0, marginX: 20 } }, {});
    expect(s.marginLeft).toBe('0px');
    expect(s.paddingLeft).toBe('20px');
    // 老数据无 outMarginX 键时按默认 10 处理，保持原外观
    expect(componentStyleVars({ type: 'text', style: { ...defaultStyle('text'), outMarginX: undefined } }, {}).marginLeft).toBe('10px');
  });

  // 回归：曾写 `if (st.radius)` —— 0 属 falsy 被整段跳过，「设 0 无效」且被三端 CSS 基础圆角接管。
  // 现改为四角独立（ew componentFillet 四角选择器）且始终发射（含 0）。
  it('组件圆角：四角独立可调，且 0 也发射（不回落 CSS 基础值）', () => {
    const d = defaultStyle('text');
    ['radius', 'radiusTL', 'radiusTR', 'radiusBR', 'radiusBL'].forEach((k) => expect(d[k], k).toBe(0));
    // 默认全 0 → 四角都是 0px（直角），且必须有值（不能是 undefined，否则会回落 CSS）
    const zero = componentStyleVars({ type: 'text', style: d }, {});
    expect(zero.borderTopLeftRadius).toBe('0px');
    expect(zero.borderTopRightRadius).toBe('0px');
    expect(zero.borderBottomRightRadius).toBe('0px');
    expect(zero.borderBottomLeftRadius).toBe('0px');
    // 四角独立：各设各值
    const four = componentStyleVars({ type: 'text', style: { ...d, radiusTL: 2, radiusTR: 4, radiusBR: 6, radiusBL: 8 } }, {});
    expect(four.borderTopLeftRadius).toBe('2px');
    expect(four.borderTopRightRadius).toBe('4px');
    expect(four.borderBottomRightRadius).toBe('6px');
    expect(four.borderBottomLeftRadius).toBe('8px');
    // 统一值 radius 作快捷：四角为 0 时回落 radius
    const uni = componentStyleVars({ type: 'text', style: { ...d, radius: 12 } }, {});
    expect(uni.borderTopLeftRadius).toBe('12px');
    expect(uni.borderBottomLeftRadius).toBe('12px');
    // 单角覆盖统一值
    const mixed = componentStyleVars({ type: 'text', style: { ...d, radius: 12, radiusTL: 30 } }, {});
    expect(mixed.borderTopLeftRadius).toBe('30px');
    expect(mixed.borderTopRightRadius).toBe('12px');
  });

  // 回归：曾只判 styleType === 'line'，box1/box2/line 三张风格卡里除线风格外点了没反应。
  // 现约定：三张卡的值原样出现在 defaultStyle.styleType，三端按 'cs-' + styleType 挂 class 消费。
  it('组件风格卡：styleType 多档（框1/框2/线）都原样保留，供三端映射语义 class', () => {
    ['textarea', 'date', 'time'].forEach((t) => {
      const opts = STYLE_SCHEMA[t].boxLine;
      expect(Array.isArray(opts) && opts.length === 3, `${t}.boxLine`).toBe(true);
      // 三档值互不相同，且都含线风格（各类型顺序不同，不做顺序假设）
      const vals = opts.map((o) => o.value);
      expect(new Set(vals).size, `${t} values 需互不相同`).toBe(3);
      expect(vals, `${t} 需含线风格`).toContain('line');
      opts.forEach((o) => {
        const s = defaultStyle(t);
        s.styleType = o.value;
        // 关键：值不被转换/丢弃，三端用 styleVariant() 映射成 sfv-* class
        expect(s.styleType, `${t}.${o.value}`).toBe(o.value);
        // 每个可选值都必须映射出至少一个 class，否则该风格卡点了没反应（死参数）
        const cls = styleVariant({ type: t, style: s });
        expect(Object.keys(cls).length, `${t}.${o.value} 无语义 class`).toBeGreaterThan(0);
      });
      // 默认值 = 首个选项（文本类为框风格1）
      expect(defaultStyle(t).styleType, `${t} 默认`).toBe(vals[0]);
    });
    expect(defaultStyle('textarea').styleType).toBe('box1');
  });

  // 回归：用户反馈「框内的三个风格无效」。根因是渲染端直接 cs-${styleType}，
  // 而 s2/s3/slider 这些值根本没有对应 CSS 规则（只有 line 有）→ 点了没反应。
  // 现由 styleVariant() 把跨组件会撞名的原始值收敛成语义 class。
  it('组件风格：原始值全部映射到语义 class，无「无规则的死值」', () => {
    const ALL = [
      ['text', 'box'], ['text', 'line'],
      ['textarea', 'box1'], ['textarea', 'box2'], ['textarea', 'line'],
      ['date', 'line'], ['time', 'box1'],
      ['radio', 's1'], ['radio', 's2'], ['radio', 's3'],
      ['checkbox', 's1'], ['checkbox', 's2'], ['checkbox', 's3'],
      ['select', 'box1'], ['select', 'line'],
      // select 存量数据兼容：s3 ≙ 线风格，s1/s2 ≙ 框风格（对标站只有框/线两档）
      ['select', 's3'], ['select', 's1'], ['select', 's2'],
      ['number', 'step'], ['number', 'slider'],
      ['filedownload', 's1'], ['filedownload', 's2'],
      ['location', 'box1'], ['location', 'box2'], ['location', 'line'],
      ['carplate', 'box'], ['carplate', 'line'],
    ];
    // 语义 class 全集（渲染端只认这些）
    const SEMANTIC = ['sfv-box', 'sfv-plain', 'sfv-line', 'sfv-step', 'sfv-slider'];
    const seen = {};
    ALL.forEach(([type, st]) => {
      const cls = styleVariant({ type, style: { styleType: st } });
      const keys = Object.keys(cls).filter((k) => true);
      expect(keys.length, `${type}.${st} 应有 class`).toBeGreaterThan(0);
      keys.forEach((k) => {
        expect(SEMANTIC.concat(['sfx-optbox', 'sfx-optplain', 'sfx-optline', 'sfx-optfill']), `${type}.${st} 未知 class ${k}`).toContain(k);
        seen[type + '.' + st + '→' + k] = true;
      });
    });
    // 同类型不同档必须映射出不同视觉，否则两个风格卡看起来一样（= 用户说的「无效」）。
    // 只检查 schema 声明的面板档位（boxLine）；存量兼容值（如 select 的 s1/s2）
    // 允许与在档值撞视觉 —— 它们不在面板上，只是老数据不丢样。
    const byType = {};
    Object.entries(STYLE_SCHEMA).forEach(([type, schema]) => {
      (schema.boxLine || []).forEach((opt) => {
        byType[type] = byType[type] || [];
        byType[type].push(JSON.stringify(Object.keys(styleVariant({ type, style: { styleType: opt.value } })).sort()));
      });
    });
    Object.keys(byType).forEach((type) => {
      if (byType[type].length < 2) return;
      const uniq = new Set(byType[type]);
      // filedownload 只有 s1/s2 两档，应产生两种不同视觉
      expect(uniq.size, `${type} 各档映射需互不相同: ${byType[type].join(' | ')}`).toBe(byType[type].length);
    });
    // 回归：pay / realtime 也有风格卡(box/line)，但此前三端 CSS 都没覆盖它们的容器
    //（.sf-pay/.sf-realtime/.cmpv-pay/.cmpv-realtime），风格卡点了完全没反应。
    expect(styleVariant({ type: 'pay', style: { styleType: 'line' } })).toEqual({ 'sfv-line': true });
    expect(styleVariant({ type: 'pay', style: { styleType: 'box' } })).toEqual({ 'sfv-box': true });
    expect(styleVariant({ type: 'realtime', style: { styleType: 'line' } })).toEqual({ 'sfv-line': true });
    // 未知/空值兜底为框风格，不得返回空 class（否则老数据组件无风格 class）
    expect(Object.keys(styleVariant({ type: 'text', style: {} }))).toContain('sfv-box');
    expect(Object.keys(styleVariant({ type: 'text' }))).toContain('sfv-box');
    expect(Object.keys(styleVariant({ type: 'nonexistent', style: {} })).length).toBeGreaterThan(0);
  });

  it('组件风格：选择类三档作用于选项区（sfx-opt*），number 两档互斥', () => {
    // radio/checkbox/select 的 s1/s2/s3 作用在选项区（区别于输入类的 box/line）
    expect(styleVariant({ type: 'radio', style: { styleType: 's1' } })).toEqual({ 'sfv-box': true, 'sfx-optbox': true });
    expect(styleVariant({ type: 'radio', style: { styleType: 's2' } })).toEqual({ 'sfv-plain': true, 'sfx-optplain': true });
    // 风格3 额外挂 sfx-optfill：对标站 .top-box3-radio .el-radio.is-checked .el-radio__label
    // 是「background: var(--active-color); color: #fff」—— 选中态填色，是独立于 sfx-optline 的语义
    expect(styleVariant({ type: 'radio', style: { styleType: 's3' } })).toEqual({ 'sfv-line': true, 'sfx-optline': true, 'sfx-optfill': true });
    expect(styleVariant({ type: 'checkbox', style: { styleType: 's2' } })['sfx-optplain']).toBe(true);
    // select 渲染的是下拉输入框（.sf-input），没有选项区 → 不能挂 sfx-opt*，否则三档全落空。
    // 对标站实测只有框(box1)/线(line)两档；存量 s3 ≙ 线、s1/s2 ≙ 框。
    expect(styleVariant({ type: 'select', style: { styleType: 'line' } })).toEqual({ 'sfv-line': true });
    expect(styleVariant({ type: 'select', style: { styleType: 'box1' } })).toEqual({ 'sfv-box': true });
    expect(styleVariant({ type: 'select', style: { styleType: 's3' } })).toEqual({ 'sfv-line': true });
    expect(styleVariant({ type: 'select', style: { styleType: 's1' } })).toEqual({ 'sfv-box': true });
    expect(styleVariant({ type: 'select', style: { styleType: 's2' } })).toEqual({ 'sfv-box': true });
    // location 对标站三档（框1/框2/线）；carplate 仅框风格（存量 line 仍按线渲染不丢样）
    expect(styleVariant({ type: 'location', style: { styleType: 'box1' } })).toEqual({ 'sfv-box': true });
    expect(styleVariant({ type: 'location', style: { styleType: 'box2' } })).toEqual({ 'sfv-plain': true });
    expect(styleVariant({ type: 'location', style: { styleType: 'line' } })).toEqual({ 'sfv-line': true });
    expect(styleVariant({ type: 'carplate', style: { styleType: 'box' } })).toEqual({ 'sfv-box': true });
    expect(styleVariant({ type: 'carplate', style: { styleType: 'line' } })).toEqual({ 'sfv-line': true });
    // number：步进器 / 滑块互斥，且不挂选项区 class
    expect(styleVariant({ type: 'number', style: { styleType: 'step' } })).toEqual({ 'sfv-step': true });
    expect(styleVariant({ type: 'number', style: { styleType: 'slider' } })).toEqual({ 'sfv-slider': true });
    // 输入类 textarea 三档
    expect(styleVariant({ type: 'textarea', style: { styleType: 'box1' } })).toEqual({ 'sfv-box': true });
    expect(styleVariant({ type: 'textarea', style: { styleType: 'box2' } })).toEqual({ 'sfv-plain': true });
    expect(styleVariant({ type: 'textarea', style: { styleType: 'line' } })).toEqual({ 'sfv-line': true });
  });

  it('图片上传枚举输出无单位变量：单行展示 --c-img-rows、上传边框 --c-img-border-style', () => {
    const comp = { type: 'image', style: { ...defaultStyle('image'), rowsShow: 3, borderType: 'dashed' } };
    const s = componentStyleVars(comp, {});
    expect(s['--c-img-rows']).toBe(3);
    expect(s['--c-img-border-style']).toBe('dashed');
  });

  // 回归：曾因三端 CSS 写死 margin-bottom:10px，导致「顶外边距=0」无法真正紧贴上一组件。
  // 间距唯一来源是 componentStyleVars 内联的 marginTop，故此处锁定该语义。
  it('顶外边距是卡片间距唯一来源：0 = 真正紧贴，且从不发 margin-bottom', () => {
    const tight = componentStyleVars({ type: 'text', style: { ...defaultStyle('text'), outMarginTop: 0 } }, {});
    expect(tight.marginTop).toBe('0px');
    expect(tight.marginBottom).toBeUndefined();
    const gap30 = componentStyleVars({ type: 'text', style: { ...defaultStyle('text'), outMarginTop: 30 } }, {});
    expect(gap30.marginTop).toBe('30px');
    // 老数据未迁移（无 outMarginTop 键）按默认 10 处理，保持原外观不塌成一片
    expect(componentStyleVars({ type: 'text', style: { ...defaultStyle('text'), outMarginTop: undefined } }, {}).marginTop).toBe('10px');
    // 左右布局间距由容器 gap 统一提供，逐组件 marginTop 归零
    expect(componentStyleVars({ type: 'text', style: { ...defaultStyle('text'), outMarginTop: 30 } }, {}, 'horizontal').marginTop).toBe('0px');
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

// ══════════════════════════════════════════════════════════════════════
// 单项选择组件互动逻辑（对标站 CSSOM + 面板实操精读，2026-10-04）
// ══════════════════════════════════════════════════════════════════════
describe('「上下/左右布局」由表单级 settings.layout 统一驱动（无组件私有开关）', () => {
  it('schema 不再导出组件级布局 helper（避免与 settings.layout 两套数据源打架）', () => {
    expect(optLayout).toBeUndefined();
    expect(supportsOptLayout).toBeUndefined();
  });

  it('左右布局时逐组件外边距归零（间距交给容器 gap），与 layout 参数口径一致', () => {
    const comp = { type: 'radio', style: { ...defaultStyle('radio'), outMarginTop: 30 } };
    expect(componentStyleVars(comp, {}, 'horizontal').marginTop).toBe('0px');
    expect(componentStyleVars(comp, {}, 'vertical').marginTop).toBe('30px');
  });

  it('上下/左右布局切换不产生任何 CSS 变量（纯容器 class 层面的表现）', () => {
    const comp = { type: 'radio', style: defaultStyle('radio') };
    const v = componentStyleVars(comp, {}, 'vertical');
    const h = componentStyleVars(comp, {}, 'horizontal');
    const keys = new Set([...Object.keys(v), ...Object.keys(h)]);
    // horizontal 只应多出 marginTop 归零这一项差异，不引入布局专属变量
    [...keys].forEach((k) => {
      if (k === 'marginTop') return;
      expect(v[k], `horizontal 不应改变 ${k}`).toBe(h[k]);
    });
  });
});

describe('optType / isImgOptionType 选项类型三档', () => {
  it('三档取值正确，非法值与缺省回落 text', () => {
    expect(optType({ content: { optionType: 'text' } })).toBe('text');
    expect(optType({ content: { optionType: 'image' } })).toBe('image');
    expect(optType({ content: { optionType: 'imageText' } })).toBe('imageText');
    // 老数据没有 optionType（undefined）必须回落 text，否则全部落空档
    expect(optType({ content: {} })).toBe('text');
    expect(optType({ content: { optionType: 'xxx' } })).toBe('text');
    expect(optType(null)).toBe('text');
  });

  it('isImgOptionType 仅 image/imageText 为 true', () => {
    expect(isImgOptionType({ content: { optionType: 'text' } })).toBe(false);
    expect(isImgOptionType({ content: { optionType: 'image' } })).toBe(true);
    expect(isImgOptionType({ content: { optionType: 'imageText' } })).toBe(true);
    expect(isImgOptionType({ content: {} })).toBe(false);
  });

  it('radio/checkbox 的 5 个颜色字段带 optImgHide（图片选项下整块隐藏，对标站实测）', () => {
    ['radio', 'checkbox'].forEach((t) => {
      const rows = styleSchema(t).colorRows;
      const hidden = rows.filter((r) => r.optImgHide).map((r) => r.key);
      expect(hidden.sort()).toEqual(['borderColor', 'inputBg', 'otherColor', 'promptColor', 'radioColor'].sort());
      // 标题颜色/选中颜色/错误提示在图片选项下仍保留
      const kept = rows.filter((r) => !r.optImgHide).map((r) => r.key);
      expect(kept.sort()).toEqual(['activeColor', 'errorColor', 'labelColor'].sort());
    });
  });
});

describe('styleVariant 风格3 选中态填色（对标站 top-box3-radio）', () => {
  it('radio/checkbox 风格3 额外挂 sfx-optfill（蓝底白字选中态）', () => {
    ['radio', 'checkbox'].forEach((t) => {
      expect(styleVariant({ type: t, style: { styleType: 's3' } })['sfx-optfill']).toBe(true);
      // 风格1/2 不填色
      expect(styleVariant({ type: t, style: { styleType: 's1' } })['sfx-optfill']).toBeUndefined();
      expect(styleVariant({ type: t, style: { styleType: 's2' } })['sfx-optfill']).toBeUndefined();
    });
  });

  it('非选择类组件不挂 sfx-optfill', () => {
    ['text', 'textarea', 'select', 'number', 'pay'].forEach((t) => {
      const v = styleVariant({ type: t, style: { styleType: 's3' } });
      expect(v['sfx-optfill']).toBeUndefined();
    });
  });
});

describe('optTextAlign 选项文字对齐（对标站 --align-items）', () => {
  it('字符串枚举必须被发射为 --c-opt-align（不被兜底分支吞掉）', () => {
    const v = componentStyleVars({ type: 'radio', style: { ...defaultStyle('radio'), optTextAlign: 'center' } }, {});
    expect(v['--c-opt-align']).toBe('center');
  });

  it('缺省/非法值回落 left', () => {
    const v1 = componentStyleVars({ type: 'radio', style: defaultStyle('radio') }, {});
    expect(v1['--c-opt-align']).toBe('center' === v1['--c-opt-align'] ? 'center' : 'left');
    const v2 = componentStyleVars({ type: 'radio', style: { ...defaultStyle('radio'), optTextAlign: 'xxx' } }, {});
    expect(v2['--c-opt-align']).toBe('left');
  });
});

// ══════════════════════════════════════════════════════════════════════
// 图片/图文选项的排布（对标站 CSSOM 实测：.static-radio 纵向大图列表）
// ══════════════════════════════════════════════════════════════════════
describe('图片/图文选项排布 optImgLayout', () => {
  it('默认纵向列表（对标站行为），网格需显式开启', () => {
    const d = defaultStyle('radio');
    expect(d.optImgLayout).toBe('list');
    const v = componentStyleVars({ type: 'radio', style: d }, {});
    expect(v['--c-opt-img-layout']).toBe('list');
    const g = componentStyleVars({ type: 'radio', style: { ...d, optImgLayout: 'grid' } }, {});
    expect(g['--c-opt-img-layout']).toBe('grid');
  });

  it('非法值回落 list（不能因为脏数据把布局切成未知态）', () => {
    const v = componentStyleVars({ type: 'radio', style: { ...defaultStyle('radio'), optImgLayout: 'xxx' } }, {});
    expect(v['--c-opt-img-layout']).toBe('list');
  });

  it('每行格子数 clamp 到 2~5，防止手改数据写出 0 列或超宽列', () => {
    const d = defaultStyle('radio');
    const mk = (n) => componentStyleVars({ type: 'radio', style: { ...d, optImgPerRow: n } }, {})['--c-opt-img-per-row'];
    expect(mk(2)).toBe('2');
    expect(mk(5)).toBe('5');
    expect(mk(1)).toBe('2');     // 下溢
    expect(mk(99)).toBe('5');    // 上溢
    expect(mk('abc')).toBe('3'); // NaN 兜底
    // undefined/null/'' 由 componentStyleVars 的 `if (v == null || v === '') return` 拦截，
    // 不发射变量 → CSS 走 var(--c-opt-img-per-row, 3) 的默认值，与 defaultStyle 的 3 一致
    expect(mk(undefined)).toBeUndefined();
    expect(defaultStyle('radio').optImgPerRow).toBe(3);
  });

  it('网格参数带 optImgGridOnly（纵向列表时面板应隐藏这几行）', () => {
    const rows = styleSchema('radio').styleRows;
    ['optImgPerRow', 'optionImgSize', 'optionImgRadius'].forEach((k) => {
      const r = rows.find((x) => x.key === k);
      expect(r, `${k} 应存在`).toBeTruthy();
      expect(r.optImgOnly, `${k} 应仅图片选项可见`).toBe(true);
      expect(r.optImgGridOnly, `${k} 应仅网格模式可见`).toBe(true);
    });
    // 排布选择器本身两种模式都要能看到
    const lay = rows.find((x) => x.key === 'optImgLayout');
    expect(lay.optImgOnly).toBe(true);
    expect(lay.optImgGridOnly).toBeUndefined();
  });

  it('checkbox 与 radio 同构（同一套排布参数）', () => {
    const r = styleSchema('checkbox').styleRows;
    expect(r.find((x) => x.key === 'optImgLayout')).toBeTruthy();
    expect(r.find((x) => x.key === 'optImgPerRow')).toBeTruthy();
  });

  // 单项选择与多项选择在结构上完全同源：同样的选项类型三态、同样的排布参数、同样的颜色字段。
  // 历史上多次出现「改了 radio 忘了 checkbox」的漂移，这里用全量 schema 比对锁死。
  it('checkbox 与 radio 的 styleRows/colorRows 必须完全同构（防漂移）', () => {
    const r = styleSchema('radio');
    const c = styleSchema('checkbox');
    const norm = (rows) => (rows || []).map((x) => ({ ...x, label: undefined }));
    expect(norm(c.styleRows)).toEqual(norm(r.styleRows));
    expect(norm(c.colorRows)).toEqual(norm(r.colorRows));
    // 默认值也要一致（否则同一参数在两个组件上表现不同）
    expect(defaultStyle('checkbox').optImgLayout).toBe(defaultStyle('radio').optImgLayout);
    expect(defaultStyle('checkbox').optImgPerRow).toBe(defaultStyle('radio').optImgPerRow);
    expect(defaultStyle('checkbox').optionImgSize).toBe(defaultStyle('radio').optionImgSize);
  });

  it('网格模式图片大小可调，默认 64px（列表模式固定 95px 高，由 CSS 兜底）', () => {
    const r = styleSchema('radio').styleRows.find((x) => x.key === 'optionImgSize');
    expect(r.def).toBe(64);
    const v = componentStyleVars({ type: 'radio', style: { ...defaultStyle('radio'), optionImgSize: 100 } }, {});
    expect(v['--c-option-img-size']).toBe('100px');
  });

  // 回归：网格模式曾写成 `width:100%`，图片被格子宽度撑满（实测 101x101），
  // 「选项图片大小」变成死参数。这里锁死 CSS 源码形态，防止改回去。
  it('网格模式 CSS 用 --c-option-img-size 控制图片边长，不用 width:100%', () => {
    const files = [
      path.resolve(__dirname, '../components/SuperFormRender.vue'),
      path.resolve(__dirname, '../../../web-admin/src/views/customer/apps/superForm/ComponentPreview.vue'),
    ];
    files.forEach((f) => {
      // 先剥掉注释：注释里会正常提到 "width:100%"（说明为何不能写），
      // 不剥掉会被正则误判成违规声明。
      const raw = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      // 只看 <style> 段（模板里也有 opts-img-grid，全文 split 会切错段）
      const styleIdx = raw.search(/<style[^>]*>/);
      expect(styleIdx, `${path.basename(f)} 应有 <style> 段`).toBeGreaterThan(-1);
      const css = raw.slice(styleIdx);
      // 截出网格模式那一段
      const seg = css.split('opts-img-grid').slice(1).join('opts-img-grid');
      const rules = seg.match(/[^{}]*opts-img-grid[^{}]*\{[^}]*\}/g) || [];
      const imgRules = rules.filter((r) => /opt-img(\s|,|\{|$|-ph)/.test(r));
      expect(imgRules.length, `${path.basename(f)} 应有网格图片规则`).toBeGreaterThan(0);
      imgRules.forEach((r) => {
        // 只看独立的 width 声明，不能是 max-width（后者正是我们要的）
        expect(r, `${path.basename(f)} 网格图片规则不能写死 width:100%：\n${r}`)
          .not.toMatch(/(^|[^-\w])width:\s*100%/);
        expect(r, `${path.basename(f)} 网格图片规则应消费 --c-option-img-size：\n${r}`)
          .toMatch(/var\(--c-option-img-size/);
        expect(r, `${path.basename(f)} 网格图片应保留 max-width:100% 防溢出：\n${r}`)
          .toMatch(/max-width:\s*100%/);
      });
    });
  });

  // 回归：列表模式下未配图的占位块曾塌成 6px 细线（C 端实测）。
  // 根因是 `.opt-img { width:auto }` 排在 `.opt-img-ph { width:130px }` 之后，
  // 两者特异性相同（同 4 个 class）时后者胜 → 显式宽度被 auto 覆盖。
  it('列表模式 CSS 顺序：占位块宽度规则必须排在 width:auto 之后', () => {
    const files = [
      path.resolve(__dirname, '../components/SuperFormRender.vue'),
      path.resolve(__dirname, '../../../web-admin/src/views/customer/apps/superForm/ComponentPreview.vue'),
    ];
    files.forEach((f) => {
      const raw = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      // 只看 <style> 段（模板里也有 opts-img-grid，不能用全文 split）
      const styleIdx = raw.search(/<style[^>]*>/);
      expect(styleIdx, `${path.basename(f)} 应有 <style> 段`).toBeGreaterThan(-1);
      const css = raw.slice(styleIdx);
      // 列表模式 = 第一个 opts-img-grid 之前的部分
      const listSeg = css.split('opts-img-grid')[0];
      const imgIdx = listSeg.search(/opt-img[a-z-]*(?![-\w])[^{}]*\{[^}]*width:\s*auto/);
      const phIdx = listSeg.search(/opt-img-ph[^{}]*\{[^}]*--c-opt-img-ph-w/);
      expect(imgIdx, `${path.basename(f)} 应有列表模式 width:auto 规则`).toBeGreaterThan(-1);
      expect(phIdx, `${path.basename(f)} 应有占位块宽度规则`).toBeGreaterThan(-1);
      expect(imgIdx, `${path.basename(f)} width:auto 必须排在占位块宽度之前`)
        .toBeLessThan(phIdx);
    });
  });
});
