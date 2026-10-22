#!/usr/bin/env node
// C 端源码 import 审计（2026-10 真机报修复盘，双向检查）：
//   ① 幽灵 import：import { X } from './m' 但 m 不导出 X（重构后 import 失效 → 运行时报错）
//   ② 漏 import：代码用了 X，X 是某本地模块的导出，但本文件既没 import 也没本地声明
//      —— cardDetail.vue 曾漏 shadeHex：computed 惰性求值 → 渲染数据函数首字段
//         ReferenceError → 整页空 data（静态模板在、数据驱动内容全灭，观感=白屏）。
//         原单测逐字钉死错误 import 语句，谁修谁挂，形同虚设；本脚本做结构性检查。
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';

const SRC = resolve(process.argv[2] || 'src');

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(vue|js|mjs)$/.test(e.name) && !/\.test\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

function stripComments(code) {
  return code
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1 ');
}

function stripStrings(code) {
  return code
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function exportsOf(file) {
  const txt = stripComments(readFileSync(file, 'utf8'));
  const names = new Set();
  let hasDefault = false;
  for (const m of txt.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of txt.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const seg = part.trim().split(/\s+as\s+/).pop().trim();
      if (seg) names.add(seg);
    }
  }
  if (/^export\s+default/m.test(txt)) hasDefault = true;
  return { names, hasDefault };
}

// 正确解析 import 子句：花括号组整体取出，其余为 default / * as ns
function parseClause(clause) {
  const named = [];
  let def = null, ns = null;
  const rest = clause.replace(/\{([^}]*)\}/g, (_, inner) => {
    for (const part of inner.split(',')) {
      const t = part.trim();
      if (!t) continue;
      const asM = t.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      named.push(asM ? { imported: asM[1], local: asM[2] } : { imported: t, local: t });
    }
    return ' ';
  });
  for (const seg of rest.split(',')) {
    const s = seg.trim();
    if (!s) continue;
    const asM = s.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (asM) { ns = asM[1]; continue; }
    const dM = s.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
    if (dM) def = dM[2] || dM[1];
  }
  return { named, default: def, ns };
}

