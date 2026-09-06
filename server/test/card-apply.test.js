import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';

let app;
let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-card-test-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  app = createApp();
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function wxLogin(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200);
  return res.body.token;
}

test('创建名片+入驻申请合并流程', async () => {
  const token = await wxLogin('merge_flow_1');

  // 1. 无口令：仅创建名片，不入驻
  const noBind = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '仅名片', position: '顾问', city: '广州', isPublic: true });
  assert.equal(noBind.status, 200);
  assert.equal(noBind.body.card.name, '仅名片');
  assert.equal(noBind.body.card.cardType, 'personal');
  assert.equal(noBind.body.card.city, '广州');

  // 2. 数字口令不存在：返回400，不创建名片
  const badBind = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '坏口令', bindCode: '999999', applyType: 'individual' });
  assert.equal(badBind.status, 400);
  assert.match(badBind.body.error, /口令无效/);

  // 3. 无效字符串口令：返回400
  const badStr = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '坏口令2', bindCode: 'not-exist-code', applyType: 'individual' });
  assert.equal(badStr.status, 400);

  // 4. 姓名缺失：返回400
  const noName = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ position: 'x' });
  assert.equal(noName.status, 400);
  assert.match(noName.body.error, /姓名/);
});

test('个人入驻+企业入驻', async () => {
  const token = await wxLogin('merge_flow_2');

  // 预置一个客户项目（customer_id=1 由迁移默认创建）
  // 个人入驻
  const individual = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '个人甲', position: '产品经理', phone: '13800138000', bindCode: '1', applyType: 'individual', isPublic: true });
  assert.equal(individual.status, 200);
  assert.equal(individual.body.card.cardType, 'personal');

  // 企业入驻
  const enterprise = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: '企业主', position: 'CEO', city: '深圳',
      bindCode: '1', applyType: 'enterprise',
      enterpriseName: '测试企业有限公司', industry: '互联网', isPublic: true,
    });
  assert.equal(enterprise.status, 200);
  assert.equal(enterprise.body.card.cardType, 'company');
  assert.ok(enterprise.body.card.enterpriseId, '企业名片应关联enterpriseId');

  // 企业缺少企业名称：400
  const noEntName = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '企业主2', bindCode: '1', applyType: 'enterprise' });
  assert.equal(noEntName.status, 400);
  assert.match(noEntName.body.error, /企业名称/);
});
