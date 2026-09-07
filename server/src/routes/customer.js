// 客户（租户）后台 API —— 数据严格按 customer_id 隔离
import { Router } from 'express';
import multer from 'multer';
import { toPlan, toScene, toUser, toOrder, toCustomer, genOrderNo, genShareToken, hashPassword, addOperationLog } from '../db.js';
import { getStorage } from '../storage/index.js';
import { transcodeImage } from './scenes.js';
import { WxComponentService } from '../services/wx-component.js';
import { checkTenantAccess, tenantState } from '../tenant.js';
import { calcFunnel, trendSeries, eventDistribution, topTargets, calcHealthScore } from '../services/analytics.js';
import { encryptSecret, decryptSecret } from '../crypto.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// 租户配置中的敏感字段（云存储/短信/支付的密钥类字段）：落库加密、回显解密
const CONFIG_SECRET_FIELDS = ['secretKey', 'accessKeySecret', 'mchKey', 'apiKey', 'secret', 'appSecret'];
const CONFIG_SECRET_SECTIONS = ['sms', 'storage', 'payment'];

export function encryptConfigSecrets(cfg) {
  for (const section of CONFIG_SECRET_SECTIONS) {
    const s = cfg[section];
    if (!s || typeof s !== 'object') continue;
    for (const k of Object.keys(s)) {
      if (CONFIG_SECRET_FIELDS.includes(k) && typeof s[k] === 'string' && s[k]) {
        s[k] = encryptSecret(s[k]);
      }
    }
  }
  return cfg;
}

export function decryptConfigSecrets(cfg) {
  for (const section of CONFIG_SECRET_SECTIONS) {
    const s = cfg[section];
    if (!s || typeof s !== 'object') continue;
    for (const k of Object.keys(s)) {
      if (CONFIG_SECRET_FIELDS.includes(k) && typeof s[k] === 'string' && s[k]) {
        try { s[k] = decryptSecret(s[k]); } catch { /* 非密文（明文历史数据）原样保留 */ }
      }
    }
  }
  return cfg;
}

function auditCust(db, req, action, targetType, targetId, detail) {
  addOperationLog(db, {
    userId: req.user?.uid ?? req.user?.id ?? null,
    username: req.user?.username ?? req.user?.phone ?? 'tenant-user',
    action, targetType, targetId,
    detail: `[租户#${req.customerId}] ${detail}`,
    ip: req.ip,
  });
}

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
  // 租户生命周期：存在/启用/未到期
  const blocked = checkTenantAccess(db, user.customerId);
  if (blocked) return res.status(blocked.status).json({ error: blocked.error });
  req.customerId = user.customerId;
  req.enterpriseId = user.enterpriseId || user.enterprise_id || null;
  next();
}

// 中间件：仅企业管理员（租户后台账号绑定企业）
function requireEnterpriseAdmin(req, res, next) {
  if (!req.enterpriseId) {
    return res.status(403).json({ error: '当前账号未绑定企业，仅企业管理员可操作' });
  }
  next();
}

// 软校验：仅确认租户身份，不拦截生命周期（供 /tenant/status 在到期时仍能返回状态）
function requireTenantSoft(req, res, next) {
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
  const customer = toCustomer(cust);
  if (customer.config) decryptConfigSecrets(customer.config);
  res.json({ customer, user: toUser(req.user) });
});

