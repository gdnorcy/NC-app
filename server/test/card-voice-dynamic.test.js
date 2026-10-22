import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';

// 覆盖反馈 #295（动态配图 + 可见范围）、#297（语音简介历史记录 + 录音）
let app;
let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-voice-dyn-test-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  app = createApp();
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function wxLogin(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200);
  return res.body.token;
}

async function createCard(token, name) {
  const res = await request(app)
    .post('/api/card/cards/create-with-apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, position: '顾问', city: '深圳', isPublic: true });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.card.id;
}

// 1x1 透明 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
// 极短 MP3 头（服务端只校验 mime/后缀，不解析音频内容）
const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// ============================================================
// 反馈 #295：动态发布 —— 配图上传 + 可见范围落库 + cardId 自动关联
// ============================================================
test('#295 动态发布：可见范围 public 正确落库并回显（不再恒显示「仅自己」）', async () => {
  const token = await wxLogin('dyn_vis_a');
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '公开一条', visibility: 'public' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  // 🔴 回归钉子：toDynamic 之前漏了 visibility → 前端恒显示「仅自己」
  assert.equal(res.body.dynamic.visibility, 'public');

  const list = await request(app).get('/api/card/dynamics').set('Authorization', `Bearer ${token}`);
  assert.equal(list.status, 200);
  const mine = list.body.dynamics.find((d) => d.content === '公开一条');
  assert.ok(mine, '动态未出现在列表');
  assert.equal(mine.visibility, 'public', '列表序列化仍缺 visibility');
});

test('#295 动态发布：选「仅自己」正确回显 private', async () => {
  const token = await wxLogin('dyn_vis_b');
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '私密一条', visibility: 'private' });
  assert.equal(res.status, 200);
  assert.equal(res.body.dynamic.visibility, 'private');
});

// ============================================================
// #312-4：可见范围三态（公开 public / 仅登录可见 login / 仅自己 private）
// ============================================================
test('#312-4 动态发布：选「仅登录可见」正确回显 login', async () => {
  const token = await wxLogin('dyn_login_a');
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '登录才看', visibility: 'login' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.dynamic.visibility, 'login');
});

test('#312-4 动态发布：脏 visibility 值归一为 public（不落脏值）', async () => {
  const token = await wxLogin('dyn_login_dirty');
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '脏值', visibility: 'some_garbage_or_empty' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.dynamic.visibility, 'public', '脏值未归一为 public');
});

test('#312-4 名片动态列表：未登录看不到 login 动态，登录访客能看到', async () => {
  const token = await wxLogin('dyn_login_b');
  const cardId = await createCard(token, '登录可见测试');
  const post = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '登录专属', visibility: 'login' });
  assert.equal(post.status, 200, JSON.stringify(post.body));

  // 未登录（无 Authorization）：名片动态列表不应含这条
  const anon = await request(app).get(`/api/card/cards/${cardId}/dynamics`);
  assert.equal(anon.status, 200);
  assert.ok(!(anon.body.dynamics || []).some((d) => d.content === '登录专属'), '未登录竟能看到 login 动态');

  // 已登录访客（另一个用户 token）：应能看到 login 动态
  const tokenB = await wxLogin('dyn_login_b_viewer');
  const viewer = await request(app)
    .get(`/api/card/cards/${cardId}/dynamics`)
    .set('Authorization', `Bearer ${tokenB}`);
  assert.equal(viewer.status, 200);
  assert.ok((viewer.body.dynamics || []).some((d) => d.content === '登录专属'), '已登录访客看不到 login 动态');
});

