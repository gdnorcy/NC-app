/**
 * 复现线上「二维码进公众号 → 该公众号提供的服务出现故障」的回复 XML。
 * 用生产同构数据跑真代码，把最终 XML 打出来人工检查。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { createDb } from '../src/db.js';
import { WxMpService } from '../src/services/wx-mp.js';
import { WxComponentService } from '../src/services/wx-component.js';
import { computeTraceCode, DEFAULT_CODESET } from '../src/services/traceCode.js';

const TID_RAW = 1;
const RULE = { m: { 1: 'FW', 2: 7, 3: 6, 4: 5, 5: 20 }, k: { ...DEFAULT_CODESET.k }, zdl: 10 };
const BATCH_NO = 'T000001';
const CODE = computeTraceCode(`FW${BATCH_NO}99902207023`, RULE);
const CHANNEL = { id: 1, appid: 'wx170708ec5ecc8804', app_secret: '', customer_id: 1, auth_status: 'none' };
const FROM_USER = 'oZsTK24pvn3zzph8lrh94v9agdJo';
const BASE_URL = 'https://zero.nshop.mobi';

// 生产租户 1 的展示位（来自线上 /public/verify 下发的 slots）
const SLOTS = [
  { when: 1, title: '第一位', cover: '/uploads/material/1/1792476563261-02334.jpg', link: 'https://www.baidu.com' },
  { when: 1, title: '', cover: '/uploads/material/1/1789744900861-normal_banner1.png', link: '' },
];

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-repro-'));
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

// createDb 已自动播种「默认客户」，直接复用其 id，不要再插 projects（UNIQUE 冲突）
const proj = db.prepare('SELECT id FROM projects ORDER BY id ASC LIMIT 1').get();
if (!proj) throw new Error('缺少租户行');
const TID = proj.id;
CHANNEL.customer_id = TID;
console.log('租户 id =', TID);
db.prepare('UPDATE projects SET solutions = ? WHERE id = ?').run(JSON.stringify(['trace']), TID);
db.prepare('INSERT OR REPLACE INTO trace_code_rules (tenant_id, m1, rule_json) VALUES (?, ?, ?)')
  .run(TID, 'FW', JSON.stringify(RULE));
// 生产批次：banner 为空
db.prepare(`INSERT INTO trace_batches (tenant_id, m1, batch, product, factory, brand, origin, banner, logo, is_active, rcon)
  VALUES (?, 'FW', ?, '', '天池', '天池1', '潮州', '', '', 1, 0)`).run(TID, BATCH_NO);
db.prepare(`INSERT INTO trace_settings (tenant_id, settings_json, cocom) VALUES (?, ?, -888)`)
  .run(TID, JSON.stringify({ scanMode: 'push_dynamic', displaySlots: SLOTS, wxReply: 1 }));
// 该码已被查过多次（线上 num ≈ 8）
db.prepare(`INSERT INTO trace_codes (tenant_id, batch_id, code, entry_type, num, is_valid, created_at, updated_at)
  VALUES (?, (SELECT id FROM trace_batches WHERE tenant_id = ? AND batch = ?), ?, '6', 8, 1, datetime('now'), datetime('now'))`)
  .run(TID, TID, BATCH_NO, CODE);

const wxMp = new WxMpService(db, new WxComponentService(db));
const xml = wxMp.resolveTraceScanReply(CHANNEL, CODE, FROM_USER, BASE_URL);
console.log('=== 生产同构数据下的 SCAN 回复 XML ===');
console.log(xml);
console.log('\n=== 关键字段 ===');
console.log('MsgType      :', (xml.match(/<MsgType><!\[CDATA\[(.*?)\]\]>/) || [])[1]);
console.log('ArticleCount :', (xml.match(/<ArticleCount>(\d+)<\/ArticleCount>/) || [])[1]);
const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
items.forEach((it, i) => {
  const g = (t) => ((it.match(new RegExp(`<${t}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${t}>`)) || [])[1] || '');
  console.log(`item[${i}] Title="${g('Title')}" Description="${g('Description')}" PicUrl="${g('PicUrl')}" Url="${g('Url')}"`);
});
try { db.close(); } catch { /* noop */ }
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
