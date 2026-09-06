// 客户（租户）后台 API —— 数据严格按 customer_id 隔离
import { Router } from 'express';
import multer from 'multer';
import { toPlan, toScene, toUser, toOrder, toCustomer, genOrderNo, genShareToken, hashPassword } from '../db.js';
import { getStorage } from '../storage/index.js';
import { transcodeImage } from './scenes.js';
import { WxComponentService } from '../services/wx-component.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

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

  // 客户已开通的应用（解决方案）
  const project = db.prepare('SELECT solutions FROM projects WHERE id = ?').get(cid);
  let appCodes = [];
  try { appCodes = JSON.parse(project?.solutions || '[]'); } catch { appCodes = []; }
  const apps = db
    .prepare(`SELECT * FROM solutions WHERE code IN (${appCodes.map(() => '?').join(',')}) OR id IN (${appCodes.map(() => '?').join(',')})`)
    .all(...appCodes, ...appCodes);

  // 按应用统计（目前方案和场景都属于客户，暂按应用分组展示，后续方案可关联应用）
  const byApp = apps.map((app) => ({
    appId: app.id,
    appName: app.name,
    appCode: app.code,
    appIcon: app.icon,
    enabled: true,
    plans: planCount,  // 目前所有方案都属于360全景应用
    scenes: sceneCount,
  }));

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
    stats: { planCount, sceneCount, memberCount, orderCount, totalAmount, appCount: apps.length },
    byApp,
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
  const { planId, title, description, imagePath, previewPath, sortOrder, published, hotspots, meta } = req.body || {};
  if (!planId) return res.status(400).json({ error: '方案ID必填' });
  const plan = verifyPlanOwnership(req, res, planId);
  if (!plan) return;
  const hotspotsJson = Array.isArray(hotspots) ? JSON.stringify(hotspots) : '[]';
  const metaJson = meta && typeof meta === 'object' ? JSON.stringify(meta) : '{}';
  const pubVal = published === undefined ? 1 : (published ? 1 : 0);
  const info = db
    .prepare(
      'INSERT INTO scenes (plan_id, title, description, image_path, preview_path, sort_order, published, hotspots, meta) VALUES (?, ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM scenes WHERE plan_id = ?)), ?, ?, ?)'
    )
    .run(planId, title || '未命名场景', description || '', imagePath || '', previewPath || '', sortOrder ?? null, planId, pubVal, hotspotsJson, metaJson);
  const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(info.lastInsertRowid);
  res.json({ scene: toScene(scene) });
});

