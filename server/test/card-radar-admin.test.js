/**
 * 阶段B 后台管理测试：雷达事件/话术库/推送模板/收藏管理 + 会员套餐（新权益字段）
 * 覆盖：鉴权 401 / 事件 CRUD（含重名 400、删除连带话术）/ 话术 CRUD /
 *       推送模板读写 / 收藏列表与删除 / 套餐 CRUD（features+新字段、重名 400、删除降级 free）
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';

let app, db, tmpDir, adminToken;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-admin-test-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'admin.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  app = createApp();
  db = createDb(config.dbPath);
});

after(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('准备平台管理员并登录', async () => {
  const { hash, salt } = hashPassword('admin123');
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status) VALUES ('admin','13800000000',?,?,'admin','active')").run(hash, salt);
  const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  assert.equal(login.status, 200);
  adminToken = login.body.token;
  assert.ok(adminToken);
});

test('鉴权：未登录访问后台 401', async () => {
  const r = await request(app).get('/api/admin/radar/events');
  assert.equal(r.status, 401);
  const r2 = await request(app).get('/api/admin/member-packages');
  assert.equal(r2.status, 401);
});

test('雷达事件 CRUD：列表/新建/重名400/更新/删除连带话术', async () => {
  const auth = { Authorization: `Bearer ${adminToken}` };
  // 预置 9 个平台事件应可见
  const list0 = await request(app).get('/api/admin/radar/events').set(auth);
  assert.equal(list0.status, 200);
  assert.ok(list0.body.events.length >= 9, '应含预置事件');
  const names = list0.body.events.map((e) => e.name);
  ['view', 'exchange', 'share', 'form'].forEach((n) => assert.ok(names.includes(n), `缺事件 ${n}`));

  // 新建自定义事件
  const create = await request(app).post('/api/admin/radar/events').set(auth).send({ name: 'book_visit', title: '预约到访', importance: 2, weight: 5, noticeType: 0 });
  assert.equal(create.status, 201);
  const evId = create.body.event.id;

  // 重名 400
  const dup = await request(app).post('/api/admin/radar/events').set(auth).send({ name: 'book_visit', title: '重复' });
  assert.equal(dup.status, 400);

  // 更新：标题/权重/开关
  const upd = await request(app).put(`/api/admin/radar/events/${evId}`).set(auth).send({ title: '预约到访（改）', weight: 6, enabled: false });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.event.title, '预约到访（改）');
  assert.equal(upd.body.event.weight, 6);
  assert.equal(upd.body.event.enabled, 0);

  // 挂一条话术后删除事件 → 话术连带清理
  const word = await request(app).post('/api/admin/radar/words').set(auth).send({ eventId: evId, timeStart: 1, timeEnd: 0, words: '预约到访跟进话术' });
  assert.equal(word.status, 201);
  const del = await request(app).delete(`/api/admin/radar/events/${evId}`).set(auth);
  assert.equal(del.status, 200);
  const orphan = db.prepare('SELECT id FROM card_radar_words WHERE event_id=?').get(evId);
  assert.equal(orphan, undefined, '删除事件应连带清理话术');
});

test('话术 CRUD：分组列表/新增/编辑/删除', async () => {
  const auth = { Authorization: `Bearer ${adminToken}` };
  const ev = db.prepare("SELECT * FROM card_radar_event WHERE tenant_id=0 AND name='share'").get();
  const add = await request(app).post('/api/admin/radar/words').set(auth).send({ eventId: ev.id, timeStart: 1, timeEnd: 3, words: '转发第1-3次话术' });
  assert.equal(add.status, 201);
  const wid = add.body.word.id;

  const list = await request(app).get('/api/admin/radar/words').set(auth);
  assert.equal(list.status, 200);
  const g = list.body.groups.find((x) => x.name === 'share');
  assert.ok(g && g.words.some((w) => w.id === wid), '分组列表应含新话术');

  const upd = await request(app).put(`/api/admin/radar/words/${wid}`).set(auth).send({ timeEnd: 5, words: '转发话术（改）' });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.word.words, '转发话术（改）');

  const del = await request(app).delete(`/api/admin/radar/words/${wid}`).set(auth);
  assert.equal(del.status, 200);
  const gone = db.prepare('SELECT id FROM card_radar_words WHERE id=?').get(wid);
  assert.equal(gone, undefined);
});

test('推送模板：默认空 → 保存 → 读回', async () => {
  const auth = { Authorization: `Bearer ${adminToken}` };
  const g0 = await request(app).get('/api/admin/radar/push-config').set(auth);
  assert.equal(g0.status, 200);
  assert.equal(g0.body.config.switch, 0);

  const save = await request(app).post('/api/admin/radar/push-config').set(auth).send({ switch: 1, xcxTmpid: 'TPL_XCX_01', gzhAppid: 'wx_gzh', gzhTmpid: 'TPL_GZH_02' });
  assert.equal(save.status, 200);

  const g1 = await request(app).get('/api/admin/radar/push-config').set(auth);
  assert.equal(g1.body.config.switch, 1);
  assert.equal(g1.body.config.xcxTmpid, 'TPL_XCX_01');
  assert.equal(g1.body.config.gzhAppid, 'wx_gzh');
  assert.equal(g1.body.config.gzhTmpid, 'TPL_GZH_02');
});

test('收藏管理：列表含名片信息 + 删除', async () => {
  const auth = { Authorization: `Bearer ${adminToken}` };
  // 造数据：两用户 + 名片 + 收藏
  const mkUser = (code) => request(app).post('/api/card/auth/wx-login').send({ code });
  const t1 = await mkUser('collect_u1'); const t2 = await mkUser('collect_u2');
  const tok1 = t1.body.token; const uid1 = JSON.parse(Buffer.from(tok1.split('.')[0], 'base64').toString()).uid;
  const card = await request(app).post('/api/card/cards').set('Authorization', `Bearer ${tok1}`).send({ name: '收藏测试名片' });
  const cardId = card.body.card.id;
  await request(app).post('/api/card/collect').set('Authorization', `Bearer ${t2.body.token}`).send({ cardId });

  const list = await request(app).get('/api/admin/radar/collects').set(auth);
  assert.equal(list.status, 200);
  assert.ok(list.body.total >= 1);
  const mine = list.body.collects.find((c) => c.card_id === cardId);
  assert.ok(mine, '收藏列表应含新收藏');
  assert.equal(mine.card_name, '收藏测试名片', '应 join 名片名称');
  assert.ok(mine.collector_name, '应 join 收藏者昵称');

  const del = await request(app).delete(`/api/admin/radar/collects/${mine.id}`).set(auth);
  assert.equal(del.status, 200);
  const gone = db.prepare('SELECT id FROM card_collect WHERE id=?').get(mine.id);
  assert.equal(gone, undefined);
});

test('会员套餐 CRUD：列表(features+新字段)/新建/重名400/更新权益/删除降级free', async () => {
  const auth = { Authorization: `Bearer ${adminToken}` };
  // 列表：预置 4 档应含迁移后的新字段与 features 枚举
  const list0 = await request(app).get('/api/admin/member-packages').set(auth);
  assert.equal(list0.status, 200);
  assert.ok(list0.body.packages.length >= 4, '应含预置套餐');
  const gold = list0.body.packages.find((p) => p.level === 'gold');
  assert.ok(gold, '应含 gold 套餐');
  assert.ok(gold.features.includes('quota_lead'), 'gold 应含 quota_lead 能力点（迁移后）');
  assert.equal(typeof gold.collect_limit, 'number', '应含 collect_limit 新字段');
  assert.equal(typeof gold.discount, 'number', '应含 discount 新字段');

  // feature-options
  const opts = await request(app).get('/api/admin/member-packages/feature-options').set(auth);
  assert.equal(opts.status, 200);
  assert.ok(opts.body.options.includes('ai_report'));
  assert.ok(opts.body.options.includes('enterprise'));

  // 新建（含配额字段）
  const create = await request(app).post('/api/admin/member-packages').set(auth).send({ level: 'vip_test', name: '测试套餐', price: 19.9, durationDays: 90, features: ['ai_report'], discount: 0.85, collectLimit: 10, leadQuota: 10, pushQuota: 5, voiceEnabled: true, groupLimit: 3 });
  assert.equal(create.status, 201);
  const pid = create.body.package.id;
  assert.equal(create.body.package.lead_quota, 10, '新建套餐应写入 lead_quota');
  assert.equal(create.body.package.push_quota, 5, '新建套餐应写入 push_quota');

  // 重名 400
  const dup = await request(app).post('/api/admin/member-packages').set(auth).send({ level: 'vip_test', name: '重复' });
  assert.equal(dup.status, 400);

  // 更新权益字段（含配额）
  const upd = await request(app).put(`/api/admin/member-packages/${pid}`).set(auth).send({ discount: 0.9, collectLimit: 20, leadQuota: 30, features: ['ai_report', 'ai_words', 'quota_lead'], enabled: false });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.package.discount, 0.9);
  assert.equal(upd.body.package.collect_limit, 20);
  assert.equal(upd.body.package.lead_quota, 30, '更新应写入 lead_quota');
  assert.equal(upd.body.package.push_quota, 5, '未传 pushQuota 应保留原值');
  assert.equal(upd.body.package.voice_enabled, 1, '未传 voiceEnabled 应保留原值');
  assert.deepEqual(JSON.parse(upd.body.package.features), ['ai_report', 'ai_words', 'quota_lead']);

  // 给用户挂该等级后删除 → 用户降级 free
  const login = await request(app).post('/api/card/auth/wx-login').send({ code: 'pkg_user' });
  const uTok = login.body.token;
  const uid = JSON.parse(Buffer.from(uTok.split('.')[0], 'base64').toString()).uid;
  db.prepare("UPDATE platform_user SET member_level='vip_test', member_expire_at='2027-01-01T00:00:00' WHERE id=?").run(uid);
  const del = await request(app).delete(`/api/admin/member-packages/${pid}`).set(auth);
  assert.equal(del.status, 200);
  const u = db.prepare('SELECT member_level, member_expire_at FROM platform_user WHERE id=?').get(uid);
  assert.equal(u.member_level, 'free', '删除套餐后引用用户应降级 free');
  assert.equal(u.member_expire_at, null);
});
