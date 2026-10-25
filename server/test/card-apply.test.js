import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { issueToken } from '../src/auth.js';

let app;
let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-card-test-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  app = createApp();
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function wxLogin(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200);
  return res.body.token;
}

/** 以 customer_id=1 的租户管理员身份执行入驻审核（管理员不存在时按需创建） */
async function reviewIndividual(db, applyId, action) {
  let adm = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();
  if (!adm) {
    const { hashPassword } = await import('../src/db.js');
    const { hash, salt } = hashPassword('Test@123');
    const info = db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
      .run('card_apply_adm', '13800000999', hash, salt, 'tenant_admin', 'active', 1);
    adm = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }
  const res = await request(app)
    .post('/api/card-market/apply/audit')
    .set('Authorization', `Bearer ${issueToken(adm)}`)
    .send({ type: 'individual', id: applyId, action });
  return res;
}

/**
 * 放开入驻配额：默认库绑的是体验套餐(demo 方案)，memberCount 之类的上限会在审核通过时
 * 403 拦截，与本轮兑换码逻辑无关。参照 card-apply-review.test.js 的做法放开。
 */
function unlockQuota(db) {
  db.prepare("UPDATE projects SET billing_plan_id = (SELECT id FROM billing_plans WHERE code = 'flagship') WHERE id = 1").run();
  db.prepare("UPDATE solution_quotas SET value = 100 WHERE key IN ('enterpriseCount','employeeCount','memberCount') AND solution_id = (SELECT id FROM solutions WHERE code = 'demo')").run();
}

test('创建名片+入驻申请合并流程', async () => {
  const token = await wxLogin('merge_flow_1');

  // 1. 无口令：仅创建名片，不入驻
  const noBind = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '仅名片', position: '顾问', city: '广州', isPublic: true });
  assert.equal(noBind.status, 200);
  assert.equal(noBind.body.card.name, '仅名片');
  assert.equal(noBind.body.card.cardType, 'personal');
  assert.equal(noBind.body.card.city, '广州');

  // 2. 数字口令不存在：返回400，不创建名片
  //    第21轮：个人入驻已切换为兑换码，旧 projects.invite_code 不再通用于个人
  const badBind = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '坏口令', bindCode: '999999', applyType: 'individual' });
  assert.equal(badBind.status, 400);
  assert.match(badBind.body.error, /兑换码无效/);

  // 3. 无效字符串口令：返回400
  const badStr = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '坏口令2', bindCode: 'not-exist-code', applyType: 'individual' });
  assert.equal(badStr.status, 400);

  // 4. 姓名缺失：返回400
  const noName = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ position: 'x' });
  assert.equal(noName.status, 400);
  assert.match(noName.body.error, /姓名/);
});

test('个人入驻+企业入驻', async () => {
  const token = await wxLogin('merge_flow_2');

  // 第21轮：个人入驻改用「一人一码」的兑换码；企业入驻仍用旧 projects.invite_code('1001')。
  // 生成兑换码走的就是租户后台管理页要用的同一 ...codes.js 工具，避免测试自己另造一套。
  const { createDb } = await import('../src/db.js');
  const { generateJoinCodes } = await import('../src/utils/codes.js');
  const db = createDb(config.dbPath);
  const { codes } = generateJoinCodes(db, { customerId: 1, batchId: 0, count: 1 });

  // 个人入驻
  const individual = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '个人甲', position: '产品经理', phone: '13800138000', bindCode: codes[0], applyType: 'individual', isPublic: true });
  assert.equal(individual.status, 200);
  assert.equal(individual.body.card.cardType, 'personal');
  assert.equal(individual.body.applyStatus, 'pending');
  // 码已被占用：status=1 且关联到刚建的入驻主体
  const used = db.prepare('SELECT status, used_by, apply_id FROM tenant_join_code WHERE code = ?').get(codes[0]);
  assert.equal(used.status, 1, '入驻后兑换码应处于已占用状态');
  assert.ok(used.apply_id > 0, '兑换码应回写关联到入驻主体 apply_id');

  // 企业入驻（本轮不动，仍走旧 invite_code，验证未被误伤）
  const enterprise = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: '企业主', position: 'CEO', city: '深圳',
      bindCode: '1001', applyType: 'enterprise',
      enterpriseName: '测试企业有限公司', industry: '互联网', isPublic: true,
    });
  assert.equal(enterprise.status, 200);
  assert.equal(enterprise.body.card.cardType, 'company');
  assert.equal(enterprise.body.applyStatus, 'pending', '企业入驻申请应为审核中（审核通过后关联企业）');

  // 企业缺少企业名称：400
  const noEntName = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '企业主2', bindCode: '1001', applyType: 'enterprise' });
  assert.equal(noEntName.status, 400);
  assert.match(noEntName.body.error, /企业名称/);
});

