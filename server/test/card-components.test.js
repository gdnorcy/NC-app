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
 * 名片自定义装修组件 API（2026-10-20 V1）
 * 覆盖：
 *  - GET 公开读：母版（isLock）按 customer_id 注入且排在个人组件前；他租户母版不串
 *  - PUT 整存：仅归属人；数组顺序即 sort_order；服务端剥离 source/isLock（防伪造母版）
 *  - 非法 type 400 / 超上限 400 / 未登录 401 / 他人名片 404
 *  - props 原样存取（含中文与嵌套对象）
 */
let app, db, server, tmpDir;

// C 端 token：card.js 的 auth 只解析第一段 base64 的 {uid}
const cardTok = (uid) => ({ Authorization: 'Bearer ' + Buffer.from(JSON.stringify({ uid })).toString('base64') + '.sig' });

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-comp-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  db = createDb(config.dbPath);
  app = createApp({ db });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));

  // 租户1 的用户与名片；租户2 的用户与名片（母版隔离对照组）
  db.prepare("INSERT OR IGNORE INTO platform_user (id, customer_id, nickname, status) VALUES (201, 1, '组件主人', 'active')").run();
  db.prepare("INSERT OR IGNORE INTO platform_user (id, customer_id, nickname, status) VALUES (202, 1, '隔壁用户', 'active')").run();
  db.prepare("INSERT OR IGNORE INTO platform_user (id, customer_id, nickname, status) VALUES (203, 2, '他租户用户', 'active')").run();
  db.prepare("INSERT OR IGNORE INTO card_profile (id, user_id, customer_id, name, position) VALUES (201, 201, 1, '组件主人', '主理人')").run();
  db.prepare("INSERT OR IGNORE INTO card_profile (id, user_id, customer_id, name, position) VALUES (202, 202, 1, '隔壁用户', '邻居')").run();
  db.prepare("INSERT OR IGNORE INTO card_profile (id, user_id, customer_id, name, position) VALUES (203, 203, 2, '他租户用户', '外人')").run();

  // 母版：租户1 两条（分割线 + 公告），租户2 一条（不得串到租户1 的名片）
  db.prepare("INSERT INTO card_components (id, card_id, customer_id, type, props, sort_order, source) VALUES (900, 0, 1, 'divider', '{\"text\":\"企业分割\"}', 1, 'master')").run();
  db.prepare("INSERT INTO card_components (id, card_id, customer_id, type, props, sort_order, source) VALUES (901, 0, 1, 'notice', '{\"text\":\"总部公告\"}', 2, 'master')").run();
  db.prepare("INSERT INTO card_components (id, card_id, customer_id, type, props, sort_order, source) VALUES (902, 0, 2, 'notice', '{\"text\":\"别家母版\"}', 1, 'master')").run();
});

