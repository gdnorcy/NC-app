import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';
import { issueToken } from '../src/auth.js';

/**
 * 智能名片 SaaS 审计（P0-P2）回归测试
 * 覆盖：租户隔离 / 口令安全与审计 / 双公海回收闭环 / 交换快照 / 双身份 / 未入驻拦截
 */
let app;
let tmpDir;
let db; // 直连数据库（构造数据用）

function makeJwt(user) {
  return issueToken(user);
}

async function wxLogin(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200);
  return res.body.token;
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

// 模拟租户管理员审核通过（等价 apply/audit approve 的最终状态：active + 绑定租户 + 关联名片）
function approveApply(openid, customerId = 1) {
  const u = db.prepare('SELECT id FROM platform_user WHERE openid = ?').get('mock_' + openid);
  if (!u) throw new Error('no user ' + openid);
  const userId = u.id;
  const ind = db.prepare('SELECT id FROM tenant_individuals WHERE user_id = ? AND status = ? ORDER BY id DESC LIMIT 1').get(userId, 'pending');
  if (ind) {
    db.prepare("UPDATE tenant_individuals SET status = 'active' WHERE id = ?").run(ind.id);
    db.prepare("UPDATE platform_user SET customer_id = ?, identity_type = 'individual' WHERE id = ?").run(customerId, userId);
    db.prepare("UPDATE card_profile SET customer_id = ? WHERE user_id = ? AND (customer_id IS NULL OR customer_id = '')").run(customerId, userId);
    return { type: 'individual', id: ind.id, userId };
  }
  const ent = db.prepare('SELECT id FROM tenant_enterprises WHERE admin_user_id = ? AND status = ? ORDER BY id DESC LIMIT 1').get(userId, 'pending');
  if (ent) {
    db.prepare("UPDATE tenant_enterprises SET status = 'active' WHERE id = ?").run(ent.id);
    db.prepare("UPDATE tenant_enterprise_employees SET status = 'active' WHERE enterprise_id = ? AND role = 'admin'").run(ent.id);
    db.prepare("UPDATE platform_user SET customer_id = ?, identity_type = 'employee' WHERE id = ?").run(customerId, userId);
    db.prepare("UPDATE card_profile SET enterprise_id = ?, customer_id = ? WHERE user_id = ? AND card_type = 'company' AND (customer_id IS NULL OR customer_id = '')")
      .run(ent.id, customerId, userId);
    return { type: 'enterprise', id: ent.id, userId };
  }
  throw new Error('no pending apply for ' + openid);
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-card-saas-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });

  // 预置租户2（租户1由迁移默认创建，id=1, invite_code='1001'）
  db.prepare(`INSERT INTO projects (customer_name, description, status, invite_code, solutions)
    VALUES ('租户B', '', 'active', '2002', '["panorama","card"]')`).run();

  // 预置两个租户的管理员账号（JWT 走 comboAuth 的 requireAuth 分支）
  for (const [uname, phone, cid] of [['saas_adm1', '13800000001', 1], ['saas_adm2', '13800000002', 2]]) {
    const { hash, salt } = hashPassword('Test@123');
    db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
      .run(uname, phone, hash, salt, 'tenant_admin', 'active', cid);
  }
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('P0-1 未入驻用户访问租户域接口返回403', async () => {
  const token = await wxLogin('no_tenant_1');
  const res = await request(app).get('/api/card-market/individuals').set(bearer(token));
  assert.equal(res.status, 403);
  assert.match(res.body.error, /未入驻/);
});

