import { Router } from 'express';

export function createCardMarketRouter(db) {
  const router = Router();

// ===== 集市配置 =====
// 获取租户集市配置
router.get('/market/settings', (req, res) => {
  const customerId = req.customerId || req.user?.customerId;
  if (!customerId) return res.status(400).json({ error: '缺少客户ID' });
  //
  let settings = db.prepare('SELECT * FROM card_market_settings WHERE customer_id = ?').get(customerId);
  if (!settings) {
    db.prepare('INSERT INTO card_market_settings (customer_id) VALUES (?)').run(customerId);
    settings = db.prepare('SELECT * FROM card_market_settings WHERE customer_id = ?').get(customerId);
  }
  res.json({ settings });
});

// 更新集市配置（租户管理员）
router.put('/market/settings', (req, res) => {
  const customerId = req.customerId || req.user?.customerId;
  if (!customerId) return res.status(400).json({ error: '缺少客户ID' });
  const { enabled, auditMode, title, cover, showCompany, showIndustry, showLocation, allowExchange, contactVisible } = req.body;
  //
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
    enabled, auditMode, title, cover, showCompany, showIndustry, showLocation, allowExchange, contactVisible, customerId
  );
  res.json({ success: true });
});

// 集市数据统计
router.get('/market/stats', (req, res) => {
  const customerId = req.customerId || req.user?.customerId;
  if (!customerId) return res.status(400).json({ error: '缺少客户ID' });
  //
  const itemCount = db.prepare('SELECT COUNT(*) as cnt FROM card_market_items WHERE customer_id = ? AND audit_status = ?').get(customerId, 'approved')?.cnt || 0;
  const pendingCount = db.prepare('SELECT COUNT(*) as cnt FROM card_market_items WHERE customer_id = ? AND audit_status = ?').get(customerId, 'pending')?.cnt || 0;
  const exchangeCount = db.prepare('SELECT COUNT(*) as cnt FROM card_connections WHERE customer_id = ? AND status = ?').get(customerId, 'accepted')?.cnt || 0;
  // 访问量暂用名片查看次数估算
  const visitCount = db.prepare('SELECT COALESCE(SUM(view_count), 0) as total FROM card_market_items WHERE customer_id = ?').get(customerId)?.total || 0;
  res.json({ stats: { visitCount, exchangeCount, itemCount, pendingCount } });
});

// ===== 集市列表 =====
// 获取集市列表（仅本租户已审核通过的）
router.get('/market/list', (req, res) => {
  const customerId = req.customerId || req.user?.customerId;
  if (!customerId) return res.status(400).json({ error: '缺少客户ID' });
  const { type, keyword } = req.query;
  //

  // 检查集市是否开启
  const settings = db.prepare('SELECT enabled FROM card_market_settings WHERE customer_id = ?').get(customerId);
  if (settings && !settings.enabled) {
    return res.json({ items: [], message: '集市未开启' });
  }

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

  const params = [customerId];
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

  const items = db.prepare(sql).all(...params);
  res.json({ items });
});

// 上架/下架集市
router.post('/market/toggle', (req, res) => {
  const customerId = req.customerId || req.user?.customerId;
  const userId = req.userId || req.user?.id;
  if (!customerId || !userId) return res.status(400).json({ error: '缺少参数' });
  const { subjectType, subjectId } = req.body;
  //

  const existing = db.prepare('SELECT id FROM card_market_items WHERE customer_id = ? AND subject_type = ? AND subject_id = ?').get(customerId, subjectType, subjectId);
  if (existing) {
    db.prepare('DELETE FROM card_market_items WHERE id = ?').run(existing.id);
    res.json({ success: true, inMarket: false });
  } else {
    // 检查审核模式
    const settings = db.prepare('SELECT audit_mode FROM card_market_settings WHERE customer_id = ?').get(customerId);
    const auditStatus = settings?.audit_mode === 'manual' ? 'pending' : 'approved';
    db.prepare(`INSERT INTO card_market_items (customer_id, subject_type, subject_id, user_id, audit_status)
      VALUES (?, ?, ?, ?, ?)`).run(customerId, subjectType, subjectId, userId, auditStatus);
    res.json({ success: true, inMarket: true, auditStatus });
  }
});

