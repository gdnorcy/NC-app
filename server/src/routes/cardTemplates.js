/**
 * 名片模板库（第四批·增长飞轮）
 * - 平台公共模板（tenant_id=0）：总后台维护（/api/admin/card/templates）
 * - 租户私有模板（tenant_id=customerId）：租户后台维护（/api/customer/card/templates）
 * - C 端按模板应用主题（theme_config）
 */
import { Router } from 'express';

export function createCardTemplateRouter(db, { mode = 'admin' } = {}) {
  const router = Router();
  const isAdmin = mode === 'admin';

  // ============ 列表 ============
  router.get('/templates', (req, res) => {
    try {
      if (isAdmin) {
        // 总后台：仅平台公共模板
        const rows = db.prepare('SELECT * FROM card_templates WHERE tenant_id = 0 ORDER BY sort_order, id DESC').all();
        return res.json({ templates: rows.map(toTemplate) });
      }
      // 租户后台：平台启用模板 + 本租户全部私有模板（平台付费模板附加 purchased 状态）
      const rows = db.prepare(
        'SELECT * FROM card_templates WHERE (tenant_id = 0 AND enabled = 1) OR tenant_id = ? ORDER BY tenant_id, sort_order, id DESC'
      ).all(req.user.customerId);
      const bought = new Set(
        db.prepare("SELECT asset_key FROM tenant_asset_purchases WHERE tenant_id = ? AND asset_type = 'card_template'").all(req.user.customerId).map((r) => String(r.asset_key))
      );
      res.json({
        templates: rows.map((row) => {
          const t = toTemplate(row);
          if (row.tenant_id === 0) t.purchased = bought.has(String(row.id)) || Number(row.price || 0) === 0;
          return t;
        }),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============ 租户购买平台付费模板 ============
  router.post('/templates/:id/purchase', (req, res) => {
    try {
      if (isAdmin) return res.status(403).json({ error: '总后台无需购买' });
      const id = Number(req.params.id);
      const row = db.prepare('SELECT * FROM card_templates WHERE id = ? AND tenant_id = 0').get(id);
      if (!row) return res.status(404).json({ error: '模板不存在' });
      if (!row.enabled) return res.status(400).json({ error: '该模板已下架' });
      const price = Number(row.price || 0);
      if (price === 0) return res.status(400).json({ error: '免费模板无需购买' });
      const exist = db.prepare("SELECT id FROM tenant_asset_purchases WHERE tenant_id = ? AND asset_type = 'card_template' AND asset_key = ?").get(req.user.customerId, String(id));
      if (exist) return res.json({ ok: true, purchased: true, template: { ...toTemplate(row), purchased: true } });
      db.prepare("INSERT INTO tenant_asset_purchases (tenant_id, asset_type, asset_key, price) VALUES (?, 'card_template', ?, ?)").run(req.user.customerId, String(id), price);
      res.json({ ok: true, purchased: true, template: { ...toTemplate(row), purchased: true } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============ 新建 ============
  router.post('/templates', (req, res) => {
    try {
      const { name, cover = '', themeConfig = {}, description = '', sortOrder = 0, enabled = true, price = 0 } = req.body || {};
      if (!name) return res.status(400).json({ error: '模板名称必填' });
      const tenantId = isAdmin ? 0 : req.user.customerId;
      const r = db.prepare(
        'INSERT INTO card_templates (tenant_id, name, cover, theme_config, description, enabled, sort_order, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(tenantId, String(name).slice(0, 64), String(cover).slice(0, 512), JSON.stringify(themeConfig || {}), String(description || '').slice(0, 256), enabled ? 1 : 0, Number(sortOrder) || 0, isAdmin ? (Number(price) || 0) : 0);
      const row = db.prepare('SELECT * FROM card_templates WHERE id = ?').get(r.lastInsertRowid);
      res.json({ template: toTemplate(row) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============ 更新 ============
  router.put('/templates/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const exist = db.prepare('SELECT * FROM card_templates WHERE id = ?').get(id);
      if (!exist) return res.status(404).json({ error: '模板不存在' });
      // 权限：总后台仅平台模板；租户仅本租户私有模板
      if (isAdmin && exist.tenant_id !== 0) return res.status(403).json({ error: '无权操作租户模板' });
      if (!isAdmin && exist.tenant_id !== req.user.customerId) return res.status(403).json({ error: '无权操作该模板' });
      const { name, cover, themeConfig, description, enabled, sortOrder, price } = req.body || {};
      db.prepare(`UPDATE card_templates SET
        name = COALESCE(?, name),
        cover = COALESCE(?, cover),
        theme_config = COALESCE(?, theme_config),
        description = COALESCE(?, description),
        enabled = COALESCE(?, enabled),
        sort_order = COALESCE(?, sort_order),
        price = CASE WHEN ? IS NULL THEN price ELSE ? END,
        updated_at = datetime('now')
        WHERE id = ?`)
        .run(name != null ? String(name).slice(0, 64) : null,
             cover != null ? String(cover).slice(0, 512) : null,
             themeConfig != null ? JSON.stringify(themeConfig) : null,
             description != null ? String(description).slice(0, 256) : null,
             enabled != null ? (enabled ? 1 : 0) : null,
             sortOrder != null ? Number(sortOrder) : null,
             isAdmin ? Number(price) : null,
             isAdmin ? Number(price) : null,
             id);
      const row = db.prepare('SELECT * FROM card_templates WHERE id = ?').get(id);
      res.json({ template: toTemplate(row) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============ 删除（系统资产：仅停用；租户私有可物理删除） ============
  router.delete('/templates/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const exist = db.prepare('SELECT * FROM card_templates WHERE id = ?').get(id);
      if (!exist) return res.status(404).json({ error: '模板不存在' });
      if (isAdmin) {
        if (exist.tenant_id !== 0) return res.status(403).json({ error: '无权操作租户模板' });
        db.prepare("UPDATE card_templates SET enabled = 0, updated_at = datetime('now') WHERE id = ?").run(id);
      } else {
        if (exist.tenant_id !== req.user.customerId) return res.status(403).json({ error: '无权操作该模板' });
        db.prepare('DELETE FROM card_templates WHERE id = ?').run(id);
      }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

function toTemplate(row) {
  if (!row) return null;
  let theme = {};
  try { theme = JSON.parse(row.theme_config || '{}'); } catch { /* ignore */ }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    cover: row.cover,
    themeConfig: theme,
    description: row.description,
    enabled: !!row.enabled,
    price: Number(row.price || 0),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
