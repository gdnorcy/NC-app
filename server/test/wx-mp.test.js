import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WxMpService, showQrImageUrl } from '../src/services/wx-mp.js';
import { classifyAuthorizer } from '../src/services/wx-component.js';
import { computeTraceCode, DEFAULT_CODESET } from '../src/services/traceCode.js';

// 简易内存 DB 桩：WxMpService 仅用到 getChannel（按 customer_id + channel_type 查）
function makeDb(rows = []) {
  return {
    prepare: () => ({
      get: (cid, type) => rows.find(r => r.customer_id === cid && r.channel_type === type) || undefined,
    }),
  };
}

// 组件服务桩：开放平台授权模式返回固定 token
function makeComponent(authorizerToken = 'auth-tok-123') {
  return {
    getAuthorizerAccessToken: async () => authorizerToken,
  };
}

// 可配置的 fetch 桩
function makeFetch(responses) {
  return async (url, opts) => {
    const u = String(url);
    for (const r of responses) {
      if (u.includes(r.match)) {
        const body = typeof r.body === 'function' ? r.body(opts) : r.body;
        return {
          json: async () => body,
          arrayBuffer: async () => Buffer.from(JSON.stringify(body)),
        };
      }
    }
    throw new Error('unexpected fetch: ' + u);
  };
}

beforeEach(() => { /* noop */ });
afterEach(() => { /* 恢复 fetch */ if (global.fetch && global.fetch.__restore) global.fetch.__restore(); });

test('classifyAuthorizer: 小程序（含 MiniProgramInfo）', () => {
  const r = classifyAuthorizer({ MiniProgramInfo: { something: 1 } });
  assert.deepEqual(r, { channelType: 'mini', accountType: '' });
});

test('classifyAuthorizer: 订阅号 service_type_info.id=0/1', () => {
  assert.equal(classifyAuthorizer({ service_type_info: { id: 0 } }).accountType, 'subscription');
  assert.equal(classifyAuthorizer({ service_type_info: { id: 1 } }).accountType, 'subscription');
});

test('classifyAuthorizer: 服务号 service_type_info.id=2/3', () => {
  assert.equal(classifyAuthorizer({ service_type_info: { id: 2 } }).accountType, 'service');
  assert.equal(classifyAuthorizer({ service_type_info: { id: 3 } }).accountType, 'service');
});

test('resolveToken: 手动对接走 cgi-bin/token', async () => {
  const fetch = makeFetch([{ match: 'cgi-bin/token', body: { access_token: 'manual-tok', expires_in: 7200 } }]);
  global.fetch = fetch;
  const svc = new WxMpService(makeDb(), makeComponent());
  const ch = { id: 1, appid: 'wxabc', app_secret: 'plain-secret', auth_status: 'none' };
  const tok = await svc.resolveToken(ch);
  assert.equal(tok, 'manual-tok');
});

test('resolveToken: 开放平台授权走 authorizer token', async () => {
  const fetch = makeFetch([]); // 不应调用 fetch
  global.fetch = fetch;
  const svc = new WxMpService(makeDb(), makeComponent('auth-tok-xyz'));
  const ch = { id: 2, appid: 'wxmp', app_secret: '', auth_status: 'authorized' };
  const tok = await svc.resolveToken(ch);
  assert.equal(tok, 'auth-tok-xyz');
});

test('detectAccountType: 48001 => 订阅号', async () => {
  const fetch = makeFetch([
    { match: 'cgi-bin/token', body: { access_token: 't', expires_in: 7200 } },
    { match: 'menu/get', body: { errcode: 48001, errmsg: 'api unauthorized' } },
  ]);
  global.fetch = fetch;
  const svc = new WxMpService(makeDb(), makeComponent());
  const ch = { id: 3, appid: 'wxsub', app_secret: 's', auth_status: 'none' };
  assert.equal(await svc.detectAccountType(ch), 'subscription');
});

test('detectAccountType: 46003(菜单未创建) => 服务号', async () => {
  const fetch = makeFetch([
    { match: 'cgi-bin/token', body: { access_token: 't', expires_in: 7200 } },
    { match: 'menu/get', body: { errcode: 46003, errmsg: 'menu not exist' } },
  ]);
  global.fetch = fetch;
  const svc = new WxMpService(makeDb(), makeComponent());
  const ch = { id: 4, appid: 'wxsvc', app_secret: 's', auth_status: 'none' };
  assert.equal(await svc.detectAccountType(ch), 'service');
});

