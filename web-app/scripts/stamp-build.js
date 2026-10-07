#!/usr/bin/env node
/**
 * 构建后写「构建戳」到产物根目录：dist/build/<target>/BUILD.txt
 * 用途：真机测试时若怀疑「包不是最新的」，打开产物目录里的 BUILD.txt 就能确认时间/提交号，
 * 不必靠猜。（预览二维码本身不刷新的话，扫到的会是旧包 —— 这个戳用来对账。）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] || 'mp-weixin';
const dir = path.join(__dirname, '..', 'dist', 'build', target);
if (!fs.existsSync(dir)) { console.error('产物目录不存在：', dir); process.exit(1); }

let head = '(no git)';
try { head = execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..', '..') }).toString().trim(); } catch {}

const lines = [
  `built at : ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
  `git HEAD : ${head}`,
  `target   : ${target}`,
  '',
  '真机仍是旧包？→ 微信开发者工具里点「预览」重新生成二维码（旧二维码指向旧包）；',
  '项目目录必须是 web-app/dist/build/mp-weixin（不是 web-app 根目录）。',
];
fs.writeFileSync(path.join(dir, 'BUILD.txt'), lines.join('\n') + '\n', 'utf8');
console.log(`[stamp] ${target} → ${new Date().toLocaleString('zh-CN', { hour12: false })} @ ${head}`);