test('P0-2 口令防枚举：用 project id 猜测口令无效，且真实口令可入驻并写入审计', async () => {
  const token = await wxLogin('invite_1');
  // 默认租户 project id=1，invite_code='1001'；用 '1' 猜测必须失败
  const guess = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set(bearer(token))
    .send({ name: '猜口令', bindCode: '1', applyType: 'individual' });
  assert.equal(guess.status, 400);
  assert.match(guess.body.error, /口令无效/);

  // 真实口令入驻成功
  const ok = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set(bearer(token))
    .send({ name: '口令用户', bindCode: '1001', applyType: 'individual' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.card.cardType, 'personal');

  // 审计日志存在
  const log = db.prepare('SELECT * FROM tenant_invite_log WHERE customer_id = 1 AND user_id = ?').get(ok.body.card.userId);
  assert.ok(log, '应写入口令使用审计');
  assert.equal(log.invite_code, '1001');
});

test('P0-3 租户隔离：跨租户交换请求被拒，各自列表互不可见', async () => {
  // 租户1成员（申请→管理员审核通过）
  const p1 = await wxLogin('iso_p1');
  await request(app).post('/api/card/cards/create-with-apply').set(bearer(p1)).send({ name: '租一甲', bindCode: '1001', applyType: 'individual' });
  approveApply('iso_p1', 1);
  // 租户2成员（申请→管理员审核通过）
  const p2 = await wxLogin('iso_p2');
  const r2 = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set(bearer(p2))
    .send({ name: '租二乙', bindCode: '2002', applyType: 'individual' });
  assert.equal(r2.status, 200);
  approveApply('iso_p2', 2);

  // 跨租户交换：租1的p1请求租2的p2 → 403
  const p2user = db.prepare("SELECT * FROM platform_user WHERE openid = 'mock_iso_p2'").get();
  const cross = await request(app)
    .post('/api/card-market/exchange/request')
    .set(bearer(p1))
    .send({ toUserId: p2user.id, message: 'hi' });
  assert.equal(cross.status, 403);
  assert.match(cross.body.error, /不在本客户项目/);

  // 租1管理员列表看不到租2成员
  const adm1 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();
  const list1 = await request(app).get('/api/card-market/individuals').set(bearer(makeJwt(adm1)));
  assert.equal(list1.status, 200);
  const names1 = list1.body.individuals.map((i) => i.name);
  assert.ok(names1.includes('租一甲'));
  assert.ok(!names1.includes('租二乙'), '租户1列表不得包含租户2成员');

  // 租2管理员列表只有租2成员
  const adm2 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 2").get();
  const list2 = await request(app).get('/api/card-market/individuals').set(bearer(makeJwt(adm2)));
  const names2 = list2.body.individuals.map((i) => i.name);
  assert.ok(names2.includes('租二乙'));
  assert.ok(!names2.includes('租一甲'), '租户2列表不得包含租户1成员');
});

test('P1-1 公海领取原子性：并发领取同一条客户仅一人成功', async () => {
  // 租1公海插入一条客户
  db.prepare(`INSERT INTO tenant_public_pool (customer_id, source_type, source_id, name, phone, company, position)
    VALUES (1, 'individual', 1, '公海客户', '13900001111', '某公司', '经理')`).run();

  // 租1两个活跃成员
  const a = await wxLogin('claim_a');
  await request(app).post('/api/card/cards/create-with-apply').set(bearer(a)).send({ name: '甲', bindCode: '1001', applyType: 'individual' });
  approveApply('claim_a', 1);
  const b = await wxLogin('claim_b');
  await request(app).post('/api/card/cards/create-with-apply').set(bearer(b)).send({ name: '乙', bindCode: '1001', applyType: 'individual' });
  approveApply('claim_b', 1);

  const poolRow = db.prepare("SELECT id FROM tenant_public_pool WHERE customer_id = 1 AND phone = '13900001111'").get();
  const [ra, rb] = await Promise.all([
    request(app).post(`/api/card-market/public-pool/${poolRow.id}/claim`).set(bearer(a)),
    request(app).post(`/api/card-market/public-pool/${poolRow.id}/claim`).set(bearer(b)),
  ]);
  const successes = [ra, rb].filter((r) => r.status === 200).length;
  assert.equal(successes, 1, '并发领取只能成功一人');
  assert.equal(ra.status + rb.status === 400 + 200 || ra.status + rb.status === 200 + 400, true);
  const afterRow = db.prepare('SELECT status, claimed_by FROM tenant_public_pool WHERE id = ?').get(poolRow.id);
  assert.equal(afterRow.status, 'claimed');
});

test('P1-2 个人停用完整回收链：客户回收租户公海、集市移除、租户解绑', async () => {
  // 准备个人+名下客户+上架集市
  const p = await wxLogin('disable_ind');
  const r = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set(bearer(p))
    .send({ name: '待停个人', bindCode: '1001', applyType: 'individual' });
  approveApply('disable_ind', 1);
  const uid = r.body.card.userId;
  const indId = db.prepare('SELECT id FROM tenant_individuals WHERE user_id = ? AND customer_id = 1').get(uid).id;
  db.prepare(`INSERT INTO card_customer (customer_id, owner_user_id, owner_type, name, phone, source)
    VALUES (1, ?, 'individual', '个人客户', '13900002222', 'manual')`).run(uid);
  await request(app).post('/api/card-market/market/toggle').set(bearer(p)).send({ subjectType: 'individual', subjectId: indId });

  const adm1 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();
  const dis = await request(app).post(`/api/card-market/individuals/${indId}/disable`).set(bearer(makeJwt(adm1)));
  assert.equal(dis.status, 200);
  assert.equal(dis.body.recycled, 1);

  // 客户已进租户公海
  const pool = db.prepare("SELECT * FROM tenant_public_pool WHERE customer_id = 1 AND phone = '13900002222'").get();
  assert.ok(pool, '停用后客户应回收至租户公海');
  // 名下客户已删除
  const cust = db.prepare('SELECT id FROM card_customer WHERE owner_user_id = ?').get(uid);
  assert.equal(cust, undefined);
  // 集市条目移除
  const item = db.prepare("SELECT id FROM card_market_items WHERE customer_id = 1 AND subject_type = 'individual' AND subject_id = ?").get(indId);
  assert.equal(item, undefined);
  // 无企业身份时解绑租户
  const u = db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(uid);
  assert.equal(u.customer_id, null);
});

test('P1-3 员工停用回收客户到企业公海', async () => {
  // 企业入驻（管理员E）
  const e = await wxLogin('ent_admin');
  const er = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set(bearer(e))
    .send({ name: '企业主', bindCode: '1001', applyType: 'enterprise', enterpriseName: '回收测试企业', industry: 'IT' });
  assert.equal(er.status, 200);
  const entApprove = approveApply('ent_admin', 1);
  const entId = entApprove.id;

  // 造一个员工+其名下客户
  const emp = await wxLogin('ent_emp');
  const empUser = db.prepare("SELECT * FROM platform_user WHERE openid = 'mock_ent_emp'").get();
  const empId = db.prepare(`INSERT INTO tenant_enterprise_employees (enterprise_id, customer_id, user_id, name, position, role, status)
    VALUES (?, 1, ?, '小工', '销售', 'member', 'active')`).run(entId, empUser.id).lastInsertRowid;
  db.prepare(`INSERT INTO card_customer (customer_id, owner_user_id, owner_type, name, phone, source)
    VALUES (1, ?, 'employee', '员工客户', '13900003333', 'manual')`).run(empUser.id);

  // 企业管理员停用员工
  const dis = await request(app).post(`/api/card-market/employees/${empId}/disable`).set(bearer(e));
  assert.equal(dis.status, 200);
  assert.equal(dis.body.recycled, 1);

  const pool = db.prepare("SELECT * FROM enterprise_public_pool WHERE enterprise_id = ? AND phone = '13900003333'").get(entId);
  assert.ok(pool, '员工停用后客户应回收至企业公海');
  const empRow = db.prepare('SELECT status FROM tenant_enterprise_employees WHERE id = ?').get(empId);
  assert.equal(empRow.status, 'left');
});

test('P1-4 企业停用完整回收链：企业公海+员工客户上浮租户公海', async () => {
  // 准备第二个企业（含企业公海客户+员工客户）
  const e2 = await wxLogin('ent2_admin');
  const er2 = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set(bearer(e2))
    .send({ name: '企业主2', bindCode: '1001', applyType: 'enterprise', enterpriseName: '停用回收企业', industry: '制造' });
  const ent2Approve = approveApply('ent2_admin', 1);
  const ent2Id = ent2Approve.id;
  const e2user = db.prepare("SELECT * FROM platform_user WHERE openid = 'mock_ent2_admin'").get();

  db.prepare(`INSERT INTO enterprise_public_pool (enterprise_id, customer_id, source_type, source_id, name, phone, company)
    VALUES (?, 1, 'employee', 1, '企公海客户', '13900004444', '丙公司')`).run(ent2Id);
  db.prepare(`INSERT INTO card_customer (customer_id, owner_user_id, owner_type, name, phone, source)
    VALUES (1, ?, 'employee', '企员工客户', '13900005555', 'manual')`).run(e2user.id);

  const adm1 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();
  const dis = await request(app).post(`/api/card-market/enterprises/${ent2Id}/disable`).set(bearer(makeJwt(adm1)));
  assert.equal(dis.status, 200);

  const t1 = db.prepare("SELECT * FROM tenant_public_pool WHERE customer_id = 1 AND phone = '13900004444'").get();
  assert.ok(t1, '企业公海available客户应上浮租户公海');
  const t2 = db.prepare("SELECT * FROM tenant_public_pool WHERE customer_id = 1 AND phone = '13900005555'").get();
  assert.ok(t2, '员工名下客户应回收租户公海');
  const ent2 = db.prepare('SELECT status FROM tenant_enterprises WHERE id = ?').get(ent2Id);
  assert.equal(ent2.status, 'disabled');
});

test('P1-6 管理员分配公海客户：指定成员归属 + 非管理员被拒', async () => {
  // 租1公海插入一条客户
  db.prepare(`INSERT INTO tenant_public_pool (customer_id, source_type, source_id, name, phone, company, position)
    VALUES (1, 'individual', 99, '分配客户', '13900002222', '分配公司', '总监')`).run();

  // 租1两个活跃成员：甲（被分配人）、乙（普通成员）
  const a = await wxLogin('assign_a');
  await request(app).post('/api/card/cards/create-with-apply').set(bearer(a)).send({ name: '甲', bindCode: '1001', applyType: 'individual' });
  approveApply('assign_a', 1);
  const b = await wxLogin('assign_b');
  await request(app).post('/api/card/cards/create-with-apply').set(bearer(b)).send({ name: '乙', bindCode: '1001', applyType: 'individual' });
  approveApply('assign_b', 1);
  const ua = db.prepare("SELECT id FROM platform_user WHERE openid = 'mock_assign_a'").get();
  const ub = db.prepare("SELECT id FROM platform_user WHERE openid = 'mock_assign_b'").get();

  const poolRow = db.prepare("SELECT id FROM tenant_public_pool WHERE customer_id = 1 AND phone = '13900002222'").get();

  // 1) 非管理员（成员乙）分配 → 403
  const denied = await request(app).post(`/api/card-market/public-pool/${poolRow.id}/assign`).set(bearer(b)).send({ assigneeUserId: ua.id });
  assert.equal(denied.status, 403, '普通成员不可分配公海客户');

  // 2) 管理员（租1 tenant_admin）分配给成员甲 → 200，客户归属甲
  const adm1 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();
  const ok = await request(app).post(`/api/card-market/public-pool/${poolRow.id}/assign`)
    .set(bearer(issueToken(adm1))).send({ assigneeUserId: ua.id });
  assert.equal(ok.status, 200, '管理员分配应成功');
  assert.equal(ok.body.assigneeUserId, ua.id);

  const afterRow = db.prepare('SELECT status, claimed_by FROM tenant_public_pool WHERE id = ?').get(poolRow.id);
  assert.equal(afterRow.status, 'claimed');
  assert.equal(afterRow.claimed_by, ua.id, '归属被分配人');
  const cust = db.prepare('SELECT owner_user_id, owner_type, source FROM card_customer WHERE source = ? ORDER BY id DESC LIMIT 1').get('public_pool');
  assert.equal(cust.owner_user_id, ua.id, '客户进入被分配人客户列表');

  // 3) 重复分配同一条 → 400
  const dup = await request(app).post(`/api/card-market/public-pool/${poolRow.id}/assign`)
    .set(bearer(issueToken(adm1))).send({ assigneeUserId: ub.id });
  assert.equal(dup.status, 400, '已分配客户不可重复分配');

  // 4) 后台账号（users 表企业管理员，token 声明 enterpriseId）可分配
  const entId = db.prepare("INSERT INTO tenant_enterprises (customer_id, name, admin_user_id, status) VALUES (1, '分配测试企业', NULL, 'active')").run().lastInsertRowid;
  db.prepare(`INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id, enterprise_id)
    VALUES ('pool_ent_adm', '13800000003', 'x', 'y', 'tenant_member', 'active', 1, ?)`).run(entId);
  const entAdm = db.prepare("SELECT * FROM users WHERE username = 'pool_ent_adm'").get();
  db.prepare(`INSERT INTO tenant_public_pool (customer_id, source_type, source_id, name, phone, company, position)
    VALUES (1, 'individual', 100, '分配客户2', '13900003333', '分配公司2', '总监')`).run();
  const poolRow2 = db.prepare("SELECT id FROM tenant_public_pool WHERE customer_id = 1 AND phone = '13900003333'").get();
  const entOk = await request(app).post(`/api/card-market/public-pool/${poolRow2.id}/assign`)
    .set(bearer(issueToken(entAdm))).send({ assigneeUserId: ua.id });
  assert.equal(entOk.status, 200, '后台账号企业管理员应可分配');
  db.prepare('DELETE FROM tenant_public_pool WHERE id = ?').run(poolRow2.id);
  db.prepare('DELETE FROM card_customer WHERE owner_user_id = ? AND source = ?').run(ua.id, 'public_pool');
  db.prepare('DELETE FROM users WHERE id = ?').run(entAdm.id);
  db.prepare('DELETE FROM tenant_enterprises WHERE id = ?').run(entId);

  // 清理
  db.prepare('DELETE FROM card_customer WHERE owner_user_id = ? AND source = ?').run(ua.id, 'public_pool');
  db.prepare('DELETE FROM tenant_public_pool WHERE id = ?').run(poolRow.id);
  db.prepare("DELETE FROM card_profile WHERE user_id IN (?,?)").run(ua.id, ub.id);
  db.prepare("DELETE FROM tenant_individuals WHERE customer_id = 1 AND user_id IN (?,?)").run(ua.id, ub.id);
  db.prepare("DELETE FROM platform_user WHERE id IN (?,?)").run(ua.id, ub.id);
});

test('P1-5 交换快照：accept 后固化双方名片快照，人脉与客户线索分离', async () => {
  // 同租户两个个人
  const x = await wxLogin('swap_x');
  const xr = await request(app).post('/api/card/cards/create-with-apply').set(bearer(x)).send({ name: '交换甲', bindCode: '1001', applyType: 'individual' });
  approveApply('swap_x', 1);
  const y = await wxLogin('swap_y');
  const yr = await request(app).post('/api/card/cards/create-with-apply').set(bearer(y)).send({ name: '交换乙', bindCode: '1001', applyType: 'individual' });
  approveApply('swap_y', 1);
  const yuser = db.prepare("SELECT * FROM platform_user WHERE openid = 'mock_swap_y'").get();

  const req = await request(app).post('/api/card-market/exchange/request').set(bearer(x)).send({ toUserId: yuser.id, message: '交换吧' });
  assert.equal(req.status, 200);

  const conn = db.prepare("SELECT * FROM card_connections WHERE customer_id = 1 AND from_user_id = ? AND to_user_id = ?").get(xr.body.card.userId, yuser.id);
  assert.ok(conn);
  assert.equal(conn.status, 'pending');

  const acc = await request(app).post('/api/card-market/exchange/handle').set(bearer(y)).send({ connectionId: conn.id, action: 'accept' });
  assert.equal(acc.status, 200);

  const afterConn = db.prepare('SELECT * FROM card_connections WHERE id = ?').get(conn.id);
  assert.equal(afterConn.status, 'accepted');
  const snapshot = JSON.parse(afterConn.snapshot);
  assert.equal(snapshot.from.name, '交换甲');
  assert.equal(snapshot.to.name, '交换乙');

  // 人脉列表可读
  const conns = await request(app).get('/api/card-market/connections').set(bearer(x));
  assert.equal(conns.status, 200);
  assert.ok(conns.body.connections.some((c) => c.status === 'accepted'));

  // 人脉不得自动成为客户线索
  const cust = db.prepare('SELECT id FROM card_customer WHERE phone = ?').get('13900001111');
  // 仅允许存在公海客户（之前用例数据），交换双方不得生成 card_customer
  const swapCust = db.prepare("SELECT id FROM card_customer WHERE owner_user_id = ?").get(xr.body.card.userId);
  assert.equal(swapCust, undefined, '交换人脉不应自动生成客户线索');
});

test('P2-1 双身份：个人入驻后仍可企业入驻，identity 返回双身份', async () => {
  const u = await wxLogin('dual_id');
  const r1 = await request(app).post('/api/card/cards/create-with-apply').set(bearer(u)).send({ name: '双身份', bindCode: '1001', applyType: 'individual' });
  assert.equal(r1.status, 200);
  approveApply('dual_id', 1);
  const r2 = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set(bearer(u))
    .send({ name: '双身份', bindCode: '1001', applyType: 'enterprise', enterpriseName: '双身份企业' });
  assert.equal(r2.status, 200, '双身份：个人+企业员工应允许并存');
  approveApply('dual_id', 1);

  const idr = await request(app).get('/api/card-market/identity').set(bearer(u));
  assert.equal(idr.status, 200);
  assert.ok(idr.body.identity.individual, '应有个人身份');
  assert.ok(idr.body.identity.employee, '应有员工身份');
  assert.equal(idr.body.identity.isTenantAdmin, false);
});

test('P2-12 集市配置契约：PUT全字段后GET返回camelCase且持久化生效', async () => {
  const adm1 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();
  const token = issueToken(adm1);
  const headers = bearer(token);

  // 初始 GET：返回 camelCase 契约
  const init = await request(app).get('/api/card-market/market/settings').set(headers);
  assert.equal(init.status, 200);
  assert.equal(init.body.settings.auditMode, 'auto', 'GET应返回camelCase auditMode');
  assert.ok('showCompany' in init.body.settings, 'GET应返回camelCase showCompany');

  // PUT 全字段（含非默认值）→ 全部应生效
  const put = await request(app).put('/api/card-market/market/settings').set(headers).send({
    enabled: 1,
    auditMode: 'manual',
    title: '测试集市',
    showCompany: 0,
    showIndustry: 1,
    showLocation: 0,
    allowExchange: 0,
    contactVisible: 'direct',
  });
  assert.equal(put.status, 200);

  // GET 验证 camelCase 且值持久化
  const after = await request(app).get('/api/card-market/market/settings').set(headers);
  assert.equal(after.status, 200);
  assert.equal(after.body.settings.auditMode, 'manual', 'auditMode应持久化为manual');
  assert.equal(after.body.settings.title, '测试集市', 'title应持久化');
  assert.equal(after.body.settings.showCompany, 0, 'showCompany应持久化为0');
  assert.equal(after.body.settings.allowExchange, 0, 'allowExchange应持久化为0');
  assert.equal(after.body.settings.contactVisible, 'direct', 'contactVisible应持久化为direct');
  assert.equal('audit_mode' in after.body.settings, false, 'GET不应返回snake_case字段');

  // 数据库直查：落库正确
  const row = db.prepare('SELECT * FROM card_market_settings WHERE customer_id = 1').get();
  assert.equal(row.audit_mode, 'manual');
  assert.equal(row.title, '测试集市');
  assert.equal(row.allow_exchange, 0);

  // 还原配置，避免影响其它用例
  await request(app).put('/api/card-market/market/settings').set(headers).send({
    enabled: 1, auditMode: 'auto', title: '人脉集市',
    showCompany: 1, showIndustry: 1, showLocation: 1, allowExchange: 1, contactVisible: 'after_exchange',
  });
});

test('P2-13 租户视角跟进记录：仅本租户客户可见，跨租户404隔离', async () => {
  const adm1 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();
  const headers = bearer(issueToken(adm1));
  // 造数据：本租户客户+跟进；他租户客户
  const c1 = db.prepare("INSERT INTO card_customer (enterprise_id, owner_user_id, name) VALUES (1, 999888, '租户一客户')").run().lastInsertRowid;
  const c2 = db.prepare("INSERT INTO card_customer (enterprise_id, owner_user_id, name) VALUES (2, 999887, '租户二客户')").run().lastInsertRowid;
  db.prepare('INSERT INTO card_customer_follow (customer_id, user_id, content) VALUES (?, 999888, ?)').run(c1, '首次电话跟进');
  db.prepare('INSERT INTO card_customer_follow (customer_id, user_id, content) VALUES (?, 999887, ?)').run(c2, '他人租户跟进');

  const ok = await request(app).get(`/api/customer/card/customers/${c1}/follows`).set(headers);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.follows.length, 1);
  assert.equal(ok.body.follows[0].content, '首次电话跟进');
  assert.equal(ok.body.follows[0].nextFollowAt, null);

  const forbidden = await request(app).get(`/api/customer/card/customers/${c2}/follows`).set(headers);
  assert.equal(forbidden.status, 404, '跨租户客户跟进记录应404');

  db.prepare('DELETE FROM card_customer_follow WHERE customer_id IN (?,?)').run(c1, c2);
  db.prepare('DELETE FROM card_customer WHERE id IN (?,?)').run(c1, c2);
});

