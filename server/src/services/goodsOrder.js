// 商品订单服务（二期-A 订单闭环）
// 设计：业务单 goods_order 与支付单 payment_orders 分离，经 goods_order.pay_order_id 关联。
// 分销分账不在此处触发：支付单（solution='goods', payer_type='tenant'）经 payment.markPaid →
// handlePaymentSuccess → distribution.computeOrderSplit 自动分账（复用现有链路，无需改分销逻辑）。
// 消息通知：支付/发货/退款写 card_message（type=system），失败不阻断主流程。
import { randomBytes } from 'node:crypto';

export function createGoodsOrderService(db) {
  const svc = {};

  function genOrderNo(prefix = 'G') {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}${date}${rand}`;
  }

  function yuan2fen(n) {
    const v = Number(n);
    return Number.isFinite(v) ? Math.round(v * 100) : 0;
  }

  function pushLog(orderId, action, remark = '') {
    try {
      db.prepare('INSERT INTO goods_order_log (order_id, action, remark) VALUES (?, ?, ?)').run(orderId, action, remark);
    } catch { /* 日志失败不阻断 */ }
  }

  function pushMsg(customerId, userId, title, content, link = '') {
    try {
      db.prepare('INSERT INTO card_message (customer_id, user_id, type, title, content, link) VALUES (?, ?, ?, ?, ?, ?)')
        .run(customerId, userId, 'system', title, content, link);
    } catch (e) { /* 消息写入失败不阻断 */ }
  }

  const yuan = (fen) => (Number(fen) / 100).toFixed(2);

  /** 下单：校验商品/库存 → 建业务单+明细 → 返回业务单（支付单由路由层创建） */
  svc.createOrder = ({ customerId, userId, identityType = 'individual', items, deliveryMode = 'express', receiverName = '', receiverPhone = '', receiverAddress = '', remark = '' }) => {
    if (!Array.isArray(items) || !items.length) throw new Error('请选择商品');
    if (deliveryMode === 'express' && (!receiverName || !receiverPhone)) throw new Error('请填写收货人信息');

    const orderItems = [];
    let total = 0;

    for (const it of items) {
      const gid = Number(it.goodsId || it.goods_id);
      const num = Math.max(1, Number(it.num) || 1);
      const row = db.prepare('SELECT * FROM goods WHERE id = ? AND customer_id = ? AND status = ?').get(gid, customerId, 'sell');
      if (!row) throw new Error(`商品#${gid}不存在或未上架`);

      let price = yuan2fen(row.price);
      let skuId = 0;
      let stock = row.stock || 0;

      if (row.spec_mode === 'multi' && it.skuId) {
        const sku = db.prepare('SELECT * FROM goods_sku WHERE id = ? AND goods_id = ?').get(Number(it.skuId), gid);
        if (!sku) throw new Error(`商品「${row.title}」规格不存在`);
        price = yuan2fen(sku.price);
        stock = sku.stock || 0;
        skuId = sku.id;
      }

      if (num > stock) throw new Error(`商品「${row.title}」库存不足（剩余 ${stock}）`);
      if (price <= 0) throw new Error(`商品「${row.title}」价格异常`);

      total += price * num;
      orderItems.push({
        goodsId: gid, skuId, goodsType: row.type || 'normal', title: row.title,
        thumb: row.thumb || (Array.isArray(row.images) ? row.images[0] : ''),
        specJson: skuId ? (db.prepare('SELECT spec_json FROM goods_sku WHERE id = ?').get(skuId)?.spec_json || '{}') : '{}',
        price, num,
      });
    }

    const orderNo = genOrderNo();
    const r = db.prepare(`
      INSERT INTO goods_order (order_no, customer_id, user_id, buyer_identity_type, status, total_amount, freight, pay_amount,
        delivery_mode, receiver_name, receiver_phone, receiver_address, remark)
      VALUES (?, ?, ?, ?, 'pending', ?, 0, ?, ?, ?, ?, ?, ?)
    `).run(orderNo, customerId, userId, identityType, total, total, deliveryMode, receiverName, receiverPhone, receiverAddress, remark);
    const orderId = r.lastInsertRowid;

    const insItem = db.prepare(`
      INSERT INTO goods_order_item (order_id, goods_id, sku_id, goods_type, title, thumb, spec_json, price, num)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const oi of orderItems) {
      insItem.run(orderId, oi.goodsId, oi.skuId, oi.goodsType, oi.title, oi.thumb, oi.specJson, oi.price, oi.num);
    }
    pushLog(orderId, 'create', `创建订单，共${orderItems.length}种商品`);
    return svc.getOrder(orderId);
  };

  /** 支付成功回调（payment.js handlePaymentSuccess 调用；payOrder 为 camelCase 的 payment_orders 行） */
  svc.onOrderPaid = (payOrder) => {
    if (!payOrder || payOrder.productType !== 'goods') return;
    // 支付单 productId = goods_order.id（下单时写入）
    const order = db.prepare('SELECT * FROM goods_order WHERE id = ?').get(Number(payOrder.productId));
    if (!order || order.status !== 'pending') return;
    db.prepare('UPDATE goods_order SET pay_order_id = ? WHERE id = ?').run(payOrder.id, order.id);

    const items = db.prepare('SELECT * FROM goods_order_item WHERE order_id = ?').all(order.id);

    // 扣库存（支付成功才扣，防超卖）；不足则自动退款标记
    let stockOk = true;
    for (const it of items) {
      if (it.sku_id) {
        const sku = db.prepare('SELECT * FROM goods_sku WHERE id = ?').get(it.sku_id);
        if (!sku || sku.stock < it.num) { stockOk = false; break; }
      } else {
        const g = db.prepare('SELECT stock FROM goods WHERE id = ?').get(it.goods_id);
        if (!g || g.stock < it.num) { stockOk = false; break; }
      }
    }
    if (!stockOk) {
      db.prepare("UPDATE goods_order SET status = 'refunded', refunded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(order.id);
      pushLog(order.id, 'auto_refund', '支付成功但库存不足，自动退款');
      pushMsg(order.customer_id, order.user_id, '订单退款通知', `订单#${order.order_no} 库存不足，已自动退款 ¥${yuan(order.pay_amount)}`, '/pages/goods/order');
      return;
    }
    for (const it of items) {
      if (it.sku_id) {
        db.prepare('UPDATE goods_sku SET stock = stock - ? WHERE id = ?').run(it.num, it.sku_id);
      } else {
        db.prepare('UPDATE goods SET stock = stock - ? WHERE id = ?').run(it.num, it.goods_id);
      }
    }

    // 状态流转：普通=paid（后台发货）；卡密/虚拟=自动发货置 done（真实卡密库二期-C 接入）
    const allVirtual = items.every((i) => i.goods_type !== 'normal');
    const nextStatus = allVirtual ? 'done' : 'paid';
    db.prepare(`UPDATE goods_order SET status = ?, paid_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(nextStatus, order.id);
    if (nextStatus === 'done') db.prepare("UPDATE goods_order SET done_at = datetime('now') WHERE id = ?").run(order.id);
    pushLog(order.id, 'paid', `支付成功 ¥${yuan(order.pay_amount)}${allVirtual ? '，自动发货完成' : ''}`);
    pushMsg(order.customer_id, order.user_id, '订单支付成功', `订单#${order.order_no} 已支付 ¥${yuan(order.pay_amount)}`, '/pages/goods/order');
  };

  /** 后台：发货 */
  svc.ship = ({ customerId, orderId }) => {
    const order = svc.getOrderByTenant(customerId, orderId);
    if (!order) throw new Error('订单不存在');
    if (order.status !== 'paid') throw new Error('仅已支付订单可发货');
    db.prepare("UPDATE goods_order SET status = 'shipped', shipped_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(order.id);
    pushLog(order.id, 'ship', '商家已发货');
    pushMsg(order.customer_id, order.user_id, '订单已发货', `订单#${order.order_no} 已发货，请注意查收`, '/pages/goods/order');
    return svc.getOrder(order.id);
  };

  /** 后台：完成 */
  svc.done = ({ customerId, orderId }) => {
    const order = svc.getOrderByTenant(customerId, orderId);
    if (!order) throw new Error('订单不存在');
    if (!['paid', 'shipped'].includes(order.status)) throw new Error('当前状态不可完成');
    db.prepare("UPDATE goods_order SET status = 'done', done_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(order.id);
    pushLog(order.id, 'done', '订单完成');
    return svc.getOrder(order.id);
  };

  /** 后台：退款（恢复库存 + 分销回滚由支付单退款链路处理） */
  svc.refund = ({ customerId, orderId }) => {
    const order = svc.getOrderByTenant(customerId, orderId);
    if (!order) throw new Error('订单不存在');
    if (!['paid', 'shipped'].includes(order.status)) throw new Error('当前状态不可退款');

    // 恢复库存
    const items = db.prepare('SELECT * FROM goods_order_item WHERE order_id = ?').all(order.id);
    for (const it of items) {
      if (it.sku_id) db.prepare('UPDATE goods_sku SET stock = stock + ? WHERE id = ?').run(it.num, it.sku_id);
      else db.prepare('UPDATE goods SET stock = stock + ? WHERE id = ?').run(it.num, it.goods_id);
    }
    db.prepare("UPDATE goods_order SET status = 'refunded', refunded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(order.id);
    pushLog(order.id, 'refund', `退款 ¥${yuan(order.pay_amount)}，库存已恢复`);
    pushMsg(order.customer_id, order.user_id, '订单退款通知', `订单#${order.order_no} 已退款 ¥${yuan(order.pay_amount)}`, '/pages/goods/order');
    return svc.getOrder(order.id);
  };

  /** 后台：订单列表（状态筛选/搜索/分页） */
  svc.listOrders = ({ customerId, status = '', keyword = '', page = 1, pageSize = 20 }) => {
    const where = ['customer_id = ?'];
    const params = [customerId];
    if (status) { where.push('status = ?'); params.push(status); }
    if (keyword) {
      where.push('(order_no LIKE ? OR id IN (SELECT order_id FROM goods_order_item WHERE title LIKE ?))');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    const total = db.prepare(`SELECT COUNT(*) c FROM goods_order WHERE ${where.join(' AND ')}`).get(...params).c;
    const rows = db.prepare(`SELECT * FROM goods_order WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);
    const stmtItems = db.prepare('SELECT * FROM goods_order_item WHERE order_id = ?');
    const stmtBuyer = db.prepare('SELECT nickname, avatar FROM platform_user WHERE id = ?');
    const list = rows.map((row) => {
      const buyer = stmtBuyer.get(row.user_id) || {};
      return {
        ...row,
        items: stmtItems.all(row.id),
        buyerName: buyer.nickname || `用户${row.user_id}`,
        buyerAvatar: buyer.avatar || '',
        totalAmountY: yuan(row.total_amount),
        payAmountY: yuan(row.pay_amount),
        freightY: yuan(row.freight),
      };
    });
    return { list, total };
  };

  svc.getOrderByTenant = (customerId, orderId) => {
    const row = db.prepare('SELECT * FROM goods_order WHERE id = ? AND customer_id = ?').get(Number(orderId), customerId);
    if (!row) return null;
    return svc.getOrder(row.id);
  };

  svc.getOrder = (orderId) => {
    const row = db.prepare('SELECT * FROM goods_order WHERE id = ?').get(Number(orderId));
    if (!row) return null;
    const buyer = db.prepare('SELECT nickname, avatar FROM platform_user WHERE id = ?').get(row.user_id) || {};
    return {
      ...row,
      items: db.prepare('SELECT * FROM goods_order_item WHERE order_id = ?').all(row.id),
      logs: db.prepare('SELECT * FROM goods_order_log WHERE order_id = ? ORDER BY id DESC').all(row.id),
      buyerName: buyer.nickname || `用户${row.user_id}`,
      buyerAvatar: buyer.avatar || '',
      totalAmountY: yuan(row.total_amount),
      payAmountY: yuan(row.pay_amount),
      freightY: yuan(row.freight),
    };
  };

  return svc;
}
