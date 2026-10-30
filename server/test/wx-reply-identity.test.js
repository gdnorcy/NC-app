/**
 * 公众号被动回复的**回包身份（FromUserName）**回归测试。
 *
 * 🔴🔴🔴 2026-10-30 P0 事故根因的钉子测试：
 *   微信推过来的报文里 `<ToUserName>` = **公众号原始ID**（gh_ 开头），
 *   被动回复时必须把它原样写回 `<FromUserName>`。
 *   之前所有回包都填了 `channel.appid`（wx_ 开头）→ 微信判「回复了异常数据」
 *   → 粉丝端一律显示「该公众号提供的服务出现故障，请稍后再试」。
 *   而服务端视角一切正常（HTTP 200、XML 合法、字段不超限、图片可访问、条数合规），
 *   于是此前几轮一直在怀疑「条数 / 图片格式」，全是烟雾弹。
 *
 *   官方口径（被动回复用户消息文档 + 开放社区技术运营答复）：
 *   「FromUserName 不应该是 appid，而是公众号原始 id，
 *     你服务器接收到微信推给你的原 ToUserName，一般是 gh_ 开头的」
 *
 * 覆盖：
 *   1) 扫码（事件消息）回图文 → FromUserName = 原始ID
 *   2) 会话发码（文本消息）回图文 → FromUserName = 原始ID
 *   3) 缺图回落文字 → FromUserName 仍是原始ID（文字路径同样要改，别只修图文）
 *   4) 场景码过期/已用 → 拒绝语也要用原始ID
 *   5) 密文回包：尾部标识必须是原始ID（微信解密后校验尾部，不符即丢整条）
 *   6) 入站报文缺 ToUserName → 退回 appid 且不崩（兜底，不是主路径）
 *   7) 反向锁：原始ID ≠ appid（否则测试等于没测）
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { createDb } from '../src/db.js';
import { WxMpService } from '../src/services/wx-mp.js';
import { WxCrypto } from '../src/services/wx-component.js';
import { computeTraceCode, DEFAULT_CODESET } from '../src/services/traceCode.js';

const TID = 88;
const RULE = { m: { 1: 'FW', 2: 7, 3: 6, 4: 5, 5: 20 }, k: { ...DEFAULT_CODESET.k }, zdl: 3 };
const BATCH_NO = '0123456';
const CHANNEL = { id: 1, appid: 'wx170708ec5ecc8804', app_secret: '', customer_id: TID, auth_status: 'none' };
/** 公众号原始ID：真实形态是 gh_ + 14 位，与 appid 同长但完全不同 */
const ORIGINAL_ID = 'gh_1a2b3c4d5e6f7g8';
const MSG_TOKEN = 'jT0WIgQYkhUDkIYJcFrwGLklGKSIioDp';
const AES_KEY = 'CIP1aBJ9TBVQsNxWXDxPXHreWAgUgZAyXuwVhCMKbpD';

const CODE = computeTraceCode(`FW${BATCH_NO}${String(1).padStart(6, '0')}00000`, RULE);

/** 从回包 XML 里取 FromUserName（微信用它校验「这是哪个公众号的回复」） */
const fromUserNameOf = (xml) => {
  const m = String(xml || '').match(/<FromUserName><!\[CDATA\[([\s\S]*?)\]\]><\/FromUserName>/);
  return m ? m[1] : '';
};

