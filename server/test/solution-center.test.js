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
 * 方案中心 P0：方案分类 / 基础设置扩展 / 价格设置 / 权限设置
 * - 分类 CRUD 与占用保护
 * - solutions 列表返回新字段（分类/状态/热门/平台/预览图/虚拟数/价格/权限）
 * - 基础设置编辑、价格整体替换（含永久行）、权限整体替换（含 allPermissions 模式）
 */
let app;
let tmpDir;
let db;
let adminToken;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-solution-center-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });

  const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
  adminToken = issueToken(admin);
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });

test('P0-1 分类 CRUD：新建/列表/占用保护/删除', async () => {
  // 新建
  const created = await request(app).post('/api/admin/solutions/categories').set(auth(adminToken)).send({ name: '电商工具', icon: 'badge', sortOrder: 5 });
  assert.equal(created.status, 200);
  assert.equal(created.body.category.name, '电商工具');
  const catId = created.body.category.id;

  // 列表含方案数
  const list = await request(app).get('/api/admin/solutions/categories').set(auth(adminToken));
  assert.equal(list.status, 200);
  assert.ok(list.body.categories.some((c) => c.id === catId));

  // 编辑
  const updated = await request(app).put(`/api/admin/solutions/categories/${catId}`).set(auth(adminToken)).send({ name: '电商工具2', sortOrder: 6 });
  assert.equal(updated.body.category.name, '电商工具2');

  // 删除（未占用 → 成功）
  const del = await request(app).delete(`/api/admin/solutions/categories/${catId}`).set(auth(adminToken));
  assert.equal(del.status, 200);
});

test('P0-2 分类占用保护：方案归属分类时禁止删除', async () => {
  // 智能名片预置归属分类 1（名片营销）
  const del = await request(app).delete('/api/admin/solutions/categories/1').set(auth(adminToken));
  assert.equal(del.status, 400);
  assert.match(del.body.error, /仍有/);
});

test('P0-3 方案列表返回扩展字段与聚合价格/权限', async () => {
  const res = await request(app).get('/api/admin/solutions').set(auth(adminToken));
  assert.equal(res.status, 200);
  const card = res.body.solutions.find((s) => s.code === 'card');
  assert.ok(card);
  assert.equal(card.categoryId, 1);
  assert.equal(card.status, 'on');
  assert.equal(typeof card.isHot, 'boolean');
  assert.ok(typeof card.defaultPlatform === 'string');
  assert.ok(Array.isArray(card.previewImages));
  assert.equal(typeof card.virtualUseCount, 'number');
  assert.equal(typeof card.allPermissions, 'boolean');
  // 预置价格与权限
  assert.ok(Array.isArray(card.pricing) && card.pricing.length > 0);
  assert.ok(Array.isArray(card.permissions) && card.permissions.length > 0);
  assert.ok(card.permissions.some((p) => p.key === 'card:view'));

  // 分类/状态筛选
  const filtered = await request(app).get('/api/admin/solutions?categoryId=1').set(auth(adminToken));
  assert.ok(filtered.body.solutions.every((s) => s.categoryId === 1));
  const off = await request(app).get('/api/admin/solutions?status=off').set(auth(adminToken));
  assert.ok(off.body.solutions.every((s) => s.status === 'off'));
});

