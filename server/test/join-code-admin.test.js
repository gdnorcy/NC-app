import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { issueToken } from '../src/auth.js';
import { hashPassword, createDb } from '../src/db.js';

/**
 * 第21轮：入驻兑换码 · 租户后台管理接口回归锁
 *
 * 覆盖「生成 → 列表 → 作废 → 导出」四条管理链路，以及两条安全红线：
 *   ① 租户隔离：A 租户的码 B 租户看不见也改不动
 *   ② 已核销的码不可作废（那是既成事实，作废会把审计链路抹掉）
 */

let app;
let tmpDir;
let db;
let admToken;
let adm2Token;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-joincode-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  app = createApp();
  db = createDb(config.dbPath);

  admToken = issueToken(makeAdmin(1, 'jc_adm_1', '13800000001'));
  // 第二个租户（隔离测试用）
  const has2 = db.prepare('SELECT id FROM projects WHERE id = 2').get();
  if (!has2) {
    db.prepare("INSERT INTO projects (id, customer_name, description, status, invite_code, solutions) VALUES (2, '二号租户', '', 'active', '2002', '[\"card\"]')").run();
  }
  adm2Token = issueToken(makeAdmin(2, 'jc_adm_2', '13800000002'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeAdmin(customerId, username, phone) {
  const { hash, salt } = hashPassword('Test@123');
  const info = db.prepare(
    'INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)'
  ).run(username, phone, hash, salt, 'tenant_admin', 'active', customerId);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

const as = (token) => ({
  get: (u, q) => {
    const r = request(app).get(u).set('Authorization', `Bearer ${token}`);
    return q ? r.query(q) : r;
  },
  post: (u, b) => request(app).post(u).set('Authorization', `Bearer ${token}`).send(b || {}),
});

test('未登录访问兑换码管理接口返回 401', async () => {
  const r = await request(app).get('/api/customer/join-code/stats');
  assert.equal(r.status, 401);
});

test('批量生成：返回 N 个码，全部未使用，批次统计对齐', async () => {
  const api = as(admToken);
  const before = await api.get('/api/customer/join-code/stats');
  const r = await api.post('/api/customer/join-code/batches', {
    name: '十月活动', count: 12, length: 10, remark: '线下派发', applyType: 'individual',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 12);
  assert.equal(r.body.codes.length, 12);
  assert.equal(new Set(r.body.codes).size, 12, '同批次不允许重复码');
  for (const c of r.body.codes) {
    assert.match(c, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/, `码含易混淆字符或长度不对：${c}`);
  }

  const after = await api.get('/api/customer/join-code/stats');
  assert.equal(after.body.total, before.body.total + 12);
  assert.equal(after.body.unused, before.body.unused + 12);

  const batches = await api.get('/api/customer/join-code/batches');
  const b = batches.body.find((x) => x.id === r.body.id);
  assert.equal(b.name, '十月活动');
  assert.equal(b.total, 12);
  assert.equal(b.unused, 12);
  assert.equal(b.applyType, 'individual');
});

test('列表：分页 + 状态筛选 + 模糊搜索', async () => {
  const api = as(admToken);
  const all = await api.get('/api/customer/join-code/codes', { pageSize: 5, page: 1 });
  assert.equal(all.body.list.length, 5);
  assert.ok(all.body.total >= 12);

  // 状态筛选：已作废当前应为 0 条
  const voided = await api.get('/api/customer/join-code/codes', { status: 3, pageSize: 50 });
  assert.equal(voided.body.total, 0);

  // 模糊搜索：拿第一个码的前 4 位去搜
  const first = all.body.list[0].code.slice(0, 4);
  const kw = await api.get('/api/customer/join-code/codes', { key: first, pageSize: 50 });
  assert.ok(kw.body.total >= 1);
  assert.ok(kw.body.list.every((r) => r.code.includes(first)));
});

test('单个作废：未使用 → 已作废；已核销的不可作废', async () => {
  const api = as(admToken);
  const gen = await api.post('/api/customer/join-code/batches', { name: '作废测试', count: 2 });
  const list = await api.get('/api/customer/join-code/codes', { batchId: gen.body.id, pageSize: 50 });
  const [a, b] = list.body.list;

  const ok = await api.post(`/api/customer/join-code/codes/${a.id}/void`);
  assert.equal(ok.status, 200);

  // 已作废不能再作废
  const again = await api.post(`/api/customer/join-code/codes/${a.id}/void`);
  assert.equal(again.status, 400);

  // 造一个已核销的码，确认不可作废
  db.prepare("UPDATE tenant_join_code SET status = 2 WHERE id = ?").run(b.id);
  const no = await api.post(`/api/customer/join-code/codes/${b.id}/void`);
  assert.equal(no.status, 400);
  assert.match(no.body.error, /已核销的兑换码不可作废/);

  const after = await api.get('/api/customer/join-code/codes', { batchId: gen.body.id, pageSize: 50 });
  const byId = Object.fromEntries(after.body.list.map((r) => [r.id, r.status]));
  assert.equal(byId[a.id], 3);
  assert.equal(byId[b.id], 2);
});

test('批量作废：只作废未使用/已占用，跳过已核销', async () => {
  const api = as(admToken);
  const gen = await api.post('/api/customer/join-code/batches', { name: '批量作废', count: 4 });
  const list = await api.get('/api/customer/join-code/codes', { batchId: gen.body.id, pageSize: 50 });
  const ids = list.body.list.map((r) => r.id);
  db.prepare(`UPDATE tenant_join_code SET status = 2 WHERE id = ?`).run(ids[0]); // 已核销：应被跳过

  const r = await api.post('/api/customer/join-code/codes/batch-void', { ids });
  assert.equal(r.status, 200);
  assert.equal(r.body.voided, 3, '已核销的 1 个应被跳过');

  const after = await api.get('/api/customer/join-code/codes', { batchId: gen.body.id, pageSize: 50 });
  const byId = Object.fromEntries(after.body.list.map((x) => [x.id, x.status]));
  assert.equal(byId[ids[0]], 2);
  for (const id of ids.slice(1)) assert.equal(byId[id], 3);
});

test('导出：默认只出未使用的码', async () => {
  const api = as(admToken);
  const gen = await api.post('/api/customer/join-code/batches', { name: '导出测试', count: 3 });
  const list = await api.get('/api/customer/join-code/codes', { batchId: gen.body.id, pageSize: 50 });
  db.prepare('UPDATE tenant_join_code SET status = 3 WHERE id = ?').run(list.body.list[0].id);

  const exp = await api.get('/api/customer/join-code/codes/export', { batchId: gen.body.id });
  assert.equal(exp.body.total, 2);
  assert.deepEqual(exp.body.codes.sort(), list.body.list.slice(1).map((r) => r.code).sort());
});

test('租户隔离：二号租户看不到也改不动一号租户的码', async () => {
  const api1 = as(admToken);
  const api2 = as(adm2Token);

  const gen = await api1.post('/api/customer/join-code/batches', { name: '隔离测试', count: 3 });
  const list1 = await api1.get('/api/customer/join-code/codes', { batchId: gen.body.id, pageSize: 50 });
  const id = list1.body.list[0].id;

  const seen = await api2.get('/api/customer/join-code/codes', { batchId: gen.body.id, pageSize: 50 });
  assert.equal(seen.body.total, 0, '跨租户列表必须为空');

  const steal = await api2.post(`/api/customer/join-code/codes/${id}/void`);
  assert.equal(steal.status, 404, '跨租户作废必须 404（不能泄露存在性之外的信息）');

  const still = await api1.get('/api/customer/join-code/codes', { batchId: gen.body.id, status: 0, pageSize: 50 });
  assert.equal(still.body.total, 3, '被跨租户尝试后仍应完好');
});

test('本轮范围锁：企业/员工兑换码不允许生成（模型还没切）', async () => {
  const api = as(admToken);
  const r = await api.post('/api/customer/join-code/batches', { name: '企业码', count: 1, applyType: 'enterprise' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /仅支持生成个人入驻兑换码/);
});

test('有效期格式校验：非 YYYY-MM-DD 拒绝', async () => {
  const api = as(admToken);
  const r = await api.post('/api/customer/join-code/batches', { name: '坏日期', count: 1, expiresAt: '2026/10/24' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /有效期格式/);
});
