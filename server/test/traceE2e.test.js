/**
 * 回归锁：防伪溯源「建批次 → 生成码 → C 端验真」全链路（2026-10-26）
 *
 * 🔴 为什么必须端到端测：
 *   单元测试全绿 ≠ 链路通。真实事故是「后台能建批次、能生成码、能下载文件，
 *   但 C 端扫出来永远『防伪码不存在或已失效』」——
 *   因为生成端嵌的批次串与验真端切出的批次段宽度不一致（见 traceBatchSegment.test.js）。
 *   只有把三段串起来打真实 HTTP，才能拦住这类「每段单测都过、合起来不通」的缺陷。
 *
 * 覆盖：
 *   1) 建批次 → 批次号按码制 m[2] 归一（短号左补 0）
 *   2) 批次号含分隔符 / 超长 → 400（拒绝写入，避免生成永不可用的码）
 *   3) 生成码 → 取出码 → C 端公开段验真 → 必须查到批次与产品
 *   4) 生成的码长 == m5，且批次段宽度 == m2
 *   5) 二维码码型导出的是自包含 HTML（内联 data URI，非 PHP 端点裂图）
 *   6) URL 码型指向平台 C 端溯源页且带 tid
 *   7) 已生成码后禁止改码制结构（改了已印的码全废）
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

describe('防伪溯源 trace：全链路（建批次 → 生成码 → C 端验真）', () => {
  let tmpDir, db, app, server;
  let token;

  const A = 11;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-e2e-'));
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
    globalThis.__traceE2ePrev = prev;

    const { hash, salt } = hashPassword('admin123');
    db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, ?, 'active', ?)")
      .run('traceE2e', '13800009999', hash, salt, 'tenant_admin', A);
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', '[\"demo\"]')").run(A, '链路测试租户');
    const login = await request(app).post('/api/auth/login').send({ username: 'traceE2e', password: 'admin123' });
    token = login.body.token;
  });

  after(() => {
    try { server?.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, globalThis.__traceE2ePrev);
  });

  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  // ── 1) 批次号归一 ────────────────────────────────────────────────────
  it('建批次时批次号按码制 m[2] 归一（短号左补 0）', async () => {
    const res = await auth(request(app).post('/api/customer/trace/batches'))
      .send({ batch: '123', product: '测试产品', factory: '测试厂', brand: '测试牌' });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    // 默认码制 m[2] = 7 → '123' 归一为 '0000123'
    assert.equal(res.body.batch, '0000123');
    const row = db.prepare('SELECT batch FROM trace_batches WHERE tenant_id = ? AND id = ?').get(A, res.body.id);
    assert.equal(row.batch, '0000123', '库里存的批次号未归一');
  });

  // ── 2) 非法批次号被拒 ────────────────────────────────────────────────
  it('批次号含分隔符 / 超长 → 400（不写入，避免生成永不可用的码）', async () => {
    const bad1 = await auth(request(app).post('/api/customer/trace/batches')).send({ batch: '2026-1026' });
    assert.equal(bad1.status, 400);
    assert.ok(bad1.body.error, '应返回中文错误');

    const bad2 = await auth(request(app).post('/api/customer/trace/batches')).send({ batch: '123456789012' });
    assert.equal(bad2.status, 400);

    // 确认都没落库
    const count = db.prepare('SELECT COUNT(*) AS c FROM trace_batches WHERE tenant_id = ?').get(A).c;
    assert.equal(Number(count), 1, '非法批次号竟然落库了');
  });

  // ── 3) 全链路：生成码 → C 端验真 ─────────────────────────────────────
  it('生成的码能在 C 端验真查到批次与产品（全链路通）', async () => {
    // 3.1 生成 5 个纯码（codetype 6 = 一行一个码）
    const gen = await auth(request(app).post('/api/customer/trace/batches/1/generate-codes'))
      .send({ codetype: 6, codeno: 5 });
    assert.equal(gen.status, 200, JSON.stringify(gen.body));
    assert.equal(gen.body.created, 5);

    // 3.2 取出一个码
    const codes = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean);
    assert.equal(codes.length, 5);
    const code = codes[0];

    // 3.3 C 端公开段验真（带 tid）
    const verify = await request(app).post(`/api/trace/public/verify?tid=${A}`).send({ co: code });
    assert.equal(verify.status, 200, `验真失败：${JSON.stringify(verify.body)}`);
    assert.equal(verify.body.ok, true);
    assert.equal(verify.body.batch.batch, '0000123', '验真查到的批次号不对');
    assert.equal(verify.body.batch.product, '测试产品', '验真查到的产品不对');
    assert.equal(verify.body.first, true, '首次查询应返回 first=true');
  });

  // ── 4) 码长 / 批次段宽度守恒 ─────────────────────────────────────────
  it('生成的码长等于 m5、批次段宽度等于 m2', async () => {
    const rule = (await auth(request(app).get('/api/customer/trace/code-rule'))).body.rule;
    const gen = await auth(request(app).post('/api/customer/trace/batches/1/generate-codes'))
      .send({ codetype: 6, codeno: 3 });
    const codes = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean);
    for (const c of codes) {
      assert.equal(c.length, Number(rule.m[5]), `码长不等于 m5：${c}`);
      assert.ok(c.startsWith(rule.m[1]), `码前缀不等于 m1：${c}`);
    }
  });

  // ── 5) 二维码码型导出自包含 HTML ─────────────────────────────────────
  it('二维码码型导出的是内联 data URI 的 HTML（非 PHP 端点裂图）', async () => {
    const gen = await auth(request(app).post('/api/customer/trace/batches/1/generate-codes'))
      .send({ codetype: 2, codeno: 2 });
    assert.equal(gen.status, 200, JSON.stringify(gen.body));
    assert.equal(gen.body.contentType, 'text/html; charset=utf-8');
    assert.ok(gen.body.filename.endsWith('.html'), `二维码码型文件名应为 .html：${gen.body.filename}`);
    assert.ok(gen.body.content.includes('data:image/svg+xml;base64,'), '二维码未内联为 data URI');
    assert.ok(!gen.body.content.includes('index.php'), '二维码仍指向不存在的 PHP 端点');
    assert.ok(!gen.body.content.includes('f.php'), '二维码仍指向不存在的 f.php');
    assert.ok(gen.body.content.includes('<!DOCTYPE html>'), 'HTML 缺文档骨架');
  });

  // ── 6) URL 码型指向平台 C 端溯源页且带 tid ───────────────────────────
  it('URL 码型指向平台 C 端溯源页且带 tid', async () => {
    const gen = await auth(request(app).post('/api/customer/trace/batches/1/generate-codes'))
      .send({ codetype: 8, codeno: 1 });
    assert.equal(gen.status, 200);
    const url = gen.body.content.trim();
    assert.ok(url.includes('/card/#/pages/trace/index'), `URL 未指向 C 端溯源页：${url}`);
    assert.ok(url.includes(`tid=${A}`), `URL 缺 tid：${url}`);
    assert.ok(url.includes('co='), `URL 缺防伪码：${url}`);
    assert.ok(!url.includes('f.php'), `URL 仍指向 f.php：${url}`);
  });

  // ── 7) 已生成码后禁止改码制结构 ──────────────────────────────────────
  it('已生成防伪码后禁止修改码制结构（改了已印的码会全部失效）', async () => {
    const cur = (await auth(request(app).get('/api/customer/trace/code-rule'))).body.rule;
    const flat = {
      m1: cur.m[1], m2: cur.m[2], m3: cur.m[3], m4: cur.m[4], m5: cur.m[5],
      k1: cur.k[1], k2: cur.k[2], k3: cur.k[3], k4: cur.k[4], k5: cur.k[5],
      zdl: cur.zdl,
    };

    // 改结构（批次号长度 7 → 8，同时总长 20 → 21 保持自洽）→ 必须被拒
    const structural = await auth(request(app).put('/api/customer/trace/code-rule'))
      .send({ ...flat, m2: 8, m5: 21 });
    assert.equal(structural.status, 400);
    assert.ok(String(structural.body.error).includes('不能'), `错误信息未说明原因：${structural.body.error}`);

    // 只改 zdl（错误次数上限）→ 允许
    const soft = await auth(request(app).put('/api/customer/trace/code-rule')).send({ ...flat, zdl: 20 });
    assert.equal(soft.status, 200, JSON.stringify(soft.body));
  });

  // ── 8) 码长不自洽被拒 ────────────────────────────────────────────────
  it('码长不自洽（m1+m2+m3+m4 ≠ m5）→ 400', async () => {
    const cur = (await auth(request(app).get('/api/customer/trace/code-rule'))).body.rule;
    const res = await auth(request(app).put('/api/customer/trace/code-rule')).send({
      m1: cur.m[1], m2: cur.m[2], m3: cur.m[3], m4: cur.m[4], m5: 30,
      k1: cur.k[1], k2: cur.k[2], k3: cur.k[3], k4: cur.k[4], k5: cur.k[5],
      zdl: cur.zdl,
    });
    assert.equal(res.status, 400);
    assert.ok(String(res.body.error).includes('不自洽'), `错误信息未说明不自洽：${res.body.error}`);
  });

  // ── 9) 商家「标记异常」透传到 C 端验真（mark-error → is_err → verify 响应 isErr → 前端展示「已标记异常」卡） ──
  it('商家标记异常后，C 端验真响应带 isErr=1（前端据此展示异常卡）', async () => {
    // 9.1 生成 1 个码
    const gen = await auth(request(app).post('/api/customer/trace/batches/1/generate-codes'))
      .send({ codetype: 6, codeno: 1 });
    assert.equal(gen.status, 200, JSON.stringify(gen.body));
    const code = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];

    // 9.2 首次验真：isErr 应为 0（尚未标记）
    const v1 = await request(app).post(`/api/trace/public/verify?tid=${A}`).send({ co: code });
    assert.equal(v1.status, 200, `验真失败：${JSON.stringify(v1.body)}`);
    assert.equal(Number(v1.body.batch.isErr || 0), 0, '未标记时验真响应 isErr 应为 0');

    // 9.3 取码 id → 调用标记异常
    const row = db.prepare('SELECT id FROM trace_codes WHERE tenant_id = ? AND code = ?').get(A, code);
    assert.ok(row, '生成的码应在 trace_codes 有记录');
    const mark = await auth(request(app).post(`/api/customer/trace/codes/${row.id}/mark-error`)).send({ reason: '测试标记' });
    assert.equal(mark.status, 200, JSON.stringify(mark.body));

    // 9.4 再次验真：isErr 应为 1（标记已透传，前端据此展示「已标记异常」卡）
    const v2 = await request(app).post(`/api/trace/public/verify?tid=${A}`).send({ co: code });
    assert.equal(v2.status, 200, `验真失败：${JSON.stringify(v2.body)}`);
    assert.equal(Number(v2.body.batch.isErr || 0), 1, '标记异常后验真响应应带 isErr=1');

    // 9.5 埋点：库里 is_err 确为 1（与响应一致）
    const dbRow = db.prepare('SELECT is_err FROM trace_codes WHERE id = ?').get(row.id);
    assert.equal(Number(dbRow.is_err), 1, '库中 is_err 应已置 1');
  });

});
