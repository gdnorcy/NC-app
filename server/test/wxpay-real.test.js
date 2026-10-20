/**
 * 微信支付真实接入专项测试
 * ============================================================================
 * 覆盖四类此前完全缺失、且直接关系资金安全的逻辑：
 *   ① 配置分层：后台填密钥（落库密文）→ 读取解密可用；MOCK 占位被识别
 *   ② 金额单位：payment_orders.amount 是「分」，下单不得二次乘 100
 *   ③ 回调安全：无验签 / 验签失败 / 金额不符 一律不得标记已支付
 *   ④ mock-pay 门禁：配置真实商户号后必须 403（否则可白嫖）
 *
 * 所有微信接口用全局 fetch mock，不触网；证书用测试时现场生成的 RSA 密钥对。
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { issueToken } from '../src/auth.js';
import { hashPassword } from '../src/db.js';
import { PaymentService } from '../src/services/payment.js';
import { readPlatformPaymentConfig } from '../src/services/paymentConfig.js';
import { encryptSecret } from '../src/crypto.js';

const TENANT = 77801;

describe('微信支付真实接入', () => {
  let db, app, payment, tenantAdminToken, userToken, userId;
  const DB_PATH = path.join(os.tmpdir(), `wxpay-test-${Date.now()}.db`);
  let merchantKeys, platformKeys, apiV3Key;
  const tmpFiles = [];
  const tmpPath = (name) => {
    const p = path.join(os.tmpdir(), `wxpay-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
    tmpFiles.push(p);
    return p;
  };

  before(() => {
    db = createDb(DB_PATH);
    app = createApp({ db });
    payment = new PaymentService(db);

    // —— 现场生成 RSA 密钥对 + 自签 X.509 证书（代替真实商户/平台证书） ——
    // 必须用真证书：serialFromCertPem 走 crypto.X509Certificate 解析，
    // 光给公钥 PEM 会报 "PEM routines::no start line"。
    // 一律走「写文件 → 读文件」，不用 stdin/stdout 传 PEM：
    // openssl 会把密钥生成进度、Signature ok 等信息混进输出流，
    // 经 stdin/stdout 传递时会污染 PEM 头导致 "no start line"。
    const opensslToFile = (args, outPath) => {
      execFileSync('openssl', [...args, '-out', outPath], { stdio: ['ignore', 'ignore', 'pipe'] });
      return fs.readFileSync(outPath, 'utf8');
    };
    const genPair = (cn, serial) => {
      const keyPath = tmpPath(`${cn}.key`);
      const csrPath = tmpPath(`${cn}.csr`);
      const certPath = tmpPath(`${cn}.crt`);
      opensslToFile(['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048'], keyPath);
      opensslToFile(['req', '-new', '-key', keyPath, '-subj', `/CN=${cn}`], csrPath);
      opensslToFile(['x509', '-req', '-in', csrPath, '-signkey', keyPath,
        '-days', '3650', '-set_serial', String(serial)], certPath);
      return {
        privPem: fs.readFileSync(keyPath, 'utf8'),
        certPem: fs.readFileSync(certPath, 'utf8'),
      };
    };
    merchantKeys = genPair('merchant', 5150);
    platformKeys = genPair('platform', 6270);
    apiV3Key = '0123456789abcdef0123456789abcdef'; // 32 字节

    // 租户 + 管理员
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status) VALUES (?, '支付测试租户', 'active')").run(TENANT);
    const { hash, salt } = hashPassword('Test@123');
    db.prepare("INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)")
      .run('payadm', '13800007781', hash, salt, 'tenant_admin', 'active', TENANT);
    const adm = db.prepare("SELECT * FROM users WHERE username='payadm'").get();
    tenantAdminToken = issueToken(adm);

    // C 端用户（真实 openid，用于 JSAPI 下单）
    db.prepare("INSERT INTO platform_user (id, openid, nickname, identity_type, customer_id) VALUES (?,?,?,?,?)")
      .run(4001, 'REAL_OPENID_x', '支付测试用户', 'individual', TENANT);
    userId = 4001;
    const cu = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(userId);
    userToken = Buffer.from(JSON.stringify({ uid: userId })).toString('base64');

    // 平台支付配置：密钥字段以**密文**形态落库（模拟后台已配置）
    const cfg = {
      wechat: {
        enabled: true,
        mchId: '1900000109',
        appid: 'wxrealappid001',
        apiV3Key: encryptSecret(apiV3Key),
        privateKey: encryptSecret(merchantKeys.privPem),
        // cert 必须是 X.509 证书（serialFromCertPem 靠它算 serial_no），
        // 不是公钥 PEM —— 填错会报 "PEM routines::no start line"
        cert: encryptSecret(merchantKeys.certPem),
        notifyUrl: 'https://example.com/api/payment/notify/wechat',
        platformCertPem: platformKeys.certPem,
        platformId: 'PLAT_SERIAL_1',
      },
      alipay: { enabled: false },
    };
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('payment', ?, datetime('now'))")
      .run(JSON.stringify(cfg));
  });

  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
    for (const f of tmpFiles) { try { fs.rmSync(f, { force: true }); } catch {} }
  });

  // ============================================================
  // ① 配置分层
  // ============================================================

  test('平台配置：密钥密文落库、读取时解密为可用明文', () => {
    const cfg = readPlatformPaymentConfig(db);
    assert.equal(cfg.wechat.mchId, '1900000109');
    // 关键：不能是 base64 密文，必须是解密后的原文
    assert.equal(cfg.wechat.apiV3Key, apiV3Key, 'apiV3Key 应被解密');
    assert.ok(cfg.wechat.privateKey.includes('PRIVATE KEY'), '私钥应是 PEM 原文');
  });

  test('平台配置：mchId/apiV3Key 非密文可读（回显脱敏由 paymentConfig 负责）', () => {
    const raw = JSON.parse(db.prepare("SELECT value FROM settings WHERE key='payment'").get().value);
    assert.notEqual(raw.wechat.apiV3Key, apiV3Key, '数据库里必须是密文');
    assert.equal(raw.wechat.mchId, '1900000109', 'mchId 非敏感，可明文便于运维排查');
  });

  // ============================================================
  // ② 金额单位
  // ============================================================

  test('下单金额单位是「分」，不得二次乘 100', async () => {
    const order = payment.createOrder({
      payerType: 'tenant', customerId: TENANT, userId,
      solution: 'card', productType: 'member_card', productId: '1',
      productName: '黄金会员', amount: 9900, channel: 'wechat',
    });
    assert.equal(order.amount, 9900);

    // 拦截 fetch，检查发往微信的 amount.total
    let sent = null;
    global.fetch = async (url, opts = {}) => {
      if (String(url).includes('/v3/pay/transactions/jsapi')) {
        sent = JSON.parse(opts.body);
        return { ok: true, status: 200, text: async () => JSON.stringify({ prepay_id: 'PREPAY_X' }) };
      }
      return { ok: true, status: 200, text: async () => '{}' };
    };
    const resolved = payment.resolveConfig('tenant', TENANT, 'wechat');
    const r = await payment.prepay(order, resolved);
    assert.equal(r.mock, false, '配齐真实商户号后不应回落 mock');
    // 9900 分 = 99 元；若被二次乘 100 会变成 990000
    assert.equal(sent.amount.total, 9900, 'amount.total 必须等于订单金额（分）');
    assert.equal(sent.out_trade_no, order.orderNo);
    assert.equal(sent.appid, 'wxrealappid001');
    assert.equal(sent.payer.openid, 'REAL_OPENID_x');
  });

  test('prep 支付参数：5 参数齐全且 appId 一致', async () => {
    const order = payment.createOrder({
      payerType: 'tenant', customerId: TENANT, userId,
      solution: 'card', productType: 'template', productId: '2',
      productName: '模板', amount: 100, channel: 'wechat',
    });
    global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ prepay_id: 'PREPAY_Y' }) });
    const r = await payment.prepay(order, payment.resolveConfig('tenant', TENANT, 'wechat'));
    for (const k of ['timeStamp', 'nonceStr', 'package', 'signType', 'paySign']) {
      assert.ok(r.payParams[k], `payParams.${k} 不应为空`);
    }
    assert.equal(r.payParams.signType, 'RSA');
    assert.equal(r.payParams.package, 'prepay_id=PREPAY_Y');
    assert.equal(r.payParams.appId, 'wxrealappid001', 'appId 需回传，前端 requestPayment 要求');
  });

  test('无真实 openid 时报错而非静默 mock', async () => {
    db.prepare("INSERT INTO platform_user (id, openid, nickname, identity_type, customer_id) VALUES (?,?,?,?,?)")
      .run(4002, 'mock_fake_code', '未真实登录用户', 'individual', TENANT);
    const order = payment.createOrder({
      payerType: 'tenant', customerId: TENANT, userId: 4002,
      solution: 'card', productType: 'template', productId: '3',
      productName: '模板', amount: 100, channel: 'wechat',
    });
    await assert.rejects(
      () => payment.prepay(order, payment.resolveConfig('tenant', TENANT, 'wechat')),
      /openid/,
      'mock_ 前缀 openid 必须报错，不能当成能付款的真实用户',
    );
  });

  // ============================================================
  // ③ 回调安全（最关键）
  // ============================================================

  function makeNotifyBody({ outTradeNo, total, tradeState = 'SUCCESS' }) {
    const resource = {
      algorithm: 'AEAD_AES_256_GCM',
      nonce: 'NONCE12',
      associated_data: 'transaction',
      ciphertext: '',
    };
    const plain = JSON.stringify({
      mchid: '1900000109', appid: 'wxrealappid001', out_trade_no: outTradeNo,
      transaction_id: 'WX_TXN_001', trade_state: tradeState, amount: { total },
    });
    // AES-256-GCM 加密：密文末尾追加 16 字节 authTag（与微信格式一致）
    const key = Buffer.from(apiV3Key, 'utf8');
    const c = crypto.createCipheriv('aes-256-gcm', key, Buffer.from(resource.nonce, 'utf8'));
    c.setAAD(Buffer.from(resource.associated_data, 'utf8'));
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    resource.ciphertext = Buffer.concat([ct, c.getAuthTag()]).toString('base64');
    return {
      id: 'EVT_1', event_type: 'TRANSACTION.SUCCESS', resource_type: 'encrypt-resource',
      resource,
    };
  }

  function signHeaders(rawBody) {
    const ts = '1700000000';
    const nonce = 'NONCESIGN';
    const signStr = `${ts}\n${nonce}\n${rawBody}\n`;
    const sig = crypto.createSign('RSA-SHA256').update(signStr, 'utf8')
      .sign(platformKeys.privPem, 'base64');
    return {
      'wechatpay-timestamp': ts,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': sig,
      'wechatpay-serial': 'PLAT_SERIAL_1',
    };
  }

  /** 签名并发送（保证签名原文 === 实际发送字节） */
  const postSigned = (bodyObj) => postNotify(bodyObj, signHeaders(JSON.stringify(bodyObj)));

  /**
   * 以**精确字节**发送回调并附带正确签名。
   * 必须用 raw string 而不是 .send(obj)：supertest 传对象时会自己 JSON.stringify，
   * 键顺序/缩进与签名时的原文不一致 → 真实微信绝不会出现这种报文，
   * 但测试会出现，导致「明明验签实现正确却失败」的误判。
   */
  const postNotify = (bodyObj, headers) => {
    const raw = JSON.stringify(bodyObj);
    return request(app).post('/api/payment/notify/wechat')
      .set({ 'Content-Type': 'application/json', ...(headers || {}) })
      .send(raw);
  };

  test('回调无签名头 → 401 且订单不得变已支付', async () => {
    const order = payment.createOrder({
      payerType: 'tenant', customerId: TENANT, userId,
      solution: 'card', productType: 'template', productId: '9',
      productName: '订单', amount: 100, channel: 'wechat',
    });
    const res = await request(app).post('/api/payment/notify/wechat').send(makeNotifyBody({ outTradeNo: order.orderNo, total: 100 }));
    assert.equal(res.status, 401);
    assert.equal(payment.getOrderByNo(order.orderNo).status, 'pending', '验签失败绝不能改订单状态');
  });

  test('回调签名被篡改 → 401 且订单不变', async () => {
    const order = payment.createOrder({
      payerType: 'tenant', customerId: TENANT, userId,
      solution: 'card', productType: 'template', productId: '10',
      productName: '订单', amount: 100, channel: 'wechat',
    });
    const body = makeNotifyBody({ outTradeNo: order.orderNo, total: 100 });
    const headers = signHeaders(JSON.stringify(body));
    headers['wechatpay-signature'] = 'ZmFrZS1zaWduYXR1cmUtbm90LXZhbGlk';
    const res = await postNotify(body, headers);
    assert.equal(res.status, 401);
    assert.equal(payment.getOrderByNo(order.orderNo).status, 'pending');
  });

  test('回调验签通过 + 金额一致 → 标记已支付', async () => {
    const order = payment.createOrder({
      payerType: 'tenant', customerId: TENANT, userId,
      solution: 'card', productType: 'template', productId: '11',
      productName: '订单', amount: 100, channel: 'wechat',
    });
    const res = await postSigned(makeNotifyBody({ outTradeNo: order.orderNo, total: 100 }));
    assert.equal(res.status, 200, `诊断: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.code, 'SUCCESS');
    const paid = payment.getOrderByNo(order.orderNo);
    assert.equal(paid.status, 'paid');
    assert.equal(paid.transactionId, 'WX_TXN_001');
  });

  test('回调金额被篡改（回调 1 分、订单 100 元）→ 拒绝', async () => {
    const order = payment.createOrder({
      payerType: 'tenant', customerId: TENANT, userId,
      solution: 'card', productType: 'template', productId: '12',
      productName: '订单', amount: 10000, channel: 'wechat',
    });
    const res = await postSigned(makeNotifyBody({ outTradeNo: order.orderNo, total: 1 }));
    assert.equal(res.status, 400, '金额不一致必须拒绝');
    assert.equal(payment.getOrderByNo(order.orderNo).status, 'pending');
  });

  test('回调订单不存在 → 404', async () => {
    const res = await postSigned(makeNotifyBody({ outTradeNo: 'PAY_NOT_EXIST_XX', total: 100 }));
    assert.equal(res.status, 404);
  });

  test('回调 trade_state 非 SUCCESS → 返回 SUCCESS 但不改订单', async () => {
    const order = payment.createOrder({
      payerType: 'tenant', customerId: TENANT, userId,
      solution: 'card', productType: 'template', productId: '13',
      productName: '订单', amount: 100, channel: 'wechat',
    });
    const res = await postSigned(makeNotifyBody({ outTradeNo: order.orderNo, total: 100, tradeState: 'USERPAYING' }));
    assert.equal(res.status, 200);
    assert.equal(payment.getOrderByNo(order.orderNo).status, 'pending');
  });

  test('支付宝回调未接入 → 501（不再「解析 body 就当成功」）', async () => {
    const res = await request(app).post('/api/payment/notify/alipay').send({ out_trade_no: 'X' });
    assert.equal(res.status, 501);
  });

  // ============================================================
  // ④ mock-pay 门禁 + prepay 归属校验
  // ============================================================

  test('已配置真实商户号 → /mock-pay 必须 403', async () => {
    const order = payment.createOrder({
      payerType: 'tenant', customerId: TENANT, userId,
      solution: 'card', productType: 'template', productId: '14',
      productName: '订单', amount: 100, channel: 'wechat',
    });
    const res = await request(app).post('/api/payment/mock-pay')
      .set('Authorization', `Bearer ${userToken}`).send({ orderNo: order.orderNo });
    assert.equal(res.status, 403, '真实商户号下 mock 支付必须关闭，否则可白嫖');
    assert.equal(payment.getOrderByNo(order.orderNo).status, 'pending');
  });

  test('/prepay 校验订单归属：他人订单 403', async () => {
    db.prepare("INSERT INTO platform_user (id, openid, nickname, identity_type, customer_id) VALUES (?,?,?,?,?)")
      .run(4003, 'REAL_OPENID_y', '另一个用户', 'individual', TENANT);
    const order = payment.createOrder({
      payerType: 'tenant', customerId: TENANT, userId: 4003,
      solution: 'card', productType: 'template', productId: '15',
      productName: '订单', amount: 100, channel: 'wechat',
    });
    const res = await request(app).post('/api/payment/prepay')
      .set('Authorization', `Bearer ${userToken}`).send({ orderNo: order.orderNo });
    assert.equal(res.status, 403, '不能替别人下单付款');
  });

  test('/prepay 本人订单 → 返回可用支付参数', async () => {
    global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ prepay_id: 'PREPAY_Z' }) });
    const order = payment.createOrder({
      payerType: 'tenant', customerId: TENANT, userId,
      solution: 'card', productType: 'template', productId: '16',
      productName: '订单', amount: 100, channel: 'wechat',
    });
    const res = await request(app).post('/api/payment/prepay')
      .set('Authorization', `Bearer ${userToken}`).send({ orderNo: order.orderNo });
    assert.equal(res.status, 200);
    assert.equal(res.body.mock, false);
    assert.equal(res.body.payParams.package, 'prepay_id=PREPAY_Z');
    assert.equal(res.body.payParams.appId, 'wxrealappid001');
  });

  test('/prepay 已支付订单 → 400', async () => {
    const order = payment.createOrder({
      payerType: 'tenant', customerId: TENANT, userId,
      solution: 'card', productType: 'template', productId: '17',
      productName: '订单', amount: 100, channel: 'wechat',
    });
    payment.markPaid(order.orderNo, 'TX');
    const res = await request(app).post('/api/payment/prepay')
      .set('Authorization', `Bearer ${userToken}`).send({ orderNo: order.orderNo });
    assert.equal(res.status, 400);
  });

  test('租户支付配置 GET 脱敏：密钥不可见、hasXxx 可见', async () => {
    db.prepare("INSERT OR IGNORE INTO projects (id, config) VALUES (?, '{}')").run(TENANT);
    const put = await request(app).put('/api/payment/tenant-config')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ mode: 'independent', wechat: { enabled: true, mchId: '1900000999', apiV3Key: 'tenant_secret_32_bytes_long_xxxxxx' } });
    assert.equal(put.status, 200);
    const got = await request(app).get('/api/payment/tenant-config')
      .set('Authorization', `Bearer ${tenantAdminToken}`);
    assert.equal(got.status, 200);
    const w = got.body.config.wechat;
    assert.equal(w.mchId, '1900000999', '非敏感字段正常返回');
    assert.ok(String(w.apiV3Key).includes('****'), '密钥必须脱敏');
    assert.notEqual(w.apiV3Key, 'tenant_secret_32_bytes_long_xxxxxx');
    assert.equal(w.hasApiV3Key, true, '需告知后台「已配置」');
  });

  test('租户支付配置：提交脱敏占位符不得覆盖真实密钥', async () => {
    const got = await request(app).get('/api/payment/tenant-config')
      .set('Authorization', `Bearer ${tenantAdminToken}`);
    const masked = got.body.config.wechat.apiV3Key;
    await request(app).put('/api/payment/tenant-config')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ wechat: { apiV3Key: masked } });
    const raw = JSON.parse(db.prepare('SELECT config FROM projects WHERE id=?').get(TENANT).config);
    const { readSecret } = await import('../src/crypto.js');
    assert.equal(readSecret(raw.payment.wechat.apiV3Key), 'tenant_secret_32_bytes_long_xxxxxx',
      '占位符提交不得把密钥擦成占位符本身');
  });
});
