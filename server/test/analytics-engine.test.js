import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';

/**
 * 第三批：行为埋点 / 漏斗 / 趋势 / 健康分 / 平台概览
 * A1 事件上报（游客 cardId 反查租户 + 登录态租户）
 * A2 漏斗转化（曝光→浏览→交换发起→交换成功，跨访客去重）
 * A3 趋势与事件分布
 * A4 健康分（资料完整/内容/访客/转化/集市）
 * A5 平台概览（按解决方案）+ 未认证 401
 */
let app;
let db;
let server;
let tmpDir;
let adminToken;
let tenantToken;
let cardId;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  db = createDb(config.dbPath);
  app = createApp({ db });
  const srv = app.listen(0);
  server = srv;
  await new Promise((r) => srv.once('listening', r));

  // 平台管理员 + 租户管理员（存在则跳过，createDb 迁移可能已建）
  const { hash, salt } = hashPassword('admin123');
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('admin','13800000000',?,?,'admin','active',NULL)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('tenant1','13800000001',?,?,'tenant_admin','active',1)").run(hash, salt);
  // 平台 C 端用户（入驻租户1）→ 两张名片
  db.prepare("INSERT OR IGNORE INTO platform_user (openid, nickname, customer_id, status) VALUES ('mock_u1','用户甲',1,'active')").run();
  db.prepare("INSERT OR IGNORE INTO platform_user (openid, nickname, customer_id, status) VALUES ('mock_u2','用户乙',1,'active')").run();
  const u1 = db.prepare("SELECT id FROM platform_user WHERE openid='mock_u1'").get().id;
  const u2 = db.prepare("SELECT id FROM platform_user WHERE openid='mock_u2'").get().id;
  const ins = db.prepare(`INSERT INTO card_profile (user_id, name, position, company, phone, wechat, avatar, status)
    VALUES (?,?,?,?,?,?,?,'active')`);
  const r1 = ins.run(u1, '张三', '销售总监', '零壹科技', '13800000001', 'wx_zs', '/a.png');
  const r2 = ins.run(u2, '李四', '经理', '零壹科技', '13800000002', 'wx_ls', '/b.png');
  cardId = Number(r1.lastInsertRowid);
  global.__cardId2 = Number(r2.lastInsertRowid);

  // 租户2（隔离漏斗测试）：租户管理员 + C端用户 + 名片
  db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (2, '二号客户', 'active', '[\"card\"]')").run();
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('tenant2','13800000002',?,?,'tenant_admin','active',2)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO platform_user (openid, nickname, customer_id, status) VALUES ('openid_t2','租户2用户',2,'active')").run();
  const t2u = db.prepare("SELECT id FROM platform_user WHERE openid='openid_t2'").get().id;
  const r3 = ins.run(t2u, '王五', '总监', '二号公司', '13800000003', 'wx_w5', '/c.png');
  global.__cardIdT2 = Number(r3.lastInsertRowid);

  const login = async (u, p) => (await request(app).post('/api/auth/login').send({ username: u, password: p })).body.token;
  adminToken = await login('admin', 'admin123');
  tenantToken = await login('tenant1', 'admin123');
});

after(() => {
  try { server?.close(); } catch { /* noop */ }
  try { db.close(); } catch { /* noop */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
});

test('A1 事件上报：游客凭 cardId 反查租户，登录态用租户上下文', async () => {
  // 游客：无 token，仅 cardId
  const guest = await request(app)
    .post('/api/card/analytics/events')
    .send({ events: [
      { eventType: 'page_view', page: '/pages/card/myCard', cardId },
      { eventType: 'card_view', page: '/pages/card/myCard', cardId, visitorKey: 'g1', durationMs: 3000 },
      { eventType: 'form_submit', cardId, visitorKey: 'g1' },
    ] });
  assert.equal(guest.status, 200);
  assert.equal(guest.body.written, 3);
  const rows = db.prepare('SELECT * FROM analytics_events WHERE card_id = ? ORDER BY id').all(cardId);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.tenant_id === 1), '游客事件应按名片归属租户落库');

  // 登录态：token 携带 customer_id
  const token = await (async () => {
    const res = await request(app).post('/api/card/auth/wx-login').send({ code: 'u1' });
    return res.body.token;
  })();
  const authed = await request(app)
    .post('/api/card/analytics/events')
    .set('Authorization', `Bearer ${token}`)
    .send({ events: [{ eventType: 'exchange_success', cardId, visitorKey: 'u1', userId: 1 }] });
  assert.equal(authed.body.written, 1);
});