// ============================================================
// #312-2：链接预览卡片 + 小程序卡片（link 四字段 + targetType: page/url）
// ============================================================
test('#312-2 动态发布：带内页链接卡片正确落库并回显 link 字段', async () => {
  const token = await wxLogin('dyn_link_a');
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({
      content: '看这个页面',
      visibility: 'public',
      linkUrl: '/pages/card/myCard',
      linkType: 'page',
      linkTitle: '我的名片',
      linkDesc: '点开看看',
      linkImg: 'https://example.com/cover.png',
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const d = res.body.dynamic;
  assert.equal(d.linkUrl, '/pages/card/myCard', 'linkUrl 未回显');
  assert.equal(d.linkType, 'page', 'linkType 应为 page');
  assert.equal(d.linkTitle, '我的名片');
  assert.equal(d.linkDesc, '点开看看');
  assert.equal(d.linkImg, 'https://example.com/cover.png');
  // 🔴 互斥：有链接卡片时图片应被清空（数据层强制）
  assert.deepEqual(d.images, [], '有链接卡片时图片应被清空');
});

test('#312-2 动态发布：脏 linkType 归一为 page（只认 url）', async () => {
  const token = await wxLogin('dyn_link_b');
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '外链卡片', linkUrl: 'https://foo.com/x', linkType: 'weird_value' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.dynamic.linkType, 'page', '脏 linkType 未归一为 page');
  assert.equal(res.body.dynamic.linkUrl, 'https://foo.com/x');
});

test('#312-2 动态发布：外链 url 类型正确回显 url', async () => {
  const token = await wxLogin('dyn_link_c');
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '外链', linkUrl: 'https://example.com/article', linkType: 'url' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.dynamic.linkType, 'url');
  assert.equal(res.body.dynamic.linkUrl, 'https://example.com/article');
});

test('#312-2 动态发布：未填 linkUrl 时链接字段全空（不渲染卡片）', async () => {
  const token = await wxLogin('dyn_link_d');
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '纯文字', linkTitle: '不应出现', linkUrl: '' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.dynamic.linkUrl, '', '空 linkUrl 应归一为空');
  assert.equal(res.body.dynamic.linkTitle, '');
  assert.equal(res.body.dynamic.linkType, 'page');
});

test('#312-2 动态发布：图片与链接卡片互斥（带图 + 链接 → 图被清）', async () => {
  const token = await wxLogin('dyn_link_e');
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '都有', images: ['/uploads/a.png'], linkUrl: '/pages/x', linkType: 'page' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.dynamic.linkUrl, '/pages/x');
  assert.deepEqual(res.body.dynamic.images, [], '有链接时图片应被清空（互斥）');
});

// ============================================================
// #312-3：名片模块引用（动态挂名片上的结构化内容：案例/作品 / 产品）
// ============================================================
test('#312-3 动态发布：引用本人案例/作品，回显 ref 并带标题/封面/跳转路径', async () => {
  const token = await wxLogin('ref_works_a');
  const cardId = await createCard(token, '引用主人');
  const db = createDb(config.dbPath);
  const info = db.prepare('INSERT INTO card_works (card_id, image_url, title) VALUES (?,?,?)').run(cardId, 'https://example.com/w.png', '我的案例A');
  const workId = Number(info.lastInsertRowid);
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '看我的案例', refType: 'works', refId: workId });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const d = res.body.dynamic;
  assert.ok(d.ref, '应回显 ref');
  assert.equal(d.ref.type, 'works');
  assert.equal(d.ref.id, workId);
  assert.equal(d.ref.title, '我的案例A');
  assert.equal(d.ref.cover, 'https://example.com/w.png');
  assert.ok(d.ref.url.includes('/pages/card/works?id=' + cardId), '跳转应指向作品页');
  // 互斥：有 ref 时图片应清空
  assert.deepEqual(d.images, [], '有引用时图片应被清空（互斥）');
  db.close();
});

test('#312-3 动态发布：引用不存在的作品 → ref 为 null（不挂卡片）', async () => {
  const token = await wxLogin('ref_works_b');
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '引用不存在', refType: 'works', refId: 999999 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.dynamic.ref, null, '不存在的引用应回落为 null');
});

test('#312-3 动态发布：引用本人租户产品，回显 ref（type=goods）', async () => {
  const token = await wxLogin('ref_goods_a');
  const cardId = await createCard(token, '产品主人');
  const db = createDb(config.dbPath);
  // 测试环境用户无租户，给卡片挂一个租户（product 按 customer_id 归属校验），便于验证引用链路
  db.prepare('UPDATE card_profile SET customer_id = 1 WHERE id = ?').run(cardId);
  const g = db.prepare("INSERT INTO goods (customer_id, title, thumb, status) VALUES (?,?,?,?)").run(1, '爆款商品', 'https://example.com/g.png', 'sell');
  const goodsId = Number(g.lastInsertRowid);
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '看产品', refType: 'goods', refId: goodsId });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const d = res.body.dynamic;
  assert.ok(d.ref, '应回显 ref');
  assert.equal(d.ref.type, 'goods');
  assert.equal(d.ref.id, goodsId);
  assert.equal(d.ref.title, '爆款商品');
  assert.equal(d.ref.cover, 'https://example.com/g.png');
  assert.ok(d.ref.url.includes('/pages/mall/goods?id=' + goodsId));
  db.close();
});

