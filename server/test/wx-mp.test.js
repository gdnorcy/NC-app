import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WxMpService } from '../src/services/wx-mp.js';
import { classifyAuthorizer } from '../src/services/wx-component.js';

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
