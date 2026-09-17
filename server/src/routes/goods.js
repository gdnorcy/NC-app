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
  router.get('/categories', requireTenant, (req, res) => {
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

  router.post('/categories', requireTenant, (req, res) => {
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

  router.put('/categories/:id', requireTenant, (req, res) => {
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

  router.delete('/categories/:id', requireTenant, (req, res) => {
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
  router.post('/categories/batch', requireTenant, (req, res) => {
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
  router.get('/', requireTenant, (req, res) => {
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

  router.post('/', requireTenant, (req, res) => {
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
           distribution, advanced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        cid, g.topType, g.type, g.status, g.sortOrder, g.title, JSON.stringify(g.cateIds), JSON.stringify(g.images),
        g.thumb, g.info, g.pickup, g.freightMode, g.fixedFreight, g.saleMode, g.specMode, g.stock, g.minBuy,
        g.weight, g.price, g.marketPrice, g.costPrice, g.goodsNo, JSON.stringify(g.memberPrice), JSON.stringify(g.param),
        g.recommend, g.unit, g.views, g.realSales, g.fakeSales, g.fakePeople, g.superForm, g.video, g.videoCover,
        g.videoPlay, g.tags, g.brief, g.brandTag, g.titleTag, JSON.stringify(g.service), JSON.stringify(g.marketing),
        JSON.stringify(g.member), JSON.stringify(g.distribution), JSON.stringify(g.advanced)
      );
      saveSkus(db, r.lastInsertRowid, g.skus || []);
      audit(req, 'goods_add', 'goods', r.lastInsertRowid, `新增商品 ${g.title}`);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 批量操作：up 上架 / down 下架 / del 删除（对标工具栏 批量下架；行内 上架/下架）
  router.post('/batch', requireTenant, (req, res) => {
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
  router.get('/params', requireTenant, (req, res) => {
    try {
      const cid = req.customerId;
      const { keyword = '' } = req.query;
      const list = keyword
        ? db.prepare('SELECT * FROM goods_param WHERE customer_id = ? AND name LIKE ? ORDER BY id DESC').all(cid, `%${keyword}%`)
        : db.prepare('SELECT * FROM goods_param WHERE customer_id = ? ORDER BY id DESC').all(cid);
      res.json({ list, total: list.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/params', requireTenant, (req, res) => {
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

  router.delete('/params/:id', requireTenant, (req, res) => {
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
  router.get('/settings', requireTenant, (req, res) => {
    try {
      const cid = req.customerId;
      const row = db.prepare('SELECT config FROM goods_setting WHERE customer_id = ?').get(cid);
      let config = {};
      try { config = JSON.parse(row?.config || '{}'); } catch { config = {}; }
      res.json(config);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/settings', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const config = req.body || {};
      db.prepare(
        `INSERT INTO goods_setting (customer_id, config, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(customer_id) DO UPDATE SET config = excluded.config, updated_at = datetime('now')`
      ).run(cid, JSON.stringify(config));
      audit(req, 'goods_settings_save', 'goods_setting', 0, '保存商城设置');
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 授权应用（商品类型 Tab 显示条件：卡密商品=电子卡密应用、虚拟商品=送礼物应用） ----------
  router.get('/licenses', requireTenant, (req, res) => {
    try {
      const cid = req.customerId;
      const granted = [];
      if (hasSolution(db, cid, 'card-carmi')) granted.push('card-carmi');
      if (hasSolution(db, cid, 'card-gift')) granted.push('card-gift');
      res.json({ apps: granted });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================================================
  // 订单管理（二期-A：列表/详情/发货/完成/退款；须在 /:id 之前注册）
  // ============================================================
  router.get('/orders', requireTenant, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const { status = '', keyword = '', page = 1, pageSize = 20 } = req.query;
      const result = svc.listOrders({ customerId: req.customerId, status, keyword, page: Number(page), pageSize: Number(pageSize) });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/orders/:id', requireTenant, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const order = svc.getOrderByTenant(req.customerId, req.params.id);
      if (!order) return res.status(404).json({ error: '订单不存在' });
      res.json(order);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/orders/:id/ship', requireTenant, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const order = svc.ship({ customerId: req.customerId, orderId: req.params.id });
      audit(req, 'ship', 'goods_order', order.id, `订单#${order.order_no} 发货`);
      res.json(order);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.post('/orders/:id/done', requireTenant, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const order = svc.done({ customerId: req.customerId, orderId: req.params.id });
      audit(req, 'done', 'goods_order', order.id, `订单#${order.order_no} 完成`);
      res.json(order);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.post('/orders/:id/refund', requireTenant, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const order = svc.refund({ customerId: req.customerId, orderId: req.params.id });
      audit(req, 'refund', 'goods_order', order.id, `订单#${order.order_no} 退款`);
      res.json(order);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.get('/:id', requireTenant, (req, res) => {
    try {
      const cid = req.customerId;
      const row = db.prepare('SELECT * FROM goods WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!row) return res.status(404).json({ error: '商品不存在' });
      const g = rowToGoods(row);
      g.skus = db.prepare('SELECT * FROM goods_sku WHERE goods_id = ?').all(row.id);
      res.json(g);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });


  router.put('/:id', requireTenant, (req, res) => {
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
           marketing = ?, member = ?, distribution = ?, advanced = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        g.topType, g.type, g.status, g.sortOrder, g.title, JSON.stringify(g.cateIds), JSON.stringify(g.images),
        g.thumb, g.info, g.pickup, g.freightMode, g.fixedFreight, g.saleMode, g.specMode, g.stock, g.minBuy,
        g.weight, g.price, g.marketPrice, g.costPrice, g.goodsNo, JSON.stringify(g.memberPrice), JSON.stringify(g.param),
        g.recommend, g.unit, g.views, g.realSales, g.fakeSales, g.fakePeople, g.superForm, g.video, g.videoCover,
        g.videoPlay, g.tags, g.brief, g.brandTag, g.titleTag, JSON.stringify(g.service), JSON.stringify(g.marketing),
        JSON.stringify(g.member), JSON.stringify(g.distribution), JSON.stringify(g.advanced), exist.id
      );
      db.prepare('DELETE FROM goods_sku WHERE goods_id = ?').run(exist.id);
      saveSkus(db, exist.id, g.skus || []);
      audit(req, 'goods_edit', 'goods', exist.id, `编辑商品 ${g.title}`);
      res.json({ success: true, id: exist.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });


  router.delete('/:id', requireTenant, (req, res) => {
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
  router.post('/:id/copy', requireTenant, (req, res) => {
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
           distribution, advanced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        cid, g.topType, g.type, 'off', 0, `${g.title}（副本）`, JSON.stringify(g.cateIds), JSON.stringify(g.images),
        g.thumb, g.info, g.pickup, g.freightMode, g.fixedFreight, g.saleMode, g.specMode, g.stock, g.minBuy,
        g.weight, g.price, g.marketPrice, g.costPrice, g.goodsNo, JSON.stringify(g.memberPrice), JSON.stringify(g.param),
        0, g.unit, 0, 0, 0, 0, g.superForm, g.video, g.videoCover, g.videoPlay, g.tags, g.brief, g.brandTag,
        g.titleTag, JSON.stringify(g.service), JSON.stringify(g.marketing), JSON.stringify(g.member),
        JSON.stringify(g.distribution), JSON.stringify(g.advanced)
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
    type: ['normal', 'card', 'gift'].includes(body.type) ? body.type : 'normal',
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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
