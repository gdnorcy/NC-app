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
 * A3 C 端表单填写页（表单配置 + 访客提交 + 线索回流）
 * - 租户管理员创建表单（可挂载指定名片）→ 列表/编辑/停用/删除
 * - 访客免认证提交（公开白名单）；提交记录
 * - 挂载名片的表单提交 → 线索回流到名片主人客户列表（同号去重）
 * - 已有提交记录的表单禁止改内容；跨租户访问隔离
 */
let app;
let tmpDir;
let db;
let adm1;
let adm2;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-form-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_FORM</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });

  const { hash, salt } = hashPassword('Test@123');
  db.prepare(`INSERT INTO projects (customer_name, status, invite_code, solutions) VALUES ('表单租户', 'active', '2004', '["panorama","card"]')`).run();
  db.prepare(`INSERT INTO projects (customer_name, status, invite_code, solutions) VALUES ('其它租户', 'active', '2005', '["panorama","card"]')`).run();
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('f_adm1', '13800001201', hash, salt, 'tenant_admin', 'active', 1);
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('f_adm2', '13800001202', hash, salt, 'tenant_admin', 'active', 2);
  adm1 = db.prepare('SELECT * FROM users WHERE username = ?').get('f_adm1');
  adm2 = db.prepare('SELECT * FROM users WHERE username = ?').get('f_adm2');

  // C 端用户 + 名片（租户1）
  db.prepare(`INSERT INTO platform_user (openid, nickname, customer_id, status) VALUES ('f_open_1', '名片主人', 1, 'active')`).run();
  const pu = db.prepare("SELECT id FROM platform_user WHERE openid = 'f_open_1'").get();
  db.prepare(`INSERT INTO card_profile (user_id, name, position, phone, status, customer_id) VALUES (?, '主人甲', '销售', '13900003001', 'active', 1)`).run(pu.id);
  global.__pu1 = pu.id;
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('A3 创建表单（挂载名片）+ 列表 + 详情带 activeForm', async () => {
  const t1 = issueToken(adm1);
  const card = db.prepare("SELECT id FROM card_profile WHERE name = '主人甲'").get();

  const create = await request(app).post('/api/card-market/forms')
    .set('Authorization', `Bearer ${t1}`)
    .send({ title: '商务咨询', description: '填写需求', cardId: card.id, fields: [
      { name: 'name', label: '姓名', type: 'text', required: true },
      { name: 'phone', label: '电话', type: 'tel', required: true },
    ] });
  assert.equal(create.status, 200);
  const formId = create.body.id;
  global.__formId = formId;

  const list = await request(app).get('/api/card-market/forms').set('Authorization', `Bearer ${t1}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.forms.length, 1);
  assert.equal(list.body.forms[0].cardId, card.id);

  // 跨租户：租户2 看不到租户1 的表单
  const cross = await request(app).get('/api/card-market/forms').set('Authorization', `Bearer ${issueToken(adm2)}`);
  assert.equal(cross.body.forms.length, 0);

  // 挂载其他租户名片 → 400
  const bad = await request(app).post('/api/card-market/forms')
    .set('Authorization', `Bearer ${t1}`).send({ title: 'x', cardId: 99999 });
  assert.equal(bad.status, 400);

  // 名片详情（公开）携带 activeForm
  const detail = await request(app).get(`/api/card/cards/${card.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.activeForm.title, '商务咨询');
  assert.equal(detail.body.activeForm.fields.length, 2);
});

test('A3 访客免认证提交 → 提交记录 + 线索回流（同号去重）', async () => {
  const formId = global.__formId;
  const t1 = issueToken(adm1);

  const submit = await request(app).post(`/api/card-market/forms/${formId}/submit`)
    .send({ data: { name: '访客王', phone: '13900004001' } });
  assert.equal(submit.status, 200);
  assert.equal(submit.body.leadRecycled, true);

  const owner = db.prepare('SELECT id FROM platform_user WHERE openid = ?').get('f_open_1');
  const lead = db.prepare('SELECT * FROM card_customer WHERE owner_user_id = ? AND phone = ?').get(owner.id, '13900004001');
  assert.ok(lead, '线索应回流到名片主人客户列表');
  assert.equal(lead.owner_type, 'individual');
  assert.equal(lead.source_type, 'form');

  // 同号重复提交 → 不再重复插入客户
  const again = await request(app).post(`/api/card-market/forms/${formId}/submit`)
    .send({ data: { name: '访客王2', phone: '13900004001' } });
  assert.equal(again.body.leadRecycled, false);
  const cnt = db.prepare('SELECT COUNT(*) AS c FROM card_customer WHERE phone = ?').get('13900004001').c;
  assert.equal(cnt, 1);

  // 提交记录 2 条
  const subs = await request(app).get(`/api/card-market/forms/${formId}/submissions`)
    .set('Authorization', `Bearer ${t1}`);
  assert.equal(subs.body.submissions.length, 2);
});

test('A3 已有提交的表单禁改内容、可停用；停用后访客提交 404', async () => {
  const formId = global.__formId;
  const t1 = issueToken(adm1);

  const modify = await request(app).put(`/api/card-market/forms/${formId}`)
    .set('Authorization', `Bearer ${t1}`).send({ title: '改名' });
  assert.equal(modify.status, 400);

  const disable = await request(app).put(`/api/card-market/forms/${formId}`)
    .set('Authorization', `Bearer ${t1}`).send({ status: 'disabled' });
  assert.equal(disable.status, 200);

  const afterDisable = await request(app).post(`/api/card-market/forms/${formId}/submit`)
    .send({ data: { name: 'x', phone: '13900004002' } });
  assert.equal(afterDisable.status, 404);

  // 跨租户访问提交记录 → 404
  const cross = await request(app).get(`/api/card-market/forms/${formId}/submissions`)
    .set('Authorization', `Bearer ${issueToken(adm2)}`);
  assert.equal(cross.status, 404);
});

test('A3 删除表单级联清理提交记录', async () => {
  const formId = global.__formId;
  const t1 = issueToken(adm1);

  const del = await request(app).delete(`/api/card-market/forms/${formId}`)
    .set('Authorization', `Bearer ${t1}`);
  assert.equal(del.status, 200);
  const cnt = db.prepare('SELECT COUNT(*) AS c FROM card_form_submission WHERE form_id = ?').get(formId).c;
  assert.equal(cnt, 0);
});
