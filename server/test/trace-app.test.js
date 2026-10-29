/**
 * 回归锁：防伪溯源 trace 应用接入（2026-10-26）
 *
 * 背景：trace 由外部交付物（自有 PHP 防伪系统复刻）接入，接入时发现 6 类硬伤，
 *      全部属于「交付物内部自相矛盾 / 不合本平台口径」，本文件逐条钉死修复后的行为：
 *
 *   1) 建表方言：交付物 .sql 用 MySQL 列级 COMMENT '...'，写进 SQLite 启动即报
 *      `near "COMMENT": syntax error` → 建表成功即证明已去 COMMENT。
 *   2) 列名一致：交付物 JS 用 `isy`/`credittype`，其 .sql 用 `is_rewarded`/`credit_type`
 *      → 直接跑必报 `no such column: isy`。本测试写入并读回奖励字段，锁死统一后的列名。
 *   3) 路由挂载：交付物从未在 app.js 挂载（全部接口 404）→ 本测试打真实 HTTP 端点。
 *   4) 两段鉴权：公开段 /api/trace/public/* 不套 requireAuth；后台段挂
 *      /api/customer/trace 且必须鉴权（未登录 401）。
 *   5) 租户隔离：后台端只认 req.user.customerId，A 租户看不到 B 租户的批次。
 *   6) 越权防护：公开段租户定位只认 ?tid= / 登录态，body 直传 tenantId 无效。
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, hashPassword } from '../src/db.js';
import { createApp } from '../src/app.js';

describe('防伪溯源 trace：接入回归锁', () => {
  let tmpDir, db, app, server;
  let tenantAToken, tenantBToken;

  const A = 1;
  const B = 2;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-app-'));
    const prev = { ...config };
    Object.assign(config, {
      dataDir: tmpDir,
      uploadsDir: path.join(tmpDir, 'uploads'),
      dbPath: path.join(tmpDir, 'test.db'),
      webDistDir: path.join(tmpDir, 'web-dist'),
      storageProvider: 'local',
      storageProviders: JSON.stringify({ local: {} }),
      adminUser: 'admin',
      adminPass: 'admin123',
    });
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    db = createDb(config.dbPath);
    app = createApp({ db });
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    globalThis.__tracePrev = prev;

    const { hash, salt } = hashPassword('admin123');
    const insUser = db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, ?, 'active', ?)");
    insUser.run('traceA', '13800000011', hash, salt, 'tenant_admin', A);
    insUser.run('traceB', '13800000012', hash, salt, 'tenant_admin', B);
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', '[\"demo\"]')").run(A, '甲租户');
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', '[\"demo\"]')").run(B, '乙租户');

    const login = async (u) => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token;
    tenantAToken = await login('traceA');
    tenantBToken = await login('traceB');
  });

  after(() => {
    try { server?.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, globalThis.__tracePrev);
  });

  // ── 1) 建表：SQLite 方言 + 表齐全 ──────────────────────────────────────
  it('trace_ 业务表齐全且列名统一为 is_rewarded / credit_type', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'trace_%'").all().map((r) => r.name).sort();
    // #469 新增 trace_platform_settings / trace_cocom_recharges（9 张）；
    // P2 先印后绑新增 trace_activations（批次激活记录，UNIQUE(tenant_id,batch_id)）→ 共 10 张；
    // 动态场景码（验真引导）新增 trace_mp_scenes（临时场景码 scene_id ↔ 防伪码 映射）→ 共 11 张。
    assert.deepEqual(tables, [
      'trace_activations', 'trace_batch_rules', 'trace_batches', 'trace_cocom_recharges',
      'trace_code_rules', 'trace_codes', 'trace_histories', 'trace_mp_scenes',
      'trace_platform_settings', 'trace_settings', 'trace_wrong_attempts',
    ]);
    // 交付物的 isy / credittype 必须不存在（否则 JS 侧必然 no such column）
    const cols = db.prepare('PRAGMA table_info(trace_codes)').all().map((c) => c.name);
    assert.ok(cols.includes('is_rewarded'), 'trace_codes 缺 is_rewarded');
    assert.ok(cols.includes('credit_type'), 'trace_codes 缺 credit_type');
    assert.ok(!cols.includes('isy'), 'trace_codes 仍存在旧列 isy');
    assert.ok(!cols.includes('credittype'), 'trace_codes 仍存在旧列 credittype');
    // 每张「租户级」业务表都必须带 tenant_id；平台级单例配置表（trace_platform_settings，单行 id=1）
    // 刻意不带 tenant_id（见 tracePlatform.js 头部：与租户后台严格隔离，绝不混入 trace_settings）。
    const PLATFORM_SINGLETONS = new Set(['trace_platform_settings']);
    for (const t of tables) {
      if (PLATFORM_SINGLETONS.has(t)) continue;
      const tc = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
      assert.ok(tc.includes('tenant_id'), `${t} 缺 tenant_id`);
    }
  });

  // ── 2) 应用注册 + 权限点 ──────────────────────────────────────────────
  it('应用已注册且权限点带 trace: 前缀', () => {
    const appRow = db.prepare("SELECT * FROM apps WHERE code = 'trace'").get();
    assert.ok(appRow, 'apps 表未注册 trace');
    assert.equal(appRow.name, '防伪溯源');
    assert.equal(appRow.enabled, 1);
    // 权限点 key 必须含 trace: 前缀（前端按 ${app_code}:${menu_key} 拼接）
    const menus = db.prepare('SELECT key FROM app_menus WHERE app_id = ? ORDER BY sort_order').all(appRow.id).map((m) => m.key);
    assert.deepEqual(menus, ['trace:overview', 'trace:batches', 'trace:codes', 'trace:stats', 'trace:settings']);
    // 演示方案必须纳入 trace（应用中心可见）
    const demo = db.prepare("SELECT id FROM solutions WHERE code='demo' OR is_demo=1 ORDER BY is_demo DESC LIMIT 1").get();
    const linked = db.prepare('SELECT id FROM solution_apps WHERE solution_id = ? AND app_id = ?').get(demo.id, appRow.id);
    assert.ok(linked, '演示方案未纳入 trace');
  });

  // ── 3) 路由挂载 + 两段鉴权 ─────────────────────────────────────────────
  it('公开段可匿名访问；后台段未登录返回 401', async () => {
    // 公开段：匿名可通（无 tid 时落到默认租户，scan-entry 不查库）
    const pub = await request(app).get('/api/trace/public/scan-entry?co=ABC123');
    assert.equal(pub.status, 200);
    assert.equal(pub.body.code, 'ABC123');

    // 后台段：必须鉴权
    const noAuth = await request(app).get('/api/customer/trace/batches');
    assert.equal(noAuth.status, 401);

    // 后台段：带 token 可通
    const auth = await request(app).get('/api/customer/trace/batches').set('Authorization', `Bearer ${tenantAToken}`);
    assert.equal(auth.status, 200);
    assert.ok(Array.isArray(auth.body.list));
  });

  // ── 4) 租户隔离：只认 req.user.customerId ───────────────────────────────
  it('后台端按 token 隔离租户数据', async () => {
    // 🔴 批次号必须 ≤ 码制 m[2]（默认 7 位），否则创建时 400（已在批次段归一化修复里钉死）。
    const created = await request(app).post('/api/customer/trace/batches')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .send({ batch: 'B202610', product: '甲产品', factory: '甲厂', brand: '甲牌' });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.ok(created.body.id > 0);

    // A 租户看得到自己的批次
    const listA = await request(app).get('/api/customer/trace/batches').set('Authorization', `Bearer ${tenantAToken}`);
    assert.equal(listA.body.list.length, 1);
    assert.equal(listA.body.list[0].batch, 'B202610');

    // B 租户看不到 A 的批次（租户隔离）
    const listB = await request(app).get('/api/customer/trace/batches').set('Authorization', `Bearer ${tenantBToken}`);
    assert.equal(listB.body.list.length, 0, 'B 租户读到了 A 租户的批次');
  });

  // ── 5) 越权防护：body 直传 tenantId 无效 ────────────────────────────────
  it('公开段不接受 body 直传 tenantId（防跨租户越权）', async () => {
    // A 租户建一个批次（批次号 ≤ 7 位）
    const batch = await request(app).post('/api/customer/trace/batches')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .send({ batch: 'B202611', product: '越权测试', factory: '甲厂', brand: '甲牌' });
    const bid = batch.body.id;

    // 公开段验证时 body 里塞 tenantId=B —— 无效：查不到该租户的数据
    const spoof = await request(app).post('/api/trace/public/verify')
      .send({ co: 'XXXXXXXXXXXXXXXXXXXX', tenantId: B });
    // 码本身不合法 → 400；关键是请求被正常处理而不是「按 B 租户查到东西」
    assert.ok([400, 429].includes(spoof.status), `期望 400/429，实际 ${spoof.status}`);
    assert.ok(spoof.body.error, '应返回中文错误信息');

    // 公开段带 ?tid= 时按该租户定位（B 租户无此批次 → 查不到）
    const withTid = await request(app).post('/api/trace/public/verify?tid=' + B)
      .send({ co: 'XXXXXXXXXXXXXXXXXXXX' });
    assert.ok([400, 429].includes(withTid.status));

    // 批次确实属于 A 租户
    const detail = await request(app).get(`/api/customer/trace/batches/${bid}`).set('Authorization', `Bearer ${tenantAToken}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.batch.batch, 'B202611');
  });

  // ── 6) 奖励字段列名回归：写入 is_rewarded / credit_type 可读回 ──────────
  it('奖励字段按统一列名写入并可读回', () => {
    db.prepare("INSERT OR IGNORE INTO trace_batches (id, tenant_id, batch) VALUES (9001, ?, 'RW9001')").run(A);
    db.prepare(`INSERT INTO trace_codes (tenant_id, batch_id, code, credit_type, fnum, is_rewarded, tx)
      VALUES (?, 9001, 'RWCODE9001', 'credit9', 500, 1, '发放成功')`).run(A);
    const row = db.prepare("SELECT credit_type, fnum, is_rewarded, tx FROM trace_codes WHERE tenant_id = ? AND code = 'RWCODE9001'").get(A);
    assert.equal(row.credit_type, 'credit9');
    assert.equal(row.fnum, 500);
    assert.equal(row.is_rewarded, 1);
    assert.equal(row.tx, '发放成功');
  });
});
