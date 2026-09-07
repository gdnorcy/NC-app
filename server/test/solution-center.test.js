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
  assert.equal(card.status, 'off', '内置方案已降为应用（下架），由演示试用方案承接');
  assert.equal(typeof card.isHot, 'boolean');
  assert.ok(Array.isArray(card.defaultPlatform) && card.defaultPlatform.length > 0, '默认平台为多选数组');
  assert.ok(Array.isArray(card.previewImages));
  assert.equal(typeof card.virtualUseCount, 'number');
  assert.equal(typeof card.allPermissions, 'boolean');
  // 预置价格与两级权限（应用级 + 菜单级）
  assert.ok(Array.isArray(card.pricing) && card.pricing.length > 0);
  assert.ok(Array.isArray(card.appPermissions) && card.appPermissions.length > 0);
  const cardApp = card.appPermissions.find((a) => a.code === 'card');
  assert.ok(cardApp, '智能名片应用应存在');
  assert.equal(cardApp.enabled, true, '智能名片方案应勾选自身应用');
  assert.ok(Array.isArray(cardApp.menus) && cardApp.menus.some((m) => m.key === 'card:view' && m.enabled), '菜单级授权应含 card:view');
  // 动态补齐：未勾选的应用也返回、默认不选
  const panoApp = card.appPermissions.find((a) => a.code === 'panorama');
  assert.ok(panoApp, '未勾选应用也应返回（动态补齐）');
  assert.equal(panoApp.enabled, false, '未勾选应用默认不选');

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
    defaultPlatform: ['mini', 'h5'],
    previewImages: ['/uploads/a.webp', '/uploads/b.webp'],
    virtualUseCount: 88,
    description: '新简介',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.solution.status, 'off');
  assert.equal(res.body.solution.isHot, true);
  assert.deepEqual(res.body.solution.defaultPlatform, ['mini', 'h5'], '默认平台支持多选');
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
  assert.equal(res.body.solution.pricing.length, 3);
  const perm = res.body.solution.pricing.find((p) => p.durationMonths === 0);
  assert.equal(perm.agentPrice, 4999);
  const six = res.body.solution.pricing.find((p) => p.durationMonths === 6);
  assert.equal(six.userPrice, 599);

  // 非法数据 → 400
  const bad = await request(app).put(`/api/admin/solutions/${pano.id}/pricing`).set(auth(adminToken)).send({ pricing: 'oops' });
  assert.equal(bad.status, 400);
});

test('P0-6 权限设置（两级）：应用勾选 + 菜单授权 + allPermissions 模式', async () => {
  const card = db.prepare("SELECT id FROM solutions WHERE code = 'card'").get();
  const res = await request(app).put(`/api/admin/solutions/${card.id}/permissions`).set(auth(adminToken)).send({
    apps: [{ code: 'card', enabled: true }, { code: 'panorama', enabled: false }],
    menus: [
      { appCode: 'card', key: 'card:overview', enabled: true },
      { appCode: 'card', key: 'card:edit', enabled: false },
    ],
    allPermissions: true,
  });
  assert.equal(res.status, 200);
  const sol = res.body.solution;
  assert.equal(sol.allPermissions, true);
  const cardApp = sol.appPermissions.find((a) => a.code === 'card');
  assert.equal(cardApp.enabled, true);
  const editMenu = cardApp.menus.find((m) => m.key === 'card:edit');
  assert.equal(editMenu.enabled, false, '未授权菜单应为 false');
  const overviewMenu = cardApp.menus.find((m) => m.key === 'card:overview');
  assert.equal(overviewMenu.enabled, true);

  // 恢复（显式勾回 card 应用；allPermissions 关）
  await request(app).put(`/api/admin/solutions/${card.id}/permissions`).set(auth(adminToken)).send({ apps: [{ code: 'card', enabled: true }], menus: [], allPermissions: false });
  const restored = await request(app).get('/api/admin/solutions').set(auth(adminToken));
  const cardAfter = restored.body.solutions.find((s) => s.code === 'card');
  assert.equal(cardAfter.allPermissions, false);
  assert.equal(cardAfter.appPermissions.find((a) => a.code === 'card').enabled, true, '恢复 card 应用勾选');
});

test('P0-6b 演示试用方案：自动纳入全部应用且菜单全量授权；新增应用动态补齐默认不选', async () => {
  // 演示试用方案存在、状态上架
  const demo = db.prepare("SELECT id FROM solutions WHERE is_demo = 1").get();
  assert.ok(demo, '演示试用方案应预置');
  const res = await request(app).get('/api/admin/solutions').set(auth(adminToken));
  const demoSol = res.body.solutions.find((s) => s.id === demo.id);
  assert.ok(demoSol, '演示方案应在列表中');
  assert.equal(demoSol.status, 'on');
  assert.equal(demoSol.isDemo, true);
  // 包含全部应用且全量授权
  const apps = demoSol.appPermissions;
  assert.ok(apps.length >= 2, '演示方案应包含全部应用');
  assert.ok(apps.every((a) => a.enabled === true), '演示方案所有应用默认勾选');
  assert.ok(apps.every((a) => a.menus.length > 0 && a.menus.every((m) => m.enabled === true)), '演示方案菜单全量授权');

  // 模拟新增应用：INSERT apps 后，普通方案动态补齐且默认不选；演示方案自动勾选
  const r = db.prepare("INSERT INTO apps (code, name, icon, sort_order) VALUES ('future_app', '未来应用', 'devices', 99)").run();
  const newAppId = r.lastInsertRowid;
  const list2 = await request(app).get('/api/admin/solutions').set(auth(adminToken));
  const cardSol = list2.body.solutions.find((s) => s.code === 'card');
  const futureInCard = cardSol.appPermissions.find((a) => a.code === 'future_app');
  assert.ok(futureInCard, '新应用应自动出现在普通方案');
  assert.equal(futureInCard.enabled, false, '普通方案新应用默认不选');
  const demo2 = list2.body.solutions.find((s) => s.id === demo.id);
  assert.equal(demo2.appPermissions.find((a) => a.code === 'future_app').enabled, true, '演示方案新应用默认勾选');
  // 清理测试应用
  db.prepare('DELETE FROM apps WHERE id = ?').run(newAppId);
});