test('第21轮：兑换码一人一码 / 用完即废 / 拒绝归还', async () => {
  const { createDb } = await import('../src/db.js');
  const { generateJoinCodes } = await import('../src/utils/codes.js');
  const db = createDb(config.dbPath);
  unlockQuota(db);
  const { codes } = generateJoinCodes(db, { customerId: 1, batchId: 0, count: 1 });
  const code = codes[0];

  // ① 甲用这个码入驻 → 成功，码被占用
  const t1 = await wxLogin('joincode_user_a');
  const a = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${t1}`)
    .send({ name: '甲', phone: '13800000001', bindCode: code, applyType: 'individual' });
  assert.equal(a.status, 200, a.body.error);

  // ② 乙拿同一个码入驻 → 必须被拒，这正是「一人一码」的落点
  //    （旧静态口令模型下这两人都会成功，就是用户要解决的痛点）
  const t2 = await wxLogin('joincode_user_b');
  const b = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${t2}`)
    .send({ name: '乙', phone: '13800000002', bindCode: code, applyType: 'individual' });
  assert.equal(b.status, 400);
  assert.match(b.body.error, /已被/);

  // ③ 管理员审核通过 → 码进入终态「已核销」(2)
  const applyId = db.prepare('SELECT apply_id FROM tenant_join_code WHERE code = ?').get(code).apply_id;
  db.prepare("UPDATE tenant_individuals SET status='pending' WHERE id = ?").run(applyId);
  const ok = await reviewIndividual(db, applyId, 'approve');
  assert.equal(ok.status, 200, ok.body.error);
  const after = db.prepare('SELECT status FROM tenant_join_code WHERE code = ?').get(code);
  assert.equal(after.status, 2, '审核通过后兑换码应为已核销');

  // ④ 已核销的码再被使用 → 拒绝且提示已使用
  const t3 = await wxLogin('joincode_user_c');
  const c = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${t3}`)
    .send({ name: '丙', phone: '13800000003', bindCode: code, applyType: 'individual' });
  assert.equal(c.status, 400);
  assert.match(c.body.error, /已被使用/);
});

test('第21轮：审核拒绝后兑换码归还为未使用（不白瞎一个码）', async () => {
  const { createDb } = await import('../src/db.js');
  const { generateJoinCodes } = await import('../src/utils/codes.js');
  const db = createDb(config.dbPath);
  unlockQuota(db);
  const { codes } = generateJoinCodes(db, { customerId: 1, batchId: 0, count: 1 });
  const code = codes[0];

  const t = await wxLogin('joincode_reject_user');
  const res = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${t}`)
    .send({ name: '被拒者', phone: '13800000004', bindCode: code, applyType: 'individual' });
  assert.equal(res.status, 200, res.body.error);
  assert.equal(db.prepare('SELECT status FROM tenant_join_code WHERE code = ?').get(code).status, 1);

  const applyId = db.prepare('SELECT apply_id FROM tenant_join_code WHERE code = ?').get(code).apply_id;
  const reject = await reviewIndividual(db, applyId, 'reject');
  assert.equal(reject.status, 200, reject.body.error);
  const row = db.prepare('SELECT status, used_by, apply_id FROM tenant_join_code WHERE code = ?').get(code);
  assert.equal(row.status, 0, '拒绝后应回滚成未使用，用户可凭原码重申请');
  assert.equal(row.used_by, 0);
  assert.equal(row.apply_id, 0);
});

