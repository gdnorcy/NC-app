// 门店体系（租户后台）—— 1:1 复刻 nshop 连锁门店 chainShop
// 数据严格按 customer_id 隔离；门店数量配额 = 总后台授权填写（project_apps.quota），租户端可购买增加
import { Router } from 'express';
import { tenantState } from '../tenant.js';
import { addOperationLog } from '../db.js';

const DEMO_STORE_QUOTA = 50; // 演示方案（无 project_apps 行）默认门店配额，对标 nshop 默认 50

export function createStoreRouter(db) {
  const router = Router();

  // 中间件：确保是租户用户，并挂载 req.customerId（与 customer.js requireTenant 同逻辑）
  function requireTenant(req, res, next) {
    const user = req.user;
    if (!user || !['tenant_admin', 'tenant_member'].includes(user.role)) {
      return res.status(403).json({ error: '无权访问客户后台' });
    }
    if (!user.customerId) {
      return res.status(403).json({ error: '账号未关联客户项目' });
    }
    const state = tenantState(db, user.customerId, { ctx: 'admin' });
    if (state.missing) return res.status(404).json({ error: '客户项目不存在' });
    if (!state.active) {
      if (state.readonly && req.method === 'GET') {
        req.customerId = user.customerId;
        req.tenantReadonly = true;
        return next();
      }
      return res.status(403).json({ error: state.reason });
    }
    req.customerId = user.customerId;
    req.enterpriseId = user.enterpriseId || user.enterprise_id || null;
    next();
  }

  function audit(req, action, targetType, targetId, detail) {
    try {
      addOperationLog(db, {
        userId: req.user?.uid ?? req.user?.id ?? null,
        username: req.user?.username ?? req.user?.phone ?? 'tenant-user',
        action, targetType, targetId,
        detail: `[租户#${req.customerId}] ${detail}`,
        ip: req.ip,
      });
    } catch { /* 日志失败不影响主流程 */ }
  }

  /** 当前租户门店配额行（project_apps：总后台授权时填写 quota） */
  function quotaRow(cid) {
    return db.prepare("SELECT * FROM project_apps WHERE project_id = ? AND app_code = 'store'").get(cid);
  }
  /** 配额：授权行 quota；无行但开通（演示方案）→ 默认 DEMO_STORE_QUOTA */
  function getQuota(cid) {
    const row = quotaRow(cid);
    return row ? (row.quota || 0) : DEMO_STORE_QUOTA;
  }
  function usedCount(cid) {
    return db.prepare('SELECT COUNT(*) AS c FROM store WHERE customer_id = ?').get(cid).c;
  }

  /** 组装门店输出（带分组名/标签） */
  function decorateStore(row) {
    const s = { ...row };
    s.licenseImgs = safeJson(s.license_imgs, []);
    s.categoryName = '';
    if (s.category_id) {
      const c = db.prepare('SELECT name FROM store_category WHERE id = ?').get(s.category_id);
      if (c) s.categoryName = c.name;
    }
    const tags = db.prepare(`SELECT t.id, t.group_id, t.name, t.sort_order, g.name AS group_name
      FROM store_tag t LEFT JOIN store_tag_group g ON g.id = t.group_id
      WHERE t.id IN (SELECT tag_id FROM store_relation WHERE store_id = ?) ORDER BY t.sort_order ASC, t.id ASC`).all(s.id);
    s.tags = tags;
    delete s.license_imgs;
    return s;
  }
  function safeJson(str, fallback) {
    try { const v = JSON.parse(str); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
  }

  // —— 配额 ——
  router.get('/quota', requireTenant, (req, res) => {
    const cid = req.customerId;
    res.json({ quota: getQuota(cid), used: usedCount(cid), remaining: Math.max(0, getQuota(cid) - usedCount(cid)) });
  });

  // —— 购买门店（nshop 原机制：数量不够时可购买；本地为模拟购买，配额直接增加）——
  router.post('/purchase', requireTenant, (req, res) => {
    const cid = req.customerId;
    const count = Math.floor(Number(req.body?.count || 0));
    if (!count || count < 1 || count > 1000) return res.status(400).json({ error: '购买数量需为 1-1000 的整数' });
    const row = quotaRow(cid);
    if (row) {
      db.prepare('UPDATE project_apps SET quota = quota + ? WHERE id = ?').run(count, row.id);
    } else {
      db.prepare("INSERT OR IGNORE INTO project_apps (project_id, app_code, enabled, quota) VALUES (?, 'store', 1, ?)").run(cid, count);
    }
    audit(req, 'store_purchase', 'store', 0, `购买门店数量 +${count}（模拟购买，配额增加）`);
    res.json({ quota: getQuota(cid), used: usedCount(cid), remaining: Math.max(0, getQuota(cid) - usedCount(cid)) });
  });

  // —— 门店选择器数据（方案二头部门店定位 / 订单门店自提 / C 端门店列表）——
  router.get('/all', requireTenant, (req, res) => {
    const rows = db.prepare("SELECT id, name, type, province, city, district, address, phone, logo, lng, lat FROM store WHERE customer_id = ? ORDER BY status DESC, id ASC").all(req.customerId);
    res.json({ stores: rows });
  });

  // —— 门店列表 ——
  router.get('/', requireTenant, (req, res) => {
    const cid = req.customerId;
    const f = req.query;
    const cond = ['customer_id = ?'];
    const args = [cid];
    if (f.name) { cond.push('name LIKE ?'); args.push(`%${f.name}%`); }
    if (f.type) { cond.push('type = ?'); args.push(f.type); }
    if (f.categoryId) { cond.push('category_id = ?'); args.push(Number(f.categoryId)); }
    if (f.status !== undefined && f.status !== '') { cond.push('status = ?'); args.push(Number(f.status)); }
    const page = Math.max(1, Number(f.page) || 1);
    const pageSize = Math.min(100, Number(f.pageSize) || 10);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM store WHERE ${cond.join(' AND ')}`).get(...args).c;
    const rows = db.prepare(`SELECT * FROM store WHERE ${cond.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...args, pageSize, (page - 1) * pageSize);
    res.json({ list: rows.map(decorateStore), total, page, pageSize });
  });

  // —— 创建门店（校验配额）——
  router.post('/', requireTenant, (req, res) => {
    const cid = req.customerId;
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: '请输入门店名称' });
    if (!b.phone) return res.status(400).json({ error: '请输入联系电话' });
    if (!b.ownerName) return res.status(400).json({ error: '请输入负责人姓名' });
    if (usedCount(cid) >= getQuota(cid)) return res.status(400).json({ error: '门店数量已达上限，可在「购买门店」中增加' });
    const r = db.prepare(`INSERT INTO store
      (customer_id, name, type, logo, number, category_id, gaode_key, phone, province, city, district, address, lng, lat,
       business_time_type, business_time, license_imgs, license_show, remark, status,
       owner_name, owner_account, owner_password,
       settle_type, settle_days, withdraw_ratio_type, withdraw_ratio, withdraw_enabled,
       price_mode, stock_mode, shelf_mode, confirm_pay_enabled, delivery_mode)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      cid, b.name || '', b.type || '直营店', b.logo || '', b.number || '', Number(b.categoryId) || 0, b.gaodeKey || '', b.phone || '',
      b.province || '', b.city || '', b.district || '', b.address || '', Number(b.lng) || 0, Number(b.lat) || 0,
      b.businessTimeType || 'all_day', b.businessTime || '', JSON.stringify(b.licenseImgs || []), b.licenseShow === false ? 0 : 1, b.remark || '', b.status === false ? 0 : 1,
      b.ownerName || '', b.ownerAccount || '', b.ownerPassword || '',
      b.settleType || 'immediate', Number(b.settleDays) || 0, b.withdrawRatioType || 'system', Number(b.withdrawRatio) || 0, b.withdrawEnabled === false ? 0 : 1,
      b.priceMode || 'unified', b.stockMode || 'unified', b.shelfMode || 'unified', b.confirmPayEnabled === false ? 0 : 1, b.deliveryMode || 'head');
    const id = r.lastInsertRowid;
    // 标签关联
    saveStoreTags(cid, id, b.tagIds);
    audit(req, 'store_add', 'store', id, `新增门店 ${b.name}`);
    const row = db.prepare('SELECT * FROM store WHERE id = ?').get(id);
    res.json({ store: decorateStore(row) });
  });

  // —— 编辑门店 ——
  router.put('/:id', requireTenant, (req, res) => {
    const cid = req.customerId;
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM store WHERE id = ? AND customer_id = ?').get(id, cid);
    if (!row) return res.status(404).json({ error: '门店不存在' });
    const b = req.body || {};
    if (b.name !== undefined && !b.name) return res.status(400).json({ error: '请输入门店名称' });
    db.prepare(`UPDATE store SET
      name=?, type=?, logo=?, number=?, category_id=?, gaode_key=?, phone=?, province=?, city=?, district=?, address=?, lng=?, lat=?,
      business_time_type=?, business_time=?, license_imgs=?, license_show=?, remark=?, status=?,
      owner_name=?, owner_account=?, owner_password=?,
      settle_type=?, settle_days=?, withdraw_ratio_type=?, withdraw_ratio=?, withdraw_enabled=?,
      price_mode=?, stock_mode=?, shelf_mode=?, confirm_pay_enabled=?, delivery_mode=?, updated_at=datetime('now')
      WHERE id=? AND customer_id=?`).run(
      b.name !== undefined ? b.name : row.name, b.type !== undefined ? b.type : row.type,
      b.logo !== undefined ? b.logo : row.logo, b.number !== undefined ? b.number : row.number,
      b.categoryId !== undefined ? Number(b.categoryId) : row.category_id, b.gaodeKey !== undefined ? b.gaodeKey : row.gaode_key,
      b.phone !== undefined ? b.phone : row.phone, b.province !== undefined ? b.province : row.province,
      b.city !== undefined ? b.city : row.city, b.district !== undefined ? b.district : row.district,
      b.address !== undefined ? b.address : row.address, b.lng !== undefined ? Number(b.lng) : row.lng, b.lat !== undefined ? Number(b.lat) : row.lat,
      b.businessTimeType !== undefined ? b.businessTimeType : row.business_time_type,
      b.businessTime !== undefined ? b.businessTime : row.business_time,
      b.licenseImgs !== undefined ? JSON.stringify(b.licenseImgs) : row.license_imgs,
      b.licenseShow !== undefined ? (b.licenseShow === false ? 0 : 1) : row.license_show,
      b.remark !== undefined ? b.remark : row.remark, b.status !== undefined ? (b.status === false ? 0 : 1) : row.status,
      b.ownerName !== undefined ? b.ownerName : row.owner_name, b.ownerAccount !== undefined ? b.ownerAccount : row.owner_account,
      b.ownerPassword !== undefined ? b.ownerPassword : row.owner_password,
      b.settleType !== undefined ? b.settleType : row.settle_type, b.settleDays !== undefined ? Number(b.settleDays) : row.settle_days,
      b.withdrawRatioType !== undefined ? b.withdrawRatioType : row.withdraw_ratio_type,
      b.withdrawRatio !== undefined ? Number(b.withdrawRatio) : row.withdraw_ratio,
      b.withdrawEnabled !== undefined ? (b.withdrawEnabled === false ? 0 : 1) : row.withdraw_enabled,
      b.priceMode !== undefined ? b.priceMode : row.price_mode, b.stockMode !== undefined ? b.stockMode : row.stock_mode,
      b.shelfMode !== undefined ? b.shelfMode : row.shelf_mode,
      b.confirmPayEnabled !== undefined ? (b.confirmPayEnabled === false ? 0 : 1) : row.confirm_pay_enabled,
      b.deliveryMode !== undefined ? b.deliveryMode : row.delivery_mode,
      id, cid);
    if (b.tagIds !== undefined) {
      db.prepare('DELETE FROM store_relation WHERE store_id = ?').run(id);
      saveStoreTags(cid, id, b.tagIds);
    }
    audit(req, 'store_edit', 'store', id, `编辑门店 ${b.name || row.name}`);
    const updated = db.prepare('SELECT * FROM store WHERE id = ?').get(id);
    res.json({ store: decorateStore(updated) });
  });

  // —— 删除门店 ——
  router.delete('/:id', requireTenant, (req, res) => {
    const cid = req.customerId;
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM store WHERE id = ? AND customer_id = ?').get(id, cid);
    if (!row) return res.status(404).json({ error: '门店不存在' });
    db.prepare('DELETE FROM store WHERE id = ? AND customer_id = ?').run(id, cid);
    db.prepare('DELETE FROM store_relation WHERE store_id = ?').run(id);
    audit(req, 'store_delete', 'store', id, `删除门店 ${row.name}`);
    res.json({ ok: true });
  });

  // —— 门店状态切换 ——
  router.put('/:id/status', requireTenant, (req, res) => {
    const cid = req.customerId;
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM store WHERE id = ? AND customer_id = ?').get(id, cid);
    if (!row) return res.status(404).json({ error: '门店不存在' });
    const status = req.body?.status === false ? 0 : 1;
    db.prepare('UPDATE store SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(status, id);
    audit(req, 'store_status', 'store', id, `${status ? '启用' : '禁用'}门店 ${row.name}`);
    res.json({ ok: true });
  });

  function saveStoreTags(cid, storeId, tagIds) {
    const ids = Array.isArray(tagIds) ? tagIds.filter(Boolean).map(Number) : [];
    const ins = db.prepare('INSERT OR IGNORE INTO store_relation (customer_id, store_id, tag_id) VALUES (?, ?, ?)');
    ids.forEach((tid) => ins.run(cid, storeId, tid));
  }

  // —— 门店分组 ——
  router.get('/categories', requireTenant, (req, res) => {
    const cid = req.customerId;
    const rows = db.prepare('SELECT * FROM store_category WHERE customer_id = ? ORDER BY id ASC').all(cid);
    const withCount = rows.map((c) => ({
      ...c,
      storeCount: db.prepare('SELECT COUNT(*) AS c FROM store WHERE category_id = ? AND customer_id = ?').get(c.id, cid).c,
    }));
    res.json({ list: withCount });
  });
  router.post('/categories', requireTenant, (req, res) => {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '请输入分组名称' });
    const r = db.prepare('INSERT INTO store_category (customer_id, name, status) VALUES (?, ?, ?)')
      .run(req.customerId, name, req.body?.status === false ? 0 : 1);
    audit(req, 'store_category_add', 'store_category', r.lastInsertRowid, `新增门店分组 ${name}`);
    res.json({ ok: true });
  });
  router.put('/categories/:id', requireTenant, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM store_category WHERE id = ? AND customer_id = ?').get(id, req.customerId);
    if (!row) return res.status(404).json({ error: '分组不存在' });
    const b = req.body || {};
    if (b.name !== undefined && !b.name.trim()) return res.status(400).json({ error: '请输入分组名称' });
    db.prepare('UPDATE store_category SET name = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(b.name !== undefined ? b.name.trim() : row.name, b.status !== undefined ? (b.status === false ? 0 : 1) : row.status, id);
    audit(req, 'store_category_edit', 'store_category', id, `编辑门店分组 ${row.name}`);
    res.json({ ok: true });
  });
  router.delete('/categories/:id', requireTenant, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM store_category WHERE id = ? AND customer_id = ?').get(id, req.customerId);
    if (!row) return res.status(404).json({ error: '分组不存在' });
    db.prepare('UPDATE store SET category_id = 0 WHERE category_id = ? AND customer_id = ?').run(id, req.customerId);
    db.prepare('DELETE FROM store_category WHERE id = ?').run(id);
    audit(req, 'store_category_delete', 'store_category', id, `删除门店分组 ${row.name}`);
    res.json({ ok: true });
  });

  // —— 门店标签（组）——
  router.get('/tag-groups', requireTenant, (req, res) => {
    const cid = req.customerId;
    const groups = db.prepare('SELECT * FROM store_tag_group WHERE customer_id = ? ORDER BY id ASC').all(cid);
    const list = groups.map((g) => {
      const tags = db.prepare('SELECT * FROM store_tag WHERE group_id = ? AND customer_id = ? ORDER BY sort_order ASC, id ASC').all(g.id, cid);
      return {
        ...g,
        tags: tags.map((t) => ({
          ...t,
          storeCount: db.prepare('SELECT COUNT(*) AS c FROM store_relation WHERE tag_id = ?').get(t.id).c,
        })),
      };
    });
    res.json({ list });
  });
  router.post('/tag-groups', requireTenant, (req, res) => {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '请输入标签组名称' });
    const r = db.prepare('INSERT INTO store_tag_group (customer_id, name, status) VALUES (?, ?, ?)')
      .run(req.customerId, name, req.body?.status === false ? 0 : 1);
    audit(req, 'store_tag_group_add', 'store_tag_group', r.lastInsertRowid, `新增门店标签组 ${name}`);
    res.json({ ok: true });
  });
  router.put('/tag-groups/:id', requireTenant, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM store_tag_group WHERE id = ? AND customer_id = ?').get(id, req.customerId);
    if (!row) return res.status(404).json({ error: '标签组不存在' });
    const b = req.body || {};
    if (b.name !== undefined && !b.name.trim()) return res.status(400).json({ error: '请输入标签组名称' });
    db.prepare('UPDATE store_tag_group SET name = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(b.name !== undefined ? b.name.trim() : row.name, b.status !== undefined ? (b.status === false ? 0 : 1) : row.status, id);
    audit(req, 'store_tag_group_edit', 'store_tag_group', id, `编辑门店标签组 ${row.name}`);
    res.json({ ok: true });
  });
  router.delete('/tag-groups/:id', requireTenant, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM store_tag_group WHERE id = ? AND customer_id = ?').get(id, req.customerId);
    if (!row) return res.status(404).json({ error: '标签组不存在' });
    db.prepare('DELETE FROM store_tag WHERE group_id = ?').run(id);
    db.prepare('DELETE FROM store_tag_group WHERE id = ?').run(id);
    audit(req, 'store_tag_group_delete', 'store_tag_group', id, `删除门店标签组 ${row.name}`);
    res.json({ ok: true });
  });

  // —— 组内标签 ——
  router.post('/tags', requireTenant, (req, res) => {
    const cid = req.customerId;
    const b = req.body || {};
    const name = (b.name || '').trim();
    if (!name) return res.status(400).json({ error: '请输入标签名称' });
    const group = db.prepare('SELECT id FROM store_tag_group WHERE id = ? AND customer_id = ?').get(Number(b.groupId) || 0, cid);
    if (!group) return res.status(400).json({ error: '请选择标签组' });
    const r = db.prepare('INSERT INTO store_tag (customer_id, group_id, name, sort_order, status) VALUES (?, ?, ?, ?, ?)')
      .run(cid, group.id, name, Number(b.sortOrder) || 0, b.status === false ? 0 : 1);
    const tagId = r.lastInsertRowid;
    if (Array.isArray(b.storeIds)) {
      const ins = db.prepare('INSERT OR IGNORE INTO store_relation (customer_id, store_id, tag_id) VALUES (?, ?, ?)');
      b.storeIds.forEach((sid) => ins.run(cid, Number(sid), tagId));
    }
    audit(req, 'store_tag_add', 'store_tag', tagId, `新增门店标签 ${name}`);
    res.json({ ok: true });
  });
  router.put('/tags/:id', requireTenant, (req, res) => {
    const cid = req.customerId;
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM store_tag WHERE id = ? AND customer_id = ?').get(id, cid);
    if (!row) return res.status(404).json({ error: '标签不存在' });
    const b = req.body || {};
    if (b.name !== undefined && !b.name.trim()) return res.status(400).json({ error: '请输入标签名称' });
    db.prepare('UPDATE store_tag SET name = ?, sort_order = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(b.name !== undefined ? b.name.trim() : row.name, b.sortOrder !== undefined ? Number(b.sortOrder) : row.sort_order,
        b.status !== undefined ? (b.status === false ? 0 : 1) : row.status, id);
    if (b.storeIds !== undefined) {
      db.prepare('DELETE FROM store_relation WHERE tag_id = ?').run(id);
      const ins = db.prepare('INSERT OR IGNORE INTO store_relation (customer_id, store_id, tag_id) VALUES (?, ?, ?)');
      b.storeIds.forEach((sid) => ins.run(cid, Number(sid), id));
    }
    audit(req, 'store_tag_edit', 'store_tag', id, `编辑门店标签 ${row.name}`);
    res.json({ ok: true });
  });
  router.delete('/tags/:id', requireTenant, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM store_tag WHERE id = ? AND customer_id = ?').get(id, req.customerId);
    if (!row) return res.status(404).json({ error: '标签不存在' });
    db.prepare('DELETE FROM store_tag WHERE id = ?').run(id);
    db.prepare('DELETE FROM store_relation WHERE tag_id = ?').run(id);
    audit(req, 'store_tag_delete', 'store_tag', id, `删除门店标签 ${row.name}`);
    res.json({ ok: true });
  });

  // —— 统计（门店总数/分组数/标签数/启用数/最近创建）——
  router.get('/stats', requireTenant, (req, res) => {
    const cid = req.customerId;
    const storeCount = db.prepare('SELECT COUNT(*) AS c FROM store WHERE customer_id = ?').get(cid).c;
    const enabledCount = db.prepare('SELECT COUNT(*) AS c FROM store WHERE customer_id = ? AND status = 1').get(cid).c;
    const categoryCount = db.prepare('SELECT COUNT(*) AS c FROM store_category WHERE customer_id = ?').get(cid).c;
    const tagCount = db.prepare('SELECT COUNT(*) AS c FROM store_tag WHERE customer_id = ?').get(cid).c;
    const tagGroupCount = db.prepare('SELECT COUNT(*) AS c FROM store_tag_group WHERE customer_id = ?').get(cid).c;
    const recent = db.prepare('SELECT id, name, type, status, created_at FROM store WHERE customer_id = ? ORDER BY id DESC LIMIT 5').all(cid);
    res.json({ storeCount, enabledCount, categoryCount, tagCount, tagGroupCount, recent, quota: getQuota(cid), used: usedCount(cid), remaining: Math.max(0, getQuota(cid) - usedCount(cid)) });
  });

  // —— 基础设置（nshop chainShop/settings：存租户 config.storeSetting）——
  router.get('/settings', requireTenant, (req, res) => {
    const cust = db.prepare('SELECT config FROM projects WHERE id = ?').get(req.customerId);
    let cfg = {};
    try { cfg = JSON.parse(cust?.config || '{}'); } catch { cfg = {}; }
    res.json({ settings: cfg.storeSetting || { chainMode: 0, couponBearer: 'head', memberCardBearer: 'head', withdrawMethods: ['alipay', 'wechat'], withdrawRatioType: 'custom', withdrawRatio: 10, storeEntryUrl: '' } });
  });
  router.put('/settings', requireTenant, (req, res) => {
    const cid = req.customerId;
    const cust = db.prepare('SELECT config FROM projects WHERE id = ?').get(cid);
    let cfg = {};
    try { cfg = JSON.parse(cust?.config || '{}'); } catch { cfg = {}; }
    cfg.storeSetting = req.body?.settings || {};
    db.prepare('UPDATE projects SET config = ? WHERE id = ?').run(JSON.stringify(cfg), cid);
    audit(req, 'store_setting_edit', 'store', 0, '更新门店基础设置');
    res.json({ ok: true });
  });

  // —— 提现管理（P1：需业绩结算体系，返回空态结构对齐 nshop 列）——
  router.get('/withdrawals', requireTenant, (req, res) => {
    res.json({ list: [], total: 0, note: '提现功能需接入门店业绩结算体系（P1），当前暂无提现数据' });
  });

  return router;
}
