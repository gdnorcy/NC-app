/**
 * 商品订单服务测试（二期-A 订单闭环）
 * 覆盖：下单校验/明细快照/支付回调扣库存/状态流转/退款恢复库存/列表筛选
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb } from '../src/db.js';
import { createGoodsOrderService } from '../src/services/goodsOrder.js';
import { PaymentService } from '../src/services/payment.js';

describe('商品订单（goods_order 闭环）', () => {
  let db, svc, payment;
  const DB_PATH = path.join(os.tmpdir(), `goods-order-test-${Date.now()}.db`);
  const TENANT = 88901;

  before(() => {
    db = createDb(DB_PATH);
    svc = createGoodsOrderService(db);
    payment = new PaymentService(db);
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, identity_type, customer_id) VALUES (?, ?, ?, ?, ?)")
      .run(3001, 'go-u3001', '买家甲', 'individual', TENANT);
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, identity_type, customer_id) VALUES (?, ?, ?, ?, ?)")
      .run(3002, 'go-u3002', '买家乙', 'individual', TENANT);
    // 种子商品：普通单规格 + 多规格
    const r1 = db.prepare(`INSERT INTO goods (customer_id, title, type, status, stock, price, spec_mode, images) VALUES (?, '普通商品', 'normal', 'sell', 100, 99.9, 'single', '[]')`).run(TENANT);
    db.prepare(`INSERT INTO goods (customer_id, title, type, status, stock, price, spec_mode, images) VALUES (?, '多规格商品', 'normal', 'sell', 0, 0, 'multi', '[]')`).run(TENANT);
    const r2 = db.prepare("SELECT id FROM goods WHERE customer_id = ? AND title = '多规格商品'").get(TENANT);
    db.prepare("INSERT INTO goods_sku (goods_id, spec_json, price, stock) VALUES (?, '{\"颜色\":\"红\"}', 50, 10)").run(r2.id);
    db.prepare("INSERT INTO goods_sku (goods_id, spec_json, price, stock) VALUES (?, '{\"颜色\":\"蓝\"}', 60, 5)").run(r2.id);
    db.goodsId = Number(r1.lastInsertRowid);
    db.multiGoodsId = r2.id;
  });
  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

  function createPayAndPaid(order) {
    const payOrder = payment.createOrder({
      payerType: 'tenant', customerId: TENANT, userId: order.user_id, identityType: 'individual',
      solution: 'goods', productType: 'goods', productId: String(order.id),
      productName: `商品订单#${order.order_no}`, amount: order.pay_amount, remark: `GO_${order.order_no}`,
    });
    return payment.markPaid(payOrder.orderNo, 'TX_' + Date.now());
  }

  test('下单：校验库存/明细快照/金额计算', () => {
    const o = svc.createOrder({
      customerId: TENANT, userId: 3001, identityType: 'individual',
      items: [{ goodsId: db.goodsId, num: 2 }],
      deliveryMode: 'express', receiverName: '张三', receiverPhone: '13800138000',
    });
    assert.equal(o.status, 'pending');
    assert.equal(o.pay_amount, 19980); // 99.9*2 分
    assert.equal(o.items.length, 1);
    assert.equal(o.items[0].price, 9990);
    assert.equal(o.items[0].title, '普通商品');
    assert.ok(o.order_no.startsWith('G'));
  });

  test('下单：多规格商品按 SKU 价与库存', () => {
    const sku = db.prepare('SELECT * FROM goods_sku WHERE goods_id = ? AND spec_json LIKE ?').get(db.multiGoodsId, '%红%');
    const o = svc.createOrder({
      customerId: TENANT, userId: 3001, identityType: 'individual',
      items: [{ goodsId: db.multiGoodsId, skuId: sku.id, num: 3 }], deliveryMode: 'pickup',
    });
    assert.equal(o.pay_amount, 15000); // 50*3 分
    assert.equal(o.items[0].sku_id, sku.id);
  });

  test('下单：库存不足拒绝 / 未上架拒绝 / 缺收货人拒绝', () => {
    assert.throws(() => svc.createOrder({ customerId: TENANT, userId: 3001, items: [{ goodsId: db.goodsId, num: 999 }], deliveryMode: 'pickup' }), /库存不足/);
    const off = db.prepare(`INSERT INTO goods (customer_id, title, type, status, stock, price, spec_mode, images) VALUES (?, '下架品', 'normal', 'off', 10, 10, 'single', '[]')`).run(TENANT);
    assert.throws(() => svc.createOrder({ customerId: TENANT, userId: 3001, items: [{ goodsId: Number(off.lastInsertRowid), num: 1 }], deliveryMode: 'pickup' }), /未上架|不存在/);
    assert.throws(() => svc.createOrder({ customerId: TENANT, userId: 3001, items: [{ goodsId: db.goodsId, num: 1 }], deliveryMode: 'express' }), /收货人/);
  });

  test('支付成功：扣库存/状态paid/回填支付单/日志/消息', () => {
    const o = svc.createOrder({ customerId: TENANT, userId: 3001, items: [{ goodsId: db.goodsId, num: 2 }], deliveryMode: 'pickup' });
    const before = db.prepare('SELECT stock FROM goods WHERE id = ?').get(db.goodsId).stock;
    const paid = createPayAndPaid(o);
    assert.equal(paid.status, 'paid');
    const after = db.prepare('SELECT stock FROM goods WHERE id = ?').get(db.goodsId).stock;
    assert.equal(after, before - 2);
    const oo = svc.getOrder(o.id);
    assert.equal(oo.status, 'paid');
    assert.equal(oo.pay_order_id, paid.id);
    assert.ok(oo.logs.some(l => l.action === 'paid'));
    const msg = db.prepare("SELECT * FROM card_message WHERE user_id = 3001 AND title LIKE '%支付成功%' ORDER BY id DESC LIMIT 1").get();
    assert.ok(msg, '支付成功消息应写入');
  });

  test('支付成功：虚拟商品自动发货置 done', () => {
    const r = db.prepare(`INSERT INTO goods (customer_id, title, type, status, stock, price, spec_mode, images) VALUES (?, '虚拟品', 'virtual', 'sell', 999, 5, 'single', '[]')`).run(TENANT);
    const gid = Number(r.lastInsertRowid);
    const o = svc.createOrder({ customerId: TENANT, userId: 3002, items: [{ goodsId: gid, num: 1 }], deliveryMode: 'pickup' });
    createPayAndPaid(o);
    const oo = svc.getOrder(o.id);
    assert.equal(oo.status, 'done');
    assert.ok(oo.done_at);
  });

  test('发货/完成/退款：库存恢复与通知', () => {
    const o = svc.createOrder({ customerId: TENANT, userId: 3001, items: [{ goodsId: db.goodsId, num: 5 }], deliveryMode: 'pickup' });
    createPayAndPaid(o);
    const st = db.prepare('SELECT stock FROM goods WHERE id = ?').get(db.goodsId).stock;
    assert.equal(st, 93); // 100-2(测试4)-5(测试6)

    const s = svc.ship({ customerId: TENANT, orderId: o.id });
    assert.equal(s.status, 'shipped');
    assert.ok(s.shipped_at);
    const d = svc.done({ customerId: TENANT, orderId: o.id });
    assert.equal(d.status, 'done');

    const o2 = svc.createOrder({ customerId: TENANT, userId: 3001, items: [{ goodsId: db.goodsId, num: 3 }], deliveryMode: 'pickup' });
    createPayAndPaid(o2);
    const r = svc.refund({ customerId: TENANT, orderId: o2.id });
    assert.equal(r.status, 'refunded');
    assert.equal(db.prepare('SELECT stock FROM goods WHERE id = ?').get(db.goodsId).stock, 93); // 93-3+3
    const msg = db.prepare("SELECT * FROM card_message WHERE user_id = 3001 AND title LIKE '%退款%' ORDER BY id DESC LIMIT 1").get();
    assert.ok(msg, '退款通知应写入');
  });

  test('列表/状态筛选/租户隔离', () => {
    const lst = svc.listOrders({ customerId: TENANT, page: 1, pageSize: 10 });
    assert.ok(lst.total >= 4);
    assert.ok(lst.list[0].items, '明细应随列表返回');
    const paid = svc.listOrders({ customerId: TENANT, status: 'paid' });
    assert.ok(paid.list.every(o => o.status === 'paid'));
    const other = svc.listOrders({ customerId: 99999 });
    assert.equal(other.total, 0);
    assert.equal(svc.getOrderByTenant(TENANT, lst.list[0].id).id, lst.list[0].id);
    assert.equal(svc.getOrderByTenant(99999, lst.list[0].id), null);
  });

  test('类型差异化字段：phone_required/card_key_id 写入与回读（对齐菜鸟云三类型表单）', () => {
    const cols = db.prepare('PRAGMA table_info(goods)').all().map(c => c.name);
    assert.ok(cols.includes('phone_required'), 'goods 表应含 phone_required 列');
    assert.ok(cols.includes('card_key_id'), 'goods 表应含 card_key_id 列');
    const r = db.prepare(
      `INSERT INTO goods (customer_id, title, type, status, stock, price, spec_mode, images, phone_required, card_key_id)
       VALUES (?, '卡密差异化测试', 'carmi', 'sell', 0, 88, 'single', '[]', 1, 520)`
    ).run(TENANT);
    const row = db.prepare('SELECT phone_required, card_key_id, type FROM goods WHERE id = ?').get(Number(r.lastInsertRowid));
    assert.equal(row.phone_required, 1, '卡密手机号必填应落库');
    assert.equal(row.card_key_id, 520, '卡密库 ID 应落库');
    assert.equal(row.type, 'carmi');
    // 虚拟商品默认 phone_required=0（不展示）
    const v = db.prepare(
      `INSERT INTO goods (customer_id, title, type, status, stock, price, spec_mode, images) VALUES (?, '虚拟差异化测试', 'virtual', 'sell', 10, 66, 'single', '[]')`
    ).run(TENANT);
    const vrow = db.prepare('SELECT phone_required, card_key_id FROM goods WHERE id = ?').get(Number(v.lastInsertRowid));
    assert.equal(vrow.phone_required, 0);
    assert.equal(vrow.card_key_id, null);
  });
});
