import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';

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
  const badBind = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '坏口令', bindCode: '999999', applyType: 'individual' });
  assert.equal(badBind.status, 400);
  assert.match(badBind.body.error, /口令无效/);

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

  // 预置一个客户项目（customer_id=1 由迁移默认创建）
  // 个人入驻
  const individual = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '个人甲', position: '产品经理', phone: '13800138000', bindCode: '1001', applyType: 'individual', isPublic: true });
  assert.equal(individual.status, 200);
  assert.equal(individual.body.card.cardType, 'personal');

  // 企业入驻
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

  // 视频
  db.prepare('INSERT INTO card_videos (card_id, title, cover_url, duration) VALUES (?,?,?,?)')
    .run(cardId, '测试视频', 'https://example.com/v1.jpg', '00:30');
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

test('访客已读标记：summary未读→标记已读→红点消失', async () => {
  const token = await wxLogin('merge_radar_3');
  const created = await request(app)
    .post('/api/card/cards')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '已读测试', position: '顾问' });
  const cardId = created.body.card.id;
  const { createDb } = await import('../src/db.js');
  const db = createDb(config.dbPath);
  const u = db.prepare('INSERT INTO platform_user (openid, nickname, created_at, updated_at) VALUES (?,?,?,?)')
    .run('mock_read_v1', '周先生', new Date().toISOString(), new Date().toISOString());
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`INSERT INTO card_visitor (card_id, visitor_openid, visitor_user_id, visit_date, visit_count, duration, pages, last_visit_at)
    VALUES (?,?,?,?,?,?,?,datetime('now'))`)
    .run(cardId, 'mock_read_v1', Number(u.lastInsertRowid), today, 1, 10, '[]');

  const before = await request(app).get('/api/card/visitors/summary').set('Authorization', `Bearer ${token}`);
  const v = before.body.visitors.find((x) => x.visitorOpenid === 'mock_read_v1');
  assert.equal(v.unread, true, '初始应未读');

  const mark = await request(app).post('/api/card/visitors/mock_read_v1/read').set('Authorization', `Bearer ${token}`);
  assert.equal(mark.status, 200);
  assert.equal(mark.body.ok, true);

  const after = await request(app).get('/api/card/visitors/summary').set('Authorization', `Bearer ${token}`);
  const v2 = after.body.visitors.find((x) => x.visitorOpenid === 'mock_read_v1');
  assert.equal(v2.unread, false, '标记后应已读');
});
