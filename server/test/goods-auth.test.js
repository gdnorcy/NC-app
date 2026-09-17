/**
 * 商品管理应用授权（1:1 复刻菜鸟云「商品=总后台授权」）
 * - 未开通「商品管理」应用（goods）的租户访问 /api/customer/goods 应 403
 * - 开通 demo 方案（自动纳入全部应用）后应可访问
 * - 侧边栏数据源 /api/customer/apps 应含 goods（demo 租户）
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';
import { issueToken } from '../src/auth.js';

describe('商品应用授权（goods=平台授权）', () => {
  let app, db, tenantToken;

  before(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goods-auth-'));
    config.dataDir = tmpDir;
    config.uploadsDir = path.join(tmpDir, 'uploads');
    config.dbPath = path.join(tmpDir, 'panorama.db');
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    config.webDistDir = path.join(tmpDir, 'dist');
    fs.mkdirSync(config.webDistDir, { recursive: true });
    fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
    db = createDb(config.dbPath);
    app = createApp({ db });
    // 租户1：默认无方案（未授权任何应用）
    const { hash, salt } = hashPassword('123456');
    db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('goods_t1','13800001001',?,?,'tenant_admin','active',1)").run(hash, salt);
    const u = db.prepare("SELECT * FROM users WHERE username = 'goods_t1'").get();
    tenantToken = issueToken(u);
    db.prepare("UPDATE projects SET solutions = '[]' WHERE id = 1").run();
  });

  after(() => {
    try { db?.close(); } catch {}
  });

  const auth = () => ({ Authorization: `Bearer ${tenantToken}` });

  test('未开通 goods 应用：商品接口全部 403', async () => {
    const r = await request(app).get('/api/customer/goods').set(auth());
    assert.equal(r.status, 403);
    assert.match(r.body.error, /商品管理/);
    const l = await request(app).get('/api/customer/goods/licenses').set(auth());
    assert.equal(l.status, 403);
    const c = await request(app).get('/api/customer/goods/categories').set(auth());
    assert.equal(c.status, 403);
  });

  test('开通 demo 方案后：商品接口可访问，apps 清单含 goods', async () => {
    db.prepare("UPDATE projects SET solutions = '[\"demo\"]' WHERE id = 1").run();
    const r = await request(app).get('/api/customer/goods').set(auth());
    assert.equal(r.status, 200, `应可访问，实际 ${r.status} ${JSON.stringify(r.body)}`);
    const apps = await request(app).get('/api/customer/apps').set(auth());
    assert.equal(apps.status, 200);
    assert.ok(apps.body.apps.some(a => a.code === 'goods'), 'demo 租户应用清单应含 goods');
    // 未开通时 apps 清单不含 goods（复原后验证）
    db.prepare("UPDATE projects SET solutions = '[]' WHERE id = 1").run();
    const apps2 = await request(app).get('/api/customer/apps').set(auth());
    assert.ok(!apps2.body.apps.some(a => a.code === 'goods'), '未开通租户应用清单不应含 goods');
  });
});
