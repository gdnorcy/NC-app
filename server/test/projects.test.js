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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-projects-'));
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

function seedProject(db, over = {}) {
  return db
    .prepare(
      `INSERT INTO projects (name, description, sort_order, published, share_token, share_enabled)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      over.name || '测试项目',
      over.description || '',
      over.sortOrder ?? 0,
      over.published ?? 1,
      over.shareToken || genShareToken(),
      over.shareEnabled ?? 1
    ).lastInsertRowid;
}

function seedScene(db, projectId, over = {}) {
  return db
    .prepare(
      `INSERT INTO scenes (title, image_path, project_id, share_token, share_enabled, sort_order, published)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      over.title || '场景A',
      over.imagePath || '/uploads/a.jpg',
      projectId,
      over.shareToken || '',
      over.shareEnabled ?? 0,
      over.sortOrder ?? 0,
      over.published ?? 1
    ).lastInsertRowid;
}

test('公开项目列表只返回已上架且开启分享的项目', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const p1 = seedProject(db, { name: '公开项目' });
    seedProject(db, { name: '隐藏项目', published: 0 });
    seedProject(db, { name: '关闭分享', shareEnabled: 0 });
    seedScene(db, p1);
    seedScene(db, p1);
    const res = await request(app).get('/api/projects').expect(200);
    const names = res.body.projects.map((p) => p.name);
    assert.ok(names.includes('公开项目'));
    assert.ok(!names.includes('隐藏项目'));
    assert.ok(!names.includes('关闭分享'));
    const pub = res.body.projects.find((p) => p.name === '公开项目');
    assert.equal(pub.sceneCount, 2);
    assert.ok(pub.shareToken);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

test('项目详情返回项目与上架场景', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const pid = seedProject(db, { name: '项目X' });
    seedScene(db, pid, { title: '场景1' });
    seedScene(db, pid, { title: '场景2', published: 0 });
    const res = await request(app).get(`/api/projects/${pid}`).expect(200);
    assert.equal(res.body.project.name, '项目X');
    assert.equal(res.body.scenes.length, 1);
    assert.equal(res.body.scenes[0].title, '场景1');
    assert.equal(res.body.scenes[0].projectId, pid);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

test('分享令牌解析：项目级', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const token = genShareToken();
    const pid = seedProject(db, { name: '分享项目', shareToken: token });
    seedScene(db, pid, { title: 'S1' });
    seedScene(db, pid, { title: 'S2' });
    const res = await request(app).get(`/api/s/${token}`).expect(200);
    assert.equal(res.body.type, 'project');
    assert.equal(res.body.project.name, '分享项目');
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
    const pid = seedProject(db, { name: '项目Y' });
    const st = genShareToken();
    seedScene(db, pid, { title: '要分享的场景', shareToken: st, shareEnabled: 1 });
    const res = await request(app).get(`/api/s/${st}`).expect(200);
    assert.equal(res.body.type, 'scene');
    assert.equal(res.body.scene.title, '要分享的场景');
    assert.equal(res.body.project.name, '项目Y');
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
    seedProject(db, { name: '关闭', shareEnabled: 0 });
    const res = await request(app).get('/api/s/unknown-token').expect(404);
    assert.ok(res.body.error);
    // 未知 token
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
    const token = genShareToken();
    seedProject(db, { name: '二维码项目', shareToken: token });
    const res = await request(app).get(`/api/s/${token}/qr?size=200`).expect(200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.ok(res.body.length > 500);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

test('项目管理 CRUD：创建/编辑/刷新令牌/删除', async () => {
  const { tmp, prev } = setupEnv();
  const db = createDb();
  const app = createApp({ db });
  try {
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' }).expect(200);
    const token = login.body.token;
    const auth = { Authorization: `Bearer ${token}` };

    const created = await request(app).post('/api/admin/projects').set(auth).send({ name: '新项目', description: '描述', published: true, shareEnabled: true }).expect(201);
    const pid = created.body.project.id;
    assert.ok(created.body.project.shareToken);

    const edited = await request(app).put(`/api/admin/projects/${pid}`).set(auth).send({ name: '改名项目', regenerateShareToken: true }).expect(200);
    assert.equal(edited.body.project.name, '改名项目');
    assert.notEqual(edited.body.project.shareToken, created.body.project.shareToken);

    // 删除：项目内场景归默认项目
    const sceneId = seedScene(db, pid);
    await request(app).delete(`/api/admin/projects/${pid}`).set(auth).expect(200);
    const fallback = db.prepare('SELECT id FROM projects ORDER BY sort_order ASC, id ASC LIMIT 1').get().id;
    const moved = db.prepare('SELECT project_id FROM scenes WHERE id = ?').get(sceneId);
    assert.equal(moved.project_id, fallback);

    // 名称必填
    await request(app).post('/api/admin/projects').set(auth).send({ name: '  ' }).expect(400);
    // 未登录 401
    await request(app).get('/api/admin/projects').expect(401);
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

    const pid = seedProject(db, { name: 'P' });
    // 创建时指定 projectId + shareEnabled
    const created = await request(app)
      .post('/api/admin/scenes')
      .set(auth)
      .send({ title: '归属场景', imagePath: '/uploads/x.jpg', projectId: pid, shareEnabled: true })
      .expect(201);
    assert.equal(created.body.scene.projectId, pid);
    assert.equal(created.body.scene.shareEnabled, true);
    assert.ok(created.body.scene.shareToken);

    // 编辑关闭分享保留 token；再开启不刷新
    const c1 = await request(app)
      .put(`/api/admin/scenes/${created.body.scene.id}`)
      .set(auth)
      .send({ shareEnabled: false })
      .expect(200);
    assert.equal(c1.body.scene.shareEnabled, false);
    assert.equal(c1.body.scene.shareToken, created.body.scene.shareToken);
    // 手动刷新 token
    const c2 = await request(app)
      .put(`/api/admin/scenes/${created.body.scene.id}`)
      .set(auth)
      .send({ shareEnabled: true, regenerateShareToken: true })
      .expect(200);
    assert.notEqual(c2.body.scene.shareToken, created.body.scene.shareToken);
    // 此时该场景可被分享解析
    const s = await request(app).get(`/api/s/${c2.body.scene.shareToken}`).expect(200);
    assert.equal(s.body.type, 'scene');
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});

test('存量库迁移：老库自动建默认项目并收纳旧场景', async () => {
  const { tmp, prev } = setupEnv();
  // 手工构造"老库"：只有 scenes（无 projects 表、无 project_id 列）
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
    const projects = db.prepare('SELECT * FROM projects').all();
    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, '默认项目');
    assert.equal(projects[0].share_enabled, 1);
    assert.ok(projects[0].share_token);
    const scenes = db.prepare('SELECT project_id, share_token, share_enabled FROM scenes').all();
    assert.equal(scenes.length, 2);
    for (const s of scenes) {
      assert.equal(s.project_id, projects[0].id);
      assert.equal(s.share_enabled, 0);
    }
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv(prev);
  }
});