// 编辑场景
router.put('/scenes/:id', requireTenant, requireTenantAdmin, (req, res) => {
  const id = Number(req.params.id);
  const scene = verifySceneOwnership(req, res, id);
  if (!scene) return;
  const { title, description, imagePath, previewPath, planId, sortOrder, published, shareEnabled, hotspots, meta } = req.body || {};
  // 如果改了 planId，校验新方案属于当前租户
  if (planId && planId !== scene.plan_id) {
    const newPlan = verifyPlanOwnership(req, res, planId);
    if (!newPlan) return;
  }
  const hotspotsJson = Array.isArray(hotspots) ? JSON.stringify(hotspots) : null;
  const metaJson = meta && typeof meta === 'object' ? JSON.stringify(meta) : null;
  const pubVal = published === undefined ? null : (published ? 1 : 0);
  const shareVal = shareEnabled === undefined ? null : (shareEnabled ? 1 : 0);
  db.prepare(
    "UPDATE scenes SET title = COALESCE(?, title), description = COALESCE(?, description), image_path = COALESCE(?, image_path), preview_path = COALESCE(?, preview_path), plan_id = COALESCE(?, plan_id), sort_order = COALESCE(?, sort_order), published = COALESCE(?, published), share_enabled = COALESCE(?, share_enabled), hotspots = COALESCE(?, hotspots), meta = COALESCE(?, meta), updated_at = datetime('now') WHERE id = ?"
  ).run(title ?? null, description ?? null, imagePath ?? null, previewPath ?? null, planId ?? null, sortOrder ?? null, pubVal, shareVal, hotspotsJson, metaJson, id);
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

// 客户独立配置：部分更新（仅租户管理员）
router.put('/config', requireTenant, requireTenantAdmin, (req, res) => {
  const customer = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.customerId);
  if (!customer) return res.status(404).json({ error: '客户不存在' });
  let config = {};
  try { config = JSON.parse(customer.config || '{}'); } catch {}
  // 合并传入的配置（只更新传入的字段）
  const updates = req.body || {};
  if (updates.storage) config.storage = { ...(config.storage || {}), ...updates.storage };
  if (updates.sms) config.sms = { ...(config.sms || {}), ...updates.sms };
  if (updates.copyright !== undefined) config.copyright = updates.copyright;
  if (updates.payment) config.payment = { ...(config.payment || {}), ...updates.payment };
  if (updates.upload_limits) config.upload_limits = { ...(config.upload_limits || {}), ...updates.upload_limits };
  if (updates.open_platform) config.open_platform = { ...(config.open_platform || {}), ...updates.open_platform };
  db.prepare("UPDATE projects SET config = ?, updated_at = datetime('now') WHERE id = ?").run(
    JSON.stringify(config),
    req.customerId
  );
  res.json({ config });
});

// 存储测试连接（仅租户管理员）
router.post('/storage/test', requireTenant, requireTenantAdmin, async (req, res) => {
  try {
    const { provider, ...cfg } = req.body || {};
    if (!provider || provider === 'local') return res.json({ message: '本地存储无需测试', ok: true });
    const storage = await getStorage(db);
    // 用传入的配置创建临时存储实例测试
    let testStorage;
    if (provider === 'qiniu') {
      const { QiniuStorage } = await import('../storage/qiniu.js');
      testStorage = new QiniuStorage(cfg);
    } else if (provider === 'aliyun') {
      const { OssStorage } = await import('../storage/oss.js');
      testStorage = new OssStorage(cfg);
    } else {
      return res.status(400).json({ error: '不支持的存储服务商' });
    }
    const ok = await testStorage.testConnection();
    if (ok) res.json({ message: '连接成功', ok: true });
    else res.status(400).json({ error: '连接失败，请检查配置' });
  } catch (e) {
    console.error('存储测试连接失败:', e);
    res.status(400).json({ error: e.message || '连接失败' });
  }
});

// 图片上传（复用云存储配置）
router.post('/upload', requireTenant, requireTenantAdmin, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? '图片大小不能超过 50MB' : err.message;
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    try {
      const storage = await getStorage(db);
      const result = await transcodeImage(req.file.buffer, storage);
      res.status(201).json({ ...result, originalName: req.file.originalname });
    } catch (e) {
      console.error('图片转码或上传失败:', e);
      res.status(400).json({ error: '图片处理失败，请确认文件为有效的全景图' });
    }
  });
});

// —— 全端渠道管理（客户自主管理自己的渠道） ——

// 获取客户的所有渠道配置
router.get('/channels', requireTenant, (req, res) => {
  const cid = req.customerId;
  const channels = db.prepare('SELECT * FROM channel_apps WHERE customer_id = ?').all(cid);
  res.json({ channels });
});

// 更新渠道配置
router.put('/channels/:type', requireTenant, requireTenantAdmin, (req, res) => {
  const cid = req.customerId;
  const type = req.params.type;
  const { brandName, primaryColor, customDomain, enabled, page } = req.body || {};
  const existing = db.prepare('SELECT id FROM channel_apps WHERE customer_id = ? AND channel_type = ?').get(cid, type);
  if (existing) {
    db.prepare(`UPDATE channel_apps SET brand_name=?, primary_color=?, custom_domain=?, enabled=?, page=?, updated_at=datetime('now') WHERE id=?`)
      .run(brandName || null, primaryColor || null, customDomain || null, enabled ? 1 : 0, page || null, existing.id);
  } else {
    db.prepare(`INSERT INTO channel_apps (customer_id, channel_type, brand_name, primary_color, custom_domain, enabled, page) VALUES (?,?,?,?,?,?,?)`)
      .run(cid, type, brandName || null, primaryColor || null, customDomain || null, enabled ? 1 : 0, page || null);
  }
  res.json({ message: '配置已保存' });
});