function importsOf(file) {
  const txt = readFileSync(file, 'utf8');
  const script = file.endsWith('.vue') ? (txt.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] || '') : txt;
  const clean = stripComments(script);
  const out = [];
  const re = /import\s+([^;]+?)\s+from\s+(['"])([^'"]+)\2/g;
  for (const m of clean.matchAll(re)) {
    out.push({ spec: m[3], ...parseClause(m[1]) });
  }
  return out;
}

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // 包名不解析
  const base = dirname(fromFile);
  for (const c of [join(base, spec), join(base, spec + '.js'), join(base, spec + '.vue'), join(base, spec + '.mjs'), join(base, spec, 'index.js')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

// 本地声明：function/const/let/var/class 简名 + 解构 + Options API 方法简写
function localDecls(script) {
  const names = new Set();
  const clean = stripComments(script).replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?/gm, '');
  for (const m of clean.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  // 解构声明：const { a, b: c } = ... / const [x, y] = ...
  for (const m of clean.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      const asM = t.match(/^([A-Za-z_$][\w$]*)\s*:/);
      names.add(asM ? asM[1] : t);
    }
  }
  // Options API 方法简写 name() { ... }
  for (const m of clean.matchAll(/(?:^|\n)\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) names.add(m[1]);
  return names;
}

const KEYWORDS = new Set(['if', 'else', 'return', 'const', 'let', 'var', 'function', 'class', 'new', 'typeof', 'instanceof', 'in', 'of', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'yield', 'import', 'export', 'from', 'this', 'super', 'null', 'true', 'false', 'undefined', 'void', 'delete', 'extends', 'static', 'get', 'set', 'void']);
const GLOBALS = new Set(['uni', 'getApp', 'getCurrentPages', 'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'Promise', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location', 'fetch', 'FormData', 'Image', 'Blob', 'FileReader', 'URL', 'wx', 'require', 'module', 'exports', 'process', 'Buffer', 'globalThis', 'requestAnimationFrame', 'cancelAnimationFrame', 'atob', 'btoa', 'Vue', 'defineProps', 'defineEmits', 'defineExpose', 'withDefaults', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Infinity', 'NaN']);

// ③ 包名具名导入缺失（2026-10-22 dynamic.vue 事故）：#312-2 引入 computed 时漏 import，
//    setup 里 ReferenceError → 整页绑定全灭（静态模板在、themeStyle/brandVars 失效露出
//    粉色 fallback、PageNav 不挂载、自绘头部顶到状态栏）。单字母/高危词不入表（防误报）。
const VUE_NAMED = new Set(['ref', 'computed', 'reactive', 'readonly', 'watch', 'watchEffect',
  'watchPostEffect', 'watchSyncEffect', 'onMounted', 'onUnmounted', 'onBeforeMount', 'onBeforeUnmount',
  'onUpdated', 'onBeforeUpdate', 'onActivated', 'onDeactivated', 'onErrorCaptured', 'nextTick',
  'defineComponent', 'defineAsyncComponent', 'toRef', 'toRefs', 'toRaw', 'unref', 'isRef', 'isReactive',
  'isProxy', 'isReadonly', 'shallowRef', 'shallowReactive', 'shallowReadonly', 'triggerRef', 'customRef',
  'markRaw', 'provide', 'inject', 'effectScope']);

const files = walk(SRC);
// 本地模块导出总表：name → [files]
const exportIndex = new Map();
for (const f of files) {
  for (const n of exportsOf(f).names) {
    if (!exportIndex.has(n)) exportIndex.set(n, []);
    exportIndex.get(n).push(f);
  }
}

let bad = 0;
for (const file of files) {
  const txt = readFileSync(file, 'utf8');
  const script = file.endsWith('.vue') ? (txt.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] || '') : txt;
  const imports = importsOf(file);
  const provided = new Set();
  const vueProvided = new Set();
  for (const imp of imports) {
    if (imp.default) provided.add(imp.default);
    if (imp.ns) provided.add(imp.ns);
    for (const n of imp.named) provided.add(n.local);
    if (imp.spec === 'vue') for (const n of imp.named) vueProvided.add(n.local);
  }
  const locals = localDecls(script);
  for (const n of provided) locals.add(n);
  // ① 幽灵 import
  for (const imp of imports) {
    const target = resolveSpec(file, imp.spec);
    if (imp.spec.startsWith('.') && !target) { console.log(`❌ ${relative(SRC, file)} import '${imp.spec}' 解析不到文件`); bad++; continue; }
    if (!target) continue;
    const { names, hasDefault } = exportsOf(target);
    const vueDefault = hasDefault || target.endsWith('.vue');
    for (const n of imp.named) {
      if (!names.has(n.imported)) { console.log(`❌ ${relative(SRC, file)} 从 '${imp.spec}' import { ${n.imported} } 但该模块无此导出`); bad++; }
    }
    if (imp.default && !vueDefault) { console.log(`❌ ${relative(SRC, file)} 从 '${imp.spec}' 默认 import 但该模块无 default 导出`); bad++; }
  }
  // ② 漏 import：用了某本地模块导出名，但本文件没 import 也没声明
  const code = stripStrings(stripComments(script)
    .replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?/gm, '')
    .replace(/^export\s*(?:\*|\{[^}]*\})\s*(?:as\s+[A-Za-z_$][\w$]*\s*)?from\s*['"][^'"]+['"];?/gm, ' ') // 再导出不是使用
    .replace(/\.\s*[A-Za-z_$][\w$]*/g, '.') // 属性访问不当使用
    .replace(/\?\.\s*[A-Za-z_$][\w$]*/g, '?.')); // 可选链属性
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
    const id = m[1];
    if (KEYWORDS.has(id) || GLOBALS.has(id) || locals.has(id)) continue;
    if (exportIndex.has(id)) {
      console.log(`❌ ${relative(SRC, file)} 用了 ${exportIndex.get(id).map((f) => relative(SRC, f)).join('/')} 导出的 ${id} 但未 import 也未本地声明`);
      bad++;
      locals.add(id); // 同文件同名字只报一次
    } else if (VUE_NAMED.has(id) && !vueProvided.has(id)) {
      // Options API 的 computed:/watch:/provide: 对象键不是使用——后跟 ':' 跳过（防误报）
      const after = code.slice(m.index + id.length).match(/^\s*(.)/);
      if (after && after[1] === ':') continue;
      console.log(`❌ ${relative(SRC, file)} 用了 vue 导出的 ${id} 但未 import（computed 漏 import → setup 抛错 → 整页绑定全灭）`);
      bad++;
      locals.add(id); // 同文件同名字只报一次
    }
  }
}
console.log(bad === 0 ? `✅ import 双向检查通过（扫描 ${files.length} 个源文件）` : `共 ${bad} 处`);
process.exit(bad === 0 ? 0 : 1);
