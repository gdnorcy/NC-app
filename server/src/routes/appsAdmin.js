import { Router } from 'express';

/**
 * 总后台 · 应用中心
 * 应用分类管理 + 应用卡片管理（编辑/改分类/拖拽排序）
 * 应用 = apps 表（360全景/智能名片/全端渠道/…），分类 = app_categories 表
 */
export function createAppsAdminRouter(db) {
  const router = Router();

  const rowToApp = (r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    icon: r.icon,
    category: r.category,
    sortOrder: r.sort_order,
    enabled: r.enabled === 1,
  });

  const rowToCat = (r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    sortOrder: r.sort_order,
    enabled: r.enabled === 1,
  });

  // 应用中心：分类（含应用数）+ 各分类下应用
  router.get('/', (_req, res) => {
    try {
      const cats = db.prepare('SELECT * FROM app_categories ORDER BY sort_order, id').all();
      const apps = db.prepare('SELECT * FROM apps WHERE hidden = 0 ORDER BY sort_order, id').all();
      const categories = cats.map((c) => {
        const list = apps.filter((a) => a.category === c.name).map(rowToApp);
        return { ...rowToCat(c), apps: list };
      });
      // 未归类的应用（category 不在任何分类）兜底显示在「默认分类」
      const knownCats = new Set(cats.map((c) => c.name));
      const defaultCat = categories.find((c) => c.name === '默认分类');
      if (defaultCat) {
        const orphans = apps.filter((a) => !knownCats.has(a.category)).map(rowToApp);
        defaultCat.apps = defaultCat.apps.concat(orphans.filter((o) => !defaultCat.apps.some((x) => x.id === o.id)));
      }
      res.json({ categories });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 新增分类
  router.post('/categories', (req, res) => {
    try {
      const { name, icon = 'apps' } = req.body || {};
      if (!name || !String(name).trim()) return res.status(400).json({ error: '分类名称不能为空' });
      const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM app_categories').get().m;
      const r = db.prepare('INSERT INTO app_categories (name, icon, sort_order) VALUES (?, ?, ?)')
        .run(String(name).trim(), icon, max + 1);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) {
      res.status(500).json({ error: /UNIQUE/.test(e.message) ? '分类名称已存在' : e.message });
    }
  });

  // 编辑分类
  router.put('/categories/:id', (req, res) => {
    try {
      const { name, icon } = req.body || {};
      const cat = db.prepare('SELECT * FROM app_categories WHERE id = ?').get(Number(req.params.id));
      if (!cat) return res.status(404).json({ error: '分类不存在' });
      db.prepare("UPDATE app_categories SET name = ?, icon = ?, updated_at = datetime('now') WHERE id = ?")
        .run(name || cat.name, icon || cat.icon, cat.id);
      // 分类改名时同步更新应用的 category 归属
      if (name && name !== cat.name) {
        db.prepare("UPDATE apps SET category = ?, updated_at = datetime('now') WHERE category = ?").run(name, cat.name);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: /UNIQUE/.test(e.message) ? '分类名称已存在' : e.message });
    }
  });

  // 删除分类（有应用时拒绝，提示先移出应用）
  router.delete('/categories/:id', (req, res) => {
    try {
      const cat = db.prepare('SELECT * FROM app_categories WHERE id = ?').get(Number(req.params.id));
      if (!cat) return res.status(404).json({ error: '分类不存在' });
      const n = db.prepare('SELECT COUNT(*) AS n FROM apps WHERE category = ?').get(cat.name).n;
      if (n > 0) return res.status(400).json({ error: `该分类下还有 ${n} 个应用，请先移出后再删除` });
      db.prepare('DELETE FROM app_categories WHERE id = ?').run(cat.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 编辑应用（名称/描述/图标）
  router.put('/apps/:id', (req, res) => {
    try {
      const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(Number(req.params.id));
      if (!app) return res.status(404).json({ error: '应用不存在' });
      if (app.hidden === 1) return res.status(403).json({ error: '系统级应用不可编辑' });
      const { name, description, icon } = req.body || {};
      db.prepare("UPDATE apps SET name = ?, description = ?, icon = ?, updated_at = datetime('now') WHERE id = ?")
        .run(name || app.name, description !== undefined ? description : app.description, icon || app.icon, app.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 新建应用（归入指定分类，默认行业应用）
  router.post('/apps', (req, res) => {
    try {
      const { code, name, description = '', icon = 'apps', category } = req.body || {};
      if (!code || !String(code).trim() || !name || !String(name).trim()) {
        return res.status(400).json({ error: '应用编码与名称不能为空' });
      }
      const targetCat = category || '行业应用';
      const cat = db.prepare('SELECT id FROM app_categories WHERE name = ?').get(targetCat);
      if (!cat) return res.status(400).json({ error: '目标分类不存在' });
      const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM apps').get().m;
      const r = db.prepare('INSERT INTO apps (code, name, description, icon, category, sort_order, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)')
        .run(String(code).trim(), String(name).trim(), description, icon, targetCat, max + 1);
      // 演示方案自动纳入新应用（demo 动态全量）
      const demo = db.prepare("SELECT id FROM solutions WHERE code = 'demo'").get();
      if (demo) db.prepare('INSERT OR IGNORE INTO solution_apps (solution_id, app_id, enabled) VALUES (?, ?, 1)').run(demo.id, r.lastInsertRowid);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) {
      res.status(500).json({ error: /UNIQUE/.test(e.message) ? '应用编码已存在' : e.message });
    }
  });

  // 修改应用分类
  router.put('/apps/:id/category', (req, res) => {
    try {
      const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(Number(req.params.id));
      if (!app) return res.status(404).json({ error: '应用不存在' });
      if (app.hidden === 1) return res.status(403).json({ error: '系统级应用不可改分类' });
      const { category } = req.body || {};
      const cat = db.prepare('SELECT id FROM app_categories WHERE name = ?').get(category);
      if (!category || !cat) return res.status(400).json({ error: '目标分类不存在' });
      db.prepare("UPDATE apps SET category = ?, updated_at = datetime('now') WHERE id = ?").run(category, app.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 拖拽排序：同分类下全量顺序 { category, ids: [...] }
  router.put('/sort', (req, res) => {
    try {
      const { category, ids } = req.body || {};
      if (!category || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '参数不完整' });
      const stmt = db.prepare("UPDATE apps SET sort_order = ?, updated_at = datetime('now') WHERE id = ? AND category = ?");
      ids.forEach((id, idx) => stmt.run(idx + 1, Number(id), category));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
