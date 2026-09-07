import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, genShareToken } from '../src/db.js';
import { createApp } from '../src/app.js';

function setupEnv() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-tier-'));
  const uploadsDir = path.join(tmp, 'uploads');
  const dbPath = path.join(tmp, 'test.db');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const prev = { ...config };
  Object.assign(config, {
    dataDir: tmp,
    uploadsDir,
    dbPath,
    webDistDir: path.join(tmp, 'web-dist'),
    storageProvider: 'local',
    storageProviders: JSON.stringify({ local: {} }),
    adminUser: 'admin',
    adminPass: 'admin123',
  });
  return { tmp, uploadsDir, dbPath, prev };
}

function restoreEnv(prev) {
  Object.assign(config, prev);
}

function defaultCustomerId(db) {
  return db.prepare('SELECT id FROM projects ORDER BY id ASC LIMIT 1').get()?.id || null;
}

function seedCustomer(db, over = {}) {
  return db
    .prepare(
      `INSERT INTO projects (customer_name, description, valid_from, valid_until, is_pinned, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      over.customerName || '测试客户',
      over.description || '',
      over.validFrom || null,
      over.validUntil || null,
      over.isPinned ?? 0,
      over.status || 'active'
    ).lastInsertRowid;
}

function seedPlan(db, customerId, over = {}) {
  return db
    .prepare(
      `INSERT INTO plans (project_id, name, description, sort_order, published, share_token, share_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      customerId,
      over.name || '测试方案',
      over.description || '',
      over.sortOrder ?? 0,
      over.published ?? 1,
      over.shareToken || genShareToken(),
      over.shareEnabled ?? 1
    ).lastInsertRowid;
}

function seedScene(db, planId, over = {}) {
  return db
    .prepare(
      `INSERT INTO scenes (title, image_path, plan_id, share_token, share_enabled, sort_order, published)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      over.title || '场景A',
      over.imagePath || '/uploads/a.jpg',
      planId,
      over.shareToken || '',
      over.shareEnabled ?? 0,
      over.sortOrder ?? 0,
      over.published ?? 1
    ).lastInsertRowid;
}

// ———————— 方案（公开） ————————

test('公开方案列表只返回已上架且开启分享的方案', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const cid = defaultCustomerId(db);
    const p1 = seedPlan(db, cid, { name: '公开方案' });
    seedPlan(db, cid, { name: '隐藏方案', published: 0 });
    seedPlan(db, cid, { name: '关闭分享', shareEnabled: 0 });
    seedScene(db, p1);
    seedScene(db, p1);
    const res = await request(app).get('/api/plans').expect(200);
    const names = res.body.plans.map((p) => p.name);
    assert.ok(names.includes('公开方案'));
    assert.ok(!names.includes('隐藏方案'));
    assert.ok(!names.includes('关闭分享'));
    const pub = res.body.plans.find((p) => p.name === '公开方案');
    assert.equal(pub.sceneCount, 2);
    assert.ok(pub.shareToken);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

test('方案详情返回方案与上架场景', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const cid = defaultCustomerId(db);
    const pid = seedPlan(db, cid, { name: '方案X' });
    seedScene(db, pid, { title: '场景1' });
    seedScene(db, pid, { title: '场景2', published: 0 });
    const res = await request(app).get(`/api/plans/${pid}`).expect(200);
    assert.equal(res.body.plan.name, '方案X');
    assert.equal(res.body.scenes.length, 1);
    assert.equal(res.body.scenes[0].title, '场景1');
    assert.equal(res.body.scenes[0].planId, pid);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

// ———————— 分享 ————————

test('分享令牌解析：方案级', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const cid = defaultCustomerId(db);
    const token = genShareToken();
    const pid = seedPlan(db, cid, { name: '分享方案', shareToken: token });
    seedScene(db, pid, { title: 'S1' });
    seedScene(db, pid, { title: 'S2' });
    const res = await request(app).get(`/api/s/${token}`).expect(200);
    assert.equal(res.body.type, 'project');
    assert.equal(res.body.plan.name, '分享方案');
    assert.equal(res.body.project.name, '分享方案');
    assert.equal(res.body.scenes.length, 2);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

test('分享令牌解析：场景级（单场景分享）', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const cid = defaultCustomerId(db);
    const pid = seedPlan(db, cid, { name: '方案Y' });
    const st = genShareToken();
    seedScene(db, pid, { title: '要分享的场景', shareToken: st, shareEnabled: 1 });
    const res = await request(app).get(`/api/s/${st}`).expect(200);
    assert.equal(res.body.type, 'scene');
    assert.equal(res.body.scene.title, '要分享的场景');
    assert.equal(res.body.plan.name, '方案Y');
    assert.equal(res.body.project.name, '方案Y');
    assert.equal(res.body.scenes.length, 1);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

test('关闭分享后链接 404', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    await request(app).get('/api/s/unknown-token').expect(404);
    await request(app).get('/api/s/definitely-not-exist').expect(404);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

test('二维码生成返回 PNG', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const cid = defaultCustomerId(db);
    const token = genShareToken();
    seedPlan(db, cid, { name: '二维码方案', shareToken: token });
    const res = await request(app).get(`/api/s/${token}/qr?size=200`).expect(200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.ok(res.body.length > 500);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

// ———————— 方案管理 CRUD ————————

test('方案管理 CRUD：创建/编辑/刷新令牌/删除', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' }).expect(200);
    const token = login.body.token;
    const auth = { Authorization: `Bearer ${token}` };
    const cid = defaultCustomerId(db);

    const created = await request(app).post('/api/admin/plans').set(auth).send({ name: '新方案', description: '描述', projectId: cid, published: true, shareEnabled: true }).expect(201);
    const pid = created.body.plan.id;
    assert.ok(created.body.plan.shareToken);
    assert.equal(created.body.plan.projectId, cid);

    const edited = await request(app).put(`/api/admin/plans/${pid}`).set(auth).send({ name: '改名方案', regenerateShareToken: true }).expect(200);
    assert.equal(edited.body.plan.name, '改名方案');
    assert.notEqual(edited.body.plan.shareToken, created.body.plan.shareToken);

    // 删除：方案内场景归默认方案
    const sceneId = seedScene(db, pid);
    await request(app).delete(`/api/admin/plans/${pid}`).set(auth).expect(200);
    const fallback = db.prepare('SELECT id FROM plans ORDER BY sort_order ASC, id ASC LIMIT 1').get().id;
    const moved = db.prepare('SELECT plan_id FROM scenes WHERE id = ?').get(sceneId);
    assert.equal(moved.plan_id, fallback);

    // 名称必填
    await request(app).post('/api/admin/plans').set(auth).send({ name: '  ' }).expect(400);
    // 未登录 401
    await request(app).get('/api/admin/plans').expect(401);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

test('场景归属与单场景分享开关', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' }).expect(200);
    const auth = { Authorization: `Bearer ${login.body.token}` };
    const cid = defaultCustomerId(db);
    const pid = seedPlan(db, cid, { name: 'P' });

    const created = await request(app)
      .post('/api/admin/scenes')
      .set(auth)
      .send({ title: '归属场景', imagePath: '/uploads/x.jpg', planId: pid, shareEnabled: true })
      .expect(201);
    assert.equal(created.body.scene.planId, pid);
    assert.equal(created.body.scene.shareEnabled, true);
    assert.ok(created.body.scene.shareToken);

    const c1 = await request(app)
      .put(`/api/admin/scenes/${created.body.scene.id}`)
      .set(auth)
      .send({ shareEnabled: false })
      .expect(200);
    assert.equal(c1.body.scene.shareEnabled, false);
    assert.equal(c1.body.scene.shareToken, created.body.scene.shareToken);

    const c2 = await request(app)
      .put(`/api/admin/scenes/${created.body.scene.id}`)
      .set(auth)
      .send({ shareEnabled: true, regenerateShareToken: true })
      .expect(200);
    assert.notEqual(c2.body.scene.shareToken, created.body.scene.shareToken);
    const s = await request(app).get(`/api/s/${c2.body.scene.shareToken}`).expect(200);
    assert.equal(s.body.type, 'scene');
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

// ———————— 客户项目 CRUD ————————

test('客户项目 CRUD：创建/详情/编辑/删除（方案归默认客户）', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' }).expect(200);
    const auth = { Authorization: `Bearer ${login.body.token}` };

    // 列表含默认客户
    const list = await request(app).get('/api/admin/projects').set(auth).expect(200);
    assert.ok(list.body.projects.length >= 1);
    assert.equal(list.body.projects[0].customerName, '默认客户');

    // 创建
    const created = await request(app)
      .post('/api/admin/projects')
      .set(auth)
      .send({ customerName: '坡特商贸', validFrom: '2026-01-01', validUntil: '2027-01-01', isPinned: true, remark: 'VIP' })
      .expect(201);
    const cid = created.body.project.id;
    assert.equal(created.body.project.customerName, '坡特商贸');
    assert.equal(created.body.project.isPinned, true);

    // 详情含方案数
    const pid = seedPlan(db, cid, { name: '客户方案' });
    seedScene(db, pid);
    const detail = await request(app).get(`/api/admin/projects/${cid}`).set(auth).expect(200);
    assert.equal(detail.body.project.planCount, 1);
    assert.equal(detail.body.project.sceneCount, 1);
    assert.equal(detail.body.plans.length, 1);

    // 编辑
    const edited = await request(app).put(`/api/admin/projects/${cid}`).set(auth).send({ customerName: '坡特商贸(改)', status: 'disabled' }).expect(200);
    assert.equal(edited.body.project.customerName, '坡特商贸(改)');
    assert.equal(edited.body.project.status, 'disabled');

    // 删除：方案归默认客户
    await request(app).delete(`/api/admin/projects/${cid}`).set(auth).expect(200);
    const fallback = db.prepare('SELECT id FROM projects ORDER BY id ASC LIMIT 1').get().id;
    const moved = db.prepare('SELECT project_id FROM plans WHERE id = ?').get(pid);
    assert.equal(moved.project_id, fallback);

    // 不能删最后一个客户
    const only = db.prepare('SELECT id FROM projects ORDER BY id ASC LIMIT 1').get().id;
    await request(app).delete(`/api/admin/projects/${only}`).set(auth).expect(400);

    // 名称必填
    await request(app).post('/api/admin/projects').set(auth).send({ customerName: '  ' }).expect(400);
    // 未登录 401
    await request(app).get('/api/admin/projects').expect(401);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

// ———————— 存量库迁移 ————————

test('存量库迁移：老库自动建默认客户+默认方案并收纳旧场景', async () => {
  const { tmp, prev } = setupEnv();
  const dbPath = path.join(tmp, 'old.db');
  const old = new (await import('node:sqlite')).DatabaseSync(dbPath);
  old.exec(`
    CREATE TABLE scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL,
      preview_path TEXT NOT NULL DEFAULT '',
      pyramid TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO scenes (title, image_path) VALUES ('老场景1', '/uploads/a.jpg');
    INSERT INTO scenes (title, image_path) VALUES ('老场景2', '/uploads/b.jpg');
  `);
  old.close();

  Object.assign(config, { dbPath });
  const db = createDb();
  try {
    const customers = db.prepare('SELECT * FROM projects').all();
    assert.equal(customers.length, 1);
    assert.equal(customers[0].customer_name, '默认客户');

    const plans = db.prepare('SELECT * FROM plans').all();
    assert.equal(plans.length, 1);
    assert.equal(plans[0].name, '默认方案');
    assert.equal(plans[0].project_id, customers[0].id);
    assert.equal(plans[0].share_enabled, 1);
    assert.ok(plans[0].share_token);

    const scenes = db.prepare('SELECT plan_id, share_token, share_enabled FROM scenes').all();
    assert.equal(scenes.length, 2);
    for (const s of scenes) {
      assert.equal(s.plan_id, plans[0].id);
      assert.equal(s.share_enabled, 0);
    }
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

test('存量库迁移：旧 projects(方案) 表自动 rename 为 plans 并归默认客户', async () => {
  const { tmp, prev } = setupEnv();
  const dbPath = path.join(tmp, 'old2.db');
  const old = new (await import('node:sqlite')).DatabaseSync(dbPath);
  old.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_path TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 1,
      share_token TEXT NOT NULL DEFAULT '',
      share_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO projects (name, share_token) VALUES ('旧项目A', 'tokA');
    CREATE TABLE scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL,
      preview_path TEXT NOT NULL DEFAULT '',
      pyramid TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      project_id INTEGER
    );
    INSERT INTO scenes (title, image_path, project_id) VALUES ('S1', '/uploads/a.jpg', 1);
  `);
  old.close();

  Object.assign(config, { dbPath });
  const db = createDb();
  try {
    // 旧 projects 已 rename 为 plans
    const plans = db.prepare('SELECT * FROM plans').all();
    assert.equal(plans.length, 1);
    assert.equal(plans[0].name, '旧项目A');
    assert.equal(plans[0].share_token, 'tokA');
    // 新建了客户项目表
    const customers = db.prepare('SELECT * FROM projects').all();
    assert.equal(customers.length, 1);
    assert.equal(customers[0].customer_name, '默认客户');
    // 方案归属客户
    assert.equal(plans[0].project_id, customers[0].id);
    // scenes.project_id 已 rename 为 plan_id
    const scenes = db.prepare('SELECT plan_id FROM scenes').all();
    assert.equal(scenes.length, 1);
    assert.equal(scenes[0].plan_id, plans[0].id);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

// —— 客户有效期：过期自动禁用分享 ——
test('客户有效期：未过期客户方案在公开列表可见', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const custId = seedCustomer(db, { customerName: '有效客户', validUntil: '2099-12-31' });
    const planId = seedPlan(db, custId, { name: '方案A', shareToken: 'tok-valid' });
    const res = await request(app).get('/api/plans');
    assert.equal(res.status, 200);
    assert.ok(res.body.plans.some((p) => p.id === planId));
  } finally {
    db.close(); fs.rmSync(tmp, { recursive: true, force: true }); restoreEnv(prev);
  }
});

test('客户有效期：已过期客户方案不在公开列表', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const custId = seedCustomer(db, { customerName: '过期客户', validUntil: '2020-01-01' });
    const planId = seedPlan(db, custId, { name: '过期方案', shareToken: 'tok-expired' });
    const res = await request(app).get('/api/plans');
    assert.equal(res.status, 200);
    assert.ok(!res.body.plans.some((p) => p.id === planId));
  } finally {
    db.close(); fs.rmSync(tmp, { recursive: true, force: true }); restoreEnv(prev);
  }
});

