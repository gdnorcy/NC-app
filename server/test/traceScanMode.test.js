/**
 * 扫码查询方案（服务对象可接受的三档 + 可用性判定 + 公开段引导二维码）回归测试。
 *
 * 覆盖：
 *   1) 枚举白名单：非法档位一律回落默认档（客户端传什么是不可信的）
 *   2) 可用性判定：未配公众号 / 未配服务器地址 → 依赖公众号推送的两档必须标为不可用并给出原因
 *      （否则商户选了却没反应 = 后台又一个空开关）
 *   3) 公开段临时场景码：60 秒内幂等复用，不重复烧微信额度、图也不会变
 *   4) 图片代理：只代理本租户自己生成过的 scene，陌生 scene 一律 404 且**不发外部请求**（防 SSRF）
 *   5) C 端验真响应带上当前档位，供溯源页决定是否显示引导
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { createDb, hashPassword } from '../src/db.js';
import { createApp } from '../src/app.js';
import request from 'supertest';
import { normalizeScanMode, buildScanQueryView, SCAN_MODE_OPTIONS } from '../src/services/traceScanMode.js';
import { issueOpenidTicket, readOpenidTicket } from '../src/services/traceOauth.js';
import { computeTraceCode, DEFAULT_CODESET } from '../src/services/traceCode.js';

const TID = 88;
const RULE = { m: { 1: 'FW', 2: 7, 3: 6, 4: 5, 5: 20 }, k: { ...DEFAULT_CODESET.k } };
const BATCH_NO = '0765432';
const CODE = computeTraceCode(`FW${BATCH_NO}00000100000`, RULE);

describe('扫码查询方案', () => {
  let tmpDir, db, app, prevConfig, qrCalls, token;
  const prevFetch = global.fetch;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-scanmode-'));
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
    app = createApp({ db });

    db.prepare('INSERT INTO projects (id, customer_name, status, solutions) VALUES (?, ?, ?, ?)')
      .run(TID, '扫码方案测试租户', 'active', '["trace"]');
    db.prepare('INSERT INTO trace_code_rules (tenant_id, m1, rule_json) VALUES (?, ?, ?)')
      .run(TID, 'FW', JSON.stringify(RULE));
    db.prepare(`INSERT INTO trace_batches (tenant_id, m1, batch, product, factory, brand, is_active, rcon)
      VALUES (?, 'FW', ?, '高原绿茶', '测试茶厂', '测试牌', 1, 0)`).run(TID, BATCH_NO);
    db.prepare(`INSERT INTO trace_settings (tenant_id, settings_json, cocom) VALUES (?, ?, -888)`)
      .run(TID, JSON.stringify({ scanMode: 'web' }));

    // 后台段要 JWT：按既有口径造一个租户管理员并登录取 token
    const { hash, salt } = hashPassword('admin123');
    db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, 'tenant_admin', 'active', ?)")
      .run('traceScanMode', '13800008888', hash, salt, TID);
    const login = await request(app).post('/api/auth/login').send({ username: 'traceScanMode', password: 'admin123' });
    token = login.body.token;

    qrCalls = [];
    global.fetch = async (url, opts) => {
      // 手动对接模式：appid + AppSecret 换 token（不接第三方平台时走这条路）
      if (String(url).includes('/cgi-bin/token')) {
        return { json: async () => ({ access_token: 'tok', expires_in: 7200 }) };
      }
      if (String(url).includes('/cgi-bin/qrcode/create')) {
        const body = JSON.parse(opts.body);
        qrCalls.push(body);
        return { json: async () => ({ ticket: `ticket-${qrCalls.length}`, expire_seconds: body.expire_seconds, url: 'https://weixin.qq.com/q/x' }) };
      }
      throw new Error('unexpected fetch ' + url);
    };
  });

  after(() => {
    global.fetch = prevFetch;
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, prevConfig);
  });

  const addChannel = () => {
    db.prepare(`INSERT INTO channel_apps (customer_id, appid, app_secret, channel_type, auth_status, brand_name)
      VALUES (?, 'wxscanmode', 'dummy-secret', 'mp', 'none', '测试公众号')`).run(TID);
    return db.prepare('SELECT * FROM channel_apps WHERE appid = ?').get('wxscanmode');
  };
  const authed = (req) => req.set('Authorization', `Bearer ${token}`);

  // 🔴 channel_apps 的租户列叫 customer_id（不是 tenant_id），mp_message_config 则按 channel_apps_id 关联
  const clearChannels = () => {
    for (const r of db.prepare('SELECT id FROM channel_apps WHERE customer_id = ?').all(TID)) {
      db.prepare('DELETE FROM mp_message_config WHERE channel_apps_id = ?').run(r.id);
    }
    db.prepare('DELETE FROM channel_apps WHERE customer_id = ?').run(TID);
  };

  test('① 枚举白名单：未设置/非法值一律回落默认档 web', () => {
    assert.equal(normalizeScanMode(undefined), 'web');
    assert.equal(normalizeScanMode('hacker'), 'web');
    assert.equal(normalizeScanMode(''), 'web');
    assert.equal(normalizeScanMode('push_dynamic'), 'push_dynamic');
    // 三档必须都有 C 端/服务端认得的行为实现，不能出现"选了没处消费"的档位
    assert.equal(SCAN_MODE_OPTIONS.length, 3);
  });

  test('② 未配置公众号 → 依赖推送的两档不可用且给出具体原因', () => {
    clearChannels();
    const view = buildScanQueryView(db, TID, {});
    const web = view.options.find((o) => o.value === 'web');
    const dyn = view.options.find((o) => o.value === 'push_dynamic');
    assert.equal(web.available, true, '网页档必须永远可用（它不依赖公众号）');
    assert.equal(dyn.available, false);
    assert.match(dyn.reason, /公众号/, `原因要说到点子上：${dyn.reason}`);
  });

  test('③ 有公众号但没配服务器地址 → 仍不可用（收不到扫码事件）', () => {
    clearChannels();
    const ch = addChannel();
    db.prepare('DELETE FROM mp_message_config WHERE channel_apps_id = ?').run(ch.id);
    const view = buildScanQueryView(db, TID, {});
    const dyn = view.options.find((o) => o.value === 'push_dynamic');
    assert.equal(dyn.available, false);
    assert.match(dyn.reason, /服务器配置|Token/, `应指出还差服务器配置：${dyn.reason}`);
    clearChannels();
  });

  test('④ 公众号 + 服务器地址齐备 → 三档全可用', () => {
    clearChannels();
    const ch = addChannel();
    db.prepare('DELETE FROM mp_message_config WHERE channel_apps_id = ?').run(ch.id);
    db.prepare(`INSERT INTO mp_message_config (channel_apps_id, customer_id, msg_token, encoding_aes_key, url_enabled)
      VALUES (?, ?, 'tok', '', 1)`).run(ch.id, TID);
    const view = buildScanQueryView(db, TID, { scanMode: 'push_permanent' });
    assert.equal(view.current, 'push_permanent');
    assert.ok(view.options.every((o) => o.available), '前置条件齐了就该全开放');
  });

  test('⑤ 公开段临时场景码：60 秒内幂等复用（不重复烧微信额度，图也不换）', async () => {
    qrCalls.length = 0;
    const r1 = await request(app).post(`/api/trace/public/mp-scene?tid=${TID}`).send({ code: CODE });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.equal(r1.body.ok, true);
    assert.equal(r1.body.reused, false);
    assert.match(String(r1.body.imageUrl), /^\/api\/trace\/public\/mp-scene\/image/, '必须回同源图片地址（微信图床有防盗链）');

    const r2 = await request(app).post(`/api/trace/public/mp-scene?tid=${TID}`).send({ code: CODE });
    assert.equal(r2.body.reused, true, '同一码 60 秒内应复用同一张图');
    assert.equal(r2.body.sceneId, r1.body.sceneId);
    assert.equal(qrCalls.length, 1, '幂等失效 = 用户每刷新一次就消耗一个公众号二维码额度');
  });

  test('⑥ 图片代理只认本租户自己生成过的 scene（陌生 scene 不代理、不发外部请求）', async () => {
    const r1 = await request(app).post(`/api/trace/public/mp-scene?tid=${TID}`).send({ code: `${CODE}` });
    const sceneId = Number(r1.body.sceneId);

    let outbound = 0;
    const captured = global.fetch;
    global.fetch = async (url, opts) => {
      outbound += 1;
      return captured(url, opts);
    };
    try {
      const bad = await request(app).get(`/api/trace/public/mp-scene/image?tid=${TID}&scene=${sceneId + 99999}`);
      assert.equal(bad.status, 404);
      assert.equal(outbound, 0, '未命中的 scene 绝不能发起外部请求（防 SSRF）');

      const other = await request(app).get(`/api/trace/public/mp-scene/image?tid=99999&scene=${sceneId}`);
      assert.equal(other.status, 404, '跨租户取图必须 404');
    } finally {
      global.fetch = captured;
    }
  });

  test('⑦ C 端验真响应带上当前档位（溯源页据此渲染引导）', async () => {
    const res = await request(app).post(`/api/trace/public/verify?tid=${TID}`).send({ co: CODE });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.scanMode, 'web');
  });

  test('⑨ GET /settings 下发方案视图（后台选择器的数据来源）', async () => {
    // 🔴 真实事故：后台读成了响应顶层 res.scanQuery，而接口把视图放在 **res.settings.scanQuery**
    //    → 三档一个都渲染不出来，界面只剩一个空 label。这条把"层级 + 三档齐全"钉死。
    db.prepare('UPDATE trace_settings SET settings_json = ? WHERE tenant_id = ?').run(JSON.stringify({ scanMode: 'web', wxReply: 1 }), TID);
    const res = await authed(request(app).get('/api/customer/trace/settings'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const sq = res.body.settings && res.body.settings.scanQuery;
    assert.ok(sq, '方案视图必须在 settings.scanQuery 里下发');
    assert.equal(sq.options.length, 3, '三档必须齐全');
    assert.equal(sq.current, 'web');
    assert.equal(Number(sq.replyEnabled), 1);
  });

  test('⑩ PUT /settings 不接收算出来的 scanQuery（避免过期快照写回配置）', async () => {
    await authed(request(app).put('/api/customer/trace/settings')).send({
      settings: { scanMode: 'push_dynamic', wxReply: 1, scanQuery: { current: 'web', options: [] } },
    });
    const saved = JSON.parse(db.prepare('SELECT settings_json FROM trace_settings WHERE tenant_id = ?').get(TID).settings_json);
    assert.equal(saved.scanQuery, undefined, '算出来的视图不该被写回配置');
    assert.equal(saved.scanMode, 'push_dynamic');
    await authed(request(app).put('/api/customer/trace/settings')).send({ settings: { scanMode: 'web' } });
  });

  test('⑪ PUT /settings 的枚举白名单：非法档位回落 web', async () => {
    await authed(request(app).put('/api/customer/trace/settings')).send({ settings: { scanMode: 'hacker' } });
    const saved = JSON.parse(db.prepare('SELECT settings_json FROM trace_settings WHERE tenant_id = ?').get(TID).settings_json);
    assert.equal(saved.scanMode, 'web', '非法档位必须回落默认档');
  });

  test('⑫ openid 凭据：不可伪造 / 过期失效 / 换租户失效', () => {
    // 🔴 这三条是整条网页授权链路的信任根：只要有一条松了，
    //    「首查奖励」和「本人扫码才出结果」就都能被冒领。
    const t = issueOpenidTicket(TID, 'openidA');
    assert.equal(readOpenidTicket(t, TID), 'openidA', '本人自己用应当读出');
    assert.equal(readOpenidTicket(t, TID + 1), '', '换租户必须失效（否则一张凭据能串到别家）');
    assert.equal(readOpenidTicket(`${t.slice(0, -2)}xx`, TID), '', '被改过必须失效');
    assert.equal(readOpenidTicket('', TID), '');
    const expired = issueOpenidTicket(TID, 'openidA', -10);
    assert.equal(readOpenidTicket(expired, TID), '', '过期必须失效');
  });

  test('⑬ 网页授权起点：非法回跳地址一律拒绝（防开放重定向）', async () => {
    for (const bad of ['https://evil.com/x', '//evil.com/x', 'evil.com', '']) {
      const r = await request(app).get(`/api/trace/public/wx-auth/start?tid=${TID}`).query({ redirect: bad });
      assert.equal(r.status, 400, `这种回跳地址竟然放行了：${bad}`);
    }
  });

  test('⑭ 网页授权起点：合法回跳 → 跳微信授权页且带 state（CSRF 防护必须有）', async () => {
    const r = await request(app).get(`/api/trace/public/wx-auth/start?tid=${TID}`)
      .query({ redirect: '/card/#/pages/trace/index?co=ABC&tid=' + TID });
    assert.equal(r.status, 302, JSON.stringify(r.body));
    const loc = String(r.headers.location || '');
    assert.ok(loc.startsWith('https://open.weixin.qq.com/connect/oauth2/authorize'), `应跳微信授权页：${loc}`);
    assert.match(loc, /scope=snsapi_base/, '静默授权，不能弹确认页');
    assert.match(loc, /state=[0-9a-f]{24}/, 'state 必须存在（回调要拿它防 CSRF）');
    const setCookie = String(r.headers['set-cookie'] || '');
    assert.ok(setCookie.includes('trace_oauth=') && setCookie.includes('HttpOnly'), 'state 必须存进 httpOnly cookie');
  });

  test('⑮ 回调 state 不匹配 → 拒绝（CSRF 串号防线）', async () => {
    const r = await request(app).get(`/api/trace/public/wx-auth/callback?tid=${TID}`).query({ code: 'c', state: 'deadbeef' });
    assert.equal(r.status, 400);
    assert.match(String(r.body.error), /state|授权/, `应明确拒绝：${r.body.error}`);
  });

  test('⑯ 带授权凭据 → 场景码绑本人；换人 → 另开一张（本人绑定真的生效）', async () => {
    qrCalls.length = 0;
    const code = computeTraceCode(`FW${BATCH_NO}00008800000`, RULE);
    const ticketA = issueOpenidTicket(TID, 'openidA');
    const r1 = await request(app).post(`/api/trace/public/mp-scene?tid=${TID}`).send({ code, oc: ticketA });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.equal(Number(r1.body.bound), 1, '带凭据时必须标记已绑定本人');
    const rowA = db.prepare('SELECT openid FROM trace_mp_scenes WHERE tenant_id = ? AND scene_id = ?').get(TID, r1.body.sceneId);
    assert.equal(rowA.openid, 'openidA', '场景码必须记住是谁申请的');

    // 换人：不能复用到上面那张（否则「本人绑定」形同虚设）
    const ticketB = issueOpenidTicket(TID, 'openidB');
    const r2 = await request(app).post(`/api/trace/public/mp-scene?tid=${TID}`).send({ code, oc: ticketB });
    assert.equal(Number(r2.body.reused), 0, '换人必须另开一张');
    assert.notEqual(r2.body.sceneId, r1.body.sceneId);
    assert.equal(qrCalls.length, 2);

    // 伪造凭据 = 当作没授权（不绑不报错，靠时效 + 一次有效兜底）
    const r3 = await request(app).post(`/api/trace/public/mp-scene?tid=${TID}`)
      .send({ code: computeTraceCode(`FW${BATCH_NO}00008900000`, RULE), oc: 'forged-ticket' });
    assert.equal(Number(r3.body.bound), 0, '伪造凭据不能被当成身份');
  });

  test('⑧ 别人的码 / 乱码 → 404 且不让微信接口被调用', async () => {
    qrCalls.length = 0;
    const bad = await request(app).post(`/api/trace/public/mp-scene?tid=${TID}`).send({ code: 'FW00000000000000000000' });
    assert.equal(bad.status, 404);
    assert.equal(qrCalls.length, 0, '非本租户的码不该跑去调微信');
  });
});
