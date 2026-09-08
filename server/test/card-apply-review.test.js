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
 * 入驻申请审核流（P0-2 补充）专项测试
 * 覆盖：申请→pending未绑定→未审核拦截→apply/status→管理员通过（绑定+关联）→拒绝→重新申请→跨租户越权
 */
let app;
let tmpDir;
let db;

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function wxLogin(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200);
  return res.body.token;
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-card-review-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  db = createDb(config.dbPath);
  // 测试租户使用旗舰版配额（避免免费版上限拦截多主体审核流）
  db.prepare("UPDATE projects SET billing_plan_id = (SELECT id FROM billing_plans WHERE code = 'flagship') WHERE id = 1").run();
  app = createApp({ db });

  // 租户2（租户1由迁移默认创建 id=1, invite_code='1001'）
  db.prepare(`INSERT INTO projects (customer_name, description, status, invite_code, solutions)
    VALUES ('租户B', '', 'active', '2002', '["panorama","card"]')`).run();

  // 两个租户的管理员
  for (const [uname, phone, cid] of [['rev_adm1', '13800000001', 1], ['rev_adm2', '13800000002', 2]]) {
    const { hash, salt } = hashPassword('Test@123');
    db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
      .run(uname, phone, hash, salt, 'tenant_admin', 'active', cid);
  }
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('审核流-1 提交申请后为pending且不绑定租户，未审核前访问租户域被拒', async () => {
  const token = await wxLogin('rev_p1');
  const r = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set(bearer(token))
    .send({ name: '待审个人', bindCode: '1001', applyType: 'individual', phone: '13811110001' });
  assert.equal(r.status, 200);
  assert.equal(r.body.applyStatus, 'pending', '提交入驻申请应返回审核中状态');

  const uid = r.body.card.userId;
  const ind = db.prepare('SELECT status FROM tenant_individuals WHERE user_id = ? AND customer_id = 1').get(uid);
  assert.equal(ind.status, 'pending', '申请记录应为待审核');

  const u = db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(uid);
  assert.equal(u.customer_id, null, '审核通过前不得绑定租户');

  const card = db.prepare('SELECT customer_id FROM card_profile WHERE user_id = ?').get(uid);
  assert.equal(card.customer_id, null, '审核通过前名片不得关联租户');

  // 未审核用户访问租户域接口 → 403（未入驻）
  const denied = await request(app).get('/api/card-market/individuals').set(bearer(token));
  assert.equal(denied.status, 403);
  assert.match(denied.body.error, /未入驻/);
});

test('审核流-2 apply/status 返回本人申请状态', async () => {
  const token = await wxLogin('rev_p1');
  const res = await request(app).get('/api/card-market/apply/status').set(bearer(token));
  assert.equal(res.status, 200);
  assert.equal(res.body.apply.status, 'pending');
  assert.equal(res.body.apply.type, 'individual');
  assert.equal(res.body.apply.customerId, 1);
});

test('审核流-3 管理员通过后激活并绑定租户、关联名片', async () => {
  const uid = db.prepare("SELECT id FROM platform_user WHERE openid = 'mock_rev_p1'").get().id;
  const indId = db.prepare('SELECT id FROM tenant_individuals WHERE user_id = ? AND customer_id = 1').get(uid).id;
  const adm1 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();

  const audit = await request(app)
    .post('/api/card-market/apply/audit')
    .set(bearer(issueToken(adm1)))
    .send({ type: 'individual', id: indId, action: 'approve' });
  assert.equal(audit.status, 200);

  assert.equal(db.prepare('SELECT status FROM tenant_individuals WHERE id = ?').get(indId).status, 'active');
  assert.equal(db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(uid).customer_id, 1);
  assert.equal(db.prepare('SELECT customer_id FROM card_profile WHERE user_id = ?').get(uid).customer_id, 1);
});

test('审核流-4 非待审状态不可重复审核', async () => {
  const uid = db.prepare("SELECT id FROM platform_user WHERE openid = 'mock_rev_p1'").get().id;
  const indId = db.prepare('SELECT id FROM tenant_individuals WHERE user_id = ? AND customer_id = 1').get(uid).id;
  const adm1 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();

  const again = await request(app)
    .post('/api/card-market/apply/audit')
    .set(bearer(issueToken(adm1)))
    .send({ type: 'individual', id: indId, action: 'approve' });
  assert.equal(again.status, 400);
  assert.match(again.body.error, /待审状态/);
});

