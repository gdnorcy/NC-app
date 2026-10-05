#!/usr/bin/env node
/**
 * 清理 PageNav 迁移后残留的废弃导航 CSS。
 *
 * 原则：
 *   - 容器类（mall-nav / msg-nav / nav-bar）：已由 PageNav 接管，整体删除
 *   - 元素类：只删在模板中已无引用者；PageNav 插槽仍在用的（nav-cart/mn-clear/
 *     nav-right/nav-icon/nav-tag/red-dot/nav-title…）必须保留
 *   - 不动 sticky 依赖项（如 group-bar 的 top:88rpx 需按新导航高度重算，单独处理）
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

const files = [...walk(path.join(ROOT, 'pages')), ...walk(path.join(ROOT, 'pagesReads'))];
const report = [];

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
  // script 里的 :class 动态值也算
  for (const m of head.matchAll(/['"]([a-z][a-z0-9-]*(?: [a-z0-9-]+)*)['"]/gi)) {
    // 仅粗略收集字符串字面量中的类名候选
    m[1].split(/\s+/).forEach((c) => /^[a-z][a-z0-9-]*$/.test(c) && used.add(c));
  }

  const removed = [];
  const dropBlocks = (names) => {
    for (const n of names) {
      // 兼容两种写法：
      //   多行：`.name {\n ... \n}`      —— 结束 } 独占一行
      //   单行：`.name { ... }`          —— 结束 } 与声明同行
      // 以及组合选择器：`.a, .name {` / `.name, .a {`
      const patterns = [
        // 多行块
        new RegExp(
          `^[ \\t]*(?:\\.${n}(?:\\s*,\\s*\\.[a-z0-9_-]+)*\\s*\\{|\\.[a-z0-9_-]+\\s*,\\s*\\.${n}(?:\\s*,\\s*\\.[a-z0-9_-]+)*\\s*\\{)[\\s\\S]*?^[ \\t]*\\}[ \\t]*\\r?\\n`,
          'm'
        ),
        // 单行块
        new RegExp(
          `^[ \\t]*(?:\\.${n}(?:\\s*,\\s*\\.[a-z0-9_-]+)*|\\.[a-z0-9_-]+\\s*,\\s*\\.${n}(?:\\s*,\\s*\\.[a-z0-9_-]+)*)\\s*\\{[^}\\n]*\\}[ \\t]*\\r?\\n?`,
          'm'
        ),
      ];
      const before = css;
      for (const re of patterns) css = css.replace(re, '');
      if (css !== before) removed.push(n);
    }
  };

  dropBlocks(CONTAINERS);
  // 元素类：模板未引用才删
  dropBlocks(ELEMENTS.filter((n) => !used.has(n)));

  if (removed.length) {
    if (!DRY) fs.writeFileSync(abs, head + css, 'utf8');
    report.push(`${rel}\n    删除: ${removed.join(', ')}`);
  }
}

console.log(report.join('\n'));
console.log(`\n共 ${report.length} 个页面清理了废弃导航 CSS${DRY ? '（dry-run，未写入）' : ''}`);
