import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';

/**
 * 人脉集市三方案（A/B/C）+ 我的名片增强版：后端支撑
 * C1 集市设置支持 style(A/B/C)/notice 读写
 * C2 集市列表：is_new 7天标记 / need_tags 供需标签返回 / need 筛选
 * C3 我的集市状态 my-status + 我的看板 my-stats
 * C4 总后台 config.market 授权同步 card_market_settings（类似模板）
 */
let app, db, server, tmpDir, t1Token, adminToken, memberToken;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkt-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  db = createDb(config.dbPath);
  app = createApp({ db });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));

  const { hash, salt } = hashPassword('admin123');
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('admin','13800000000',?,?,'admin','active',NULL)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('tenant1','13800000001',?,?,'tenant_admin','active',1)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions, config) VALUES (1, '一号客户', 'active', '[\"card\"]', '{}')").run();

  // member1：不自带id（users 表已被 createDb 预置 admin，显式 id 会与自增序列冲突）
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('member1', '13800000003', ?, ?, 'tenant_member', 'active', 1)").run(hash, salt);
  const memberUserId = db.prepare("SELECT id FROM users WHERE username = 'member1'").get().id;
  // 入驻个人 u1（有供需标签）+ u2（普通）+ u3（租户成员本人，用于我的状态/看板）
  db.prepare("INSERT OR IGNORE INTO tenant_individuals (id, customer_id, user_id, name, phone) VALUES (1, 1, 1, '林平', '13811111111')").run();
  db.prepare("INSERT OR IGNORE INTO tenant_individuals (id, customer_id, user_id, name, phone) VALUES (2, 1, 2, '陈志强', '13822222222')").run();
  db.prepare(`INSERT OR IGNORE INTO tenant_individuals (id, customer_id, user_id, name, phone) VALUES (3, 1, ${memberUserId}, '黄志明', '13833333333')`).run();
  // 名片（u1 有供需：找渠道+求合作）
  db.prepare("INSERT OR IGNORE INTO card_profile (id, user_id, name, position, company, business_field, need_tags) VALUES (1, 1, '林平', '副会长/秘书长', '东莞市揭阳商会', '商会服务', '[\"找渠道\",\"求合作\"]')").run();
  db.prepare("INSERT OR IGNORE INTO card_profile (id, user_id, name, position, company, business_field) VALUES (2, 2, '陈志强', '董事长', '东莞XX机械', '精密机械')").run();
  db.prepare(`INSERT OR IGNORE INTO card_profile (id, user_id, name, position, company, business_field) VALUES (3, ${memberUserId}, '黄志明', '经理', '东莞XX贸易', '外贸')`).run();
  // 集市上架：u1 置顶 + 今天上架（NEW）；u2 普通
  db.prepare("INSERT OR IGNORE INTO card_market_items (id, customer_id, subject_type, subject_id, user_id, audit_status, is_top) VALUES (1, 1, 'individual', 1, 1, 'approved', 1)").run();
  db.prepare("INSERT OR IGNORE INTO card_market_items (id, customer_id, subject_type, subject_id, user_id, audit_status, is_top) VALUES (2, 1, 'individual', 2, 2, 'approved', 0)").run();
  db.prepare(`INSERT OR IGNORE INTO card_market_items (id, customer_id, subject_type, subject_id, user_id, audit_status, is_top) VALUES (3, 1, 'individual', 3, ${memberUserId}, 'approved', 0)`).run();
  // 集市设置：默认 A
  db.prepare("INSERT OR IGNORE INTO card_market_settings (customer_id, enabled, style, notice) VALUES (1, 1, 'A', '')").run();

  // D 组：真实 platform_user + card_token 链路（与 C 端一致）
  db.prepare("INSERT OR IGNORE INTO platform_user (id, customer_id, nickname, avatar, status) VALUES (101, 1, '林平', '', 'active')").run();
  db.prepare("INSERT OR IGNORE INTO platform_user (id, customer_id, nickname, avatar, status) VALUES (102, 1, '陈志强', '', 'active')").run();
  db.prepare("INSERT OR IGNORE INTO platform_user (id, customer_id, nickname, avatar, status) VALUES (103, 1, '黄志明', '', 'active')").run();
  db.prepare("INSERT OR IGNORE INTO tenant_individuals (id, customer_id, user_id, name, phone) VALUES (101, 1, 101, '林平', '13811111111')").run();
  db.prepare("INSERT OR IGNORE INTO tenant_individuals (id, customer_id, user_id, name, phone) VALUES (102, 1, 102, '陈志强', '13822222222')").run();
  db.prepare("INSERT OR IGNORE INTO tenant_individuals (id, customer_id, user_id, name, phone) VALUES (103, 1, 103, '黄志明', '13833333333')").run();
  db.prepare("INSERT OR IGNORE INTO card_profile (id, user_id, name, position, company, business_field) VALUES (101, 101, '林平', '副会长/秘书长', '东莞市揭阳商会', '商会服务')").run();
  db.prepare("INSERT OR IGNORE INTO card_profile (id, user_id, name, position, company, business_field) VALUES (102, 102, '陈志强', '董事长', '东莞XX机械', '精密机械')").run();
  db.prepare("INSERT OR IGNORE INTO card_profile (id, user_id, name, position, company, business_field) VALUES (103, 103, '黄志明', '经理', '东莞XX贸易', '外贸')").run();

  const l1 = await request(app).post('/api/auth/login').send({ username: 'tenant1', password: 'admin123' });
  t1Token = l1.body.token;
  const l3 = await request(app).post('/api/auth/login').send({ username: 'member1', password: 'admin123' });
  memberToken = l3.body.token;
  const la = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  adminToken = la.body.token;
});

