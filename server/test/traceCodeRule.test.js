/**
 * 回归锁：防伪码制 —— 租户级随机密钥 + 停用批次禁生成 + 结构锁计数口径（2026-10-29）
 *
 * 背景三条真实缺陷：
 *   1) 所有租户共用 DEFAULT_CODESET 的 k1–k4 → 算法公开，跨租户可互相推算。
 *      现改为：新租户落库时随机填充 k1–k4（ensureTenantTraceRule）。
 *   2) 停用批次（is_active=0）照样能生成码，而 C 端验真对停用批次直接判失效
 *      → 后台显示「生成成功」，消费者扫了全是假码。现在三条生成入口统一拦。
 *   3) 码制结构锁的计数只数 trace_codes，而 trace_codes 只存**被扫过**的码；
 *      生成动作只累加 trace_batches.num/tnum →「生成 500 个、一个没扫」时锁完全不生效。
 *      现在统一走 countTraceCodesGenerated（已扫 + 已生成）。
 *
 * 钉死十条：
 *   1) 新租户播种随机 k1–k4（10 位数字），且不等于默认码表
 *   2) 播种后 ruleConfirmed=false；保存码制后 =true
 *   3) 已生成过码的存量租户播种沿用默认 k（绝不换密钥，否则已印的码全废）
 *   4) 已有码制行的租户不被覆盖
 *   5) 随机接口只吐 10 位数字串，且**不落库**
 *   6) 停用批次 → generate-codes 400
 *   7) 停用批次 → generate-codes-legacy 400
 *   8) 停用批次 → export 400（它内部也是生成，会扣库存）
 *   9) 激活后恢复正常生成
 *  10) 只生成未扫码时，改码制结构必须被拒（旧口径会放行）
 *  11) POST /batches/:id/activate 空 body = 激活（该端点原本会把批次反手停用）
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, hashPassword, ensureTenantTraceRule, countTraceCodesGenerated } from '../src/db.js';
import { createApp } from '../src/app.js';
import { DEFAULT_CODESET } from '../src/services/traceCode.js';

describe('防伪码制：随机密钥 + 停用批次禁生成 + 结构锁计数口径', () => {
  let tmpDir, db, app, server;
  let tenantToken;

  const FRESH = 931;      // 新租户：还没生成过任何码
  const PRINTED = 932;    // 存量租户：已生成过码（有 num 但未扫码）
  const CUSTOM = 933;     // 已有自定义码制的租户

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-rule-'));
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
    globalThis.__traceRulePrev = prev;

    const { hash, salt } = hashPassword('admin123');
    db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, ?, 'active', ?)")
      .run('ruleTenant', '13800000931', hash, salt, 'tenant_admin', FRESH);
    const insProj = db.prepare('INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (?, ?, \'active\', ?)');
    insProj.run(FRESH, '新租户', '["trace"]');
    insProj.run(PRINTED, '已印租户', '["trace"]');
    insProj.run(CUSTOM, '自定义码制租户', '["trace"]');

    // PRINTED：造一个「生成过 500 个码但一个都没被扫」的批次（旧口径计数为 0）
    db.prepare(`INSERT INTO trace_batches (tenant_id, m1, batch, product, factory, brand, origin, logo, banner, video, buy_link, province, city, district, inttype, is_chuanhuo, integral, caid_json, toshop_json, wailink_json, params_json, validity, bbox, sbox, red_budget_cents, num, tnum, is_active, created_at, updated_at)
      VALUES (?, 'FW', '0000123', '旧产品', '厂', '牌', '', '', '', '', '', '', '', '', 0, 0, 0, '{}', '{}', '{}', '{}', 0, 0, 0, -1, 500, 0, 1, datetime('now'), datetime('now'))`).run(PRINTED);

    // CUSTOM：用户自己配的码制（k 全是 1）
    db.prepare(`INSERT INTO trace_code_rules (tenant_id, m1, rule_json, publish_no, is_confirmed, created_at, updated_at)
      VALUES (?, 'ZZ', ?, '', 1, datetime('now'), datetime('now'))`)
      .run(CUSTOM, JSON.stringify({ k: { 1: '1111111111', 2: '2222222222', 3: '3333333333', 4: '4444444444', 5: '7' }, m: { 1: 'ZZ', 2: 7, 3: 6, 4: 5, 5: 20 }, s: 0, zdl: 10 }));

    tenantToken = (await request(app).post('/api/auth/login').send({ username: 'ruleTenant', password: 'admin123' })).body.token;

    // 三个租户都走一遍播种（模拟建租户即时调用 + 启动期存量补齐同一函数）
    ensureTenantTraceRule(db, FRESH);
    ensureTenantTraceRule(db, PRINTED);
    ensureTenantTraceRule(db, CUSTOM);
  });

  after(() => {
    try { server?.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, globalThis.__traceRulePrev);
  });

  const auth = (r) => r.set('Authorization', `Bearer ${tenantToken}`);
  const ruleRow = (t) => db.prepare('SELECT * FROM trace_code_rules WHERE tenant_id = ?').get(t);
  const ruleObj = (t) => JSON.parse(ruleRow(t)?.rule_json || '{}');

  // ── 1) 新租户随机 k ──────────────────────────────────────────────────
  it('新租户播种随机 k1–k4（10 位数字），且不等于默认码表', () => {
    const r = ruleObj(FRESH);
    for (let i = 1; i <= 4; i += 1) {
      assert.match(String(r.k[i]), /^[0-9]{10}$/, `k${i} 不是 10 位数字：${r.k[i]}`);
      assert.notEqual(String(r.k[i]), String(DEFAULT_CODESET.k[i]), `k${i} 仍在用默认码表（随机没生效）`);
    }
    // 四个串不能全都一样（防止 randomInt 被写死成同一个值）
    assert.equal(new Set([r.k[1], r.k[2], r.k[3], r.k[4]]).size, 4, '四个随机串出现重复，随机源可疑');
  });

  it('新租户播种后 is_confirmed=0（批次管理要出软引导）', () => {
    assert.equal(Number(ruleRow(FRESH).is_confirmed), 0);
  });

  // ── 2) 保存即确认 ───────────────────────────────────────────────────
  it('保存码制后 is_confirmed=1，批次列表 ruleConfirmed=true', async () => {
    const before = await auth(request(app).get('/api/customer/trace/batches')).query({ page: 1, pageSize: 1 });
    assert.equal(before.body.ruleConfirmed, false, '播种后仍显示已确认 = 软引导永远不会出现');

    const cur = (await auth(request(app).get('/api/customer/trace/code-rule'))).body.rule;
    const saved = await auth(request(app).put('/api/customer/trace/code-rule')).send({
      m1: cur.m[1], m2: cur.m[2], m3: cur.m[3], m4: cur.m[4], m5: cur.m[5],
      k1: cur.k[1], k2: cur.k[2], k3: cur.k[3], k4: cur.k[4], zdl: cur.zdl,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(Number(ruleRow(FRESH).is_confirmed), 1, '保存没把 is_confirmed 置 1');

    const after = await auth(request(app).get('/api/customer/trace/batches')).query({ page: 1, pageSize: 1 });
    assert.equal(after.body.ruleConfirmed, true, '保存后软引导没消失');
  });

  // ── 3) 已印租户沿用默认 k ────────────────────────────────────────────
  it('已生成过码的存量租户播种沿用默认 k（换密钥会让已印的码全废）', () => {
    const r = ruleObj(PRINTED);
    for (let i = 1; i <= 4; i += 1) {
      assert.equal(String(r.k[i]), String(DEFAULT_CODESET.k[i]), `k${i} 被换成随机值 → 已印的 500 个码全废`);
    }
    assert.equal(Number(ruleRow(PRINTED).is_confirmed), 1, '存量在用租户不该再弹软引导');
  });

  it('countTraceCodesGenerated 把「已生成未扫码」的码算进去', () => {
    // PRINTED 批次 num=500 且 trace_codes 为 0 → 旧口径 0，新口径 500
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ?').get(PRINTED).c, 0);
    assert.equal(countTraceCodesGenerated(db, PRINTED), 500);
  });

  // ── 4) 不覆盖已有码制 ────────────────────────────────────────────────
  it('已有码制行的租户不被播种覆盖', () => {
    assert.equal(ruleObj(CUSTOM).m[1], 'ZZ', '租户自定义的前缀被播种覆盖了');
    assert.equal(ruleObj(CUSTOM).k[1], '1111111111', '租户自定义的 k1 被播种覆盖了');
  });

  // ── 5) 随机接口 ─────────────────────────────────────────────────────
  it('随机接口返回 4 个 10 位数字串，且**不落库**', async () => {
    const before = ruleObj(FRESH).k[1];
    const res = await auth(request(app).get('/api/customer/trace/code-rule/random-keys'));
    assert.equal(res.status, 200);
    for (const key of ['k1', 'k2', 'k3', 'k4']) {
      assert.match(String(res.body[key]), /^[0-9]{10}$/, `${key} 不是 10 位数字：${res.body[key]}`);
    }
    assert.equal(ruleObj(FRESH).k[1], before, '点「随机」就落库 = 租户正在用的密钥被静默换掉');
  });

  // ── 6/7/8) 停用批次三条生成入口全拦 ─────────────────────────────────
  it('停用批次：generate-codes / generate-codes-legacy / export 全部 400', async () => {
    const created = await auth(request(app).post('/api/customer/trace/batches'))
      .send({ batch: '900', product: '停用产品', factory: '厂', brand: '牌' });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const id = Number(created.body.id);
    db.prepare('UPDATE trace_batches SET is_active = 0 WHERE tenant_id = ? AND id = ?').run(FRESH, id);

    const gen = await auth(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`)).send({ codetype: 6, codeno: 3 });
    assert.equal(gen.status, 400, '停用批次仍能生成 = 会产出消费者扫不出来的码');
    assert.ok(String(gen.body.error).includes('停用'), `错误信息未说明停用：${gen.body.error}`);

    const legacy = await auth(request(app).post(`/api/customer/trace/batches/${id}/generate-codes-legacy`)).send({ codeno: 3 });
    assert.equal(legacy.status, 400, 'legacy 入口漏了守卫');

    const exp = await auth(request(app).get(`/api/customer/trace/batches/${id}/export`));
    assert.equal(exp.status, 400, '导出入口漏了守卫（它内部也是生成，会白扣库存）');
  });

  // ── 9) 激活后恢复 ───────────────────────────────────────────────────
  it('激活批次后恢复正常生成', async () => {
    const created = await auth(request(app).post('/api/customer/trace/batches'))
      .send({ batch: '901', product: '再激活产品', factory: '厂', brand: '牌' });
    const id = Number(created.body.id);
    db.prepare('UPDATE trace_batches SET is_active = 0 WHERE tenant_id = ? AND id = ?').run(FRESH, id);
    assert.equal((await auth(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`)).send({ codetype: 6, codeno: 3 })).status, 400);

    db.prepare('UPDATE trace_batches SET is_active = 1 WHERE tenant_id = ? AND id = ?').run(FRESH, id);
    const ok = await auth(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`)).send({ codetype: 6, codeno: 3 });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(Number(ok.body.created), 3);
  });

  // ── 10) activate 端点空 body = 激活 ──────────────────────────────────
  it('POST /batches/:id/activate 不传 body 时必须激活（不能反手停用）', async () => {
    const created = await auth(request(app).post('/api/customer/trace/batches'))
      .send({ batch: '902', product: '激活语义产品', factory: '厂', brand: '牌' });
    const id = Number(created.body.id);
    db.prepare('UPDATE trace_batches SET is_active = 0 WHERE tenant_id = ? AND id = ?').run(FRESH, id);

    const act = await auth(request(app).post(`/api/customer/trace/batches/${id}/activate`)).send({});
    assert.equal(act.status, 200);
    const row = db.prepare('SELECT is_active FROM trace_batches WHERE tenant_id = ? AND id = ?').get(FRESH, id);
    assert.equal(Number(row.is_active), 1, '叫 activate 的端点空 body 调用却停用了批次');

    // 显式传 false 仍然要能停用
    const off = await auth(request(app).post(`/api/customer/trace/batches/${id}/activate`)).send({ isActive: false });
    assert.equal(off.status, 200);
    assert.equal(Number(db.prepare('SELECT is_active FROM trace_batches WHERE tenant_id = ? AND id = ?').get(FRESH, id).is_active), 0);
  });

  // ── 11) 只生成未扫码时结构锁必须生效 ─────────────────────────────────
  it('只生成过码（未扫码）时，改码制结构必须被拒', async () => {
    // FRESH 租户此刻已生成 3 个码（上一条用例），trace_codes 仍为 0
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ?').get(FRESH).c, 0);
    assert.ok(countTraceCodesGenerated(db, FRESH) > 0, '生成后计数仍为 0 → 锁会失效');

    const cur = (await auth(request(app).get('/api/customer/trace/code-rule'))).body.rule;
    const res = await auth(request(app).put('/api/customer/trace/code-rule')).send({
      m1: cur.m[1], m2: 8, m3: cur.m[3], m4: cur.m[4], m5: 21,
      k1: cur.k[1], k2: cur.k[2], k3: cur.k[3], k4: cur.k[4], zdl: cur.zdl,
    });
    assert.equal(res.status, 400, '旧口径（只数 trace_codes）会放行，已印的码就全废了');
    assert.ok(String(res.body.error).includes('不能'), `错误信息未说明原因：${res.body.error}`);
  });
});
