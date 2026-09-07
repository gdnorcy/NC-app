/**
 * 计费引擎（第二批：套餐×配额×订单状态机×发票）
 * - 套餐：billing_plans（版本×配额×价格），租户绑定 billing_plan_id + 到期日（复用 projects.valid_until）
 * - 配额校验：入驻个人/企业/员工、场景、集市上架数量（超限 403 + 提示升级）
 * - 订阅联动：支付成功(product_type=subscription) → 开通/续期/升级套餐
 * - 发票：invoices 表，租户申请 → 平台开票
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

// ============ 套餐 ============
export function toBillingPlan(row) {
  if (!row) return null;
  let quotas = {};
  let features = {};
  try { quotas = JSON.parse(row.quotas || '{}'); } catch {}
  try { features = JSON.parse(row.features || '{}'); } catch {}
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    price: row.price,
    cycle: row.cycle,
    quotas,
    features,
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
  };
}

export function listBillingPlans(db, { enabledOnly = true } = {}) {
  const sql = enabledOnly
    ? 'SELECT * FROM billing_plans WHERE enabled = 1 ORDER BY sort_order ASC, id ASC'
    : 'SELECT * FROM billing_plans ORDER BY sort_order ASC, id ASC';
  return db.prepare(sql).all().map(toBillingPlan);
}

export function getTenantBillingPlan(db, customerId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(customerId);
  if (!project) return null;
  const plan = db.prepare('SELECT * FROM billing_plans WHERE id = ?').get(project.billing_plan_id || 1);
  return {
    plan: toBillingPlan(plan),
    cycle: project.billing_cycle || 'year',
    validFrom: project.valid_from || '',
    validUntil: project.valid_until || '',
    status: project.status || 'active',
  };
}

// ============ 用量统计与配额校验 ============
/** 统计租户当前用量（可精确计算的维度；短信无记录表，暂返回配额上限） */
export function getTenantUsage(db, customerId) {
  const cid = customerId;
  const count = (sql, ...args) => db.prepare(sql).get(...args)?.n || 0;

  const individuals = count("SELECT COUNT(*) AS n FROM tenant_individuals WHERE customer_id = ? AND status IN ('active','pending')", cid);
  const enterprises = count("SELECT COUNT(*) AS n FROM tenant_enterprises WHERE customer_id = ? AND status IN ('active','pending')", cid);
  const employees = count("SELECT COUNT(*) AS n FROM tenant_enterprise_employees WHERE customer_id = ? AND status = 'active'", cid);
  const scenes = count('SELECT COUNT(*) AS n FROM scenes s JOIN plans p ON s.plan_id = p.id WHERE p.project_id = ?', cid);
  const marketItems = count("SELECT COUNT(*) AS n FROM card_market_items WHERE customer_id = ? AND audit_status = 'approved'", cid);
  const customers = count("SELECT COUNT(*) AS n FROM card_customer WHERE customer_id = ?", cid);

  // 存储用量：本地场景主图/预览/瓦片文件（远程存储场景不计入，口径见说明）
  let storageMb = 0;
  try {
    const scenes2 = db.prepare('SELECT image_path, preview_path, pyramid FROM scenes s JOIN plans p ON s.plan_id = p.id WHERE p.project_id = ?').all(cid);
    const root = path.resolve(config.uploadsDir);
    for (const sc of scenes2) {
      for (const p of [sc.image_path, sc.preview_path]) {
        if (p && p.startsWith('/uploads/')) {
          const rel = decodeURIComponent(p.replace(/^\/uploads\//, ''));
          const target = path.resolve(path.join(root, rel));
          if ((target === root || target.startsWith(root + path.sep)) && fs.existsSync(target)) {
            storageMb += fs.statSync(target).size / (1024 * 1024);
          }
        }
      }
      // 瓦片：pyramid JSON 里 tileUrls 数量估算（每瓦片 ~64KB）
      if (sc.pyramid) {
        try {
          const pyr = JSON.parse(sc.pyramid);
          const tiles = (pyr.tileUrls || []).length;
          storageMb += (tiles * 64 * 1024) / (1024 * 1024);
        } catch { /* 忽略坏 JSON */ }
      }
    }
  } catch { /* 存储统计失败不影响主流程 */ }

  return { individuals, enterprises, employees, scenes, marketItems, customers, storageMb: Math.round(storageMb * 10) / 10 };
}

/** 配额校验：usage[key] + delta <= quota[key]，超限返回 { ok:false, limit, used } */
const QUOTA_USAGE_KEY = {
  max_individuals: 'individuals',
  max_enterprises: 'enterprises',
  max_employees: 'employees',
  max_scenes: 'scenes',
  max_market_items: 'marketItems',
  max_customers: 'customers',
};
export function checkTenantQuota(db, customerId, key, delta = 1) {
  const bind = getTenantBillingPlan(db, customerId);
  if (!bind) return { ok: true }; // 无套餐不拦截
  const limit = bind.plan?.quotas?.[key];
  if (limit === undefined || limit === null || limit < 0) return { ok: true }; // 未定义配额=不限
  const usage = getTenantUsage(db, customerId);
  const used = usage[QUOTA_USAGE_KEY[key] ?? key] ?? 0;
  if (used + delta > limit) {
    return { ok: false, limit, used, planName: bind.plan?.name, key };
  }
  return { ok: true, limit, used };
}

// ============ 订阅联动（支付成功回调） ============
const CYCLE_MS = { year: 365 * 24 * 3600 * 1000, month: 30 * 24 * 3600 * 1000 };

/**
 * 支付成功后应用订阅：
 * - subscribe/renew：延长 valid_until（renew 从 max(到期,今天) 起算）
 * - upgrade/downgrade：立即切换套餐（不延长）
 * 返回 { planName, validUntil }
 */
export function applySubscription(db, order) {
  const plan = db.prepare('SELECT * FROM billing_plans WHERE id = ?').get(order.productId ?? order.product_id);
  if (!plan) return null;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(order.customerId ?? order.customer_id);
  if (!project) return null;

  const action = order.productType === 'subscription_renew' ? 'renew'
    : order.productType === 'subscription_upgrade' ? 'upgrade' : 'subscribe';
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const cycleMs = CYCLE_MS[plan.cycle] || CYCLE_MS.year;

  let newUntil = project.valid_until || todayStr;
  if (action === 'subscribe' || action === 'renew') {
    // subscribe：从今天起；renew：从到期日（或今天）起
    const base = project.valid_until && project.valid_until >= todayStr ? new Date(project.valid_until + 'T00:00:00') : today;
    newUntil = new Date(base.getTime() + cycleMs).toISOString().slice(0, 10);
  }

  db.prepare('UPDATE projects SET billing_plan_id = ?, billing_cycle = ?, valid_until = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(plan.id, plan.cycle, newUntil, order.customerId ?? order.customer_id);

  return { planName: plan.name, validUntil: newUntil, action };
}

// ============ 发票 ============
export function genInvoiceNo() {
  return 'INV' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100);
}

export function createInvoice(db, { customerId, orderId, title, taxNo, address, phone, bank }) {
  const order = db.prepare('SELECT * FROM payment_orders WHERE id = ? AND customer_id = ?').get(orderId, customerId);
  if (!order) throw new Error('订单不存在');
  if (order.status !== 'paid') throw new Error('仅已支付订单可开票');
  const dup = db.prepare("SELECT id FROM invoices WHERE order_id = ? AND status IN ('pending','issued')").get(orderId);
  if (dup) throw new Error('该订单已申请过开票');
  const info = db.prepare(
    `INSERT INTO invoices (invoice_no, customer_id, order_id, order_no, title, tax_no, address, phone, bank, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(genInvoiceNo(), customerId, orderId, order.order_no, title || '个人', taxNo || '', address || '', phone || '', bank || '', order.amount);
  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(info.lastInsertRowid);
}

export function toInvoice(row) {
  if (!row) return null;
  return {
    id: row.id, invoiceNo: row.invoice_no, customerId: row.customer_id, orderId: row.order_id,
    orderNo: row.order_no, title: row.title, taxNo: row.tax_no, address: row.address,
    phone: row.phone, bank: row.bank, amount: row.amount, status: row.status, remark: row.remark,
    createdAt: row.created_at, issuedAt: row.issued_at, rejectedAt: row.rejected_at,
  };
}

export function queryInvoices(db, { customerId, status, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (customerId) { where.push('customer_id = ?'); params.push(customerId); }
  if (status) { where.push('status = ?'); params.push(status); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db.prepare(`SELECT * FROM invoices ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), Number(offset));
  const total = db.prepare(`SELECT COUNT(*) AS n FROM invoices ${whereSql}`).get(...params)?.n || 0;
  return { invoices: rows.map(toInvoice), total };
}
