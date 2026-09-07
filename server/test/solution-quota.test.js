/**
 * 方案配额（solution_quotas 新体系）校验测试
 * - Q1 未绑定方案 → 不限
 * - Q2 绑定方案但未配置配额项 → 不限
 * - Q3 配置 employeeCount(enabled, value=3) → 员工数 < 3 通过、>= 3 拦截
 * - Q4 配置 value=0 → 不限（0=未设置）
 * - Q5 多方案取最大限制
 * - Q6 解决方案资产接口：废弃配额项已移除、新增企业员工人数
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';
import { checkTenantSolutionQuota } from '../src/services/billing.js';

let tmpDir, dbPath, db, app, server;
let adminToken, tenantToken;

async function login(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  assert.equal(res.status, 200);
  return res.body.token;
}

/** 创建/更新租户项目绑定的方案 code 数组 */
function bindSolutions(customerId, codes) {
  db.prepare("UPDATE projects SET solutions = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(codes), customerId);
}

/** 为方案设置指定配额项 */
function upsertQuota(solutionId, appCode, key, label, value, enabled = 1) {
  db.prepare(`INSERT INTO solution_quotas (solution_id, app_code, key, label, value, enabled)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(solution_id, app_code, key) DO UPDATE SET value = excluded.value, enabled = excluded.enabled`)
    .run(solutionId, appCode, key, label, value, enabled);
}

test.before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-test-'));
  dbPath = path.join(tmpDir, 'test.db');
  db = createDb(dbPath);

  const { hash, salt } = hashPassword('admin123');
  const exists = db.prepare("SELECT id FROM users WHERE username = 'tenant1'").get();
  if (!exists) {
    db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
      .run('tenant1', '13800000001', hash, salt, 'tenant_admin', 'active', 1);
  }

  app = createApp({ db });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  adminToken = await login('admin', 'admin123');
  tenantToken = await login('tenant1', 'admin123');
});

test.after(() => {
  server?.close();
  db?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Q1 未绑定方案 → 不限', () => {
  // 清空绑定，确保 demo 方案默认不干扰
  bindSolutions(1, []);
  const q = checkTenantSolutionQuota(db, 1, 'card', 'employeeCount');
  assert.equal(q.ok, true);
});

test('Q2 绑定方案但未配置配额项 → 不限', () => {
  // demo 方案（code=demo）种子未配置 planCount（零壹系统云·方案数）
  bindSolutions(1, ['demo']);
  const q = checkTenantSolutionQuota(db, 1, 'panorama', 'planCount');
  assert.equal(q.ok, true);
});

