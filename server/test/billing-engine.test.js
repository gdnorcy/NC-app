/**
 * P4 计费引擎测试（第二批）
 * - P4-01 套餐种子与列表
 * - P4-02 套餐创建/编辑/删除（含内置保护）
 * - P4-03 租户当前套餐+用量统计
 * - P4-04 订阅订单创建→支付成功→套餐开通（valid_until 延长）
 * - P4-05 续费订单（到期日顺延）
 * - P4-06 升级订单（切换套餐不延长）
 * - P4-07 发票申请（仅已支付订单、防重复）→ 平台开票/驳回
 * - P4-08 配额校验：场景超限拦截
 * - P4-09 配额校验：集市上架超限拦截
 * - P4-10 未认证 401 / 跨租户隔离
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';
import { listBillingPlans, getTenantBillingPlan, getTenantUsage, applySubscription, createInvoice } from '../src/services/billing.js';
import { PaymentService } from '../src/services/payment.js';

let tmpDir, dbPath, db, app, server;
let adminToken, tenantToken;

async function login(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  assert.equal(res.status, 200);
  return res.body.token;
}

test.before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-test-'));
  dbPath = path.join(tmpDir, 'test.db');
  db = createDb(dbPath);

  // 种子租户管理员（租户1由迁移默认创建 id=1）
  const { hash, salt } = hashPassword('admin123');
  const exists = db.prepare("SELECT id FROM users WHERE username = 'tenant1'").get();
  if (!exists) {
    db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
      .run('tenant1', '13800000001', hash, salt, 'tenant_admin', 'active', 1);
  }

  // 默认租户（免费版）与平台管理员
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

test('P4-01 套餐种子与列表', () => {
  const plans = listBillingPlans(db);
  assert.ok(plans.length >= 3);
  const free = plans.find((p) => p.code === 'free');
  assert.equal(free.price, 0);
  assert.ok(free.quotas.max_individuals >= 1);
  assert.equal(free.features.market_enabled, false);
});

test('P4-02 套餐创建/编辑/删除（内置保护）', async () => {
  const created = await request(app)
    .post('/api/admin/billing-plans')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ code: 'trial', name: '试用版', price: 199, cycle: 'month', quotas: { max_individuals: 20 }, features: { market_enabled: true } });
  assert.equal(created.status, 201);
  const pid = created.body.plan.id;

  const dup = await request(app)
    .post('/api/admin/billing-plans')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ code: 'trial', name: '重复' });
  assert.equal(dup.status, 400);

  const edited = await request(app)
    .put(`/api/admin/billing-plans/${pid}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '试用版Pro', price: 299 });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.plan.name, '试用版Pro');

  // 内置免费版不可删除
  const freeId = listBillingPlans(db, { enabledOnly: false }).find((p) => p.code === 'free').id;
  const delFree = await request(app)
    .delete(`/api/admin/billing-plans/${freeId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(delFree.status, 400);

  const del = await request(app)
    .delete(`/api/admin/billing-plans/${pid}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(del.status, 200);
});

test('P4-03 租户当前套餐+用量统计', async () => {
  const res = await request(app)
    .get('/api/customer/billing/plan')
    .set('Authorization', `Bearer ${tenantToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.plan.code, 'free');
  assert.ok('usage' in res.body);
  assert.ok('individuals' in res.body.usage);
  assert.ok('scenes' in res.body.usage);
});

test('P4-04 订阅订单→支付→套餐开通（valid_until 延长）', async () => {
  const pro = listBillingPlans(db).find((p) => p.code === 'pro');
  const before = db.prepare('SELECT valid_until FROM projects WHERE id = 1').get().valid_until;

  const orderRes = await request(app)
    .post('/api/customer/billing/purchase')
    .set('Authorization', `Bearer ${tenantToken}`)
    .send({ planId: pro.id, action: 'subscribe' });
  assert.equal(orderRes.status, 200);
  const orderNo = orderRes.body.order.orderNo;

  // 模拟支付
  const payRes = await request(app)
    .post('/api/payment/mock-pay')
    .set('Authorization', `Bearer ${tenantToken}`)
    .send({ orderNo });
  assert.equal(payRes.status, 200);
  assert.ok(payRes.body.subscription);
  assert.equal(payRes.body.subscription.planName, pro.name);

  const after = db.prepare('SELECT valid_until, billing_plan_id FROM projects WHERE id = 1').get();
  assert.equal(after.billing_plan_id, pro.id);
  assert.ok(after.valid_until && after.valid_until > (before || '0000-00-00'), '到期日应延长');

  // 审计日志
  const logs = db.prepare("SELECT COUNT(*) AS n FROM operation_logs WHERE action = 'create_subscription_order'").get().n;
  assert.ok(logs >= 1);
});

test('P4-05 续费订单（到期日顺延）', async () => {
  const pro = listBillingPlans(db).find((p) => p.code === 'pro');
  const p1 = db.prepare('SELECT valid_until FROM projects WHERE id = 1').get().valid_until;

  const orderRes = await request(app)
    .post('/api/customer/billing/purchase')
    .set('Authorization', `Bearer ${tenantToken}`)
    .send({ planId: pro.id, action: 'renew' });
  const payRes = await request(app)
    .post('/api/payment/mock-pay')
    .set('Authorization', `Bearer ${tenantToken}`)
    .send({ orderNo: orderRes.body.order.orderNo });
  assert.equal(payRes.status, 200);

  const p2 = db.prepare('SELECT valid_until FROM projects WHERE id = 1').get().valid_until;
  assert.ok(p2 && p2 > (p1 || '0000-00-00'), '续费后到期日应继续顺延');
});

test('P4-06 升级订单（切换套餐不延长）', async () => {
  const pro = listBillingPlans(db).find((p) => p.code === 'pro');
  const flagship = listBillingPlans(db).find((p) => p.code === 'flagship');
  const p1 = db.prepare('SELECT valid_until, billing_plan_id FROM projects WHERE id = 1').get();

  const orderRes = await request(app)
    .post('/api/customer/billing/purchase')
    .set('Authorization', `Bearer ${tenantToken}`)
    .send({ planId: flagship.id, action: 'upgrade' });
  const payRes = await request(app)
    .post('/api/payment/mock-pay')
    .set('Authorization', `Bearer ${tenantToken}`)
    .send({ orderNo: orderRes.body.order.orderNo });
  assert.equal(payRes.status, 200);

  const p2 = db.prepare('SELECT valid_until, billing_plan_id FROM projects WHERE id = 1').get();
  assert.equal(p2.billing_plan_id, flagship.id);
  assert.equal(p2.valid_until, p1.valid_until, '升级不应延长到期日');
});

test('P4-07 发票申请（仅已支付、防重复）→ 平台开票/驳回', async () => {
  // 建一笔已支付订单
  const order = new PaymentService(db).createOrder({
    payerType: 'platform', customerId: 1, userId: 1, productType: 'subscription',
    productId: '1', productName: '测试', amount: 999,
  });
  new PaymentService(db).markPaid(order.orderNo, 'TXN_TEST');

  const apply = await request(app)
    .post('/api/customer/billing/invoices')
    .set('Authorization', `Bearer ${tenantToken}`)
    .send({ orderId: order.id, title: '东莞市某某科技有限公司', taxNo: '91441900XXXX' });
  assert.equal(apply.status, 201);
  const invId = apply.body.invoice.id;

  // 防重复
  const dup = await request(app)
    .post('/api/customer/billing/invoices')
    .set('Authorization', `Bearer ${tenantToken}`)
    .send({ orderId: order.id, title: '重复' });
  assert.equal(dup.status, 400);

  // 平台开票
  const issue = await request(app)
    .post(`/api/admin/invoices/${invId}/issue`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(issue.status, 200);
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invId);
  assert.equal(inv.status, 'issued');
});

test('P4-08 配额校验：场景超限拦截', async () => {
  // 租户2 免费版 max_scenes=5：预置5个场景再创建应 403
  db.prepare(`INSERT INTO projects (customer_name, invite_code, solutions, quota, billing_plan_id) VALUES ('配额测试租户', 'QUOTA1', '["panorama"]', '{}', 1)`).run();
  const cid = db.prepare("SELECT id FROM projects WHERE invite_code = 'QUOTA1'").get().id;
  db.prepare("INSERT INTO plans (project_id, name) VALUES (?, '方案A')").run(cid);
  const planId = db.prepare('SELECT id FROM plans WHERE project_id = ?').get(cid).id;
  for (let i = 0; i < 5; i++) {
    db.prepare("INSERT INTO scenes (plan_id, title, image_path) VALUES (?, ?, '')").run(planId, `场景${i}`);
  }
  // 以管理员登录该租户（租户后台认证用 username=租户用户名，这里直接用服务层校验场景创建配额）
  const usage = getTenantUsage(db, cid);
  assert.equal(usage.scenes, 5);
  const q = (await import('../src/services/billing.js')).checkTenantQuota(db, cid, 'max_scenes');
  assert.equal(q.ok, false);
});

test('P4-09 配额校验：集市上架超限拦截', async () => {
  const cid = db.prepare("SELECT id FROM projects WHERE invite_code = 'QUOTA1'").get().id;
  const q = (await import('../src/services/billing.js')).checkTenantQuota(db, cid, 'max_market_items');
  // 免费版 10 条，当前 0，加 10 条以内 ok
  assert.equal(q.ok, true);
  assert.equal(q.limit, 10);
});

test('P4-10 未认证 401 / 跨租户隔离', async () => {
  const noAuth = await request(app).get('/api/customer/billing/plan');
  assert.equal(noAuth.status, 401);
  const noAuthAdmin = await request(app).get('/api/admin/billing-plans');
  assert.equal(noAuthAdmin.status, 401);
  // 发票申请不能提交不存在的订单（跨租户：订单归属校验）
  const cross = await request(app)
    .post('/api/customer/billing/invoices')
    .set('Authorization', `Bearer ${tenantToken}`)
    .send({ orderId: 999999, title: 'X' });
  assert.equal(cross.status, 400);
});

test('P4-11 客户账单/发票金额与订单单位一致（元）', async () => {
  // 购买专业版并支付
  const pro = db.prepare("SELECT * FROM billing_plans WHERE code='pro'").get();
  const buy = await request(app)
    .post('/api/customer/billing/purchase')
    .set('Authorization', `Bearer ${tenantToken}`)
    .send({ planId: pro.id, action: 'subscribe' });
  assert.equal(buy.status, 200);
  const pay = await request(app)
    .post('/api/payment/mock-pay')
    .set('Authorization', `Bearer ${tenantToken}`)
    .send({ orderNo: buy.body.order.orderNo });
  assert.equal(pay.body.order.status, 'paid');

  // 账单列表包含该订阅订单，金额=套餐价（元）
  const list = await request(app)
    .get('/api/customer/orders')
    .set('Authorization', `Bearer ${tenantToken}`);
  assert.equal(list.status, 200);
  const sub = list.body.orders.find((o) => o.orderNo === buy.body.order.orderNo);
  assert.ok(sub, '账单应包含订阅订单');
  assert.equal(sub.amount, pro.price, '账单金额应与套餐价格一致（元）');
  assert.equal(sub.productName, '专业版（开通）');

  // 开票金额与订单一致（元，不除100）
  const apply = await request(app)
    .post('/api/customer/billing/invoices')
    .set('Authorization', `Bearer ${tenantToken}`)
    .send({ orderId: sub.id, title: '金额校验公司' });
  assert.equal(apply.status, 201);
  assert.equal(apply.body.invoice.amount, pro.price, '发票金额应与订单一致（元）');
});
