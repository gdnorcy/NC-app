import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, cleanupDemoEnterprises } from '../src/db.js';
import { createApp } from '../src/app.js';

/**
 * 「H5演示用户_*」影子企业清理（2026-10-20 用户质疑：我自己建的名片怎么成了挂靠成员）
 *
 * 覆盖：
 *  - 源头止损：微信登录兜底只绑 customer_id，不再凭空造企业
 *  - 存量清理：影子企业停用 + 账号解挂靠
 *  - 🔴 顺序护栏：先补名片 customer_id 再解挂靠（反了会让名片从租户后台消失）
 *  - 真实企业不受影响
 */
let app;
let tmpDir;
let db;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-demo-ent-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let dirtySeq = 0;
function makeDirty() {
  // 影子企业（登录兜底造出来的那种：无 admin、名字=用户ID）
  const cid = 1;
  const seq = ++dirtySeq; // openid 唯一，否则多次造数撞 UNIQUE
  const entId = db.prepare("INSERT INTO tenant_enterprises (customer_id, name, status) VALUES (?, 'H5演示用户_9905' || ?, 'active')").run(cid, seq).lastInsertRowid;
  const uid = db.prepare("INSERT INTO platform_user (openid, nickname, customer_id, enterprise_id, status) VALUES ('demo_ent_u' || ?, '林平', ?, ?, 'active')").run(seq, cid, entId).lastInsertRowid;
  // 他创建的名片：自身 customer_id / enterprise_id 都空（正是线上实况）
  const cardId = db.prepare("INSERT INTO card_profile (user_id, name, company, status, is_public) VALUES (?, '林平', '东莞市揭阳商会', 'active', 1)").run(uid).lastInsertRowid;
  return { entId, uid, cardId };
}

test('存量清理：影子企业停用 + 账号解挂靠，且名片归属被补上', () => {
  const { entId, uid, cardId } = makeDirty();
  const n = cleanupDemoEnterprises(db);
  assert.ok(n >= 1, '应清理到影子企业');

  // 企业停用
  const ent = db.prepare('SELECT status FROM tenant_enterprises WHERE id = ?').get(entId);
  assert.equal(ent.status, 'disabled');
  // 账号不再挂靠
  const u = db.prepare('SELECT enterprise_id FROM platform_user WHERE id = ?').get(uid);
  assert.equal(u.enterprise_id, null);
  // 🔴 关键：名片必须已补上 customer_id，否则会从租户后台消失
  const c = db.prepare('SELECT customer_id FROM card_profile WHERE id = ?').get(cardId);
  assert.equal(c.customer_id, 1);
});

test('🔴 清理后名片仍在租户后台可见（顺序反了这里就会红）', async () => {
  const { cardId } = makeDirty();
  cleanupDemoEnterprises(db);
  // 归属通道 ① c.customer_id：解挂靠后靠它可见
  const row = db.prepare('SELECT COUNT(*) AS n FROM card_profile WHERE id = ? AND customer_id = 1 AND status = ?').get(cardId, 'active');
  assert.equal(row.n, 1);
});

test('清理是幂等的：再跑一次不报错、不多清', () => {
  makeDirty();
  cleanupDemoEnterprises(db);
  const before = db.prepare("SELECT COUNT(*) AS n FROM tenant_enterprises WHERE status = 'disabled'").get().n;
  cleanupDemoEnterprises(db);
  const after = db.prepare("SELECT COUNT(*) AS n FROM tenant_enterprises WHERE status = 'disabled'").get().n;
  assert.equal(after, before);
});

test('真实企业不受影响（非 H5演示用户 前缀不动）', () => {
  const realId = db.prepare("INSERT INTO tenant_enterprises (customer_id, name, status) VALUES (1, '零壹科技', 'active')").run().lastInsertRowid;
  const uid = db.prepare("INSERT INTO platform_user (openid, nickname, customer_id, enterprise_id, status) VALUES ('demo_ent_u2', '陈晨', 1, ?, 'active')").run(realId).lastInsertRowid;
  cleanupDemoEnterprises(db);
  const ent = db.prepare('SELECT status FROM tenant_enterprises WHERE id = ?').get(realId);
  assert.equal(ent.status, 'active');
  const u = db.prepare('SELECT enterprise_id FROM platform_user WHERE id = ?').get(uid);
  assert.equal(u.enterprise_id, realId);
});

test('源头止损：新用户微信登录不再凭空造企业，只绑租户', async () => {
  config.defaultTenantId = 1; // 打开兜底（否则 bindTid=0，分支不触发）
  const entBefore = db.prepare('SELECT COUNT(*) AS n FROM tenant_enterprises').get().n;
  const res = await request(app).post('/api/card/auth/wx-login').send({ code: 'demo_ent_newuser' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const entAfter = db.prepare('SELECT COUNT(*) AS n FROM tenant_enterprises').get().n;
  assert.equal(entAfter, entBefore, '登录不得新增企业');

  const u = db.prepare("SELECT * FROM platform_user WHERE openid = 'openid_demo_ent_newuser'").get()
    || db.prepare("SELECT * FROM platform_user ORDER BY id DESC LIMIT 1").get();
  assert.equal(u.customer_id, 1, '应绑上租户');
  assert.equal(u.enterprise_id, null, '不得再自动挂靠演示企业');
});
