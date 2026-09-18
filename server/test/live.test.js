/**
 * 小程序直播（1:1 菜鸟云「微信直播」）测试：应用注册/授权/直播列表CRUD/同步/商品审核流转
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, hashPassword } from '../src/db.js';
import { createApp } from '../src/app.js';

let tmpDir, db, app, server, token;

function mockWechatLive() {
  return {
    createRoom: async () => ({ roomId: 777001 }),
    deleteRoom: async () => ({ ok: true }),
    fetchRooms: async () => [
      { roomid: 777001, name: '测试直播间A', anchor_name: '主播甲', start_time: 1767227400, end_time: 1767231000, live_status: '未开始' },
      { roomid: 777002, name: '测试直播间B', anchor_name: '主播乙', start_time: 1767227400, end_time: 1767231000, live_status: '直播中' },
    ],
    fetchApprovedGoods: async () => [
      { goodsId: 9001, name: '直播专享商品', price: 19.9, page_path: 'pages/showProMore/showProMore?id=9001', thumbnail: 'https://wx.example.com/thumb1.png' },
    ],
    submitGoodsAudit: async () => ({ auditId: 'WX_AUDIT_9001' }),
    fetchGoodsAuditStatus: async () => ({ statuses: [] }),
    getAccessToken: async () => 'mock-token',
  };
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-test-'));
  const prev = { ...config };
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
  // demo 租户（customer_id=1，solutions 含 demo → 自动纳入全部应用含 live）；tenant2（customer_id=2 仅 card）
  const { hash, salt } = hashPassword('admin123');
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('admin','13800000000',?,?,'admin','active',NULL)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('tenant1','13800000001',?,?,'tenant_admin','active',1)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('tenant2','13800000002',?,?,'tenant_admin','active',2)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (1, '一号客户', 'active', '[\"demo\",\"card\"]')").run();
  db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (2, '二号客户', 'active', '[\"card\"]')").run();
  app = createApp({ db, deps: { wechatLive: mockWechatLive() } });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const login = await request(app).post('/api/auth/login').send({ username: 'tenant1', password: 'admin123' });
  token = login.body.token;
});

after(() => {
  try { server.close(); } catch {}
  try { db.close(); } catch {}
  try { fs.rmSync(tmpDir, { force: true }); } catch {}
});

test('应用注册：小程序直播应用存在、菜单3项、演示方案纳入', () => {
  const appRow = db.prepare("SELECT * FROM apps WHERE code = 'live'").get();
  assert.ok(appRow, 'live 应用应已注册');
  const menus = db.prepare('SELECT * FROM app_menus WHERE app_id = ?').all(appRow.id);
  assert.equal(menus.length, 3);
  assert.deepEqual(menus.map(m => m.key).sort(), ['live:audit', 'live:goods', 'live:list']);
  const demo = db.prepare("SELECT id FROM solutions WHERE code = 'demo'").get();
  const sa = db.prepare('SELECT * FROM solution_apps WHERE solution_id = ? AND app_id = ?').get(demo.id, appRow.id);
  assert.ok(sa, '演示方案应自动纳入 live 应用');
});

test('直播列表：创建（微信接口）→ 列表 → 编辑 → 删除', async () => {
  // 创建
  const create = await request(app).post('/api/customer/live/rooms').set('Authorization', `Bearer ${token}`).send({
    name: '测试直播间A',
    backgroundImg: '/uploads/bg.jpg',
    shareImg: '/uploads/share.jpg',
    coverImg: '/uploads/cover.jpg',
    startTime: '2026-11-01 19:00:00',
    endTime: '2026-11-01 20:30:00',
    anchorName: '主播甲',
    anchorWechat: 'wx_anchor_a',
    liveType: 'phone',
    likeEnabled: 1, shelfEnabled: 1, commentEnabled: 1,
    replayEnabled: 0, shareEnabled: 1, serviceEnabled: 0,
  });
  assert.equal(create.status, 200);
  assert.equal(create.body.ok, true);
  assert.equal(create.body.roomId, 777001);

  // 校验不通过：时间间隔不足
  const bad = await request(app).post('/api/customer/live/rooms').set('Authorization', `Bearer ${token}`).send({
    name: '测试直播间B', startTime: '2026-11-01 19:00:00', endTime: '2026-11-01 19:20:00', anchorName: '主播乙', anchorWechat: 'wx_b',
  });
  assert.equal(bad.status, 400);

  // 列表
  const list = await request(app).get('/api/customer/live/rooms').set('Authorization', `Bearer ${token}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.rows[0].name, '测试直播间A');

  // 编辑（含排序：1:1 菜鸟云编辑弹窗「排序 数字越大越靠前」）
  const id = list.body.rows[0].id;
  const edit = await request(app).put(`/api/customer/live/rooms/${id}`).set('Authorization', `Bearer ${token}`).send({
    name: '测试直播间A改', listDisplay: 0, recommend: 1, liveType: 'push', sort: 88,
  });
  assert.equal(edit.status, 200);
  const after = await request(app).get('/api/customer/live/rooms').set('Authorization', `Bearer ${token}`);
  const row = after.body.rows[0];
  assert.equal(row.name, '测试直播间A改');
  assert.equal(row.list_display, 0);
  assert.equal(row.recommend, 1);
  assert.equal(row.live_type, 'push');
  assert.equal(row.sort, 88);

  // 复制链接
  const link = await request(app).get(`/api/customer/live/rooms/${id}/link`).set('Authorization', `Bearer ${token}`);
  assert.equal(link.status, 200);
  assert.ok(link.body.link.includes('roomId=777001'));

  // 删除
  const del = await request(app).delete(`/api/customer/live/rooms/${id}`).set('Authorization', `Bearer ${token}`);
  assert.equal(del.status, 200);
  const afterDel = await request(app).get('/api/customer/live/rooms').set('Authorization', `Bearer ${token}`);
  assert.equal(afterDel.body.total, 0);
});

test('同步直播列表：调微信拉取并写入本地', async () => {
  const sync = await request(app).post('/api/customer/live/rooms/sync').set('Authorization', `Bearer ${token}`);
  assert.equal(sync.status, 200);
  assert.equal(sync.body.ok, true);
  assert.equal(sync.body.added, 2);
  const list = await request(app).get('/api/customer/live/rooms').set('Authorization', `Bearer ${token}`);
  assert.equal(list.body.total, 2);
});

test('商品审核流转：本地商品提交审核 → 商品库 → 更新/删除/重审', async () => {
  // 准备本地商品
  db.prepare("INSERT OR IGNORE INTO goods (customer_id, title, price, status, type, top_type) VALUES (?, '直播测试商品1', 19.9, 'sell', 'normal', 1)").run(1);
  const goods = db.prepare("SELECT id FROM goods WHERE customer_id = ? AND title = '直播测试商品1'").get(1);

  // 商品库初始为空
  const empty = await request(app).get('/api/customer/live/goods').set('Authorization', `Bearer ${token}`);
  assert.equal(empty.body.total, 0);

  // 本地待审核列表含该商品
  const src = await request(app).get('/api/customer/live/goods/source').set('Authorization', `Bearer ${token}`);
  assert.ok(src.body.rows.some(r => r.goods_id === goods.id), '本地商品应出现在待审核列表');
  assert.equal(src.body.rows.find(r => r.goods_id === goods.id).audit_status, 'pending');

  // 提交审核（调微信 submitGoodsAudit → 落库 audit_id）
  const audit = await request(app).post(`/api/customer/live/goods/${goods.id}/audit`).set('Authorization', `Bearer ${token}`);
  assert.equal(audit.status, 200);
  const afterAudit = db.prepare('SELECT * FROM live_goods WHERE customer_id = ? AND goods_id = ?').get(1, goods.id);
  assert.ok(afterAudit, '提交审核后应落库 live_goods');
  assert.equal(afterAudit.audit_id, 'WX_AUDIT_9001', '应保存微信审核单号');

  // 重复提交拒绝（pending）
  const dup = await request(app).post(`/api/customer/live/goods/${goods.id}/audit`).set('Authorization', `Bearer ${token}`);
  assert.equal(dup.status, 400);

  // 手动置为审核通过 → 进入商品库
  db.prepare("UPDATE live_goods SET audit_status='approved' WHERE customer_id=? AND goods_id=?").run(1, goods.id);
  const goodsList = await request(app).get('/api/customer/live/goods').set('Authorization', `Bearer ${token}`);
  assert.equal(goodsList.body.total, 1);
  assert.equal(goodsList.body.rows[0].name, '直播测试商品1');
  assert.equal(goodsList.body.rows[0].priceYuan, 19.9);

  // 更新商品（价格）
  const liveId = goodsList.body.rows[0].id;
  const upd = await request(app).put(`/api/customer/live/goods/${liveId}`).set('Authorization', `Bearer ${token}`).send({ price: 29.9 });
  assert.equal(upd.status, 200);
  const goodsList2 = await request(app).get('/api/customer/live/goods').set('Authorization', `Bearer ${token}`);
  assert.equal(goodsList2.body.rows[0].priceYuan, 29.9);

  // 删除商品
  const del = await request(app).delete(`/api/customer/live/goods/${liveId}`).set('Authorization', `Bearer ${token}`);
  assert.equal(del.status, 200);
  const goodsList3 = await request(app).get('/api/customer/live/goods').set('Authorization', `Bearer ${token}`);
  assert.equal(goodsList3.body.total, 0);
});

test('同步商品列表：调微信拉取已审核商品写入商品库', async () => {
  const sync = await request(app).post('/api/customer/live/goods/sync').set('Authorization', `Bearer ${token}`);
  assert.equal(sync.status, 200);
  assert.equal(sync.body.ok, true);
  const list = await request(app).get('/api/customer/live/goods').set('Authorization', `Bearer ${token}`);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.rows[0].name, '直播专享商品');
  assert.equal(list.body.rows[0].thumb, 'https://wx.example.com/thumb1.png', '同步应保存微信商品缩略图');
});

test('权限：未开通 live 应用的租户 403', async () => {
  // tenant2（customer_id=2，仅 card 方案，未开通 live）
  const login2 = await request(app).post('/api/auth/login').send({ username: 'tenant2', password: 'admin123' });
  const r = await request(app).get('/api/customer/live/rooms').set('Authorization', `Bearer ${login2.body.token}`);
  assert.equal(r.status, 403);
  assert.ok(r.body.error.includes('小程序直播'));
});
