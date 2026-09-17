// 电子卡密（1:1 复刻菜鸟云 card_key：卡密分类/卡密库/卡密数据）
// 授权：需开通「电子卡密」应用（card-carmi，应用中心-营销引流；演示方案自动纳入）
// 数据严格按 customer_id 租户隔离
import { Router } from 'express';
import { tenantState, hasSolution } from '../tenant.js';
import { addOperationLog } from '../db.js';

export function createCardKeyRouter(db) {
  const router = Router();

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
    next();
  }

  // 电子卡密应用授权
  function requireCarmi(req, res, next) {
    if (!hasSolution(db, req.customerId, 'card-carmi')) {
      return res.status(403).json({ error: '未开通「电子卡密」应用，请联系平台管理员开通' });
    }
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
    } catch { /* 日志失败不阻断 */ }
  }

  function assertWritable(req, res) {
    if (req.tenantReadonly) {
      res.status(403).json({ error: '服务已到期，当前为只读模式' });
      return false;
    }
    return true;
  }

  const PAGE = 10;

  // ---------- 卡密分类 ----------
  router.get('/categories', requireTenant, requireCarmi, (req, res) => {
    try {
      const cid = req.customerId;
      const kw = String(req.query.key || '').trim();
      const rows = kw
        ? db.prepare('SELECT * FROM card_key_category WHERE customer_id = ? AND name LIKE ? ORDER BY id DESC').all(cid, `%${kw}%`)
        : db.prepare('SELECT * FROM card_key_category WHERE customer_id = ? ORDER BY id DESC').all(cid);
      const libCount = db.prepare('SELECT cate_id, COUNT(*) n FROM card_key_library WHERE customer_id = ? GROUP BY cate_id').all(cid);
      const countMap = new Map(libCount.map(r => [r.cate_id, r.n]));
      res.json(rows.map(r => ({
        id: r.id, name: r.name, type: r.type,
        typeLabel: r.type === 2 ? '通用卡密' : '单个卡密',
        libraryCount: countMap.get(r.id) || 0,
        createdAt: r.created_at,
      })));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/categories', requireTenant, requireCarmi, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const name = String(req.body.name || '').trim();
      const type = Number(req.body.type) === 2 ? 2 : 1;
      if (!name) return res.status(400).json({ error: '请输入分类名称' });
      const dup = db.prepare('SELECT id FROM card_key_category WHERE customer_id = ? AND name = ?').get(cid, name);
      if (dup) return res.status(400).json({ error: '分类名称已存在' });
      const r = db.prepare('INSERT INTO card_key_category (customer_id, name, type) VALUES (?, ?, ?)').run(cid, name, type);
      audit(req, 'create', 'card_key_category', Number(r.lastInsertRowid), `新增卡密分类：${name}`);
      res.json({ id: Number(r.lastInsertRowid) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/categories/:id', requireTenant, requireCarmi, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const id = Number(req.params.id);
      const name = String(req.body.name || '').trim();
      const type = Number(req.body.type) === 2 ? 2 : 1;
      if (!name) return res.status(400).json({ error: '请输入分类名称' });
      const dup = db.prepare('SELECT id FROM card_key_category WHERE customer_id = ? AND name = ? AND id != ?').get(cid, name, id);
      if (dup) return res.status(400).json({ error: '分类名称已存在' });
      const r = db.prepare('UPDATE card_key_category SET name = ?, type = ?, updated_at = datetime(\'now\') WHERE id = ? AND customer_id = ?').run(name, type, id, cid);
      if (!r.changes) return res.status(404).json({ error: '分类不存在' });
      audit(req, 'update', 'card_key_category', id, `编辑卡密分类：${name}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/categories/:id', requireTenant, requireCarmi, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const id = Number(req.params.id);
      const libs = db.prepare('SELECT COUNT(*) n FROM card_key_library WHERE customer_id = ? AND cate_id = ?').get(cid, id).n;
      if (libs > 0) return res.status(400).json({ error: `该分类下还有 ${libs} 个卡密库，请先删除卡密库` });
      const r = db.prepare('DELETE FROM card_key_category WHERE id = ? AND customer_id = ?').run(id, cid);
      if (!r.changes) return res.status(404).json({ error: '分类不存在' });
      audit(req, 'delete', 'card_key_category', id, '删除卡密分类');
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 卡密库 ----------
  function libraryRow(cid, r) {
    const cate = r.cate_id ? db.prepare('SELECT name, type FROM card_key_category WHERE id = ? AND customer_id = ?').get(r.cate_id, cid) : null;
    let sold = 0;
    let stock = 0;
    if (cate && cate.type === 2) {
      // 通用卡密：内容一致，库存恒为 1（不消耗）
      stock = r.data_content ? 1 : 0;
    } else {
      sold = db.prepare('SELECT COUNT(*) n FROM card_key_data WHERE customer_id = ? AND library_id = ? AND status = 1').get(cid, r.id).n;
      stock = db.prepare('SELECT COUNT(*) n FROM card_key_data WHERE customer_id = ? AND library_id = ? AND status = 0').get(cid, r.id).n;
    }
    return {
      id: r.id, name: r.name, cateId: r.cate_id,
      cateName: cate ? cate.name : '',
      cateType: cate ? cate.type : 1,
      remark: r.remark, instruction: r.instruction,
      canRepetition: r.can_repetition, dataContent: r.data_content,
      sold, stock, createdAt: r.created_at,
    };
  }

  router.get('/libraries', requireTenant, requireCarmi, (req, res) => {
    try {
      const cid = req.customerId;
      const kw = String(req.query.key || '').trim();
      const rows = kw
        ? db.prepare('SELECT * FROM card_key_library WHERE customer_id = ? AND name LIKE ? ORDER BY id DESC').all(cid, `%${kw}%`)
        : db.prepare('SELECT * FROM card_key_library WHERE customer_id = ? ORDER BY id DESC').all(cid);
      res.json(rows.map(r => libraryRow(cid, r)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/libraries', requireTenant, requireCarmi, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const name = String(req.body.name || '').trim();
      const cateId = Number(req.body.cateId) || 0;
      if (!name) return res.status(400).json({ error: '请输入卡密库名称' });
      const cate = db.prepare('SELECT id FROM card_key_category WHERE id = ? AND customer_id = ?').get(cateId, cid);
      if (!cate) return res.status(400).json({ error: '请选择所属分类' });
      const r = db.prepare(
        'INSERT INTO card_key_library (customer_id, cate_id, name, remark, instruction, can_repetition, data_content) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(cid, cateId, name,
        String(req.body.remark || ''), String(req.body.instruction || ''),
        Number(req.body.canRepetition) === 1 ? 1 : 0, String(req.body.dataContent || ''));
      audit(req, 'create', 'card_key_library', Number(r.lastInsertRowid), `新增卡密库：${name}`);
      res.json({ id: Number(r.lastInsertRowid) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/libraries/:id', requireTenant, requireCarmi, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const id = Number(req.params.id);
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: '请输入卡密库名称' });
      // 菜鸟云规则：保存后不可修改分类 → 编辑仅更新名称/备注/说明/重复购买/内容
      const r = db.prepare(
        `UPDATE card_key_library SET name = ?, remark = ?, instruction = ?, can_repetition = ?, data_content = ?, updated_at = datetime('now')
         WHERE id = ? AND customer_id = ?`
      ).run(name, String(req.body.remark || ''), String(req.body.instruction || ''),
        Number(req.body.canRepetition) === 1 ? 1 : 0, String(req.body.dataContent || ''), id, cid);
      if (!r.changes) return res.status(404).json({ error: '卡密库不存在' });
      audit(req, 'update', 'card_key_library', id, `编辑卡密库：${name}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/libraries/:id', requireTenant, requireCarmi, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const id = Number(req.params.id);
      const dataCount = db.prepare('SELECT COUNT(*) n FROM card_key_data WHERE customer_id = ? AND library_id = ?').get(cid, id).n;
      const r = db.prepare('DELETE FROM card_key_library WHERE id = ? AND customer_id = ?').run(id, cid);
      if (!r.changes) return res.status(404).json({ error: '卡密库不存在' });
      db.prepare('DELETE FROM card_key_data WHERE library_id = ? AND customer_id = ?').run(id, cid);
      audit(req, 'delete', 'card_key_library', id, `删除卡密库（连带 ${dataCount} 条卡密数据）`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 卡密数据 ----------
  router.get('/libraries/:id/data', requireTenant, requireCarmi, (req, res) => {
    try {
      const cid = req.customerId;
      const libId = Number(req.params.id);
      const lib = db.prepare('SELECT id, cate_id FROM card_key_library WHERE id = ? AND customer_id = ?').get(libId, cid);
      if (!lib) return res.status(404).json({ error: '卡密库不存在' });
      const status = req.query.status !== undefined && req.query.status !== '' ? Number(req.query.status) : null;
      const kw = String(req.query.key || '').trim();
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.max(1, Number(req.query.pageSize) || PAGE);
      const conds = ['customer_id = ?', 'library_id = ?'];
      const params = [cid, libId];
      if (status === 0 || status === 1) { conds.push('status = ?'); params.push(status); }
      if (kw) { conds.push('(code LIKE ? OR pwd LIKE ?)'); params.push(`%${kw}%`, `%${kw}%`); }
      const total = db.prepare(`SELECT COUNT(*) n FROM card_key_data WHERE ${conds.join(' AND ')}`).get(...params).n;
      const rows = db.prepare(
        `SELECT * FROM card_key_data WHERE ${conds.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`
      ).all(...params, pageSize, (page - 1) * pageSize);
      res.json({
        total, page, pageSize,
        list: rows.map(r => ({ id: r.id, code: r.code, pwd: r.pwd, status: r.status, orderId: r.order_id, createdAt: r.created_at })),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 添加卡密数据（支持多条；菜鸟云 datadetail：编号+密码，可"新增一条数据"多行）
  router.post('/libraries/:id/data', requireTenant, requireCarmi, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const libId = Number(req.params.id);
      const lib = db.prepare('SELECT id, cate_id FROM card_key_library WHERE id = ? AND customer_id = ?').get(libId, cid);
      if (!lib) return res.status(404).json({ error: '卡密库不存在' });
      const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
      let added = 0;
      const ins = db.prepare('INSERT INTO card_key_data (customer_id, library_id, code, pwd) VALUES (?, ?, ?, ?)');
      for (const it of items) {
        const code = String(it.code || '').trim();
        const pwd = String(it.pwd || '').trim();
        if (!code && !pwd) continue;
        ins.run(cid, libId, code, pwd);
        added++;
      }
      audit(req, 'create', 'card_key_data', libId, `卡密库#${libId} 添加 ${added} 条卡密数据`);
      res.json({ added });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 批量删除卡密数据
  router.post('/libraries/:id/data/batch-delete', requireTenant, requireCarmi, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const libId = Number(req.params.id);
      const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
      if (!ids.length) return res.status(400).json({ error: '请选择要删除的数据' });
      const marks = ids.map(() => '?').join(',');
      const r = db.prepare(`DELETE FROM card_key_data WHERE customer_id = ? AND library_id = ? AND id IN (${marks})`).run(cid, libId, ...ids);
      audit(req, 'delete', 'card_key_data', libId, `卡密库#${libId} 批量删除 ${r.changes} 条卡密数据`);
      res.json({ deleted: r.changes });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 批量导入：每行一条「编号 密码」或「编号,密码」（tab/空格/逗号分隔）
  router.post('/libraries/:id/data/import', requireTenant, requireCarmi, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const libId = Number(req.params.id);
      const lib = db.prepare('SELECT id FROM card_key_library WHERE id = ? AND customer_id = ?').get(libId, cid);
      if (!lib) return res.status(404).json({ error: '卡密库不存在' });
      const text = String(req.body.text || '');
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const ins = db.prepare('INSERT INTO card_key_data (customer_id, library_id, code, pwd) VALUES (?, ?, ?, ?)');
      let added = 0;
      for (const line of lines) {
        const parts = line.split(/[\t,，\s]+/).map(s => s.trim()).filter(Boolean);
        if (!parts.length) continue;
        const code = parts[0] || '';
        const pwd = parts.length > 1 ? parts.slice(1).join(' ') : '';
        ins.run(cid, libId, code, pwd);
        added++;
      }
      audit(req, 'create', 'card_key_data', libId, `卡密库#${libId} 批量导入 ${added} 条`);
      res.json({ added });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除单条卡密数据
  router.delete('/libraries/:id/data/:did', requireTenant, requireCarmi, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const r = db.prepare('DELETE FROM card_key_data WHERE id = ? AND library_id = ? AND customer_id = ?').run(Number(req.params.did), Number(req.params.id), cid);
      if (!r.changes) return res.status(404).json({ error: '数据不存在' });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 商品编辑页下拉 ----------
  router.get('/options', requireTenant, requireCarmi, (req, res) => {
    try {
      const cid = req.customerId;
      const rows = db.prepare('SELECT * FROM card_key_library WHERE customer_id = ? ORDER BY id DESC').all(cid);
      res.json(rows.map(r => libraryRow(cid, r)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
