/**
 * 端到端验证「二维码进公众号 → 回复图文卡片」在**真实微信接口**上是否还能被拒收。
 *
 * 🔴 为什么必须打真接口（而不是只跑本地单测）：
 *    2026-10-30 线上事故的根因是「微信图文消息接口只允许 1 条」，
 *    本地单测只能证明「我们自己只生成 1 条」，证明不了「微信收得下」。
 *    这个脚本把**真代码产出的 XML**原样喂给微信客服接口，拿微信自己的 errcode 说话。
 *
 * 用法：
 *   node scripts/verify-wx-reply-live.mjs            # 只发 1 条（修复后的真实产物）
 *   node scripts/verify-wx-reply-live.mjs --two      # 故意发 2 条（对照组，预期 45008）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { createDb } from '../src/db.js';
import { readSecret } from '../src/crypto.js';
import { WxMpService } from '../src/services/wx-mp.js';
import { WxComponentService } from '../src/services/wx-component.js';
import { computeTraceCode, DEFAULT_CODESET } from '../src/services/traceCode.js';

const APPID = 'wx170708ec5ecc8804';
// 🔴 生产库里 channel_apps.app_secret 的密文（归属加密，主密钥走代码内默认开发密钥）。
//    ⚠️ **不要把密文写进仓库** —— 只能从环境变量传：
//      WX_APP_SECRET_CIPHER='<密文>' node scripts/verify-wx-reply-live.mjs
//    （密文可用生产库 SELECT app_secret 取，或在服务器上直接跑本脚本。）
const APP_SECRET_CIPHER = process.env.WX_APP_SECRET_CIPHER || '';
const TO_USER = process.env.WX_TO_USER || 'oZsTK24pvn3zzph8lrh94v9agdJo';

const RULE = { m: { 1: 'FW', 2: 7, 3: 6, 4: 5, 5: 20 }, k: { ...DEFAULT_CODESET.k }, zdl: 10 };
const BATCH_NO = 'T000001';
const CODE = computeTraceCode(`FW${BATCH_NO}99902207023`, RULE);
const BASE_URL = 'https://zero.nshop.mobi';
// 生产租户的真实展示位配置（2 个位 → 修复前必然超 1 条）
const SLOTS = [
  { when: 1, title: '第一位', cover: '/uploads/material/1/1792476563261-02334.jpg', link: 'https://www.baidu.com' },
  { when: 1, title: '', cover: '/uploads/material/1/1789744900861-normal_banner1.png', link: '' },
];

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-live-'));
Object.assign(config, {
  dataDir: tmpDir,
  uploadsDir: path.join(tmpDir, 'uploads'),
  dbPath: path.join(tmpDir, 'test.db'),
  webDistDir: path.join(tmpDir, 'web-dist'),
  storageProvider: 'local',
  storageProviders: JSON.stringify({ local: {} }),
});
fs.mkdirSync(config.uploadsDir, { recursive: true });
const db = createDb(config.dbPath);
const proj = db.prepare('SELECT id FROM projects ORDER BY id ASC LIMIT 1').get();
const TID = proj.id;
const CHANNEL = { id: 1, appid: APPID, app_secret: APP_SECRET_CIPHER, customer_id: TID, auth_status: 'none' };

db.prepare('UPDATE projects SET solutions = ? WHERE id = ?').run(JSON.stringify(['trace']), TID);
db.prepare('INSERT OR REPLACE INTO trace_code_rules (tenant_id, m1, rule_json) VALUES (?, ?, ?)')
  .run(TID, 'FW', JSON.stringify(RULE));
db.prepare(`INSERT INTO trace_batches (tenant_id, m1, batch, product, factory, brand, origin, banner, logo, is_active, rcon)
  VALUES (?, 'FW', ?, '', '天池', '天池1', '潮州', '', '', 1, 0)`).run(TID, BATCH_NO);
db.prepare(`INSERT INTO trace_settings (tenant_id, settings_json, cocom) VALUES (?, ?, -888)`)
  .run(TID, JSON.stringify({ scanMode: 'push_dynamic', displaySlots: SLOTS, wxReply: 1 }));
db.prepare(`INSERT INTO trace_codes (tenant_id, batch_id, code, entry_type, num, is_valid, created_at, updated_at)
  VALUES (?, (SELECT id FROM trace_batches WHERE tenant_id = ? AND batch = ?), ?, '6', 8, 1, datetime('now'), datetime('now'))`)
  .run(TID, TID, BATCH_NO, CODE);

// ---- 1. 用真代码产出 XML ----
const wxMp = new WxMpService(db, new WxComponentService(db));
const xml = wxMp.resolveTraceScanReply(CHANNEL, CODE, TO_USER, BASE_URL);
const articles = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map((it) => {
  const g = (t) => ((it.match(new RegExp(`<${t}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${t}>`)) || [])[1] || '');
  return { title: g('Title'), description: g('Description'), url: g('Url'), picurl: g('PicUrl') };
});
console.log('=== 真代码产出的图文 ===');
console.log('条数 =', articles.length);
articles.forEach((a, i) => console.log(`  [${i}] ${a.title} | pic=${a.picurl}`));

// 对照组：故意塞第 2 条（复刻事故当天的形态）
const WANT_TWO = process.argv.includes('--two');
if (WANT_TWO && articles[0]) {
  articles.push({ ...articles[0], title: '对照组第 2 条', picurl: 'https://zero.nshop.mobi/uploads/material/1/1789744900861-normal_banner1.png' });
  console.log('（对照组：已故意改成 2 条，预期微信回 45008）');
}

// ---- 2. 真凭据换 access_token ----
if (!APP_SECRET_CIPHER) {
  console.error('❌ 缺少环境变量 WX_APP_SECRET_CIPHER（生产 app_secret 的密文），无法做真接口验证');
  console.error('   用法：WX_APP_SECRET_CIPHER=\'<密文>\' node scripts/verify-wx-reply-live.mjs');
  process.exit(1);
}
const secret = readSecret(APP_SECRET_CIPHER);
const tokRes = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${encodeURIComponent(secret)}`);
const tok = await tokRes.json();
if (!tok.access_token) {
  console.error('❌ 取 token 失败：', tok);
  process.exit(1);
}
console.log('✅ 拿到 access_token');

// ---- 3. 喂给真微信接口 ----
const sendRes = await fetch(`https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${tok.access_token}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ touser: TO_USER, msgtype: 'news', news: { articles } }),
});
const sent = await sendRes.json();
console.log('=== 微信接口返回 ===');
console.log(JSON.stringify(sent));
if (sent.errcode === 0) {
  console.log('✅ 微信已受理（这次卡片应该已经发到你的微信里，去公众号会话看一眼）');
} else {
  console.log(`❌ 微信拒收：errcode=${sent.errcode} ${sent.errmsg}`);
}

try { db.close(); } catch { /* noop */ }
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
