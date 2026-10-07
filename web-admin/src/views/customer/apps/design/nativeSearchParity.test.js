import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { searchBoxSizeStyle, buttonSizeStyle, DESIGN_VIEWPORT_PX } from '../../../../../../web-app/src/utils/containerChildSize.js';

/**
 * 名片搜索栏 / 按钮：**后台预览（admin）vs 开发者工具 &真机（C 端）必须一致**
 *
 * 🔴 用户反馈（2026-10-07 第4 条）：「开发者工具的预览还是和设计中心的预览不同步」
 *
 * 🔴 本项目「两端不同步」的历史病根是**同一份样式手写两遍**：
 *   C 端 `pages/cardMain/home.vue` 用 **rpx**（750rpx = 375px 设计稿，1px = 2rpx），
 *   admin `ComponentRender.vue` 用 **px**（画布手机壳固定 375px）。
 *   两边各写一份 → 改一处忘另一处 → 预览与真机错位。
 *   本文件把这些「必须等值」的量逐一比对，任何一边改动不同步都会红。
 *
 * 换算基准：1px（设计稿） = 2rpx（C 端）= 1px（admin 画布）
 */

const C = readFileSync(resolve(__dirname, '../../../../../../web-app/src/pages/cardMain/home.vue'), 'utf8');
const A = readFileSync(resolve(__dirname, 'ComponentRender.vue'), 'utf8');

/** 🔴 只取 `<style>` 块内的 CSS。
 *  否则会匹到 **JS 注释里手写的 CSS 片段** —— 例如 `searchBoxStyle()` 上方说明文字里
 *  出现过「`.search-box{flex:1}` 决定」，正则会把它当成真规则，测出「C 端没有 height」的假结论。 */
function styleOf(src) {
  const m = src.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  expect(m, '.vue 应有 <style> 块').toBeTruthy();
  return m[1];
}