after(() => {
  try { server?.close(); } catch {}
  try { db.close(); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

test('GET 公开读：母版 isLock 注入在前，个人组件随后；他租户母版不串门', async () => {
  // 先存两条个人组件（notice + channel-video）
  const put = await request(app).put('/api/card/cards/201/components')
    .set(cardTok(201))
    .send({ components: [
      { type: 'notice', props: { text: '欢迎合作' } },
      { type: 'channel-video', props: { finderUserName: 'sPh7vD5', feedId: '1065', title: '宣传片' } },
    ] });
  assert.equal(put.status, 200, put.body?.error);
  assert.equal(put.body.count, 2);

  const r = await request(app).get('/api/card/cards/201/components');
  assert.equal(r.status, 200);
  const comps = r.body.components;
  assert.equal(comps.length, 4, '母版2 + 个人2');
  // 母版在前且锁定
  assert.deepEqual(comps.slice(0, 2).map((c) => c.isLock), [true, true]);
  assert.equal(comps[0].type, 'divider');
  assert.equal(comps[0].props.text, '企业分割');
  assert.equal(comps[1].type, 'notice');
  // 个人组件随后，顺序即提交顺序
  assert.equal(comps[2].isLock, false);
  assert.equal(comps[2].type, 'notice');
  assert.equal(comps[2].props.text, '欢迎合作');
  assert.equal(comps[3].type, 'channel-video');
  assert.equal(comps[3].props.feedId, '1065');
  assert.equal(comps[3].props.title, '宣传片');
  // 他租户母版（902）不得出现
  assert.ok(!comps.some((c) => c.props.text === '别家母版'), '他租户母版不串门');
});

test('PUT 整存语义：再次提交替换全部个人组件并重排', async () => {
  const put = await request(app).put('/api/card/cards/201/components')
    .set(cardTok(201))
    .send({ components: [
      { type: 'spacer', props: { height: 30 } },
      { type: 'image', props: { url: 'https://example.com/a.png' } },
    ] });
  assert.equal(put.status, 200, put.body?.error);
  const r = await request(app).get('/api/card/cards/201/components');
  const mine = r.body.components.filter((c) => !c.isLock);
  assert.equal(mine.length, 2, '旧的两条被替换');
  assert.deepEqual(mine.map((c) => c.type), ['spacer', 'image']);
  assert.equal(mine[0].props.height, 30);
  // 母版仍在（不受个人整存影响）
  assert.equal(r.body.components.filter((c) => c.isLock).length, 2);
});

test('PUT 防伪造母版：payload 里塞 source=master / isLock 一律被剥离', async () => {
  const put = await request(app).put('/api/card/cards/201/components')
    .set(cardTok(201))
    .send({ components: [
      { type: 'notice', props: { text: '伪造尝试' }, source: 'master', isLock: true, cardId: 999, customerId: 2 },
    ] });
  assert.equal(put.status, 200, put.body?.error);
  const r = await request(app).get('/api/card/cards/201/components');
  const forged = r.body.components.filter((c) => c.props.text === '伪造尝试');
  assert.equal(forged.length, 1);
  assert.equal(forged[0].isLock, false, 'isLock 被剥离');
  assert.equal(forged[0].source, undefined, 'source 不下发');
  // 且没有变成租户2 的母版（203 的名片看不到它）
  const other = await request(app).get('/api/card/cards/203/components');
  assert.ok(!other.body.components.some((c) => c.props.text === '伪造尝试'), '未串成他租户母版');
  // 恢复干净状态
  await request(app).put('/api/card/cards/201/components').set(cardTok(201)).send({ components: [] });
});

test('PUT 非法组件类型 400（白名单外）', async () => {
  const put = await request(app).put('/api/card/cards/201/components')
    .set(cardTok(201))
    .send({ components: [{ type: 'evil-script', props: {} }] });
  assert.equal(put.status, 400);
  assert.match(put.body.error, /不支持的组件类型/);
});

test('PUT 新增组件类型：button / rich-text 过白名单且 props 原样往返', async () => {
  const put = await request(app).put('/api/card/cards/201/components')
    .set(cardTok(201))
    .send({ components: [
      { type: 'button', props: { text: '立即查看', url: '/pages/card/market', widthMode: 'full', widthPercent: 80 } },
      // 富文本内容含 HTML 与中文：原样存取（消毒在 C 端渲染层，服务端不做内容审查）
      { type: 'rich-text', props: { html: '<p>欢迎<b>合作</b></p>', compBgColor: '#ffffff', style: 'border' } },
    ] });
  assert.equal(put.status, 200, put.body?.error);
  const r = await request(app).get('/api/card/cards/201/components');
  const mine = r.body.components.filter((c) => !c.isLock);
  assert.deepEqual(mine.map((c) => c.type), ['button', 'rich-text']);
  assert.equal(mine[0].props.text, '立即查看');
  assert.equal(mine[0].props.widthPercent, 80);
  assert.equal(mine[1].props.html, '<p>欢迎<b>合作</b></p>');
  await request(app).put('/api/card/cards/201/components').set(cardTok(201)).send({ components: [] });
});

test('PUT 超过数量上限 400（服务端 COMP_MAX=20）', async () => {
  const many = Array.from({ length: 21 }, () => ({ type: 'spacer', props: { height: 10 } }));
  const put = await request(app).put('/api/card/cards/201/components')
    .set(cardTok(201))
    .send({ components: many });
  assert.equal(put.status, 400);
  assert.match(put.body.error, /最多 20 个/);
  // 上限内（20 个）放行
  const ok = await request(app).put('/api/card/cards/201/components')
    .set(cardTok(201))
    .send({ components: many.slice(0, 20) });
  assert.equal(ok.status, 200);
  await request(app).put('/api/card/cards/201/components').set(cardTok(201)).send({ components: [] });
});

test('PUT 权限：未登录 401 / 他人名片 404', async () => {
  const noAuth = await request(app).put('/api/card/cards/201/components').send({ components: [] });
  assert.equal(noAuth.status, 401);
  const other = await request(app).put('/api/card/cards/201/components')
    .set(cardTok(202))
    .send({ components: [{ type: 'spacer', props: {} }] });
  assert.equal(other.status, 404, '非归属人不能改');
});

test('GET 名片不存在 404；components 非数组 400', async () => {
  const nf = await request(app).get('/api/card/cards/9999/components');
  assert.equal(nf.status, 404);
  const bad = await request(app).put('/api/card/cards/201/components')
    .set(cardTok(201))
    .send({ components: 'nope' });
  assert.equal(bad.status, 400);
});