test('getMenu: 46003 => null', async () => {
  const fetch = makeFetch([
    { match: 'cgi-bin/token', body: { access_token: 't', expires_in: 7200 } },
    { match: 'menu/get', body: { errcode: 46003 } },
  ]);
  global.fetch = fetch;
  const svc = new WxMpService(makeDb(), makeComponent());
  const ch = { id: 5, appid: 'wxsvc', app_secret: 's', auth_status: 'none' };
  assert.equal(await svc.getMenu(ch), null);
});

test('getMenu: 48001 => 抛错', async () => {
  const fetch = makeFetch([
    { match: 'cgi-bin/token', body: { access_token: 't', expires_in: 7200 } },
    { match: 'menu/get', body: { errcode: 48001, errmsg: 'no permission' } },
  ]);
  global.fetch = fetch;
  const svc = new WxMpService(makeDb(), makeComponent());
  const ch = { id: 6, appid: 'wxsub', app_secret: 's', auth_status: 'none' };
  await assert.rejects(() => svc.getMenu(ch), /不支持自定义菜单/);
});

test('createMenu: 成功', async () => {
  let posted = null;
  const fetch = makeFetch([
    { match: 'cgi-bin/token', body: { access_token: 't', expires_in: 7200 } },
    {
      match: 'menu/create',
      body: (opts) => { posted = JSON.parse(opts.body); return { errcode: 0, errmsg: 'ok' }; },
    },
  ]);
  global.fetch = fetch;
  const svc = new WxMpService(makeDb(), makeComponent());
  const ch = { id: 7, appid: 'wxsvc', app_secret: 's', auth_status: 'none' };
  const menu = { button: [{ name: '首页', type: 'view', url: 'https://x.com' }] };
  const r = await svc.createMenu(ch, menu);
  assert.equal(r.errcode, 0);
  assert.deepEqual(posted, menu);
});

test('createMenu: 微信返回 48001 => 抛错带 wxErrcode', async () => {
  const fetch = makeFetch([
    { match: 'cgi-bin/token', body: { access_token: 't', expires_in: 7200 } },
    { match: 'menu/create', body: { errcode: 48001, errmsg: 'no permission' } },
  ]);
  global.fetch = fetch;
  const svc = new WxMpService(makeDb(), makeComponent());
  const ch = { id: 8, appid: 'wxsub', app_secret: 's', auth_status: 'none' };
  try {
    await svc.createMenu(ch, { button: [] });
    assert.fail('should throw');
  } catch (e) {
    assert.equal(e.wxErrcode, 48001);
  }
});

// ============================ 溯源带参二维码 SCAN → 弹图文卡片 ============================

/**
 * 🔴 溯源测试用的**真实**码制与真实码。
 *
 * 2026-10-29 起 SCAN 场景判定从「trace_codes 里有这一行」改成
 * 「① 校验位通过 ② 批次属于本租户」（原判据导致刚印出来、还没人扫过的码
 * 在库里没有行 → 第一次扫不弹卡片，这正是本轮修的 bug）。
 * 判据变严后，测试里的假码（如 FW12345ABCDEF67890）过不了校验位 → 必须用真码。
 */
const TRACE_RULE = { m: { 1: 'FW', 2: 7, 3: 6, 4: 5, 5: 20 }, k: { ...DEFAULT_CODESET.k } };
const TRACE_BATCH = '0123456';
function traceCodeOf(serial) {
  return computeTraceCode(`FW${TRACE_BATCH}${String(serial).padStart(6, '0')}00000`, TRACE_RULE);
}
const TRACE_CODE = traceCodeOf(1);
const TRACE_BATCH_ROW = { tenant_id: 7, id: 1, batch: TRACE_BATCH, is_active: 1, banner: 'https://h.com/uploads/banner.png' };

