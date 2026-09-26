/**
 * /api/card/design/config 首页语义测试：
 * 无 pageType 时按 card 应用取页 —— ① home_pages.card 指向 → ② 无则预置 page_type='home' → ③ 兜底 is_home=1
 * 带 pageType 显式指定不受影响；panorama 同接口只读 homePages 不消费 pages 字段
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';

const PREVIEW_SECRET = 'nuok-design-preview-secret-2026';
const TID = 9001;

function previewUrl(query) {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const sig = createHash('sha256').update(`${TID}:${exp}:${PREVIEW_SECRET}`).digest('hex').slice(0, 32);
  return `/api/card/design/config?tid=${TID}&exp=${exp}&sig=${sig}${query}`;
}

function pageDesign(pageType, pageName, comps, status = 1, isHome = 0) {
  return {
    tenant_id: TID,
    page_type: pageType,
    page_name: pageName,
    design_json: JSON.stringify({ components: comps, meta: {} }),
    version: 1,
    status,
    is_home: isHome,
  };
}

let app;
let tmpDir;
let db;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardcfg-test-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  config.publicDir = path.join(tmpDir, 'public');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.mkdirSync(config.publicDir, { recursive: true });
  app = createApp();
  db = new DatabaseSync(config.dbPath);
});

after(() => {
  try { db.close(); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

function seedPages(rows) {
  const ins = db.prepare(
    'INSERT INTO tenant_page_design (tenant_id, page_type, page_name, design_json, version, status, is_home) VALUES (?,?,?,?,?,?,?)'
  );
  for (const r of rows) ins.run(r.tenant_id, r.page_type, r.page_name, r.design_json, r.version, r.status, r.is_home);
}

function seedHomePages(homePages) {
  db.prepare('INSERT INTO tenant_home_config (tenant_id, home_page, home_pages) VALUES (?, ?, ?)')
    .run(TID, homePages.card || 'card', JSON.stringify(homePages));
}

test('首页语义：无 pageType 且 home_pages.card 指向预置 home → 渲染 home 页', async () => {
  const homeComps = [{ type: 'grid-nav', id: 'g1' }, { type: 'pano-scenes', id: 'p1' }];
  seedPages([
    pageDesign('home', '首页', homeComps),
    pageDesign('mall-home', '商城首页', [{ type: 'swiper', id: 's1' }], 1, 1),
  ]);
  seedHomePages({ card: '/pages/cardMain/home?pageType=home' });
  const res = await request(app).get(previewUrl(''));
  assert.equal(res.status, 200);
  const comps = (res.body.pages && res.body.pages.components) || [];
  assert.deepEqual(comps.map((c) => c.type), ['grid-nav', 'pano-scenes']);
  assert.equal(res.body.homePage, '/pages/cardMain/home?pageType=home');
});

test('首页语义：无 pageType 且 home_pages.card 指向自定义页 → 渲染该自定义页', async () => {
  db.prepare('UPDATE tenant_home_config SET home_pages = ? WHERE tenant_id = ?')
    .run(JSON.stringify({ card: '/pages/cardMain/home?pageType=custom-1' }), TID);
  seedPages([pageDesign('custom-1', '自定义首页', [{ type: 'notice', id: 'n1' }])]);
  const res = await request(app).get(previewUrl(''));
  assert.equal(res.status, 200);
  const comps = (res.body.pages && res.body.pages.components) || [];
  assert.deepEqual(comps.map((c) => c.type), ['notice']);
});

test('首页语义：无 pageType 且 card 未配置、home 页缺失 → 兜底 is_home=1（商城首页）', async () => {
  // card 不跳转（home_page='card'）且 home_pages.card 为空、预置 home 页被删除 → 回退 is_home=1
  db.prepare('UPDATE tenant_home_config SET home_pages = ?, home_page = ? WHERE tenant_id = ?')
    .run('{}', 'card', TID);
  db.prepare("DELETE FROM tenant_page_design WHERE tenant_id = ? AND page_type = 'home'").run(TID);
  db.prepare('UPDATE tenant_page_design SET is_home = 0 WHERE tenant_id = ?').run(TID);
  seedPages([pageDesign('mall-home', '商城首页', [{ type: 'goods-list', id: 'gl1' }], 1, 1)]);
  const res = await request(app).get(previewUrl(''));
  assert.equal(res.status, 200);
  const comps = (res.body.pages && res.body.pages.components) || [];
  assert.deepEqual(comps.map((c) => c.type), ['goods-list']);
});

test('首页语义：带 pageType 显式指定不受 card 语义影响', async () => {
  seedPages([pageDesign('home', '首页', [{ type: 'grid-nav', id: 'g1' }, { type: 'pano-scenes', id: 'p1' }])]);
  const res = await request(app).get(previewUrl('&pageType=home'));
  assert.equal(res.status, 200);
  const comps = (res.body.pages && res.body.pages.components) || [];
  assert.deepEqual(comps.map((c) => c.type), ['grid-nav', 'pano-scenes']);
});


test('首页跳转 URL：is_home=1 为商城首页 → homePageUrl 指向商城壳', async () => {
  db.prepare('UPDATE tenant_home_config SET home_pages = ?, home_page = ? WHERE tenant_id = ?')
    .run('{}', 'card', TID);
  db.prepare('UPDATE tenant_page_design SET is_home = 0 WHERE tenant_id = ?').run(TID);
  db.prepare("DELETE FROM tenant_page_design WHERE tenant_id = ? AND page_type = 'mall-home'").run(TID);
  seedPages([pageDesign('mall-home', '商城首页', [{ type: 'goods-list', id: 'gl1' }], 1, 1)]);
  const res = await request(app).get(previewUrl(''));
  assert.equal(res.status, 200);
  assert.equal(res.body.homePageUrl, '/pages/mall/index?pageType=mall-home');
});

test('首页跳转 URL：is_home=1 为自定义页 → homePageUrl 指向全景通用壳', async () => {
  db.prepare('UPDATE tenant_page_design SET is_home = 0 WHERE tenant_id = ?').run(TID);
  db.prepare("DELETE FROM tenant_page_design WHERE tenant_id = ? AND page_type = 'custom-99'").run(TID);
  seedPages([pageDesign('custom-99', '自定义首页', [{ type: 'notice', id: 'n1' }], 1, 1)]);
  const res = await request(app).get(previewUrl(''));
  assert.equal(res.status, 200);
  assert.equal(res.body.homePageUrl, '/pages/panorama/home?pageType=custom-99');
});

test('首页跳转 URL：无 is_home 页面 → 兜底智能名片 home', async () => {
  db.prepare('UPDATE tenant_page_design SET is_home = 0 WHERE tenant_id = ?').run(TID);
  db.prepare("DELETE FROM tenant_page_design WHERE tenant_id = ? AND page_type = 'home'").run(TID);
  seedPages([pageDesign('home', '首页', [{ type: 'grid-nav', id: 'g1' }], 1, 0)]);
  const res = await request(app).get(previewUrl(''));
  assert.equal(res.status, 200);
  assert.equal(res.body.homePageUrl, '/pages/cardMain/home?pageType=home');
});
