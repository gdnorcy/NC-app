/**
 * 运营型雷达 + VIP 权益扩展（阶段A）后端测试
 * 覆盖：resolveTenant 三态 / 事件命中与未命中 / 意向分边界 / 话术区间（含0不限） /
 *       推送开关关闭不阻塞上报 / quota 各等级 / 留资写入与配额扣减 / 收藏/取消/超限 / 会员门槛 / CSV导出
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { createRadarService } from '../src/services/radar.js';
import { createQuotaService } from '../src/services/quota.js';

let app, db, tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-radar-test-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'radar.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  app = createApp();
  db = createDb(config.dbPath);
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function wxLogin(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200);
  return res.body.token;
}

async function createCard(token, name) {
  const res = await request(app)
    .post('/api/card/cards')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, position: '顾问', isPublic: true });
  assert.equal(res.status, 200);
  return res.body.card.id;
}

function setMember(userId, level, expireAt = '2027-01-01T00:00:00') {
  db.prepare("UPDATE platform_user SET member_level=?, member_expire_at=? WHERE id=?").run(level, expireAt, userId);
}

function uidFromToken(token) {
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString()).uid;
}

// ---------- 测试数据 ----------
let tokA, tokB, tokC, tokD, tokE;
let cardA, cardB, cardC;

test('准备测试用户与名片', async () => {
  tokA = await wxLogin('radar_a'); // 名片主（无租户 → 0）
  tokB = await wxLogin('radar_b'); // 个人入驻 → tenant 11
  tokC = await wxLogin('radar_c'); // 企业员工 → tenant 22
  tokD = await wxLogin('radar_d'); // 收藏用户
  tokE = await wxLogin('radar_e'); // 收藏限流用第二张名片
  cardA = await createCard(tokA, '雷达测试A');
  cardB = await createCard(tokB, '雷达测试B');
  cardC = await createCard(tokC, '雷达测试C');
  await createCard(tokE, '雷达测试E');
  assert.ok(cardA && cardB && cardC);
});

test('resolveTenant 三态：无租户=0 / 个人入驻=11 / 企业员工=22', () => {
  const radar = createRadarService(db);
  assert.equal(radar.resolveTenant(cardA), 0, '无租户应为 0');
  db.prepare('INSERT INTO tenant_individuals (customer_id, user_id, name, status) VALUES (11, ?, ?, ?)')
    .run(uidFromToken(tokB), '个人入驻B', 'active');
  assert.equal(radar.resolveTenant(cardB), 11, '个人入驻反查应为 11');
  db.prepare('INSERT INTO tenant_enterprise_employees (enterprise_id, customer_id, user_id, name, role, status) VALUES (5, 22, ?, ?, ?, ?)')
    .run(uidFromToken(tokC), '企业员工C', 'member', 'active');
  assert.equal(radar.resolveTenant(cardC), 22, '企业员工反查应为 22');
  // 同步绑定用户表 customer_id（requireTenant 依赖 user.customer_id 直接绑定）
  db.prepare('UPDATE platform_user SET customer_id=11 WHERE id=?').run(uidFromToken(tokB));
  db.prepare('UPDATE platform_user SET customer_id=22 WHERE id=?').run(uidFromToken(tokC));
  // 造真实项目（requireTenant → checkTenantAccess 要求 active + 已开通 card 方案）
  db.prepare("INSERT INTO projects (id, customer_name, status, solutions) VALUES (11, '雷达测试项目', 'active', '[\"panorama\",\"card\"]')").run();
  db.prepare("INSERT INTO projects (id, customer_name, status, solutions) VALUES (22, '雷达企业项目', 'active', '[\"panorama\",\"card\"]')").run();
});

test('track 命中事件：写意向分 + 高意向事件落站内提醒（无配置降级，不阻塞上报）', async () => {
  const r1 = await request(app).post('/api/card/visitor/track').send({ cardId: cardA, visitorOpenid: 'v1', actionType: 'view', duration: 40 });
  assert.equal(r1.status, 200);
  const intent1 = db.prepare('SELECT * FROM card_radar_intent WHERE owner_user_id=? AND visitor_openid=?').get(uidFromToken(tokA), 'v1');
  assert.ok(intent1, 'view 事件应写入意向分');
  assert.equal(intent1.score, 35, 'view: weight1*20 + hit1*5 + 时长>30s 加10 = 35');
  assert.equal(intent1.hit_count, 1);

  const r2 = await request(app).post('/api/card/visitor/track').send({ cardId: cardA, visitorOpenid: 'v1', actionType: 'exchange', actionDetail: '交换名片', duration: 200 });
  assert.equal(r2.status, 200);
  const intent2 = db.prepare('SELECT * FROM card_radar_intent WHERE owner_user_id=? AND visitor_openid=?').get(uidFromToken(tokA), 'v1');
  assert.equal(intent2.score, 100, 'exchange: 4*20+30+min(10,20)+10=120 → 封顶100');
  assert.equal(intent2.hit_count, 2);

  // 高意向事件（importance>=2）→ 站内提醒落库（channel 未接 → 0 降级）
  const notify = db.prepare('SELECT * FROM card_radar_notify WHERE owner_user_id=? AND event_name=?').get(uidFromToken(tokA), 'exchange');
  assert.ok(notify, 'exchange 应落站内提醒');
  assert.equal(notify.channel, 0, '通道未配置应降级站内');
  assert.equal(notify.status, 'pending');
});

test('track 未命中事件：不写意向分、不报错', async () => {
  const r = await request(app).post('/api/card/visitor/track').send({ cardId: cardA, visitorOpenid: 'v2', actionType: 'unknown_event_x', duration: 5 });
  assert.equal(r.status, 200);
  const intent = db.prepare('SELECT * FROM card_radar_intent WHERE owner_user_id=? AND visitor_openid=?').get(uidFromToken(tokA), 'v2');
  assert.equal(intent, undefined, '未命中事件不应写意向分');
});

test('话术时间区间匹配（含 0 不限）', () => {
  const radar = createRadarService(db);
  const ev = db.prepare("SELECT * FROM card_radar_event WHERE tenant_id=0 AND name='view'").get();
  db.prepare('INSERT INTO card_radar_words (tenant_id, event_id, time_start, time_end, words) VALUES (0, ?, 1, 3, ?)').run(ev.id, '第1-3次话术');
  db.prepare('INSERT INTO card_radar_words (tenant_id, event_id, time_start, time_end, words) VALUES (0, ?, 4, 0, ?)').run(ev.id, '第4次起话术');
  assert.equal(radar.pickWords(0, ev.id, 2), '第1-3次话术', '第2次命中区间1-3');
  assert.equal(radar.pickWords(0, ev.id, 5), '第4次起话术', '第5次命中 time_end=0 不限区间');
  assert.equal(radar.pickWords(0, ev.id, 99), '第4次起话术', '99次仍命中不限区间');
});

test('推送开关关闭不阻塞上报（config.switch=0 时 track 正常且提醒落库降级）', async () => {
  db.prepare('INSERT INTO card_radar_push_config (tenant_id, switch) VALUES (11, 0)').run();
  const r = await request(app).post('/api/card/visitor/track').send({ cardId: cardB, visitorOpenid: 'v3', actionType: 'comment', actionDetail: '很专业' });
  assert.equal(r.status, 200, '开关关闭时上报仍成功');
  const notify = db.prepare('SELECT * FROM card_radar_notify WHERE owner_user_id=? AND event_name=?').get(uidFromToken(tokB), 'comment');
  assert.ok(notify, '开关关闭时仍落站内提醒（降级）');
});

test('quota：planOf / hasFeature / quotaLeft / canCollect 各等级', () => {
  const quota = createQuotaService(db);
  const uidA = uidFromToken(tokA), uidB = uidFromToken(tokB), uidD = uidFromToken(tokD);
  // free：无套餐、无 feature、留资配额 0、收藏不限（collect_limit 默认 0）
  assert.equal(quota.planOf(uidA), null, 'free 用户 planOf 应为 null');
  assert.equal(quota.hasFeature(uidA, 'ai_report'), false);
  const qFree = quota.quotaLeft(uidA, 'lead');
  assert.equal(qFree.limit, 0);
  assert.equal(quota.canCollect(uidA), true, 'collect_limit=0 不限');
  // gold：套餐生效 + quota_lead 可用 + 留资配额 50
  setMember(uidA, 'gold');
  assert.equal(quota.planOf(uidA).level, 'gold');
  assert.equal(quota.hasFeature(uidA, 'quota_lead'), true);
  const qGold = quota.quotaLeft(uidA, 'lead');
  assert.equal(qGold.limit, 50);
  assert.ok(qGold.unlimited === false);
  // silver + collect_limit=2：收藏限 2
  db.prepare("UPDATE member_package SET collect_limit=2 WHERE level='silver'").run();
  setMember(uidD, 'silver');
  const qCollect = quota.quotaLeft(uidD, 'collect');
  assert.equal(qCollect.limit, 2);
  assert.equal(quota.canCollect(uidD), true);
  // 已收藏 2 个 → 超限
  db.prepare('INSERT INTO card_collect (card_id, user_id) VALUES (?,?)').run(cardB, uidD);
  db.prepare('INSERT INTO card_collect (card_id, user_id) VALUES (?,?)').run(cardC, uidD);
  assert.equal(quota.canCollect(uidD), false, '收藏 2/2 应超限');
  assert.equal(quota.quotaLeft(uidD, 'collect').left, 0);
  // diamond：push 配额 100（方案占位）+ lead 配额 50
  setMember(uidA, 'diamond');
  const qPush = quota.quotaLeft(uidA, 'push');
  assert.equal(qPush.limit, 100, 'diamond push_quota 应为 100（占位）');
  assert.equal(qPush.unlimited, false);
  const qDia = quota.quotaLeft(uidA, 'lead');
  assert.equal(qDia.limit, 50, 'diamond lead_quota 应为 50（占位）');
  setMember(uidA, 'gold'); // 还原，供后续用例使用
  // 无租户的 B 不在此测试段，避免与 track 段冲突
});

test('收藏 / 取消收藏 / 超限拦截', async () => {
  // 正常路径：tokA（gold，collect_limit=0 不限）
  const add = await request(app).post('/api/card/collect').set('Authorization', `Bearer ${tokA}`).send({ cardId: cardB });
  assert.equal(add.status, 200);
  assert.equal(add.body.collected, true);
  const dup = await request(app).post('/api/card/collect').set('Authorization', `Bearer ${tokA}`).send({ cardId: cardB });
  assert.equal(dup.status, 200, '重复收藏幂等');
  const list = await request(app).get('/api/card/collects').set('Authorization', `Bearer ${tokA}`);
  assert.equal(list.status, 200);
  assert.ok(list.body.collects.some((c) => c.cardId === cardB), '收藏列表应含 cardB');
  const del = await request(app).delete('/api/card/collect?cardId=' + cardB).set('Authorization', `Bearer ${tokA}`);
  assert.equal(del.status, 200);
  assert.equal(del.body.collected, false);
  // 超限拦截：uidD（silver，collect_limit=2）在 quota 用例已收藏 cardB/cardC 满 2 个 → 再收藏新名片 403
  const tokF = await wxLogin('radar_f');
  const cardF = await createCard(tokF, '雷达测试F');
  const blocked = await request(app).post('/api/card/collect').set('Authorization', `Bearer ${tokD}`).send({ cardId: cardF });
  assert.equal(blocked.status, 403, '超过 collect_limit 应 403');
  assert.equal(blocked.body.limitHit, true);
});

test('留资写入：card_lead + 客户池 + form 高意向事件 + 站内提醒', async () => {
  const r = await request(app).post('/api/card/leads').send({ cardId: cardA, name: '李四', phone: '13800138000' });
  assert.equal(r.status, 200);
  const lead = db.prepare('SELECT * FROM card_lead WHERE owner_user_id=? AND phone=?').get(uidFromToken(tokA), '13800138000');
  assert.ok(lead, 'card_lead 应写入留资');
  assert.equal(lead.source, 'radar');
  const client = db.prepare('SELECT * FROM card_customer WHERE owner_user_id=? AND phone=?').get(uidFromToken(tokA), '13800138000');
  assert.ok(client, '留资应入客户池');
  assert.ok(JSON.parse(client.tags || '[]').includes('radar'), '客户 tags 应含 radar');
  const formIntent = db.prepare("SELECT * FROM card_radar_intent WHERE owner_user_id=? AND visitor_openid=''").get(uidFromToken(tokA));
  assert.ok(formIntent, '留资应触发 form 高意向事件写意向分');
  const formNotify = db.prepare("SELECT * FROM card_radar_notify WHERE owner_user_id=? AND event_name='form'").get(uidFromToken(tokA));
  assert.ok(formNotify, '留资应落 form 站内提醒');
  // 配额扣减：gold 留资配额 50，used 至少 1
  const q = createQuotaService(db).quotaLeft(uidFromToken(tokA), 'lead');
  assert.ok(q.used >= 1);
});

test('留资配额拦截：free 名片不限；会员超限 403 引导升级', async () => {
  // free 名片主（tokE）：无有效套餐 → 不限，提交成功
  const cardE2 = await createCard(tokE, '雷达测试E2');
  const freeLead = await request(app).post('/api/card/leads').send({ cardId: cardE2, name: '王五', phone: '13900139000' });
  assert.equal(freeLead.status, 200, 'free 名片主留资不应受限');

  // gold 名片主（tokA，quota 用例已 setMember gold 并留资 1 条）：lead_quota=1 → 第 2 条 403
  db.prepare("UPDATE member_package SET lead_quota=1 WHERE level='gold'").run();
  const blocked = await request(app).post('/api/card/leads').send({ cardId: cardA, name: '赵六', phone: '13700137000' });
  assert.equal(blocked.status, 403, 'gold 留资超限应 403');
  assert.equal(blocked.body.limitHit, true);
  assert.match(blocked.body.error, /升级会员/, '提示应引导升级');
  const blockedRow = db.prepare("SELECT id FROM card_lead WHERE owner_user_id=? AND phone='13700137000'").get(uidFromToken(tokA));
  assert.equal(blockedRow, undefined, '被拦截的留资不应落库');
  db.prepare("UPDATE member_package SET lead_quota=50 WHERE level='gold'").run(); // 还原
});

test('高潜榜会员门槛：free locked / gold 数据；CSV 导出', async () => {
  // free 用户（tokE 新注册）→ locked
  const locked = await request(app).get('/api/card/radar/top-leads').set('Authorization', `Bearer ${tokE}`);
  assert.equal(locked.status, 200);
  assert.equal(locked.body.locked, true, 'free 用户高潜榜应 locked');
  // gold 用户（tokA 已升级）→ 有数据
  const leads = await request(app).get('/api/card/radar/top-leads').set('Authorization', `Bearer ${tokA}`);
  assert.equal(leads.status, 200);
  assert.equal(leads.body.locked, undefined);
  assert.ok(Array.isArray(leads.body.leads));
  const top = leads.body.leads.find((l) => l.visitorOpenid === 'v1');
  assert.ok(top, '高潜榜应包含 v1 访客');
  assert.equal(top.level, '高意向', 'v1 意向分100应为高意向');
  // CSV 导出
  const csv = await request(app).get('/api/card/radar/export').set('Authorization', `Bearer ${tokA}`);
  assert.equal(csv.status, 200);
  assert.ok(csv.text.includes('访客openid'));
  assert.ok(csv.text.includes('v1'));
  // 站内提醒列表
  const notifies = await request(app).get('/api/card/radar/notifies').set('Authorization', `Bearer ${tokA}`);
  assert.equal(notifies.status, 200);
  assert.ok(notifies.body.notifies.some((n) => n.eventName === 'form'), '提醒列表应含 form');
});

test('订阅授权上报留存 + 雷达配置读写', async () => {
  const sub = await request(app).post('/api/card/radar/subscribe').set('Authorization', `Bearer ${tokA}`).send({ granted: true, tmplIds: ['TPL_1', 'TPL_2'] });
  assert.equal(sub.status, 200);
  const rec = db.prepare('SELECT * FROM card_radar_subscribe WHERE user_id=?').get(uidFromToken(tokA));
  assert.ok(rec && rec.granted === 1, '订阅授权应留存');
  // 配置：无租户用户查看 → null；写配置需租户（tokB 有租户 11）
  const cfg0 = await request(app).get('/api/card/radar/config').set('Authorization', `Bearer ${tokB}`);
  assert.equal(cfg0.status, 200);
  const write = await request(app).post('/api/card/radar/config').set('Authorization', `Bearer ${tokB}`).send({ switch: 1, xcxTmpid: 'X_TMP' });
  assert.equal(write.status, 200);
  const cfg1 = await request(app).get('/api/card/radar/config').set('Authorization', `Bearer ${tokB}`);
  assert.equal(cfg1.body.config.switch, 1);
  assert.equal(cfg1.body.config.xcxTmpid, 'X_TMP');
});

test('话术配置路由：新增话术并列表可见', async () => {
  const ev = db.prepare("SELECT * FROM card_radar_event WHERE tenant_id=0 AND name='share'").get();
  const add = await request(app).post('/api/card/radar/words').set('Authorization', `Bearer ${tokB}`).send({ eventId: ev.id, timeStart: 0, timeEnd: 0, words: '看到你转发了名片，需要帮您介绍下吗' });
  assert.equal(add.status, 200);
  const list = await request(app).get('/api/card/radar/words').set('Authorization', `Bearer ${tokB}`);
  assert.equal(list.status, 200);
  const shareGroup = list.body.groups.find((g) => g.name === 'share');
  assert.ok(shareGroup && shareGroup.words.some((w) => w.words.includes('转发')), '话术列表应含新增的 share 话术');
});

test('转发链记录与列表', async () => {
  const track = await request(app).post('/api/card/radar/share').send({ cardId: cardA, fromUserId: uidFromToken(tokA), toOpenid: 'wx_openid_9', shareUrl: 'https://x/share/1' });
  assert.equal(track.status, 200);
  const shares = await request(app).get('/api/card/radar/shares').set('Authorization', `Bearer ${tokA}`);
  assert.equal(shares.status, 200);
  assert.ok(shares.body.shares.some((s) => s.toOpenid === 'wx_openid_9'), '转发链应记录被转发者');
});
