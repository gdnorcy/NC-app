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
 * 超级表单「填写设置」（表单设置→基础设置）服务端行为：
 * - 次数（settings.basic.collectLimit，0=不限）提交上限校验
 * - 提交周期 submitCycle=daily（每天一次）按当天提交数计数，文案「今日填写次数已达上限」
 * - submitCycle=once（仅一次，默认）按累计提交数计数，文案「表单收集份数已达上限」
 * - 填写设置新字段（fillCrowd/crowdAddable/submitCycle/cycleStart/cycleEnd）随 config 落库
 */
let app;
let tmpDir;
let db;
let adm;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-sfset-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_SFSET</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });

  const { hash, salt } = hashPassword('Test@123');
  db.prepare(`INSERT INTO projects (customer_name, status, invite_code, solutions) VALUES ('表单设置租户', 'active', '2101', '["panorama","card"]')`).run();
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('sf_adm', '13800002101', hash, salt, 'tenant_admin', 'active', 1);
  adm = db.prepare('SELECT * FROM users WHERE username = ?').get('sf_adm');
});

after(() => {
  try { db?.close(); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

const API = '/api/card-market/super-form';

async function createForm(t, basic) {
  const res = await request(app).post(API)
    .set('Authorization', `Bearer ${t}`)
    .send({
      name: '报名表',
      config: {
        components: [{ id: 'c1', type: 'text', content: { label: '姓名' }, style: {} }],
        settings: { basic: { name: '报名表', collectLimit: 2, ...basic } },
      },
    });
  assert.equal(res.status, 200);
  const id = res.body.id;
  const pub = await request(app).put(`${API}/${id}`)
    .set('Authorization', `Bearer ${t}`)
    .send({ status: 'published' });
  assert.equal(pub.status, 200);
  return id;
}

test('填写设置：新字段随 config 落库并可回读', async () => {
  const t = issueToken(adm);
  const id = await createForm(t, {
    fillCrowd: 'member', crowdAddable: false, submitCycle: 'daily',
    cycleStart: '2026-09-01', cycleEnd: '2026-09-30',
  });
  const get = await request(app).get(`${API}/${id}`).set('Authorization', `Bearer ${t}`);
  assert.equal(get.status, 200);
  const basic = get.body.config?.settings?.basic || get.body.config?.settings?.basic;
  const b = get.body.config.settings.basic;
  assert.equal(b.fillCrowd, 'member');
  assert.equal(b.crowdAddable, false);
  assert.equal(b.submitCycle, 'daily');
  assert.equal(b.cycleStart, '2026-09-01');
  assert.equal(b.cycleEnd, '2026-09-30');
});

test('填写设置：每天一次 + 次数2 → 第3次提交被拒（按当天计数）', async () => {
  const t = issueToken(adm);
  const id = await createForm(t, { submitCycle: 'daily', collectLimit: 2 });
  const s1 = await request(app).post(`${API}/${id}/submit`).send({ data: { c1: '甲' } });
  assert.equal(s1.status, 200);
  const s2 = await request(app).post(`${API}/${id}/submit`).send({ data: { c1: '乙' } });
  assert.equal(s2.status, 200);
  const s3 = await request(app).post(`${API}/${id}/submit`).send({ data: { c1: '丙' } });
  assert.equal(s3.status, 400);
  assert.equal(s3.body.error, '今日填写次数已达上限');
});

test('填写设置：仅一次 + 次数2 → 第3次提交被拒（按累计计数）', async () => {
  const t = issueToken(adm);
  const id = await createForm(t, { submitCycle: 'once', collectLimit: 2 });
  await request(app).post(`${API}/${id}/submit`).send({ data: { c1: '甲' } });
  await request(app).post(`${API}/${id}/submit`).send({ data: { c1: '乙' } });
  const s3 = await request(app).post(`${API}/${id}/submit`).send({ data: { c1: '丙' } });
  assert.equal(s3.status, 400);
  assert.equal(s3.body.error, '表单收集份数已达上限');
});

test('填写设置：次数0 = 不限，可连续提交', async () => {
  const t = issueToken(adm);
  const id = await createForm(t, { submitCycle: 'daily', collectLimit: 0 });
  for (let i = 0; i < 3; i++) {
    const s = await request(app).post(`${API}/${id}/submit`).send({ data: { c1: '客' + i } });
    assert.equal(s.status, 200);
  }
});