// 仪表盘：客户自身业务数据
router.get('/dashboard', requireTenant, (req, res) => {
  const cid = req.customerId;
  const planCount = db.prepare('SELECT COUNT(*) AS n FROM plans WHERE project_id = ?').get(cid).n;
  const sceneCount = db
    .prepare('SELECT COUNT(*) AS n FROM scenes s JOIN plans p ON s.plan_id = p.id WHERE p.project_id = ?')
    .get(cid).n;
  const memberCount = db.prepare('SELECT COUNT(*) AS n FROM users WHERE customer_id = ?').get(cid).n;
  const orderCount = db.prepare("SELECT COUNT(*) AS n FROM payment_orders WHERE customer_id = ? AND payer_type='platform' AND status='paid'").get(cid).n;
  const totalAmount = db
    .prepare("SELECT COALESCE(SUM(amount),0) AS s FROM payment_orders WHERE customer_id = ? AND payer_type='platform' AND status='paid'")
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
    .prepare("SELECT * FROM payment_orders WHERE customer_id = ? AND payer_type='platform' ORDER BY id DESC LIMIT 3")
    .all(cid)
    .map((r) => ({ id: r.id, orderNo: r.order_no, productName: r.product_name, amount: r.amount, status: r.status, createdAt: r.created_at }));

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
  auditCust(db, req, 'create_plan', 'plan', plan.id, `创建方案: ${plan.name}`);
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
  auditCust(db, req, 'update_plan', 'plan', id, `编辑方案: ${updated.name}`);
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
  const quota = checkTenantQuota(db, plan.project_id, 'max_scenes');
  if (!quota.ok) return res.status(403).json({ error: `场景数量已达上限（${quota.used}/${quota.limit}），请升级套餐后再创建` });
  const hotspotsJson = Array.isArray(hotspots) ? JSON.stringify(hotspots) : '[]';
  const metaJson = meta && typeof meta === 'object' ? JSON.stringify(meta) : '{}';
  const pubVal = published === undefined ? 1 : (published ? 1 : 0);
  const info = db
    .prepare(
      'INSERT INTO scenes (plan_id, title, description, image_path, preview_path, sort_order, published, hotspots, meta) VALUES (?, ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM scenes WHERE plan_id = ?)), ?, ?, ?)'
    )
    .run(planId, title || '未命名场景', description || '', imagePath || '', previewPath || '', sortOrder ?? null, planId, pubVal, hotspotsJson, metaJson);
  const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(info.lastInsertRowid);
  auditCust(db, req, 'create_scene', 'scene', scene.id, `创建场景: ${scene.title}`);
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
  auditCust(db, req, 'update_scene', 'scene', id, `编辑场景: ${updated.title}`);
  res.json({ scene: toScene(updated) });
});

// 删除场景
router.delete('/scenes/:id', requireTenant, requireTenantAdmin, (req, res) => {
  const id = Number(req.params.id);
  const scene = verifySceneOwnership(req, res, id);
  if (!scene) return;
  db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
  auditCust(db, req, 'delete_scene', 'scene', id, `删除场景: ${scene.title}`);
  res.json({ ok: true });
});

// 我的账单
router.get('/orders', requireTenant, (req, res) => {
  const orders = db
    .prepare("SELECT * FROM payment_orders WHERE customer_id = ? AND payer_type='platform' ORDER BY id DESC")
    .all(req.customerId)
    .map((r) => ({ id: r.id, orderNo: r.order_no, productName: r.product_name, amount: r.amount, status: r.status, paidAt: r.paid_at, createdAt: r.created_at }));
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
  const { enterpriseId } = req.body || {};
  let entId = null;
  if (enterpriseId) {
    const ent = db.prepare('SELECT id FROM tenant_enterprises WHERE id = ? AND customer_id = ?').get(Number(enterpriseId), req.customerId);
    if (!ent) return res.status(400).json({ error: '绑定企业不存在' });
    entId = ent.id;
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ error: '用户名已存在' });
  const { hash, salt } = hashPassword(password);
  const info = db
    .prepare(
      'INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id, enterprise_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(username, phone || null, hash, salt, memberRole, 'active', req.customerId, entId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  auditCust(db, req, 'create_member', 'user', user.id, `新增成员: ${username}${entId ? '(企业管理员)' : ''}`);
  res.json({ user: toUser(user) });
});

