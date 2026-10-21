/**
 * 文本/公告组件「前置符号」回归（🔴 反馈 #321，2026-10-21）
 *
 * 用户反馈：「文本组件输入文字后，左边多了一个点，这个可以优化一下，
 *          可以选择在前面加上符号的选择框（内置多个符号）」。
 *
 * 🔴 根因：名片渲染里**写死**了一个小圆点（`<text class="cc-notice-dot">` + CSS 8rpx 实心圆），
 *   无条件渲染 → 用户输入文字后左边凭空多个点。
 *   改成按 `symbol` 配置渲染，默认 'none' 不渲染任何符号。
 *
 * 🔴🔴 收尾时发现的自埋缺陷（本文件后半段专门钉它）：
 *   `symbol` 同时进了web-app 与 web-admin 两端 registry（面板能配），
 *   但**渲染只补了名片那一份** → 两端各自「配了不生效」：
 *     - admin 设计器画布配了符号，预览不显示（所见非所得）；
 *     - 首页/商场装修（DesignPage.vue）配了符号，C 端不显示。
 *   修法不是三处各抄一份（必然再漂移），而是抽 `utils/noticeSymbol.js` 共享纯函数，
 *   三处渲染 + 两端面板全部引用它。本测试钉死「三处渲染都认symbol + 都用共享表」。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';
import { NOTICE_SYMBOLS, NOTICE_SYMBOL_OPTIONS, noticeSymbolParts, normalizeNoticeSymbol } from '../../utils/noticeSymbol.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const item = () => stripComments(read('../../components/CardCompItem.vue'));
const design = () => stripComments(read('../../components/DesignPage.vue'));
const adminRender = () => stripComments(read('../../../../web-admin/src/views/customer/apps/design/ComponentRender.vue'));
const registry = () => stripComments(read('./cardCompRegistry.js'));
const admin = () => stripComments(read('../../../../web-admin/src/views/customer/apps/design/componentRegistry.js'));

/** 三处渲染：名片 / 首页商场 / admin 画布 —— 每处都要认 symbol */
const RENDERERS = [
  ['名片 CardCompItem', item, 'cc-notice-sym'],
  ['首页商场 DesignPage', design, 'dp-notice-sym'],
  ['admin 画布 ComponentRender', adminRender, 'r-notice-sym'],
];

/**
 * 取「带某个 class 的那个开始标签」原文（含 < 与 >）。
 * 🔴 必须按标签边界取，不能用 `v-if="[^"]*${cls}` 之类的跨界正则：
 *   属性顺序一变就误报，[\s\S]{0,n} 跨界更会吃到别的分支 —— 通过/失败都是假的。
 */
function openTagWithClass(src, cls) {
  const re = /<[a-zA-Z][^<>]*>/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[0].includes(`class="${cls}"`)) return m[0];
  }
  return null;
}

describe('写死的圆点已移除', () => {
  test('cc-notice-dot 整个类名不再出现（旧实现已删）', () => {
    expect(item()).not.toContain('cc-notice-dot');
  });

  test('🔴 禁止对 computed 返回值解构（#326 实测翻车）', () => {
    // `const { shape, text } = computed(...)` 解构的是 ref 对象本身，
    // ref 上没有 .shape/.text（要 .value 才有）→ 恒 undefined → v-if 永远为假。
    // 这种 Vue 运行时语义错误真机才炸，源码正则是唯一能提前拦住它的手段。
    for (const [name, readFn] of RENDERERS) {
      expect(readFn(), `${name} 存在对 computed 解构（运行时必为 undefined）`)
        .not.toMatch(/const\s*\{[^}]*\}\s*=\s*computed\(/);
    }
  });
});

