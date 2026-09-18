/**
 * 行业应用公开入口分发测试（独立首页方案）
 * - 根路径 / → 301 /pano（全景迁移，保留 query）
 * - /pano、/card 前缀 → 各自 SPA index.html（SPA fallback）
 * - 静态资源（assets）强缓存放行
 * - 顶层 ?tid= 且未开通 → 统一「未开通」提示页（403）
 * - 顶层 ?tid= 已开通 / 无 tid / 预览签名(exp+sig) → 放行
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { config } from '../src/config.js';

describe('行业应用公开入口（独立首页分发）', () => {
  let db, app, server, tmpDist, tmpDb;
  let baseUrl;

  before(async () => {
    // 临时全景产物目录（模拟 web/dist：index.html 引用 /pano/assets/）
    tmpDist = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-dist-'));
    fs.mkdirSync(path.join(tmpDist, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(tmpDist, 'index.html'), '<!doctype html><html><head><script type="module" src="/pano/assets/main-test.js"></script></head><body>pano</body></html>');
    fs.writeFileSync(path.join(tmpDist, 'assets', 'main-test.js'), 'console.log(1)');
    fs.writeFileSync(path.join(tmpDist, 'sw.js'), 'self.version=1;');

    // 临时 DB：创建租户（T_OPEN 开通 demo 方案=全应用；T_CLOSED 未开通任何方案）
    tmpDb = path.join(os.tmpdir(), `app-entry-${Date.now()}.db`);
    db = createDb(tmpDb);
    db.prepare("INSERT INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', ?)").run(99001, '已开通租户', JSON.stringify(['demo']));
    db.prepare("INSERT INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', ?)").run(99002, '未开通租户', JSON.stringify([]));

    // 指向临时全景产物目录
    config.webDistDir = tmpDist;
    app = createApp({ db });
    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
      server.on('error', reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    try { server.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDb, { force: true }); } catch {}
    try { fs.rmSync(tmpDist, { recursive: true, force: true }); } catch {}
  });

  const get = (url) => fetch(`${baseUrl}${url}`, { redirect: 'manual' });

  test('根路径 / 301 重定向到 /pano（保留 query）', async () => {
    const r = await get('/');
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), '/pano');
    const r2 = await get('/?plan=1&scene=3');
    assert.equal(r2.status, 301);
    assert.equal(r2.headers.get('location'), '/pano?plan=1&scene=3');
  });

  test('/sw.js 兼容重定向到 /pano/sw.js', async () => {
    const r = await get('/sw.js');
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), '/pano/sw.js');
  });

  test('/pano/ 返回全景 SPA index.html（引用 /pano/assets/）', async () => {
    const r = await get('/pano/');
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /\/pano\/assets\/main-test\.js/);
  });

  test('/pano/assets 静态资源放行', async () => {
    const r = await get('/pano/assets/main-test.js');
    assert.equal(r.status, 200);
    assert.match(await r.text(), /console\.log/);
  });

  test('/pano/?tid=已开通租户 → 200 放行', async () => {
    const r = await get('/pano/?tid=99001');
    assert.equal(r.status, 200);
  });

  test('/pano/?tid=未开通租户 → 403 未开通提示页（可跳应用中心）', async () => {
    const r = await get('/pano/?tid=99002');
    assert.equal(r.status, 403);
    const html = await r.text();
    assert.match(html, /未开通/);
    assert.match(html, /前往应用中心/);
  });

  test('/pano/?tid=不存在租户 → 403 提示页', async () => {
    const r = await get('/pano/?tid=99003');
    assert.equal(r.status, 403);
    assert.match(await r.text(), /未开通/);
  });

  test('/card/ 无 tid → 200（SPA 自行兜底）', async () => {
    const r = await get('/card/');
    assert.equal(r.status, 200);
  });

  test('/card/?tid=未开通租户 → 403 未开通提示页', async () => {
    const r = await get('/card/?tid=99002');
    assert.equal(r.status, 403);
    assert.match(await r.text(), /未开通/);
  });

  test('预览签名（exp+sig）跳过校验放行', async () => {
    const r = await get('/card/?nc=preview&exp=1789669951&sig=abc');
    assert.equal(r.status, 200);
  });

  test('非入口路径不拦截（/admin 等由既有路由处理）', async () => {
    const r = await get('/admin');
    assert.notEqual(r.status, 403);
  });
});
