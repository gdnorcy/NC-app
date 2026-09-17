// 送礼物（1:1 复刻菜鸟云 giftForYou：从商品库绑定礼物商品 + 批量开启/关闭）
// 授权：需开通「送礼物」应用（card-gift）；数据按 customer_id 租户隔离
import { Router } from 'express';
import { tenantState, hasSolution } from '../tenant.js';
import { addOperationLog } from '../db.js';

export function createGiftRouter(db) {
  const router = Router();

  function requireTenant(req, res, next) {
    const user = req.user;
    if (!user || !['tenant_admin', 'tenant_member'].includes(user.role)) {
      return res.status(403).json({ error: '无权访问客户后台' });
    }
    if (!user.customerId) return res.status(403).json({ error: '账号未关联客户项目' });
    const state = tenantState(db, user.customerId, { ctx: 'admin' });
    if (state.missing) return res.status(404).json({ error: '客户项目不存在' });
    if (!state.active) {
      if (state.readonly && req.method === 'GET') {
        req.customerId = user.customerId;
        req.tenantReadonly = true;
        return next();
      }
      return res.status(403).json({ error: state.reason });
    }
    req.customerId = user.customerId;
    next();
  }

  function requireGift(req, res, next) {
    if (!hasSolution(db, req.customerId, 'card-gift')) {
      return res.status(403).json({ error: '未开通「送礼物」应用，请联系平台管理员开通' });
    }
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
    } catch { /* 日志失败不阻断 */ }
  }

  function assertWritable(req, res) {
    if (req.tenantReadonly) { res.status(403).json({ error: '服务已到期，当前为只读模式' }); return false; }
    return true;
  }

  // ---------- 基础设置（1:1 复刻菜鸟云 setView：开关/分享样式/过期时间/标准运费/礼物赠言） ----------
  router.get('/settings', requireTenant, requireGift, (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM gift_config WHERE customer_id = ?').get(req.customerId);
      res.json(row ? {
        status: row.status, shareStyle: row.share_style, expireHour: row.expire_hour,
        normDeliveryFee: row.norm_delivery_fee, messages: safeJson(row.messages),
      } : { status: 1, shareStyle: 1, expireHour: 0, normDeliveryFee: 0, messages: [] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/settings', requireTenant, requireGift, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const b = req.body;
      const messages = Array.isArray(b.messages) ? b.messages.filter((m) => String(m || '').trim()).map((m) => String(m).trim()) : [];
      db.prepare(
        `INSERT INTO gift_config (customer_id, status, share_style, expire_hour, norm_delivery_fee, messages)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(customer_id) DO UPDATE SET status=excluded.status, share_style=excluded.share_style,
           expire_hour=excluded.expire_hour, norm_delivery_fee=excluded.norm_delivery_fee,
           messages=excluded.messages, updated_at=datetime('now')`
      ).run(cid, Number(b.status) === 0 ? 0 : 1, Number(b.shareStyle) === 2 ? 2 : (Number(b.shareStyle) === 3 ? 3 : 1),
        Number(b.expireHour) || 0, Math.round((Number(b.normDeliveryFee) || 0) * 100), JSON.stringify(messages));
      audit(req, 'update', 'gift_config', 0, '更新送礼物基础设置');
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  function safeJson(s) { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }

  // 礼物商品列表：join goods，含绑定状态（status 0关 1开）
  router.get('/products', requireTenant, requireGift, (req, res) => {
    try {
      const cid = req.customerId;
      const kw = String(req.query.key || '').trim();
      const cateId = Number(req.query.cateId) || 0;
      const conds = ['g.customer_id = ?'];
      const params = [cid];
      if (kw) { conds.push('g.title LIKE ?'); params.push(`%${kw}%`); }
      if (cateId) { conds.push('g.id IN (SELECT product_id FROM goods_categories WHERE cate_id = ?)'); params.push(cateId); }
      const rows = db.prepare(
        `SELECT g.id, g.title, g.thumb, g.price, g.stock, g.status AS gstatus,
                IFNULL(gp.status, 0) AS bound, gp.id AS gp_id
         FROM goods g LEFT JOIN gift_product gp ON gp.product_id = g.id AND gp.customer_id = ?
         WHERE ${conds.join(' AND ')}
         ORDER BY gp.id DESC, g.id DESC`
      ).all(cid, ...params);
      res.json(rows.map(r => ({
        id: r.id, title: r.title, thumb: r.thumb, price: r.price, stock: r.stock,
        goodsStatus: r.gstatus, bound: r.bound, isBound: !!r.gp_id, gpId: r.gp_id,
      })));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 绑定商品为礼物（批量）
  router.post('/products/bind', requireTenant, requireGift, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const ids = Array.isArray(req.body.productIds) ? req.body.productIds.map(Number).filter(Boolean) : [];
      if (!ids.length) return res.status(400).json({ error: '请选择要绑定的商品' });
      const ins = db.prepare('INSERT OR IGNORE INTO gift_product (customer_id, product_id) VALUES (?, ?)');
      const ex = db.prepare('SELECT id FROM gift_product WHERE customer_id = ? AND product_id = ?');
      let added = 0;
      for (const pid of ids) {
        const g = db.prepare('SELECT id FROM goods WHERE id = ? AND customer_id = ?').get(pid, cid);
        if (!g) continue;
        if (ex.get(cid, pid)) continue;
        ins.run(cid, pid);
        added++;
      }
      audit(req, 'create', 'gift_product', 0, `绑定 ${added} 个礼物商品`);
      res.json({ bound: added });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 批量开启/关闭
  router.post('/products/toggle', requireTenant, requireGift, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
      const status = Number(req.body.status) === 1 ? 1 : 0;
      if (!ids.length) return res.status(400).json({ error: '请选择要操作的商品' });
      const marks = ids.map(() => '?').join(',');
      const r = db.prepare(`UPDATE gift_product SET status = ? WHERE customer_id = ? AND id IN (${marks})`).run(status, cid, ...ids);
      audit(req, 'update', 'gift_product', 0, `${status ? '开启' : '关闭'} ${r.changes} 个礼物商品`);
      res.json({ updated: r.changes });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 单个开启/关闭（行内操作）
  router.post('/products/:id/toggle', requireTenant, requireGift, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const id = Number(req.params.id);
      const status = Number(req.body.status) === 1 ? 1 : 0;
      const r = db.prepare('UPDATE gift_product SET status = ? WHERE id = ? AND customer_id = ?').run(status, id, cid);
      if (!r.changes) return res.status(404).json({ error: '绑定记录不存在' });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 解绑（移除礼物）
  router.delete('/products/:id', requireTenant, requireGift, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const r = db.prepare('DELETE FROM gift_product WHERE id = ? AND customer_id = ?').run(Number(req.params.id), cid);
      if (!r.changes) return res.status(404).json({ error: '绑定记录不存在' });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
