#!/usr/bin/env node
/**
 * 编辑器组件数据源检查脚本
 * 每次改完 ComponentRender.vue 后必须跑，有输出就不许说"完成"
 * 用法: node scripts/check-editor-components.mjs
 * 规则：
 *  R1 数据组件必须有模板渲染分支（comp.type === 'x'）
 *  R2 数据组件对应 ref 必须声明（const xxx = ref(...)）
 *  R3 数据组件 ref 必须有 fetch 赋值（.value = 写入）
 *  R4 模板分支必须引用对应 ref（防止"分支写了但用的假数据"）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RENDER = path.join(ROOT, 'web-admin/src/views/customer/apps/design/ComponentRender.vue');

// 数据组件 → 对应数据 ref
// 注：goods-show / goods-featured 为海报型（配置驱动，C 端模板亦不渲染商品列表），不在此列
const DATA_COMPS = {
  'goods-group': ['mallGoods'],
  'goods-all': ['mallAllGoods'],
  'goods-rank': ['rankGoods'],
  'goods-like': ['likeGoods'],
  'goods-swiper': ['swiperGoods'],
  'goods-tabs': ['tabGoods'],
  'pano-scenes': ['panoPlans'],
  'article-list': ['contentArticles'],
  'pic-list': ['contentPics'],
  'video-list': ['contentVideos'],
};

let src;
try {
  src = fs.readFileSync(RENDER, 'utf8');
} catch (e) {
  console.error(`[check-editor-components] 读取失败: ${RENDER}\n${e.message}`);
  process.exit(1);
}

const issues = [];
const refAssignRe = (name) => new RegExp(`${name}\\.value(\\[[^\\]]+\\])?\\s*=\\s*(await\\s+)?(res\\.|data\\.|list|Array\\.isArray|\\[|\\{\\}|fetch\\w*\\()`);

for (const [type, refs] of Object.entries(DATA_COMPS)) {
  // R1 模板分支
  const branchRe = new RegExp(`comp\\.type\\s*===\\s*'${type}'`);
  if (!branchRe.test(src)) {
    issues.push(`[${type}] 无模板渲染分支（comp.type === '${type}' 缺失）`);
    continue;
  }
  for (const ref of refs) {
    // R2 ref 声明
    const declRe = new RegExp(`const\\s+${ref}\\s*=\\s*ref\\(`);
    if (!declRe.test(src)) {
      issues.push(`[${type}] 数据 ref '${ref}' 未声明`);
      continue;
    }
    // R3 fetch 赋值
    if (!refAssignRe(ref).test(src)) {
      issues.push(`[${type}] 数据 ref '${ref}' 无 fetch 赋值（.value = 写入缺失，可能是占位假数据）`);
      continue;
    }
    // R4 模板引用（分支片段内必须出现 ref）
    const m = src.match(branchRe);
    const segStart = m.index;
    const seg = src.slice(segStart, segStart + 2600);
    if (!new RegExp(`\\b${ref}\\b`).test(seg)) {
      issues.push(`[${type}] 分支未引用数据 ref '${ref}'（渲染可能用了假数据）`);
    }
  }
}

if (issues.length) {
  console.error(`\n[check-editor-components] 数据组件检查失败，共 ${issues.length} 项：\n`);
  issues.forEach((x) => console.error(`  ${x}`));
  console.error('\n请修复后再交付。');
  process.exit(1);
} else {
  console.log(`[check-editor-components] OK：${Object.keys(DATA_COMPS).length} 个数据组件均有真实数据源`);
}