test('P2-14 comboAuth 企业回退：仅绑定企业（无customer_id）的C端用户可访问集市', async () => {
  // 构造：用户仅 enterprise_id（企业已激活、属于租户1），customer_id 为空
  const code = 'combo_ent_fallback_' + Date.now();
  const login = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(login.status, 200);
  const u = db.prepare('SELECT id FROM platform_user WHERE openid = ?').get('mock_' + code);
  const userId = u.id;
  // 先建一个激活的企业（租户1）
  const entId = db.prepare("INSERT INTO tenant_enterprises (customer_id, name, admin_user_id, status) VALUES (1, '回退测试企业', ?, 'active')").run(userId).lastInsertRowid;
  db.prepare("UPDATE platform_user SET enterprise_id = ?, customer_id = NULL WHERE id = ?").run(entId, userId);

  const res = await request(app).get('/api/card-market/market/list').set(bearer(login.body.token));
  assert.equal(res.status, 200, '仅绑定企业应通过租户回退访问集市');

  db.prepare('DELETE FROM tenant_enterprises WHERE id = ?').run(entId);
  db.prepare("UPDATE platform_user SET enterprise_id = NULL, customer_id = NULL WHERE id = ?").run(userId);
});

test('P5 客户状态机：显式迁移表放行合法迁移，终态锁定，following→pending 联动清空公海跟进时间', async () => {
  const code = 'stm_' + Date.now();
  const login = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(login.status, 200);
  const u = db.prepare('SELECT id FROM platform_user WHERE openid = ?').get('mock_' + code);
  const uid = u.id;
  await request(app).post('/api/card/cards/create-with-apply').set(bearer(login.body.token))
    .send({ name: '状态机用户', bindCode: '1001', applyType: 'individual' });
  approveApply(code, 1);

  // 造客户 + 公海 claimed 记录（模拟已领取且跟进中）
  const phone = '1390' + String(Date.now()).slice(-8);
  const custId = db.prepare(`INSERT INTO card_customer (customer_id, owner_user_id, owner_type, name, phone, source, status)
    VALUES (1, ?, 'individual', '状态机客户', ?, 'manual', 'pending')`).run(uid, phone).lastInsertRowid;
  const poolId = db.prepare(`INSERT INTO tenant_public_pool (customer_id, source_type, source_id, name, phone, company, position, status, claimed_by, claimed_at, last_follow_at)
    VALUES (1, 'manual', ?, '状态机客户', ?, '', '', 'claimed', ?, datetime('now'), datetime('now'))`).run(custId, phone, uid).lastInsertRowid;

  const st = (s) => request(app).post(`/api/card-market/customers/${custId}/status`).set(bearer(login.body.token)).send({ status: s });

  // pending → following 合法
  let r = await st('following');
  assert.equal(r.status, 200, 'pending→following 应放行');
  let pool = db.prepare('SELECT last_follow_at FROM tenant_public_pool WHERE id = ?').get(poolId);
  assert.ok(pool.last_follow_at, '进入 following 应刷新公海跟进时间');

  // following → pending 回退合法 + 公海跟进时间清空（超时回落到领取时刻）
  r = await st('pending');
  assert.equal(r.status, 200, 'following→pending 应放行（合法回退）');
  pool = db.prepare('SELECT last_follow_at FROM tenant_public_pool WHERE id = ?').get(poolId);
  assert.equal(pool.last_follow_at, null, '回退后公海 last_follow_at 应清空');

  // pending → deal 合法
  r = await st('deal');
  assert.equal(r.status, 200, 'pending→deal 应放行');

  // 终态 deal 不可再改（迁移表外一律拒绝）
  r = await st('following');
  assert.equal(r.status, 400, 'deal 终态不可迁移');
  r = await st('invalid');
  assert.equal(r.status, 400, 'deal 终态不可迁移');

  // 同态迁移拒绝
  const cust2 = db.prepare(`INSERT INTO card_customer (customer_id, owner_user_id, owner_type, name, phone, source, status)
    VALUES (1, ?, 'individual', '状态机客户2', '1399' + ?, 'manual', 'pending')`).run(uid, String(Date.now()).slice(-8)).lastInsertRowid;
  r = await request(app).post(`/api/card-market/customers/${cust2}/status`).set(bearer(login.body.token)).send({ status: 'pending' });
  assert.equal(r.status, 400, '同态迁移应拒绝');

  // 清理
  db.prepare('DELETE FROM card_customer WHERE id IN (?, ?)').run(custId, cust2);
  db.prepare('DELETE FROM tenant_public_pool WHERE id = ?').run(poolId);
  db.prepare('DELETE FROM card_customer WHERE owner_user_id = ?').run(uid);
  db.prepare('DELETE FROM tenant_individuals WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM card_profile WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM platform_user WHERE id = ?').run(uid);
});