test('#312-3 动态发布：引用他人作品（card_id 不符）→ ref 为 null（防挂错内容）', async () => {
  const token = await wxLogin('ref_works_c');
  const cardId = await createCard(token, '引用主人C');
  const db = createDb(config.dbPath);
  // 作品挂在另一张卡（不存在的 cardId）上
  const info = db.prepare('INSERT INTO card_works (card_id, image_url, title) VALUES (?,?,?)').run(999999, 'https://example.com/x.png', '别人的案例');
  const workId = Number(info.lastInsertRowid);
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '越权引用', refType: 'works', refId: workId });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.dynamic.ref, null, '引用非本人名片的作品应被拒绝（回落 null）');
  db.close();
});

test('#295 动态发布：不传 cardId 时自动关联本人名片（否则公开动态永不上名片页）', async () => {
  const token = await wxLogin('dyn_card_a');
  const cardId = await createCard(token, '动态主人');
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '带图动态', images: ['/uploads/x.png'], visibility: 'public' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.dynamic.cardId, cardId, '未自动关联名片，公开动态不会出现在名片页');

  // 公开列表按 card_id + visibility 过滤 → 应能查到
  const list = await request(app)
    .get(`/api/card/cards/${cardId}/dynamics`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(list.status, 200);
  const found = (list.body.dynamics || []).some((d) => d.content === '带图动态');
  assert.ok(found, '自动关联后仍不在名片页动态列表');
});

