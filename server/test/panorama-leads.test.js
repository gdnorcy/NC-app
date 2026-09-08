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
 * 全景 P0：热点留资表单
 * L1 公开提交：游客凭 sceneId 反查租户落库
 * L2 校验：空提交 400 / 场景不存在 404
 * L3 租户列表：数据按 tenant_id 隔离 + 方案筛选
 * L4 CSV 导出：含 BOM 表头
 * L5 自定义字段进入 extra
 */
let app;
let db;
let server;
let tmpDir;
let tenant1Token;
let tenant2Token;
let scene1;
let scene2;
let scene3;
let plan1;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-leads-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  db = createDb(config.dbPath);
  app = createApp({ db });
  const srv = app.listen(0);
  server = srv;
  await new Promise((r) => srv.once('listening', r));

  const { hash, salt } = hashPassword('admin123');
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('admin','13800000000',?,?,'admin','active',NULL)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('lead_t1','13800000011',?,?,'tenant_admin','active',1)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('lead_t2','13800000012',?,?,'tenant_admin','active',2)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (2, '二号客户', 'active', '[\"panorama\"]')").run();
  // 租户1 方案1 场景1、场景2；租户2 方案2 场景3（plans id 自增，避免与迁移种子冲突）
  const p1 = db.prepare("INSERT INTO plans (project_id, name, description, published, share_token, share_enabled) VALUES (1, '方案一', '演示', 1, 'tok1', 1)").run();
  const p2 = db.prepare("INSERT INTO plans (project_id, name, description, published, share_token, share_enabled) VALUES (2, '方案二', '演示', 1, 'tok2', 1)").run();
  plan1 = Number(p1.lastInsertRowid);
  const plan2 = Number(p2.lastInsertRowid);
  const s1 = db.prepare("INSERT INTO scenes (plan_id, title, image_path, published) VALUES (?, '客厅', '', 1)").run(plan1);
  const s2 = db.prepare("INSERT INTO scenes (plan_id, title, image_path, published) VALUES (?, '卧室', '', 1)").run(plan1);
  const s3 = db.prepare("INSERT INTO scenes (plan_id, title, image_path, published) VALUES (?, '大厅', '', 1)").run(plan2);
  scene1 = Number(s1.lastInsertRowid);
  scene2 = Number(s2.lastInsertRowid);
  scene3 = Number(s3.lastInsertRowid);

  const login = async (u) => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token;
  tenant1Token = await login('lead_t1');
  tenant2Token = await login('lead_t2');
});

after(() => {
  try { server?.close(); } catch { /* noop */ }
  try { db.close(); } catch { /* noop */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
});

test('L1 公开提交：游客凭 sceneId 反查租户落库（含自定义字段）', async () => {
  const r = await request(app).post('/api/card/panorama/leads').send({
    sceneId: scene1,
    hotspotTitle: '客厅沙发',
    fields: { name: '赵六', phone: '13900000001', message: '想了解装修', 公司: '某公司' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const row = db.prepare('SELECT * FROM panorama_leads ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.tenant_id, 1);
  assert.equal(row.plan_id, plan1);
  assert.equal(row.scene_id, scene1);
  assert.equal(row.hotspot_title, '客厅沙发');
  assert.equal(row.name, '赵六');
  const extra = JSON.parse(row.extra);
  assert.equal(extra['公司'], '某公司');
});

test('L2 校验：空提交 400、场景不存在 404', async () => {
  const r1 = await request(app).post('/api/card/panorama/leads').send({ sceneId: scene1, fields: {} });
  assert.equal(r1.status, 400);
  const r2 = await request(app).post('/api/card/panorama/leads').send({ sceneId: 99999, fields: { name: 'x' } });
  assert.equal(r2.status, 404);
  const r3 = await request(app).post('/api/card/panorama/leads').send({ sceneId: undefined, fields: { name: 'x' } });
  assert.equal(r3.status, 400);
});

test('L3 租户列表：数据按 tenant_id 隔离 + 方案筛选', async () => {
  await request(app).post('/api/card/panorama/leads').send({ sceneId: scene2, hotspotTitle: '书桌', fields: { name: '孙七', phone: '13900000002' } });
  await request(app).post('/api/card/panorama/leads').send({ sceneId: scene3, hotspotTitle: '前台', fields: { name: '周八', phone: '13900000003' } });
  const r1 = await request(app).get('/api/customer/panorama/leads').set('Authorization', `Bearer ${tenant1Token}`);
  assert.equal(r1.status, 200);
  assert.equal(r1.body.leads.length, 2); // 场景1+场景2 两条
  assert.ok(r1.body.leads.every((l) => l.plan_name === '方案一'));
  // 租户2 只能看到自己的
  const r2 = await request(app).get('/api/customer/panorama/leads').set('Authorization', `Bearer ${tenant2Token}`);
  assert.equal(r2.body.leads.length, 1);
  assert.equal(r2.body.leads[0].scene_name, '大厅');
  // 方案筛选
  const r3 = await request(app).get(`/api/customer/panorama/leads?planId=${plan1}`).set('Authorization', `Bearer ${tenant1Token}`);
  assert.equal(r3.body.leads.length, 2);
  const r4 = await request(app).get('/api/customer/panorama/leads').set('Authorization', `Bearer badtoken`);
  assert.equal(r4.status, 401);
});

test('L4 CSV 导出：含 BOM 与表头', async () => {
  const r = await request(app).get('/api/customer/panorama/leads?export=csv').set('Authorization', `Bearer ${tenant1Token}`);
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/csv/);
  const text = r.text;
  assert.ok(text.startsWith('\uFEFF'));
  assert.match(text, /方案,场景,热点/);
  assert.match(text, /客厅沙发/);
});