/** 取 C 端函数源码（用正则从 .vue 里抠出来执行，避免抄副本锁不住） */
function cFn(name) {
  const m = C.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`));
  expect(m, `C 端应能找到 ${name}()`).toBeTruthy();
  return m[0];
}
function aFn(name) {
  const m = A.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`));
  expect(m, `admin 应能找到 ${name}()`).toBeTruthy();
  return m[0];
}
/** 把 `function xxx(p){...}` 在沙箱里跑起来（依赖 searchBoxSizeStyle/buttonSizeStyle 已注入） */
function runFn(src, extra = {}) {
  // eslint-disable-next-line no-new-func
  const f = new Function('searchBoxSizeStyle', 'buttonSizeStyle', `${src}; return ${src.match(/function (\w+)/)[1]};`)(
    searchBoxSizeStyle, buttonSizeStyle,
  );
  return f;
}
function css(sel) {
  return cssOf(A, sel);
}
/** 取 .vue 里某选择器的规则体（**先剥 CSS 注释**，否则注释里的 `}` 会提前截断规则） */
function cssOf(src, sel) {
  const clean = styleOf(src).replace(/\/\*[\s\S]*?\*\//g, '');
  const m = clean.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
}

describe('搜索栏两端一致（后台预览 === 开发者工具/真机）', () => {
  it('🔴 同一 props 在两端产出等值的「盒模型」', () => {
    const cSearch = runFn(cFn('searchBoxStyle'));
    const aSearch = runFn(aFn('searchBoxPreviewStyle'));
    const cPh = runFn(cFn('placeholderStyle'));
    const aPh = runFn(aFn('placeholderStyle'));

    for (const p of [{}, { height: 44, radius: 8 }, { height: 32, radius: 24, widthPercent: 60, textAlign: 'left' }]) {
      const cs = cSearch(p);
      const as = aSearch(p);
      const tag = JSON.stringify(p);
      // 高度：rpx ÷ 2 === px
      expect(parseFloat(cs.height) / 2, `height ${tag}`).toBeCloseTo(parseFloat(as.height), 2);
      // 圆角
      expect(parseFloat(cs.borderRadius) / 2, `radius ${tag}`).toBeCloseTo(parseFloat(as.borderRadius), 2);
      // 行高（垂直居中）：两端也必须等值
      expect(parseFloat(cPh(p).lineHeight) / 2, `lineHeight ${tag}`).toBeCloseTo(parseFloat(aPh(p).lineHeight), 2);
      // 对齐 + 颜色
      expect(cPh(p).textAlign, `textAlign ${tag}`).toBe(aPh(p).textAlign);
      expect(cPh(p).color.toLowerCase(), `color ${tag}`).toBe(aPh(p).color.toLowerCase());
    }
  });

  it('🔴 宽度两端指的是同一个设计稿位置（60% = 225px = 60vw）', () => {
    const c = searchBoxSizeStyle({ widthMode: 'full', widthPercent: 60 });
    const a = searchBoxSizeStyle({ widthMode: 'full', widthPercent: 60 }, { unit: 'px' });
    expect(c.width).toBe('60vw');
    expect(parseFloat(a.width)).toBeCloseTo((60 * DESIGN_VIEWPORT_PX) / 100, 2);
    // admin 侧调用点必须显式传 unit:'px'，否则会发出 60vw（相对浏览器视口，画布里会错）
    expect(aFn('searchBoxPreviewStyle')).toMatch(/searchBoxSizeStyle\(p,\s*\{\s*unit:\s*'px'\s*\}\)/);
    expect(aFn('btnStyle')).toMatch(/buttonSizeStyle\(p,\s*\{\s*unit:\s*'px'\s*\}\)/);
  });

  it('🔴 容器（搜索框+铃铛那层）的 gap 两端必须等值', () => {
    // C 端 .top-bar{gap:12rpx} → 12/2 = 6px；admin .r-native-search{gap:8px} → 8px ❌ 不同步
    const cBar = cssOf(C, '.top-bar');
    expect(cBar, 'C 端应有 .top-bar').toBeTruthy();
    const cGap = (cBar.match(/gap:\s*(\d+)rpx/) || [])[1];
    const aGap = (css('.r-native-search').match(/gap:\s*(\d+)px/) || [])[1];
    expect(cGap, 'C 端 .top-bar 应有 gap（rpx）').toBeTruthy();
    expect(aGap, 'admin .r-native-search 应有 gap（px）').toBeTruthy();
    expect(Number(aGap), `gap 不同步：C 端 ${cGap}rpx(= ${cGap / 2}px) vs admin ${aGap}px`).toBe(Number(cGap) / 2);
  });

  it('🔴 搜索框内「图标↔文案」间距两端等值', () => {
    const cGap = (cssOf(C, '.search-box').match(/gap:\s*(\d+)rpx/) || [])[1];
    const aGap = (css('.r-search').match(/gap:\s*(\d+)px/) || [])[1];
    expect(cGap).toBeTruthy();
    expect(aGap).toBeTruthy();
    expect(Number(aGap), `gap 不同步：C 端 ${cGap}rpx(= ${cGap / 2}px) vs admin ${aGap}px`).toBe(Number(cGap) / 2);
  });

  it('🔴 搜索框左右内边距两端等值', () => {
    const cPad = (cssOf(C, '.search-box').match(/padding:\s*0\s*(\d+)rpx/) || [])[1];
    const aPad = (css('.r-search').match(/padding:\s*0\s*(\d+)px/) || [])[1];
    expect(cPad).toBeTruthy();
    expect(aPad).toBeTruthy();
    expect(Number(aPad), `padding 不同步：C 端 ${cPad}rpx(= ${cPad / 2}px) vs admin ${aPad}px`).toBe(Number(cPad) / 2);
  });

  it('🔴 铃铛占位两端等值（宽/高）', () => {
    const cM = cssOf(C, '.msg-icon');
    expect(cM, 'C 端应有 .msg-icon').toBeTruthy();
    const cW = (cM.match(/width:\s*(\d+)rpx/) || [])[1];
    const cH = (cM.match(/height:\s*(\d+)rpx/) || [])[1];
    // admin 铃铃是内联 svg 18px，用 .r-native-msg 控制缩放；宽高由 svg 决定，
    // 这里锁的是「admin 必须有 flex-shrink:0」—— 否则会被搜索框挤压，与真机不同步。
    expect(cW, 'C 端 .msg-icon 应有 width(rpx)').toBeTruthy();
    expect(cH, 'C 端 .msg-icon 应有 height(rpx)').toBeTruthy();
    expect(css('.r-native-msg')).toMatch(/flex-shrink:\s*0/);
  });

  it('🔴 CSS 兜底值不得两端不同（内联失效时靠 CSS 兜底，兜底不同=不同步）', () => {
    // 比对**实际生效值**：admin 的 `.r-search` 只是通用 `search` 组件的兜底(38px)，
    // native-search 真正生效的是更高特异性的 `.r-native-search .r-search`（须为 36px）。
    // 读基础类会误报不同步 —— 要读带覆盖的那条。
    const cH = (cssOf(C, '.search-box').match(/height:\s*(\d+)rpx/) || [])[1];
    const aNative = css('.r-native-search .r-search');
    const aH = (aNative.match(/height:\s*(\d+)px/) || [])[1];
    expect(cH, 'C 端 .search-box 应有 height(rpx) 兜底').toBeTruthy();
    expect(aH, 'admin `.r-native-search .r-search` 应覆盖出 height(px) 兜底').toBeTruthy();
    expect(Number(aH), `兜底高度不同步：C 端 ${cH}rpx(= ${cH / 2}px) vs admin ${aH}px`).toBe(Number(cH) / 2);
  });

  it('🔴 两端都不得写死占位文案的 line-height（必须由 placeholderStyle 内联下发）', () => {
    // 写死会覆盖内联值 → 后台与真机垂直居中表现不同
    expect(css('.r-search-ph')).not.toMatch(/line-height/);
    const cPhBlock = cssOf(C, '.search-placeholder');
    expect(cPhBlock, 'C 端应有 .search-placeholder').toBeTruthy();
    expect(cPhBlock).not.toMatch(/line-height/);
  });

  it('🔴 容器层字段 radiusContainer / compBgColor 两端都下发给容器（nativeMargin）', () => {
    const cM = runFn(cFn('nativeMargin'));
    const aM = runFn(aFn('nativeMargin'));
    // 容器圆角：两端都用 px，必须等值
    const p1 = { radiusContainer: 16, marginLR: 0 };
    expect(cM(p1).borderRadius).toBe('16px');
    expect(aM(p1).borderRadius).toBe('16px');
    // 容器底色（compBgColor）：两端都必须消费
    const p2 = { compBgColor: '#123456' };
    expect((cM(p2).background || '').toLowerCase()).toBe('#123456');
    expect((aM(p2).background || '').toLowerCase()).toBe('#123456');
    // 默认（未设底色）两端都不输出 background —— 保留各自白底，不互相覆盖
    expect(cM({})).not.toHaveProperty('background');
    expect(aM({})).not.toHaveProperty('background');
  });

  it('🔴 搜索框色 bgColor 两端都下发给搜索框（searchBoxStyle / searchBoxPreviewStyle）', () => {
    const cS = runFn(cFn('searchBoxStyle'));
    const aS = runFn(aFn('searchBoxPreviewStyle'));
    const p = { bgColor: '#abcdef' };
    expect((cS(p).background || '').toLowerCase()).toBe('#abcdef');
    expect((aS(p).background || '').toLowerCase()).toBe('#abcdef');
    // 兜底灰（与两端 CSS 兜底一致）
    expect((cS({}).background || '').toLowerCase()).toBe('#f2f3f5');
    expect((aS({}).background || '').toLowerCase()).toBe('#f2f3f5');
  });

  it('🔴 文字对齐 textAlign 两端都下发到占位文案且尊重用户选择（不强制 center）', () => {
    const cPh = runFn(cFn('placeholderStyle'));
    const aPh = runFn(aFn('placeholderStyle'));
    for (const v of ['left', 'center', 'right']) {
      expect(cPh({ textAlign: v }).textAlign, `C 端 ${v}`).toBe(v);
      expect(aPh({ textAlign: v }).textAlign, `admin ${v}`).toBe(v);
    }
    // 默认兜底 center
    expect(cPh({}).textAlign).toBe('center');
    expect(aPh({}).textAlign).toBe('center');
  });
});
