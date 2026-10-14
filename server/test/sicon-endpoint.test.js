import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';

/**
 * SIcon 服务端按需渲染端点回归（2026-10-15 真机报修）。
 * 病根：MP 端 SIcon 用构建期烘焙的 base64（sicons-base64.js），色板只覆盖
 * 「构建那一刻」的颜色；租户切换主题色（玫红→草绿）后运行期颜色未烘焙 →
 * 兜底黑色 → 名片内容等图标全黑不跟主题。
 * 修复：GET /api/card/sicon?name=&color= 按需渲染任意颜色（sharp 同管线），
 * 客户端精确命中走离线 base64、未命中走本端点。
 */
let app;
let tmpDir;
let db;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-sicon-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('渲染草绿主题色图标：200 + PNG + 可缓存头', async () => {
  const res = await request(app).get('/api/card/sicon').query({ name: 'card', color: '4FA140' });
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /image\/png/);
  assert.match(res.headers['cache-control'] || '', /public.*max-age=86400/);
  const body = Buffer.from(res.body);
  assert.ok(body.subarray(0, 8).equals(PNG_MAGIC), '响应体应是 PNG（magic bytes）');
  assert.ok(body.length > 200, `PNG 体积应正常（${body.length}B）`);
});

test('带 # 前缀与大小写混写均归一化', async () => {
  const a = await request(app).get('/api/card/sicon').query({ name: 'card', color: '#4fa140' });
  const b = await request(app).get('/api/card/sicon').query({ name: 'radar', color: 'FE0137' });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
});

test('3 位简写 hex 合法', async () => {
  const res = await request(app).get('/api/card/sicon').query({ name: 'card', color: 'f00' });
  assert.equal(res.status, 200);
});

test('内存缓存：同 (name,color) 二次请求字节一致', async () => {
  const r1 = await request(app).get('/api/card/sicon').query({ name: 'market', color: '4FA140' });
  const r2 = await request(app).get('/api/card/sicon').query({ name: 'market', color: '4FA140' });
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.ok(Buffer.from(r1.body).equals(Buffer.from(r2.body)), '缓存命中应返回同一份 PNG');
});

test('未知图标名 → 404', async () => {
  const res = await request(app).get('/api/card/sicon').query({ name: 'not-exist-icon', color: '4FA140' });
  assert.equal(res.status, 404);
});

test('非法颜色（注入/非 hex）→ 400', async () => {
  for (const color of ['red', '#zzz', '"><script>', '']) {
    const res = await request(app).get('/api/card/sicon').query({ name: 'card', color });
    assert.equal(res.status, 400, `color=${JSON.stringify(color)} 应被拒`);
  }
});

test('非法图标名（路径穿越）→ 400/404，不泄源码', async () => {
  const res = await request(app).get('/api/card/sicon').query({ name: '../../SIcon.vue', color: '4FA140' });
  assert.ok([400, 404].includes(res.status), `应被拒，实际 ${res.status}`);
  assert.ok(!String(res.text || '').includes('svgMap'), '不得回显源码内容');
});

test('svgMap 单一事实来源：端点用的图标集与 SIcon.vue 源码一致（crown 存在）', async () => {
  const res = await request(app).get('/api/card/sicon').query({ name: 'crown', color: '165DFF' });
  assert.equal(res.status, 200, 'crown 在 SIcon.vue svgMap 中，应可渲染');
});
