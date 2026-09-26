#!/usr/bin/env node
/**
 * H5 产物同步脚本：web-app/dist/build/h5 → server/public/{card,mall}
 *
 * - 先删再拷（旧 chunk 残留会污染验证），assets/index.html/static 分目录处理
 * - card/mall 当前共用 uni 整包产物：vite base='./' 相对路径，同一份产物在
 *   /card 与 /mall 两个前缀下均正确加载（index.html 引用 ./assets/xxx.js）
 * - mall 为商城 C 端独立托管目录（app.js mallDist 指向 server/public/mall），
 *   未来如需差异化裁剪/配置，只需改本脚本的拷贝源或按目标定制
 *
 * 用法：npm run build:mobile（构建 + 同步）或单独 node scripts/sync-mobile-dist.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'web-app', 'dist', 'build', 'h5');
const targets = ['card', 'mall'];

if (!fs.existsSync(path.join(srcDir, 'index.html'))) {
  console.error(`❌ H5 产物不存在: ${srcDir}`);
  console.error('   请先执行 npm run build:h5 -w web-app 或 npm run build:mobile');
  process.exit(1);
}

for (const name of targets) {
  const distDir = path.join(root, 'server', 'public', name);
  fs.rmSync(path.join(distDir, 'assets'), { recursive: true, force: true });
  fs.rmSync(path.join(distDir, 'static'), { recursive: true, force: true });
  fs.rmSync(path.join(distDir, 'index.html'), { force: true });
  fs.mkdirSync(distDir, { recursive: true });

  fs.copyFileSync(path.join(srcDir, 'index.html'), path.join(distDir, 'index.html'));
  for (const sub of ['assets', 'static']) {
    const s = path.join(srcDir, sub);
    if (fs.existsSync(s)) fs.cpSync(s, path.join(distDir, sub), { recursive: true });
  }
  console.log(`✅ 已同步 → server/public/${name}`);
}
