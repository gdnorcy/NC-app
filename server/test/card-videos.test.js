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
 * 视频号链接调用方案（card_videos 改造）：
 * - 链接解析 parse：finderUserName(sph) + feedId 提取；脏数据 400 parseFail
 * - 新增改 JSON：sph 校验 / feedId 必填 / 同卡同视频去重 409 / 归属 404 / 未登录 401
 * - 会员门禁不变：free 无视频位（403 limitHit）；silver 上限 2
 * - GET 分角色：访客仅 is_show=1；主人（带本人 token）看全部
 * - 启停开关：PUT isShow=false → 访客不可见，恢复后可见
 * - 排序 / 删除 / 改标题回归
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

// 视频号分享链接样例（feedId 含 base64 填充字符，URL 里常被编码为 %3D）
const FINDER = 'sph4cDqEd8vU0AB';
const FEED1 = 'MTY3ODQ5MTIzNDU2';
const FEED2 = 'NzEyMzQ1Njc4OTAxMjM0NTY3ODkw';
function shareLink(finder, feed, { encoded = false } = {}) {
  const f = encoded ? encodeURIComponent(finder) : finder;
  const d = encoded ? encodeURIComponent(feed) : feed;
  return `https://channels.weixin.qq.com/web/pages/feed-detail/index?finderUserName=${f}&feedId=${d}`;
}

test('parse 链接解析：合法链接提取 sph + feedId，脏数据 400 parseFail', async () => {
  const token = await wxLogin('videos_parse_a');
  setLevel(uidOf(token), 'silver');

  // 1. 普通分享链接
  const ok = await request(app)
    .post('/api/card/cards/1/videos/parse')
    .set('Authorization', `Bearer ${token}`)
    .send({ link: shareLink(FINDER, FEED1) });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.finderUserName, FINDER);
  assert.equal(ok.body.feedId, FEED1);

  // 2. URL 编码参数（%3D 等）正确解码
  const enc = await request(app)
    .post('/api/card/cards/1/videos/parse')
    .set('Authorization', `Bearer ${token}`)
    .send({ link: shareLink(FINDER, 'MTY3ODQ5MTIzNDU2=', { encoded: true }) });
  assert.equal(enc.status, 200, JSON.stringify(enc.body));
  assert.equal(enc.body.feedId, 'MTY3ODQ5MTIzNDU2=');

  // 3. 链接前后带杂文本（粘贴时常带"【标题】"等尾巴）
  const noisy = await request(app)
    .post('/api/card/cards/1/videos/parse')
    .set('Authorization', `Bearer ${token}`)
    .send({ link: `【视频号】 ${shareLink(FINDER, FEED1)} 快来看看` });
  assert.equal(noisy.status, 200, JSON.stringify(noisy.body));
  assert.equal(noisy.body.feedId, FEED1);

  // 4. 脏数据：非视频号链接 / finder 非 sph 开头 / 缺 feedId → 400 parseFail
  for (const bad of [
    'https://example.com/foo',
    'https://channels.weixin.qq.com/x?finderUserName=abc123&feedId=zzzz',
    'https://channels.weixin.qq.com/x?finderUserName=sph4cDqEd8vU0AB',
    '',
  ]) {
    const r = await request(app)
      .post('/api/card/cards/1/videos/parse')
      .set('Authorization', `Bearer ${token}`)
      .send({ link: bad });
    assert.equal(r.status, 400, `脏链接应 400: ${bad} → ${JSON.stringify(r.body)}`);
    assert.equal(r.body.code, 'parseFail');
  }

  // 5. 微信 sph 加密短链（weixin.qq.com/sph/xxxx）：短码是路由密文、无法反解
  //    → 400 channelHomeLink，且文案不得再称它为「主页链接」（2026-10-19 实测核实：
  //    它 301 到 finder-preview/pages/sph?id=xxx，落地页无 feedId/finderUserName）
  const home = await request(app)
    .post('/api/card/cards/1/videos/parse')
    .set('Authorization', `Bearer ${token}`)
    .send({ link: 'https://weixin.qq.com/sph/A6FgtKSMRw' });
  assert.equal(home.status, 400, JSON.stringify(home.body));
  assert.equal(home.body.code, 'channelHomeLink');
  assert.ok(String(home.body.error).includes('加密'), `应说明是加密短链: ${home.body.error}`);
  assert.ok(String(home.body.error).includes('视频号助手'), `应引导到助手获取: ${home.body.error}`);
  // 🔴 回归护栏：旧文案把 sph 短链称为「主页链接」并让用户去复制「单条视频链接」，
  //    而微信改版后分享任何单条视频都是这个形态 → 照做永远找不到。禁止回退。
  assert.ok(!String(home.body.error).includes('主页'), `不得再称 sph 短链为主页链接: ${home.body.error}`);
  assert.ok(!String(home.body.error).includes('复制链接'), `不得再引导去复制 sph 链接: ${home.body.error}`);

  // 6. 带 feedId 参数的 sph 短链不走主页分支（有参数即按参数解析：缺 finderUserName → parseFail）
  const sphWithFeed = await request(app)
    .post('/api/card/cards/1/videos/parse')
    .set('Authorization', `Bearer ${token}`)
    .send({ link: 'https://weixin.qq.com/sph/A6FgtKSMRw?feedId=MTY3ODQ5MTIzNDU2' });
  assert.equal(sphWithFeed.status, 400);
  assert.equal(sphWithFeed.body.code, 'parseFail');

  // 7. 未登录不能解析（401）
  const noAuth = await request(app).post('/api/card/cards/1/videos/parse').send({ link: shareLink(FINDER, FEED1) });
  assert.equal(noAuth.status, 401);
});

