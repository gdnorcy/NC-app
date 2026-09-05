import express from 'express';
import { hashPassword, toUser, addOperationLog } from '../db.js';
import { requireAuth, requireRole, VALID_ROLES } from '../auth.js';

export function createUsersRouter(db) {
  const router = express.Router();

  // 所有用户管理接口都需要登录 + admin 权限
  router.use(requireAuth);
  router.use(requireRole('admin'));

  // —— 用户列表 ——
  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY id ASC').all();
    res.json({ users: rows.map(toUser) });
  });

  // —— 创建子账号 ——
  router.post('/', (req, res) => {
    const { username, phone, password, role = 'editor', status = 'active' } = req.body || {};
    if (!username && !phone) {
      return res.status(400).json({ error: '用户名和手机号至少填一个' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: '无效的角色' });
    }
    if (username && db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      return res.status(409).json({ error: '用户名已存在' });
    }
    if (phone && db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)) {
      return res.status(409).json({ error: '手机号已存在' });
    }
    const { hash, salt } = hashPassword(password);
    const info = db
      .prepare(
        'INSERT INTO users (username, phone, password_hash, password_salt, role, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(username || null, phone || null, hash, salt, role, status);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'create_user', targetType: 'user', targetId: info.lastInsertRowid, detail: `创建用户: ${username || phone} (${role})`, ip: req.ip });
    res.json({ user: toUser(user) });
  });

  // —— 更新用户（角色/状态/用户名/手机号，不改密码） ——
  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const { username, phone, role, status } = req.body || {};
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: '无效的角色' });
    }
    // 不能把自己降级为非 admin（防止锁死）
    if (id === req.user.id && role && role !== 'admin') {
      return res.status(400).json({ error: '不能修改自己的角色' });
    }
    // 不能禁用自己
    if (id === req.user.id && status === 'disabled') {
      return res.status(400).json({ error: '不能禁用自己的账号' });
    }
    if (username && username !== user.username) {
      if (db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id)) {
        return res.status(409).json({ error: '用户名已存在' });
      }
    }
    if (phone && phone !== user.phone) {
      if (db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(phone, id)) {
        return res.status(409).json({ error: '手机号已存在' });
      }
    }
    db.prepare(
      'UPDATE users SET username = COALESCE(?, username), phone = COALESCE(?, phone), role = COALESCE(?, role), status = COALESCE(?, status), updated_at = datetime(\'now\') WHERE id = ?'
    ).run(username ?? null, phone ?? null, role ?? null, status ?? null, id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'update_user', targetType: 'user', targetId: id, detail: `更新用户: ${updated.username || updated.phone}`, ip: req.ip });
    res.json({ user: toUser(updated) });
  });

  // —— 重置密码 ——
  router.post('/:id/reset-password', (req, res) => {
    const id = Number(req.params.id);
    const { password } = req.body || {};
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: '新密码至少 6 位' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const { hash, salt } = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hash, salt, id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'reset_password', targetType: 'user', targetId: id, detail: `重置密码: ${user.username || user.phone}`, ip: req.ip });
    res.json({ ok: true });
  });

  // —— 删除用户 ——
  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) {
      return res.status(400).json({ error: '不能删除自己' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    // 至少保留一个 admin
    if (user.role === 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").get().n;
      if (adminCount <= 1) {
        return res.status(400).json({ error: '至少保留一个可用的管理员账号' });
      }
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'delete_user', targetType: 'user', targetId: id, detail: `删除用户: ${user.username || user.phone}`, ip: req.ip });
    res.json({ ok: true });
  });

  return router;
}
