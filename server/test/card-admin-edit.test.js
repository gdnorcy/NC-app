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
 * 后台「代编辑名片」（2026-10-20 用户需求：可在后台编辑名片）
 * - GET  /card/manage/:id：租户作用域内回填全字段；他租户/已删除 404
 * - PUT  /card/manage/:id：基础资料字段白名单；跨租户 404；空提交 400
 * - 经纬度必须成对合法才写（单给一个不写，防止把「导航」改坏）
 * - 与用户自编辑分离：不做会员门禁，videoChannel 直接落库（管理动作）
 */
let app;
let tmpDir;
let db;
let adm1;
let adm2;
let card1;
let cardOther;

function bearer(u) {
  return { Authorization: `Bearer ${issueToken(u)}` };
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-card-edit-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });

  db.prepare(`INSERT INTO projects (customer_name, description, status, invite_code, solutions)
    VALUES ('租户二', '', 'active', '2002', '["panorama","card"]')`).run();
  const { hash, salt } = hashPassword('Test@123');
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('edit_tadm1', '13800003001', hash, salt, 'tenant_admin', 'active', 1);
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('edit_tadm2', '13800003002', hash, salt, 'tenant_admin', 'active', 2);
  adm1 = db.prepare("SELECT * FROM users WHERE username = 'edit_tadm1'").get();
  adm2 = db.prepare("SELECT * FROM users WHERE username = 'edit_tadm2'").get();

  const mkUser = (openid, cid) => db.prepare(
    "INSERT INTO platform_user (openid, nickname, customer_id, status) VALUES (?, ?, ?, 'active')"
  ).run(openid, openid, cid).lastInsertRowid;

  const u1 = mkUser('edit_u1', 1);
  const u2 = mkUser('edit_u2', 2);
  const mkCard = (uid, cid, name) => db.prepare(
    `INSERT INTO card_profile (user_id, customer_id, name, position, company, status, is_public)
     VALUES (?, ?, ?, ?, ?, 'active', 1)`
  ).run(uid, cid, name, '顾问', '零壹科技').lastInsertRowid;
  card1 = mkCard(u1, 1, '编辑测试名片');
  cardOther = mkCard(u2, 2, '他租户名片');
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('GET /card/manage/:id 回填全字段（含 wechat/bio/slogan/address 等编辑表单字段）', async () => {
  const res = await request(app).get(`/api/customer/card/manage/${card1}`).set(bearer(adm1));
  assert.equal(res.status, 200);
  const c = res.body.card;
  assert.equal(c.id, card1);
  assert.equal(c.name, '编辑测试名片');
  for (const k of ['name', 'position', 'company', 'phone', 'wechat', 'email', 'city', 'industry', 'bio', 'slogan', 'address', 'videoChannel', 'isPublic']) {
    assert.ok(k in c, `缺少字段 ${k}`);
  }
});

test('GET：他租户名片 404（租户隔离）', async () => {
  const res = await request(app).get(`/api/customer/card/manage/${cardOther}`).set(bearer(adm1));
  assert.equal(res.status, 404);
});

test('PUT 代编辑基础资料并公开状态，DB 落库', async () => {
  const res = await request(app).put(`/api/customer/card/manage/${card1}`).set(bearer(adm1)).send({
    name: '管理员改过', position: '总经理', phone: '13911112222',
    bio: '后台代编辑的个人简介', videoChannel: 'sphJXxSYwt39JX5', isPublic: false,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const row = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(card1);
  assert.equal(row.name, '管理员改过');
  assert.equal(row.position, '总经理');
  assert.equal(row.phone, '13911112222');
  assert.equal(row.bio, '后台代编辑的个人简介');
  assert.equal(row.video_channel, 'sphJXxSYwt39JX5');
  assert.equal(row.is_public, 0);
  assert.ok(row.updated_at);
});

test('PUT：跨租户 404，他租户名片改不动', async () => {
  const res = await request(app).put(`/api/customer/card/manage/${cardOther}`).set(bearer(adm1)).send({ name: '越权' });
  assert.equal(res.status, 404);
  const row = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(cardOther);
  assert.equal(row.name, '他租户名片');
});

test('PUT：空提交 400；经纬度单给一个不落库，成对合法才落库', async () => {
  const empty = await request(app).put(`/api/customer/card/manage/${card1}`).set(bearer(adm1)).send({});
  assert.equal(empty.status, 400);

  // 只给 latitude：拒绝写（防止 openLocation 半废）。列默认 0 = 未设置语义
  await request(app).put(`/api/customer/card/manage/${card1}`).set(bearer(adm1)).send({ latitude: 23.02 });
  let row = db.prepare('SELECT latitude, longitude FROM card_profile WHERE id = ?').get(card1);
  assert.equal(Number(row.latitude), 0);
  assert.equal(Number(row.longitude), 0);

  // 成对合法：写入
  const ok = await request(app).put(`/api/customer/card/manage/${card1}`).set(bearer(adm1)).send({ latitude: 23.0207, longitude: 113.7518 });
  assert.equal(ok.status, 200);
  row = db.prepare('SELECT latitude, longitude FROM card_profile WHERE id = ?').get(card1);
  assert.equal(Math.abs(row.latitude - 23.0207) < 1e-9, true);
  assert.equal(Math.abs(row.longitude - 113.7518) < 1e-9, true);
});
