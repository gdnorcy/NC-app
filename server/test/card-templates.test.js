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
 * 第四批·模板库：平台公共 + 租户私有
 * T1 平台创建/列表/启停（系统资产不物理删除）
 * T2 租户市场：平台启用模板 + 本租户私有
 * T3 租户私有模板 CRUD 与跨租户越权拦截
 * T4 C 端模板主题读取（列表含 themeConfig）
 */
let app, db, server, tmpDir, adminToken, tenant1Token, tenant2Token;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  db = createDb(config.dbPath);
  app = createApp({ db });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));

  const { hash, salt } = hashPassword('admin123');
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('admin','13800000000',?,?,'admin','active',NULL)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('tenant1','13800000001',?,?,'tenant_admin','active',1)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (1, '一号客户', 'active', '[\"card\"]')").run();
  db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (2, '二号客户', 'active', '[\"card\"]')").run();
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('tenant2','13800000002',?,?,'tenant_admin','active',2)").run(hash, salt);

  const login = async (u, p) => (await request(app).post('/api/auth/login').send({ username: u, password: p })).body.token;
  adminToken = await login('admin', 'admin123');
  tenant1Token = await login('tenant1', 'admin123');
  tenant2Token = await login('tenant2', 'admin123');
});

after(() => {
  try { server?.close(); } catch {}
  try { db.close(); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

test('T1 平台模板：创建/列表/启停（不物理删除）', async () => {
  const r1 = await request(app)
    .post('/api/admin/card/templates')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '商务蓝', themeConfig: { primary: '#165dff', background: '#f5f7fa' }, description: '平台公共模板' });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.template.name, '商务蓝');
  assert.equal(r1.body.template.tenantId, 0);
  const tplId = r1.body.template.id;

  const list = await request(app).get('/api/admin/card/templates').set('Authorization', `Bearer ${adminToken}`);
  assert.ok(list.body.templates.some((t) => t.id === tplId));

  // 停用（删除→启停）
  const del = await request(app).delete(`/api/admin/card/templates/${tplId}`).set('Authorization', `Bearer ${adminToken}`);
  assert.equal(del.status, 200);
  const after = await request(app).get('/api/admin/card/templates').set('Authorization', `Bearer ${adminToken}`);
  const row = after.body.templates.find((t) => t.id === tplId);
  assert.ok(row && row.enabled === false, '平台模板停用而非删除');
});

test('T2 租户市场：平台启用模板 + 本租户私有模板', async () => {
  // 先建一个启用的平台模板
  const t = await request(app)
    .post('/api/admin/card/templates')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '活力橙', themeConfig: { primary: '#ff7d00' } });
  assert.equal(t.status, 200);

  // 租户自建
  const mine = await request(app)
    .post('/api/customer/card/templates')
    .set('Authorization', `Bearer ${tenant1Token}`)
    .send({ name: '我的品牌模板', themeConfig: { primary: '#00b42a' } });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.template.tenantId, 1);

  const list = await request(app).get('/api/customer/card/templates').set('Authorization', `Bearer ${tenant1Token}`);
  const names = list.body.templates.map((t) => t.name);
  assert.ok(names.includes('活力橙'), '平台启用模板出现在租户市场');
  assert.ok(names.includes('我的品牌模板'), '租户私有模板在列表中');
});

test('T3 租户模板越权拦截：跨租户不可见/不可改/不可删', async () => {
  // 租户1 私有模板
  const mine = await request(app)
    .post('/api/customer/card/templates')
    .set('Authorization', `Bearer ${tenant1Token}`)
    .send({ name: '私有A', themeConfig: { primary: '#123456' } });
  const tid = mine.body.template.id;

  // 租户2 列表不包含
  const list2 = await request(app).get('/api/customer/card/templates').set('Authorization', `Bearer ${tenant2Token}`);
  assert.ok(!list2.body.templates.some((t) => t.id === tid));

  // 租户2 改/删 → 403
  const put = await request(app).put(`/api/customer/card/templates/${tid}`).set('Authorization', `Bearer ${tenant2Token}`).send({ name: 'hack' });
  assert.equal(put.status, 403);
  const del = await request(app).delete(`/api/customer/card/templates/${tid}`).set('Authorization', `Bearer ${tenant2Token}`);
  assert.equal(del.status, 403);

  // 总后台不可改租户模板
  const adminPut = await request(app).put(`/api/admin/card/templates/${tid}`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'hack2' });
  assert.equal(adminPut.status, 403);

  // 租户1 正常删除私有模板
  const del1 = await request(app).delete(`/api/customer/card/templates/${tid}`).set('Authorization', `Bearer ${tenant1Token}`);
  assert.equal(del1.status, 200);
});

test('T4 模板主题配置：themeConfig 结构化返回，C 端可应用', async () => {
  const t = await request(app)
    .post('/api/admin/card/templates')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '深空黑', themeConfig: { primary: '#1d2129', background: '#0b0e14', radius: 12 } });
  assert.equal(t.status, 200);
  assert.deepEqual(t.body.template.themeConfig, { primary: '#1d2129', background: '#0b0e14', radius: 12 });

  const list = await request(app).get('/api/customer/card/templates').set('Authorization', `Bearer ${tenant1Token}`);
  const dark = list.body.templates.find((x) => x.name === '深空黑');
  assert.ok(dark && dark.themeConfig.primary === '#1d2129', '租户市场含平台模板主题配置');
});
