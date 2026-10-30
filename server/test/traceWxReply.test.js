/**
 * 公众号会话内「发送防伪码 → 回复验真结果」回归测试。
 *
 * 🔴 为什么必须用真库（createDb）而不是手写桩：
 *   这条通道写的是**同一组计数器**（trace_codes.num / trace_batches.rcon / trace_histories），
 *    还与网页通道共享 21 秒去重窗口和错码频控 —— 用桩很容易把「跨租户过滤」「21 秒窗口」
 *    这类真实 SQL 语义桩掉，导致测试全绿而线上错。这里全部走真 SQLite。
 *
 * 覆盖：
 *   1) 发正确防伪码 → 回图文卡片（商品名 + 验真通过），并登记首查（num=1、历史「第1次查询」）
 *   2) 21 秒去重窗口：同一人立刻重发不重复计数（否则查询数据虚高一倍）
 *   3) 换人查询 → 计数递增 + 文案变为「已被查询」，把假货预警说出来
 *   4) 形状不符（长度/中文/非本租户前缀）→ 返回 null，不打扰关键词与默认回复
 *   5) 错码（前缀对、校验位错）→ 回引导语并记错码；超 zdl 上限后不再给答案
 *   6) 批次未激活（isjihuo=1）→ 只给引导语，且**不登记查询**（不制造「货没发已有人查」的假数据）
 *   7) 商户关闭该能力（wxReply=0）→ 返回 null（不做意外打扰）
 *   8) 超过查询上限 → 回上限文案且不登记
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { createDb } from '../src/db.js';
import { WxMpService } from '../src/services/wx-mp.js';
import { computeTraceCode, DEFAULT_CODESET } from '../src/services/traceCode.js';

const TID = 77;
const RULE = { m: { 1: 'FW', 2: 7, 3: 6, 4: 5, 5: 20 }, k: { ...DEFAULT_CODESET.k }, zdl: 3 };
const BATCH_NO = '0123456';
const CHANNEL = { id: 1, appid: 'wxtrace', app_secret: '', customer_id: TID, auth_status: 'authorized' };

function codeFor(batchNo, serial) {
  return computeTraceCode(`FW${batchNo}${String(serial).padStart(6, '0')}00000`, RULE);
}
function codeOf(serial) {
  return codeFor(BATCH_NO, serial);
}
const CODE_A = codeOf(1);
const CODE_B = codeOf(2);
const BATCH_NO2 = '0654321';
const CODE_C = codeFor(BATCH_NO2, 1);

describe('公众号会话发送防伪码 → 回复验真结果', () => {
  let tmpDir, db, prevConfig;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-wxreply-'));
    prevConfig = { ...config };
    Object.assign(config, {
      dataDir: tmpDir,
      uploadsDir: path.join(tmpDir, 'uploads'),
      dbPath: path.join(tmpDir, 'test.db'),
      webDistDir: path.join(tmpDir, 'web-dist'),
      storageProvider: 'local',
      storageProviders: JSON.stringify({ local: {} }),
      adminUser: 'admin',
      adminPass: 'admin123',
    });
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    db = createDb(config.dbPath);

    db.prepare('INSERT INTO projects (id, customer_name, status, solutions) VALUES (?, ?, ?, ?)')
      .run(TID, '公众号验真测试租户', 'active', '["trace"]');
    db.prepare('INSERT INTO trace_code_rules (tenant_id, m1, rule_json) VALUES (?, ?, ?)')
      .run(TID, 'FW', JSON.stringify(RULE));
    db.prepare(`INSERT INTO trace_batches (tenant_id, m1, batch, product, factory, brand, is_active, rcon, banner)
      VALUES (?, 'FW', ?, '高原绿茶', '测试茶厂', '测试牌', 1, 0, 'https://demo.example.com/uploads/banner.png')`).run(TID, BATCH_NO);
    // 第二批次：故意不设 banner，用于验证「空 PicUrl → 回落文字、不报『服务出现故障』」（#519）。
    db.prepare(`INSERT INTO trace_batches (tenant_id, m1, batch, product, factory, brand, is_active, rcon, banner)
      VALUES (?, 'FW', ?, '无横幅茶', '测试茶厂', '测试牌', 1, 0, '')`).run(TID, BATCH_NO2);
    db.prepare('INSERT INTO trace_settings (tenant_id, settings_json, cocom) VALUES (?, ?, -888)')
      .run(TID, JSON.stringify({ wxReply: 1, ftel: '4000000000' }));
  });

  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, prevConfig);
  });

  const svc = () => new WxMpService(db, {});
  const send = (content, openid = 'openidA') => svc().resolveReply(CHANNEL, {
    msgType: 'text',
    content,
    fromUser: openid,
    toUser: 'wxtrace',
  }, { baseUrl: 'https://demo.example.com' });
  // SCAN 事件（旧路径：EventKey 本身就是码，不走场景码映射），用于验证带参二维码弹卡片。
  const scan = (code, openid = 'openidScan') => svc().resolveReply(CHANNEL, {
    msgType: 'event',
    event: 'SCAN',
    eventKey: code,
    fromUser: openid,
    toUser: 'wxtrace',
  }, { baseUrl: 'https://demo.example.com' });
  const setSettings = (patch) => {
    const cur = JSON.parse(db.prepare('SELECT settings_json FROM trace_settings WHERE tenant_id = ?').get(TID).settings_json);
    const next = { ...cur, ...patch };
    // 🔴 占位符顺序 = UPDATE trace_settings SET settings_json = ?, ... WHERE tenant_id = ?
    const info = db.prepare('UPDATE trace_settings SET settings_json = ? WHERE tenant_id = ?').run(JSON.stringify(next), TID);
    assert.equal(info.changes, 1, '测试夹具没写进设置（占位符传参顺序写反了会静默更新 0 行）');
  };
  const numOf = (code) => Number(db.prepare('SELECT num FROM trace_codes WHERE tenant_id = ? AND code = ?').get(TID, code)?.num || 0);
  const historyCount = (code) => Number(db.prepare('SELECT COUNT(*) AS c FROM trace_histories WHERE tenant_id = ? AND summary = ?').get(TID, code).c);

  it('① 发正确防伪码 → 回图文卡片，且登记为首次查询', () => {
    const xml = send(CODE_A);
    assert.ok(xml, '必须有回复');
    assert.ok(xml.includes('<MsgType><![CDATA[news]]></MsgType>'), '应回图文卡片（可点进溯源页）');
    assert.ok(xml.includes('高原绿茶'), `卡片标题应带商品名：${xml}`);
    assert.ok(xml.includes('验真通过'), '首次查询应给出正面结论');
    assert.ok(xml.includes(CODE_A), '卡片应带该防伪码（便于用户核对）');
    assert.equal(numOf(CODE_A), 1, '首次查询应落 num=1');
    assert.equal(historyCount(CODE_A), 1, '应写一条查询历史');
    const remark = db.prepare('SELECT remark FROM trace_histories WHERE tenant_id = ? AND summary = ? ORDER BY id DESC').get(TID, CODE_A).remark;
    assert.equal(remark, '第1次查询', `历史备注序号错了：${remark}`);
  });

  it('② 21 秒去重窗口：同一人立刻重发不重复计数（计数虚高会让假货预警说谎）', () => {
    const before = numOf(CODE_A);
    send(CODE_A);
    assert.equal(numOf(CODE_A), before, '窗口内重发不能把查询次数涨上去');
    assert.equal(historyCount(CODE_A), 1, '窗口内重发不应再写一条历史');
  });

  it('③ 换人查询 → 计数递增并给出「已被多次查询」的假货预警', () => {
    const xml = send(CODE_A, 'openidB');
    assert.ok(xml.includes('已被查询'), `第二个人查同一码必须预警：${xml}`);
    assert.equal(numOf(CODE_A), 2, '换人查询应递增到 2');
    assert.equal(historyCount(CODE_A), 2);
    const remark = db.prepare('SELECT remark FROM trace_histories WHERE tenant_id = ? AND summary = ? ORDER BY id DESC').get(TID, CODE_A).remark;
    assert.equal(remark, '第2次查询', `第二次查询的序号必须写在备注里：${remark}`);
  });

  it('④ 形状不符 → 返回 null，不打扰关键词/默认回复', () => {
    assert.equal(send('你好'), null, '中文短句不是防伪码');
    assert.equal(send('FW123'), null, '长度不足不是防伪码');
    assert.equal(send(`${CODE_A}12345`), null, '超长不是防伪码');
    assert.equal(send(`AB${CODE_A.slice(2)}`), null, '前缀不是本租户的不是防伪码');
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM trace_wrong_attempts WHERE tenant_id = ?').get(TID).c), 0,
      '形状不符绝不能记错码 —— 否则正常咨询会被频控误伤');
  });

  it('⑤ 错码 → 回复不存在并记错码；超过 zdl 上限后不再给答案', () => {
    const bad = `${CODE_B.slice(0, 15)}00000`; // 前缀与长度都对，校验位错
    const r1 = send(bad);
    assert.ok(r1.includes('不存在或已失效'), `错码必须明确回「不存在」：${r1}`);
    const attempts = Number(db.prepare('SELECT COUNT(*) AS c FROM trace_wrong_attempts WHERE tenant_id = ? AND openid = ?').get(TID, 'openidA').c);
    assert.ok(attempts >= 1, '错码必须记账（用于频控）');

    // zdl = 3 → 再错几次就该被限流
    let throttled = '';
    for (let i = 0; i < 6; i += 1) throttled = send(bad, 'openidA') || '';
    assert.ok(throttled.includes('错误次数过多'), `超过上限必须限流，防止用公众号对话撞校验位：${throttled}`);
  });

  it('⑥ 批次未激活（激活闸门开）→ 只给引导语，且**不登记查询**', () => {
    setSettings({ isjihuo: 1 });
    try {
      const xml = send(CODE_B);
      assert.ok(xml.includes('尚未激活'), `未激活必须回引导语：${xml}`);
      assert.equal(numOf(CODE_B), 0, '未激活批次不该产生查询记录（否则「货没发就有人查了」）');
      assert.equal(historyCount(CODE_B), 0, '未激活批次不该写查询历史');
    } finally {
      setSettings({ isjihuo: 0 });
    }
  });

  it('⑦ 商户关闭该能力（wxReply=0）→ 返回 null（整条路静默退化）', () => {
    setSettings({ wxReply: 0 });
    try {
      assert.equal(send(CODE_B), null, '商户关了就不能再替它回话');
      assert.equal(numOf(CODE_B), 0, '关闭期间不得登记查询');
    } finally {
      setSettings({ wxReply: 1 });
    }
  });

  it('⑧ 超过批次查询上限 → 回上限文案且不再登记', () => {
    setSettings({ upperlimit: 1, con_msg: '本批次查询次数已达上限，请联系商家' });
    try {
      const xml = send(CODE_B);
      assert.ok(xml.includes('已达上限'), `应回上限文案：${xml}`);
      assert.equal(numOf(CODE_B), 0, '超上限不应登记查询');
    } finally {
      setSettings({ upperlimit: 0, con_msg: '' });
    }
  });

  it('⑨ 无人 tenant（渠道不属于任何租户）→ 不回话，不抛错', () => {
    const xml = new WxMpService(db, {}).resolveReply({ ...CHANNEL, customer_id: 0 }, {
      msgType: 'text', content: CODE_A, fromUser: 'openidA', toUser: 'wxtrace',
    }, { baseUrl: '' });
    assert.equal(xml, null);
  });

  it('⑩ (#519) SCAN 带参二维码、批次未设 banner → 回落文字而非空 PicUrl「服务出现故障」', () => {
    const xml = scan(CODE_C);
    assert.ok(xml, '必须有回复（不能静默无响应）');
    assert.ok(xml.includes('<MsgType><![CDATA[text]]>'), `空 PicUrl 必须回落文字：${xml}`);
    assert.ok(!xml.includes('<PicUrl>'), `绝不能再生成空 PicUrl（这就是『服务出现故障』的根因）：${xml}`);
    assert.ok(xml.includes('无横幅茶'), `文字里应带商品名，保证用户拿到信息：${xml}`);
    assert.ok(xml.includes('验真通过'), '文字里应给验真结论');
  });

  it('⑪ (#519) 会话发码、批次未设 banner → 回落文字而非空 PicUrl', () => {
    const xml = send(CODE_C);
    assert.ok(xml.includes('<MsgType><![CDATA[text]]>'), `空 PicUrl 必须回落文字：${xml}`);
    assert.ok(!xml.includes('<PicUrl>'), `绝不能再生成空 PicUrl：${xml}`);
    assert.ok(xml.includes('无横幅茶'), `文字里应带商品名：${xml}`);
  });

  it('⑫ (#523) 配了 2 个展示位 → 扫码（事件消息）回一组卡片：1 张验真卡 + 2 张推广卡', () => {
    // 🔴 扫码是**事件消息**，微信官方规则：「其余场景最多可回复 8 条图文消息」
    //    → 一次给一组卡片（观感接近群发），第 1 张必须是验真结论。
    //    ⚠️ 早期把"客服接口 1 条"当成"被动回复 1 条"，砍掉了扫码场景合法的多卡片能力；
    //       文本消息那条路才是 1 条（见 ⑭）。
    setSettings({
      displaySlots: [
        { when: 1, title: '广告位一', cover: 'https://cdn.example.com/a.jpg', link: 'https://x.example.com/1' },
        { when: 1, title: '广告位二', cover: 'https://cdn.example.com/b.jpg', link: 'https://x.example.com/2' },
      ],
    });
    try {
      // 用 CODE_B：它此前未被查询过（num=0）→ 文案是「验真通过」，断言更贴近首次扫码的真实场景
      const xml = scan(CODE_B);
      assert.ok(xml, '必须有回复');
      assert.ok(xml.includes('<ArticleCount>3</ArticleCount>'), `扫码应回 3 条图文：${xml}`);
      assert.equal((xml.match(/<item>/g) || []).length, 3, 'XML 里应有三个 item');
      assert.ok(xml.includes('验真'), '主体必须是验真结论（不能让位给广告）');
      assert.ok(xml.includes('广告位一') && xml.includes('广告位二'), '两个展示位各出一张推广卡');
      const firstItem = (xml.match(/<item>[\s\S]*?<\/item>/) || [''])[0];
      assert.ok(firstItem.includes('验真'), '第一张必须是验真结果卡');
    } finally {
      setSettings({ displaySlots: [] });
    }
  });

  it('⑭ (#523) 会话里发防伪码（文本消息）→ 仍只回 1 条图文', () => {
    // 🔴 文本消息通道微信只给 1 条图文额度（「只能回复 1 条图文消息」），不能照抄扫码那套。
    setSettings({
      displaySlots: [
        { when: 1, title: '广告位一', cover: 'https://cdn.example.com/a.jpg', link: 'https://x.example.com/1' },
      ],
    });
    try {
      const xml = send(CODE_B);
      assert.ok(xml, '必须有回复');
      assert.ok(xml.includes('<ArticleCount>1</ArticleCount>'), `文本发码只能 1 条图文：${xml}`);
      assert.equal((xml.match(/<item>/g) || []).length, 1, 'XML 里只能有一个 item');
      assert.ok(xml.includes('验真'), '主体必须是验真结论');
    } finally {
      setSettings({ displaySlots: [] });
    }
  });

  it('⑬ (#522) 展示位总开关关掉 → 微信卡片不再带推广露出', () => {
    setSettings({
      slotsEnabled: 0,
      displaySlots: [{ when: 1, title: '不该出现的位', cover: 'https://cdn.example.com/a.jpg', link: '' }],
    });
    try {
      const xml = scan(CODE_B);
      assert.ok(xml, '必须有回复');
      assert.ok(xml.includes('<MsgType><![CDATA[news]]>'), '总开关关掉只关广告位，不影响验真卡片');
      assert.ok(!xml.includes('不该出现的位'), `总开关关了就不该露出推广：${xml}`);
    } finally {
      setSettings({ slotsEnabled: 1, displaySlots: [] });
    }
  });
});
