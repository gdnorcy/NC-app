/**
 * 本轮（#236/#237）几何实测：视频号添加弹窗 + 编辑名片单页平铺（2026-10-19）
 *
 * 为什么必须实测：本轮改的全是「单测查不到」的视觉几何——
 *   ① 解析按钮与输入框的间距（间距塌了单测照样绿）
 *   ② 弹窗在 82vh 高度下保存条 sticky 吸底是否真可见（滚到底才有意义）
 *   ③ 编辑态 create 四张卡片是否真的平铺（.card:not(.active){display:none} 靠 class 绑定控制）
 *   ④ profile「编辑名片」是否真带 id 进编辑态（不带 id 就是新建=分三步）
 * 纪律：CSS 几何必须无头实测，单测全绿≠视觉正确（已踩坑五次）。
 *
 * 依赖：本地服务 http://localhost:3000，agent-browser 会话已登录（名片主人）。
 * 🔴 uni.getStorageSync 读对象要 {type,data} 包装，裸 JSON 读出来是 undefined。
 * 🔴 uni H5 同一路径换 query **不重新 onLoad**，带 query 进不同页后必须 reload。
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const NODE = '/Users/linping/.workbuddy/binaries/node/versions/22.22.2-6/bin/node';
const AB = '/Users/linping/.workbuddy/binaries/node/workspace/node_modules/.bin/agent-browser';

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });
const ab = (args) => sh(AB, args, { stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => execFileSync('sleep', [String(ms / 1000)]);

// 登录态注入（与 walk-card-actions.mjs login() 同款）：
// 🔴 card_token 写**裸字符串**，card_user 才用 {type:'object',data:{...}} 包装——
//    给 token 也包 type 会被当对象读出，登录态失效、页面全部弹回登录页（17 项全红的假失败）。
// 🔴 card_user 的对象形状须与后端 /user/profile 一致（id/name），少字段会导致昵称空。
// 已用 curl 验证过：Bearer eyJ1aWQiOjE1fQ== → uid=15「陈晨」，/api/card/cards 返回其名片 id=12。
// 🔴 勿用模板串拼 base64 token（上一版少一个 $，渲染成 uid=9，服务端直接 token无效）。
//    换用户时从这里复制对应值并先 curl 验证。
const TOKEN_UID15 = 'eyJ1aWQiOjE1fQ==';

function loginJs(uid, name) {
  const token = uid === 15 ? TOKEN_UID15 : TOKEN_UID15;
  return `(() => {
  localStorage.setItem('card_token', ${JSON.stringify(token)});
  localStorage.setItem('card_user', JSON.stringify({ type: 'object', data: { id: ${uid}, name: ${JSON.stringify(name)} } }));
  return { ok: true };
})()`;
}

function evalJs(js) {
  const out = ab(['eval', '-b', Buffer.from(js, 'utf8').toString('base64')]);
  // 🔴 返回值可能是标量（true / "str" / 123），不能只找 '{' 起解析——上一版
  //    evalJs('return true') 因 indexOf('{')<0 静默返回 null，导致「切到链接模式」
  //    这类动作被判成没执行、几何断言跟着假失败。这里统一 JSON.parse，非 JSON 返回原文。
  const raw = String(out).trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* fallthrough */ }
  const i = raw.indexOf('{');
  if (i >= 0) { try { return JSON.parse(raw.slice(i)); } catch { /* fallthrough */ } }
  const j = raw.indexOf('"');
  if (j >= 0) { try { return JSON.parse(raw.slice(j)); } catch { /* fallthrough */ } }
  return raw;
}

const fails = [];
function check(name, cond, detail) {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) fails.push(name);
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
}

// 🔴 注入时机：必须在 open 之后。登录页 onLoad/onShow 检测到无凭证会「清登录态并弹登录」，
//    若在 open 之前注入，这段逻辑会把它清掉（实测 storage 变 null、页面停在 login）。
// 🔴 导航方式：必须用**同页改 hash**（eval 里 location.hash=...），不能用 ab open 目标 URL。
//    ab open 会起新导航上下文，实测把已注入的 localStorage 弄丢 → 页面又回 login，17 项全红的假失败。
function injectLogin(uid = 15, name = '陈晨') {
  ab(['open', 'http://localhost:3000/card/']);
  sleep(1500);
  if (process.env.WALK_DEBUG) console.log('  [dbg] js =', loginJs(uid, name).replace(/\n/g, ' '));
  const r = evalJs(loginJs(uid, name));
  const after = evalJs(`(() => ({
    t: localStorage.getItem('card_token') || null,
    u: !!localStorage.getItem('card_user'),
  }))()`);
  if (!after || !after.t || !after.u) {
    console.log(`  [ABORT] 登录态注入失败（${JSON.stringify(r)} → ${JSON.stringify(after)}）`);
    process.exit(2);
  }
}

