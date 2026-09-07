// 解决方案（应用）管理 + 方案中心（分类/基础设置/价格设置/权限设置）
import { Router } from 'express';
import { toSolution, solutionDetail, addOperationLog } from '../db.js';

export function createSolutionsRouter(db) {
  const router = Router();

  // ============ 方案分类 ============
  router.get('/categories', (_req, res) => {
    const categories = db
      .prepare('SELECT * FROM solution_categories ORDER BY sort_order ASC, id ASC')
      .all()
      .map((c) => ({ id: c.id, name: c.name, icon: c.icon || '', enabled: Boolean(c.enabled), sortOrder: c.sort_order, solutionCount: db.prepare('SELECT COUNT(*) AS n FROM solutions WHERE category_id = ?').get(c.id).n }));
    res.json({ categories });
  });

  router.post('/categories', (req, res) => {
    const { name, icon, sortOrder } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: '分类名称必填' });
    const info = db
      .prepare('INSERT INTO solution_categories (name, icon, sort_order) VALUES (?, ?, ?)')
      .run(name.trim(), icon || '', sortOrder || 0);
    const cat = db.prepare('SELECT * FROM solution_categories WHERE id = ?').get(info.lastInsertRowid);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'create_solution_category', targetType: 'solution_category', targetId: cat.id, detail: `新建方案分类: ${cat.name}`, ip: req.ip });
    res.json({ category: { id: cat.id, name: cat.name, icon: cat.icon || '', enabled: Boolean(cat.enabled), sortOrder: cat.sort_order } });
  });

  router.put('/categories/:id', (req, res) => {
    const id = Number(req.params.id);
    const cat = db.prepare('SELECT * FROM solution_categories WHERE id = ?').get(id);
    if (!cat) return res.status(404).json({ error: '分类不存在' });
    const { name, icon, enabled, sortOrder } = req.body || {};
    db.prepare(
      "UPDATE solution_categories SET name = COALESCE(?, name), icon = COALESCE(?, icon), enabled = COALESCE(?, enabled), sort_order = COALESCE(?, sort_order), updated_at = datetime('now') WHERE id = ?"
    ).run(name ?? null, icon ?? null, enabled ?? null, sortOrder ?? null, id);
    const updated = db.prepare('SELECT * FROM solution_categories WHERE id = ?').get(id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'update_solution_category', targetType: 'solution_category', targetId: id, detail: `编辑方案分类: ${updated.name}`, ip: req.ip });
    res.json({ category: { id: updated.id, name: updated.name, icon: updated.icon || '', enabled: Boolean(updated.enabled), sortOrder: updated.sort_order } });
  });

  router.delete('/categories/:id', (req, res) => {
    const id = Number(req.params.id);
    const used = db.prepare('SELECT COUNT(*) AS n FROM solutions WHERE category_id = ?').get(id).n;
    if (used > 0) return res.status(400).json({ error: `该分类下仍有 ${used} 个解决方案，请先调整归属` });
    db.prepare('DELETE FROM solution_categories WHERE id = ?').run(id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'delete_solution_category', targetType: 'solution_category', targetId: id, detail: `删除方案分类`, ip: req.ip });
    res.json({ ok: true });
  });

  // ============ 解决方案 ============
  // 列表（支持分类/上架筛选；包含价格与权限聚合）
  router.get('/', (req, res) => {
    const { categoryId, status } = req.query || {};
    const cond = [];
    const params = [];
    if (categoryId) { cond.push('category_id = ?'); params.push(Number(categoryId)); }
    if (status) { cond.push('status = ?'); params.push(String(status)); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM solutions ${where} ORDER BY sort_order ASC, id ASC`)
      .all(...params);
    const solutions = rows.map((r) => solutionDetail(db, r.id));
    res.json({ solutions });
  });

  // 新建（含分类/热门/状态/平台/预览图 + 默认价格权限由 seed 补齐）
  router.post('/', (req, res) => {
    const { name, code, description, icon, sortOrder, categoryId, isHot, status, defaultPlatform, previewImages, virtualUseCount } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: '名称必填' });
    if (!code || !code.trim()) return res.status(400).json({ error: '唯一标识必填' });
    const exists = db.prepare('SELECT id FROM solutions WHERE code = ?').get(code.trim());
    if (exists) return res.status(400).json({ error: '唯一标识已存在' });
    const info = db
      .prepare(`INSERT INTO solutions (name, code, description, icon, sort_order, category_id, is_hot, status, default_platform, preview_images, virtual_use_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        name.trim(), code.trim(), description || '', icon || '', sortOrder || 0,
        categoryId || null, isHot ? 1 : 0, status === 'off' ? 'off' : 'on', defaultPlatform || 'h5',
        JSON.stringify(previewImages || []), virtualUseCount || 0
      );
    const solution = db.prepare('SELECT * FROM solutions WHERE id = ?').get(info.lastInsertRowid);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'create_solution', targetType: 'solution', targetId: solution.id, detail: `新建解决方案: ${solution.name} (${solution.code})`, ip: req.ip });
    res.json({ solution: solutionDetail(db, solution.id) });
  });

  // 编辑（基础设置）
  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const solution = db.prepare('SELECT * FROM solutions WHERE id = ?').get(id);
    if (!solution) return res.status(404).json({ error: '解决方案不存在' });
    const { name, description, icon, enabled, sortOrder, categoryId, isHot, status, defaultPlatform, previewImages, virtualUseCount } = req.body || {};
    db.prepare(
      `UPDATE solutions SET
        name = COALESCE(?, name), description = COALESCE(?, description), icon = COALESCE(?, icon),
        enabled = COALESCE(?, enabled), sort_order = COALESCE(?, sort_order),
        category_id = COALESCE(?, category_id), is_hot = COALESCE(?, is_hot),
        status = COALESCE(?, status), default_platform = COALESCE(?, default_platform),
        preview_images = COALESCE(?, preview_images), virtual_use_count = COALESCE(?, virtual_use_count),
        updated_at = datetime('now') WHERE id = ?`
    ).run(
      name ?? null, description ?? null, icon ?? null, enabled ?? null, sortOrder ?? null,
      categoryId ?? null, isHot === undefined ? null : (isHot ? 1 : 0),
      status ?? null, defaultPlatform ?? null,
      previewImages === undefined ? null : JSON.stringify(previewImages),
      virtualUseCount ?? null, id
    );
    const updated = db.prepare('SELECT * FROM solutions WHERE id = ?').get(id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'update_solution', targetType: 'solution', targetId: id, detail: `编辑解决方案: ${updated.name}`, ip: req.ip });
    res.json({ solution: solutionDetail(db, id) });
  });

  // 价格设置：整体替换（数组）
  router.put('/:id/pricing', (req, res) => {
    const id = Number(req.params.id);
    const solution = db.prepare('SELECT * FROM solutions WHERE id = ?').get(id);
    if (!solution) return res.status(404).json({ error: '解决方案不存在' });
    const { pricing } = req.body || {};
    if (!Array.isArray(pricing)) return res.status(400).json({ error: '价格数据格式错误' });
    db.prepare('DELETE FROM solution_pricing WHERE solution_id = ?').run(id);
    const ins = db.prepare('INSERT INTO solution_pricing (solution_id, duration_months, agent_price, user_price, renew_price) VALUES (?, ?, ?, ?, ?)');
    pricing.forEach((p) => {
      if (!p) return;
      const months = p.duration_months ?? p.durationMonths;
      if (months === undefined || months === null) return;
      ins.run(id, Number(months) || 0, Number(p.agent_price ?? p.agentPrice) || 0, Number(p.user_price ?? p.userPrice) || 0, Number(p.renew_price ?? p.renewPrice) || 0);
    });
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'update_solution_pricing', targetType: 'solution', targetId: id, detail: `更新方案价格: ${solution.name}`, ip: req.ip });
    res.json({ solution: solutionDetail(db, id) });
  });

  // 权限设置：整体替换 + allPermissions 模式
  router.put('/:id/permissions', (req, res) => {
    const id = Number(req.params.id);
    const solution = db.prepare('SELECT * FROM solutions WHERE id = ?').get(id);
    if (!solution) return res.status(404).json({ error: '解决方案不存在' });
    const { permissions, allPermissions } = req.body || {};
    if (!Array.isArray(permissions)) return res.status(400).json({ error: '权限数据格式错误' });
    db.prepare('DELETE FROM solution_permissions WHERE solution_id = ?').run(id);
    const ins = db.prepare('INSERT INTO solution_permissions (solution_id, module, module_label, key, label, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
    permissions.forEach((p, idx) => {
      if (!p || !p.key) return;
      ins.run(id, p.module || '', p.moduleLabel || p.module || '', p.key, p.label || p.key, p.enabled ? 1 : 0, idx);
    });
    db.prepare("UPDATE solutions SET all_permissions = ?, updated_at = datetime('now') WHERE id = ?").run(allPermissions ? 1 : 0, id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'update_solution_permissions', targetType: 'solution', targetId: id, detail: `更新方案权限: ${solution.name}`, ip: req.ip });
    res.json({ solution: solutionDetail(db, id) });
  });

  // 删除（仅非内置方案；内置方案建议禁用）
  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const solution = db.prepare('SELECT * FROM solutions WHERE id = ?').get(id);
    if (!solution) return res.status(404).json({ error: '解决方案不存在' });
    if (['panorama', 'card'].includes(solution.code)) return res.status(400).json({ error: '内置解决方案不可删除，可改为下架' });
    db.prepare('DELETE FROM solution_pricing WHERE solution_id = ?').run(id);
    db.prepare('DELETE FROM solution_permissions WHERE solution_id = ?').run(id);
    db.prepare('DELETE FROM solutions WHERE id = ?').run(id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'delete_solution', targetType: 'solution', targetId: id, detail: `删除解决方案: ${solution.name}`, ip: req.ip });
    res.json({ ok: true });
  });

  return router;
}
