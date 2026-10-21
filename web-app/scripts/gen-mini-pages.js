#!/usr/bin/env node
/**
 * 生成「小程序内部页面清单」（web-app/src/utils/miniPages.js 的 MINI_PAGES 部分）
 *
 * 🔴 反馈 #298：按钮组件要支持跳转外部小程序，默认仍是内部链接；
 *   内部链接需要移动端可视化页面选择框 → 必须有一份**可信的页面清单**。
 *   清单从 src/pages.json 解析（唯一事实来源），不手写 → 加页面后重跑本脚本即可，不会漂移。
 *
 * 为什么要脚本生成而不是直接 import pages.json：
 *   pages.json 是 **JSONC**（uni-app 允许注释），Vite 直接 import 会 JSON parse 失败；
 *   且小程序构建会把 pages.json 特殊处理。→ 构建期解析 + 产出纯 JS 静态清单最稳。
 *
 * 用法：node web-app/scripts/gen-mini-pages.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const PAGES_JSON = path.join(root, 'src', 'pages.json');
const OUT_FILE = path.join(root, 'src', 'utils', 'miniPages.js');

/** 剥掉 JSONC 注释（注意不能破坏字符串里的 // 与 /*） */
function stripJsonComments(src) {
  let out = '';
  let inStr = false;
  let quote = '';
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (inLine) {
      if (c === '\n') { inLine = false; out += c; }
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') { inBlock = false; i++; }
      continue;
    }
    if (inStr) {
      out += c;
      if (c === '\\') { out += n || ''; i++; continue; }
      if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; quote = c; out += c; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    out += c;
  }
  return out;
}

if (!fs.existsSync(PAGES_JSON)) {
  console.error(`[gen-mini-pages] 找不到 ${PAGES_JSON}`);
  process.exit(1);
}

const raw = fs.readFileSync(PAGES_JSON, 'utf-8');
let json;
try {
  json = JSON.parse(stripJsonComments(raw));
} catch (e) {
  console.error(`[gen-mini-pages] pages.json 解析失败: ${e.message}`);
  process.exit(1);
}

/** 路径 → 分组 key（按路径前缀判定，与用户认知一致） */
function groupOf(p) {
  // ⚠️ 入参带前导斜杠（withSlash），故前缀判定要带斜杠，否则全落 other
  const s = p.replace(/^\//, '');
  if (s.startsWith('pages/card') || s.startsWith('pages/cardMain')) return 'card';
  if (s.startsWith('pages/mall')) return 'mall';
  if (s.startsWith('pages/panorama')) return 'panorama';
  return 'other';
}

const pages = [];
const seen = new Set();

function push(fullPath, title) {
  if (!fullPath) return;
  // 主包 path 已含完整前缀；分包需拼 root
  const withSlash = fullPath.startsWith('/') ? fullPath : '/' + fullPath;
  if (seen.has(withSlash)) return;
  seen.add(withSlash);
  pages.push({
    path: withSlash,
    title: String(title || withSlash.split('/').pop() || '').trim() || withSlash,
    group: groupOf(withSlash),
  });
}

for (const p of json.pages || []) {
  const title = (p.style && p.style.navigationBarTitleText) || '';
  push(p.path, title);
}
for (const sp of json.subPackages || []) {
  for (const p of sp.pages || []) {
    const title = (p.style && p.style.navigationBarTitleText) || '';
    push(`${sp.root}/${p.path}`, title);
  }
}

// 按分组 + 标题排序，输出稳定（避免每次生成顺序抖动导致 diff 噪音）
const order = { card: 0, mall: 1, panorama: 2, other: 3 };
pages.sort((a, b) => (order[a.group] - order[b.group]) || a.title.localeCompare(b.title, 'zh-Hans-CN'));

const body = pages
  .map((p) => `  { path: '${p.path}', title: '${p.title.replace(/'/g, "\\'")}', group: '${p.group}' },`)
  .join('\n');

const out = `/**
 * 小程序内部页面清单（供移动端装修页「跳转 → 内部页面」选择框使用）
 *
 * 🔴 反馈 #298：按钮组件要支持「跳转外部小程序」，默认仍是内部链接；
 *   内部链接需要一个**可视化页面选择框**（参考后台链接选择器，但按手机交互重做）。
 *
 * 数据来源：直接读 src/pages.json（uni-app 的页面清单，**唯一事实来源**，
 *   不另维护一份手写清单 → 不会出现「加了页面但清单没同步」的漂移）。
 *
 * ⚠️ pages.json 含 subPackages（分包），主包页面的 path 是完整路径（如 pages/card/market），
 *   分包页面需拼成 \`root + '/' + path\`（如 pages/mall/index）→ 本清单统一补前导斜杠，
 *   可直接喂给 uni.navigateTo({ url })。
 *
 * ⚠️ 本文件是**生成物**，勿手改；新增页面后重跑：
 *     node web-app/scripts/gen-mini-pages.js
 */

/** 页面分组（用于移动端选择框的分类展示） */
export const MINI_PAGE_GROUPS = [
  { key: 'card', name: '名片' },
  { key: 'mall', name: '商城' },
  { key: 'panorama', name: '全景' },
  { key: 'other', name: '其他' },
];

/**
 * 页面清单：{ path: '/pages/card/market', title: '集市', group: 'card' }
 * path 带前导斜杠，可直接喂给 uni.navigateTo({ url })
 */
export const MINI_PAGES = [
${body}
];

/** 按关键词搜索页面（标题或路径命中） */
export function searchMiniPages(keyword) {
  const k = String(keyword || '').trim().toLowerCase();
  if (!k) return MINI_PAGES;
  return MINI_PAGES.filter(
    (p) => p.title.toLowerCase().includes(k) || p.path.toLowerCase().includes(k)
  );
}

/** 取某分组下的页面 */
export function miniPagesByGroup(group) {
  return MINI_PAGES.filter((p) => p.group === group);
}

/** 按 path 反查标题（装修页回显用） */
export function miniPageTitle(path) {
  const p = MINI_PAGES.find((x) => x.path === path);
  return p ? p.title : '';
}
`;

fs.writeFileSync(OUT_FILE, out, 'utf-8');
console.log(`[gen-mini-pages] 已生成 ${path.relative(root, OUT_FILE)}（${pages.length} 个页面）`);