// ===== P0/P1 新契约回归（名片行业城市级联 / 收藏分组 / 提现上限 / 集市同城+banners）=====
test('P0 收藏分组闭环：新建/移动/分组列表/删除回未分组', async () => {
  const a = await wxLogin('grp_a');
  const b = await wxLogin('grp_b');
  const r2 = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set(bearer(b))
    .send({ name: '分组目标名片', bindCode: '1001', applyType: 'individual', city: '东莞', businessField: '互联网/IT' });
  approveApply('grp_b', 1);
  const targetId = r2.body.card.id;

  // a 收藏 b 的名片
  const col = await request(app).post('/api/card/collect').set(bearer(a)).send({ cardId: targetId });
  assert.equal(col.status, 200);

  // 新建分组（无该组收藏时仍返回成功，前端本地维护空组）
  const g1 = await request(app).post('/api/card/collects/group').set(bearer(a)).send({ name: '商务合作' });
  assert.equal(g1.status, 200);

  // 从列表取收藏 id 再移动
  const firstList = await request(app).get('/api/card/collects?limit=200').set(bearer(a));
  const colRow = firstList.body.collects.find((c) => c.cardId === targetId);
  assert.ok(colRow && colRow.id, '收藏行存在');
  const mv = await request(app).post(`/api/card/collects/${colRow.id}/group`).set(bearer(a)).send({ groupName: '商务合作' });
  assert.equal(mv.status, 200);

  // 分组列表结构：groups + collects[groupName]
  const list = await request(app).get('/api/card/collects?limit=200').set(bearer(a));
  assert.ok(list.body.groups.some((g) => g.name === '商务合作'), '分组出现在 groups');
  const mine = list.body.collects.find((c) => c.cardId === targetId);
  assert.ok(mine, '收藏在列表中');
  assert.equal(mine.groupName, '商务合作');

  // 删除分组 → 移回未分组
  const del = await request(app).post('/api/card/collects/group/delete').set(bearer(a)).send({ name: '商务合作' });
  assert.equal(del.status, 200);
  const list2 = await request(app).get('/api/card/collects?limit=200').set(bearer(a));
  assert.ok(!list2.body.groups.some((g) => g.name === '商务合作'), '分组已删除');
  const back = list2.body.collects.find((c) => c.cardId === targetId);
  assert.equal(back.groupName, '未分组');

  // 清理
  db.prepare('DELETE FROM card_collect WHERE user_id = ?').run((await wxLogin('grp_a2')) ? 0 : 0); // 占位防未定义
  const ua = db.prepare("SELECT id FROM platform_user WHERE openid = 'mock_grp_a'").get().id;
  const ub = db.prepare("SELECT id FROM platform_user WHERE openid = 'mock_grp_b'").get().id;
  db.prepare('DELETE FROM card_collect WHERE user_id IN (?, ?)').run(ua, ub);
  db.prepare('DELETE FROM tenant_individuals WHERE user_id = ?').run(ub);
  db.prepare('DELETE FROM card_profile WHERE user_id = ?').run(ub);
  db.prepare('DELETE FROM platform_user WHERE id IN (?, ?)').run(ua, ub);
});