// 检查是否已上架
router.get('/market/check', (req, res) => {
  const customerId = req.customerId || req.user?.customerId;
  const { subjectType, subjectId } = req.query;
  if (!customerId) return res.status(400).json({ error: '缺少参数' });
  //
  const item = db.prepare('SELECT audit_status FROM card_market_items WHERE customer_id = ? AND subject_type = ? AND subject_id = ?').get(customerId, subjectType, subjectId);
  res.json({ inMarket: !!item, auditStatus: item?.audit_status });
});

// ===== 名片交换 =====
// 发起交换
router.post('/exchange/request', (req, res) => {
  const customerId = req.customerId || req.user?.customerId;
  const fromUserId = req.userId || req.user?.id;
  const { toUserId, message } = req.body;
  if (!customerId || !fromUserId || !toUserId) return res.status(400).json({ error: '缺少参数' });
  //

  // 检查是否已存在
  const existing = db.prepare('SELECT id, status FROM card_connections WHERE customer_id = ? AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))').get(customerId, fromUserId, toUserId, toUserId, fromUserId);
  if (existing) {
    if (existing.status === 'accepted') return res.json({ success: true, message: '已是人脉关系' });
    if (existing.status === 'pending') return res.status(400).json({ error: '已发起过交换请求' });
  }

  db.prepare('INSERT INTO card_connections (customer_id, from_user_id, to_user_id, message) VALUES (?, ?, ?, ?)').run(customerId, fromUserId, toUserId, message || '');
  res.json({ success: true });
});

// 处理交换请求（接受/拒绝）
router.post('/exchange/handle', (req, res) => {
  const userId = req.userId || req.user?.id;
  const { connectionId, action } = req.body; // accept/reject
  if (!userId || !connectionId) return res.status(400).json({ error: '缺少参数' });
  //
  const conn = db.prepare('SELECT * FROM card_connections WHERE id = ? AND to_user_id = ?').get(connectionId, userId);
  if (!conn) return res.status(404).json({ error: '请求不存在' });

  const status = action === 'accept' ? 'accepted' : 'rejected';
  db.prepare('UPDATE card_connections SET status = ?, exchanged_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?').run(status, connectionId);
  res.json({ success: true });
});

// 我的交换请求列表
router.get('/exchange/list', (req, res) => {
  const userId = req.userId || req.user?.id;
  if (!userId) return res.status(400).json({ error: '缺少用户ID' });
  //
  const requests = db.prepare(`SELECT c.*,
    (SELECT name FROM platform_user WHERE id = c.from_user_id) as from_name,
    (SELECT name FROM platform_user WHERE id = c.to_user_id) as to_name
    FROM card_connections c
    WHERE c.from_user_id = ? OR c.to_user_id = ?
    ORDER BY c.created_at DESC`).all(userId, userId);
  res.json({ requests });
});

// ===== 人脉库 =====
router.get('/connections', (req, res) => {
  const userId = req.userId || req.user?.id;
  if (!userId) return res.status(400).json({ error: '缺少用户ID' });
  //
  const connections = db.prepare(`SELECT c.*,
    CASE WHEN c.from_user_id = ? THEN c.to_user_id ELSE c.from_user_id END as contact_user_id,
    (SELECT name FROM platform_user WHERE id = CASE WHEN c.from_user_id = ? THEN c.to_user_id ELSE c.from_user_id END) as contact_name,
    (SELECT position FROM card_profile WHERE user_id = CASE WHEN c.from_user_id = ? THEN c.to_user_id ELSE c.from_user_id END LIMIT 1) as contact_position
    FROM card_connections c
    WHERE (c.from_user_id = ? OR c.to_user_id = ?) AND c.status = 'accepted'
    ORDER BY c.exchanged_at DESC`).all(userId, userId, userId, userId, userId);
  res.json({ connections });
});

