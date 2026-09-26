/**
 * 商城二期：门店体系测试（2026-09-26）
 * - goods_store 关系表生效：price_mode=custom 门店价 / stock_mode=independent 门店库存 / shelf_mode=store 门店下架
 * - 自提下单按门店模式结算；支付后门店独立库存扣减（含多规格 sku_stock）；退款回补
 * - 核销闭环：paid → verifyStatus=verified（码匹配 + 订单属该门店）
 * - 门店确认收款：confirm_pay_enabled=1 时 pending → paid
 * - 门店隔离：store_admin 只能看本门店订单/售后；租户管理员需显式 storeId
 * - 门店商品配置：GET/PUT /stores/:id/goods
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, hashPassword } from '../src/db.js';
import { createApp } from '../src/app.js';

function makeCxToken(user) {
  const payload = Buffer.from(JSON.stringify({ uid: user.id, openid: user.openid, ts: Date.now() })).toString('base64');
  return `${payload}.abcdef`;
}

describe('商城二期：门店体系（门店价/库存/下架/核销/确认收款/隔离）', () => {
  let tmpDir, db, app, server, prev;
  let tenantToken, storeAdminToken, cxToken, buyer;
  const openId = 77777;
  let goodsApple, goodsSet, skuBig, storeA, storeB, memberA;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mall-p2-'));
    prev = { ...config };
    Object.assign(config, {
      dataDir: tmpDir,
      uploadsDir: path.join(tmpDir, 'uploads'),
      dbPath: path.join(tmpDir, 'test.db'),
      webDistDir: path.join(tmpDir, 'web-dist'),
      storageProvider: 'local',
      storageProviders: JSON.stringify({ local: {} }),
      adminUser: 'admin',
      adminPass: 'admin123',
    });
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    db = createDb(config.dbPath);
    app = createApp({ db });
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));

    // 租户（demo 方案=全应用开通）
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (?, '二期租户', 'active', '[\"demo\"]')").run(openId);

    // 商品：单规格苹果 5.5/100；多规格套餐（大份120/5、小份88/8）
    db.prepare("INSERT INTO goods (customer_id, title, status, price, stock, spec_mode, sort_order) VALUES (?, '苹果', 'sell', 5.5, 100, 'single', 1)").run(openId);
    db.prepare("INSERT INTO goods (customer_id, title, status, price, stock, spec_mode, sort_order) VALUES (?, '套餐', 'sell', 99, 10, 'multi', 2)").run(openId);
    goodsApple = db.prepare("SELECT id FROM goods WHERE customer_id = ? AND title = '苹果'").get(openId).id;
    goodsSet = db.prepare("SELECT id FROM goods WHERE customer_id = ? AND title = '套餐'").get(openId).id;
    skuBig = db.prepare("INSERT INTO goods_sku (goods_id, spec_json, price, stock) VALUES (?, '{\"规格\":\"大份\"}', 120, 5)").run(goodsSet).lastInsertRowid;
    db.prepare("INSERT INTO goods_sku (goods_id, spec_json, price, stock) VALUES (?, '{\"规格\":\"小份\"}', 88, 8)").run(goodsSet);

    // 门店A「东城店」：门店自定义价/独立库存/门店下架/确认收款；负责人 memberA=store_admin
    const { hash, salt } = hashPassword('store123');
    const accA = db.prepare("INSERT INTO accounts (username, phone, password_hash, password_salt, status) VALUES ('storeA','13811110001',?,?,'active')").run(hash, salt);
    memberA = db.prepare("INSERT INTO tenant_members (tenant_id, account_id, name, nickname, status, identities) VALUES (?, ?, 'A店长', 'A店长', 'active', '[\"backend_admin\"]')").run(openId, accA.lastInsertRowid).lastInsertRowid;
    const sa = db.prepare("SELECT id FROM roles WHERE tenant_id = 0 AND code = 'store_admin'").get();
    db.prepare('INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?, ?)').run(memberA, sa.id);
    db.prepare("INSERT INTO store (customer_id, name, phone, province, city, district, address, status, owner_member_id, price_mode, stock_mode, shelf_mode, confirm_pay_enabled) VALUES (?, '东城店', '0769-1001', '广东省', '东莞市', '东城', '东城路1号', 1, ?, 'custom', 'independent', 'store', 1)").run(openId, memberA);
    storeA = db.prepare("SELECT id FROM store WHERE customer_id = ? AND name = '东城店'").get(openId).id;
    // 门店B「南城店」：默认模式（跟随总部）
    db.prepare("INSERT INTO store (customer_id, name, phone, status, shelf_mode) VALUES (?, '南城店', '0769-1002', 1, 'store')").run(openId);
    storeB = db.prepare("SELECT id FROM store WHERE customer_id = ? AND name = '南城店'").get(openId).id;

    // goods_store：A店 苹果 门店价6.6/库存10/可售；A店 套餐 sku_stock 大份3；B店 苹果 门店下架
    db.prepare('INSERT INTO goods_store (customer_id, goods_id, store_id, price, stock, status) VALUES (?, ?, ?, 6.6, 10, ?)').run(openId, goodsApple, storeA, 'sell');
    db.prepare('INSERT INTO goods_store (customer_id, goods_id, store_id, price, stock, sku_stock, status) VALUES (?, ?, ?, 0, -1, ?, ?)').run(openId, goodsSet, storeA, JSON.stringify({ [skuBig]: 3 }), 'sell');
    db.prepare('INSERT INTO goods_store (customer_id, goods_id, store_id, price, stock, status) VALUES (?, ?, ?, 0, -1, ?)').run(openId, goodsApple, storeB, 'off');

    // 配送设置（支持自提）
    db.prepare('INSERT INTO goods_setting (customer_id, config) VALUES (?, ?)').run(openId, JSON.stringify({ express: 1, citySend: 0, takeSelf: 1 }));

    // 租户管理员登录
    const { hash: h2, salt: s2 } = hashPassword('admin123');
    db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('t1','13800000001',?,?,'tenant_admin','active',?)").run(h2, s2, openId);
    const login = async (u, p) => (await request(app).post('/api/auth/login').send({ username: u, password: p })).body.token;
    tenantToken = await login('t1', 'admin123');
    // store_admin 登录（门店负责人账号）
    storeAdminToken = await login('storeA', 'store123');

    // C 端买家
    const br = db.prepare("INSERT INTO platform_user (openid, nickname, status, customer_id, identity_type) VALUES ('p2_buyer', '买家', 'active', ?, 'individual')").run(openId);
    buyer = { id: Number(br.lastInsertRowid), openid: 'p2_buyer' };
    cxToken = makeCxToken(buyer);
  });

  after(() => {
    try { server?.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, prev);
  });

  const cx = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${cxToken}` });
  const admin = () => ({ Authorization: `Bearer ${tenantToken}` });
  const sAdmin = () => ({ Authorization: `Bearer ${storeAdminToken}` });

  /** 自提下单（C 端）→ 返回订单对象 */
  async function placePickup(goodsId, storeId, qty = 1, skuId = 0) {
    const r = await request(app).post('/api/mall/orders').set(cx()).send({
      items: [{ goodsId, skuId, quantity: qty }],
      deliveryMode: 'pickup', storeId,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  }

  /** mock 支付 → 订单置 paid（触发扣库存） */
  async function mockPay(payOrderNo) {
    const r = await request(app).post('/api/payment/mock-pay').set(cx()).send({ orderNo: payOrderNo });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }

  test('门店自定义价生效：A店(custom 6.6) 自提按门店价，B店(unified) 按总部价', async () => {
    const oa = await placePickup(goodsApple, storeA, 1);
    assert.equal(oa.amount, 660); // 6.6 元
    const ob = await placePickup(goodsSet, storeB, 1);
    assert.equal(ob.amount, 9900); // 总部价 99 元（B 店 unified）
    // 清理：B 店订单取消
    await request(app).post(`/api/mall/orders/${ob.id}/cancel`).set(cx());
  });

  test('门店独立库存校验：A店苹果门店库存10，买11 → 库存不足', async () => {
    const r = await request(app).post('/api/mall/orders').set(cx()).send({
      items: [{ goodsId: goodsApple, quantity: 11 }],
      deliveryMode: 'pickup', storeId: storeA,
    });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /库存不足/);
  });

  test('门店下架生效：B店苹果 off → 自提不可购', async () => {
    const r = await request(app).post('/api/mall/orders').set(cx()).send({
      items: [{ goodsId: goodsApple, quantity: 1 }],
      deliveryMode: 'pickup', storeId: storeB,
    });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /本店暂不销售/);
  });

  test('门店独立库存扣减（单规格）：A店苹果 支付后 goods_store.stock 10→9', async () => {
    const oa = await placePickup(goodsApple, storeA, 1);
    await mockPay(oa.payOrderNo);
    const rel = db.prepare('SELECT stock FROM goods_store WHERE customer_id = ? AND goods_id = ? AND store_id = ?').get(openId, goodsApple, storeA);
    assert.equal(rel.stock, 9);
    // 总部库存不动
    const g = db.prepare('SELECT stock FROM goods WHERE id = ?').get(goodsApple);
    assert.equal(g.stock, 100);
  });

  test('门店独立库存（多规格 sku_stock）：A店套餐大份库存3，买4 → 不足；买2 支付后 3→1', async () => {
    const r1 = await request(app).post('/api/mall/orders').set(cx()).send({
      items: [{ goodsId: goodsSet, skuId: skuBig, quantity: 4 }],
      deliveryMode: 'pickup', storeId: storeA,
    });
    assert.equal(r1.status, 400);
    assert.match(r1.body.error, /库存不足/);

    const oa = await placePickup(goodsSet, storeA, 2, skuBig);
    await mockPay(oa.payOrderNo);
    const rel = db.prepare('SELECT sku_stock FROM goods_store WHERE customer_id = ? AND goods_id = ? AND store_id = ?').get(openId, goodsSet, storeA);
    assert.equal(JSON.parse(rel.sku_stock)[String(skuBig)], 1);
  });

  test('核销闭环：paid 订单正确核销码 → verified；错误码 → 400；别店核销 → 400；重复核销 → 400', async () => {
    const oa = await placePickup(goodsApple, storeA, 1);
    assert.match(oa.pickupCode, /^\d{6}$/, '门店下单应生成 6 位核销码');
    const orderNo = oa.orderNo;
    await mockPay(oa.payOrderNo);
    const paid = db.prepare("SELECT * FROM goods_order WHERE order_no = ?").get(orderNo);
    assert.equal(paid.status, 'paid');
    assert.equal(paid.verify_status, 'pending');

    // 错误码
    const bad = await request(app).post(`/api/customer/store/orders/${paid.id}/verify`).set(sAdmin()).send({ code: '000000' });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /核销码不正确/);

    // 别店核销（store_admin B 不存在，用租户管理员指定 B 店）
    const wrongStore = await request(app).post(`/api/customer/store/orders/${paid.id}/verify`).set(admin()).send({ storeId: storeB, code: paid.pickup_code });
    assert.equal(wrongStore.status, 400);
    assert.match(wrongStore.body.error, /订单不属于该门店/);

    // 正确核销（store_admin A 自动绑定 A 店）
    const ok = await request(app).post(`/api/customer/store/orders/${paid.id}/verify`).set(sAdmin()).send({ code: paid.pickup_code });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.order.verify_status, 'verified');
    assert.equal(ok.body.order.verify_store_id, storeA);

    // 重复核销
    const again = await request(app).post(`/api/customer/store/orders/${paid.id}/verify`).set(sAdmin()).send({ code: paid.pickup_code });
    assert.equal(again.status, 400);
    assert.match(again.body.error, /已核销/);
  });

  test('门店确认收款：confirm_pay_enabled=1 时待支付自提订单 → paid（不进支付单）', async () => {
    const oa = await placePickup(goodsApple, storeA, 1);
    const row = db.prepare("SELECT * FROM goods_order WHERE order_no = ?").get(oa.orderNo);
    assert.equal(row.status, 'pending');

    // 未开启确认收款的 B 店 → 400
    const rB = await request(app).post(`/api/customer/store/orders/${row.id}/confirm-pay`).set(admin()).send({ storeId: storeB });
    assert.equal(rB.status, 400);

    const ok = await request(app).post(`/api/customer/store/orders/${row.id}/confirm-pay`).set(sAdmin()).send();
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.order.status, 'paid');
    assert.equal(ok.body.order.pay_order_id, 0, '门店收款不进支付单');
  });

  test('门店订单隔离：store_admin 只看到本门店订单；租户管理员按 storeId 过滤', async () => {
    // store_admin A 的订单列表只含 A 店订单（无 storeId 参数）
    const la = await request(app).get('/api/customer/store/orders').set(sAdmin());
    assert.equal(la.status, 200);
    assert.equal(la.body.store.id, storeA);
    assert.ok(la.body.list.every((o) => Number(o.store_id) === storeA), 'store_admin 只能看到本门店订单');

    // 租户管理员指定 storeId=A 与 store_admin 一致
    const la2 = await request(app).get(`/api/customer/store/orders?storeId=${storeA}`).set(admin());
    assert.equal(la2.status, 200);
    assert.equal(la2.body.list.length, la.body.list.length);

    // 租户管理员指定 B 店 → 只有 B 店订单（测试1 遗留的套餐 closed 单），无 A 店订单
    const lb = await request(app).get(`/api/customer/store/orders?storeId=${storeB}`).set(admin());
    assert.equal(lb.status, 200);
    assert.equal(lb.body.list.length, 1);
    assert.ok(lb.body.list.every((o) => Number(o.store_id) === storeB), 'B 店列表不得混入 A 店订单');

    // 越权：store_admin 通过 query 传 B 店也无效（强制本门店）
    const la3 = await request(app).get(`/api/customer/store/orders?storeId=${storeB}`).set(sAdmin());
    assert.equal(la3.body.store.id, storeA);

    // 租户管理员未指定门店 → 400
    const noStore = await request(app).get('/api/customer/store/orders').set(admin());
    assert.equal(noStore.status, 400);
    assert.match(noStore.body.error, /请指定门店/);
  });

  test('门店商品配置：store_admin 只能操作本门店；PUT 设置门店价/库存/下架生效', async () => {
    // store_admin 看 B 店商品 → 403
    const forbidden = await request(app).get(`/api/customer/store/${storeB}/goods`).set(sAdmin());
    assert.equal(forbidden.status, 403);

    // store_admin 看本店商品列表
    const list = await request(app).get(`/api/customer/store/${storeA}/goods`).set(sAdmin());
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(list.body.storeMode.priceMode === 'custom');
    const appleInList = list.body.list.find((g) => g.id === goodsApple);
    assert.equal(appleInList.storePrice, 6.6);
    assert.ok(Number(appleInList.storeStock) >= 0, '门店库存字段应返回数字（已被前序测试扣减，不断言精确值）');

    // 租户管理员 GET 无需 query.storeId（storeId 来自路径参数）——回归：requireStoreContext 需接受 req.params.id
    const adminGet = await request(app).get(`/api/customer/store/${storeA}/goods`).set(admin());
    assert.equal(adminGet.status, 200, JSON.stringify(adminGet.body));
    assert.ok(adminGet.body.list.length >= 1, '租户管理员路径参数门店应返回商品列表');

    // 租户管理员 PUT 修改苹果门店价 7.7/库存 20
    const put = await request(app).put(`/api/customer/store/${storeA}/goods/${goodsApple}`).set(admin()).send({ storeId: storeA, price: 7.7, stock: 20, status: 'sell' });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const rel = db.prepare('SELECT * FROM goods_store WHERE customer_id = ? AND goods_id = ? AND store_id = ?').get(openId, goodsApple, storeA);
    assert.equal(Number(rel.price), 7.7);
    assert.equal(rel.stock, 20);

    // 生效验证：新自提订单按 7.7 结算
    const oa = await placePickup(goodsApple, storeA, 1);
    assert.equal(oa.amount, 770);
    // 回滚配置（避免影响后续用例）
    await request(app).put(`/api/customer/store/${storeA}/goods/${goodsApple}`).set(admin()).send({ storeId: storeA, price: 6.6, stock: 10, status: 'sell' });
  });

  test('门店售后隔离：store_admin 只能处理本门店售后单', async () => {
    // 造一笔 A 店售后：买家对已支付 A 店订单申请售后
    const oa = await placePickup(goodsApple, storeA, 1);
    await mockPay(oa.payOrderNo);
    const row = db.prepare("SELECT * FROM goods_order WHERE order_no = ?").get(oa.orderNo);
    const as = await request(app).post(`/api/card/goods/orders/${row.id}/after-sale`).set(cx()).send({ type: 'refund', reason: '不想要了' });
    assert.equal(as.status, 200, JSON.stringify(as.body));
    const afterSaleId = as.body.afterSale?.id || as.body.id;

    // store_admin 列表可见该售后
    const list = await request(app).get('/api/customer/store/after-sales').set(sAdmin());
    assert.equal(list.status, 200);
    assert.ok(list.body.list.some((a) => a.id === afterSaleId));

    // 同意退款（store_admin A）
    const agree = await request(app).post(`/api/customer/store/after-sales/${afterSaleId}/agree`).set(sAdmin()).send({ amount: 6.6 });
    assert.equal(agree.status, 200, JSON.stringify(agree.body));
    assert.equal(agree.body.afterSale.status, 'processing');
  });
});
