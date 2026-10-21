#!/usr/bin/env node
/**
 * 生成「装修组件图标」base64 内联模块（源 PNG → data URI）。
 *
 * 🔴 为什么要内联（反馈 #294：真机小程序 4 个组件图标纯白不显示）：
 *   原实现 `import iconPicture from '../../assets/comp-icons/picture.png'`，
 *   Vite 会把 PNG 打成**内容哈希产物** `/assets/picture.<hash>.png`（MP 端在主包根目录）。
 *   该路径对「包版本」强依赖：真机跑的是历史遗留包（顶层根本没有 assets/ 目录，
 *   图标还是 emoji <text> 机制），新代码里的 /assets/*.png 全部落空 → <image> 加载失败
 *   渲染纯白（实测 8649/8649 像素纯白 = 完全未加载，而非渲染错/被裁/被遮挡）。
 *   开发者工具能显示是因为它走的是当前工程目录，不受「包版本」影响。
 *
 *   内联 base64 后图标数据直接进 JS，**不依赖任何资源路径**：
 *     - MP 端：<image src="data:image/png;base64,..."> 原生支持（gen-mp-sicons.js 已验证）；
 *     - H5 端：<image src="data:..."> 原生支持，且不受 /card/ 子路径 base 影响
 *               （实测 /static/xxx.png 在 H5 部署下 404，必须走 /card/static/ 才通）；
 *     - 未来主包瘦身裁剪 assets/ 目录也不会影响图标。
 *
 * 体积：6 个 56×56 PNG 合计 11KB → base64 约 14KB（进主包 JS，可接受；
 *       主包当前 1241KB / 上限 2048KB）。
 *
 * 用法（改了图标 PNG 后需重跑）：
 *   node web-app/scripts/gen-comp-icons-base64.js
 * 生成物：web-app/src/utils/compIconsBase64.js（**入库**，不参与构建期生成，
 *         故不涉及 git checkout 还原那套流程）
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SRC_DIR = path.join(root, 'src', 'assets', 'comp-icons');
const OUT_FILE = path.join(root, 'src', 'utils', 'compIconsBase64.js');

/** 组件类型 → PNG 文件名（与 web-admin componentRegistry 的 COMP_ICONS 对应关系一致） */
const ICON_FILES = {
  picture: 'picture.png',
  channelVideo: 'channelvideo.png',
  notice: 'notice.png',
  menu: 'menu.png',
  richtext: 'richtext.png',
  line: 'line.png',
};

if (!fs.existsSync(SRC_DIR)) {
  console.error(`[gen-comp-icons-base64] 源目录不存在: ${SRC_DIR}`);
  process.exit(1);
}

const entries = [];
for (const [key, file] of Object.entries(ICON_FILES)) {
  const abs = path.join(SRC_DIR, file);
  if (!fs.existsSync(abs)) {
    console.error(`[gen-comp-icons-base64] 缺少源文件: ${abs}`);
    process.exit(1);
  }
  const b64 = fs.readFileSync(abs).toString('base64');
  entries.push({ key, file, b64, bytes: fs.statSync(abs).size });
}

const header = `/**
 * 装修组件图标 · base64 内联（**自动生成，勿手改**）
 *
 * 生成命令：node web-app/scripts/gen-comp-icons-base64.js
 * 源目录：web-app/src/assets/comp-icons/（copy from web-admin/src/assets/comp-icons）
 *
 * 🔴 为什么不用 vite import（反馈 #294 真机图标纯白）：
 *   import PNG → Vite 产物 /assets/<name>.<hash>.png，路径随构建内容变化；
 *   真机跑的包一旦是历史版本（无 assets/ 目录）该路径必然 404 → <image> 渲染纯白。
 *   base64 内联后图标数据在 JS 里，与包版本/资源目录完全解耦。
 *
 * 🔴 配套约束：cardCompRegistry.test.js 断言「移动端图标字节 === 设计中心同名 PNG 字节」，
 *   换图标时必须重跑生成脚本，否则单测会红。
 */
`;

const body = entries
  .map((e) => `/** ${e.file}（${e.bytes} B → base64 ${e.b64.length} B） */\nexport const COMP_ICON_${e.key.replace(/([A-Z])/g, '_$1').toUpperCase()} =\n  'data:image/png;base64,${e.b64}';`)
  .join('\n\n');

const nameMap = entries
  .map((e) => `  ${e.key}: '${e.file}',`)
  .join('\n');

const fileMap = entries
  .map((e) => `  ${e.key}: COMP_ICON_${e.key.replace(/([A-Z])/g, '_$1').toUpperCase()},`)
  .join('\n');

const out = `${header}
${body}

/** 组件类型 → 源 PNG 文件名（一致性单测用它定位设计中心同名 PNG 做字节比对） */
export const COMP_ICON_SOURCE_NAME = {
${nameMap}
};

/** 组件类型 → base64 data URI */
export const COMP_ICON_DATA_URI = {
${fileMap}
};
`;

fs.writeFileSync(OUT_FILE, out, 'utf-8');
console.log(
  `[gen-comp-icons-base64] 已生成 ${path.relative(root, OUT_FILE)}（${entries.length} 个图标，${out.length} 字节）`
);
