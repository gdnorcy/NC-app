import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { registerStorageProvider } from '../src/storage/index.js';
import { encryptSecret, decryptSecret } from '../src/crypto.js';

// 1x1 透明 PNG
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/** 假云存储：记录上传/删除调用，返回 CDN 域名 URL */
class FakeStorage {
  static puts = [];
  static deletes = [];
  constructor(cfg) {
    this.cfg = cfg;
  }
  async put(buffer, key) {
    FakeStorage.puts.push(key);
    return `https://cdn.example.com/${key}`;
  }
  async delete(url) {
    FakeStorage.deletes.push(url);
  }
  async testConnection() {
    return { ok: true, message: 'fake ok' };
  }
}

let app;
let db;
let tmpDir;
let token;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-storage-test-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });

  db = createDb(config.dbPath);
  app = createApp({ db });
  registerStorageProvider('fake', FakeStorage);

  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: config.adminUser, password: config.adminPass });
  token = res.body.token;
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('密钥加密：往返一致，明文不落库', () => {
  const encoded = encryptSecret('my-secret-key-123');
  assert.notEqual(encoded, 'my-secret-key-123');
  assert.match(encoded, /^[A-Za-z0-9+/=]+$/);
  assert.equal(decryptSecret(encoded), 'my-secret-key-123');
  assert.equal(decryptSecret(''), '');
});

test('密钥加密：损坏数据抛错', () => {
  assert.throws(() => decryptSecret('aGVsbG8='));
});

test('存储配置：未登录返回 401', async () => {
  const res = await request(app).get('/api/admin/storage');
  assert.equal(res.status, 401);
});

test('存储配置：保存后读取不回传密钥明文', async () => {
  const put = await request(app)
    .put('/api/admin/storage')
    .set('Authorization', `Bearer ${token}`)
    .send({
      provider: 'oss',
      accessKey: 'ak-123',
      secretKey: 'sk-secret-456',
      bucket: 'panorama-bucket',
      region: 'oss-cn-shenzhen',
      cdnDomain: 'https://img.example.com/',
    });
  assert.equal(put.status, 200);
  assert.equal(put.body.config.provider, 'oss');
  assert.equal(put.body.config.hasSecretKey, true);
  assert.equal(put.body.config.cdnDomain, 'https://img.example.com'); // 去尾斜杠

  const get = await request(app).get('/api/admin/storage').set('Authorization', `Bearer ${token}`);
  assert.equal(get.body.config.accessKey, 'ak-123');
  assert.equal(get.body.config.secretKey, undefined);
  assert.equal(get.body.config.hasSecretKey, true);

  // 数据库中为密文
  const row = db.prepare('SELECT secret_key FROM storage_config WHERE id = 1').get();
  assert.notEqual(row.secret_key, 'sk-secret-456');
});

test('存储配置：密钥留空时保持原值', async () => {
  await request(app)
    .put('/api/admin/storage')
    .set('Authorization', `Bearer ${token}`)
    .send({ provider: 'oss', accessKey: 'ak-123', secretKey: '', bucket: 'b', region: '', cdnDomain: '' });
  const get = await request(app).get('/api/admin/storage').set('Authorization', `Bearer ${token}`);
  assert.equal(get.body.config.hasSecretKey, true);
});

test('存储配置：非法 provider 回退本地', async () => {
  const res = await request(app)
    .put('/api/admin/storage')
    .set('Authorization', `Bearer ${token}`)
    .send({ provider: 'hacker', accessKey: '', secretKey: '', bucket: '', region: '', cdnDomain: '' });
  assert.equal(res.status, 200);
  assert.equal(res.body.config.provider, 'local');
});

test('上传链路：云端存储时返回 CDN URL，删除时调用云端删除', async () => {
  // 切换到 fake 云端
  db.prepare("UPDATE storage_config SET provider = 'fake' WHERE id = 1").run();

  const up = await request(app)
    .post('/api/admin/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', PNG_BYTES, { filename: 'room.png', contentType: 'image/png' });
  assert.equal(up.status, 201);
  assert.match(up.body.path, /^https:\/\/cdn\.example\.com\/.+-main\.webp$/);
  assert.match(up.body.previewPath, /^https:\/\/cdn\.example\.com\/.+-preview\.webp$/);

  assert.equal(FakeStorage.puts.length, 2, '应上传主图与低清两档');

  const created = await request(app)
    .post('/api/admin/scenes')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: '云端场景', imagePath: up.body.path, previewPath: up.body.previewPath, published: true });
  assert.equal(created.status, 201);
  assert.equal(created.body.scene.imagePath, up.body.path);

  const del = await request(app)
    .delete(`/api/admin/scenes/${created.body.scene.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(del.status, 200);
  assert.deepEqual(FakeStorage.deletes, [up.body.path, up.body.previewPath], '删除场景应清理云端两个对象');
});

test('存储测试连接：当前 fake provider 返回 ok', async () => {
  const res = await request(app)
    .post('/api/admin/storage/test')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('存储测试连接：传表单配置时用表单值测试且不落库', async () => {
  const res = await request(app)
    .post('/api/admin/storage/test')
    .set('Authorization', `Bearer ${token}`)
    .send({ provider: 'fake', accessKey: 'ak-form', secretKey: 'sk-form', bucket: 'b-form', region: '', cdnDomain: 'https://form.example.com/' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  // 配置未被修改
  const row = db.prepare("SELECT provider FROM storage_config WHERE id = 1").get();
  assert.equal(row.provider, 'fake');
  // 无有效 provider 时回退已保存配置
  const bad = await request(app)
    .post('/api/admin/storage/test')
    .set('Authorization', `Bearer ${token}`)
    .send({ provider: 'unknown' });
  assert.equal(bad.status, 200);
  assert.equal(bad.body.ok, true);
});
