/**
 * 文本组件「前置符号」回归（🔴 反馈 #321，2026-10-21）
 *
 * 用户反馈：「文本组件输入文字后，左边多了一个点，这个可以优化一下，
 *          可以选择在前面加上符号的选择框（内置多个符号）」。
 *
 * 🔴 根因：渲染里**写死**了一个小圆点（`<text class="cc-notice-dot">` + CSS 8rpx 实心圆），
 *   无条件渲染 → 用户输入文字后左边凭空多个点。
 *   改成按 `symbol` 配置渲染，默认 'none' 不渲染任何符号。
 *
 * ⚠️ 两端漂移提醒（记忆规则）：`DesignPage.vue`（首页/mall 装修）的 notice
 *   用 `iconType`（system→「公告」标签 / custom→自定义图）**根本没有圆点**，
 *   而名片装修走`CardCompItem.vue` 有圆点 → 同一组件两套渲染。
 *   本次先把 CardCompItem 的圆点改可控；两端收敛是另一件事，不要在本次顺手改。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const item = () => stripComments(read('../../components/CardCompItem.vue'));
const registry = () => stripComments(read('./cardCompRegistry.js'));
const admin = () => stripComments(read('../../../../web-admin/src/views/customer/apps/design/componentRegistry.js'));

describe('写死的圆点已移除', () => {
  test('cc-notice-dot 整个类名不再出现（旧实现已删）', () => {
    expect(item()).not.toContain('cc-notice-dot');
  });

  test('符号元素由配置驱动（两个分支：shape 类用 view，字符类用 text）', () => {
    const s = item();
    expect(s).toMatch(/v-if="noticeSymbolShape"[\s\S]{0,120}?class="cc-notice-sym"/);
    expect(s).toMatch(/v-else-if="noticeSymbolText"[\s\S]{0,120}?class="cc-notice-sym-text"/);
  });

  test('未设/非法 symbol → 两个 computed 都为空 → 一个符号都不渲染', () => {
    const s = item();
    expect(s).toMatch(/const noticeSymbol = computed\(\(\) => NOTICE_SYMBOLS\[props\.value\.symbol\] \|\| null\)/);
    expect(s).toMatch(/const noticeSymbolShape = computed\(\(\) => \(noticeSymbol\.value && noticeSymbol\.value\.shape\) \|\| ''\)/);
    expect(s).toMatch(/const noticeSymbolText = computed\(\(\) => \(noticeSymbol\.value && noticeSymbol\.value\.text\) \|\| ''\)/);
  });
});

describe('内置符号集合', () => {
  test('提供 7 种符号 + 默认无', () => {
    const s = item();
    const m = s.match(/NOTICE_SYMBOLS = \{([\s\S]*?)\n\};/);
    expect(m, 'NOTICE_SYMBOLS 未找到').toBeTruthy();
    for (const k of ['dot', 'square', 'arrow', 'diamond', 'bar', 'check', 'star']) {
      expect(m[1], `缺符号 ${k}`).toContain(`${k}:`);
    }
  });

  test('🔴 字符类符号用码点写（小程序字体里 ⧉ 之类是豆腐块）', () => {
    const s = item();
    // ✓ = U+2713，★ = U+2605 —— 都写成 \uXXXX 而非字面量
    expect(s).toMatch(/check: \{ text: '\\u2713' \}/);
    expect(s).toMatch(/star: \{ text: '\\u2605' \}/);
  });

  test('形状类符号用真实 view + CSS（不用伪元素，WXSS 伪元素在小程序不可靠）', () => {
    const s = item();
    expect(s).not.toMatch(/\.cc-notice-sym[^{]*::(before|after)/);
    for (const cls of ['is-dot', 'is-square', 'is-bar', 'is-diamond', 'is-arrow']) {
      expect(s, `缺 ${cls} 样式`).toContain(`.cc-notice-sym.${cls}`);
    }
    // 三角形箭头用 border 画（实心三角，WXSS 可靠）
    expect(s).toMatch(/is-arrow[\s\S]{0,200}?border-left:\s*11rpx solid currentColor/);
  });

  test('符号跟随公告文字色（currentColor，不写死色值）', () => {
    const s = item();
    expect(s).toMatch(/\.cc-notice-sym\.is-dot[\s\S]{0,160}?background: currentColor/);
  });
});

describe('注册表：symbol 字段两端一致', () => {
  test('移动端 notice 有 symbol 字段且默认 none', () => {
    const s = registry();
    const m = s.match(/type: 'notice'[\s\S]{0,2000}?defaultProps: \{([^}]*)\}/);
    expect(m, 'notice defaultProps 未找到').toBeTruthy();
    expect(m[1]).toContain("symbol: 'none'");
    expect(s.match(/key: 'symbol', label: '前置符号', control: 'radio', default: 'none'/)).toBeTruthy();
  });

  test('symbol 选项：8 项（含「无」）且值与渲染表对得上', () => {
    const s = registry();
    const m = s.match(/key: 'symbol'[\s\S]{0,700}?options: \[([^\]]+)\]/);
    expect(m, 'symbol 选项未找到').toBeTruthy();
    expect(m[1]).toContain("label: '无', value: 'none'");
    for (const v of ['dot', 'square', 'arrow', 'diamond', 'check', 'star', 'bar']) {
      expect(m[1], `schema 缺 ${v}`).toContain(`value: '${v}'`);
    }
  });

  test('admin 端同步（两端 schema 键必须一致，防漂移）', () => {
    const s = admin();
    const m = s.match(/key: 'symbol', label: '前置符号'/);
    expect(m, 'admin 缺 symbol 字段').toBeTruthy();
    expect(s).toMatch(/symbol: 'none'/);
  });

  test('🔴 schema 里的 symbol 值必须都能被渲染表识别（值漂移 = 配了没反应）', () => {
    const s = stripComments(read('./cardCompRegistry.js'));
    const opts = s.match(/key: 'symbol'[\s\S]{0,700}?options: \[([^\]]+)\]/)[1];
    const schemaVals = [...opts.matchAll(/value: '([^']+)'/g)].map((m) => m[1]);
    const itemSrc = item();
    const tbl = itemSrc.match(/NOTICE_SYMBOLS = \{([\s\S]*?)\n\};/)[1];
    const renderVals = [...tbl.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
    // 'none' 由 v-if/v-else-if 两个空 computed 兜住，不需要进表
    for (const v of schemaVals.filter((v) => v !== 'none')) {
      expect(renderVals, `渲染表缺 ${v}`).toContain(v);
    }
  });
});

describe('文本对齐与符号共存（不回退 #299）', () => {
  test('align 逻辑仍在（居中/居右时文字不撑满）', () => {
    const s = item();
    expect(s).toMatch(/const noticeAlign = computed/);
    expect(s).toMatch(/cc-notice-text-inline/);
    expect(s).toMatch(/justifyContent = 'flex-end'/);
  });

  test('符号与文字之间保留 gap（挤在一起会看不清）', () => {
    expect(item()).toMatch(/\.cc-notice \{[\s\S]{0,200}?gap: var\(--space-r2\)/);
  });
});