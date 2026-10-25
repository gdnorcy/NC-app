import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';
import { createQuotaService } from '../src/services/quota.js';
import { createRadarService } from '../src/services/radar.js';
import { issueToken } from '../src/auth.js';
import { grantTier } from './helpers/member-grant.js';

/**
 * 会员套餐「空头权益」回归锁（新模型：平台权益目录 + 租户套餐 × 应用 × member_user）
 *
 * 此前 voice_enabled / discount / push_quota 是「后台能配、C 端能吹、服务端不认」的空头权益。
 * 本轮把它们接进真实链路（benefits.js / quota.js 统一消费 resolveAppBenefits），这里逐条钉死：
 *   ① voice_enabled → POST /voice-upload 与 POST /voice-history 真门禁
 *   ② discount     → POST /templates/:id/purchase 下单实付真打折（百分比：0=无折扣，80=打2折/实付20%）
 *   ③ push_quota   → radar.sendNotify 超限降级站内提醒（不再是只统计不拦截）
 *   ④ group_limit  → 下架：后台写入不再落库
 *   ⑤ /member/status 暴露 entitlements，C 端「我的权益」有数可依
 */

let app;
let tmpDir;
let db;
let adminToken;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-entitle-test-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  app = createApp();
  db = createDb(config.dbPath);

  const { hash, salt } = hashPassword('Test@123');
  const info = db.prepare(
    "INSERT INTO users (username, phone, password_hash, password_salt, role, status) VALUES (?,?,?,?,?,?)"
  ).run('ent_adm', '13800000010', hash, salt, 'admin', 'active');
  adminToken = issueToken(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** 登录并返回 token + uid */
async function login(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200);
  const token = res.body.token;
  const uid = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString()).uid;
  return { token, uid };
}

/** 升到指定档位（新模型：tenant 1 + member_user + 矩阵走 TIER_PKG 种子） */
function grantLevel(uid, tier, matrixOverride = {}) {
  grantTier(db, uid, 1, tier, matrixOverride);
}

const MP3 = Buffer.from('ID3-fake-audio-bytes-0001');

// ---------------------------------------------------------------- ① 语音简介门禁

test('voice_enabled：db 播种给付费档开了语音（silver/gold/diamond），free 未开', () => {
  const rows = db.prepare("SELECT level, voice_enabled FROM member_package WHERE level IN ('free','silver','gold','diamond')").all();
  const by = Object.fromEntries(rows.map((r) => [r.level, r.voice_enabled]));
  assert.equal(by.free, 0, 'free 不应含语音');
  assert.equal(by.silver, 1);
  assert.equal(by.gold, 1);
  assert.equal(by.diamond, 1);
});

