/**
 * 组件风格（styleType）覆盖率审计
 *
 * 背景：2026-10-04 用户反馈「框内的三个风格无效」，根因是渲染端 `cs-${styleType}`
 * 只判 `=== 'line'`，box1/box2/s2/s3/slider 全落默认分支。修复时用 `styleVariant()`
 * 做了「值→语义 class」收敛，但**漏了几个组件的容器 class**（pay / realtime / 选项区 /
 * 图片左右布局 / 身份证槽），这些组件的风格卡仍是死参数，而肉眼看不出问题 ——
 * 因为「不报错，只是点了没反应」。
 *
 * 本脚本把这件事变成可机械检查：
 *   1. 从 STYLE_SCHEMA 读出所有「有风格卡」的组件类型及其全部可选值；
 *   2. 从三端渲染器源码提取每个类型实际渲染出的容器 class；
 *   3. 校验每个值经 styleVariant() 映射出的语义 class，在 C 端与预览端
 *      **都有 CSS 规则消费该组件的容器**。
 *
 * 用法：node scripts/audit-sf-style-coverage.mjs    退出码非 0 = 有死参数，必须修完再提交。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const styleSrc = read('web-app/src/utils/sfComponentStyle.js');
const cSrc = read('web-app/src/components/SuperFormRender.vue');
const pSrc = read('web-admin/src/views/customer/apps/superForm/ComponentPreview.vue');

// 语义 class 全集（与 styleVariant 的返回值保持一致）
const SEMANTIC = ['sfv-box', 'sfv-plain', 'sfv-line', 'sfv-step', 'sfv-slider'];
const OPT_SEMANTIC = ['sfx-optbox', 'sfx-optplain', 'sfx-optline'];

// ——— 1. 解析 schema：哪些组件有风格卡、可选值 ———
const boxLineTypes = [];
for (const m of styleSrc.matchAll(/^ {2}(\w+): \{ boxLine: (\[[^\]]*\]|false)/gm)) {
  if (m[2] === 'false') continue;
  boxLineTypes.push({ type: m[1], values: [...m[2].matchAll(/value:'([^']+)'/g)].map((x) => x[1]) });
}

// ——— 2. 镜像 styleVariant 的映射（改动 styleVariant 时必须同步这里）——
const OPTION_TYPES = new Set(['radio', 'checkbox']);  // select 是下拉输入框，无选项区
function styleVariant(type, st) {
  if (OPTION_TYPES.has(type)) {
    if (st === 's2') return ['sfv-plain', 'sfx-optplain'];
    if (st === 's3') return ['sfv-line', 'sfx-optline'];
    return ['sfv-box', 'sfx-optbox'];
  }
  if (type === 'number') {
    if (st === 'slider') return ['sfv-slider'];
    if (st === 'step') return ['sfv-step'];
    return ['sfv-box'];
  }
  if (st === 's1') return ['sfv-box'];
  if (st === 's2') return ['sfv-plain'];
  if (st === 's3') return ['sfv-line'];
  if (st === 'box2') return ['sfv-plain'];
  if (st === 'line') return ['sfv-line'];
  return ['sfv-box'];
}

// ——— 3. 取出「每个语义 class 覆盖了哪些容器 class」——
// 以 '}' 切块，每块 = 选择器(+多行) + 声明。用字符串包含判断，避免正则切 CSS 过于脆弱。
function buildCoverMap(src, selPrefix) {
  const style = src.slice(src.indexOf('<style'));
  const map = {}; // semantic -> Set(容器 class)
  for (const block of style.split('}')) {
    const brace = block.lastIndexOf('{');
    if (brace < 0) continue;
    const sel = block.slice(0, brace);
    const variants = new Set();
    for (const v of ['box', 'plain', 'line', 'step', 'slider']) {
      // C 端 `.sfv-box`；预览 `.cmpv.sfv-box`
      if (sel.includes(`${selPrefix}sfv-${v}`) || sel.includes(`.sfv-${v}`)) variants.add(`sfv-${v}`);
    }
    for (const v of ['optbox', 'optplain', 'optline']) {
      if (sel.includes(`.sfx-${v}`)) variants.add(`sfx-${v}`);
    }
    if (!variants.size) continue;
    // 抽该块里出现的所有子 class（形如 `.sf-xxx` / `.cmpv-xxx`）
    const targets = new Set([...sel.matchAll(/\.((?:sf|cmpv|sr)-[a-z0-9-]+)/g)].map((x) => x[1]));
    variants.forEach((v) => {
      map[v] = map[v] || new Set();
      targets.forEach((t) => map[v].add(t));
    });
  }
  return map;
}
const cCov = buildCoverMap(cSrc, '.');
const pCov = buildCoverMap(pSrc, '.cmpv.');

// ——— 4. 提取各类型实际渲染的容器 class（精确按分支截断）——
function sliceBranch(src, fromIdx) {
  const rest = src.slice(fromIdx);
  const stop = rest.search(/\n\s*(?:<view v-else-if|<template v-else-if|<view v-else\b|<template v-else\b|<input v-else-if|<view v-if=|<div v-else-if|<div v-else\b)/);
  return stop > 0 ? rest.slice(0, stop) : rest;
}
function extractCompClasses(src, prefix) {
  const out = {};
  for (const { type } of boxLineTypes) {
    const i = src.indexOf(`comp.type === '${type}'`);
    const cls = new Set();
    if (i >= 0) {
      for (const mm of sliceBranch(src, i).matchAll(/class="([^"]+)"/g)) {
        mm[1].split(/\s+/).forEach((x) => { if (x.startsWith(prefix)) cls.add(x); });
      }
    }
    out[type] = [...cls];
  }
  return out;
}
const cComps = extractCompClasses(cSrc, 'sf-');
const pComps = extractCompClasses(pSrc, 'cmpv-');

// 只看「视觉容器」，排除圆点/文字/交互子元素
const IGNORE = /(dot|circle|square|checkbox|opt-row|opt-other|other|scan|label|req|val|tip|name|price|stock|tag|cd|count|main|phone|code|btn|spec|qty|total|buy|date|agree|rate|empty|sample|camera|upload-tip|licen|h-box|thumb|fill|track|ctrl|picker|input-in|numin)/;
const isVisual = (c) => !IGNORE.test(c);

// ——— 5. 逐类型 × 逐值核对 ———
const errors = [];
console.log('组件风格（styleType）覆盖率审计 —— C 端 / 设计器预览');
console.log('='.repeat(74));
let mappings = 0;
for (const { type, values } of boxLineTypes) {
  const variants = new Set();
  values.forEach((v) => styleVariant(type, v).forEach((c) => variants.add(c)));
  // number 的 step/slider 是「换 DOM 结构」而非「改样式」（真出现滑块/步进器），
  // 不适用「CSS 是否消费容器」这套判据，单独豁免。
  const STRUCTURAL = type === 'number';
  const cVis = (cComps[type] || []).filter(isVisual);
  const pVis = (pComps[type] || []).filter(isVisual);
  const problems = [];
  for (const variant of variants) {
    mappings++;
    if (STRUCTURAL) {
      const ok = variant === 'sfv-step' || variant === 'sfv-slider';
      if (!ok) problems.push(`[${type}] ${variant} 不是已知的结构型风格`);
      continue;
    }
    const cHit = cVis.filter((c) => cCov[variant] && cCov[variant].has(c));
    const pHit = pVis.filter((c) => pCov[variant] && pCov[variant].has(c));
    if (cVis.length && !cHit.length) problems.push(`C端 ${variant} 未覆盖 ${type} 容器（${cVis.join('/') || '无'}）`);
    if (pVis.length && !pHit.length) problems.push(`预览 ${variant} 未覆盖 ${type} 容器（${pVis.join('/') || '无'}）`);
  }
  if (problems.length) {
    problems.forEach((p) => errors.push(`[${type}] ${p}`));
    console.log(`✗ ${type.padEnd(12)} ${values.join('/')} → ${[...variants].join(',')}`);
  } else {
    console.log(`✓ ${type.padEnd(12)} ${values.join('/')} → ${[...variants].join(',')}`);
  }
}

// ——— 6. 映射健全性 ———
for (const { type, values } of boxLineTypes) {
  for (const v of values) {
    for (const c of styleVariant(type, v)) {
      if (![...SEMANTIC, ...OPT_SEMANTIC].includes(c)) errors.push(`[映射] ${type}.${v} 返回未知语义 class: ${c}`);
    }
  }
  const sigs = new Set(values.map((v) => styleVariant(type, v).slice().sort().join('+')));
  if (sigs.size !== values.length) errors.push(`[映射] ${type} 各档映射有重复（视觉相同 = 死参数）`);
}

console.log('='.repeat(74));
console.log(`有风格卡组件 ${boxLineTypes.length} 类 / 可选值 ${boxLineTypes.reduce((a, t) => a + t.values.length, 0)} 个 / 语义映射 ${mappings} 个`);
if (errors.length) {
  console.log(`\n✗ ${errors.length} 处死参数（风格卡点了没反应）:`);
  errors.forEach((e) => console.log('  · ' + e));
  process.exit(1);
}
console.log('\n✓ 每个可选值在三端都有对应 CSS 规则消费其容器');