test('名片作品集API', async () => {
  const token = await wxLogin('merge_works_1');
  // 先创建名片
  const created = await request(app)
    .post('/api/card/cards')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '作品测试', position: '设计师' });
  assert.equal(created.status, 200);
  const cardId = created.body.card.id;

  // 空作品列表
  const empty = await request(app).get(`/api/card/cards/${cardId}/works`);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.works, []);

  // 插入一条作品后列表返回该作品（验证表与API连通）
  const { createDb } = await import('../src/db.js');
  const db = createDb(config.dbPath);
  db.prepare('INSERT INTO card_works (card_id, image_url, title) VALUES (?, ?, ?)').run(cardId, 'https://example.com/w1.jpg', '作品一');
  const filled = await request(app).get(`/api/card/cards/${cardId}/works`);
  assert.equal(filled.status, 200);
  assert.equal(filled.body.works.length, 1);
  assert.equal(filled.body.works[0].title, '作品一');
  assert.equal(filled.body.works[0].imageUrl, 'https://example.com/w1.jpg');
});

test('名片动态/视频API+ownerMemberLevel', async () => {
  const token = await wxLogin('merge_dyn_1');
  const created = await request(app)
    .post('/api/card/cards')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '动态测试', position: '运营' });
  const cardId = created.body.card.id;

  // 空动态/视频
  const emptyDyn = await request(app).get(`/api/card/cards/${cardId}/dynamics`);
  assert.equal(emptyDyn.status, 200);
  assert.deepEqual(emptyDyn.body.dynamics, []);
  const emptyVid = await request(app).get(`/api/card/cards/${cardId}/videos`);
  assert.equal(emptyVid.status, 200);
  assert.deepEqual(emptyVid.body.videos, []);

  const { createDb } = await import('../src/db.js');
  const db = createDb(config.dbPath);
  // 动态（含title/like/comment）
  db.prepare(`INSERT INTO card_dynamic (user_id, card_id, title, content, images, like_count, comment_count, visibility, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'public', 'active')`)
    .run(created.body.card.userId, cardId, '测试动态标题', '测试动态内容', '[]', 3, 1);
  const dyn = await request(app).get(`/api/card/cards/${cardId}/dynamics`);
  assert.equal(dyn.status, 200);
  assert.equal(dyn.body.dynamics.length, 1);
  assert.equal(dyn.body.dynamics[0].title, '测试动态标题');
  assert.equal(dyn.body.dynamics[0].likeCount, 3);
  assert.equal(dyn.body.dynamics[0].commentCount, 1);

  // 视频（视频号链接调用模型：finderUserName + feedId；访客仅见 is_show=1 且 feedId 非空）
  db.prepare('INSERT INTO card_videos (card_id, title, cover_url, duration, finder_user_name, feed_id) VALUES (?,?,?,?,?,?)')
    .run(cardId, '测试视频', 'https://example.com/v1.jpg', '00:30', 'sphTest000001', 'MTY3ODQ5MTIzNDU2');
  const vid = await request(app).get(`/api/card/cards/${cardId}/videos`);
  assert.equal(vid.status, 200);
  assert.equal(vid.body.videos.length, 1);
  assert.equal(vid.body.videos[0].title, '测试视频');
  assert.equal(vid.body.videos[0].duration, '00:30');

  // ownerMemberLevel: 新用户默认free
  const detail = await request(app).get(`/api/card/cards/${cardId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.card.ownerMemberLevel, 'free');
  // 设为gold后返回gold
  db.prepare("UPDATE platform_user SET member_level='gold', member_expire_at='2030-01-01 00:00:00' WHERE id=?").run(created.body.card.userId);
  const detail2 = await request(app).get(`/api/card/cards/${cardId}`);
  assert.equal(detail2.body.card.ownerMemberLevel, 'gold');
});

test('访客雷达summary增强（昵称/标签/行为/对比）', async () => {
  const token = await wxLogin('merge_radar_1');
  const created = await request(app)
    .post('/api/card/cards')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '雷达测试', position: '老板' });
  const cardId = created.body.card.id;

  const { createDb } = await import('../src/db.js');
  const db = createDb(config.dbPath);
  // 访客雷达为付费功能：测试用户设为黄金会员解锁
  db.prepare("UPDATE platform_user SET member_level='gold', member_expire_at='2030-01-01 00:00:00' WHERE id=?").run(created.body.card.userId);

  // 造一条访客记录（昵称张三 + 2次访问 + exchange动作）
  const u = db.prepare('INSERT INTO platform_user (openid, nickname, created_at, updated_at) VALUES (?,?,?,?)')
    .run('mock_radar_visitor1', '张三', new Date().toISOString(), new Date().toISOString());
  const vUserId = Number(u.lastInsertRowid);
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`INSERT INTO card_visitor (card_id, visitor_openid, visitor_user_id, visit_date, visit_count, duration, pages, last_visit_at)
    VALUES (?,?,?,?,?,?,?,datetime('now'))`)
    .run(cardId, 'mock_radar_v1', vUserId, today, 2, 35, '[]');
  db.prepare("INSERT INTO card_visitor_action (card_id, visitor_openid, action_type, action_detail) VALUES (?,?,?,?)")
    .run(cardId, 'mock_radar_v1', 'exchange', '交换电子名片');

  const res = await request(app).get('/api/card/visitors/summary').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.today >= 1);
  const v = res.body.visitors.find((x) => x.visitorOpenid === 'mock_radar_v1');
  assert.ok(v, '访客应返回');
  assert.equal(v.nickname, '张三');
  assert.equal(v.tag, '已交换名片');
  assert.equal(v.behavior, '访问2次 · 停留35秒');
  assert.ok(v.timeAgo);
  // 较昨日对比字段存在
  assert.ok(typeof res.body.diff === 'number');
});

test('访客标签按最近动作推断(video→观看视频, visit2次→高意向)', async () => {
  const token = await wxLogin('merge_radar_2');
  const created = await request(app)
    .post('/api/card/cards')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '标签测试', position: '顾问' });
  const cardId = created.body.card.id;
  const { createDb } = await import('../src/db.js');
  const db = createDb(config.dbPath);
  db.prepare("UPDATE platform_user SET member_level='gold', member_expire_at='2030-01-01 00:00:00' WHERE id=?").run(created.body.card.userId);

  // 访客A：最近动作video
  const u1 = db.prepare('INSERT INTO platform_user (openid, nickname, created_at, updated_at) VALUES (?,?,?,?)')
    .run('mock_tag_v1', '王总', new Date().toISOString(), new Date().toISOString());
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`INSERT INTO card_visitor (card_id, visitor_openid, visitor_user_id, visit_date, visit_count, duration, pages, last_visit_at)
    VALUES (?,?,?,?,?,?,?,datetime('now'))`)
    .run(cardId, 'mock_tag_v1', Number(u1.lastInsertRowid), today, 1, 56, '[]');
  db.prepare("INSERT INTO card_visitor_action (card_id, visitor_openid, action_type, action_detail, created_at) VALUES (?,?,?,?,datetime('now','-1 hour'))")
    .run(cardId, 'mock_tag_v1', 'video', '观看视频');
  // 访客B：最近动作exchange
  const u2 = db.prepare('INSERT INTO platform_user (openid, nickname, created_at, updated_at) VALUES (?,?,?,?)')
    .run('mock_tag_v2', '李女士', new Date().toISOString(), new Date().toISOString());
  db.prepare(`INSERT INTO card_visitor (card_id, visitor_openid, visitor_user_id, visit_date, visit_count, duration, pages, last_visit_at)
    VALUES (?,?,?,?,?,?,?,datetime('now'))`)
    .run(cardId, 'mock_tag_v2', Number(u2.lastInsertRowid), today, 1, 18, '[]');
  db.prepare("INSERT INTO card_visitor_action (card_id, visitor_openid, action_type, action_detail, created_at) VALUES (?,?,?,?,datetime('now','-2 hour'))")
    .run(cardId, 'mock_tag_v2', 'exchange', '交换电子名片');
  // 访客C：无动作但2次访问 → 高意向
  const u3 = db.prepare('INSERT INTO platform_user (openid, nickname, created_at, updated_at) VALUES (?,?,?,?)')
    .run('mock_tag_v3', '张先生', new Date().toISOString(), new Date().toISOString());
  db.prepare(`INSERT INTO card_visitor (card_id, visitor_openid, visitor_user_id, visit_date, visit_count, duration, pages, last_visit_at)
    VALUES (?,?,?,?,?,?,?,datetime('now'))`)
    .run(cardId, 'mock_tag_v3', Number(u3.lastInsertRowid), today, 2, 42, '[]');

  const res = await request(app).get('/api/card/visitors/summary').set('Authorization', `Bearer ${token}`);
  const v1 = res.body.visitors.find((x) => x.visitorOpenid === 'mock_tag_v1');
  const v2 = res.body.visitors.find((x) => x.visitorOpenid === 'mock_tag_v2');
  const v3 = res.body.visitors.find((x) => x.visitorOpenid === 'mock_tag_v3');
  assert.equal(v1.tag, '观看视频');
  assert.equal(v2.tag, '已交换名片');
  assert.equal(v3.tag, '高意向');
});

test('访客已读标记：按行 id 标记，仅清该条红点（匿名访客 openid 相同也不能串）', async () => {
  const token = await wxLogin('merge_radar_3');
  const created = await request(app)
    .post('/api/card/cards')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '已读测试', position: '顾问' });
  const cardId = created.body.card.id;
  const { createDb } = await import('../src/db.js');
  const db = createDb(config.dbPath);
  db.prepare("UPDATE platform_user SET member_level='gold', member_expire_at='2030-01-01 00:00:00' WHERE id=?").run(created.body.card.userId);

  const today = new Date().toISOString().slice(0, 10);
  // 两条访客记录：openid 都是 'anonymous'（真实流量里匿名访客共享同一 openid）。
  // 旧实现按 visitor_openid 标记已读 → 一次会清掉所有匿名访客红点（用户反馈：只看一条、红点全没）。
  const a1 = db.prepare(`INSERT INTO card_visitor (card_id, visitor_openid, visit_date, visit_count, duration, pages, last_visit_at)
    VALUES (?,?,?,?,?,?,datetime('now'))`).run(cardId, 'anonymous', today, 1, 10, '[]');
  const a2 = db.prepare(`INSERT INTO card_visitor (card_id, visitor_openid, visit_date, visit_count, duration, pages, last_visit_at)
    VALUES (?,?,?,?,?,?,datetime('now'))`).run(cardId, 'anonymous', today, 1, 20, '[]');
  const id1 = Number(a1.lastInsertRowid);
  const id2 = Number(a2.lastInsertRowid);

  const before = await request(app).get('/api/card/visitors/summary').set('Authorization', `Bearer ${token}`);
  const anon = before.body.visitors.filter((x) => x.visitorOpenid === 'anonymous');
  assert.equal(anon.length, 2, '应有两个匿名访客条目');
  assert.ok(anon.every((x) => x.unread === true), '初始都应未读');

  // 只标记第一条已读（按行 id，不是 openid）
  const mark = await request(app).post(`/api/card/visitors/${id1}/read`).set('Authorization', `Bearer ${token}`);
  assert.equal(mark.status, 200);
  assert.equal(mark.body.ok, true);

  const after = await request(app).get('/api/card/visitors/summary').set('Authorization', `Bearer ${token}`);
  const after1 = after.body.visitors.find((x) => x.id === id1);
  const after2 = after.body.visitors.find((x) => x.id === id2);
  assert.equal(after1.unread, false, '被标记的第一条应已读');
  assert.equal(after2.unread, true, '同 openid 的第二条红点不应被误清（修复前会全清）');
});
