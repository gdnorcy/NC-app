// 客户（租户）后台 API —— 数据严格按 customer_id 隔离
import { Router } from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { toPlan, toScene, toUser, toOrder, toCustomer, genOrderNo, genShareToken, hashPassword, addOperationLog, resolveMemberRoles, memberIsTenantAdmin } from '../db.js';
import { getStorage } from '../storage/index.js';
import { transcodeImage } from './scenes.js';
import { WxComponentService } from '../services/wx-component.js';
import { WxMpService } from '../services/wx-mp.js';
import { ciUploadMini } from '../services/mini-ci.js';
import { checkTenantAccess, tenantState } from '../tenant.js';
import { checkTenantQuota, checkTenantSolutionQuota } from '../services/billing.js';
import { calcFunnel, trendSeries, eventDistribution, topTargets, calcHealthScore } from '../services/analytics.js';
import { encryptSecret, decryptSecret, maskSecretValue, mergeSecretInput, readSecret } from '../crypto.js';
import { mergePaymentIntoConfig, maskConfigPayment } from '../services/paymentConfig.js';
import { createMemberService } from '../services/member.js';
import {
  CARD_IDENTITY_SQL, cardIdentityParams, IDENTITY_LABEL, IDENTITY_HINT, subjectTypeOf,
} from '../services/cardIdentity.js';

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

// 脱敏/密钥合并的实现在 crypto.js（服务层也需要，如 wechatLive 读 app_secret）
// 这里仅做 re-export，保持本文件原有的对外导出面不变。
export { maskSecretValue, mergeSecretInput, readSecret };

function auditCust(db, req, action, targetType, targetId, detail) {
  addOperationLog(db, {
    userId: req.user?.uid ?? req.user?.id ?? null,
    username: req.user?.username ?? req.user?.phone ?? 'tenant-user',
    action, targetType, targetId,
    detail: `[租户#${req.customerId}] ${detail}`,
    ip: req.ip,
  });
}

// 纯函数：公众号接入状态。空记录（appid/app_secret/account_type 全空）视为未接入，
// 避免「记录存在即 bound:true」导致绑定入口被永久隐藏、又同时灰掉服务号功能。
export function computeMpBindState(ch) {
  if (!ch) return { bound: false, bindMode: 'none' };
  const hasOpen = ch.auth_status === 'authorized';
  const hasManual = !!ch.app_secret;
  const bindMode = hasOpen ? 'open' : (hasManual ? 'manual' : 'none');
  return { bound: hasOpen || hasManual, bindMode };
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
    return res.status(403).json({ error: '账号未关联客户项目' });
  }
  // 租户生命周期：存在/启用/未到期；到期但 adminExpireMode=allow → 只读放行（仅GET）
  const state = tenantState(db, user.customerId, { ctx: 'admin' });
  if (state.missing) return res.status(404).json({ error: '客户项目不存在' });
  if (!state.active) {
    if (state.readonly && req.method === 'GET') {
      req.customerId = user.customerId;
      req.enterpriseId = user.enterpriseId || user.enterprise_id || null;
      req.tenantReadonly = true; // 前端只读横幅标记
      return next();
    }
    return res.status(403).json({ error: state.reason });
  }
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
    return res.status(403).json({ error: '账号未关联客户项目' });
  }
  req.customerId = user.customerId;
  next();
}

// 中间件：仅租户管理员
function requireTenantAdmin(req, res, next) {
  if (req.user.role !== 'tenant_admin') {
    return res.status(403).json({ error: '仅管理员可操作' });
  }
  next();
}

// 中间件：租户管理员 或 拥有 set-members 权限点的成员（成员管理可授权；角色管理仍仅管理员）
// 权限点实时查库（角色分配后无需重新登录立即生效；memberId=null 的旧 users 只认 tenant_admin）
function requireMemberManage(req, res, next) {
  if (req.user.role === 'tenant_admin') return next();
  if (req.user.memberId) {
    const has = db
      .prepare(
        `SELECT 1 FROM member_roles mr
         JOIN role_permissions rp ON rp.role_id = mr.role_id
         WHERE mr.member_id = ? AND rp.menu_key = 'set-members' LIMIT 1`
      )
      .get(req.user.memberId);
    if (has) return next();
  }
  return res.status(403).json({ error: '仅管理员或具备成员管理权限者可操作' });
}