// 同页跳转（保 storage）。🔴 **不要 reload**：uni H5 reload 会重跑首页冷启动联动，
// 实测 reload 后页面回到「未找到你的名片」态（videosEdit 的 resolveCardId 兜底失效）。
// 同页改 hash 由 uni 路由接管，onLoad 会正常触发。
function gotoHash(hash) {
  evalJs(`(() => { location.hash = ${JSON.stringify(hash)}; return true; })()`);
  sleep(2800);
}

injectLogin();
ab(['set', 'viewport', '390', '844', '2']);

// ============================================================
console.log('\n=== A. 视频号添加弹窗（videosEdit） ===');
gotoHash('#/pages/card/videosEdit');

const pageState = evalJs(`(() => {
  const q = (s) => document.querySelector(s);
  return {
    url: location.hash,
    hasPage: !!q('.wk-page'),
    title: (q('.pg-err-text') || {}).textContent || '',
    addBtn: !!q('.wk-add'),
  };
})()`);
// 🔴 登录态失效时全页跳 `#/?manual=1&redirect=...`，此时所有选择器都为空 → 报成「页面没渲染」
//    这种假失败。先断言没被踢到登录页，后面的失败才是真回归。
const kicked = /manual=1/.test((pageState && pageState.url) || '') || /\/login/.test((pageState && pageState.url) || '');
if (kicked) {
  console.log('  [ABORT] 登录态失效，已被踢回登录页 —— 请修正 loginJs() 后重跑');
  process.exit(2);
}
check('videosEdit 页可渲染', pageState && pageState.hasPage, JSON.stringify(pageState));
check('非错误页（已找到名片）', pageState && pageState.title === '', `错误文案=${pageState && pageState.title}`);

// 打开添加弹窗
evalJs(`(() => { const b = document.querySelector('.wk-add'); if (b) b.click(); return !!b; })()`);
sleep(600);

const popup = evalJs(`(() => {
  const q = (s) => document.querySelector(s);
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) }; };
  const modeItems = [...document.querySelectorAll('.wk-mode-item')].map((e) => e.textContent.trim());
  return {
    popup: box(q('.wk-popup')),
    modeItems,
    // 默认应落在「填写视频号 ID」
    defaultMode: modeItems.findIndex((t) => /填写视频号 ID/.test(t)) === 0
      && q('.wk-mode-item') && q('.wk-mode-item').classList.contains('on'),
    finderInput: box(q('.wk-id-input')),
    hint: (q('.wk-hint-t') || {}).textContent || '',
    prev: box(q('.wk-prev')),
    btns: box(q('.wk-pop-btns')),
    agree: box(q('.wk-agree')),
  };
})()`);
check('弹窗已打开', popup && popup.popup && popup.popup.h > 0, popup && JSON.stringify(popup.popup));
check('默认模式是「填写视频号 ID」', !!(popup && popup.defaultMode), `标签=${popup && JSON.stringify(popup.modeItems)}`);
check('指引文案指向视频号助手', !!(popup && /视频号助手/.test(popup.hint)), popup && popup.hint.slice(0, 40));
check('预览卡可见', !!(popup && popup.prev && popup.prev.h > 0));

// 保存条 sticky：滚到弹窗底部，看保存条是否仍在视口内
const sticky = evalJs(`(() => {
  const p = document.querySelector('.wk-popup');
  const b = document.querySelector('.wk-pop-btns');
  if (!p || !b) return null;
  p.scrollTop = p.scrollHeight;           // 滚到底 = 最容易「找不到保存按钮」的场景
  const pr = p.getBoundingClientRect();
  const br = b.getBoundingClientRect();
  const cs = getComputedStyle(b);
  return {
    scrollable: p.scrollHeight > p.clientHeight + 2,
    sticky: cs.position,
    btnBottom: Math.round(br.bottom),
    popupBottom: Math.round(pr.bottom),
    visible: br.bottom <= pr.bottom + 2 && br.top < pr.bottom && br.top >= 0,
    text: b.textContent.trim(),
  };
})()`);
check('保存条为 sticky 吸底', sticky && sticky.sticky === 'sticky', sticky && `position=${sticky.sticky}`);
check('滚到底后保存按钮仍在弹窗内可见', !!(sticky && sticky.visible),
  sticky && `btnBottom=${sticky.btnBottom} popupBottom=${sticky.popupBottom} 可滚动=${sticky.scrollable}`);
check('按钮文案直说「保存到名片」', !!(sticky && /保存到名片/.test(sticky.text)), sticky && sticky.text);

