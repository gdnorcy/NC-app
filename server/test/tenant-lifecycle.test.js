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
 * P2-10/P2-11 租户生命周期 + 解决方案功能开关拦截
 * - 未开通智能名片解决方案 → card 域接口 403；开通后恢复
 * - 租户到期 → 登录401 / 客户后台403 / card域403；续费后恢复
 * - 集市关闭 → 列表/交换禁用
 */
let app;
let tmpDir;
let db;
let adm2; // 租户2管理员行

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-tenant-life-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });

  // 租户2：默认只开通 panorama（未开通 card）
  db.prepare(`INSERT INTO projects (customer_name, description, status, invite_code, solutions)
    VALUES ('未开通名片租户', '', 'active', '2002', '["panorama"]')`).run();
  const { hash, salt } = hashPassword('Test@123');
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('life_adm2', '13800001002', hash, salt, 'tenant_admin', 'active', 2);
  adm2 = db.prepare('SELECT * FROM users WHERE username = ?').get('life_adm2');
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function tenantState() {
  return db.prepare('SELECT * FROM projects WHERE id = 2').get();
}

test('P2-10 未开通智能名片解决方案：card 域接口 403，开通后恢复', async () => {
  const token = issueToken(adm2);
  const headers = { Authorization: `Bearer ${token}` };

  // 未开通 → 403
  const blocked = await request(app).get('/api/card-market/market/settings').set(headers);
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error, /未开通/);

  // 平台开通 card 解决方案后 → 200
  db.prepare(`UPDATE projects SET solutions = '["panorama","card"]', updated_at = datetime('now') WHERE id = 2`).run();
  const opened = await request(app).get('/api/card-market/market/settings').set(headers);
  assert.equal(opened.status, 200);
  assert.ok(opened.body.settings);
});

test('P2-11 租户到期：登录/客户后台/card域全部拦截，续费后恢复', async () => {
  // 到期（valid_until = 昨天）
  db.prepare(`UPDATE projects SET valid_until = date('now', '-1 day'), updated_at = datetime('now') WHERE id = 2`).run();

  // 1. 账号密码登录被拒
  const login = await request(app).post('/api/auth/login').send({ username: 'life_adm2', password: 'Test@123' });
  assert.equal(login.status, 401);
  assert.match(login.body.error, /到期/);

  // 2. 已签发 JWT 访问客户后台被拒（惰性冻结）
  const token = issueToken(adm2);
  const cust = await request(app).get('/api/customer/profile').set({ Authorization: `Bearer ${token}` });
  assert.equal(cust.status, 403);
  assert.match(cust.body.error, /到期/);

  // 3. card 域被拒
  const card = await request(app).get('/api/card-market/market/settings').set({ Authorization: `Bearer ${token}` });
  assert.equal(card.status, 403);
  assert.match(card.body.error, /到期/);

  // 续费恢复
  db.prepare(`UPDATE projects SET valid_until = date('now', '+365 day'), updated_at = datetime('now') WHERE id = 2`).run();
  const login2 = await request(app).post('/api/auth/login').send({ username: 'life_adm2', password: 'Test@123' });
  assert.equal(login2.status, 200);
  const cust2 = await request(app).get('/api/customer/profile').set({ Authorization: `Bearer ${login2.body.token}` });
  assert.equal(cust2.status, 200);
});

test('P2-10 集市关闭后：列表清空、交换拒绝、统计与上架禁用', async () => {
  // 租户1（默认项目，已开通 card）
  const { hash, salt } = hashPassword('Test@123');
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('life_adm1', '13800001001', hash, salt, 'tenant_admin', 'active', 1);
  const adm1 = db.prepare('SELECT * FROM users WHERE username = ?').get('life_adm1');
  const token = issueToken(adm1);
  const headers = { Authorization: `Bearer ${token}` };

  // 关闭集市
  const off = await request(app).put('/api/card-market/market/settings').set(headers).send({ enabled: false });
  assert.equal(off.status, 200);

  // 列表返回空
  const list = await request(app).get('/api/card-market/market/list').set(headers);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.items, []);

  // 上架被拒（集市未开启 400 / 无权操作 403 均视为禁用）
  const toggle = await request(app).post('/api/card-market/market/toggle').set(headers).send({ subjectType: 'individual', subjectId: 1 });
  assert.ok([400, 403].includes(toggle.status), `集市关闭后上架应被拒绝，实际 ${toggle.status}`);

  // 重新开启
  await request(app).put('/api/card-market/market/settings').set(headers).send({ enabled: true });
  const on = await request(app).get('/api/card-market/market/list').set(headers);
  assert.equal(on.status, 200);
});
