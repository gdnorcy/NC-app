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
 * A1/A2 企业管理员端（角色化子面板）+ 企业自有公海池
 * - 企业管理员（users.enterprise_id）登录后 /enterprise/me 200；普通租户成员 403
 * - 添加员工（candidates）→ 员工列表
 * - 移出员工 → 名下客户回收企业公海（幂等查重）
 * - 企业公海手动上浮租户全局公海；重复上浮幂等拦截
 * - 领取/释放闭环
 */
let app;
let tmpDir;
let db;
let tenantAdmin;
let entMgr;
let memberNoEnt;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-ent-admin-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });

  db.prepare(`INSERT INTO projects (customer_name, description, status, invite_code, solutions)
    VALUES ('企业测试租户', '', 'active', '2003', '["panorama","card"]')`).run();
  const { hash, salt } = hashPassword('Test@123');

  // 租户管理员
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('ent_tadm', '13800001101', hash, salt, 'tenant_admin', 'active', 1);
  tenantAdmin = db.prepare('SELECT * FROM users WHERE username = ?').get('ent_tadm');

  // 企业（id=1，归属租户1，admin_user_id 指向企业管理员）
  db.prepare(`INSERT INTO tenant_enterprises (customer_id, name, industry, description, config)
    VALUES (1, '测试企业', '软件', '企业简介', '{"auto_recycle":false}')`).run();
  const ent = db.prepare('SELECT * FROM tenant_enterprises WHERE name = ?').get('测试企业');

  // 企业管理员（users.enterprise_id 绑定）
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id, enterprise_id) VALUES (?,?,?,?,?,?,?,?)')
    .run('ent_mgr', '13800001102', hash, salt, 'tenant_member', 'active', 1, ent.id);
  entMgr = db.prepare('SELECT * FROM users WHERE username = ?').get('ent_mgr');

  // 普通租户成员（未绑定企业）
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('ent_member', '13800001103', hash, salt, 'tenant_member', 'active', 1);
  memberNoEnt = db.prepare('SELECT * FROM users WHERE username = ?').get('ent_member');

  // C 端入驻个人（platform_user），供添加员工
  db.prepare(`INSERT INTO platform_user (openid, nickname, avatar, customer_id, status)
    VALUES ('ent_openid_1', '企业员工甲', '', 1, 'active')`).run();
  const pu = db.prepare('SELECT * FROM platform_user WHERE openid = ?').get('ent_openid_1');
  db.prepare(`INSERT INTO card_profile (user_id, name, position, phone, status, view_count, exchange_count)
    VALUES (?, '员工甲', '销售', '13900002001', 'active', 3, 1)`).run(pu.id);

  // 员工名下客户（card_customer）
  db.prepare(`INSERT INTO card_customer (owner_user_id, customer_id, owner_type, name, phone, company, source)
    VALUES (?, 1, 'employee', '回收客户X', '13900002002', '客户公司', 'exchange')`).run(pu.id);
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('A1 权限隔离：企业管理员可访问 /enterprise/me，普通成员 403', { concurrency: false }, async () => {
  const ok = await request(app).get('/api/customer/enterprise/me')
    .set('Authorization', `Bearer ${issueToken(entMgr)}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.enterprise.name, '测试企业');
  assert.equal(typeof ok.body.stats.employeeCount, 'number');

  const denied = await request(app).get('/api/customer/enterprise/me')
    .set('Authorization', `Bearer ${issueToken(memberNoEnt)}`);
  assert.equal(denied.status, 403);
  assert.match(denied.body.error, /未绑定企业/);

  // 租户管理员可查企业列表
  const list = await request(app).get('/api/customer/enterprises')
    .set('Authorization', `Bearer ${issueToken(tenantAdmin)}`);
  assert.equal(list.status, 200);
  assert.ok(list.body.enterprises.length >= 1);
});

test('A1 员工管理：候选 → 添加 → 列表 → 角色切换', { concurrency: false }, async () => {
  const token = issueToken(entMgr);
  const cand = await request(app).get('/api/customer/enterprise/candidates')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(cand.status, 200);
  assert.ok(cand.body.candidates.length >= 1);
  const pu = db.prepare("SELECT id FROM platform_user WHERE openid = 'ent_openid_1'").get();

  const add = await request(app).post('/api/customer/enterprise/employees')
    .set('Authorization', `Bearer ${token}`).send({ userId: pu.id, role: 'member' });
  assert.equal(add.status, 200);

  const list = await request(app).get('/api/customer/enterprise/employees')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(list.status, 200);
  const emp = list.body.employees.find((e) => e.userId === pu.id);
  assert.ok(emp, '员工应出现在列表');
  assert.equal(emp.cardId > 0, true);
  assert.equal(emp.role, 'member');

  const promote = await request(app).put(`/api/customer/enterprise/employees/${pu.id}`)
    .set('Authorization', `Bearer ${token}`).send({ role: 'admin' });
  assert.equal(promote.status, 200);
  const after = db.prepare('SELECT enterprise_role FROM platform_user WHERE id = ?').get(pu.id);
  assert.equal(after.enterprise_role, 'admin');
});

test('A2 回收闭环：移出员工 → 客户进企业公海（幂等查重）', { concurrency: false }, async () => {
  const token = issueToken(entMgr);
  const pu = db.prepare("SELECT id FROM platform_user WHERE openid = 'ent_openid_1'").get();

  const remove = await request(app).put(`/api/customer/enterprise/employees/${pu.id}`)
    .set('Authorization', `Bearer ${token}`).send({ action: 'remove' });
  assert.equal(remove.status, 200);
  assert.equal(remove.body.recycled, 1, '应回收 1 条客户');

  const pool = await request(app).get('/api/customer/enterprise/pool')
    .set('Authorization', `Bearer ${token}`);
  const item = pool.body.items.find((i) => i.phone === '13900002002');
  assert.ok(item, '回收客户应在企业公海');
  assert.equal(item.status, 'available');
  assert.equal(item.sourceType, 'employee');

  // 移出后 platform_user 解绑
  const after = db.prepare('SELECT enterprise_id FROM platform_user WHERE id = ?').get(pu.id);
  assert.equal(after.enterprise_id, null);

  // 幂等：重复移出同一员工 → 404（已不在企业）
  const again = await request(app).put(`/api/customer/enterprise/employees/${pu.id}`)
    .set('Authorization', `Bearer ${token}`).send({ action: 'remove' });
  assert.equal(again.status, 404);
});

test('A2 上浮租户公海：手动上浮 + 幂等拦截', { concurrency: false }, async () => {
  const token = issueToken(entMgr);
  const item = db.prepare("SELECT id FROM enterprise_public_pool WHERE phone = '13900002002' AND status = 'available'").get();

  const up = await request(app).post(`/api/customer/enterprise/pool/${item.id}/float-up`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(up.status, 200);

  const ten = db.prepare("SELECT * FROM tenant_public_pool WHERE phone = '13900002002' AND customer_id = 1 AND status = 'available'").get();
  assert.ok(ten, '租户公海应出现上浮客户');
  assert.equal(ten.source_type, 'enterprise');

  const ent = db.prepare('SELECT status FROM enterprise_public_pool WHERE id = ?').get(item.id);
  assert.equal(ent.status, 'recycled');

  // 重复上浮 → 400
  const dup = await request(app).post(`/api/customer/enterprise/pool/${item.id}/float-up`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(dup.status, 400);
});

test('A2 领取/释放闭环', { concurrency: false }, async () => {
  const token = issueToken(entMgr);
  // 再造一条可用
  db.prepare(`INSERT INTO enterprise_public_pool (enterprise_id, customer_id, source_type, name, phone, company)
    VALUES (1, 1, 'employee', '待领客户', '13900002003', '待领公司')`).run();
  const item = db.prepare("SELECT id FROM enterprise_public_pool WHERE phone = '13900002003'").get();

  const claim = await request(app).post(`/api/customer/enterprise/pool/${item.id}/claim`)
    .set('Authorization', `Bearer ${token}`).send({});
  assert.equal(claim.status, 200);
  const claimed = db.prepare('SELECT status, claimed_by FROM enterprise_public_pool WHERE id = ?').get(item.id);
  assert.equal(claimed.status, 'claimed');
  assert.equal(claimed.claimed_by, entMgr.id);

  const release = await request(app).post(`/api/customer/enterprise/pool/${item.id}/release`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(release.status, 200);
  const rel = db.prepare('SELECT status FROM enterprise_public_pool WHERE id = ?').get(item.id);
  assert.equal(rel.status, 'available');
});
