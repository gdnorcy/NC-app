import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';

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
