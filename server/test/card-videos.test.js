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
 * 视频号作品管理 + 会员分级门禁（benefits.js 单一来源）：
 * - 视频 CRUD + 归属校验 + 排序 + mime 校验（镜像 card_works 模型）
 * - free 无视频位（videosLimit=0）；silver 上限 2 → 第 3 个 403 limitHit
 * - works 上限跨名片累计：free 3 张 → 第 4 张 403 limitHit
 * - worksLabel 自定义门禁：free 403 labelLocked；silver 200 且落库；清空一律放行
 * - /member/status 下发 benefits 快照
 */
let app;
let db;
let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-videos-test-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>VIDEOS_ENTRY</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function wxLogin(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200);
  return res.body.token;
}

// token 形如 base64(JSON{uid,openid,ts}) + '.' + rand，解出 uid 供测试直改会员等级
function uidOf(token) {
  return JSON.parse(Buffer.from(String(token).split('.')[0], 'base64').toString()).uid;
}

async function createCard(token, name) {
  const res = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, position: '顾问', city: '深圳', isPublic: true });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.card.id;
}

// 设置会员等级（直改 platform_user；silver+ 给远期到期保证有效）
function setLevel(uid, level) {
  const expire = level === 'free' ? '' : '2099-12-31 23:59:59';
  db.prepare('UPDATE platform_user SET member_level = ?, member_expire_at = ? WHERE id = ?').run(level, expire, uid);
}

// 1x1 透明 PNG（multer 只校验 mime，storage.put 落盘；用真实 PNG 防图片处理链炸）
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test('视频 CRUD + 归属校验 + 排序（白银会员，限额 2）', async () => {
  const tokenA = await wxLogin('videos_owner_a');
  const tokenB = await wxLogin('videos_other_b');
  const uidA = uidOf(tokenA);
  setLevel(uidA, 'silver');
  const cardId = await createCard(tokenA, '视频主人');

  // 1. 新增视频条目（封面直传 + 标题 + 时长）
  const add1 = await request(app)
    .post(`/api/card/cards/${cardId}/videos`)
    .set('Authorization', `Bearer ${tokenA}`)
    .attach('file', PNG, { filename: 'v1.png', contentType: 'image/png' })
    .field('title', '展会现场')
    .field('duration', '03:24');
  assert.equal(add1.status, 201, JSON.stringify(add1.body));
  const v1 = add1.body.video;
  assert.ok(v1.id);
  assert.equal(v1.title, '展会现场');
  assert.equal(v1.duration, '03:24');
  assert.ok(v1.coverUrl);
  assert.equal(v1.sortOrder, 1);

  const add2 = await request(app)
    .post(`/api/card/cards/${cardId}/videos`)
    .set('Authorization', `Bearer ${tokenA}`)
    .attach('file', PNG, { filename: 'v2.png', contentType: 'image/png' })
    .field('title', '产品解读');
  assert.equal(add2.status, 201);
  const v2 = add2.body.video;
  assert.equal(v2.sortOrder, 2);

  // 2. 限额门禁：silver 上限 2 → 第 3 个 403 limitHit
  const over = await request(app)
    .post(`/api/card/cards/${cardId}/videos`)
    .set('Authorization', `Bearer ${tokenA}`)
    .attach('file', PNG, { filename: 'v3.png', contentType: 'image/png' });
  assert.equal(over.status, 403, JSON.stringify(over.body));
  assert.equal(over.body.code, 'limitHit');
  assert.equal(over.body.kind, 'videos');
  assert.equal(over.body.limit, 2);

  // 3. 公开 GET 按 sort_order 升序
  const list = await request(app).get(`/api/card/cards/${cardId}/videos`);
  assert.equal(list.status, 200);
  assert.equal(list.body.videos.length, 2);
  assert.deepEqual(list.body.videos.map((v) => v.id), [v1.id, v2.id]);

  // 4. 改标题/时长
  const upd = await request(app)
    .put(`/api/card/cards/${cardId}/videos/${v1.id}`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ title: '展会现场v2', duration: '05:10' });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.video.title, '展会现场v2');
  assert.equal(upd.body.video.duration, '05:10');

  // 5. 排序：把 v2 提前 → GET 顺序应变
  const sort = await request(app)
    .put(`/api/card/cards/${cardId}/videos/sort`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ ids: [v2.id, v1.id] });
  assert.equal(sort.status, 200);
  const list2 = await request(app).get(`/api/card/cards/${cardId}/videos`);
  assert.deepEqual(list2.body.videos.map((v) => v.id), [v2.id, v1.id]);

  // 6. 归属校验：B（free）不能改/删 A 的视频（404，不泄漏存在性细节）
  const updB = await request(app)
    .put(`/api/card/cards/${cardId}/videos/${v1.id}`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ title: 'hack' });
  assert.equal(updB.status, 404);
  const delB = await request(app).delete(`/api/card/cards/${cardId}/videos/${v1.id}`).set('Authorization', `Bearer ${tokenB}`);
  assert.equal(delB.status, 404);

  // 7. 未登录不能写（401）
  const noAuth = await request(app).put(`/api/card/cards/${cardId}/videos/${v1.id}`).send({ title: 'x' });
  assert.equal(noAuth.status, 401);

  // 8. 非图片 mime 拒绝
  const badMime = await request(app)
    .post(`/api/card/cards/${cardId}/videos`)
    .set('Authorization', `Bearer ${tokenA}`)
    .attach('file', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
  assert.equal(badMime.status, 400);

  // 9. 删除（A）→ 只剩 v2
  const del = await request(app).delete(`/api/card/cards/${cardId}/videos/${v1.id}`).set('Authorization', `Bearer ${tokenA}`);
  assert.equal(del.status, 200);
  const list3 = await request(app).get(`/api/card/cards/${cardId}/videos`);
  assert.deepEqual(list3.body.videos.map((v) => v.id), [v2.id]);
});

