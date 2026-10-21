import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';

// 覆盖个性化分享设置（2026-10-21）：card_profile 加 share_style / share_title 两列
//   - PUT /cards/:id 能存这两个字段（PATCH 语义：没传不动旧值）
//   - shareStyle 走白名单（脏值 400）
//   - toCard 出口能下发（所有名片读接口的单一出口）
let app;
let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-share-style-test-'));
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
    .send({ name, position: '顾问', city: '深圳', company: '测试公司', isPublic: true });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.card.id;
}

test('DB 迁移后 card_profile 含 share_style / share_title 两列', () => {
  const db = new DatabaseSync(config.dbPath);
  const cols = db.prepare('PRAGMA table_info(card_profile)').all().map((c) => c.name);
  assert.ok(cols.includes('share_style'), '缺 share_style 列');
  assert.ok(cols.includes('share_title'), '缺 share_title 列');
  db.close();
});

test('toCard 出口默认下发 shareStyle=cover-1 / shareTitle=""', async () => {
  const token = await wxLogin('code-share-default');
  const id = await createCard(token, '默认分享');
  const res = await request(app).get('/api/card/cards').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  const card = res.body.cards.find((c) => c.id === id);
  assert.ok(card, '名片未在列表里');
  assert.equal(card.shareStyle, 'cover-1');
  assert.equal(card.shareTitle, '');
});

test('PUT /cards/:id 能存 shareStyle + shareTitle', async () => {
  const token = await wxLogin('code-share-save');
  const id = await createCard(token, '保存分享');
  const res = await request(app)
    .put(`/api/card/cards/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ shareStyle: 'cover-3', shareTitle: '林平 · 副会长' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.card.shareStyle, 'cover-3');
  assert.equal(res.body.card.shareTitle, '林平 · 副会长');
});

test('shareStyle 脏值 → 400（不写库）', async () => {
  const token = await wxLogin('code-share-bad');
  const id = await createCard(token, '脏风格');
  const res = await request(app)
    .put(`/api/card/cards/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ shareStyle: 'cover-999' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error, '应有错误文案');
  // 确认没写进去
  const list = await request(app).get('/api/card/cards').set('Authorization', `Bearer ${token}`);
  const card = list.body.cards.find((c) => c.id === id);
  assert.equal(card.shareStyle, 'cover-1');
});

test('PATCH 语义：只传 shareTitle 时 shareStyle 保持旧值（不回落默认）', async () => {
  const token = await wxLogin('code-share-patch');
  const id = await createCard(token, '局部更新');
  await request(app)
    .put(`/api/card/cards/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ shareStyle: 'cover-5' });
  // 只传标题
  const res = await request(app)
    .put(`/api/card/cards/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ shareTitle: '只改标题' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.card.shareStyle, 'cover-5', 'shareStyle 被误重置了');
  assert.equal(res.body.card.shareTitle, '只改标题');
});

test('PATCH 语义：只传 shareStyle 时 shareTitle 保持旧值', async () => {
  const token = await wxLogin('code-share-patch2');
  const id = await createCard(token, '局部更新2');
  await request(app)
    .put(`/api/card/cards/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ shareTitle: '原标题' });
  const res = await request(app)
    .put(`/api/card/cards/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ shareStyle: 'cover-2' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.card.shareTitle, '原标题', 'shareTitle 被误清空了');
  assert.equal(res.body.card.shareStyle, 'cover-2');
});

test('shareTitle 超过 30 字被截断（不是报错）', async () => {
  const token = await wxLogin('code-share-long');
  const id = await createCard(token, '超长标题');
  const res = await request(app)
    .put(`/api/card/cards/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ shareTitle: 'A'.repeat(50) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.card.shareTitle.length, 30);
});

test('shareTitle 允许清空（传空串）', async () => {
  const token = await wxLogin('code-share-clear');
  const id = await createCard(token, '清空标题');
  await request(app)
    .put(`/api/card/cards/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ shareTitle: '有标题' });
  const res = await request(app)
    .put(`/api/card/cards/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ shareTitle: '' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.card.shareTitle, '');
});

test('shareTitle 首尾空格被 trim（存进去的是干净文案）', async () => {
  const token = await wxLogin('code-share-trim');
  const id = await createCard(token, '空格标题');
  const res = await request(app)
    .put(`/api/card/cards/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ shareTitle: '  林平  ' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.card.shareTitle, '林平');
});

test('toCard 出口对脏 share_style 归一为 cover-1', async () => {
  const token = await wxLogin('code-share-dirty');
  const id = await createCard(token, '库里脏值');
  // 直接改库模拟历史脏数据（绕过 API 的白名单校验）
  const db = new DatabaseSync(config.dbPath);
  db.prepare("UPDATE card_profile SET share_style='cover-xyz' WHERE id=?").run(id);
  db.close();
  const res = await request(app).get('/api/card/cards').set('Authorization', `Bearer ${token}`);
  const card = res.body.cards.find((c) => c.id === id);
  assert.equal(card.shareStyle, 'cover-1', '脏值未归一，C 端会画不出封面');
});
