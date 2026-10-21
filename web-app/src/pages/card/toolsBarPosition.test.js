/**
 * 装修页组件边条位置回归（🔴 反馈 #321，2026-10-21）
 *
 * 用户反馈：「组件的边条现在是选择后在组件内部会挡到，
 *          这个要跟设计中心的组件栏一样，在组件的上方显示，不要挡到组件」。
 *
 * 对齐的口径来自设计中心 `PageEditor.vue` 的 `positionCompTools`：
 *   「贴在组件**上方**；上方不够就翻到内侧顶」
 *   `let top = cr.top - lr.top - tr.height - 2; if (top < 2) top = cr.top - lr.top + 2;`
 *
 * 🔴 三条纪律（都是本项目踩过的坑）：
 *  ① 位置必须 **JS 实测**（记忆规则：浮层定位禁写死百分比）；
 *  ② `getCurrentInstance()` 只能在 setup 顶层取（事件处理器里调一律返回 null
 *     → `q.in(null.proxy)` 抛 TypeError → 被吞成「位置算不出来」，只在真机炸）；
 *  ③ 用负 top 而不是「排在组件前面」：负 top 不占布局 → 渲染区不被推走 = 所见即所得。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, './cardEdit.vue'), 'utf-8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = () => stripComments(src);

/** 取某个 CSS 规则的规则体（按大括号切，不能用非贪婪跨过 `}` —— 记忆规则） */
function cssRule(selector) {
  const i = src.indexOf(selector);
  if (i < 0) return '';
  const start = src.indexOf('{', i);
  let depth = 0;
  for (let k = start; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(start + 1, k); }
  }
  return '';
}

describe('边条浮在组件上方，不压组件内容', () => {
  test('CSS 用负 top（--tools-top），不是压角的正偏移', () => {
    const rule = cssRule('.ce-tools {');
    expect(rule, '找不到 .ce-tools 规则').toBeTruthy();
    // 🔴 判据：top 的值来自 CSS 变量，且默认值是负数（负 top = 浮到组件上方）
    expect(rule).toMatch(/top:\s*var\(--tools-top/);
    expect(rule).toMatch(/--tools-top,\s*-?\d/);
    const def = rule.match(/--tools-top,\s*(-?[\d.]+)rpx/);
    expect(def, '未读到 --tools-top 默认值').toBeTruthy();
    expect(Number(def[1]), '默认值应为负数（浮到组件上方）').toBeLessThan(0);
  });

  test('🔴 不是「排在组件前面」—— 卡片不因边条多出高度（所见即所得）', () => {
    // 若边条改成块级排在渲染区之前，.ce-card 会被撑高 → 组件位置与真实页不一致。
    const rule = cssRule('.ce-tools {');
    expect(rule).toMatch(/position:\s*absolute/);
  });

  test('位置仍靠 JS 实测，不写死百分比（记忆规则：浮层定位禁写死）', () => {
    const c = code();
    expect(c).toMatch(/function updateToolsTop\(key\)/);
    expect(c).toMatch(/boundingClientRect/);
    // CSS 里 --tools-top 的默认值只能是 px/rpx 长度，不许是百分比（视口比例会随机型变）
    const rule = cssRule('.ce-tools {');
    const def = rule.match(/--tools-top,\s*([^)]+)\)/);
    expect(def, '未读到 --tools-top 默认值').toBeTruthy();
    expect(def[1], `--tools-top 默认值不该是百分比：${def[1]}`).not.toContain('%');
  });

  test('对齐设计中心策略：上方不够就翻到内侧顶（top >= 0 时兜底）', () => {
    const c = code();
    expect(c).toMatch(/const above = navBottomPx\.value - card\.top/);
    expect(c).toMatch(/above >= need \? \{ '--tools-top': `\$\{-need\}px` \} : \{ '--tools-top': '2px' \}/);
  });

  test('单位是 px（实测值直接用，不换算 rpx —— 机型不同 rpx 换算也不同）', () => {
    expect(code()).toMatch(/--tools-top': `\$\{-need\}px`/);
  });
});

