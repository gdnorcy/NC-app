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
import { checkTenantSolutionQuota, applySolutionSubscription } from '../src/services/billing.js';

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

test('Q7 方案购买支付成功回调 applySolutionSubscription', () => {
  // 构造方案订阅订单（simulate billing.js solution-purchase 产物）
  const demo = db.prepare("SELECT id FROM solutions WHERE code = 'demo'").get();
  // 准备一个干净租户
  const r = db.prepare("INSERT INTO projects (customer_name, status, solutions) VALUES ('配额测试租户', 'active', '[]')").run();
  const cid = r.lastInsertRowid;

  // subscribe 12 个月：写入 solutions + 延长有效期
  let sub = applySolutionSubscription(db, {
    customerId: cid, productType: 'subscription',
    solution: 'demo', remark: 'solution:demo:12',
  });
  assert.ok(sub, 'subscribe 应返回结果');
  assert.equal(sub.solutionCode, 'demo');
  let proj = db.prepare('SELECT solutions, valid_until FROM projects WHERE id = ?').get(cid);
  assert.deepEqual(JSON.parse(proj.solutions), ['demo'], '方案 code 应写入 solutions');
  assert.ok(proj.valid_until && proj.valid_until > new Date().toISOString().slice(0, 10), '有效期应延长到未来');

  // renew 幂等：不重复写入 code
  const before = proj.valid_until;
  sub = applySolutionSubscription(db, {
    customerId: cid, productType: 'subscription_renew',
    solution: 'demo', remark: 'solution:demo:12',
  });
  proj = db.prepare('SELECT solutions, valid_until FROM projects WHERE id = ?').get(cid);
  assert.deepEqual(JSON.parse(proj.solutions), ['demo'], '重复开通不应重复写入');
  assert.ok(proj.valid_until > before, 'renew 应从到期日继续延长');

  // 永久档（months=0）：valid_until 清空
  applySolutionSubscription(db, {
    customerId: cid, productType: 'subscription',
    solution: 'demo', remark: 'solution:demo:0',
  });
  proj = db.prepare('SELECT valid_until FROM projects WHERE id = ?').get(cid);
  assert.equal(proj.valid_until, null, '永久档应清空有效期');

  // 非法 remark / 不存在方案 → null（不报错）
  assert.equal(applySolutionSubscription(db, { customerId: cid, remark: 'foo' }), null);
});

test('Q8 新增配额项校验接入点：memberCount / planCount', async () => {
  bindSolutions(1, ['demo']);
  upsertQuota(3, 'card', 'memberCount', '入驻个人数', 2);
  upsertQuota(3, 'panorama', 'planCount', '方案数', 1);

  // 函数级：memberCount 已用 0，限 2 → 通过
  let q = checkTenantSolutionQuota(db, 1, 'card', 'memberCount');
  assert.equal(q.ok, true);
  assert.equal(q.limit, 2);

  // planCount：现有方案数 >= 1 时创建第 2 个被拦（used 来自 plans 表）
  q = checkTenantSolutionQuota(db, 1, 'panorama', 'planCount');
  assert.equal(q.limit, 1);
  assert.equal(q.ok, false, '方案数已达 1，创建第 2 个方案应被拦');

  // 清理
  db.prepare("DELETE FROM solution_quotas WHERE solution_id = 3 AND key = 'memberCount'").run();
  db.prepare("DELETE FROM solution_quotas WHERE solution_id = 3 AND key = 'planCount'").run();
});

test('Q9 方案下架（status=off）后已购租户配额仍生效', () => {
  bindSolutions(1, ['demo']);
  // 模拟方案被下架
  db.prepare("UPDATE solutions SET status = 'off', updated_at = datetime('now') WHERE code = 'demo'").run();
  upsertQuota(3, 'card', 'employeeCount', '企业员工人数', 3);
  const q = checkTenantSolutionQuota(db, 1, 'card', 'employeeCount');
  assert.equal(q.ok, true, '方案下架后已购租户权益应保留（限制仍生效）');
  assert.equal(q.limit, 3);
  // 还原
  db.prepare("UPDATE solutions SET status = 'on', updated_at = datetime('now') WHERE code = 'demo'").run();
  db.prepare("DELETE FROM solution_quotas WHERE solution_id = 3 AND key = 'employeeCount'").run();
});

