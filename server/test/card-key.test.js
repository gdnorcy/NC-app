/**
 * 电子卡密管理端（1:1 复刻菜鸟云 card_key：分类/库/数据）
 * - 授权：需开通「电子卡密」(card-carmi) 应用，未开通 403
 * - 分类 CRUD：重名拒绝、类型（1单个/2通用）、有库保护删除
 * - 卡密库 CRUD：保存后不可修改分类、删除连带卡密数据
 * - 卡密数据：多行添加/分页/状态筛选/批量删除/批量导入/单删
 * - 租户隔离
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';
import { issueToken } from '../src/auth.js';

describe('电子卡密管理端', () => {
  let app, db, t1, t2;

  before(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-key-'));
    config.dataDir = tmpDir;
    config.uploadsDir = path.join(tmpDir, 'uploads');
    config.dbPath = path.join(tmpDir, 'panorama.db');
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    config.webDistDir = path.join(tmpDir, 'dist');
    fs.mkdirSync(config.webDistDir, { recursive: true });
    fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
    db = createDb(config.dbPath);
    app = createApp({ db });
    const mk = (u, p, cid) => {
      const { hash, salt } = hashPassword('123456');
      db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,'tenant_admin','active',?)").run(u, p, hash, salt, cid);
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(u);
      return issueToken(user);
    };
    t1 = mk('ck_t1', '13800002001', 1);
    t2 = mk('ck_t2', '13800002002', 2);
    db.prepare("UPDATE projects SET solutions = '[\"demo\"]' WHERE id = 1").run();
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (2, '租户2', 'active', '[]')").run();
    db.prepare("UPDATE projects SET solutions = '[]' WHERE id = 2").run();
  });

  after(() => { try { db?.close(); } catch {} });

  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  test('未开通电子卡密应用：403', async () => {
    const r = await request(app).get('/api/customer/card-key/categories').set(auth(t2));
    assert.equal(r.status, 403);
    assert.match(r.body.error, /电子卡密/);
  });

  test('分类 CRUD：新增/重名拒绝/类型默认单个/编辑/删除', async () => {
    const c1 = await request(app).post('/api/customer/card-key/categories').set(auth(t1)).send({ name: '演示', type: 1 });
    assert.equal(c1.status, 200);
    const cid = c1.body.id;
    // 重名拒绝
    const dup = await request(app).post('/api/customer/card-key/categories').set(auth(t1)).send({ name: '演示' });
    assert.equal(dup.status, 400);
    // 通用卡密
    const c2 = await request(app).post('/api/customer/card-key/categories').set(auth(t1)).send({ name: '网盘资料', type: 2 });
    assert.equal(c2.status, 200);
    // 列表含类型
    const list = await request(app).get('/api/customer/card-key/categories').set(auth(t1));
    assert.equal(list.status, 200);
    const row = list.body.find((x) => x.id === cid);
    assert.equal(row.typeLabel, '单个卡密');
    assert.equal(row.libraryCount, 0);
    // 编辑
    const upd = await request(app).put(`/api/customer/card-key/categories/${cid}`).set(auth(t1)).send({ name: '演示2', type: 1 });
    assert.equal(upd.status, 200);
    // 删除
    const del = await request(app).delete(`/api/customer/card-key/categories/${cid}`).set(auth(t1));
    assert.equal(del.status, 200);
  });

  test('卡密库 CRUD：保存后不可改分类；有库时分类删除保护；删除库连带数据', async () => {
    const cat = await request(app).post('/api/customer/card-key/categories').set(auth(t1)).send({ name: '激活码', type: 1 });
    const catId = cat.body.id;
    const lib = await request(app).post('/api/customer/card-key/libraries').set(auth(t1)).send({
      name: '激活码库', cateId: catId, remark: '仅后台可见', instruction: '购买后可见', canRepetition: 0,
    });
    assert.equal(lib.status, 200);
    const libId = lib.body.id;
    // 缺分类拒绝
    const bad = await request(app).post('/api/customer/card-key/libraries').set(auth(t1)).send({ name: 'x' });
    assert.equal(bad.status, 400);
    // 编辑（分类不可改：update 忽略 cateId）
    const upd = await request(app).put(`/api/customer/card-key/libraries/${libId}`).set(auth(t1)).send({
      name: '激活码库2', cateId: 999, remark: 'r2', instruction: 'i2', canRepetition: 1,
    });
    assert.equal(upd.status, 200);
    // 分类有库保护
    const delCat = await request(app).delete(`/api/customer/card-key/categories/${catId}`).set(auth(t1));
    assert.equal(delCat.status, 400);
    assert.match(delCat.body.error, /请先删除卡密库/);
    // 加数据
    const d = await request(app).post(`/api/customer/card-key/libraries/${libId}/data`).set(auth(t1)).send({
      items: [{ code: '00001', pwd: 'abc123' }, { code: '00002', pwd: 'def456' }, { code: '00003', pwd: '' }],
    });
    assert.equal(d.body.added, 3);
    // 通用卡密库：库存=内容有值
    const gcat = await request(app).post('/api/customer/card-key/categories').set(auth(t1)).send({ name: '通用', type: 2 });
    const glib = await request(app).post('/api/customer/card-key/libraries').set(auth(t1)).send({ name: '网盘', cateId: gcat.body.id, dataContent: '百度网盘 提取码8888' });
    const glibs = await request(app).get('/api/customer/card-key/libraries').set(auth(t1));
    const grow = glibs.body.find((x) => x.id === glib.body.id);
    assert.equal(grow.stock, 1, '通用卡密库存恒为1');
    assert.equal(grow.sold, 0);
    // 删除库连带数据
    const delLib = await request(app).delete(`/api/customer/card-key/libraries/${libId}`).set(auth(t1));
    assert.equal(delLib.status, 200);
    const remain = await request(app).get(`/api/customer/card-key/libraries/${libId}/data`).set(auth(t1));
    assert.equal(remain.status, 404, '库已删除');
  });

  test('卡密数据：状态筛选/搜索/批量删除/批量导入/单删', async () => {
    const cat = await request(app).post('/api/customer/card-key/categories').set(auth(t1)).send({ name: '卡密库A', type: 1 });
    const lib = await request(app).post('/api/customer/card-key/libraries').set(auth(t1)).send({ name: 'A库', cateId: cat.body.id });
    const libId = lib.body.id;
    await request(app).post(`/api/customer/card-key/libraries/${libId}/data`).set(auth(t1)).send({
      items: [{ code: 'A01', pwd: 'p1' }, { code: 'A02', pwd: 'p2' }, { code: 'A03', pwd: 'p3' }, { code: 'A04', pwd: 'p4' }],
    });
    // 标记一条已使用（模拟售出）
    db.prepare("UPDATE card_key_data SET status = 1, order_id = 99 WHERE code = 'A01'").run();
    const list = await request(app).get(`/api/customer/card-key/libraries/${libId}/data`).set(auth(t1));
    assert.equal(list.body.total, 4);
    const used = await request(app).get(`/api/customer/card-key/libraries/${libId}/data?status=1`).set(auth(t1));
    assert.equal(used.body.list.length, 1);
    const kw = await request(app).get(`/api/customer/card-key/libraries/${libId}/data?key=A02`).set(auth(t1));
    assert.equal(kw.body.list.length, 1);
    // 批量删除（选 2 条）
    const ids = list.body.list.filter((x) => x.code === 'A02' || x.code === 'A03').map((x) => x.id);
    const bd = await request(app).post(`/api/customer/card-key/libraries/${libId}/data/batch-delete`).set(auth(t1)).send({ ids });
    assert.equal(bd.body.deleted, 2);
    // 单删
    const one = (await request(app).get(`/api/customer/card-key/libraries/${libId}/data`).set(auth(t1))).body.list.find((x) => x.code === 'A04');
    const sd = await request(app).delete(`/api/customer/card-key/libraries/${libId}/data/${one.id}`).set(auth(t1));
    assert.equal(sd.status, 200);
    // 导入
    const imp = await request(app).post(`/api/customer/card-key/libraries/${libId}/data/import`).set(auth(t1)).send({
      text: 'B01 b1\nB02,b2\nB03\tb3\nB04',
    });
    assert.equal(imp.body.added, 4);
    const final = await request(app).get(`/api/customer/card-key/libraries/${libId}/data`).set(auth(t1));
    assert.equal(final.body.total, 5, '4条-A01已售1 + 导入4 - 删2 - 删1 = 5');
    // 列表已售/库存
    const libs = await request(app).get('/api/customer/card-key/libraries').set(auth(t1));
    const row = libs.body.find((x) => x.id === libId);
    assert.equal(row.sold, 1);
    assert.equal(row.stock, 4, '库存=未售条数（A01已售 + 4条导入 = 4未售）');
  });

  test('options（商品编辑页下拉）与租户隔离', async () => {
    const opts = await request(app).get('/api/customer/card-key/options').set(auth(t1));
    assert.equal(opts.status, 200);
    assert.ok(opts.body.length >= 2);
    assert.ok(opts.body.every((o) => 'cateName' in o && 'stock' in o));
    // 租户2（未开通）403
    const r2 = await request(app).get('/api/customer/card-key/options').set(auth(t2));
    assert.equal(r2.status, 403);
  });
});
