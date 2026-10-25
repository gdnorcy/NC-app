/**
 * 🔴 回归锁：第20轮三层身份 + 租户双模开关（购买=集市场席）
 *
 * 产品模型（已拍板）：
 *   普通用户 0 门槛建名片+分享；集市场席两条路——
 *     code 模式（默认）：口令+审核入驻（存量行为，本测试钉死不变）
 *     purchase 模式：购买 market_subject=1 的会员套餐自动获得场席
 *   会员过期：主体保留（未认证），集市踢出（懒铲除）；收入进租户（payer_type=tenant）
 *
 * 覆盖：
 *   1 双模行为：code 模式购买不赠主体；purchase 模式赠（active/purchase + 绑租户 + 幂等）
 *   2 market_subject=0 的套餐不赠
 *   3 配额超限（solution_quotas card.memberCount）跳过授予，会员不受影响
 *   4 /market/settings 双模读写与非法值 400
 *   5 上架门：purchase 主体会员过期 → 403 memberExpired
 *   6 过期懒铲除：移出集市 + is_public 回落，主体行保留
 *   7 /member/status 回传 marketSubject
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword, ensureTenantDefaultLevels } from '../src/db.js';
import { issueToken } from '../src/auth.js';
import { PaymentService } from '../src/services/payment.js';

let app;
let db;
let tmpDir;
let pkgWith;   // market_subject=1
let pkgWithout; // market_subject=0

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-market-subject-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  // 多租户平台模式：关闭登录租户兜底（否则 mock 登录把新用户绑到租户1，双模行为测不准）
  config.defaultTenantId = 0;
  db = createDb(config.dbPath);
  app = createApp({ db });

  // 租户2（purchase 模式租户；绑旗舰套餐避免 max_individuals=5 的默认回退干扰）
  db.prepare(`INSERT INTO projects (customer_name, description, status, invite_code, solutions, billing_plan_id)
    VALUES ('purchase租户', '', 'active', 'PMSUBJ01', '["card"]', 3)`).run();
  db.prepare("INSERT INTO card_market_settings (customer_id, individual_join_mode) VALUES (2, 'purchase')").run();
  // 租户3（code 模式对照：无设置行=默认 code）
  db.prepare(`INSERT INTO projects (customer_name, description, status, invite_code, solutions, billing_plan_id)
    VALUES ('code租户', '', 'active', 'PMSUBJ03', '["card"]', 3)`).run();
  // 租户 2/3 是 createDb 之后裸插入的（启动播种只覆盖当时存在的租户）→ 显式补种标准档，
  // 等价于「下一次服务重启」的效果（B 路测试的 gold 标准档 + 矩阵即来源于此）
  ensureTenantDefaultLevels(db, 2);
  ensureTenantDefaultLevels(db, 3);

  // 两个套餐：含/不含集市场席
  db.prepare(`INSERT INTO member_package (level, name, price, duration_days, description, features, sort_order, enabled, market_subject)
    VALUES ('mkt_yes', '含场席套餐', 99, 365, '', '[]', 91, 1, 1)`).run();
  db.prepare(`INSERT INTO member_package (level, name, price, duration_days, description, features, sort_order, enabled, market_subject)
    VALUES ('mkt_no', '不含场席套餐', 9.9, 30, '', '[]', 92, 1, 0)`).run();
  pkgWith = db.prepare("SELECT * FROM member_package WHERE level = 'mkt_yes'").get();
  pkgWithout = db.prepare("SELECT * FROM member_package WHERE level = 'mkt_no'").get();

  // 租户管理员（settings PUT 用；issueToken 读 user.customer_id）
  const { hash, salt } = hashPassword('Test@123');
  for (const [uname, phone, cid] of [['mkt_adm2', '13800000092', 2], ['mkt_adm3', '13800000093', 3]]) {
    db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
      .run(uname, phone, hash, salt, 'tenant_admin', 'active', cid);
  }
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function wxLogin(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200);
  return res.body.token;
}
function uidOf(token) {
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString()).uid;
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const admToken = (cid) => issueToken({ id: cid, username: `mkt_adm${cid}`, role: 'tenant_admin', customer_id: cid });

/** 走真实支付链路：建单 → markPaid → handlePaymentSuccess → activateCardMember（含赠主体） */
function buyMember(customerId, userId, pkg) {
  const payment = new PaymentService(db);
  const order = payment.createOrder({
    payerType: 'tenant',
    customerId,
    userId,
    solution: 'card',
    productType: 'member',
    productId: String(pkg.id),
    productName: pkg.name,
    amount: Math.round(pkg.price * 100),
    channel: 'wechat',
    remark: `test-${pkg.level}`,
  });
  return payment.markPaid(order.orderNo, 'TX_TEST');
}

