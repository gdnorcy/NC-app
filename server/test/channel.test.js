import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';
import { issueToken } from '../src/auth.js';
import { readSecret } from '../src/crypto.js';

/**
 * 微信第三方平台（代开发）+ 自运营模式 专项测试
 * 覆盖：component_code2session / 按租户 wx-login（component + 自运营双通道）/
 *       客户侧取消授权 / 发布流程签名 / 参数设置（AppID/AppSecret + NOT NULL 守卫）/
 *       自运营 miniprogram-ci 上传分支
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
    if (u.includes('/sns/jscode2session')) {
      // 自运营模式：标准 GET，appid/secret 在 query —— openid 用 appid 区分命名空间
      const appid = new URL(u).searchParams.get('appid');
      return { json: async () => ({ openid: 'OPENID_SELF_' + appid, unionid: 'UNION_SELF' }) };
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

// —— 自运营模式登录：租户自有 AppID+AppSecret 走标准 jscode2session 并绑定租户 ——
test('wx-login 自运营模式：租户自有 AppID+AppSecret 走标准通道并绑定租户', async () => {
  db.prepare(`INSERT INTO channel_apps (customer_id, channel_type, appid, app_secret, auth_status)
    VALUES (2, 'mini', 'wxself001', 'SELF_SECRET', 'none')`).run();
  const res = await request(app)
    .post('/api/card/auth/wx-login')
    .send({ code: 'JSCODE_SELF', appid: 'wxself001' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  const user = db.prepare('SELECT openid, customer_id FROM platform_user WHERE openid = ?').get('OPENID_SELF_wxself001');
  assert.ok(user, '应存在自运营命名空间 openid 的用户');
  assert.equal(user.customer_id, 2, '应绑定到自运营租户2');
});

// —— 客户侧参数设置：自运营 AppID/Secret 保存 + 授权态守卫 + 空值不撞 NOT NULL ——
test('客户侧参数设置：自运营参数保存、授权态守卫、空值保存不撞 NOT NULL', async () => {
  const { hash, salt } = hashPassword('Test@123');
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('chan_adm1', '13800001003', hash, salt, 'tenant_admin', 'active', 1);
  const adm = db.prepare('SELECT * FROM users WHERE username = ?').get('chan_adm1');
  const headers = { Authorization: `Bearer ${issueToken(adm)}` };

  // 授权态守卫：selfAppid 不允许覆盖授权回调写入的 appid
  const put1 = await request(app).put('/api/customer/channels/mini').set(headers)
    .send({ selfAppid: 'wxhack001', appSecret: 'S_NEW', originalId: 'gh_t1', uploadKey: 'KEY_T1' });
  assert.equal(put1.status, 200);
  const row1 = db.prepare("SELECT appid, app_secret, original_id, upload_key FROM channel_apps WHERE customer_id=1 AND channel_type='mini'").get();
  assert.equal(row1.appid, TENANT_APPID, '授权态下 selfAppid 不得覆盖 appid');
  // 🔴 密钥类字段落库必须是密文（数据库会进备份，明文=凭据裸奔）
  assert.notEqual(row1.app_secret, 'S_NEW', 'app_secret 不得明文落库');
  assert.equal(readSecret(row1.app_secret), 'S_NEW', 'app_secret 解密后应为原值');
  assert.notEqual(row1.upload_key, 'KEY_T1', 'upload_key（RSA 私钥）不得明文落库');
  assert.equal(readSecret(row1.upload_key), 'KEY_T1', 'upload_key 解密后应为原值');
  assert.equal(row1.original_id, 'gh_t1');

  // 模拟取消授权后的非授权态：selfAppid 应可写入（自运营参数）
  db.prepare("UPDATE channel_apps SET auth_status='none' WHERE customer_id=1 AND channel_type='mini'").run();
  const put2 = await request(app).put('/api/customer/channels/mini').set(headers)
    .send({ selfAppid: 'wxself_t1', appSecret: 'S_T1' });
  assert.equal(put2.status, 200);
  const row2 = db.prepare("SELECT appid, app_secret FROM channel_apps WHERE customer_id=1 AND channel_type='mini'").get();
  assert.equal(row2.appid, 'wxself_t1', '非授权态下 selfAppid 应写入');
  assert.equal(readSecret(row2.app_secret), 'S_T1');

  // 只传品牌字段（如 saveBrand）：空 customDomain/page 等落 '' 而非 null，不撞 NOT NULL
  const put3 = await request(app).put('/api/customer/channels/mini').set(headers)
    .send({ brandName: '品牌B', primaryColor: '#165DFF', enabled: false });
  assert.equal(put3.status, 200);
  const row3 = db.prepare("SELECT appid, app_secret, brand_name, custom_domain, page FROM channel_apps WHERE customer_id=1 AND channel_type='mini'").get();
  assert.equal(row3.appid, 'wxself_t1', '未传 selfAppid 时保留原 appid');
  assert.equal(readSecret(row3.app_secret), 'S_T1', '未传 appSecret 时保留原值');
  assert.equal(row3.brand_name, '品牌B');
  assert.equal(row3.custom_domain, '');
  assert.equal(row3.page, '');

  // 前端回显的是脱敏占位符；把它原样提交回来不得把密钥擦成空（对齐菜鸟云表单体验）
  const put4 = await request(app).put('/api/customer/channels/mini').set(headers)
    .send({ brandName: '品牌C', appSecret: 'S_T1****', uploadKey: 'KEY_T1' });
  assert.equal(put4.status, 200);
  const row4 = db.prepare("SELECT app_secret, upload_key FROM channel_apps WHERE customer_id=1 AND channel_type='mini'").get();
  assert.equal(readSecret(row4.app_secret), 'S_T1', '提交脱敏占位符不得覆盖真实密钥');
  assert.equal(readSecret(row4.upload_key), 'KEY_T1', '提交原值不得破坏 upload_key');
});

// —— 自运营上传分支：路由接线验证（未配置工程目录时返回明确错误，不触网） ——
test('自运营上传：未配置 MP_CI_PROJECT_DIR 时返回明确错误', async () => {
  const adm = db.prepare('SELECT * FROM users WHERE username = ?').get('chan_adm1');
  const headers = { Authorization: `Bearer ${issueToken(adm)}` };
  const res = await request(app).post('/api/customer/channels/mini/upload').set(headers)
    .send({ userVersion: '1.0.1', userDesc: 't' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /MP_CI_PROJECT_DIR/);
});

// —— /init 渠道初始化：自运营租户也要能拿到渠道数据（此前只服务授权态 → 自运营 403 丢数据） ——
test('/init 自运营渠道：返回 configured + customerId + 品牌配置', async () => {
  const res = await request(app).get('/api/channel/init').query({ appid: 'wxself001' });
  assert.equal(res.status, 200);
  assert.equal(res.body.configured, true);
  assert.equal(res.body.customerId, 2);
  assert.ok(res.body.primaryColor, '应带回主色（自运营行同样可配品牌）');
  // 第20轮三层身份：个人入驻双模随渠道初始化下发；无设置行=默认 code（保守不改变存量行为）
  assert.equal(res.body.individualJoinMode, 'code');
});

// —— 第20轮：租户后台切 purchase 模式后，C 端冷启动即可拿到（购买引导的唯一依据） ——
test('/init purchase 模式：individualJoinMode 随渠道下发', async () => {
  db.prepare(`INSERT INTO card_market_settings (customer_id, individual_join_mode) VALUES (2, 'purchase')
    ON CONFLICT(customer_id) DO UPDATE SET individual_join_mode = 'purchase'`).run();
  const res = await request(app).get('/api/channel/init').query({ appid: 'wxself001' });
  assert.equal(res.status, 200);
  assert.equal(res.body.individualJoinMode, 'purchase');
  // 还原，避免影响同文件后续用例
  db.prepare("UPDATE card_market_settings SET individual_join_mode = 'code' WHERE customer_id = 2").run();
});

// —— /init 未知 appid（平台自有小程序/未配置）：200 + configured:false，不制造红字错误 ——
test('/init 未知 appid：200 configured:false（替代 403/404，避免控制台红字）', async () => {
  const res = await request(app).get('/api/channel/init').query({ appid: 'wx_unknown_999' });
  assert.equal(res.status, 200);
  assert.equal(res.body.configured, false);
  assert.equal(res.body.customerId, 0);
});
