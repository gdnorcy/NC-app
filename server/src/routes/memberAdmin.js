/**
 * 会员套餐后台管理（阶段B：VIP权益扩展）
 * 路径：/api/admin/member-packages（requireAuth 外层保护）
 * 覆盖新增权益字段：discount / collect_limit / voice_enabled / group_limit + features 能力点勾选
 */
import { Router } from 'express';
import { addOperationLog } from '../db.js';

const FEATURE_OPTIONS = [
  'ai_report', 'ai_words', 'quota_lead', 'quota_push', 'enterprise',
];

export function createMemberAdminRouter(db) {
  const router = Router();

  // 套餐列表（含 features 解析与新权益字段）
  router.get('/', (_req, res) => {
    const rows = db.prepare('SELECT * FROM member_package ORDER BY sort_order ASC, id ASC').all();
    res.json({ packages: rows.map((p) => ({
      ...p,
      features: (() => { try { return JSON.parse(p.features || '[]'); } catch { return []; } })(),
    })) });
  });

  // 能力点选项（供前端勾选）
  router.get('/feature-options', (_req, res) => {
    res.json({ options: FEATURE_OPTIONS });
  });

  // 新建套餐
  router.post('/', (req, res) => {
    try {
      const b = req.body || {};
      const level = String(b.level || '').trim();
      const name = String(b.name || '').trim();
      if (!level || !name) return res.status(400).json({ error: '等级标识与套餐名称不能为空' });
      if (db.prepare('SELECT id FROM member_package WHERE level=?').get(level)) {
        return res.status(400).json({ error: '等级标识已存在' });
      }
      const features = Array.isArray(b.features) ? b.features.filter((f) => FEATURE_OPTIONS.includes(f)) : [];
      const r = db.prepare(
        `INSERT INTO member_package (level, name, price, duration_days, description, features, sort_order, enabled,
          discount, collect_limit, voice_enabled, group_limit)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(level, name, Number(b.price) || 0, Number(b.durationDays) || 30,
        String(b.description || '').slice(0, 200), JSON.stringify(features),
        Number(b.sortOrder) || 0, b.enabled === false ? 0 : 1,
        Number(b.discount) >= 0 ? Number(b.discount) : 1.0,
        Number(b.collectLimit) >= 0 ? Number(b.collectLimit) : 0,
        b.voiceEnabled ? 1 : 0, Number(b.groupLimit) >= 0 ? Number(b.groupLimit) : 0);
      addOperationLog(db, { userId: req.user?.id, username: req.user?.username, action: 'create_member_package', targetType: 'member_package', targetId: r.lastInsertRowid, detail: `创建会员套餐: ${name}`, ip: req.ip });
      res.status(201).json({ package: db.prepare('SELECT * FROM member_package WHERE id=?').get(r.lastInsertRowid) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 更新套餐（含全部新权益字段）
  router.put('/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const p = db.prepare('SELECT * FROM member_package WHERE id=?').get(id);
      if (!p) return res.status(404).json({ error: '套餐不存在' });
      const b = req.body || {};
      const features = Array.isArray(b.features) ? b.features.filter((f) => FEATURE_OPTIONS.includes(f)) : undefined;
      db.prepare(
        `UPDATE member_package SET level=?, name=?, price=?, duration_days=?, description=?, features=?, sort_order=?, enabled=?,
          discount=?, collect_limit=?, voice_enabled=?, group_limit=?, updated_at=datetime('now') WHERE id=?`
      ).run(
        b.level !== undefined && String(b.level).trim() ? String(b.level).trim() : p.level,
        b.name !== undefined && String(b.name).trim() ? String(b.name).trim() : p.name,
        b.price !== undefined ? Number(b.price) || 0 : p.price,
        b.durationDays !== undefined ? Number(b.durationDays) || 30 : p.duration_days,
        b.description !== undefined ? String(b.description).slice(0, 200) : p.description,
        features !== undefined ? JSON.stringify(features) : p.features,
        b.sortOrder !== undefined ? Number(b.sortOrder) || 0 : p.sort_order,
        b.enabled !== undefined ? (b.enabled ? 1 : 0) : p.enabled,
        b.discount !== undefined ? (Number(b.discount) >= 0 ? Number(b.discount) : 1.0) : p.discount,
        b.collectLimit !== undefined ? (Number(b.collectLimit) >= 0 ? Number(b.collectLimit) : 0) : p.collect_limit,
        b.voiceEnabled !== undefined ? (b.voiceEnabled ? 1 : 0) : p.voice_enabled,
        b.groupLimit !== undefined ? (Number(b.groupLimit) >= 0 ? Number(b.groupLimit) : 0) : p.group_limit,
        id,
      );
      addOperationLog(db, { userId: req.user?.id, username: req.user?.username, action: 'update_member_package', targetType: 'member_package', targetId: id, detail: `更新会员套餐: ${p.name}`, ip: req.ip });
      res.json({ package: db.prepare('SELECT * FROM member_package WHERE id=?').get(id) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除套餐（引用该套餐的用户的 member_level 需同步降级为 free，避免悬空）
  router.delete('/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const p = db.prepare('SELECT * FROM member_package WHERE id=?').get(id);
      if (!p) return res.status(404).json({ error: '套餐不存在' });
      db.prepare('UPDATE platform_user SET member_level=?, member_expire_at=NULL WHERE member_level=?').run('free', p.level);
      db.prepare('DELETE FROM member_package WHERE id=?').run(id);
      addOperationLog(db, { userId: req.user?.id, username: req.user?.username, action: 'delete_member_package', targetType: 'member_package', targetId: id, detail: `删除会员套餐: ${p.name}（引用用户降级 free）`, ip: req.ip });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
