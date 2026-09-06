import { Router } from 'express';

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
  router.get('/market/settings', tenant, (req, res) => {
    let settings = db.prepare('SELECT * FROM card_market_settings WHERE customer_id = ?').get(req.customerId);
    if (!settings) {
      db.prepare('INSERT INTO card_market_settings (customer_id) VALUES (?)').run(req.customerId);
      settings = db.prepare('SELECT * FROM card_market_settings WHERE customer_id = ?').get(req.customerId);
    }
    res.json({ settings });
  });

  // 更新集市配置（仅租户管理员）
  router.put('/market/settings', tenant, requireTenantAdmin, (req, res) => {
    const { enabled, auditMode, title, cover, showCompany, showIndustry, showLocation, allowExchange, contactVisible } = req.body;
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
      updated_at = datetime('now')
      WHERE customer_id = ?`).run(
      enabled, auditMode, title, cover, showCompany, showIndustry, showLocation, allowExchange, contactVisible, req.customerId
    );
    res.json({ success: true });
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
    const { type, keyword } = req.query;
    const sw = marketEnabled(req.customerId);
    if (!sw.enabled) return res.json({ items: [], message: '集市未开启' });

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
      END as position
    FROM card_market_items mi
    WHERE mi.customer_id = ? AND mi.audit_status = 'approved'`;

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
    sql += ' ORDER BY mi.is_top DESC, mi.created_at DESC';
    res.json({ items: db.prepare(sql).all(...params) });
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
      const settings = db.prepare('SELECT audit_mode FROM card_market_settings WHERE customer_id = ?').get(req.customerId);
      const auditStatus = settings?.audit_mode === 'manual' ? 'pending' : 'approved';
      // 企业主体上架需要企业id
      const enterpriseId = subjectType === 'enterprise' ? subjectId : (subjectType === 'employee' ? (db.prepare('SELECT enterprise_id FROM tenant_enterprise_employees WHERE id = ?').get(subjectId)?.enterprise_id) : null);
      db.prepare(`INSERT INTO card_market_items (customer_id, subject_type, subject_id, user_id, enterprise_id, audit_status)
        VALUES (?, ?, ?, ?, ?, ?)`).run(req.customerId, subjectType, subjectId, userId, enterpriseId, auditStatus);
      res.json({ success: true, inMarket: true, auditStatus });
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
    res.json({ success: true });
  });

  // 置顶推荐（租户管理员）
  router.post('/market/top', tenant, requireTenantAdmin, (req, res) => {
    const { itemId, isTop } = req.body;
    const item = belongsToTenant('card_market_items', itemId, req.customerId);
    if (!item || item.__crossTenant) return res.status(403).json({ error: '无权操作' });
    db.prepare("UPDATE card_market_items SET is_top = ?, updated_at = datetime('now') WHERE id = ?").run(isTop ? 1 : 0, itemId);
    res.json({ success: true });
  });

  // 强制下架（租户管理员）
  router.post('/market/force-remove', tenant, requireTenantAdmin, (req, res) => {
    const { itemId } = req.body;
    const item = belongsToTenant('card_market_items', itemId, req.customerId);
    if (!item || item.__crossTenant) return res.status(403).json({ error: '无权操作' });
    db.prepare('DELETE FROM card_market_items WHERE id = ?').run(itemId);
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
        return res.json({ success: true, retry: true });
      }
    }

    db.prepare('INSERT INTO card_connections (customer_id, from_user_id, to_user_id, message) VALUES (?, ?, ?, ?)').run(req.customerId, fromUserId, toUserId, message || '');
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
    } else {
      db.prepare("UPDATE card_connections SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(connectionId);
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

  // ===== 人脉库 =====
  router.get('/connections', tenant, (req, res) => {
    const userId = currentUserId(req);
    const connections = db.prepare(`SELECT c.*,
      CASE WHEN c.from_user_id = ? THEN c.to_user_id ELSE c.from_user_id END as contact_user_id,
      COALESCE(
        json_extract(c.snapshot, '$.to.name'),
        (SELECT nickname FROM platform_user WHERE id = CASE WHEN c.from_user_id = ? THEN c.to_user_id ELSE c.from_user_id END)
      ) as contact_name,
      COALESCE(
        json_extract(c.snapshot, '$.to.position'),
        (SELECT position FROM card_profile WHERE user_id = CASE WHEN c.from_user_id = ? THEN c.to_user_id ELSE c.from_user_id END LIMIT 1)
      ) as contact_position,
      COALESCE(
        json_extract(c.snapshot, '$.to.avatar'),
        (SELECT avatar FROM platform_user WHERE id = CASE WHEN c.from_user_id = ? THEN c.to_user_id ELSE c.from_user_id END)
      ) as contact_avatar
      FROM card_connections c
      WHERE c.customer_id = ? AND (c.from_user_id = ? OR c.to_user_id = ?) AND c.status = 'accepted'
      ORDER BY c.exchanged_at DESC`).all(userId, userId, userId, userId, req.customerId, userId, userId);
    res.json({ connections });
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
      const mine = snap.from?.user_id === userId ? snap.from : null;
      const theirs = snap.to || null;
      if (theirs) { name = theirs.name || ''; position = theirs.position || ''; company = theirs.company || ''; phone = theirs.phone || ''; avatar = theirs.avatar || ''; }
      else if (mine) { name = mine.name || ''; position = mine.position || ''; company = mine.company || ''; phone = mine.phone || ''; }
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

    // 重复入驻校验（仅拒绝同类型重复入驻；双身份：个人+企业员工 允许并存）
    const already = type === 'enterprise'
      ? db.prepare('SELECT id FROM tenant_enterprise_employees WHERE customer_id = ? AND user_id = ?').get(customerId, userId)
      : db.prepare('SELECT id FROM tenant_individuals WHERE customer_id = ? AND user_id = ?').get(customerId, userId);
    if (already) return res.status(400).json({ error: '已入驻该客户项目，请勿重复入驻' });

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
    // 绑定租户
    db.prepare("UPDATE platform_user SET customer_id = ?, identity_type = ?, updated_at = datetime('now') WHERE id = ?")
      .run(customerId, type === 'enterprise' ? 'employee' : 'individual', userId);

    if (type === 'individual') {
      db.prepare(`INSERT INTO tenant_individuals (customer_id, user_id, name, phone, position, company, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')`).run(customerId, userId, name, phone, position || '', company || '');
    } else {
      const result = db.prepare(`INSERT INTO tenant_enterprises (customer_id, name, industry, admin_user_id, status)
        VALUES (?, ?, ?, ?, 'active')`).run(customerId, enterpriseName, industry || '', userId);
      const enterpriseId = result.lastInsertRowid;
      db.prepare(`INSERT INTO tenant_enterprise_employees (enterprise_id, customer_id, user_id, name, position, role, status)
        VALUES (?, ?, ?, ?, ?, 'admin', 'active')`).run(enterpriseId, customerId, userId, name, position || '');
    }
    res.json({ success: true, message: '申请已提交，等待审核' });
  });

  // 入驻申请审核（租户管理员）：approve/reject
  router.post('/apply/audit', tenant, requireTenantAdmin, (req, res) => {
    const { type, id, action } = req.body; // type: individual/enterprise
    const status = action === 'approve' ? 'active' : 'rejected';
    if (type === 'individual') {
      const row = belongsToTenant('tenant_individuals', id, req.customerId);
      if (!row || row.__crossTenant) return res.status(404).json({ error: '申请不存在' });
      db.prepare("UPDATE tenant_individuals SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    } else {
      const row = belongsToTenant('tenant_enterprises', id, req.customerId);
      if (!row || row.__crossTenant) return res.status(404).json({ error: '申请不存在' });
      db.prepare("UPDATE tenant_enterprises SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    }
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
    res.json({ success: true, recycled: custs.length });
  });

  // ===== 租户公海池 =====
  router.get('/public-pool', tenant, (req, res) => {
    // 惰性超时回收
    let cfg = {};
    const proj = db.prepare('SELECT quota FROM projects WHERE id = ?').get(req.customerId);
    try { cfg = JSON.parse(proj?.quota || '{}'); } catch {}
    checkTimeoutRecycle(req.customerId, cfg.pool_recycle_days || 30);
    const pool = db.prepare("SELECT * FROM tenant_public_pool WHERE customer_id = ? AND status = 'available' ORDER BY recycled_at DESC").all(req.customerId);
    res.json({ pool });
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
    res.json({ success: true, from, to: status });
  });

  // ===== 表单管理 =====
  router.get('/forms', tenant, requireTenantAdmin, (req, res) => {
    const forms = db.prepare('SELECT * FROM card_form_template WHERE customer_id = ? ORDER BY created_at DESC').all(req.customerId);
    res.json({ forms });
  });

  router.post('/forms', tenant, requireTenantAdmin, (req, res) => {
    const userId = currentUserId(req);
    const { title, description, fields } = req.body;
    if (!title) return res.status(400).json({ error: '缺少标题' });
    const result = db.prepare(`INSERT INTO card_form_template (customer_id, title, description, fields, created_by)
      VALUES (?, ?, ?, ?, ?)`).run(req.customerId, title, description || '', JSON.stringify(fields || []), userId);
    res.json({ id: result.lastInsertRowid, success: true });
  });

  // 提交表单（访客公开提交；仅 active 表单可提交）
  router.post('/forms/:id/submit', (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || req.userId || null;
    const { data } = req.body;
    const form = db.prepare('SELECT * FROM card_form_template WHERE id = ? AND status = ?').get(id, 'active');
    if (!form) return res.status(404).json({ error: '表单不存在或已停用' });
    db.prepare(`INSERT INTO card_form_submission (form_id, customer_id, user_id, data)
      VALUES (?, ?, ?, ?)`).run(id, form.customer_id, userId, JSON.stringify(data || {}));
    res.json({ success: true });
  });

  // 表单提交记录（租户管理员，且仅本租户表单）
  router.get('/forms/:id/submissions', tenant, requireTenantAdmin, (req, res) => {
    const { id } = req.params;
    const form = belongsToTenant('card_form_template', id, req.customerId);
    if (!form || form.__crossTenant) return res.status(404).json({ error: '表单不存在' });
    const submissions = db.prepare('SELECT * FROM card_form_submission WHERE form_id = ? ORDER BY submitted_at DESC').all(id);
    res.json({ submissions });
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
