import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';
import { issueToken } from '../src/auth.js';
import { generateJoinCodes } from '../src/utils/codes.js';

/**
 * 集市状态一致性回归（2026-10-15 真机报修）：
 * 「我的名片-集市状态一直显示没上架，公开状态里已上架了」。
 *
 * 病根：C 端「公开到人脉集市」开关只写 card_profile.is_public（服务端仅 admin 客户列表消费），
 * 从不建 card_market_items；而 myCard 集市状态 / market 列表只认 card_market_items。
 * 修复：C 端开关经 utils/marketLink.js 联动 toggle；服务端反向闭环——
 * /market/toggle 与 /market/force-remove 增删记录时同步 is_public，
 * 否则用户在 market.vue 下架后再进展示设置页，会被存量自愈重新上架。
 *
 * 本文件锁服务端反向闭环 + PUT 保持纯可见性语义（不越权代建上架记录）。
 */
let app;
let tmpDir;
let db;

function makeJwt(user) {
  return issueToken(user);
}

async function wxLogin(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200);
  return res.body.token;
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

// 模拟租户管理员审核通过（等价 apply/audit approve：active + 绑定租户）
function approveApply(openid, customerId = 1) {
  const u = db.prepare('SELECT id FROM platform_user WHERE openid = ?').get('mock_' + openid);
  if (!u) throw new Error('no user ' + openid);
  const userId = u.id;
  const ind = db.prepare('SELECT id FROM tenant_individuals WHERE user_id = ? AND status = ? ORDER BY id DESC LIMIT 1').get(userId, 'pending');
  assert.ok(ind, 'no pending individual apply for ' + openid);
  db.prepare("UPDATE tenant_individuals SET status = 'active' WHERE id = ?").run(ind.id);
  db.prepare('UPDATE platform_user SET customer_id = ?, identity_type = ? WHERE id = ?').run(customerId, 'individual', userId);
  db.prepare("UPDATE card_profile SET customer_id = ? WHERE user_id = ? AND (customer_id IS NULL OR customer_id = '')").run(customerId, userId);
  return { type: 'individual', id: ind.id, userId };
}

// 建卡 + 入驻 + 审核通过，返回 { token, userId, cardId, subjectId }
// 🔴 第21轮：个人入驻凭证已从静态 projects.invite_code 换成「一人一码」的兑换码，
//    这里改用 generateJoinCodes 现造一个码（旧 '1001' 对个人分支已失效）。
async function setupActiveIndividual(code, name) {
  const token = await wxLogin(code);
  const { codes } = generateJoinCodes(db, { customerId: 1, batchId: 0, count: 1 });
  const r = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set(bearer(token))
    .send({ name, bindCode: codes[0], applyType: 'individual', isPublic: false });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const approved = approveApply(code, 1);
  return { token, userId: approved.userId, cardId: r.body.card.id, subjectId: approved.id };
}

function cardPublicFlag(userId) {
  return db.prepare('SELECT is_public FROM card_profile WHERE user_id = ?').get(userId)?.is_public;
}

function hasMarketItem(subjectId) {
  return !!db.prepare("SELECT id FROM card_market_items WHERE customer_id = 1 AND subject_type = 'individual' AND subject_id = ?").get(subjectId);
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-market-public-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });

  // 租户1管理员（迁移默认创建 id=1, invite_code='1001'）
  const { hash, salt } = hashPassword('Test@123');
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('mp_adm1', '13800000031', hash, salt, 'tenant_admin', 'active', 1);
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('上架集市 → is_public 同步为 1，my-status 可见（myCard 不再「未上架」）', async () => {
  const { token, userId, subjectId } = await setupActiveIndividual('mp_on', '上架联动');
  assert.equal(cardPublicFlag(userId), 0, '前置：建卡时 isPublic=false');

  const tg = await request(app).post('/api/card-market/market/toggle').set(bearer(token))
    .send({ subjectType: 'individual', subjectId });
  assert.equal(tg.status, 200, JSON.stringify(tg.body));
  assert.equal(tg.body.inMarket, true);

  assert.ok(hasMarketItem(subjectId), 'card_market_items 应有上架记录');
  assert.equal(cardPublicFlag(userId), 1, '上架后 is_public 必须同步为 1（反向闭环）');

  const st = await request(app).get('/api/card-market/market/my-status').set(bearer(token));
  assert.equal(st.status, 200);
  assert.equal(st.body.items.length, 1, 'my-status 应返回 1 条上架记录');
  assert.equal(st.body.items[0].subjectId, subjectId);
});