test('客户有效期：已过期客户方案分享链接返回403', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const custId = seedCustomer(db, { customerName: '过期客户', validUntil: '2020-01-01' });
    seedPlan(db, custId, { name: '过期方案', shareToken: 'tok-expired2' });
    const res = await request(app).get('/api/s/tok-expired2');
    assert.equal(res.status, 403);
    assert.ok(res.body.error.includes('过期'));
  } finally {
    db.close(); fs.rmSync(tmp, { recursive: true, force: true }); restoreEnv(prev);
  }
});

test('客户有效期：已过期客户场景分享链接返回403', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const custId = seedCustomer(db, { customerName: '过期客户', validUntil: '2020-01-01' });
    const planId = seedPlan(db, custId, { name: '过期方案' });
    seedScene(db, planId, { title: '过期场景', shareToken: 'scene-expired', shareEnabled: 1 });
    const res = await request(app).get('/api/s/scene-expired');
    assert.equal(res.status, 403);
  } finally {
    db.close(); fs.rmSync(tmp, { recursive: true, force: true }); restoreEnv(prev);
  }
});

test('客户有效期：无有效期客户始终可访问', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const custId = seedCustomer(db, { customerName: '永久客户', validUntil: null });
    seedPlan(db, custId, { name: '永久方案', shareToken: 'tok-forever' });
    const res = await request(app).get('/api/s/tok-forever');
    assert.equal(res.status, 200);
    assert.equal(res.body.type, 'project');
  } finally {
    db.close(); fs.rmSync(tmp, { recursive: true, force: true }); restoreEnv(prev);
  }
});