const indOf = (customerId, userId) =>
  db.prepare('SELECT * FROM tenant_individuals WHERE customer_id = ? AND user_id = ?').get(customerId, userId);

test('1a code 模式（默认租户1）购买含场席套餐 → 不赠主体', async () => {
  const token = await wxLogin('mkt_code_mode');
  const uid = uidOf(token);
  buyMember(1, uid, pkgWith);
  const pu = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(uid);
  assert.equal(pu.member_level, 'mkt_yes', '会员应正常开通');
  assert.equal(indOf(1, uid), undefined, 'code 模式不得自动授予主体');
  assert.equal(pu.customer_id, null, 'code 模式购买不绑定租户');
});

test('1b purchase 模式（租户2）购买含场席套餐 → 赠 active/purchase 主体并绑租户', async () => {
  const token = await wxLogin('mkt_purchase_ok');
  const uid = uidOf(token);
  // 名片（授予时取姓名/电话/城市）
  db.prepare(`INSERT INTO card_profile (user_id, name, phone, city, status, is_public)
    VALUES (?, '采购测试', '13800000001', '深圳', 'active', 0)`).run(uid);
  buyMember(2, uid, pkgWith);

  const ind = indOf(2, uid);
  assert.ok(ind, '应创建 tenant_individuals 行');
  assert.equal(ind.status, 'active');
  assert.equal(ind.source, 'purchase');
  assert.equal(ind.name, '采购测试');
  const pu = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(uid);
  assert.equal(pu.member_level, 'mkt_yes');
  assert.equal(pu.customer_id, 2, '应绑定租户');
  assert.equal(pu.identity_type, 'individual');
  const card = db.prepare('SELECT customer_id FROM card_profile WHERE user_id = ?').get(uid);
  assert.equal(card.customer_id, 2, '名下未关联名片应补 customer_id');
});

test('1c 幂等：purchase 模式重复购买 → 不重复插、状态保持', async () => {
  const token = await wxLogin('mkt_purchase_idem');
  const uid = uidOf(token);
  buyMember(2, uid, pkgWith);
  buyMember(2, uid, pkgWith); // 续费再买
  const rows = db.prepare('SELECT * FROM tenant_individuals WHERE customer_id = 2 AND user_id = ?').all(uid);
  assert.equal(rows.length, 1, '不得重复插入');
  assert.equal(rows[0].status, 'active');
  assert.equal(rows[0].source, 'purchase');
});

test('2 market_subject=0 的套餐 → 不赠主体', async () => {
  const token = await wxLogin('mkt_no_subject');
  const uid = uidOf(token);
  buyMember(2, uid, pkgWithout);
  assert.equal(indOf(2, uid), undefined);
  const pu = db.prepare('SELECT member_level FROM platform_user WHERE id = ?').get(uid);
  assert.equal(pu.member_level, 'mkt_no', '会员仍正常开通');
});

test('3 配额超限（solution_quotas card.memberCount=1 且已有 1 人）→ 跳过授予，会员不受影响', async () => {
  // 占位个人把 memberCount 顶满（solution_id=2 即 card 方案）
  db.prepare(`INSERT INTO tenant_individuals (customer_id, user_id, name, status, source)
    VALUES (2, 888001, '占位', 'active', 'code')`).run();
  db.prepare(`INSERT INTO solution_quotas (solution_id, app_code, key, label, value, enabled)
    VALUES (2, 'card', 'memberCount', '入驻个人数', 1, 1)`).run();

  const token = await wxLogin('mkt_quota_full');
  const uid = uidOf(token);
  buyMember(2, uid, pkgWith);

  // 先采集结果再清理（清理必须早于断言，失败也不留状态污染后续用例）
  const ind = indOf(2, uid);
  const memberLevel = db.prepare('SELECT member_level FROM platform_user WHERE id = ?').get(uid).member_level;
  db.prepare("DELETE FROM solution_quotas WHERE key = 'memberCount' AND solution_id = 2").run();
  db.prepare('DELETE FROM tenant_individuals WHERE user_id = 888001').run();

  assert.equal(ind, undefined, '配额满不得授予');
  assert.equal(memberLevel, 'mkt_yes', '会员权益不受授予失败影响');
});

