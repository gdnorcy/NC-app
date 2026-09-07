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

  // 方案详情（含价格/权限 appPermissions，供客户项目编辑引用）
  router.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    const detail = solutionDetail(db, id);
    if (!detail) return res.status(404).json({ error: '解决方案不存在' });
    res.json({ solution: detail });
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
        categoryId || null, isHot ? 1 : 0, status === 'off' ? 'off' : 'on', JSON.stringify(Array.isArray(defaultPlatform) ? defaultPlatform : [defaultPlatform || 'h5']),
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
    // defaultPlatform 支持多选数组；兼容旧单值字符串
    let defaultPlatformJson = null;
    if (defaultPlatform !== undefined && defaultPlatform !== null) {
      const arr = Array.isArray(defaultPlatform) ? defaultPlatform : [defaultPlatform];
      defaultPlatformJson = JSON.stringify(arr.filter(Boolean));
    }
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
      status ?? null, defaultPlatformJson,
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

  // 权限设置：两级授权（应用级勾选 + 应用内菜单级授权）+ allPermissions 模式
  router.put('/:id/permissions', (req, res) => {
    const id = Number(req.params.id);
    const solution = db.prepare('SELECT * FROM solutions WHERE id = ?').get(id);
    if (!solution) return res.status(404).json({ error: '解决方案不存在' });
    const { apps, menus, allPermissions } = req.body || {};
    if (!Array.isArray(apps) || !Array.isArray(menus)) return res.status(400).json({ error: '权限数据格式错误，需包含 apps 与 menus' });
    // 应用级授权：整体替换 solution_apps
    db.prepare('DELETE FROM solution_apps WHERE solution_id = ?').run(id);
    const insApp = db.prepare('INSERT OR REPLACE INTO solution_apps (solution_id, app_id, enabled) VALUES (?, ?, ?)');
    apps.forEach((a) => {
      if (!a || !a.code) return;
      const app = db.prepare('SELECT id FROM apps WHERE code = ?').get(a.code);
      if (app) insApp.run(id, app.id, a.enabled === false ? 0 : 1);
    });
    // 菜单级授权：整体替换 solution_permissions（按 app_id + key 落库）
    db.prepare('DELETE FROM solution_permissions WHERE solution_id = ?').run(id);
    const insPerm = db.prepare('INSERT INTO solution_permissions (solution_id, app_id, module, module_label, key, label, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    menus.forEach((m, idx) => {
      if (!m || !m.key) return;
      const app = m.appCode ? db.prepare('SELECT id FROM apps WHERE code = ?').get(m.appCode) : null;
      const menuDef = app ? db.prepare('SELECT module, module_label, label FROM app_menus WHERE app_id = ? AND key = ?').get(app.id, m.key) : null;
      if (!app || !menuDef) return;
      insPerm.run(id, app.id, menuDef.module, menuDef.module_label, m.key, menuDef.label, m.enabled === false ? 0 : 1, idx);
    });
    db.prepare("UPDATE solutions SET all_permissions = ?, updated_at = datetime('now') WHERE id = ?").run(allPermissions ? 1 : 0, id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'update_solution_permissions', targetType: 'solution', targetId: id, detail: `更新方案权限: ${solution.name}`, ip: req.ip });
    res.json({ solution: solutionDetail(db, id) });
  });

  // 方案配额默认定义（按应用分组；value 为默认配额，price 为加购单价）
  const QUOTA_DEFS = [
    { appCode: 'card', appName: '智能名片', items: [
      { key: 'memberCount', label: '入驻个人数', value: 0 },
      { key: 'enterpriseCount', label: '入驻企业数', value: 0 },
      { key: 'employeeCount', label: '企业员工人数', value: 0 },
      { key: 'marketItems', label: '集市上架', value: 0 },
    ] },
    { appCode: 'panorama', appName: '360全景', items: [
      { key: 'planCount', label: '方案数', value: 5 },
      { key: 'sceneCount', label: '场景数', value: 50 },
    ] },
  ];

  // 方案资产：集市风格 + 名片模板 + 方案配额（归入解决方案的可售资产）
  router.get('/:id/assets', (req, res) => {
    const id = Number(req.params.id);
    const solution = db.prepare('SELECT * FROM solutions WHERE id = ?').get(id);
    if (!solution) return res.status(404).json({ error: '解决方案不存在' });
    const styles = db.prepare('SELECT * FROM market_styles ORDER BY sort_order ASC, id ASC').all().map((s) => ({
      key: s.key, name: s.name, description: s.description, price: s.price, isDefault: !!s.is_default, enabled: !!s.enabled, sortOrder: s.sort_order,
    }));
    const templates = db.prepare('SELECT id, name, price, enabled, is_default, sort_order FROM card_templates WHERE tenant_id = 0 ORDER BY sort_order ASC, id DESC').all().map((t) => ({
      id: t.id, name: t.name, price: t.price, enabled: !!t.enabled, isDefault: !!t.is_default, sortOrder: t.sort_order,
    }));
    // 方案配额：默认定义 + 已存值合并
    const stored = db.prepare('SELECT app_code, key, value, price, enabled FROM solution_quotas WHERE solution_id = ?').all(id);
    const storedMap = {};
    stored.forEach((q) => { (storedMap[q.app_code] = storedMap[q.app_code] || {})[q.key] = q; });
    const quotas = QUOTA_DEFS.map((g) => ({
      appCode: g.appCode,
      appName: g.appName,
      items: g.items.map((it) => {
        const s = (storedMap[g.appCode] || {})[it.key];
        return {
          key: it.key, label: it.label,
          value: s ? s.value : it.value,
          price: s ? s.price : 0,
          enabled: s ? !!s.enabled : true,
        };
      }),
    }));
    res.json({ assets: { styles, templates, quotas } });
  });

  // 保存方案资产（整体替换风格/模板价格与默认 + 方案配额）
  router.put('/:id/assets', (req, res) => {
    const id = Number(req.params.id);
    const solution = db.prepare('SELECT * FROM solutions WHERE id = ?').get(id);
    if (!solution) return res.status(404).json({ error: '解决方案不存在' });
    const { styles, templates, quotas } = req.body || {};
    if (Array.isArray(styles)) {
      const up = db.prepare('UPDATE market_styles SET price = ?, enabled = ?, is_default = ?, updated_at = datetime(\'now\') WHERE key = ?');
      styles.forEach((s) => {
        if (!s || !s.key) return;
        up.run(Number(s.price) || 0, s.enabled === false ? 0 : 1, s.isDefault ? 1 : 0, s.key);
      });
    }
    if (Array.isArray(templates)) {
      const up = db.prepare('UPDATE card_templates SET price = ?, enabled = ?, is_default = ?, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = 0');
      templates.forEach((t) => {
        if (!t || !t.id) return;
        up.run(Number(t.price) || 0, t.enabled === false ? 0 : 1, t.isDefault ? 1 : 0, Number(t.id));
      });
    }
    if (Array.isArray(quotas)) {
      db.prepare('DELETE FROM solution_quotas WHERE solution_id = ?').run(id);
      const ins = db.prepare('INSERT INTO solution_quotas (solution_id, app_code, key, label, value, price, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)');
      quotas.forEach((g) => {
        if (!g || !Array.isArray(g.items)) return;
        g.items.forEach((it) => {
          if (!it || !it.key) return;
          ins.run(id, g.appCode, it.key, it.label || it.key, Number(it.value) || 0, Number(it.price) || 0, it.enabled === false ? 0 : 1);
        });
      });
    }
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'update_solution_assets', targetType: 'solution', targetId: id, detail: `更新方案资产: ${solution.name}`, ip: req.ip });
    res.json({ ok: true });
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