describe('内置符号集合（共享表 utils/noticeSymbol.js）', () => {
  test('提供 7 种符号 + 「无」选项', () => {
    for (const k of ['dot', 'square', 'arrow', 'diamond', 'bar', 'check', 'star']) {
      expect(NOTICE_SYMBOLS, `缺符号 ${k}`).toHaveProperty(k);
    }
    expect(NOTICE_SYMBOL_OPTIONS[0]).toEqual({ label: '无', value: 'none' });
    expect(NOTICE_SYMBOL_OPTIONS).toHaveLength(8);
  });

  test('🔴 字符类符号用码点写（小程序字体里 ⧉ 之类是豆腐块）', () => {
    // ✓ = U+2713，★ = U+2605 —— 都必须是 \uXXXX 而非字面量
    expect(NOTICE_SYMBOLS.check.text).toBe('\u2713');
    expect(NOTICE_SYMBOLS.star.text).toBe('\u2605');
    const src = read('../../utils/noticeSymbol.js');
    expect(src).toMatch(/check: \{ text: '\\u2713' \}/);
    expect(src).toMatch(/star: \{ text: '\\u2605' \}/);
  });

  test('形状类存完整类名（各端不许自己拼 is- 前缀 = 漂移源）', () => {
    for (const k of ['dot', 'square', 'arrow', 'diamond', 'bar']) {
      expect(NOTICE_SYMBOLS[k].shape).toBe(`is-${k}`);
    }
  });

  test('未设/非法/显式 none → 两个字段都空（调用方按空串短路，不渲染空壳）', () => {
    for (const v of [undefined, null, '', 'none', 'nope', '⧉']) {
      const p = noticeSymbolParts(v);
      expect(p.shape, `${v} 不该有 shape`).toBe('');
      expect(p.text, `${v} 不该有 text`).toBe('');
    }
    expect(normalizeNoticeSymbol('nope')).toBe('none');
    expect(normalizeNoticeSymbol('dot')).toBe('dot');
  });

  test('合法值解析出对应形态（shape 与 text 互斥，不同时给）', () => {
    for (const k of ['dot', 'square', 'arrow', 'diamond', 'bar']) {
      const p = noticeSymbolParts(k);
      expect(p.shape).toBe(`is-${k}`);
      expect(p.text).toBe('');
    }
    for (const k of ['check', 'star']) {
      const p = noticeSymbolParts(k);
      expect(p.shape).toBe('');
      expect(p.text).toBe(NOTICE_SYMBOLS[k].text);
    }
  });
});