test('视频号 CRUD + 去重 + 分角色可见性 + 启停（白银会员，限额 2）', async () => {
  const tokenA = await wxLogin('videos_owner_b');
  const tokenB = await wxLogin('videos_other_c');
  const uidA = uidOf(tokenA);
  setLevel(uidA, 'silver');
  const cardId = await createCard(tokenA, '视频主人');

  // 1. 新增视频条目（JSON：finder + feedId + 标题）
  const add1 = await request(app)
    .post(`/api/card/cards/${cardId}/videos`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ finderUserName: FINDER, feedId: FEED1, title: '展会现场' });
  assert.equal(add1.status, 201, JSON.stringify(add1.body));
  const v1 = add1.body.video;
  assert.ok(v1.id);
  assert.equal(v1.title, '展会现场');
  assert.equal(v1.finderUserName, FINDER);
  assert.equal(v1.feedId, FEED1);
  assert.equal(v1.isShow, true);
  assert.equal(v1.coverUrl, ''); // 默认封面，C 端兜底
  assert.equal(v1.sortOrder, 1);

  const add2 = await request(app)
    .post(`/api/card/cards/${cardId}/videos`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ finderUserName: FINDER, feedId: FEED2, title: '产品解读' });
  assert.equal(add2.status, 201);
  assert.equal(add2.body.video.sortOrder, 2);

  // 2. 重复添加同卡同视频 → 409 duplicated
  const dup = await request(app)
    .post(`/api/card/cards/${cardId}/videos`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ finderUserName: FINDER, feedId: FEED1, title: '重复' });
  assert.equal(dup.status, 409, JSON.stringify(dup.body));
  assert.equal(dup.body.code, 'duplicated');

  // 3. 参数校验：finder 非 sph / feedId 空 → 400
  const badFinder = await request(app)
    .post(`/api/card/cards/${cardId}/videos`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ finderUserName: 'abc', feedId: FEED1 });
  assert.equal(badFinder.status, 400);
  const noFeed = await request(app)
    .post(`/api/card/cards/${cardId}/videos`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ finderUserName: FINDER, feedId: '' });
  assert.equal(noFeed.status, 400);

  // 4. 归属校验：B（free）不能往 A 的卡加视频（404）
  const addB = await request(app)
    .post(`/api/card/cards/${cardId}/videos`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ finderUserName: FINDER, feedId: 'OTHERFEED0001' });
  assert.equal(addB.status, 404);

  // 5. 未登录不能写（401）
  const noAuth = await request(app)
    .post(`/api/card/cards/${cardId}/videos`)
    .send({ finderUserName: FINDER, feedId: FEED1 });
  assert.equal(noAuth.status, 401);

  // 6. 限额门禁：silver 上限 2 → 第 3 个 403 limitHit
  const over = await request(app)
    .post(`/api/card/cards/${cardId}/videos`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ finderUserName: FINDER, feedId: 'THIRDFEED0001' });
  assert.equal(over.status, 403, JSON.stringify(over.body));
  assert.equal(over.body.code, 'limitHit');
  assert.equal(over.body.kind, 'videos');
  assert.equal(over.body.limit, 2);

  // 7. 访客 GET 按 sort_order 升序，且字段齐全
  const list = await request(app).get(`/api/card/cards/${cardId}/videos`);
  assert.equal(list.status, 200);
  assert.equal(list.body.videos.length, 2);
  assert.deepEqual(list.body.videos.map((v) => v.id), [v1.id, add2.body.video.id]);
  assert.equal(list.body.videos[0].finderUserName, FINDER);
  assert.equal(list.body.videos[0].feedId, FEED1);
  assert.equal(list.body.videos[0].isShow, true);

  // 8. 启停开关：v1 置 isShow=false → 访客不可见，主人仍可见
  const off = await request(app)
    .put(`/api/card/cards/${cardId}/videos/${v1.id}`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ isShow: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.video.isShow, false);

  const listGuest = await request(app).get(`/api/card/cards/${cardId}/videos`);
  assert.deepEqual(listGuest.body.videos.map((v) => v.id), [add2.body.video.id]);

  const listOwner = await request(app)
    .get(`/api/card/cards/${cardId}/videos`)
    .set('Authorization', `Bearer ${tokenA}`);
  assert.equal(listOwner.body.videos.length, 2, '主人应看到全部（含隐藏）');

  // 9. 恢复展示 → 访客恢复可见
  const on = await request(app)
    .put(`/api/card/cards/${cardId}/videos/${v1.id}`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ isShow: true });
  assert.equal(on.status, 200);
  assert.equal(on.body.video.isShow, true);
  const listGuest2 = await request(app).get(`/api/card/cards/${cardId}/videos`);
  assert.equal(listGuest2.body.videos.length, 2);

  // 10. 改标题
  const upd = await request(app)
    .put(`/api/card/cards/${cardId}/videos/${v1.id}`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ title: '展会现场v2' });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.video.title, '展会现场v2');

  // 11. 排序：把 v2 提前 → GET 顺序应变
  const sort = await request(app)
    .put(`/api/card/cards/${cardId}/videos/sort`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ ids: [add2.body.video.id, v1.id] });
  assert.equal(sort.status, 200);
  const list2 = await request(app).get(`/api/card/cards/${cardId}/videos`);
  assert.deepEqual(list2.body.videos.map((v) => v.id), [add2.body.video.id, v1.id]);

  // 12. 归属校验：B 不能改/删 A 的视频（404，不泄漏存在性细节）
  const updB = await request(app)
    .put(`/api/card/cards/${cardId}/videos/${v1.id}`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ title: 'hack' });
  assert.equal(updB.status, 404);
  const delB = await request(app).delete(`/api/card/cards/${cardId}/videos/${v1.id}`).set('Authorization', `Bearer ${tokenB}`);
  assert.equal(delB.status, 404);

  // 13. 未登录不能改（401）
  const noAuthUpd = await request(app).put(`/api/card/cards/${cardId}/videos/${v1.id}`).send({ title: 'x' });
  assert.equal(noAuthUpd.status, 401);

  // 14. 删除（A）→ 只剩 v2
  const del = await request(app).delete(`/api/card/cards/${cardId}/videos/${v1.id}`).set('Authorization', `Bearer ${tokenA}`);
  assert.equal(del.status, 200);
  const list3 = await request(app).get(`/api/card/cards/${cardId}/videos`);
  assert.deepEqual(list3.body.videos.map((v) => v.id), [add2.body.video.id]);
});

test('会员分级门禁：free 作品 3 张上限 + free 无视频位 + worksLabel 仅白银+', async () => {
  const token = await wxLogin('videos_free_d');
  const uid = uidOf(token);
  setLevel(uid, 'free');
  const cardId = await createCard(token, '限额用户');

  // 1. free 作品上限 3：前 3 个 201，第 4 个 403 limitHit
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
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
    .send({ finderUserName: FINDER, feedId: FEED1 });
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