test('P1 集市：上架冗余城市 + list?city 过滤 + settings banners 往返', async () => {
  // 用户 a 建名片（东莞）并上架
  const a = await wxLogin('city_a');
  const r = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set(bearer(a))
    .send({ name: '同城名片', bindCode: '1001', applyType: 'individual', city: '东莞', businessField: '互联网/IT' });
  approveApply('city_a', 1);
  const uid = r.body.card.userId;
  const indId = db.prepare('SELECT id FROM tenant_individuals WHERE user_id = ? AND customer_id = 1').get(uid).id;
  const tg = await request(app).post('/api/card-market/market/toggle').set(bearer(a)).send({ subjectType: 'individual', subjectId: indId });
  assert.equal(tg.status, 200);
  // 上架应冗余写入 city（取自 card_profile.city = 东莞）
  const item = db.prepare("SELECT id, city FROM card_market_items WHERE customer_id = 1 AND subject_type = 'individual' AND subject_id = ?").get(indId);
  assert.equal(item.city, '东莞');

  // list?city 精确过滤
  const inCity = await request(app).get('/api/card-market/market/list?city=东莞').set(bearer(a));
  assert.ok(inCity.body.items.some((x) => x.id === itemRowId(item)), '同城列表含该名片');
  const outCity = await request(app).get('/api/card-market/market/list?city=深圳').set(bearer(a));
  assert.ok(!outCity.body.items.some((x) => x.id === itemRowId(item)), '异城列表不含该名片');

  // settings banners 往返（租户管理员）
  const adm1 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();
  const put = await request(app).put('/api/card-market/market/settings').set(bearer(makeJwt(adm1))).send({ banners: [{ image: 'https://x.test/a.png', link: 'https://x.test' }] });
  assert.equal(put.status, 200);
  const got = await request(app).get('/api/card-market/market/settings').set(bearer(makeJwt(adm1)));
  assert.deepEqual(got.body.settings.banners, [{ image: 'https://x.test/a.png', link: 'https://x.test' }]);

  // 清理
  db.prepare('DELETE FROM card_market_items WHERE customer_id = 1 AND subject_type = ? AND subject_id = ?').run('individual', indId);
  db.prepare('DELETE FROM card_customer WHERE owner_user_id = ?').run(uid);
  db.prepare('DELETE FROM tenant_individuals WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM card_profile WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM platform_user WHERE id = ?').run(uid);
});

function itemRowId(itemRow) { return itemRow.id; }