// 人脉转客户（手动转换，不会自动转换）
router.post('/connections/:id/convert-customer', (req, res) => {
  const { id } = req.params;
  const userId = req.userId || req.user?.id;
  const customerId = req.customerId || req.user?.customerId;
  if (!userId || !customerId) return res.status(400).json({ error: '缺少参数' });
  //
  const connection = db.prepare('SELECT * FROM card_connections WHERE id = ? AND status = \'accepted\'').get(id);
  if (!connection) return res.status(404).json({ error: '人脉不存在' });

  const contactUserId = connection.from_user_id === userId ? connection.to_user_id : connection.from_user_id;
  const profile = db.prepare('SELECT * FROM card_profile WHERE user_id = ? LIMIT 1').get(contactUserId);
  if (!profile) return res.status(404).json({ error: '对方未创建名片' });

  // 检查是否已转为客户
  const existing = db.prepare('SELECT id FROM card_customer WHERE owner_user_id = ? AND source_user_id = ?').get(userId, contactUserId);
  if (existing) return res.status(400).json({ error: '已转为客户' });

  // 添加到客户列表
  db.prepare(`INSERT INTO card_customer (customer_id, owner_user_id, owner_type, name, phone, company, position, source, source_user_id)
    VALUES (?, ?, 'individual', ?, ?, ?, ?, 'connection', ?)`).run(
    customerId, userId, profile.name, profile.phone, profile.company, profile.position, contactUserId
  );

  res.json({ success: true });
});

// ===== 入驻管理 =====
// 提交入驻申请（个人/企业）
router.post('/apply', (req, res) => {
  const { type, bindCode, name, phone, position, company, enterpriseName, industry } = req.body;
  const userId = req.user?.id || req.userId;
  if (!userId) return res.status(401).json({ error: '未登录' });
  if (!type || !bindCode || !name || !phone) {
    return res.status(400).json({ error: '缺少必填项' });
  }
  //
  let customerId = null;
  if (/^\d+$/.test(bindCode)) {
    customerId = parseInt(bindCode);
  } else {
    const project = db.prepare('SELECT id FROM projects WHERE invite_code = ?').get(bindCode);
    if (project) customerId = project.id;
  }
  if (!customerId) {
    return res.status(400).json({ error: '入驻口令无效' });
  }

  if (type === 'individual') {
    db.prepare(`INSERT INTO tenant_individuals (customer_id, user_id, name, phone, position, company, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')`).run(customerId, userId, name, phone, position || '', company || '');
  } else {
    const result = db.prepare(`INSERT INTO tenant_enterprises (customer_id, name, industry, admin_user_id, status)
      VALUES (?, ?, ?, ?, 'pending')`).run(customerId, enterpriseName, industry || '', userId);
    const enterpriseId = result.lastInsertRowid;
    db.prepare(`INSERT INTO tenant_enterprise_employees (enterprise_id, customer_id, user_id, name, position, role, status)
      VALUES (?, ?, ?, ?, ?, 'admin', 'active')`).run(enterpriseId, customerId, userId, name, position || '');
  }
  res.json({ success: true, message: '申请已提交，等待审核' });
});

// 入驻个人列表
router.get('/individuals', (req, res) => {
  const customerId = req.customerId || req.user?.customerId;
  if (!customerId) return res.status(400).json({ error: '缺少客户ID' });
  //
  const individuals = db.prepare(`SELECT i.*, u.phone, u.avatar
    FROM tenant_individuals i
    LEFT JOIN platform_user u ON u.id = i.user_id
    WHERE i.customer_id = ? ORDER BY i.created_at DESC`).all(customerId);
  res.json({ individuals });
});

// 入驻企业列表
router.get('/enterprises', (req, res) => {
  const customerId = req.customerId || req.user?.customerId;
  if (!customerId) return res.status(400).json({ error: '缺少客户ID' });
  //
  const enterprises = db.prepare(`SELECT e.*,
    (SELECT COUNT(*) FROM tenant_enterprise_employees WHERE enterprise_id = e.id AND status = 'active') as employee_count
    FROM tenant_enterprises e
    WHERE e.customer_id = ? ORDER BY e.created_at DESC`).all(customerId);
  res.json({ enterprises });
});

// 企业员工列表
router.get('/enterprises/:id/employees', (req, res) => {
  const { id } = req.params;
  //
  const employees = db.prepare(`SELECT emp.*, u.phone, u.avatar
    FROM tenant_enterprise_employees emp
    LEFT JOIN platform_user u ON u.id = emp.user_id
    WHERE emp.enterprise_id = ? ORDER BY emp.created_at DESC`).all(id);
  res.json({ employees });
});

// 设置企业管理员
router.post('/enterprises/:enterpriseId/employees/:empId/set-admin', (req, res) => {
  const { enterpriseId, empId } = req.params;
  //
  db.prepare("UPDATE tenant_enterprise_employees SET role = 'admin', updated_at = datetime('now') WHERE id = ? AND enterprise_id = ?").run(empId, enterpriseId);
  res.json({ success: true });
});

