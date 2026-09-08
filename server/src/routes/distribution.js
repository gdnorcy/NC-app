/**
 * 分销体系（租户后台管理端 API）
 * 路径：/api/customer/distribution
 * 能力：插件开关、二级分销配置、分销商列表、佣金明细、钱包提现审核、数据大盘
 */
import { Router } from 'express';
import { createDistributionService } from '../services/distribution.js';
import { tenantState } from '../tenant.js';

export function createDistributionRouter(db) {
  const router = Router();
  const dist = createDistributionService(db);

  // 租户上下文中间件（与 customer.js requireTenant 一致：角色校验 + 生命周期只读放行）
  function tenant(req, res, next) {
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

  // ============================================================
  // 插件开关
  // ============================================================
  router.get('/plugins', tenant, (req, res) => {
    const codes = ['dist', 'partner', 'share-all', 'share-cat', 'share-area'];
    const list = codes.map((code) => dist.getPlugin(req.customerId, code) || {
      tenant_id: req.customerId, plugin_code: code, is_install: 0, is_enable: 0, config: '{}',
    });
    res.json({ list });
  });

  router.put('/plugins/:code', tenant, (req, res) => {
    const { code } = req.params;
    if (!['dist', 'partner', 'share-all', 'share-cat', 'share-area'].includes(code)) {
      return res.status(400).json({ error: '未知插件' });
    }
    const { install, enable, config } = req.body || {};
    const plugin = dist.setPlugin(req.customerId, code, { install, enable, config });
    res.json({ plugin });
  });

  // ============================================================
  // 二级分销配置
  // ============================================================
  router.get('/config', tenant, (req, res) => {
    res.json({ config: dist.getConfig(req.customerId) });
  });

  router.put('/config', tenant, (req, res) => {
    res.json({ config: dist.saveConfig(req.customerId, req.body || {}) });
  });

  // ============================================================
  // 分销商管理（有绑定关系或收益的用户）
  // ============================================================
  router.get('/members', tenant, (req, res) => {
    const { page = 1, pageSize = 20, keyword = '' } = req.query;
    let sql = `
      SELECT r.id, r.user_id, r.identity_type, r.pid1, r.pid2, r.source_type, r.bind_time,
             u.nickname, u.phone, u.avatar,
             w.available, w.wait_settle, w.total_income
      FROM dist_user_relation r
      LEFT JOIN platform_user u ON u.id = r.user_id
      LEFT JOIN dist_wallet w ON w.tenant_id = r.tenant_id AND w.user_id = r.user_id AND w.identity_type = r.identity_type
      WHERE r.tenant_id = ?
    `;
    const params = [req.customerId];
    if (keyword) {
      sql += ' AND (u.nickname LIKE ? OR u.phone LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    const total = db.prepare(sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM')).get(...params).n;
    sql += ' ORDER BY r.id DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
    res.json({ total, list: db.prepare(sql).all(...params) });
  });

  // ============================================================
  // 佣金明细（全租户，可筛类型/状态）
  // ============================================================
  router.get('/logs', tenant, (req, res) => {
    const { page = 1, pageSize = 20, type = '', status = '', keyword = '' } = req.query;
    let sql = `
      SELECT l.*, u.nickname, u.phone FROM dist_user_log l
      LEFT JOIN platform_user u ON u.id = l.user_id
      WHERE l.tenant_id = ?
    `;
    const params = [req.customerId];
    if (type) { sql += ' AND l.type = ?'; params.push(type); }
    if (status) { sql += ' AND l.status = ?'; params.push(status); }
    if (keyword) { sql += ' AND (u.nickname LIKE ? OR u.phone LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    const total = db.prepare(sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM')).get(...params).n;
    sql += ' ORDER BY l.id DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
    res.json({ total, list: db.prepare(sql).all(...params) });
  });

  // ============================================================
  // 溯源记录（全租户绑定关系）
  // ============================================================
  router.get('/relations', tenant, (req, res) => {
    const { page = 1, pageSize = 20, keyword = '' } = req.query;
    let sql = `
      SELECT r.*, u.nickname, u.phone FROM dist_user_relation r
      LEFT JOIN platform_user u ON u.id = r.user_id
      WHERE r.tenant_id = ?
    `;
    const params = [req.customerId];
    if (keyword) { sql += ' AND (u.nickname LIKE ? OR u.phone LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    const total = db.prepare(sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM')).get(...params).n;
    sql += ' ORDER BY r.id DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
    res.json({ total, list: db.prepare(sql).all(...params) });
  });

  // ============================================================
  // 钱包与提现审核
  // ============================================================
  router.get('/wallets', tenant, (req, res) => {
    const { page = 1, pageSize = 20, keyword = '' } = req.query;
    let sql = `
      SELECT w.*, u.nickname, u.phone FROM dist_wallet w
      LEFT JOIN platform_user u ON u.id = w.user_id
      WHERE w.tenant_id = ?
    `;
    const params = [req.customerId];
    if (keyword) { sql += ' AND (u.nickname LIKE ? OR u.phone LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    const total = db.prepare(sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM')).get(...params).n;
    sql += ' ORDER BY w.available DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
    res.json({ total, list: db.prepare(sql).all(...params) });
  });

  // 提现审核列表
  router.get('/withdraws', tenant, (req, res) => {
    const { page = 1, pageSize = 20, status = '' } = req.query;
    let sql = `
      SELECT w.*, u.nickname, u.phone FROM dist_withdraw w
      LEFT JOIN platform_user u ON u.id = w.user_id
      WHERE w.tenant_id = ?
    `;
    const params = [req.customerId];
    if (status) { sql += ' AND w.status = ?'; params.push(status); }
    const total = db.prepare(sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM')).get(...params).n;
    sql += ' ORDER BY w.id DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
    res.json({ total, list: db.prepare(sql).all(...params) });
  });

  // 提现审核动作：reject（驳回退余额）/ approve（通过待打款）/ done（打款完成）
  router.post('/withdraws/:id/review', tenant, (req, res) => {
    const { action, reason } = req.body || {};
    const row = db.prepare('SELECT * FROM dist_withdraw WHERE id = ? AND tenant_id = ?').get(req.params.id, req.customerId);
    if (!row) return res.status(404).json({ error: '提现记录不存在' });
    const r = dist.reviewWithdraw(row.id, action, reason || '');
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ ok: true });
  });

  // ============================================================
  // 数据大盘
  // ============================================================
  router.get('/stats', tenant, (req, res) => {
    const tenantId = req.customerId;
    const totalCommission = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND type IN ('level1','level2')").get(tenantId).s;
    const settledCommission = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND type IN ('level1','level2') AND status = 'settled'").get(tenantId).s;
    const splitCount = db.prepare('SELECT COUNT(*) n FROM dist_order_split WHERE tenant_id = ?').get(tenantId).n;
    const splitAmount = db.prepare('SELECT COALESCE(SUM(total_bonus),0) s FROM dist_order_split WHERE tenant_id = ?').get(tenantId).s;
    const memberCount = db.prepare('SELECT COUNT(*) n FROM dist_user_relation WHERE tenant_id = ?').get(tenantId).n;
    const withdrawPending = db.prepare("SELECT COUNT(*) n FROM dist_withdraw WHERE tenant_id = ? AND status = 'pending'").get(tenantId).n;
    const withdrawTotal = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM dist_withdraw WHERE tenant_id = ?").get(tenantId).s;
    // 近7日订单分账趋势
    const trend = db.prepare(`
      SELECT substr(created_at,1,10) d, COUNT(*) n, COALESCE(SUM(total_bonus),0) s
      FROM dist_order_split WHERE tenant_id = ? AND created_at >= datetime('now', '-6 days')
      GROUP BY substr(created_at,1,10) ORDER BY d
    `).all(tenantId);
    res.json({
      totalCommission, settledCommission, splitCount, splitAmount, memberCount,
      withdrawPending, withdrawTotal, trend,
    });
  });

  // ============================================================
  // 模拟触发结算（调试/运营用：T+N 到期结算）
  // ============================================================
  router.post('/settle-due', tenant, (req, res) => {
    const n = dist.settleDueOrders();
    res.json({ ok: true, settled: n });
  });

  return router;
}
