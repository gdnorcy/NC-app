// 客户（租户）后台 API —— 数据严格按 customer_id 隔离
import { Router } from 'express';
import { toPlan, toScene, toUser, toOrder, toCustomer, genOrderNo, genShareToken, hashPassword } from '../db.js';

export function createCustomerRouter(db) {
  const router = Router();

// 中间件：确保是租户用户，并挂载 req.customerId
function requireTenant(req, res, next) {
  const user = req.user;
  if (!user || !['tenant_admin', 'tenant_member'].includes(user.role)) {
    return res.status(403).json({ error: '无权访问客户后台' });
  }
  if (!user.customerId) {
    return res.status(403).json({ error: '账号未关联租户' });
  }
  req.customerId = user.customerId;
  next();
}

// 中间件：仅租户管理员
function requireTenantAdmin(req, res, next) {
  if (req.user.role !== 'tenant_admin') {
    return res.status(403).json({ error: '仅租户管理员可操作' });
  }
  next();
}

// 获取当前租户信息
router.get('/profile', requireTenant, (req, res) => {
  const cust = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.customerId);
  if (!cust) return res.status(404).json({ error: '租户不存在' });
  res.json({ customer: toCustomer(cust), user: toUser(req.user) });
});

// 仪表盘：客户自身业务数据
router.get('/dashboard', requireTenant, (req, res) => {
  const cid = req.customerId;
  const planCount = db.prepare('SELECT COUNT(*) AS n FROM plans WHERE project_id = ?').get(cid).n;
  const sceneCount = db
    .prepare('SELECT COUNT(*) AS n FROM scenes s JOIN plans p ON s.plan_id = p.id WHERE p.project_id = ?')
    .get(cid).n;
  const memberCount = db.prepare('SELECT COUNT(*) AS n FROM users WHERE customer_id = ?').get(cid).n;
  const orderCount = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE customer_id = ? AND status='paid'").get(cid).n;
  const totalAmount = db
    .prepare("SELECT COALESCE(SUM(amount),0) AS s FROM orders WHERE customer_id = ? AND status='paid'")
    .get(cid).s;

  // 最近 5 个场景
  const recentScenes = db
    .prepare(
      `SELECT s.* FROM scenes s JOIN plans p ON s.plan_id = p.id
       WHERE p.project_id = ? ORDER BY s.created_at DESC LIMIT 5`
    )
    .all(cid)
    .map(toScene);

  // 最近 3 个订单
  const recentOrders = db
    .prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 3')
    .all(cid)
    .map(toOrder);

  res.json({
    stats: { planCount, sceneCount, memberCount, orderCount, totalAmount },
    recentScenes,
    recentOrders,
  });
});

// 我的方案（客户查看自己的方案列表）
router.get('/plans', requireTenant, (req, res) => {
  const plans = db
    .prepare('SELECT * FROM plans WHERE project_id = ? ORDER BY sort_order ASC, id ASC')
    .all(req.customerId)
    .map((p) => {
      const sceneCount = db.prepare('SELECT COUNT(*) AS n FROM scenes WHERE plan_id = ?').get(p.id).n;
      return { ...toPlan(p), sceneCount };
    });
  res.json({ plans });
});

// 校验方案属于当前租户
function verifyPlanOwnership(req, res, planId) {
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND project_id = ?').get(planId, req.customerId);
  if (!plan) {
    res.status(404).json({ error: '方案不存在' });
    return null;
  }
  return plan;
}

// 新建方案
router.post('/plans', requireTenant, requireTenantAdmin, (req, res) => {
  const { name, description, coverPath } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: '方案名称必填' });
  const info = db
    .prepare(
      'INSERT INTO plans (project_id, name, description, cover_path, share_token, share_enabled, sort_order) VALUES (?, ?, ?, ?, ?, 1, (SELECT COALESCE(MAX(sort_order),0)+1 FROM plans WHERE project_id = ?))'
    )
    .run(req.customerId, name.trim(), description || '', coverPath || '', genShareToken(), req.customerId);
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(info.lastInsertRowid);
  res.json({ plan: toPlan(plan) });
});

// 编辑方案
router.put('/plans/:id', requireTenant, requireTenantAdmin, (req, res) => {
  const id = Number(req.params.id);
  const plan = verifyPlanOwnership(req, res, id);
  if (!plan) return;
  const { name, description, coverPath, published, shareEnabled } = req.body || {};
  db.prepare(
    "UPDATE plans SET name = COALESCE(?, name), description = COALESCE(?, description), cover_path = COALESCE(?, cover_path), published = COALESCE(?, published), share_enabled = COALESCE(?, share_enabled), updated_at = datetime('now') WHERE id = ?"
  ).run(name ?? null, description ?? null, coverPath ?? null, published ?? null, shareEnabled ?? null, id);
  const updated = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
  res.json({ plan: toPlan(updated) });
});

// 删除方案
router.delete('/plans/:id', requireTenant, requireTenantAdmin, (req, res) => {
  const id = Number(req.params.id);
  const plan = verifyPlanOwnership(req, res, id);
  if (!plan) return;
  // 场景归入默认方案
  const defaultPlan = db.prepare('SELECT id FROM plans WHERE project_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1').get(req.customerId);
  if (defaultPlan && defaultPlan.id !== id) {
    db.prepare('UPDATE scenes SET plan_id = ? WHERE plan_id = ?').run(defaultPlan.id, id);
  }
  db.prepare('DELETE FROM plans WHERE id = ?').run(id);
  res.json({ ok: true });
});

