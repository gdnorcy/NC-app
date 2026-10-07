import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 装修画布「组件操作条」定位（2026-10-07）
 *
 * 🔴 用户诉求（verbatim）：「组件框的蓝色边条，现在边条在内部，对于调节参数是有大的影响的，
 *    还是要跟最初的一样，放在组件的上方，并且要是置顶，最顶部的组件不要被手机壳挡到。」
 *
 * 🔴 本文件锁的是一个**已被四轮方案推翻**的几何问题，核心事实：
 *   `.pe-canvas` 是 `overflow-y:auto`，**裁剪边界属于它自己**（不是父级、不是 wrap）。
 *   → 想让「贴在组件上方、向上溢出 22px」的操作条可见，只能：
 *     ① 给画布加 padding-top → 不被裁，但页面顶部凭空多一条空白带，
 *        运营误读成「容器上下边距没生效」「蓝条占了位置」→ **用户明确否决，预览必须=真机**；
 *     ② 给父级/祖先加 padding → **无效**（已像素实测：`.pe-phone{padding-top:22px}` 时工具条仍被裁掉半条）；
 *     ③ 首组件 padding-top → 无效（padding 推不动边框盒，而绝对定位基准是边框盒）；
 *     ④ 首组件 margin-top → 有效但首组件位置与真机不符；
 *     ⑤ 首组件操作条翻到下方 → **用户明确否决**（破坏统一直觉）。
 *   ✅ 唯一正解：把操作条**移出画布**，放进平级图层 `.pe-tools-layer`，
 *      坐标由 JS 按组件真实 rect 算 → 零裁剪、零占位、零假间距，且天然置顶。
 *
 * 元规则：被 overflow 裁剪的「越界浮层」，先问「能不能让容器给它留位」；
 * 留位会改变**内容区**观感时，就把浮层移出滚动容器，用 JS 定位，别在容器上做假间距。
 */

const PAGE_EDITOR = resolve(__dirname, 'PageEditor.vue');
const src = readFileSync(PAGE_EDITOR, 'utf8');

function styleBlock() {
  const m = src.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  expect(m, 'PageEditor.vue 应有 <style> 块').toBeTruthy();
  return m[1];
}
/** 去掉 CSS 注释再匹配规则体 —— 本文件大量注释里会出现 `padding-top` 等字样，
 *  不剥离会把「注释在劝退这个写法」误判成「真的这么写了」。 */
function cssRule(selector) {
  const css = styleBlock().replace(/\/\*[\s\S]*?\*\//g, '');
  const m = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
  expect(m, `应能找到 ${selector} 规则`).toBeTruthy();
  return m[1];
}
function scriptBlock() {
  const m = src.match(/<script[^>(]*>([\s\S]*?)<\/script>/);
  expect(m, 'PageEditor.vue 应有 <script> 块').toBeTruthy();
  return m[1];
}

describe('画布组件操作条定位', () => {
  it('🔴 操作条必须在画布外的独立图层（.pe-tools-layer），不能内嵌在 .pe-comp 里', () => {
    // 画布内不应再有组件内嵌的操作条
    expect(src).not.toMatch(/class="pe-comp"[\s\S]{0,400}?class="pe-comp-tools"/);
    // 图层与 .pe-canvas 平级（都在预览壳内，但不在画布内）
    expect(src).toContain('class="pe-tools-layer"');
    const canvasIdx = src.indexOf('<div class="pe-canvas"');
    const layerIdx = src.indexOf('<div class="pe-tools-layer"');
    expect(canvasIdx).toBeGreaterThan(-1);
    expect(layerIdx).toBeGreaterThan(canvasIdx);
    // 图层出现在画布闭合之后 —— 用 canvas 段末尾的 </div> 不好判，改查画布内无该 class：
    // canvas 段 = 从 <div class="pe-canvas" 到 <div class="pe-tools-layer"> 之间
    const canvasSeg = src.slice(canvasIdx, layerIdx);
    expect(canvasSeg).not.toContain('pe-tools-layer');
  });

  it('🔴 .pe-canvas 不得有 padding-top（会制造假间距、与真机不符）', () => {
    const body = cssRule('.pe-canvas');
    expect(body).not.toMatch(/padding-top/);
    // 只允许 `padding: 0`（显式归零，防止继承/兜底）
    const pads = body.match(/padding[^:]*:\s*([^;]+)/g) || [];
    expect(pads.length, `应恰好只有一条 padding 声明，实际：${JSON.stringify(pads)}`).toBe(1);
    expect(pads[0]).toMatch(/padding:\s*0\s*$/);
  });

  it('🔴 .pe-phone 不得靠 padding-top 给操作条留位（实测无效，裁剪边界在画布自己）', () => {
    expect(cssRule('.pe-phone')).not.toMatch(/padding-top/);
  });

  it('操作条图层必须 absolute + inset:0 + pointer-events:none（否则挡画布点击）', () => {
    const body = cssRule('.pe-tools-layer');
    expect(body).toMatch(/position:\s*absolute/);
    expect(body).toMatch(/inset:\s*0/);
    expect(body).toMatch(/pointer-events:\s*none/);
    // 图层要盖在画布之上
    const z = body.match(/z-index:\s*(\d+)/);
    expect(z && Number(z[1])).toBeGreaterThanOrEqual(60);
  });

  it('🔴 操作条必须用 top/left 定位（由 JS 算），不得再用 top:-22px 硬写', () => {
    const body = cssRule('.pe-comp-tools');
    expect(body).not.toMatch(/top:\s*-/);
    expect(body).not.toMatch(/right:\s*4px/);
    // 操作条本身可点（点击删除/复制）
    expect(body).toMatch(/pointer-events:\s*auto/);
  });

  it('JS 定位：hover 优先于选中，坐标按组件真实 rect 算并夹在壳内', () => {
    const js = scriptBlock();
    expect(js).toMatch(/const hoverCompId = ref\(/);
    // hover 优先：hoverCompId || selected
    expect(js).toMatch(/hoverCompId\.value\s*\|\|\s*selected\.value/);
    expect(js).toMatch(/function positionCompTools\(\)/);
    // 按组件 rect 定位：需要 data-cid 找到组件元素
    expect(src).toMatch(/:data-cid="c\.id"/);
    expect(js).toMatch(/getBoundingClientRect\(\)/);
    // 顶部兜底：上方不够就翻到组件内侧顶（首组件上方是状态栏，不能被壳遮住）
    expect(js).toMatch(/if \(top < 2\) top = cr\.top - lr\.top \+ 2/);
  });

  it('画布滚动 / 窗口缩放 / 组件变化都要重算操作条坐标', () => {
    const js = scriptBlock();
    expect(js).toMatch(/canvasScrollEl\.addEventListener\('scroll', positionCompTools/);
    expect(js).toMatch(/window\.addEventListener\('resize', positionCompTools/);
    expect(js).toMatch(/watch\(components, \(\) => nextTick\(positionCompTools\)/);
  });

  it('hover 预选边框颜色要明显（用户反馈「颜色要明显一点」），且与 active 区分得开', () => {
    // 不能再是几乎看不出的浅灰 #c9cdd4
    const hover = cssRule('.pe-comp:hover');
    expect(hover).not.toMatch(/#c9cdd4/i);
    expect(hover).toMatch(/border-color:\s*#(165dff|4080ff|7aa2ff|94bfff|5c8dff)/i);
    // 选中态与 hover 视觉可区分：active 另有 outline/box-shadow
    expect(cssRule('.pe-comp.active')).toMatch(/outline:/);
  });
});
