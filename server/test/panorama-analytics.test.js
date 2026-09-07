import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';

/**
 * 全景（panorama）行为分析：solution 维度隔离 + 全景漏斗/热门场景/健康分
 * B1 全景事件写入（panorama_view / scene_view / form_submit）
 * B2 全景漏斗：曝光→方案浏览→场景浏览→表单提交（visitor 去重）
 * B3 热门场景 TOP（scene_id 聚合 + 场景名）
 * B4 全景健康分：方案/场景资产 + 访客 + 转化 + 互动
 * B5 solution 隔离：card 与 panorama 事件互不串扰
 */
let app, db, server, tmpDir, t1Token;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  db = createDb(config.dbPath);
  app = createApp({ db });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));

  const { hash, salt } = hashPassword('admin123');
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('admin','13800000000',?,?,'admin','active',NULL)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES ('tenant1','13800000001',?,?,'tenant_admin','active',1)").run(hash, salt);
  db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (1, '一号客户', 'active', '[\"panorama\"]')").run();

  // 全景资产：方案 ×2 + 场景 ×2
  db.prepare("INSERT OR IGNORE INTO plans (id, project_id, name, published) VALUES (1, 1, '展厅方案', 1)").run();
  db.prepare("INSERT OR IGNORE INTO plans (id, project_id, name, published) VALUES (2, 1, '门店方案', 1)").run();
  db.prepare("INSERT OR IGNORE INTO scenes (id, title, plan_id, published, image_path) VALUES (1, '主展厅', 1, 1, '/s/1.jpg')").run();
  db.prepare("INSERT OR IGNORE INTO scenes (id, title, plan_id, published, image_path) VALUES (2, '洽谈区', 1, 1, '/s/2.jpg')").run();
  // 修正 scenes 表列（迁移后为 plan_id）
  const cols = db.prepare("PRAGMA table_info(scenes)").all().map((c) => c.name);
  if (cols.includes('plan_id')) {
    db.prepare('UPDATE scenes SET plan_id = 1 WHERE id IN (1,2)').run();
  }

  const login = await request(app).post('/api/auth/login').send({ username: 'tenant1', password: 'admin123' });
  t1Token = login.body.token;
});