// 取消企业管理员
router.post('/enterprises/:enterpriseId/employees/:empId/remove-admin', (req, res) => {
  const { enterpriseId, empId } = req.params;
  //
  db.prepare("UPDATE tenant_enterprise_employees SET role = 'member', updated_at = datetime('now') WHERE id = ? AND enterprise_id = ?").run(empId, enterpriseId);
  res.json({ success: true });
});

// 企业管理员视角：获取本企业数据（企业级隔离）
router.get('/enterprise/my-data', (req, res) => {
  const userId = req.user?.id || req.userId;
  if (!userId) return res.status(401).json({ error: '未登录' });
  //
  const employee = db.prepare('SELECT * FROM tenant_enterprise_employees WHERE user_id = ? AND status = \'active\'').get(userId);
  if (!employee) return res.status(403).json({ error: '不是企业员工' });
  const enterprise = db.prepare('SELECT * FROM tenant_enterprises WHERE id = ?').get(employee.enterprise_id);
  const employees = db.prepare('SELECT * FROM tenant_enterprise_employees WHERE enterprise_id = ? AND status = \'active\'').all(employee.enterprise_id);
  res.json({ enterprise, employee, employees, isAdmin: employee.role === 'admin' });
});

// 停用入驻个人（回收客户到公海）
router.post('/individuals/:id/disable', (req, res) => {
  const { id } = req.params;
  //
  const individual = db.prepare('SELECT * FROM tenant_individuals WHERE id = ?').get(id);
  if (!individual) return res.status(404).json({ error: '不存在' });

  db.prepare('UPDATE tenant_individuals SET status = \'disabled\', updated_at = datetime(\'now\') WHERE id = ?').run(id);

  // 从集市移除
  db.prepare('DELETE FROM card_market_items WHERE customer_id = ? AND subject_type = \'individual\' AND subject_id = ?').run(individual.customer_id, id);

  // 回收客户到公海
  const customers = db.prepare('SELECT * FROM card_customer WHERE owner_id = ? AND owner_type = \'individual\'').all(individual.user_id);
  customers.forEach(c => {
    db.prepare(`INSERT INTO tenant_public_pool (customer_id, source_type, source_id, name, phone, company, position)
      VALUES (?, 'individual', ?, ?, ?, ?, ?)`).run(individual.customer_id, id, c.name, c.phone, c.company, c.position);
  });

  res.json({ success: true });
});

// 停用入驻企业（回收企业+员工客户到公海）
router.post('/enterprises/:id/disable', (req, res) => {
  const { id } = req.params;
  //
  const enterprise = db.prepare('SELECT * FROM tenant_enterprises WHERE id = ?').get(id);
  if (!enterprise) return res.status(404).json({ error: '不存在' });

  db.prepare('UPDATE tenant_enterprises SET status = \'disabled\', updated_at = datetime(\'now\') WHERE id = ?').run(id);
  db.prepare('UPDATE tenant_enterprise_employees SET status = \'left\', updated_at = datetime(\'now\') WHERE enterprise_id = ?').run(id);

  // 从集市移除
  db.prepare('DELETE FROM card_market_items WHERE customer_id = ? AND (subject_type = \'enterprise\' AND subject_id = ?) OR (subject_type = \'employee\' AND enterprise_id = ?)').run(enterprise.customer_id, id, id);

  res.json({ success: true });
});

// ===== 公海池 =====
router.get('/public-pool', (req, res) => {
  const customerId = req.customerId || req.user?.customerId;
  if (!customerId) return res.status(400).json({ error: '缺少客户ID' });
  //
  const pool = db.prepare('SELECT * FROM tenant_public_pool WHERE customer_id = ? ORDER BY recycled_at DESC').all(customerId);
  res.json({ pool });
});

// 领取公海客户
router.post('/public-pool/:id/claim', (req, res) => {
  const { id } = req.params;
  const userId = req.userId || req.user?.id;
  if (!userId) return res.status(400).json({ error: '缺少用户ID' });
  //
  const item = db.prepare('SELECT * FROM tenant_public_pool WHERE id = ? AND status = \'available\'').get(id);
  if (!item) return res.status(404).json({ error: '客户已被领取' });

  db.prepare('UPDATE tenant_public_pool SET status = \'claimed\', claimed_by = ?, claimed_at = datetime(\'now\') WHERE id = ?').run(userId, id);

  // 添加到个人客户
  db.prepare(`INSERT INTO card_customer (customer_id, owner_id, owner_type, name, phone, company, position, source)
    VALUES (?, ?, 'individual', ?, ?, ?, ?, 'public_pool')`).run(item.customer_id, userId, item.name, item.phone, item.company, item.position);

  res.json({ success: true });
});