test('voice_enabled：free 用户上传语音 403，升级 silver 后 201', async () => {
  const { token, uid } = await login('ent_voice_1');
  const denied = await request(app)
    .post('/api/card/voice-upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', MP3, { filename: 'intro.mp3', contentType: 'audio/mpeg' });
  assert.equal(denied.status, 403);
  assert.match(denied.body.error, /会员权益/);
  assert.equal(denied.body.code, 'voiceNotEntitled');

  grantLevel(uid, 'silver');
  const ok = await request(app)
    .post('/api/card/voice-upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', MP3, { filename: 'intro.mp3', contentType: 'audio/mpeg' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
});

test('voice_enabled：录音上传 POST /voice-history 同一道门禁', async () => {
  const { token, uid } = await login('ent_voice_2');
  const denied = await request(app)
    .post('/api/card/voice-history')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', MP3, { filename: 'rec.mp3', contentType: 'audio/mpeg' })
    .field('durationSec', '8');
  assert.equal(denied.status, 403);

  grantLevel(uid, 'silver');
  const ok = await request(app)
    .post('/api/card/voice-history')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', MP3, { filename: 'rec.mp3', contentType: 'audio/mpeg' })
    .field('durationSec', '8');
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
});

// ---------------------------------------------------------------- ② 模板折扣（百分比）

test('discount：会员买模板按折扣实付，非会员原价（discount 为百分比 0~100）', async () => {
  // 造一个「平台付费模板 + 租户已买断」的组合，使 C 端可见且价 10 元
  const tpl = db.prepare(
    "INSERT INTO card_templates (name, tenant_id, price, enabled, sort_order) VALUES (?, 0, 10, 1, 0)"
  ).run('折扣测试模板');
  const tplId = Number(tpl.lastInsertRowid);
  db.prepare(
    "INSERT INTO tenant_asset_purchases (tenant_id, asset_type, asset_key, c_price) VALUES (1, 'card_template', ?, 10)"
  ).run(String(tplId));

  // silver 套餐 mall.discount=80（即打 2 折，实付 20%）
  const plain = await login('ent_disc_plain');
  db.prepare('UPDATE platform_user SET customer_id = 1 WHERE id = ?').run(plain.uid);
  const r1 = await request(app)
    .post(`/api/card/templates/${tplId}/purchase`)
    .set('Authorization', `Bearer ${plain.token}`)
    .send({});
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.amount, 1000, '非会员应原价 10.00 元');
  assert.equal(r1.body.discount, 0, '非会员折扣应为 0');
  assert.equal(r1.body.savedAmount, 0);

  const vip = await login('ent_disc_vip');
  grantLevel(vip.uid, 'silver', { mall: { discount: 80 } });
  const r2 = await request(app)
    .post(`/api/card/templates/${tplId}/purchase`)
    .set('Authorization', `Bearer ${vip.token}`)
    .send({});
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(r2.body.discount, 80, 'silver 折扣百分比应为 80');
  assert.equal(r2.body.originAmount, 1000);
  assert.equal(r2.body.amount, 200, '80 折扣应实付 2.00 元（原价 20%）');
  assert.equal(r2.body.savedAmount, 800);

  // 重复购买会再下一单（解锁时机在支付成功回调写 user_template_purchases，
  // 未支付时 userOwnedTemplates 查不到记录）——这里只确认折扣口径稳定，不去重逻辑不变
  const r3 = await request(app)
    .post(`/api/card/templates/${tplId}/purchase`)
    .set('Authorization', `Bearer ${vip.token}`)
    .send({});
  assert.equal(r3.status, 200, JSON.stringify(r3.body));
  assert.notEqual(r3.body.orderNo, r2.body.orderNo);
  assert.equal(r3.body.amount, 200, '折扣应稳定可复现');
});

// ---------------------------------------------------------------- ③ 推送配额

test('push_quota：radar 超限时降级为站内提醒（channel 0 + reason）', async () => {
  const { uid } = await login('ent_push_1');
  grantLevel(uid, 'silver', { radar: { push_quota: 1 } });

  // 配齐推送通道，确保降级原因只能是配额而不是「通道未接通」
  db.prepare(
    "INSERT OR REPLACE INTO card_radar_push_config (tenant_id, switch, xcx_tmpid, gzh_appid, gzh_tmpid) VALUES (1, 1, 'TMPX', '', '')"
  ).run();

  const radar = createRadarService(db);
  const quota = createQuotaService(db);
  assert.equal(quota.canPush(uid), true, '额度 1 且未用 → 可推送');

  const r1 = radar.sendNotify(1, uid, { name: 'view', title: '有人看了你的名片', notice_type: 1 }, { name: '访客A' });
  assert.equal(r1.channel, 1, '首次应走真实通道');
  assert.equal(r1.degraded, undefined);

  assert.equal(quota.quotaLeft(uid, 'push').used, 1, '真实通道条数应计入已用');
  assert.equal(quota.canPush(uid), false, '额度 1 用满后应拦截');

  const r2 = radar.sendNotify(1, uid, { name: 'view', title: '又有人看了你的名片', notice_type: 1 }, { name: '访客B' });
  assert.equal(r2.channel, 0, '超限应降级为站内提醒');
  assert.equal(r2.degraded, true);
  assert.equal(r2.reason, 'push_quota_exceeded');

  // 站内提醒不计入推送配额（channel 0 不占额）
  assert.equal(quota.quotaLeft(uid, 'push').used, 1);
});

// ---------------------------------------------------------------- ④ group_limit 下架

test('group_limit：后台传了 groupLimit 也不再落库（列取默认 0）', async () => {
  const create = await request(app)
    .post('/api/admin/member-packages')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ level: 'ent_no_group', name: '无建群数套餐', price: 9.9, durationDays: 30, groupLimit: 5, voiceEnabled: true });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  assert.equal(create.body.package.group_limit, 0, 'group_limit 应已下架，不再写入');
  assert.equal(create.body.package.voice_enabled, 1, 'voice_enabled 仍正常写入');
});

// ---------------------------------------------------------------- ⑤ /member/status 暴露权益

test('/member/status 暴露 entitlements（语音/折扣/三配额）', async () => {
  const { token, uid } = await login('ent_status_1');
  const before = await request(app).get('/api/card/member/status').set('Authorization', `Bearer ${token}`);
  assert.equal(before.status, 200);
  assert.equal(before.body.entitlements.voice, false, 'free 用户 voice 应为 false');
  assert.equal(before.body.entitlements.discount, 0, 'free 用户 discount 应为 0');
  assert.ok(before.body.entitlements.push, '应含 push 配额');
  assert.ok(before.body.entitlements.lead, '应含 lead 配额');
  assert.ok(before.body.entitlements.collect, '应含 collect 配额');

  grantLevel(uid, 'silver', { mall: { discount: 80 } });
  const after = await request(app).get('/api/card/member/status').set('Authorization', `Bearer ${token}`);
  assert.equal(after.body.entitlements.voice, true, 'silver 用户 voice 应为 true');
  assert.equal(after.body.entitlements.discount, 80, 'silver 折扣百分比应为 80（上一条用例设置）');
});
