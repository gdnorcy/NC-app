#!/usr/bin/env node
/**
 * 自运营上传工程目录同步：web-app/dist/build/mp-weixin → server/mini-template/mp-weixin
 *
 * 用途：miniprogram-ci 上传需要一个完整的小程序工程目录（含 project.config.json）。
 * uni-app 的 mp-weixin 构建产物正好是完整工程（appid 由服务端 ci.Project 按租户注入，
 * 这里的 project.config.json 是平台 appid，不影响上传目标）。
 * 本目录在 main 上 gitignore（同 server/public 产品逻辑），deploy 分支 force-add，
 * 服务器 git pull 即得到最新工程目录，env.MP_CI_PROJECT_DIR 指向它。
 *
 * 用法：node scripts/sync-mini-template.mjs（已挂在 build:mp-weixin 末尾自动执行）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'web-app', 'dist', 'build', 'mp-weixin');
const distDir = path.join(root, 'server', 'mini-template', 'mp-weixin');

if (!fs.existsSync(path.join(srcDir, 'project.config.json'))) {
  console.error(`❌ mp-weixin 产物不存在: ${srcDir}`);
  console.error('   请先执行 npm run build:mp-weixin -w web-app');
  process.exit(1);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.cpSync(srcDir, distDir, { recursive: true });
const sizeKB = (fs.statSync(path.join(distDir, 'app.js')).size / 1024).toFixed(0);
console.log(`✅ 已同步自运营工程目录 → server/mini-template/mp-weixin（app.js ${sizeKB}KB）`);
