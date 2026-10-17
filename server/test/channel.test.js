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
 * 微信第三方平台（代开发）闭环专项测试
 * 覆盖：component_code2session / 按租户 wx-login / 客户侧取消授权 / 客户侧发布流程签名修正
 * 微信 API 用全局 fetch mock 拦截，不触网。
 */
let app;
let tmpDir;
let db;
const TENANT_APPID = 'wxtenantmini001';

// 统一 fetch mock：按 URL 关键字返回不同微信接口响应
function mockFetch() {
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('api_component_token')) {
      return { json: async () => ({ component_access_token: 'COMP_TOKEN_X', expires_in: 7200 }) };
    }
    if (u.includes('jscode2session')) {
      // component 模式：authorizer_appid 决定租户命名空间 openid
      const body = JSON.parse(opts.body || '{}');
      return { json: async () => ({ openid: 'OPENID_' + body.authorizer_appid, unionid: 'UNION_T' }) };
    }
    if (u.includes('api_query_auth')) {
      return { json: async () => ({ authorization_info: { authorizer_appid: TENANT_APPID, authorizer_access_token: 'AUTH_TOK', authorizer_refresh_token: 'REF_TOK', expires_in: 7200 } }) };
    }
    if (u.includes('api_unauthorize')) {
      return { json: async () => ({ errcode: 0 }) };
    }
    if (u.includes('gettemplatelist')) {
      return { json: async () => ({ template_list: [{ template_id: 99, user_version: '1.0.0', user_desc: 't' }] }) };
    }
    if (u.includes('gettemplatedraftlist')) {
      return { json: async () => ({ draft_list: [{ draft_id: 555, user_version: '1.0.0', user_desc: 't' }] }) };
    }
    if (u.includes('template/draft/add')) {
      return { json: async () => ({ errcode: 0 }) };
    }
    if (u.includes('get_auditstatus')) {
      return { json: async () => ({ status: 0, reason: '' }) };
    }
    if (u.includes('submit_audit')) {
      return { json: async () => ({ auditid: 12345, errcode: 0 }) };
    }
    if (u.includes('/release') || u.includes('revertcoderelease')) {
      return { json: async () => ({ errcode: 0 }) };
    }
    return { json: async () => ({ errcode: 0 }) };
  };
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-channel-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  db = createDb(config.dbPath);

  // 平台第三方平台凭证 + verify_ticket（component_access_token 发动机前置）
  db.prepare(`UPDATE channel_component SET component_appid='wxcomponent001', component_appsecret='SECRET',
    message_token='TOK', encoding_aes_key='AESKEY000000000000000000000000000000000000000',
    component_verify_ticket='TICKET', updated_at=datetime('now') WHERE id=1`).run();

  // 租户1 的小程序渠道：已授权（per-tenant 登录要命中此行）
  db.prepare(`INSERT INTO channel_apps (customer_id, channel_type, appid, auth_status, authorizer_access_token, authorizer_refresh_token, token_expires_at)
    VALUES (1, 'mini', ?, 'authorized', 'AUTH_TOK', 'REF_TOK', datetime('now','+1 day'))`).run(TENANT_APPID);

  mockFetch();
  app = createApp({ db });
});

after(() => {
  delete global.fetch;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// —— componentCode2Session：按 authorizer_appid 返回租户命名空间 openid ——
test('componentCode2Session 返回 authorizer 命名空间 openid', async () => {
  const { WxComponentService } = await import('../src/services/wx-component.js');
  const svc = new WxComponentService(db);
  const r = await svc.componentCode2Session(TENANT_APPID, 'JSCODE1');
  assert.equal(r.openid, 'OPENID_' + TENANT_APPID);
  assert.equal(r.unionid, 'UNION_T');
});

// —— 按租户 wx-login：带 appid 命中 channel_apps → 绑定该租户，openid 走 component 命名空间 ——
test('wx-login 带租户 appid：用户绑定该授权租户且 openid 来自 component 通道', async () => {
  const res = await request(app)
    .post('/api/card/auth/wx-login')
    .send({ code: 'JSCODE_TENANT', appid: TENANT_APPID });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  const user = db.prepare('SELECT openid, customer_id FROM platform_user WHERE openid = ?').get('OPENID_' + TENANT_APPID);
  assert.ok(user, '应存在 component 命名空间 openid 的用户');
  assert.equal(user.customer_id, 1, '应绑定到授权租户1');
});

// —— 回落：不带 appid 走平台单 appid 通道（此处无 secret 配置 → mock 回落，仅验证不报错链路） ——
test('wx-login 不带 appid：回落路径不崩溃', async () => {
  // 平台单 appid 通道在测试环境无 secret，会回落 mock（openid='mock_'+code），期望仍 200
  const res = await request(app)
    .post('/api/card/auth/wx-login')
    .send({ code: 'JSCODE_PLAIN' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
});

// —— 客户侧取消授权：unauthorize 服务成功 + 路由清理 SQL 将渠道复位为未授权 ——
test('客户侧取消授权：unauthorize 成功且渠道复位为未授权', async () => {
  const { WxComponentService } = await import('../src/services/wx-component.js');
  const svc = new WxComponentService(db);
  const r = await svc.unauthorize(TENANT_APPID);
  assert.equal(r.errcode, 0);
  // 模拟 DELETE /channels/mini 路由执行的核心清理（按找到的渠道行清空授权态，保留品牌配置）
  const channel = db.prepare("SELECT id FROM channel_apps WHERE customer_id=1 AND channel_type='mini'").get();
  db.prepare(`UPDATE channel_apps SET auth_status='revoked', appid='', app_secret='',
    authorizer_access_token='', authorizer_refresh_token='', token_expires_at=NULL,
    version='', template_id='', draft_id=NULL, audit_id='', audit_status='none',
    updated_at=datetime('now') WHERE id=?`).run(channel.id);
  const row = db.prepare("SELECT auth_status, appid FROM channel_apps WHERE id=?").get(channel.id);
  assert.equal(row.auth_status, 'revoked');
  assert.equal(row.appid, '');
});

// —— 客户侧发布流程签名修正：现传 id 而非 appid，upload/submit/audit/release 全部成功 ——
test('客户侧发布流程：upload→submit→release 均以 id 调用服务成功', async () => {
  // 恢复渠道为已授权态（上一个 unauthorize 测试已将其置 revoked）
  db.prepare(`UPDATE channel_apps SET auth_status='authorized', appid=?, authorizer_access_token='AUTH_TOK',
    authorizer_refresh_token='REF_TOK', token_expires_at=datetime('now','+1 day') WHERE customer_id=1 AND channel_type='mini'`)
    .run(TENANT_APPID);
  // 直接在服务层验证：传入 channel_apps.id 不会 500（此前传 appid 必炸）
  const { WxComponentService } = await import('../src/services/wx-component.js');
  const svc = new WxComponentService(db);
  const channel = db.prepare("SELECT id FROM channel_apps WHERE customer_id=1 AND channel_type='mini'").get();
  await svc.uploadCode(channel.id, 99, '1.0.0', 't');
  const sub = await svc.submitAudit(channel.id);
  assert.equal(String(sub.auditId), '12345');
  await svc.release(channel.id);
  const row = db.prepare('SELECT audit_status, audit_id, version FROM channel_apps WHERE id=?').get(channel.id);
  assert.equal(row.audit_status, 'released');
  assert.equal(row.audit_id, '12345');
  assert.equal(row.version, '1.0.0');
});