// 切到「粘贴链接」模式，验证间距 + 警示
const linkMode = evalJs(`(() => {
  const items = [...document.querySelectorAll('.wk-mode-item')];
  const link = items.find((e) => /粘贴链接/.test(e.textContent));
  if (!link) return null;
  link.click();
  return true;
})()`);
sleep(500);
const linkState = evalJs(`(() => {
  const q = (s) => document.querySelector(s);
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; };
  const ta = box(q('.wk-link-input'));
  const row = box(q('.wk-parse-row'));
  return {
    ta, row,
    gap: ta && row ? row.top - ta.bottom : null,
    warn: (q('.wk-hint--warn .wk-hint-t') || {}).textContent || '',
    hasHelp: !!q('.wk-parse-row .wk-help-btn'),
  };
})()`);
check('链接模式有警示条', !!(linkState && /加密/.test(linkState.warn)), linkState && linkState.warn.slice(0, 50));
check('解析按钮右侧有「说明」按钮', !!(linkState && linkState.hasHelp));
// 24rpx 在 390px 视口下 ≈ 12.5px（H5 端 rpx 按屏宽换算，非 2 倍）
if (process.env.WALK_DEBUG) console.log('  [dbg] linkState =', JSON.stringify(linkState));
check('① 解析按钮与输入框有间距（>=20rpx ≈ 10px）', !!(linkMode && linkState && linkState.gap >= 10), linkState && `gap=${linkState.gap}px（CSS 声明 24rpx）`);

// ============================================================
console.log('\n=== B. 编辑名片单页平铺（create 编辑态） ===');
// 先查本人名片 id
const cardId = (() => {
  const out = sh(NODE, ['-e', `
try {
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('server/data/panorama.db');
db.exec('PRAGMA busy_timeout=3000');
const r=db.prepare('SELECT id FROM card_profile WHERE user_id=?').get(15);
console.log(JSON.stringify(r||{}));
db.close();
} catch (e) { console.error('DBERR:'+e.message); process.exit(3); }`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.trim()).id;
})();
console.log(`  名片 id = ${cardId}`);

gotoHash(`#/pages/card/create?id=${cardId}`);

const editState = evalJs(`(() => {
  const q = (s) => document.querySelector(s);
  const cards = [...document.querySelectorAll('.card')];
  const stepNum = q('.stepnum');
  return {
    title: (q('.title') || {}).textContent || '',
    cardCount: cards.length,
    visibleCards: cards.filter((c) => c.getBoundingClientRect().height > 0).length,
    stepnumVisible: stepNum ? stepNum.getBoundingClientRect().height > 0 : false,
    btnTexts: [...document.querySelectorAll('.footer .btn-primary')].map((e) => e.textContent.trim()),
    // 🔴 用 .footer 的直接子元素计数：uni H5 把 <button> 编译成 <uni-button>，
    //    querySelectorAll('button') 恒 0 → 会把「只有一个保存按钮」误判成「没有按钮」
    btnCount: document.querySelector('.footer').children.length,
    hasNext: /下一步/.test(document.querySelector('.footer')?.textContent || ''),
    minH: Math.min(...cards.map((c) => Math.round(c.getBoundingClientRect().height))),
  };
})()`);
check('进入编辑态（标题=编辑名片）', editState && /编辑名片/.test(editState.title), editState && editState.title);
check('④ 四张卡片全部平铺可见', editState && editState.cardCount === 4 && editState.visibleCards === 4,
  editState && `${editState.visibleCards}/${editState.cardCount} 张可见`);
check('编辑态不显示「x / 3」步骤指示器', editState && editState.stepnumVisible === false);
check('底部只有「保存修改」，无翻页按钮', editState && editState.btnCount === 1 && !editState.hasNext
  && /保存修改/.test(editState.btnTexts[0] || ''),
  editState && `按钮=${JSON.stringify(editState.btnTexts)} 共${editState.btnCount}个`);
check('卡片高度合理（无 640rpx 空白撑高）', editState && editState.minH > 60 && editState.minH < 500, editState && `最矮卡 ${editState.minH}px`);

// ============================================================
console.log('\n=== C. profile「编辑名片」入口带 id ===');
gotoHash('#/pages/card/profile');
const profileState = evalJs(`(() => {
  const items = [...document.querySelectorAll('.menu-item')];
  const item = items.find((e) => /编辑名片/.test(e.textContent));
  if (!item) return null;
  item.click();
  return true;
})()`);
sleep(1500);
const afterClick = evalJs(`(() => ({
  hash: location.hash,
  title: (document.querySelector('.title') || {}).textContent || '',
  stepnum: !!document.querySelector('.stepnum'),
}))()`);
check('点「编辑名片」跳到带 id 的 create', !!(afterClick && afterClick.hash.includes('/pages/card/create?id=')), afterClick && afterClick.hash);
check('跳转后是编辑态而非新建向导', !!(afterClick && /编辑名片/.test(afterClick.title) && !afterClick.stepnum),
  afterClick && `标题=${afterClick.title} 有步骤条=${afterClick.stepnum}`);

// ============================================================
console.log(`\n=== 结果：${fails.length === 0 ? '全部通过 ✅' : `${fails.length} 项失败 ❌`} ===`);
if (fails.length) fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
