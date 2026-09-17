/**
 * 商品数据洞察（1:1 参考菜鸟云商品仪表盘：核心指标/交易趋势/热销榜/购买榜）
 * - 授权：需开通商品应用（demo 方案自动纳入），未开通 403
 * - 指标口径：成交=paid/shipped/done；待发货=paid；待核销=pickup 且未完成；售后单=待处理+处理中
 * - 趋势按天补零；热销榜按商品聚合；购买榜 join platform_user 昵称
 * - range：today/7d/30d
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

describe('商品数据洞察', () => {
  let app, db, t1, t2;

  before(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goods-insight-'));
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
    t1 = mk('gi_t1', '13800002001', 1);
    t2 = mk('gi_t2', '13800002002', 2);
    db.prepare("UPDATE projects SET solutions = '[\"demo\"]' WHERE id = 1").run();
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (2, '租户2', 'active', '[]')").run();
    db.prepare("UPDATE projects SET solutions = '[]' WHERE id = 2").run();
  });

  after(() => { try { db?.close(); } catch {} });

  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  test('未开通商品应用：403', async () => {
    const r = await request(app).get('/api/customer/goods/insight').set(auth(t2));
    assert.equal(r.status, 403);
    assert.match(r.body.error, /商品/);
  });

  test('无成交：指标全 0 / 趋势 7 天补零 / 榜单空', async () => {
    const r = await request(app).get('/api/customer/goods/insight?range=7d').set(auth(t1));
    assert.equal(r.status, 200);
    assert.equal(r.body.range, '7d');
    assert.equal(r.body.metrics.orders, 0);
    assert.equal(r.body.metrics.amount, 0);
    assert.equal(r.body.metrics.avg, 0);
    assert.equal(r.body.trend.length, 7);
    assert.ok(r.body.trend.every((t) => t.orders === 0 && t.amount === 0));
    assert.equal(r.body.hotGoods.length, 0);
    assert.equal(r.body.hotUsers.length, 0);
  });

  test('成交后：指标/趋势/热销榜/购买榜聚合正确 + 待发货/待核销/售后单', async () => {
    // 买家
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, phone, status, customer_id, identity_type) VALUES (11, 'ou_gi1', '林平', '13811110001', 'active', 1, 'individual')").run();
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, phone, status, customer_id, identity_type) VALUES (12, 'ou_gi2', '好家风', '13811110002', 'active', 1, 'individual')").run();
    // 两笔已支付订单（同一天，租户1）
    const o1 = Number(db.prepare("INSERT INTO goods_order (order_no, customer_id, user_id, status, total_amount, freight, pay_amount, delivery_mode, receiver_name, receiver_phone, paid_at) VALUES ('GI20260917001', 1, 11, 'paid', 10000, 0, 10000, 'express', '林平', '13811110001', datetime('now'))").run().lastInsertRowid);
    const o2 = Number(db.prepare("INSERT INTO goods_order (order_no, customer_id, user_id, status, total_amount, freight, pay_amount, delivery_mode, receiver_name, receiver_phone, paid_at) VALUES ('GI20260917002', 1, 12, 'shipped', 5000, 0, 5000, 'pickup', '好家风', '13811110002', datetime('now'))").run().lastInsertRowid);
    // 明细（商品A 2件×10000，商品A 1件×5000 → 热销榜 A 聚合 2笔/25000）
    db.prepare("INSERT INTO goods_order_item (order_id, goods_id, title, thumb, price, num, goods_type) VALUES (?, 101, '商品A', '', 10000, 2, 'normal')").run(o1);
    db.prepare("INSERT INTO goods_order_item (order_id, goods_id, title, thumb, price, num, goods_type) VALUES (?, 101, '商品A', '', 5000, 1, 'normal')").run(o2);
    // 一笔售后单（pending）+ 一笔待发货（paid 未发货=o1）
    db.prepare("INSERT INTO goods_after_sale (after_sale_no, customer_id, order_id, user_id, type, reason, amount, status) VALUES ('ASGI001', 1, ?, 11, 'refund', '不想要了', 10000, 'pending')").run(o1);

    const r = await request(app).get('/api/customer/goods/insight?range=7d').set(auth(t1));
    assert.equal(r.status, 200);
    assert.equal(r.body.metrics.orders, 2);
    assert.equal(r.body.metrics.amount, 15000);
    assert.equal(r.body.metrics.avg, 7500);
    assert.equal(r.body.metrics.pendingShip, 1);        // o1 paid 未发货
    assert.equal(r.body.metrics.pendingPickup, 1);      // o2 pickup shipped 未完成
    assert.equal(r.body.metrics.afterSale, 1);          // ASGI001 pending
    // 趋势：最后一天有成交
    const today = r.body.trend[r.body.trend.length - 1];
    assert.equal(today.orders, 2);
    assert.equal(today.amount, 15000);
    // 热销榜：商品A 2笔 25000
    assert.equal(r.body.hotGoods.length, 1);
    assert.equal(r.body.hotGoods[0].title, '商品A');
    assert.equal(r.body.hotGoods[0].orders, 2);
    assert.equal(r.body.hotGoods[0].amount, 25000);
    // 购买榜：林平 1笔 10000 / 好家风 1笔 5000（按金额降序）
    assert.equal(r.body.hotUsers.length, 2);
    assert.equal(r.body.hotUsers[0].nickname, '林平');
    assert.equal(r.body.hotUsers[0].orders, 1);
    assert.equal(r.body.hotUsers[0].amount, 10000);
    assert.equal(r.body.hotUsers[1].nickname, '好家风');
    assert.equal(r.body.hotUsers[1].amount, 5000);
  });

  test('租户隔离：开通后无成交数据返回 0（不影响租户1 数据）', async () => {
    db.prepare("UPDATE projects SET solutions = '[\"demo\"]' WHERE id = 2").run();
    const r = await request(app).get('/api/customer/goods/insight').set(auth(t2));
    assert.equal(r.status, 200);
    assert.equal(r.body.metrics.orders, 0);
    assert.equal(r.body.hotGoods.length, 0);
    // 租户1 数据不受影响
    const r1 = await request(app).get('/api/customer/goods/insight').set(auth(t1));
    assert.equal(r1.body.metrics.orders, 2);
  });
});
