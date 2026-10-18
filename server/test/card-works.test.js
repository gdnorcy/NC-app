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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-works-test-'));
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

async function createCard(token, name) {
  const res = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, position: '顾问', city: '深圳', isPublic: true });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.card.id;
}

// 1x1 透明 PNG（multer 只校验 mime，storage.put 落盘；用真实 PNG 防图片处理链炸）
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test('作品 CRUD + 归属校验 + 排序', async () => {
  const tokenA = await wxLogin('works_owner_a');
  const tokenB = await wxLogin('works_other_b');
  const cardId = await createCard(tokenA, '作品主人');

  // 1. 新增作品（图片直传 + 标题）
  const add1 = await request(app)
    .post(`/api/card/cards/${cardId}/works`)
    .set('Authorization', `Bearer ${tokenA}`)
    .attach('file', PNG, { filename: 'w1.png', contentType: 'image/png' })
    .field('title', '第一作');
  assert.equal(add1.status, 201, JSON.stringify(add1.body));
  const w1 = add1.body.work;
  assert.ok(w1.id);
  assert.equal(w1.title, '第一作');
  assert.ok(w1.imageUrl);
  assert.equal(w1.sortOrder, 1);

  const add2 = await request(app)
    .post(`/api/card/cards/${cardId}/works`)
    .set('Authorization', `Bearer ${tokenA}`)
    .attach('file', PNG, { filename: 'w2.png', contentType: 'image/png' })
    .field('title', '第二作');
  assert.equal(add2.status, 201);
  const w2 = add2.body.work;
  assert.equal(w2.sortOrder, 2);

  // 2. 公开 GET 按 sort_order 升序
  const list = await request(app).get(`/api/card/cards/${cardId}/works`);
  assert.equal(list.status, 200);
  assert.equal(list.body.works.length, 2);
  assert.deepEqual(list.body.works.map((w) => w.id), [w1.id, w2.id]);

  // 3. 改标题
  const upd = await request(app)
    .put(`/api/card/cards/${cardId}/works/${w1.id}`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ title: '改过的标题' });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.work.title, '改过的标题');

  // 4. 排序：把 w2 提前 → GET 顺序应变
  const sort = await request(app)
    .put(`/api/card/cards/${cardId}/works/sort`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ ids: [w2.id, w1.id] });
  assert.equal(sort.status, 200);
  const list2 = await request(app).get(`/api/card/cards/${cardId}/works`);
  assert.deepEqual(list2.body.works.map((w) => w.id), [w2.id, w1.id]);

  // 5. 归属校验：B 不能改/删 A 的作品（404，不泄漏存在性细节）
  const updB = await request(app)
    .put(`/api/card/cards/${cardId}/works/${w1.id}`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ title: 'hack' });
  assert.equal(updB.status, 404);
  const delB = await request(app).delete(`/api/card/cards/${cardId}/works/${w1.id}`).set('Authorization', `Bearer ${tokenB}`);
  assert.equal(delB.status, 404);

  // 6. 未登录不能写（401）
  const noAuth = await request(app).put(`/api/card/cards/${cardId}/works/${w1.id}`).send({ title: 'x' });
  assert.equal(noAuth.status, 401);

  // 7. 非图片 mime 拒绝
  const badMime = await request(app)
    .post(`/api/card/cards/${cardId}/works`)
    .set('Authorization', `Bearer ${tokenA}`)
    .attach('file', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
  assert.equal(badMime.status, 400);

  // 8. 删除（A）→ 只剩 w2
  const del = await request(app).delete(`/api/card/cards/${cardId}/works/${w1.id}`).set('Authorization', `Bearer ${tokenA}`);
  assert.equal(del.status, 200);
  const list3 = await request(app).get(`/api/card/cards/${cardId}/works`);
  assert.deepEqual(list3.body.works.map((w) => w.id), [w2.id]);
});