test('#295 动态配图上传：返回 URL（MP 端常带 octet-stream → 按后缀放行）', async () => {
  const token = await wxLogin('dyn_img_a');
  // 后缀 .png + contentType application/octet-stream（小程序 uploadFile 常见形态）
  const res = await request(app)
    .post('/api/card/dynamic/image-upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', PNG, { filename: 'photo.png', contentType: 'application/octet-stream' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.url, '未返回 URL');
});

test('#295 动态配图上传：非图片文件被拒', async () => {
  const token = await wxLogin('dyn_img_b');
  const res = await request(app)
    .post('/api/card/dynamic/image-upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('not an image'), { filename: 'x.txt', contentType: 'text/plain' });
  assert.equal(res.status, 400);
});

// ============================================================
// 反馈 #297：语音简介 —— 上传落历史表 + 录音上传 + 历史列表/删除 + 跨用户隔离
// ============================================================
test('#297 语音上传：成功后自动进历史表（source=upload）', async () => {
  const token = await wxLogin('voice_a');
  const res = await request(app)
    .post('/api/card/voice-upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', MP3, { filename: 'intro.mp3', contentType: 'audio/mpeg' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.url);

  const hist = await request(app).get('/api/card/voice-history').set('Authorization', `Bearer ${token}`);
  assert.equal(hist.status, 200);
  assert.equal(hist.body.voices.length, 1, '上传后历史表应有 1 条');
  assert.equal(hist.body.voices[0].source, 'upload');
  assert.equal(hist.body.voices[0].url, res.body.url);
});

test('#297 录音上传：POST /voice-history 落库 source=record + 时长', async () => {
  const token = await wxLogin('voice_rec_a');
  const res = await request(app)
    .post('/api/card/voice-history')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', MP3, { filename: 'rec.mp3', contentType: 'audio/mpeg' })
    .field('durationSec', '12')
    .field('name', '我的录音');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.voice.source, 'record');
  assert.equal(res.body.voice.durationSec, 12);
  assert.equal(res.body.voice.name, '我的录音');
});

test('#297 录音上传：MP 端 octet-stream 也放行（按后缀），不再 400', async () => {
  const token = await wxLogin('voice_rec_b');
  const res = await request(app)
    .post('/api/card/voice-history')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', MP3, { filename: 'rec2.mp3', contentType: 'application/octet-stream' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
});

test('#297 历史列表：跨用户隔离（只看得到自己的）', async () => {
  const tokenA = await wxLogin('voice_iso_a');
  const tokenB = await wxLogin('voice_iso_b');
  await request(app)
    .post('/api/card/voice-history')
    .set('Authorization', `Bearer ${tokenA}`)
    .attach('file', MP3, { filename: 'a.mp3', contentType: 'audio/mpeg' });

  const histB = await request(app).get('/api/card/voice-history').set('Authorization', `Bearer ${tokenB}`);
  assert.equal(histB.status, 200);
  assert.equal(histB.body.voices.length, 0, '看到了别人的音频历史');
});

test('#297 历史删除：只能删自己的（别人的删不掉 → 404）', async () => {
  const tokenA = await wxLogin('voice_del_a');
  const tokenB = await wxLogin('voice_del_b');
  const up = await request(app)
    .post('/api/card/voice-history')
    .set('Authorization', `Bearer ${tokenA}`)
    .attach('file', MP3, { filename: 'del.mp3', contentType: 'audio/mpeg' });
  const id = up.body.voice.id;

  const cross = await request(app)
    .delete(`/api/card/voice-history/${id}`)
    .set('Authorization', `Bearer ${tokenB}`);
  assert.equal(cross.status, 404, '跨用户删除未被拦截');

  const own = await request(app)
    .delete(`/api/card/voice-history/${id}`)
    .set('Authorization', `Bearer ${tokenA}`);
  assert.equal(own.status, 200, JSON.stringify(own.body));

  const hist = await request(app).get('/api/card/voice-history').set('Authorization', `Bearer ${tokenA}`);
  assert.equal(hist.body.voices.length, 0, '删除后仍在列表里');
});

test('#297 语音上传：非音频文件被拒', async () => {
  const token = await wxLogin('voice_reject');
  const res = await request(app)
    .post('/api/card/voice-upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('nope'), { filename: 'x.txt', contentType: 'text/plain' });
  assert.equal(res.status, 400);
});

// ============================================================
// #312-5：定时发布（写好先不发，到点自动上架；漏加时间条件会提前曝光）
// ============================================================
test('#312-5 动态发布：给未来时间 → status=pending 且回显 scheduledAt（UTC）', async () => {
  const token = await wxLogin('sched_future_a');
  const future = new Date(Date.now() + 86400000).toISOString(); // 明天
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '明天见', visibility: 'public', scheduledAt: future });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.dynamic.status, 'pending', '未来时间应置 pending（待发布）');
  assert.ok(res.body.dynamic.scheduledAt, '应回显 scheduledAt');
  // scheduledAt 为 UTC 'YYYY-MM-DD HH:MM:SS'，且年分位与未来一致（归一为 UTC 而非本地乱序）
  assert.match(res.body.dynamic.scheduledAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test('#312-5 动态发布：定时未来的动态「不进」名片公开列表（防提前曝光）', async () => {
  const token = await wxLogin('sched_future_b');
  const cardId = await createCard(token, '定时主人B');
  const future = new Date(Date.now() + 86400000).toISOString();
  const post = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '保密到明天', visibility: 'public', scheduledAt: future });
  assert.equal(post.status, 200, JSON.stringify(post.body));

  const anon = await request(app).get(`/api/card/cards/${cardId}/dynamics`);
  assert.equal(anon.status, 200);
  assert.ok(!(anon.body.dynamics || []).some((d) => d.content === '保密到明天'), '定时未来的动态竟出现在公开列表（提前曝光）');

  // 但作者自己的列表能看到（status=pending，供其管理）
  const mine = await request(app).get('/api/card/dynamics').set('Authorization', `Bearer ${token}`);
  assert.equal(mine.status, 200);
  const mineItem = (mine.body.dynamics || []).find((d) => d.content === '保密到明天');
  assert.ok(mineItem, '作者自己的列表应能看到定时中的动态');
  assert.equal(mineItem.status, 'pending');
});

test('#312-5 动态发布：时间到点后自动上架（promote pending→active 并进入公开列表）', async () => {
  const token = await wxLogin('sched_promote_a');
  const cardId = await createCard(token, '定时主人C');
  const future = new Date(Date.now() + 86400000).toISOString();
  const post = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '到点上架', visibility: 'public', scheduledAt: future });
  assert.equal(post.status, 200, JSON.stringify(post.body));

  // 模拟「时间已过」：直接把库里的 scheduled_at 改成过去、status 保持 pending
  const db = createDb(config.dbPath);
  db.prepare("UPDATE card_dynamic SET scheduled_at = '2020-01-01 00:00:00', status='pending' WHERE content = '到点上架'").run();
  db.close();

  // 公开列表入口会 promoteScheduled()，把到点的 pending 翻成 active 并放行
  const anon = await request(app).get(`/api/card/cards/${cardId}/dynamics`);
  assert.equal(anon.status, 200);
  assert.ok((anon.body.dynamics || []).some((d) => d.content === '到点上架'), '到点的定时动态未自动上架');
});

