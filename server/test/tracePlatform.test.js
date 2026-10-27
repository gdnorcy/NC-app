/**
 * 回归锁：防伪溯源 trace —— #469 平台级（总后台）能力归位
 *
 * 背景：#469 把「密码部署 / 站长专区」两类 founder-only 平台能力等价项回归平台管理侧，
 *      后端集中在 server/src/routes/tracePlatform.js（挂载 /api/admin/trace）。
 *      该页面无租户侧入口，一旦接口行为退化（门控失效/密钥明文/台账不写）很难被发现，
 *      故本文件逐条钉死：
 *
 *   1) 平台门控：仅 platform 角色 admin / operator 可读写；tenant_admin 一律 403。
 *   2) 密钥安全：API 通信密钥 / 服务商支付密钥落库为密文（commKeyCipher / apiKeyCipher），
 *      GET 只回显掩码，绝不送明文；空串提交不覆盖已有密文（mergeSecretInput）。
 *   3) generation.mode 非法值回落 'open'（防全局生成被误关/误开）。
 *   4) 防伪码库存：按租户列出（联 projects），调整写 trace_settings.cocom + trace_cocom_recharges 台账。
 *   5) 码制密钥（k1–k5 / m1–m5）刻意不在此模块开放 —— 本测试确认 config 结构不含任何码制密钥字段。
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

describe('防伪溯源 trace：#469 平台级能力归位', () => {
  let tmpDir, db, app, server;
  let adminToken, operatorToken, tenantToken;

  const TENANT = 901; // 高 id 避开可能存在的 demo 种子

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-platform-'));
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
    globalThis.__tracePlatPrev = prev;

    const { hash, salt } = hashPassword('admin123');
    const insUser = db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, ?, 'active', ?)");
    insUser.run('pfAdmin', '13800000901', hash, salt, 'admin', null);
    insUser.run('pfOperator', '13800000902', hash, salt, 'operator', null);
    insUser.run('pfTenant', '13800000903', hash, salt, 'tenant_admin', TENANT);
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', '[\"demo\"]')").run(TENANT, '甲租户');

    const login = async (u) => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token;
    adminToken = await login('pfAdmin');
    operatorToken = await login('pfOperator');
    tenantToken = await login('pfTenant');
  });

  after(() => {
    try { server?.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, globalThis.__tracePlatPrev);
  });

  const getConfig = async (token) =>
    request(app).get('/api/admin/trace/platform-settings').set('Authorization', `Bearer ${token}`);
  const putConfig = async (token, body) =>
    request(app).put('/api/admin/trace/platform-settings').set('Authorization', `Bearer ${token}`).send(body);

  // ── 1) 平台门控 ──────────────────────────────────────────────────────────
  it('平台门控：tenant_admin 一律 403；admin / operator 放行', async () => {
    const denied = await getConfig(tenantToken);
    assert.equal(denied.status, 403, '租户账号不应访问平台接口');

    const okAdmin = await getConfig(adminToken);
    assert.equal(okAdmin.status, 200);

    const okOp = await getConfig(operatorToken);
    assert.equal(okOp.status, 200);
  });

  // ── 2) 默认结构 + 密钥脱敏回显 ────────────────────────────────────────────
  it('GET 返回默认结构，且不含任何码制密钥字段', async () => {
    const res = await getConfig(adminToken);
    assert.equal(res.status, 200);
    const c = res.body.config;
    assert.equal(c.siteRoot, '');
    assert.deepEqual(c.apiAuth.allowedIps, []);
    assert.equal(c.generation.mode, 'open');
    assert.equal(c.mobileTemplate, '');
    assert.equal(c.serviceProvider.wxAppId, '');
    assert.equal(c.serviceProvider.mchId, '');
    assert.equal(c.serviceProvider.kqf, '');
    // 密钥字段只回显掩码，且不允许出现码制密钥（k1–k5 / m1–m5）
    assert.ok('commKey' in c.apiAuth, '应回显 commKey 掩码');
    assert.ok('apiKey' in c.serviceProvider, '应回显 apiKey 掩码');
    const flat = JSON.stringify(c);
    assert.ok(!/codeset|default_codeset|k[1-5]|m[1-5]/i.test(flat), '平台配置绝不含码制密钥');
  });

  // ── 3) PUT 加密落库 + GET 仅掩码 ──────────────────────────────────────────
  it('PUT 写入并加密密钥，GET 只回显掩码且库内无明文', async () => {
    const body = {
      siteRoot: 'https://t.example.com',
      apiAuth: { allowedIps: ['1.2.3.4', '5.6.7.8'], commKey: 'COMMKEY123456' },
      generation: { mode: 'platformOnly' },
      serviceProvider: { wxAppId: 'wxabc', mchId: 'mch1', apiKey: 'APIKEY987654', kqf: 'KQF1' },
    };
    const save = await putConfig(adminToken, body);
    assert.equal(save.status, 200, JSON.stringify(save.body));
    // 回显掩码（非明文）
    assert.equal(save.body.config.apiAuth.commKey, 'COMM****3456');
    assert.equal(save.body.config.serviceProvider.apiKey, 'APIK****7654');
    assert.equal(save.body.config.siteRoot, 'https://t.example.com');
    assert.equal(save.body.config.generation.mode, 'platformOnly');

    // 直读库：密钥必须是密文，绝不含明文
    const row = db.prepare('SELECT config_json FROM trace_platform_settings WHERE id = 1').get();
    const raw = row.config_json;
    assert.ok(raw.includes('commKeyCipher'), '库内应有 commKeyCipher 字段');
    assert.ok(raw.includes('apiKeyCipher'), '库内应有 apiKeyCipher 字段');
    assert.ok(!raw.includes('COMMKEY123456'), '库内不得出现通信密钥明文');
    assert.ok(!raw.includes('APIKEY987654'), '库内不得出现服务商密钥明文');
  });

  // ── 4) 空串提交不覆盖已有密文（mergeSecretInput）──────────────────────────
  it('密钥空串提交不覆盖已有密文', async () => {
    const before = db.prepare('SELECT config_json FROM trace_platform_settings WHERE id = 1').get().config_json;
    const beforeCipher = JSON.parse(before).apiAuth.commKeyCipher;

    const save = await putConfig(adminToken, {
      apiAuth: { allowedIps: ['1.2.3.4'], commKey: '' }, // 空串 = 不修改
      serviceProvider: { apiKey: '' },
    });
    assert.equal(save.status, 200, JSON.stringify(save.body));
    // 掩码仍与上次一致（未被清空/重加密）
    assert.equal(save.body.config.apiAuth.commKey, 'COMM****3456');
    assert.equal(save.body.config.serviceProvider.apiKey, 'APIK****7654');

    const after = db.prepare('SELECT config_json FROM trace_platform_settings WHERE id = 1').get().config_json;
    const afterCipher = JSON.parse(after).apiAuth.commKeyCipher;
    assert.equal(afterCipher, beforeCipher, '空串提交后密文应保持不变');
  });

  // ── 5) generation.mode 非法值回落 open ─────────────────────────────────────
  it('generation.mode 非法值回落 open', async () => {
    const save = await putConfig(adminToken, { generation: { mode: 'bogus' } });
    assert.equal(save.status, 200);
    assert.equal(save.body.config.generation.mode, 'open', '非法 mode 必须回落 open');
  });

  // ── 6) 防伪码库存：列出 + 调整写台账 ─────────────────────────────────────
  it('库存列出租户；调整写 trace_settings.cocom 并落台账', async () => {
    const list = await request(app).get('/api/admin/trace/cocom/tenants').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.list));
    const me = list.body.list.find((r) => r.tenantId === TENANT);
    assert.ok(me, '库存列表应包含目标租户');
    assert.equal(Number(me.cocom), 0);

    const adj = await request(app).put(`/api/admin/trace/cocom/tenants/${TENANT}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cocom: 500, note: '测试充值' });
    assert.equal(adj.status, 200, JSON.stringify(adj.body));
    assert.equal(adj.body.cocom, 500);

    const setRow = db.prepare('SELECT cocom FROM trace_settings WHERE tenant_id = ?').get(TENANT);
    assert.equal(Number(setRow.cocom), 500, 'trace_settings.cocom 应被更新为目标值');

    const ledger = await request(app).get(`/api/admin/trace/cocom/tenants/${TENANT}/ledger`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(ledger.status, 200);
    assert.ok(ledger.body.list.length >= 1, '应至少有一条充值台账');
    const top = ledger.body.list[0];
    assert.equal(Number(top.delta), 500);
    assert.equal(Number(top.balance_after), 500);
    assert.equal(top.operator, 'pfAdmin', '台账应记录操作人');
    assert.equal(top.note, '测试充值');
  });

  // ── 7) 库存调整非法值 400 + 租户越权 403 ─────────────────────────────────
  it('库存调整非法值 400；租户账号访问库存接口 403', async () => {
    const bad = await request(app).put(`/api/admin/trace/cocom/tenants/${TENANT}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cocom: 'abc' });
    assert.equal(bad.status, 400, '非数字库存值应 400');

    const denied = await request(app).get('/api/admin/trace/cocom/tenants')
      .set('Authorization', `Bearer ${tenantToken}`);
    assert.equal(denied.status, 403, '租户账号不应访问库存接口');
  });
});
