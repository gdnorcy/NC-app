// 入驻兑换码 · 租户后台管理（第21轮）
//
// 配合 services/joinCode.js 的核销模型：一人一码、用完即废。
// 本文件只管「生成与管理」，不管「核销」（核销在 cardMarket /apply 与 /apply/audit）。
//
// 🔴 授权口径与「入驻管理」一致：租户管理员即可访问，不做应用授权门禁
//    （集市/入驻是智能名片的基础能力，不像电子卡密那样是可选应用）。
//    租户隔离照旧：customer_id 只从认证上下文取，客户端传什么都不认。
//
// 生命周期：0 未使用 → 1 已占用(待审) → 2 已核销；3 已作废（管理员手动停用，不可逆）
import { Router } from 'express';
import { tenantState } from '../tenant.js';
import { addOperationLog } from '../db.js';
import { generateJoinCodes } from '../utils/codes.js';

export function createJoinCodeRouter(db) {
  const router = Router();

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
        req.tenantReadonly = true;
        return next();
      }
      return res.status(403).json({ error: state.reason });
    }
    req.customerId = user.customerId;
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
    if (req.tenantReadonly) {
      res.status(403).json({ error: '服务已到期，当前为只读模式' });
      return false;
    }
    return true;
  }

  const PAGE = 20;

  /** 使用人信息：used_by → platform_user；apply_id → 入驻主体名 */
  function decorate(row) {
    let usedByName = '';
    let usedByPhone = '';
    if (row.used_by) {
      const u = db.prepare('SELECT nickname, phone FROM platform_user WHERE id = ?').get(row.used_by);
      usedByName = u?.nickname || '';
      usedByPhone = u?.phone || '';
    }
    let applyName = '';
    if (row.apply_id) {
      const ind = db.prepare('SELECT name, status FROM tenant_individuals WHERE id = ?').get(row.apply_id);
      if (ind) applyName = ind.name || '';
    }
    return {
      id: row.id,
      batchId: row.batch_id,
      code: row.code,
      status: row.status,
      statusLabel: ['未使用', '已占用', '已核销', '已作废'][row.status] || '未知',
      usedBy: row.used_by,
      usedByName,
      usedByPhone,
      usedAt: row.used_at,
      applyId: row.apply_id,
      applyName,
      applyType: row.apply_type,
      expiresAt: row.expires_at,
      remark: row.remark,
      createdAt: row.created_at,
    };
  }

  // ---------- 统计 ----------
  router.get('/stats', requireTenant, (req, res) => {
    try {
      const cid = req.customerId;
      const rows = db.prepare(
        'SELECT status, COUNT(*) n FROM tenant_join_code WHERE customer_id = ? GROUP BY status'
      ).all(cid);
      const by = { 0: 0, 1: 0, 2: 0, 3: 0 };
      for (const r of rows) by[r.status] = r.n;
      const batchCount = db.prepare(
        'SELECT COUNT(*) n FROM tenant_join_code_batch WHERE customer_id = ?'
      ).get(cid).n;
      res.json({
        total: by[0] + by[1] + by[2] + by[3],
        unused: by[0], occupied: by[1], consumed: by[2], voided: by[3],
        batchCount,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 批次 ----------
  function batchRow(r) {
    const stat = db.prepare(
      'SELECT status, COUNT(*) n FROM tenant_join_code WHERE batch_id = ? GROUP BY status'
    ).all(r.id);
    const by = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const s of stat) by[s.status] = s.n;
    return {
      id: r.id, name: r.name, remark: r.remark,
      applyType: r.apply_type, expiresAt: r.expires_at, status: r.status,
      total: by[0] + by[1] + by[2] + by[3],
      unused: by[0], occupied: by[1], consumed: by[2], voided: by[3],
      createdAt: r.created_at,
    };
  }

  router.get('/batches', requireTenant, (req, res) => {
    try {
      const rows = db.prepare(
        'SELECT * FROM tenant_join_code_batch WHERE customer_id = ? ORDER BY id DESC'
      ).all(req.customerId);
      res.json(rows.map(batchRow));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 生成一批（批次 + 码一起建；码落盘是事务，要么整批要么没有）
  router.post('/batches', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const count = Math.max(1, Math.min(Number(req.body.count) || 1, 2000));
      const name = String(req.body.name || '').trim() || `入驻兑换码 ${new Date().toISOString().slice(0, 10)}`;
      const applyType = String(req.body.applyType || 'individual');
      // 🔴 本轮只收编个人入驻：企业/员工码的模型还没切，后台不允许生成，避免发下去核销不了
      if (applyType !== 'individual') {
        return res.status(400).json({ error: '当前仅支持生成个人入驻兑换码' });
      }
      const expiresAt = String(req.body.expiresAt || '').trim() || null;
      if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
        return res.status(400).json({ error: '有效期格式应为 YYYY-MM-DD' });
      }
      const remark = String(req.body.remark || '').trim();
      const length = Math.max(6, Math.min(Number(req.body.length) || 10, 20));

      const bInfo = db.prepare(
        `INSERT INTO tenant_join_code_batch (customer_id, name, remark, apply_type, expires_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(cid, name, remark, applyType, expiresAt, req.user?.uid ?? req.user?.id ?? 0);
      const batchId = Number(bInfo.lastInsertRowid);

      const { codes } = generateJoinCodes(db, {
        customerId: cid, batchId, count, applyType, expiresAt, length, remark,
      });

      audit(req, 'create', 'tenant_join_code_batch', batchId, `生成入驻兑换码批次「${name}」共 ${codes.length} 个`);
      res.json({ id: batchId, count: codes.length, codes });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 兑换码 ----------
  router.get('/codes', requireTenant, (req, res) => {
    try {
      const cid = req.customerId;
      const batchId = Number(req.query.batchId) || 0;
      const status = req.query.status !== undefined && req.query.status !== '' ? Number(req.query.status) : null;
      const kw = String(req.query.key || '').trim();
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.max(1, Math.min(Number(req.query.pageSize) || PAGE, 200));

      const conds = ['customer_id = ?'];
      const params = [cid];
      if (batchId) { conds.push('batch_id = ?'); params.push(batchId); }
      if ([0, 1, 2, 3].includes(status)) { conds.push('status = ?'); params.push(status); }
      if (kw) { conds.push('code LIKE ?'); params.push(`%${kw.toUpperCase()}%`); }
      const where = conds.join(' AND ');

      const total = db.prepare(`SELECT COUNT(*) n FROM tenant_join_code WHERE ${where}`).get(...params).n;
      const rows = db.prepare(
        `SELECT * FROM tenant_join_code WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
      ).all(...params, pageSize, (page - 1) * pageSize);
      res.json({ total, page, pageSize, list: rows.map(decorate) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 导出（默认只导未使用，避免把已核销的废码再发出去）
  router.get('/codes/export', requireTenant, (req, res) => {
    try {
      const cid = req.customerId;
      const batchId = Number(req.query.batchId) || 0;
      const status = req.query.status !== undefined && req.query.status !== '' ? Number(req.query.status) : 0;
      const conds = ['customer_id = ?'];
      const params = [cid];
      if (batchId) { conds.push('batch_id = ?'); params.push(batchId); }
      if ([0, 1, 2, 3].includes(status)) { conds.push('status = ?'); params.push(status); }
      const rows = db.prepare(
        `SELECT code FROM tenant_join_code WHERE ${conds.join(' AND ')} ORDER BY id ASC`
      ).all(...params);
      res.json({ total: rows.length, codes: rows.map(r => r.code) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 单个作废（不可逆；已核销的不动作废，那是既成事实）
  router.post('/codes/:id/void', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const id = Number(req.params.id);
      const row = db.prepare('SELECT id, code, status FROM tenant_join_code WHERE id = ? AND customer_id = ?').get(id, cid);
      if (!row) return res.status(404).json({ error: '兑换码不存在' });
      if (row.status === 3) return res.status(400).json({ error: '该兑换码已作废' });
      if (row.status === 2) return res.status(400).json({ error: '已核销的兑换码不可作废' });
      const r = db.prepare(
        `UPDATE tenant_join_code SET status = 3, updated_at = datetime('now') WHERE id = ? AND customer_id = ?`
      ).run(id, cid);
      if (!r.changes) return res.status(404).json({ error: '兑换码不存在' });
      audit(req, 'void', 'tenant_join_code', id, `作废兑换码 ${row.code}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 批量作废
  router.post('/codes/batch-void', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
      if (!ids.length) return res.status(400).json({ error: '请选择要作废的兑换码' });
      const marks = ids.map(() => '?').join(',');
      // 只作废「未使用 / 已占用」，已核销(2)与已作废(3)跳过——前者是既成事实，后者无需重复
      const r = db.prepare(
        `UPDATE tenant_join_code SET status = 3, updated_at = datetime('now')
         WHERE customer_id = ? AND id IN (${marks}) AND status IN (0, 1)`
      ).run(cid, ...ids);
      audit(req, 'void', 'tenant_join_code', ids[0], `批量作废兑换码 ${r.changes} 个`);
      res.json({ voided: r.changes });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
