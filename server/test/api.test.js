import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';

// 1x1 透明 PNG，用于上传测试
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let app;
let tmpDir;
let token;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-test-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  app = createApp();
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('健康检查', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('登录：错误凭据返回 401', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'wrong' });
  assert.equal(res.status, 401);
});

test('登录：正确凭据返回 token', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: config.adminUser, password: config.adminPass });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  token = res.body.token;
});

test('未登录访问管理接口返回 401', async () => {
  const res = await request(app).get('/api/admin/scenes');
  assert.equal(res.status, 401);
});

test('上传：非图片类型被拒绝', async () => {
  const res = await request(app)
    .post('/api/admin/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('not an image'), {
      filename: 'hack.txt',
      contentType: 'text/plain',
    });
  assert.equal(res.status, 400);
});

test('上传：合法图片成功并返回路径', async () => {
  const res = await request(app)
    .post('/api/admin/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', PNG_BYTES, { filename: 'room.png', contentType: 'image/png' });
  assert.equal(res.status, 201);
  assert.match(res.body.path, /^\/uploads\/.+\.png$/);
  const filePath = path.join(config.uploadsDir, path.basename(res.body.path));
  assert.ok(fs.existsSync(filePath));
});

test('创建场景：缺标题返回 400', async () => {
  const res = await request(app)
    .post('/api/admin/scenes')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: '', imagePath: '/uploads/x.png' });
  assert.equal(res.status, 400);
});

let sceneAId;
let sceneBId;
let uploadedPath;

test('创建场景：上架 + 未上架各一条', async () => {
  const up = await request(app)
    .post('/api/admin/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' });
  uploadedPath = up.body.path;

  const a = await request(app)
    .post('/api/admin/scenes')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: '客厅', description: '一楼客厅', imagePath: uploadedPath, sortOrder: 10, published: true });
  assert.equal(a.status, 201);
  sceneAId = a.body.scene.id;

  const b = await request(app)
    .post('/api/admin/scenes')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: '卧室', imagePath: uploadedPath, sortOrder: 5, published: false });
  assert.equal(b.status, 201);
  sceneBId = b.body.scene.id;
});

test('公开列表只返回上架场景，并按排序字段', async () => {
  const res = await request(app).get('/api/scenes');
  assert.equal(res.status, 200);
  assert.equal(res.body.scenes.length, 1);
  assert.equal(res.body.scenes[0].id, sceneAId);
  assert.equal(res.body.scenes[0].title, '客厅');
});

test('管理列表返回全部场景', async () => {
  const res = await request(app)
    .get('/api/admin/scenes')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.scenes.length, 2);
  // 排序：sortOrder 5 在前
  assert.equal(res.body.scenes[0].id, sceneBId);
});

test('更新场景：标题与上架状态', async () => {
  const res = await request(app)
    .put(`/api/admin/scenes/${sceneBId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ title: '主卧', published: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.scene.title, '主卧');
  assert.equal(res.body.scene.published, true);

  const pub = await request(app).get('/api/scenes');
  assert.equal(pub.body.scenes.length, 2);
});

test('更新不存在的场景返回 404', async () => {
  const res = await request(app)
    .put('/api/admin/scenes/99999')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'x' });
  assert.equal(res.status, 404);
});

test('删除场景后公开列表不再包含，且文件被清理', async () => {
  const res = await request(app)
    .delete(`/api/admin/scenes/${sceneAId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const pub = await request(app).get('/api/scenes');
  assert.equal(pub.body.scenes.length, 1);
  assert.equal(pub.body.scenes[0].id, sceneBId);

  // 删除时对应的上传文件应被清理（场景 A 使用的是最后上传的图片）
  const filePath = path.join(config.uploadsDir, path.basename(uploadedPath));
  assert.ok(!fs.existsSync(filePath), '上传文件应随场景删除被清理');
});

test('删除不存在的场景返回 404', async () => {
  const res = await request(app)
    .delete('/api/admin/scenes/99999')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 404);
});
