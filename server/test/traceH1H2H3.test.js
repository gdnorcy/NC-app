/**
 * 回归锁：H1/H2/H3 —— 二维码大批量 ZIP 分文件 / 码制密钥 k 落库加密 / 套标维度校验（2026-10-30）
 *
 * H1：二维码码型（2/4/13）大批量导出从「单个巨型 HTML（内联全部 SVG）」改为
 *     「ZIP 内每码一张 SVG + 目录页 + 清单」。实测单 HTML 内联 10 万码 = 1.2GB / 67s，浏览器打不开；
 *     ZIP 分文件体积降到约 1/10、可断点、印刷厂可直接拿每码一张 SVG 拼版。
 *     小批量（< QR_ZIP_THRESHOLD）仍走单 HTML，预览更友好；显式 format=zip 也走 ZIP。
 * H2：码制密钥 k1~k4 加密落库（AES-256-GCM），所有读取点走 parseTraceRule 解密。
 *     明文落库时 DB 泄露 = 同租户任意码可伪造；加密后泄露面收敛到「DB + STORAGE_KEY 同时泄露」。
 * H3：套标码型（14/15/16/17/22）必须先配置批次 bbox/sbox，否则静默产出 0 码 → 明确报错。
 */
import { describe, before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, ensureTenantTraceRule, hashPassword } from '../src/db.js';
import { createApp } from '../src/app.js';
import { readMultiZip } from '../src/services/zip.js';

describe('防伪溯源 H1/H2/H3：二维码ZIP / k加密 / 套标维度校验', () => {
  let tmpDir, db, app, server, tokenA;
  const A = 951;
  const authA = (r) => r.set('Authorization', `Bearer ${tokenA}`);
  const ruleRow = (t) => db.prepare('SELECT rule_json FROM trace_code_rules WHERE tenant_id = ?').get(t);

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-h123-'));
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
    globalThis.__h123Prev = prev;

    const { hash, salt } = hashPassword('admin123');
    db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, ?, 'active', ?)")
      .run('h123', '13800000951', hash, salt, 'tenant_admin', A);
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', '[\"trace\"]')").run(A, 'H1H2H3租户');
    tokenA = (await request(app).post('/api/auth/login').send({ username: 'h123', password: 'admin123' })).body.token;
    ensureTenantTraceRule(db, A);
    db.prepare('INSERT OR IGNORE INTO trace_settings (tenant_id, settings_json, luck_json, cocom, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'))')
      .run(A, '{}', '{}', 100000);
  });

  after(() => {
    try { server?.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, globalThis.__h123Prev);
  });

  const makeBatch = async (product) => {
    const r = await authA(request(app).post('/api/customer/trace/batches'))
      .send({ batch: `B${product}`, product, factory: '厂', brand: '牌' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const id = Number(r.body.id);
    db.prepare('UPDATE trace_batches SET is_active = 1 WHERE tenant_id = ? AND id = ?').run(A, id);
    return id;
  };

  /* ── H2：码制密钥 k 加密落库 ── */
  it('H2 码制 k 加密落库（raw rule_json.k 是密文），且读取端解密后仍是 10 位 k', async () => {
    const raw = JSON.parse(ruleRow(A).rule_json || '{}');
    assert.equal(typeof raw.k, 'string', 'rule_json.k 应为加密字符串，而非明文对象');
    assert.ok(raw.k.length > 20, '密文长度异常短，可能没加密');
    const rule = (await authA(request(app).get('/api/customer/trace/code-rule'))).body.rule;
    for (let i = 1; i <= 4; i += 1) {
      assert.match(String(rule.k[i]), /^[0-9]{10}$/, `解密后的 k${i} 不是 10 位数字：${rule.k[i]}`);
    }
  });

  /* ── H1：二维码 format=zip → 多文件 zip ── */
  it('H1 二维码 format=zip 路由返回 application/zip 多文件包（每码一张SVG + 目录页 + 清单）', async () => {
    const id = await makeBatch('zip');
    const res = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 4, codeno: 5, format: 'zip' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.contentType, 'application/zip');
    assert.ok(String(res.body.filename).endsWith('.zip'), `zip 文件名不对：${res.body.filename}`);
    assert.equal(res.body.encoding, 'base64');

    const buf = Buffer.from(res.body.content, 'base64');
    const entries = readMultiZip(buf);
    const names = entries.map((e) => e.name);
    assert.ok(names.includes('index.html'), `缺目录页：${names.join(',')}`);
    assert.ok(names.includes('manifest.csv'), `缺清单：${names.join(',')}`);
    const svgs = entries.filter((e) => e.name.startsWith('codes/') && e.name.endsWith('.svg'));
    assert.equal(svgs.length, 5, `应 5 张 SVG，实际 ${svgs.length}`);
    assert.ok(svgs.every((s) => s.text.startsWith('<svg') && s.crcOk), '存在损坏/非 SVG 条目');
    const idx = entries.find((e) => e.name === 'index.html');
    assert.ok(/共 5 个码/.test(idx.text), '目录页未标注码数');
  });

  /* ── H1：小批量二维码仍走单 HTML（预览友好）── */
  it('H1 小批量二维码（无 format）仍返回单 HTML，不强制 zip', async () => {
    const id = await makeBatch('small');
    const res = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 4, codeno: 3 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.contentType.includes('text/html'), `应为 html，实际 ${res.body.contentType}`);
    assert.ok(String(res.body.filename).endsWith('.html'), `应为 .html，实际 ${res.body.filename}`);
    assert.equal(res.body.isBuffer, undefined, '小批量不应是 buffer');
  });

  /* ── H1：超过阈值自动走 ZIP（format 不传也如此）── */
  it('H1 二维码数量达阈值自动转 ZIP（无需显式 format=zip）', async () => {
    const id = await makeBatch('auto');
    const res = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 4, codeno: 2000 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.contentType, 'application/zip', '达阈值应自动 zip');
    const buf = Buffer.from(res.body.content, 'base64');
    const entries = readMultiZip(buf);
    assert.ok(entries.length >= 2002, `应含 2000 张 SVG + index + manifest，实际 ${entries.length}`);
  });

  /* ── H3：套标无 bbox/sbox 报错 ── */
  it('H3 套标码型在批次未配置 bbox/sbox 时明确报错（不静默 0 码）', async () => {
    const id = await makeBatch('noset');
    const res = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 14, codenot: 2 });
    assert.equal(res.status, 400, `应 400，实际 ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(String(res.body.error || res.body.message || '').includes('套标'), `报错信息应点明套标：${res.body.error || res.body.message}`);
  });

  /* ── H3：套标带 bbox/sbox 正常产出 ── */
  it('H3 套标码型在批次已配置 bbox/sbox 时正常产出', async () => {
    const id = await makeBatch('setok');
    db.prepare('UPDATE trace_batches SET bbox = 2, sbox = 3 WHERE tenant_id = ? AND id = ?').run(A, id);
    const res = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 14, codenot: 2 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Number(res.body.created) > 0, '套标产出应为正数');
  });
});
