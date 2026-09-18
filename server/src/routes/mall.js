// 商城 C 端公开 API（2026-09-18，/api/mall 独立命名空间，方案C）
// - 商品浏览/门店公开（?tid= 指定租户，或登录态自动解析租户）
// - 购物车/订单需登录（Authorization Bearer → platform_user，与 card.js 同一 token 协议）
// - 整体 requireGoodsApp C 端变体：未开通 goods 应用 → 403（一个中间件全覆盖，权限不漏）
import { Router } from 'express';
import { hasSolution } from '../tenant.js';
import { createGoodsOrderService } from '../services/goodsOrder.js';
import { PaymentService } from '../services/payment.js';

export function createMallRouter(db) {
  const router = Router();

  // ---- 认证（与 card.js authOptional/auth 同一协议）----
  function resolveUser(req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
      const user = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(payload.uid);
      if (user && user.status === 'active') return user;
    } catch { /* 无效 token 视为未登录 */ }
    return null;
  }

  function authOptional(req, res, next) {
    const user = resolveUser(req);
    if (user) attachUser(req, user);
    next();
  }

  function attachUser(req, user) {
    req.user = user;
    req.userId = user.id;
    req.customerId = user.customer_id || null;
    if (!req.customerId && user.enterprise_id) {
      const ent = db.prepare('SELECT customer_id FROM tenant_enterprises WHERE id = ?').get(user.enterprise_id);
      if (ent) req.customerId = ent.customer_id;
    }
  }

  function auth(req, res, next) {
    const user = resolveUser(req);
    if (!user) return res.status(401).json({ error: '请先登录' });
    attachUser(req, user);
    next();
  }

  // C 端变体 requireGoodsApp：租户 = URL ?tid=（分享/装修嵌入优先），其次登录态
  function requireGoodsApp(req, res, next) {
    const cid = Number(req.query.tid) || req.customerId || null;
    if (!cid || !hasSolution(db, cid, 'goods')) {
      return res.status(403).json({ error: '未开通「商品管理」应用，请联系平台管理员开通' });
    }
    req.customerId = cid;
    next();
  }

  // ---------- 商品分类（公开，一级+二级） ----------
  router.get('/cates', authOptional, requireGoodsApp, (req, res) => {
    try {
      const cid = req.customerId;
      const cats = db.prepare(
        'SELECT id, pid, name, image FROM goods_category WHERE customer_id = ? AND status = 1 ORDER BY pid ASC, sort_order DESC, id ASC'
      ).all(cid);
      const level1 = cats.filter((c) => c.pid === 0).map((c) => ({ ...c, children: cats.filter((s) => s.pid === c.id) }));
      res.json({ list: level1, total: level1.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 商品列表（公开，出售中） ----------
  router.get('/goods', authOptional, requireGoodsApp, (req, res) => {
    try {
      const cid = req.customerId;
      const { catId, keyword = '', page = 1, pageSize = 10, sortBy = 'default', ids = '' } = req.query;
      const where = ['customer_id = ?', "status = 'sell'"];
      const params = [cid];
      if (catId) { where.push('cate_ids LIKE ?'); params.push(`%${Number(catId)}%`); }
      if (keyword) { where.push('title LIKE ?'); params.push(`%${keyword}%`); }
      const idList = String(ids || '').split(/[,，]/).map((x) => Number(x)).filter((x) => x > 0);
      if (idList.length) { where.push(`id IN (${idList.map(() => '?').join(',')})`); params.push(...idList); }
      const whereSql = where.join(' AND ');
      const total = db.prepare(`SELECT COUNT(*) AS n FROM goods WHERE ${whereSql}`).get(...params).n;
      const orderSql = {
        sales: '(real_sales + fake_sales) DESC, id DESC',
        new: 'created_at DESC, id DESC',
        newDesc: 'created_at DESC, id DESC',
        newAsc: 'created_at ASC, id ASC',
        views: 'sort_order DESC, id DESC',
        priceAsc: 'price ASC, id DESC',
        priceDesc: 'price DESC, id DESC',
      }[sortBy] || 'sort_order DESC, id DESC';
      const list = db.prepare(
        `SELECT id, title, thumb, price, market_price, unit, stock, real_sales, fake_sales, type, spec_mode FROM goods
         WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`
      ).all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize));
      res.json({
        list: list.map((g) => ({
          ...g,
          sales: (g.real_sales || 0) + (g.fake_sales || 0),
          soldout: Number(g.stock) <= 0,
        })),
        total, page: Number(page), pageSize: Number(pageSize),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 商品详情（公开，含 SKU + 配送方式摘要） ----------
  router.get('/goods/:id', authOptional, requireGoodsApp, (req, res) => {
    try {
      const cid = req.customerId;
      const g = db.prepare("SELECT * FROM goods WHERE id = ? AND customer_id = ? AND status = 'sell'").get(Number(req.params.id), cid);
      if (!g) return res.status(404).json({ error: '商品不存在或已下架' });
      const parse = (v, fb) => { try { return JSON.parse(v); } catch { return fb; } };
      const skus = g.spec_mode === 'multi'
        ? db.prepare('SELECT id, spec_json, price, stock FROM goods_sku WHERE goods_id = ?').all(g.id)
        : [];
      const setting = db.prepare('SELECT config FROM goods_setting WHERE customer_id = ?').get(cid);
      let delivery = { express: false, citySend: false, takeSelf: false };
      try {
        const cfg = JSON.parse(setting?.config || '{}');
        delivery = {
          express: Number(cfg.express) === 1,
          citySend: Number(cfg.citySend) === 1,
          takeSelf: Number(cfg.takeSelf) === 1,
        };
      } catch { /* 解析失败保持全关 */ }
      res.json({
        id: g.id, title: g.title, type: g.type, images: parse(g.images, []), thumb: g.thumb, info: g.info,
        price: g.price, marketPrice: g.market_price, unit: g.unit, stock: g.stock, specMode: g.spec_mode,
        minBuy: g.min_buy, sales: (g.real_sales || 0) + (g.fake_sales || 0), soldout: Number(g.stock) <= 0,
        video: g.video, videoCover: g.video_cover,
        skus, delivery,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 门店（公开读，自提选择；一期不校验营业时间） ----------
  // ---------- 商城首页装修（公开，发布稿→草稿回退，供 C 端装修区渲染） ----------
  // 页面解析：?pageType= 优先（首页跳转/行内「设为商城首页」写入的 `/pages/mall/index?pageType=xx`）；
  // 未指定时读 home_pages.goods（默认 mall-home，即商城内置默认首页，不可删除）
  router.get('/design-home', authOptional, requireGoodsApp, (req, res) => {
    try {
      const cid = req.customerId;
      let reqPageType = String(req.query.pageType || '').trim();
      if (!reqPageType) {
        const home = db.prepare('SELECT home_pages FROM tenant_home_config WHERE tenant_id = ?').get(cid);
        let hp = {};
        try { hp = JSON.parse(home?.home_pages || '{}'); } catch { hp = {}; }
        const g = String(hp.goods || '');
        const m = g.match(/[?&]pageType=([^&]+)/);
        if (m) reqPageType = decodeURIComponent(m[1]);
      }
      const type = reqPageType || 'mall-home';
      const pick = (status) => db.prepare(
        'SELECT design_json FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND status = ? ORDER BY version DESC LIMIT 1'
      ).get(cid, type, status);
      const row = pick(1) || pick(0);
      if (!row) return res.json({ components: [], meta: {} });
      const j = JSON.parse(row.design_json || '{}');
      res.json({ components: j.components || [], meta: j.meta || {} });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/stores', authOptional, requireGoodsApp, (req, res) => {
    try {
      const cid = req.customerId;
      const rows = db.prepare(
        "SELECT id, name, type, logo, phone, province, city, district, address, lng, lat, business_time_type, business_time FROM store WHERE customer_id = ? AND status = 1 ORDER BY id DESC"
      ).all(cid);
      res.json({ list: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 购物车（需登录，服务端存储：H5/小程序同用户同步） ----------
  router.get('/cart', auth, requireGoodsApp, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT c.id, c.goods_id, c.sku_id, c.quantity,
               g.title, g.thumb, g.spec_mode, g.type, g.status AS goods_status,
               g.price AS goods_price, g.stock AS goods_stock,
               s.spec_json, s.price AS sku_price, s.stock AS sku_stock
        FROM goods_cart c
        JOIN goods g ON g.id = c.goods_id AND g.customer_id = c.customer_id
        LEFT JOIN goods_sku s ON s.id = c.sku_id AND s.goods_id = c.goods_id
        WHERE c.customer_id = ? AND c.user_id = ?
        ORDER BY c.id DESC
      `).all(req.customerId, req.user.id);
      res.json({
        list: rows.map((r) => ({
          id: r.id, goodsId: r.goods_id, skuId: r.sku_id, quantity: r.quantity,
          title: r.title, thumb: r.thumb, specMode: r.spec_mode, type: r.type,
          specJson: r.spec_json || '{}',
          price: Math.round((r.sku_id ? r.sku_price : r.goods_price) * 100),
          stock: r.sku_id ? r.sku_stock : r.goods_stock,
          onShelf: r.goods_status === 'sell',
        })),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 加购：同商品同规格数量累加（UPSERT）
  router.post('/cart', auth, requireGoodsApp, (req, res) => {
    try {
      const { goodsId, skuId = 0, quantity = 1 } = req.body || {};
      const gid = Number(goodsId);
      const qty = Math.max(1, Number(quantity) || 1);
      const g = db.prepare("SELECT id FROM goods WHERE id = ? AND customer_id = ? AND status = 'sell'").get(gid, req.customerId);
      if (!g) return res.status(404).json({ error: '商品不存在或已下架' });
      if (skuId) {
        const sku = db.prepare('SELECT id FROM goods_sku WHERE id = ? AND goods_id = ?').get(Number(skuId), gid);
        if (!sku) return res.status(404).json({ error: '规格不存在' });
      }
      db.prepare(`
        INSERT INTO goods_cart (customer_id, user_id, goods_id, sku_id, quantity)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(customer_id, user_id, goods_id, sku_id)
        DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = datetime('now')
      `).run(req.customerId, req.user.id, gid, Number(skuId), qty);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 改数量
  router.put('/cart/:id', auth, requireGoodsApp, (req, res) => {
    try {
      const n = Math.max(1, Number(req.body?.quantity) || 1);
      const r = db.prepare("UPDATE goods_cart SET quantity = ?, updated_at = datetime('now') WHERE id = ? AND customer_id = ? AND user_id = ?")
        .run(n, Number(req.params.id), req.customerId, req.user.id);
      if (r.changes === 0) return res.status(404).json({ error: '购物车项不存在' });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删单项
  router.delete('/cart/:id', auth, requireGoodsApp, (req, res) => {
    try {
      const r = db.prepare('DELETE FROM goods_cart WHERE id = ? AND customer_id = ? AND user_id = ?')
        .run(Number(req.params.id), req.customerId, req.user.id);
      if (r.changes === 0) return res.status(404).json({ error: '购物车项不存在' });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 清空
  router.delete('/cart', auth, requireGoodsApp, (req, res) => {
    try {
      db.prepare('DELETE FROM goods_cart WHERE customer_id = ? AND user_id = ?').run(req.customerId, req.user.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 订单（需登录） ----------
  // 下单：建业务单（快递/到店自提，自提生成核销码）+ 支付单，返回支付所需信息
  router.post('/orders', auth, requireGoodsApp, (req, res) => {
    try {
      const { items, deliveryMode = 'express', storeId = 0, receiverName = '', receiverPhone = '', receiverAddress = '', remark = '', channel = 'wechat' } = req.body || {};
      const svc = createGoodsOrderService(db);
      let storeName = '';
      if (deliveryMode === 'pickup') {
        if (!storeId) return res.status(400).json({ error: '请选择自提门店' });
        const st = db.prepare('SELECT name FROM store WHERE id = ? AND customer_id = ? AND status = 1').get(Number(storeId), req.customerId);
        if (!st) return res.status(400).json({ error: '自提门店不存在或已停用' });
        storeName = st.name;
      }
      const order = svc.createOrder({
        customerId: req.customerId,
        userId: req.user.id,
        identityType: req.user.identity_type || 'individual',
        items: items.map((i) => ({ goodsId: i.goodsId, skuId: i.skuId, num: i.quantity })),
        deliveryMode, storeId, storeName, receiverName, receiverPhone, receiverAddress, remark,
      });
      const payment = new PaymentService(db);
      const payOrder = payment.createOrder({
        payerType: 'tenant',
        customerId: req.customerId,
        userId: req.user.id,
        identityType: req.user.identity_type || 'individual',
        solution: 'goods',
        productType: 'goods',
        productId: String(order.id),
        productName: `商品订单#${order.orderNo}`,
        amount: order.pay_amount,
        channel,
        remark: `GO_${order.orderNo}`,
      });
      res.json({
        orderNo: order.order_no, payOrderNo: payOrder.orderNo, amount: order.pay_amount,
        id: order.id, pickupCode: order.pickup_code || '', storeName: order.store_name || '',
      });
    } catch (e) {
      res.status(400).json({ error: e.message || '下单失败' });
    }
  });

  // 我的订单（按当前用户过滤，分页正确）
  router.get('/orders', auth, requireGoodsApp, (req, res) => {
    try {
      const { status = '', page = 1, pageSize = 10 } = req.query;
      const where = ['customer_id = ?', 'user_id = ?'];
      const params = [req.customerId, req.user.id];
      if (status) { where.push('status = ?'); params.push(status); }
      const whereSql = where.join(' AND ');
      const total = db.prepare(`SELECT COUNT(*) c FROM goods_order WHERE ${whereSql}`).get(...params).c;
      const rows = db.prepare(`SELECT * FROM goods_order WHERE ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
        .all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize));
      const stmtItems = db.prepare('SELECT * FROM goods_order_item WHERE order_id = ?');
      const list = rows.map((row) => ({ ...row, items: stmtItems.all(row.id) }));
      res.json({ list, total, page: Number(page), pageSize: Number(pageSize) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 订单详情（校验归属：本租户 + 本人）
  router.get('/orders/:id', auth, requireGoodsApp, (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM goods_order WHERE id = ? AND customer_id = ? AND user_id = ?')
        .get(Number(req.params.id), req.customerId, req.user.id);
      if (!row) return res.status(404).json({ error: '订单不存在' });
      const items = db.prepare('SELECT * FROM goods_order_item WHERE order_id = ?').all(row.id);
      res.json({ ...row, items });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 取消订单（仅待支付；库存支付成功才扣，取消无需回补）
  router.post('/orders/:id/cancel', auth, requireGoodsApp, (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM goods_order WHERE id = ? AND customer_id = ? AND user_id = ?')
        .get(Number(req.params.id), req.customerId, req.user.id);
      if (!row) return res.status(404).json({ error: '订单不存在' });
      if (row.status !== 'pending') return res.status(400).json({ error: '仅待支付订单可取消' });
      db.prepare("UPDATE goods_order SET status = 'closed', updated_at = datetime('now') WHERE id = ?").run(row.id);
      db.prepare("INSERT INTO goods_order_log (order_id, action, remark) VALUES (?, 'cancel', '用户取消订单')").run(row.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