after(() => {
  try { server?.close(); } catch {}
  try { db.close(); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

/** 租户上下文上报全景事件 */
function postEvents(events, token, solution = 'panorama') {
  return request(app).post('/api/card/analytics/events')
    .set('Authorization', `Bearer ${token || t1Token}`)
    .send({ events, solution });
}

test('B1 全景事件写入（solution=panorama）', async () => {
  const r = await postEvents([
    { eventType: 'page_view', page: '/p/1', visitorKey: 'pv1' },
    { eventType: 'panorama_view', page: '/p/1', sceneId: 1, visitorKey: 'pv1', durationMs: 2000 },
    { eventType: 'scene_view', sceneId: 1, visitorKey: 'pv1' },
    { eventType: 'form_submit', sceneId: 1, visitorKey: 'pv1', extra: { name: '李总' } },
  ]);
  assert.equal(r.status, 200);
  assert.equal(r.body.written, 4);
  const rows = db.prepare("SELECT solution, event_type FROM analytics_events WHERE tenant_id = 1").all();
  assert.ok(rows.length >= 4 && rows.every((x) => x.solution === 'panorama'));
});

test('B2 全景漏斗：曝光→方案→场景→表单（访客去重）', async () => {
  // 再制造一个访客只到场景层
  await postEvents([
    { eventType: 'page_view', visitorKey: 'pv2' },
    { eventType: 'panorama_view', sceneId: 1, visitorKey: 'pv2' },
    { eventType: 'scene_view', sceneId: 2, visitorKey: 'pv2' },
  ]);
  const r = await request(app).get('/api/customer/analytics/funnel?solution=panorama').set('Authorization', `Bearer ${t1Token}`);
  assert.equal(r.status, 200);
  const steps = r.body.funnel;
  assert.deepEqual(steps.map((s) => s.label), ['页面曝光', '浏览方案', '浏览场景', '表单提交']);
  assert.equal(steps[0].visitors, 2, '2个访客曝光');
  assert.equal(steps[1].visitors, 2);
  assert.equal(steps[2].visitors, 2);
  assert.equal(steps[3].visitors, 1, '仅pv1提交表单');
});

test('B3 热门场景 TOP：scene_id 聚合 + 场景名', async () => {
  const r = await request(app).get('/api/customer/analytics/top?solution=panorama').set('Authorization', `Bearer ${t1Token}`);
  assert.equal(r.status, 200);
  const top = r.body.top;
  assert.ok(top.length >= 1);
  const first = top.find((x) => x.sceneId === 1);
  assert.ok(first, '场景1进入TOP');
  assert.equal(first.name, '主展厅');
  assert.ok(first.views >= 1);
  assert.ok('planViews' in first, '返回方案浏览数');
});

test('B4 全景健康分：方案/场景资产 + 访客 + 转化 + 互动', async () => {
  const r = await request(app).get('/api/customer/analytics/health?solution=panorama').set('Authorization', `Bearer ${t1Token}`);
  assert.equal(r.status, 200);
  const h = r.body.health;
  assert.equal(h.dimensions.length, 5);
  const keys = h.dimensions.map((d) => d.key);
  assert.deepEqual(keys, ['plan', 'scene', 'visitor', 'conversion', 'interact']);
  // 方案2个×4分=8；场景2个=2分
  assert.equal(h.dimensions[0].score, 8);
  assert.equal(h.dimensions[1].score, 2);
  // 访客活跃：2访客/2方案×20=20
  assert.equal(h.dimensions[2].score, 20);
  assert.ok(h.score > 0 && h.advice.length >= 0);
});

test('B6 游客全景事件：sceneId 反查租户归属', async () => {
  // 无 token 游客，事件只带 sceneId（scene1 属于 plans.project_id=1）
  const r = await request(app).post('/api/card/analytics/events')
    .send({ solution: 'panorama', events: [{ eventType: 'scene_view', sceneId: 1, visitorKey: 'guest-xyz' }] });
  assert.equal(r.status, 200);
  const row = db.prepare("SELECT tenant_id FROM analytics_events WHERE visitor_key = 'guest-xyz'").get();
  assert.equal(row.tenant_id, 1, '游客 sceneId 反查归属租户1');

  // 不存在的场景：tenant_id 保持 0（不入租户账）
  const r2 = await request(app).post('/api/card/analytics/events')
    .send({ solution: 'panorama', events: [{ eventType: 'scene_view', sceneId: 99999, visitorKey: 'guest-null' }] });
  assert.equal(r2.status, 200);
  const row2 = db.prepare("SELECT tenant_id FROM analytics_events WHERE visitor_key = 'guest-null'").get();
  assert.equal(row2.tenant_id, 0);
});

test('B5 solution 隔离：card 事件不进入全景洞察', async () => {
  // 写入 card 事件（默认 card solution）
  await postEvents([
    { eventType: 'card_view', cardId: 999, visitorKey: 'cardv1' },
    { eventType: 'exchange_init', cardId: 999, visitorKey: 'cardv1' },
  ]);
  // 全景漏斗不受 card 事件影响
  const f = await request(app).get('/api/customer/analytics/funnel?solution=panorama').set('Authorization', `Bearer ${t1Token}`);
  const cardStep = f.body.funnel.find((s) => s.key === 'card_view');
  assert.ok(!cardStep, '全景漏斗不含card步骤');
  assert.equal(f.body.funnel[0].visitors, 2, '全景漏斗仍只有2个全景访客');

  // card 漏斗也不含全景事件
  const fc = await request(app).get('/api/customer/analytics/funnel?solution=card').set('Authorization', `Bearer ${t1Token}`);
  const panoStep = fc.body.funnel.find((s) => s.key === 'scene_view');
  assert.ok(!panoStep, 'card漏斗不含全景步骤');
  const ev = fc.body.funnel.find((s) => s.key === 'page_view');
  assert.equal(ev.visitors, 0, 'card漏斗曝光不含全景访客');
});