describe('实测纪律：getCurrentInstance 顶层取', () => {
  test('editInst 在 setup 顶层取一次', () => {
    const c = code();
    expect(c).toMatch(/const editInst = getCurrentInstance\(\)/);
  });

  test('🔴 不许在函数体内再调 getCurrentInstance（会返 null → q.in(null.proxy) 抛错）', () => {
    const c = code();
    const count = (c.match(/getCurrentInstance\(\)/g) || []).length;
    expect(count, `getCurrentInstance 出现 ${count} 次，应只在顶层 1 次`).toBe(1);
  });

  test('两处 createSelectorQuery 都走 editInst.proxy', () => {
    const c = code();
    const qs = c.match(/createSelectorQuery\(\)/g) || [];
    expect(qs.length).toBeGreaterThanOrEqual(2);
    const ins = c.match(/q\.in\(editInst\.proxy\)/g) || [];
    expect(ins.length, 'createSelectorQuery 与 q.in 不成对').toBe(qs.length);
  });
});

describe('实测锚点', () => {
  test('导航栏底沿有随文档流的量尺（PageNav 是浮层，选不中）', () => {
    expect(code()).toContain('ce-nav-anchor');
    expect(src).toMatch(/<view class="ce-nav-anchor"><\/view>/);
    expect(code()).toMatch(/q\.select\('\.ce-nav-anchor'\)/);
  });

  test('量尺是零高度（不影响任何布局）', () => {
    expect(cssRule('.ce-nav-anchor {')).toMatch(/height:\s*0/);
  });

  test('卡片带 data-key 供选择器精确定位', () => {
    expect(code()).toMatch(/:data-key="c\.key"/);
    expect(code()).toMatch(/q\.select\(`\.ce-card\[data-key="\$\{key\}"\]`\)/);
  });
});

describe('不回归：其余交互与裁剪', () => {
  test('边条仍选中才浮现', () => {
    expect(src).toMatch(/v-if="activeKey === c\.key" class="ce-tools"/);
  });

  test('复制图标仍是两个真实 view 叠出（不是字符，MP 会豆腐块）', () => {
    expect(code()).toMatch(/class="ce-ico-dup"/);
  });

  test('🔴 .ce-list / .ce-body 不得有 overflow:hidden（会把上方浮条裁掉）', () => {
    // 边条现在在组件上方 → 一旦祖先裁剪，浮条直接消失（比压角更隐蔽）。
    for (const sel of ['.ce-list', '.ce-body', '.ce-page']) {
      const rule = cssRule(`${sel} {`);
      if (rule) expect(rule, `${sel} 不能有 overflow:hidden`).not.toMatch(/overflow:\s*hidden/);
    }
  });

  test('.ce-render 的 overflow:hidden 保留（渲染区裁剪是另一回事）', () => {
    expect(cssRule('.ce-render {')).toMatch(/overflow:\s*hidden/);
  });

  test('边条不占布局：只在选中卡片上绑 style', () => {
    expect(src).toMatch(/:style="activeKey === c\.key \? toolsTopStyle : null"/);
  });

  test('选中即重算位置（点选代替 hover）', () => {
    expect(code()).toMatch(/activeKey\.value = c\.key;\s*\n\s*updateToolsTop\(c\.key\)/);
  });

  test('mounted 时量一次导航栏底沿', () => {
    expect(code()).toMatch(/onMounted\(\(\) => \{\s*\n\s*load\(\);\s*\n\s*measureNavBottom\(\);/);
  });

  test('未选中时 style 为 null（不残留上一次的位置）', () => {
    expect(code()).toMatch(/if \(!key\) \{ toolsTopStyle\.value = null; return; \}/);
  });
});