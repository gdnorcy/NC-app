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

  // 集市配置默认行（公海上浮方式测试用；无记录时后端回退 soft）
  db.prepare(`INSERT INTO card_market_settings (customer_id, pool_float_mode) VALUES (1, 'soft')`).run();
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
  // 默认集市配置为软上浮（soft）：企业记录保留为 floated，可收回
  assert.equal(ent.status, 'floated');

  // 重复上浮 → 400（已上浮）
  const dup = await request(app).post(`/api/customer/enterprise/pool/${item.id}/float-up`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(dup.status, 400);
});

test('A2 软上浮收回：平台公海未领取时可收回企业公海', { concurrency: false }, async () => {
  const token = issueToken(entMgr);
  db.prepare(`INSERT INTO enterprise_public_pool (enterprise_id, customer_id, source_type, name, phone, company)
    VALUES (1, 1, 'employee', '收回客户', '13900002006', '收回公司')`).run();
  const item = db.prepare("SELECT id FROM enterprise_public_pool WHERE phone = '13900002006'").get();

  const up = await request(app).post(`/api/customer/enterprise/pool/${item.id}/float-up`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(up.status, 200);
  assert.equal(db.prepare('SELECT status FROM enterprise_public_pool WHERE id = ?').get(item.id).status, 'floated');
  assert.ok(db.prepare("SELECT id FROM tenant_public_pool WHERE phone = '13900002006' AND customer_id = 1 AND status = 'available'").get());

  // 收回：平台公海记录删除 + 企业记录回 available
  const rec = await request(app).post(`/api/customer/enterprise/pool/${item.id}/recover`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(rec.status, 200);
  assert.equal(db.prepare('SELECT status FROM enterprise_public_pool WHERE id = ?').get(item.id).status, 'available');
  assert.equal(db.prepare("SELECT id FROM tenant_public_pool WHERE phone = '13900002006' AND customer_id = 1").get(), undefined);

  // 收回后可再次上浮（不触发查重）
  const up2 = await request(app).post(`/api/customer/enterprise/pool/${item.id}/float-up`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(up2.status, 200);
  // 清理：直接移交掉，避免影响后续
  db.prepare("UPDATE card_market_settings SET pool_float_mode = 'hard' WHERE customer_id = 1").run();
  await request(app).post(`/api/customer/enterprise/pool/${item.id}/float-up`).set('Authorization', `Bearer ${token}`);
  db.prepare("UPDATE card_market_settings SET pool_float_mode = 'soft' WHERE customer_id = 1").run();
});

test('A2 限时收回：超 7 天不可收回；hard 模式不可逆', { concurrency: false }, async () => {
  const token = issueToken(entMgr);
  // recover 模式：上浮后把平台公海记录时间改回 8 天前 → 收回拒绝
  db.prepare("UPDATE card_market_settings SET pool_float_mode = 'recover' WHERE customer_id = 1").run();
  db.prepare(`INSERT INTO enterprise_public_pool (enterprise_id, customer_id, source_type, name, phone, company)
    VALUES (1, 1, 'employee', '限时客户', '13900002007', '限时公司')`).run();
  const item = db.prepare("SELECT id FROM enterprise_public_pool WHERE phone = '13900002007'").get();
  await request(app).post(`/api/customer/enterprise/pool/${item.id}/float-up`).set('Authorization', `Bearer ${token}`);
  db.prepare("UPDATE tenant_public_pool SET created_at = datetime('now', '-8 days') WHERE phone = '13900002007' AND customer_id = 1").run();
  const rec = await request(app).post(`/api/customer/enterprise/pool/${item.id}/recover`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(rec.status, 400);
  assert.match(rec.body.error, /7 天/);
  db.prepare('DELETE FROM enterprise_public_pool WHERE id = ?').run(item.id);
  db.prepare("DELETE FROM tenant_public_pool WHERE phone = '13900002007' AND customer_id = 1").run();

  // hard 模式：上浮即 recycled，不可收回
  db.prepare("UPDATE card_market_settings SET pool_float_mode = 'hard' WHERE customer_id = 1").run();
  db.prepare(`INSERT INTO enterprise_public_pool (enterprise_id, customer_id, source_type, name, phone, company)
    VALUES (1, 1, 'employee', '移交客户', '13900002008', '移交公司')`).run();
  const item2 = db.prepare("SELECT id FROM enterprise_public_pool WHERE phone = '13900002008'").get();
  await request(app).post(`/api/customer/enterprise/pool/${item2.id}/float-up`).set('Authorization', `Bearer ${token}`);
  assert.equal(db.prepare('SELECT status FROM enterprise_public_pool WHERE id = ?').get(item2.id).status, 'recycled');
  const rec2 = await request(app).post(`/api/customer/enterprise/pool/${item2.id}/recover`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(rec2.status, 400);
  db.prepare('DELETE FROM enterprise_public_pool WHERE id = ?').run(item2.id);
  db.prepare("DELETE FROM tenant_public_pool WHERE phone = '13900002008' AND customer_id = 1").run();
  db.prepare("UPDATE card_market_settings SET pool_float_mode = 'soft' WHERE customer_id = 1").run();
});

test('A2 批量上浮：多选幂等批量移交平台公海', { concurrency: false }, async () => {
  const token = issueToken(entMgr);
  db.prepare(`INSERT INTO enterprise_public_pool (enterprise_id, customer_id, source_type, name, phone, company)
    VALUES (1, 1, 'employee', '批量一', '13900002009', '批量公司'),
           (1, 1, 'employee', '批量二', '13900002010', '批量公司')`).run();
  const a = db.prepare("SELECT id FROM enterprise_public_pool WHERE phone = '13900002009'").get();
  const b = db.prepare("SELECT id FROM enterprise_public_pool WHERE phone = '13900002010'").get();
  const res = await request(app).post('/api/customer/enterprise/pool/batch-float-up')
    .set('Authorization', `Bearer ${token}`).send({ ids: [a.id, b.id] });
  assert.equal(res.status, 200);
  assert.equal(res.body.floated, 2);
  assert.equal(db.prepare('SELECT status FROM enterprise_public_pool WHERE id = ?').get(a.id).status, 'floated');
  assert.equal(db.prepare('SELECT status FROM enterprise_public_pool WHERE id = ?').get(b.id).status, 'floated');
  // 清理
  db.prepare('DELETE FROM enterprise_public_pool WHERE id IN (?, ?)').run(a.id, b.id);
  db.prepare("DELETE FROM tenant_public_pool WHERE phone IN ('13900002009','13900002010') AND customer_id = 1").run();
});

test('A2 查重加固：平台公海已存在（含已领取状态）即拒绝', { concurrency: false }, async () => {
  const token = issueToken(entMgr);
  // 平台公海已有 claimed 记录（同手机号）
  db.prepare(`INSERT INTO tenant_public_pool (customer_id, source_type, name, phone, company, status, claimed_by)
    VALUES (1, 'individual', '已领客户', '13900002011', '某公司', 'claimed', 1)`).run();
  db.prepare(`INSERT INTO enterprise_public_pool (enterprise_id, customer_id, source_type, name, phone, company)
    VALUES (1, 1, 'employee', '重复客户', '13900002011', '重复公司')`).run();
  const item = db.prepare("SELECT id FROM enterprise_public_pool WHERE phone = '13900002011'").get();
  const up = await request(app).post(`/api/customer/enterprise/pool/${item.id}/float-up`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(up.status, 400);
  assert.match(up.body.error, /项目客户公海已存在/);
  db.prepare('DELETE FROM enterprise_public_pool WHERE id = ?').run(item.id);
  db.prepare("DELETE FROM tenant_public_pool WHERE phone = '13900002011' AND customer_id = 1").run();
});

test('A2 领取/释放闭环：客户同步进列表、释放清理归属', { concurrency: false }, async () => {
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
  // 领取后必须写入领取人客户列表（source=enterprise_pool）
  const cust = db.prepare("SELECT id, owner_user_id FROM card_customer WHERE source = 'enterprise_pool' AND phone = '13900002003'").get();
  assert.ok(cust, '领取后客户应进入领取人客户列表');
  assert.equal(cust.owner_user_id, entMgr.id);

  const release = await request(app).post(`/api/customer/enterprise/pool/${item.id}/release`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(release.status, 200);
  const rel = db.prepare('SELECT status FROM enterprise_public_pool WHERE id = ?').get(item.id);
  assert.equal(rel.status, 'available');
  // 释放后客户列表归属应清理（防重复进入列表）
  const gone = db.prepare("SELECT id FROM card_customer WHERE source = 'enterprise_pool' AND phone = '13900002003'").get();
  assert.equal(gone, undefined, '释放回公海后客户列表应删除该归属记录');
});

test('A2 分配指定员工：管理员可指定本企业员工领取（归属被分配人）', { concurrency: false }, async () => {
  const token = issueToken(entMgr);
  const pu = db.prepare("SELECT * FROM platform_user WHERE openid = 'ent_openid_1'").get();
  // 员工绑定到企业（platform_user.enterprise_id）
  db.prepare('UPDATE platform_user SET enterprise_id = 1 WHERE id = ?').run(pu.id);
  db.prepare(`INSERT INTO enterprise_public_pool (enterprise_id, customer_id, source_type, name, phone, company)
    VALUES (1, 1, 'employee', '派单客户', '13900002004', '派单公司')`).run();
  const item = db.prepare("SELECT id FROM enterprise_public_pool WHERE phone = '13900002004'").get();

  const claim = await request(app).post(`/api/customer/enterprise/pool/${item.id}/claim`)
    .set('Authorization', `Bearer ${token}`).send({ userId: pu.id });
  assert.equal(claim.status, 200, '企业管理员应可指定员工领取');
  const claimed = db.prepare('SELECT claimed_by FROM enterprise_public_pool WHERE id = ?').get(item.id);
  assert.equal(claimed.claimed_by, pu.id, '客户应归属被指定员工');
  const cust = db.prepare("SELECT owner_user_id FROM card_customer WHERE source = 'enterprise_pool' AND phone = '13900002004'").get();
  assert.equal(cust.owner_user_id, pu.id, '客户列表归属应为被指定员工');

  // 指定非本企业员工 → 400
  const outsider = db.prepare("SELECT * FROM platform_user WHERE openid = 'ent_openid_1'").get();
  db.prepare('UPDATE platform_user SET enterprise_id = NULL WHERE id = ?').run(pu.id);
  db.prepare(`INSERT INTO enterprise_public_pool (enterprise_id, customer_id, source_type, name, phone, company)
    VALUES (1, 1, 'employee', '越权客户', '13900002005', '越权公司')`).run();
  const item2 = db.prepare("SELECT id FROM enterprise_public_pool WHERE phone = '13900002005'").get();
  const bad = await request(app).post(`/api/customer/enterprise/pool/${item2.id}/claim`)
    .set('Authorization', `Bearer ${token}`).send({ userId: pu.id });
  assert.equal(bad.status, 400, '非本企业员工不可被指定领取');
  // 清理越权数据
  db.prepare('DELETE FROM enterprise_public_pool WHERE id = ?').run(item2.id);
  db.prepare('DELETE FROM enterprise_public_pool WHERE id = ?').run(item.id);
  db.prepare("DELETE FROM card_customer WHERE source = 'enterprise_pool'").run();
  db.prepare('UPDATE platform_user SET enterprise_id = NULL WHERE id = ?').run(pu.id);
});