after(() => {
  try { server?.close(); } catch {}
  try { db.close(); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

const authT = (token) => ({ Authorization: `Bearer ${token}` });

test('C1 集市设置支持 style/notice 读写（付费风格需先购买）', async () => {
  const r = await request(app).get('/api/card-market/market/settings').set(authT(t1Token));
  assert.equal(r.status, 200);
  assert.equal(r.body.settings.style, 'A');
  assert.ok(Array.isArray(r.body.styles), '返回风格资产列表');
  const styleA = r.body.styles.find((s) => s.key === 'A');
  assert.equal(styleA.isDefault, true, 'A 默认风格');
  assert.equal(styleA.purchased, true, '默认风格视为已授权');

  // 未购买 B → 切换 403
  const denied = await request(app).put('/api/card-market/market/settings').set(authT(t1Token)).send({ style: 'B' });
  assert.equal(denied.status, 403, '未购买风格切换应被拒绝');

  // 购买 B → 切换成功
  const buy = await request(app).post('/api/card-market/market/assets/purchase').set(authT(t1Token)).send({ style: 'B' });
  assert.equal(buy.status, 200);
  assert.equal(buy.body.styles.find((s) => s.key === 'B').purchased, true, '购买后 purchased=true');

  const u = await request(app).put('/api/card-market/market/settings').set(authT(t1Token)).send({ style: 'B', notice: '欢迎入驻集市' });
  assert.equal(u.status, 200);
  const r2 = await request(app).get('/api/card-market/market/settings').set(authT(t1Token));
  assert.equal(r2.body.settings.style, 'B');
  assert.equal(r2.body.settings.notice, '欢迎入驻集市');
  // 还原为 A
  await request(app).put('/api/card-market/market/settings').set(authT(t1Token)).send({ style: 'A', notice: '' });
});

test('C2 集市列表：is_new / need_tags / need 筛选', async () => {
  const r = await request(app).get('/api/card-market/market/list').set(authT(t1Token));
  assert.equal(r.status, 200);
  const items = r.body.items;
  assert.ok(items.length >= 2);
  const lin = items.find((i) => i.subjectId === 1);
  assert.equal(lin.name, '林平');
  assert.ok(lin.isTop, '置顶生效');
  assert.ok(lin.isNew, '7天内上架标记 NEW');
  assert.ok(lin.needTags.includes('找渠道'), '返回供需标签');

  // need 筛选：找渠道 → 只有林平
  const rn = await request(app).get('/api/card-market/market/list?need=找渠道').set(authT(t1Token));
  assert.equal(rn.body.items.length, 1);
  assert.equal(rn.body.items[0].subjectId, 1);
  // need 筛选：求合作（无匹配）
  const rn2 = await request(app).get('/api/card-market/market/list?need=招合伙人').set(authT(t1Token));
  assert.equal(rn2.body.items.length, 0);
  // 行业筛选
  const ri = await request(app).get('/api/card-market/market/list?industry=精密机械').set(authT(t1Token));
  assert.equal(ri.body.items.length, 1);
  assert.equal(ri.body.items[0].subjectId, 2);
});

test('C3 我的集市状态 + 我的看板', async () => {
  const st = await request(app).get('/api/card-market/market/my-status').set(authT(memberToken));
  assert.equal(st.status, 200);
  const mine = st.body.items.find((i) => i.subjectId === 3);
  assert.ok(mine, '成员自己的上架条目可见');
  assert.equal(mine.auditStatus, 'approved');
  assert.equal(mine.isNew, true);

  const dash = await request(app).get('/api/card-market/market/my-stats').set(authT(memberToken));
  assert.equal(dash.status, 200);
  assert.ok('totalViews' in dash.body.stats);
  assert.ok('totalExchanges' in dash.body.stats);
  assert.ok('marketViews' in dash.body.stats);
});

test('C4 总后台 config.market 授权同步（类似模板）', async () => {
  // 总后台保存项目：config.market 带 style=B + 公告 + 关闭开关
  const u = await request(app).put('/api/admin/projects/1').set(authT(adminToken)).send({
    customerName: '一号客户',
    status: 'active',
    solutions: ['card'],
    config: { market: { enabled: false, style: 'C', notice: '总后台默认公告' } },
  });
  assert.equal(u.status, 200);
  const r = await request(app).get('/api/card-market/market/settings').set(authT(t1Token));
  assert.equal(r.body.settings.style, 'C', '总后台默认风格同步');
  assert.equal(r.body.settings.notice, '总后台默认公告');
  assert.equal(r.body.settings.enabled, 0, '总后台授权关闭生效');
  // 还原
  await request(app).put('/api/admin/projects/1').set(authT(adminToken)).send({
    customerName: '一号客户', status: 'active', solutions: ['card'],
    config: { market: { enabled: true, style: 'A', notice: '' } },
  });
});

// ================= D 组：交换闭环（人脉库/交换申请/转客户） =================
// 说明：走真实 platform_user + card_token 链路（comboAuth 只解 base64 payload 不验签）
// D1 交换请求→接受→双方 connections 快照各自取到对方（from/to 双向修复）
// D2 人脉分组/备注编辑 PUT /connections/:id
// D3 人脉转客户：双方视角各自转出的客户姓名正确（快照方向修复）
// D4 重复转客户拦截 / 删除人脉
// D5 待处理交换请求红点 unread
const cardTok = (uid) => 'Bearer ' + Buffer.from(JSON.stringify({ uid })).toString('base64') + '.sig';
let dConnId = null;

test('D1 交换请求-接受-双向人脉快照', async () => {
  // 林平(101) → 陈志强(102) 发起交换
  const req = await request(app).post('/api/card-market/exchange/request')
    .set('Authorization', cardTok(101)).send({ toUserId: 102, message: '商会合作' });
  assert.equal(req.status, 200, '101→102 发起交换');
  const conn = db.prepare('SELECT * FROM card_connections WHERE from_user_id = 101 AND to_user_id = 102').get();
  assert.ok(conn, '连接已创建');
  dConnId = conn.id;

  // 陈志强(102) 接受
  const h = await request(app).post('/api/card-market/exchange/handle')
    .set('Authorization', cardTok(102)).send({ connectionId: conn.id, action: 'accept' });
  assert.equal(h.status, 200, '102 接受交换');

  // 双方 connections 快照：101 视角对方=陈志强(to.name)；102 视角对方=林平(from.name) ← 修复核心
  const a = await request(app).get('/api/card-market/connections').set('Authorization', cardTok(101));
  assert.equal(a.status, 200);
  const mine = a.body.connections.find((c) => c.id === conn.id);
  assert.ok(mine, '101 人脉中可见');
  assert.equal(mine.contact_name, '陈志强', '101 视角对方=陈志强（快照 to）');
  assert.equal(mine.contact_position, '董事长');
  assert.equal(mine.contact_company, '东莞XX机械');

  const b = await request(app).get('/api/card-market/connections').set('Authorization', cardTok(102));
  const lin = b.body.connections.find((c) => c.id === conn.id);
  assert.ok(lin, '102 人脉中可见');
  assert.equal(lin.contact_name, '林平', '102 视角对方=林平（快照 from 修复）');
  assert.equal(lin.contact_position, '副会长/秘书长');
  assert.equal(lin.contact_company, '东莞市揭阳商会');
});

test('D2 人脉分组/备注编辑', async () => {
  const u = await request(app).put(`/api/card-market/connections/${dConnId}`)
    .set('Authorization', cardTok(102)).send({ groupName: '商会老乡', remark: '揭阳商会副会长' });
  assert.equal(u.status, 200);
  const row = db.prepare('SELECT group_name, remark FROM card_connections WHERE id = ?').get(dConnId);
  assert.equal(row.group_name, '商会老乡');
  assert.equal(row.remark, '揭阳商会副会长');
  // 非当事人无权编辑
  const forbid = await request(app).put(`/api/card-market/connections/${dConnId}`)
    .set('Authorization', cardTok(103)).send({ groupName: 'x' });
  assert.equal(forbid.status, 403, '第三方不可编辑他人人脉');
});

test('D3 人脉转客户（快照方向修复）', async () => {
  // 102 视角转（对方=林平，快照在 from —— 验证修复）
  const r1 = await request(app).post(`/api/card-market/connections/${dConnId}/convert-customer`)
    .set('Authorization', cardTok(102));
  assert.equal(r1.status, 200, '102 转林平为客户');
  let cust = db.prepare('SELECT * FROM card_customer WHERE owner_user_id = 102 AND source_user_id = 101').get();
  assert.ok(cust, '客户已落库');
  assert.equal(cust.name, '林平', '102 视角转出的客户名=林平（from 快照修复）');
  assert.equal(cust.company, '东莞市揭阳商会');
  // 101 视角转（对方=陈志强，快照在 to）
  const r2 = await request(app).post(`/api/card-market/connections/${dConnId}/convert-customer`)
    .set('Authorization', cardTok(101));
  assert.equal(r2.status, 200, '101 转陈志强为客户');
  cust = db.prepare('SELECT * FROM card_customer WHERE owner_user_id = 101 AND source_user_id = 102').get();
  assert.ok(cust, '101 客户已落库');
  assert.equal(cust.name, '陈志强', '101 视角转出的客户名=陈志强（to 快照）');
  // 重复转拦截
  const r3 = await request(app).post(`/api/card-market/connections/${dConnId}/convert-customer`)
    .set('Authorization', cardTok(102));
  assert.equal(r3.status, 400, '重复转客户被拦截');
});

test('D4 删除人脉', async () => {
  const d = await request(app).delete(`/api/card-market/connections/${dConnId}`).set('Authorization', cardTok(101));
  assert.equal(d.status, 200, '101 删除人脉');
  const gone = db.prepare('SELECT id FROM card_connections WHERE id = ?').get(dConnId);
  assert.equal(gone, undefined, '人脉已删除');
  // 已转客户不受影响
  const cust = db.prepare('SELECT id FROM card_customer WHERE owner_user_id = 102 AND source_user_id = 101').get();
  assert.ok(cust, '已转客户保留');
});

test('D5 待处理交换请求红点 unread', async () => {
  // 林平(101) → 黄志明(103) 发起待处理
  await request(app).post('/api/card-market/exchange/request')
    .set('Authorization', cardTok(101)).send({ toUserId: 103, message: '老乡好' });
  const after = await request(app).get('/api/card-market/exchange/unread').set('Authorization', cardTok(103));
  assert.equal(after.status, 200);
  assert.equal(after.body.count, 1, '103 收到1条待处理');
  // 列表可见
  const list = await request(app).get('/api/card-market/exchange/list').set('Authorization', cardTok(103));
  assert.equal(list.status, 200);
  assert.ok(list.body.requests.some((r) => r.from_user_id === 101 && r.to_user_id === 103 && r.status === 'pending'), '待处理请求在列表中');
  // 清理：103 拒绝
  const pending = db.prepare("SELECT id FROM card_connections WHERE from_user_id = 101 AND to_user_id = 103 AND status = 'pending'").get();
  await request(app).post('/api/card-market/exchange/handle')
    .set('Authorization', cardTok(103)).send({ connectionId: pending.id, action: 'reject' });
  const unreadAfter = await request(app).get('/api/card-market/exchange/unread').set('Authorization', cardTok(103));
  assert.equal(unreadAfter.body.count, 0, '处理后红点清零');
});

// ================= E 组：消息通知 + 管理员交换记录 =================
// E1 发起交换 → 接收方落 exchange 消息 + unread 计数
// E2 接受交换 → 发起方收到"已通过"消息；标记已读后 unread 清零
// E3 租户管理员 exchange/records 返回本租户全部交换记录 + 状态筛选
let eMsgId = null;

test('E1 发起交换后接收方收到消息', async () => {
  // 前置清理：保证 E 组消息独立（D5 曾向 103 发起过）
  db.prepare('DELETE FROM card_message WHERE user_id IN (101, 103)').run();
  // 林平(101) → 黄志明(103) 发起
  const r = await request(app).post('/api/card-market/exchange/request')
    .set('Authorization', cardTok(101)).send({ toUserId: 103, message: '供需合作' });
  assert.equal(r.status, 200);
  const msg = db.prepare("SELECT * FROM card_message WHERE customer_id = 1 AND user_id = 103 AND type = 'exchange' ORDER BY id DESC LIMIT 1").get();
  assert.ok(msg, '103 收到 exchange 消息');
  assert.equal(msg.is_read, 0, '默认未读');
  eMsgId = msg.id;
  assert.ok(msg.content.length > 0, '消息内容非空');
  const unread = await request(app).get('/api/card-market/messages/unread').set('Authorization', cardTok(103));
  assert.equal(unread.body.count, 1, '103 未读消息=1');
});

test('E2 接受后发起方收到消息且已读生效', async () => {
  const pending = db.prepare("SELECT id FROM card_connections WHERE from_user_id = 101 AND to_user_id = 103 AND status = 'pending'").get();
  await request(app).post('/api/card-market/exchange/handle')
    .set('Authorization', cardTok(103)).send({ connectionId: pending.id, action: 'accept' });
  const fromMsg = db.prepare("SELECT * FROM card_message WHERE customer_id = 1 AND user_id = 101 AND type = 'exchange' ORDER BY id DESC LIMIT 1").get();
  assert.ok(fromMsg, '101 收到已通过消息');
  assert.ok(fromMsg.content.includes('接受'), '消息内容为已通过');

  // 标记已读
  const rd = await request(app).post('/api/card-market/messages/read')
    .set('Authorization', cardTok(103)).send({ ids: [eMsgId] });
  assert.equal(rd.status, 200);
  const unread = await request(app).get('/api/card-market/messages/unread').set('Authorization', cardTok(103));
  assert.equal(unread.body.count, 0, '已读后未读=0');
  // 消息列表可见
  const list = await request(app).get('/api/card-market/messages').set('Authorization', cardTok(103));
  assert.ok(list.body.messages.some((m) => m.id === eMsgId && m.is_read === 1), '列表中已读状态更新');
});

test('E3 租户管理员交换记录', async () => {
  const r = await request(app).get('/api/card-market/exchange/records').set(authT(t1Token));
  assert.equal(r.status, 200);
  assert.ok(r.body.records.length >= 1, '至少包含 101→103 一笔');
  assert.ok(r.body.records.every((x) => x.from_name && x.to_name), '双方昵称已返回');
  const accepted = r.body.records.filter((x) => x.status === 'accepted');
  assert.ok(accepted.some((x) => x.from_name === '林平' && x.to_name === '黄志明'), '101→103 已接受记录在列');
  // 状态筛选
  const onlyPending = await request(app).get('/api/card-market/exchange/records?status=pending').set(authT(t1Token));
  assert.ok(onlyPending.body.records.every((x) => x.status === 'pending'), 'pending 筛选生效');
  // 非管理员不可访问
  const denied = await request(app).get('/api/card-market/exchange/records').set('Authorization', cardTok(102));
  assert.equal(denied.status, 403, '普通成员无权查看记录');
});
