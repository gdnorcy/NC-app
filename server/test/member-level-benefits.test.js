/**
 * 会员等级 × 应用 权益矩阵读写测试（saveLevelBenefits / getLevelBenefits / benefitsCatalog + 路由）
 *
 * 钉死：写入侧校验拒绝（未知键/跨应用/超 HARD_CAPS）/ 跨租户隔离 / UPSERT 覆盖 /
 *       空对象清空回落目录默认 / 保存后 resolveAppBenefits 真兑现 / 路由鉴权。
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createMemberService, resolveAppBenefits } from '../src/services/member.js';

describe('等级 × 应用 权益矩阵读写', () => {
  let db, member;
  const DB_PATH = path.join(os.tmpdir(), `member-level-benefits-test-${Date.now()}.db`);
  const T = 88301;
  const OTHER = 88399; // 跨租户

  before(() => {
    db = createDb(DB_PATH);
    member = createMemberService(db);
  });
  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

  const addLevel = (tid, name) => member.addLevel(tid, { levelNo: 1, name });

  it('保存合法矩阵并回显；UPSERT 覆盖而非追加', () => {
    const lv = addLevel(T, '矩阵档A');
    let r = member.saveLevelBenefits(T, lv.id, 'card', { works_limit: 40, voice_enabled: 1 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.benefits, { works_limit: 40, voice_enabled: 1 });
    r = member.saveLevelBenefits(T, lv.id, 'card', { works_limit: 80 });
    assert.equal(r.ok, true);
    assert.deepEqual(member.getLevelBenefits(T, lv.id), { card: { works_limit: 80 } }, '整行覆盖：voice_enabled 应被清掉');
    const n = db.prepare('SELECT COUNT(*) AS n FROM member_level_app_benefits WHERE tenant_id = ? AND level_id = ? AND app_code = ?').get(T, lv.id, 'card').n;
    assert.equal(n, 1, 'UPSERT 不得产生重复行');
  });

  it('保存 mall/member 权益（折扣百分比 + 积分倍率语义）', () => {
    const lv = addLevel(T, '矩阵档B');
    assert.equal(member.saveLevelBenefits(T, lv.id, 'mall', { discount: 80, price_visible: 1 }).ok, true);
    assert.equal(member.saveLevelBenefits(T, lv.id, 'member', { point_rate: 2, rebate: 5 }).ok, true);
    assert.deepEqual(member.getLevelBenefits(T, lv.id), {
      mall: { discount: 80, price_visible: 1 }, member: { point_rate: 2, rebate: 5 },
    });
  });

  it('校验失败整体拒绝：未知键 / 跨应用键 / 超 HARD_CAPS', () => {
    const lv = addLevel(T, '矩阵档C');
    assert.equal(member.saveLevelBenefits(T, lv.id, 'card', { nope: 1 }).ok, false);
    assert.equal(member.saveLevelBenefits(T, lv.id, 'card', { discount: 10 }).ok, false, 'discount 属 mall');
    assert.equal(member.saveLevelBenefits(T, lv.id, 'card', { works_limit: 501 }).ok, false);
    assert.deepEqual(member.getLevelBenefits(T, lv.id), {}, '拒绝后不得落任何行');
  });

  it('等级不存在 / 跨租户越权拒绝', () => {
    assert.equal(member.saveLevelBenefits(T, 999999, 'card', { works_limit: 1 }).ok, false);
    const lv = addLevel(OTHER, '别租户档');
    assert.equal(member.saveLevelBenefits(T, lv.id, 'card', { works_limit: 1 }).ok, false, '不能写别租户的等级');
    assert.equal(member.saveLevelBenefits(OTHER, lv.id, 'card', { works_limit: 1 }).ok, true, '归属租户可写');
  });

  it('空对象清空覆盖 → resolveAppBenefits 回落目录默认', () => {
    const lv = addLevel(T, '矩阵档D');
    member.saveLevelBenefits(T, lv.id, 'card', { works_limit: 200 });
    member.saveLevelBenefits(T, lv.id, 'card', {});
    assert.deepEqual(member.getLevelBenefits(T, lv.id), { card: {} });
    db.prepare('INSERT INTO platform_user (id, openid, customer_id) VALUES (?,?,?)').run(88351, 'lb-u1', T);
    db.prepare("INSERT INTO member_user (tenant_id, user_id, level_id, status, expire_at) VALUES (?,?,?, 'active', '2999-12-31 23:59:59')")
      .run(T, 88351, lv.id);
    const b = resolveAppBenefits(db, T, 88351, 'card');
    assert.equal(b.works_limit, 3, '清空后回落目录默认 3');
  });

  it('保存后 resolveAppBenefits 兑现矩阵覆盖值', () => {
    const lv = addLevel(T, '矩阵档E');
    member.saveLevelBenefits(T, lv.id, 'card', { works_limit: 120, voice_enabled: 1 });
    db.prepare('INSERT INTO platform_user (id, openid, customer_id) VALUES (?,?,?)').run(88352, 'lb-u2', T);
    db.prepare("INSERT INTO member_user (tenant_id, user_id, level_id, status, expire_at) VALUES (?,?,?, 'active', '2999-12-31 23:59:59')")
      .run(T, 88352, lv.id);
    const b = resolveAppBenefits(db, T, 88352, 'card');
    assert.equal(b.works_limit, 120);
    assert.equal(b.voice_enabled, true);
  });

  it('benefitsCatalog：全量目录含 kind/unit/app_scope + 硬上限', () => {
    const r = member.benefitsCatalog();
    assert.ok(Array.isArray(r.catalog) && r.catalog.length >= 20);
    assert.equal(r.hardCaps.works_limit, 500);
    const d = r.catalog.find((c) => c.type === 'discount');
    assert.equal(d.app_scope, 'mall');
    assert.equal(d.kind, 'number');
    assert.equal(d.unit, '%');
  });
});

describe('等级权益矩阵路由（租户后台）', () => {
  let db, app, server, tenantToken;
  let tmpDir;
  let levelId = 0;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'member-level-benefits-route-'));
    const prev = { ...config };
    Object.assign(config, {
      dataDir: tmpDir, uploadsDir: path.join(tmpDir, 'uploads'), dbPath: path.join(tmpDir, 'test.db'),
      webDistDir: path.join(tmpDir, 'web-dist'), storageProvider: 'local',
      storageProviders: JSON.stringify({ local: {} }), adminUser: 'admin', adminPass: 'admin123',
    });
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    db = createDb(config.dbPath);
    app = createApp({ db });
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    globalThis.__mlbPrev = prev;
    const { hashPassword } = await import('../src/db.js');
    const { hash, salt } = hashPassword('admin123');
    db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('t1','13800000009',?,?,'tenant_admin','active',1)").run(hash, salt);
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (1, '一号客户', 'active', '[\"card\"]')").run();
    tenantToken = (await request(app).post('/api/auth/login').send({ username: 't1', password: 'admin123' })).body.token;
    // 直接服务层建一个测试等级（路由 POST /member/levels 亦可，这里少一层依赖）
    levelId = createMemberService(db).addLevel(1, { levelNo: 50, name: '路由测试档' }).id;
  });
  after(() => {
    try { server?.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, globalThis.__mlbPrev);
  });

  it('GET /member/benefits/catalog 返回目录数组', async () => {
    const r = await request(app).get('/api/customer/member/benefits/catalog').set('Authorization', `Bearer ${tenantToken}`);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.catalog) && r.body.catalog.length >= 20);
  });

  it('GET /member/levels/:id/benefits 回显矩阵', async () => {
    const r = await request(app).get(`/api/customer/member/levels/${levelId}/benefits`).set('Authorization', `Bearer ${tenantToken}`);
    assert.equal(r.status, 200);
    assert.ok(typeof r.body.benefits === 'object');
  });

  it('PUT /member/levels/:id/benefits：合法 200，超上限 400', async () => {
    let r = await request(app).put(`/api/customer/member/levels/${levelId}/benefits`)
      .set('Authorization', `Bearer ${tenantToken}`).send({ appCode: 'card', benefits: { works_limit: 100 } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.benefits, { works_limit: 100 });
    r = await request(app).put(`/api/customer/member/levels/${levelId}/benefits`)
      .set('Authorization', `Bearer ${tenantToken}`).send({ appCode: 'card', benefits: { works_limit: 501 } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /上限/);
  });

  it('PUT 未登录 401', async () => {
    const r = await request(app).put(`/api/customer/member/levels/${levelId}/benefits`)
      .send({ appCode: 'card', benefits: { works_limit: 1 } });
    assert.equal(r.status, 401);
  });
});