test('Q10 到期策略：adminExpireMode=allow 只读放行（GET过/POST拦），deny 拦截', async () => {
  // 新租户 + 租户管理员账号
  const r = db.prepare("INSERT INTO projects (customer_name, status, valid_until, config) VALUES ('到期策略租户', 'active', '2000-01-01', '{}')").run();
  const cid = r.lastInsertRowid;
  db.prepare("UPDATE projects SET config = ? WHERE id = ?").run(JSON.stringify({ adminExpireMode: 'allow', miniExpireMode: 'prompt', selfRenew: true }), cid);
  const uname = `exp_${Date.now()}`;
  const { hash, salt } = hashPassword('x123456');
  const up = db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run(uname, '139' + String(Date.now()).slice(-8), hash, salt, 'tenant_admin', 'active', cid);
  const token = await login(uname, 'x123456');

  // allow：GET /tenant/status 放行且 readonly=true
  const st = await request(app).get('/api/customer/tenant/status').set('Authorization', `Bearer ${token}`);
  assert.equal(st.status, 200);
  assert.equal(st.body.expired, true);
  assert.equal(st.body.readonly, true, 'allow 模式应标记只读');
  assert.equal(st.body.selfRenew, true);

  // GET 业务接口放行
  const plans = await request(app).get('/api/customer/plans').set('Authorization', `Bearer ${token}`);
  assert.equal(plans.status, 200, '只读模式 GET 应放行');

  // POST 写操作被拦
  const create = await request(app).post('/api/customer/plans').set('Authorization', `Bearer ${token}`).send({ name: '只读测试方案' });
  assert.equal(create.status, 403, '只读模式写操作应拒绝');
  assert.match(create.body.error, /只读/, '错误应提示只读');

  // deny：管理后台拦截
  db.prepare("UPDATE projects SET config = ? WHERE id = ?").run(JSON.stringify({ adminExpireMode: 'deny', miniExpireMode: 'prompt', selfRenew: true }), cid);
  const st2 = await request(app).get('/api/customer/tenant/status').set('Authorization', `Bearer ${token}`);
  assert.equal(st2.status, 200);
  assert.equal(st2.body.readonly, false, 'deny 模式非只读（直接拦截）');
  const blocked = await request(app).get('/api/customer/plans').set('Authorization', `Bearer ${token}`);
  assert.equal(blocked.status, 403, 'deny 模式 GET 也应拦截');
  assert.match(blocked.body.error, /到期/);
});

test('Q11 到期策略：miniExpireMode=prompt C端只读放行 / deny 拦截', async () => {
  const r = db.prepare("INSERT INTO projects (customer_name, status, valid_until, config) VALUES ('C端到期租户', 'active', '2000-01-01', ?)").run(JSON.stringify({ adminExpireMode: 'deny', miniExpireMode: 'prompt', selfRenew: false }));
  const cid = r.lastInsertRowid;
  const pu = db.prepare("INSERT INTO platform_user (openid, nickname, status, customer_id, identity_type) VALUES (?, ?, 'active', ?, 'individual')").run(`wx_${Date.now()}`, '到期测试用户', cid);
  const pToken = Buffer.from(JSON.stringify({ uid: pu.lastInsertRowid })).toString('base64') + '.sig';
  // C端 GET（集市，走 tenant 中间件）：prompt 放行
  const get = await request(app).get('/api/card-market/market/my-status').set('Authorization', `Bearer ${pToken}`);
  assert.equal(get.status, 200, 'prompt 模式 C端 GET 应放行');
  // C端写（集市上架开关）：拒绝（只读）
  const post = await request(app).post('/api/card-market/market/toggle').set('Authorization', `Bearer ${pToken}`).send({ subjectType: 'individual', subjectId: 1 });
  assert.equal(post.status, 403, 'prompt 模式 C端写操作应拒绝');
  assert.match(post.body.error, /只读/);

  // deny：C端也拦截（GET 也拒绝）
  db.prepare("UPDATE projects SET config = ? WHERE id = ?").run(JSON.stringify({ adminExpireMode: 'deny', miniExpireMode: 'deny', selfRenew: false }), cid);
  const get2 = await request(app).get('/api/card-market/market/my-status').set('Authorization', `Bearer ${pToken}`);
  assert.equal(get2.status, 403, 'deny 模式 C端 GET 应拦截');
});
