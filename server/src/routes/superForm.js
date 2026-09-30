import { Router } from 'express';
import { checkTenantAccess } from '../tenant.js';
import { addOperationLog } from '../db.js';

function audit(db, req, action, targetType, targetId, detail) {
  addOperationLog(db, {
    userId: req.user?.uid ?? null,
    username: req.user?.username ?? req.user?.openid ?? 'card-user',
    action,
    targetType,
    targetId,
    detail: `[租户#${req.customerId}] ${detail}`,
    ip: req.ip,
  });
}

/**
 * 超级表单（拖拽表单设计器）租户域 API。
 * 挂载于 /api/card-market/super-form（app.js comboAuth，提交与公开配置走白名单）。
 *
 * 数据模型：
 *   super_form_template  { id, customer_id, name, config(JSON), status(draft/published/disabled) }
 *   super_form_submission{ id, form_id, customer_id, user_id, data(JSON) }
 */
export function createSuperFormRouter(db) {
  const router = Router();

  // ---- 中间件（与 cardMarket 一致）----
  function tenant(req, res, next) {
    const customerId = req.customerId || req.user?.customerId;
    if (!customerId) return res.status(403).json({ error: '未入驻任何客户，禁止访问' });
    const blocked = checkTenantAccess(db, customerId, 'card', 'mini');
    if (blocked) {
      if (blocked.readonly && req.method === 'GET') { req.customerId = customerId; req.tenantReadonly = true; return next(); }
      return res.status(blocked.status).json({ error: blocked.error });
    }
    req.customerId = customerId;
    next();
  }
  function requireTenantAdmin(req, res, next) {
    const role = req.user?.role;
    if (!(role === 'tenant_admin' || role === 'super_admin' || role === 'admin')) return res.status(403).json({ error: '仅管理员可操作' });
    next();
  }
  function currentUserId(req) { return req.userId || req.user?.id; }
  function belongsToTenant(table, id, customerId) {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) return null;
    if (row.customer_id !== customerId) return { __crossTenant: true };
    return row;
  }

  function parseConfig(config) {
    try { return typeof config === 'string' ? JSON.parse(config || '{}') : (config || {}); }
    catch { return {}; }
  }
  // 轻量 schema 校验：components 必须为数组
  function sanitizeConfig(config) {
    const c = parseConfig(config);
    if (!c.components || !Array.isArray(c.components)) c.components = [];
    if (!c.settings) c.settings = {};
    // 过滤未知/非白名单组件类型
    const TYPES = ['text', 'textarea', 'image', 'radio', 'checkbox', 'select', 'date', 'submit', 'number', 'time', 'location', 'attachment', 'sms', 'agreement', 'rate', 'filedownload', 'phoneauth', 'carplate', 'pagebreak', 'backdesc', 'realtime', 'pay', 'swiper', 'bigimage', 'title', 'richtext', 'blank', 'line', 'video'];
    c.components = c.components.filter((it) => it && TYPES.includes(it.type));
    return c;
  }

  // ---- 列表 ----
  router.get('/', tenant, requireTenantAdmin, (req, res) => {
    const rows = db.prepare(`SELECT f.*, (SELECT COUNT(*) FROM super_form_submission s WHERE s.form_id = f.id) AS submission_count
      FROM super_form_template f WHERE f.customer_id = ? ORDER BY f.created_at DESC`).all(req.customerId);
    res.json({ forms: rows.map((r) => ({
      id: r.id, name: r.name, status: r.status,
      submissionCount: r.submission_count,
      createdAt: r.created_at, updatedAt: r.updated_at,
      config: parseConfig(r.config),
    })) });
  });

  // ---- 新建 ----
  router.post('/', tenant, requireTenantAdmin, (req, res) => {
    const userId = currentUserId(req);
    const { name, config } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '缺少表单名称' });
    const safe = sanitizeConfig(config);
    const result = db.prepare(`INSERT INTO super_form_template (customer_id, name, config, status, created_by)
      VALUES (?, ?, ?, 'draft', ?)`).run(req.customerId, name.trim(), JSON.stringify(safe), userId);
    res.json({ id: result.lastInsertRowid, success: true });
  });

  // ---- 公开配置（C 端拉取；仅 published 可见）----
  router.get('/:id/public', (req, res) => {
    const { id } = req.params;
    const form = db.prepare('SELECT * FROM super_form_template WHERE id = ?').get(id);
    if (!form || form.status !== 'published') return res.status(404).json({ error: '表单不存在或未发布' });
    res.json({ id: form.id, name: form.name, config: parseConfig(form.config) });
  });

  // ---- 详情（管理端）----
  router.get('/:id', tenant, requireTenantAdmin, (req, res) => {
    const { id } = req.params;
    const form = belongsToTenant('super_form_template', id, req.customerId);
    if (!form || form.__crossTenant) return res.status(404).json({ error: '表单不存在' });
    res.json({ id: form.id, name: form.name, status: form.status, config: parseConfig(form.config), createdAt: form.created_at, updatedAt: form.updated_at });
  });

  // ---- 更新（含发布/停用；name/config/status 可同时提交，合并更新）----
  router.put('/:id', tenant, requireTenantAdmin, (req, res) => {
    const { id } = req.params;
    const form = belongsToTenant('super_form_template', id, req.customerId);
    if (!form || form.__crossTenant) return res.status(404).json({ error: '表单不存在' });
    const { name, config, status } = req.body;
    const updates = [];
    const params = [];
    if (status !== undefined) {
      if (!['draft', 'published', 'disabled'].includes(status)) return res.status(400).json({ error: '非法状态' });
      updates.push('status = ?'); params.push(status);
      audit(db, req, 'update_super_form_status', 'super_form_template', id, `表单「${form.name}」状态 → ${status}`);
    }
    if (name && name.trim()) {
      updates.push('name = ?'); params.push(name.trim());
    }
    if (config !== undefined) {
      const safe = sanitizeConfig(config);
      updates.push('config = ?'); params.push(JSON.stringify(safe));
    }
    if (!updates.length) return res.status(400).json({ error: '无更新内容' });
    updates.push("updated_at = datetime('now')");
    db.prepare(`UPDATE super_form_template SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);
    res.json({ success: true });
  });

  // ---- 删除（级联提交记录）----
  router.delete('/:id', tenant, requireTenantAdmin, (req, res) => {
    const { id } = req.params;
    const form = belongsToTenant('super_form_template', id, req.customerId);
    if (!form || form.__crossTenant) return res.status(404).json({ error: '表单不存在' });
    db.prepare('DELETE FROM super_form_submission WHERE form_id = ?').run(id);
    db.prepare('DELETE FROM super_form_template WHERE id = ?').run(id);
    audit(db, req, 'delete_super_form', 'super_form_template', id, `删除表单「${form.name}」及提交记录`);
    res.json({ success: true });
  });

  // ---- 公开提交（访客免认证；仅 published 可提交）----
  router.post('/:id/submit', (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || req.userId || null;
    const { data } = req.body || {};
    const form = db.prepare('SELECT * FROM super_form_template WHERE id = ? AND status = ?').get(id, 'published');
    if (!form) return res.status(404).json({ error: '表单不存在或未发布' });
    // 次数限制（settings.basic.collectLimit，0=不限；提交周期 daily=每天一次，按当天计数）
    const cfg = parseConfig(form.config);
    const limit = Number(cfg?.settings?.basic?.collectLimit || 0);
    if (limit > 0) {
      const cycle = cfg?.settings?.basic?.submitCycle === 'daily' ? 'daily' : 'once';
      const cnt = cycle === 'daily'
        ? db.prepare("SELECT COUNT(*) AS c FROM super_form_submission WHERE form_id = ? AND date(created_at) = date('now')").get(id).c
        : db.prepare('SELECT COUNT(*) AS c FROM super_form_submission WHERE form_id = ?').get(id).c;
      if (cnt >= limit) return res.status(400).json({ error: cycle === 'daily' ? '今日填写次数已达上限' : '表单收集份数已达上限' });
    }
    db.prepare(`INSERT INTO super_form_submission (form_id, customer_id, user_id, data)
      VALUES (?, ?, ?, ?)`).run(id, form.customer_id, userId, JSON.stringify(data || {}));
    res.json({ success: true });
  });

  // ---- 提交记录（管理端）----
  router.get('/:id/submissions', tenant, requireTenantAdmin, (req, res) => {
    const { id } = req.params;
    const form = belongsToTenant('super_form_template', id, req.customerId);
    if (!form || form.__crossTenant) return res.status(404).json({ error: '表单不存在' });
    const rows = db.prepare('SELECT * FROM super_form_submission WHERE form_id = ? ORDER BY created_at DESC').all(id);
    res.json({ submissions: rows.map((r) => ({ id: r.id, data: parseConfig(r.data), createdAt: r.created_at })) });
  });

  return router;
}
