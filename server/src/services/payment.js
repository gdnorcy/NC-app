/**
 * 支付服务层
 * 支持双层支付架构：
 * - 平台级支付：租户向平台付费（订阅费、开通费等）
 * - 租户级支付：租户的客户向租户付费（智能名片会员等）
 *   - 自主接入模式：使用租户自己的商户号
 *   - 借用平台模式：使用平台商户号代收，扣除手续费后结算
 */
import { randomBytes } from 'node:crypto';
import { createDistributionService } from './distribution.js';
import { createMemberService } from './member.js';
import { createGoodsOrderService } from './goodsOrder.js';
import { readPlatformPaymentConfig, readTenantPaymentConfig } from './paymentConfig.js';
import { buildClientConfig, createClientFromConfig } from './wechatpay.js';
import { grantMarketSubjectByPurchase } from './marketSubject.js';

export class PaymentService {
  constructor(db) {
    this.db = db;
    this.distribution = createDistributionService(db);
    this.member = createMemberService(db);
    this.goodsOrder = createGoodsOrderService(db);
  }

  // ============================================================
  // 配置管理
  // ============================================================

  /**
   * 获取平台支付配置（明文）。
   * 🔴 密钥字段（apiV3Key/privateKey）落库是密文，必须经 paymentConfig 解密，
   *    直接 JSON.parse 出来的是密文，会导致签名/解密静默失败。
   */
  getPlatformConfig() {
    try {
      return readPlatformPaymentConfig(this.db);
    } catch {
      return { wechat: { enabled: false }, alipay: { enabled: false } };
    }
  }

  /** 获取租户支付配置（明文） */
  getTenantConfig(customerId) {
    try {
      return readTenantPaymentConfig(this.db, customerId);
    } catch {
      return { mode: 'platform', wechat: { enabled: false }, alipay: { enabled: false } };
    }
  }

  /**
   * 获取实际使用的支付配置
   * @param payerType platform=租户向平台付费, tenant=租户客户向租户付费
   * @param customerId 租户ID
   * @param channel wechat/alipay
   */
  resolveConfig(payerType, customerId, channel) {
    // 平台级支付：始终使用平台配置
    if (payerType === 'platform') {
      const platform = this.getPlatformConfig();
      return {
        mode: 'platform',
        config: platform[channel] || {},
        platformFeeRate: 0,
      };
    }

    // 租户级支付：根据租户配置决定
    const tenant = this.getTenantConfig(customerId);
    if (tenant.mode === 'independent' && tenant[channel]?.enabled) {
      // 自主接入：使用租户自己的商户号
      return {
        mode: 'independent',
        config: tenant[channel],
        platformFeeRate: 0,
      };
    }

    // 借用平台：使用平台配置代收
    const platform = this.getPlatformConfig();
    return {
      mode: 'platform',
      config: platform[channel] || {},
      platformFeeRate: tenant.platformFeeRate || 0,
    };
  }

  // ============================================================
  // 订单管理
  // ============================================================

  /** 生成订单号 */
  genOrderNo(prefix = 'PAY') {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}${date}${rand}`;
  }

  /** 创建支付订单 */
  createOrder({ payerType, customerId, userId = 0, solution = '', productType = '', productId = '', productName = '', amount, channel = 'wechat', remark = '', identityType = '' }) {
    const orderNo = this.genOrderNo();
    const resolved = this.resolveConfig(payerType, customerId, channel);
    const platformFee = resolved.mode === 'platform' && payerType === 'tenant'
      ? Math.floor(amount * resolved.platformFeeRate / 100)
      : 0;

    const result = this.db.prepare(`
      INSERT INTO payment_orders (order_no, payer_type, customer_id, user_id, buyer_identity_type, solution, product_type, product_id, product_name, amount, platform_fee, pay_channel, pay_mode, status, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(orderNo, payerType, customerId, userId, identityType || '', solution, productType, productId, productName, amount, platformFee, channel, resolved.mode, remark);

    return this.getOrderById(result.lastInsertRowid);
  }

