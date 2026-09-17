import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, hashPassword } from '../src/db.js';
import { createApp } from '../src/app.js';

let tmpDir, db, app, server, adminToken, tenant1Token;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apps-center-'));
  const prev = { ...config };
  Object.assign(config, {
    dataDir: tmpDir,
    uploadsDir: path.join(tmpDir, 'uploads'),
    dbPath: path.join(tmpDir, 'test.db'),
    webDistDir: path.join(tmpDir, 'web-dist'),
    storageProvider: 'local',
    storageProviders: JSON.stringify({ local: {} }),
    adminUser: 'admin',
    adminPass: 'admin123',
  });
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  db = createDb(config.dbPath);
  app = createApp({ db });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  globalThis.__appsCenterPrev = prev;

  const { hash, salt } = hashPassword('admin123');
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('admin','13800000000',?,?,'admin','active',NULL)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('tenant1','13800000001',?,?,'tenant_admin','active',1)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (1, '一号客户', 'active', '[\"demo\",\"card\"]')").run();
  db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (2, '二号客户', 'active', '[\"card\"]')").run();
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('tenant2','13800000002',?,?,'tenant_admin','active',2)").run(hash, salt);

  const login = async (u, p) => (await request(app).post('/api/auth/login').send({ username: u, password: p })).body.token;
  adminToken = await login('admin', 'admin123');
  tenant1Token = await login('tenant1', 'admin123');
});

after(() => {
  try { server?.close(); } catch {}
  try { db.close(); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  Object.assign(config, globalThis.__appsCenterPrev);
});

test('租户应用列表：demo 组合包展开为全部应用且不出现 demo 本身', async () => {
  const r = await request(app).get('/api/customer/apps').set('Authorization', `Bearer ${tenant1Token}`);
  assert.equal(r.status, 200);
  const codes = r.body.apps.map((a) => a.code);
  assert.ok(codes.includes('panorama'), 'demo 方案应展开全景应用');
  assert.ok(codes.includes('card'), 'demo 方案应展开名片应用');
  assert.ok(!codes.includes('demo'), 'demo 方案本身不得出现');
  // 每个应用带分类字段（中文名）
  for (const a of r.body.apps) {
    assert.ok(a.category && typeof a.category === 'string' && a.category.length > 0, `应用 ${a.code} 缺少分类`);
  }
});

test('租户应用列表：仅开通 card 方案的租户只看到名片应用', async () => {
  const r = await request(app).get('/api/customer/apps').set('Authorization', `Bearer ${tenant1Token}`);
  // 用第二个租户（仅 card）
  const login2 = await request(app).post('/api/auth/login').send({ username: 'tenant2', password: 'admin123' });
  const r2 = await request(app).get('/api/customer/apps').set('Authorization', `Bearer ${login2.body.token}`);
  assert.equal(r2.status, 200);
  const codes = r2.body.apps.map((a) => a.code);
  assert.deepEqual(codes.sort(), ['card']);
  assert.ok(r.body.apps.length >= r2.body.apps.length);
});

test('租户应用排序：保存自定义顺序后按新顺序返回', async () => {
  const before = await request(app).get('/api/customer/apps').set('Authorization', `Bearer ${tenant1Token}`);
  const codes = before.body.apps.map((a) => a.code);
  assert.ok(codes.length >= 2);
  // 反转顺序保存
  const reversed = [...codes].reverse();
  const save = await request(app)
    .put('/api/customer/apps/sort')
    .set('Authorization', `Bearer ${tenant1Token}`)
    .send({ codes: reversed });
  assert.equal(save.status, 200);
  assert.equal(save.body.ok, true);

  const after = await request(app).get('/api/customer/apps').set('Authorization', `Bearer ${tenant1Token}`);
  assert.deepEqual(after.body.apps.map((a) => a.code), reversed);

  // 排序数据按租户隔离：tenant2 不受影响
  const login2 = await request(app).post('/api/auth/login').send({ username: 'tenant2', password: 'admin123' });
  const r2 = await request(app).get('/api/customer/apps').set('Authorization', `Bearer ${login2.body.token}`);
  assert.deepEqual(r2.body.apps.map((a) => a.code).sort(), ['card']);
});

test('租户应用排序：非法参数返回 400，未登录返回 401', async () => {
  const bad = await request(app).put('/api/customer/apps/sort').set('Authorization', `Bearer ${tenant1Token}`).send({ codes: 'not-array' });
  assert.equal(bad.status, 400);
  const noauth = await request(app).get('/api/customer/apps');
  assert.equal(noauth.status, 401);
});

test('渠道排序：保存后按新顺序返回，按租户隔离', async () => {
  // 初始无记录返回空数组
  const init = await request(app).get('/api/customer/channels/sort').set('Authorization', `Bearer ${tenant1Token}`);
  assert.equal(init.status, 200);
  assert.deepEqual(init.body.types, []);

  const types = ['h5', 'pc', 'mp', 'mini'];
  const save = await request(app)
    .put('/api/customer/channels/sort')
    .set('Authorization', `Bearer ${tenant1Token}`)
    .send({ types });
  assert.equal(save.status, 200);

  const after = await request(app).get('/api/customer/channels/sort').set('Authorization', `Bearer ${tenant1Token}`);
  assert.deepEqual(after.body.types, types);

  // 重新整体覆盖
  const reversed = [...types].reverse();
  await request(app).put('/api/customer/channels/sort').set('Authorization', `Bearer ${tenant1Token}`).send({ types: reversed });
  const after2 = await request(app).get('/api/customer/channels/sort').set('Authorization', `Bearer ${tenant1Token}`);
  assert.deepEqual(after2.body.types, reversed);

  // 租户隔离：tenant2 不受影响
  const login2 = await request(app).post('/api/auth/login').send({ username: 'tenant2', password: 'admin123' });
  const r2 = await request(app).get('/api/customer/channels/sort').set('Authorization', `Bearer ${login2.body.token}`);
  assert.deepEqual(r2.body.types, []);
});

test('渠道排序：非法参数不报错（过滤非字符串），未登录返回 401', async () => {
  const bad = await request(app)
    .put('/api/customer/channels/sort')
    .set('Authorization', `Bearer ${tenant1Token}`)
    .send({ types: ['mini', 123, null, 'pc'] });
  assert.equal(bad.status, 200);
  const after = await request(app).get('/api/customer/channels/sort').set('Authorization', `Bearer ${tenant1Token}`);
  assert.deepEqual(after.body.types, ['mini', 'pc']);

  const noauth = await request(app).get('/api/customer/channels/sort');
  assert.equal(noauth.status, 401);
});
