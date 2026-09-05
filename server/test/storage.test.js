import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

test('存储配置：按厂商保存与读取，密钥不回传明文', async () => {
  const put = await request(app)
    .put('/api/admin/storage')
    .set('Authorization', `Bearer ${token}`)
    .send({
      provider: 'oss',
      accessKey: 'ak-oss',
      secretKey: 'sk-secret-456',
      bucket: 'panorama-bucket',
      region: 'oss-cn-shenzhen',
      folder: 'panorama/',
      cdnDomain: 'https://img.example.com/',
    });
  assert.equal(put.status, 200);
  assert.equal(put.body.config.provider, 'oss');
  assert.equal(put.body.config.providers.oss.accessKey, 'ak-oss');
  assert.equal(put.body.config.providers.oss.hasSecretKey, true);
  assert.equal(put.body.config.providers.oss.cdnDomain, 'https://img.example.com'); // 去尾斜杠
  assert.equal(put.body.config.providers.oss.folder, 'panorama'); // 去首尾斜杠
  assert.equal(put.body.config.providers.oss.secretKey, undefined);
  assert.equal(put.body.config.providers.qiniu.hasSecretKey, false); // 厂商互不影响

  // 数据库中为密文
  const row = db.prepare('SELECT providers FROM storage_config WHERE id = 1').get();
  const stored = JSON.parse(row.providers);
  assert.notEqual(stored.oss.secretKey, 'sk-secret-456');
});

test('存储配置：七牛独立保存区域与文件夹', async () => {
  const put = await request(app)
    .put('/api/admin/storage')
    .set('Authorization', `Bearer ${token}`)
    .send({
      provider: 'qiniu',
      accessKey: 'ak-qiniu',
      secretKey: 'sk-qiniu',
      bucket: 'xcnyou',
      zone: 'z2',
      folder: 'vr360',
      cdnDomain: 'https://caishi.zhizhu.city',
    });
  assert.equal(put.body.config.provider, 'qiniu');
  assert.equal(put.body.config.providers.qiniu.zone, 'z2');
  assert.equal(put.body.config.providers.qiniu.folder, 'vr360');
  // oss 配置保持不受影响
  assert.equal(put.body.config.providers.oss.accessKey, 'ak-oss');
});

test('存储配置：密钥留空时保持原值（分厂商）', async () => {
  await request(app)
    .put('/api/admin/storage')
    .set('Authorization', `Bearer ${token}`)
    .send({ provider: 'qiniu', accessKey: 'ak-qiniu', secretKey: '', bucket: 'b', zone: '', folder: '', cdnDomain: '' });
  const get = await request(app).get('/api/admin/storage').set('Authorization', `Bearer ${token}`);
  assert.equal(get.body.config.providers.qiniu.hasSecretKey, true);
  assert.equal(get.body.config.providers.qiniu.accessKey, 'ak-qiniu');
});

test('存储配置：非法 provider 回退本地', async () => {
  const res = await request(app)
    .put('/api/admin/storage')
    .set('Authorization', `Bearer ${token}`)
    .send({ provider: 'hacker', accessKey: '', secretKey: '', bucket: '', region: '', zone: '', folder: '', cdnDomain: '' });
  assert.equal(res.status, 200);
  assert.equal(res.body.config.provider, 'local');
});

test('上传链路：云端存储时返回 CDN URL，删除时调用云端删除', async () => {
  // 激活 fake 云端（直接写库，fake 不在 API 白名单）
  FakeStorage.puts = [];
  FakeStorage.deletes = [];
  db.prepare(
    "UPDATE storage_config SET provider = 'fake', providers = ? WHERE id = 1"
  ).run(JSON.stringify({ local: {}, oss: {}, qiniu: {}, fake: { accessKey: 'x', secretKey: '', bucket: 'b', folder: '', cdnDomain: 'https://cdn.example.com' } }));

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

  const del = await request(app)
    .delete(`/api/admin/scenes/${created.body.scene.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(del.status, 200);
  assert.deepEqual(FakeStorage.deletes, [up.body.path, up.body.previewPath], '删除场景应清理云端两个对象');
});

test('存储测试连接：已保存配置与表单配置两条路径', async () => {
  // 已保存（fake）配置
  const saved = await request(app)
    .post('/api/admin/storage/test')
    .set('Authorization', `Bearer ${token}`)
    .send({});
  assert.equal(saved.status, 200);
  assert.equal(saved.body.ok, true);

  // 传表单配置（fake）且不落库
  const form = await request(app)
    .post('/api/admin/storage/test')
    .set('Authorization', `Bearer ${token}`)
    .send({ provider: 'fake', accessKey: 'ak-form', secretKey: 'sk-form', bucket: 'b-form', folder: '', cdnDomain: 'https://form.example.com/' });
  assert.equal(form.body.ok, true);
  const row = db.prepare('SELECT provider FROM storage_config WHERE id = 1').get();
  assert.equal(row.provider, 'fake');

  // 无有效 provider 时回退已保存配置
  const bad = await request(app)
    .post('/api/admin/storage/test')
    .set('Authorization', `Bearer ${token}`)
    .send({ provider: 'unknown' });
  assert.equal(bad.body.ok, true);
});

test('存量迁移：旧版单厂商结构升级为多厂商配置', () => {
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-legacy-'));
  const legacyDbPath = path.join(legacyDir, 'legacy.db');
  // 构造旧版库结构
  const legacy = new DatabaseSync(legacyDbPath);
  legacy.exec(`
    CREATE TABLE scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE storage_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider TEXT NOT NULL DEFAULT 'local',
      access_key TEXT NOT NULL DEFAULT '',
      secret_key TEXT NOT NULL DEFAULT '',
      bucket TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      cdn_domain TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO storage_config (id, provider, access_key, secret_key, bucket, region, cdn_domain)
      VALUES (1, 'qiniu', 'ak-old', 'sk-encrypted-old', 'old-bucket', '', 'https://old.example.com');
  `);
  legacy.close();

  const migrated = createDb(legacyDbPath);
  const row = migrated.prepare('SELECT * FROM storage_config WHERE id = 1').get();
  const providers = JSON.parse(row.providers);
  assert.equal(row.provider, 'qiniu');
  assert.equal(providers.qiniu.accessKey, 'ak-old');
  assert.equal(providers.qiniu.secretKey, 'sk-encrypted-old');
  assert.equal(providers.qiniu.bucket, 'old-bucket');
  assert.equal(providers.qiniu.cdnDomain, 'https://old.example.com');
  assert.deepEqual(providers.oss, {
    accessKey: '', secretKey: '', bucket: '', region: '', zone: '', folder: '', cdnDomain: '',
  });
  migrated.close();
  fs.rmSync(legacyDir, { recursive: true, force: true });
});