test('4 /market/settings 双模读写：默认 code、可切 purchase、非法值 400', async () => {
  const adm3 = admToken(3);
  // 租户3 无设置行 → 默认 code
  const get1 = await request(app).get('/api/card-market/market/settings').set(bearer(adm3));
  assert.equal(get1.status, 200);
  assert.equal(get1.body.settings.individualJoinMode, 'code');

  // 非法值 400
  const bad = await request(app).put('/api/card-market/market/settings').set(bearer(adm3))
    .send({ individualJoinMode: 'invite' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /入驻模式/);

  // 合法切换 + 回读
  const put = await request(app).put('/api/card-market/market/settings').set(bearer(adm3))
    .send({ individualJoinMode: 'purchase' });
  assert.equal(put.status, 200);
  const get2 = await request(app).get('/api/card-market/market/settings').set(bearer(adm3));
  assert.equal(get2.body.settings.individualJoinMode, 'purchase');

  // 切回 code（租户3 不留 purchase 状态）
  await request(app).put('/api/card-market/market/settings').set(bearer(adm3))
    .send({ individualJoinMode: 'code' });
});

test('5 上架门：purchase 主体会员过期 → 403 memberExpired；有效 → 可上架', async () => {
  const token = await wxLogin('mkt_toggle_gate');
  const uid = uidOf(token);
  buyMember(2, uid, pkgWith);
  const ind = indOf(2, uid);
  const toggle = (subjectId) => request(app).post('/api/card-market/market/toggle').set(bearer(token))
    .send({ subjectType: 'individual', subjectId });

  // 有效会员 → 上架成功
  const ok = await toggle(ind.id);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.inMarket, true);

  // 会员过期 → 下架后再次上架应被门拦（先下架）
  const off = await toggle(ind.id);
  assert.equal(off.body.inMarket, false);
  db.prepare("UPDATE platform_user SET member_expire_at = '2020-01-01 00:00:00' WHERE id = ?").run(uid);
  const blocked = await toggle(ind.id);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'memberExpired');
  // 集市里不应有该主体条目
  const item = db.prepare('SELECT id FROM card_market_items WHERE customer_id = 2 AND subject_id = ?').get(ind.id);
  assert.equal(item, undefined);
});

test('6 过期懒铲除：读路径自动移出集市 + is_public 回落，主体行保留', async () => {
  const token = await wxLogin('mkt_lazy_purge');
  const uid = uidOf(token);
  db.prepare(`INSERT INTO card_profile (user_id, name, phone, city, status, is_public)
    VALUES (?, '懒铲除', '13800000007', '广州', 'active', 0)`).run(uid);
  buyMember(2, uid, pkgWith);
  const ind = indOf(2, uid);
  assert.ok(ind, '前提：授予成功');
  // 已上架 + 名片公开
  db.prepare(`INSERT INTO card_market_items (customer_id, subject_type, subject_id, user_id, audit_status)
    VALUES (2, 'individual', ?, ?, 'approved')`).run(ind.id, uid);
  db.prepare('UPDATE card_profile SET is_public = 1 WHERE user_id = ?').run(uid);
  // 会员过期
  db.prepare("UPDATE platform_user SET member_expire_at = '2020-01-01 00:00:00' WHERE id = ?").run(uid);

  // 任意读路径触发懒铲除（list）
  const res = await request(app).get('/api/card-market/market/list').set(bearer(token));
  assert.equal(res.status, 200);
  const item = db.prepare('SELECT id FROM card_market_items WHERE customer_id = 2 AND subject_id = ?').get(ind.id);
  assert.equal(item, undefined, '过期 purchase 主体应被移出集市');
  const card = db.prepare('SELECT is_public FROM card_profile WHERE user_id = ?').get(uid);
  assert.equal(card.is_public, 0, 'is_public 应回落');
  const still = indOf(2, uid);
  assert.ok(still && still.status === 'active', '主体行保留（未认证但存在）');
});

test('7 /member/status 回传 marketSubject（模式/场席/来源/会员态）', async () => {
  const token = await wxLogin('mkt_status');
  const uid = uidOf(token);
  buyMember(2, uid, pkgWith);
  let res = await request(app).get('/api/card/member/status').set(bearer(token));
  assert.equal(res.status, 200);
  assert.equal(res.body.marketSubject.mode, 'purchase');
  assert.equal(res.body.marketSubject.hasSeat, true);
  assert.equal(res.body.marketSubject.source, 'purchase');
  assert.equal(res.body.marketSubject.memberActive, true);

  // 会员过期：hasSeat 仍 true（主体保留），memberActive false
  db.prepare("UPDATE platform_user SET member_expire_at = '2020-01-01 00:00:00' WHERE id = ?").run(uid);
  res = await request(app).get('/api/card/member/status').set(bearer(token));
  assert.equal(res.body.marketSubject.hasSeat, true);
  assert.equal(res.body.marketSubject.memberActive, false);
  assert.equal(res.body.isMember, false);
});