test('审核流-5 拒绝后可重新提交申请', async () => {
  const token = await wxLogin('rev_p2');
  // 独立申请接口提交（非创建名片路径）
  const apply = await request(app)
    .post('/api/card-market/apply')
    .set(bearer(token))
    .send({ type: 'individual', bindCode: '1001', name: '待拒个人', phone: '13811110002', position: '销售' });
  assert.equal(apply.status, 200);
  assert.match(apply.body.message, /等待管理员审核/);

  const uid = db.prepare("SELECT id FROM platform_user WHERE openid = 'mock_rev_p2'").get().id;
  const indId = db.prepare('SELECT id FROM tenant_individuals WHERE user_id = ? AND customer_id = 1').get(uid).id;
  const adm1 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();

  const reject = await request(app)
    .post('/api/card-market/apply/audit')
    .set(bearer(issueToken(adm1)))
    .send({ type: 'individual', id: indId, action: 'reject' });
  assert.equal(reject.status, 200);
  assert.equal(db.prepare('SELECT status FROM tenant_individuals WHERE id = ?').get(indId).status, 'rejected');

  // 拒绝后重新申请：同类型不再报"已入驻"，恢复 pending
  const reapply = await request(app)
    .post('/api/card-market/apply')
    .set(bearer(token))
    .send({ type: 'individual', bindCode: '1001', name: '待拒个人(改)', phone: '13811110002', position: '经理' });
  assert.equal(reapply.status, 200);
  assert.match(reapply.body.message, /重新提交/);
  assert.equal(db.prepare('SELECT status FROM tenant_individuals WHERE id = ?').get(indId).status, 'pending');
  assert.equal(db.prepare('SELECT position FROM tenant_individuals WHERE id = ?').get(indId).position, '经理', '重新申请应更新资料');
});

test('审核流-6 跨租户管理员无法审核他租户申请', async () => {
  // 租户2用户向租户2提交申请
  const token = await wxLogin('rev_t2');
  const apply = await request(app)
    .post('/api/card-market/apply')
    .set(bearer(token))
    .send({ type: 'individual', bindCode: '2002', name: '租二个人', phone: '13811110003' });
  assert.equal(apply.status, 200);
  const uid = db.prepare("SELECT id FROM platform_user WHERE openid = 'mock_rev_t2'").get().id;
  const indId = db.prepare('SELECT id FROM tenant_individuals WHERE user_id = ? AND customer_id = 2').get(uid).id;

  // 租户1管理员审核租户2的申请 → 404
  const adm1 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();
  const cross = await request(app)
    .post('/api/card-market/apply/audit')
    .set(bearer(issueToken(adm1)))
    .send({ type: 'individual', id: indId, action: 'approve' });
  assert.equal(cross.status, 404);

  // 租户2管理员可正常通过
  const adm2 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 2").get();
  const ok = await request(app)
    .post('/api/card-market/apply/audit')
    .set(bearer(issueToken(adm2)))
    .send({ type: 'individual', id: indId, action: 'approve' });
  assert.equal(ok.status, 200);
  assert.equal(db.prepare('SELECT status FROM tenant_individuals WHERE id = ?').get(indId).status, 'active');
  assert.equal(db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(uid).customer_id, 2);
});

test('审核流-7 企业申请通过后企业+管理员激活并绑定', async () => {
  const token = await wxLogin('rev_ent');
  const apply = await request(app)
    .post('/api/card-market/apply')
    .set(bearer(token))
    .send({ type: 'enterprise', bindCode: '1001', name: '企业申请人', phone: '13811110004', position: '总经理', enterpriseName: '审核测试企业', industry: 'IT' });
  assert.equal(apply.status, 200);

  const uid = db.prepare("SELECT id FROM platform_user WHERE openid = 'mock_rev_ent'").get().id;
  const ent = db.prepare('SELECT id, status FROM tenant_enterprises WHERE admin_user_id = ? AND customer_id = 1').get(uid);
  assert.equal(ent.status, 'pending');
  assert.equal(db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(uid).customer_id, null, '企业审核前不绑定');

  const adm1 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();
  const audit = await request(app)
    .post('/api/card-market/apply/audit')
    .set(bearer(issueToken(adm1)))
    .send({ type: 'enterprise', id: ent.id, action: 'approve' });
  assert.equal(audit.status, 200);

  assert.equal(db.prepare('SELECT status FROM tenant_enterprises WHERE id = ?').get(ent.id).status, 'active');
  assert.equal(db.prepare("SELECT status FROM tenant_enterprise_employees WHERE enterprise_id = ? AND role = 'admin'").get(ent.id).status, 'active');
  const u = db.prepare('SELECT customer_id, identity_type FROM platform_user WHERE id = ?').get(uid);
  assert.equal(u.customer_id, 1);
  assert.equal(u.identity_type, 'employee');
});
