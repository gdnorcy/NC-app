#!/usr/bin/env node
/**
 * 给「没有导航条」的页面补上统一 <PageNav>。
 *
 * 背景：pages.json 里绝大多数页面 navigationStyle:'custom'，原生标题不渲染；
 * 而这些页面既没有自绘导航，也没有状态栏占位 → 标题看不到 + 内容被胶囊压住。
 *
 * mode:
 *   'insert'  在根 view 后插入实心 PageNav（占文档流，页面内容整体下移）
 *   'overlay' 插入浮层 PageNav（absolute 覆盖，适合渐变 hero / 全屏地图等沉浸式页面）
 *   'skip'    不动（如登录页、二维码分享页等本就无导航语义）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');
const DRY = process.argv.includes('--dry');

// 标题一律对齐 pages.json 的 navigationBarTitleText，避免两处各写一份
const JOBS = [
  // ---- 沉浸式：内容顶到屏幕上方，浮层 + 白字 ----
  { f: 'pages/card/cardDetail.vue', title: '名片详情', mode: 'overlay', bg: 'transparent', color: '#ffffff' },
  { f: 'pages/card/distribution.vue', title: '分销中心', mode: 'overlay', bg: 'transparent', color: '#ffffff' },
  { f: 'pages/card/distPartner.vue', title: '合伙人分红', mode: 'overlay', bg: 'transparent', color: '#ffffff' },
  { f: 'pages/card/distShareAll.vue', title: '全民股东', mode: 'overlay', bg: 'transparent', color: '#ffffff' },
  { f: 'pages/card/distShareCat.vue', title: '类目股东', mode: 'overlay', bg: 'transparent', color: '#ffffff' },
  { f: 'pages/card/distShareArea.vue', title: '区域股东', mode: 'overlay', bg: 'transparent', color: '#ffffff' },
  { f: 'pages/card/distWallet.vue', title: '我的钱包', mode: 'overlay', bg: 'transparent', color: '#ffffff' },
  { f: 'pages/card/member.vue', title: '会员中心', mode: 'overlay', bg: 'transparent', color: '#ffffff' },
  { f: 'pages/panorama/index.vue', title: '360全景', mode: 'overlay', bg: 'transparent', color: '#ffffff' },

  // ---- 普通页：实心导航 ----
  { f: 'pages/card/visitors.vue', title: '访客雷达', mode: 'insert' },
  { f: 'pages/card/visitorTimeline.vue', title: '访客行为', mode: 'insert' },
  { f: 'pages/card/customers.vue', title: '客户管理', mode: 'insert' },
  { f: 'pages/card/customerDetail.vue', title: '客户详情', mode: 'insert' },
  { f: 'pages/card/dynamic.vue', title: '我的动态', mode: 'insert' },
  { f: 'pages/card/profile.vue', title: '个人中心', mode: 'insert' },
  { f: 'pages/superForm/fill.vue', title: '超级表单', mode: 'insert', bare: true },
];

const MARK = '<!-- PageNav -->';

const rel = (f) => '../'.repeat(f.split('/').length - 1) + 'components/PageNav.vue';

const results = [];
for (const job of JOBS) {
  const { f, title, mode, bg, color, bare } = job;
  const abs = path.join(ROOT, f);
  let src = fs.readFileSync(abs, 'utf8');

  if (src.includes(MARK)) { results.push({ f, s: 'skip(已有)' }); continue; }
  if (src.includes('PageNav')) { results.push({ f, s: 'skip(已引用)' }); continue; }

  const attrs = [`title="${title}"`, 'back'];
  if (mode === 'overlay') attrs.push('overlay', ':sticky="false"');
  if (bg) attrs.push(`bg="${bg}"`);
  if (color) attrs.push(`color="${color}"`);
  const block = `${MARK}\n<PageNav ${attrs.join(' ')} />\n`;

  if (bare) {
    // 模板根就是组件本身（薄壳页），直接前置
    const m = src.match(/<template>\n/);
    if (!m) { results.push({ f, s: 'MISS-template' }); continue; }
    src = src.replace(/<template>\n/, `<template>\n${block}`);
  } else {
    // 在根 view 开始标签的下一行插入（根 view 前可能有注释块，故不锚定 <template>）
    const m = src.match(/(<view class="[^"]+">\r?\n)/);
    if (!m) { results.push({ f, s: 'MISS-root' }); continue; }
    src = src.replace(m[1], `${m[1]}${block}`);
  }

  // 加 import
  const importLine = `import PageNav from '${rel(f)}';`;
  if (/^<script setup>\n/m.test(src)) {
    src = src.replace(/^<script setup>\n/m, `<script setup>\n${importLine}\n`);
  } else {
    const ms = src.match(/^<script>\n/m);
    if (!ms) { results.push({ f, s: 'MISS-script' }); continue; }
    src = src.replace(/^<script>\n/m, `<script>\n${importLine}\n`);
    // Options API 需要注册
    if (!/components:\s*\{/.test(src)) {
      src = src.replace(/export default \{\n/, `export default {\n  components: { PageNav },\n`);
    } else {
      src = src.replace(/(components:\s*\{)/, `$1 PageNav,`);
    }
  }

  if (!DRY) fs.writeFileSync(abs, src, 'utf8');
  results.push({ f, s: DRY ? 'dry' : 'ok' });
}

console.log(results.map((r) => `${r.s.padEnd(14)} ${r.f}`).join('\n'));
console.log(`\n合计 ${results.length}：ok=${results.filter((r) => r.s === 'ok').length}`);
console.log('未处理（需人工确认语义）：pages/cardMain/home、login、panorama/home、share/share、viewer、create');
