/**
 * 回归锁：防伪码库存 —— 充值入口收归平台侧（2026-10-29）
 *
 * 背景：原租户侧 POST /api/customer/trace/recharge 只过 requireTenant，
 *       tenant_member 也能调用、无上限、无支付/发放凭证、无平台审计 → 计量没有可信来源。
 *       现改为：租户侧删除入口（只读余量），平台侧（/api/admin/trace）提供累加型充值。
 *
 * 钉死六条：
 *   1) 租户侧 /trace/recharge 已不存在（404），且普通成员不能再自助加额
 *   2) 平台充值 = 累加（+N），不是覆盖
 *   3) 「不限」(-888) 租户充值被拒绝且不写台账（避免出现「不限 → 101000」这种悄悄转限量的副作用）
 *   4) 租户角色调平台接口 403；operator 可充值
 *   5) 调整接口拒绝脏取值（-5），接受 -888（不限）
 *   6) 充值闭环：限量 5 → 生成 3 个码 → 余量 2（证明库存真的被消费）
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

describe('防伪码库存：充值入口收归平台侧', () => {
  let tmpDir, db, app, server;
  let adminToken, operatorToken, tenantToken;

  const TENANT = 921;
  const UNLIMITED_TENANT = 922;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-cocom-'));
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
    globalThis.__traceCocomPrev = prev;

    const { hash, salt } = hashPassword('admin123');
    const insUser = db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, ?, 'active', ?)");
    insUser.run('coAdmin', '13800000911', hash, salt, 'admin', null);
    insUser.run('coOperator', '13800000912', hash, salt, 'operator', null);
    insUser.run('coTenant', '13800000913', hash, salt, 'tenant_admin', TENANT);
    insUser.run('coMember', '13800000914', hash, salt, 'tenant_member', TENANT);
    const insProj = db.prepare('INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (?, ?, \'active\', ?)');
    insProj.run(TENANT, '限量租户', '["trace"]');
    insProj.run(UNLIMITED_TENANT, '不限租户', '["trace"]');

    const login = async (u) => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token;
    adminToken = await login('coAdmin');
    operatorToken = await login('coOperator');
    tenantToken = await login('coTenant');

    // 两个租户预置库存：TENANT 从 0 起步（需要先造行），UNLIMITED_TENANT 为 -888
    db.prepare(`INSERT INTO trace_settings (tenant_id, settings_json, luck_json, cocom, updated_at)
      VALUES (?, '{}', '{}', 0, datetime('now'))`).run(TENANT);
    db.prepare(`INSERT INTO trace_settings (tenant_id, settings_json, luck_json, cocom, updated_at)
      VALUES (?, '{}', '{}', -888, datetime('now'))`).run(UNLIMITED_TENANT);
  });

  after(() => {
    try { server?.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, globalThis.__traceCocomPrev);
  });

  const cocomOf = (t) => Number(db.prepare('SELECT cocom FROM trace_settings WHERE tenant_id = ?').get(t)?.cocom);
  const ledgerOf = (t) => db.prepare('SELECT delta, balance_after, operator, note FROM trace_cocom_recharges WHERE tenant_id = ? ORDER BY id ASC').all(t);

  it('租户侧充值接口已移除（404，不是 405/403）', async () => {
    const r = await request(app)
      .post('/api/customer/trace/recharge')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ amount: 1000 });
    assert.equal(r.status, 404, '租户侧仍存在充值入口 = 计量口径没收回');
  });

  it('平台充值是累加：0 → +1000 → +500 = 1500', async () => {
    const a = await request(app).post(`/api/admin/trace/cocom/tenants/${TENANT}/recharge`)
      .set('Authorization', `Bearer ${adminToken}`).send({ amount: 1000, note: '订单A' });
    assert.equal(a.status, 200);
    assert.equal(a.body.cocom, 1000);
    const b = await request(app).post(`/api/admin/trace/cocom/tenants/${TENANT}/recharge`)
      .set('Authorization', `Bearer ${adminToken}`).send({ amount: 500, note: '订单B' });
    assert.equal(b.body.cocom, 1500, '第二次充值把前一次覆盖了');
    assert.equal(cocomOf(TENANT), 1500);

    const led = ledgerOf(TENANT);
    assert.equal(led.length, 2);
    assert.equal(led[0].delta, 1000);
    assert.equal(led[0].balance_after, 1000);
    assert.equal(led[1].delta, 500);
    assert.equal(led[1].balance_after, 1500);
    assert.equal(led[0].operator, 'coAdmin');
    assert.equal(led[0].note, '订单A');
  });

  it('「不限」租户充值被拒绝，且不写任何台账（不会悄悄变成限量）', async () => {
    const r = await request(app).post(`/api/admin/trace/cocom/tenants/${UNLIMITED_TENANT}/recharge`)
      .set('Authorization', `Bearer ${adminToken}`).send({ amount: 1000 });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /不限/);
    assert.equal(cocomOf(UNLIMITED_TENANT), -888, '不限被覆盖了');
    assert.equal(ledgerOf(UNLIMITED_TENANT).length, 0, '被拒绝的充值不该留台账');
  });

  it('充值入参校验：非正整数 / 数量过大 / 租户不存在 → 400', async () => {
    for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 1.5 }, { amount: 99999999 }]) {
      const r = await request(app).post(`/api/admin/trace/cocom/tenants/${TENANT}/recharge`)
        .set('Authorization', `Bearer ${adminToken}`).send(bad);
      assert.equal(r.status, 400, `amount=${bad.amount} 不该被接受`);
    }
    const noTenant = await request(app).post('/api/admin/trace/cocom/tenants/999999/recharge')
      .set('Authorization', `Bearer ${adminToken}`).send({ amount: 10 });
    assert.equal(noTenant.status, 400);
    assert.match(noTenant.body.error, /租户不存在/);
  });

  it('门控：租户角色调平台接口 403，operator 可充值', async () => {
    const denied = await request(app).post(`/api/admin/trace/cocom/tenants/${TENANT}/recharge`)
      .set('Authorization', `Bearer ${tenantToken}`).send({ amount: 10 });
    assert.equal(denied.status, 403);

    const ok = await request(app).post(`/api/admin/trace/cocom/tenants/${TENANT}/recharge`)
      .set('Authorization', `Bearer ${operatorToken}`).send({ amount: 10 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.cocom, 1510);
  });

  it('调整接口拒绝脏取值 -5，接受 -888（不限）与 0', async () => {
    const bad = await request(app).put(`/api/admin/trace/cocom/tenants/${TENANT}`)
      .set('Authorization', `Bearer ${adminToken}`).send({ cocom: -5 });
    assert.equal(bad.status, 400);

    const zero = await request(app).put(`/api/admin/trace/cocom/tenants/${TENANT}`)
      .set('Authorization', `Bearer ${adminToken}`).send({ cocom: 5, note: '限量 5' });
    assert.equal(zero.body.cocom, 5);

    const unl = await request(app).put(`/api/admin/trace/cocom/tenants/${TENANT}`)
      .set('Authorization', `Bearer ${adminToken}`).send({ cocom: -888, note: '改回不限' });
    assert.equal(unl.body.cocom, -888);
    assert.equal(cocomOf(TENANT), -888);
  });

  it('闭环：限量 3 → 生成 3 个码 → 余量 0（库存是真的被消费）', async () => {
    await request(app).put(`/api/admin/trace/cocom/tenants/${TENANT}`)
      .set('Authorization', `Bearer ${adminToken}`).send({ cocom: 3 });

    // 码制 → 批次 → 生成
    const rule = await request(app).put('/api/customer/trace/code-rule')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ m1: 'FW', m2: 7, m3: 6, m4: 2, m5: 17, zdl: 5, k1: '0123456789', k2: '0123456789', k3: '0123456789', k4: '0123456789' });
    assert.equal(rule.status, 200);

    const batch = await request(app).post('/api/customer/trace/batches')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ batch: 'CLOSED1', product: '闭环测试品', inttype: 0, bbox: 0, sbox: 0 });
    assert.equal(batch.status, 200, `建批次失败：${JSON.stringify(batch.body)}`);
    const batchId = batch.body.id || batch.body.batchId;
    assert.ok(batchId, '未返回批次 id');

    await request(app).post(`/api/customer/trace/batches/${batchId}/activate`)
      .set('Authorization', `Bearer ${tenantToken}`).send({});

    const gen = await request(app).post(`/api/customer/trace/batches/${batchId}/generate-codes`)
      .set('Authorization', `Bearer ${tenantToken}`).send({ codetype: 1, codeno: 3 });
    assert.equal(gen.status, 200, `生成失败：${JSON.stringify(gen.body)}`);
    assert.equal(cocomOf(TENANT), 0, '生成 3 个后应扣到 0');
  });
});