describe('🔴 三处渲染都认 symbol（这是本轮修的自埋缺陷）', () => {
  for (const [name, readFn, cls] of RENDERERS) {
    test(`${name}：渲染 symbol，且形状/字符两分支都在`, () => {
      const s = readFn();
      expect(s, `${name} 未渲染符号元素`).toContain(cls);
      expect(s, `${name} 缺字符类分支`).toContain(`${cls}-text`);
      // 🔴 断言「这个元素被条件短路」要**限定在同一个标签内**：
      //   写成 `v-if="[^"]*${cls}` 会在 v-if 与 class 前后颠倒时误报，
      //   而`[\s\S]{0,n}` 跨界更会吃到别的分支 —— 两种写法都不是在测目标。
      for (const c of [cls, `${cls}-text`]) {
        const tag = openTagWithClass(s, c);
        expect(tag, `${name} 找不到带class="${c}" 的开始标签`).toBeTruthy();
        // ⚠️ 分支可能是 v-if 也可能是 v-else-if（形状类先判、字符类兜底），
        //   所以要认 `v-else-if` —— 只写 /v-if=/ 会把合法的 else 分支判成缺短路。
        expect(tag, `${name} 的 ${c} 没有条件短路（会白占 flex 槽位）`)
          .toMatch(/v-(?:else-)?if=/);
      }
    });

    test(`${name}：走共享表解析，不私藏符号表`, () => {
      const s = readFn();
      expect(s, `${name} 未 import 共享表`).toMatch(/import \{ noticeSymbolParts \} from '[^']*noticeSymbol\.js'/);
      expect(s, `${name} 未调用 noticeSymbolParts`).toContain('noticeSymbolParts(');
      // 私藏一份符号表 = 漂移：加符号时必漏这一处
      expect(s, `${name} 私藏了 NOTICE_SYMBOLS 表`).not.toMatch(/const NOTICE_SYMBOLS = \{/);
      expect(s, `${name} 未复用面板选项常量`).not.toMatch(/NOTICE_SYMBOL_OPTIONS = \[/);
    });

    test(`${name}：形状类样式齐全 + 跟随文字色`, () => {
      const s = readFn();
      for (const c of ['is-dot', 'is-square', 'is-bar', 'is-diamond', 'is-arrow']) {
        expect(s, `${name} 缺 ${c} 样式`).toContain(`.${cls}.${c}`);
      }
      expect(s, `${name} 符号未跟随文字色`).toMatch(new RegExp(`\\.${cls}\\.is-dot[\\s\\S]{0,160}?background: currentColor`));
      // 三角形箭头用 border 画（WXSS 可靠，伪元素不可靠）
      expect(s, `${name} 箭头未用 border 画`).toMatch(/is-arrow[\s\S]{0,220}?border-left:\s*[\d.]+(?:r?px) solid currentColor/);
    });
  }
});

describe('两端registry：symbol 面板引用共享表', () => {
  test('两端 defaultProps 都有 symbol: none', () => {
    for (const [name, readFn] of [['移动端', registry], ['admin', admin]]) {
      const m = readFn().match(/type: 'notice'[\s\S]{0,2000}?defaultProps: \{([^}]*)\}/);
      expect(m, `${name} notice defaultProps 未找到`).toBeTruthy();
      expect(m[1], `${name} 缺 symbol 默认值`).toContain("symbol: 'none'");
    }
  });

  test('两端 schema 的 options 都引用共享常量（禁手抄一份）', () => {
    for (const [name, readFn] of [['移动端', registry], ['admin', admin]]) {
      const s = readFn();
      expect(s, `${name} schema 未引用 NOTICE_SYMBOL_OPTIONS`).toMatch(/key: 'symbol'[^\n]*options: NOTICE_SYMBOL_OPTIONS/);
      // 🔴 判「没手抄」必须**只看 symbol 自己那条 schema**：
      //   用 `key: 'symbol'[\s\S]{0,700}?options: \[\{` 会跨界吃到下一条 schema
      //   （本项目 symbol 后面紧跟 align，align 本来就有字面量 options）→ 恒假失败。
      const line = s.split('\n').find((l) => l.includes("key: 'symbol'"));
      expect(line, `${name} symbol schema 未找到`).toBeTruthy();
      expect(line, `${name} 手抄了 symbol options`).not.toMatch(/options:\s*\[/);
    }
  });

  test('两端都 import 了共享表', () => {
    expect(registry()).toMatch(/import \{ NOTICE_SYMBOL_OPTIONS \} from '\.\.\/\.\.\/utils\/noticeSymbol\.js'/);
    expect(admin()).toMatch(/import \{ NOTICE_SYMBOL_OPTIONS \} from '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/web-app\/src\/utils\/noticeSymbol\.js'/);
  });

  test('🔴 schema 的每个 symbol 值都能被渲染表识别（值漂移 = 配了没反应）', () => {
    for (const v of NOTICE_SYMBOL_OPTIONS.map((o) => o.value)) {
      const p = noticeSymbolParts(v);
      const renderable = v === 'none' ? (!p.shape && !p.text) : (!!p.shape || !!p.text);
      expect(renderable, `symbol=${v} 配了但渲染不出来`).toBe(true);
    }
  });
});

describe('文本对齐与符号共存（不回退 #299）', () => {
  test('三处 align 逻辑仍在（居中/居右时文字不撑满）', () => {
    for (const [name, readFn] of RENDERERS) {
      const s = readFn();
      expect(s, `${name} 缺 align 处理`).toMatch(/justifyContent = 'flex-end'/);
      expect(s, `${name} 缺 align 绑定`).toMatch(/r-notice-text-inline|dp-notice-text-inline|cc-notice-text-inline/);
    }
  });

  test('三处都定义了各自的 inline 类（居中/居右才真的生效）', () => {
    for (const [name, readFn] of RENDERERS) {
      expect(readFn(), `${name} 缺 inline 样式`).toMatch(/\.[a-z-]*text-inline\s*\{/);
    }
  });

  test('三处符号与文字之间都保留 gap（挤在一起会看不清）', () => {
    expect(item()).toMatch(/\.cc-notice \{[\s\S]{0,200}?gap: var\(--space-r2\)/);
    expect(design()).toMatch(/\.dp-notice \{[\s\S]{0,200}?gap: 16rpx/);
    expect(adminRender()).toMatch(/\.r-notice \{[\s\S]{0,200}?gap: 8px/);
  });

  test('symbol 与 iconType 互斥：选了符号就不再画「公告」标签/自定义图', () => {
    // admin 与 DesignPage 都有 iconType 分支，必须排在 symbol 之后（v-else-if 链）
    for (const [name, s] of [['admin', adminRender()], ['DesignPage', design()]]) {
      expect(s, `${name} iconType 未与 symbol 串成v-else-if 链`).toMatch(/sym[^"]*"[\s\S]{0,400}?iconType/);
    }
  });
});