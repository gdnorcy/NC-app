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

test('C1 集市设置支持 style/notice 读写', async () => {
  const r = await request(app).get('/api/card-market/market/settings').set(authT(t1Token));
  assert.equal(r.status, 200);
  assert.equal(r.body.settings.style, 'A');

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