  /** 根据ID获取订单 */
  getOrderById(id) {
    const row = this.db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(id);
    return row ? this.toOrder(row) : null;
  }

  /** 根据订单号获取订单 */
  getOrderByNo(orderNo) {
    const row = this.db.prepare('SELECT * FROM payment_orders WHERE order_no = ?').get(orderNo);
    return row ? this.toOrder(row) : null;
  }

  /** 更新订单状态为已支付 */
  markPaid(orderNo, transactionId = '') {
    const order = this.getOrderByNo(orderNo);
    if (!order || order.status === 'paid') return order;

    this.db.prepare(`
      UPDATE payment_orders SET status = 'paid', transaction_id = ?, paid_at = datetime('now'), updated_at = datetime('now')
      WHERE order_no = ?
    `).run(transactionId, orderNo);

    const updated = this.getOrderByNo(orderNo);

    // 支付成功后的业务处理
    this.handlePaymentSuccess(updated);

    return updated;
  }

  /** 支付成功后的业务处理 */
  handlePaymentSuccess(order) {
    if (!order || order.status !== 'paid') return;

    // 智能名片会员支付成功
    if (order.solution === 'card' && order.productType === 'member') {
      this.activateCardMember(order);
    }

    // 租户级会员卡购买支付成功 → 开卡（1:1 复刻菜鸟云「直接购买」）
    if (order.solution === 'card' && order.productType === 'member_card' && this.member) {
      this.member.openCardByOrder(order);
    }

    // 名片模板购买支付成功 → 解锁（写 user_template_purchases，永久可用）
    if (order.solution === 'card' && order.productType === 'template' && order.userId) {
      const tplId = Number(order.productId);
      if (tplId) {
        try {
          this.db.prepare(
            "INSERT INTO user_template_purchases (user_id, template_id, order_no, amount) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, template_id) DO NOTHING"
          ).run(order.userId, tplId, order.orderNo, Number(order.amount || 0));
        } catch (e) {
          console.error('名片模板解锁失败:', e?.message || e);
        }
      }
    }

    // 商品订单支付成功 → 业务处理（扣库存/状态流转/消息通知；卡密虚拟自动发货）
    if (order.solution === 'goods' && this.goodsOrder) {
      try {
        this.goodsOrder.onOrderPaid(order);
      } catch (e) {
        console.error('商品订单支付处理失败:', e?.message || e);
      }
    }

    // 分销分账调度器：租户级已支付订单触发（插件开关/幂等由调度器内部处理）
    try {
      // 成为下线=首次下单：结算 pending 意向绑定
      if (this.distribution && this.distribution.settlePendingRelations) {
        this.distribution.settlePendingRelations(order);
      }
      this.distribution.computeOrderSplit(order);
    } catch (e) {
      console.error('分销分账失败:', e?.message || e);
    }
  }

  /** 订单退款回滚（全额/部分退款通用，供退款业务调用） */
  refundOrder(orderNo, refundAmount = null) {
    const order = this.getOrderByNo(orderNo);
    if (!order || order.status === 'refunded') return null;
    this.db.prepare("UPDATE payment_orders SET status = 'refunded', updated_at = datetime('now') WHERE order_no = ?").run(orderNo);
    // 分销回滚（快照为准，即使插件已关闭也执行）
    try {
      this.distribution.rollbackOrderSplit(order, refundAmount);
    } catch (e) {
      console.error('分销回滚失败:', e?.message || e);
    }
    return this.getOrderByNo(orderNo);
  }

