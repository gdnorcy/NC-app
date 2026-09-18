/**
 * 商城 C 端公开 API 测试（/api/mall，2026-09-18）
 * - 未开通 goods 应用 → 403（requireGoodsApp C 端变体）
 * - 商品浏览公开（?tid= 租户解析）；购物车/订单需登录（Bearer token，card.js 同一协议）
 * - 购物车服务端存储（UPSERT 累加）；下单（快递/到店自提）生成业务单+支付单
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { config } from '../src/config.js';

function makeToken(user) {
  const payload = Buffer.from(JSON.stringify({ uid: user.id, openid: user.openid, ts: Date.now() })).toString('base64');
  return `${payload}.abcdef`;
}

describe('商城 C 端 API（/api/mall）', () => {
  let db, app, server, tmpDb;
  let baseUrl;
  let openId, closedId, user, token;

  before(async () => {
    tmpDb = path.join(os.tmpdir(), `mall-${Date.now()}.db`);
    db = createDb(tmpDb);
    openId = 99101;
    closedId = 99102;
    db.prepare("INSERT INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', ?)").run(openId, '已开通商城租户', JSON.stringify(['demo']));
    db.prepare("INSERT INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', ?)").run(closedId, '未开通租户', JSON.stringify([]));

    // 登录用户（C 端平台用户，入驻已开通租户）
    const r = db.prepare(
      "INSERT INTO platform_user (openid, nickname, status, customer_id, identity_type) VALUES ('mall_test_openid', '商城测试用户', 'active', ?, 'individual')"
    ).run(openId);
    user = { id: Number(r.lastInsertRowid), openid: 'mall_test_openid' };
    token = makeToken(user);

    // 商品数据：2 个出售中（1 多规格 1 单规格）+ 1 下架
    db.prepare("INSERT INTO goods (customer_id, title, status, price, stock, spec_mode, sort_order, thumb) VALUES (?, '苹果', 'sell', 5.5, 100, 'single', 1, '/uploads/apple.png')").run(openId);
    db.prepare("INSERT INTO goods (customer_id, title, status, price, stock, spec_mode, sort_order) VALUES (?, '套餐A', 'sell', 99, 10, 'multi', 2)").run(openId);
    const g2 = db.prepare("SELECT id FROM goods WHERE customer_id = ? AND title = '套餐A'").get(openId);
    db.prepare("INSERT INTO goods_sku (goods_id, spec_json, price, stock) VALUES (?, '{\"规格\":\"大份\"}', 120, 5)").run(g2.id);
    db.prepare("INSERT INTO goods_sku (goods_id, spec_json, price, stock) VALUES (?, '{\"规格\":\"小份\"}', 88, 8)").run(g2.id);
    db.prepare("INSERT INTO goods (customer_id, title, status, price, stock, spec_mode) VALUES (?, '下架品', 'off', 1, 1, 'single')").run(openId);

    // 分类 + 门店 + 配送设置
    db.prepare("INSERT INTO goods_category (customer_id, pid, name, status, sort_order) VALUES (?, 0, '水果', 1, 1)").run(openId);
    const cat = db.prepare("SELECT id FROM goods_category WHERE customer_id = ? AND name = '水果'").get(openId);
    db.prepare("UPDATE goods SET cate_ids = ? WHERE customer_id = ? AND title = '苹果'").run(JSON.stringify([cat.id]), openId);
    db.prepare("INSERT INTO store (customer_id, name, phone, province, city, district, address, status, type) VALUES (?, '东城店', '13800000000', '广东省', '东莞市', '东城', '东城路1号', 1, 'self')").run(openId);
    db.prepare("INSERT INTO store (customer_id, name, status, type) VALUES (?, '停用店', 0, 'self')").run(openId);
    db.prepare("INSERT INTO goods_setting (customer_id, config) VALUES (?, ?)").run(openId, JSON.stringify({ express: 1, citySend: 0, takeSelf: 1 }));

    config.webDistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mall-dist-'));
    app = createApp({ db });
    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
      server.on('error', reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    try { server.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDb, { force: true }); } catch {}
  });

  // 注意：必须用函数生成 headers（token 在 before 中赋值，顶层常量会取到 undefined）
  const auth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
  const json = (r) => r.json();

  test('未开通 goods 应用 → 403', async () => {
    const r = await fetch(`${baseUrl}/api/mall/goods?tid=${closedId}`);
    assert.equal(r.status, 403);
    const body = await json(r);
    assert.ok(body.error.includes('商品管理'));
  });

  test('公开：分类/商品列表/详情（?tid= 租户解析，出售中+销量/售罄标记）', async () => {
    const cates = await fetch(`${baseUrl}/api/mall/cates?tid=${openId}`).then(json);
    assert.ok(cates.total >= 1);
    assert.equal(cates.list[0].name, '水果');

    const goods = await fetch(`${baseUrl}/api/mall/goods?tid=${openId}&pageSize=20`).then(json);
    assert.equal(goods.total, 2); // 只出售中
    const apple = goods.list.find((g) => g.title === '苹果');
    assert.equal(apple.soldout, false);

    const detail = await fetch(`${baseUrl}/api/mall/goods/${apple.id}?tid=${openId}`).then(json);
    assert.equal(detail.specMode, 'single');
    assert.equal(detail.delivery.express, true);
    assert.equal(detail.delivery.takeSelf, true);
    assert.equal(detail.delivery.citySend, false);
  });

  test('公开：门店列表只返回启用门店', async () => {
    const stores = await fetch(`${baseUrl}/api/mall/stores?tid=${openId}`).then(json);
    assert.equal(stores.list.length, 1);
    assert.equal(stores.list[0].name, '东城店');
  });

  test('购物车需登录（无 token → 401）', async () => {
    const r = await fetch(`${baseUrl}/api/mall/cart?tid=${openId}`);
    assert.equal(r.status, 401);
  });

  test('购物车 CRUD（登录态，同商品累加/改量/删项/清空）', async () => {
    const apple = db.prepare("SELECT id FROM goods WHERE customer_id = ? AND title = '苹果'").get(openId);
    // 加购 x2
    let r = await fetch(`${baseUrl}/api/mall/cart`, { method: 'POST', headers: auth(), body: JSON.stringify({ goodsId: apple.id, quantity: 2 }) });
    assert.equal(r.status, 200);
    // 再加 x3 → 同项累加为 5
    r = await fetch(`${baseUrl}/api/mall/cart`, { method: 'POST', headers: auth(), body: JSON.stringify({ goodsId: apple.id, quantity: 3 }) });
    assert.equal(r.status, 200);
    let cart = await fetch(`${baseUrl}/api/mall/cart`, { headers: auth() }).then(json);
    assert.equal(cart.list.length, 1);
    assert.equal(cart.list[0].quantity, 5);
    assert.equal(cart.list[0].title, '苹果');

    // 改数量 = 2
    r = await fetch(`${baseUrl}/api/mall/cart/${cart.list[0].id}`, { method: 'PUT', headers: auth(), body: JSON.stringify({ quantity: 2 }) });
    assert.equal(r.status, 200);
    cart = await fetch(`${baseUrl}/api/mall/cart`, { headers: auth() }).then(json);
    assert.equal(cart.list[0].quantity, 2);

    // 多规格商品加购（skuId）
    const g2 = db.prepare("SELECT id FROM goods WHERE customer_id = ? AND title = '套餐A'").get(openId);
    const sku = db.prepare('SELECT id FROM goods_sku WHERE goods_id = ?').get(g2.id);
    r = await fetch(`${baseUrl}/api/mall/cart`, { method: 'POST', headers: auth(), body: JSON.stringify({ goodsId: g2.id, skuId: sku.id, quantity: 1 }) });
    assert.equal(r.status, 200);
    cart = await fetch(`${baseUrl}/api/mall/cart`, { headers: auth() }).then(json);
    assert.equal(cart.list.length, 2);
    const skuItem = cart.list.find((i) => i.skuId === sku.id);
    assert.equal(skuItem.price, 12000); // sku 价（元→分）

    // 清空
    r = await fetch(`${baseUrl}/api/mall/cart`, { method: 'DELETE', headers: auth() });
    assert.equal(r.status, 200);
    cart = await fetch(`${baseUrl}/api/mall/cart`, { headers: auth() }).then(json);
    assert.equal(cart.list.length, 0);
  });

  test('下单（快递）→ 业务单+支付单 → 订单列表/详情 → 取消', async () => {
    const apple = db.prepare("SELECT id FROM goods WHERE customer_id = ? AND title = '苹果'").get(openId);
    const r = await fetch(`${baseUrl}/api/mall/orders`, {
      method: 'POST', headers: auth(),
      body: JSON.stringify({ items: [{ goodsId: apple.id, quantity: 2 }], deliveryMode: 'express', receiverName: '张三', receiverPhone: '13900000000', receiverAddress: '东莞市南城' }),
    });
    assert.equal(r.status, 200);
    const order = await json(r);
    assert.ok(order.orderNo && order.payOrderNo);
    assert.equal(order.amount, 1100); // 5.5 * 2 = 11 元
    assert.equal(order.pickupCode, '');

    const list = await fetch(`${baseUrl}/api/mall/orders`, { headers: auth() }).then(json);
    assert.equal(list.total, 1);
    assert.equal(list.list[0].items[0].title, '苹果');

    const detail = await fetch(`${baseUrl}/api/mall/orders/${order.id}`, { headers: auth() }).then(json);
    assert.equal(detail.order_no, order.orderNo);

    // 越权：其它用户看不了
    const r2 = db.prepare("INSERT INTO platform_user (openid, status, customer_id, identity_type) VALUES ('other_openid', 'active', ?, 'individual')").run(openId);
    const otherToken = makeToken({ id: Number(r2.lastInsertRowid), openid: 'other_openid' });
    const forbid = await fetch(`${baseUrl}/api/mall/orders/${order.id}`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherToken}` } });
    assert.equal(forbid.status, 404);

    const cancel = await fetch(`${baseUrl}/api/mall/orders/${order.id}/cancel`, { method: 'POST', headers: auth() });
    assert.equal(cancel.status, 200);
    const afterCancel = await fetch(`${baseUrl}/api/mall/orders?status=closed`, { headers: auth() }).then(json);
    assert.equal(afterCancel.total, 1);
  });

  test('下单（到店自提）→ 核销码+门店名；门店不存在 → 400', async () => {
    const apple = db.prepare("SELECT id FROM goods WHERE customer_id = ? AND title = '苹果'").get(openId);
    const store = db.prepare("SELECT id, name FROM store WHERE customer_id = ? AND status = 1").get(openId);
    const r = await fetch(`${baseUrl}/api/mall/orders`, {
      method: 'POST', headers: auth(),
      body: JSON.stringify({ items: [{ goodsId: apple.id, quantity: 1 }], deliveryMode: 'pickup', storeId: store.id }),
    });
    assert.equal(r.status, 200);
    const order = await json(r);
    assert.equal(order.storeName, store.name);
    assert.match(order.pickupCode, /^\d{6}$/);

    // 停用门店下单 → 400
    const closedStore = db.prepare("SELECT id FROM store WHERE customer_id = ? AND status = 0").get(openId);
    const r2 = await fetch(`${baseUrl}/api/mall/orders`, {
      method: 'POST', headers: auth(),
      body: JSON.stringify({ items: [{ goodsId: apple.id, quantity: 1 }], deliveryMode: 'pickup', storeId: closedStore.id }),
    });
    assert.equal(r2.status, 400);
  });
});