test('#312-5 动态发布：不传 / 传过去时间 → 立即发布（status=active，进公开列表）', async () => {
  const token = await wxLogin('sched_now_a');
  const cardId = await createCard(token, '立即发布主人');
  // 不传 scheduledAt
  const r1 = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '现在就发', visibility: 'public' });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.dynamic.status, 'active', '未传 scheduledAt 应立即可见');
  assert.equal(r1.body.dynamic.scheduledAt, '', '未传 scheduledAt 时 scheduledAt 应为空');

  // 传一个过去时间
  const past = new Date(Date.now() - 86400000).toISOString();
  const r2 = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '昨天写好今天发', visibility: 'public', scheduledAt: past });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(r2.body.dynamic.status, 'active', '过去时间应归一为立即发布');

  const anon = await request(app).get(`/api/card/cards/${cardId}/dynamics`);
  assert.equal(anon.status, 200);
  const contents = (anon.body.dynamics || []).map((d) => d.content);
  assert.ok(contents.includes('现在就发'), '立即发布动态未进公开列表');
  assert.ok(contents.includes('昨天写好今天发'), '过去时间动态未进公开列表');
});

// ============================================================
// #312-6：编辑 + 删除（仅本人；软删；跨用户不可操作）
// ============================================================
test('#312-6 动态编辑：本人可改正文/标题/可见范围并即时回显', async () => {
  const token = await wxLogin('edit_a');
  const post = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '原内容', title: '原标题', visibility: 'public' });
  assert.equal(post.status, 200, JSON.stringify(post.body));
  const id = post.body.dynamic.id;

  const upd = await request(app)
    .put(`/api/card/dynamics/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '改后内容', title: '改后标题', visibility: 'private' });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal(upd.body.dynamic.content, '改后内容');
  assert.equal(upd.body.dynamic.title, '改后标题');
  assert.equal(upd.body.dynamic.visibility, 'private');

  // 自己列表应反映改动
  const mine = await request(app).get('/api/card/dynamics').set('Authorization', `Bearer ${token}`);
  const item = (mine.body.dynamics || []).find((d) => d.id === id);
  assert.ok(item, '编辑后列表里找不到该动态');
  assert.equal(item.content, '改后内容');
});

test('#312-6 动态编辑：跨用户编辑他人动态 → 404（无权）', async () => {
  const tokenA = await wxLogin('edit_b_owner');
  const post = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ content: '别人的动态', visibility: 'public' });
  const id = post.body.dynamic.id;

  const tokenB = await wxLogin('edit_b_intruder');
  const intrude = await request(app)
    .put(`/api/card/dynamics/${id}`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ content: '被我改了', visibility: 'public' });
  assert.equal(intrude.status, 404, '跨用户编辑未被拦截');
});

test('#312-6 动态删除：本人软删后从「自己列表 + 公开列表」消失', async () => {
  const token = await wxLogin('del_a');
  const cardId = await createCard(token, '删除测试主人');
  const post = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '待删除', visibility: 'public' });
  assert.equal(post.status, 200, JSON.stringify(post.body));
  const id = post.body.dynamic.id;

  const del = await request(app)
    .delete(`/api/card/dynamics/${id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(del.status, 200, JSON.stringify(del.body));

  // 自己列表不再出现
  const mine = await request(app).get('/api/card/dynamics').set('Authorization', `Bearer ${token}`);
  assert.ok(!(mine.body.dynamics || []).some((d) => d.id === id), '删除后仍在自己列表');
  // 公开列表不再出现
  const anon = await request(app).get(`/api/card/cards/${cardId}/dynamics`);
  assert.ok(!(anon.body.dynamics || []).some((d) => d.content === '待删除'), '删除后仍在公开列表');
  // 已删动态再删/再改 → 404
  const again = await request(app)
    .delete(`/api/card/dynamics/${id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(again.status, 404, '重复删除已软删动态应 404');
});

test('#312-6 动态删除：跨用户删除他人动态 → 404（无权）', async () => {
  const tokenA = await wxLogin('del_b_owner');
  const post = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ content: '别人家的', visibility: 'public' });
  const id = post.body.dynamic.id;

  const tokenB = await wxLogin('del_b_intruder');
  const intrude = await request(app)
    .delete(`/api/card/dynamics/${id}`)
    .set('Authorization', `Bearer ${tokenB}`);
  assert.equal(intrude.status, 404, '跨用户删除未被拦截');
});


// ============================================================
// 反馈 #312-7-3：动态封面（头图）cover —— 发布/编辑/序列化全链路
//   cover 与 link_img 是两码事：cover 是动态头图，link_img 只是链接卡片那张小方图。
// ============================================================
test('#312-7 动态封面：POST 带 cover → 落库并回显（不传则为空串）', async () => {
  const token = await wxLogin('dyn_cover_a');
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '带头图一条', visibility: 'public', cover: '/uploads/cover-a.jpg' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.dynamic.cover, '/uploads/cover-a.jpg', 'toDynamic 必须下发 cover');

  const list = await request(app).get('/api/card/dynamics').set('Authorization', `Bearer ${token}`);
  const mine = (list.body.dynamics || []).find((d) => d.content === '带头图一条');
  assert.ok(mine, '动态未出现在列表');
  assert.equal(mine.cover, '/uploads/cover-a.jpg', '列表出口也必须带 cover');

  // 不传 cover 的动态 → 空串（前端据此回落到 images 展示）
  const noCover = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '没头图一条', visibility: 'public' });
  assert.equal(noCover.body.dynamic.cover, '', '未传 cover 应归一为空串');
});

test('#312-7 动态封面：PUT 可改可清（清空后回到空串）', async () => {
  const token = await wxLogin('dyn_cover_b');
  const post = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '待改头图', visibility: 'public', cover: '/uploads/old.jpg' });
  const id = post.body.dynamic.id;

  const put = await request(app)
    .put(`/api/card/dynamics/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '待改头图', visibility: 'public', cover: '/uploads/new.jpg' });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(put.body.dynamic.cover, '/uploads/new.jpg', 'PUT 未写进 cover');

  const clr = await request(app)
    .put(`/api/card/dynamics/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '待改头图', visibility: 'public', cover: '' });
  assert.equal(clr.body.dynamic.cover, '', '清空 cover 后应回到空串');
});

test('#312-7 动态封面：cover 与链接卡片封面互不干扰（两个字段各存各的）', async () => {
  const token = await wxLogin('dyn_cover_c');
  const res = await request(app)
    .post('/api/card/dynamics')
    .set('Authorization', `Bearer ${token}`)
    .send({
      content: '头图 + 链接卡片',
      visibility: 'public',
      cover: '/uploads/dyn-cover.jpg',
      linkUrl: 'https://example.com/x',
      linkImg: '/uploads/link-cover.jpg',
      linkTitle: '卡片标题',
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const d = res.body.dynamic;
  assert.equal(d.cover, '/uploads/dyn-cover.jpg', 'cover 被链接逻辑吃掉了');
  assert.equal(d.linkImg, '/uploads/link-cover.jpg', 'linkImg 被 cover 覆盖了');
  // 有链接时图片互斥（images 清空），但 cover 不参与互斥——头图照样保留
  assert.deepEqual(d.images, [], '有链接时 images 应被互斥清空');
  assert.equal(d.cover, '/uploads/dyn-cover.jpg', 'cover 不应参与三选一互斥');
});
