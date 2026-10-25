import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, hashPassword } from '../src/db.js';
import { createApp } from '../src/app.js';
import { issueToken } from '../src/auth.js';

/**
 * 第26轮：认证/集市管理端直操作 + 自助申请认证（individual_join_mode='apply'）
 * - POST /card/manage/:id/certify：认证（建/复活名册 active + 绑定镜像，幂等）、
 *   取消认证（disabled + 清集市 + is_public 回落）、跨租户 403
 * - POST /card/manage/:id/market：未认证 400；认证后上架（auto 模式 approved）+ is_public 同步；下架还原
 * - GET  /card/manage/:id/oplogs：操作记录（target_type=card_manage）
 * - POST /card-market/apply 免码分支：code 模式 400；apply 模式建 pending(source='apply')
 * - PUT  /card-market/market/settings：individualJoinMode 白名单含 'apply'、拒绝未知值
 */
let app;
let tmpDir;
let db;
let adm1;

function bearer(u) {
  return { Authorization: `Bearer ${issueToken(u)}` };
}

async function wxLogin(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  return res.body.token;
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-card-certify-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  // mock wx-login 按 config.defaultTenantId 兜底给新用户绑租户；本文件的 C 端用户
  // 租户归属由用例显式 UPDATE 控制（免码申请的租户上下文取认证上下文），必须关掉兜底
  config.defaultTenantId = 0;
  db = createDb(config.dbPath);
  db.prepare(
    "UPDATE solution_quotas SET value = 100 WHERE key IN ('enterpriseCount','employeeCount','memberCount','marketItems') AND solution_id = (SELECT id FROM solutions WHERE code = 'demo')"
  ).run();
  // 集市设置行（enabled=1 + auto 上架）：真实租户由集市管理页首次保存时产生，测试库直接播种
  db.prepare("INSERT INTO card_market_settings (customer_id, enabled, audit_mode) VALUES (1, 1, 'auto')").run();
  app = createApp({ db });

  const { hash, salt } = hashPassword('Test@123');
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('cert_adm1', '13800004001', hash, salt, 'tenant_admin', 'active', 1);
  adm1 = db.prepare("SELECT * FROM users WHERE username = 'cert_adm1'").get();
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** 建一个已挂到租户1的用户+个人名片（TENANT_CARD_SCOPE_SQL 通道①：card.customer_id=1） */
function mkUserCard(openid, name) {
  const uid = db.prepare("INSERT INTO platform_user (openid, nickname, customer_id, status) VALUES (?, ?, 1, 'active')")
    .run(openid, name).lastInsertRowid;
  const cardId = db.prepare(
    `INSERT INTO card_profile (user_id, customer_id, name, position, company, city, status, is_public, card_type)
     VALUES (?, 1, ?, '销售', '', '', 'active', 0, 'personal')`
  ).run(uid, name).lastInsertRowid;
  return { uid, cardId };
}

const certify = (cardId, body) =>
  request(app).post(`/api/customer/card/manage/${cardId}/certify`).set(bearer(adm1)).send(body);
const market = (cardId, body) =>
  request(app).post(`/api/customer/card/manage/${cardId}/market`).set(bearer(adm1)).send(body);

test('certify：管理员认证未入驻个人 → 名册 active(source=admin) + 绑定镜像 + 幂等', async () => {
  const { uid, cardId } = mkUserCard('cert_u1', '张三');
  const res = await certify(cardId, { certified: true });
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT * FROM tenant_individuals WHERE customer_id = 1 AND user_id = ?').get(uid);
  assert.equal(row.status, 'active');
  assert.equal(row.source, 'admin');
  const pu = db.prepare('SELECT customer_id, identity_type FROM platform_user WHERE id = ?').get(uid);
  assert.equal(pu.customer_id, 1);
  assert.equal(pu.identity_type, 'individual');
  const card = db.prepare('SELECT customer_id FROM card_profile WHERE id = ?').get(cardId);
  assert.equal(card.customer_id, 1);
  const again = await certify(cardId, { certified: true });
  assert.equal(again.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tenant_individuals WHERE customer_id = 1 AND user_id = ?').get(uid).n, 1);
});

test('certify：用户已绑定其他租户 → 403 不抢人', async () => {
  const openid = 'cert_u2';
  const uid = db.prepare("INSERT INTO platform_user (openid, nickname, customer_id, status) VALUES (?, '李四', 999, 'active')")
    .run(openid).lastInsertRowid;
  const cardId = db.prepare(
    `INSERT INTO card_profile (user_id, customer_id, name, status, card_type) VALUES (?, 1, '李四', 'active', 'personal')`
  ).run(uid).lastInsertRowid;
  const res = await certify(cardId, { certified: true });
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tenant_individuals WHERE user_id = ?').get(uid).n, 0);
});

test('market：未认证 400；认证后上架 approved(auto) + is_public 同步；下架还原', async () => {
  const { uid, cardId } = mkUserCard('cert_u3', '王五');
  const no = await market(cardId, { inMarket: true });
  assert.equal(no.status, 400);
  await certify(cardId, { certified: true });
  const yes = await market(cardId, { inMarket: true });
  assert.equal(yes.status, 200);
  assert.equal(yes.body.auditStatus, 'approved');
  const item = db.prepare("SELECT id FROM card_market_items WHERE customer_id = 1 AND subject_type = 'individual' AND user_id = ?").get(uid);
  assert.ok(item, '应产生在市记录');
  assert.equal(db.prepare('SELECT is_public FROM card_profile WHERE id = ?').get(cardId).is_public, 1);
  const off = await market(cardId, { inMarket: false });
  assert.equal(off.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM card_market_items WHERE id = ?').get(item.id).n, 0);
  assert.equal(db.prepare('SELECT is_public FROM card_profile WHERE id = ?').get(cardId).is_public, 0);
});

test('uncertify：取消认证 → 名册 disabled + 集市清空 + is_public 回落', async () => {
  const { uid, cardId } = mkUserCard('cert_u4', '赵六');
  await certify(cardId, { certified: true });
  await market(cardId, { inMarket: true });
  const off = await certify(cardId, { certified: false });
  assert.equal(off.status, 200);
  assert.equal(db.prepare('SELECT status FROM tenant_individuals WHERE customer_id = 1 AND user_id = ?').get(uid).status, 'disabled');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM card_market_items WHERE customer_id = 1 AND subject_type = 'individual' AND user_id = ?").get(uid).n, 0);
  assert.equal(db.prepare('SELECT is_public FROM card_profile WHERE id = ?').get(cardId).is_public, 0);
});

test('oplogs：操作记录按 target_type=card_manage 可查', async () => {
  const { cardId } = mkUserCard('cert_u6', '孙八');
  await certify(cardId, { certified: true });
  await market(cardId, { inMarket: true });
  const res = await request(app).get(`/api/customer/card/manage/${cardId}/oplogs`).set(bearer(adm1));
  assert.equal(res.status, 200);
  assert.ok(res.body.logs.length >= 2);
  assert.ok(res.body.logs.some((l) => l.action === 'admin_certify_individual'));
  assert.ok(res.body.logs.some((l) => l.action === 'admin_market_list'));
});

test('apply 免码：code 模式 400 → settings 切 apply（白名单校验）→ pending(source=apply)', async () => {
  const token = await wxLogin('cert_u5');
  // mock code2session 的 openid = 'mock_' + code（见 app.js createWxCode2Session）
  const uid = db.prepare("SELECT id FROM platform_user WHERE openid = 'mock_cert_u5'").get().id;
  // 免码申请的租户上下文取认证上下文：mock 登录不绑租户（defaultTenantId=0），显式挂到租户1
  db.prepare('UPDATE platform_user SET customer_id = 1 WHERE id = ?').run(uid);

  const denied = await request(app).post('/api/card-market/apply').set({ Authorization: `Bearer ${token}` })
    .send({ type: 'individual', name: '钱七', phone: '13900000001' });
  assert.equal(denied.status, 400);

  const bad = await request(app).put('/api/card-market/market/settings').set(bearer(adm1)).send({ individualJoinMode: 'open' });
  assert.equal(bad.status, 400);
  const put = await request(app).put('/api/card-market/market/settings').set(bearer(adm1)).send({ individualJoinMode: 'apply' });
  assert.equal(put.status, 200);

  const ok = await request(app).post('/api/card-market/apply').set({ Authorization: `Bearer ${token}` })
    .send({ type: 'individual', name: '钱七', phone: '13900000001' });
  assert.equal(ok.status, 200);
  const row = db.prepare('SELECT * FROM tenant_individuals WHERE customer_id = 1 AND user_id = ?').get(uid);
  assert.equal(row.status, 'pending');
  assert.equal(row.source, 'apply');
  // 重复提交 → 400「申请审核中」（复用既有防重逻辑）
  const dup = await request(app).post('/api/card-market/apply').set({ Authorization: `Bearer ${token}` })
    .send({ type: 'individual', name: '钱七', phone: '13900000001' });
  assert.equal(dup.status, 400);
});