test('Q2.5 演示方案默认配额种子：企业1/员工10/集市10/场景3', async () => {
  const demo = db.prepare("SELECT id FROM solutions WHERE code = 'demo'").get();
  assert.ok(demo, 'demo 方案应存在');
  const res = await request(app)
    .get(`/api/admin/solutions/${demo.id}/assets`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  const get = (appCode, key) => res.body.assets.quotas.find((g) => g.appCode === appCode).items.find((i) => i.key === key);
  assert.equal(get('card', 'enterpriseCount').value, 1, '入驻企业数默认 1');
  assert.equal(get('card', 'employeeCount').value, 10, '企业员工人数默认 10');
  assert.equal(get('card', 'marketItems').value, 10, '集市上架默认 10');
  assert.equal(get('card', 'marketItems').label, '集市上架');
  assert.equal(get('panorama', 'sceneCount').value, 3, '场景数默认 3');

  bindSolutions(1, ['demo']);
  const mq = checkTenantSolutionQuota(db, 1, 'card', 'marketItems');
  assert.equal(mq.limit, 10, '集市上架限制应读取为 10');
  assert.equal(mq.ok, true);
  const sq = checkTenantSolutionQuota(db, 1, 'panorama', 'sceneCount');
  assert.equal(sq.limit, 3, '场景数限制应读取为 3');
});

test('Q3 配置 employeeCount=3：未满放行、满员拦截', async () => {
  const demo = db.prepare("SELECT id FROM solutions WHERE code = 'demo'").get();
  assert.ok(demo, 'demo 方案应存在');
  upsertQuota(demo.id, 'card', 'employeeCount', '企业员工人数', 3, 1);
  bindSolutions(1, ['demo']);

  // 当前无 active 员工 → 增加 1 人通过
  let q = checkTenantSolutionQuota(db, 1, 'card', 'employeeCount', 1);
  assert.equal(q.ok, true);

  // 插入 3 个 active 员工（达到上限）
  for (let i = 0; i < 3; i++) {
    db.prepare(`INSERT INTO tenant_enterprise_employees (enterprise_id, customer_id, user_id, name, role, status)
      VALUES (1, 1, ?, ?, 'member', 'active')`).run(900 + i, `员工${i}`);
  }
  q = checkTenantSolutionQuota(db, 1, 'card', 'employeeCount', 1);
  assert.equal(q.ok, false);
  assert.equal(q.limit, 3);
  assert.equal(q.used, 3);

  // 清理测试员工
  db.prepare('DELETE FROM tenant_enterprise_employees WHERE user_id >= 900').run();
});

test('Q4 配置 value=0 → 不限（0 表示未设置）', async () => {
  const demo = db.prepare("SELECT id FROM solutions WHERE code = 'demo'").get();
  upsertQuota(demo.id, 'card', 'employeeCount', '企业员工人数', 0, 1);
  bindSolutions(1, ['demo']);
  const q = checkTenantSolutionQuota(db, 1, 'card', 'employeeCount', 1);
  assert.equal(q.ok, true);
});

test('Q5 多方案取最大限制', async () => {
  const demo = db.prepare("SELECT id FROM solutions WHERE code = 'demo'").get();
  upsertQuota(demo.id, 'card', 'employeeCount', '企业员工人数', 2, 1);

  // 再建一个测试方案 a/b 各配不同值
  const solA = db.prepare("SELECT id FROM solutions WHERE code = 'quotaA'").get();
  const solB = db.prepare("SELECT id FROM solutions WHERE code = 'quotaB'").get();
  const sa = solA?.id || db.prepare("INSERT INTO solutions (name, code, description, status) VALUES ('配额A','quotaA','','on')").run().lastInsertRowid;
  const sb = solB?.id || db.prepare("INSERT INTO solutions (name, code, description, status) VALUES ('配额B','quotaB','','on')").run().lastInsertRowid;
  upsertQuota(sa, 'card', 'employeeCount', '企业员工人数', 5, 1);
  upsertQuota(sb, 'card', 'employeeCount', '企业员工人数', 8, 1);

  bindSolutions(1, ['quotaA', 'quotaB']);
  db.prepare(`INSERT INTO tenant_enterprise_employees (enterprise_id, customer_id, user_id, name, role, status)
    VALUES (1, 1, 990, '员工', 'member', 'active')`).run();
  // used=1，quotaA 限制 5 可通过，但取最大 8，也通过
  let q = checkTenantSolutionQuota(db, 1, 'card', 'employeeCount', 7);
  assert.equal(q.ok, true, '最大限制 8，增加 7 人应通过');
  q = checkTenantSolutionQuota(db, 1, 'card', 'employeeCount', 8);
  assert.equal(q.ok, false, '超过最大限制 8 应拦截');
  db.prepare('DELETE FROM tenant_enterprise_employees WHERE user_id = 990').run();
  bindSolutions(1, []);
});

test('Q6 解决方案资产接口：废弃项移除、企业员工人数在列', async () => {
  // 先向 demo 方案写入废弃配额记录，验证接口不返回
  const demo = db.prepare("SELECT id FROM solutions WHERE code = 'demo'").get();
  upsertQuota(demo.id, 'card', 'cardCount', '名片创建数', 10, 1);
  upsertQuota(demo.id, 'card', 'storageMb', '存储空间(MB)', 50, 1);
  upsertQuota(demo.id, 'card', 'aiCredits', 'AI生成次数', 5, 1);

  const res = await request(app)
    .get(`/api/admin/solutions/${demo.id}/assets`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  const card = res.body.assets.quotas.find((g) => g.appCode === 'card');
  assert.ok(card, '智能名片配额组应存在');
  const keys = card.items.map((i) => i.key);
  assert.ok(!keys.includes('cardCount'), '不应包含 名片创建数');
  assert.ok(!keys.includes('storageMb'), '不应包含 存储空间(MB)');
  assert.ok(!keys.includes('aiCredits'), '不应包含 AI生成次数');
  assert.ok(keys.includes('employeeCount'), '应包含 企业员工人数');
  const emp = card.items.find((i) => i.key === 'employeeCount');
  assert.equal(emp.label, '企业员工人数');

  const pano = res.body.assets.quotas.find((g) => g.appCode === 'panorama');
  assert.ok(pano, '360全景配额组应存在');
  assert.equal(pano.appName, '360全景', '应用名应为 360全景，不得写为平台名');
  assert.ok(!pano.items.some((i) => i.key === 'storageMb'), '360全景不应包含存储空间');
});
