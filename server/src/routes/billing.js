/**
 * 计费路由（第二批）
 * - 总后台：/api/admin/billing-plans（套餐CRUD）、/api/admin/invoices（开票审核）
 * - 客户后台：/api/customer/billing/*（当前套餐/用量/套餐列表/购买/发票）
 */
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { addOperationLog } from '../db.js';
import { checkTenantAccess } from '../tenant.js';
import { toBillingPlan, listBillingPlans, getTenantBillingPlan, getTenantUsage, applySubscription, createInvoice, queryInvoices, genInvoiceNo } from '../services/billing.js';
import { PaymentService } from '../services/payment.js';

function audit(db, req, action, targetType, targetId, detail) {
  addOperationLog(db, {
    userId: req.user?.uid ?? req.user?.id ?? null,
    username: req.user?.username ?? req.user?.phone ?? 'api-user',
    action, targetType, targetId,
    detail: `[租户#${req.customerId ?? '-'}] ${detail}`,
    ip: req.ip,
  });
}

export function createBillingRouter(db) {
  const router = Router();

  // ================= 总后台：套餐管理 =================
  router.get('/admin/billing-plans', requireAuth, (_req, res) => {
    res.json({ plans: listBillingPlans(db, { enabledOnly: false }) });
  });

  router.post('/admin/billing-plans', requireAuth, (req, res) => {
    const { code, name, description, price, cycle, quotas, features, enabled, sortOrder } = req.body || {};
    if (!code || !code.trim()) return res.status(400).json({ error: '套餐标识必填' });
    if (!name || !name.trim()) return res.status(400).json({ error: '套餐名称必填' });
    if (db.prepare('SELECT id FROM billing_plans WHERE code = ?').get(code.trim())) {
      return res.status(400).json({ error: '套餐标识已存在' });
    }
    const info = db.prepare(
      `INSERT INTO billing_plans (code, name, description, price, cycle, quotas, features, enabled, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      code.trim(), name.trim(), description || '', Number(price) || 0, cycle || 'year',
      JSON.stringify(quotas || {}), JSON.stringify(features || {}), enabled === false ? 0 : 1, Number(sortOrder) || 0
    );
    audit(db, req, 'create_billing_plan', 'billing_plan', info.lastInsertRowid, `新建计费套餐: ${name.trim()}（${code.trim()}）`);
    res.status(201).json({ plan: toBillingPlan(db.prepare('SELECT * FROM billing_plans WHERE id = ?').get(info.lastInsertRowid)) });
  });

  router.put('/admin/billing-plans/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const plan = db.prepare('SELECT * FROM billing_plans WHERE id = ?').get(id);
    if (!plan) return res.status(404).json({ error: '套餐不存在' });
    const { name, description, price, cycle, quotas, features, enabled, sortOrder } = req.body || {};
    db.prepare(
      `UPDATE billing_plans SET name = COALESCE(?, name), description = COALESCE(?, description), price = COALESCE(?, price),
       cycle = COALESCE(?, cycle), quotas = COALESCE(?, quotas), features = COALESCE(?, features),
       enabled = COALESCE(?, enabled), sort_order = COALESCE(?, sort_order), updated_at = datetime('now') WHERE id = ?`
    ).run(
      name ?? null, description ?? null, price === undefined ? null : Number(price),
      cycle ?? null, quotas ? JSON.stringify(quotas) : null, features ? JSON.stringify(features) : null,
      enabled === undefined ? null : (enabled ? 1 : 0), sortOrder === undefined ? null : Number(sortOrder), id
    );
    audit(db, req, 'update_billing_plan', 'billing_plan', id, `编辑计费套餐: ${name || plan.name}`);
    res.json({ plan: toBillingPlan(db.prepare('SELECT * FROM billing_plans WHERE id = ?').get(id)) });
  });

  router.delete('/admin/billing-plans/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const plan = db.prepare('SELECT * FROM billing_plans WHERE id = ?').get(id);
    if (!plan) return res.status(404).json({ error: '套餐不存在' });
    if (plan.code === 'free') return res.status(400).json({ error: '体验套餐为系统内置套餐，不可删除（可停用）' });
    const used = db.prepare('SELECT COUNT(*) AS n FROM projects WHERE billing_plan_id = ?').get(id).n;
    if (used > 0) return res.status(400).json({ error: `有 ${used} 个客户正在使用该套餐，请先切换后删除` });
    db.prepare('DELETE FROM billing_plans WHERE id = ?').run(id);
    audit(db, req, 'delete_billing_plan', 'billing_plan', id, `删除计费套餐: ${plan.name}`);
    res.json({ ok: true });
  });

  // ================= 总后台：发票管理 =================
  router.get('/admin/invoices', requireAuth, (req, res) => {
    const result = queryInvoices(db, {
      status: req.query.status || undefined,
      limit: Math.min(Math.max(Number(req.query.limit) || 50, 1), 200),
      offset: Math.max(Number(req.query.offset) || 0, 0),
    });
    res.json(result);
  });

  router.post('/admin/invoices/:id/issue', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!inv) return res.status(404).json({ error: '发票申请不存在' });
    if (inv.status !== 'pending') return res.status(400).json({ error: '该申请不在待开票状态' });
    db.prepare("UPDATE invoices SET status = 'issued', issued_at = datetime('now') WHERE id = ?").run(id);
    audit(db, req, 'issue_invoice', 'invoice', id, `开票：${inv.title} ¥${inv.amount}（${inv.invoice_no}）`);
    res.json({ ok: true });
  });

  router.post('/admin/invoices/:id/reject', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!inv) return res.status(404).json({ error: '发票申请不存在' });
    if (inv.status !== 'pending') return res.status(400).json({ error: '该申请不在待处理状态' });
    db.prepare("UPDATE invoices SET status = 'rejected', remark = COALESCE(?, remark) WHERE id = ?")
      .run(req.body?.reason || null, id);
    audit(db, req, 'reject_invoice', 'invoice', id, `驳回发票申请：${inv.invoice_no}（${req.body?.reason || '无理由'}）`);
    res.json({ ok: true });
  });

  return router;
}

/** 客户后台计费路由（挂在 /api/customer 下） */
export function createCustomerBillingRouter(db) {
  const router = Router();
  // 租户守卫（与 customer.js requireTenant 同语义，避免跨模块循环依赖）
  router.use((req, res, next) => {
    const user = req.user;
    if (!user || !['tenant_admin', 'tenant_member'].includes(user.role)) {
      return res.status(403).json({ error: '无权访问客户后台' });
    }
    if (!user.customerId) return res.status(403).json({ error: '账号未关联租户' });
    const blocked = checkTenantAccess(db, user.customerId);
    if (blocked) return res.status(blocked.status).json({ error: blocked.error });
    req.customerId = user.customerId;
    next();
  });
  const payment = new PaymentService(db);

  // 当前套餐 + 用量（兼容保留；新体系见 /billing/solution-plan）
  router.get('/billing/plan', (req, res) => {
    const bind = getTenantBillingPlan(db, req.customerId);
    const usage = getTenantUsage(db, req.customerId);
    res.json({ ...bind, usage });
  });

  // 可选套餐列表（兼容保留；新体系见 /billing/solution-plan）
  router.get('/billing/plans', (_req, res) => {
    res.json({ plans: listBillingPlans(db) });
  });

  // 当前开通方案 + 各方案价格档（同步总平台解决方案的价格设置与时长；billing_plan 作废）
  router.get('/billing/solution-plan', (req, res) => {
    const p = db.prepare('SELECT id, customer_name, valid_until, status, solutions FROM projects WHERE id = ?').get(req.customerId);
    if (!p) return res.status(404).json({ error: '租户项目不存在' });
    let codes = [];
    try { codes = JSON.parse(p.solutions || '[]'); } catch (e) {}
    const solutions = codes.map((code) => {
      const sol = db.prepare('SELECT * FROM solutions WHERE code = ? AND status = \'on\'').get(code);
      if (!sol) return null;
      const pricing = db.prepare('SELECT duration_months, agent_price, user_price, renew_price FROM solution_pricing WHERE solution_id = ? ORDER BY duration_months ASC')
        .all(sol.id)
        .map((x) => ({ durationMonths: x.duration_months, agentPrice: x.agent_price, userPrice: x.user_price, renewPrice: x.renew_price }));
      return { id: sol.id, code: sol.code, name: sol.name, icon: sol.icon, pricing };
    }).filter(Boolean);
    res.json({ project: { name: p.customer_name, validUntil: p.valid_until, status: p.status }, solutions });
  });

  // 按方案时长购买/续费（金额取自 solution_pricing，含永久档 durationMonths=0）
  router.post('/billing/solution-purchase', (req, res) => {
    const { solutionId, durationMonths, action } = req.body || {};
    if (!solutionId) return res.status(400).json({ error: '方案必填' });
    if (!['subscribe', 'renew'].includes(action)) return res.status(400).json({ error: '无效操作' });
    const sol = db.prepare('SELECT * FROM solutions WHERE id = ?').get(Number(solutionId));
    if (!sol) return res.status(404).json({ error: '方案不存在' });
    const price = db.prepare('SELECT duration_months, agent_price, user_price, renew_price FROM solution_pricing WHERE solution_id = ? AND duration_months = ?')
      .get(sol.id, Number(durationMonths) || 0);
    if (!price) return res.status(404).json({ error: '该方案不存在对应时长价格' });
    const amount = action === 'renew' ? price.renew_price : price.user_price;
    const durationLabel = Number(durationMonths) === 0 ? '永久' : `${Number(durationMonths)}个月`;
    const order = payment.createOrder({
      payerType: 'platform',
      customerId: req.customerId,
      userId: req.user.id,
      solution: sol.code,
      productType: action === 'renew' ? 'subscription_renew' : 'subscription',
      productId: String(sol.id),
      productName: `${sol.name}（${durationLabel}${action === 'renew' ? '续费' : '开通'}）`,
      amount,
      channel: 'wechat',
      remark: `solution:${sol.code}:${Number(durationMonths) || 0}`,
    });
    audit(db, req, 'create_subscription_order', 'payment_order', order.id, `创建方案订单：${sol.name} ${durationLabel} ${action} ¥${amount}`);
    res.json({ order });
  });

  // 购买/续费/升级套餐 → 创建订阅订单（走统一支付）
  router.post('/billing/purchase', (req, res) => {
    const { planId, action } = req.body || {};
    if (!planId) return res.status(400).json({ error: '套餐ID必填' });
    const plan = db.prepare('SELECT * FROM billing_plans WHERE id = ? AND enabled = 1').get(planId);
    if (!plan) return res.status(404).json({ error: '套餐不存在或已停用' });
    if (!['subscribe', 'renew', 'upgrade'].includes(action)) return res.status(400).json({ error: '无效操作' });

    const order = payment.createOrder({
      payerType: 'platform',
      customerId: req.customerId,
      userId: req.user.id,
      solution: '',
      productType: action === 'renew' ? 'subscription_renew' : action === 'upgrade' ? 'subscription_upgrade' : 'subscription',
      productId: String(plan.id),
      productName: `${plan.name}（${action === 'renew' ? '续费' : action === 'upgrade' ? '升级' : '开通'}）`,
      amount: plan.price,
      channel: 'wechat',
      remark: `billing_plan:${plan.code}`,
    });
    audit(db, req, 'create_subscription_order', 'payment_order', order.id, `创建套餐订单：${plan.name} ${action} ¥${plan.price}`);
    res.json({ order });
  });

  // 我的发票
  router.get('/billing/invoices', (req, res) => {
    const result = queryInvoices(db, {
      customerId: req.customerId,
      limit: Math.min(Math.max(Number(req.query.limit) || 50, 1), 200),
      offset: Math.max(Number(req.query.offset) || 0, 0),
    });
    res.json(result);
  });

  // 申请开票
  router.post('/billing/invoices', (req, res) => {
    const { orderId, title, taxNo, address, phone, bank } = req.body || {};
    if (!orderId) return res.status(400).json({ error: '订单ID必填' });
    try {
      const inv = createInvoice(db, {
        customerId: req.customerId, orderId: Number(orderId),
        title, taxNo, address, phone, bank,
      });
      audit(db, req, 'apply_invoice', 'invoice', inv.id, `申请开票：${inv.title} ¥${inv.amount}（${inv.invoice_no}）`);
      res.status(201).json({ invoice: inv });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

export { genInvoiceNo };