  /** 开通智能名片会员 */
  activateCardMember(order) {
    try {
      const pkg = this.db.prepare('SELECT * FROM member_package WHERE id = ?').get(Number(order.productId));
      if (!pkg) return;

      const user = this.db.prepare('SELECT * FROM platform_user WHERE id = ?').get(order.userId);
      if (!user) return;

      const now = new Date();
      let expireAt;
      const days = pkg.duration_days || 365;
      if (days <= 0) {
        // 永久会员
        expireAt = new Date(now.getFullYear() + 10, now.getMonth(), now.getDate());
      } else {
        expireAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      }

      // 如果当前会员未过期，则在现有基础上延长
      if (user.member_expire_at && new Date(user.member_expire_at) > now) {
        const current = new Date(user.member_expire_at);
        expireAt = new Date(current.getTime() + days * 24 * 60 * 60 * 1000);
      }

      this.db.prepare(`
        UPDATE platform_user SET member_level = ?, member_expire_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(pkg.level, expireAt.toISOString().slice(0, 19).replace('T', ' '), order.userId);

      // 第20轮三层身份：购买含场席套餐 → 租户 purchase 模式下自动获得集市场席。
      // 不满足前置（套餐未勾选/口令模式/配额满/跨租户）时静默跳过——会员权益已正常开通，
      // 场席引导由 C 端 /member/status 的 marketSubject 状态负责。
      try {
        const grant = grantMarketSubjectByPurchase(this.db, {
          customerId: order.customerId,
          userId: order.userId,
          pkg,
        });
        if (grant.granted) {
          console.log(`[payment] 订单 ${order.orderNo} 购买套餐获得集市场席（租户#${order.customerId} 用户#${order.userId}）`);
        }
      } catch (e) {
        console.error('集市场席授予失败:', e?.message || e);
      }

      // 分销分账已由 handlePaymentSuccess 统一调度（老简版 generateDistributionCommission 已废弃）
    } catch (e) {
      console.error('开通会员失败:', e);
    }
  }

  // ============================================================
  // 统一下单（返回前端调起支付所需参数）
  // ============================================================

  /**
   * 构造微信支付客户端。
   * @returns {{ok:true, client:object, cfg:object} | {ok:false, missing:string[]}}
   *   刻意**不抛错**：调用方需要区分「没配支付」（可回落 mock 演示）
   *   与「配了但证书读不到」（必须报错，否则等于静默免单）。
   */
  getWechatClient(resolved) {
    const cfg = buildClientConfig({ settingsWechat: resolved?.config || {}, env: process.env });
    if (cfg.missing) return { ok: false, missing: cfg.missing };
    try {
      return { ok: true, client: createClientFromConfig(cfg), cfg };
    } catch (e) {
      return { ok: false, error: e.message, missing: ['证书/私钥读取失败'] };
    }
  }

  /** 取付款人 openid：JSAPI 支付的 payer 必须与下单 appid 同属一个小程序 */
  getPayerOpenid(order) {
    if (!order?.userId) return '';
    const u = this.db.prepare('SELECT openid FROM platform_user WHERE id = ?').get(order.userId);
    const openid = String(u?.openid || '');
    // mock_ 前缀是未配置真实登录时的占位（app.js wxLogin 回落通道），
    // 拿它下单微信必然失败，不如在这里给出可操作的提示
    if (!openid || openid.startsWith('mock_')) return '';
    return openid;
  }

  /**
   * 生成小程序调起支付所需参数。
   * 三种结果：
   *   ① 真实配置齐全 → { mock:false, payParams:{...5 参数}, appId }
   *   ② 支付未配置   → { mock:true, message }（演示/自测形态）
   *   ③ 配了但 openid 不可用 → 抛错（真实支付不能静默 mock）
   */
  async prepay(order, resolved) {
    const clientRes = this.getWechatClient(resolved);
    if (!clientRes.ok) {
      const detail = clientRes.error || clientRes.missing.join('、');
      // 意图判定：**只有「压根没配」才允许回落 mock**。
      // 回落 mock 的后果是「用户点了支付、钱没扣、订单标记成功」——资金与权益双错账，
      // 所以一旦检测到运营在用真实商户号（mchId 非 MOCK 占位），配不全就必须报错。
      const declaredReal = !!resolved?.config?.enabled
        && !!String(resolved?.config?.mchId || '').trim()
        && !/^mock/i.test(String(resolved.config.mchId).trim());
      if (declaredReal) {
        throw new Error(`微信支付配置不完整：${detail}`);
      }
      return { mock: true, message: `未配置真实微信支付（${detail}），当前为模拟支付`, missing: clientRes.missing };
    }

    const openid = this.getPayerOpenid(order);
    if (!openid) {
      throw new Error('未获取到付款人 openid：请在小程序端重新登录后再支付（H5 端无法使用微信 JSAPI 支付）');
    }

    const { client, cfg } = clientRes;
    const prepayId = await client.jsapiOrder({
      openid,
      outTradeNo: order.orderNo,
      // 🔴 单位是分：payment_orders.amount 全链路存分（card.js price*100 / yuan2fen）
      amountFen: order.amount,
      description: order.productName || '名片服务',
    });
    return {
      mock: false,
      appId: cfg.appId,
      payParams: { ...client.buildPayParams(prepayId), appId: cfg.appId },
      prepayId,
    };
  }

  /**
   * 统一下单
   * @returns 支付参数（前端用于调起微信/支付宝支付）
   */
  async createPayment(order) {
    const resolved = this.resolveConfig(order.payerType, order.customerId, order.payChannel);

    // 检查支付渠道是否启用
    if (!resolved.config?.enabled) {
      throw new Error('该支付渠道暂未启用');
    }

    if (order.payChannel === 'wechat') {
      const r = await this.prepay(order, resolved);
      return {
        orderNo: order.orderNo,
        amount: order.amount,
        payMode: resolved.mode,
        ...r,
      };
    }
    // 支付宝尚未接入：显式说明，不假装 mock 能收款
    return {
      orderNo: order.orderNo,
      amount: order.amount,
      payMode: resolved.mode,
      mock: true,
      message: '支付宝支付尚未接入，请使用微信支付',
    };
  }

  // ============================================================
  // 结算管理（借用平台模式）
  // ============================================================

  /** 生成结算单 */
  createSettlement(customerId, orderIds) {
    const orders = this.db.prepare(`
      SELECT * FROM payment_orders
      WHERE customer_id = ? AND payer_type = 'tenant' AND pay_mode = 'platform' AND status = 'paid' AND id IN (${orderIds.map(() => '?').join(',')})
    `).all(customerId, ...orderIds);

    if (orders.length === 0) return null;

    const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0);
    const platformFee = orders.reduce((sum, o) => sum + o.platform_fee, 0);
    const settleAmount = totalAmount - platformFee;
    const settlementNo = 'SET' + Date.now() + randomBytes(2).toString('hex').toUpperCase();

    this.db.prepare(`
      INSERT INTO settlement_records (settlement_no, customer_id, order_ids, total_amount, platform_fee, settle_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(settlementNo, customerId, JSON.stringify(orderIds), totalAmount, platformFee, settleAmount);

    return this.db.prepare('SELECT * FROM settlement_records WHERE settlement_no = ?').get(settlementNo);
  }

  /** 确认结算 */
  confirmSettlement(settlementId) {
    this.db.prepare(`
      UPDATE settlement_records SET status = 'settled', settled_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(settlementId);
    return this.db.prepare('SELECT * FROM settlement_records WHERE id = ?').get(settlementId);
  }

  // ============================================================
  // 工具函数
  // ============================================================

  toOrder(row) {
    if (!row) return null;
    return {
      id: row.id,
      orderNo: row.order_no,
      payerType: row.payer_type,
      customerId: row.customer_id,
      userId: row.user_id,
      solution: row.solution,
      productType: row.product_type,
      productId: row.product_id,
      productName: row.product_name,
      amount: row.amount,
      platformFee: row.platform_fee,
      payChannel: row.pay_channel,
      payMode: row.pay_mode,
      status: row.status,
      transactionId: row.transaction_id,
      paidAt: row.paid_at,
      remark: row.remark,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
