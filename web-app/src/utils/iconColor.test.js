/**
 * SIcon 颜色令牌回归（2026-10-16 前端审查 · 方案 A）
 *
 * 病根：77 处图标硬编码色值里散落 **7 种不同的灰**（#c9cdd4×18 / #4e5969×8 / #86909c×6 /
 *   #9a9a9a×4 / #1d2129×3 / #8a8f99×1 / #5b5b5b×3）。同一语义「次要图标」有 7 个值，
 *   改一次token 要翻 7 处，且必然漏 → 视觉漂移。
 *
 * 🔴 为什么令牌是 JS 常量而不是 CSS var(--t1)：SIcon 的 color 会被**烘焙**进产物，
 *   var() 到不了——
 *     ① H5：buildSvgDataUri 把 color 写死进 SVG data-URI（background-image），
 *        data-URI 里的 currentColor 不解析外部 CSS color → 回落黑；
 *     ② MP：mpIconSrc 按 `name-hex` 查构建期 PNG，var() 不是 hex → 回落黑色兜底。
 *   故必须是真实 hex，与 token.scss 的同步由本测试锁定。
 *
 * 锁四件事：
 *   ① JS 常量 === token.scss 的 $t1/$t2/$t3（改 token 不同步改这里 → 失败）
 *   ② resolveIconColor 的行为（hex 原样 / 令牌名解析 / 空值透传）
 *   ③ gen-mp-sicons.js 能把模板里的 ICON_* 令牌名解析回 hex
 *      （不解析就会按 #000000 烘焙，运行期查 name-86909c 落空 → 走服务端渲染，丢离线 base64）
 *   ④ 没有任何 SIcon 用 var() 当 color（上面 ①② 两条硬约束的守门测试）
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, relative } from 'path';
import { describe, test, expect } from 'vitest';
import { ICON_T1, ICON_T2, ICON_T3, ICON_DECOR, resolveIconColor, ICON_COLOR_TOKENS } from './iconColor.js';

const here = import.meta.url;
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, here)), 'utf8');
const TOKEN_SCSS = read('../styles/token.scss');
const SICON_SRC = read('../components/SIcon.vue');
const GEN_MP = read('../../scripts/gen-mp-sicons.js');

describe('令牌值与 token.scss 单一事实来源同步', () => {
  test('T1/T2/T3 与 $t1/$t2/$t3 一致', () => {
    expect(ICON_T1).toBe('#1d2129');
    expect(ICON_T2).toBe('#4e5969');
    expect(ICON_T3).toBe('#5c6470');
    expect(TOKEN_SCSS).toMatch(/\$t1:\s*#1d2129/);
    expect(TOKEN_SCSS).toMatch(/\$t2:\s*#4e5969/);
    expect(TOKEN_SCSS).toMatch(/\$t3:\s*#5c6470/);
  });

  test('ICON_DECOR 是 token.scss 注释里指明的装饰灰（空态/占位，非阅读内容）', () => {
    expect(ICON_DECOR).toBe('#86909c');
    expect(TOKEN_SCSS).toContain('#86909c');
    expect(TOKEN_SCSS).toMatch(/空态图标/);
  });

  test('令牌表四个键齐全', () => {
    expect(Object.keys(ICON_COLOR_TOKENS).sort()).toEqual(['ICON_DECOR', 'ICON_T1', 'ICON_T2', 'ICON_T3']);
  });
});

describe('resolveIconColor', () => {
  test('hex 原样小写化返回', () => {
    expect(resolveIconColor('#C9CDD4')).toBe('#c9cdd4');
    expect(resolveIconColor('#86909c')).toBe('#86909c');
  });
  test('令牌名解析成 hex', () => {
    expect(resolveIconColor('ICON_DECOR')).toBe('#86909c');
    expect(resolveIconColor('ICON_T1')).toBe('#1d2129');
  });
  test('空值透传空串（SIcon 据此走 currentColor）', () => {
    expect(resolveIconColor('')).toBe('');
    expect(resolveIconColor(undefined)).toBe('');
  });
  test('非 hex 非令牌的值原样返回（保持既有回落行为）', () => {
    expect(resolveIconColor('var(--design-primary)')).toBe('var(--design-primary)');
  });
});

describe('gen-mp-sicons.js 能解析模板里的 ICON_* 令牌名', () => {
  test('脚本含令牌提取与回落逻辑', () => {
    expect(GEN_MP).toContain('utils/iconColor.js');
    expect(GEN_MP).toMatch(/export\\s\+const\\s\+\(ICON_\[A-Z0-9_\]\+\)/);
    expect(GEN_MP).toMatch(/ICON_\[A-Z0-9_\]\+/);
  });

  test('用脚本同款正则能从 iconColor.js 提出 4 个令牌', () => {
    const re = /export\s+const\s+(ICON_[A-Z0-9_]+)\s*=\s*'(#[0-9a-fA-F]{3,8})'/g;
    const out = {};
    let m;
    while ((m = re.exec(read('./iconColor.js'))) !== null) out[m[1]] = m[2].toLowerCase();
    expect(out).toEqual({ ICON_T1: '#1d2129', ICON_T2: '#4e5969', ICON_T3: '#5c6470', ICON_DECOR: '#86909c' });
  });

  test('hexListOf 语义：有 hex 用 hex，无 hex 才解析令牌名', () => {
    const TOKENS = { ICON_T1: '#1d2129', ICON_DECOR: '#86909c' };
    const hexListOf = (e) => {
      const hexes = (e.match(/#[0-9a-fA-F]{3,8}/g) || []).map((h) => h.toLowerCase());
      if (hexes.length) return hexes;
      return (e.match(/\bICON_[A-Z0-9_]+\b/g) || []).map((t) => TOKENS[t]).filter(Boolean);
    };
    expect(hexListOf(':color="ICON_DECOR"')).toEqual(['#86909c']);
    expect(hexListOf("active === 'member' ? themeColor : '#9a9a9a'")).toEqual(['#9a9a9a']);
    expect(hexListOf(':color="themeColor"')).toEqual([]);
  });
});

describe('SIcon 的 color 不能吃 var()（烘焙链路硬约束）', () => {
  test('全仓没有任何 SIcon 把 var() 传给 color', () => {
    const srcRoot = fileURLToPath(new URL('..', here));
    const files = [];
    const walk = (dir) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.vue$/.test(f)) files.push(p);
      }
    };
    walk(srcRoot);
    const hits = [];
    for (const f of files) {
      const t = readFileSync(f, 'utf8');
      for (const m of t.matchAll(/<SIcon\b[^>]*>/g)) {
        if (/color="var\(/.test(m[0]) || /:color="var\(/.test(m[0])) {
          hits.push(relative(srcRoot, f));
        }
      }
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });

  test('buildSvgDataUri 与 mpIconSrc 的烘焙链路仍在（防止后人误删约束注释）', () => {
    expect(SICON_SRC).toContain('const strokeColor = props.color');
    expect(SICON_SRC).toMatch(/const mpIconSrc = computed/);
    // MP 按 `name-hex` 查构建期 PNG——这正是 var() 不能当 color 的原因
    expect(SICON_SRC).toMatch(/siconsBase64\[`\$\{props\.name\}-\$\{hex\}`\]/);
  });
});
