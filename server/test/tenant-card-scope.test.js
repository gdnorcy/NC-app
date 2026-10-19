import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, hashPassword } from '../src/db.js';
import { createApp } from '../src/app.js';
import { issueToken } from '../src/auth.js';

/**
 * 租户名片归属并集口径回归
 * 历史坑：card_profile.enterprise_id 语义是 tenant_enterprises.id，
 * 旧代码拿它跟 req.customerId（租户ID）比 → 只有 enterprise_id 恰好等于租户ID 的
 * 数据能命中，租户下绝大多数名片在后台「查无此人」。
 *
 * 覆盖：
 *  - 五条归属来源（customer_id / enterprise_id / 用户企业绑定 / 入驻个人 / 企业员工）全部可见
 *  - 他租户名片不可见（隔离）
 *  - status != active 的名片不可见
 *  - 身份列（identityLabel / enterpriseName）正确
 *  - /card/overview 四个统计卡与列表口径一致
 *  - /card/customers、/card/trends 同口径收口
 *  - keyword 搜索与分页不受并集影响
 */
let app;
let tmpDir;
let db;
let adm1;
let adm2;

function bearer(u) {
  return { Authorization: `Bearer ${issueToken(u)}` };
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-card-scope-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });

  // 两个租户（租户1 由迁移默认创建）
  db.prepare(`INSERT INTO projects (customer_name, description, status, invite_code, solutions)
    VALUES ('租户二', '', 'active', '2002', '["panorama","card"]')`).run();
  const { hash, salt } = hashPassword('Test@123');
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('scope_tadm1', '13800002001', hash, salt, 'tenant_admin', 'active', 1);
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('scope_tadm2', '13800002002', hash, salt, 'tenant_admin', 'active', 2);
  adm1 = db.prepare("SELECT * FROM users WHERE username = 'scope_tadm1'").get();
  adm2 = db.prepare("SELECT * FROM users WHERE username = 'scope_tadm2'").get();

  // —— 租户1 的五种归属来源 ——
  // ① 显式 customer_id
  const uDirect = db.prepare("INSERT INTO platform_user (openid, nickname, customer_id, status) VALUES ('scope_direct', '直挂租户', 1, 'active')").run().lastInsertRowid;
  // ② 企业名片（card.enterprise_id → tenant_enterprises.id）
  const ent1 = db.prepare("INSERT INTO tenant_enterprises (customer_id, name, admin_user_id, status) VALUES (1, '归一科技', NULL, 'active')").run().lastInsertRowid;
  const uCompany = db.prepare("INSERT INTO platform_user (openid, nickname, customer_id, status) VALUES ('scope_company', '公司卡作者', 1, 'active')").run().lastInsertRowid;
  // ③ 用户企业绑定（platform_user.enterprise_id → tenant_enterprises.id）
  const uEntBound = db.prepare("INSERT INTO platform_user (openid, nickname, customer_id, status) VALUES ('scope_entbound', '企业成员甲', 1, 'active')").run().lastInsertRowid;
  db.prepare('UPDATE platform_user SET enterprise_id = ? WHERE id = ?').run(ent1, uEntBound);
  // ④ 入驻个人
  const uInd = db.prepare("INSERT INTO platform_user (openid, nickname, customer_id, status) VALUES ('scope_ind', '入驻个人乙', 1, 'active')").run().lastInsertRowid;
  db.prepare("INSERT INTO tenant_individuals (customer_id, user_id, name, phone, status) VALUES (1, ?, '入驻个人乙', '13800002010', 'active')").run(uInd);
  // ⑤ 企业员工
  const uEmp = db.prepare("INSERT INTO platform_user (openid, nickname, customer_id, status) VALUES ('scope_emp', '企业员工丙', 1, 'active')").run().lastInsertRowid;
  db.prepare("INSERT INTO tenant_enterprise_employees (enterprise_id, customer_id, user_id, name, role, status) VALUES (?, 1, ?, '企业员工丙', 'member', 'active')").run(ent1, uEmp);
  // 离职员工：不应再算本租户员工名片
  const uLeft = db.prepare("INSERT INTO platform_user (openid, nickname, customer_id, status) VALUES ('scope_left', '离职员工丁', 1, 'active')").run().lastInsertRowid;
  db.prepare("INSERT INTO tenant_enterprise_employees (enterprise_id, customer_id, user_id, name, role, status) VALUES (?, 1, ?, '离职员工丁', 'member', 'left')").run(ent1, uLeft);

  // —— 租户2 的隔离数据 ——
  const ent2 = db.prepare("INSERT INTO tenant_enterprises (customer_id, name, admin_user_id, status) VALUES (2, '他租户企业', NULL, 'active')").run().lastInsertRowid;
  const uOther = db.prepare("INSERT INTO platform_user (openid, nickname, customer_id, status) VALUES ('scope_other', '他租户用户', 2, 'active')").run().lastInsertRowid;

  // —— 名片 ——
  const mkCard = (uid, name, extra = {}) => db.prepare(
    `INSERT INTO card_profile (user_id, enterprise_id, customer_id, name, position, company, status, is_public, view_count, exchange_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uid, extra.enterprise_id ?? null, extra.customer_id ?? null, name, extra.position || '', extra.company || '',
    extra.status || 'active', extra.is_public ?? 1, extra.view_count ?? 0, extra.exchange_count ?? 0).lastInsertRowid;

  mkCard(uDirect, '直挂租户名片', { customer_id: 1, view_count: 10, exchange_count: 2 });
  mkCard(uCompany, '归一科技', { enterprise_id: ent1, customer_id: 1, view_count: 20, exchange_count: 1 });
  mkCard(uEntBound, '企业成员甲', { view_count: 30, exchange_count: 3 });
  mkCard(uInd, '入驻个人乙', { view_count: 40, exchange_count: 4 });
  mkCard(uEmp, '企业员工丙', { view_count: 50, exchange_count: 5 });
  mkCard(uLeft, '离职员工丁', { view_count: 60, exchange_count: 6 });
  mkCard(uOther, '他租户名片', { enterprise_id: ent2, customer_id: 2, view_count: 999, exchange_count: 9 });
  mkCard(uDirect, '已删除名片', { customer_id: 1, status: 'deleted', view_count: 777 });

  // 访问流水（近7天）：本租户 3 张 + 离职 1 张 + 他租户 1 张
  const today = new Date().toISOString().slice(0, 10);
  const addVisit = (uid, name, n) => {
    const cid = db.prepare('SELECT id FROM card_profile WHERE user_id = ? AND name = ?').get(uid, name).id;
    db.prepare('INSERT INTO card_visitor (card_id, visitor_openid, visit_date, visit_count) VALUES (?, ?, ?, ?)')
      .run(cid, 'scope_visit_' + cid, today, n);
  };
  addVisit(uDirect, '直挂租户名片', 10);
  addVisit(uCompany, '归一科技', 20);
  addVisit(uEntBound, '企业成员甲', 30);
  addVisit(uLeft, '离职员工丁', 60);
  addVisit(uOther, '他租户名片', 999);

  // 客户数据（customer_id 口径 + 企业口径）
  db.prepare('INSERT INTO card_customer (customer_id, owner_user_id, name, phone) VALUES (1, ?, ?, ?)').run(uDirect, '本租户客户', '13800009999');
  db.prepare('INSERT INTO card_customer (enterprise_id, owner_user_id, name, phone) VALUES (?, ?, ?, ?)').run(ent1, uCompany, '企业口径客户', '13800008888');
  db.prepare('INSERT INTO card_customer (customer_id, owner_user_id, name, phone) VALUES (2, ?, ?, ?)').run(uOther, '他租户客户', '13800007777');
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('并集：五种归属来源的名片全部出现在租户1 员工名片列表', async () => {
  const res = await request(app).get('/api/customer/card/employees').set(bearer(adm1));
  assert.equal(res.status, 200);
  const names = res.body.cards.map((c) => c.name).sort();
  assert.deepEqual(names, ['企业员工丙', '企业成员甲', '入驻个人乙', '归一科技', '直挂租户名片']);
  assert.equal(res.body.total, 5);
});

test('隔离：他租户名片与离职员工名片不可见', async () => {
  const res = await request(app).get('/api/customer/card/employees?pageSize=100').set(bearer(adm1));
  const names = res.body.cards.map((c) => c.name);
  assert.ok(!names.includes('他租户名片'), '他租户名片不应出现');
  assert.ok(!names.includes('离职员工丁'), '离职员工名片不应出现');
  assert.ok(!names.includes('已删除名片'), '非 active 名片不应出现');

  // 租户2 视角：只能看到自己的
  const res2 = await request(app).get('/api/customer/card/employees?pageSize=100').set(bearer(adm2));
  assert.deepEqual(res2.body.cards.map((c) => c.name), ['他租户名片']);
});

test('身份列：identityLabel / subjectType / identityHint 与来源一致', async () => {
  const res = await request(app).get('/api/customer/card/employees?pageSize=100').set(bearer(adm1));
  const byName = Object.fromEntries(res.body.cards.map((c) => [c.name, c]));
  assert.equal(byName['直挂租户名片'].identity, 'personal');
  assert.equal(byName['直挂租户名片'].identityLabel, '未认证个人');
  assert.equal(byName['直挂租户名片'].subjectType, 'person');
  assert.equal(byName['归一科技'].identity, 'enterprise');
  assert.equal(byName['归一科技'].identityLabel, '企业名片');
  assert.equal(byName['归一科技'].subjectType, 'enterprise');
  assert.equal(byName['归一科技'].enterpriseName, '归一科技');
  // 2026-10-20 重构：账号挂靠企业不再单独成类（ent_member 取消），并入未认证个人；
  // 所属企业列不受影响，仍按 名片enterprise_id → 用户enterprise_id 取
  assert.equal(byName['企业成员甲'].identity, 'personal');
  assert.equal(byName['企业成员甲'].identityLabel, '未认证个人');
  assert.equal(byName['企业成员甲'].subjectType, 'person');
  assert.equal(byName['企业成员甲'].enterpriseName, '归一科技');
  assert.equal(byName['入驻个人乙'].identity, 'individual');
  assert.equal(byName['入驻个人乙'].identityLabel, '认证个人');
  assert.equal(byName['企业员工丙'].identity, 'employee');
  assert.equal(byName['企业员工丙'].identityLabel, '企业员工');
  // 徽章可解释：每个身份都带「为什么 + 怎么升级」
  assert.match(byName['企业成员甲'].identityHint, /未认证/);
  assert.match(byName['企业员工丙'].identityHint, /已认证/);
});

test('概览统计：与列表口径一致（含企业成员数）', async () => {
  const res = await request(app).get('/api/customer/card/overview').set(bearer(adm1));
  assert.equal(res.status, 200);
  // 名片总数 = 5 张 active（不含离职/删除/他租户）
  assert.equal(res.body.cardCount, 5);
  // 总访问 = 10+20+30+40+50
  assert.equal(res.body.totalViews, 150);
  // 总交换 = 2+1+3+4+5
  assert.equal(res.body.exchangeCount, 15);
  // 企业成员 = 归属本租户的去重自然人：直挂租户/公司卡作者/企业成员甲/入驻个人乙/企业员工丙/离职员工丁
  // （离职员工只是离开企业，仍在本租户名册上，故计入成员数；其名片已不在列表中）
  assert.equal(res.body.employeeCount, 6);
  // 企业客户：customer_id 口径 1 条 + 企业口径 1 条 = 2（他租户不计）
  assert.equal(res.body.customerCount, 2);
});

test('并集下 keyword 搜索与分页仍生效', async () => {
  const kw = await request(app).get('/api/customer/card/employees?keyword=企业').set(bearer(adm1));
  assert.equal(kw.body.total, 2);
  assert.deepEqual(kw.body.cards.map((c) => c.name).sort(), ['企业员工丙', '企业成员甲']);

  const p1 = await request(app).get('/api/customer/card/employees?page=1&pageSize=2').set(bearer(adm1));
  assert.equal(p1.body.cards.length, 2);
  assert.equal(p1.body.total, 5);
  const p3 = await request(app).get('/api/customer/card/employees?page=3&pageSize=2').set(bearer(adm1));
  assert.equal(p3.body.cards.length, 1);
});

test('客户列表与跟进记录同口径：跨租户 404', async () => {
  const list = await request(app).get('/api/customer/card/customers?pageSize=50').set(bearer(adm1));
  assert.equal(list.body.total, 2);
  const own = list.body.customers.find((c) => c.name === '本租户客户');
  const entScoped = list.body.customers.find((c) => c.name === '企业口径客户');
  assert.ok(own && entScoped, 'customer_id 口径与企业口径客户都应可见');
  assert.ok(!list.body.customers.some((c) => c.name === '他租户客户'), '他租户客户不可见');

  const follows = await request(app).get(`/api/customer/card/customers/${own.id}/follows`).set(bearer(adm1));
  assert.equal(follows.status, 200);

  const other = await request(app).get('/api/customer/card/customers?pageSize=50').set(bearer(adm2));
  const foreign = other.body.customers.find((c) => c.name === '他租户客户');
  const denied = await request(app).get(`/api/customer/card/customers/${foreign.id}/follows`).set(bearer(adm1));
  assert.equal(denied.status, 404);
});

test('访问趋势只统计本租户名片', async () => {
  const res = await request(app).get('/api/customer/card/trends').set(bearer(adm1));
  assert.equal(res.status, 200);
  const total = res.body.trends.reduce((s, r) => s + r.views, 0);
  assert.equal(total, 60, '不应掺入他租户与离职名片的访问量');
});

test('名片管理：主体拆分（默认只看个人名片），与员工名片同一套并集口径，且带集市上架状态', async () => {
  // 默认 subject=person：企业名片（归一科技）是主体档案不是成员，不混在成员名单里
  const res = await request(app).get('/api/customer/card/manage?pageSize=50').set(bearer(adm1));
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 4);
  const names = res.body.cards.map((c) => c.name).sort();
  assert.deepEqual(names, ['企业员工丙', '企业成员甲', '入驻个人乙', '直挂租户名片']);
  // 顶部统计卡：与列表筛选无关；主体口径拆分（方案 C）
  assert.equal(res.body.stats.cardCount, 5);
  assert.equal(res.body.stats.personCardCount, 4);
  assert.equal(res.body.stats.enterpriseCardCount, 1);
  // 未造任何上架记录 → 全部「未申请上架」，统计卡为 0
  assert.equal(res.body.stats.marketApproved, 0);
  assert.equal(res.body.stats.marketPending, 0);
  res.body.cards.forEach((c) => {
    assert.equal(c.marketStatus, '');
    assert.equal(c.marketItemId, null);
    assert.equal(c.marketIsTop, false);
    assert.equal(c.subjectType, 'person');
    assert.equal(typeof c.isPublic, 'boolean');
  });

  // subject=enterprise：只看企业名片（1 张）
  const ent = await request(app).get('/api/customer/card/manage?subject=enterprise&pageSize=50').set(bearer(adm1));
  assert.equal(ent.body.total, 1);
  assert.deepEqual(ent.body.cards.map((c) => c.name), ['归一科技']);
  assert.equal(ent.body.cards[0].subjectType, 'enterprise');
  assert.equal(ent.body.cards[0].identity, 'enterprise');

  // subject=all：全量（与员工名片页一致）
  const all = await request(app).get('/api/customer/card/manage?subject=all&pageSize=50').set(bearer(adm1));
  assert.equal(all.body.total, 5);
});

test('名片管理：集市状态筛选在 SQL 层完成，total 与列表一致', async () => {
  // 造两条上架记录：一条 approved（置顶）、一条 pending，都挂在本租户用户身上
  const approvedUser = db.prepare("SELECT user_id FROM card_profile WHERE name = '企业员工丙'").get().user_id;
  const pendingUser = db.prepare("SELECT user_id FROM card_profile WHERE name = '入驻个人乙'").get().user_id;
  const i1 = db.prepare(`INSERT INTO card_market_items (customer_id, subject_type, subject_id, user_id, audit_status, is_top)
    VALUES (1, 'employee', 1, ?, 'approved', 1)`).run(approvedUser).lastInsertRowid;
  const i2 = db.prepare(`INSERT INTO card_market_items (customer_id, subject_type, subject_id, user_id, audit_status)
    VALUES (1, 'individual', 1, ?, 'pending')`).run(pendingUser).lastInsertRowid;

  const all = await request(app).get('/api/customer/card/manage?pageSize=50').set(bearer(adm1));
  assert.equal(all.body.stats.marketApproved, 1);
  assert.equal(all.body.stats.marketPending, 1);
  const approved = all.body.cards.find((c) => c.name === '企业员工丙');
  assert.equal(approved.marketStatus, 'approved');
  assert.equal(approved.marketItemId, i1);
  assert.equal(approved.marketIsTop, true);
  const pending = all.body.cards.find((c) => c.name === '入驻个人乙');
  assert.equal(pending.marketStatus, 'pending');
  assert.equal(pending.marketItemId, i2);

  // market=approved：total 与 shown 必须一致（旧实现在 JS 里过滤，total 会虚高）
  const fA = await request(app).get('/api/customer/card/manage?market=approved&pageSize=50').set(bearer(adm1));
  assert.equal(fA.body.total, 1);
  assert.equal(fA.body.cards.length, 1);
  assert.equal(fA.body.cards[0].name, '企业员工丙');
  // 统计卡是全局口径，不随筛选变化
  assert.equal(fA.body.stats.cardCount, 5);
  assert.equal(fA.body.stats.marketApproved, 1);

  const fP = await request(app).get('/api/customer/card/manage?market=pending&pageSize=50').set(bearer(adm1));
  assert.equal(fP.body.total, 1);
  assert.equal(fP.body.cards[0].name, '入驻个人乙');

  // market=none：默认 subject=person 基数 4 张，扣掉已上架/待审 2 张 = 2
  const fN = await request(app).get('/api/customer/card/manage?market=none&pageSize=50').set(bearer(adm1));
  assert.equal(fN.body.total, 2);
  assert.equal(fN.body.cards.length, 2);
  assert.ok(!fN.body.cards.some((c) => c.marketStatus), '未申请上架的名片 marketStatus 应为空');

  // 他租户的上架记录不能串到本租户来
  const other = db.prepare("SELECT user_id FROM card_profile WHERE name = '他租户名片'").get().user_id;
  db.prepare(`INSERT INTO card_market_items (customer_id, subject_type, subject_id, user_id, audit_status)
    VALUES (2, 'individual', 1, ?, 'approved')`).run(other);
  const fA2 = await request(app).get('/api/customer/card/manage?market=approved&pageSize=50').set(bearer(adm1));
  assert.equal(fA2.body.total, 1, '他租户上架记录不应计入本租户');

  db.prepare('DELETE FROM card_market_items WHERE id IN (?,?)').run(i1, i2);
  db.prepare('DELETE FROM card_market_items WHERE customer_id = 2').run();
});

test('名片管理：身份筛选压在 SQL 上，分页不受影响', async () => {
  const f = await request(app).get('/api/customer/card/manage?identity=individual&pageSize=50').set(bearer(adm1));
  assert.equal(f.body.total, 1);
  assert.deepEqual(f.body.cards.map((c) => c.name), ['入驻个人乙']);

  // 挂靠成员类别已取消：ent_member 不再被接受为合法筛选值（前端选项也已下线）
  const fOld = await request(app).get('/api/customer/card/manage?identity=ent_member&pageSize=50').set(bearer(adm1));
  assert.equal(fOld.body.total, 4, 'ent_member 不再是合法 identity，筛选条件被忽略，回到 person 基数');

  // 分页：默认 person 基数 4，pageSize=2 时第 2 页应拿到 2 条
  const p2 = await request(app).get('/api/customer/card/manage?page=2&pageSize=2').set(bearer(adm1));
  assert.equal(p2.body.total, 4);
  assert.equal(p2.body.cards.length, 2);
  const p3 = await request(app).get('/api/customer/card/manage?page=3&pageSize=2').set(bearer(adm1));
  assert.equal(p3.body.cards.length, 0);
});

test('名片管理：keyword 搜索与员工名片一致', async () => {
  const res = await request(app).get('/api/customer/card/manage?keyword=%E4%BC%81%E4%B8%9A&pageSize=50').set(bearer(adm1));
  assert.equal(res.body.total, 2);
  assert.deepEqual(res.body.cards.map((c) => c.name).sort(), ['企业员工丙', '企业成员甲']);
});

// ============================================================
// 停用企业（影子企业治理 SQL 兜底，2026-10-20）
// 背景：登录兜底曾自动建「H5演示用户_<userId>」企业并挂靠账号。
// 数据层已 cleanupDemoEnterprises 止血，但归属/身份 SQL 若不过滤
// tenant_enterprises.status，理论上停用企业仍能提供 ②③ 两条归属通道。
// ============================================================
test('停用企业不再提供归属通道：列表/统计/客户/身份全收口', async () => {
  // 造一家已停用企业 + 只靠它进入租户视野的数据（customer_id 置 NULL 隔离其他通道）
  const entDead = db.prepare("INSERT INTO tenant_enterprises (customer_id, name, status) VALUES (1, '已停用企业', 'disabled')").run().lastInsertRowid;
  const uEntCard = db.prepare("INSERT INTO platform_user (openid, nickname, status) VALUES ('scope_dead_ent', '停用企业名片作者', 'active')").run().lastInsertRowid;
  const uBound = db.prepare("INSERT INTO platform_user (openid, nickname, status) VALUES ('scope_dead_bound', '停用企业成员', 'active')").run().lastInsertRowid;
  db.prepare('UPDATE platform_user SET enterprise_id = ? WHERE id = ?').run(entDead, uBound);
  const cardEnt = db.prepare(`INSERT INTO card_profile (user_id, enterprise_id, name, status, is_public)
    VALUES (?, ?, '停用企业名片', 'active', 1)`).run(uEntCard, entDead).lastInsertRowid;
  const cardBound = db.prepare(`INSERT INTO card_profile (user_id, name, status, is_public)
    VALUES (?, '停用企业成员名片', 'active', 1)`).run(uBound).lastInsertRowid;
  db.prepare('INSERT INTO card_customer (enterprise_id, owner_user_id, name, phone) VALUES (?, ?, ?, ?)')
    .run(entDead, uEntCard, '停用企业客户', '13800006666');

  try {
    // ② 通道（企业名片）与 ③ 通道（成员名片）都不应出现在任何租户列表
    const list = await request(app).get('/api/customer/card/employees?pageSize=100').set(bearer(adm1));
    assert.equal(list.status, 200);
    assert.ok(!list.body.cards.some((c) => c.name === '停用企业名片'), '② 通道：停用企业的企业名片不应出现');
    assert.ok(!list.body.cards.some((c) => c.name === '停用企业成员名片'), '③ 通道：停用企业的成员名片不应出现');
    assert.equal(list.body.total, 5);

    const manage = await request(app).get('/api/customer/card/manage?pageSize=100').set(bearer(adm1));
    assert.ok(!manage.body.cards.some((c) => c.name === '停用企业名片'));
    assert.ok(!manage.body.cards.some((c) => c.name === '停用企业成员名片'));
    assert.equal(manage.body.stats.cardCount, 5, '统计卡不受停用企业数据影响');
    assert.equal(manage.body.stats.personCardCount, 4);
    assert.equal(manage.body.stats.enterpriseCardCount, 1);

    // 概览：成员数与客户数都不应掺入停用企业口径
    const ov = await request(app).get('/api/customer/card/overview').set(bearer(adm1));
    assert.equal(ov.body.employeeCount, 6, '停用企业的挂靠用户不计入企业成员');
    assert.equal(ov.body.customerCount, 2, '停用企业口径客户不计入');

    // 客户列表：enterprise_id 指向停用企业时不可见
    const cust = await request(app).get('/api/customer/card/customers?pageSize=50').set(bearer(adm1));
    assert.equal(cust.body.total, 2);
    assert.ok(!cust.body.customers.some((c) => c.name === '停用企业客户'), '停用企业口径客户不应出现');

    // 身份兜底：名片显式补 customer_id=1 后可见，但身份不得再落 enterprise
    // （2026-10-20 重构后 personal 取代旧 tenant/ent_member 两个值）
    db.prepare('UPDATE card_profile SET customer_id = 1 WHERE id IN (?, ?)').run(cardEnt, cardBound);
    const list2 = await request(app).get('/api/customer/card/manage?subject=all&pageSize=100').set(bearer(adm1));
    const byName = Object.fromEntries(list2.body.cards.map((c) => [c.name, c]));
    assert.equal(byName['停用企业名片'].identity, 'personal', '停用企业名片只能按个人名片算');
    assert.equal(byName['停用企业名片'].subjectType, 'person');
    assert.equal(byName['停用企业成员名片'].identity, 'personal', '停用企业成员名片只能按个人名片算');
  } finally {
    db.prepare('DELETE FROM card_profile WHERE id IN (?, ?)').run(cardEnt, cardBound);
    db.prepare('DELETE FROM card_customer WHERE name = ?').run('停用企业客户');
    db.prepare('DELETE FROM platform_user WHERE id IN (?, ?)').run(uEntCard, uBound);
    db.prepare('DELETE FROM tenant_enterprises WHERE id = ?').run(entDead);
  }
});