// 当前租户 tenant_admin 角色成员数（最后管理员保护用）
function countTenantAdmins(customerId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM member_roles mr
       JOIN roles r ON r.id = mr.role_id
       JOIN tenant_members tm ON tm.id = mr.member_id
       WHERE tm.tenant_id = ? AND r.code = 'tenant_admin'`
    )
    .get(customerId).n;
}

// ============================================================
// 租户名片归属口径（单一事实来源）
// ------------------------------------------------------------
// 历史坑：card_profile.enterprise_id 语义是「所属企业（tenant_enterprises.id）」，
// 但旧代码拿它跟 req.customerId（租户ID）直接比 → 只有 enterprise_id 恰好等于
// 租户ID 的历史数据能命中，其余全部漏空。
// 现在统一用「并集」判定一张名片是否属于本租户：
//   ① card_profile.customer_id = 租户        （创建/申请时显式写入）
//   ② card_profile.enterprise_id ∈ 本租户 active 企业 （企业名片）
//   ③ card_profile.user_id 的用户 enterprise_id ∈ 本租户 active 企业（企业成员本人名片）
//   ④ card_profile.user_id ∈ 入驻个人（tenant_individuals active）
//   ⑤ card_profile.user_id ∈ 企业员工（tenant_enterprise_employees active）
//   ⑥ card_profile.user_id 的用户 platform_user.customer_id = 租户（小程序注册用户，
//      且**没有任何非 active 的名册记录**）
// 🔴 ②③ 必须过滤 tenant_enterprises.status='active'：影子企业/停用企业不得再提供归属通道
// 🔴 ⑥ 的由来（2026-10-20）：小程序端 POST /api/card/cards 建名片时**不写 card.customer_id**
//   （那是「建卡+入驻」合并流程才写的），于是「在租户小程序注册并自己建了名片」的 C 端用户
//   在后台「名片管理」里完全查不到（实测：小程序新建的「林平」卡在库里但列表查不出）。
//   ⑥ 用 platform_user.customer_id 补这条通道，并显式排除「有非 active 名册记录」的人
//   （离职员工 status='left' / 停用入驻个人），保证离职隔离不被破坏。
// ============================================================
const TENANT_CARD_SCOPE_SQL = `(
    c.customer_id = ?
    OR c.enterprise_id IN (SELECT id FROM tenant_enterprises WHERE customer_id = ? AND status = 'active')
    OR c.user_id IN (SELECT id FROM platform_user WHERE enterprise_id IN (SELECT id FROM tenant_enterprises WHERE customer_id = ? AND status = 'active'))
    OR c.user_id IN (SELECT user_id FROM tenant_individuals WHERE customer_id = ? AND status = 'active')
    OR c.user_id IN (SELECT user_id FROM tenant_enterprise_employees WHERE customer_id = ? AND status = 'active')
    OR (
      c.user_id IN (SELECT id FROM platform_user WHERE customer_id = ?)
      AND NOT EXISTS (SELECT 1 FROM tenant_enterprise_employees e WHERE e.user_id = c.user_id AND e.status <> 'active')
      AND NOT EXISTS (SELECT 1 FROM tenant_individuals i WHERE i.user_id = c.user_id AND i.status <> 'active')
    )
  )`;

// 上面 6 个占位符对应的参数（重复 6 次租户ID）
function tenantCardScopeParams(customerId) {
  return [customerId, customerId, customerId, customerId, customerId, customerId];
}

// 名片身份判定与标签：单一事实来源在 services/cardIdentity.js（2026-10-20 重构）
// 两轴模型：主体类型（person/enterprise）× 认证状态（名册 active，唯一能力判据）；
// 归属通道只进上面的 TENANT_CARD_SCOPE_SQL（可见性），永不进身份与能力。

// 租户企业 id → 名称（供「所属企业」列展示）
function loadTenantEnterpriseNames(cid) {
  return new Map(
    db.prepare('SELECT id, name FROM tenant_enterprises WHERE customer_id = ?').all(cid).map((e) => [e.id, e.name])
  );
}

// 企业名：优先名片自带 enterprise_id，其次名片主人 platform_user.enterprise_id
function cardEnterpriseName(entNameById, card) {
  const entId = Number(card.enterprise_id) || Number(card.user_enterprise_id) || 0;
  return entId ? (entNameById.get(entId) || '') : '';
}

// 获取当前租户信息
router.get('/profile', requireTenant, (req, res) => {
  const cust = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.customerId);
  if (!cust) return res.status(404).json({ error: '客户项目不存在' });
  const customer = toCustomer(cust);
  // payment.wechat.apiV3Key / privateKey 是**嵌套**在 wechat 下的，
  // decryptConfigSecrets 只扫顶层字段 → 必须再用 maskConfigPayment 脱敏，
  // 否则 API 会把支付密钥明文发给浏览器（这条接口是租户成员都能调的）。
  if (customer.config) customer.config = maskConfigPayment(decryptConfigSecrets(customer.config));
  res.json({ customer, user: toUser(req.user) });
});

// 仪表盘：客户自身业务数据
// 租户已开通应用（解决方案展开为应用清单，过滤演示方案本身）
// 保存租户应用自定义排序（整体覆盖）
router.put('/apps/sort', requireTenant, (req, res) => {
  try {
    const cid = req.customerId;
    const { codes } = req.body || {};
    if (!Array.isArray(codes)) return res.status(400).json({ error: 'codes 必须为数组' });
    const del = db.prepare('DELETE FROM customer_app_sorts WHERE customer_id = ?');
    const ins = db.prepare('INSERT OR REPLACE INTO customer_app_sorts (customer_id, app_code, sort_order, updated_at) VALUES (?, ?, ?, datetime(\'now\'))');
    db.exec('BEGIN');
    try {
      del.run(cid);
      codes.forEach((code, idx) => ins.run(cid, code, idx));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/apps', requireTenant, (req, res) => {
  try {
    const cid = req.customerId;
    const project = db.prepare('SELECT solutions FROM projects WHERE id = ?').get(cid);
    let solutionCodes = [];
    try { solutionCodes = JSON.parse(project?.solutions || '[]'); } catch { solutionCodes = []; }
    const appBySolution = (code) => {
      const sol = db.prepare('SELECT * FROM solutions WHERE code = ?').get(code);
      if (!sol) return [];
      if (sol.is_demo) {
        return db.prepare('SELECT * FROM apps WHERE enabled = 1 ORDER BY sort_order, id').all();
      }
      return db.prepare(
        `SELECT a.* FROM apps a JOIN solution_apps sa ON sa.app_id = a.id
         WHERE sa.solution_id = ? AND sa.enabled = 1 AND a.enabled = 1 ORDER BY a.sort_order, a.id`
      ).all(sol.id);
    };
    const apps = [];
    const seen = new Set();
    solutionCodes.forEach((code) => {
      appBySolution(code).forEach((a) => {
        if (!seen.has(a.code)) { seen.add(a.code); apps.push(a); }
      });
    });
    // 租户自定义排序优先，未自定义的按平台默认排序
    const sortRows = db.prepare('SELECT app_code, sort_order FROM customer_app_sorts WHERE customer_id = ?').all(cid);
    const sortMap = new Map(sortRows.map((r) => [r.app_code, r.sort_order]));
    apps.sort((a, b) => {
      const sa = sortMap.has(a.code) ? sortMap.get(a.code) : 9999;
      const sb = sortMap.has(b.code) ? sortMap.get(b.code) : 9999;
      if (sa !== sb) return sa - sb;
      return (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id;
    });
    res.json({
      apps: apps.map((a) => ({
        id: a.id, code: a.code, name: a.name, description: a.description, icon: a.icon, category: a.category,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/dashboard', requireTenant, (req, res) => {
  const cid = req.customerId;
  const planCount = db.prepare('SELECT COUNT(*) AS n FROM plans WHERE project_id = ?').get(cid).n;
  const sceneCount = db
    .prepare('SELECT COUNT(*) AS n FROM scenes s JOIN plans p ON s.plan_id = p.id WHERE p.project_id = ?')
    .get(cid).n;
  const memberCount = db.prepare('SELECT COUNT(*) AS n FROM users WHERE customer_id = ?').get(cid).n;
  const enterpriseCount = db
    .prepare("SELECT COUNT(*) AS n FROM tenant_enterprises WHERE customer_id = ? AND status = 'active'")
    .get(cid).n;
  const cardCount = db
    .prepare('SELECT COUNT(*) AS n FROM card_profile cp JOIN users u ON cp.user_id = u.id WHERE u.customer_id = ?')
    .get(cid).n;
  const orderCount = db.prepare("SELECT COUNT(*) AS n FROM payment_orders WHERE customer_id = ? AND payer_type='platform' AND status='paid'").get(cid).n;
  const totalAmount = db
    .prepare("SELECT COALESCE(SUM(amount),0) AS s FROM payment_orders WHERE customer_id = ? AND payer_type='platform' AND status='paid'")
    .get(cid).s;

  // 客户已开通的应用：解决方案(组合包) → 展开为应用清单，过滤演示方案
  const project = db.prepare('SELECT solutions FROM projects WHERE id = ?').get(cid);
  let solutionCodes = [];
  try { solutionCodes = JSON.parse(project?.solutions || '[]'); } catch { solutionCodes = []; }
  const appBySolution = (code) => {
    const sol = db.prepare('SELECT * FROM solutions WHERE code = ?').get(code);
    if (!sol) return [];
    if (sol.is_demo) {
      // 演示方案动态纳入全部应用
      return db.prepare('SELECT * FROM apps WHERE enabled = 1 ORDER BY sort_order, id').all();
    }
    return db.prepare(
      `SELECT a.* FROM apps a JOIN solution_apps sa ON sa.app_id = a.id
       WHERE sa.solution_id = ? AND sa.enabled = 1 AND a.enabled = 1 ORDER BY a.sort_order, a.id`
    ).all(sol.id);
  };
  const apps = [];
  const seen = new Set();
  solutionCodes.forEach((code) => {
    appBySolution(code).forEach((a) => {
      if (!seen.has(a.code)) { seen.add(a.code); apps.push(a); }
    });
  });

  // 按应用统计：全景→方案/场景；智能名片→企业员工/企业客户；全端渠道→渠道配置数；分销五应用→成员/分组指标
  const employeeCount = db.prepare('SELECT COUNT(*) AS n FROM users WHERE customer_id = ? AND enterprise_id IS NOT NULL').get(cid).n;
  const cardCustomerCount = db.prepare('SELECT COUNT(*) AS n FROM card_customer WHERE customer_id = ?').get(cid).n;
  const channelCount = db.prepare('SELECT COUNT(*) AS n FROM channel_apps WHERE customer_id = ?').get(cid).n;
  const cnt = (sql) => { try { return db.prepare(sql).get(cid).n || 0; } catch { return 0; } };
  const distCount = cnt("SELECT COUNT(*) AS n FROM dist_distributor WHERE tenant_id = ? AND status = 1");
  const distPending = cnt("SELECT COUNT(*) AS n FROM dist_withdraw WHERE tenant_id = ? AND status = 'pending'");
  const partnerCount = cnt("SELECT COUNT(*) AS n FROM dist_partner WHERE tenant_id = ? AND status = 1");
  const shareAllCount = cnt("SELECT COUNT(*) AS n FROM dist_share_all WHERE tenant_id = ? AND status = 1");
  const shareCatGroups = cnt("SELECT COUNT(DISTINCT category_id) AS n FROM dist_share_cat WHERE tenant_id = ? AND status = 1");
  const shareCatCount = cnt("SELECT COUNT(*) AS n FROM dist_share_cat WHERE tenant_id = ? AND status = 1");
  const shareAreaGroups = cnt("SELECT COUNT(DISTINCT area_code) AS n FROM dist_share_area WHERE tenant_id = ? AND status = 1");
  const shareAreaCount = cnt("SELECT COUNT(*) AS n FROM dist_share_area WHERE tenant_id = ? AND status = 1");
  const pluginMode = (code) => {
    try {
      const p = db.prepare('SELECT config FROM sys_tenant_plugin WHERE tenant_id = ? AND plugin_code = ?').get(cid, code);
      if (!p?.config) return '';
      const c = JSON.parse(p.config);
      return c.mode;
    } catch { return ''; }
  };
  const statFor = (code) => {
    if (code === 'panorama') return { plans: planCount, scenes: sceneCount, metricLabel: '方案', metricLabel2: '场景' };
    if (code === 'card') return { plans: employeeCount, scenes: cardCustomerCount, metricLabel: '企业员工', metricLabel2: '企业客户' };
    if (code === 'channel') return { plans: channelCount, scenes: 0, metricLabel: '渠道配置', metricLabel2: '场景' };
    if (code === 'dist') return { plans: distCount, scenes: distPending, metricLabel: '分销商', metricLabel2: '提现待审' };
    if (code === 'partner') return { plans: partnerCount, scenes: pluginMode('partner') === 2 ? '全局' : '团队', metricLabel: '合伙人', metricLabel2: '分红模式' };
    if (code === 'share-all') return { plans: shareAllCount, scenes: pluginMode('share-all') === 2 ? '权重' : '均等', metricLabel: '股东', metricLabel2: '分配方式' };
    if (code === 'share-cat') return { plans: shareCatGroups, scenes: shareCatCount, metricLabel: '类目数', metricLabel2: '股东数' };
    if (code === 'share-area') return { plans: shareAreaGroups, scenes: shareAreaCount, metricLabel: '地区数', metricLabel2: '股东数' };
    return { plans: 0, scenes: 0, metricLabel: '', metricLabel2: '' };
  };
  const byApp = apps.map((app) => {
    const st = statFor(app.code);
    return {
      appId: app.id,
      appName: app.name,
      appCode: app.code,
      appIcon: app.icon,
      enabled: true,
      plans: st.plans,
      scenes: st.scenes,
      metricLabel: st.metricLabel,
      metricLabel2: st.metricLabel2,
    };
  });

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
    stats: { planCount, sceneCount, memberCount, enterpriseCount, cardCount, orderCount, totalAmount, appCount: apps.length },
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
  // 方案配额（新体系 solution_quotas：panorama.planCount）
  const pq = checkTenantSolutionQuota(db, req.customerId, 'panorama', 'planCount');
  if (!pq.ok) return res.status(403).json({ error: `方案数量已达上限（${pq.used}/${pq.limit}），请升级方案后再创建` });
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
// 分享海报（方案级）：封面 + 方案名 + 二维码，生成后返回图片 URL
router.post('/plans/:id/poster', requireTenant, requireTenantAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const plan = verifyPlanOwnership(req, res, id);
    if (!plan) return;
    if (!plan.share_enabled || !plan.share_token) return res.status(400).json({ error: '请先在方案中开启「分享」后再生成海报' });
    const host = `${req.protocol}://${req.get('host')}`;
    const sceneCount = db.prepare('SELECT COUNT(*) AS n FROM scenes WHERE plan_id = ? AND published = 1').get(id).n || 0;
    // 封面：本地 /uploads 转绝对地址拉取；拉取失败降级品牌底色
    let coverBuf = null;
    if (plan.cover_path) {
      try {
        const coverUrl = plan.cover_path.startsWith('http') ? plan.cover_path : host + plan.cover_path;
        const r = await fetch(coverUrl, { signal: AbortSignal.timeout(8000) });
        if (r.ok) coverBuf = Buffer.from(await r.arrayBuffer());
      } catch { /* 封面拉取失败降级 */ }
    }
    const qrBuf = await QRCode.toBuffer(`${host}/s/${plan.share_token}`, { width: 260, margin: 1 });
    const W = 750, H = 1000;
    const top = coverBuf
      ? await sharp(coverBuf).resize(W, 640, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer()
      : await sharp({ create: { width: W, height: 640, channels: 3, background: { r: 22, g: 93, b: 255 } } }).jpeg({ quality: 82 }).toBuffer();
    const name = escapeXml(String(plan.name || '全景漫游').slice(0, 24));
    const desc = escapeXml(String(plan.description || `共 ${sceneCount} 个全景场景`).slice(0, 40));
    const svgText = `
      <svg width="${W}" height="360" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <text x="40" y="78" font-size="36" font-weight="700" fill="#1D2129" font-family="PingFang SC, Microsoft YaHei, sans-serif">${name}</text>
        <text x="40" y="120" font-size="21" fill="#86909C" font-family="PingFang SC, Microsoft YaHei, sans-serif">${desc}</text>
        <text x="40" y="328" font-size="22" fill="#4E5969" font-family="PingFang SC, Microsoft YaHei, sans-serif">长按识别二维码 · 进入全景漫游</text>
      </svg>`;
    const svgBuf = await sharp(Buffer.from(svgText)).png().toBuffer();
    const qr = await sharp(qrBuf).resize(240, 240).png().toBuffer();
    const poster = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite([
        { input: top, top: 0, left: 0 },
        { input: svgBuf, top: 640, left: 0 },
        { input: qr, top: 684, left: W - 280 },
      ])
      .jpeg({ quality: 86 }).toBuffer();
    const storage = await getStorage(db);
    const url = await storage.put(poster, `poster-${id}-${Date.now()}.jpg`);
    res.json({ url });
  } catch (e) {
    console.error('海报生成失败:', e);
    res.status(500).json({ error: '海报生成失败: ' + (e.message || '未知错误') });
  }
});

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

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
  // 方案配额（新体系 solution_quotas：panorama.sceneCount）
  const sq = checkTenantSolutionQuota(db, plan.project_id, 'panorama', 'sceneCount');
  if (!sq.ok) return res.status(403).json({ error: `场景数量已达上限（${sq.used}/${sq.limit}），请升级方案后再创建` });
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
  // 跳转点目标校验：type=scene 的 targetSceneId 必须存在且属于本方案，且不能跳转自身
  if (Array.isArray(hotspots) && hotspots.length) {
    const jumps = hotspots.filter((h) => h && h.type === 'scene' && h.targetSceneId);
    if (jumps.length) {
      const targets = new Set(
        db.prepare('SELECT id FROM scenes WHERE plan_id = ?').all(scene.plan_id).map((s) => s.id)
      );
      for (const j of jumps) {
        if (Number(j.targetSceneId) === id) return res.status(400).json({ error: `跳转点「${j.title || '未命名'}」不能跳转到当前场景自身` });
        if (!targets.has(Number(j.targetSceneId))) return res.status(400).json({ error: `跳转点「${j.title || '未命名'}」指向的场景不存在或不属于本方案，请先修正` });
      }
    }
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

// 复制场景（含热点坐标与内容增强配置，重置分享令牌，排到方案末尾）
router.post('/scenes/:id/copy', requireTenant, requireTenantAdmin, (req, res) => {
  const id = Number(req.params.id);
  const scene = verifySceneOwnership(req, res, id);
  if (!scene) return;
  const plan = verifyPlanOwnership(req, res, scene.plan_id);
  if (!plan) return;
  // 场景配额（新体系 solution_quotas）
  const sq = checkTenantSolutionQuota(db, plan.project_id, 'panorama', 'sceneCount');
  if (!sq.ok) return res.status(403).json({ error: `场景数量已达上限（${sq.used}/${sq.limit}），请升级方案后再创建` });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM scenes WHERE plan_id = ?').get(scene.plan_id).m;
  const info = db
    .prepare(
      'INSERT INTO scenes (plan_id, title, description, image_path, preview_path, sort_order, published, share_enabled, hotspots, meta) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)'
    )
    .run(
      scene.plan_id,
      `${scene.title} 副本`,
      scene.description || '',
      scene.image_path || '',
      scene.preview_path || '',
      maxOrder + 1,
      scene.published || 0,
      scene.hotspots || '[]',
      scene.meta || '{}'
    );
  const copy = db.prepare('SELECT * FROM scenes WHERE id = ?').get(info.lastInsertRowid);
  auditCust(db, req, 'copy_scene', 'scene', copy.id, `复制场景: ${scene.title} → ${copy.title}`);
  res.json({ scene: toScene(copy) });
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

  // 全景热点表单线索（租户端）：列表 + CSV 导出
  router.get('/panorama/leads', requireTenant, (req, res) => {
    try {
      const tenantId = req.customerId;
      const { planId = '', export: doExport = '' } = req.query;
      const where = ['l.tenant_id = ?'];
      const params = [tenantId];
      if (planId) { where.push('l.plan_id = ?'); params.push(Number(planId)); }
      const whereSql = where.join(' AND ');
      const rows = db.prepare(
        `SELECT l.id, l.plan_id, l.scene_id, l.hotspot_title, l.name, l.phone, l.message, l.extra, l.created_at,
                p.name AS plan_name, s.title AS scene_name
         FROM panorama_leads l
         LEFT JOIN plans p ON l.plan_id = p.id
         LEFT JOIN scenes s ON l.scene_id = s.id
         WHERE ${whereSql}
         ORDER BY l.id DESC LIMIT 500`
      ).all(...params);
      if (doExport === 'csv') {
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const head = ['ID', '方案', '场景', '热点', '姓名', '手机', '留言', '自定义字段', '提交时间'];
        const lines = rows.map((r) => [r.id, r.plan_name, r.scene_name, r.hotspot_title, r.name, r.phone, r.message, r.extra, r.created_at].map(esc).join(','));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="panorama-leads-${Date.now()}.csv"`);
        return res.send('\uFEFF' + [head.join(','), ...lines].join('\n'));
      }
      res.json({ leads: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 我的账单
router.get('/orders', requireTenant, (req, res) => {
  const orders = db
    .prepare("SELECT * FROM payment_orders WHERE customer_id = ? AND payer_type='platform' ORDER BY id DESC")
    .all(req.customerId)
    .map((r) => ({ id: r.id, orderNo: r.order_no, productName: r.product_name, amount: r.amount, status: r.status, paidAt: r.paid_at, createdAt: r.created_at }));
  res.json({ orders });
});

// 成员管理（仅管理员）—— 已迁移至统一账号体系（accounts + tenant_members），见文件尾部 /members 路由

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
  // 品牌 5 色（与设计中心系统风格「主题/渐变/辅助/文字/文字辅」语义对应；'' = 清除回落）
  for (const k of ['brand_color', 'brand_gradient', 'brand_secondary', 'brand_text', 'brand_subtext']) {
    if (updates[k] !== undefined) config[k] = String(updates[k]).trim();
  }
  if (updates.card_create_skin !== undefined) config.card_create_skin = ['live', 'step'].includes(updates.card_create_skin) ? updates.card_create_skin : 'live';
  // 🔴 payment 段必须走 mergePaymentIntoConfig（paymentConfig）：
  //    ① 密钥在 payment.wechat.apiV3Key / payment.wechat.privateKey 等**嵌套**层，
  //       下面的 CONFIG_SECRET_SECTIONS 循环只扫顶层字段，扫不到 → 会明文落库；
  //    ② 直接 {...旧, ...新} 覆盖会丢掉本次未提交的渠道字段。
  if (updates.payment) mergePaymentIntoConfig(config, updates.payment);
  if (updates.upload_limits) config.upload_limits = { ...(config.upload_limits || {}), ...updates.upload_limits };
  if (updates.open_platform) config.open_platform = { ...(config.open_platform || {}), ...updates.open_platform };
  // 敏感密钥字段落库前加密（仅加密本次提交的新值，历史密文保持）
  // 注：payment 已由上面的 mergePaymentIntoConfig 处理，此处跳过避免二次加密
  for (const section of CONFIG_SECRET_SECTIONS) {
    if (section === 'payment') continue;
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
  // 🔴 app_secret / upload_key 一律脱敏回显：这条接口 requireTenant（租户成员也能调），
  // 明文返回等于把「小程序密钥 + 代码上传私钥」发给所有租户子账号。
  // 前端展示为 ****，留空即不修改（后端 mergeSecretInput 语义）。
  res.json({
    channels: channels.map((c) => ({
      ...c,
      app_secret: maskSecretValue(readSecret(c.app_secret)),
      has_app_secret: !!readSecret(c.app_secret),
      upload_key: maskSecretValue(readSecret(c.upload_key)),
      has_upload_key: !!readSecret(c.upload_key),
    })),
  });
});

// 获取渠道拖拽排序（按 sort_order 升序；未设置过返回空数组，前端用默认顺序）
// 注意：必须注册在 /channels/:type 之前，否则 'sort' 会被当作 :type 匹配
router.get('/channels/sort', requireTenant, (req, res) => {
  const cid = req.customerId;
  const rows = db.prepare('SELECT channel_type FROM channel_sorts WHERE customer_id = ? ORDER BY sort_order ASC, id ASC').all(cid);
  res.json({ types: rows.map(r => r.channel_type) });
});

// 保存渠道拖拽排序（整体覆盖）
router.put('/channels/sort', requireTenant, requireTenantAdmin, (req, res) => {
  const cid = req.customerId;
  const types = Array.isArray(req.body?.types) ? req.body.types.filter(t => typeof t === 'string') : [];
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM channel_sorts WHERE customer_id = ?').run(cid);
    types.forEach((t, i) => {
      db.prepare("INSERT OR REPLACE INTO channel_sorts (customer_id, channel_type, sort_order, updated_at) VALUES (?,?,?,datetime('now'))")
        .run(cid, t, i);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: '保存排序失败' });
  }
  auditCust(db, req, 'update_channel_sort', 'channel_sort', req.customerId, '保存渠道排序');
  res.json({ message: '排序已保存' });
});

// 更新渠道配置
router.put('/channels/:type', requireTenant, requireTenantAdmin, (req, res) => {
  const cid = req.customerId;
  const type = req.params.type;
  const b = req.body || {};
  // 🔴 channel_apps 全列 NOT NULL：空值必须落 '' 而非 null（否则 NOT NULL constraint failed）；
  // 🔴 部分更新语义：只覆盖请求体里出现的字段（saveBrand 只传品牌字段时，
  //    不得把 original_id/upload_key/app_secret 等未传字段清空）
  const existing = db.prepare('SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = ?').get(cid, type);
  if (existing) {
    if ('brandName' in b) existing.brand_name = b.brandName || '';
    if ('primaryColor' in b) existing.primary_color = b.primaryColor || '';
    if ('customDomain' in b) existing.custom_domain = b.customDomain || '';
    if ('enabled' in b) existing.enabled = b.enabled ? 1 : 0;
    if ('page' in b) existing.page = b.page || '';
    if ('originalId' in b) existing.original_id = b.originalId || '';
    // 🔴 upload_key 是「小程序代码上传密钥」——租户自己小程序的 RSA **私钥**（PEM 全文）。
    //    它的权限等价于「能往该小程序上传任意代码」，属最高敏感级凭据，
    //    与 appSecret 同等对待：落库加密、回显脱敏、留空即不改。
    if ('uploadKey' in b) existing.upload_key = mergeSecretInput(b.uploadKey, existing.upload_key);
    // 自运营 AppID 仅在未走第三方授权时允许客户自填（授权态的 appid 由授权回调管理，不可覆盖）
    if ('selfAppid' in b && existing.auth_status !== 'authorized') existing.appid = b.selfAppid || '';
    // 🔴 app_secret 落库必须加密：这是租户自己名下小程序的 AppSecret，
    // 允许在后台明文填写（对齐菜鸟云），但**数据库里不能是明文**——
    // 明文密钥会随数据库备份一起泄漏。空/脱敏占位符 = 不修改，保留原密文。
    if ('appSecret' in b) existing.app_secret = mergeSecretInput(b.appSecret, existing.app_secret);
    db.prepare(`UPDATE channel_apps SET brand_name=?, primary_color=?, custom_domain=?, enabled=?, page=?,
      original_id=?, upload_key=?, appid=?, app_secret=?, updated_at=datetime('now') WHERE id=?`)
      .run(existing.brand_name, existing.primary_color, existing.custom_domain, existing.enabled, existing.page,
        existing.original_id, existing.upload_key, existing.appid, existing.app_secret, existing.id);
  } else {
    db.prepare(`INSERT INTO channel_apps (customer_id, channel_type, brand_name, primary_color, custom_domain, enabled, page, original_id, upload_key, appid, app_secret)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(cid, type,
        'brandName' in b ? (b.brandName || '') : '',
        'primaryColor' in b ? (b.primaryColor || '') : '',
        'customDomain' in b ? (b.customDomain || '') : '',
        'enabled' in b ? (b.enabled ? 1 : 0) : 1,
        'page' in b ? (b.page || '') : '',
        'originalId' in b ? (b.originalId || '') : '',
        'uploadKey' in b && b.uploadKey ? mergeSecretInput(b.uploadKey, '') : '',
        'selfAppid' in b ? (b.selfAppid || '') : '',
        'appSecret' in b && b.appSecret ? mergeSecretInput(b.appSecret, '') : '');
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
    // 服务层签名：getAuthUrl(redirectUri, authType)；authType=2 仅小程序
    const authUrl = await wxService.getAuthUrl(
      redirectUri || `${req.protocol}://${req.get('host')}/customer`,
      2
    );
    res.json({ authUrl });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 小程序：从模板上传代码（创建草稿）
// 双模式：① 第三方授权 → 平台代码模板代上传；② 自运营（appid+上传密钥）→ miniprogram-ci 本地工程上传
router.post('/channels/mini/upload', requireTenant, requireTenantAdmin, async (req, res) => {
  try {
    const { templateId, userVersion, userDesc } = req.body || {};
    const cid = req.customerId;
    const channel = db.prepare('SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = ?').get(cid, 'mini');
    if (!channel?.authorizer_appid) {
      // 自运营分支：未走第三方授权，但客户填了自己的 AppID + 代码上传密钥
      // 🔴 upload_key 落库是密文，必须 readSecret 解密后交给 miniprogram-ci
      const uploadKey = readSecret(channel?.upload_key);
      if (channel?.appid && uploadKey && channel.auth_status !== 'authorized') {
        await ciUploadMini({ appid: channel.appid, uploadKey, version: userVersion, desc: userDesc });
        db.prepare(`UPDATE channel_apps SET audit_status='draft', version=?, updated_at=datetime('now') WHERE id=?`).run(userVersion || '', channel.id);
        new WxComponentService(db).logDeploy(channel.id, 'upload', 'success', '', userVersion || '');
        return res.json({ message: '代码上传成功（自运营 miniprogram-ci 通道）' });
      }
      return res.status(400).json({ error: '小程序未授权，且自运营参数（AppID/代码上传密钥）未配置完整' });
    }
    const wxService = new WxComponentService(db);
    // 服务层按 channel_apps.id 取 token，必须传 id 不是 appid
    await wxService.uploadCode(channel.id, templateId, userVersion, userDesc);
    db.prepare(`UPDATE channel_apps SET audit_status='draft', version=?, updated_at=datetime('now') WHERE id=?`).run(userVersion, channel.id);
    // 发布日志统一走 logDeploy（列名 channel_app_id，早期误写 customer_id/channel_type 必炸）
    wxService.logDeploy(channel.id, 'upload', 'success', String(templateId || ''), userVersion || '');
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
    await wxService.submitAudit(channel.id);
    wxService.logDeploy(channel.id, 'submit_audit', 'success', '', channel.version || '');
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
    if (!channel.audit_id) return res.json({ auditStatus: channel.audit_status, reason: '' });
    const wxService = new WxComponentService(db);
    // 审核状态查询用 submit_audit 返回的 auditid（落库在 audit_id 列）
    const result = await wxService.getAuditStatus(channel.id, channel.audit_id);
    const statusMap = { 0: 'approved', 1: 'auditing', 2: 'rejected', 3: 'revoked' };
    const status = statusMap[result.status] || channel.audit_status;
    db.prepare(`UPDATE channel_apps SET audit_status=?, updated_at=datetime('now') WHERE id=?`).run(status, channel.id);
    res.json({ auditStatus: status, reason: result.reason || '' });
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
    await wxService.release(channel.id);
    db.prepare(`UPDATE channel_apps SET audit_status='released', updated_at=datetime('now') WHERE id=?`).run(channel.id);
    wxService.logDeploy(channel.id, 'release', 'success', '', channel.version || '');
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
    await wxService.rollback(channel.id);
    wxService.logDeploy(channel.id, 'rollback', 'success', '', channel.version || '');
    res.json({ message: '回退成功' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 小程序：取消授权（解绑，回到未授权状态；品牌配置保留供重新授权）
router.delete('/channels/mini', requireTenant, requireTenantAdmin, async (req, res) => {
  try {
    const cid = req.customerId;
    const channel = db.prepare('SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = ?').get(cid, 'mini');
    if (!channel?.authorizer_appid) return res.status(400).json({ error: '小程序未授权' });
    const wxService = new WxComponentService(db);
    await wxService.unauthorize(channel.authorizer_appid);
    // 清授权态但保留行：brand_name/primary_color 等配置重授权后仍生效
    // （unauthorized 事件回调与 auth-callback 授权都按 appid 定位，清空 appid 后由新授权写入）
    // 注意：template_id 列 NOT NULL，清零须用 '' 而非 NULL（否则 NOT NULL 约束报错）
    db.prepare(`UPDATE channel_apps SET auth_status='revoked', appid='', app_secret='',
      authorizer_access_token='', authorizer_refresh_token='', token_expires_at=NULL,
      version='', template_id='', draft_id=NULL, audit_id='', audit_status='none',
      updated_at=datetime('now') WHERE id=?`).run(channel.id);
    wxService.logDeploy(channel.id, 'unauthorize', 'success', '', '');
    auditCust(db, req, 'channel_unauthorize', 'channel_app', cid, '取消小程序授权');
    res.json({ message: '已取消授权' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 小程序：发布日志
router.get('/channels/mini/deploy-logs', requireTenant, (req, res) => {
  const cid = req.customerId;
  // 日志表只有 channel_app_id 列：经子查询定位本租户 mini 渠道
  const logs = db.prepare(`SELECT * FROM channel_deploy_logs
    WHERE channel_app_id = (SELECT id FROM channel_apps WHERE customer_id = ? AND channel_type = 'mini')
    ORDER BY id DESC LIMIT 20`).all(cid);
  res.json({ logs });
});

// ============================================================
// 智能名片 - 企业管理
// ============================================================

// 企业概览统计
router.get('/card/overview', requireTenant, (req, res) => {
  const cid = req.customerId;
  const scope = TENANT_CARD_SCOPE_SQL;
  const sp = tenantCardScopeParams(cid);
  // 企业成员 = 归属本租户的去重自然人（C端用户 + 后台成员）
  const employeeCount = db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT id FROM platform_user WHERE customer_id = ?
      UNION SELECT user_id FROM tenant_individuals WHERE customer_id = ? AND status = 'active'
      UNION SELECT user_id FROM tenant_enterprise_employees WHERE customer_id = ? AND status = 'active'
      UNION SELECT id FROM platform_user WHERE enterprise_id IN (SELECT id FROM tenant_enterprises WHERE customer_id = ? AND status = 'active')
    )`).get(cid, cid, cid, cid).n;
  const cardCount = db.prepare(`SELECT COUNT(*) AS n FROM card_profile c WHERE ${scope} AND c.status = ?`).get(...sp, 'active').n;
  const totalViews = db.prepare(`SELECT COALESCE(SUM(c.view_count),0) AS s FROM card_profile c WHERE ${scope} AND c.status = ?`).get(...sp, 'active').s;
  const exchangeCount = db.prepare(`SELECT COALESCE(SUM(c.exchange_count),0) AS s FROM card_profile c WHERE ${scope} AND c.status = ?`).get(...sp, 'active').s;
  // 企业客户：customer_id 是租户归属（enterprise_id 全是 NULL，旧口径恒 0）
  // 🔴 同名片口径：enterprise_id 仅认 active 企业，停用/影子企业不再提供归属
  const customerCount = db.prepare(`SELECT COUNT(*) AS n FROM card_customer WHERE customer_id = ?
     OR enterprise_id IN (SELECT id FROM tenant_enterprises WHERE customer_id = ? AND status = 'active')`).get(cid, cid).n;
  res.json({ employeeCount, cardCount, totalViews, customerCount, exchangeCount });
});

// 员工名片列表
router.get('/card/employees', requireTenant, (req, res) => {
  const cid = req.customerId;
  const { page = 1, pageSize = 20, keyword = '' } = req.query;
  const offset = (page - 1) * pageSize;
  let where = `WHERE ${TENANT_CARD_SCOPE_SQL} AND c.status = ?`;
  const params = [...tenantCardScopeParams(cid), 'active'];
  if (keyword) {
    where += ' AND (c.name LIKE ? OR c.position LIKE ? OR c.company LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  // SELECT 列表里的身份 CASE 占位符排在 WHERE 之前，故 cid 参数放最前
  const cards = db.prepare(`
    SELECT c.*, u.nickname, u.avatar as user_avatar, u.member_level, u.enterprise_id as user_enterprise_id,
      ${CARD_IDENTITY_SQL} AS identity
    FROM card_profile c
    LEFT JOIN platform_user u ON c.user_id = u.id
    ${where}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...cardIdentityParams(cid), ...params, Number(pageSize), offset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM card_profile c ${where}`).get(...params).n;
  const entNames = loadTenantEnterpriseNames(cid);
  res.json({ cards: cards.map(c => ({
    id: c.id, userId: c.user_id, name: c.name, position: c.position, company: c.company,
    phone: c.phone, avatar: c.avatar, viewCount: c.view_count, exchangeCount: c.exchange_count,
    isPublic: c.is_public, memberLevel: c.member_level, createdAt: c.created_at,
    identity: c.identity, identityLabel: IDENTITY_LABEL[c.identity] || '未认证个人',
    identityHint: IDENTITY_HINT[c.identity] || IDENTITY_HINT.personal,
    subjectType: subjectTypeOf(c.identity),
    enterpriseName: cardEnterpriseName(entNames, c),
  })), total, page: Number(page), pageSize: Number(pageSize) });
});

// 名片管理（租户统一视图：身份归属 + 公开状态 + 集市上下架）
// 解决的困惑：后台各页口径不同（员工名片按人、集市按上架记录、入驻管理按账号），
// 这里用同一套并集口径把「名片」这一层一次说清。
// 集市状态用子查询落到 SQL 里（而不是查出来再 JS 过滤），否则筛选会破坏分页。
// 2026-10-20 身份模型重构（方案 C）：主体拆分——默认只看个人名片（成员），
// 企业名片是主体档案不是人，用 subject=enterprise 显式切换查看；
// 统计卡同步拆 personCardCount / enterpriseCardCount，不再一个 cardCount 混算。
const MARKET_STATUS_SQL = `(SELECT mi.audit_status FROM card_market_items mi
    WHERE mi.customer_id = ? AND mi.user_id = c.user_id
    ORDER BY (mi.audit_status = 'approved') DESC, (mi.audit_status = 'pending') DESC, mi.id DESC
    LIMIT 1)`;
router.get('/card/manage', requireTenant, (req, res) => {
  const cid = req.customerId;
  const { page = 1, pageSize = 20, keyword = '', identity = '', market = '', subject = 'person' } = req.query;
  const offset = (page - 1) * pageSize;
  // SELECT 列表占位符：身份 CASE ×3 + 集市状态/记录ID/置顶 ×3 + 入驻申请行 id/状态 ×2
  const selectParams = [...cardIdentityParams(cid), cid, cid, cid, cid, cid];
  let where = `WHERE ${TENANT_CARD_SCOPE_SQL} AND c.status = ?`;
  const params = [...tenantCardScopeParams(cid), 'active'];
  if (keyword) {
    where += ' AND (c.name LIKE ? OR c.position LIKE ? OR c.company LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  // 主体筛选（默认 person）：企业名片是档案不是成员，显式切换才看
  if (subject === 'enterprise') {
    where += ` AND ${CARD_IDENTITY_SQL} = 'enterprise'`;
    params.push(...cardIdentityParams(cid));
  } else if (subject !== 'all') {
    where += ` AND ${CARD_IDENTITY_SQL} <> 'enterprise'`;
    params.push(...cardIdentityParams(cid));
  }
  // 身份筛选直接压在 SQL 的同一个 CASE 上，避免 JS 二次筛选破坏分页
  if (identity && IDENTITY_LABEL[identity]) {
    where += ` AND ${CARD_IDENTITY_SQL} = ?`;
    params.push(...cardIdentityParams(cid), identity);
  }
  // 集市状态筛选：none = 从未申请上架
  if (market === 'none') {
    where += ` AND COALESCE(${MARKET_STATUS_SQL}, '') = ''`;
    params.push(cid);
  } else if (['approved', 'pending', 'rejected'].includes(market)) {
    where += ` AND ${MARKET_STATUS_SQL} = ?`;
    params.push(cid, market);
  }
  const cards = db.prepare(`
    SELECT c.*, u.nickname, u.avatar as user_avatar, u.member_level, u.member_expire_at, u.enterprise_id as user_enterprise_id,
      ${CARD_IDENTITY_SQL} AS identity,
      ${MARKET_STATUS_SQL} AS market_status,
      (SELECT mi.id FROM card_market_items mi
        WHERE mi.customer_id = ? AND mi.user_id = c.user_id
        ORDER BY (mi.audit_status = 'approved') DESC, (mi.audit_status = 'pending') DESC, mi.id DESC
        LIMIT 1) AS market_item_id,
      (SELECT mi.is_top FROM card_market_items mi
        WHERE mi.customer_id = ? AND mi.user_id = c.user_id
        ORDER BY (mi.audit_status = 'approved') DESC, (mi.audit_status = 'pending') DESC, mi.id DESC
        LIMIT 1) AS market_is_top,
      (SELECT i.id FROM tenant_individuals i WHERE i.customer_id = ? AND i.user_id = c.user_id ORDER BY i.id DESC LIMIT 1) AS individual_id,
      (SELECT i.status FROM tenant_individuals i WHERE i.customer_id = ? AND i.user_id = c.user_id ORDER BY i.id DESC LIMIT 1) AS individual_status
    FROM card_profile c
    LEFT JOIN platform_user u ON u.id = c.user_id
    ${where}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...selectParams, ...params, Number(pageSize), offset);
  // COUNT 的 where 与列表完全一致，参数也完全一致（SELECT 列表的占位符不参与）
  const total = db.prepare(`SELECT COUNT(*) AS n FROM card_profile c ${where}`).get(...params).n;
  // 顶部统计卡：与列表筛选无关（同一套并集口径），用不过滤的基数，
  // 否则一筛选「名片总数」就跟着变，和其它全局卡自相矛盾
  const sp0 = tenantCardScopeParams(cid);
  const cardCount = db.prepare(`SELECT COUNT(*) AS n FROM card_profile c WHERE ${TENANT_CARD_SCOPE_SQL} AND c.status = ?`).get(...sp0, 'active').n;
  // 主体拆分（2026-10-20 方案 C）：企业名片是主体档案，不与成员名片混算
  const enterpriseCardCount = db.prepare(
    `SELECT COUNT(*) AS n FROM card_profile c WHERE ${TENANT_CARD_SCOPE_SQL} AND c.status = ? AND ${CARD_IDENTITY_SQL} = 'enterprise'`
  ).get(...sp0, 'active', ...cardIdentityParams(cid)).n;
  const stats = {
    cardCount,
    personCardCount: cardCount - enterpriseCardCount,
    enterpriseCardCount,
    publicCount: db.prepare(`SELECT COUNT(*) AS n FROM card_profile c WHERE ${TENANT_CARD_SCOPE_SQL} AND c.status = ? AND c.is_public = 1`).get(...sp0, 'active').n,
    // 🔴 集市统计按「去重主体」计数，不按原始记录数：下架再申请 / 一人挂多主体不会让统计虚高。
    // 任一时刻同一 (subject_type, subject_id) 至多一条在市记录，DISTINCT 既防历史脏数据累积，
    // 也和「已上架名片」展示口径对齐（2026-10-20 修复）。
    marketApproved: db.prepare(`SELECT COUNT(*) AS n FROM (SELECT DISTINCT subject_type, subject_id FROM card_market_items WHERE customer_id = ? AND audit_status = ?)`).get(cid, 'approved').n,
    marketPending: db.prepare(`SELECT COUNT(*) AS n FROM (SELECT DISTINCT subject_type, subject_id FROM card_market_items WHERE customer_id = ? AND audit_status = ?)`).get(cid, 'pending').n,
    // 2026-10-20 合并「员工名片」页进来：补它独有的两个统计（去重自然人 / 累计访问）
    employeeCount: db.prepare(`SELECT COUNT(DISTINCT c.user_id) AS n FROM card_profile c WHERE ${TENANT_CARD_SCOPE_SQL} AND c.status = ?`).get(...sp0, 'active').n,
    totalViews: db.prepare(`SELECT COALESCE(SUM(c.view_count), 0) AS n FROM card_profile c WHERE ${TENANT_CARD_SCOPE_SQL} AND c.status = ?`).get(...sp0, 'active').n,
  };
  const entNames = loadTenantEnterpriseNames(cid);
  res.json({ cards: cards.map(c => ({
    id: c.id, userId: c.user_id, name: c.name, position: c.position, company: c.company,
    phone: c.phone, avatar: c.avatar, viewCount: c.view_count, exchangeCount: c.exchange_count,
    isPublic: !!c.is_public, memberLevel: c.member_level, memberExpireAt: c.member_expire_at, createdAt: c.created_at,
    identity: c.identity, identityLabel: IDENTITY_LABEL[c.identity] || '未认证个人',
    identityHint: IDENTITY_HINT[c.identity] || IDENTITY_HINT.personal,
    subjectType: subjectTypeOf(c.identity),
    enterpriseName: cardEnterpriseName(entNames, c),
    marketItemId: c.market_item_id || null,
    marketStatus: c.market_status || '',   // '' 表示从未申请上架
    marketIsTop: !!c.market_is_top,
    applyId: c.individual_id || null,      // 入驻名册行（认证状态真值）
    applyStatus: c.individual_status || '', // active=已认证 / pending=待审核 / rejected=已拒绝 / disabled=已停用 / ''=未申请
  })), total, stats, page: Number(page), pageSize: Number(pageSize) });
});

// 名片详情（后台编辑弹窗回填用）：租户作用域内单条全字段。
// 列表接口（上面）只回展示字段，编辑表单需要 wechat/email/bio/slogan/address 等，单独拉。
router.get('/card/manage/:id', requireTenant, (req, res) => {
  const cid = req.customerId;
  const card = db.prepare(
    `SELECT c.* FROM card_profile c WHERE c.id = ? AND c.status = 'active' AND (${TENANT_CARD_SCOPE_SQL})`
  ).get(req.params.id, ...tenantCardScopeParams(cid));
  if (!card) return res.status(404).json({ error: '名片不存在或不属于本租户' });
  // 第26轮：编辑弹窗双开关回填——认证状态（名册真值）+ 集市在市状态
  const ind = db.prepare('SELECT id, status FROM tenant_individuals WHERE customer_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1').get(cid, card.user_id);
  const mi = db.prepare("SELECT id, audit_status FROM card_market_items WHERE customer_id = ? AND subject_type = 'individual' AND user_id = ? ORDER BY id DESC LIMIT 1").get(cid, card.user_id);
  const identity = db.prepare(`SELECT ${CARD_IDENTITY_SQL} AS identity FROM card_profile c WHERE c.id = ?`)
    .get(card.id, ...cardIdentityParams(cid))?.identity || 'personal';
  res.json({ card: {
    id: card.id, name: card.name, position: card.position, company: card.company,
    phone: card.phone, wechat: card.wechat, email: card.email, city: card.city,
    industry: card.industry, bio: card.bio, slogan: card.slogan, address: card.address,
    videoChannel: card.video_channel, isPublic: !!card.is_public,
    latitude: card.latitude, longitude: card.longitude,
    cardType: card.card_type || 'personal',
    identity,
    certified: ind?.status === 'active',
    individualId: ind?.id || null,
    applyStatus: ind?.status || '',
    marketItemId: mi?.id || null,
    marketStatus: mi?.audit_status || '',
  } });
});

// 租户管理员代编辑名片（后台「名片管理 / 员工名片」→ 编辑）。
// 🔴 与用户自编辑（card.js PUT /cards/:id）刻意分离：这里是管理动作，
// 不做会员门禁（自定义作品标签/模板校验都是「用户能力」，管理员代改不适用），
// 只开放基础资料字段；头像/作品/视频列表等多媒体内容仍归主人自己维护。
// 租户作用域校验与列表同一套 SQL，防止跨租户改别人的名片。
router.put('/card/manage/:id', requireTenant, (req, res) => {
  const cid = req.customerId;
  const card = db.prepare(
    `SELECT c.* FROM card_profile c WHERE c.id = ? AND c.status = 'active' AND (${TENANT_CARD_SCOPE_SQL})`
  ).get(req.params.id, ...tenantCardScopeParams(cid));
  if (!card) return res.status(404).json({ error: '名片不存在或不属于本租户' });
  const b = req.body || {};
  const strFields = {
    name: 'name', position: 'position', company: 'company', phone: 'phone',
    wechat: 'wechat', email: 'email', city: 'city', industry: 'industry',
    bio: 'bio', slogan: 'slogan', address: 'address', videoChannel: 'video_channel',
  };
  const sets = [];
  const params = [];
  for (const [k, col] of Object.entries(strFields)) {
    if (b[k] !== undefined) { sets.push(`${col} = ?`); params.push(String(b[k] ?? '').slice(0, 2000)); }
  }
  if (b.isPublic !== undefined) { sets.push('is_public = ?'); params.push(b.isPublic ? 1 : 0); }
  // 经纬度：必须成对提供且合法才写——只写一个会把「导航」从可用改成坏（openLocation 需要两个都有效）
  if (b.latitude !== undefined && b.longitude !== undefined) {
    const lat = Number(b.latitude);
    const lng = Number(b.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      sets.push('latitude = ?, longitude = ?');
      params.push(lat, lng);
    }
  }
  if (!sets.length) return res.status(400).json({ error: '没有可更新的字段' });
  db.prepare(`UPDATE card_profile SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params, card.id);
  const updated = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(card.id);
  res.json({ ok: true, card: {
    id: updated.id, name: updated.name, position: updated.position,
    company: updated.company, phone: updated.phone, updatedAt: updated.updated_at,
  } });
});

// ============================================================
// 第26轮：管理端认证/集市直操作（名片管理编辑弹窗双开关）
// ------------------------------------------------------------
// 认证 = 建/复活 tenant_individuals active 行（绑定行为镜像 apply/audit approve）；
// 取消认证 = 行转 disabled + 移出集市 + 名片转私有——canListMarket 判据是名册 active，
// 若只翻名册不清集市会出现「未认证却在市」的判据漂移，这里必须原子同步。
// ============================================================
function manageCardScope(req) {
  return db.prepare(
    `SELECT c.* FROM card_profile c WHERE c.id = ? AND c.status = 'active' AND (${TENANT_CARD_SCOPE_SQL})`
  ).get(req.params.id, ...tenantCardScopeParams(req.customerId));
}
function manageAudit(req, action, targetId, detail) {
  addOperationLog(db, {
    userId: req.user?.uid ?? req.user?.id ?? null,
    username: req.user?.username || '',
    action,
    targetType: 'card_manage',
    targetId,
    detail: `[租户#${req.customerId}] ${detail}`,
    ip: req.ip,
  });
}
function syncCardsPublicById(userId, isPublic) {
  db.prepare('UPDATE card_profile SET is_public = ? WHERE user_id = ?').run(isPublic ? 1 : 0, userId);
}

// 认证 / 取消认证（仅租户管理员）
router.post('/card/manage/:id/certify', requireTenant, requireTenantAdmin, (req, res) => {
  const cid = req.customerId;
  const card = manageCardScope(req);
  if (!card) return res.status(404).json({ error: '名片不存在或不属于本租户' });
  if (card.card_type !== 'personal') return res.status(400).json({ error: '仅个人名片支持认证操作' });
  const emp = db.prepare("SELECT id FROM tenant_enterprise_employees WHERE customer_id = ? AND user_id = ? AND status = 'active'").get(cid, card.user_id);
  if (emp) return res.status(400).json({ error: '企业员工身份由花名册管理，不在此认证' });
  const certified = !!(req.body || {}).certified;
  const row = db.prepare('SELECT * FROM tenant_individuals WHERE customer_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1').get(cid, card.user_id);
  if (certified) {
    // 跨租户保护：已绑定其他租户的用户不能抢人（与购买赠主体同口径）
    const pu = db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(card.user_id);
    if (pu && pu.customer_id && Number(pu.customer_id) !== cid) {
      return res.status(403).json({ error: '该用户已绑定其他客户项目，不能跨租户认证' });
    }
    if (!row || row.status !== 'active') {
      const q = checkTenantQuota(db, cid, 'max_individuals');
      if (!q.ok) return res.status(403).json({ error: `入驻个人数量已达上限（${q.used}/${q.limit}），请升级套餐后再认证` });
      const iq = checkTenantSolutionQuota(db, cid, 'card', 'memberCount');
      if (!iq.ok) return res.status(403).json({ error: `入驻个人数已达上限（${iq.used}/${iq.limit}），请升级方案后再认证` });
    }
    let individualId;
    if (row) {
      db.prepare("UPDATE tenant_individuals SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(row.id);
      individualId = row.id;
    } else {
      const ins = db.prepare(`INSERT INTO tenant_individuals (customer_id, user_id, name, phone, position, company, status, source)
        VALUES (?, ?, ?, ?, ?, ?, 'active', 'admin')`)
        .run(cid, card.user_id, card.name || '', card.phone || '', card.position || '', card.company || card.city || '');
      individualId = ins.lastInsertRowid;
    }
    // 绑定镜像 apply/audit approve：customer_id 只填空不覆盖；名片归属只补空
    db.prepare("UPDATE platform_user SET customer_id = COALESCE(customer_id, ?), identity_type = 'individual', updated_at = datetime('now') WHERE id = ?")
      .run(cid, card.user_id);
    db.prepare("UPDATE card_profile SET customer_id = ? WHERE user_id = ? AND (customer_id IS NULL OR customer_id = '')").run(cid, card.user_id);
    manageAudit(req, 'admin_certify_individual', card.id, `管理员认证个人「${card.name}」（主体#${individualId}）`);
    return res.json({ ok: true, certified: true });
  }
  if (!row) return res.status(400).json({ error: '该用户尚未入驻，无需取消认证' });
  db.prepare("UPDATE tenant_individuals SET status = 'disabled', updated_at = datetime('now') WHERE id = ?").run(row.id);
  db.prepare("DELETE FROM card_market_items WHERE customer_id = ? AND subject_type = 'individual' AND user_id = ?").run(cid, card.user_id);
  syncCardsPublicById(card.user_id, false);
  manageAudit(req, 'admin_uncertify_individual', card.id, `管理员取消认证「${card.name}」（主体#${row.id}，已同步下架集市）`);
  res.json({ ok: true, certified: false });
});

// 上架 / 下架集市（仅租户管理员；上架前提=已认证，审核状态沿用集市配置 audit_mode）
router.post('/card/manage/:id/market', requireTenant, requireTenantAdmin, (req, res) => {
  const cid = req.customerId;
  const card = manageCardScope(req);
  if (!card) return res.status(404).json({ error: '名片不存在或不属于本租户' });
  if (card.card_type !== 'personal') return res.status(400).json({ error: '仅个人名片支持集市操作' });
  const inMarket = !!(req.body || {}).inMarket;
  const ind = db.prepare("SELECT id, status FROM tenant_individuals WHERE customer_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1").get(cid, card.user_id);
  const existing = db.prepare("SELECT id FROM card_market_items WHERE customer_id = ? AND subject_type = 'individual' AND user_id = ?").get(cid, card.user_id);
  if (inMarket) {
    if (!ind || ind.status !== 'active') return res.status(400).json({ error: '该用户未认证，请先完成认证再上架集市' });
    if (existing) return res.status(400).json({ error: '该名片已在集市中' });
    const sw = db.prepare('SELECT enabled, audit_mode FROM card_market_settings WHERE customer_id = ?').get(cid);
    // 无设置行 = 集市默认开启（与 cardMarket.marketEnabled 同语义，不能把未配置租户当成已关闭）
    if (sw && !sw.enabled) return res.status(400).json({ error: '集市未开启，请先在集市管理中开启' });
    const q = checkTenantQuota(db, cid, 'max_market_items');
    if (!q.ok) return res.status(403).json({ error: `集市上架数量已达上限（${q.used}/${q.limit}），请升级套餐` });
    const mq = checkTenantSolutionQuota(db, cid, 'card', 'marketItems');
    if (!mq.ok) return res.status(403).json({ error: `集市上架数量已达上限（${mq.used}/${mq.limit}），请升级方案` });
    const auditStatus = sw?.audit_mode === 'manual' ? 'pending' : 'approved';
    db.prepare(`INSERT INTO card_market_items (customer_id, subject_type, subject_id, user_id, audit_status, city)
      VALUES (?, 'individual', ?, ?, ?, ?)`).run(cid, ind.id, card.user_id, auditStatus, card.city || '');
    syncCardsPublicById(card.user_id, true);
    manageAudit(req, 'admin_market_list', card.id, `管理员上架集市「${card.name}」（审核=${auditStatus}）`);
    return res.json({ ok: true, inMarket: true, auditStatus });
  }
  if (!existing) return res.status(400).json({ error: '该名片不在集市中' });
  db.prepare('DELETE FROM card_market_items WHERE id = ?').run(existing.id);
  syncCardsPublicById(card.user_id, false);
  manageAudit(req, 'admin_market_delist', card.id, `管理员下架集市「${card.name}」`);
  res.json({ ok: true, inMarket: false });
});

// 名片的认证/集市操作记录（编辑弹窗「操作记录」展示；平台 Logs 页同表可查）
router.get('/card/manage/:id/oplogs', requireTenant, (req, res) => {
  const card = manageCardScope(req);
  if (!card) return res.status(404).json({ error: '名片不存在或不属于本租户' });
  const logs = db.prepare("SELECT action, detail, created_at FROM operation_logs WHERE target_type = 'card_manage' AND target_id = ? ORDER BY id DESC LIMIT 30")
    .all(card.id);
  res.json({ logs });
});

// 企业客户列表
router.get('/card/customers', requireTenant, (req, res) => {
  const cid = req.customerId;
  const { page = 1, pageSize = 20, keyword = '', status = '' } = req.query;
  const offset = (page - 1) * pageSize;
  // 同名片口径：customer_id 是租户归属，enterprise_id 仅作 active 企业的补充
  let where = 'WHERE (customer_id = ? OR enterprise_id IN (SELECT id FROM tenant_enterprises WHERE customer_id = ? AND status = \'active\'))';
  const params = [cid, cid];
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
  const cid = req.customerId;
  const customer = db.prepare('SELECT id FROM card_customer WHERE id = ? AND (customer_id = ? OR enterprise_id IN (SELECT id FROM tenant_enterprises WHERE customer_id = ? AND status = \'active\'))').get(req.params.id, cid, cid);
  if (!customer) return res.status(404).json({ error: '客户不存在' });
  const follows = db.prepare('SELECT * FROM card_customer_follow WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id);
  res.json({ follows: follows.map(f => ({
    id: f.id, content: f.content, nextFollowAt: f.next_follow_at, createdAt: f.created_at,
  })) });
});

// 企业名片访问趋势（近7天）
router.get('/card/trends', requireTenant, (req, res) => {
  const cid = req.customerId;
  const rows = db.prepare(`
    SELECT visit_date, SUM(visit_count) as views
    FROM card_visitor
    WHERE card_id IN (SELECT c.id FROM card_profile c WHERE ${TENANT_CARD_SCOPE_SQL})
    AND visit_date >= date('now', '-7 days')
    GROUP BY visit_date
    ORDER BY visit_date
  `).all(...tenantCardScopeParams(cid));
  res.json({ trends: rows });
});

  // 租户生命周期状态（供后台到期提示/续费引导）
  router.get('/tenant/status', requireTenantSoft, (req, res) => {
    const state = tenantState(db, req.customerId, { ctx: 'admin' });
    const project = state.project || {};
    const cfg = (() => { try { return JSON.parse(project.config || '{}'); } catch { return {}; } })();
    let daysLeft = null;
    if (project.valid_until) {
      const diff = new Date(project.valid_until + 'T23:59:59') - new Date();
      daysLeft = Math.max(0, Math.ceil(diff / 86400000));
    }
    res.json({
      customerName: project.customer_name || '',
      status: state.active ? 'active' : (state.expired ? 'expired' : (state.missing ? 'missing' : 'disabled')),
      expired: !state.active,
      readonly: !!state.readonly,
      validUntil: project.valid_until || null,
      daysLeft,
      selfRenew: cfg.selfRenew !== false,
      config: {
        adminExpireMode: cfg.adminExpireMode || 'deny',
        miniExpireMode: cfg.miniExpireMode || 'prompt',
        selfRenew: cfg.selfRenew !== false
      }
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

  router.get('/analytics/hotspots', requireTenant, (req, res) => {
    try {
      const tenantId = req.customerId;
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 8));
      const solution = req.query.solution || 'panorama';
      const where = ['tenant_id = ?', 'solution = ?', "event_type = 'hotspot_click'"];
      const params = [tenantId, solution];
      const whereSql = where.join(' AND ');
      const rows = db.prepare(
        `SELECT scene_id AS sceneId,
                json_extract(extra, '$.hotspotTitle') AS title,
                json_extract(extra, '$.hotspotType') AS type,
                COUNT(*) AS clicks
         FROM analytics_events
         WHERE ${whereSql} AND scene_id > 0
         GROUP BY scene_id, json_extract(extra, '$.hotspotTitle')
         ORDER BY clicks DESC LIMIT ?`
      ).all(...params, limit);
      const ids = [...new Set(rows.map((r) => r.sceneId))];
      const nameMap = new Map();
      if (ids.length) {
        db.prepare(`SELECT id, title FROM scenes WHERE id IN (${ids.map(() => '?').join(',')})`)
          .all(...ids)
          .forEach((s) => nameMap.set(s.id, s.title));
      }
      res.json({ hotspots: rows.map((r) => ({ ...r, sceneName: nameMap.get(r.sceneId) || `场景#${r.sceneId}`, clicks: Number(r.clicks) })) });
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
    const poolFloated = db.prepare("SELECT COUNT(*) AS n FROM enterprise_public_pool WHERE enterprise_id = ? AND status IN ('floated', 'recycled')").get(eid).n;
    const totalViews = db.prepare('SELECT COALESCE(SUM(view_count),0) AS s FROM card_profile WHERE user_id IN (SELECT id FROM platform_user WHERE enterprise_id = ?)').get(eid).s;
    res.json({
      enterprise: {
        id: ent.id, name: ent.name, logo: ent.logo, industry: ent.industry,
        scale: ent.scale, description: ent.description, status: ent.status,
        autoRecycle: !!config.auto_recycle,
        inviteCode: config.invite_code || '',
      },
      stats: { employeeCount, cardCount, customerCount, poolAvailable, poolClaimed, poolFloated, totalViews },
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
    // 企业员工人数配额（新体系 solution_quotas：card.employeeCount）
    const eq = checkTenantSolutionQuota(db, req.customerId, 'card', 'employeeCount');
    if (!eq.ok) return res.status(403).json({ error: `企业员工人数已达上限（${eq.used}/${eq.limit}），请升级方案后再添加` });
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

  // ===== 企业公海客户上浮到平台公海（手动） =====
  // 上浮方式（projects 集市配置 poolFloatMode，来自集市管理「公海上浮方式」）：
  // - soft：软上浮（企业记录保留为 floated，可随时收回；平台公海未领取时）
  // - recover：限时收回（同软上浮，仅平台公海记录创建后 7 天内可收回）
  // - hard：直接移交（企业记录置 recycled，不可逆，历史默认行为）
  // 查重：同客户项目同手机号在平台公海已存在（任何状态）则拒绝，防止客户资产重复
  function floatUpOne(db, row, customerId, enterpriseId, audit, req) {
    const dup = db.prepare('SELECT id FROM tenant_public_pool WHERE customer_id = ? AND phone = ?').get(customerId, row.phone || '');
    if (dup) return { ok: false, reason: '项目客户公海已存在该客户，无需重复上浮' };
    // source_id 统一记「来源企业（tenant_enterprises.id）」：
    // 旧实现写 row.source_id（card_customer.id），与 cardMarket 侧停用企业时写的
    // 企业ID 语义不一致，后台按 tenant_enterprises.id 反查企业名会张冠李戴。
    db.prepare(`INSERT INTO tenant_public_pool (customer_id, source_type, source_id, name, phone, company, position, remark)
      VALUES (?, 'enterprise', ?, ?, ?, ?, ?, ?)`)
      .run(customerId, enterpriseId, row.name, row.phone || '', row.company || '', row.position || '', row.remark || '');
    const market = db.prepare('SELECT pool_float_mode FROM card_market_settings WHERE customer_id = ?').get(customerId);
    const mode = market?.pool_float_mode || 'soft';
    if (mode === 'hard') {
      db.prepare("UPDATE enterprise_public_pool SET status = 'recycled', recycled_at = datetime('now') WHERE id = ?").run(row.id);
    } else {
      db.prepare("UPDATE enterprise_public_pool SET status = 'floated', floated_at = datetime('now') WHERE id = ?").run(row.id);
    }
    audit(db, req, 'enterprise_pool_float_up', 'enterprise', enterpriseId, `公海客户「${row.name || row.phone}」上浮平台公海（${mode}）`);
    return { ok: true };
  }

  router.post('/enterprise/pool/:id/float-up', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM enterprise_public_pool WHERE id = ? AND enterprise_id = ?')
      .get(Number(req.params.id), req.enterpriseId);
    if (!row) return res.status(404).json({ error: '客户不存在' });
    if (row.status !== 'available') return res.status(400).json({ error: '该客户已上浮或已被领取' });
    const r = floatUpOne(db, row, req.customerId, req.enterpriseId, auditCust, req);
    if (!r.ok) return res.status(400).json({ error: r.reason });
    res.json({ ok: true });
  });

  // 批量上浮（逐条幂等：已上浮/已领取/重复 自动跳过）
  router.post('/enterprise/pool/batch-float-up', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: '请选择要上浮的客户' });
    let floated = 0, skipped = 0;
    for (const id of ids) {
      const row = db.prepare('SELECT * FROM enterprise_public_pool WHERE id = ? AND enterprise_id = ?').get(id, req.enterpriseId);
      if (!row || row.status !== 'available') { skipped++; continue; }
      const r = floatUpOne(db, row, req.customerId, req.enterpriseId, auditCust, req);
      if (r.ok) floated++; else skipped++;
    }
    res.json({ ok: true, floated, skipped });
  });

  // 收回平台公海（仅软上浮/限时收回模式的企业记录；平台公海该客户未领取时）
  router.post('/enterprise/pool/:id/recover', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM enterprise_public_pool WHERE id = ? AND enterprise_id = ?')
      .get(Number(req.params.id), req.enterpriseId);
    if (!row) return res.status(404).json({ error: '客户不存在' });
    if (row.status !== 'floated') return res.status(400).json({ error: '仅软上浮/限时收回的客户可收回' });
    const market = db.prepare('SELECT pool_float_mode FROM card_market_settings WHERE customer_id = ?').get(req.customerId);
    const mode = market?.pool_float_mode || 'soft';
    const up = db.prepare("SELECT * FROM tenant_public_pool WHERE customer_id = ? AND phone = ?").get(req.customerId, row.phone || '');
    if (up) {
      if (up.status !== 'available') return res.status(400).json({ error: '该客户已在平台公海被领取，无法收回' });
      if (mode === 'recover' && up.created_at) {
        const created = new Date(String(up.created_at).replace(' ', 'T') + 'Z').getTime();
        if (Number.isFinite(created) && Date.now() - created > 7 * 24 * 3600 * 1000) {
          return res.status(400).json({ error: '已超过可收回期限（7 天），无法收回' });
        }
      }
      db.prepare('DELETE FROM tenant_public_pool WHERE id = ?').run(up.id);
    }
    db.prepare("UPDATE enterprise_public_pool SET status = 'available', floated_at = NULL WHERE id = ?").run(row.id);
    auditCust(db, req, 'enterprise_pool_recover', 'enterprise', req.enterpriseId, `收回平台公海客户「${row.name || row.phone}」`);
    res.json({ ok: true });
  });

  // 企业公海列表
  router.get('/enterprise/pool', requireTenant, requireEnterpriseAdmin, (req, res) => {
    const eid = req.enterpriseId;
    const { status = 'available', keyword = '' } = req.query;
    // status=floated 表示「已上浮」视图：软上浮记录(floated) + 直接移交记录(recycled) 合并展示
    let where = 'WHERE pool.enterprise_id = ? AND pool.status = ?';
    const params = [eid, status];
    if (status === 'floated') {
      where = 'WHERE pool.enterprise_id = ? AND pool.status IN (?, ?)';
      params.splice(1, 1, 'floated', 'recycled');
    }
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
      claimerName: r.claimer_name || '', claimedAt: r.claimed_at, recycledAt: r.recycled_at, floatedAt: r.floated_at, createdAt: r.created_at,
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

  // ============================================================
  // 会员体系（租户级会员，1:1 复刻菜鸟云「用户」菜单）
  // ============================================================
  const member = createMemberService(db);

  // —— 数据统计 ——
  router.get('/member/summary', requireTenant, (req, res) => {
    res.json({ summary: member.summary(req.customerId) });
  });

  // —— 会员列表（用户管理） ——
  router.get('/member/users', requireTenant, (req, res) => {
    const f = req.query;
    if (f.export === 'csv') {
      const all = member.listUsers(req.customerId, { ...f, page: 1, pageSize: 1000 });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=member-users.csv');
      return res.send(member.buildUsersCsv(all.users));
    }
    res.json(member.listUsers(req.customerId, f));
  });

  // —— 会员详情（用户信息 + 标签 + 流水概要） ——
  router.get('/member/users/:id', requireTenant, (req, res) => {
    const u = db.prepare('SELECT * FROM platform_user WHERE id = ? AND customer_id = ?').get(Number(req.params.id), req.customerId);
    if (!u) return res.status(404).json({ error: '用户不存在' });
    const mu = member.getMemberUser(req.customerId, u.id);
    const level = mu && mu.level_id ? member.getLevel(req.customerId, mu.level_id) : null;
    const labels = member.userLabels(req.customerId, u.id);
    const cardCount = db.prepare('SELECT COUNT(*) AS n FROM card_profile WHERE user_id = ?').get(u.id).n;
    const orderCount = db.prepare('SELECT COUNT(*) AS n FROM payment_orders WHERE customer_id = ? AND user_id = ?').get(req.customerId, u.id).n;
    res.json({ user: { ...u, labels, member: mu, level, cardCount, orderCount } });
  });

  // —— 用户标签管理 ——
  router.get('/member/labels', requireTenant, (req, res) => res.json({ labels: member.listLabels(req.customerId) }));
  router.post('/member/labels', requireTenant, (req, res) => {
    const r = member.addLabel(req.customerId, req.body.name);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  });
  router.delete('/member/labels/:id', requireTenant, (req, res) => res.json(member.deleteLabel(req.customerId, Number(req.params.id))));
  router.put('/member/labels/:id', requireTenant, (req, res) => {
    const r = member.renameLabel(req.customerId, Number(req.params.id), req.body.name);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  });
  router.put('/member/users/:id/labels', requireTenant, (req, res) => {
    res.json({ labels: member.setUserLabels(req.customerId, Number(req.params.id), req.body.labelIds || []) });
  });

  // —— 会员等级 ——
  router.get('/member/levels', requireTenant, (req, res) => res.json({ levels: member.listLevels(req.customerId) }));
  router.post('/member/levels', requireTenant, requireTenantAdmin, (req, res) => {
    const r = member.addLevel(req.customerId, req.body);
    if (!r) return res.status(400).json({ error: '等级创建失败' });
    res.json({ level: r });
  });
  router.put('/member/levels/:id', requireTenant, requireTenantAdmin, (req, res) => {
    const r = member.updateLevel(req.customerId, Number(req.params.id), req.body);
    if (!r) return res.status(404).json({ error: '等级不存在' });
    res.json({ level: r });
  });
  router.delete('/member/levels/:id', requireTenant, requireTenantAdmin, (req, res) => {
    const r = member.deleteLevel(req.customerId, Number(req.params.id));
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  });

  // —— 会员等级 × 应用 权益矩阵（P1g：目录默认 ⊕ 租户覆盖，替代旧 benefits JSON 4 字段）——
  router.get('/member/benefits/catalog', requireTenant, (req, res) => {
    res.json(member.benefitsCatalog());
  });
  router.get('/member/levels/:id/benefits', requireTenant, (req, res) => {
    const lv = member.getLevel(req.customerId, Number(req.params.id));
    if (!lv) return res.status(404).json({ error: '等级不存在' });
    res.json({ benefits: member.getLevelBenefits(req.customerId, Number(req.params.id)) });
  });
  router.put('/member/levels/:id/benefits', requireTenant, requireTenantAdmin, (req, res) => {
    const r = member.saveLevelBenefits(req.customerId, Number(req.params.id), req.body.appCode, req.body.benefits);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  });

  // —— 会员设置 ——
  router.get('/member/settings', requireTenant, (req, res) => res.json({ settings: member.getSettings(req.customerId) }));
  router.put('/member/settings', requireTenant, requireTenantAdmin, (req, res) => {
    res.json({ settings: member.saveSettings(req.customerId, req.body) });
  });

  // —— 申请记录 ——
  router.get('/member/applies', requireTenant, (req, res) => res.json(member.listApplies(req.customerId, req.query)));
  router.post('/member/applies/:id/review', requireTenant, requireTenantAdmin, (req, res) => {
    const r = member.reviewApply(req.customerId, Number(req.params.id), req.body.action, req.body.reason);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  });

  // —— 开卡记录 ——
  router.get('/member/cards', requireTenant, (req, res) => res.json(member.listCards(req.customerId, req.query)));

  // —— 消费流水 / 积分流水 ——
  router.get('/member/logs', requireTenant, (req, res) => {
    const f = req.query;
    if (f.export === 'csv') {
      const all = member.listLogs(req.customerId, { ...f, page: 1, pageSize: 1000 });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=member-logs.csv');
      return res.send(member.buildLogsCsv(all.logs));
    }
    res.json(member.listLogs(req.customerId, f));
  });
  router.get('/member/score-logs', requireTenant, (req, res) => {
    const f = req.query;
    if (f.export === 'csv') {
      const all = member.listScoreLogs(req.customerId, { ...f, page: 1, pageSize: 1000 });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=member-score-logs.csv');
      return res.send(member.buildScoreLogsCsv(all.logs));
    }
    res.json(member.listScoreLogs(req.customerId, f));
  });

  // ============================================================
  // 统一账号体系：成员管理（accounts + tenant_members + roles）
  // ============================================================

  // —— 权限点树（分配权限弹窗用：按应用分组的一/二级菜单）——
  // 分组依据 = app_menus.app_id → apps.id（app_menus.module 是中文分组名，禁止用 module 匹配 app code；
  // 曾用 `m.module === a.code || a.code==='panorama'` 导致全部菜单落入 panorama 分组，已修复）
  router.get('/roles/permission-tree', requireTenant, requireTenantAdmin, (req, res) => {
    const apps = db
      .prepare(
        `SELECT a.id, a.code, a.name FROM apps a ORDER BY a.sort_order, a.id`
      )
      .all();
    const menus = db
      .prepare(
        `SELECT m.app_id, m.module, m.key, m.label FROM app_menus m ORDER BY m.sort_order, m.id`
      )
      .all();
    const tree = apps
      .map((a) => ({
        code: a.code,
        name: a.name,
        menus: menus
          .filter((m) => m.app_id === a.id)
          .map((m) => ({ key: m.key, label: m.label, module: m.module })),
      }))
      .filter((a) => a.menus.length > 0);
    res.json({ tree });
  });

  // —— 角色列表（内置 + 租户自定义，含权限点回显）——
  router.get('/roles', requireTenant, requireTenantAdmin, (req, res) => {
    const roles = db
      .prepare(
        `SELECT r.*, (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS perm_count,
                (SELECT COUNT(*) FROM member_roles mr WHERE mr.role_id = r.id) AS member_count
         FROM roles r WHERE r.tenant_id = 0 OR r.tenant_id = ?
         ORDER BY r.tenant_id, r.id`
      )
      .all(req.customerId);
    const withPerms = roles.map((r) => ({
      ...r,
      perms: db.prepare('SELECT app_code, menu_key FROM role_permissions WHERE role_id = ?').all(r.id),
    }));
    res.json({ roles: withPerms });
  });

  // —— 新建角色（内置禁建；租户自定义 scope=tenant|store）——
  router.post('/roles', requireTenant, requireTenantAdmin, (req, res) => {
    const { name, scope } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: '请输入角色名称' });
    const s = scope === 'store' ? 'store' : 'tenant';
    const r = db
      .prepare('INSERT INTO roles (tenant_id, code, name, scope, builtin) VALUES (?, ?, ?, ?, 0)')
      .run(req.customerId, 'tmp', String(name).trim(), s);
    db.prepare("UPDATE roles SET code = 'custom' || id WHERE id = ?").run(r.lastInsertRowid);
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(r.lastInsertRowid);
    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'role_create', targetType: 'role', targetId: role.id, detail: `新建角色: ${role.name}`, ip: req.ip });
    res.json({ role });
  });

  // —— 编辑角色（内置只允许改名称）——
  router.put('/roles/:id', requireTenant, requireTenantAdmin, (req, res) => {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!role || (role.tenant_id !== 0 && role.tenant_id !== req.customerId)) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const { name, scope } = req.body || {};
    if (name && String(name).trim()) {
      db.prepare("UPDATE roles SET name = ?, updated_at = datetime('now') WHERE id = ?").run(String(name).trim(), role.id);
    }
    if (scope && (scope === 'tenant' || scope === 'store') && role.builtin === 0) {
      db.prepare("UPDATE roles SET scope = ?, updated_at = datetime('now') WHERE id = ?").run(scope, role.id);
    }
    res.json({ ok: true });
  });

  // —— 删除角色（内置禁删）——
  router.delete('/roles/:id', requireTenant, requireTenantAdmin, (req, res) => {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!role || (role.tenant_id !== 0 && role.tenant_id !== req.customerId)) {
      return res.status(404).json({ error: '角色不存在' });
    }
    if (role.builtin === 1) return res.status(403).json({ error: '内置角色不可删除' });
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(role.id);
    db.prepare('DELETE FROM member_roles WHERE role_id = ?').run(role.id);
    db.prepare('DELETE FROM roles WHERE id = ?').run(role.id);
    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'role_delete', targetType: 'role', targetId: role.id, detail: `删除角色: ${role.name}`, ip: req.ip });
    res.json({ ok: true });
  });

  // —— 分配角色权限点（整体覆盖，perms: [{app, key}]）——
  router.put('/roles/:id/permissions', requireTenant, requireTenantAdmin, (req, res) => {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!role || (role.tenant_id !== 0 && role.tenant_id !== req.customerId)) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const { perms } = req.body || {};
    const list = Array.isArray(perms) ? perms : [];
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(role.id);
    const ins = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, app_code, menu_key) VALUES (?, ?, ?)');
    for (const p of list) {
      if (p && p.app && p.key) ins.run(role.id, p.app, p.key);
    }
    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'role_perm', targetType: 'role', targetId: role.id, detail: `分配权限 ${list.length} 项`, ip: req.ip });
    res.json({ ok: true });
  });

  // —— 成员列表（含角色标签 / 门店负责人标记 / 账号信息）——
  router.get('/members', requireTenant, requireMemberManage, (req, res) => {
    const members = db
      .prepare(
        `SELECT tm.id, tm.tenant_id, tm.account_id, tm.name, tm.nickname, tm.avatar, tm.status, tm.identities, tm.created_at,
                a.username, a.phone, a.need_reset,
                s.name AS store_name, s.id AS store_id
         FROM tenant_members tm
         JOIN accounts a ON a.id = tm.account_id
         LEFT JOIN store s ON s.owner_member_id = tm.id
         WHERE tm.tenant_id = ?
         ORDER BY tm.id DESC`
      )
      .all(req.customerId);
    const withRoles = members.map((m) => ({
      ...m,
      roles: resolveMemberRoles(db, m.id),
      isTenantAdmin: memberIsTenantAdmin(db, m.id),
    }));
    res.json({ members: withRoles });
  });

  // —— 当前登录成员信息（角色/权限点/门店）——
  router.get('/members/me', requireTenant, (req, res) => {
    if (!req.user.memberId) {
      return res.json({ member: null, roles: [], perms: [], storeIds: [], isTenantAdmin: false });
    }
    const member = db
      .prepare('SELECT * FROM tenant_members WHERE id = ? AND tenant_id = ?')
      .get(req.user.memberId, req.customerId);
    if (!member) return res.json({ member: null, roles: [], perms: [], storeIds: [], isTenantAdmin: false });
    const roles = resolveMemberRoles(db, member.id);
    const isTenantAdmin = roles.some((r) => r.code === 'tenant_admin');
    let perms = [];
    if (!isTenantAdmin) {
      perms = db
        .prepare(
          `SELECT rp.app_code, rp.menu_key FROM role_permissions rp
           WHERE rp.role_id IN (SELECT role_id FROM member_roles WHERE member_id = ?)`
        )
        .all(member.id);
    }
    const stores = db
      .prepare('SELECT id, name FROM store WHERE owner_member_id = ?')
      .all(member.id);
    res.json({ member, roles, perms, storeIds: stores.map((s) => s.id), isTenantAdmin });
  });

  // —— 添加成员（账号不存在则自动创建）——
  router.post('/members', requireTenant, requireMemberManage, (req, res) => {
    const { name, phone, username, password, identities, roleIds } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: '请输入成员姓名' });
    const loginName = String(username || phone || '').trim();
    if (!loginName) return res.status(400).json({ error: '请填写登录账号或手机号' });
    // 账号存在性（accounts 与 users 双查，避免撞名）
    let account = db.prepare('SELECT * FROM accounts WHERE username = ? OR phone = ?').get(loginName, loginName);
    if (!account) {
      if (!password || String(password).length < 6) return res.status(400).json({ error: '新账号需设置至少 6 位密码' });
      const { hash, salt } = hashPassword(String(password));
      const r = db
        .prepare('INSERT INTO accounts (username, phone, password_hash, password_salt, status) VALUES (?, ?, ?, ?, ?)')
        .run(loginName, /^1\d{10}$/.test(loginName) ? loginName : null, hash, salt, 'active');
      account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(r.lastInsertRowid);
    } else if (db.prepare('SELECT 1 FROM tenant_members WHERE tenant_id = ? AND account_id = ?').get(req.customerId, account.id)) {
      return res.status(409).json({ error: '该账号已在本租户存在成员身份' });
    }
    const r = db
      .prepare('INSERT INTO tenant_members (tenant_id, account_id, name, nickname, status, identities) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.customerId, account.id, String(name).trim(), String(name).trim(), 'active', JSON.stringify(Array.isArray(identities) ? identities : ['backend_admin']));
    const member = db.prepare('SELECT * FROM tenant_members WHERE id = ?').get(r.lastInsertRowid);
    const insMr = db.prepare('INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?, ?)');
    for (const rid of Array.isArray(roleIds) ? roleIds : []) insMr.run(member.id, rid);
    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'member_create', targetType: 'member', targetId: member.id, detail: `添加成员: ${member.name}`, ip: req.ip });
    res.json({ member });
  });

  // —— 编辑成员（姓名/手机/身份/状态；手机号同步 accounts）——
  router.put('/members/:id', requireTenant, requireMemberManage, (req, res) => {
    const member = db
      .prepare('SELECT * FROM tenant_members WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.customerId);
    if (!member) return res.status(404).json({ error: '成员不存在' });
    const { name, phone, identities, status } = req.body || {};
    if (name && String(name).trim()) {
      db.prepare("UPDATE tenant_members SET name = ?, nickname = ?, updated_at = datetime('now') WHERE id = ?").run(String(name).trim(), String(name).trim(), member.id);
    }
    if (Array.isArray(identities)) {
      db.prepare("UPDATE tenant_members SET identities = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(identities), member.id);
    }
    if (status === 'active' || status === 'disabled') {
      db.prepare("UPDATE tenant_members SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, member.id);
      db.prepare('UPDATE accounts SET status = ? WHERE id = ?').run(status, member.account_id);
    }
    if (phone && /^1\d{10}$/.test(String(phone))) {
      const clash = db.prepare('SELECT id FROM accounts WHERE phone = ? AND id != ?').get(String(phone), member.account_id);
      if (clash) return res.status(409).json({ error: '该手机号已被其他账号使用' });
      db.prepare("UPDATE accounts SET phone = ?, username = CASE WHEN username IS NULL THEN ? ELSE username END, updated_at = datetime('now') WHERE id = ?").run(String(phone), String(phone), member.account_id);
    }
    res.json({ ok: true });
  });

  // —— 分配成员角色（整体覆盖）——
  router.put('/members/:id/roles', requireTenant, requireMemberManage, (req, res) => {
    const member = db
      .prepare('SELECT * FROM tenant_members WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.customerId);
    if (!member) return res.status(404).json({ error: '成员不存在' });
    const { roleIds } = req.body || {};
    const ids = Array.isArray(roleIds) ? roleIds : [];
    // 最后管理员保护：目标成员是租户管理员且操作后该租户将无管理员 → 拒绝
    const isAdminNow = db
      .prepare(
        `SELECT 1 FROM member_roles mr JOIN roles r ON r.id = mr.role_id
         WHERE mr.member_id = ? AND r.code = 'tenant_admin' LIMIT 1`
      )
      .get(member.id);
    if (isAdminNow) {
      const adminRole = db.prepare("SELECT id FROM roles WHERE code = 'tenant_admin' AND tenant_id = 0").get();
      const stillAdmin = ids.includes(adminRole.id);
      if (!stillAdmin && countTenantAdmins(req.customerId) <= 1) {
        return res.status(400).json({ error: '至少保留一名租户管理员' });
      }
    }
    db.prepare('DELETE FROM member_roles WHERE member_id = ?').run(member.id);
    const ins = db.prepare('INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?, ?)');
    for (const rid of ids) ins.run(member.id, rid);
    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'member_role', targetType: 'member', targetId: member.id, detail: `分配角色 ${ids.length} 个`, ip: req.ip });
    res.json({ ok: true });
  });

  // —— 重置成员密码（写入 accounts）——
  router.put('/members/:id/reset-password', requireTenant, requireMemberManage, (req, res) => {
    const member = db
      .prepare('SELECT * FROM tenant_members WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.customerId);
    if (!member) return res.status(404).json({ error: '成员不存在' });
    const { password } = req.body || {};
    if (!password || String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    const { hash, salt } = hashPassword(String(password));
    db.prepare("UPDATE accounts SET password_hash = ?, password_salt = ?, need_reset = 0, updated_at = datetime('now') WHERE id = ?").run(hash, salt, member.account_id);
    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'member_reset_pwd', targetType: 'member', targetId: member.id, detail: `重置成员密码: ${member.name}`, ip: req.ip });
    res.json({ ok: true });
  });

  // —— 移除成员（解绑租户身份；账号保留；门店负责人同时解除关联）——
  router.delete('/members/:id', requireTenant, requireMemberManage, (req, res) => {
    if (Number(req.params.id) === req.user.memberId) return res.status(400).json({ error: '不能删除自己' });
    const member = db
      .prepare('SELECT * FROM tenant_members WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.customerId);
    if (!member) return res.status(404).json({ error: '成员不存在' });
    if (memberIsTenantAdmin(db, member.id)) {
      const cnt = db
        .prepare(
          `SELECT COUNT(*) c FROM member_roles mr JOIN roles r ON r.id = mr.role_id
           WHERE r.code = 'tenant_admin' AND mr.member_id IN
           (SELECT id FROM tenant_members WHERE tenant_id = ?)`
        )
        .get(req.customerId);
      if (cnt.c <= 1) return res.status(403).json({ error: '至少保留一名租户管理员' });
    }
    db.prepare("UPDATE store SET owner_member_id = NULL WHERE owner_member_id = ?").run(member.id);
    db.prepare('DELETE FROM member_roles WHERE member_id = ?').run(member.id);
    db.prepare('DELETE FROM tenant_members WHERE id = ?').run(member.id);
    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'member_delete', targetType: 'member', targetId: member.id, detail: `移除成员: ${member.name}`, ip: req.ip });
    res.json({ ok: true });
  });

  // ================= 微信公众号（手动对接 / 开放平台授权 / 自定义菜单） =================
  const wxComponent = new WxComponentService(db);
  const wxMp = new WxMpService(db, wxComponent);

  // 接入状态：是否绑定、绑定方式、账号类型、菜单/素材/粉丝/群发/统计等能力门控
  // 纯函数：公众号接入状态。空记录（appid/app_secret/account_type 全空）视为未接入，
  // 避免「记录存在即 bound:true」导致绑定入口被永久隐藏、又同时灰掉服务号功能。
  // 具体实现见模块顶层 computeMpBindState（函数内不允许 export）。
  router.get('/mp/status', requireTenant, (req, res) => {
    const ch = wxMp.getChannel(req.customerId);
    if (!ch) return res.json({ bound: false, canMenu: false, canReply: false, canMaterial: false, canFans: false, canMass: false, canStats: false, accountType: '' });
    const accountType = ch.account_type || '';
    const { bound, bindMode } = computeMpBindState(ch);
    const isService = accountType === 'service';
    // 自动回复：订阅号+服务号都支持（被动回复 5s 同步应答）；其余四块强依赖认证服务号
    const canMenu = isService;
    const saved = db.prepare('SELECT menu_json, synced_at FROM mp_menu WHERE channel_apps_id = ?').get(ch.id);
    res.json({
      bound,
      bindMode,
      appid: ch.appid,
      accountType,
      authStatus: ch.auth_status,
      canMenu,
      canReply: true,
      canMaterial: isService,
      canFans: isService,
      canMass: isService,
      canStats: isService,
      menuSaved: !!saved,
      syncedAt: saved?.synced_at || null,
    });
  });

  // 手动绑定（AppID + AppSecret）：校验凭据后探测账号类型并落库（加密存储 AppSecret）
  router.post('/mp/bind', requireTenant, requireTenantAdmin, async (req, res) => {
    try {
      const { appid, appSecret, accountType } = req.body || {};
      if (!appid || !appSecret) return res.status(400).json({ error: '请填写 AppID 与 AppSecret' });
      const encrypted = encryptSecret(appSecret);
      // 用临时对象校验凭据 + 探测账号类型（不落库）
      const temp = { id: null, appid, app_secret: encrypted, auth_status: 'none' };
      await wxMp.resolveToken(temp); // 凭据错误在此抛出（400）
      let detected = accountType === 'subscription' ? 'subscription' : 'service';
      try { detected = await wxMp.detectAccountType(temp); } catch (e) { /* 探测失败保留声明值 */ }

      const existing = db.prepare("SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = 'mp'").get(req.customerId);
      if (existing) {
        db.prepare(`UPDATE channel_apps SET appid = ?, app_secret = ?, auth_status = 'none',
          authorizer_access_token = '', authorizer_refresh_token = '', token_expires_at = NULL,
          account_type = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(appid, encrypted, detected, existing.id);
      } else {
        db.prepare(`INSERT INTO channel_apps (customer_id, channel_type, appid, app_secret, auth_status, account_type)
          VALUES (?, 'mp', ?, ?, 'none', ?)`)
          .run(req.customerId, appid, encrypted, detected);
      }
      auditCust(db, req, 'mp_bind', 'channel', req.customerId, `手动绑定公众号(${detected})`);
      res.json({ success: true, accountType: detected });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // 解绑：清除凭据与授权态（保留 row，便于重新授权幂等），并清掉本地菜单草稿
  router.post('/mp/unbind', requireTenant, requireTenantAdmin, (req, res) => {
    const ch = wxMp.getChannel(req.customerId);
    if (!ch) return res.json({ success: true });
    db.prepare('DELETE FROM mp_menu WHERE channel_apps_id = ?').run(ch.id);
    db.prepare(`UPDATE channel_apps SET appid = '', app_secret = '', auth_status = 'none',
      authorizer_access_token = '', authorizer_refresh_token = '', token_expires_at = NULL,
      account_type = '', updated_at = datetime('now') WHERE id = ?`)
      .run(ch.id);
    auditCust(db, req, 'mp_unbind', 'channel', req.customerId, '解绑公众号');
    res.json({ success: true });
  });

  // 开放平台授权链接（auth_type=1 仅公众号）
  router.get('/mp/auth-url', requireTenant, requireTenantAdmin, async (req, res) => {
    try {
      const callbackUrl = `${req.protocol}://${req.get('host')}/api/channel/auth-callback?customer_id=${req.customerId}`;
      const authUrl = await wxComponent.getAuthUrl(callbackUrl, 1);
      res.json({ authUrl });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // 读取菜单：本地草稿 + 线上菜单（仅服务号拉取线上）
  router.get('/mp/menu', requireTenant, async (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      const accountType = ch.account_type || '';
      const canMenu = accountType === 'service';
      const saved = db.prepare('SELECT menu_json, synced_at FROM mp_menu WHERE channel_apps_id = ?').get(ch.id);
      let live = null;
      if (canMenu) {
        try { live = await wxMp.getMenu(ch); } catch (e) { live = { error: e.message }; }
      }
      res.json({
        canMenu,
        accountType,
        saved: saved ? JSON.parse(saved.menu_json) : null,
        syncedAt: saved?.synced_at || null,
        live,
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // 保存菜单草稿（仅落库，不发布）
  router.post('/mp/menu/save', requireTenant, requireTenantAdmin, (req, res) => {
    const ch = wxMp.getChannel(req.customerId);
    if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
    const menu = req.body?.menu;
    if (!menu || !Array.isArray(menu.button)) return res.status(400).json({ error: '菜单格式不正确（需含 button 数组）' });
    const json = JSON.stringify(menu);
    const existing = db.prepare('SELECT id FROM mp_menu WHERE channel_apps_id = ?').get(ch.id);
    if (existing) {
      db.prepare('UPDATE mp_menu SET menu_json = ?, updated_at = datetime(\'now\') WHERE channel_apps_id = ?').run(json, ch.id);
    } else {
      db.prepare('INSERT INTO mp_menu (channel_apps_id, customer_id, menu_json) VALUES (?, ?, ?)').run(ch.id, req.customerId, json);
    }
    res.json({ success: true });
  });

  // 发布菜单到微信（仅认证服务号）
  router.post('/mp/menu/push', requireTenant, requireTenantAdmin, async (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      if ((ch.account_type || '') !== 'service') return res.status(400).json({ error: '仅认证服务号支持发布自定义菜单' });
      const saved = db.prepare('SELECT menu_json FROM mp_menu WHERE channel_apps_id = ?').get(ch.id);
      if (!saved) return res.status(400).json({ error: '请先保存菜单草稿' });
      const menu = JSON.parse(saved.menu_json);
      await wxMp.createMenu(ch, menu);
      const syncedAt = new Date().toISOString();
      db.prepare('UPDATE mp_menu SET synced_at = ?, updated_at = datetime(\'now\') WHERE channel_apps_id = ?').run(syncedAt, ch.id);
      res.json({ success: true, syncedAt });
    } catch (e) {
      res.status(400).json({ error: e.message, wxErrcode: e.wxErrcode });
    }
  });

  // ================= 公众号消息服务器配置 + 自动回复/关键字规则 =================

  // 消息服务器配置（Token / EncodingAESKey / 启用状态）+ 回调 URL
  router.get('/mp/message-config', requireTenant, (req, res) => {
    const ch = wxMp.getChannel(req.customerId);
    if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
    const cfg = wxMp.getMessageConfig(ch.id);
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/channel/wx-message/${ch.appid}`;
    res.json({
      config: cfg
        ? { msgToken: cfg.msg_token, encodingAESKey: cfg.encoding_aes_key, urlEnabled: !!cfg.url_enabled }
        : { msgToken: '', encodingAESKey: '', urlEnabled: false },
      callbackUrl,
    });
  });

  router.post('/mp/message-config', requireTenant, requireTenantAdmin, (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      const { msgToken, encodingAESKey, urlEnabled } = req.body || {};
      if (!msgToken) return res.status(400).json({ error: '请填写 Token' });
      wxMp.saveMessageConfig({ channelAppsId: ch.id, customerId: req.customerId, msgToken, encodingAESKey: encodingAESKey || '', urlEnabled: !!urlEnabled });
      const callbackUrl = `${req.protocol}://${req.get('host')}/api/channel/wx-message/${ch.appid}`;
      auditCust(db, req, 'mp_message_config', 'channel', req.customerId, '保存消息服务器配置');
      res.json({ success: true, callbackUrl });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // 自动回复/关键字规则列表
  router.get('/mp/reply-rules', requireTenant, (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      const rules = wxMp.listReplyRules(req.customerId).map((r) => ({
        id: r.id,
        matchType: r.match_type,
        keyword: r.keyword,
        replyType: r.reply_type,
        content: r.content,
        mediaJson: r.media_json,
        priority: r.priority,
        enabled: !!r.enabled,
      }));
      res.json({ rules });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/mp/reply-rules', requireTenant, requireTenantAdmin, (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      const { matchType, keyword, replyType, content, mediaJson, priority, enabled } = req.body || {};
      if (!matchType) return res.status(400).json({ error: '请选择匹配类型' });
      if ((matchType === 'exact' || matchType === 'fuzzy') && !keyword) return res.status(400).json({ error: '关键字匹配类型必须填写关键字' });
      const id = wxMp.createReplyRule({
        customerId: req.customerId,
        channelAppsId: ch.id,
        matchType,
        keyword: keyword || '',
        replyType: replyType || 'text',
        content: content || '',
        mediaJson: mediaJson || '[]',
        priority: priority || 0,
        enabled: enabled !== false ? 1 : 0,
      });
      auditCust(db, req, 'mp_reply_rule_create', 'channel', req.customerId, '新增自动回复规则');
      res.json({ success: true, id });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.put('/mp/reply-rules/:id', requireTenant, requireTenantAdmin, (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      const id = Number(req.params.id);
      if (!wxMp.getReplyRule(id, req.customerId)) return res.status(404).json({ error: '规则不存在' });
      wxMp.updateReplyRule(id, req.customerId, req.body || {});
      auditCust(db, req, 'mp_reply_rule_update', 'channel', req.customerId, '更新自动回复规则');
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.delete('/mp/reply-rules/:id', requireTenant, requireTenantAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!wxMp.getReplyRule(id, req.customerId)) return res.status(404).json({ error: '规则不存在' });
      wxMp.deleteReplyRule(id, req.customerId);
      auditCust(db, req, 'mp_reply_rule_delete', 'channel', req.customerId, '删除自动回复规则');
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ================= 素材管理（认证服务号） =================

  // 本地镜像列表
  router.get('/mp/material', requireTenant, async (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      if ((ch.account_type || '') !== 'service') return res.status(400).json({ error: '仅认证服务号支持素材管理', code: 'NEED_SERVICE' });
      const type = req.query.type || 'image';
      const rows = db.prepare(`SELECT id, media_id, media_type, title, url, wx_created_at, created_at FROM mp_material WHERE channel_apps_id = ? AND media_type = ? ORDER BY wx_created_at DESC, id DESC`).all(ch.id, type);
      res.json({ items: rows });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // 从微信批量拉取并落库
  router.get('/mp/material/sync', requireTenant, requireTenantAdmin, async (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      if ((ch.account_type || '') !== 'service') return res.status(400).json({ error: '仅认证服务号支持素材管理', code: 'NEED_SERVICE' });
      const type = req.query.type || 'image';
      const result = await wxMp.syncMaterials(ch, req.customerId, type, Number(req.query.limit) || 50);
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(400).json({ error: e.message, wxErrcode: e.wxErrcode });
    }
  });

  // 上传图片素材（multipart）
  router.post('/mp/material/upload-image', requireTenant, requireTenantAdmin, upload.single('file'), async (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      if ((ch.account_type || '') !== 'service') return res.status(400).json({ error: '仅认证服务号支持素材管理', code: 'NEED_SERVICE' });
      if (!req.file) return res.status(400).json({ error: '请选择图片文件' });
      const data = await wxMp.addMaterialImage(ch, req.file.buffer, req.file.originalname);
      wxMp.upsertMaterial(ch.id, req.customerId, {
        mediaId: data.media_id,
        type: 'image',
        url: data.url || '',
        title: req.file.originalname || '',
        newsJson: '[]',
        wxCreated: Math.floor(Date.now() / 1000),
      });
      res.json({ success: true, mediaId: data.media_id, url: data.url || '' });
    } catch (e) {
      res.status(400).json({ error: e.message, wxErrcode: e.wxErrcode });
    }
  });

  // 新增图文素材
  router.post('/mp/material/news', requireTenant, requireTenantAdmin, async (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      if ((ch.account_type || '') !== 'service') return res.status(400).json({ error: '仅认证服务号支持素材管理', code: 'NEED_SERVICE' });
      const articles = req.body?.articles;
      if (!Array.isArray(articles) || !articles.length) return res.status(400).json({ error: '请提交图文内容' });
      const data = await wxMp.addNews(ch, articles);
      wxMp.upsertMaterial(ch.id, req.customerId, {
        mediaId: data.media_id,
        type: 'news',
        title: articles[0]?.title || '',
        url: '',
        newsJson: JSON.stringify(articles),
        wxCreated: Math.floor(Date.now() / 1000),
      });
      res.json({ success: true, mediaId: data.media_id });
    } catch (e) {
      res.status(400).json({ error: e.message, wxErrcode: e.wxErrcode });
    }
  });

  // ================= 粉丝管理（认证服务号） =================

  router.get('/mp/fans', requireTenant, async (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      if ((ch.account_type || '') !== 'service') return res.status(400).json({ error: '仅认证服务号支持粉丝管理', code: 'NEED_SERVICE' });
      const page = Math.max(1, Number(req.query.page) || 1);
      const size = Math.min(200, Math.max(1, Number(req.query.size) || 20));
      const rows = db.prepare(`SELECT id, openid, nickname, sex, city, province, country, headimgurl, subscribe, subscribe_time, remark, groupid, synced_at FROM mp_fans WHERE channel_apps_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`).all(ch.id, size, (page - 1) * size);
      const total = db.prepare('SELECT COUNT(*) AS c FROM mp_fans WHERE channel_apps_id = ?').get(ch.id).c;
      res.json({ items: rows, total, page, size });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get('/mp/fans/sync', requireTenant, requireTenantAdmin, async (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      if ((ch.account_type || '') !== 'service') return res.status(400).json({ error: '仅认证服务号支持粉丝管理', code: 'NEED_SERVICE' });
      const result = await wxMp.syncFans(ch, req.customerId);
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(400).json({ error: e.message, wxErrcode: e.wxErrcode });
    }
  });

  // ================= 图文群发 / 预览（认证服务号） =================

  router.post('/mp/mass/send', requireTenant, requireTenantAdmin, async (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      if ((ch.account_type || '') !== 'service') return res.status(400).json({ error: '仅认证服务号支持群发', code: 'NEED_SERVICE' });
      const { articleMediaId, sendType, openids, tagId } = req.body || {};
      if (!articleMediaId) return res.status(400).json({ error: '请选择图文素材' });
      let wx;
      if (sendType === 'openids') {
        if (!Array.isArray(openids) || !openids.length) return res.status(400).json({ error: '请选择接收粉丝' });
        wx = await wxMp.massSendOpenids(ch, openids, articleMediaId);
      } else {
        wx = await wxMp.massSendAll(ch, articleMediaId, { tagId: sendType === 'tag' ? tagId : undefined });
      }
      const info = db.prepare(`INSERT INTO mp_mass_task (channel_apps_id, customer_id, task_type, send_type, target_json, article_json, status, wx_msg_id, wx_errcode, wx_errmsg, sent_at)
        VALUES (?, ?, 'mass', ?, ?, ?, 'sent', ?, ?, '', ?)`)
        .run(ch.id, req.customerId, sendType || 'group', JSON.stringify({ openids: openids || [], tagId: tagId || null }), JSON.stringify({ media_id: articleMediaId }), wx.msg_id || '', wx.errcode || 0, new Date().toISOString());
      auditCust(db, req, 'mp_mass_send', 'channel', req.customerId, '群发图文');
      res.json({ success: true, wxMsgId: wx.msg_id, taskId: Number(info.lastInsertRowid) });
    } catch (e) {
      res.status(400).json({ error: e.message, wxErrcode: e.wxErrcode });
    }
  });

  router.post('/mp/mass/preview', requireTenant, requireTenantAdmin, async (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      if ((ch.account_type || '') !== 'service') return res.status(400).json({ error: '仅认证服务号支持群发', code: 'NEED_SERVICE' });
      const { articleMediaId, openid } = req.body || {};
      if (!articleMediaId || !openid) return res.status(400).json({ error: '请选择图文素材和预览微信号' });
      const wx = await wxMp.massPreview(ch, openid, articleMediaId);
      const info = db.prepare(`INSERT INTO mp_mass_task (channel_apps_id, customer_id, task_type, send_type, target_json, article_json, status, wx_msg_id, wx_errcode, wx_errmsg, sent_at)
        VALUES (?, ?, 'preview', 'openids', ?, ?, 'sent', ?, ?, '', ?)`)
        .run(ch.id, req.customerId, JSON.stringify({ openid }), JSON.stringify({ media_id: articleMediaId }), wx.msg_id || '', wx.errcode || 0, new Date().toISOString());
      res.json({ success: true, wxMsgId: wx.msg_id, taskId: Number(info.lastInsertRowid) });
    } catch (e) {
      res.status(400).json({ error: e.message, wxErrcode: e.wxErrcode });
    }
  });

  router.get('/mp/mass/tasks', requireTenant, async (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      if ((ch.account_type || '') !== 'service') return res.status(400).json({ error: '仅认证服务号支持群发', code: 'NEED_SERVICE' });
      const rows = db.prepare(`SELECT id, task_type, send_type, status, wx_msg_id, wx_errcode, wx_errmsg, target_json, article_json, sent_at, created_at FROM mp_mass_task WHERE channel_apps_id = ? ORDER BY id DESC LIMIT 50`).all(ch.id);
      res.json({ items: rows });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ================= 基础数据统计（认证服务号 + 接口分析权限） =================

  router.get('/mp/stats/users', requireTenant, async (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      if ((ch.account_type || '') !== 'service') return res.status(400).json({ error: '仅认证服务号支持数据统计', code: 'NEED_SERVICE' });
      const begin = req.query.begin || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const end = req.query.end || new Date().toISOString().slice(0, 10);
      const [summary, cumulate] = await Promise.all([
        wxMp.getUserSummary(ch, begin, end),
        wxMp.getUserCumulate(ch, begin, end),
      ]);
      res.json({ summary: summary.list || [], cumulate: cumulate.list || [] });
    } catch (e) {
      res.status(400).json({ error: e.message, wxErrcode: e.wxErrcode });
    }
  });

  router.get('/mp/stats/articles', requireTenant, async (req, res) => {
    try {
      const ch = wxMp.getChannel(req.customerId);
      if (!ch) return res.status(400).json({ error: '请先绑定公众号' });
      if ((ch.account_type || '') !== 'service') return res.status(400).json({ error: '仅认证服务号支持数据统计', code: 'NEED_SERVICE' });
      const begin = req.query.begin || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const end = req.query.end || new Date().toISOString().slice(0, 10);
      const data = await wxMp.getArticleSummary(ch, begin, end);
      res.json({ articles: data.list || [] });
    } catch (e) {
      res.status(400).json({ error: e.message, wxErrcode: e.wxErrcode });
    }
  });

  return router;
}
