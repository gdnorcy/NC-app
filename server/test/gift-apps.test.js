/**
 * 营销引流应用：礼品卡券（card-ticket）+ 送礼物（card-gift）
 * - 授权：未开通 403；demo 自动纳入
 * - 卡券分类 CRUD：重名拒绝/有卡保护删除
 * - 卡券 CRUD：必填校验/库存已售/批量删除/上下架
 * - 送礼物：绑定（忽略不存在商品）/批量开启关闭/单开关/解绑
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

describe('营销引流：礼品卡券+送礼物', () => {
  let app, db, t1, t2;

  before(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gift-test-'));
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
    t1 = mk('gt_t1', '13800003001', 1);
    t2 = mk('gt_t2', '13800003002', 2);
    db.prepare("UPDATE projects SET solutions = '[\"demo\"]' WHERE id = 1").run();
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (2, '租户2', 'active', '[]')").run();
    db.prepare("UPDATE projects SET solutions = '[]' WHERE id = 2").run();
  });

  after(() => { try { db?.close(); } catch {} });

  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  test('未开通礼品卡券/送礼物：403', async () => {
    const r1 = await request(app).get('/api/customer/gift-card/categories').set(auth(t2));
    assert.equal(r1.status, 403);
    assert.match(r1.body.error, /礼品卡券/);
    const r2 = await request(app).get('/api/customer/gift/products').set(auth(t2));
    assert.equal(r2.status, 403);
    assert.match(r2.body.error, /送礼物/);
  });

  test('卡券分类 CRUD：重名拒绝/有卡保护删除', async () => {
    const c1 = await request(app).post('/api/customer/gift-card/categories').set(auth(t1)).send({ name: '节日卡券', sort: 5 });
    assert.equal(c1.status, 200);
    const cid = c1.body.id;
    const dup = await request(app).post('/api/customer/gift-card/categories').set(auth(t1)).send({ name: '节日卡券' });
    assert.equal(dup.status, 400);
    // 分类下有卡券时禁止删除
    const card = await request(app).post('/api/customer/gift-card/cards').set(auth(t1)).send({
      name: '国庆卡', cateId: cid, price: 10000, stock: 50, limitNum: 0, increase: 1, type: 1, money: 10000,
      useType: 1, todayAfter: 3, sort: 1, flag: 1,
    });
    assert.equal(card.status, 200, card.body.error || '添加卡券失败');
    const del = await request(app).delete(`/api/customer/gift-card/categories/${cid}`).set(auth(t1));
    assert.equal(del.status, 400);
    assert.match(del.body.error, /请先删除卡券/);
    // 编辑分类
    const upd = await request(app).put(`/api/customer/gift-card/categories/${cid}`).set(auth(t1)).send({ name: '节日2', sort: 9 });
    assert.equal(upd.status, 200);
    const list = await request(app).get('/api/customer/gift-card/categories').set(auth(t1));
    const row = list.body.find((x) => x.id === cid);
    assert.equal(row.name, '节日2');
    assert.equal(row.cardCount, 1);
  });

  test('卡券 CRUD：必填/列表/批量删除/上下架', async () => {
    const cat = await request(app).post('/api/customer/gift-card/categories').set(auth(t1)).send({ name: '充值类' });
    const cid = cat.body.id;
    // 缺名称/分类拒绝
    const bad = await request(app).post('/api/customer/gift-card/cards').set(auth(t1)).send({ name: '' });
    assert.equal(bad.status, 400);
    const bad2 = await request(app).post('/api/customer/gift-card/cards').set(auth(t1)).send({ name: 'x' });
    assert.equal(bad2.status, 400);
    const c1 = await request(app).post('/api/customer/gift-card/cards').set(auth(t1)).send({
      name: '话费卡', cateId: cid, price: 9850, stock: 100, limitNum: 1, increase: 0, type: 1, money: 10000,
      useType: 0, useBtime: '2026-01-01 00:00:00', useEtime: '2026-12-31 23:59:59',
      thumb: '/uploads/a.png', carousel: ['/uploads/a.png'], descs: '全国通用', shareTitle: '话费卡', sort: 3, flag: 1,
    });
    assert.equal(c1.status, 200, c1.body.error || '添加话费卡失败');
    const c2 = await request(app).post('/api/customer/gift-card/cards').set(auth(t1)).send({
      name: '超市卡', cateId: cid, price: 5000, stock: 10, type: 2, money: 5000, useType: 2, yesAfter: 7, flag: 2,
    });
    assert.equal(c2.status, 200, c2.body.error || '添加超市卡失败');
    // 列表
    const list = await request(app).get('/api/customer/gift-card/cards').set(auth(t1));
    assert.equal(list.body.length, 3); // 含上个用例的国庆卡
    const byCate = await request(app).get(`/api/customer/gift-card/cards?cateId=${cid}`).set(auth(t1));
    assert.equal(byCate.body.length, 2);
    const byFlag = await request(app).get('/api/customer/gift-card/cards?flag=2').set(auth(t1));
    assert.equal(byFlag.body.length, 1);
    const row = byCate.body.find((x) => x.name === '话费卡');
    assert.equal(row.price, 9850, '价格分存储');
    assert.equal(row.money, 10000);
    assert.equal(row.carousel.length, 1);
    assert.equal(row.flag, 1);
    // 批量删除
    const ids = byCate.body.map((x) => x.id);
    const bd = await request(app).post('/api/customer/gift-card/cards/batch-delete').set(auth(t1)).send({ ids });
    assert.equal(bd.body.deleted, 2);
    const after = await request(app).get('/api/customer/gift-card/cards').set(auth(t1));
    assert.equal(after.body.length, 1);
  });

  test('送礼物：绑定/批量开关/单开关/解绑/隔离', async () => {
    // 造两个商品
    const ins = db.prepare("INSERT INTO goods (customer_id, title, thumb, price, stock, status, type, top_type) VALUES (?,?,?,?,?,?,?,?)");
    const g1 = Number(ins.run(1, '礼物商品A', '', 9900, 10, 'sell', 'normal', 1).lastInsertRowid);
    const g2 = Number(ins.run(1, '礼物商品B', '', 19900, 5, 'sell', 'normal', 1).lastInsertRowid);
    // 未绑定列表
    const l0 = await request(app).get('/api/customer/gift/products').set(auth(t1));
    assert.equal(l0.status, 200);
    const unbound = l0.body.filter((x) => x.id === g1 || x.id === g2);
    assert.equal(unbound.length, 2);
    assert.ok(unbound.every((x) => x.isBound === false));
    // 绑定（含不存在的商品忽略）
    const bind = await request(app).post('/api/customer/gift/products/bind').set(auth(t1)).send({ productIds: [g1, g2, 99999] });
    assert.equal(bind.body.bound, 2);
    // 重复绑定幂等
    const bind2 = await request(app).post('/api/customer/gift/products/bind').set(auth(t1)).send({ productIds: [g1] });
    assert.equal(bind2.body.bound, 0);
    // 列表已绑定
    const l1 = await request(app).get('/api/customer/gift/products?key=礼物商品A').set(auth(t1));
    assert.equal(l1.body.length, 1);
    assert.equal(l1.body[0].bound, 1);
    assert.equal(l1.body[0].isBound, true);
    // 关闭 g2
    const all = await request(app).get('/api/customer/gift/products').set(auth(t1));
    const g2row = all.body.find((x) => x.id === g2);
    const tg = await request(app).post(`/api/customer/gift/products/${g2row.gpId}/toggle`).set(auth(t1)).send({ status: 0 });
    assert.equal(tg.status, 200);
    // 批量开启
    const closed = (await request(app).get('/api/customer/gift/products').set(auth(t1))).body.find((x) => x.id === g2);
    assert.equal(closed.bound, 0);
    assert.equal(closed.isBound, true);
    const bt = await request(app).post('/api/customer/gift/products/toggle').set(auth(t1)).send({ ids: [closed.gpId], status: 1 });
    assert.equal(bt.body.updated, 1);
    // 解绑 g1
    const g1row = (await request(app).get('/api/customer/gift/products').set(auth(t1))).body.find((x) => x.id === g1);
    const ub = await request(app).delete(`/api/customer/gift/products/${g1row.gpId}`).set(auth(t1));
    assert.equal(ub.status, 200);
    const after = await request(app).get('/api/customer/gift/products').set(auth(t1));
    assert.equal(after.body.find((x) => x.id === g1).isBound, false);
    assert.equal(after.body.find((x) => x.id === g2).isBound, true);
    // 租户2（未开通）403
    const r2 = await request(app).get('/api/customer/gift/products').set(auth(t2));
    assert.equal(r2.status, 403);
  });
});