// ===== 企业公海池 =====
// 企业公海池列表（企业管理员视角）
router.get('/enterprise-public-pool', (req, res) => {
  const userId = req.user?.id || req.userId;
  if (!userId) return res.status(401).json({ error: '未登录' });
  //
  const employee = db.prepare('SELECT * FROM tenant_enterprise_employees WHERE user_id = ? AND status = \'active\'').get(userId);
  if (!employee) return res.status(403).json({ error: '不是企业员工' });
  const pool = db.prepare('SELECT * FROM enterprise_public_pool WHERE enterprise_id = ? ORDER BY recycled_at DESC').all(employee.enterprise_id);
  res.json({ pool });
});

// 领取企业公海客户
router.post('/enterprise-public-pool/:id/claim', (req, res) => {
  const { id } = req.params;
  const userId = req.userId || req.user?.id;
  if (!userId) return res.status(400).json({ error: '缺少用户ID' });
  //
  const item = db.prepare('SELECT * FROM enterprise_public_pool WHERE id = ? AND status = \'available\'').get(id);
  if (!item) return res.status(404).json({ error: '客户已被领取' });

  db.prepare('UPDATE enterprise_public_pool SET status = \'claimed\', claimed_by = ?, claimed_at = datetime(\'now\') WHERE id = ?').run(userId, id);

  // 添加到个人客户
  db.prepare(`INSERT INTO card_customer (customer_id, owner_id, owner_type, name, phone, company, position, source)
    VALUES (?, ?, 'employee', ?, ?, ?, ?, 'enterprise_pool')`).run(item.customer_id, userId, item.name, item.phone, item.company, item.position);

  res.json({ success: true });
});

// 更新企业配置（auto_recycle等）
router.put('/enterprises/:id/config', (req, res) => {
  const { id } = req.params;
  const { config } = req.body;
  //
  db.prepare('UPDATE tenant_enterprises SET config = ?, updated_at = datetime(\'now\') WHERE id = ?').run(JSON.stringify(config || {}), id);
  res.json({ success: true });
});

// ===== 表单管理 =====
// 表单模板列表
router.get('/forms', (req, res) => {
  const customerId = req.customerId || req.user?.customerId;
  if (!customerId) return res.status(400).json({ error: '缺少客户ID' });
  //
  const forms = db.prepare('SELECT * FROM card_form_template WHERE customer_id = ? ORDER BY created_at DESC').all(customerId);
  res.json({ forms });
});

// 创建表单模板
router.post('/forms', (req, res) => {
  const customerId = req.customerId || req.user?.customerId;
  const userId = req.user?.id || req.userId;
  if (!customerId) return res.status(400).json({ error: '缺少客户ID' });
  const { title, description, fields } = req.body;
  if (!title) return res.status(400).json({ error: '缺少标题' });
  //
  const result = db.prepare(`INSERT INTO card_form_template (customer_id, title, description, fields, created_by)
    VALUES (?, ?, ?, ?, ?)`).run(customerId, title, description || '', JSON.stringify(fields || []), userId);
  res.json({ id: result.lastInsertRowid, success: true });
});

// 提交表单
router.post('/forms/:id/submit', (req, res) => {
  const { id } = req.params;
  const customerId = req.customerId || req.user?.customerId;
  const userId = req.user?.id || req.userId;
  const { data } = req.body;
  //
  const form = db.prepare('SELECT * FROM card_form_template WHERE id = ?').get(id);
  if (!form) return res.status(404).json({ error: '表单不存在' });

  db.prepare(`INSERT INTO card_form_submission (form_id, customer_id, user_id, data)
    VALUES (?, ?, ?, ?)`).run(id, form.customer_id, userId, JSON.stringify(data || {}));
  res.json({ success: true });
});

// 表单提交记录
router.get('/forms/:id/submissions', (req, res) => {
  const { id } = req.params;
  //
  const submissions = db.prepare('SELECT * FROM card_form_submission WHERE form_id = ? ORDER BY submitted_at DESC').all(id);
  res.json({ submissions });
});


  return router;
}
