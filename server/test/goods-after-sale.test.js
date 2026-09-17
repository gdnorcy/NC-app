import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';
import { issueToken } from '../src/auth.js';
import { randomBytes } from 'node:crypto';

let app, db, t1, t2, buyer;

before(() => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goods-aftersale-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });
  // platform_user 必须先于 users 写入（Node sqlite 环境限制：其后 SELECT .get() 才稳定）
  db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, phone, status, customer_id, identity_type) VALUES (1, 'ou_as1', '买家甲', '13800000001', 'active', 1, 'individual')").run();
  // C 端 token 为自定义格式（同 card.js wxLogin）：base64({uid,openid,ts}) + '.' + hex
  buyer = Buffer.from(JSON.stringify({ uid: 1, openid: 'ou_as1', ts: Date.now() })).toString('base64') + '.' + randomBytes(8).toString('hex');
  const mk = (u, p, cid) => {
    const { hash, salt } = hashPassword('123456');
    db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,'tenant_admin','active',?)").run(u, p, hash, salt, cid);
    return issueToken(db.prepare('SELECT * FROM users WHERE username = ?').get(u));
  };
  t1 = mk('as_t1', '13800003001', 1);
  t2 = mk('as_t2', '13800003002', 2);
  // t1 开通 demo 方案（自动纳入 goods 应用），t2 不开通
  db.prepare("UPDATE projects SET solutions = '[\"demo\"]' WHERE id = 1").run();
  db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (2, '租户2', 'active', '[]')").run();
  db.prepare("UPDATE projects SET solutions = '[]' WHERE id = 2").run();
});

const auth = (t) => ({ Authorization: `Bearer ${t}` });

test('售后订单：申请/列表/同意/拒绝/退款联动/导出/隔离', async () => {
  // 开通商品应用（demo 方案自动纳入 goods）
  // 造已支付订单
  const ins = db.prepare(
    "INSERT INTO goods_order (order_no, customer_id, user_id, status, total_amount, freight, pay_amount, delivery_mode, receiver_name, receiver_phone, receiver_address, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
  );
  const o1 = Number(ins.run('GO202609170001', 1, 1, 'paid', 10000, 0, 10000, 'express', '张三', '13800000001', '东莞', 'goods').lastInsertRowid);
  const o2 = Number(ins.run('GO202609170002', 1, 1, 'shipped', 5000, 0, 5000, 'pickup', '', '', '', 'goods').lastInsertRowid);
  db.prepare("INSERT INTO goods_order_item (order_id, goods_id, title, thumb, price, num, goods_type) VALUES (?,?,?,?,?,?,?)").run(o1, 1, '测试商品A', '', 10000, 1, 'normal');
  db.prepare("INSERT INTO goods_order_item (order_id, goods_id, title, thumb, price, num, goods_type) VALUES (?,?,?,?,?,?,?)").run(o2, 1, '测试商品B', '', 5000, 1, 'normal');

  // C 端申请售后
  const c1 = await request(app).post(`/api/card/goods/orders/${o1}/after-sale`).set(auth(buyer)).send({ type: 'refund', reason: '不想要了' });
  assert.equal(c1.status, 200);
  assert.equal(c1.body.status, 'pending');
  assert.equal(c1.body.amountY, '100.00', '默认全额');
  const asId = c1.body.id;
  // 重复申请拒绝
  const dup = await request(app).post(`/api/card/goods/orders/${o1}/after-sale`).set(auth(buyer)).send({ type: 'return' });
  assert.equal(dup.status, 400);
  assert.match(dup.body.error, /已有售后/);
  // 未授权租户 403
  const noAuth = await request(app).get('/api/customer/goods/after-sales').set(auth(t2));
  assert.equal(noAuth.status, 403);

  // 管理端列表
  const l0 = await request(app).get('/api/customer/goods/after-sales').set(auth(t1));
  assert.equal(l0.status, 200);
  assert.equal(l0.body.total, 1);
  assert.equal(l0.body.list[0].goods_desc, '测试商品A×1');
  // 关键词筛选
  const kw = await request(app).get('/api/customer/goods/after-sales?keyword=测试商品B').set(auth(t1));
  assert.equal(kw.body.total, 0);
  // 同意：金额超限拒绝
  const over = await request(app).post(`/api/customer/goods/after-sales/${asId}/agree`).set(auth(t1)).send({ amount: 200 });
  assert.equal(over.status, 400);
  assert.match(over.body.error, /最大可退款/);
  // 同意成功 → 处理中
  const ag = await request(app).post(`/api/customer/goods/after-sales/${asId}/agree`).set(auth(t1)).send({ amount: 80 });
  assert.equal(ag.status, 200);
  assert.equal(ag.body.status, 'processing');
  assert.equal(ag.body.amountY, '80.00');
  // 处理中不可再同意
  const ag2 = await request(app).post(`/api/customer/goods/after-sales/${asId}/agree`).set(auth(t1)).send({ amount: 80 });
  assert.equal(ag2.status, 400);

  // 订单退款 → 售后单联动退款完成
  await request(app).post(`/api/customer/goods/orders/${o1}/refund`).set(auth(t1));
  const after = await request(app).get('/api/customer/goods/after-sales?status=refunded').set(auth(t1));
  assert.equal(after.body.total, 1);

  // 拒绝分支：第二单申请 → 拒绝（原因必填）
  const c2 = await request(app).post(`/api/card/goods/orders/${o2}/after-sale`).set(auth(buyer)).send({ type: 'return', reason: '商品破损' });
  const asId2 = c2.body.id;
  const r0 = await request(app).post(`/api/customer/goods/after-sales/${asId2}/refuse`).set(auth(t1)).send({ reason: '' });
  assert.equal(r0.status, 400);
  const r1 = await request(app).post(`/api/customer/goods/after-sales/${asId2}/refuse`).set(auth(t1)).send({ reason: '影响二次销售' });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.status, 'cancelled');
  assert.equal(r1.body.refuse_reason, '影响二次销售');
  const cancelled = await request(app).get('/api/customer/goods/after-sales?status=cancelled').set(auth(t1));
  assert.equal(cancelled.body.total, 1);

  // 导出 CSV
  const ex = await request(app).get('/api/customer/goods/after-sales/export').set(auth(t1));
  assert.equal(ex.status, 200);
  assert.ok(ex.text.startsWith('\uFEFF'));
  assert.match(ex.text, /售后单号/);
  assert.match(ex.text, /影响二次销售/);
});
