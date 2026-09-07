// 解决方案（应用）管理
import { Router } from 'express';
import { toSolution, addOperationLog } from '../db.js';

export function createSolutionsRouter(db) {
  const router = Router();

  // 列表
  router.get('/', (req, res) => {
    const solutions = db
      .prepare('SELECT * FROM solutions ORDER BY sort_order ASC, id ASC')
      .all()
      .map(toSolution);
    res.json({ solutions });
  });

  // 新建
  router.post('/', (req, res) => {
    const { name, code, description, icon, sortOrder } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: '名称必填' });
    if (!code || !code.trim()) return res.status(400).json({ error: '唯一标识必填' });
    const exists = db.prepare('SELECT id FROM solutions WHERE code = ?').get(code.trim());
    if (exists) return res.status(400).json({ error: '唯一标识已存在' });
    const info = db
      .prepare('INSERT INTO solutions (name, code, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(name.trim(), code.trim(), description || '', icon || '', sortOrder || 0);
    const solution = db.prepare('SELECT * FROM solutions WHERE id = ?').get(info.lastInsertRowid);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'create_solution', targetType: 'solution', targetId: solution.id, detail: `新建解决方案: ${solution.name} (${solution.code})`, ip: req.ip });
    res.json({ solution: toSolution(solution) });
  });

  // 编辑
  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const solution = db.prepare('SELECT * FROM solutions WHERE id = ?').get(id);
    if (!solution) return res.status(404).json({ error: '解决方案不存在' });
    const { name, description, icon, enabled, sortOrder } = req.body || {};
    db.prepare(
      "UPDATE solutions SET name = COALESCE(?, name), description = COALESCE(?, description), icon = COALESCE(?, icon), enabled = COALESCE(?, enabled), sort_order = COALESCE(?, sort_order), updated_at = datetime('now') WHERE id = ?"
    ).run(name ?? null, description ?? null, icon ?? null, enabled ?? null, sortOrder ?? null, id);
    const updated = db.prepare('SELECT * FROM solutions WHERE id = ?').get(id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'update_solution', targetType: 'solution', targetId: id, detail: `编辑解决方案: ${updated.name}`, ip: req.ip });
    res.json({ solution: toSolution(updated) });
  });

  // 删除
  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const solution = db.prepare('SELECT * FROM solutions WHERE id = ?').get(id);
    if (!solution) return res.status(404).json({ error: '解决方案不存在' });
    if (solution.code === 'panorama') return res.status(400).json({ error: '360全景为系统内置解决方案，不可删除' });
    db.prepare('DELETE FROM solutions WHERE id = ?').run(id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'delete_solution', targetType: 'solution', targetId: id, detail: `删除解决方案: ${solution.name}`, ip: req.ip });
    res.json({ ok: true });
  });

  return router;
}