// 方案下的场景列表
router.get('/plans/:id/scenes', requireTenant, (req, res) => {
  const id = Number(req.params.id);
  const plan = verifyPlanOwnership(req, res, id);
  if (!plan) return;
  const scenes = db
    .prepare('SELECT * FROM scenes WHERE plan_id = ? ORDER BY sort_order ASC, id ASC')
    .all(id)
    .map(toScene);
  res.json({ scenes, plan: toPlan(plan) });
});

// 校验场景属于当前租户
function verifySceneOwnership(req, res, sceneId) {
  const scene = db
    .prepare('SELECT s.* FROM scenes s JOIN plans p ON s.plan_id = p.id WHERE s.id = ? AND p.project_id = ?')
    .get(sceneId, req.customerId);
  if (!scene) {
    res.status(404).json({ error: '场景不存在' });
    return null;
  }
  return scene;
}

// 新建场景
router.post('/scenes', requireTenant, requireTenantAdmin, (req, res) => {
  const { planId, title, description, imagePath, previewPath, sortOrder, published } = req.body || {};
  if (!planId) return res.status(400).json({ error: '方案ID必填' });
  const plan = verifyPlanOwnership(req, res, planId);
  if (!plan) return;
  const info = db
    .prepare(
      'INSERT INTO scenes (plan_id, title, description, image_path, preview_path, sort_order, published) VALUES (?, ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM scenes WHERE plan_id = ?)), ?)'
    )
    .run(planId, title || '未命名场景', description || '', imagePath || '', previewPath || '', sortOrder ?? null, planId, published ?? 1);
  const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(info.lastInsertRowid);
  res.json({ scene: toScene(scene) });
});

// 编辑场景
router.put('/scenes/:id', requireTenant, requireTenantAdmin, (req, res) => {
  const id = Number(req.params.id);
  const scene = verifySceneOwnership(req, res, id);
  if (!scene) return;
  const { title, description, imagePath, previewPath, planId, sortOrder, published, shareEnabled } = req.body || {};
  // 如果改了 planId，校验新方案属于当前租户
  if (planId && planId !== scene.plan_id) {
    const newPlan = verifyPlanOwnership(req, res, planId);
    if (!newPlan) return;
  }
  db.prepare(
    "UPDATE scenes SET title = COALESCE(?, title), description = COALESCE(?, description), image_path = COALESCE(?, image_path), preview_path = COALESCE(?, preview_path), plan_id = COALESCE(?, plan_id), sort_order = COALESCE(?, sort_order), published = COALESCE(?, published), share_enabled = COALESCE(?, share_enabled), updated_at = datetime('now') WHERE id = ?"
  ).run(title ?? null, description ?? null, imagePath ?? null, previewPath ?? null, planId ?? null, sortOrder ?? null, published ?? null, shareEnabled ?? null, id);
  const updated = db.prepare('SELECT * FROM scenes WHERE id = ?').get(id);
  res.json({ scene: toScene(updated) });
});

// 删除场景
router.delete('/scenes/:id', requireTenant, requireTenantAdmin, (req, res) => {
  const id = Number(req.params.id);
  const scene = verifySceneOwnership(req, res, id);
  if (!scene) return;
  db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
  res.json({ ok: true });
});

// 我的账单
router.get('/orders', requireTenant, (req, res) => {
  const orders = db
    .prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC')
    .all(req.customerId)
    .map(toOrder);
  res.json({ orders });
});

// 成员管理（仅管理员）
router.get('/members', requireTenant, requireTenantAdmin, (req, res) => {
  const members = db
    .prepare('SELECT * FROM users WHERE customer_id = ? ORDER BY id ASC')
    .all(req.customerId)
    .map(toUser);
  res.json({ members });
});

// 新增成员（仅管理员）
router.post('/members', requireTenant, requireTenantAdmin, (req, res) => {
  const { username, password, phone, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  const memberRole = role === 'tenant_member' ? 'tenant_member' : 'tenant_member';
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ error: '用户名已存在' });
  const { hash, salt } = hashPassword(password);
  const info = db
    .prepare(
      'INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(username, phone || null, hash, salt, memberRole, 'active', req.customerId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ user: toUser(user) });
});

// 删除成员（仅管理员，不能删自己）
router.delete('/members/:id', requireTenant, requireTenantAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  const member = db.prepare('SELECT * FROM users WHERE id = ? AND customer_id = ?').get(id, req.customerId);
  if (!member) return res.status(404).json({ error: '成员不存在' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// 账号设置：修改密码
router.post('/change-password', requireTenant, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '旧密码和新密码必填' });
  if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const { hash } = hashPassword(oldPassword, user.password_salt);
  if (hash !== user.password_hash) return res.status(400).json({ error: '旧密码不正确' });
  const { hash: newHash, salt: newSalt } = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
    newHash,
    newSalt,
    req.user.id
  );
  res.json({ ok: true });
});

// 账号设置：更新个人信息
router.put('/profile', requireTenant, (req, res) => {
  const { phone } = req.body;
  db.prepare('UPDATE users SET phone = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
    phone || null,
    req.user.id
  );
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: toUser(user) });
});

  return router;
}
