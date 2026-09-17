// 礼品卡券（1:1 复刻菜鸟云 giftcard：卡券分类 + 卡券 CRUD）
// 授权：需开通「礼品卡券」应用（card-ticket）；数据按 customer_id 租户隔离
import { Router } from 'express';
import { tenantState, hasSolution } from '../tenant.js';
import { addOperationLog } from '../db.js';

export function createGiftCardRouter(db) {
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

  function requireTicket(req, res, next) {
    if (!hasSolution(db, req.customerId, 'card-ticket')) {
      return res.status(403).json({ error: '未开通「礼品卡券」应用，请联系平台管理员开通' });
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

  // ---------- 卡券分类 ----------
  router.get('/categories', requireTenant, requireTicket, (req, res) => {
    try {
      const cid = req.customerId;
      const rows = db.prepare('SELECT * FROM giftcard_category WHERE customer_id = ? ORDER BY sort DESC, id DESC').all(cid);
      const cnt = db.prepare('SELECT cate_id, COUNT(*) n FROM giftcard WHERE customer_id = ? GROUP BY cate_id').all(cid);
      const m = new Map(cnt.map(r => [r.cate_id, r.n]));
      res.json(rows.map(r => ({ id: r.id, name: r.name, sort: r.sort, cardCount: m.get(r.id) || 0, createdAt: r.created_at })));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/categories', requireTenant, requireTicket, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: '请输入分类名称' });
      const dup = db.prepare('SELECT id FROM giftcard_category WHERE customer_id = ? AND name = ?').get(cid, name);
      if (dup) return res.status(400).json({ error: '分类名称已存在' });
      const r = db.prepare('INSERT INTO giftcard_category (customer_id, name, sort) VALUES (?, ?, ?)').run(cid, name, Number(req.body.sort) || 0);
      audit(req, 'create', 'giftcard_category', Number(r.lastInsertRowid), `新增卡券分类：${name}`);
      res.json({ id: Number(r.lastInsertRowid) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/categories/:id', requireTenant, requireTicket, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const id = Number(req.params.id);
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: '请输入分类名称' });
      const dup = db.prepare('SELECT id FROM giftcard_category WHERE customer_id = ? AND name = ? AND id != ?').get(cid, name, id);
      if (dup) return res.status(400).json({ error: '分类名称已存在' });
      const r = db.prepare("UPDATE giftcard_category SET name = ?, sort = ?, updated_at = datetime('now') WHERE id = ? AND customer_id = ?").run(name, Number(req.body.sort) || 0, id, cid);
      if (!r.changes) return res.status(404).json({ error: '分类不存在' });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/categories/:id', requireTenant, requireTicket, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const id = Number(req.params.id);
      const n = db.prepare('SELECT COUNT(*) n FROM giftcard WHERE customer_id = ? AND cate_id = ?').get(cid, id).n;
      if (n > 0) return res.status(400).json({ error: `该分类下还有 ${n} 张卡券，请先删除卡券` });
      const r = db.prepare('DELETE FROM giftcard_category WHERE id = ? AND customer_id = ?').run(id, cid);
      if (!r.changes) return res.status(404).json({ error: '分类不存在' });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 卡券 ----------
  router.get('/cards', requireTenant, requireTicket, (req, res) => {
    try {
      const cid = req.customerId;
      const conds = ['customer_id = ?'];
      const params = [cid];
      const cateId = Number(req.query.cateId) || 0;
      if (cateId) { conds.push('cate_id = ?'); params.push(cateId); }
      const flag = Number(req.query.flag);
      if (flag === 1 || flag === 2) { conds.push('flag = ?'); params.push(flag); }
      const kw = String(req.query.key || '').trim();
      if (kw) { conds.push('name LIKE ?'); params.push(`%${kw}%`); }
      const rows = db.prepare(`SELECT * FROM giftcard WHERE ${conds.join(' AND ')} ORDER BY sort DESC, id DESC`).all(...params);
      const cates = db.prepare('SELECT id, name FROM giftcard_category WHERE customer_id = ?').all(cid);
      const cm = new Map(cates.map(c => [c.id, c.name]));
      res.json(rows.map(r => ({
        id: r.id, cateId: r.cate_id, cateName: cm.get(r.cate_id) || '',
        name: r.name, price: r.price, stock: r.stock, sold: r.sold,
        limitNum: r.limit_num, increase: r.increase, type: r.type,
        money: r.money, useType: r.use_type, useBtime: r.use_btime, useEtime: r.use_etime,
        todayAfter: r.today_after, yesAfter: r.yes_after,
        thumb: r.thumb, carousel: safeJson(r.carousel), descs: r.descs,
        shareTitle: r.share_title, shareImg: r.share_img, detail: r.detail,
        sort: r.sort, flag: r.flag, createdAt: r.created_at,
      })));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  function safeJson(s) { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }

  router.post('/cards', requireTenant, requireTicket, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const b = req.body;
      if (!String(b.name || '').trim()) return res.status(400).json({ error: '请输入卡券名称' });
      if (!Number(b.cateId)) return res.status(400).json({ error: '请选择所属分类' });
      const cate = db.prepare('SELECT id FROM giftcard_category WHERE id = ? AND customer_id = ?').get(Number(b.cateId), cid);
      if (!cate) return res.status(400).json({ error: '所属分类不存在' });
      const r = db.prepare(
        `INSERT INTO giftcard (customer_id, cate_id, name, price, stock, limit_num, increase, type, money,
          use_type, use_btime, use_etime, today_after, yes_after, thumb, carousel, descs, share_title, share_img, detail, sort, flag)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(cid, Number(b.cateId), String(b.name).trim(), Number(b.price) || 0, Number(b.stock) || 0,
        Number(b.limitNum) || 0, Number(b.increase) === 1 ? 1 : 0, Number(b.type) === 2 ? 2 : 1,
        Number(b.money) || 0, Number(b.useType) || 1, String(b.useBtime || ''), String(b.useEtime || ''),
        Number(b.todayAfter) || 0, Number(b.yesAfter) || 0, String(b.thumb || ''),
        JSON.stringify(Array.isArray(b.carousel) ? b.carousel : []), String(b.descs || ''),
        String(b.shareTitle || ''), String(b.shareImg || ''), String(b.detail || ''),
        Number(b.sort) || 0, Number(b.flag) === 2 ? 2 : 1);
      audit(req, 'create', 'giftcard', Number(r.lastInsertRowid), `新增卡券：${b.name}`);
      res.json({ id: Number(r.lastInsertRowid) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/cards/:id', requireTenant, requireTicket, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const id = Number(req.params.id);
      const b = req.body;
      if (!String(b.name || '').trim()) return res.status(400).json({ error: '请输入卡券名称' });
      const r = db.prepare(
        `UPDATE giftcard SET name=?, price=?, stock=?, limit_num=?, increase=?, type=?, money=?, use_type=?,
          use_btime=?, use_etime=?, today_after=?, yes_after=?, thumb=?, carousel=?, descs=?, share_title=?, share_img=?, detail=?, sort=?, flag=?, updated_at=datetime('now')
         WHERE id=? AND customer_id=?`
      ).run(String(b.name).trim(), Number(b.price) || 0, Number(b.stock) || 0, Number(b.limitNum) || 0,
        Number(b.increase) === 1 ? 1 : 0, Number(b.type) === 2 ? 2 : 1, Number(b.money) || 0, Number(b.useType) || 1,
        String(b.useBtime || ''), String(b.useEtime || ''), Number(b.todayAfter) || 0, Number(b.yesAfter) || 0,
        String(b.thumb || ''), JSON.stringify(Array.isArray(b.carousel) ? b.carousel : []), String(b.descs || ''),
        String(b.shareTitle || ''), String(b.shareImg || ''), String(b.detail || ''),
        Number(b.sort) || 0, Number(b.flag) === 2 ? 2 : 1, id, cid);
      if (!r.changes) return res.status(404).json({ error: '卡券不存在' });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/cards/:id', requireTenant, requireTicket, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const id = Number(req.params.id);
      const r = db.prepare('DELETE FROM giftcard WHERE id = ? AND customer_id = ?').run(id, cid);
      if (!r.changes) return res.status(404).json({ error: '卡券不存在' });
      audit(req, 'delete', 'giftcard', id, '删除卡券');
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/cards/batch-delete', requireTenant, requireTicket, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
      if (!ids.length) return res.status(400).json({ error: '请选择要删除的卡券' });
      const marks = ids.map(() => '?').join(',');
      const r = db.prepare(`DELETE FROM giftcard WHERE customer_id = ? AND id IN (${marks})`).run(cid, ...ids);
      res.json({ deleted: r.changes });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
