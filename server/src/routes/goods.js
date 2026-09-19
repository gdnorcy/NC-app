// 商品体系（租户后台）—— 1:1 复刻菜鸟云「东莞同城通」duoproducts
// 数据严格按 customer_id 隔离；商品类型「卡密商品/虚拟商品」由应用授权（hasSolution）驱动显示
import { Router } from 'express';
import { tenantState, hasSolution } from '../tenant.js';
import { addOperationLog } from '../db.js';
import { createGoodsOrderService } from '../services/goodsOrder.js';

const STOCK_WARN_THRESHOLD = 10; // 库存预警阈值（对标：库存 ≤10 且 >0 且出售中）

export function createGoodsRouter(db) {
  const router = Router();

  // 中间件：确保是租户用户，并挂载 req.customerId（与 customer.js requireTenant 同逻辑）
  function requireTenant(req, res, next) {
    const user = req.user;
    if (!user || !['tenant_admin', 'tenant_member'].includes(user.role)) {
      return res.status(403).json({ error: '无权访问客户后台' });
    }
    if (!user.customerId) {
      return res.status(403).json({ error: '账号未关联客户项目' });
    }
    const state = tenantState(db, user.customerId, { ctx: 'admin' });
    if (state.missing) return res.status(404).json({ error: '客户项目不存在' });
    if (!state.active) {
      if (state.readonly && req.method === 'GET') {
        req.customerId = user.customerId;
        req.enterpriseId = user.enterpriseId || user.enterprise_id || null;
        req.tenantReadonly = true;
        return next();
      }
      return res.status(403).json({ error: state.reason });
    }
    req.customerId = user.customerId;
    req.enterpriseId = user.enterpriseId || user.enterprise_id || null;
    next();
  }

  function audit(req, action, targetType, targetId, detail) {
    try {
      addOperationLog(db, {
        userId: req.user?.uid ?? req.user?.id ?? null,
        username: req.user?.username ?? req.user?.phone ?? 'tenant-user',
        action, targetType, targetId,
        detail: `[租户#${req.customerId}] ${detail}`,
        ip: req.ip,
      });
    } catch { /* 日志失败不阻断主流程 */ }
  }

  // 商品应用授权校验：商品管理 = 总后台（平台）应用授权，租户方案未开通时不可访问（1:1 复刻菜鸟云「商品=总后台授权」）
  function requireGoodsApp(req, res, next) {
    if (!hasSolution(db, req.customerId, 'goods')) {
      return res.status(403).json({ error: '未开通「商品管理」应用，请联系平台管理员开通' });
    }
    next();
  }

  // 读/写保护：只读租户禁止写操作
  function assertWritable(req, res) {
    if (req.tenantReadonly) {
      res.status(403).json({ error: '服务已到期，当前为只读模式' });
      return false;
    }
    return true;
  }

  // ---------- 商品分类 ----------
  // 树形分类（一级 + 二级），附带各分类商品数
  router.get('/categories', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const cid = req.customerId;
      const cats = db.prepare('SELECT * FROM goods_category WHERE customer_id = ? ORDER BY pid ASC, sort_order DESC, id ASC').all(cid);
      const countByCat = {};
      for (const g of db.prepare('SELECT cate_ids FROM goods WHERE customer_id = ?').all(cid)) {
        try {
          for (const id of JSON.parse(g.cate_ids || '[]')) countByCat[id] = (countByCat[id] || 0) + 1;
        } catch { /* ignore */ }
      }
      const withCount = cats.map((c) => ({ ...c, goodsCount: countByCat[c.id] || 0 }));
      const level1 = withCount.filter((c) => c.pid === 0);
      const level2 = withCount.filter((c) => c.pid !== 0);
      const tree = level1.map((c) => ({ ...c, children: level2.filter((s) => s.pid === c.id) }));
      res.json({
        list: withCount,
        tree,
        total: withCount.length,
        level1Count: level1.length,
        level2Count: level2.length,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/categories', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const { pid = 0, name, image = '', sortOrder = 0 } = req.body || {};
      if (!name || !String(name).trim()) return res.status(400).json({ error: '分类名称不能为空' });
      if (pid) {
        const parent = db.prepare('SELECT id FROM goods_category WHERE id = ? AND customer_id = ? AND pid = 0').get(Number(pid), cid);
        if (!parent) return res.status(400).json({ error: '上级分类不存在，仅支持二级分类' });
      }
      const r = db.prepare(
        'INSERT INTO goods_category (customer_id, pid, name, image, sort_order, status) VALUES (?, ?, ?, ?, ?, 1)'
      ).run(cid, Number(pid), String(name).trim(), image, Number(sortOrder) || 0);
      audit(req, 'goods_category_add', 'goods_category', r.lastInsertRowid, `新增分类 ${name}`);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/categories/:id', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const cat = db.prepare('SELECT * FROM goods_category WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!cat) return res.status(404).json({ error: '分类不存在' });
      const { name, image, sortOrder, status, pid } = req.body || {};
      db.prepare("UPDATE goods_category SET name = ?, image = ?, sort_order = ?, status = ?, pid = ?, updated_at = datetime('now') WHERE id = ?")
        .run(
          name !== undefined ? String(name).trim() : cat.name,
          image !== undefined ? image : cat.image,
          sortOrder !== undefined ? Number(sortOrder) : cat.sort_order,
          status !== undefined ? Number(status) : cat.status,
          pid !== undefined ? Number(pid) : cat.pid,
          cat.id
        );
      audit(req, 'goods_category_edit', 'goods_category', cat.id, `编辑分类 ${cat.name}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/categories/:id', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const cat = db.prepare('SELECT * FROM goods_category WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!cat) return res.status(404).json({ error: '分类不存在' });
      const childCount = db.prepare('SELECT COUNT(*) AS n FROM goods_category WHERE pid = ? AND customer_id = ?').get(cat.id, cid).n;
      if (childCount > 0) return res.status(400).json({ error: '该分类下还有子分类，请先删除子分类' });
      const goodsCount = db.prepare("SELECT COUNT(*) AS n FROM goods WHERE customer_id = ? AND cate_ids LIKE ?").get(cid, `%${cat.id}%`).n;
      if (goodsCount > 0) return res.status(400).json({ error: `该分类下还有 ${goodsCount} 个商品，请先移出商品` });
      db.prepare('DELETE FROM goods_category WHERE id = ?').run(cat.id);
      audit(req, 'goods_category_del', 'goods_category', cat.id, `删除分类 ${cat.name}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 批量操作：上架/下架/删除（对标工具栏 批量上架/批量下架/批量删除）
  router.post('/categories/batch', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const { ids, action } = req.body || {};
      if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '请选择分类' });
      if (!['up', 'down', 'del'].includes(action)) return res.status(400).json({ error: '非法操作' });
      const placeholders = ids.map(() => '?').join(',');
      if (action === 'del') {
        db.prepare(`DELETE FROM goods_category WHERE id IN (${placeholders}) AND customer_id = ?`).run(...ids, cid);
      } else {
        const status = action === 'up' ? 1 : 0;
        db.prepare(`UPDATE goods_category SET status = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND customer_id = ?`)
          .run(status, ...ids, cid);
      }
      audit(req, 'goods_category_batch', 'goods_category', 0, `批量操作 ${action} ${ids.length} 个分类`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 商品列表 ----------
  // status: all 全部 / sell 出售中 / stockwarn 库存预警 / soldout 已售空 / off 未上架 / expired 已失效
  router.get('/', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const cid = req.customerId;
      const { status = 'all', catId, keyword = '', page = 1, pageSize = 10, sortBy = 'default' } = req.query;
      const where = ['customer_id = ?'];
      const params = [cid];
      if (status === 'sell') { where.push("status = 'sell' AND stock > 0"); }
      else if (status === 'stockwarn') { where.push(`status = 'sell' AND stock > 0 AND stock <= ${STOCK_WARN_THRESHOLD}`); }
      else if (status === 'soldout') { where.push("status = 'sell' AND stock <= 0"); }
      else if (status === 'off') { where.push("status = 'off'"); }
      else if (status === 'expired') { where.push("status = 'expired'"); }
      if (catId) {
        where.push('cate_ids LIKE ?');
        params.push(`%${Number(catId)}%`);
      }
      if (keyword) {
        where.push('(title LIKE ? OR goods_no LIKE ?)');
        params.push(`%${keyword}%`, `%${keyword}%`);
      }
      const whereSql = where.join(' AND ');
      const total = db.prepare(`SELECT COUNT(*) AS n FROM goods WHERE ${whereSql}`).get(...params).n;
      const orderSql = sortBy === 'sort' ? 'sort_order DESC, id DESC' : 'sort_order DESC, id DESC';
      const list = db.prepare(
        `SELECT * FROM goods WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`
      ).all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize));
      res.json({
        list: list.map(rowToGoods),
        total,
        page: Number(page),
        pageSize: Number(pageSize),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const g = normalizeGoods(req.body || {});
      if (!g.title) return res.status(400).json({ error: '商品名称不能为空' });
      const r = db.prepare(
        `INSERT INTO goods (customer_id, top_type, type, status, sort_order, title, cate_ids, images, thumb, info,
           pickup, freight_mode, fixed_freight, sale_mode, spec_mode, stock, min_buy, weight, price, market_price,
           cost_price, goods_no, member_price, param, recommend, unit, views, real_sales, fake_sales, fake_people,
           super_form, video, video_cover, video_play, tags, brief, brand_tag, title_tag, service, marketing, member,
           distribution, advanced, phone_required, card_key_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        cid, g.topType, g.type, g.status, g.sortOrder, g.title, JSON.stringify(g.cateIds), JSON.stringify(g.images),
        g.thumb, g.info, g.pickup, g.freightMode, g.fixedFreight, g.saleMode, g.specMode, g.stock, g.minBuy,
        g.weight, g.price, g.marketPrice, g.costPrice, g.goodsNo, JSON.stringify(g.memberPrice), JSON.stringify(g.param),
        g.recommend, g.unit, g.views, g.realSales, g.fakeSales, g.fakePeople, g.superForm, g.video, g.videoCover,
        g.videoPlay, g.tags, g.brief, g.brandTag, g.titleTag, JSON.stringify(g.service), JSON.stringify(g.marketing),
        JSON.stringify(g.member), JSON.stringify(g.distribution), JSON.stringify(g.advanced), g.phoneRequired, g.cardKeyId
      );
      saveSkus(db, r.lastInsertRowid, g.skus || []);
      audit(req, 'goods_add', 'goods', r.lastInsertRowid, `新增商品 ${g.title}`);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 批量操作：up 上架 / down 下架 / del 删除（对标工具栏 批量下架；行内 上架/下架）
  router.post('/batch', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const { ids, action } = req.body || {};
      if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '请选择商品' });
      if (!['up', 'down', 'del'].includes(action)) return res.status(400).json({ error: '非法操作' });
      const placeholders = ids.map(() => '?').join(',');
      if (action === 'del') {
        db.prepare(`DELETE FROM goods WHERE id IN (${placeholders}) AND customer_id = ?`).run(...ids, cid);
        db.prepare(`DELETE FROM goods_sku WHERE goods_id IN (${placeholders})`).run(...ids);
      } else {
        const status = action === 'up' ? 'sell' : 'off';
        db.prepare(`UPDATE goods SET status = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND customer_id = ?`)
          .run(status, ...ids, cid);
      }
      audit(req, 'goods_batch', 'goods', 0, `批量 ${action} ${ids.length} 个商品`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 商品参数模板 ----------
  router.get('/params', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const cid = req.customerId;
      const { keyword = '' } = req.query;
      const list = keyword
        ? db.prepare('SELECT * FROM goods_param WHERE customer_id = ? AND name LIKE ? ORDER BY id DESC').all(cid, `%${keyword}%`)
        : db.prepare('SELECT * FROM goods_param WHERE customer_id = ? ORDER BY id DESC').all(cid);
      res.json({ list, total: list.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/params', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const { name, type = '' } = req.body || {};
      if (!name || !String(name).trim()) return res.status(400).json({ error: '参数名称不能为空' });
      const r = db.prepare('INSERT INTO goods_param (customer_id, name, type) VALUES (?, ?, ?)')
        .run(cid, String(name).trim(), type);
      audit(req, 'goods_param_add', 'goods_param', r.lastInsertRowid, `新增参数模板 ${name}`);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/params/:id', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const exist = db.prepare('SELECT id FROM goods_param WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!exist) return res.status(404).json({ error: '参数不存在' });
      db.prepare('DELETE FROM goods_param WHERE id = ?').run(exist.id);
      audit(req, 'goods_param_del', 'goods_param', exist.id, '删除参数模板');
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 商城设置 ----------
  // 菜鸟云 duoproductsset/index 字段全集（1:1，2026-09-17 实测）
  const GOODS_SETTINGS_DEFAULTS = {
    // 支付规则
    onlinePay: 1, useYue: 0, cashOnDelivery: 0,
    codMethods: [], area: '', areaJson: '',
    useConsumerCard: 1,
    // 下单规则
    fullBuy: 0, enableFxsBuy: 0, unFxsLink: '', unFxsLinkType: '',
    useFormId: 0, payRedirect: '/pages/main_shop_order/main_shop_order', payRedirectType: 'page',
    payErrRedirect: '', payErrRedirectType: 'page', orderRemarks: '选填：建议填写和卖家商量好的内容~',
    // 快递配送
    express: 2, byouType: 2, baoyou: '', kdps: '快递配送', psName: '快递配送', freightFeeType: 1,
    // 同城配送
    citySend: 1, citySendId: 1, citySendShop: 0, ctps: '同城配送', ctName: '同城配送',
    // 到店自提
    takeSelf: 1, takeTime: 1, takeTimeName: '自取时间', takePhone: 1, takeSelfAddress: 0, ddzq: '到店自取', zqName: '到店自取',
    // 订单核销
    enableOrderRefund: 1, orderCancelTime: 30, supportTime: 15, receiving: 15,
    orderValidityType: 1, validityStartedAt: '', validityEndedAt: '', validityInterval: '',
    // 展示
    showOrderList: 1, showFxMoney: 0, showVipPrice: 0,
    priceShowValue: '', priceShowName: '点击查看', priceShowLink: '提示##非会员无法查看价格！', priceShowLinkType: 'popuptext',
    showCoupon: 1, shoppingCart: 1, cusId: 1, invoiceFormId: 0,
    goodsRecommend: '', goodsCategories: [], isEvaluate: 1, evaluateAudit: 0,
    // 分享
    shareTitle: '', shareImg: '',
  };
  router.get('/settings', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const cid = req.customerId;
      const row = db.prepare('SELECT config FROM goods_setting WHERE customer_id = ?').get(cid);
      let config = {};
      try { config = JSON.parse(row?.config || '{}'); } catch { config = {}; }
      res.json({ ...GOODS_SETTINGS_DEFAULTS, ...config });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/settings', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      // 保留应用专属字段（商品采集 APIKEY 已移入本应用，商城设置保存不得覆盖）
      const old = db.prepare('SELECT config FROM goods_setting WHERE customer_id = ?').get(cid);
      let oldConfig = {};
      try { oldConfig = JSON.parse(old?.config || '{}'); } catch { oldConfig = {}; }
      const config = { ...GOODS_SETTINGS_DEFAULTS, ...(req.body || {}), nineApiKey: oldConfig.nineApiKey || '' };
      db.prepare(
        `INSERT INTO goods_setting (customer_id, config, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(customer_id) DO UPDATE SET config = excluded.config, updated_at = datetime('now')`
      ).run(cid, JSON.stringify(config));
      audit(req, 'goods_settings_save', 'goods_setting', 0, '保存商城设置');
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 授权应用（商品类型 Tab 显示条件：卡密商品=电子卡密应用、虚拟商品=礼品卡券应用） ----------
  router.get('/licenses', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const cid = req.customerId;
      const granted = [];
      if (hasSolution(db, cid, 'card-carmi')) granted.push('card-carmi');
      // 注意：虚拟商品=默认开通（无授权绑定），礼品卡券/送礼物=独立营销应用，不在此处作为类型开关
      res.json({ apps: granted });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================================================
  // 订单管理（二期-A：列表/详情/发货/完成/退款；须在 /:id 之前注册）
  // ============================================================
  router.get('/orders', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const { status = '', keyword = '', page = 1, pageSize = 20 } = req.query;
      const result = svc.listOrders({ customerId: req.customerId, status, keyword, page: Number(page), pageSize: Number(pageSize) });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/orders/:id', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const order = svc.getOrderByTenant(req.customerId, req.params.id);
      if (!order) return res.status(404).json({ error: '订单不存在' });
      res.json(order);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/orders/:id/ship', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const order = svc.ship({ customerId: req.customerId, orderId: req.params.id });
      audit(req, 'ship', 'goods_order', order.id, `订单#${order.order_no} 发货`);
      res.json(order);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.post('/orders/:id/done', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const order = svc.done({ customerId: req.customerId, orderId: req.params.id });
      audit(req, 'done', 'goods_order', order.id, `订单#${order.order_no} 完成`);
      res.json(order);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.post('/orders/:id/refund', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const order = svc.refund({ customerId: req.customerId, orderId: req.params.id });
      audit(req, 'refund', 'goods_order', order.id, `订单#${order.order_no} 退款`);
      res.json(order);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ---------- 数据洞察（商品首页仪表盘） ----------
  router.get('/insight', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const { range = '7d' } = req.query;
      res.json(svc.getInsight({ customerId: req.customerId, range }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 售后订单（1:1 复刻菜鸟云 duoproducts/service） ----------
  router.get('/after-sales', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const { status = '', keyword = '', afterNo = '', page = 1, pageSize = 20 } = req.query;
      const result = svc.listAfterSales({ customerId: req.customerId, status, keyword, afterNo, page: Number(page), pageSize: Number(pageSize) });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/after-sales/export', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const { status = '', keyword = '', afterNo = '' } = req.query;
      const { list } = svc.listAfterSales({ customerId: req.customerId, status, keyword, afterNo, page: 1, pageSize: 10000 });
      const esc = (s) => String(s ?? '').replace(/"/g, '""');
      const rows = [['售后单号', '原订单号', '商品', '收货人', '手机', '售后类型', '售后状态', '退款金额', '退款理由', '拒绝原因', '申请时间']];
      for (const r of list) {
        rows.push([
          r.after_sale_no, r.order_no, esc(r.goods_desc || ''), esc(r.receiver_name), esc(r.receiver_phone),
          r.type === 'return' ? '退货退款' : '仅退款',
          { pending: '待处理', processing: '处理中', refunded: '退款完成', cancelled: '退款取消' }[r.status] || r.status,
          r.amountY, esc(r.reason), esc(r.refuse_reason), r.createdAt,
        ]);
      }
      const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="after-sales-${Date.now()}.csv"`);
      res.send(csv);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/after-sales/:id/agree', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const row = svc.agreeAfterSale({ customerId: req.customerId, id: req.params.id, amount: req.body.amount });
      audit(req, 'agree', 'goods_after_sale', row.id, `售后单#${row.after_sale_no} 同意退款 ¥${row.amountY}`);
      res.json(row);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.post('/after-sales/:id/refuse', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const row = svc.refuseAfterSale({ customerId: req.customerId, id: req.params.id, reason: req.body.reason });
      audit(req, 'refuse', 'goods_after_sale', row.id, `售后单#${row.after_sale_no} 拒绝退款`);
      res.json(row);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ---------- 退货地址（1:1 复刻菜鸟云 returnadd：新增地址/批量删除，表格 ID/收件人/手机号/详细地址/备注） ----------
  router.get('/return-addresses', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const list = db.prepare('SELECT * FROM goods_return_addr WHERE customer_id = ? ORDER BY id DESC').all(req.customerId);
      res.json({ list });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.post('/return-addresses', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const { name = '', phone = '', address = '', remark = '' } = req.body;
      if (!name.trim() || !phone.trim() || !address.trim()) return res.status(400).json({ error: '收件人、手机号、详细地址为必填' });
      const r = db.prepare('INSERT INTO goods_return_addr (customer_id, name, phone, address, remark) VALUES (?, ?, ?, ?, ?)')
        .run(req.customerId, name.trim(), phone.trim(), address.trim(), remark.trim());
      audit(req, 'create', 'goods_return_addr', r.lastInsertRowid, `新增退货地址 ${name.trim()}`);
      res.json({ id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.put('/return-addresses/:id', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const { name = '', phone = '', address = '', remark = '' } = req.body;
      if (!name.trim() || !phone.trim() || !address.trim()) return res.status(400).json({ error: '收件人、手机号、详细地址为必填' });
      const r = db.prepare('UPDATE goods_return_addr SET name = ?, phone = ?, address = ?, remark = ? WHERE id = ? AND customer_id = ?')
        .run(name.trim(), phone.trim(), address.trim(), remark.trim(), Number(req.params.id), req.customerId);
      if (!r.changes) return res.status(404).json({ error: '地址不存在' });
      audit(req, 'update', 'goods_return_addr', Number(req.params.id), `编辑退货地址 ${name.trim()}`);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.post('/return-addresses/batch-delete', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
      if (!ids.length) return res.status(400).json({ error: '请选择要删除的地址' });
      const st = db.prepare('DELETE FROM goods_return_addr WHERE id = ? AND customer_id = ?');
      const tx = db.prepare('BEGIN');
      tx.run();
      try {
        for (const id of ids) st.run(Number(id), req.customerId);
        db.prepare('COMMIT').run();
      } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
      audit(req, 'delete', 'goods_return_addr', 0, `批量删除退货地址 ${ids.length} 条`);
      res.json({ ok: true, count: ids.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.delete('/return-addresses/:id', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      db.prepare('DELETE FROM goods_return_addr WHERE id = ? AND customer_id = ?').run(Number(req.params.id), req.customerId);
      audit(req, 'delete', 'goods_return_addr', Number(req.params.id), '删除退货地址');
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 供应厂商（1:1 复刻菜鸟云 supplier：搜索/添加，表格 ID/供应商名称） ----------
  router.get('/suppliers', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const kw = String(req.query.keyword || '').trim();
      const list = kw
        ? db.prepare('SELECT * FROM goods_supplier WHERE customer_id = ? AND name LIKE ? ORDER BY id DESC').all(req.customerId, `%${kw}%`)
        : db.prepare('SELECT * FROM goods_supplier WHERE customer_id = ? ORDER BY id DESC').all(req.customerId);
      res.json({ list });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.post('/suppliers', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: '请输入供应商名称' });
      const r = db.prepare('INSERT INTO goods_supplier (customer_id, name) VALUES (?, ?)').run(req.customerId, name);
      audit(req, 'create', 'goods_supplier', r.lastInsertRowid, `新增供应厂商 ${name}`);
      res.json({ id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.delete('/suppliers/:id', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      db.prepare('DELETE FROM goods_supplier WHERE id = ? AND customer_id = ?').run(Number(req.params.id), req.customerId);
      audit(req, 'delete', 'goods_supplier', Number(req.params.id), '删除供应厂商');
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 品牌标签 / 标题标签 / 服务保障（1:1 复刻菜鸟云 productbrandtag/producttiletag/productserviceguar：搜索/新增/编辑/删除，表格 ID/排序/名称/内容或图标/启用） ----------
  const TAG_TABLES = {
    'brand-tags': { table: 'goods_brand_tag', label: '品牌标签', hasContent: true },
    'title-tags': { table: 'goods_title_tag', label: '标题标签', hasContent: true },
    'service-tags': { table: 'goods_service_tag', label: '服务保障', hasIcon: true },
  };
  Object.entries(TAG_TABLES).forEach(([path, cfg]) => {
    const { table, label, hasContent, hasIcon } = cfg;
    const rowToJson = (r) => ({ id: r.id, sortOrder: r.sort_order, name: r.name, content: hasContent ? r.content : undefined, icon: hasIcon ? r.icon : undefined, enabled: r.enabled, createdAt: r.created_at });
    router.get(`/${path}`, requireTenant, requireGoodsApp, (req, res) => {
      try {
        const kw = String(req.query.keyword || '').trim();
        const list = kw
          ? db.prepare(`SELECT * FROM ${table} WHERE customer_id = ? AND name LIKE ? ORDER BY sort_order DESC, id DESC`).all(req.customerId, `%${kw}%`)
          : db.prepare(`SELECT * FROM ${table} WHERE customer_id = ? ORDER BY sort_order DESC, id DESC`).all(req.customerId);
        res.json({ list: list.map(rowToJson) });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
    router.post(`/${path}`, requireTenant, requireGoodsApp, (req, res) => {
      try {
        if (!assertWritable(req, res)) return;
        const name = String(req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: `请输入${label}名称` });
        const content = hasContent ? String(req.body.content || '') : '';
        const icon = hasIcon ? String(req.body.icon || '') : '';
        const sortOrder = Number(req.body.sortOrder || 0);
        const enabled = req.body.enabled === false || req.body.enabled === 0 ? 0 : 1;
        const r = db.prepare(`INSERT INTO ${table} (customer_id, sort_order, name, content, icon, enabled) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(req.customerId, sortOrder, name, content, icon, enabled);
        audit(req, 'create', table, r.lastInsertRowid, `新增${label} ${name}`);
        res.json({ id: r.lastInsertRowid });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
    router.put(`/${path}/:id`, requireTenant, requireGoodsApp, (req, res) => {
      try {
        if (!assertWritable(req, res)) return;
        const id = Number(req.params.id);
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND customer_id = ?`).get(id, req.customerId);
        if (!row) return res.status(404).json({ error: `${label}不存在` });
        const name = req.body.name !== undefined ? String(req.body.name).trim() : row.name;
        if (!name) return res.status(400).json({ error: `请输入${label}名称` });
        const content = hasContent && req.body.content !== undefined ? String(req.body.content) : row.content;
        const icon = hasIcon && req.body.icon !== undefined ? String(req.body.icon) : row.icon;
        const sortOrder = req.body.sortOrder !== undefined ? Number(req.body.sortOrder) : row.sort_order;
        const enabled = req.body.enabled !== undefined ? (req.body.enabled === false || req.body.enabled === 0 ? 0 : 1) : row.enabled;
        db.prepare(`UPDATE ${table} SET sort_order = ?, name = ?, content = ?, icon = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(sortOrder, name, content, icon, enabled, id);
        audit(req, 'update', table, id, `编辑${label} ${name}`);
        res.json({ ok: true });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
    router.delete(`/${path}/:id`, requireTenant, requireGoodsApp, (req, res) => {
      try {
        if (!assertWritable(req, res)) return;
        db.prepare(`DELETE FROM ${table} WHERE id = ? AND customer_id = ?`).run(Number(req.params.id), req.customerId);
        audit(req, 'delete', table, Number(req.params.id), `删除${label}`);
        res.json({ ok: true });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  });

  // ---------- 评论管理（1:1 复刻菜鸟云 evaluate：筛选 全部/好评/中评/差评 + 关键字；添加评论/批量删除，表格 产品ID/商品名称/订单号/评价人/级别/内容/图片/匿名/状态） ----------
  router.get('/comments', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const { level = '', keyword = '', page = 1, pageSize = 20 } = req.query;
      const cond = ['customer_id = ?'];
      const args = [req.customerId];
      if (String(level) !== '') { cond.push('level = ?'); args.push(Number(level)); }
      if (String(keyword || '').trim()) {
        cond.push('(goods_name LIKE ? OR order_no LIKE ? OR username LIKE ?)');
        const kw = `%${String(keyword).trim()}%`;
        args.push(kw, kw, kw);
      }
      const total = db.prepare(`SELECT COUNT(*) c FROM goods_comment WHERE ${cond.join(' AND ')}`).get(...args).c;
      const list = db.prepare(`SELECT * FROM goods_comment WHERE ${cond.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`)
        .all(...args, Number(pageSize), (Number(page) - 1) * Number(pageSize));
      const fmt = (r) => ({ id: r.id, goodsId: r.goods_id, goodsName: r.goods_name, orderNo: r.order_no, username: r.username, level: r.level, content: r.content, images: JSON.parse(r.images || '[]'), anonymous: r.anonymous, status: r.status, createdAt: r.created_at });
      res.json({ total, list: list.map(fmt) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.post('/comments', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const goodsId = Number(req.body.goodsId || 0);
      const goodsName = String(req.body.goodsName || '').trim();
      const orderNo = String(req.body.orderNo || '').trim();
      const username = String(req.body.username || '').trim();
      const level = Number(req.body.level || 1);
      const content = String(req.body.content || '').trim();
      const images = JSON.stringify(Array.isArray(req.body.images) ? req.body.images : []);
      const anonymous = req.body.anonymous ? 1 : 0;
      const status = req.body.status === 'hide' ? 'hide' : 'show';
      if (!goodsName && !username) return res.status(400).json({ error: '商品名称或评价人为必填' });
      const r = db.prepare('INSERT INTO goods_comment (customer_id, goods_id, goods_name, order_no, username, level, content, images, anonymous, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(req.customerId, goodsId, goodsName, orderNo, username, level, content, images, anonymous, status);
      audit(req, 'create', 'goods_comment', r.lastInsertRowid, `新增评论（${level}）${goodsName}`);
      res.json({ id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.put('/comments/:id/status', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      db.prepare('UPDATE goods_comment SET status = ?, updated_at = datetime(\'now\') WHERE id = ? AND customer_id = ?')
        .run(req.body.status === 'hide' ? 'hide' : 'show', Number(req.params.id), req.customerId);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.delete('/comments/:id', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      db.prepare('DELETE FROM goods_comment WHERE id = ? AND customer_id = ?').run(Number(req.params.id), req.customerId);
      audit(req, 'delete', 'goods_comment', Number(req.params.id), '删除评论');
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.post('/comments/batch-delete', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
      if (!ids.length) return res.status(400).json({ error: '请选择要删除的评论' });
      const st = db.prepare('DELETE FROM goods_comment WHERE id = ? AND customer_id = ?');
      db.prepare('BEGIN').run();
      try {
        for (const id of ids) st.run(Number(id), req.customerId);
        db.prepare('COMMIT').run();
      } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
      audit(req, 'delete', 'goods_comment', 0, `批量删除评论 ${ids.length} 条`);
      res.json({ ok: true, count: ids.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 商城风格（1:1 复刻菜鸟云 duoproducts/cateset：分类风格 1/2 + 详情风格 1/2/3 + 卡片/分享/价格全参数） ----------
  router.get('/category-style', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM goods_cate_style WHERE customer_id = ?').get(req.customerId);
      res.json({
        cateStyle: row?.cate_style || 1,
        detailStyle: row?.detail_style || 1,
        goodsIscard: row?.goods_iscard ?? 2,
        shareStyle: row?.share_style || 1,
        pbgStyle: row?.pbg_style || 1,
        pbgImg: row?.pbg_img || 1,
        pbgMode: row?.pbg_mode || 1,
        pbgTheme: row?.pbg_theme || 1,
        pbgImgCustom: row?.pbg_img_custom || '',
        pbgThemeCustom: row?.pbg_theme_custom || '',
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.put('/category-style', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const b = req.body;
      const cateStyle = b.cateStyle === 2 ? 2 : 1;
      const detailStyle = [1, 2, 3].includes(Number(b.detailStyle)) ? Number(b.detailStyle) : 1;
      const goodsIscard = b.goodsIscard === 1 ? 1 : 2;
      const shareStyle = b.shareStyle === 2 ? 2 : 1;
      const pbgStyle = b.pbgStyle === 2 ? 2 : 1;
      const pbgImg = Number(b.pbgImg) >= 0 && Number(b.pbgImg) <= 13 ? Number(b.pbgImg) : 1;
      const pbgMode = b.pbgMode === 2 ? 2 : 1;
      const pbgTheme = Number(b.pbgTheme) >= 0 && Number(b.pbgTheme) <= 13 ? Number(b.pbgTheme) : 1;
      const pbgImgCustom = String(b.pbgImgCustom || '').slice(0, 500);
      const pbgThemeCustom = String(b.pbgThemeCustom || '').slice(0, 500);
      db.prepare(`INSERT INTO goods_cate_style (customer_id, cate_style, detail_style, goods_iscard, share_style, pbg_style, pbg_img, pbg_mode, pbg_theme, pbg_img_custom, pbg_theme_custom, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                  ON CONFLICT(customer_id) DO UPDATE SET
                    cate_style = excluded.cate_style, detail_style = excluded.detail_style,
                    goods_iscard = excluded.goods_iscard, share_style = excluded.share_style,
                    pbg_style = excluded.pbg_style, pbg_img = excluded.pbg_img,
                    pbg_mode = excluded.pbg_mode, pbg_theme = excluded.pbg_theme,
                    pbg_img_custom = excluded.pbg_img_custom, pbg_theme_custom = excluded.pbg_theme_custom,
                    updated_at = datetime('now')`)
        .run(req.customerId, cateStyle, detailStyle, goodsIscard, shareStyle, pbgStyle, pbgImg, pbgMode, pbgTheme, pbgImgCustom, pbgThemeCustom);
      audit(req, 'update', 'goods_cate_style', req.customerId, `商城风格：分类${cateStyle} 详情${detailStyle} 卡片${goodsIscard} 分享${shareStyle} 价格${pbgStyle} 背景${pbgImg} 模式${pbgMode} 主题${pbgTheme}`);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 商品采集（独立应用 goods-collect：提交采集任务记录；真实抓取需对接第三方采集 APIKEY） ----------
  // 采集 APIKEY（自商城设置移入商品采集应用；同存 goods_setting.config.nineApiKey，数据不丢失）
  router.get('/collect-config', requireTenant, (req, res) => {
    try {
      const row = db.prepare('SELECT config FROM goods_setting WHERE customer_id = ?').get(req.customerId);
      let config = {};
      try { config = JSON.parse(row?.config || '{}'); } catch { config = {}; }
      res.json({ nineApiKey: config.nineApiKey || '' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.put('/collect-config', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const row = db.prepare('SELECT config FROM goods_setting WHERE customer_id = ?').get(cid);
      let config = {};
      try { config = JSON.parse(row?.config || '{}'); } catch { config = {}; }
      config.nineApiKey = String(req.body.nineApiKey || '').trim();
      db.prepare(
        `INSERT INTO goods_setting (customer_id, config, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(customer_id) DO UPDATE SET config = excluded.config, updated_at = datetime('now')`
      ).run(cid, JSON.stringify(config));
      audit(req, 'update', 'goods_collect_config', 0, '保存商品采集 APIKEY');
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.get('/collects', requireTenant, (req, res) => {
    try {
      const list = db.prepare('SELECT * FROM goods_collect WHERE customer_id = ? ORDER BY id DESC LIMIT 100').all(req.customerId);
      res.json({ list: list.map((r) => ({ id: r.id, link: r.link, categoryId: r.category_id, status: r.status, state: r.state, createdAt: r.created_at })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.post('/collects', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const links = String(req.body.link || '').split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
      if (!links.length) return res.status(400).json({ error: '请输入商品链接' });
      const categoryId = Number(req.body.categoryId || 0);
      const status = req.body.status === 'on' ? 'on' : 'off';
      const st = db.prepare('INSERT INTO goods_collect (customer_id, link, category_id, status, state) VALUES (?, ?, ?, ?, \'pending\')');
      db.prepare('BEGIN').run();
      try {
        for (const link of links) st.run(req.customerId, link, categoryId, status);
        db.prepare('COMMIT').run();
      } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
      audit(req, 'create', 'goods_collect', 0, `提交商品采集 ${links.length} 条`);
      res.json({ ok: true, count: links.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:id', requireTenant, requireGoodsApp, (req, res) => {
    try {
      const cid = req.customerId;
      const row = db.prepare('SELECT * FROM goods WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!row) return res.status(404).json({ error: '商品不存在' });
      const g = rowToGoods(row);
      g.skus = db.prepare('SELECT * FROM goods_sku WHERE goods_id = ?').all(row.id);
      res.json(g);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });


  router.put('/:id', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const exist = db.prepare('SELECT id FROM goods WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!exist) return res.status(404).json({ error: '商品不存在' });
      const g = normalizeGoods(req.body || {});
      if (!g.title) return res.status(400).json({ error: '商品名称不能为空' });
      db.prepare(
        `UPDATE goods SET top_type = ?, type = ?, status = ?, sort_order = ?, title = ?, cate_ids = ?, images = ?,
           thumb = ?, info = ?, pickup = ?, freight_mode = ?, fixed_freight = ?, sale_mode = ?, spec_mode = ?, stock = ?,
           min_buy = ?, weight = ?, price = ?, market_price = ?, cost_price = ?, goods_no = ?, member_price = ?,
           param = ?, recommend = ?, unit = ?, views = ?, real_sales = ?, fake_sales = ?, fake_people = ?, super_form = ?,
           video = ?, video_cover = ?, video_play = ?, tags = ?, brief = ?, brand_tag = ?, title_tag = ?, service = ?,
           marketing = ?, member = ?, distribution = ?, advanced = ?, phone_required = ?, card_key_id = ?,
           updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        g.topType, g.type, g.status, g.sortOrder, g.title, JSON.stringify(g.cateIds), JSON.stringify(g.images),
        g.thumb, g.info, g.pickup, g.freightMode, g.fixedFreight, g.saleMode, g.specMode, g.stock, g.minBuy,
        g.weight, g.price, g.marketPrice, g.costPrice, g.goodsNo, JSON.stringify(g.memberPrice), JSON.stringify(g.param),
        g.recommend, g.unit, g.views, g.realSales, g.fakeSales, g.fakePeople, g.superForm, g.video, g.videoCover,
        g.videoPlay, g.tags, g.brief, g.brandTag, g.titleTag, JSON.stringify(g.service), JSON.stringify(g.marketing),
        JSON.stringify(g.member), JSON.stringify(g.distribution), JSON.stringify(g.advanced), g.phoneRequired, g.cardKeyId,
        exist.id
      );
      db.prepare('DELETE FROM goods_sku WHERE goods_id = ?').run(exist.id);
      saveSkus(db, exist.id, g.skus || []);
      audit(req, 'goods_edit', 'goods', exist.id, `编辑商品 ${g.title}`);
      res.json({ success: true, id: exist.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });


  router.delete('/:id', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const exist = db.prepare('SELECT id FROM goods WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!exist) return res.status(404).json({ error: '商品不存在' });
      db.prepare('DELETE FROM goods WHERE id = ?').run(exist.id);
      db.prepare('DELETE FROM goods_sku WHERE goods_id = ?').run(exist.id);
      audit(req, 'goods_del', 'goods', exist.id, '删除商品');
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });


  // 复制商品（对标行操作「复制」）
  router.post('/:id/copy', requireTenant, requireGoodsApp, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const src = db.prepare('SELECT * FROM goods WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!src) return res.status(404).json({ error: '商品不存在' });
      const g = rowToGoods(src);
      const r = db.prepare(
        `INSERT INTO goods (customer_id, top_type, type, status, sort_order, title, cate_ids, images, thumb, info,
           pickup, freight_mode, fixed_freight, sale_mode, spec_mode, stock, min_buy, weight, price, market_price,
           cost_price, goods_no, member_price, param, recommend, unit, views, real_sales, fake_sales, fake_people,
           super_form, video, video_cover, video_play, tags, brief, brand_tag, title_tag, service, marketing, member,
           distribution, advanced, phone_required, card_key_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        cid, g.topType, g.type, 'off', 0, `${g.title}（副本）`, JSON.stringify(g.cateIds), JSON.stringify(g.images),
        g.thumb, g.info, g.pickup, g.freightMode, g.fixedFreight, g.saleMode, g.specMode, g.stock, g.minBuy,
        g.weight, g.price, g.marketPrice, g.costPrice, g.goodsNo, JSON.stringify(g.memberPrice), JSON.stringify(g.param),
        0, g.unit, 0, 0, 0, 0, g.superForm, g.video, g.videoCover, g.videoPlay, g.tags, g.brief, g.brandTag,
        g.titleTag, JSON.stringify(g.service), JSON.stringify(g.marketing), JSON.stringify(g.member),
        JSON.stringify(g.distribution), JSON.stringify(g.advanced), g.phoneRequired, g.cardKeyId
      );
      const skus = db.prepare('SELECT * FROM goods_sku WHERE goods_id = ?').all(src.id);
      for (const s of skus) {
        db.prepare('INSERT INTO goods_sku (goods_id, spec_json, price, stock) VALUES (?, ?, ?, ?)')
          .run(r.lastInsertRowid, s.spec_json, s.price, s.stock);
      }
      audit(req, 'goods_copy', 'goods', r.lastInsertRowid, `复制商品 ${g.title}`);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });


  return router;
}

// ---------- 工具 ----------
function saveSkus(db, goodsId, skus) {
  const ins = db.prepare('INSERT INTO goods_sku (goods_id, spec_json, price, stock) VALUES (?, ?, ?, ?)');
  for (const s of skus || []) {
    ins.run(goodsId, JSON.stringify(s.specJson || {}), Number(s.price) || 0, Number(s.stock) || 0);
  }
}

function normalizeGoods(body) {
  return {
    topType: Number(body.topType) || 1,
    type: ['normal', 'carmi', 'virtual'].includes(body.type) ? body.type : 'normal',
    status: ['sell', 'off', 'expired'].includes(body.status) ? body.status : 'sell',
    sortOrder: Number(body.sortOrder) || 0,
    title: String(body.title || '').trim(),
    cateIds: Array.isArray(body.cateIds) ? body.cateIds.map(Number) : [],
    images: Array.isArray(body.images) ? body.images : [],
    thumb: body.thumb || '',
    info: body.info || '',
    pickup: body.pickup || 'express',
    freightMode: body.freightMode || 'fixed',
    fixedFreight: Number(body.fixedFreight) || 0,
    saleMode: body.saleMode || 'online',
    specMode: body.specMode || 'single',
    stock: Number(body.stock) || 0,
    minBuy: Number(body.minBuy) || 1,
    weight: Number(body.weight) || 0,
    price: Number(body.price) || 0,
    marketPrice: Number(body.marketPrice) || 0,
    costPrice: Number(body.costPrice) || 0,
    goodsNo: body.goodsNo || '',
    memberPrice: body.memberPrice && typeof body.memberPrice === 'object' ? body.memberPrice : {},
    param: Array.isArray(body.param) ? body.param : [],
    recommend: body.recommend ? 1 : 0,
    unit: body.unit || '',
    views: Number(body.views) || 0,
    realSales: Number(body.realSales) || 0,
    fakeSales: Number(body.fakeSales) || 0,
    fakePeople: Number(body.fakePeople) || 0,
    superForm: body.superForm || '',
    video: body.video || '',
    videoCover: body.videoCover || '',
    videoPlay: body.videoPlay || 'popup',
    tags: body.tags || '',
    brief: body.brief || '',
    brandTag: body.brandTag || '',
    titleTag: body.titleTag || '',
    service: Array.isArray(body.service) ? body.service : [],
    marketing: body.marketing && typeof body.marketing === 'object' ? body.marketing : {},
    member: body.member && typeof body.member === 'object' ? body.member : {},
    distribution: body.distribution && typeof body.distribution === 'object' ? body.distribution : {},
    advanced: body.advanced && typeof body.advanced === 'object' ? body.advanced : {},
    phoneRequired: [0, 1, 2].includes(Number(body.phoneRequired)) ? Number(body.phoneRequired) : 0,  // 0不展示 1必填 2选填（卡密/虚拟）
    cardKeyId: body.cardKeyId ? Number(body.cardKeyId) : null,                                     // 卡密库（仅卡密，二期）
    skus: Array.isArray(body.skus) ? body.skus : [],
  };
}

function rowToGoods(r) {
  const parse = (v, fb) => { try { return JSON.parse(v); } catch { return fb; } };
  return {
    id: r.id,
    topType: r.top_type,
    type: r.type,
    status: r.status,
    sortOrder: r.sort_order,
    title: r.title,
    cateIds: parse(r.cate_ids, []),
    images: parse(r.images, []),
    thumb: r.thumb,
    info: r.info,
    pickup: r.pickup,
    freightMode: r.freight_mode,
    fixedFreight: r.fixed_freight,
    saleMode: r.sale_mode,
    specMode: r.spec_mode,
    stock: r.stock,
    minBuy: r.min_buy,
    weight: r.weight,
    price: r.price,
    marketPrice: r.market_price,
    newUserPrice: r.new_user_price || 0,
    costPrice: r.cost_price,
    goodsNo: r.goods_no,
    memberPrice: parse(r.member_price, {}),
    param: parse(r.param, []),
    recommend: r.recommend,
    unit: r.unit,
    views: r.views,
    realSales: r.real_sales,
    fakeSales: r.fake_sales,
    fakePeople: r.fake_people,
    superForm: r.super_form,
    video: r.video,
    videoCover: r.video_cover,
    videoPlay: r.video_play,
    tags: r.tags,
    brief: r.brief,
    brandTag: r.brand_tag,
    titleTag: r.title_tag,
    service: parse(r.service, []),
    marketing: parse(r.marketing, {}),
    member: parse(r.member, {}),
    distribution: parse(r.distribution, {}),
    advanced: parse(r.advanced, {}),
    phoneRequired: r.phone_required ?? 0,
    cardKeyId: r.card_key_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