test('P0-6c 组合包租户授权：开通演示方案可访问其包含的应用', async () => {
  const project = db.prepare("SELECT id, solutions FROM projects WHERE id = 1").get();
  if (!project) return; // 无项目则跳过
  const orig = project.solutions;
  // 开通 demo 方案
  db.prepare("UPDATE projects SET solutions = '[\"demo\"]' WHERE id = 1").run();
  const { hasSolution } = await import('../src/tenant.js');
  assert.equal(hasSolution(db, 1, 'card'), true, 'demo 方案应授权 card 应用');
  assert.equal(hasSolution(db, 1, 'panorama'), true, 'demo 方案应授权 panorama 应用');
  assert.equal(hasSolution(db, 1, 'future_app'), false, '未勾选应用不授权');
  // 还原
  db.prepare('UPDATE projects SET solutions = ? WHERE id = 1').run(orig);
});

test('P0-7 新建解决方案：基础字段 + 唯一标识冲突校验', async () => {
  const res = await request(app).post('/api/admin/solutions').set(auth(adminToken)).send({
    name: '测试方案', code: 'test_app', description: '描述', icon: 'chart',
    categoryId: 2, status: 'off', isHot: true, defaultPlatform: ['h5', 'mini'], virtualUseCount: 3,
    previewImages: ['/uploads/x.webp'],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.solution.defaultPlatform, ['h5', 'mini'], '新建方案默认平台多选');
  assert.equal(res.body.solution.name, '测试方案');
  assert.equal(res.body.solution.categoryId, 2);
  assert.equal(res.body.solution.status, 'off');

  // 重复 code → 400
  const dup = await request(app).post('/api/admin/solutions').set(auth(adminToken)).send({ name: '重复', code: 'test_app' });
  assert.equal(dup.status, 400);
  assert.match(dup.body.error, /已存在/);
});

test('P1-1 方案资产：读取集市风格 + 平台模板（含价格/默认标记）', async () => {
  const card = db.prepare("SELECT id FROM solutions WHERE code = 'card'").get();
  const res = await request(app).get(`/api/admin/solutions/${card.id}/assets`).set(auth(adminToken));
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.assets.styles), 'styles 应为数组');
  assert.ok(Array.isArray(res.body.assets.templates), 'templates 应为数组');
  const styleA = res.body.assets.styles.find((s) => s.key === 'A');
  assert.ok(styleA, '应预置风格 A');
  assert.equal(styleA.isDefault, true, 'A 应为默认风格');
  assert.equal(styleA.price, 0, 'A 应免费');
  assert.ok(res.body.assets.styles.some((s) => s.key === 'B'), '应预置风格 B');
});

test('P1-2 保存方案资产：调整风格价格/启用与模板价格', async () => {
  const card = db.prepare("SELECT id FROM solutions WHERE code = 'card'").get();
  const before = await request(app).get(`/api/admin/solutions/${card.id}/assets`).set(auth(adminToken));
  const tpl = before.body.assets.templates[0];
  const res = await request(app).put(`/api/admin/solutions/${card.id}/assets`).set(auth(adminToken)).send({
    styles: [
      { key: 'A', price: 0, enabled: true, isDefault: true },
      { key: 'B', price: 168, enabled: true },
      { key: 'C', price: 288, enabled: false },
    ],
    templates: tpl ? [{ id: tpl.id, price: 66, enabled: true }] : [],
  });
  assert.equal(res.status, 200);
  const after = await request(app).get(`/api/admin/solutions/${card.id}/assets`).set(auth(adminToken));
  const styleB = after.body.assets.styles.find((s) => s.key === 'B');
  assert.equal(styleB.price, 168, 'B 价格应更新为 168');
  const styleC = after.body.assets.styles.find((s) => s.key === 'C');
  assert.equal(styleC.enabled, false, 'C 应被下架');
  if (tpl) {
    const tplAfter = after.body.assets.templates.find((t) => t.id === tpl.id);
    assert.equal(tplAfter.price, 66, '模板价格应更新为 66');
  }
  // 恢复默认
  await request(app).put(`/api/admin/solutions/${card.id}/assets`).set(auth(adminToken)).send({
    styles: [
      { key: 'A', price: 0, enabled: true, isDefault: true },
      { key: 'B', price: 199, enabled: true },
      { key: 'C', price: 299, enabled: true },
    ],
    templates: tpl ? [{ id: tpl.id, price: 0, enabled: true }] : [],
  });
});
