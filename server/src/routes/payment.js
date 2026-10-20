/**
 * 支付API路由
 * 双层支付架构：平台级支付 + 租户级支付
 * 支持两种认证：JWT token（租户/平台管理员）和 card_token（智能名片个人用户）
 */
import { Router } from 'express';
import { PaymentService } from '../services/payment.js';
import { addOperationLog } from '../db.js';
import { applySubscription, applySolutionSubscription } from '../services/billing.js';
import {
  readPlatformPaymentConfig, readPlatformPaymentConfigMasked, writePlatformPaymentConfig,
  readTenantPaymentConfig, readTenantPaymentConfigMasked, writeTenantPaymentConfig,
} from '../services/paymentConfig.js';

export function createPaymentRouter(db) {
  const router = Router();
  const payment = new PaymentService(db);

  // ============================================================
  // 统一下单
  // ============================================================
  router.post('/create', async (req, res) => {
    try {
      const { payerType, customerId, userId, identityType, solution, productType, productId, productName, amount, channel, remark } = req.body;

      if (!amount || amount <= 0) return res.status(400).json({ error: '金额不能为空' });
      if (!productName) return res.status(400).json({ error: '产品名称不能为空' });

      // 平台级支付需要租户管理员权限
      if (payerType === 'platform') {
        if (!req.user || !['admin', 'operator', 'tenant_admin'].includes(req.user.role)) {
          return res.status(403).json({ error: '无权操作' });
        }
      }

      const order = payment.createOrder({
        payerType: payerType || 'tenant',
        customerId: customerId || req.user?.customerId || 0,
        userId: userId || req.user?.id || 0,
        identityType: identityType || '',
        solution: solution || '',
        productType: productType || '',
        productId: productId || '',
        productName,
        amount,
        channel: channel || 'wechat',
        remark: remark || '',
      });

      const payParams = await payment.createPayment(order);
      addOperationLog(db, {
        userId: req.user?.uid ?? req.user?.id ?? null,
        username: req.user?.username ?? req.user?.phone ?? 'api-user',
        action: 'create_order', targetType: 'order', targetId: order.id,
        detail: `创建支付订单 #${order.order_no} ${productName} ¥${amount}（${channel}）`, ip: req.ip,
      });
      res.json({ order, payParams });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ============================================================
  // 预下单：按订单号换小程序调起支付参数
  // ============================================================
  // 为什么与 /create 分开：C 端各入口（会员卡/模板/商城）已经先建了业务单+支付单，
  // 拿到 orderNo 后才来换参数。/create 是「建单+换参数」一体，两者用途不同。
  router.post('/prepay', async (req, res) => {
    try {
      const { orderNo } = req.body || {};
      if (!orderNo) return res.status(400).json({ error: '订单号不能为空' });
      const order = payment.getOrderByNo(orderNo);
      if (!order) return res.status(404).json({ error: '订单不存在' });

      // 🔴 订单归属校验：不能只凭 orderNo 就替人付款（否则知道别人的单号
      // 就能拿到他的 prepay_id，替他进入支付流程）。
      if (req.user?.id && order.userId && Number(order.userId) !== Number(req.user.id)) {
        return res.status(403).json({ error: '无权操作该订单' });
      }
      if (order.status === 'paid') return res.status(400).json({ error: '订单已支付' });

      const resolved = payment.resolveConfig(order.payerType, order.customerId, order.payChannel);
      if (!resolved.config?.enabled) return res.status(400).json({ error: '该支付渠道暂未启用' });

      const result = await payment.prepay(order, resolved);
      res.json({ orderNo: order.orderNo, amount: order.amount, payMode: resolved.mode, ...result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ============================================================
  // 模拟支付成功（仅未配置真实支付时可用）
  // ============================================================
  router.post('/mock-pay', async (req, res) => {
    const { orderNo } = req.body;
    if (!orderNo) return res.status(400).json({ error: '订单号不能为空' });

    // 🔴 一旦配置了真实商户号，必须关闭 mock 支付：
    //    否则任何人调 /mock-pay 就能把订单标记成「已支付」，
    //    白嫖会员/模板/商品——这是最典型的支付接入漏洞。
    //    注意用**明文**配置判定（readTenantPaymentConfig），
    //    脱敏后的 mchId 会被 maskSecretValue 改成 ****abcd 形态而不匹配 /^mock/i。
    const candidates = [readPlatformPaymentConfig(db).wechat];
    if (req.user?.customerId) candidates.push(readTenantPaymentConfig(db, req.user.customerId).wechat);
    const hasRealMch = candidates.some((c) => c?.mchId && !/^mock/i.test(String(c.mchId).trim()));
    if (hasRealMch) {
      return res.status(403).json({ error: '已配置真实微信支付，模拟支付已关闭' });
    }

    const order = payment.markPaid(orderNo, 'MOCK_' + Date.now());
    if (!order) return res.status(404).json({ error: '订单不存在' });

    // 订阅订单：支付成功后自动开通/续期（方案订单走方案体系，套餐订单走旧套餐体系）
    let subscription = null;
    if (order.productType === 'subscription' || order.productType === 'subscription_renew' || order.productType === 'subscription_upgrade') {
      try {
        subscription = order.solution ? applySolutionSubscription(db, order) : applySubscription(db, order);
      } catch (e) {
        console.error('[billing] 订阅开通失败', e?.message || e);
      }
    }

    res.json({ order, subscription, message: '模拟支付成功' });
  });

  // ============================================================
  // 支付回调（真实支付回调入口）
  // ============================================================
  // 🔴 这是全局最敏感的接口：它决定「订单是否已支付、权益是否发放」。
  //    原实现没有任何验签，直接从 body 取 orderNo 就 markPaid ——
  //    等于任何人都能 POST 别人的订单号，把订单伪造成已支付（免费开通会员/领模板）。
  //
  // 微信 v3 正确流程：
  //   ① 用**平台证书公钥**验 Wechatpay-Signature（验签串 timestamp\nnonce\nrawBody\n）
  //   ② 用 APIv3 密钥解密 resource（AES-256-GCM）
  //   ③ 校验金额与商户号一致（否则改金额的回调能把 1 分订单标记成 100 元已付）
  //   ④ 幂等：markPaid 内部对 status='paid' 直接返回
  router.post('/notify/:channel', async (req, res) => {
    const { channel } = req.params;
    try {
      if (channel !== 'wechat') {
        // 支付宝未接入：明确拒绝而不是「解析 body 就当成功」
        return res.status(501).json({ code: 'FAIL', message: '该渠道回调尚未接入' });
      }

      // —— ① 验签 ——
      const clientRes = payment.getWechatClient({ config: readPlatformPaymentConfig(db).wechat });
      if (!clientRes.ok) {
        console.error('[pay-notify] 验签不可用：', clientRes.error || clientRes.missing);
        return res.status(500).json({ code: 'FAIL', message: '支付回调验签未配置' });
      }
      const rawBody = req.rawBody || '';
      const verify = clientRes.client.verifyCallback(req.headers, rawBody);
      if (!verify.ok) {
        // 平台证书轮换期可能手上证书已过期 → 把原因与关键上下文记进日志，便于运维定位
        console.error('[pay-notify] 回调验签失败：', verify.reason,
          `serial=${verify.serial || ''} rawBodyLen=${rawBody.length} hasPlatformCert=${!!clientRes.cfg?.platformCertPem}`);
        return res.status(401).json({ code: 'FAIL', message: '签名验证失败' });
      }

      // —— ② 解密 ——
      let data;
      try {
        data = clientRes.client.decryptResource(req.body.resource);
      } catch (e) {
        console.error('[pay-notify] 回调解密失败：', e.message);
        return res.status(400).json({ code: 'FAIL', message: '解密失败' });
      }

      // —— ③ 校验金额与商户 ——
      if (data.trade_state !== 'SUCCESS') {
        // 非成功终态：微信要求仍返回 SUCCESS，否则会持续重试
        return res.json({ code: 'SUCCESS', message: '成功' });
      }
      const order = payment.getOrderByNo(data.out_trade_no);
      if (!order) {
        console.error('[pay-notify] 回调订单不存在：', data.out_trade_no);
        return res.status(404).json({ code: 'FAIL', message: '订单不存在' });
      }
      if (Number(order.amount) !== Number(data.amount?.total)) {
        console.error('[pay-notify] 金额不一致：订单', order.amount, '回调', data.amount?.total);
        return res.status(400).json({ code: 'FAIL', message: '金额不一致' });
      }
      if (clientRes.cfg.mchId && data.mchid && data.mchid !== clientRes.cfg.mchId) {
        console.error('[pay-notify] 商户号不一致：', data.mchid);
        return res.status(400).json({ code: 'FAIL', message: '商户号不一致' });
      }

      // —— ④ 标记已支付并发放权益 ——
      const paid = payment.markPaid(order.orderNo, data.transaction_id || '');
      if (paid && ['subscription', 'subscription_renew', 'subscription_upgrade'].includes(paid.productType)) {
        try {
          if (paid.solution) applySolutionSubscription(db, paid);
          else applySubscription(db, paid);
        } catch (e) { console.error('[billing] 订阅开通失败', e?.message || e); }
      }
      addOperationLog(db, {
        userId: paid?.userId ?? null, username: 'wechat-pay',
        action: 'payment_notify', targetType: 'order', targetId: paid?.id ?? null,
        detail: `微信支付回调成功 ${order.orderNo} ¥${(Number(order.amount) / 100).toFixed(2)}`, ip: req.ip,
      });
      res.json({ code: 'SUCCESS', message: '成功' });
    } catch (e) {
      console.error('[pay-notify] 处理异常：', e?.message || e);
      res.status(500).json({ code: 'FAIL', message: '处理失败' });
    }
  });

  // ============================================================
  // 订单查询
  // ============================================================
  router.get('/orders/:orderNo', (req, res) => {
    const order = payment.getOrderByNo(req.params.orderNo);
    if (!order) return res.status(404).json({ error: '订单不存在' });
    res.json({ order });
  });

  // ============================================================
  // 我的订单列表（个人用户）
  // ============================================================
  router.get('/my-orders', (req, res) => {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;
    const orders = db.prepare(`
      SELECT * FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(req.user.id, Number(pageSize), offset);
    const total = db.prepare('SELECT COUNT(*) as c FROM payment_orders WHERE user_id = ?').get(req.user.id).c;
    res.json({ orders: orders.map(payment.toOrder), total, page: Number(page), pageSize: Number(pageSize) });
  });

  // ============================================================
  // 租户订单列表（租户管理员）
  // ============================================================
  router.get('/tenant-orders', (req, res) => {
    if (!req.user || !req.user.customerId) return res.status(403).json({ error: '无权访问' });
    const { page = 1, pageSize = 20, status, payerType } = req.query;
    const offset = (page - 1) * pageSize;
    let sql = 'SELECT * FROM payment_orders WHERE customer_id = ?';
    const params = [req.user.customerId];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (payerType) { sql += ' AND payer_type = ?'; params.push(payerType); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), offset);
    const orders = db.prepare(sql).all(...params);
    const total = db.prepare('SELECT COUNT(*) as c FROM payment_orders WHERE customer_id = ?').get(req.user.customerId).c;
    res.json({ orders: orders.map(payment.toOrder), total, page: Number(page), pageSize: Number(pageSize) });
  });

  // ============================================================
  // 租户支付配置
  // ============================================================
  router.get('/tenant-config', (req, res) => {
    if (!req.user || !req.user.customerId) return res.status(403).json({ error: '无权访问' });
    // 🔴 脱敏回显：租户管理员看得到「已配置」，拿不到明文密钥
    res.json({ config: readTenantPaymentConfigMasked(db, req.user.customerId) });
  });

  router.put('/tenant-config', (req, res) => {
    if (!req.user || !req.user.customerId) return res.status(403).json({ error: '无权访问' });
    if (req.user.role !== 'tenant_admin') return res.status(403).json({ error: '仅管理员可操作' });

    const { mode, wechat, alipay, platformFeeRate, settlementCycle } = req.body;
    // 落库前加密密钥字段，且「留空/脱敏占位符 = 不修改」（writeTenantPaymentConfig 内部处理）
    const config = writeTenantPaymentConfig(db, req.user.customerId, {
      mode: mode || 'platform',
      wechat: wechat || { enabled: false },
      alipay: alipay || { enabled: false },
      platformFeeRate: platformFeeRate || 0,
      settlementCycle: settlementCycle || 'T+7',
    });
    res.json({ config });
  });

  // ============================================================
  // 平台支付配置（总后台）
  // ============================================================
  router.get('/platform-config', (req, res) => {
    if (!req.user || !['admin', 'operator'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权访问' });
    }
    const config = readPlatformPaymentConfigMasked(db);
    res.json({ config });
  });

  router.put('/platform-config', (req, res) => {
    if (!req.user || !['admin', 'operator'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权访问' });
    }
    const { wechat, alipay } = req.body;
    // 🔴 落库前加密（此前是明文直写 settings.payment——一旦按菜鸟云形态把
    //    APIv3 密钥/私钥填进后台，这就是可直接扣款的凭据裸奔在数据库里）
    const prevRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('payment');
    writePlatformPaymentConfig(db, { wechat, alipay }, prevRow?.value);
    res.json({ config: readPlatformPaymentConfigMasked(db) });
  });

  // ============================================================
  // 平台订单统计（总后台）
  // ============================================================
  router.get('/platform-stats', (req, res) => {
    if (!req.user || !['admin', 'operator'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权访问' });
    }
    const totalOrders = db.prepare("SELECT COUNT(*) as c FROM payment_orders").get().c;
    const paidOrders = db.prepare("SELECT COUNT(*) as c FROM payment_orders WHERE status = 'paid'").get().c;
    const totalAmount = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM payment_orders WHERE status = 'paid'").get().s;
    const platformFee = db.prepare("SELECT COALESCE(SUM(platform_fee),0) as s FROM payment_orders WHERE status = 'paid' AND payer_type = 'tenant' AND pay_mode = 'platform'").get().s;
    const tenantAmount = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM payment_orders WHERE status = 'paid' AND payer_type = 'tenant'").get().s;
    const platformAmount = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM payment_orders WHERE status = 'paid' AND payer_type = 'platform'").get().s;
    res.json({ totalOrders, paidOrders, totalAmount, platformFee, tenantAmount, platformAmount });
  });

  // ============================================================
  // 结算管理（总后台）
  // ============================================================
  router.get('/settlements', (req, res) => {
    if (!req.user || !['admin', 'operator'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权访问' });
    }
    const { page = 1, pageSize = 20, status, customerId } = req.query;
    const offset = (page - 1) * pageSize;
    let sql = 'SELECT * FROM settlement_records WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (customerId) { sql += ' AND customer_id = ?'; params.push(Number(customerId)); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), offset);
    const settlements = db.prepare(sql).all(...params);
    const total = db.prepare('SELECT COUNT(*) as c FROM settlement_records').get().c;
    res.json({ settlements, total, page: Number(page), pageSize: Number(pageSize) });
  });

  router.post('/settlements/:id/confirm', (req, res) => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: '仅超级管理员可操作' });
    }
    const settlement = payment.confirmSettlement(Number(req.params.id));
    res.json({ settlement });
  });

  return router;
}