// ===== 1b：B 路（会员卡购买）场席授予对齐 A 路 =====
/** 走 B 路真实链路：建单（member_card）→ markPaid → openCardByOrder + grantMarketSubjectForMemberCard */
function buyMemberCard(customerId, userId, level) {
  const payment = new PaymentService(db);
  const order = payment.createOrder({
    payerType: 'tenant',
    customerId,
    userId,
    solution: 'card',
    productType: 'member_card',
    productId: String(level.id),
    productName: level.name,
    amount: level.buy_price,
    channel: 'wechat',
    remark: 'test-member-card',
  });
  return payment.markPaid(order.orderNo, 'TX_TEST_CARD');
}
const levelOf = (tid, tier) => db.prepare('SELECT id, name, buy_price FROM member_levels WHERE tenant_id = ? AND pkg_level = ?').get(tid, tier);

test('8a B 路 purchase 模式（租户2）购买 gold 标准档（矩阵 market_subject=1）→ 开卡 + 授予主体', async () => {
  const gold = levelOf(2, 'gold');
  assert.ok(gold && gold.buy_price > 0, '前提：租户2 已播种 gold 标准档且可购买');
  const token = await wxLogin('mkt_card_yes');
  const uid = uidOf(token);
  buyMemberCard(2, uid, gold);

  // 开卡（member_user 事实来源）
  const mu = db.prepare('SELECT * FROM member_user WHERE tenant_id = ? AND user_id = ?').get(2, uid);
  assert.ok(mu && mu.level_id === gold.id && mu.status === 'active', 'B 路应开出租户级会员');
  // 授予场席（与 A 路同规则：active/purchase + 绑租户）
  const ind = indOf(2, uid);
  assert.ok(ind, '矩阵 market_subject=1 应授予主体');
  assert.equal(ind.status, 'active');
  assert.equal(ind.source, 'purchase');
  const pu = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(uid);
  assert.equal(pu.customer_id, 2, '应绑定租户');
});

test('8b B 路 code 模式（租户3）购买 gold → 开卡但不授予主体', async () => {
  const gold = levelOf(3, 'gold');
  assert.ok(gold, '前提：租户3 已播种 gold 标准档');
  const token = await wxLogin('mkt_card_code');
  const uid = uidOf(token);
  buyMemberCard(3, uid, gold);

  const mu = db.prepare('SELECT * FROM member_user WHERE tenant_id = ? AND user_id = ?').get(3, uid);
  assert.ok(mu && mu.level_id === gold.id, 'code 模式租户也能正常开卡');
  assert.equal(indOf(3, uid), undefined, 'code 模式不得自动授予主体');
  const pu = db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(uid);
  assert.equal(pu.customer_id, null, 'code 模式购买不绑定租户');
});

test('8c B 路矩阵 market_subject=0 的等级 → 开卡但不授予', async () => {
  // 自建等级：upgrade_mode=consume + buy_price，矩阵 market 显式关
  const lv = db.prepare(
    `INSERT INTO member_levels (tenant_id, level_no, name, status, upgrade_mode, consume_amount, buy_price, benefits, sort_order, review_mode, valid_days)
     VALUES (2, 90, '无场席等级', 1, 'consume', 0, 500, '{}', 90, 'manual', 0)`
  ).run().lastInsertRowid;
  db.prepare("INSERT INTO member_level_app_benefits (tenant_id, level_id, app_code, benefits) VALUES (2, ?, 'market', ?)")
    .run(lv, JSON.stringify({ market_subject: 0 }));
  const token = await wxLogin('mkt_card_no_subject');
  const uid = uidOf(token);
  buyMemberCard(2, uid, { id: lv, name: '无场席等级', buy_price: 500 });

  const mu = db.prepare('SELECT * FROM member_user WHERE tenant_id = ? AND user_id = ?').get(2, uid);
  assert.ok(mu && mu.level_id === lv, '会员应正常开通');
  assert.equal(indOf(2, uid), undefined, '矩阵关场席不得授予');
});

test('8d B 路无矩阵 market 行的自建等级 → 不授予（判据只认矩阵，回落目录默认 0）', async () => {
  const lv = db.prepare(
    `INSERT INTO member_levels (tenant_id, level_no, name, status, upgrade_mode, consume_amount, buy_price, benefits, sort_order, review_mode, valid_days)
     VALUES (2, 91, '裸奔等级', 1, 'consume', 0, 500, '{}', 91, 'manual', 0)`
  ).run().lastInsertRowid;
  // 故意不插任何矩阵行
  const token = await wxLogin('mkt_card_no_matrix');
  const uid = uidOf(token);
  buyMemberCard(2, uid, { id: lv, name: '裸奔等级', buy_price: 500 });

  const mu = db.prepare('SELECT * FROM member_user WHERE tenant_id = ? AND user_id = ?').get(2, uid);
  assert.ok(mu && mu.level_id === lv, '会员应正常开通');
  assert.equal(indOf(2, uid), undefined, '无矩阵行不得授予（与 resolver 回落目录默认一致）');
});
