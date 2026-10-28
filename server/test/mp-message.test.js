import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';

let app;
let db;
let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-mp-test-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  app = createApp();
  db = createDb(config.dbPath);

  // 种子数据：渠道 + 消息服务器配置 + 一条关键字规则
  db.prepare(`INSERT OR REPLACE INTO channel_apps (id, customer_id, channel_type, appid, account_type) VALUES (1, 1, 'mp', 'gh_test', 'service')`).run();
  db.prepare(`DELETE FROM mp_message_config WHERE channel_apps_id = 1`).run();
  db.prepare(`INSERT INTO mp_message_config (channel_apps_id, customer_id, msg_token, encoding_aes_key, url_enabled) VALUES (1, 1, 'mytoken', '', 1)`).run();
  db.prepare(`DELETE FROM mp_reply_rules WHERE channel_apps_id = 1`).run();
  db.prepare(`INSERT INTO mp_reply_rules (channel_apps_id, customer_id, match_type, keyword, reply_type, content, media_json, priority, enabled) VALUES (1, 1, 'exact', '你好', 'text', '自动回复内容', '[]', 0, 1)`).run();
});

after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function sign(token, timestamp, nonce) {
  return crypto.createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex');
}

test('GET 消息服务器校验：签名正确返回 echostr', async () => {
  const token = 'mytoken';
  const timestamp = '1700000000';
  const nonce = 'abc';
  const echostr = 'HELLOECHO';
  const signature = sign(token, timestamp, nonce);
  const res = await request(app)
    .get(`/api/channel/wx-message/gh_test?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}&echostr=${echostr}`);
  assert.equal(res.status, 200);
  assert.equal(res.text, echostr);
});

test('GET 消息服务器校验：签名错误返回 403', async () => {
  const res = await request(app)
    .get('/api/channel/wx-message/gh_test?signature=wrong&timestamp=1700000000&nonce=abc&echostr=HELLO');
  assert.equal(res.status, 403);
});

test('POST 文本消息命中关键字规则 → 被动回复文本', async () => {
  const token = 'mytoken';
  const timestamp = '1700000000';
  const nonce = 'abc';
  const signature = sign(token, timestamp, nonce);
  const xml = `<xml><ToUserName><![CDATA[gh_test]]></ToUserName><FromUserName><![CDATA[openid123]]></FromUserName><CreateTime>1234567890</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[你好]]></Content><MsgId>123</MsgId></xml>`;
  const res = await request(app)
    .post(`/api/channel/wx-message/gh_test?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`)
    .set('Content-Type', 'text/xml')
    .send(xml);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/xml/);
  assert.match(res.text, /自动回复内容/);
  assert.match(res.text, /<MsgType><!\[CDATA\[text\]\]><\/MsgType>/);
});

test('POST 文本消息未命中规则 → 返回 success（不重试）', async () => {
  const token = 'mytoken';
  const timestamp = '1700000000';
  const nonce = 'abc';
  const signature = sign(token, timestamp, nonce);
  const xml = `<xml><ToUserName><![CDATA[gh_test]]></ToUserName><FromUserName><![CDATA[openid123]]></FromUserName><CreateTime>1234567890</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[随便聊聊]]></Content><MsgId>123</MsgId></xml>`;
  const res = await request(app)
    .post(`/api/channel/wx-message/gh_test?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`)
    .set('Content-Type', 'text/xml')
    .send(xml);
  assert.equal(res.status, 200);
  assert.equal(res.text, 'success');
});

test('POST 未启用消息服务器 → 返回 success（拒绝伪造）', async () => {
  db.prepare(`UPDATE mp_message_config SET url_enabled = 0 WHERE channel_apps_id = 1`).run();
  const token = 'mytoken';
  const timestamp = '1700000000';
  const nonce = 'abc';
  const signature = sign(token, timestamp, nonce);
  const xml = `<xml><ToUserName><![CDATA[gh_test]]></ToUserName><FromUserName><![CDATA[openid123]]></FromUserName><CreateTime>1234567890</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[你好]]></Content></xml>`;
  const res = await request(app)
    .post(`/api/channel/wx-message/gh_test?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`)
    .set('Content-Type', 'text/xml')
    .send(xml);
  assert.equal(res.status, 200);
  assert.equal(res.text, 'success');
  db.prepare(`UPDATE mp_message_config SET url_enabled = 1 WHERE channel_apps_id = 1`).run();
});