// 小程序：获取模板列表
router.get('/channels/mini/templates', requireTenant, async (req, res) => {
  try {
    const wxService = new WxComponentService(db);
    const templates = await wxService.getTemplateList();
    res.json({ templates });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 小程序：生成授权链接
router.post('/channels/mini/auth-url', requireTenant, requireTenantAdmin, async (req, res) => {
  try {
    const { redirectUri } = req.body || {};
    const wxService = new WxComponentService(db);
    const result = await wxService.getAuthUrl({
      redirectUri: redirectUri || `${req.protocol}://${req.get('host')}/customer`,
      customerId: req.customerId,
      authType: 2,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 小程序：从模板上传代码（创建草稿）
router.post('/channels/mini/upload', requireTenant, requireTenantAdmin, async (req, res) => {
  try {
    const { templateId, userVersion, userDesc } = req.body || {};
    const cid = req.customerId;
    const channel = db.prepare('SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = ?').get(cid, 'mini');
    if (!channel?.authorizer_appid) return res.status(400).json({ error: '小程序未授权' });
    const wxService = new WxComponentService(db);
    await wxService.uploadCode(channel.authorizer_appid, { templateId, userVersion, userDesc });
    db.prepare(`UPDATE channel_apps SET audit_status='draft', version=?, updated_at=datetime('now') WHERE id=?`).run(userVersion, channel.id);
    // 记录发布日志
    db.prepare(`INSERT INTO channel_deploy_logs (customer_id, channel_type, action, version, status, created_at) VALUES (?,?,?,?,?,datetime('now'))`)
      .run(cid, 'mini', 'upload', userVersion, 'success');
    res.json({ message: '代码上传成功' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 小程序：提交审核
router.post('/channels/mini/submit-audit', requireTenant, requireTenantAdmin, async (req, res) => {
  try {
    const cid = req.customerId;
    const channel = db.prepare('SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = ?').get(cid, 'mini');
    if (!channel?.authorizer_appid) return res.status(400).json({ error: '小程序未授权' });
    const wxService = new WxComponentService(db);
    await wxService.submitAudit(channel.authorizer_appid);
    db.prepare(`UPDATE channel_apps SET audit_status='auditing', updated_at=datetime('now') WHERE id=?`).run(channel.id);
    db.prepare(`INSERT INTO channel_deploy_logs (customer_id, channel_type, action, version, status, created_at) VALUES (?,?,?,?,?,datetime('now'))`)
      .run(cid, 'mini', 'submit_audit', channel.version, 'success');
    res.json({ message: '已提交审核' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 小程序：查询审核状态
router.get('/channels/mini/audit-status', requireTenant, async (req, res) => {
  try {
    const cid = req.customerId;
    const channel = db.prepare('SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = ?').get(cid, 'mini');
    if (!channel?.authorizer_appid) return res.status(400).json({ error: '小程序未授权' });
    const wxService = new WxComponentService(db);
    const status = await wxService.getAuditStatus(channel.authorizer_appid);
    if (status) {
      db.prepare(`UPDATE channel_apps SET audit_status=?, updated_at=datetime('now') WHERE id=?`).run(status, channel.id);
    }
    res.json({ auditStatus: status || channel.audit_status });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 小程序：发布
router.post('/channels/mini/release', requireTenant, requireTenantAdmin, async (req, res) => {
  try {
    const cid = req.customerId;
    const channel = db.prepare('SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = ?').get(cid, 'mini');
    if (!channel?.authorizer_appid) return res.status(400).json({ error: '小程序未授权' });
    const wxService = new WxComponentService(db);
    await wxService.release(channel.authorizer_appid);
    db.prepare(`UPDATE channel_apps SET audit_status='released', updated_at=datetime('now') WHERE id=?`).run(channel.id);
    db.prepare(`INSERT INTO channel_deploy_logs (customer_id, channel_type, action, version, status, created_at) VALUES (?,?,?,?,?,datetime('now'))`)
      .run(cid, 'mini', 'release', channel.version, 'success');
    res.json({ message: '发布成功' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 小程序：版本回退
router.post('/channels/mini/rollback', requireTenant, requireTenantAdmin, async (req, res) => {
  try {
    const cid = req.customerId;
    const channel = db.prepare('SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = ?').get(cid, 'mini');
    if (!channel?.authorizer_appid) return res.status(400).json({ error: '小程序未授权' });
    const wxService = new WxComponentService(db);
    await wxService.rollback(channel.authorizer_appid);
    db.prepare(`INSERT INTO channel_deploy_logs (customer_id, channel_type, action, version, status, created_at) VALUES (?,?,?,?,?,datetime('now'))`)
      .run(cid, 'mini', 'rollback', channel.version, 'success');
    res.json({ message: '回退成功' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 小程序：发布日志
router.get('/channels/mini/deploy-logs', requireTenant, (req, res) => {
  const cid = req.customerId;
  const logs = db.prepare('SELECT * FROM channel_deploy_logs WHERE customer_id = ? AND channel_type = ? ORDER BY created_at DESC LIMIT 20').all(cid, 'mini');
  res.json({ logs });
});

  return router;
}
