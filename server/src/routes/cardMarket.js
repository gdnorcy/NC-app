import { Router } from 'express';
import { checkTenantAccess } from '../tenant.js';
import { addOperationLog } from '../db.js';
import { checkTenantQuota } from '../services/billing.js';

/** 审计日志 helper：租户域操作统一带租户ID前缀，actor 兼容管理端 JWT 与 C 端 card_token */
function audit(db, req, action, targetType, targetId, detail) {
  addOperationLog(db, {
    userId: req.user?.uid ?? null,
    username: req.user?.username ?? req.user?.openid ?? 'card-user',
    action,
    targetType,
    targetId,
    detail: `[租户#${req.customerId}] ${detail}`,
    ip: req.ip,
  });
}

// 消息通知落库（exchange/visitor/system）
function insertMessage(db, customerId, userId, type, title, content, link) {
  if (!userId || !customerId) return;
  try {
    db.prepare('INSERT INTO card_message (customer_id, user_id, type, title, content, link) VALUES (?, ?, ?, ?, ?, ?)')
      .run(customerId, userId, type, title, content, link || '');
  } catch (e) {}
}
// 平台用户昵称（消息文案用）
function fromName(db, userId) {
  const u = db.prepare('SELECT nickname FROM platform_user WHERE id = ?').get(userId);
  return u?.nickname || '对方';
}

/**
 * 智能名片 SaaS 租户域 API（人脉集市/入驻主体/双公海/表单）
 *
 * 安全基线（审计 P0-P2）：
 * - 租户隔离：所有业务查询强制携带 customer_id（租户ID），来源只取认证上下文，忽略客户端传参
 * - RBAC：租户管理员 / 企业管理员 / 员工 / 个人 四级角色校验，接口层 403
 * - 回收闭环：个人停用→租户公海；员工停用→企业公海；企业停用→按 auto_recycle 开关上浮租户公海
 * - 上浮幂等：按 customer_id+phone 查重，防循环震荡
 * - 快照：名片交换 accepted 时固化双方名片快照，人脉库离线保留
 * - 超时回收：公海客户领取后 N 天未跟进自动上浮（惰性检查）
 * - 口令安全：只按 invite_code 匹配，校验项目 active+未过期+配额，写使用审计
 */

const ROLE_TENANT_ADMIN = 'tenant_admin';
const ROLE_SUPER = 'super_admin';