// 支持 trace_codes / trace_settings / trace_code_rules / trace_batches / trace_activations 查询的内存 DB 桩
function makeTraceDb({
  traceCodes = [],
  settingsJson = '{}',
  rule = TRACE_RULE,
  batches = [TRACE_BATCH_ROW],
  activations = [],
} = {}) {
  return {
    prepare: (sql) => {
      const s = String(sql);
      if (s.includes('FROM trace_codes')) {
        return { get: (tid, code) => traceCodes.find((r) => r.tenant_id === tid && r.code === code) };
      }
      if (s.includes('FROM trace_code_rules')) {
        return { get: (tid) => (tid === 7 ? { rule_json: JSON.stringify(rule) } : undefined) };
      }
      if (s.includes('FROM trace_batches')) {
        return {
          get: (tid, key) => batches.find((r) => r.tenant_id === tid && (r.batch === key || r.id === key)),
          all: (tid) => batches.filter((r) => r.tenant_id === tid),
        };
      }
      if (s.includes('FROM trace_activations')) {
        return { get: (tid, bid) => activations.find((r) => r.tenant_id === tid && r.batch_id === bid) };
      }
      if (s.includes('FROM trace_settings')) {
        return { get: () => ({ settings_json: settingsJson }) };
      }
      if (s.includes('FROM mp_reply_rules')) {
        return { all: () => [], get: () => undefined };
      }
      return { get: () => undefined, all: () => [] };
    },
  };
}

const TRACE_CHANNEL = { id: 100, appid: 'wxtrace', customer_id: 7 };

test('resolveTraceScanReply: 非溯源 scene（校验位不过 / 批次不属本租户）→ null 回落', () => {
  const svc = new WxMpService(makeTraceDb({ traceCodes: [] }), makeComponent());
  const xml = svc.resolveTraceScanReply(TRACE_CHANNEL, 'NOTACODE', 'openidX', 'https://h.com');
  assert.equal(xml, null);
});

test('resolveTraceScanReply: 非溯源 scene（码有效但批次不属于本租户）→ null 回落', () => {
  const svc = new WxMpService(makeTraceDb({ traceCodes: [], batches: [] }), makeComponent());
  const xml = svc.resolveTraceScanReply(TRACE_CHANNEL, TRACE_CODE, 'openidX', 'https://h.com');
  assert.equal(xml, null, '别人的批次 / 不存在的批次不能弹溯源卡片');
});

test('resolveTraceScanReply: 命中展示位 → 发单条图文卡（验真结论为主），{CODE}/{TID} 被替换、PicUrl 转绝对地址', () => {
  const traceCodes = [{ tenant_id: 7, code: TRACE_CODE, num: 1, openid: '' }];
  const settingsJson = JSON.stringify({
    displaySlots: [
      { when: 1, title: '溯源页 {CODE}', cover: '/uploads/cover.png', link: 'https://shop.com/p?co={CODE}&t={TID}' },
      { when: 2, title: '仅首次', cover: 'https://cdn.com/a.png', link: '' },
    ],
  });
  const svc = new WxMpService(makeTraceDb({ traceCodes, settingsJson }), makeComponent());
  const xml = svc.resolveTraceScanReply(TRACE_CHANNEL, TRACE_CODE, 'openidX', 'https://h.com');
  assert.ok(xml, '应返回 news XML');
  assert.ok(xml.includes('<MsgType><![CDATA[news]]>'), '应为 news 类型');
  // 🔴 微信被动回复图文只能 1 条：这里锁死"配了 2 个展示位也只发 1 条"。
  //    2026-10-30 线上事故根因（配 2 个位 → 发 2 条图文 → 微信整条拒收 → 粉丝端
  //    「该公众号提供的服务出现故障」；客服接口同款数据实测 45008 article size out of limit）。
  assert.ok(xml.includes('<ArticleCount>1</ArticleCount>'), `图文条数必须恒为 1：${xml}`);
  assert.equal((xml.match(/<item>/g) || []).length, 1, 'XML 里只能有一个 item');
  // 主体是验真结论（不是广告），配图取批次主图
  assert.ok(xml.includes('https://h.com/uploads/banner.png'), '配图应取批次主图 banner');
  assert.ok(xml.includes(`溯源页 ${TRACE_CODE}`), '标题占位符应被替换');
  assert.ok(xml.includes('仅首次'), '展示位标题作为推广露出保留');
  assert.ok(xml.includes(`https://h.com/card/#/pages/trace/index?co=${TRACE_CODE}&tid=7`), '应跳 H5 溯源页');
  // ToUserName 必须是粉丝 openid，FromUserName 是公众号 appid
  assert.ok(xml.includes('<ToUserName><![CDATA[openidX]]>'), 'ToUserName 应为粉丝 openid');
  assert.ok(xml.includes('<FromUserName><![CDATA[wxtrace]]>'), 'FromUserName 应为公众号 appid');
});