test('会员分级门禁：free 作品 3 张上限 + free 无视频位 + worksLabel 仅白银+', async () => {
  const token = await wxLogin('videos_free_c');
  const uid = uidOf(token);
  setLevel(uid, 'free');
  const cardId = await createCard(token, '限额用户');

  // 1. free 作品上限 3：前 3 个 201，第 4 个 403 limitHit
  for (let i = 1; i <= 3; i++) {
    const r = await request(app)
      .post(`/api/card/cards/${cardId}/works`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG, { filename: `w${i}.png`, contentType: 'image/png' });
    assert.equal(r.status, 201, `第 ${i} 张作品应成功: ${JSON.stringify(r.body)}`);
  }
  const overWork = await request(app)
    .post(`/api/card/cards/${cardId}/works`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', PNG, { filename: 'w4.png', contentType: 'image/png' });
  assert.equal(overWork.status, 403, JSON.stringify(overWork.body));
  assert.equal(overWork.body.code, 'limitHit');
  assert.equal(overWork.body.kind, 'works');
  assert.equal(overWork.body.limit, 3);
  assert.equal(overWork.body.used, 3);

  // 2. free 无视频位：第 1 个即 403（limit=0）
  const overVideo = await request(app)
    .post(`/api/card/cards/${cardId}/videos`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', PNG, { filename: 'v1.png', contentType: 'image/png' });
  assert.equal(overVideo.status, 403, JSON.stringify(overVideo.body));
  assert.equal(overVideo.body.code, 'limitHit');
  assert.equal(overVideo.body.kind, 'videos');
  assert.equal(overVideo.body.limit, 0);

  // 3. worksLabel 自定义门禁：free 设非空 → 403 labelLocked
  const labelFree = await request(app)
    .put(`/api/card/cards/${cardId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ worksLabel: '案例' });
  assert.equal(labelFree.status, 403, JSON.stringify(labelFree.body));
  assert.equal(labelFree.body.code, 'labelLocked');

  // 4. /member/status 权益快照：free 档
  const stFree = await request(app).get('/api/card/member/status').set('Authorization', `Bearer ${token}`);
  assert.equal(stFree.status, 200);
  assert.equal(stFree.body.level, 'free');
  assert.equal(stFree.body.benefits.worksLimit, 3);
  assert.equal(stFree.body.benefits.worksUsed, 3);
  assert.equal(stFree.body.benefits.videosLimit, 0);
  assert.equal(stFree.body.benefits.videosUsed, 0);
  assert.equal(stFree.body.benefits.customWorksLabel, false);

  // 5. 升白银：worksLabel 落库 + 权益快照升级
  setLevel(uid, 'silver');
  const labelSilver = await request(app)
    .put(`/api/card/cards/${cardId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ worksLabel: '案例' });
  assert.equal(labelSilver.status, 200, JSON.stringify(labelSilver.body));
  assert.equal(labelSilver.body.card.worksLabel, '案例');

  const stSilver = await request(app).get('/api/card/member/status').set('Authorization', `Bearer ${token}`);
  assert.equal(stSilver.body.benefits.worksLimit, 15);
  assert.equal(stSilver.body.benefits.worksUsed, 3);
  assert.equal(stSilver.body.benefits.videosLimit, 2);
  assert.equal(stSilver.body.benefits.customWorksLabel, true);

  // 6. 清空标签一律放行（会员过期也不惩罚能力降级）
  const labelClear = await request(app)
    .put(`/api/card/cards/${cardId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ worksLabel: '' });
  assert.equal(labelClear.status, 200);
  assert.equal(labelClear.body.card.worksLabel, '');

  // 7. 过期会员回落 free 档：作品计数仍在（3/3），再传即 403
  setLevel(uid, 'silver');
  db.prepare('UPDATE platform_user SET member_expire_at = ? WHERE id = ?').run('2020-01-01 00:00:00', uid);
  const stExpired = await request(app).get('/api/card/member/status').set('Authorization', `Bearer ${token}`);
  assert.equal(stExpired.body.benefits.level, 'free');
  assert.equal(stExpired.body.benefits.worksLimit, 3);
  const overAfterExpire = await request(app)
    .post(`/api/card/cards/${cardId}/works`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', PNG, { filename: 'w4.png', contentType: 'image/png' });
  assert.equal(overAfterExpire.status, 403);
});
