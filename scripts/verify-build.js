#!/usr/bin/env node
/**
 * 构建产物验证脚本
 * 用法：npm run verify
 */
const fs = require('fs');
const path = require('path');

const adminDist = path.join(__dirname, '..', 'server', 'public', 'admin');
const errors = [];
const warnings = [];

function check(condition, message, isWarning = false) {
  if (!condition) {
    if (isWarning) warnings.push(message);
    else errors.push(message);
  }
}

// 1. 检查HTML文件存在
const adminHtml = path.join(adminDist, 'admin.html');
const customerHtml = path.join(adminDist, 'customer.html');
check(fs.existsSync(adminHtml), '❌ admin.html 不存在');
check(fs.existsSync(customerHtml), '❌ customer.html 不存在');

// 2. 检查HTML引用的JS文件存在
function extractAssets(htmlPath) {
  if (!fs.existsSync(htmlPath)) return [];
  const content = fs.readFileSync(htmlPath, 'utf-8');
  const jsFiles = [...content.matchAll(/src="\/admin-assets\/assets\/([^"]+\.js)"/g)].map(m => m[1]);
  const cssFiles = [...content.matchAll(/href="\/admin-assets\/assets\/([^"]+\.css)"/g)].map(m => m[1]);
  return [...jsFiles, ...cssFiles];
}

const adminAssets = extractAssets(adminHtml);
const customerAssets = extractAssets(customerHtml);

for (const asset of [...adminAssets, ...customerAssets]) {
  const assetPath = path.join(adminDist, 'assets', asset);
  check(fs.existsSync(assetPath), `❌ HTML引用的资源不存在: ${asset}`);
}

// 3. 检查关键功能代码存在
function findChunkContaining(keyword) {
  const assetsDir = path.join(adminDist, 'assets');
  if (!fs.existsSync(assetsDir)) return null;
  const files = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(assetsDir, file), 'utf-8');
    if (content.includes(keyword)) return file;
  }
  return null;
}

const channelChunk = findChunkContaining('全端渠道');
check(channelChunk !== null, '❌ 构建产物中未找到"全端渠道"代码');

const miniChunk = findChunkContaining('ChannelMini');
check(miniChunk !== null, '❌ 构建产物中未找到小程序管理代码');

// 4. 检查构建产物数量合理（vite会为总后台和客户后台分别打包同名组件，这是正常的）
const assetsDir = path.join(adminDist, 'assets');
if (fs.existsSync(assetsDir)) {
  const fileCount = fs.readdirSync(assetsDir).length;
  check(fileCount > 0, '❌ assets目录为空');
  check(fileCount < 100, `⚠️  assets文件过多(${fileCount})，可能有旧构建残留`, true);
}

// 5. 检查移动端 H5 产物（card/mall 独立托管目录，由 scripts/sync-mobile-dist.mjs 双份同步）
for (const name of ['card', 'mall']) {
  const dist = path.join(__dirname, '..', 'server', 'public', name);
  const html = path.join(dist, 'index.html');
  const assets = path.join(dist, 'assets');
  check(fs.existsSync(html), `❌ ${name}/index.html 不存在（未同步 H5 产物）`);
  if (fs.existsSync(html)) {
    const content = fs.readFileSync(html, 'utf-8');
    const refs = [...content.matchAll(/(?:src|href)="\.\/assets\/([^"]+)"/g)].map((m) => m[1]);
    for (const asset of refs) {
      check(fs.existsSync(path.join(assets, asset)), `❌ ${name}/index.html 引用的资源不存在: ${asset}`);
    }
    check(refs.length > 0, `⚠️  ${name}/index.html 未引用任何 ./assets/ 资源（相对路径异常）`, true);
  }
  check(fs.existsSync(assets) && fs.readdirSync(assets).length > 0, `❌ ${name}/assets 为空`);
}

// 输出结果
console.log('\n=== 构建产物验证 ===\n');

if (warnings.length > 0) {
  warnings.forEach(w => console.log(w));
  console.log('');
}

if (errors.length > 0) {
  errors.forEach(e => console.log(e));
  console.log(`\n❌ 验证失败: ${errors.length} 个错误\n`);
  process.exit(1);
} else {
  console.log('✅ HTML文件存在');
  console.log('✅ 所有引用资源存在');
  console.log(`✅ 关键功能代码存在 (全端渠道: ${channelChunk})`);
  console.log(`✅ 小程序管理代码存在 (${miniChunk})`);
  console.log('✅ card/mall 独立 H5 产物存在且资源完整');
  if (warnings.length === 0) console.log('✅ 无重复旧版本');
  console.log('\n✅ 构建验证通过\n');
}
