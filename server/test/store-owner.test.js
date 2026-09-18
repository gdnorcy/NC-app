/**
 * 门店负责人 × 统一账号体系：负责人二选一（新建账号 / 复用已有成员）+ store_admin 角色绑定
 * 覆盖：GET /api/customer/roles 返回 perms；POST /store ownerMode=new/existing
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, hashPassword } from '../src/db.js';
import { createApp } from '../src/app.js';

let tmpDir, db, app, server, tenantToken;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-owner-'));
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
  globalThis.__storeOwnerPrev = prev;

  const { hash, salt } = hashPassword('admin123');
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('tenant1','13800000001',?,?,'tenant_admin','active',1)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (1, '一号客户', 'active', '[\"demo\"]')").run();
  // store_admin 内置角色（roles 表 seed 应已含，此处幂等兜底）
  db.prepare("INSERT OR IGNORE INTO roles (tenant_id, code, name) VALUES (0, 'store_admin', '门店管理员')").run();

  const login = async (u, p) => (await request(app).post('/api/auth/login').send({ username: u, password: p })).body.token;
  tenantToken = await login('tenant1', 'admin123');
});

after(() => {
  try { server?.close(); } catch {}
  try { db.close(); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  Object.assign(config, globalThis.__storeOwnerPrev);
});

test('GET /api/customer/roles 返回 perms 权限点数组（供分配权限弹窗回显）', async () => {
  const r = await request(app).get('/api/customer/roles').set('Authorization', `Bearer ${tenantToken}`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.roles));
  for (const role of r.body.roles) {
    assert.ok(Array.isArray(role.perms), `角色 ${role.code} 应含 perms 数组`);
    assert.ok('perm_count' in role);
    assert.ok('member_count' in role);
  }
});

test('创建门店 ownerMode=new：自动建账号+成员+绑定 store_admin，密码不落库', async () => {
  const phone = '13900001111';
  const r = await request(app).post('/api/customer/store').set('Authorization', `Bearer ${tenantToken}`).send({
    name: '新账号门店', phone: '0769-1111', ownerMode: 'new', ownerName: '张三', ownerPhone: phone, ownerPassword: 'abc123',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const store = r.body.store;
  assert.ok(store.id);
  assert.ok(store.owner_member_id, '门店应落 owner_member_id');
  assert.equal(store.owner_password, '', '门店不应存负责人密码明文');

  // 账号已创建（手机号=登录账号），密码为哈希而非明文
  const account = db.prepare('SELECT * FROM accounts WHERE phone = ?').get(phone);
  assert.ok(account, '应创建 accounts 账号');
  assert.notEqual(account.password_hash, 'abc123', '密码应以哈希存储');
  assert.ok(account.password_hash && account.password_salt);
  // 成员已创建并绑定角色
  const member = db.prepare('SELECT * FROM tenant_members WHERE tenant_id = 1 AND account_id = ?').get(account.id);
  assert.ok(member, '应创建 tenant_members');
  const bind = db.prepare('SELECT 1 FROM member_roles mr JOIN roles r ON r.id = mr.role_id WHERE mr.member_id = ? AND r.code = ?').get(member.id, 'store_admin');
  assert.ok(bind, '应绑定 store_admin 角色');
});

test('创建门店 ownerMode=existing：复用已有成员并补绑 store_admin', async () => {
  // 预置一个成员（直接落库模拟已有成员）
  const { hash, salt } = hashPassword('pass123');
  const accR = db.prepare("INSERT INTO accounts (username, phone, password_hash, password_salt, status) VALUES (?, ?, ?, ?, 'active')").run('13900002222', '13900002222', hash, salt);
  const memR = db.prepare("INSERT INTO tenant_members (tenant_id, account_id, name, nickname, status, identities) VALUES (1, ?, '李四', '李四', 'active', '[\"backend_admin\"]')").run(accR.lastInsertRowid);

  const r = await request(app).post('/api/customer/store').set('Authorization', `Bearer ${tenantToken}`).send({
    name: '复用成员门店', phone: '0769-2222', ownerMode: 'existing', ownerMemberId: memR.lastInsertRowid,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.store.owner_member_id, memR.lastInsertRowid);
  const bind = db.prepare('SELECT 1 FROM member_roles mr JOIN roles r ON r.id = mr.role_id WHERE mr.member_id = ? AND r.code = ?').get(memR.lastInsertRowid, 'store_admin');
  assert.ok(bind, '复用成员应补绑 store_admin');
});

test('创建门店校验：existing 传他租户成员应 400；new 手机号非法应 400', async () => {
  const otherAccR = db.prepare("INSERT INTO accounts (username, phone, password_hash, password_salt, status) VALUES ('13899990000','13899990000','x','y','active')").run();
  const otherMemR = db.prepare("INSERT INTO tenant_members (tenant_id, account_id, name, nickname, status, identities) VALUES (999, ?, '外租户', '外租户', 'active', '[\"backend_admin\"]')").run(otherAccR.lastInsertRowid);
  const r1 = await request(app).post('/api/customer/store').set('Authorization', `Bearer ${tenantToken}`).send({
    name: '越权成员门店', phone: '0769-3333', ownerMode: 'existing', ownerMemberId: otherMemR.lastInsertRowid,
  });
  assert.equal(r1.status, 400);
  assert.match(r1.body.error, /不属于本租户/);

  const r2 = await request(app).post('/api/customer/store').set('Authorization', `Bearer ${tenantToken}`).send({
    name: '坏手机号门店', phone: '0769-4444', ownerMode: 'new', ownerName: '王五', ownerPhone: '12345', ownerPassword: 'abc123',
  });
  assert.equal(r2.status, 400);
  assert.match(r2.body.error, /手机号/);
});