test('resolveTraceScanReply: 🔴 无论配多少个展示位，被动回复图文恒为 1 条（微信接口硬上限）', () => {
  const traceCodes = [{ tenant_id: 7, code: TRACE_CODE, num: 1, openid: '' }];
  const settingsJson = JSON.stringify({
    displaySlots: Array.from({ length: 8 }, (_, i) => ({
      when: 1, title: `位${i + 1}`, cover: `https://cdn.com/${i}.png`, link: 'https://x.com',
    })),
  });
  const svc = new WxMpService(makeTraceDb({ traceCodes, settingsJson }), makeComponent());
  const xml = svc.resolveTraceScanReply(TRACE_CHANNEL, TRACE_CODE, 'openidX', 'https://h.com');
  assert.ok(xml, '应返回 news XML');
  assert.ok(xml.includes('<ArticleCount>1</ArticleCount>'), `8 个展示位也必须只发 1 条：${xml}`);
  assert.equal((xml.match(/<item>/g) || []).length, 1, '只能有一个 item');
  // 展示位不能顶掉验真结论
  assert.ok(xml.includes('验真通过'), `主体必须是验真结论：${xml}`);
});

test('resolveTraceScanReply: 首扫（trace_codes 无行）也必须弹卡片（本轮修的 bug）', () => {
  // 🔴 真实事故：trace_codes 只在消费者首次扫码**查询**时 INSERT，
  //    刚印出来、还没人扫过的码在库里根本没有行 → 原实现直接 return null
  //    → 消费者第一次扫这张公众号二维码什么都看不到（最该弹卡片的时候不弹）。
  const settingsJson = JSON.stringify({ displaySlots: [{ when: 1, title: 'a', cover: '', link: 'https://x.com' }] });
  const svc = new WxMpService(makeTraceDb({ traceCodes: [], settingsJson }), makeComponent());
  const xml = svc.resolveTraceScanReply(TRACE_CHANNEL, TRACE_CODE, 'openidX', 'https://h.com');
  assert.ok(xml && xml.includes('<MsgType><![CDATA[news]]>'), '首扫也必须弹卡片');
});

test('resolveTraceScanReply: 已查询过（num>1）不挑 FIRST 位', () => {
  const traceCodes = [{ tenant_id: 7, code: TRACE_CODE, num: 3, openid: 'openidX' }];
  const settingsJson = JSON.stringify({
    displaySlots: [
      { when: 1, title: '总是显示', cover: 'https://h.com/uploads/a.png', link: 'https://x.com' },
      { when: 2, title: '仅首次', cover: 'https://h.com/uploads/b.png', link: 'https://y.com' },
    ],
  });
  const svc = new WxMpService(makeTraceDb({ traceCodes, settingsJson }), makeComponent());
  const xml = svc.resolveTraceScanReply(TRACE_CHANNEL, TRACE_CODE, 'openidX', 'https://h.com');
  assert.ok(xml, '应返回 news XML');
  assert.ok(xml.includes('<MsgType><![CDATA[news]]>'), '已配置封面应回图文卡片');
  assert.ok(xml.includes('总是显示'), 'ALL 位应保留');
  assert.ok(!xml.includes('仅首次'), 'FIRST 位应被过滤（num>1）');
});

test('resolveTraceScanReply: P2 激活闸门开启且批次未激活 → 回文本引导语（不弹卡片）', () => {
  const settingsJson = JSON.stringify({
    isjihuo: 1,
    displaySlots: [{ when: 1, title: 'a', cover: '', link: 'https://x.com' }],
  });
  const svc = new WxMpService(makeTraceDb({ traceCodes: [], settingsJson }), makeComponent());
  const xml = svc.resolveTraceScanReply(TRACE_CHANNEL, TRACE_CODE, 'openidX', 'https://h.com');
  assert.ok(xml && xml.includes('<MsgType><![CDATA[text]]>'), '未激活批次应回文本');
  assert.ok(xml.includes('尚未激活'), '提示语应说明批次未激活');
  assert.ok(!xml.includes('<MsgType><![CDATA[news]]>'), '未激活批次不能弹溯源卡片');

  // 已激活 → 正常弹卡片
  const svc2 = new WxMpService(
    makeTraceDb({ traceCodes: [], settingsJson, activations: [{ tenant_id: 7, batch_id: 1 }] }),
    makeComponent(),
  );
  const xml2 = svc2.resolveTraceScanReply(TRACE_CHANNEL, TRACE_CODE, 'openidX', 'https://h.com');
  assert.ok(xml2 && xml2.includes('<MsgType><![CDATA[news]]>'), '已激活批次应正常弹卡片');
});