test('下架集市 → is_public 同步为 0（防展示设置页存量自愈复活）', async () => {
  const { token, userId, subjectId } = await setupActiveIndividual('mp_off', '下架联动');

  await request(app).post('/api/card-market/market/toggle').set(bearer(token))
    .send({ subjectType: 'individual', subjectId });
  assert.equal(cardPublicFlag(userId), 1);

  const tg = await request(app).post('/api/card-market/market/toggle').set(bearer(token))
    .send({ subjectType: 'individual', subjectId });
  assert.equal(tg.status, 200);
  assert.equal(tg.body.inMarket, false);
  assert.equal(hasMarketItem(subjectId), false, '下架后 card_market_items 无记录');
  assert.equal(cardPublicFlag(userId), 0, '下架后 is_public 必须同步为 0');

  // my-status 无记录 → myCard 显示「未上架」是真实状态（与开关一致）
  const st = await request(app).get('/api/card-market/market/my-status').set(bearer(token));
  assert.equal(st.body.items.length, 0);
});

test('管理端强制下架 → is_public 同步为 0', async () => {
  const { token, userId, subjectId } = await setupActiveIndividual('mp_force', '强制下架');
  await request(app).post('/api/card-market/market/toggle').set(bearer(token))
    .send({ subjectType: 'individual', subjectId });
  assert.equal(cardPublicFlag(userId), 1);

  const item = db.prepare("SELECT id FROM card_market_items WHERE customer_id = 1 AND subject_type = 'individual' AND subject_id = ?").get(subjectId);
  const adm1 = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();
  const fr = await request(app).post('/api/card-market/market/force-remove').set(bearer(makeJwt(adm1)))
    .send({ itemId: item.id });
  assert.equal(fr.status, 200, JSON.stringify(fr.body));
  assert.equal(hasMarketItem(subjectId), false);
  assert.equal(cardPublicFlag(userId), 0, '强制下架后 is_public 必须同步为 0');
});

test('PUT /cards/:id 保持纯可见性语义：写 is_public 不代建上架记录', async () => {
  // 设计边界：is_public → card_market_items 的联动在 C 端 marketLink.js（带主体解析/审核/配额语义），
  // 服务端 PUT 若越权代建，会绕过 quota/audit_mode 且主体解析与 myCard 不一致。
  const { token, userId, cardId, subjectId } = await setupActiveIndividual('mp_put', 'PUT边界');
  assert.equal(hasMarketItem(subjectId), false);

  const up = await request(app).put(`/api/card/cards/${cardId}`).set(bearer(token)).send({ isPublic: true });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(cardPublicFlag(userId), 1, 'is_public 正常写入');
  assert.equal(hasMarketItem(subjectId), false, 'PUT 不代建 card_market_items（联动归 C 端）');

  // 部分更新语义不变：未传字段不受影响（回写 name 不应被清空）
  const card = db.prepare('SELECT name FROM card_profile WHERE id = ?').get(cardId);
  assert.equal(card.name, 'PUT边界');
});

test('存量坏数据自愈路径可复现：is_public=1 但无记录时 my-status 为空（C 端 heal 负责补建）', async () => {
  // 这就是真机报修瞬间的库状态：开关开着（旧代码只写 is_public），card_market_items 无记录。
  const { token, userId, subjectId } = await setupActiveIndividual('mp_legacy', '存量坏数据');
  db.prepare('UPDATE card_profile SET is_public = 1 WHERE user_id = ?').run(userId);
  assert.equal(cardPublicFlag(userId), 1);
  assert.equal(hasMarketItem(subjectId), false);

  const st = await request(app).get('/api/card-market/market/my-status').set(bearer(token));
  assert.equal(st.body.items.length, 0, '无记录 → myCard 显示「未上架」（与报修一致）');

  // C 端修复后：用户在展示设置页触发 heal → toggle 补建 → 两端一致
  const tg = await request(app).post('/api/card-market/market/toggle').set(bearer(token))
    .send({ subjectType: 'individual', subjectId });
  assert.equal(tg.status, 200);
  assert.ok(hasMarketItem(subjectId), 'heal 补建后应有上架记录');
  const st2 = await request(app).get('/api/card-market/market/my-status').set(bearer(token));
  assert.equal(st2.body.items.length, 1, 'heal 后 my-status 可见 → myCard 显示「已上架」');
});