export function createCardMarketRouter(db) {
  const router = Router();

  // ============================================================
  // 中间件
  // ============================================================
  // 租户上下文：customerId 只来自认证上下文（app.js comboAuth 注入）
  function tenant(req, res, next) {
    const customerId = req.customerId || req.user?.customerId;
    if (!customerId) return res.status(403).json({ error: '未入驻任何租户，禁止访问' });
    // 租户生命周期 + 智能名片解决方案授权（P2-10/P2-11）
    const blocked = checkTenantAccess(db, customerId, 'card');
    if (blocked) return res.status(blocked.status).json({ error: blocked.error });
    req.customerId = customerId;
    next();
  }

  // 平台/租户管理员
  function isPlatformOrTenantAdmin(req) {
    const role = req.user?.role;
    return role === ROLE_TENANT_ADMIN || role === ROLE_SUPER || role === 'admin';
  }

  function requireTenantAdmin(req, res, next) {
    if (!isPlatformOrTenantAdmin(req)) return res.status(403).json({ error: '仅租户管理员可操作' });
    next();
  }

  // 当前用户（card_token 用户 or JWT 管理员）的 user_id
  function currentUserId(req) {
    return req.userId || req.user?.id;
  }

  // 当前用户在企业中的角色（admin/member/null）
  function currentEnterpriseRole(userId) {
    const emp = db.prepare(`SELECT e.id as enterprise_id, emp.role
      FROM tenant_enterprise_employees emp
      JOIN tenant_enterprises e ON e.id = emp.enterprise_id
      WHERE emp.user_id = ? AND emp.status = 'active' AND e.status = 'active'`).get(userId);
    return emp || null;
  }

  // 校验目标是否属于当前租户
  function belongsToTenant(table, id, customerId) {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) return null;
    if (row.customer_id !== customerId) return { __crossTenant: true };
    return row;
  }

  // 公海超时回收（惰性）：领取后超过 days 天未跟进 → 重置 available 并回收名下客户
  function checkTimeoutRecycle(customerId, days = 30) {
    const deadline = `datetime('now', '-${Math.max(1, days)} days')`;
    const rows = db.prepare(`SELECT * FROM tenant_public_pool
      WHERE customer_id = ? AND status = 'claimed'
        AND COALESCE(last_follow_at, claimed_at) < ${deadline}`).all(customerId);
    for (const row of rows) {
      // 删除该用户名下由公海领取来的客户（防重复）
      db.prepare(`DELETE FROM card_customer WHERE customer_id = ? AND owner_user_id = ? AND source = 'public_pool' AND phone = ?`)
        .run(customerId, row.claimed_by, row.phone || '');
      db.prepare(`UPDATE tenant_public_pool SET status = 'available', claimed_by = NULL, claimed_at = NULL, last_follow_at = NULL
        WHERE id = ?`).run(row.id);
    }
    if (rows.length) {
      db.prepare(`UPDATE tenant_public_pool SET remark = COALESCE(remark, '') || ' [超时自动回收]' WHERE id IN (${rows.map(() => '?').join(',')})`).run(...rows.map(r => r.id));
    }
    return rows.length;
  }

  function checkEnterpriseTimeoutRecycle(enterpriseId, days = 30) {
    const deadline = `datetime('now', '-${Math.max(1, days)} days')`;
    const rows = db.prepare(`SELECT * FROM enterprise_public_pool
      WHERE enterprise_id = ? AND status = 'claimed'
        AND COALESCE(last_follow_at, claimed_at) < ${deadline}`).all(enterpriseId);
    for (const row of rows) {
      db.prepare(`DELETE FROM card_customer WHERE customer_id = ? AND owner_user_id = ? AND source = 'enterprise_pool' AND phone = ?`)
        .run(row.customer_id, row.claimed_by, row.phone || '');
      db.prepare(`UPDATE enterprise_public_pool SET status = 'available', claimed_by = NULL, claimed_at = NULL, last_follow_at = NULL
        WHERE id = ?`).run(row.id);
    }
    return rows.length;
  }

  // 上浮幂等：客户插入租户公海前按 phone 查重（同租户 available 已存在则跳过）
  function floatUpToTenantPool(rows, customerId, sourceType, sourceId) {
    let count = 0;
    for (const c of rows) {
      const dup = db.prepare(`SELECT id FROM tenant_public_pool WHERE customer_id = ? AND phone = ? AND status = 'available'`)
        .get(customerId, c.phone || '');
      if (dup) continue;
      db.prepare(`INSERT INTO tenant_public_pool (customer_id, source_type, source_id, name, phone, company, position, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(customerId, sourceType, sourceId, c.name, c.phone || '', c.company || '', c.position || '', c.remark || '');
      count++;
    }
    return count;
  }

  // 回收客户到企业公海（查重）
  function recycleToEnterprisePool(rows, enterpriseId, customerId, sourceType, sourceId) {
    let count = 0;
    for (const c of rows) {
      const dup = db.prepare(`SELECT id FROM enterprise_public_pool WHERE enterprise_id = ? AND phone = ? AND status = 'available'`)
        .get(enterpriseId, c.phone || '');
      if (dup) continue;
      db.prepare(`INSERT INTO enterprise_public_pool (enterprise_id, customer_id, source_type, source_id, name, phone, company, position, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(enterpriseId, customerId, sourceType, sourceId, c.name, c.phone || '', c.company || '', c.position || '', c.remark || '');
      count++;
    }
    return count;
  }

  // 从集市移除某主体（所有关联条目）
  function removeFromMarket(customerId, subjectType, subjectId, enterpriseId) {
    if (enterpriseId) {
      db.prepare(`DELETE FROM card_market_items WHERE customer_id = ? AND subject_type = ? AND enterprise_id = ?`)
        .run(customerId, subjectType, enterpriseId);
    }
    db.prepare(`DELETE FROM card_market_items WHERE customer_id = ? AND subject_type = ? AND subject_id = ?`)
      .run(customerId, subjectType, subjectId);
  }

  // 集市开关校验
  function marketEnabled(customerId) {
    const s = db.prepare('SELECT enabled, allow_exchange FROM card_market_settings WHERE customer_id = ?').get(customerId);
    if (!s) return { enabled: true, allowExchange: true };
    return { enabled: !!s.enabled, allowExchange: !!s.allow_exchange };
  }

  // ===== 集市配置 =====
  // 集市风格资产（含租户购买状态）
  function styleAssets(customerId) {
    const bought = new Set(
      db.prepare("SELECT asset_key FROM tenant_asset_purchases WHERE tenant_id = ? AND asset_type = 'market_style'").all(customerId).map((r) => String(r.asset_key))
    );
    return db.prepare('SELECT * FROM market_styles ORDER BY sort_order ASC, id ASC').all().map((s) => ({
      key: s.key,
      name: s.name,
      description: s.description,
      price: Number(s.price || 0),
      isDefault: !!s.is_default,
      enabled: !!s.enabled,
      purchased: !!s.is_default || bought.has(String(s.key)),
    }));
  }

  router.get('/market/settings', tenant, (req, res) => {
    let settings = db.prepare('SELECT * FROM card_market_settings WHERE customer_id = ?').get(req.customerId);
    if (!settings) {
      db.prepare('INSERT INTO card_market_settings (customer_id) VALUES (?)').run(req.customerId);
      settings = db.prepare('SELECT * FROM card_market_settings WHERE customer_id = ?').get(req.customerId);
    }
    // 统一返回 camelCase 字段（与 PUT 入参契约一致，前端直接绑定使用）
    res.json({
      settings: {
        enabled: settings.enabled,
        auditMode: settings.audit_mode,
        title: settings.title,
        cover: settings.cover,
        showCompany: settings.show_company,
        showIndustry: settings.show_industry,
        showLocation: settings.show_location,
        allowExchange: settings.allow_exchange,
        contactVisible: settings.contact_visible,
        style: settings.style || 'A',
        notice: settings.notice || '',
      },
      styles: styleAssets(req.customerId),
    });
  });

  // 集市风格资产购买（租户管理员；默认风格/免费无需购买）
  router.post('/market/assets/purchase', tenant, requireTenantAdmin, (req, res) => {
    const { style } = req.body || {};
    if (!style) return res.status(400).json({ error: '请选择要购买的风格' });
    const s = db.prepare('SELECT * FROM market_styles WHERE key = ?').get(style);
    if (!s) return res.status(404).json({ error: '风格不存在' });
    if (!s.enabled) return res.status(400).json({ error: '该风格已下架' });
    if (s.is_default || Number(s.price || 0) === 0) return res.status(400).json({ error: '默认风格无需购买' });
    const exist = db.prepare("SELECT id FROM tenant_asset_purchases WHERE tenant_id = ? AND asset_type = 'market_style' AND asset_key = ?").get(req.customerId, style);
    if (!exist) {
      db.prepare("INSERT INTO tenant_asset_purchases (tenant_id, asset_type, asset_key, price) VALUES (?, 'market_style', ?, ?)").run(req.customerId, style, Number(s.price) || 0);
    }
    audit(db, req, 'purchase_market_style', 'market_style', req.customerId, `购买集市风格: ${s.name}`);
    res.json({ ok: true, styles: styleAssets(req.customerId) });
  });

  // 更新集市配置（仅租户管理员）
  router.put('/market/settings', tenant, requireTenantAdmin, (req, res) => {
    const { enabled, auditMode, title, cover, showCompany, showIndustry, showLocation, allowExchange, contactVisible, style, notice } = req.body;
    // 风格校验：启用且（默认风格 或 已购买/免费），未购付费风格禁止切换
    if (style !== undefined && style !== null) {
      const s = db.prepare('SELECT * FROM market_styles WHERE key = ?').get(style);
      if (!s || !s.enabled) return res.status(400).json({ error: '所选风格不可用' });
      if (!s.is_default && Number(s.price || 0) > 0) {
        const bought = db.prepare("SELECT id FROM tenant_asset_purchases WHERE tenant_id = ? AND asset_type = 'market_style' AND asset_key = ?").get(req.customerId, style);
        if (!bought) return res.status(403).json({ error: '该风格未购买，请先购买后再切换' });
      }
    }
    // SQLite 无法绑定 JS boolean/undefined：统一规范化为 0/1/null
    const B = (v) => (v === undefined ? null : (v ? 1 : 0));
    const S = (v) => (v === undefined ? null : v);
    db.prepare(`UPDATE card_market_settings SET
      enabled = COALESCE(?, enabled),
      audit_mode = COALESCE(?, audit_mode),
      title = COALESCE(?, title),
      cover = COALESCE(?, cover),
      show_company = COALESCE(?, show_company),
      show_industry = COALESCE(?, show_industry),
      show_location = COALESCE(?, show_location),
      allow_exchange = COALESCE(?, allow_exchange),
      contact_visible = COALESCE(?, contact_visible),
      style = COALESCE(?, style),
      notice = COALESCE(?, notice),
      updated_at = datetime('now')
      WHERE customer_id = ?`).run(
      B(enabled), S(auditMode), S(title), S(cover), B(showCompany), B(showIndustry), B(showLocation), B(allowExchange), S(contactVisible), S(style), S(notice), req.customerId
    );
    audit(db, req, 'update_market_settings', 'market_settings', req.customerId, '更新人脉集市配置');
    res.json({ success: true, styles: styleAssets(req.customerId) });
  });

  // 集市数据统计（租户管理员）
  router.get('/market/stats', tenant, requireTenantAdmin, (req, res) => {
    const itemCount = db.prepare('SELECT COUNT(*) as cnt FROM card_market_items WHERE customer_id = ? AND audit_status = ?').get(req.customerId, 'approved')?.cnt || 0;
    const pendingCount = db.prepare('SELECT COUNT(*) as cnt FROM card_market_items WHERE customer_id = ? AND audit_status = ?').get(req.customerId, 'pending')?.cnt || 0;
    const exchangeCount = db.prepare('SELECT COUNT(*) as cnt FROM card_connections WHERE customer_id = ? AND status = ?').get(req.customerId, 'accepted')?.cnt || 0;
    const visitCount = db.prepare('SELECT COALESCE(SUM(view_count), 0) as total FROM card_market_items WHERE customer_id = ?').get(req.customerId)?.total || 0;
    res.json({ stats: { visitCount, exchangeCount, itemCount, pendingCount } });
  });

  // ===== 集市列表 =====
  router.get('/market/list', tenant, (req, res) => {
    const { type, keyword, scope, need, industry, sort } = req.query;
    const sw = marketEnabled(req.customerId);
    if (!sw.enabled) return res.json({ items: [], message: '集市未开启' });

    // scope=admin：租户管理员管理视图，返回全部状态（含 pending/rejected）
    const isAdminView = scope === 'admin' && isPlatformOrTenantAdmin(req);
    let sql = `SELECT mi.*,
      CASE mi.subject_type
        WHEN 'individual' THEN (SELECT name FROM tenant_individuals WHERE id = mi.subject_id)
        WHEN 'enterprise' THEN (SELECT name FROM tenant_enterprises WHERE id = mi.subject_id)
        WHEN 'employee' THEN (SELECT name FROM tenant_enterprise_employees WHERE id = mi.subject_id)
      END as name,
      CASE mi.subject_type
        WHEN 'employee' THEN (SELECT e.name FROM tenant_enterprises e JOIN tenant_enterprise_employees emp ON emp.enterprise_id = e.id WHERE emp.id = mi.subject_id)
        ELSE NULL
      END as company_name,
      CASE mi.subject_type
        WHEN 'individual' THEN (SELECT position FROM card_profile WHERE user_id = mi.user_id LIMIT 1)
        WHEN 'employee' THEN (SELECT position FROM tenant_enterprise_employees WHERE id = mi.subject_id)
        ELSE NULL
      END as position,
      CASE mi.subject_type
        WHEN 'individual' THEN (SELECT business_field FROM card_profile WHERE user_id = mi.user_id LIMIT 1)
        WHEN 'enterprise' THEN (SELECT industry FROM tenant_enterprises WHERE id = mi.subject_id)
        WHEN 'employee' THEN (SELECT business_field FROM card_profile WHERE user_id = mi.user_id LIMIT 1)
        ELSE NULL
      END as industry,
      CASE mi.subject_type
        WHEN 'individual' THEN (SELECT need_tags FROM card_profile WHERE user_id = mi.user_id LIMIT 1)
        WHEN 'employee' THEN (SELECT need_tags FROM card_profile WHERE user_id = mi.user_id LIMIT 1)
        ELSE NULL
      END as need_tags,
      CASE WHEN mi.created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END as is_new,
      (SELECT cp.id FROM card_profile cp WHERE cp.user_id = mi.user_id AND cp.status = 'active' ORDER BY cp.id DESC LIMIT 1) as card_id
    FROM card_market_items mi
    WHERE mi.customer_id = ?${isAdminView ? '' : " AND mi.audit_status = 'approved'"}`;

    const params = [req.customerId];
    if (type && type !== 'all') {
      sql += ' AND mi.subject_type = ?';
      params.push(type);
    }
    if (keyword) {
      sql += ` AND (
        CASE mi.subject_type
          WHEN 'individual' THEN (SELECT name FROM tenant_individuals WHERE id = mi.subject_id)
          WHEN 'enterprise' THEN (SELECT name FROM tenant_enterprises WHERE id = mi.subject_id)
          WHEN 'employee' THEN (SELECT name FROM tenant_enterprise_employees WHERE id = mi.subject_id)
        END LIKE ?
      )`;
      params.push(`%${keyword}%`);
    }
    if (need) {
      // 供需标签筛选：need_tags JSON 内包含目标标签
      sql += ` AND (
        CASE mi.subject_type
          WHEN 'individual' THEN (SELECT need_tags FROM card_profile WHERE user_id = mi.user_id LIMIT 1)
          WHEN 'employee' THEN (SELECT need_tags FROM card_profile WHERE user_id = mi.user_id LIMIT 1)
          ELSE NULL
        END LIKE ?
      )`;
      params.push(`%"${need}"%`);
    }
    if (industry && industry !== 'all') {
      sql += ` AND (
        CASE mi.subject_type
          WHEN 'individual' THEN (SELECT business_field FROM card_profile WHERE user_id = mi.user_id LIMIT 1)
          WHEN 'enterprise' THEN (SELECT industry FROM tenant_enterprises WHERE id = mi.subject_id)
          WHEN 'employee' THEN (SELECT business_field FROM card_profile WHERE user_id = mi.user_id LIMIT 1)
          ELSE NULL
        END LIKE ?
      )`;
      params.push(`%${industry}%`);
    }
    if (sort === 'newest') {
      sql += ' ORDER BY mi.created_at DESC, mi.is_top DESC';
    } else if (sort === 'exchanged') {
      sql += ' ORDER BY mi.view_count DESC, mi.is_top DESC';
    } else {
      sql += ' ORDER BY mi.is_top DESC, mi.created_at DESC';
    }
    const rows = db.prepare(sql).all(...params);
    res.json({ items: rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      subjectType: r.subject_type,
      subjectId: r.subject_id,
      userId: r.user_id,
      enterpriseId: r.enterprise_id,
      auditStatus: r.audit_status,
      isTop: !!r.is_top,
      viewCount: r.view_count || 0,
      name: r.name || '',
      companyName: r.company_name || '',
      position: r.position || '',
      industry: r.industry || '',
      needTags: r.need_tags || '',
      isNew: !!r.is_new,
      cardId: r.card_id || null,
      createdAt: r.created_at,
    })) });
  });

  // 我的名片数据看板：总访问 / 被交换 / 集市曝光（本人名下全部名片聚合）
  router.get('/market/my-stats', tenant, (req, res) => {
    const cards = db.prepare('SELECT view_count, exchange_count FROM card_profile WHERE user_id = ?').all(req.user.id);
    const marketViews = db.prepare(
      'SELECT COALESCE(SUM(view_count), 0) AS total FROM card_market_items WHERE customer_id = ? AND user_id = ?'
    ).get(req.customerId, req.user.id)?.total || 0;
    res.json({
      stats: {
        totalViews: cards.reduce((a, c) => a + (c.view_count || 0), 0),
        totalExchanges: cards.reduce((a, c) => a + (c.exchange_count || 0), 0),
        marketViews,
      },
    });
  });

  // 我的名片：集市状态 + 位置定位（上架状态/审核态/置顶/NEW/集市内位置）
  router.get('/market/my-status', tenant, (req, res) => {
    const userId = req.user.id;
    const individuals = db.prepare("SELECT id, status FROM tenant_individuals WHERE customer_id = ? AND user_id = ?").all(req.customerId, userId);
    const employees = db.prepare("SELECT emp.id, emp.status FROM tenant_enterprise_employees emp WHERE emp.customer_id = ? AND emp.user_id = ?").all(req.customerId, userId);
    const subjects = [
      ...individuals.map((i) => ({ subjectType: 'individual', subjectId: i.id, status: i.status })),
      ...employees.map((e) => ({ subjectType: 'employee', subjectId: e.id, status: e.status })),
    ];
    const items = db.prepare(
      `SELECT mi.*, mi.is_top, mi.audit_status,
        CASE WHEN mi.created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END as is_new
       FROM card_market_items mi
       JOIN (SELECT DISTINCT user_id, customer_id FROM tenant_individuals
             UNION SELECT user_id, customer_id FROM tenant_enterprise_employees) u
         ON u.user_id = mi.user_id AND u.customer_id = mi.customer_id
       WHERE mi.customer_id = ? AND mi.user_id = ?`
    ).all(req.customerId, userId);
    res.json({ items: items.map((it) => ({
      id: it.id,
      subjectType: it.subject_type,
      subjectId: it.subject_id,
      auditStatus: it.audit_status,
      isTop: !!it.is_top,
      isNew: !!it.is_new,
      createdAt: it.created_at,
    })), subjects });
  });

  // 上架/下架集市（仅本人或租户管理员）
  router.post('/market/toggle', tenant, (req, res) => {
    const userId = currentUserId(req);
    const { subjectType, subjectId } = req.body;
    if (!userId || !subjectType || !subjectId) return res.status(400).json({ error: '缺少参数' });

    // 权限：只能操作自己的主体；企业主体仅企业管理员/租户管理员
    let allowed = false;
    if (subjectType === 'individual') {
      const ind = db.prepare('SELECT * FROM tenant_individuals WHERE id = ? AND customer_id = ?').get(subjectId, req.customerId);
      allowed = !!ind && ind.user_id === userId;
    } else if (subjectType === 'employee') {
      const emp = db.prepare('SELECT * FROM tenant_enterprise_employees WHERE id = ? AND customer_id = ?').get(subjectId, req.customerId);
      allowed = !!emp && emp.user_id === userId;
    } else if (subjectType === 'enterprise') {
      const ent = db.prepare('SELECT * FROM tenant_enterprises WHERE id = ? AND customer_id = ?').get(subjectId, req.customerId);
      allowed = !!ent && (ent.admin_user_id === userId || isPlatformOrTenantAdmin(req));
    }
    if (!allowed) return res.status(403).json({ error: '无权操作该主体' });

    const sw = marketEnabled(req.customerId);
    if (!sw.enabled) return res.status(400).json({ error: '集市未开启' });

    const existing = db.prepare('SELECT id FROM card_market_items WHERE customer_id = ? AND subject_type = ? AND subject_id = ?').get(req.customerId, subjectType, subjectId);
    if (existing) {
      db.prepare('DELETE FROM card_market_items WHERE id = ?').run(existing.id);
      res.json({ success: true, inMarket: false });
    } else {
      const q = checkTenantQuota(db, req.customerId, 'max_market_items');
      if (!q.ok) return res.status(403).json({ error: `集市上架数量已达上限（${q.used}/${q.limit}），请升级套餐后再上架` });
      const settings = db.prepare('SELECT audit_mode FROM card_market_settings WHERE customer_id = ?').get(req.customerId);
      const auditStatus = settings?.audit_mode === 'manual' ? 'pending' : 'approved';
      // 企业主体上架需要企业id
      const enterpriseId = subjectType === 'enterprise' ? subjectId : (subjectType === 'employee' ? (db.prepare('SELECT enterprise_id FROM tenant_enterprise_employees WHERE id = ?').get(subjectId)?.enterprise_id) : null);
      db.prepare(`INSERT INTO card_market_items (customer_id, subject_type, subject_id, user_id, enterprise_id, audit_status)
        VALUES (?, ?, ?, ?, ?, ?)`).run(req.customerId, subjectType, subjectId, userId, enterpriseId, auditStatus);
      res.json({ success: true, inMarket: true, auditStatus });
      audit(db, req, 'toggle_market_item', 'market_item', existing?.id ?? null, `${subjectType}#${subjectId} 上架集市，审核=${auditStatus}`);
    }
  });

  // 检查是否已上架
  router.get('/market/check', tenant, (req, res) => {
    const { subjectType, subjectId } = req.query;
    const item = db.prepare('SELECT audit_status FROM card_market_items WHERE customer_id = ? AND subject_type = ? AND subject_id = ?').get(req.customerId, subjectType, subjectId);
    res.json({ inMarket: !!item, auditStatus: item?.audit_status });
  });

  // 集市审核（租户管理员）
  router.post('/market/audit', tenant, requireTenantAdmin, (req, res) => {
    const { itemId, action } = req.body; // approve/reject
    const item = belongsToTenant('card_market_items', itemId, req.customerId);
    if (!item) return res.status(404).json({ error: '上架记录不存在' });
    if (item.__crossTenant) return res.status(403).json({ error: '无权操作' });
    if (item.audit_status !== 'pending') return res.status(400).json({ error: '该记录不在待审状态' });
    db.prepare("UPDATE card_market_items SET audit_status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(action === 'approve' ? 'approved' : 'rejected', itemId);
    audit(db, req, 'audit_market_item', 'market_item', itemId, `集市审核 ${action === 'approve' ? '通过' : '拒绝'}`);
    res.json({ success: true });
  });

  // 置顶推荐（租户管理员）
  router.post('/market/top', tenant, requireTenantAdmin, (req, res) => {
    const { itemId, isTop } = req.body;
    const item = belongsToTenant('card_market_items', itemId, req.customerId);
    if (!item || item.__crossTenant) return res.status(403).json({ error: '无权操作' });
    db.prepare("UPDATE card_market_items SET is_top = ?, updated_at = datetime('now') WHERE id = ?").run(isTop ? 1 : 0, itemId);
    audit(db, req, 'top_market_item', 'market_item', itemId, `集市置顶=${isTop ? '是' : '否'}`);
    res.json({ success: true });
  });

  // 强制下架（租户管理员）
  router.post('/market/force-remove', tenant, requireTenantAdmin, (req, res) => {
    const { itemId } = req.body;
    const item = belongsToTenant('card_market_items', itemId, req.customerId);
    if (!item || item.__crossTenant) return res.status(403).json({ error: '无权操作' });
    db.prepare('DELETE FROM card_market_items WHERE id = ?').run(itemId);
    audit(db, req, 'force_remove_market_item', 'market_item', itemId, '强制下架集市名片');
    res.json({ success: true });
  });

  // ===== 名片交换 =====
  router.post('/exchange/request', tenant, (req, res) => {
    const fromUserId = currentUserId(req);
    const { toUserId, message } = req.body;
    if (!fromUserId || !toUserId) return res.status(400).json({ error: '缺少参数' });

    const sw = marketEnabled(req.customerId);
    if (!sw.enabled || !sw.allowExchange) return res.status(400).json({ error: '集市交换已关闭' });

    // 对方必须是本租户成员
    const targetMember = db.prepare(`SELECT id FROM tenant_individuals WHERE customer_id = ? AND user_id = ? AND status = 'active'`).get(req.customerId, toUserId)
      || db.prepare(`SELECT id FROM tenant_enterprise_employees WHERE customer_id = ? AND user_id = ? AND status = 'active'`).get(req.customerId, toUserId);
    if (!targetMember) return res.status(403).json({ error: '对方不在本租户内' });

    const existing = db.prepare('SELECT id, status FROM card_connections WHERE customer_id = ? AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))').get(req.customerId, fromUserId, toUserId, toUserId, fromUserId);
    if (existing) {
      if (existing.status === 'accepted') return res.json({ success: true, message: '已是人脉关系' });
      if (existing.status === 'pending') return res.status(400).json({ error: '已发起过交换请求' });
      if (existing.status === 'rejected') {
        // 被拒后可重新发起：重置为 pending
        db.prepare("UPDATE card_connections SET status = 'pending', message = ?, updated_at = datetime('now') WHERE id = ?").run(message || '', existing.id);
        insertMessage(db, req.customerId, toUserId, 'exchange', '新的名片交换申请', '有人再次向你发起名片交换', '/pages/card/exchangeRequests');
        return res.json({ success: true, retry: true });
      }
    }

    db.prepare('INSERT INTO card_connections (customer_id, from_user_id, to_user_id, message) VALUES (?, ?, ?, ?)').run(req.customerId, fromUserId, toUserId, message || '');
    insertMessage(db, req.customerId, toUserId, 'exchange', '新的名片交换申请', `${fromName(db, fromUserId)} 想与你交换名片`, '/pages/card/exchangeRequests');
    res.json({ success: true });
  });

  // 处理交换请求（接受/拒绝）——接受时固化双方名片快照
  router.post('/exchange/handle', tenant, (req, res) => {
    const userId = currentUserId(req);
    const { connectionId, action } = req.body;
    if (!userId || !connectionId) return res.status(400).json({ error: '缺少参数' });

    const conn = belongsToTenant('card_connections', connectionId, req.customerId);
    if (!conn) return res.status(404).json({ error: '请求不存在' });
    if (conn.__crossTenant) return res.status(403).json({ error: '无权操作' });
    if (conn.to_user_id !== userId) return res.status(403).json({ error: '仅接收方可处理' });
    if (conn.status !== 'pending') return res.status(400).json({ error: '该请求已处理' });

    if (action === 'accept') {
      // 双方名片快照（人脉库离线保留，与名片后续修改/停用解耦）
      const fromCard = db.prepare('SELECT * FROM card_profile WHERE user_id = ? ORDER BY id LIMIT 1').get(conn.from_user_id);
      const toCard = db.prepare('SELECT * FROM card_profile WHERE user_id = ? ORDER BY id LIMIT 1').get(conn.to_user_id);
      const snapshot = JSON.stringify({
        from: fromCard ? { name: fromCard.name, position: fromCard.position, company: fromCard.company, phone: fromCard.phone, avatar: fromCard.avatar, city: fromCard.city } : null,
        to: toCard ? { name: toCard.name, position: toCard.position, company: toCard.company, phone: toCard.phone, avatar: toCard.avatar, city: toCard.city } : null,
        at: new Date().toISOString(),
      });
      db.prepare("UPDATE card_connections SET status = 'accepted', snapshot = ?, exchanged_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(snapshot, connectionId);
      insertMessage(db, req.customerId, conn.from_user_id, 'exchange', '交换申请已通过', `${fromName(db, userId)} 接受了你的名片交换`, '/pages/card/connections');
    } else {
      db.prepare("UPDATE card_connections SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(connectionId);
      insertMessage(db, req.customerId, conn.from_user_id, 'exchange', '交换申请未通过', `${fromName(db, userId)} 拒绝了你的名片交换`, '/pages/card/exchangeRequests');
    }
    res.json({ success: true });
  });

  // 我的交换请求列表（本租户内）
  router.get('/exchange/list', tenant, (req, res) => {
    const userId = currentUserId(req);
    const requests = db.prepare(`SELECT c.*,
      (SELECT nickname FROM platform_user WHERE id = c.from_user_id) as from_name,
      (SELECT nickname FROM platform_user WHERE id = c.to_user_id) as to_name
      FROM card_connections c
      WHERE c.customer_id = ? AND (c.from_user_id = ? OR c.to_user_id = ?)
      ORDER BY c.created_at DESC`).all(req.customerId, userId, userId);
    res.json({ requests });
  });

  // 待处理交换请求数（红点）
  router.get('/exchange/unread', tenant, (req, res) => {
    const userId = currentUserId(req);
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM card_connections
      WHERE customer_id = ? AND to_user_id = ? AND status = 'pending'`).get(req.customerId, userId);
    res.json({ count: row?.cnt || 0 });
  });

  // 交换记录（租户管理员）：本租户全部交换往来，含双方信息
  router.get('/exchange/records', tenant, requireTenantAdmin, (req, res) => {
    const status = req.query.status || '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const where = ['c.customer_id = ?'];
    const args = [req.customerId];
    if (['pending', 'accepted', 'rejected'].includes(status)) { where.push('c.status = ?'); args.push(status); }
    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM card_connections c WHERE ${whereSql}`).get(...args).cnt;
    const records = db.prepare(`
      SELECT c.id, c.status, c.message, c.exchanged_at, c.created_at,
        f.nickname as from_name, f.avatar as from_avatar,
        t.nickname as to_name, t.avatar as to_avatar,
        (SELECT name FROM card_profile WHERE user_id = c.from_user_id ORDER BY id LIMIT 1) as from_card_name,
        (SELECT position FROM card_profile WHERE user_id = c.from_user_id ORDER BY id LIMIT 1) as from_position,
        (SELECT name FROM card_profile WHERE user_id = c.to_user_id ORDER BY id LIMIT 1) as to_card_name,
        (SELECT position FROM card_profile WHERE user_id = c.to_user_id ORDER BY id LIMIT 1) as to_position
      FROM card_connections c
      LEFT JOIN platform_user f ON f.id = c.from_user_id
      LEFT JOIN platform_user t ON t.id = c.to_user_id
      WHERE ${whereSql}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
    res.json({ records, total, page, pageSize });
  });

  // ===== 消息通知 =====
  // 消息列表（本租户内，我收到的）
  router.get('/messages', tenant, (req, res) => {
    const userId = currentUserId(req);
    const type = req.query.type || '';
    const sql = `SELECT * FROM card_message WHERE customer_id = ? AND user_id = ?
      ${type ? 'AND type = ?' : ''} ORDER BY created_at DESC LIMIT 100`;
    const args = type ? [req.customerId, userId, type] : [req.customerId, userId];
    const messages = db.prepare(sql).all(...args);
    res.json({ messages: messages.map((m) => ({ ...m, link: m.link || '' })) });
  });

  // 未读消息数（红点）
  router.get('/messages/unread', tenant, (req, res) => {
    const userId = currentUserId(req);
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM card_message
      WHERE customer_id = ? AND user_id = ? AND is_read = 0`).get(req.customerId, userId);
    res.json({ count: row?.cnt || 0 });
  });

  // 标记已读（全部或指定 id）
  router.post('/messages/read', tenant, (req, res) => {
    const userId = currentUserId(req);
    const { ids } = req.body || {};
    if (Array.isArray(ids) && ids.length) {
      const ph = ids.map(() => '?').join(',');
      db.prepare(`UPDATE card_message SET is_read = 1 WHERE customer_id = ? AND user_id = ? AND id IN (${ph})`)
        .run(req.customerId, userId, ...ids);
    } else {
      db.prepare('UPDATE card_message SET is_read = 1 WHERE customer_id = ? AND user_id = ?').run(req.customerId, userId);
    }
    res.json({ success: true });
  });

  // ===== 人脉库 =====
  router.get('/connections', tenant, (req, res) => {
    const userId = currentUserId(req);
    const connections = db.prepare(`SELECT c.*,
      CASE WHEN c.from_user_id = ? THEN c.to_user_id ELSE c.from_user_id END as contact_user_id,
      CASE WHEN c.from_user_id = ? THEN
        COALESCE(json_extract(c.snapshot, '$.to.name'), (SELECT nickname FROM platform_user WHERE id = c.to_user_id))
      ELSE
        COALESCE(json_extract(c.snapshot, '$.from.name'), (SELECT nickname FROM platform_user WHERE id = c.from_user_id))
      END as contact_name,
      CASE WHEN c.from_user_id = ? THEN
        COALESCE(json_extract(c.snapshot, '$.to.position'), (SELECT position FROM card_profile WHERE user_id = c.to_user_id LIMIT 1))
      ELSE
        COALESCE(json_extract(c.snapshot, '$.from.position'), (SELECT position FROM card_profile WHERE user_id = c.from_user_id LIMIT 1))
      END as contact_position,
      CASE WHEN c.from_user_id = ? THEN
        COALESCE(json_extract(c.snapshot, '$.to.company'), (SELECT company FROM card_profile WHERE user_id = c.to_user_id LIMIT 1))
      ELSE
        COALESCE(json_extract(c.snapshot, '$.from.company'), (SELECT company FROM card_profile WHERE user_id = c.from_user_id LIMIT 1))
      END as contact_company,
      CASE WHEN c.from_user_id = ? THEN
        COALESCE(json_extract(c.snapshot, '$.to.avatar'), (SELECT avatar FROM platform_user WHERE id = c.to_user_id))
      ELSE
        COALESCE(json_extract(c.snapshot, '$.from.avatar'), (SELECT avatar FROM platform_user WHERE id = c.from_user_id))
      END as contact_avatar
      FROM card_connections c
      WHERE c.customer_id = ? AND (c.from_user_id = ? OR c.to_user_id = ?) AND c.status = 'accepted'
      ORDER BY c.exchanged_at DESC`).all(userId, userId, userId, userId, userId, req.customerId, userId, userId);
    res.json({ connections });
  });

  // 更新人脉（分组/备注）
  router.put('/connections/:id', tenant, (req, res) => {
    const { id } = req.params;
    const userId = currentUserId(req);
    const conn = belongsToTenant('card_connections', id, req.customerId);
    if (!conn || conn.__crossTenant) return res.status(404).json({ error: '人脉不存在' });
    if (conn.from_user_id !== userId && conn.to_user_id !== userId) return res.status(403).json({ error: '无权操作' });
    if (conn.status !== 'accepted') return res.status(400).json({ error: '仅已建立的人脉可编辑' });
    const { groupName, remark } = req.body || {};
    db.prepare("UPDATE card_connections SET group_name = COALESCE(?, group_name), remark = COALESCE(?, remark), updated_at = datetime('now') WHERE id = ?")
      .run(groupName ?? null, remark ?? null, id);
    res.json({ success: true });
  });

  // 删除人脉（不影响已转客户）
  router.delete('/connections/:id', tenant, (req, res) => {
    const { id } = req.params;
    const userId = currentUserId(req);
    const conn = belongsToTenant('card_connections', id, req.customerId);
    if (!conn || conn.__crossTenant) return res.status(404).json({ error: '人脉不存在' });
    if (conn.from_user_id !== userId && conn.to_user_id !== userId) return res.status(403).json({ error: '无权操作' });
    db.prepare('DELETE FROM card_connections WHERE id = ?').run(id);
    audit(db, req, 'delete_connection', 'connection', id, '删除人脉');
    res.json({ success: true });
  });

  // 人脉转客户（手动转换，快照优先）
  router.post('/connections/:id/convert-customer', tenant, (req, res) => {
    const { id } = req.params;
    const userId = currentUserId(req);
    const connection = belongsToTenant('card_connections', id, req.customerId);
    if (!connection || connection.__crossTenant) return res.status(404).json({ error: '人脉不存在' });
    if (connection.status !== 'accepted') return res.status(400).json({ error: '仅已建立的人脉可转为客户' });

    const contactUserId = connection.from_user_id === userId ? connection.to_user_id : connection.from_user_id;

    // 优先用交换快照（离线保留），否则读实时名片
    let name = '', phone = '', company = '', position = '', avatar = '';
    try {
      const snap = JSON.parse(connection.snapshot || '{}');
      // 快照 from=发起方名片、to=接收方名片；我是发起方时对方快照在 to，否则在 from
      const theirs = connection.from_user_id === userId ? (snap.to || null) : (snap.from || null);
      if (theirs) { name = theirs.name || ''; position = theirs.position || ''; company = theirs.company || ''; phone = theirs.phone || ''; avatar = theirs.avatar || ''; }
    } catch {}
    if (!name) {
      const profile = db.prepare('SELECT * FROM card_profile WHERE user_id = ? LIMIT 1').get(contactUserId);
      if (!profile) return res.status(404).json({ error: '对方未创建名片' });
      name = profile.name; phone = profile.phone || ''; company = profile.company || ''; position = profile.position || ''; avatar = profile.avatar || '';
    }

    // 唯一性：同一用户不能重复转同一人脉为客户
    const existing = db.prepare('SELECT id FROM card_customer WHERE customer_id = ? AND owner_user_id = ? AND source_user_id = ?').get(req.customerId, userId, contactUserId);
    if (existing) return res.status(400).json({ error: '已转为客户' });

    db.prepare(`INSERT INTO card_customer (customer_id, owner_user_id, owner_type, name, phone, company, position, source, source_user_id)
      VALUES (?, ?, 'individual', ?, ?, ?, ?, 'connection', ?)`).run(
      req.customerId, userId, name, phone, company, position, contactUserId
    );
    res.json({ success: true });
  });

  // 本人入驻申请状态（comboAuth 认证即可；未绑定租户时也可查询）
  function applyStatusOf(db, userId) {
    const ind = db.prepare(`SELECT i.status, i.customer_id, i.updated_at, p.customer_name, p.status AS project_status
      FROM tenant_individuals i JOIN projects p ON p.id = i.customer_id
      WHERE i.user_id = ? ORDER BY i.id DESC LIMIT 1`).get(userId);
    if (ind) {
      return { status: ind.status, type: 'individual', customerId: ind.customer_id, customerName: ind.customer_name, projectStatus: ind.project_status, updatedAt: ind.updated_at };
    }
    const ent = db.prepare(`SELECT e.status, e.customer_id, e.updated_at, p.customer_name, p.status AS project_status
      FROM tenant_enterprises e JOIN projects p ON p.id = e.customer_id
      WHERE e.admin_user_id = ? ORDER BY e.id DESC LIMIT 1`).get(userId);
    if (ent) {
      return { status: ent.status, type: 'enterprise', customerId: ent.customer_id, customerName: ent.customer_name, projectStatus: ent.project_status, updatedAt: ent.updated_at };
    }
    return { status: 'none' };
  }

  // 本人入驻申请状态查询（供 H5 展示"未入驻/审核中/已通过/已拒绝"）
  router.get('/apply/status', (req, res) => {
    const userId = req.user?.id || req.userId;
    if (!userId) return res.status(401).json({ error: '未登录' });
    res.json({ apply: applyStatusOf(db, userId) });
  });

  // ===== 入驻管理 =====
  router.post('/apply', (req, res) => {
    const { type, bindCode, name, phone, position, company, enterpriseName, industry } = req.body;
    const userId = req.user?.id || req.userId;
    if (!userId) return res.status(401).json({ error: '未登录' });
    if (!type || !bindCode || !name || !phone) {
      return res.status(400).json({ error: '缺少必填项' });
    }

    // 口令安全：只匹配 invite_code（含纯数字字符串），禁止按 project id 猜测
    const project = db.prepare('SELECT * FROM projects WHERE invite_code = ?').get(String(bindCode).trim());
    if (!project) return res.status(400).json({ error: '入驻口令无效' });
    if (project.status !== 'active') return res.status(400).json({ error: '该客户项目已停用，无法入驻' });
    if (project.valid_until && project.valid_until < new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ error: '该客户项目已过期，无法入驻' });
    }
    const customerId = project.id;

    // 企业入驻必须提供企业名称（前置校验）
    if (type === 'enterprise' && !enterpriseName) {
      return res.status(400).json({ error: '企业名称不能为空' });
    }

    // 重复/重新申请校验（双身份：个人+企业 允许并存；rejected 允许重新申请）
    const already = type === 'enterprise'
      ? db.prepare('SELECT id, status FROM tenant_enterprises WHERE customer_id = ? AND admin_user_id = ?').get(customerId, userId)
      : db.prepare('SELECT id, status FROM tenant_individuals WHERE customer_id = ? AND user_id = ?').get(customerId, userId);
    if (already && already.status !== 'rejected') {
      return res.status(400).json({
        error: already.status === 'pending' ? '申请审核中，请耐心等待管理员审核' : '已入驻该客户项目，请勿重复入驻'
      });
    }
    if (already && already.status === 'rejected') {
      // 拒绝后重新申请：更新为待审 + 更新资料
      if (type === 'individual') {
        db.prepare("UPDATE tenant_individuals SET status = 'pending', name = ?, phone = ?, position = ?, company = ?, updated_at = datetime('now') WHERE id = ?")
          .run(name, phone, position || '', company || '', already.id);
      } else {
        db.prepare("UPDATE tenant_enterprises SET status = 'pending', name = ?, industry = ?, updated_at = datetime('now') WHERE id = ?")
          .run(enterpriseName, industry || '', already.id);
        db.prepare("UPDATE tenant_enterprise_employees SET name = ?, position = ?, status = 'pending', updated_at = datetime('now') WHERE enterprise_id = ? AND user_id = ?")
          .run(name, position || '', already.id, userId);
      }
      db.prepare('INSERT INTO tenant_invite_log (customer_id, invite_code, user_id) VALUES (?, ?, ?)').run(customerId, String(bindCode).trim(), userId);
      return res.json({ success: true, message: '申请已重新提交，请等待租户管理员审核' });
    }

    // 配额校验
    let quota = {};
    try { quota = JSON.parse(project.quota || '{}'); } catch {}
    if (type === 'individual' && quota.max_individuals) {
      const cur = db.prepare("SELECT COUNT(*) as n FROM tenant_individuals WHERE customer_id = ? AND status != 'disabled'").get(customerId).n;
      if (cur >= quota.max_individuals) return res.status(400).json({ error: '入驻个人数量已达上限' });
    }
    if (type === 'enterprise') {
      const cur = db.prepare("SELECT COUNT(*) as n FROM tenant_enterprises WHERE customer_id = ? AND status != 'disabled'").get(customerId).n;
      if (quota.max_enterprises && cur >= quota.max_enterprises) return res.status(400).json({ error: '入驻企业数量已达上限' });
    }

    // 口令使用审计
    db.prepare('INSERT INTO tenant_invite_log (customer_id, invite_code, user_id) VALUES (?, ?, ?)').run(customerId, String(bindCode).trim(), userId);
    // 审核流：创建 pending，不绑定租户（审核通过后由 apply/audit 完成绑定）

    if (type === 'individual') {
      db.prepare(`INSERT INTO tenant_individuals (customer_id, user_id, name, phone, position, company, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')`).run(customerId, userId, name, phone, position || '', company || '');
    } else {
      const result = db.prepare(`INSERT INTO tenant_enterprises (customer_id, name, industry, admin_user_id, status)
        VALUES (?, ?, ?, ?, 'pending')`).run(customerId, enterpriseName, industry || '', userId);
      const enterpriseId = result.lastInsertRowid;
      db.prepare(`INSERT INTO tenant_enterprise_employees (enterprise_id, customer_id, user_id, name, position, role, status)
        VALUES (?, ?, ?, ?, ?, 'admin', 'pending')`).run(enterpriseId, customerId, userId, name, position || '');
    }
    res.json({ success: true, message: '申请已提交，请等待租户管理员审核' });
  });

  // 入驻申请审核（租户管理员）：approve→active+绑定租户；reject→rejected
  router.post('/apply/audit', tenant, requireTenantAdmin, (req, res) => {
    const { type, id, action } = req.body; // type: individual/enterprise, action: approve/reject
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });
    const status = action === 'approve' ? 'active' : 'rejected';
    if (type === 'individual') {
      const row = belongsToTenant('tenant_individuals', id, req.customerId);
      if (!row || row.__crossTenant) return res.status(404).json({ error: '申请不存在' });
      if (row.status !== 'pending') return res.status(400).json({ error: '该申请不在待审状态' });
      if (action === 'approve') {
        const q = checkTenantQuota(db, req.customerId, 'max_individuals');
        if (!q.ok) return res.status(403).json({ error: `入驻个人数量已达上限（${q.used}/${q.limit}），请升级套餐后再审核` });
      }
      db.prepare("UPDATE tenant_individuals SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
      if (action === 'approve') {
        // 绑定租户 + 关联名下未关联名片
        db.prepare("UPDATE platform_user SET customer_id = ?, identity_type = 'individual', updated_at = datetime('now') WHERE id = ?")
          .run(req.customerId, row.user_id);
        db.prepare("UPDATE card_profile SET customer_id = ? WHERE user_id = ? AND (customer_id IS NULL OR customer_id = '')").run(req.customerId, row.user_id);
      }
    } else {
      const row = belongsToTenant('tenant_enterprises', id, req.customerId);
      if (!row || row.__crossTenant) return res.status(404).json({ error: '申请不存在' });
      if (row.status !== 'pending') return res.status(400).json({ error: '该申请不在待审状态' });
      if (action === 'approve') {
        const q = checkTenantQuota(db, req.customerId, 'max_enterprises');
        if (!q.ok) return res.status(403).json({ error: `入驻企业数量已达上限（${q.used}/${q.limit}），请升级套餐后再审核` });
      }
      db.prepare("UPDATE tenant_enterprises SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
      db.prepare("UPDATE tenant_enterprise_employees SET status = ?, updated_at = datetime('now') WHERE enterprise_id = ? AND role = 'admin'").run(status, id);
      if (action === 'approve') {
        const admin = db.prepare("SELECT user_id FROM tenant_enterprise_employees WHERE enterprise_id = ? AND role = 'admin'").get(id);
        if (admin) {
          db.prepare("UPDATE platform_user SET customer_id = ?, identity_type = 'employee', updated_at = datetime('now') WHERE id = ?")
            .run(req.customerId, admin.user_id);
          db.prepare("UPDATE card_profile SET enterprise_id = ?, customer_id = ? WHERE user_id = ? AND card_type = 'company' AND (customer_id IS NULL OR customer_id = '')")
            .run(id, req.customerId, admin.user_id);
        }
      }
    }
    audit(db, req, 'audit_apply', type === 'individual' ? 'tenant_individual' : 'tenant_enterprise', id, `入驻申请${action === 'approve' ? '通过' : '拒绝'}`);
    res.json({ success: true });
  });

  // 入驻个人列表（租户管理员）
  router.get('/individuals', tenant, requireTenantAdmin, (req, res) => {
    const individuals = db.prepare(`SELECT i.*, u.phone, u.avatar
      FROM tenant_individuals i
      LEFT JOIN platform_user u ON u.id = i.user_id
      WHERE i.customer_id = ? ORDER BY i.created_at DESC`).all(req.customerId);
    res.json({ individuals });
  });

  // 入驻企业列表（租户管理员）
  router.get('/enterprises', tenant, requireTenantAdmin, (req, res) => {
    const enterprises = db.prepare(`SELECT e.*,
      (SELECT COUNT(*) FROM tenant_enterprise_employees WHERE enterprise_id = e.id AND status = 'active') as employee_count
      FROM tenant_enterprises e
      WHERE e.customer_id = ? ORDER BY e.created_at DESC`).all(req.customerId);
    res.json({ enterprises });
  });

  // 企业员工列表（租户管理员/企业管理员）
  router.get('/enterprises/:id/employees', tenant, (req, res) => {
    const { id } = req.params;
    const enterprise = belongsToTenant('tenant_enterprises', id, req.customerId);
    if (!enterprise || enterprise.__crossTenant) return res.status(404).json({ error: '企业不存在' });
    const userId = currentUserId(req);
    const emp = db.prepare('SELECT * FROM tenant_enterprise_employees WHERE enterprise_id = ? AND user_id = ?').get(id, userId);
    if (!emp && !isPlatformOrTenantAdmin(req)) return res.status(403).json({ error: '无权查看' });
    const employees = db.prepare(`SELECT emp.*, u.phone, u.avatar
      FROM tenant_enterprise_employees emp
      LEFT JOIN platform_user u ON u.id = emp.user_id
      WHERE emp.enterprise_id = ? ORDER BY emp.created_at DESC`).all(id);
    res.json({ employees });
  });

  // 设置企业管理员（企业管理员/租户管理员）
  router.post('/enterprises/:enterpriseId/employees/:empId/set-admin', tenant, (req, res) => {
    const { enterpriseId, empId } = req.params;
    const userId = currentUserId(req);
    const enterprise = belongsToTenant('tenant_enterprises', enterpriseId, req.customerId);
    if (!enterprise || enterprise.__crossTenant) return res.status(404).json({ error: '企业不存在' });
    const emp = belongsToTenant('tenant_enterprise_employees', empId, req.customerId);
    if (!emp || emp.__crossTenant) return res.status(404).json({ error: '员工不存在' });
    // 权限：租户管理员，或该企业管理员（不能给自己降级/提升）
    const isAdmin = isPlatformOrTenantAdmin(req) || (emp.user_id === userId && enterprise.admin_user_id === userId && emp.role === 'admin');
    if (!isAdmin) return res.status(403).json({ error: '仅管理员可操作' });
    db.prepare("UPDATE tenant_enterprise_employees SET role = 'admin', updated_at = datetime('now') WHERE id = ? AND enterprise_id = ?").run(empId, enterpriseId);
    audit(db, req, 'set_enterprise_admin', 'tenant_enterprise_employee', empId, `设置企业#${enterpriseId}管理员`);
    res.json({ success: true });
  });

  // 取消企业管理员
  router.post('/enterprises/:enterpriseId/employees/:empId/remove-admin', tenant, (req, res) => {
    const { enterpriseId, empId } = req.params;
    const userId = currentUserId(req);
    const enterprise = belongsToTenant('tenant_enterprises', enterpriseId, req.customerId);
    if (!enterprise || enterprise.__crossTenant) return res.status(404).json({ error: '企业不存在' });
    const emp = belongsToTenant('tenant_enterprise_employees', empId, req.customerId);
    if (!emp || emp.__crossTenant) return res.status(404).json({ error: '员工不存在' });
    const isAdmin = isPlatformOrTenantAdmin(req) || (emp.user_id === userId && enterprise.admin_user_id === userId && emp.role === 'admin');
    if (!isAdmin) return res.status(403).json({ error: '仅管理员可操作' });
    if (emp.role === 'admin' && emp.id === empId && enterprise.admin_user_id === emp.user_id) {
      return res.status(400).json({ error: '企业至少保留一名管理员' });
    }
    db.prepare("UPDATE tenant_enterprise_employees SET role = 'member', updated_at = datetime('now') WHERE id = ? AND enterprise_id = ?").run(empId, enterpriseId);
    audit(db, req, 'remove_enterprise_admin', 'tenant_enterprise_employee', empId, `取消企业#${enterpriseId}管理员`);
    res.json({ success: true });
  });

  // 企业管理员视角：本企业数据（企业级隔离）
  router.get('/enterprise/my-data', tenant, (req, res) => {
    const userId = currentUserId(req);
    const employee = db.prepare(`SELECT * FROM tenant_enterprise_employees WHERE user_id = ? AND status = 'active' AND customer_id = ?`).get(userId, req.customerId);
    if (!employee) return res.status(403).json({ error: '不是本租户企业员工' });
    const enterprise = db.prepare('SELECT * FROM tenant_enterprises WHERE id = ? AND customer_id = ?').get(employee.enterprise_id, req.customerId);
    if (!enterprise) return res.status(403).json({ error: '企业不存在' });
    const employees = db.prepare("SELECT * FROM tenant_enterprise_employees WHERE enterprise_id = ? AND status = 'active'").all(employee.enterprise_id);
    res.json({ enterprise, employee, employees, isAdmin: employee.role === 'admin' });
  });

  // ===== 停用与回收闭环 =====
  // 启用入驻个人（租户管理员）：恢复 active + 重新绑定租户
  router.post('/individuals/:id/enable', tenant, requireTenantAdmin, (req, res) => {
    const { id } = req.params;
    const individual = belongsToTenant('tenant_individuals', id, req.customerId);
    if (!individual) return res.status(404).json({ error: '不存在' });
    if (individual.__crossTenant) return res.status(403).json({ error: '无权操作' });
    if (individual.status === 'active') return res.json({ success: true, message: '已是正常状态' });
    db.prepare("UPDATE tenant_individuals SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(id);
    // 重新绑定租户（双身份：若已是企业员工则保留 employee 身份）
    const emp = db.prepare('SELECT id FROM tenant_enterprise_employees WHERE customer_id = ? AND user_id = ? AND status = ?').get(req.customerId, individual.user_id, 'active');
    db.prepare("UPDATE platform_user SET customer_id = ?, identity_type = ?, updated_at = datetime('now') WHERE id = ?")
      .run(req.customerId, emp ? 'employee' : 'individual', individual.user_id);
    audit(db, req, 'enable_individual', 'tenant_individual', id, `启用入驻个人#${id}`);
    res.json({ success: true });
  });

  // 启用入驻企业（租户管理员）：仅恢复企业主体，员工需重新加入（员工停用已回收客户）
  router.post('/enterprises/:id/enable', tenant, requireTenantAdmin, (req, res) => {
    const { id } = req.params;
    const enterprise = belongsToTenant('tenant_enterprises', id, req.customerId);
    if (!enterprise) return res.status(404).json({ error: '不存在' });
    if (enterprise.__crossTenant) return res.status(403).json({ error: '无权操作' });
    if (enterprise.status === 'active') return res.json({ success: true, message: '已是正常状态' });
    db.prepare("UPDATE tenant_enterprises SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(id);
    // 企业管理员重新绑定租户
    if (enterprise.admin_user_id) {
      const adm = db.prepare('SELECT id FROM platform_user WHERE id = ?').get(enterprise.admin_user_id);
      if (adm) db.prepare("UPDATE platform_user SET customer_id = ?, identity_type = ?, updated_at = datetime('now') WHERE id = ?")
        .run(req.customerId, 'employee', enterprise.admin_user_id);
    }
    audit(db, req, 'enable_enterprise', 'tenant_enterprise', id, `启用入驻企业#${id}`);
    res.json({ success: true });
  });

  // 停用入驻个人（回收客户到租户公海）
  router.post('/individuals/:id/disable', tenant, requireTenantAdmin, (req, res) => {
    const { id } = req.params;
    const individual = belongsToTenant('tenant_individuals', id, req.customerId);
    if (!individual) return res.status(404).json({ error: '不存在' });
    if (individual.__crossTenant) return res.status(403).json({ error: '无权操作' });

    db.prepare("UPDATE tenant_individuals SET status = 'disabled', updated_at = datetime('now') WHERE id = ?").run(id);
    // 移除集市
    removeFromMarket(req.customerId, 'individual', id);
    // 回收客户到租户公海（幂等查重）
    const customers = db.prepare("SELECT * FROM card_customer WHERE customer_id = ? AND owner_user_id = ? AND owner_type = 'individual'").all(req.customerId, individual.user_id);
    floatUpToTenantPool(customers, req.customerId, 'individual', id);
    // 删除名下客户（归属回收）
    db.prepare("DELETE FROM card_customer WHERE customer_id = ? AND owner_user_id = ? AND owner_type = 'individual'").run(req.customerId, individual.user_id);
    // 解除租户绑定
    const other = db.prepare('SELECT id FROM tenant_enterprise_employees WHERE customer_id = ? AND user_id = ?').get(req.customerId, individual.user_id);
    if (!other) db.prepare('UPDATE platform_user SET customer_id = NULL, identity_type = ? WHERE id = ?').run('', individual.user_id);
    audit(db, req, 'disable_individual', 'tenant_individual', id, `停用入驻个人#${id}，回收客户 ${customers.length} 条到租户公海`);
    res.json({ success: true, recycled: customers.length });
  });

  // 停用入驻企业（员工失效 + 企业公海上浮开关 + 员工客户回收租户公海）
  router.post('/enterprises/:id/disable', tenant, requireTenantAdmin, (req, res) => {
    const { id } = req.params;
    const enterprise = belongsToTenant('tenant_enterprises', id, req.customerId);
    if (!enterprise) return res.status(404).json({ error: '不存在' });
    if (enterprise.__crossTenant) return res.status(403).json({ error: '无权操作' });

    let config = {};
    try { config = JSON.parse(enterprise.config || '{}'); } catch {}
    const autoRecycle = config.auto_recycle !== false; // 默认上浮租户公海

    db.prepare("UPDATE tenant_enterprises SET status = 'disabled', updated_at = datetime('now') WHERE id = ?").run(id);
    db.prepare("UPDATE tenant_enterprise_employees SET status = 'left', updated_at = datetime('now') WHERE enterprise_id = ?").run(id);

    // 移除集市（企业+员工条目）
    removeFromMarket(req.customerId, 'enterprise', id, id);
    db.prepare("DELETE FROM card_market_items WHERE customer_id = ? AND subject_type = 'employee' AND enterprise_id = ?").run(req.customerId, id);

    // 1) 企业公海 available 客户：按 auto_recycle 开关决定上浮/保留
    if (autoRecycle) {
      const entPool = db.prepare("SELECT * FROM enterprise_public_pool WHERE enterprise_id = ? AND status = 'available'").all(id);
      floatUpToTenantPool(entPool, req.customerId, 'enterprise', id);
    }
    // 2) 员工名下客户：全部回收租户公海（幂等查重）
    const employees = db.prepare('SELECT * FROM tenant_enterprise_employees WHERE enterprise_id = ?').all(id);
    for (const emp of employees) {
      const custs = db.prepare("SELECT * FROM card_customer WHERE customer_id = ? AND owner_user_id = ? AND owner_type = 'employee'").all(req.customerId, emp.user_id);
      floatUpToTenantPool(custs, req.customerId, 'employee', id);
      db.prepare("DELETE FROM card_customer WHERE customer_id = ? AND owner_user_id = ? AND owner_type = 'employee'").run(req.customerId, emp.user_id);
      db.prepare('UPDATE platform_user SET customer_id = NULL, identity_type = ? WHERE id = ?').run('', emp.user_id);
    }
    // 3) 企业公海已领取未跟进客户也回收（防流失）
    if (autoRecycle) {
      const claimed = db.prepare("SELECT * FROM enterprise_public_pool WHERE enterprise_id = ? AND status = 'claimed'").all(id);
      floatUpToTenantPool(claimed, req.customerId, 'enterprise', id);
      db.prepare("DELETE FROM enterprise_public_pool WHERE enterprise_id = ?").run(id);
    }

    audit(db, req, 'disable_enterprise', 'tenant_enterprise', id, `停用入驻企业#${id}，回收员工 ${employees.length} 人客户到租户公海（auto_recycle=${autoRecycle}）`);
    res.json({ success: true, recycledEmployees: employees.length });
  });

  // 停用企业员工（回收客户到企业公海）
  router.post('/employees/:id/disable', tenant, (req, res) => {
    const { id } = req.params;
    const userId = currentUserId(req);
    const emp = belongsToTenant('tenant_enterprise_employees', id, req.customerId);
    if (!emp || emp.__crossTenant) return res.status(404).json({ error: '员工不存在' });

    const enterprise = db.prepare('SELECT * FROM tenant_enterprises WHERE id = ? AND customer_id = ?').get(emp.enterprise_id, req.customerId);
    if (!enterprise) return res.status(404).json({ error: '企业不存在' });
    // 权限：租户管理员 或 该企业管理员（不能停用自己）
    const isAdmin = isPlatformOrTenantAdmin(req) || (enterprise.admin_user_id === userId && emp.user_id !== userId);
    if (!isAdmin) return res.status(403).json({ error: '仅管理员可操作' });

    db.prepare("UPDATE tenant_enterprise_employees SET status = 'left', updated_at = datetime('now') WHERE id = ?").run(id);
    // 移除集市
    removeFromMarket(req.customerId, 'employee', id, emp.enterprise_id);
    // 回收客户到企业公海（幂等查重）
    const custs = db.prepare("SELECT * FROM card_customer WHERE customer_id = ? AND owner_user_id = ? AND owner_type = 'employee'").all(req.customerId, emp.user_id);
    recycleToEnterprisePool(custs, emp.enterprise_id, req.customerId, 'employee', id);
    db.prepare("DELETE FROM card_customer WHERE customer_id = ? AND owner_user_id = ? AND owner_type = 'employee'").run(req.customerId, emp.user_id);
    // 若员工同时也是入驻个人，保留租户绑定；否则解绑
    const ind = db.prepare("SELECT id FROM tenant_individuals WHERE customer_id = ? AND user_id = ? AND status = 'active'").get(req.customerId, emp.user_id);
    if (!ind) db.prepare('UPDATE platform_user SET customer_id = NULL, identity_type = ? WHERE id = ?').run('', emp.user_id);
    audit(db, req, 'disable_employee', 'tenant_enterprise_employee', id, `停用企业员工#${id}，回收客户 ${custs.length} 条到企业公海`);
    res.json({ success: true, recycled: custs.length });
  });

  // ===== 租户公海池 =====
  router.get('/public-pool', tenant, (req, res) => {
    // 惰性超时回收
    let cfg = {};
    const proj = db.prepare('SELECT quota FROM projects WHERE id = ?').get(req.customerId);
    try { cfg = JSON.parse(proj?.quota || '{}'); } catch {}
    checkTimeoutRecycle(req.customerId, cfg.pool_recycle_days || 30);
    // 全量状态返回（含已领取），并 JOIN 领取人昵称便于列表展示
    const pool = db.prepare(`SELECT p.*, u.nickname AS claimedByName
      FROM tenant_public_pool p LEFT JOIN platform_user u ON u.id = p.claimed_by
      WHERE p.customer_id = ? ORDER BY p.recycled_at DESC`).all(req.customerId);
    res.json({ pool });
  });

  // 公海可分配成员列表（管理员分配用）：本租户活跃入驻个人 + 企业员工
  router.get('/public-pool/members', tenant, (req, res) => {
    const members = db.prepare(`
      SELECT u.id AS userId, u.nickname AS nickname, u.phone AS phone,
             'individual' AS type, ind.id AS subjectId, ind.name AS displayName
        FROM tenant_individuals ind JOIN platform_user u ON u.id = ind.user_id
       WHERE ind.customer_id = ? AND ind.status = 'active'
      UNION ALL
      SELECT u.id AS userId, u.nickname AS nickname, u.phone AS phone,
             'employee' AS type, emp.id AS subjectId, emp.name AS displayName
        FROM tenant_enterprise_employees emp JOIN platform_user u ON u.id = emp.user_id
       WHERE emp.customer_id = ? AND emp.status = 'active'
      ORDER BY type ASC, displayName ASC`).all(req.customerId, req.customerId);
    res.json({ members });
  });

  // 管理员分配公海客户给指定成员（原子更新防并发重复分配）
  router.post('/public-pool/:id/assign', tenant, (req, res) => {
    const { id } = req.params;
    const assigneeUserId = Number(req.body?.assigneeUserId);
    const operatorId = currentUserId(req);
    if (!operatorId) return res.status(401).json({ error: '未登录' });
    if (!assigneeUserId) return res.status(400).json({ error: '请选择分配对象' });

    // 操作者须为管理员：平台/租户管理员，入驻企业管理员（员工表 role=admin），
    // 或后台账号声明企业身份（users.enterprise_id，企业属于本租户且激活）
    const entRole = currentEnterpriseRole(operatorId);
    const claimEntId = req.user?.enterpriseId;
    const isEntAdminByClaim = !!claimEntId && !!db.prepare(
      "SELECT id FROM tenant_enterprises WHERE id = ? AND customer_id = ? AND status = 'active'"
    ).get(claimEntId, req.customerId);
    const isAdmin = isPlatformOrTenantAdmin(req) || (entRole && entRole.role === 'admin') || isEntAdminByClaim;
    if (!isAdmin) return res.status(403).json({ error: '仅管理员可分配公海客户' });

    // 被分配人必须是本租户活跃成员（入驻个人/企业员工）
    const target = db.prepare(`SELECT id, type FROM (
        SELECT id, 'individual' AS type FROM tenant_individuals
         WHERE customer_id = ? AND user_id = ? AND status = 'active'
        UNION ALL
        SELECT id, 'employee' AS type FROM tenant_enterprise_employees
         WHERE customer_id = ? AND user_id = ? AND status = 'active'
      ) LIMIT 1`).get(req.customerId, assigneeUserId, req.customerId, assigneeUserId);
    if (!target) return res.status(400).json({ error: '分配对象不是本租户活跃成员' });

    const item = db.prepare('SELECT * FROM tenant_public_pool WHERE id = ? AND customer_id = ?').get(id, req.customerId);
    if (!item) return res.status(404).json({ error: '客户不存在' });
    if (item.status !== 'available') return res.status(400).json({ error: '客户已被领取或分配' });

    // 原子更新：仅 available→claimed 成功才归属
    const upd = db.prepare("UPDATE tenant_public_pool SET status = 'claimed', claimed_by = ?, claimed_at = datetime('now'), last_follow_at = datetime('now') WHERE id = ? AND status = 'available'").run(assigneeUserId, id);
    if (upd.changes === 0) return res.status(400).json({ error: '客户已被领取或分配' });

    const ownerType = target.type === 'employee' ? 'employee' : 'individual';
    const cid = db.prepare(`INSERT INTO card_customer (customer_id, owner_user_id, owner_type, name, phone, company, position, source, source_type, source_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'public_pool', ?, ?)`).run(
      req.customerId, assigneeUserId, ownerType, item.name, item.phone || '', item.company || '', item.position || '', item.source_type || '', item.source_id || null
    );
    res.json({ success: true, customerId: cid.lastInsertRowid, assigneeUserId });
  });

  // 领取公海客户（本租户成员；原子更新防并发重复领取）
  router.post('/public-pool/:id/claim', tenant, (req, res) => {
    const { id } = req.params;
    const userId = currentUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });

    // 领取人必须是本租户活跃成员（个人/员工）
    const member = db.prepare("SELECT id FROM tenant_individuals WHERE customer_id = ? AND user_id = ? AND status = 'active'").get(req.customerId, userId)
      || db.prepare("SELECT id FROM tenant_enterprise_employees WHERE customer_id = ? AND user_id = ? AND status = 'active'").get(req.customerId, userId);
    if (!member) return res.status(403).json({ error: '仅本租户成员可领取' });

    const item = db.prepare('SELECT * FROM tenant_public_pool WHERE id = ? AND customer_id = ?').get(id, req.customerId);
    if (!item) return res.status(404).json({ error: '客户不存在' });
    if (item.status !== 'available') return res.status(400).json({ error: '客户已被领取' });

    // 原子更新：仅 available→claimed 成功才归属
    const upd = db.prepare("UPDATE tenant_public_pool SET status = 'claimed', claimed_by = ?, claimed_at = datetime('now'), last_follow_at = datetime('now') WHERE id = ? AND status = 'available'").run(userId, id);
    if (upd.changes === 0) return res.status(400).json({ error: '客户已被领取' });

    // 领取人身份：员工领到个人名下（owner_type 取实际主体）
    const emp = db.prepare("SELECT id FROM tenant_enterprise_employees WHERE customer_id = ? AND user_id = ? AND status = 'active'").get(req.customerId, userId);
    const ownerType = emp ? 'employee' : 'individual';
    const cid = db.prepare(`INSERT INTO card_customer (customer_id, owner_user_id, owner_type, name, phone, company, position, source, source_type, source_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'public_pool', ?, ?)`).run(
      req.customerId, userId, ownerType, item.name, item.phone || '', item.company || '', item.position || '', item.source_type || '', item.source_id || null
    );
    res.json({ success: true, customerId: cid.lastInsertRowid });
  });

  // ===== 企业公海池 =====
  router.get('/enterprise-public-pool', tenant, (req, res) => {
    const userId = currentUserId(req);
    const employee = db.prepare("SELECT * FROM tenant_enterprise_employees WHERE user_id = ? AND status = 'active' AND customer_id = ?").get(userId, req.customerId);
    if (!employee) return res.status(403).json({ error: '不是企业员工' });
    let cfg = {};
    try { cfg = JSON.parse(db.prepare('SELECT config FROM tenant_enterprises WHERE id = ?').get(employee.enterprise_id)?.config || '{}'); } catch {}
    checkEnterpriseTimeoutRecycle(employee.enterprise_id, cfg.pool_recycle_days || 30);
    const pool = db.prepare("SELECT * FROM enterprise_public_pool WHERE enterprise_id = ? AND status = 'available' ORDER BY recycled_at DESC").all(employee.enterprise_id);
    res.json({ pool });
  });

  // 领取企业公海客户（本企业员工；原子更新）
  router.post('/enterprise-public-pool/:id/claim', tenant, (req, res) => {
    const { id } = req.params;
    const userId = currentUserId(req);
    const employee = db.prepare("SELECT * FROM tenant_enterprise_employees WHERE user_id = ? AND status = 'active' AND customer_id = ?").get(userId, req.customerId);
    if (!employee) return res.status(403).json({ error: '不是企业员工' });

    const item = db.prepare('SELECT * FROM enterprise_public_pool WHERE id = ? AND enterprise_id = ?').get(id, employee.enterprise_id);
    if (!item) return res.status(404).json({ error: '客户不存在' });
    if (item.status !== 'available') return res.status(400).json({ error: '客户已被领取' });

    const upd = db.prepare("UPDATE enterprise_public_pool SET status = 'claimed', claimed_by = ?, claimed_at = datetime('now'), last_follow_at = datetime('now') WHERE id = ? AND status = 'available'").run(userId, id);
    if (upd.changes === 0) return res.status(400).json({ error: '客户已被领取' });

    db.prepare(`INSERT INTO card_customer (customer_id, owner_user_id, owner_type, name, phone, company, position, source, source_type, source_id)
      VALUES (?, ?, 'employee', ?, ?, ?, ?, 'enterprise_pool', ?, ?)`).run(
      item.customer_id, userId, item.name, item.phone || '', item.company || '', item.position || '', item.source_type || '', item.source_id || null
    );
    res.json({ success: true });
  });

  // 更新企业配置（auto_recycle/pool_recycle_days 等）
  router.put('/enterprises/:id/config', tenant, (req, res) => {
    const { id } = req.params;
    const enterprise = belongsToTenant('tenant_enterprises', id, req.customerId);
    if (!enterprise || enterprise.__crossTenant) return res.status(404).json({ error: '企业不存在' });
    const userId = currentUserId(req);
    if (!isPlatformOrTenantAdmin(req) && enterprise.admin_user_id !== userId) {
      return res.status(403).json({ error: '仅企业管理员可配置' });
    }
    const { config } = req.body;
    db.prepare("UPDATE tenant_enterprises SET config = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(config || {}), id);
    audit(db, req, 'update_enterprise_config', 'tenant_enterprise', id, '更新企业配置');
    res.json({ success: true });
  });

  // ===== 客户状态机 =====
  // 更新客户状态（pending→following→deal/invalid），仅归属人/企业管理员/租户管理员
  router.post('/customers/:id/status', tenant, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const valid = ['pending', 'following', 'deal', 'invalid'];
    if (!valid.includes(status)) return res.status(400).json({ error: '非法状态' });
    const userId = currentUserId(req);
    const cust = belongsToTenant('card_customer', id, req.customerId);
    if (!cust || cust.__crossTenant) return res.status(404).json({ error: '客户不存在' });

    const isOwner = cust.owner_user_id === userId;
    const isEntAdmin = isPlatformOrTenantAdmin(req) || (() => {
      const e = db.prepare("SELECT * FROM tenant_enterprise_employees WHERE user_id = ? AND status = 'active'").get(userId);
      if (!e || cust.owner_type !== 'employee') return false;
      const ent = db.prepare('SELECT * FROM tenant_enterprises WHERE id = ?').get(e.enterprise_id);
      return ent && ent.admin_user_id === userId;
    })();
    if (!isOwner && !isEntAdmin) return res.status(403).json({ error: '无权操作该客户' });

    const from = cust.status;
    // 状态迁移合法性：deal/invalid 为终态，不可再改
    if ((from === 'deal' || from === 'invalid') && status !== from) {
      return res.status(400).json({ error: '终态客户不可变更状态' });
    }
    db.prepare("UPDATE card_customer SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    // 跟进时间戳联动公海超时
    if (status === 'following') {
      db.prepare(`UPDATE tenant_public_pool SET last_follow_at = datetime('now') WHERE customer_id = ? AND phone = ? AND status = 'claimed'`).run(req.customerId, cust.phone || '');
      db.prepare(`UPDATE enterprise_public_pool SET last_follow_at = datetime('now') WHERE customer_id = ? AND phone = ? AND status = 'claimed'`).run(req.customerId, cust.phone || '');
    }
    audit(db, req, 'update_customer_status', 'card_customer', id, `客户状态 ${from} → ${status}`);
    res.json({ success: true, from, to: status });
  });

  // ===== 表单管理 =====
  router.get('/forms', tenant, requireTenantAdmin, (req, res) => {
    const rows = db.prepare(`SELECT f.*, (SELECT COUNT(*) FROM card_form_submission s WHERE s.form_id = f.id) AS submission_count
      FROM card_form_template f WHERE f.customer_id = ? ORDER BY f.created_at DESC`).all(req.customerId);
    res.json({ forms: rows.map((r) => ({ ...r, cardId: r.card_id || null, submissionCount: r.submission_count, fields: JSON.parse(r.fields || '[]') })) });
  });

  router.post('/forms', tenant, requireTenantAdmin, (req, res) => {
    const userId = currentUserId(req);
    const { title, description, fields, cardId } = req.body;
    if (!title) return res.status(400).json({ error: '缺少标题' });
    if (cardId) {
      const card = db.prepare('SELECT id, user_id, customer_id FROM card_profile WHERE id = ?').get(cardId);
      if (!card) return res.status(400).json({ error: '所选名片不存在' });
      const cardCust = card.customer_id || (() => {
        const t = db.prepare('SELECT customer_id FROM tenant_individuals WHERE user_id = ? AND status = ? LIMIT 1').get(card.user_id, 'active')
          || db.prepare('SELECT customer_id FROM tenant_enterprise_employees WHERE user_id = ? AND status = ? LIMIT 1').get(card.user_id, 'active');
        return t?.customer_id || null;
      })();
      if (cardCust && cardCust !== req.customerId) return res.status(400).json({ error: '所选名片不属于当前租户' });
    }
    const result = db.prepare(`INSERT INTO card_form_template (customer_id, title, description, fields, card_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?)`).run(req.customerId, title, description || '', JSON.stringify(fields || []), cardId || null, userId);
    res.json({ id: result.lastInsertRowid, success: true });
  });

  // 提交表单（访客公开提交；仅 active 表单可提交；挂载名片时线索回流到名片主人客户列表）
  router.post('/forms/:id/submit', (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || req.userId || null;
    const { data } = req.body;
    const form = db.prepare('SELECT * FROM card_form_template WHERE id = ? AND status = ?').get(id, 'active');
    if (!form) return res.status(404).json({ error: '表单不存在或已停用' });
    db.prepare(`INSERT INTO card_form_submission (form_id, customer_id, user_id, data)
      VALUES (?, ?, ?, ?)`).run(id, form.customer_id, userId, JSON.stringify(data || {}));
    // 线索回流：表单挂载名片 → 写入名片主人客户列表（同手机号已存在则跳过）
    let leadRecycled = false;
    if (form.card_id) {
      const card = db.prepare('SELECT id, user_id, customer_id FROM card_profile WHERE id = ?').get(form.card_id);
      if (card) {
        const d = data || {};
        const phone = String(d.phone || d.tel || d.mobile || '').trim();
        const name = String(d.name || d.contact || '').trim() || '表单线索';
        const dup = db.prepare('SELECT id FROM card_customer WHERE customer_id = ? AND owner_user_id = ? AND phone = ?')
          .get(form.customer_id, card.user_id, phone);
        if (!dup) {
          db.prepare(`INSERT INTO card_customer (owner_user_id, customer_id, owner_type, name, phone, company, source, source_type, source_id)
            VALUES (?, ?, 'individual', ?, ?, '', 'form', 'form', ?)`).run(card.user_id, form.customer_id, name, phone, form.id);
          leadRecycled = true;
        }
      }
    }
    res.json({ success: true, leadRecycled });
  });

  // 表单提交记录（租户管理员，且仅本租户表单）
  router.get('/forms/:id/submissions', tenant, requireTenantAdmin, (req, res) => {
    const { id } = req.params;
    const form = belongsToTenant('card_form_template', id, req.customerId);
    if (!form || form.__crossTenant) return res.status(404).json({ error: '表单不存在' });
    const submissions = db.prepare('SELECT * FROM card_form_submission WHERE form_id = ? ORDER BY submitted_at DESC').all(id);
    res.json({ submissions });
  });

  // 更新表单（标题/说明/字段/状态；已有提交记录的表单仅允许改状态）
  router.put('/forms/:id', tenant, requireTenantAdmin, (req, res) => {
    const { id } = req.params;
    const form = belongsToTenant('card_form_template', id, req.customerId);
    if (!form || form.__crossTenant) return res.status(404).json({ error: '表单不存在' });
    const { title, description, fields, status } = req.body;
    const hasSub = db.prepare('SELECT COUNT(*) AS c FROM card_form_submission WHERE form_id = ?').get(id).c > 0;
    if (hasSub && (title !== undefined || fields !== undefined)) {
      return res.status(400).json({ error: '已有提交记录的表单不可修改内容，仅可停用' });
    }
    if (status !== undefined) {
      if (!['active', 'disabled'].includes(status)) return res.status(400).json({ error: '非法状态' });
      db.prepare("UPDATE card_form_template SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
      return res.json({ success: true });
    }
    if (!title) return res.status(400).json({ error: '缺少标题' });
    db.prepare(`UPDATE card_form_template SET title = ?, description = ?, fields = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(title, description || '', JSON.stringify(fields || []), id);
    res.json({ success: true });
  });

  // 删除表单（级联删除提交记录）
  router.delete('/forms/:id', tenant, requireTenantAdmin, (req, res) => {
    const { id } = req.params;
    const form = belongsToTenant('card_form_template', id, req.customerId);
    if (!form || form.__crossTenant) return res.status(404).json({ error: '表单不存在' });
    db.prepare('DELETE FROM card_form_submission WHERE form_id = ?').run(id);
    db.prepare('DELETE FROM card_form_template WHERE id = ?').run(id);
    audit(db, req, 'delete_form', 'card_form_template', id, `删除表单「${form.title}」及提交记录`);
    res.json({ success: true });
  });

  // 租户名片列表（表单挂载选择）
  router.get('/cards', tenant, (req, res) => {
    const rows = db.prepare(`SELECT cp.id, cp.name, cp.position FROM card_profile cp
      WHERE cp.customer_id = ? AND cp.status = 'active' ORDER BY cp.id DESC`).all(req.customerId);
    res.json({ cards: rows });
  });

  // ===== 身份上下文（双身份）=====
  // 当前用户在本租户的身份：个人/企业员工/两者
  router.get('/identity', tenant, (req, res) => {
    const userId = currentUserId(req);
    const individual = db.prepare("SELECT id, status FROM tenant_individuals WHERE customer_id = ? AND user_id = ?").get(req.customerId, userId);
    const employee = db.prepare(`SELECT emp.id, emp.role, emp.status, e.name as enterprise_name, e.id as enterprise_id
      FROM tenant_enterprise_employees emp JOIN tenant_enterprises e ON e.id = emp.enterprise_id
      WHERE emp.customer_id = ? AND emp.user_id = ?`).get(req.customerId, userId);
    res.json({
      identity: {
        customerId: req.customerId,
        individual: individual ? { id: individual.id, status: individual.status } : null,
        employee: employee ? { id: employee.id, role: employee.role, status: employee.status, enterpriseId: employee.enterprise_id, enterpriseName: employee.enterprise_name } : null,
        isTenantAdmin: isPlatformOrTenantAdmin(req),
      },
    });
  });

  return router;
}