test('resolveReply: 事件 SCAN（溯源码）→ 弹 news；非溯源 scene → null', () => {
  const traceCodes = [{ tenant_id: 7, code: TRACE_CODE, num: 1, openid: '' }];
  const settingsJson = JSON.stringify({ displaySlots: [{ when: 1, title: 'a', cover: '', link: 'https://x.com' }] });
  const svc = new WxMpService(makeTraceDb({ traceCodes, settingsJson }), makeComponent());
  const traceMsg = { msgType: 'event', event: 'SCAN', eventKey: TRACE_CODE, fromUser: 'o1', toUser: 'wxtrace' };
  const xml = svc.resolveReply(TRACE_CHANNEL, traceMsg, { baseUrl: 'https://h.com' });
  assert.ok(xml && xml.includes('<MsgType><![CDATA[news]]>'), '溯源 SCAN 应弹 news');
  const otherMsg = { msgType: 'event', event: 'SCAN', eventKey: 'random-promo', fromUser: 'o1', toUser: 'wxtrace' };
  assert.equal(svc.resolveReply(TRACE_CHANNEL, otherMsg, { baseUrl: 'https://h.com' }), null, '非溯源 SCAN 应回落（无应答）');
});

test('resolveReply: 扫码关注（subscribe + qrscene_）→ 溯源命中弹 news；普通关注回落 subscribe 规则', () => {
  const traceCodes = [{ tenant_id: 7, code: TRACE_CODE, num: 1, openid: '' }];
  const settingsJson = JSON.stringify({ displaySlots: [{ when: 1, title: 'a', cover: '', link: 'https://x.com' }] });
  const svc = new WxMpService(makeTraceDb({ traceCodes, settingsJson }), makeComponent());
  const scanSub = { msgType: 'event', event: 'subscribe', eventKey: `qrscene_${TRACE_CODE}`, fromUser: 'o1', toUser: 'wxtrace' };
  const xml = svc.resolveReply(TRACE_CHANNEL, scanSub, { baseUrl: 'https://h.com' });
  assert.ok(xml && xml.includes('<MsgType><![CDATA[news]]>'), '扫码关注溯源命中应弹 news');
  const plainSub = { msgType: 'event', event: 'subscribe', eventKey: '', fromUser: 'o1', toUser: 'wxtrace' };
  // 无 subscribe 规则时回落 null（不抛错）
  assert.equal(svc.resolveReply(TRACE_CHANNEL, plainSub, { baseUrl: 'https://h.com' }), null);
});

test('createParamQr: 调用 qrcode/create 并返回 showUrl', async () => {
  let createBody = null;
  const fetch = makeFetch([
    { match: 'cgi-bin/token', body: { access_token: 'tok-1', expires_in: 7200 } },
    {
      match: 'qrcode/create',
      body: (opts) => { createBody = JSON.parse(opts.body); return { ticket: 'TICKET123', url: 'http://weixin.qq.com/q/abc' }; },
    },
  ]);
  global.fetch = fetch;
  const svc = new WxMpService(makeDb(), makeComponent());
  const ch = { id: 9, appid: 'wxp', app_secret: 's', auth_status: 'none' };
  const qr = await svc.createParamQr(ch, TRACE_CODE);
  assert.equal(createBody.action_name, 'QR_LIMIT_STR_SCENE');
  assert.equal(createBody.action_info.scene.scene_str, TRACE_CODE);
  assert.equal(qr.ticket, 'TICKET123');
  assert.ok(qr.showUrl.includes('ticket=TICKET123'), 'showUrl 应携带 ticket');
});