test('A2 漏斗：曝光→浏览→交换发起→交换成功（访客去重）', async () => {
  const cid = global.__cardIdT2;
  const ev = (t, k) => ({ eventType: t, visitorKey: k, cardId: cid });
  const batch = [];
  // 访客A：完整走完漏斗
  batch.push(ev('page_view', 'A'), ev('card_view', 'A'), ev('exchange_init', 'A'), ev('exchange_success', 'A'));
  // 访客B：到浏览即停
  batch.push(ev('page_view', 'B'), ev('card_view', 'B'));
  // 访客C：仅曝光
  batch.push(ev('page_view', 'C'));
  const r = await request(app).post('/api/card/analytics/events').send({ events: batch });
  assert.equal(r.body.written, 7);

  const t2login = await request(app).post('/api/auth/login').send({ username: 'tenant2', password: 'admin123' });
  const t2Token = t2login.body.token;
  const res = await request(app)
    .get('/api/customer/analytics/funnel')
    .set('Authorization', `Bearer ${t2Token}`);
  assert.equal(res.status, 200);
  const steps = res.body.funnel;
  assert.equal(steps[0].key, 'page_view');
  assert.equal(steps[0].visitors, 3, '3 个访客曝光');
  assert.equal(steps[1].visitors, 2, '2 人浏览名片');
  assert.equal(steps[2].visitors, 1, '1 人发起交换');
  assert.equal(steps[3].visitors, 1, '1 人交换成功');
  assert.equal(steps[1].conversion, 66.7, '浏览转化率 2/3');
  assert.equal(steps[3].conversion, 100);
});

test('A3 趋势与事件分布', async () => {
  const res = await request(app)
    .get('/api/customer/analytics/trend?days=7')
    .set('Authorization', `Bearer ${tenantToken}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.trend.length >= 1);
  assert.ok(res.body.trend[0].events >= 4, '趋势含事件量');

  const dist = await request(app)
    .get('/api/customer/analytics/distribution')
    .set('Authorization', `Bearer ${tenantToken}`);
  const types = dist.body.distribution.map((d) => d.type);
  assert.ok(types.includes('card_view'));
  assert.ok(types.includes('exchange_success'));
});

test('A4 健康分：资料完整度与活动维度参与计算', async () => {
  const res = await request(app)
    .get('/api/customer/analytics/health')
    .set('Authorization', `Bearer ${tenantToken}`);
  assert.equal(res.status, 200);
  const h = res.body.health;
  assert.ok(h.score >= 0 && h.score <= 100);
  assert.equal(h.dimensions.length, 5);
  assert.ok(h.dimensions[0].score > 0, '两张完整名片 → 资料完整度>0');
  assert.ok(Array.isArray(h.advice));
  assert.ok(h.updatedAt);
});

test('A5 平台概览（按解决方案）与未认证拦截', async () => {
  const res = await request(app)
    .get('/api/admin/analytics/overview?days=7')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.totalEvents >= 10, true);
  const card = res.body.bySolution.find((s) => s.solution === 'card');
  assert.ok(card && card.tenants >= 1, '概览含 card 解决方案与租户数');

  const noAuth = await request(app).get('/api/admin/analytics/overview');
  assert.equal(noAuth.status, 401);
  const noTenant = await request(app).get('/api/customer/analytics/funnel');
  assert.equal(noTenant.status, 401);
});
