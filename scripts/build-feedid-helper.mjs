/**
 * 由 scripts/wx-channels-extractor.js（唯一来源）生成两种交付形态：
 *   ① 油猴脚本  docs/feedid-helper.user.js   —— @match channels.weixin.qq.com，打开页面自动可用
 *   ② 书签小工具 docs/feedid-helper.html     —— 零依赖，拖到书签栏，任意浏览器点一下即用
 *
 * 🔴 单一来源：核心提取逻辑只写一份，这里只做包装。
 *    两端各写一份代码 = 必然漂移（本项目已踩过多次，见 MEMORY.md「parity 三纪律」）。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'scripts/wx-channels-extractor.js');
const DOCS = path.join(ROOT, 'docs');
fs.mkdirSync(DOCS, { recursive: true });

// 去掉 CommonJS 导出尾巴（浏览器端不需要），并剥离注释外的空行
const core = fs.readFileSync(SRC, 'utf8')
  .replace(/if \(typeof module[\s\S]*$/m, '')
  .trim();

// ============ ① 油猴脚本 ============
const userJs = `// ==UserScript==
// @name         视频号作品 ID / 封面提取（智能名片助手）
// @namespace    panorama
// @version      1.0.0
// @description  在视频号助手页面一键提取作品的 feedId 与封面，免去手工抄 ID。仅本机读取，不上传、不改写请求。
// @match        https://channels.weixin.qq.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function () {
  'use strict';
${core}

  // 页面加载完自动挂一个启动入口（不自动弹窗，避免打扰正常操作）
  function mount() {
    if (document.getElementById('wxch-launcher')) return;
    const b = document.createElement('div');
    b.id = 'wxch-launcher';
    b.textContent = '提取作品 ID';
    b.style.cssText = 'position:fixed;right:0;top:120px;z-index:2147483000;cursor:pointer;' +
      'background:#07c160;color:#fff;font:12px/1 -apple-system,"PingFang SC",sans-serif;' +
      'padding:8px 6px;border-radius:6px 0 0 6px;box-shadow:0 2px 10px rgba(0,0,0,.2)';
    b.onclick = function () { extractorMain(); };
    document.body.appendChild(b);
  }
  if (document.body) mount();
  else window.addEventListener('DOMContentLoaded', mount);
  window.WXCH_EXTRACT = extractorMain;
})();
`;
fs.writeFileSync(path.join(DOCS, 'feedid-helper.user.js'), userJs, 'utf8');

// ============ ② 书签小工具 ============
// javascript: URL 里的换行/注释会破坏 URL，先把核心压成单行并去掉 // 注释
const oneLine = core
  .split('\n')
  .map((l) => l.replace(/\s*\/\/.*$/, '').trim())
  .filter(Boolean)
  .join(' ')
  .replace(/\s+/g, ' ');
const bookmarkHref = `javascript:(function(){'use strict';${oneLine}extractorMain();})();`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>视频号作品 ID / 封面提取 · 使用说明</title>
<style>
  body { font: 14px/1.7 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
         max-width: 820px; margin: 0 auto; padding: 32px 24px 64px; color: #1d2129; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  h2 { font-size: 16px; margin: 28px 0 10px; padding-top: 14px; border-top: 1px solid #eee; }
  .sub { color: #86909c; font-size: 13px; margin-bottom: 18px; }
  .box { background: #f7f8fa; border-radius: 8px; padding: 14px 16px; margin: 10px 0; }
  .warn { background: #fff7e8; border-left: 3px solid #ff8a00; }
  .ok { background: #eaf7ee; border-left: 3px solid #07c160; }
  code { background: #f2f3f5; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
  button { font: inherit; padding: 8px 16px; border: 0; border-radius: 6px; cursor: pointer;
           background: #07c160; color: #fff; }
  button.ghost { background: #f2f3f5; color: #1d2129; }
  ol li { margin: 6px 0; }
  .bm { display: block; width: 100%; box-sizing: border-box; font-family: monospace; font-size: 11px;
        padding: 8px; border: 1px solid #e5e6eb; border-radius: 6px; background: #fff; color: #4e5969; }
</style>
</head>
<body>

<h1>视频号作品 ID / 封面提取</h1>
<div class="sub">给名片挂视频号作品时，免掉手工抄 ID 的步骤</div>

<div class="box ok">
  <strong>它做什么：</strong>在你<strong>已经登录</strong>的视频号助手页面里，读取当前页面的作品数据，
  列出每条作品的 <code>feedId</code> 和封面，点一下就复制。
</div>

<div class="box warn">
  <strong>安全边界：</strong>只在你自己的浏览器里<strong>读取</strong>页面数据并显示出来，
  <strong>不上传</strong>到任何服务器、<strong>不改写</strong>任何请求、不碰你的账号。
  和「res-downloader」那类装根证书做中间人代理的思路完全不同——不需要装证书、不需要配代理。
</div>

<h2>方式一：油猴脚本（推荐，一次安装长期可用）</h2>
<ol>
  <li>浏览器装 <strong>Tampermonkey</strong>（油猴）扩展：Chrome / Edge 应用商店搜 "Tampermonkey"</li>
  <li>点扩展图标 → 创建/导入新脚本 → 把 <code>feedid-helper.user.js</code> 内容粘进去并保存</li>
  <li>打开 <code>channels.weixin.qq.com</code> 并登录，页面右侧会出现绿色「提取作品 ID」按钮，点它</li>
</ol>

<h2>方式二：书签小工具（零依赖，任意浏览器）</h2>
<ol>
  <li>点下面按钮复制代码</li>
  <li>在书签栏<span style="color:#86909c">（Ctrl/⌘ + Shift + B 可显示）</span>右键 → 添加网页/书签</li>
  <li>名称随便起（如「提取作品ID」），<strong>网址栏粘贴刚才复制的代码</strong></li>
  <li>登录视频号助手后，点一下这个书签</li>
</ol>

<button onclick="copyBm()">复制书签代码</button>
<span id="tip" style="margin-left:10px;color:#07c160"></span>
<textarea class="bm" id="bm" rows="3" readonly style="margin-top:10px">${bookmarkHref.replace(/</g, '&lt;')}</textarea>

<h2>怎么用</h2>
<ol>
  <li>电脑浏览器打开 <code>https://channels.weixin.qq.com</code>，扫码登录（必须是该视频号的管理员）</li>
  <li>进入<strong>内容管理</strong>的作品列表，如果数据没自动出来，<strong>滚动一下列表或翻页</strong>（让列表接口跑一次）</li>
  <li>面板会列出作品：封面缩略图 + 标题 + feedId，点「复制 feedId」</li>
  <li>视频号ID（<code>sph</code> 开头）在助手<strong>首页</strong>顶部能看到，复制到名片的第一个输入框</li>
</ol>

<h2>如果没抓到</h2>
<ul>
  <li>先点面板上的<strong>「重新扫描页面」</strong>，再滚动列表让它刷一次接口</li>
  <li>确认登录的是<strong>该视频号的管理员微信</strong>（运营者需管理员先授权）</li>
  <li>面板底部会显示「已扫描对象数 / 接口次数」——把这两个数字和截图反馈过来，
      就能按真实页面结构补上对应提取路径（视频号页面结构会随版本变化，本工具做了三条兜底路径）</li>
</ul>

<div class="box" style="color:#86909c;font-size:12px">
  注：本工具只是<strong>省掉抄 ID 的手工活</strong>，不改变数据来源——feedId 与视频号ID 的合规来源仍然是
  微信官方的视频号助手。微信未开放「由分享短链反查 feedId」的接口（weixin.qq.com/sph/ 是加密路由短链），
  服务端无法解析，所以这一步必须由用户在自己登录态下完成。
</div>

<script>
function copyBm() {
  var t = document.getElementById('bm');
  t.select();
  try { document.execCommand('copy'); } catch (e) {}
  var tip = document.getElementById('tip');
  tip.textContent = '已复制 ✓ 去书签栏新建书签，粘贴到「网址」栏';
  setTimeout(function () { tip.textContent = ''; }, 4000);
}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(DOCS, 'feedid-helper.html'), html, 'utf8');

console.log('✅ 已生成（来源 scripts/wx-channels-extractor.js）：');
console.log('   docs/feedid-helper.user.js   ', userJs.length, 'B');
console.log('   docs/feedid-helper.html      ', html.length, 'B');
console.log('   书签 URL 长度:', bookmarkHref.length, '字符');
