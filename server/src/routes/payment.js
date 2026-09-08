/**
 * 支付API路由
 * 双层支付架构：平台级支付 + 租户级支付
 * 支持两种认证：JWT token（租户/平台管理员）和 card_token（智能名片个人用户）
 */
import { Router } from 'express';
import { PaymentService } from '../services/payment.js';
import { addOperationLog } from '../db.js';
import { applySubscription, applySolutionSubscription } from '../services/billing.js';

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
  // 模拟支付成功（开发环境用，接入真实支付后删除）
  // ============================================================
  router.post('/mock-pay', (req, res) => {
    const { orderNo } = req.body;
    if (!orderNo) return res.status(400).json({ error: '订单号不能为空' });

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
  router.post('/notify/:channel', (req, res) => {
    try {
      const { channel } = req.params;
      // TODO: 验证签名、解析回调数据
      // 微信支付回调：req.body.resource.ciphertext 解密
      // 支付宝回调：req.body

      // mock处理：从body中取订单号
      const orderNo = req.body?.orderNo || req.body?.out_trade_no;
      if (orderNo) {
        const order = payment.markPaid(orderNo, req.body?.transaction_id || '');
        if (order && (order.productType === 'subscription' || order.productType === 'subscription_renew' || order.productType === 'subscription_upgrade')) {
          try {
            if (order.solution) applySolutionSubscription(db, order);
            else applySubscription(db, order);
          } catch (e) { console.error('[billing] 订阅开通失败', e?.message || e); }
        }
      }

      if (channel === 'wechat') {
        res.json({ code: 'SUCCESS', message: '成功' });
      } else {
        res.send('success');
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
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
    const config = payment.getTenantConfig(req.user.customerId);
    res.json({ config });
  });

  router.put('/tenant-config', (req, res) => {
    if (!req.user || !req.user.customerId) return res.status(403).json({ error: '无权访问' });
    if (req.user.role !== 'tenant_admin') return res.status(403).json({ error: '仅管理员可操作' });

    const { mode, wechat, alipay, platformFeeRate, settlementCycle } = req.body;
    const row = db.prepare('SELECT config FROM projects WHERE id = ?').get(req.user.customerId);
    const config = row ? JSON.parse(row.config || '{}') : {};
    config.payment = {
      mode: mode || 'platform',
      wechat: wechat || { enabled: false },
      alipay: alipay || { enabled: false },
      platformFeeRate: platformFeeRate || 0,
      settlementCycle: settlementCycle || 'T+7',
    };
    db.prepare("UPDATE projects SET config = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(config), req.user.customerId);
    res.json({ config: config.payment });
  });

  // ============================================================
  // 平台支付配置（总后台）
  // ============================================================
  router.get('/platform-config', (req, res) => {
    if (!req.user || !['admin', 'operator'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权访问' });
    }
    const config = payment.getPlatformConfig();
    res.json({ config });
  });

  router.put('/platform-config', (req, res) => {
    if (!req.user || !['admin', 'operator'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权访问' });
    }
    const { wechat, alipay } = req.body;
    const config = {
      wechat: wechat || { enabled: false },
      alipay: alipay || { enabled: false },
    };
    const exists = db.prepare('SELECT key FROM settings WHERE key = ?').get('payment');
    if (exists) {
      db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?").run(JSON.stringify(config), 'payment');
    } else {
      db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('payment', ?, datetime('now'))").run(JSON.stringify(config));
    }
    res.json({ config });
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