test('客户有效期：停用客户分享返回403', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const custId = seedCustomer(db, { customerName: '停用客户', validUntil: '2099-12-31', status: 'disabled' });
    seedPlan(db, custId, { name: '停用方案', shareToken: 'tok-disabled' });
    const res = await request(app).get('/api/s/tok-disabled');
    assert.equal(res.status, 403);
  } finally {
    db.close(); fs.rmSync(tmp, { recursive: true, force: true }); restoreEnv(prev);
  }
});

test('客户有效期：续费后分享恢复', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const custId = seedCustomer(db, { customerName: '续费客户', validUntil: '2020-01-01' });
    seedPlan(db, custId, { name: '方案', shareToken: 'tok-renew' });
    // 过期时403
    const r1 = await request(app).get('/api/s/tok-renew');
    assert.equal(r1.status, 403);
    // 续费到未来
    db.prepare("UPDATE projects SET valid_until = '2099-12-31' WHERE id = ?").run(custId);
    // 恢复200
    const r2 = await request(app).get('/api/s/tok-renew');
    assert.equal(r2.status, 200);
  } finally {
    db.close(); fs.rmSync(tmp, { recursive: true, force: true }); restoreEnv(prev);
  }
});

test('客户项目编辑：管理员指定 + 方案权限保存 + 详情返回', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const custId = seedCustomer(db, { customerName: '权限客户' });
    // 准备一个租户管理员账号
    const salt = 's';
    db.prepare("INSERT INTO users (username, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, 'tenant_admin', 'active', ?)")
      .run('tmgr1', 'h', salt, custId);
    const user = db.prepare("SELECT id FROM users WHERE username = 'tmgr1'").get();
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' }).expect(200);
    const auth = { Authorization: `Bearer ${login.body.token}` };
    // 保存：方案 + 管理员 + 项目级权限（仅开 panorama 数据洞察）
    const res = await request(app).put(`/api/admin/projects/${custId}`).set(auth).send({
      customerName: '权限客户',
      solutions: ['demo'],
      adminUserId: user.id,
      config: { miniExpireMode: 'prompt', adminExpireMode: 'deny', selfRenew: true, giftStorageMb: 128, maxCards: 500, aiCredits: 10 },
      apps: [{ code: 'panorama', enabled: true }],
      menus: [
        { appCode: 'panorama', key: 'pano:overview', enabled: true },
        { appCode: 'panorama', key: 'plan:view', enabled: false },
      ],
    });
    assert.equal(res.status, 200);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(custId);
    assert.equal(row.admin_user_id, user.id);
    const cfg = JSON.parse(row.config);
    assert.equal(cfg.giftStorageMb, 128);
    assert.equal(cfg.maxCards, 500);
    // 详情返回管理员与权限
    const detail = await request(app).get(`/api/admin/projects/${custId}`).set(auth);
    assert.equal(detail.status, 200);
    assert.ok(detail.body.adminUsers.some((u) => u.username === 'tmgr1'));
    const apps = detail.body.appPermissions;
    assert.ok(Array.isArray(apps) && apps.length > 0);
    const pano = apps.find((a) => a.code === 'panorama');
    assert.ok(pano && pano.enabled === true);
    // 菜单级：pano:overview 显式开启；plan:view 被项目覆盖显式关闭（压制演示方案全量授权）
    const view = pano.menus.find((m) => m.key === 'pano:overview');
    assert.ok(view && view.enabled === true);
    const closed = pano.menus.find((m) => m.key === 'plan:view');
    assert.ok(closed && closed.enabled === false, '项目级菜单可覆盖方案默认授权');
  } finally {
    db.close(); fs.rmSync(tmp, { recursive: true, force: true }); restoreEnv(prev);
  }
});