test('P0-4 基础设置编辑：上架状态/热门/平台/预览图/虚拟数', async () => {
  const card = db.prepare("SELECT id FROM solutions WHERE code = 'card'").get();
  const res = await request(app).put(`/api/admin/solutions/${card.id}`).set(auth(adminToken)).send({
    status: 'off',
    isHot: true,
    defaultPlatform: 'mini',
    previewImages: ['/uploads/a.webp', '/uploads/b.webp'],
    virtualUseCount: 88,
    description: '新简介',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.solution.status, 'off');
  assert.equal(res.body.solution.isHot, true);
  assert.equal(res.body.solution.defaultPlatform, 'mini');
  assert.deepEqual(res.body.solution.previewImages, ['/uploads/a.webp', '/uploads/b.webp']);
  assert.equal(res.body.solution.virtualUseCount, 88);
  assert.equal(res.body.solution.description, '新简介');

  // 恢复 on
  await request(app).put(`/api/admin/solutions/${card.id}`).set(auth(adminToken)).send({ status: 'on', isHot: false });
});

test('P0-5 价格设置：整体替换含永久行（durationMonths=0）', async () => {
  const pano = db.prepare("SELECT id FROM solutions WHERE code = 'panorama'").get();
  const res = await request(app).put(`/api/admin/solutions/${pano.id}/pricing`).set(auth(adminToken)).send({
    pricing: [
      { durationMonths: 6, agentPrice: 299, userPrice: 599, renewPrice: 599 },
      { durationMonths: 12, agentPrice: 499, userPrice: 999, renewPrice: 999 },
      { durationMonths: 0, agentPrice: 4999, userPrice: 9999, renewPrice: 9999 },
    ],
  });
  assert.equal(res.status, 200);
  console.log('P0-5 PRICING:', JSON.stringify(res.body.solution.pricing)); assert.equal(res.body.solution.pricing.length, 3);
  const perm = res.body.solution.pricing.find((p) => p.durationMonths === 0);
  assert.equal(perm.agentPrice, 4999);
  const six = res.body.solution.pricing.find((p) => p.durationMonths === 6);
  assert.equal(six.userPrice, 599);

  // 非法数据 → 400
  const bad = await request(app).put(`/api/admin/solutions/${pano.id}/pricing`).set(auth(adminToken)).send({ pricing: 'oops' });
  assert.equal(bad.status, 400);
});

test('P0-6 权限设置：整体替换 + allPermissions 模式', async () => {
  const card = db.prepare("SELECT id FROM solutions WHERE code = 'card'").get();
  const res = await request(app).put(`/api/admin/solutions/${card.id}/permissions`).set(auth(adminToken)).send({
    permissions: [
      { module: '总览', moduleLabel: '总览', key: 'card:overview', label: '数据洞察', enabled: true },
      { module: '名片管理', moduleLabel: '名片管理', key: 'card:edit', label: '名片编辑', enabled: false },
    ],
    allPermissions: true,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.solution.permissions.length, 2);
  assert.equal(res.body.solution.allPermissions, true);
  assert.equal(res.body.solution.permissions.find((p) => p.key === 'card:edit').enabled, false);

  // 恢复 seed 默认（清空后由 seed 补齐：权限表清空 + allPermissions 关）
  await request(app).put(`/api/admin/solutions/${card.id}/permissions`).set(auth(adminToken)).send({ permissions: [], allPermissions: false });
  const restored = await request(app).get('/api/admin/solutions').set(auth(adminToken));
  const cardAfter = restored.body.solutions.find((s) => s.code === 'card'); console.log('P0-6 cardAfter.allPermissions:', cardAfter.allPermissions, typeof cardAfter.allPermissions);
  assert.equal(cardAfter.allPermissions, false);
});

test('P0-7 新建解决方案：基础字段 + 唯一标识冲突校验', async () => {
  const res = await request(app).post('/api/admin/solutions').set(auth(adminToken)).send({
    name: '测试方案', code: 'test_app', description: '描述', icon: 'chart',
    categoryId: 2, status: 'off', isHot: true, defaultPlatform: 'h5', virtualUseCount: 3,
    previewImages: ['/uploads/x.webp'],
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.solution.name, '测试方案');
  assert.equal(res.body.solution.categoryId, 2);
  assert.equal(res.body.solution.status, 'off');

  // 重复 code → 400
  const dup = await request(app).post('/api/admin/solutions').set(auth(adminToken)).send({ name: '重复', code: 'test_app' });
  assert.equal(dup.status, 400);
  assert.match(dup.body.error, /已存在/);
});