describe('公众号被动回复回包身份（FromUserName = 公众号原始ID）', () => {
  let tmpDir, db, prevConfig;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-wxidentity-'));
    prevConfig = { ...config };
    Object.assign(config, {
      dataDir: tmpDir,
      uploadsDir: path.join(tmpDir, 'uploads'),
      dbPath: path.join(tmpDir, 'test.db'),
      webDistDir: path.join(tmpDir, 'web-dist'),
    });
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    db = createDb(config.dbPath);

    db.prepare('INSERT INTO projects (id, customer_name, status, solutions) VALUES (?, ?, ?, ?)')
      .run(TID, '回包身份测试租户', 'active', '["trace"]');
    db.prepare('INSERT INTO trace_code_rules (tenant_id, m1, rule_json) VALUES (?, ?, ?)')
      .run(TID, 'FW', JSON.stringify(RULE));
    db.prepare(`INSERT INTO trace_batches (tenant_id, m1, batch, product, factory, brand, is_active, rcon, banner)
      VALUES (?, 'FW', ?, '测试茶', '测试茶厂', '测试牌', 1, 0, 'https://demo.example.com/uploads/banner.png')`).run(TID, BATCH_NO);
    // 无横幅批次：验证「缺图回落文字」那条路也带原始ID
    db.prepare(`INSERT INTO trace_batches (tenant_id, m1, batch, product, factory, brand, is_active, rcon, banner)
      VALUES (?, 'FW', ?, '无横幅茶', '测试茶厂', '测试牌', 1, 0, '')`).run(TID, '0654321');
    db.prepare('INSERT INTO trace_settings (tenant_id, settings_json, cocom) VALUES (?, ?, -888)')
      .run(TID, JSON.stringify({ wxReply: 1, ftel: '4000000000' }));
  });

  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, prevConfig);
  });

  const svc = () => new WxMpService(db, {});
  const reply = (msg) => svc().resolveReply(CHANNEL, msg, { baseUrl: 'https://demo.example.com' });

  it('⓪ 反向锁：原始ID 必须与 appid 不同（否则下面所有断言等于没测）', () => {
    assert.notEqual(ORIGINAL_ID, CHANNEL.appid, '测试用的原始ID 不能等于 appid');
    assert.ok(/^gh_/.test(ORIGINAL_ID), '真实原始ID 是 gh_ 开头');
  });

  it('① 扫码（事件消息）回图文 → FromUserName = 原始ID，不能是 appid', () => {
    const xml = reply({
      msgType: 'event', event: 'SCAN', eventKey: CODE,
      fromUser: 'openidA', toUser: ORIGINAL_ID,
    });
    assert.ok(xml, '必须有回复');
    assert.ok(xml.includes('<MsgType><![CDATA[news]]></MsgType>'), '应回图文卡片');
    assert.equal(fromUserNameOf(xml), ORIGINAL_ID, `FromUserName 必须是公众号原始ID，实际：${xml}`);
    assert.ok(!xml.includes(CHANNEL.appid), '回包里绝不能出现 appid');
  });

  it('② 会话发码（文本消息）回图文 → FromUserName = 原始ID', () => {
    const xml = reply({
      msgType: 'text', content: CODE,
      fromUser: 'openidA', toUser: ORIGINAL_ID,
    });
    assert.ok(xml, '必须有回复');
    assert.equal(fromUserNameOf(xml), ORIGINAL_ID, `FromUserName 必须是公众号原始ID，实际：${xml}`);
    assert.ok(!xml.includes(CHANNEL.appid), '回包里绝不能出现 appid');
  });

  it('③ 缺图回落文字 → FromUserName 仍是原始ID（文字路径同样要改）', () => {
    const noBannerCode = computeTraceCode(`FW0654321${String(1).padStart(6, '0')}00000`, RULE);
    const xml = reply({
      msgType: 'text', content: noBannerCode,
      fromUser: 'openidA', toUser: ORIGINAL_ID,
    });
    assert.ok(xml.includes('<MsgType><![CDATA[text]]></MsgType>'), `缺图必须回落文字：${xml}`);
    assert.equal(fromUserNameOf(xml), ORIGINAL_ID, `文字回包的 FromUserName 也要是原始ID，实际：${xml}`);
    assert.ok(!xml.includes(CHANNEL.appid), '回包里绝不能出现 appid');
  });

  it('④ 场景码已被使用 → 拒绝语也要用原始ID', () => {
    db.prepare('INSERT INTO trace_mp_scenes (tenant_id, scene_id, code, openid, used_at) VALUES (?, ?, ?, ?, ?)')
      .run(TID, 100099, CODE, 'openidA', '2026-10-30 00:00:00');
    const xml = reply({
      msgType: 'event', event: 'SCAN', eventKey: '100099',
      fromUser: 'openidA', toUser: ORIGINAL_ID,
    });
    assert.ok(xml, '必须有回复');
    assert.ok(xml.includes('已被使用'), `已用场景码要明确告知：${xml}`);
    assert.equal(fromUserNameOf(xml), ORIGINAL_ID, `拒绝语的 FromUserName 也要是原始ID，实际：${xml}`);
    assert.ok(!xml.includes(CHANNEL.appid), '回包里绝不能出现 appid');
  });

  it('⑤ 密文回包：尾部标识必须是原始ID（微信解密后校验尾部，不符即丢整条）', () => {
    const wxc = new WxCrypto(MSG_TOKEN, AES_KEY, CHANNEL.appid);
    const encryptedXml = wxc.encrypt('<xml><ToUserName><![CDATA[openidA]]></ToUserName></xml>', '12345', '1793361766', ORIGINAL_ID);
    const dec = new WxCrypto(MSG_TOKEN, AES_KEY, CHANNEL.appid).decrypt(
      (encryptedXml.match(/<Encrypt><!\[CDATA\[([\s\S]*?)\]\]><\/Encrypt>/) || [])[1],
    );
    assert.equal(dec.fromAppid, ORIGINAL_ID, `密文尾部必须是原始ID，实际：${dec.fromAppid}`);
    // 反证：不传 originalId 时会退回 appid（这正是旧实现的错误）
    const legacy = wxc.encrypt('<xml/>', '12345', '1793361766');
    const legacyDec = new WxCrypto(MSG_TOKEN, AES_KEY, CHANNEL.appid).decrypt(
      (legacy.match(/<Encrypt><!\[CDATA\[([\s\S]*?)\]\]><\/Encrypt>/) || [])[1],
    );
    assert.equal(legacyDec.fromAppid, CHANNEL.appid, '旧实现（不传 originalId）确实会写成 appid');
  });

  it('⑥ 入站报文缺 ToUserName → 退回 appid 且不崩（兜底，不是主路径）', () => {
    const xml = reply({
      msgType: 'event', event: 'SCAN', eventKey: CODE,
      fromUser: 'openidA', toUser: '',
    });
    assert.ok(xml, '必须有回复');
    assert.equal(fromUserNameOf(xml), CHANNEL.appid, '缺 ToUserName 时才退回 appid');
  });
});

