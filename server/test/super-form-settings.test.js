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
 * 超级表单「基础信息 + 填写设置」（表单设置→基础设置）服务端行为（对齐 ew）：
 * - 基础信息：收集份数（collectLimit，0=不限，累计总数）→「表单收集份数已达上限」
 * - 填写设置：次数（submitTimes，0=不限，按填写人计数；游客不受限）→「您的填写次数已达上限」
 * - 提交周期 submitCycle：permanent=永久 / day=每天 / week=每周 / month=每月 / year=每年
 * - 填表人群 fillCrowd：all=全部（包含游客）/ auth=授权用户 / level=指定等级（crowdLevels 多选）/ pwd=密码（crowdPwd 最多20位）
 * - 页面背景 globalStyle：图片+颜色（bgRepeat/bgPosX/bgPosY/bgImgStyle/bgImgW/bgImgH）随 config 落库
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

async function createForm(t, basic, globalStyle) {
  const res = await request(app).post(API)
    .set('Authorization', `Bearer ${t}`)
    .send({
      name: '报名表',
      config: {
        components: [{ id: 'c1', type: 'text', content: { label: '姓名' }, style: {} }],
        settings: { basic: { name: '报名表', collectLimit: 0, submitTimes: 0, ...basic }, globalStyle: { ...globalStyle } },
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
    fillCrowd: 'level', crowdLevels: ['vip1', 'vip2'], crowdPwd: 'abc123', submitCycle: 'day',
    submitTimes: 3,
  }, { pageBgType: 'imgcolor', bgRepeat: 'no-repeat', bgPosX: 'center', bgPosY: 'bottom', bgImgStyle: 'custom', bgImgW: 50, bgImgH: 60 });
  const get = await request(app).get(`${API}/${id}`).set('Authorization', `Bearer ${t}`);
  assert.equal(get.status, 200);
  const b = get.body.config.settings.basic;
  assert.equal(b.fillCrowd, 'level');
  assert.deepEqual(b.crowdLevels, ['vip1', 'vip2']);
  assert.equal(b.crowdPwd, 'abc123');
  assert.equal(b.submitCycle, 'day');
  assert.equal(b.submitTimes, 3);
  const g = get.body.config.settings.globalStyle;
  assert.equal(g.pageBgType, 'imgcolor');
  assert.equal(g.bgRepeat, 'no-repeat');
  assert.equal(g.bgPosX, 'center');
  assert.equal(g.bgPosY, 'bottom');
  assert.equal(g.bgImgStyle, 'custom');
  assert.equal(g.bgImgW, 50);
  assert.equal(g.bgImgH, 60);
});

test('填写设置：每天+次数2 → 同一用户第3次被拒，游客不受限', async () => {
  const t = issueToken(adm);
  const id = await createForm(t, { submitCycle: 'day', submitTimes: 2 });
  // 登录用户（JWT 软认证识别身份）
  const s1 = await request(app).post(`${API}/${id}/submit`).set('Authorization', `Bearer ${t}`).send({ data: { c1: '甲' } });
  assert.equal(s1.status, 200);
  const s2 = await request(app).post(`${API}/${id}/submit`).set('Authorization', `Bearer ${t}`).send({ data: { c1: '乙' } });
  assert.equal(s2.status, 200);
  const s3 = await request(app).post(`${API}/${id}/submit`).set('Authorization', `Bearer ${t}`).send({ data: { c1: '丙' } });
  assert.equal(s3.status, 400);
  assert.equal(s3.body.error, '您的填写次数已达上限');
  // 游客（无 token）不受次数限制
  const g1 = await request(app).post(`${API}/${id}/submit`).send({ data: { c1: '游客' } });
  assert.equal(g1.status, 200);
});

test('填写设置：永久+次数1 → 换周期边界（按累计计数）', async () => {
  const t = issueToken(adm);
  const id = await createForm(t, { submitCycle: 'permanent', submitTimes: 1 });
  const s1 = await request(app).post(`${API}/${id}/submit`).set('Authorization', `Bearer ${t}`).send({ data: { c1: '甲' } });
  assert.equal(s1.status, 200);
  const s2 = await request(app).post(`${API}/${id}/submit`).set('Authorization', `Bearer ${t}`).send({ data: { c1: '乙' } });
  assert.equal(s2.status, 400);
  assert.equal(s2.body.error, '您的填写次数已达上限');
});

test('基础信息：收集份数2 → 第3次提交被拒（按累计总数）', async () => {
  const t = issueToken(adm);
  const id = await createForm(t, { collectLimit: 2 });
  await request(app).post(`${API}/${id}/submit`).send({ data: { c1: '甲' } });
  await request(app).post(`${API}/${id}/submit`).send({ data: { c1: '乙' } });
  const s3 = await request(app).post(`${API}/${id}/submit`).send({ data: { c1: '丙' } });
  assert.equal(s3.status, 400);
  assert.equal(s3.body.error, '表单收集份数已达上限');
});

test('基础信息 + 填写设置：均为0 = 不限，可连续提交', async () => {
  const t = issueToken(adm);
  const id = await createForm(t, { collectLimit: 0, submitTimes: 0 });
  for (let i = 0; i < 3; i++) {
    const s = await request(app).post(`${API}/${id}/submit`).send({ data: { c1: '客' + i } });
    assert.equal(s.status, 200);
  }
});
