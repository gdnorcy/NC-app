/**
 * 回归锁：购买链接结构化（含 miniapp 类型）+ H5 跳转小程序 URL Link 通道。
 *
 * 🔴 覆盖三类真实事故面（纯函数锁不住，只能打真实 HTTP + 查库）：
 *   1) H5 跳转本平台小程序：urllink 端点用 wx_mini 凭证生成 URL Link 下发给前端；
 *   2) 第三方小程序无凭证：urllink 明确 400 unsupported_target（不假装能跳）；
 *   3) 购买链接落库：结构化对象 → JSON、旧版纯字符串 → 原样；C 端验真下发为对象（parseBuyLink 归一到对象）。
 */
import { describe, before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, hashPassword } from '../src/db.js';
import { createApp } from '../src/app.js';

describe('购买链接结构化 + H5 跳转小程序 URL Link', () => {
  let tmpDir, db, app, server, token;
  const T = 17;
  const realFetch = globalThis.fetch;
  let fetchCalls = [];

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-urllink-'));
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
    globalThis.__traceUrlLinkPrev = prev;

    const { hash, salt } = hashPassword('admin123');
    db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, ?, 'active', ?)")
      .run('traceUrlLink', '13800001777', hash, salt, 'tenant_admin', T);
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', '[\"trace\"]')").run(T, 'URLLink测试租户');

    const login = await request(app).post('/api/auth/login').send({ username: 'traceUrlLink', password: 'admin123' });
    token = login.body.token;

    // 注入 wx_mini 配置（仅本平台小程序可生成 URL Link）
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('wx_mini', ?)")
      .run(JSON.stringify({ appId: 'wxPLATFORM', appSecret: 'platformSecret' }));

    // mock 微信接口：cgi-bin/token 给 token；generate_urllink 给 url_link
    globalThis.fetch = async (url, opts) => {
      const u = String(url);
      fetchCalls.push({ url: u, body: opts && opts.body });
      if (u.includes('/cgi-bin/token')) {
        return { json: async () => ({ access_token: 'TOK_ABC', expires_in: 7200 }) };
      }
      if (u.includes('/wxa/generate_urllink')) {
        assert.ok(u.includes('access_token=TOK_ABC'), 'generate_urllink 必须带 access_token');
        const body = JSON.parse(opts.body);
        assert.equal(body.env_version, 'release', 'env_version 应透传');
        return { json: async () => ({ url_link: 'https://wxmpurl.cn/9gRsQAhPctg' }) };
      }
      return realFetch(url, opts);
    };
  });

  after(() => {
    globalThis.fetch = realFetch;
    try { server?.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, globalThis.__traceUrlLinkPrev);
  });

  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const batchRow = (id) => db.prepare('SELECT * FROM trace_batches WHERE id = ?').get(id);

  async function makeBatch(extra = {}) {
    const tag = Math.random().toString(36).slice(2, 8).toUpperCase();
    const res = await auth(request(app).post('/api/customer/trace/batches'))
      .send({ batch: `U${tag}`, product: 'URLLink产品', ...extra });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.id;
  }
  async function makeCode(id) {
    const gen = await auth(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`)).send({ codetype: 6, codeno: 1 });
    assert.equal(gen.status, 200, JSON.stringify(gen.body));
    return gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];
  }

  // ── 1) H5 跳转本平台小程序：urllink 端点生成 URL Link ──
  it('POST /public/urllink（本平台小程序）→ 200 并返回 urlLink，且服务端真的调了微信 generate_urllink', async () => {
    const res = await request(app).post('/api/trace/public/urllink')
      .send({ appId: 'wxPLATFORM', path: '/pages/mall/detail?id=1', envVersion: 'release' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.urlLink, 'https://wxmpurl.cn/9gRsQAhPctg');
    const urllinkCall = fetchCalls.find((c) => c.url.includes('/wxa/generate_urllink'));
    assert.ok(urllinkCall, '应调用微信 generate_urllink');
    const body = JSON.parse(urllinkCall.body);
    assert.equal(body.path, '/pages/mall/detail', 'path 不应含 query');
    assert.equal(body.query, 'id=1', 'query 应从 path 拆出');
  });

  // ── 2) 第三方小程序无凭证：明确拒绝，不假装能跳 ──
  it('POST /public/urllink（第三方小程序 appId）→ 400 unsupported_target', async () => {
    const res = await request(app).post('/api/trace/public/urllink')
      .send({ appId: 'wxTHIRDPARTY', path: '/pages/x' });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.error, 'unsupported_target');
  });

  // ── 3) wx_mini 未配置：502，不崩 ──
  it('POST /public/urllink（wx_mini 未配置）→ 502', async () => {
    db.prepare("DELETE FROM settings WHERE key = 'wx_mini'").run();
    const res = await request(app).post('/api/trace/public/urllink')
      .send({ appId: 'wxPLATFORM', path: '/pages/x' });
    assert.equal(res.status, 502, JSON.stringify(res.body));
    // 还原配置，避免影响后续用例
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('wx_mini', ?)")
      .run(JSON.stringify({ appId: 'wxPLATFORM', appSecret: 'platformSecret' }));
  });

  // ── 4) 购买链接结构化落库：对象 → JSON、旧字符串 → 原样 ──
  it('POST /batches 结构化 buyLink 落库为 JSON；旧版纯字符串原样保留', async () => {
    const id1 = await makeBatch({
      buyLink: { linkType: 'miniapp', url: '', miniAppId: 'wxPLATFORM', miniAppPath: '/pages/mall/detail?id=9', miniAppEnv: 'release' },
    });
    // 落库应为 JSON 字符串
    const stored = batchRow(id1).buy_link;
    assert.ok(typeof stored === 'string' && stored.startsWith('{'), '结构化对象应落库为 JSON 字符串');
    const parsed = JSON.parse(stored);
    assert.equal(parsed.linkType, 'miniapp');
    assert.equal(parsed.miniAppId, 'wxPLATFORM');

    // 旧版纯字符串（历史数据）应原样保存
    const id2 = await makeBatch({ buyLink: 'https://old.example.com/p/1' });
    assert.equal(batchRow(id2).buy_link, 'https://old.example.com/p/1', '旧版字符串不应被 JSON 包裹');
  });

  // ── 5) C 端验真下发：结构化 buyLink 归一为对象（parseBuyLink 生效）──
  it('验真结果下发 batch.buyLink 为结构化对象（miniapp 类型），而非裸字符串', async () => {
    const id = await makeBatch({
      buyLink: { linkType: 'miniapp', url: '', miniAppId: 'wxPLATFORM', miniAppPath: '/pages/mall/detail?id=5', miniAppEnv: 'release' },
    });
    const code = await makeCode(id);
    const res = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'urllink-a').send({ co: code });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const bl = res.body.batch.buyLink;
    assert.ok(typeof bl === 'object' && !Array.isArray(bl), 'C 端应拿到结构化对象');
    assert.equal(bl.linkType, 'miniapp');
    assert.equal(bl.miniAppId, 'wxPLATFORM');
  });
});
