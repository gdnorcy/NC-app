/**
 * 操作栏 + 悬浮换模板入口 走查（2026-10-18）
 * 逐模板渲染 cardDetail，实测 .act-grid 各格子几何是否等宽等高（修「头重脚轻」）、
 *      悬浮入口是否遮挡 mp-tabs / hero / 底部 TabBar。
 * 依赖：本地服务 http://localhost:3000，agent-browser 会话已登录为名片主人 uid=15。
 * 🔴 uni.getStorageSync 读对象要 {type,data} 包装，裸 JSON 读出来是 undefined。
 * 🔴 uni H5 同一路径换 query **不重新 onLoad**，改模板后必须 reload。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const NODE = '/Users/linping/.workbuddy/binaries/node/versions/22.22.2-6/bin/node';
const AB = '/Users/linping/.workbuddy/binaries/node/workspace/node_modules/.bin/agent-browser';
const MODE = process.argv[2] === 'visitor' ? 'visitor' : 'owner';
const OUT = path.join(ROOT, 'docs/card-walk', MODE);
const CARD_ID = 12;
const CARD_UID = 15;
const TOKEN = 'eyJ1aWQiOjE1fQ==';
const ORIG_TPL = 12;
const TEMPLATES = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

fs.mkdirSync(OUT, { recursive: true });
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });
const ab = (args) => sh(AB, args, { stdio: ['ignore', 'pipe', 'pipe'] });
const sql = (stmt) => {
  const out = sh(NODE, ['-e', `
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('server/data/panorama.db');
const r=db.prepare(${JSON.stringify(stmt)}).get();
console.log(JSON.stringify(r||{}));
db.close();`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out.trim());
};
function evalJs(js) {
  const out = ab(['eval', '-b', Buffer.from(js, 'utf8').toString('base64')]);
  const i = out.indexOf('{');
  if (i < 0) return null;
  try { return JSON.parse(out.slice(i)); } catch { return null; }
}

const PROBE = `(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
  };
  const grid = document.querySelector('.act-grid');
  const items = Array.from(document.querySelectorAll('.ag-item'));
  const rects = items.map((el) => ({ ...box(el), t: (el.textContent || '').trim() }));
  const rail = document.querySelector('.float-rail');
  const tabs = document.querySelector('.mp-tabs');
  const hero = document.querySelector('.hero');
  const tabbar = document.querySelector('.mp-tabbar');
  const rr = rail && rail.getBoundingClientRect();
  const hit = (a, b) => !!(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
  return {
    vw: innerWidth, vh: innerHeight,
    grid: box(grid),
    items: rects,
    itemCount: rects.length,
    // 等高检查：所有格子高度极差
    hSpread: rects.length ? Math.max(...rects.map((r) => r.h)) - Math.min(...rects.map((r) => r.h)) : null,
    // 同排检查：第一行与第二行的 y 是否对齐（栅格换行是否整齐）
    rows: rects.reduce((acc, r) => { (acc[r.t] = acc[r.t] || []).push(r.w); return acc; }, {}),
    railHitHero: hit(rr, hero && hero.getBoundingClientRect()),
    railHitTabs: hit(rr, tabs && tabs.getBoundingClientRect()),
    railHitTabbar: hit(rr, tabbar && tabbar.getBoundingClientRect()),
    railBox: rr ? { l: Math.round(rr.left), t: Math.round(rr.top), b: Math.round(rr.bottom) } : null,
    hasPvBar: !!document.querySelector('.pv-bar'),
    railCount: document.querySelectorAll('.fr-btn').length,
    railLabel: document.querySelector('.fr-lab')?.textContent || '',
  };
})()`;

function login() {
  ab(['open', 'http://localhost:3000/card/']);
  ab(['wait', '1200']);
  if (MODE === 'visitor') {
    // 访客态：清掉登录态 → isMine=false → 操作栏显示全部 6 项（验等高栅格）
    evalJs(`(() => { localStorage.removeItem('card_token'); localStorage.removeItem('card_user'); return { ok: true }; })()`);
  } else {
    evalJs(`(() => {
      localStorage.setItem('card_token', ${JSON.stringify(TOKEN)});
      localStorage.setItem('card_user', JSON.stringify({ type: 'object', data: { id: ${CARD_UID}, name: '陈晨' } }));
      return { ok: true };
    })()`);
  }
  ab(['set', 'viewport', '390', '844', '2']);
}
async function goto(hash) {
  ab(['open', `http://localhost:3000/card/#${hash}`]);
  ab(['wait', '800']);
  ab(['reload']);
  ab(['wait', '2500']);
  const url = ab(['eval', 'location.href']).trim();
  if (!url.includes(hash.split('?')[0])) {
    ab(['open', `http://localhost:3000/card/#${hash}`]);
    ab(['wait', '2200']);
  }
  if (MODE === 'visitor') {
    evalJs(`(() => { localStorage.removeItem('card_token'); localStorage.removeItem('card_user'); return { ok: true }; })()`);
  } else {
    const ok = evalJs(`({ ok: !!localStorage.getItem('card_user') })`);
    if (!(ok && ok.ok)) login();
  }
}

const report = [];
try {
  login();
  for (const tpl of TEMPLATES) {
    sql(`UPDATE card_profile SET template_id=${tpl} WHERE id=${CARD_ID}`);
    const name = (sql(`SELECT name FROM card_templates WHERE id=${tpl}`).name) || String(tpl);
    goto(`/pages/card/cardDetail?id=${CARD_ID}`);
    const p = evalJs(PROBE);
    ab(['screenshot', path.join(OUT, `act-tpl${tpl}-${name}.png`)]);
    report.push({ tpl, name, ...p });
    console.log(`tpl${tpl} ${name}: 格数=${p.itemCount} 高度极差=${p.hSpread} 遮hero=${p.railHitHero} 遮tabs=${p.railHitTabs} 遮tabbar=${p.railHitTabbar} 悬浮丸=${p.railCount}(${p.railLabel}) 预览浮条=${p.hasPvBar}`);
  }
} finally {
  sql(`UPDATE card_profile SET template_id=${ORIG_TPL} WHERE id=${CARD_ID}`);
  ab(['close']);
}
fs.writeFileSync(path.join(OUT, 'act-report.json'), JSON.stringify(report, null, 2));
console.log(`\n===== 汇总（${MODE}）=====`);
for (const r of report) {
  console.log(`tpl${String(r.tpl).padEnd(3)} ${String(r.name).padEnd(8)} 格数=${r.itemCount} 高度极差=${r.hSpread}px 遮hero=${r.railHitHero} 遮tabs=${r.railHitTabs} 遮tabbar=${r.railHitTabbar}`);
}