// 删除成员（仅管理员，不能删自己）
router.delete('/members/:id', requireTenant, requireTenantAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  const member = db.prepare('SELECT * FROM users WHERE id = ? AND customer_id = ?').get(id, req.customerId);
  if (!member) return res.status(404).json({ error: '成员不存在' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  auditCust(db, req, 'delete_member', 'user', id, `删除成员: ${member.username}`);
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
  auditCust(db, req, 'change_password', 'user', req.user.id, '修改登录密码');
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

// 客户独立配置：读取（仅租户管理员）
router.get('/config', requireTenant, requireTenantAdmin, (req, res) => {
  const customer = db.prepare('SELECT config FROM projects WHERE id = ?').get(req.customerId);
  if (!customer) return res.status(404).json({ error: '客户不存在' });
  let config = {};
  try { config = JSON.parse(customer.config || '{}'); } catch {}
  res.json({ config });
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
  if (updates.brand_color !== undefined) config.brand_color = String(updates.brand_color).trim();
  if (updates.payment) config.payment = { ...(config.payment || {}), ...updates.payment };
  if (updates.upload_limits) config.upload_limits = { ...(config.upload_limits || {}), ...updates.upload_limits };
  if (updates.open_platform) config.open_platform = { ...(config.open_platform || {}), ...updates.open_platform };
  // 敏感密钥字段落库前加密（仅加密本次提交的新值，历史密文保持）
  for (const section of CONFIG_SECRET_SECTIONS) {
    const sec = updates[section];
    if (!sec || typeof sec !== 'object') continue;
    for (const k of Object.keys(sec)) {
      if (CONFIG_SECRET_FIELDS.includes(k) && typeof sec[k] === 'string' && sec[k]) {
        config[section][k] = encryptSecret(sec[k]);
      }
    }
  }
  db.prepare("UPDATE projects SET config = ?, updated_at = datetime('now') WHERE id = ?").run(
    JSON.stringify(config),
    req.customerId
  );
  auditCust(db, req, 'update_tenant_config', 'project', req.customerId, `更新租户独立配置: ${Object.keys(updates).filter(k => updates[k] !== undefined).join(',') || '无'}`);
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
  auditCust(db, req, 'update_channel_config', 'channel_app', req.customerId, `更新渠道配置: ${type}`);
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

// ============================================================
// 智能名片 - 企业管理
// ============================================================

// 企业概览统计
router.get('/card/overview', requireTenant, (req, res) => {
  const eid = req.customerId;
  const employeeCount = db.prepare('SELECT COUNT(*) AS n FROM platform_user WHERE enterprise_id = ?').get(eid).n;
  const cardCount = db.prepare('SELECT COUNT(*) AS n FROM card_profile WHERE enterprise_id = ? AND status = ?').get(eid, 'active').n;
  const totalViews = db.prepare('SELECT COALESCE(SUM(view_count),0) AS s FROM card_profile WHERE enterprise_id = ?').get(eid).s;
  const customerCount = db.prepare('SELECT COUNT(*) AS n FROM card_customer WHERE enterprise_id = ?').get(eid).n;
  const exchangeCount = db.prepare('SELECT COALESCE(SUM(exchange_count),0) AS s FROM card_profile WHERE enterprise_id = ?').get(eid).s;
  res.json({ employeeCount, cardCount, totalViews, customerCount, exchangeCount });
});

// 员工名片列表
router.get('/card/employees', requireTenant, (req, res) => {
  const eid = req.customerId;
  const { page = 1, pageSize = 20, keyword = '' } = req.query;
  const offset = (page - 1) * pageSize;
  let where = 'WHERE c.enterprise_id = ? AND c.status = ?';
  const params = [eid, 'active'];
  if (keyword) {
    where += ' AND (c.name LIKE ? OR c.position LIKE ? OR c.company LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const cards = db.prepare(`
    SELECT c.*, u.nickname, u.avatar as user_avatar, u.member_level
    FROM card_profile c
    LEFT JOIN platform_user u ON c.user_id = u.id
    ${where}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(pageSize), offset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM card_profile c ${where}`).get(...params).n;
  res.json({ cards: cards.map(c => ({
    id: c.id, userId: c.user_id, name: c.name, position: c.position, company: c.company,
    phone: c.phone, avatar: c.avatar, viewCount: c.view_count, exchangeCount: c.exchange_count,
    isPublic: c.is_public, memberLevel: c.member_level, createdAt: c.created_at,
  })), total, page: Number(page), pageSize: Number(pageSize) });
});

// 企业客户列表
router.get('/card/customers', requireTenant, (req, res) => {
  const eid = req.customerId;
  const { page = 1, pageSize = 20, keyword = '', status = '' } = req.query;
  const offset = (page - 1) * pageSize;
  let where = 'WHERE enterprise_id = ?';
  const params = [eid];
  if (keyword) {
    where += ' AND (name LIKE ? OR company LIKE ? OR phone LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }
  const customers = db.prepare(`
    SELECT * FROM card_customer ${where}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, Number(pageSize), offset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM card_customer ${where}`).get(...params).n;
  res.json({ customers: customers.map(c => ({
    id: c.id, name: c.name, phone: c.phone, company: c.company, tags: JSON.parse(c.tags || '[]'),
    source: c.source, status: c.status, lastFollowAt: c.last_follow_at, createdAt: c.created_at,
  })), total, page: Number(page), pageSize: Number(pageSize) });
});

// 企业客户跟进记录（租户视角，仅本租户客户可见）
router.get('/card/customers/:id/follows', requireTenant, (req, res) => {
  const eid = req.customerId;
  const customer = db.prepare('SELECT id FROM card_customer WHERE id = ? AND enterprise_id = ?').get(req.params.id, eid);
  if (!customer) return res.status(404).json({ error: '客户不存在' });
  const follows = db.prepare('SELECT * FROM card_customer_follow WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id);
  res.json({ follows: follows.map(f => ({
    id: f.id, content: f.content, nextFollowAt: f.next_follow_at, createdAt: f.created_at,
  })) });
});

// 企业名片访问趋势（近7天）
router.get('/card/trends', requireTenant, (req, res) => {
  const eid = req.customerId;
  const rows = db.prepare(`
    SELECT visit_date, SUM(visit_count) as views
    FROM card_visitor
    WHERE card_id IN (SELECT id FROM card_profile WHERE enterprise_id = ?)
    AND visit_date >= date('now', '-7 days')
    GROUP BY visit_date
    ORDER BY visit_date
  `).all(eid);
  res.json({ trends: rows });
});

  // 租户生命周期状态（供后台到期提示/续费引导）
  router.get('/tenant/status', requireTenantSoft, (req, res) => {
    const state = tenantState(db, req.customerId);
    const project = state.project || {};
    let daysLeft = null;
    if (project.valid_until) {
      const diff = new Date(project.valid_until + 'T23:59:59') - new Date();
      daysLeft = Math.max(0, Math.ceil(diff / 86400000));
    }
    res.json({
      customerName: project.customer_name || '',
      status: state.active ? 'active' : (state.expired ? 'expired' : (state.missing ? 'missing' : 'disabled')),
      expired: !state.active,
      validUntil: project.valid_until || null,
      daysLeft
    });
  });


  // ============================================================
  // 数据洞察（第三批）：漏斗/趋势/事件分布/名片TOP/健康分
  // ============================================================
  router.get('/analytics/funnel', requireTenant, (req, res) => {
    try {
      const { start = '', end = '', solution = 'card' } = req.query;
      res.json({ funnel: calcFunnel(db, req.customerId, { start, end, solution }) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/analytics/trend', requireTenant, (req, res) => {
    try {
      const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
      res.json({ trend: trendSeries(db, req.customerId, { days, solution: req.query.solution || 'card' }) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/analytics/distribution', requireTenant, (req, res) => {
    try {
      res.json({ distribution: eventDistribution(db, req.customerId, { start: req.query.start || '', end: req.query.end || '', solution: req.query.solution || 'card' }) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/analytics/top', requireTenant, (req, res) => {
    try {
      res.json({ top: topTargets(db, req.customerId, { limit: Number(req.query.limit) || 5, start: req.query.start || '', end: req.query.end || '', solution: req.query.solution || 'card' }) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/analytics/health', requireTenant, (req, res) => {
    try {
      res.json({ health: calcHealthScore(db, req.customerId, req.query.solution || 'card') });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================================================
  // 企业管理员端（企业角色化子面板）
  // ============================================================

  // 企业列表（租户管理员：成员绑定企业用）
  router.get('/enterprises', requireTenant, requireTenantAdmin, (req, res) => {
    const rows = db.prepare(`
      SELECT e.id, e.name, e.logo, e.industry, e.status,
        (SELECT COUNT(*) FROM platform_user p WHERE p.enterprise_id = e.id) AS employee_count
      FROM tenant_enterprises e WHERE e.customer_id = ? ORDER BY e.created_at DESC
    `).all(req.customerId);
    res.json({ enterprises: rows });
  });

  // 企业信息 + 统计（企业管理员工作台）
  router.get('/enterprise/me', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const eid = req.enterpriseId;
    const ent = db.prepare('SELECT * FROM tenant_enterprises WHERE id = ? AND customer_id = ?').get(eid, req.customerId);
    if (!ent) return res.status(404).json({ error: '企业不存在或已停用' });
    let config = {};
    try { config = JSON.parse(ent.config || '{}'); } catch (e) {}
    const employeeCount = db.prepare('SELECT COUNT(*) AS n FROM platform_user WHERE enterprise_id = ? AND status = ?').get(eid, 'active').n;
    const cardCount = db.prepare('SELECT COUNT(*) AS n FROM card_profile WHERE user_id IN (SELECT id FROM platform_user WHERE enterprise_id = ?) AND status = ?').get(eid, 'active').n;
    const customerCount = db.prepare('SELECT COUNT(*) AS n FROM card_customer WHERE enterprise_id = ?').get(eid).n;
    const poolAvailable = db.prepare('SELECT COUNT(*) AS n FROM enterprise_public_pool WHERE enterprise_id = ? AND status = ?').get(eid, 'available').n;
    const poolClaimed = db.prepare('SELECT COUNT(*) AS n FROM enterprise_public_pool WHERE enterprise_id = ? AND status = ?').get(eid, 'claimed').n;
    const totalViews = db.prepare('SELECT COALESCE(SUM(view_count),0) AS s FROM card_profile WHERE user_id IN (SELECT id FROM platform_user WHERE enterprise_id = ?)').get(eid).s;
    res.json({
      enterprise: {
        id: ent.id, name: ent.name, logo: ent.logo, industry: ent.industry,
        scale: ent.scale, description: ent.description, status: ent.status,
        autoRecycle: !!config.auto_recycle,
        inviteCode: config.invite_code || '',
      },
      stats: { employeeCount, cardCount, customerCount, poolAvailable, poolClaimed, totalViews },
    });
  });

  // 企业员工列表
  router.get('/enterprise/employees', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const eid = req.enterpriseId;
    const { keyword = '' } = req.query;
    let where = 'WHERE p.enterprise_id = ?';
    const params = [eid];
    if (keyword) {
      where += ' AND (p.nickname LIKE ? OR cp.name LIKE ? OR cp.position LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    const rows = db.prepare(`
      SELECT p.id AS user_id, p.nickname, p.avatar, p.enterprise_role, p.status AS user_status,
        cp.id AS card_id, cp.name, cp.position, cp.phone, cp.view_count, cp.exchange_count,
        cp.created_at
      FROM platform_user p
      LEFT JOIN card_profile cp ON cp.id = (
        SELECT id FROM card_profile WHERE user_id = p.id AND status = 'active' ORDER BY id DESC LIMIT 1
      )
      ${where} ORDER BY p.created_at DESC
    `).all(...params);
    res.json({ employees: rows.map(r => ({
      userId: r.user_id, nickname: r.nickname || '', avatar: r.avatar || '', role: r.enterprise_role || 'member',
      status: r.user_status, cardId: r.card_id, name: r.name || '', position: r.position || '',
      phone: r.phone || '', viewCount: r.view_count || 0, exchangeCount: r.exchange_count || 0, createdAt: r.created_at,
    })) });
  });

  // 候选员工（本租户已入驻、未绑定企业）
  router.get('/enterprise/candidates', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const rows = db.prepare(`
      SELECT p.id AS user_id, p.nickname, p.avatar, cp.id AS card_id, cp.name, cp.position, cp.phone
      FROM platform_user p
      LEFT JOIN card_profile cp ON cp.user_id = p.id AND cp.status = 'active'
      WHERE p.customer_id = ? AND (p.enterprise_id IS NULL OR p.enterprise_id = 0)
      ORDER BY p.created_at DESC LIMIT 100
    `).all(req.customerId);
    res.json({ candidates: rows.map(r => ({
      userId: r.user_id, nickname: r.nickname || '', avatar: r.avatar || '',
      cardId: r.card_id, name: r.name || '', position: r.position || '', phone: r.phone || '',
    })) });
  });

  // 添加员工到企业
  router.post('/enterprise/employees', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const { userId, role = 'member' } = req.body || {};
    if (!userId) return res.status(400).json({ error: '请选择员工' });
    const uid = Number(userId);
    const pu = db.prepare('SELECT * FROM platform_user WHERE id = ? AND customer_id = ?').get(uid, req.customerId);
    if (!pu) return res.status(404).json({ error: '员工不存在' });
    if (pu.enterprise_id) return res.status(400).json({ error: '该员工已属于其他企业' });
    const ent = db.prepare('SELECT id, name FROM tenant_enterprises WHERE id = ? AND customer_id = ? AND status = ?').get(req.enterpriseId, req.customerId, 'active');
    if (!ent) return res.status(404).json({ error: '企业不存在或已停用' });
    db.prepare("UPDATE platform_user SET enterprise_id = ?, enterprise_role = ?, updated_at = datetime('now') WHERE id = ?")
      .run(req.enterpriseId, role === 'admin' ? 'admin' : 'member', uid);
    auditCust(db, req, 'enterprise_add_employee', 'enterprise', req.enterpriseId, `企业「${ent.name}」添加员工`);
    res.json({ ok: true });
  });

  // 修改员工角色 / 移除出企业
  router.put('/enterprise/employees/:userId', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const uid = Number(req.params.userId);
    const { role, action, recycle } = req.body || {};
    const pu = db.prepare('SELECT * FROM platform_user WHERE id = ? AND enterprise_id = ?').get(uid, req.enterpriseId);
    if (!pu) return res.status(404).json({ error: '员工不在本企业' });
    if (action === 'remove') {
      // 回收该员工名下客户到企业公海（幂等查重）
      let recycled = 0;
      if (recycle !== false) {
        const custs = db.prepare('SELECT * FROM card_customer WHERE customer_id = ? AND owner_user_id = ?')
          .all(req.customerId, uid);
        for (const c of custs) {
          const dup = db.prepare("SELECT id FROM enterprise_public_pool WHERE enterprise_id = ? AND phone = ? AND status = 'available'")
            .get(req.enterpriseId, c.phone || '');
          if (dup) continue;
          db.prepare(`INSERT INTO enterprise_public_pool (enterprise_id, customer_id, source_type, source_id, name, phone, company, position, remark)
            VALUES (?, ?, 'employee', ?, ?, ?, ?, ?, ?)`)
            .run(req.enterpriseId, req.customerId, c.id, c.name, c.phone || '', c.company || '', '', '移出企业回收');
          recycled++;
        }
      }
      // 同步 C 端员工记录为离职
      db.prepare("UPDATE tenant_enterprise_employees SET status = 'left', updated_at = datetime('now') WHERE enterprise_id = ? AND user_id = ? AND status = 'active'")
        .run(req.enterpriseId, uid);
      db.prepare("UPDATE platform_user SET enterprise_id = NULL, enterprise_role = 'none', updated_at = datetime('now') WHERE id = ?").run(uid);
      auditCust(db, req, 'enterprise_remove_employee', 'enterprise', req.enterpriseId, `移出企业员工，回收客户 ${recycled} 条到企业公海`);
      return res.json({ ok: true, recycled });
    }
    const newRole = role === 'admin' ? 'admin' : 'member';
    db.prepare("UPDATE platform_user SET enterprise_role = ?, updated_at = datetime('now') WHERE id = ?").run(newRole, uid);
    res.json({ ok: true });
  });

  // 企业公海客户手动上浮到租户全局公海
  router.post('/enterprise/pool/:id/float-up', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM enterprise_public_pool WHERE id = ? AND enterprise_id = ?')
      .get(Number(req.params.id), req.enterpriseId);
    if (!row) return res.status(404).json({ error: '客户不存在' });
    if (row.status !== 'available') return res.status(400).json({ error: '该客户已上浮或已被领取' });
    const dup = db.prepare("SELECT id FROM tenant_public_pool WHERE customer_id = ? AND phone = ? AND status = 'available'")
      .get(req.customerId, row.phone || '');
    if (dup) return res.status(400).json({ error: '租户公海已存在该客户，无需重复上浮' });
    db.prepare(`INSERT INTO tenant_public_pool (customer_id, source_type, source_id, name, phone, company, position, remark)
      VALUES (?, 'enterprise', ?, ?, ?, ?, ?, ?)`)
      .run(req.customerId, row.source_id || null, row.name, row.phone || '', row.company || '', row.position || '', row.remark || '');
    db.prepare("UPDATE enterprise_public_pool SET status = 'recycled', recycled_at = datetime('now') WHERE id = ?").run(row.id);
    auditCust(db, req, 'enterprise_pool_float_up', 'enterprise', req.enterpriseId, `公海客户「${row.name || row.phone}」上浮租户公海`);
    res.json({ ok: true });
  });

  // 企业公海列表
  router.get('/enterprise/pool', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const eid = req.enterpriseId;
    const { status = 'available', keyword = '' } = req.query;
    let where = 'WHERE pool.enterprise_id = ? AND pool.status = ?';
    const params = [eid, status];
    if (keyword) {
      where += ' AND (pool.name LIKE ? OR pool.phone LIKE ? OR pool.company LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    const rows = db.prepare(`
      SELECT pool.*, p.nickname AS claimer_name
      FROM enterprise_public_pool pool
      LEFT JOIN platform_user p ON p.id = pool.claimed_by
      ${where} ORDER BY pool.created_at DESC LIMIT 200
    `).all(...params);
    res.json({ items: rows.map(r => ({
      id: r.id, sourceType: r.source_type, name: r.name, phone: r.phone, company: r.company,
      position: r.position, remark: r.remark, status: r.status, claimedBy: r.claimed_by,
      claimerName: r.claimer_name || '', claimedAt: r.claimed_at, recycledAt: r.recycled_at, createdAt: r.created_at,
    })) });
  });

  // 领取/分配企业公海客户（本企业员工可领取自己；可指定本企业员工为领取人）
  router.post('/enterprise/pool/:id/claim', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const { userId } = req.body || {};
    const row = db.prepare('SELECT * FROM enterprise_public_pool WHERE id = ? AND enterprise_id = ?')
      .get(Number(req.params.id), req.enterpriseId);
    if (!row) return res.status(404).json({ error: '客户不存在' });
    if (row.status !== 'available') return res.status(400).json({ error: '客户已被领取或上浮' });
    const targetId = userId ? Number(userId) : req.user.id;
    if (userId) {
      const pu = db.prepare('SELECT id FROM platform_user WHERE id = ? AND enterprise_id = ?').get(targetId, req.enterpriseId);
      if (!pu) return res.status(400).json({ error: '领取人不在本企业' });
    }
    const upd = db.prepare("UPDATE enterprise_public_pool SET status = 'claimed', claimed_by = ?, claimed_at = datetime('now'), last_follow_at = datetime('now') WHERE id = ? AND status = 'available'")
      .run(targetId, row.id);
    if (upd.changes === 0) return res.status(400).json({ error: '客户已被领取或上浮' });
    // 同步写入领取人客户列表（与自动回收/释放的删除逻辑对应，防重复）
    db.prepare(`INSERT INTO card_customer (customer_id, owner_user_id, enterprise_id, owner_type, name, phone, company, position, source, source_type, source_id)
      VALUES (?, ?, ?, 'employee', ?, ?, ?, ?, 'enterprise_pool', ?, ?)`)
      .run(row.customer_id, targetId, row.enterprise_id, row.name, row.phone || '', row.company || '', row.position || '', row.source_type || '', row.source_id || null);
    auditCust(db, req, 'enterprise_pool_claim', 'enterprise', req.enterpriseId, `领取公海客户「${row.name || row.phone}」`);
    res.json({ ok: true });
  });

  // 释放回企业公海
  router.post('/enterprise/pool/:id/release', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM enterprise_public_pool WHERE id = ? AND enterprise_id = ? AND status = ?')
      .get(Number(req.params.id), req.enterpriseId, 'claimed');
    if (!row) return res.status(404).json({ error: '客户不存在或未领取' });
    // 释放 = 放弃归属：删除领取人客户列表中该公海来源客户（防重复）
    db.prepare(`DELETE FROM card_customer WHERE customer_id = ? AND owner_user_id = ? AND source = 'enterprise_pool' AND phone = ?`)
      .run(row.customer_id, row.claimed_by, row.phone || '');
    db.prepare("UPDATE enterprise_public_pool SET status = 'available', claimed_by = NULL, claimed_at = NULL, recycled_at = datetime('now') WHERE id = ?").run(row.id);
    res.json({ ok: true });
  });

  // 企业配置（品牌 + 回流开关 + 口令）
  router.get('/enterprise/config', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const ent = db.prepare('SELECT * FROM tenant_enterprises WHERE id = ? AND customer_id = ?').get(req.enterpriseId, req.customerId);
    if (!ent) return res.status(404).json({ error: '企业不存在' });
    let config = {};
    try { config = JSON.parse(ent.config || '{}'); } catch (e) {}
    res.json({ config: {
      name: ent.name, logo: ent.logo, industry: ent.industry, scale: ent.scale,
      description: ent.description, autoRecycle: !!config.auto_recycle, inviteCode: config.invite_code || '',
    } });
  });

  router.put('/enterprise/config', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const ent = db.prepare('SELECT config FROM tenant_enterprises WHERE id = ? AND customer_id = ?').get(req.enterpriseId, req.customerId);
    if (!ent) return res.status(404).json({ error: '企业不存在' });
    let config = {};
    try { config = JSON.parse(ent.config || '{}'); } catch (e) {}
    const { name, logo, industry, scale, description, autoRecycle } = req.body || {};
    if (name != null) config.name = String(name).slice(0, 64);
    if (autoRecycle != null) config.auto_recycle = !!autoRecycle;
    db.prepare('UPDATE tenant_enterprises SET name = COALESCE(?, name), logo = COALESCE(?, logo), industry = COALESCE(?, industry), scale = COALESCE(?, scale), description = COALESCE(?, description), config = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(name != null ? String(name).slice(0, 64) : null,
           logo != null ? String(logo).slice(0, 512) : null,
           industry != null ? String(industry).slice(0, 64) : null,
           scale != null ? String(scale).slice(0, 64) : null,
           description != null ? String(description).slice(0, 512) : null,
           JSON.stringify(config), req.enterpriseId);
    auditCust(db, req, 'enterprise_update_config', 'enterprise', req.enterpriseId, '更新企业配置');
    res.json({ ok: true });
  });

  // 生成/重置企业口令
  router.post('/enterprise/invite-code', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const ent = db.prepare('SELECT config FROM tenant_enterprises WHERE id = ? AND customer_id = ?').get(req.enterpriseId, req.customerId);
    if (!ent) return res.status(404).json({ error: '企业不存在' });
    let config = {};
    try { config = JSON.parse(ent.config || '{}'); } catch (e) {}
    config.invite_code = 'ENT' + String(Math.floor(100000 + Math.random() * 900000));
    db.prepare('UPDATE tenant_enterprises SET config = ?, updated_at = datetime(\'now\') WHERE id = ?').run(JSON.stringify(config), req.enterpriseId);
    res.json({ inviteCode: config.invite_code });
  });

  return router;
}
