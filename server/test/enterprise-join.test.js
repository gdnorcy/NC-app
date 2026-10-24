/**
 * 🔴 回归锁：员工凭企业口令（ENT######）自助加入企业
 *
 * 背景：企业口令从 2026-09 起就能在后台生成/展示（customer.js /enterprise/invite-code
 * + 企业仪表盘/设置页），但**兑换闭环一直没做**——员工加入只能企业管理员从
 * 「未认证个人」池添加（/enterprise/employees）。本测试钉死新路由
 * POST /api/card-market/enterprise/join 的行为：
 *
 *  1 口令精确匹配 tenant_enterprises.config.invite_code（大小写不敏感、禁模糊匹配）；
 *  2 与后台添加落同两端：platform_user.enterprise_id/role + tenant_enterprise_employees active；
 *  3 已加入企业 / 已入驻其他客户 → 400 拒绝（不跨租户拉人）；
 *  4 未落户租户的凭码一并落户（只填空不覆盖）；
 *  5 离职（left）后凭同一口令重新加入 → 复活原记录，不重复插；
 *  6 走 employeeCount 方案配额。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';

let app;
let db;
let tmpDir;
let entId;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-ent-join-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  // 多租户平台模式：关闭登录时的租户兜底（card.js wx-login 读 config.defaultTenantId）。
  // 不关的后果：mock 登录把每个新用户绑到默认租户 1，join 全撞「已入驻其他客户」400，
  // 「未落户租户的凭码一并落户」分支永远测不到。生产 H5 带 ?tid= 进入时同效。
  config.defaultTenantId = 0;
  db = createDb(config.dbPath);
  app = createApp({ db });

  // 租户2（租户1 由迁移默认创建，id=1, invite_code='1001'）
  db.prepare(`INSERT INTO projects (customer_name, description, status, invite_code, solutions)
    VALUES ('租户B', '', 'active', '2002', '["panorama","card"]')`).run();
  // 企业（config.invite_code 即企业口令）
  const r = db.prepare(`INSERT INTO tenant_enterprises (customer_id, name, industry, admin_user_id, status, config)
    VALUES (2, '东莞xx商会', '社会组织', 0, 'active', ?)`).run(JSON.stringify({ invite_code: 'ENT123456' }));
  entId = r.lastInsertRowid;
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function wxLogin(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200);
  return res.body.token;
}
// card 端 token 不是 JWT：base64(JSON{uid,openid,ts}).randhex（见 card.js wx-login）
function uidOf(token) {
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString()).uid;
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const join = (token, body) => request(app).post('/api/card-market/enterprise/join').set(bearer(token)).send(body);

test('口令正确 → 加入成功，且两端都落（platform_user + tenant_enterprise_employees）', async () => {
  const token = await wxLogin('ent_join_ok');
  const res = await join(token, { inviteCode: 'ENT123456' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.enterprise.id, entId);

  const uid = uidOf(token);
  const pu = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(uid);
  assert.equal(pu.enterprise_id, entId);
  assert.equal(pu.enterprise_role, 'member');
  // 未落户租户的凭码一并落户
  assert.equal(pu.customer_id, 2);

  const emp = db.prepare('SELECT * FROM tenant_enterprise_employees WHERE enterprise_id = ? AND user_id = ?').get(entId, uid);
  assert.ok(emp, 'tenant_enterprise_employees 应有记录');
  assert.equal(emp.status, 'active');
  assert.equal(emp.role, 'member');
});

test('口令大小写不敏感（小写输入也能加入）', async () => {
  const token = await wxLogin('ent_join_lower');
  const res = await join(token, { inviteCode: 'ent123456' });
  assert.equal(res.status, 200);
  assert.equal(res.body.enterprise.id, entId);
});

test('口令无效 / 为空 → 400', async () => {
  const token = await wxLogin('ent_join_bad');
  const bad = await join(token, { inviteCode: 'ENT999999' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /企业口令无效/);
  const empty = await join(token, { inviteCode: '' });
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /请输入企业口令/);
  const none = await join(token, {});
  assert.equal(none.status, 400);
});

test('已加入企业的用户再次加入 → 400（不静默换企业）', async () => {
  const token = await wxLogin('ent_join_dup');
  assert.equal((await join(token, { inviteCode: 'ENT123456' })).status, 200);
  const again = await join(token, { inviteCode: 'ENT123456' });
  assert.equal(again.status, 400);
  assert.match(again.body.error, /你已加入企业/);
});

test('已入驻其他客户项目的用户 → 400（不跨租户拉人）', async () => {
  const token = await wxLogin('ent_join_other_tenant');
  const uid = uidOf(token);
  db.prepare("UPDATE platform_user SET customer_id = 1 WHERE id = ?").run(uid);
  const res = await join(token, { inviteCode: 'ENT123456' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /已入驻其他客户项目/);
  // 拒绝后不落任何企业记录
  const emp = db.prepare('SELECT id FROM tenant_enterprise_employees WHERE user_id = ?').get(uid);
  assert.equal(emp, undefined);
});

test('离职（left）后凭同一口令重新加入 → 复活原记录，不重复插', async () => {
  const token = await wxLogin('ent_join_rejoin');
  const uid = uidOf(token);
  assert.equal((await join(token, { inviteCode: 'ENT123456' })).status, 200);
  // 模拟被移出企业（后台 remove 的两端动作）
  db.prepare("UPDATE tenant_enterprise_employees SET status = 'left' WHERE enterprise_id = ? AND user_id = ?").run(entId, uid);
  db.prepare('UPDATE platform_user SET enterprise_id = NULL, enterprise_role = ? WHERE id = ?').run('none', uid);
  // 重新加入
  const res = await join(token, { inviteCode: 'ENT123456' });
  assert.equal(res.status, 200);
  const rows = db.prepare('SELECT id, status FROM tenant_enterprise_employees WHERE enterprise_id = ? AND user_id = ?').all(entId, uid);
  assert.equal(rows.length, 1, '不得重复插记录');
  assert.equal(rows[0].status, 'active');
  const pu = db.prepare('SELECT enterprise_id, enterprise_role FROM platform_user WHERE id = ?').get(uid);
  assert.equal(pu.enterprise_id, entId);
  assert.equal(pu.enterprise_role, 'member');
});

test('未登录 → 401', async () => {
  const res = await request(app).post('/api/card-market/enterprise/join').send({ inviteCode: 'ENT123456' });
  assert.equal(res.status, 401);
});
