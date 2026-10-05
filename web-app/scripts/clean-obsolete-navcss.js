#!/usr/bin/env node
/**
 * 清理 PageNav 迁移后残留的废弃导航 CSS。
 *
 * 原则：
 *   - 容器类（mall-nav / msg-nav / nav-bar）：已由 PageNav 接管，整体删除
 *   - 元素类：只删在模板中已无引用者；PageNav 插槽仍在用的（nav-cart/mn-clear/
 *     nav-right/nav-icon/nav-tag/red-dot/nav-title…）必须保留
 *
 * ⚠️ 实现说明（这里踩过一次坑，勿改回正则方案）：
 *   不能用「惰性匹配到下一个独占行的 }」来定位规则块。CSS 里既有单行块
 *   （`.a { color: red; }`）又有多行块（`.a {\n ... \n}`），单行块会匹配到
 *   多行模式上，然后一路吞掉后面若干条**毫不相干**的规则。
 *   实际事故：radarConfig 的 `.mn-clear { ... }`（单行）后面紧跟的
 *   `.rc-card { ... }`（多行）被连带删除，整页卡片容器样式全丢。
 *   因此这里改为从每个选择器的 `{` 起做**括号配对扫描**，精确截取块尾。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');
const DRY = process.argv.includes('--dry');

// 容器类：整块删除
const CONTAINERS = ['mall-nav', 'msg-nav', 'nav-bar'];
// 候选元素类：模板无引用则删
const ELEMENTS = [
  'nav-back', 'back-arrow', 'nav-title', 'nav-right',
  'mn-back', 'mn-title', 'mn-clear',
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.vue')) out.push(p);
  }
  return out;
}

/**
 * 找出所有「顶层规则块」在 css 字符串中的区间。
 * 返回 [{ start, end, selectors }]，end 为块尾 `}` 之后的位置。
 * 只处理顶层（不在 @media 内的嵌套规则不单独列出——本项目样式无嵌套语法）。
 */
function topLevelRules(css) {
  const rules = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    // 跳过 @media / @keyframes 等 at-rule：整体跳过其花括号块
    if (css[i] === '@') {
      const brace = css.indexOf('{', i);
      if (brace < 0) break;
      let depth = 0;
      let j = brace;
      for (; j < n; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') { depth--; if (depth === 0) { j++; break; } }
      }
      i = j;
      continue;
    }
    if (css[i] === '}') { i++; continue; }
    if (css[i] === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i);
      i = end < 0 ? n : end + 2;
      continue;
    }
    const brace = css.indexOf('{', i);
    if (brace < 0) break;
    // 确认 '{' 之前只有选择器文本（没有跨过另一条规则）
    const selector = css.slice(i, brace);
    if (selector.includes('}') || selector.includes('{')) { i = brace + 1; continue; }
    let depth = 0;
    let j = brace;
    for (; j < n; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    rules.push({ start: i, end: j, selectors: selector });
    i = j;
  }
  return rules;
}

const files = [...walk(path.join(ROOT, 'pages')), ...walk(path.join(ROOT, 'pagesReads'))];
const report = [];
const protectedHits = [];

for (const abs of files) {
  const rel = path.relative(ROOT, abs);
  let src = fs.readFileSync(abs, 'utf8');
  if (!src.includes('<!-- PageNav -->')) continue;

  const styleStart = src.indexOf('<style');
  if (styleStart < 0) continue;
  const head = src.slice(0, styleStart);
  let css = src.slice(styleStart);

  // 模板中实际用到的 class（含插槽）
  const used = new Set();
  for (const m of head.matchAll(/class="([^"]+)"/g)) {
    m[1].split(/\s+/).forEach((c) => c && used.add(c));
  }
  for (const m of head.matchAll(/['"]([a-z][a-z0-9-]*(?: [a-z0-9-]+)*)['"]/gi)) {
    m[1].split(/\s+/).forEach((c) => /^[a-z][a-z0-9-]*$/.test(c) && used.add(c));
  }

  const dropSet = new Set([
    ...CONTAINERS,
    ...ELEMENTS.filter((n) => !used.has(n)),
  ]);
  if (!dropSet.size) continue;

  // 自后向前删除，避免前段删除导致后续偏移失效
  const rules = topLevelRules(css);
  const removed = [];
  for (let k = rules.length - 1; k >= 0; k--) {
    const r = rules[k];
    const classes = [...r.selectors.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
    if (!classes.length) continue;
    const hits = classes.filter((c) => dropSet.has(c));
    if (!hits.length) continue;
    // 组合选择器里只要有一个 class 仍被模板引用，就整块保留
    const alive = classes.filter((c) => used.has(c));
    if (alive.length) {
      protectedHits.push(`${rel}: .${hits.join(',.')} 与仍被引用的 .${alive.join(',.')} 同组，整块保留`);
      continue;
    }
    removed.push(...hits);
    // 连同该规则后的空行一起清掉
    let end = r.end;
    while (end < css.length && css[end] === '\r') end++;
    if (css[end] === '\n') end++;
    css = css.slice(0, r.start) + css.slice(end);
  }

  if (removed.length) {
    if (!DRY) fs.writeFileSync(abs, head + css, 'utf8');
    report.push(`${rel}\n    删除: ${[...new Set(removed)].sort().join(', ')}`);
  }
}

console.log(report.join('\n'));
console.log(`\n共 ${report.length} 个页面清理了废弃导航 CSS${DRY ? '（dry-run，未写入）' : ''}`);
if (protectedHits.length) {
  console.log(`\n因与在用 class 同组而保留的规则（${protectedHits.length}）：`);
  console.log(protectedHits.map((s) => '  · ' + s).join('\n'));
}