/**
 * 端到端：走真实的 handleInboundMessage（明文模式），验证
 *   ① 回包 FromUserName = 入站 ToUserName（公众号原始ID）
 *   ② 原始ID 自动落库（mp_message_config.original_id）
 *   ③ 之后即使入站报文缺 ToUserName，也仍然用记住的原始ID（而不是退回 appid）
 */
describe('公众号原始ID 自动学习与落库', () => {
  let tmpDir, db, prevConfig;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-wxlearn-'));
    prevConfig = { ...config };
    Object.assign(config, {
      dataDir: tmpDir,
      uploadsDir: path.join(tmpDir, 'uploads'),
      dbPath: path.join(tmpDir, 'test.db'),
      webDistDir: path.join(tmpDir, 'web-dist'),
    });
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    db = createDb(config.dbPath);

    db.prepare('INSERT INTO projects (id, customer_name, status, solutions) VALUES (?, ?, ?, ?)')
      .run(TID, '原始ID学习租户', 'active', '["trace"]');
    db.prepare('INSERT INTO channel_apps (id, customer_id, channel_type, appid, auth_status) VALUES (?, ?, ?, ?, ?)')
      .run(9, TID, 'mp', CHANNEL.appid, 'none');
    db.prepare(`INSERT INTO mp_message_config (channel_apps_id, customer_id, msg_token, encoding_aes_key, url_enabled)
      VALUES (?, ?, ?, ?, 1)`).run(9, TID, MSG_TOKEN, AES_KEY);
    db.prepare('INSERT INTO trace_code_rules (tenant_id, m1, rule_json) VALUES (?, ?, ?)')
      .run(TID, 'FW', JSON.stringify(RULE));
    db.prepare(`INSERT INTO trace_batches (tenant_id, m1, batch, product, factory, brand, is_active, rcon, banner)
      VALUES (?, 'FW', ?, '测试茶', '测试茶厂', '测试牌', 1, 0, 'https://demo.example.com/uploads/banner.png')`).run(TID, BATCH_NO);
    db.prepare('INSERT INTO trace_settings (tenant_id, settings_json, cocom) VALUES (?, ?, -888)')
      .run(TID, JSON.stringify({ wxReply: 1 }));
  });

  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, prevConfig);
  });

  const inbound = (toUser) => {
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = 'nonce12345';
    const sig = crypto.createHash('sha1').update([MSG_TOKEN, ts, nonce].sort().join('')).digest('hex');
    const body = `<xml><ToUserName><![CDATA[${toUser}]]></ToUserName><FromUserName><![CDATA[openidA]]></FromUserName>`
      + `<CreateTime>${ts}</CreateTime><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[scan]]></Event>`
      + `<EventKey><![CDATA[${CODE}]]></EventKey></xml>`;
    return { appid: CHANNEL.appid, query: { signature: sig, timestamp: ts, nonce }, body, baseUrl: 'https://demo.example.com' };
  };

  it('① 回包 FromUserName = 入站 ToUserName（原始ID），② 并自动落库', async () => {
    const { reply } = await new WxMpService(db, {}).handleInboundMessage(inbound(ORIGINAL_ID));
    assert.ok(reply, '必须有回复');
    assert.equal(fromUserNameOf(reply), ORIGINAL_ID, `回包 FromUserName 必须是原始ID：${reply}`);
    const row = db.prepare('SELECT original_id FROM mp_message_config WHERE channel_apps_id = ?').get(9);
    assert.equal(row.original_id, ORIGINAL_ID, '原始ID 必须落库（原始ID 没有开放接口可查，只能学）');
  });

  it('③ 之后入站报文缺 ToUserName → 仍用记住的原始ID，不退回 appid', async () => {
    const { reply } = await new WxMpService(db, {}).handleInboundMessage(inbound(''));
    assert.ok(reply, '必须有回复');
    assert.equal(fromUserNameOf(reply), ORIGINAL_ID, '已学会的原始ID 要继续生效');
  });
});