test('createParamQr: 微信返回 48001 → 抛中文提示（api 功能未授权），不是原始 errcode', async () => {
  // 🔴 微信硬规则：永久字符串码（QR_LIMIT_STR_SCENE）只对「已认证服务号」开放；
  //    订阅号 / 未认证服务号 / 未开通权限一律 48001。
  //    原实现把 errcode 原样抛出（"微信接口失败(48001): api unauthorized"）→ 商户看不懂。
  const fetch = makeFetch([
    { match: 'cgi-bin/token', body: { access_token: 'tok-1', expires_in: 7200 } },
    { match: 'qrcode/create', body: { errcode: 48001, errmsg: 'api unauthorized' } },
  ]);
  global.fetch = fetch;
  const svc = new WxMpService(makeDb(), makeComponent());
  const ch = { id: 10, appid: 'wxp', app_secret: 's', auth_status: 'none' };
  await assert.rejects(
    () => svc.createParamQr(ch, TRACE_CODE),
    (e) => {
      assert.match(String(e.message), /访问公众平台接口失败/);
      assert.match(String(e.message), /api 功能未授权/);
      assert.match(String(e.message), /已认证服务号/);
      assert.equal(Number(e.wxErrcode), 48001, '必须保留 wxErrcode 供上层分支');
      return true;
    },
  );
});

test('checkParamQrCapability: 授权模式查认证状态 —— 未认证服务号 → supported=false + 中文原因', async () => {
  const component = {
    getAuthorizerAccessToken: async () => 'tok',
    getAuthorizerInfo: async () => ({ authorization_status: 0, service_type_info: { id: 2 } }),
  };
  const svc = new WxMpService(makeDb(), component);
  const cap = await svc.checkParamQrCapability({ appid: 'wxmp', auth_status: 'authorized' });
  assert.equal(cap.supported, false, '未认证账号被判成可用');
  assert.equal(cap.accountType, '服务号');
  assert.match(String(cap.reason), /未完成微信认证/);

  // 已认证服务号 → 可用
  const component2 = {
    getAuthorizerAccessToken: async () => 'tok',
    getAuthorizerInfo: async () => ({ authorization_status: 1, service_type_info: { id: 2 } }),
  };
  const cap2 = await new WxMpService(makeDb(), component2).checkParamQrCapability({ appid: 'wxmp', auth_status: 'authorized' });
  assert.equal(cap2.supported, true, '已认证服务号被判成不可用');
});

test('checkParamQrCapability: 订阅号 → supported=false；手动对接模式 → 查不到就明说查不到', async () => {
  const component = {
    getAuthorizerAccessToken: async () => 'tok',
    getAuthorizerInfo: async () => ({ authorization_status: 1, service_type_info: { id: 1 } }),
  };
  const cap = await new WxMpService(makeDb(), component).checkParamQrCapability({ appid: 'wxmp', auth_status: 'authorized' });
  assert.equal(cap.supported, false, '订阅号被判成可用');
  assert.match(String(cap.reason), /订阅号/);

  // 手动对接：微信没有查认证状态的接口 → supported 必须为 null（不猜）
  const cap2 = await new WxMpService(makeDb(), makeComponent()).checkParamQrCapability({ appid: 'wxmp', auth_status: 'none' });
  assert.equal(cap2.supported, null, '手动对接模式不该假装知道结果');
  assert.match(String(cap2.reason), /48001/);
});

test('showQrImageUrl: 取图域名必须是 mp.weixin.qq.com（不是 api.weixin.qq.com，否则 404）', () => {
  // 🔴 真机踩过的坑：api.weixin.qq.com 上没有 showqrcode 路由，打过去一律 404，
  // 与微信表示「ticket 非法/过期」的 404 一模一样 → 极易误判。同一 ticket 实测
  // api.* → 404；mp.* → 200 image/jpg。
  const url = showQrImageUrl('gQHF8DwAAAAAAAAAAS5odHRwOi8vd2VpeGluLnFxLmNvbS9xLzAyOEJBa1I0QzRmYXIxVXlPejFHMXYAAgQaq_NqAwQIBwAA');
  assert.ok(url.startsWith('https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket='), `取图地址用了错误域名/路由：${url}`);
  assert.equal(url.includes('api.weixin.qq.com'), false, 'showqrcode 不能用 api.weixin.qq.com');
  assert.ok(url.includes(encodeURIComponent('gQHF8DwAAAA')), 'ticket 必须被 encodeURIComponent');
});
