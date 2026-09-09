/**
 * 分销体系核心服务（插件化分销裂变底座）
 * - 金额统一「分」整数，与 payment_orders 一致
 * - 全表 tenant_id 租户隔离；钱包三键隔离 (tenant_id, user_id, identity_type)
 * - 核心对账：dist_order_split 快照唯一数据源，退款/插件关闭均不删除
 */
import { WxComponentService } from './wx-component.js';

export function createDistributionService(db) {
  // ============================================================
  // 配置（租户维度）
  // ============================================================
  const svc = {};

  /** 手动事务（node:sqlite DatabaseSync 无 .transaction） */
  function tx(fn) {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      throw e;
    }
  }

  // ============================================================
  // 插件开关（租户维度）
  // ============================================================

  /** 读取租户插件记录（不存在返回默认未安装） */
  svc.getPlugin = (tenantId, code) => {
    return db.prepare('SELECT * FROM sys_tenant_plugin WHERE tenant_id = ? AND plugin_code = ?').get(tenantId, code) || null;
  };

  /** 设置租户插件（install/enable/config），upsert */
  svc.setPlugin = (tenantId, code, { install, enable, config } = {}) => {
    const exist = svc.getPlugin(tenantId, code);
    const cur = {
      install: install !== undefined ? (install ? 1 : 0) : (exist ? exist.is_install : 0),
      enable: enable !== undefined ? (enable ? 1 : 0) : (exist ? exist.is_enable : 0),
      config: config !== undefined ? JSON.stringify(config) : (exist ? exist.config : '{}'),
    };
    if (exist) {
      db.prepare("UPDATE sys_tenant_plugin SET is_install = ?, is_enable = ?, config = ?, updated_at = datetime('now') WHERE id = ?")
        .run(cur.install, cur.enable, cur.config, exist.id);
    } else {
      db.prepare('INSERT INTO sys_tenant_plugin (tenant_id, plugin_code, is_install, is_enable, config) VALUES (?, ?, ?, ?, ?)')
        .run(tenantId, code, cur.install, cur.enable, cur.config);
    }
    return svc.getPlugin(tenantId, code);
  };

  // ============================================================
  // 分销配置
  // ============================================================

  const DEFAULT_CONFIG = {
    ratio1: 0.20, ratio2: 0.05, is_open_level2: 1, is_self_buy: 0,
    calc_type: 1, settle_day: 7, min_withdraw: 10, withdraw_fee_rate: 0, max_total_ratio: 0.30,
  };

  /** 读取租户二级分销配置（不存在自动建默认） */
  svc.getConfig = (tenantId) => {
    let row = db.prepare('SELECT * FROM dist_config WHERE tenant_id = ?').get(tenantId);
    if (!row) {
      db.prepare('INSERT INTO dist_config (tenant_id) VALUES (?)').run(tenantId);
      row = db.prepare('SELECT * FROM dist_config WHERE tenant_id = ?').get(tenantId);
    }
    return row;
  };

  /** 保存租户二级分销配置（数值白名单校验 + 基本设置/分销参数字符串白名单） */
  svc.saveConfig = (tenantId, patch = {}) => {
    const cur = svc.getConfig(tenantId);
    // 兼容旧「分销商开通门槛」：未显式传 become_rule 时，按 distributor_gate 映射（1付费用户→4购买商品；2指定名单→2申请需审核）
    if (patch.distributor_gate !== undefined && patch.become_rule === undefined) {
      const g = Number(patch.distributor_gate);
      patch.become_rule = g === 1 ? 4 : (g === 2 ? 2 : 0);
    }
    const str = (v, def, max = 128) => (v !== undefined && v !== null && String(v).trim() !== '' ? String(v).trim().slice(0, max) : def);
    const strE = (v, def, max = 128) => (v !== undefined && v !== null ? String(v).trim().slice(0, max) : def); // 允许清空
    const bool = (v, def) => (v !== undefined ? (v ? 1 : 0) : def);
    const next = {
      ratio1: Number(patch.ratio1 ?? cur.ratio1),
      ratio2: Number(patch.ratio2 ?? cur.ratio2),
      is_open_level2: patch.is_open_level2 !== undefined ? (patch.is_open_level2 ? 1 : 0) : cur.is_open_level2,
      is_self_buy: patch.is_self_buy !== undefined ? (patch.is_self_buy ? 1 : 0) : cur.is_self_buy,
      calc_type: Number(patch.calc_type ?? cur.calc_type) === 2 ? 2 : 1,
      settle_day: Math.max(1, Math.min(90, Number(patch.settle_day ?? cur.settle_day) || 7)),
      min_withdraw: Math.max(0, Number(patch.min_withdraw ?? cur.min_withdraw) || 0),
      withdraw_fee_rate: Math.max(0, Math.min(1, Number(patch.withdraw_fee_rate ?? cur.withdraw_fee_rate) || 0)),
      max_total_ratio: Math.max(0, Math.min(1, Number(patch.max_total_ratio ?? cur.max_total_ratio) || 0)),
      distributor_gate: [0, 1, 2].includes(Number(patch.distributor_gate ?? cur.distributor_gate)) ? Number(patch.distributor_gate ?? cur.distributor_gate) : 0,
      // —— 基本设置 + 分销参数 ——
      dist_name: str(patch.dist_name, cur.dist_name, 32),
      sub_name: str(patch.sub_name, cur.sub_name, 32),
      apply_top_img: str(patch.apply_top_img, cur.apply_top_img, 512),
      promote_img: str(patch.promote_img, cur.promote_img, 512),
      apply_tip: str(patch.apply_tip, cur.apply_tip, 1000),
      zero_order: bool(patch.zero_order, cur.zero_order),
      show_parent: bool(patch.show_parent, cur.show_parent),
      show_phone: bool(patch.show_phone, cur.show_phone),
      default_level: str(patch.default_level, cur.default_level, 32),
      // —— 关系设置 / 分享设置 / 申请协议 / 分销须知 ——
      bind_rule: [0, 1, 2].includes(Number(patch.bind_rule ?? cur.bind_rule)) ? Number(patch.bind_rule ?? cur.bind_rule) : Number(cur.bind_rule || 0),
      become_rule: [0, 1, 2, 3, 4, 5].includes(Number(patch.become_rule ?? cur.become_rule)) ? Number(patch.become_rule ?? cur.become_rule) : Number(cur.become_rule !== undefined ? cur.become_rule : (cur.distributor_gate || 0)),
      become_amount: Math.max(0, Number(patch.become_amount ?? cur.become_amount) || 0),
      become_products: strE(patch.become_products, cur.become_products, 512),
      share_title: strE(patch.share_title, cur.share_title, 64),
      share_img: strE(patch.share_img, cur.share_img, 512),
      apply_agreement: strE(patch.apply_agreement, cur.apply_agreement, 20000),
      dist_notice: strE(patch.dist_notice, cur.dist_notice, 20000),
      poster_badge: bool(patch.poster_badge, cur.poster_badge !== undefined ? cur.poster_badge : 1),
      // 海报模板库（数组 [{id,url}] → JSON；保存时若 promote_img 未变但模板含默认，默认以 promote_img 为准）
      poster_templates: Array.isArray(patch.poster_templates)
        ? JSON.stringify(patch.poster_templates.map((t) => ({ id: String(t.id || ''), url: String(t.url || '') })).filter((t) => t.url).slice(0, 20))
        : (cur.poster_templates || '[]'),
    };
    db.prepare(`
      UPDATE dist_config SET ratio1=?, ratio2=?, is_open_level2=?, is_self_buy=?, calc_type=?,
        settle_day=?, min_withdraw=?, withdraw_fee_rate=?, max_total_ratio=?, distributor_gate=?,
        dist_name=?, sub_name=?, apply_top_img=?, promote_img=?, apply_tip=?,
        zero_order=?, show_parent=?, show_phone=?, default_level=?,
        bind_rule=?, become_rule=?, become_amount=?, become_products=?, share_title=?, share_img=?,
        apply_agreement=?, dist_notice=?, poster_badge=?, poster_templates=?, updated_at=datetime('now')
      WHERE tenant_id=?
    `).run(next.ratio1, next.ratio2, next.is_open_level2, next.is_self_buy, next.calc_type,
      next.settle_day, next.min_withdraw, next.withdraw_fee_rate, next.max_total_ratio, next.distributor_gate,
      next.dist_name, next.sub_name, next.apply_top_img, next.promote_img, next.apply_tip,
      next.zero_order, next.show_parent, next.show_phone, next.default_level,
      next.bind_rule, next.become_rule, next.become_amount, next.become_products, next.share_title, next.share_img,
      next.apply_agreement, next.dist_notice, next.poster_badge, next.poster_templates, tenantId);
    return svc.getConfig(tenantId);
  };

  // ============================================================
  // 分销等级体系（dist_level，租户隔离；按累计收益/直推人数自动升级）

  /** 等级列表（按 level_no 升序） */
  svc.getLevels = (tenantId) => {
    const rows = db.prepare('SELECT * FROM dist_level WHERE tenant_id = ? ORDER BY level_no ASC').all(tenantId);
    if (!rows.length) {
      const base = db.prepare('SELECT * FROM dist_level WHERE tenant_id = 0 ORDER BY level_no ASC').all();
      if (base.length) {
        const ins = db.prepare('INSERT INTO dist_level (tenant_id, level_no, name, min_total_income, min_direct, benefits) VALUES (?, ?, ?, ?, ?, ?)');
        for (const b of base) ins.run(tenantId, b.level_no, b.name, b.min_total_income, b.min_direct, b.benefits || '');
        return db.prepare('SELECT * FROM dist_level WHERE tenant_id = ? ORDER BY level_no ASC').all(tenantId);
      }
      return [{ id: 0, tenant_id: tenantId, level_no: 1, name: '默认等级', min_total_income: 0, min_direct: 0, benefits: '' }];
    }
    return rows;
  };

  /** 保存等级（upsert；id 存在则更新，否则按 level_no 插入；重名/序号冲突自动去重） */
  svc.saveLevel = (tenantId, { id, levelNo, name, minTotalIncome, minDirect, benefits } = {}) => {
    const no = Math.max(1, Math.min(99, Number(levelNo) || 1));
    const nm = String(name || '默认等级').trim().slice(0, 32) || '默认等级';
    const inc = Math.max(0, Number(minTotalIncome) || 0);
    const dir = Math.max(0, Number(minDirect) || 0);
    const bn = String(benefits || '').trim().slice(0, 500);
    if (id) {
      db.prepare('UPDATE dist_level SET level_no=?, name=?, min_total_income=?, min_direct=?, benefits=?, updated_at=datetime(\'now\') WHERE id=? AND tenant_id=?')
        .run(no, nm, inc, dir, bn, id, tenantId);
      return db.prepare('SELECT * FROM dist_level WHERE id = ?').get(id);
    }
    const exist = db.prepare('SELECT id FROM dist_level WHERE tenant_id = ? AND level_no = ?').get(tenantId, no);
    if (exist) {
      db.prepare('UPDATE dist_level SET name=?, min_total_income=?, min_direct=?, benefits=?, updated_at=datetime(\'now\') WHERE id=?')
        .run(nm, inc, dir, bn, exist.id);
      return db.prepare('SELECT * FROM dist_level WHERE id = ?').get(exist.id);
    }
    const r = db.prepare('INSERT INTO dist_level (tenant_id, level_no, name, min_total_income, min_direct, benefits) VALUES (?, ?, ?, ?, ?, ?)').run(tenantId, no, nm, inc, dir, bn);
    return db.prepare('SELECT * FROM dist_level WHERE id = ?').get(r.lastInsertRowid);
  };

  /** 删除等级（至少保留一级；删除后自动把低于被删等级的 level_no 顺延补位） */
  svc.deleteLevel = (tenantId, id) => {
    const row = db.prepare('SELECT * FROM dist_level WHERE id = ? AND tenant_id = ?').get(id, tenantId);
    if (!row) return { ok: false, error: '等级不存在' };
    const all = db.prepare('SELECT * FROM dist_level WHERE tenant_id = ? ORDER BY level_no ASC').all(tenantId);
    if (all.length <= 1) return { ok: false, error: '至少保留一个等级' };
    db.prepare('DELETE FROM dist_level WHERE id = ?').run(id);
    const rest = db.prepare('SELECT * FROM dist_level WHERE tenant_id = ? ORDER BY level_no ASC').all(tenantId);
    rest.forEach((lv, i) => {
      const want = i + 1;
      if (lv.level_no !== want) db.prepare('UPDATE dist_level SET level_no=?, updated_at=datetime(\'now\') WHERE id=?').run(want, lv.id);
    });
    return { ok: true };
  };

  /** 等级判定：累计收益（分）或直推人数任一达标即升级（均未设门槛 = 无条件等级） */
  svc.resolveLevel = (tenantId, totalIncome = 0, directCount = 0) => {
    const levels = svc.getLevels(tenantId);
    let cur = levels[0] || { level_no: 1, name: '默认等级', min_total_income: 0, min_direct: 0 };
    let next = null;
    for (const lv of levels) {
      const hasIncGate = Number(lv.min_total_income) > 0;
      const hasDirGate = Number(lv.min_direct) > 0;
      const hit = (hasIncGate && Number(totalIncome) >= Number(lv.min_total_income))
        || (hasDirGate && Number(directCount) >= Number(lv.min_direct))
        || (!hasIncGate && !hasDirGate);
      if (hit) {
        if (lv.level_no >= cur.level_no) cur = lv;
      } else if (!next && lv.level_no > cur.level_no) {
        next = lv;
      }
    }
    return {
      currentLevel: { no: cur.level_no, name: cur.name || '默认等级' },
      nextLevel: next ? { no: next.level_no, name: next.name || '', minTotalIncome: next.min_total_income, minDirect: next.min_direct } : null,
    };
  };


  // ============================================================

  /** 读取绑定关系（不存在返回 null） */
  svc.getRelation = (tenantId, userId, identityType = 'individual') => {
    return db.prepare('SELECT * FROM dist_user_relation WHERE tenant_id = ? AND user_id = ? AND identity_type = ?')
      .get(tenantId, userId, identityType) || null;
  };

  // ============================================================
  // 溯源绑定（租户维度永久锁定）

  /**
   * 绑定上下级：已绑定永久锁定；pid 需为有效用户、非自己、且沿上级链无环
   * 成为下线规则（dist_config.bind_rule）：
   *   0 首次点击（默认）：立即绑定 bound
   *   1 首次下单：写 pending 意向（支付成功后结算 bound；已有 paid 订单直接 bound）
   *   2 仅分销商海报：仅 qrcode/海报来源才绑定，其它来源静默忽略
   * 返回 { ok, error?, relation? }
   */
  svc.bindRelation = (tenantId, userId, identityType, pid, sourceType = 'card') => {
    if (!tenantId || !userId) return { ok: false, error: '参数缺失' };
    if (pid === userId) return { ok: false, error: '不能绑定自己' };
    const cfg = svc.getConfig(tenantId);
    const bindRule = cfg.bind_rule || 0;
    // 仅分销商海报：非海报来源不建立任何关系
    if (bindRule === 2 && sourceType !== 'qrcode') return { ok: true, relation: null, ignored: true };
    const exist = svc.getRelation(tenantId, userId, identityType);
    if (exist) return { ok: true, relation: exist }; // 永久锁定（pending 也算，防重复）

    let pid1 = null, pid2 = null;
    if (pid) {
      const parentUser = db.prepare('SELECT id, customer_id, enterprise_id FROM platform_user WHERE id = ?').get(pid);
      if (!parentUser) return { ok: false, error: '上级不存在' };
      // 上级必须属于同一客户项目（防跨租户绑定：未入驻用户/其它租户用户不能成为本租户上级）
      let parentTenant = parentUser.customer_id || null;
      if (!parentTenant && parentUser.enterprise_id) {
        const ent = db.prepare('SELECT customer_id FROM tenant_enterprises WHERE id = ?').get(parentUser.enterprise_id);
        parentTenant = ent ? ent.customer_id : null;
      }
      if (parentTenant !== tenantId) return { ok: false, error: '上级不在当前客户项目内' };
      const parentRel = svc.getRelation(tenantId, pid, identityType);
      pid1 = pid;
      pid2 = parentRel ? parentRel.pid1 : null;
      // 防环：沿 pid 上级链向上，若遇到 userId 则构成环路
      let cursor = pid;
      let guard = 0;
      while (cursor && guard++ < 20) {
        if (cursor === userId) return { ok: false, error: '绑定关系存在环路' };
        const r = svc.getRelation(tenantId, cursor, identityType);
        cursor = r ? r.pid1 : null;
      }
    }
    // 首次下单规则：已有 paid 订单直接 bound；否则写 pending 意向，支付成功后结算
    let status = 'bound';
    if (bindRule === 1) {
      const paid = db.prepare("SELECT COUNT(*) n FROM payment_orders WHERE user_id = ? AND status = 'paid'").get(userId);
      status = (paid && paid.n > 0) ? 'bound' : 'pending';
    }
    db.prepare('INSERT INTO dist_user_relation (tenant_id, user_id, identity_type, pid1, pid2, source_type, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(tenantId, userId, identityType, pid1, pid2, sourceType, status);
    return { ok: true, relation: svc.getRelation(tenantId, userId, identityType) };
  };

  /** 首次下单规则：支付成功后把买家的 pending 意向绑定结算为 bound（幂等） */
  svc.settlePendingRelations = (order) => {
    if (!order || !order.userId || !order.customerId) return;
    try {
      const cfg = svc.getConfig(order.customerId);
      if ((cfg.bind_rule || 0) !== 1) return;
      const pendings = db.prepare(
        "SELECT id FROM dist_user_relation WHERE tenant_id = ? AND user_id = ? AND status = 'pending'"
      ).all(order.customerId, order.userId);
      for (const p of pendings) {
        db.prepare("UPDATE dist_user_relation SET status = 'bound' WHERE id = ?").run(p.id);
      }
    } catch (e) { /* 意向结算失败不阻断支付 */ }
  };

  // ============================================================
  // 钱包（三键隔离，自动建）
  // ============================================================

  svc.getWallet = (tenantId, userId, identityType = 'individual') => {
    let w = db.prepare('SELECT * FROM dist_wallet WHERE tenant_id = ? AND user_id = ? AND identity_type = ?')
      .get(tenantId, userId, identityType);
    if (!w) {
      db.prepare('INSERT INTO dist_wallet (tenant_id, user_id, identity_type) VALUES (?, ?, ?)').run(tenantId, userId, identityType);
      w = db.prepare('SELECT * FROM dist_wallet WHERE tenant_id = ? AND user_id = ? AND identity_type = ?')
        .get(tenantId, userId, identityType);
    }
    return w;
  };

  // ============================================================
  // 插件配置（JSON 存 sys_tenant_plugin.config）
  // ============================================================

  /** 读取插件 JSON 配置（不存在返回默认） */
  svc.getPluginConfig = (tenantId, code, def = {}) => {
    const p = svc.getPlugin(tenantId, code);
    if (!p) return def;
    try { return { ...def, ...JSON.parse(p.config || '{}') }; } catch { return def; }
  };

  /** 保存插件 JSON 配置（合并且不覆盖已有） */
  svc.setPluginConfig = (tenantId, code, patch = {}) => {
    const cur = svc.getPluginConfig(tenantId, code);
    const next = { ...cur, ...patch };
    svc.setPlugin(tenantId, code, { config: next });
    return svc.getPluginConfig(tenantId, code);
  };

  // ============================================================
  // 成员管理（P1 池式分红：合伙人 / 全民 / 类目 / 区域）
  // ============================================================

  svc.listPartners = (tenantId) => {
    return db.prepare(`
      SELECT p.*, u.nickname, u.avatar, u.phone, u.identity_type
      FROM dist_partner p LEFT JOIN platform_user u ON u.id = p.user_id
      WHERE p.tenant_id = ? AND p.status = 1 ORDER BY p.id DESC
    `).all(tenantId);
  };

  svc.addPartner = (tenantId, userId, { ratio = 1, mode = 1 } = {}) => {
    const user = db.prepare('SELECT id FROM platform_user WHERE id = ?').get(userId);
    if (!user) return { ok: false, error: '用户不存在' };
    const exist = db.prepare('SELECT id FROM dist_partner WHERE tenant_id = ? AND user_id = ?').get(tenantId, userId);
    if (exist) return { ok: false, error: '该用户已是合伙人' };
    db.prepare('INSERT INTO dist_partner (tenant_id, user_id, ratio, mode) VALUES (?, ?, ?, ?)')
      .run(tenantId, userId, Math.max(0.01, Math.min(100, Number(ratio) || 1)), Number(mode) === 2 ? 2 : 1);
    return { ok: true };
  };

  svc.removePartner = (tenantId, userId) => {
    db.prepare("UPDATE dist_partner SET status = 0 WHERE tenant_id = ? AND user_id = ?").run(tenantId, userId);
    return { ok: true };
  };

  svc.listShareAll = (tenantId) => {
    return db.prepare(`
      SELECT s.*, u.nickname, u.avatar, u.phone, u.identity_type
      FROM dist_share_all s LEFT JOIN platform_user u ON u.id = s.user_id
      WHERE s.tenant_id = ? AND s.status = 1 ORDER BY s.id DESC
    `).all(tenantId);
  };

  svc.addShareAll = (tenantId, userId, { weight = 1 } = {}) => {
    const user = db.prepare('SELECT id FROM platform_user WHERE id = ?').get(userId);
    if (!user) return { ok: false, error: '用户不存在' };
    const exist = db.prepare('SELECT id FROM dist_share_all WHERE tenant_id = ? AND user_id = ?').get(tenantId, userId);
    if (exist) return { ok: false, error: '该用户已是全民股东' };
    db.prepare('INSERT INTO dist_share_all (tenant_id, user_id, weight) VALUES (?, ?, ?)')
      .run(tenantId, userId, Math.max(0.01, Math.min(100, Number(weight) || 1)));
    return { ok: true };
  };

  svc.removeShareAll = (tenantId, userId) => {
    db.prepare("UPDATE dist_share_all SET status = 0 WHERE tenant_id = ? AND user_id = ?").run(tenantId, userId);
    return { ok: true };
  };

  /** 按类目聚合（返回每个类目的 ratio + 股东数） */
  svc.listShareCatGroups = (tenantId) => {
    return db.prepare(`
      SELECT category_id, MAX(ratio) AS ratio, COUNT(*) AS member_count
      FROM dist_share_cat WHERE tenant_id = ? AND status = 1 GROUP BY category_id ORDER BY category_id
    `).all(tenantId);
  };

  svc.listShareCat = (tenantId, categoryId = '') => {
    let sql = `
      SELECT c.*, u.nickname, u.avatar, u.phone, u.identity_type
      FROM dist_share_cat c LEFT JOIN platform_user u ON u.id = c.user_id
      WHERE c.tenant_id = ? AND c.status = 1`;
    const params = [tenantId];
    if (categoryId) { sql += ' AND c.category_id = ?'; params.push(categoryId); }
    sql += ' ORDER BY c.id DESC';
    return db.prepare(sql).all(...params);
  };

  svc.addShareCat = (tenantId, categoryId, userId, { ratio = 0.05, weight = 1 } = {}) => {
    if (!categoryId) return { ok: false, error: '类目不能为空' };
    const user = db.prepare('SELECT id FROM platform_user WHERE id = ?').get(userId);
    if (!user) return { ok: false, error: '用户不存在' };
    const exist = db.prepare('SELECT id FROM dist_share_cat WHERE tenant_id = ? AND category_id = ? AND user_id = ?').get(tenantId, categoryId, userId);
    if (exist) return { ok: false, error: '该用户已是该类目股东' };
    db.prepare('INSERT INTO dist_share_cat (tenant_id, category_id, user_id, ratio, weight) VALUES (?, ?, ?, ?, ?)')
      .run(tenantId, categoryId, userId, Math.max(0.001, Math.min(1, Number(ratio) || 0.05)), Math.max(0.01, Math.min(100, Number(weight) || 1)));
    return { ok: true };
  };

  svc.removeShareCat = (tenantId, categoryId, userId) => {
    db.prepare('UPDATE dist_share_cat SET status = 0 WHERE tenant_id = ? AND category_id = ? AND user_id = ?').run(tenantId, categoryId, userId);
    return { ok: true };
  };

  /** 按地区聚合 */
  svc.listShareAreaGroups = (tenantId) => {
    return db.prepare(`
      SELECT area_code, MAX(ratio) AS ratio, COUNT(*) AS member_count
      FROM dist_share_area WHERE tenant_id = ? AND status = 1 GROUP BY area_code ORDER BY area_code
    `).all(tenantId);
  };

  svc.listShareArea = (tenantId, areaCode = '') => {
    let sql = `
      SELECT a.*, u.nickname, u.avatar, u.phone, u.identity_type
      FROM dist_share_area a LEFT JOIN platform_user u ON u.id = a.user_id
      WHERE a.tenant_id = ? AND a.status = 1`;
    const params = [tenantId];
    if (areaCode) { sql += ' AND a.area_code = ?'; params.push(areaCode); }
    sql += ' ORDER BY a.id DESC';
    return db.prepare(sql).all(...params);
  };

  svc.addShareArea = (tenantId, areaCode, userId, { ratio = 0.05, weight = 1 } = {}) => {
    if (!areaCode) return { ok: false, error: '地区不能为空' };
    const user = db.prepare('SELECT id FROM platform_user WHERE id = ?').get(userId);
    if (!user) return { ok: false, error: '用户不存在' };
    const exist = db.prepare('SELECT id FROM dist_share_area WHERE tenant_id = ? AND area_code = ? AND user_id = ?').get(tenantId, areaCode, userId);
    if (exist) return { ok: false, error: '该用户已是该地区股东' };
    db.prepare('INSERT INTO dist_share_area (tenant_id, area_code, user_id, ratio, weight) VALUES (?, ?, ?, ?, ?)')
      .run(tenantId, areaCode, userId, Math.max(0.001, Math.min(1, Number(ratio) || 0.05)), Math.max(0.01, Math.min(100, Number(weight) || 1)));
    return { ok: true };
  };

  svc.removeShareArea = (tenantId, areaCode, userId) => {
    db.prepare('UPDATE dist_share_area SET status = 0 WHERE tenant_id = ? AND area_code = ? AND user_id = ?').run(tenantId, areaCode, userId);
    return { ok: true };
  };

  // ============================================================
  // 分账调度器（订单支付成功后调用）
  // ============================================================

  /** 团队判定：buyerUserId 是否属于 partnerUserId 的下级团队（沿 pid1 链向上） */
  function isInTeam(tenantId, partnerUserId, buyerUserId) {
    if (!buyerUserId || partnerUserId === buyerUserId) return false;
    let cursor = buyerUserId;
    let guard = 0;
    while (cursor && guard++ < 20) {
      const r = db.prepare('SELECT pid1 FROM dist_user_relation WHERE tenant_id = ? AND user_id = ? AND identity_type = ?')
        .get(tenantId, cursor, 'individual');
      if (!r) return false;
      if (r.pid1 === partnerUserId) return true;
      cursor = r.pid1;
    }
    return false;
  }

  /** 按权重在股东列表间分配分红池（返回 {userId, identityType, amount, remark}[]）；weightKey 指定权重列名（partner 用 ratio） */
  function allocatePool(members, poolAmount, remarkPrefix, identityType, includeWeight, weightKey = 'weight') {
    const rows = [];
    if (!members.length || poolAmount <= 0) return rows;
    if (includeWeight) {
      const totalWeight = members.reduce((s, m) => s + (Number(m[weightKey]) || 1), 0);
      if (totalWeight <= 0) return rows;
      let allocated = 0;
      members.forEach((m, i) => {
        const amt = i === members.length - 1 ? poolAmount - allocated : Math.floor(poolAmount * ((Number(m[weightKey]) || 1) / totalWeight));
        if (amt > 0) rows.push({ userId: m.user_id, identityType: m.identity_type || identityType, type: '', amount: amt, remark: remarkPrefix });
        allocated += amt;
      });
    } else {
      const each = Math.floor(poolAmount / members.length);
      if (each <= 0) return rows;
      for (const m of members) rows.push({ userId: m.user_id, identityType: m.identity_type || identityType, type: '', amount: each, remark: remarkPrefix });
    }
    return rows;
  }

  /**
   * 分销商资格判定（PRD 3.1 开通门槛，扩展为「成为分销商」become_rule）：
   * 0 无条件；1 申请即通过（申请自动入白名单）；2 申请需审核（白名单 status=1）；
   * 3 总消费金额（paid 订单累计实付 ≥ become_amount）；4 购买商品（存在 paid 订单）；
   * 5 指定商品（paid 订单含 become_products 中任一商品名）
   */
  function distributorQualified(tenantId, userId, identityType, gate) {
    if (!userId) return false;
    const cfg = svc.getConfig(tenantId);
    const g = gate === undefined ? (cfg.become_rule !== undefined ? cfg.become_rule : cfg.distributor_gate) : gate;
    if (g === 0) return true;
    if (g === 1 || g === 2) {
      const r = db.prepare('SELECT id FROM dist_distributor WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND status = 1')
        .get(tenantId, userId, identityType);
      return !!r;
    }
    if (g === 3) {
      const r = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payment_orders WHERE user_id = ? AND customer_id = ? AND status = 'paid'").get(userId, tenantId);
      const min = Number(cfg.become_amount || 0);
      return (r && r.s >= min) || false;
    }
    if (g === 4) {
      const r = db.prepare("SELECT COUNT(*) n FROM payment_orders WHERE user_id = ? AND customer_id = ? AND status = 'paid'").get(userId, tenantId);
      return (r && r.n > 0) || false;
    }
    if (g === 5) {
      const products = String(cfg.become_products || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!products.length) return false;
      const list = db.prepare("SELECT product_name FROM payment_orders WHERE user_id = ? AND customer_id = ? AND status = 'paid'").all(userId, tenantId);
      return list.some((o) => products.some((p) => (o.product_name || '').includes(p)));
    }
    return true;
  }

  /** 分销商白名单（指定名单门槛维护） */
  svc.getDistributors = (tenantId) => db.prepare(`
    SELECT d.user_id AS userId, d.identity_type AS identityType, d.status, d.created_at,
           u.nickname, u.avatar
    FROM dist_distributor d LEFT JOIN platform_user u ON u.id = d.user_id
    WHERE d.tenant_id = ? ORDER BY d.id DESC
  `).all(tenantId);

  svc.addDistributor = (tenantId, userId, identityType = 'individual') => {
    const uid = Number(userId);
    if (!uid || uid <= 0) return { ok: false, error: '请填写有效的用户ID' };
    if (!db.prepare('SELECT id FROM platform_user WHERE id = ?').get(uid)) return { ok: false, error: '用户不存在' };
    const exist = db.prepare('SELECT id, status FROM dist_distributor WHERE tenant_id = ? AND user_id = ? AND identity_type = ?')
      .get(tenantId, uid, identityType);
    if (exist) {
      if (exist.status === 1) return { ok: false, error: '该用户已在分销商白名单' };
      db.prepare("UPDATE dist_distributor SET status = 1 WHERE id = ?").run(exist.id);
      return { ok: true };
    }
    db.prepare('INSERT INTO dist_distributor (tenant_id, user_id, identity_type) VALUES (?, ?, ?)')
      .run(tenantId, uid, identityType);
    return { ok: true };
  };

  svc.removeDistributor = (tenantId, userId, identityType = 'individual') => {
    db.prepare("UPDATE dist_distributor SET status = 0 WHERE tenant_id = ? AND user_id = ? AND identity_type = ?")
      .run(tenantId, Number(userId), identityType);
    return { ok: true };
  };

  /** 分销商申请状态（C 端分销中心）：门槛 / 是否白名单 / 最新申请状态（become_rule 1申请即通过 / 2申请需审核 走申请制） */
  svc.getApplyStatus = (tenantId, userId, identityType = 'individual') => {
    const cfg = svc.getConfig(tenantId);
    const becomeRule = cfg.become_rule !== undefined ? cfg.become_rule : cfg.distributor_gate;
    const inWhitelist = !!db.prepare('SELECT id FROM dist_distributor WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND status = 1')
      .get(tenantId, userId, identityType);
    const apply = db.prepare('SELECT status, reject_reason FROM dist_distributor_apply WHERE tenant_id = ? AND user_id = ? AND identity_type = ? ORDER BY id DESC LIMIT 1')
      .get(tenantId, userId, identityType);
    const applyStatus = apply ? apply.status : null;
    return {
      gate: becomeRule,
      inWhitelist,
      applyStatus,
      rejectReason: apply && apply.status === 'rejected' ? apply.reject_reason : '',
      canApply: (becomeRule === 1 || becomeRule === 2) && !inWhitelist && applyStatus !== 'pending' && applyStatus !== 'approved',
    };
  };

  /** 提交分销商申请（become_rule=1 申请即通过自动入白名单；=2 申请需审核待管理员审批） */
  svc.applyDistributor = (tenantId, userId, identityType = 'individual') => {
    const st = svc.getApplyStatus(tenantId, userId, identityType);
    if (st.gate !== 1 && st.gate !== 2) return { ok: false, error: '当前门槛无需申请' };
    if (st.inWhitelist) return { ok: false, error: '你已是分销商' };
    if (st.applyStatus === 'pending') return { ok: false, error: '申请审核中，请耐心等待' };
    if (st.applyStatus === 'approved') return { ok: false, error: '你已是分销商' };
    db.prepare("INSERT INTO dist_distributor_apply (tenant_id, user_id, identity_type, status) VALUES (?, ?, ?, ?)")
      .run(tenantId, userId, identityType, st.gate === 1 ? 'approved' : 'pending');
    if (st.gate === 1) {
      // 申请即通过：自动入白名单
      db.prepare('INSERT OR IGNORE INTO dist_distributor (tenant_id, user_id, identity_type, status) VALUES (?, ?, ?, 1)')
        .run(tenantId, userId, identityType);
    }
    return { ok: true };
  };

  /** 租户后台：申请列表（join 用户昵称头像） */
  svc.getApplies = (tenantId, status = 'pending') => db.prepare(`
    SELECT a.id, a.user_id, a.identity_type, a.status, a.reject_reason, a.created_at,
           u.nickname, u.avatar, u.phone
    FROM dist_distributor_apply a
    LEFT JOIN platform_user u ON u.id = a.user_id
    WHERE a.tenant_id = ? AND a.status = ?
    ORDER BY a.id DESC
  `).all(tenantId, status);

  /** 租户后台：审核申请（approve 自动入白名单 / reject 带原因） */
  svc.reviewApply = (tenantId, id, action = 'approve', reason = '') => {
    const row = db.prepare('SELECT * FROM dist_distributor_apply WHERE id = ? AND tenant_id = ?').get(id, tenantId);
    if (!row) return { ok: false, error: '申请不存在' };
    if (row.status !== 'pending') return { ok: false, error: '该申请已处理' };
    if (action === 'approve') {
      tx(() => {
        db.prepare("UPDATE dist_distributor_apply SET status = 'approved', reviewed_at = datetime('now') WHERE id = ?").run(id);
        db.prepare('INSERT OR IGNORE INTO dist_distributor (tenant_id, user_id, identity_type, status) VALUES (?, ?, ?, 1)')
          .run(tenantId, row.user_id, row.identity_type);
      });
      return { ok: true };
    }
    db.prepare("UPDATE dist_distributor_apply SET status = 'rejected', reject_reason = ?, reviewed_at = datetime('now') WHERE id = ?")
      .run(reason || '', id);
    return { ok: true };
  };

  /** 提现审核站内通知（C 端消息中心） */
  function notifyWithdraw(row, title, content, link = '/pages/card/distribution') {
    try {
      db.prepare('INSERT INTO card_message (customer_id, user_id, type, title, content, link) VALUES (?, ?, ?, ?, ?, ?)')
        .run(row.tenant_id, row.user_id, 'system', title, content, link);
    } catch (e) { /* 消息写入失败不阻断审核主流程 */ }
  }
  const yuan = (fen) => (Number(fen) / 100).toFixed(2);

  // ============================================================
  // 微信订阅消息（提现审核/打款完成/结算到账；未配置自动跳过，失败不阻断主流程）
  // 配置：sys_tenant_plugin.config(code='dist').subscribe =
  //   { enabled: true, tmplReview, tmplSettle, tmplDone }（模板字段固定 thing1/amount2/thing3/date4）
  // ============================================================

  /** 订阅消息 payload 构造（模块级纯函数，可测试） */
  svc.buildSubscribePayload = (type, extra = {}) => {
    const now = extra.time || new Date().toISOString().slice(0, 16).replace('T', ' ');
    const amt = (v) => (v !== undefined && v !== null ? `¥${Number(v) / 100}` : '¥0.00');
    switch (type) {
      case 'withdraw_review':
        return { thing1: extra.result || '提现审核结果', amount2: amt(extra.amount), thing3: extra.reason || '审核通过', date4: now };
      case 'withdraw_done':
        return { thing1: '提现打款完成', amount2: amt(extra.amount), thing3: extra.payNo ? `流水号 ${extra.payNo}` : '已打款', date4: now };
      case 'settle':
        return { thing1: '分销收益到账', amount2: amt(extra.amount), thing3: extra.note || '已结算，可申请提现', date4: now };
      default:
        return {};
    }
  };

  /** 发送订阅消息（同步判定是否可发，实际发送异步执行；返回 {ok}|{skipped:原因}） */
  svc.sendSubscribe = (tenantId, userId, type, extra = {}) => {
    try {
      const plug = db.prepare("SELECT config FROM sys_tenant_plugin WHERE tenant_id = ? AND plugin_code = 'dist'").get(tenantId);
      let sub = {};
      try { sub = JSON.parse(plug?.config || '{}').subscribe || {}; } catch {}
      if (!sub.enabled) return { skipped: 'not-enabled' };
      const tmplMap = { withdraw_review: sub.tmplReview, withdraw_done: sub.tmplDone, settle: sub.tmplSettle };
      const tmpl = tmplMap[type];
      if (!tmpl || !String(tmpl).trim()) return { skipped: 'no-template' };
      const u = db.prepare('SELECT openid FROM platform_user WHERE id = ?').get(userId);
      if (!u || !u.openid) return { skipped: 'no-openid' };
      const ch = db.prepare("SELECT id, appid FROM channel_apps WHERE customer_id = ? AND channel_type = 'mp' AND appid != '' ORDER BY id DESC LIMIT 1").get(tenantId);
      if (!ch) return { skipped: 'no-mp-channel' };
      const payload = svc.buildSubscribePayload(type, extra);
      const page = '/pages/card/distribution';
      svc._sendSub({ templateId: tmpl, openid: u.openid, channelAppId: ch.id, data: payload, page }).catch((e) => {
        console.warn('[subscribe] send fail', e?.message || e);
      });
      return { ok: true };
    } catch (e) {
      return { skipped: 'error' };
    }
  };

  /** 实际调用微信接口（测试可整体替换 _sendSub 规避外呼） */
  svc._sendSub = async ({ templateId, openid, channelAppId, data, page }) => {
    const wx = new WxComponentService(db);
    const token = await wx.getAuthorizerAccessToken(channelAppId);
    const res = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ touser: openid, template_id: templateId, page, data, miniprogram_state: 'formal' }),
    });
    const j = await res.json();
    if (j && j.errcode) console.warn('[subscribe] wx err', j.errcode, j.errmsg);
  };

  /**
   * 对已支付订单做分账（幂等：每租户每订单一条快照）
   * 调度器：任一已启用插件（dist/partner/share-all/share-cat/share-area）都会参与计算；
   * 各类收益统一受 dist_config.max_total_ratio 总让利上限约束。
   * order 来自 payment_orders（payer_type='tenant' 才参与租户内分销）
   */
  svc.computeOrderSplit = (order) => {
    if (!order || order.status !== 'paid' || order.payerType !== 'tenant') return null;
    const tenantId = order.customerId;
    if (!tenantId) return null;

    // 幂等
    if (db.prepare('SELECT id FROM dist_order_split WHERE tenant_id = ? AND order_id = ?').get(tenantId, order.id)) {
      return db.prepare('SELECT * FROM dist_order_split WHERE tenant_id = ? AND order_id = ?').get(tenantId, order.id);
    }

    const config = svc.getConfig(tenantId);
    const buyer = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(order.userId);
    if (!buyer) return null;
    const buyerIdentity = order.buyerIdentityType || buyer.identity_type || 'individual';

    // 计算基数：1实付 2原价
    const base = config.calc_type === 2 ? (order.originalAmount || order.amount) : order.amount;
    if (!base || base <= 0) return null;

    // 订单买家行业/地区（类目/区域股东判定）
    const profile = db.prepare('SELECT business_field, city FROM card_profile WHERE user_id = ? LIMIT 1').get(order.userId);
    const categoryId = (profile && profile.business_field) || '';
    const areaCode = (profile && profile.city) || '';

    const plugins = ['dist', 'partner', 'share-all', 'share-cat', 'share-area'];
    const active = plugins.filter((code) => {
      const p = svc.getPlugin(tenantId, code);
      return p && p.is_install && p.is_enable;
    });
    if (!active.length) return null;

    const rel = svc.getRelation(tenantId, order.userId, buyerIdentity);
    const logRows = []; // {userId, identityType, type, amount, remark}
    const col = { c1: 0, c2: 0, self: 0, partner: 0, shareAll: 0, shareCat: 0, shareArea: 0 };

    // —— 插件一：分销裂变 ——
    if (active.includes('dist')) {
      const gate = config.become_rule !== undefined ? config.become_rule : config.distributor_gate;
      // 自购返佣（自己需具备分销商资格）
      if (config.is_self_buy && distributorQualified(tenantId, order.userId, buyerIdentity, gate)) {
        col.self = Math.floor(base * config.ratio1);
        if (col.self > 0) logRows.push({ userId: order.userId, identityType: buyerIdentity, type: 'level1', amount: col.self, remark: '自购返佣' });
      }
      if (rel && rel.pid1 && distributorQualified(tenantId, rel.pid1, buyerIdentity, gate)) {
        col.c1 = Math.floor(base * config.ratio1);
        if (col.c1 > 0) logRows.push({ userId: rel.pid1, identityType: buyerIdentity, type: 'level1', amount: col.c1, remark: '一级推广佣金' });
      }
      if (rel && config.is_open_level2 && rel.pid2 && distributorQualified(tenantId, rel.pid2, buyerIdentity, gate)) {
        col.c2 = Math.floor(base * config.ratio2);
        if (col.c2 > 0) logRows.push({ userId: rel.pid2, identityType: buyerIdentity, type: 'level2', amount: col.c2, remark: '二级推广佣金' });
      }
    }

    // —— 插件二：合伙人团队分红 ——
    if (active.includes('partner')) {
      const pc = svc.getPluginConfig(tenantId, 'partner', { mode: 1, poolRatio: 0.03 });
      const partners = svc.listPartners(tenantId);
      const matched = pc.mode === 2
        ? partners
        : partners.filter((p) => isInTeam(tenantId, p.user_id, order.userId));
      const pool = Math.floor(base * (Number(pc.poolRatio) || 0));
      if (pool > 0 && matched.length) {
        const rows = allocatePool(matched, pool, '合伙人分红', buyerIdentity, true, 'ratio');
        for (const r of rows) {
          r.type = 'partner';
          logRows.push(r);
          col.partner += r.amount;
        }
      }
    }

    // —— 插件三：全民股东（全站流水分红） ——
    if (active.includes('share-all')) {
      const sc = svc.getPluginConfig(tenantId, 'share-all', { mode: 1, poolRatio: 0.02 });
      const members = svc.listShareAll(tenantId);
      const pool = Math.floor(base * (Number(sc.poolRatio) || 0));
      if (pool > 0 && members.length) {
        const rows = allocatePool(members, pool, '全民股东分红', buyerIdentity, Number(sc.mode) === 2);
        for (const r of rows) {
          r.type = 'share_all';
          logRows.push(r);
          col.shareAll += r.amount;
        }
      }
    }

    // —— 插件四：类目股东（行业维度分红） ——
    if (active.includes('share-cat') && categoryId) {
      const members = svc.listShareCat(tenantId, categoryId);
      if (members.length) {
        const pool = Math.floor(base * (Number(members[0].ratio) || 0));
        if (pool > 0) {
          const rows = allocatePool(members, pool, `类目股东分红（${categoryId}）`, buyerIdentity, true);
          for (const r of rows) {
            r.type = 'share_cat';
            logRows.push(r);
            col.shareCat += r.amount;
          }
        }
      }
    }

    // —— 插件五：区域股东（地域维度分红） ——
    if (active.includes('share-area') && areaCode) {
      const members = svc.listShareArea(tenantId, areaCode);
      if (members.length) {
        const pool = Math.floor(base * (Number(members[0].ratio) || 0));
        if (pool > 0) {
          const rows = allocatePool(members, pool, `区域股东分红（${areaCode}）`, buyerIdentity, true);
          for (const r of rows) {
            r.type = 'share_area';
            logRows.push(r);
            col.shareArea += r.amount;
          }
        }
      }
    }

    // 订单总让利上限裁剪（所有类型收益统一受 max_total_ratio 约束）
    const maxTotal = Math.floor(base * config.max_total_ratio);
    let total = logRows.reduce((s, r) => s + r.amount, 0);
    if (total > maxTotal && total > 0) {
      const scale = maxTotal / total;
      for (const row of logRows) row.amount = Math.floor(row.amount * scale);
      col.c1 = Math.floor(col.c1 * scale); col.c2 = Math.floor(col.c2 * scale); col.self = Math.floor(col.self * scale);
      col.partner = Math.floor(col.partner * scale); col.shareAll = Math.floor(col.shareAll * scale);
      col.shareCat = Math.floor(col.shareCat * scale); col.shareArea = Math.floor(col.shareArea * scale);
      total = logRows.reduce((s, r) => s + r.amount, 0);
    }
    if (total <= 0) return null;

    const doSplit = () => {
      const r = db.prepare(`
        INSERT INTO dist_order_split (tenant_id, order_id, order_no, order_amount, buyer_user_id, buyer_identity_type,
          category_id, area_code, commission1, commission2, partner_bonus, share_all_bonus, share_cat_bonus, share_area_bonus,
          total_bonus, settle_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(tenantId, order.id, order.orderNo, base, order.userId, buyerIdentity,
        categoryId || null, areaCode || null, col.c1, col.c2, col.partner, col.shareAll, col.shareCat, col.shareArea, total);
      const splitId = r.lastInsertRowid;
      const logIns = db.prepare(`
        INSERT INTO dist_user_log (tenant_id, user_id, identity_type, order_id, order_no, split_id, type, amount, status, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `);
      const walletAdd = db.prepare(`
        INSERT INTO dist_wallet (tenant_id, user_id, identity_type, wait_settle, available, total_income, total_withdraw)
        VALUES (?, ?, ?, ?, 0, ?, 0)
        ON CONFLICT(tenant_id, user_id, identity_type) DO UPDATE SET
          wait_settle = dist_wallet.wait_settle + excluded.wait_settle,
          total_income = dist_wallet.total_income + excluded.total_income,
          updated_at = datetime('now')
      `);
      for (const row of logRows) {
        logIns.run(tenantId, row.userId, row.identityType, order.id, order.orderNo, splitId, row.type, row.amount, row.remark);
        walletAdd.run(tenantId, row.userId, row.identityType, row.amount, row.amount);
      }
      return splitId;
    };
    const splitId = tx(doSplit);
    return db.prepare('SELECT * FROM dist_order_split WHERE id = ?').get(splitId);
  };

  // ============================================================
  // 退款回滚（全额/部分通用，快照为准）
  // ============================================================

  /**
   * 订单退款/部分退款回滚：按快照将收益流水置「已扣回」并扣减钱包
   * refundAmount（分）可选：null=全额回滚；部分退款按比例回滚
   */
  svc.rollbackOrderSplit = (order, refundAmount = null) => {
    if (!order) return;
    const tenantId = order.customerId;
    if (!tenantId) return;
    const split = db.prepare('SELECT * FROM dist_order_split WHERE tenant_id = ? AND order_id = ?').get(tenantId, order.id);
    if (!split) return null;
    if (split.settle_status === 'refunded') return split; // 已回滚（幂等）

    // 回滚比例：全额=1，部分=refundAmount/split.order_amount
    let ratio = 1;
    if (refundAmount !== null && split.order_amount > 0 && refundAmount < split.order_amount) {
      ratio = refundAmount / split.order_amount;
    }

    const logs = db.prepare('SELECT * FROM dist_user_log WHERE split_id = ? AND status != ?').all(split.id, 'charged_back');
    const doRollback = () => {
      for (const log of logs) {
        const deduct = Math.floor(log.amount * ratio);
        if (deduct <= 0) continue;
        // 冻结/结算余额扣减：待结算→wait_settle；已结算→available
        const wallet = svc.getWallet(tenantId, log.user_id, log.identity_type);
        let newWait = wallet.wait_settle, newAvail = wallet.available, short = 0;
        if (log.status === 'settled') {
          newAvail = wallet.available - deduct;
          if (newAvail < 0) { short = -newAvail; newAvail = 0; }
        } else {
          newWait = wallet.wait_settle - deduct;
          if (newWait < 0) { short = -newWait; newWait = 0; }
        }
        const remark = short > 0
          ? `订单退款回滚（余额不足，欠款 ${short} 分待追缴）`
          : '订单退款回滚';
        db.prepare(`
          UPDATE dist_user_log SET status = 'charged_back', remark = ? WHERE id = ?
        `).run(log.remark + '；' + remark, log.id);
        db.prepare(`
          UPDATE dist_wallet SET wait_settle = ?, available = ?, total_income = MAX(0, total_income - ?), updated_at = datetime('now')
          WHERE tenant_id = ? AND user_id = ? AND identity_type = ?
        `).run(newWait, newAvail, deduct, tenantId, log.user_id, log.identity_type);
      }
      db.prepare("UPDATE dist_order_split SET settle_status = 'refunded', updated_at = datetime('now') WHERE id = ?").run(split.id);
    };
    tx(doRollback);
    return db.prepare('SELECT * FROM dist_order_split WHERE id = ?').get(split.id);
  };

  // ============================================================
  // 结算定时任务（T+N 到期：待结算 → 可提现）
  // ============================================================

  svc.settleDueOrders = () => {
    // 按租户的 settle_day 扫描到期快照
    const tenants = db.prepare('SELECT tenant_id, settle_day FROM dist_config').all();
    const settledLogs = []; // 收集本次结算明细（用于订阅消息聚合）
    const doSettle = (tenantId, settleDay) => {
      const due = db.prepare(`
        SELECT s.id FROM dist_order_split s
        WHERE s.tenant_id = ? AND s.settle_status = 'pending'
          AND datetime(s.created_at) <= datetime('now', ?)
      `).all(tenantId, `-${settleDay} days`);
      for (const row of due) {
        db.prepare("UPDATE dist_order_split SET settle_status = 'settled', updated_at = datetime('now') WHERE id = ?").run(row.id);
        const logs = db.prepare("SELECT * FROM dist_user_log WHERE split_id = ? AND status = 'pending'").all(row.id);
        for (const log of logs) {
          db.prepare("UPDATE dist_user_log SET status = 'settled' WHERE id = ?").run(log.id);
          db.prepare(`
            UPDATE dist_wallet SET wait_settle = MAX(0, wait_settle - ?), available = available + ?, updated_at = datetime('now')
            WHERE tenant_id = ? AND user_id = ? AND identity_type = ?
          `).run(log.amount, log.amount, tenantId, log.user_id, log.identity_type);
          settledLogs.push({ tenant_id: tenantId, user_id: log.user_id, identity_type: log.identity_type, amount: Number(log.amount) });
        }
      }
    };
    for (const t of tenants) tx(() => doSettle(t.tenant_id, t.settle_day));
    svc.notifySettled(settledLogs);
    return settledLogs.length;
  };

  /** 结算后按用户聚合发送「收益到账」订阅消息（各租户各用户一条） */
  svc.notifySettled = (settledLogs) => {
    if (!settledLogs || !settledLogs.length) return;
    const byTenant = new Map();
    for (const l of settledLogs) {
      if (!byTenant.has(l.tenant_id)) byTenant.set(l.tenant_id, new Map());
      const um = byTenant.get(l.tenant_id);
      const key = `${l.user_id}|${l.identity_type}`;
      const cur = um.get(key) || { user_id: l.user_id, identity_type: l.identity_type, amount: 0, count: 0 };
      cur.amount += Number(l.amount);
      cur.count += 1;
      um.set(key, cur);
    }
    for (const [tenantId, um] of byTenant) {
      for (const it of um.values()) {
        svc.sendSubscribe(tenantId, it.user_id, 'settle', { amount: it.amount, note: `共 ${it.count} 笔收益已结算` });
      }
    }
  };

  /** 结算后按用户聚合发送「收益到账」订阅消息（各租户各用户一条） */
  svc.notifySettled = (settledLogs) => {
    if (!settledLogs || !settledLogs.length) return;
    const byTenant = new Map();
    for (const l of settledLogs) {
      if (!byTenant.has(l.tenant_id)) byTenant.set(l.tenant_id, new Map());
      const um = byTenant.get(l.tenant_id);
      const key = `${l.user_id}|${l.identity_type}`;
      const cur = um.get(key) || { user_id: l.user_id, amount: 0 };
      cur.amount += Number(l.amount);
      um.set(key, cur);
    }
    for (const [tenantId, um] of byTenant) {
      for (const it of um.values()) {
        svc.sendSubscribe(tenantId, it.user_id, 'settle', { amount: it.amount, note: `共 ${settledLogs.filter((l) => l.tenant_id === tenantId && l.user_id === it.user_id).length} 笔收益已结算` });
      }
    }
  };

  // ============================================================
  // 提现
  // ============================================================

  /**
   * 申请提现：校验余额/最低门槛 → 计算手续费 → 冻结余额 → 生成记录
   */
  svc.applyWithdraw = (tenantId, userId, identityType, amountYuan, payAccount = '') => {
    const config = svc.getConfig(tenantId);
    const wallet = svc.getWallet(tenantId, userId, identityType);
    const amount = Math.round(Number(amountYuan) * 100); // 分
    if (amount <= 0) return { ok: false, error: '提现金额无效' };
    if (wallet.available < amount) return { ok: false, error: '可提现余额不足' };
    if (amount < config.min_withdraw * 100) return { ok: false, error: `可提现余额不足最低提现门槛${config.min_withdraw}元` };
    let acct = '';
    try {
      const obj = typeof payAccount === 'string' ? JSON.parse(payAccount) : payAccount;
      if (obj && obj.value) acct = JSON.stringify({ type: obj.type || 'wx', value: String(obj.value).slice(0, 200), name: obj.name ? String(obj.name).slice(0, 50) : '' });
    } catch { acct = String(payAccount || '').slice(0, 200); }

    const fee = Math.floor(amount * config.withdraw_fee_rate);
    const actual = amount - fee;
    const no = 'WD' + Date.now() + String(userId).slice(-4);
    const doApply = () => {
      // 申请时仅冻结余额；累计提现（total_withdraw）在打款完成（done）时才累加，口径=历史成功打款
      db.prepare("UPDATE dist_wallet SET available = available - ?, updated_at = datetime('now') WHERE tenant_id = ? AND user_id = ? AND identity_type = ?")
        .run(amount, tenantId, userId, identityType);
      db.prepare('INSERT INTO dist_withdraw (withdraw_no, tenant_id, user_id, identity_type, amount, service_fee, actual_amount, status, pay_account) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(no, tenantId, userId, identityType, amount, fee, actual, 'pending', acct);
    };
    tx(doApply);
    return { ok: true, withdrawNo: no };
  };

  /** 提现审核：reject（驳回退款） / approve（通过待打款） / done（打款完成，需登记流水号） */
  svc.reviewWithdraw = (withdrawId, action, reason = '', payNo = '', payRemark = '') => {
    const row = db.prepare('SELECT * FROM dist_withdraw WHERE id = ?').get(withdrawId);
    if (!row) return { ok: false, error: '提现记录不存在' };
    if (action === 'reject') {
      if (row.status !== 'pending') return { ok: false, error: '仅待审核可驳回' };
      const rsn = reason || '审核不通过';
      const doReject = () => {
        db.prepare("UPDATE dist_withdraw SET status = 'rejected', reject_reason = ?, updated_at = datetime('now') WHERE id = ?").run(rsn, withdrawId);
        // 驳回仅解冻余额；未打款不计入累计提现
        db.prepare("UPDATE dist_wallet SET available = available + ?, updated_at = datetime('now') WHERE tenant_id = ? AND user_id = ? AND identity_type = ?")
          .run(row.amount, row.tenant_id, row.user_id, row.identity_type);
        notifyWithdraw(row, '提现审核驳回', `你的提现申请 ¥${yuan(row.amount)} 未通过：${rsn}。资金已退回可提现余额。`);
      };
      tx(doReject);
      svc.sendSubscribe(row.tenant_id, row.user_id, 'withdraw_review', { result: '提现审核驳回', amount: row.amount, reason: rsn });
      return { ok: true };
    }
    if (action === 'approve') {
      if (row.status !== 'pending') return { ok: false, error: '仅待审核可通过' };
      db.prepare("UPDATE dist_withdraw SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(withdrawId);
      notifyWithdraw(row, '提现审核通过', `你的提现申请 ¥${yuan(row.amount)} 已审核通过，等待打款到账。`);
      svc.sendSubscribe(row.tenant_id, row.user_id, 'withdraw_review', { result: '提现审核通过', amount: row.amount, reason: '等待打款到账' });
      return { ok: true };
    }
    if (action === 'done') {
      if (row.status !== 'approved') return { ok: false, error: '仅审核通过可打款完成' };
      const no = String(payNo || '').trim();
      if (!no) return { ok: false, error: '请填写打款流水号' };
      const doDone = () => {
        db.prepare("UPDATE dist_withdraw SET status = 'done', pay_no = ?, pay_remark = ?, paid_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
          .run(no, String(payRemark || '').trim(), withdrawId);
        // 打款完成才累计提现（口径：实际到账金额），与「累计已提现=历史成功打款」一致
        db.prepare("UPDATE dist_wallet SET total_withdraw = total_withdraw + ?, updated_at = datetime('now') WHERE tenant_id = ? AND user_id = ? AND identity_type = ?")
          .run(row.actual_amount, row.tenant_id, row.user_id, row.identity_type);
        notifyWithdraw(row, '提现打款完成', `你的提现 ¥${yuan(row.actual_amount)} 已打款完成（流水号 ${no}），请注意查收。`);
      };
      tx(doDone);
      svc.sendSubscribe(row.tenant_id, row.user_id, 'withdraw_done', { amount: row.actual_amount, payNo: no });
      return { ok: true };
    }
    return { ok: false, error: '未知操作' };
  };

  // ============================================================
  // 查询（租户后台/小程序端）
  // ============================================================

  /** 分销关系树（租户维度）：节点带身份标签（合伙人/股东），供租户后台树形查看团队层级 */
  svc.relationTree = (tenantId) => {
    const relations = db.prepare(`
      SELECT r.user_id AS userId, r.pid1, r.pid2, r.identity_type AS identityType, u.nickname
      FROM dist_user_relation r LEFT JOIN platform_user u ON u.id = r.user_id
      WHERE r.tenant_id = ? AND r.status = 'bound'
    `).all(tenantId);
    if (!relations.length) return [];
    const tagMap = new Map();
    const tag = (uid, t) => { if (!tagMap.has(uid)) tagMap.set(uid, []); tagMap.get(uid).push(t); };
    for (const p of db.prepare("SELECT user_id FROM dist_partner WHERE tenant_id = ? AND status = 1").all(tenantId)) tag(p.user_id, '合伙人');
    for (const p of db.prepare("SELECT user_id FROM dist_share_all WHERE tenant_id = ? AND status = 1").all(tenantId)) tag(p.user_id, '全民股东');
    for (const p of db.prepare("SELECT user_id, category_id FROM dist_share_cat WHERE tenant_id = ? AND status = 1").all(tenantId)) tag(p.user_id, `行业股东`);
    for (const p of db.prepare("SELECT user_id, area_code FROM dist_share_area WHERE tenant_id = ? AND status = 1").all(tenantId)) tag(p.user_id, `区域股东`);
    return buildRelationTree(relations, tagMap);
  };

  /** 月度佣金/分红汇总：month='YYYY-MM'；返回 { month, byType, total, settled, pending, byUser } */
  svc.monthlySummary = (tenantId, month) => {
    const key = String(month || '').trim() || new Date().toISOString().slice(0, 7);
    const rows = db.prepare(`
      SELECT l.type, l.status, l.amount, l.user_id AS userId, l.identity_type AS identityType, l.remark, u.nickname
      FROM dist_user_log l LEFT JOIN platform_user u ON u.id = l.user_id
      WHERE l.tenant_id = ? AND substr(l.created_at, 1, 7) = ?
    `).all(tenantId, key);
    const byType = { level1: 0, level2: 0, partner: 0, share_all: 0, share_cat: 0, share_area: 0 };
    let total = 0, settled = 0, pending = 0, chargedBack = 0, debtAmount = 0;
    const byUser = new Map();
    for (const r of rows) {
      // 扣回记录按负额计入（净额口径），扣回总额单独累计
      const amt = r.status === 'charged_back' ? -Math.abs(r.amount) : r.amount;
      byType[r.type] = (byType[r.type] || 0) + amt;
      total += amt;
      if (r.status === 'settled') settled += r.amount;
      if (r.status === 'pending') pending += r.amount;
      if (r.status === 'charged_back') {
        chargedBack += Math.abs(r.amount);
        const m = /欠款\s*(\d+)\s*分/.exec(r.remark || '');
        if (m) debtAmount += Number(m[1]);
      }
      if (!byUser.has(r.userId)) byUser.set(r.userId, { userId: r.userId, nickname: r.nickname || '微信用户', identityType: r.identityType || 'individual', level1: 0, level2: 0, partner: 0, share_all: 0, share_cat: 0, share_area: 0, total: 0, chargedBack: 0 });
      const u = byUser.get(r.userId);
      u[r.type] = (u[r.type] || 0) + amt;
      u.total += amt;
      if (r.status === 'charged_back') u.chargedBack += Math.abs(r.amount);
    }
    // 该月提现（实得 = 提现金额 - 手续费；done 记录带打款流水）
    const wrows = db.prepare(`
      SELECT w.user_id AS userId, w.amount, w.service_fee, w.status, w.pay_no
      FROM dist_withdraw w WHERE w.tenant_id = ? AND substr(w.created_at, 1, 7) = ?
    `).all(tenantId, key);
    const wByUser = new Map();
    let withdrawTotal = 0;
    for (const w of wrows) {
      if (!wByUser.has(w.userId)) wByUser.set(w.userId, { count: 0, amount: 0 });
      const wu = wByUser.get(w.userId);
      wu.count += 1;
      wu.amount += (w.amount - (w.service_fee || 0));
      withdrawTotal += (w.amount - (w.service_fee || 0));
    }
    const byUserArr = [...byUser.values()].map((u) => {
      const wu = wByUser.get(u.userId) || { count: 0, amount: 0 };
      return { ...u, withdrawCount: wu.count, withdraw: wu.amount };
    });
    return { month: key, byType, total, settled, pending, chargedBack, debtAmount, withdrawTotal, byUser: byUserArr };
  };

  /** 分销商排行：累计收益 / 直推人数 / 团队人数 / 身份标签；Top N */
  /** 推广效果统计：绑定来源分布 / 付费转化 / 带来的佣金（租户后台数据大盘） */
  svc.getPromoStats = (tenantId) => {
    const SRC_ZH = { qrcode: '推广二维码', card: '名片', market: '人脉集市', link: '推广链接', agreement: '入驻' };
    const rows = db.prepare("SELECT user_id AS userId, source_type AS src, bind_time AS bindTime FROM dist_user_relation WHERE tenant_id = ? AND status = 'bound'").all(tenantId);
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const srcMap = {};
    for (const r of rows) srcMap[r.src || 'card'] = (srcMap[r.src || 'card'] || 0) + 1;
    let paidTotal = 0, paidAmount = 0;
    if (userIds.length) {
      const marks = userIds.map(() => '?').join(',');
      const pays = db.prepare(`SELECT user_id, SUM(amount) amt FROM payment_orders WHERE customer_id = ? AND status = 'paid' AND user_id IN (${marks}) GROUP BY user_id`).all(tenantId, ...userIds);
      paidTotal = pays.length;
      paidAmount = pays.reduce((s, p) => s + (p.amt || 0), 0);
    }
    let promoOrders = 0, commissionByPromo = 0;
    if (userIds.length) {
      const marks = userIds.map(() => '?').join(',');
      const sp = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total_bonus),0) t FROM dist_order_split WHERE tenant_id = ? AND buyer_user_id IN (${marks})`).get(tenantId, ...userIds);
      promoOrders = sp.n; commissionByPromo = sp.t;
    }
    const boundTotal = userIds.length;
    return {
      srcList: Object.entries(srcMap).map(([k, v]) => ({
        key: k, label: SRC_ZH[k] || k, count: v,
        ratio: boundTotal ? +((v / boundTotal) * 100).toFixed(1) : 0,
      })),
      boundTotal,
      paidTotal,
      paidAmount,
      paidRate: boundTotal ? +((paidTotal / boundTotal) * 100).toFixed(1) : 0,
      todayNew: db.prepare("SELECT COUNT(*) n FROM dist_user_relation WHERE tenant_id = ? AND status = 'bound' AND substr(bind_time,1,10) = date('now','localtime')").get(tenantId).n,
      monthNew: db.prepare("SELECT COUNT(*) n FROM dist_user_relation WHERE tenant_id = ? AND status = 'bound' AND substr(bind_time,1,10) >= substr(date('now','localtime','start of month'),1,10)").get(tenantId).n,
      promoOrders,
      commissionByPromo,
    };
  };

  svc.ranking = (tenantId, limit = 10) => {
    const rows = db.prepare(`
      SELECT w.user_id AS userId, u.nickname,
        COALESCE(w.total_income, 0) AS totalIncome,
        COALESCE(w.available, 0) AS available,
        (SELECT COUNT(*) FROM dist_user_relation r2 WHERE r2.tenant_id = ? AND r2.pid1 = w.user_id AND r2.status = 'bound') AS directCount
      FROM dist_wallet w
      LEFT JOIN platform_user u ON u.id = w.user_id
      WHERE w.tenant_id = ? AND w.total_income > 0
      GROUP BY w.user_id
      ORDER BY w.total_income DESC LIMIT ?
    `).all(tenantId, tenantId, Math.min(Number(limit) || 10, 50));
    const tagMap = new Map();
    const tag = (uid, t) => { if (!tagMap.has(uid)) tagMap.set(uid, []); tagMap.get(uid).push(t); };
    for (const p of db.prepare("SELECT user_id FROM dist_partner WHERE tenant_id = ? AND status = 1").all(tenantId)) tag(p.user_id, '合伙人');
    for (const p of db.prepare("SELECT user_id FROM dist_share_all WHERE tenant_id = ? AND status = 1").all(tenantId)) tag(p.user_id, '全民股东');
    for (const p of db.prepare("SELECT user_id FROM dist_share_cat WHERE tenant_id = ? AND status = 1").all(tenantId)) tag(p.user_id, '行业股东');
    for (const p of db.prepare("SELECT user_id FROM dist_share_area WHERE tenant_id = ? AND status = 1").all(tenantId)) tag(p.user_id, '区域股东');
    return rows.map((r, i) => ({
      rank: i + 1, userId: r.userId, nickname: r.nickname || '微信用户',
      totalIncome: r.totalIncome, available: r.available,
      directCount: r.directCount, tags: tagMap.get(r.userId) || [],
    }));
  };

  /** 用户收益汇总（钱包 + 直推/间推人数 + 本月佣金 + 身份标签） */
  svc.getSummary = (tenantId, userId, identityType) => {
    const wallet = svc.getWallet(tenantId, userId, identityType);
    const direct = db.prepare("SELECT COUNT(*) n FROM dist_user_relation WHERE tenant_id = ? AND pid1 = ? AND status = 'bound'").get(tenantId, userId).n;
    const indirect = db.prepare("SELECT COUNT(*) n FROM dist_user_relation WHERE tenant_id = ? AND pid2 = ? AND status = 'bound'").get(tenantId, userId).n;
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthKey = monthStart.toISOString().slice(0, 10);
    const monthCommission = db.prepare(
      "SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type IN ('level1','level2') AND substr(created_at,1,10) >= ?"
    ).get(tenantId, userId, identityType, monthKey).s;
    // 本月新增推广用户（本月通过我新绑定的下级）
    const monthNew = db.prepare(
      "SELECT COUNT(*) n FROM dist_user_relation WHERE tenant_id = ? AND (pid1 = ? OR pid2 = ?) AND status = 'bound' AND substr(bind_time,1,10) >= ?"
    ).get(tenantId, userId, userId, monthKey).n;
    // 累计推广业绩：累计佣金（level1/level2 全量）+ 累计带来订单（去重订单数，供「累计业绩」卡）
    const totalCommission = db.prepare(
      "SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type IN ('level1','level2')"
    ).get(tenantId, userId, identityType).s;
    const totalOrders = db.prepare(
      "SELECT COUNT(DISTINCT order_id) n FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type IN ('level1','level2') AND order_id > 0"
    ).get(tenantId, userId, identityType).n;
    // 插件启用状态（壳页卡片区渲染依据：租户开通哪个应用，C 端显示对应卡片）
    const pluginRows = db.prepare('SELECT plugin_code, is_install, is_enable FROM sys_tenant_plugin WHERE tenant_id = ?').all(tenantId);
    const pMap = {};
    for (const p of pluginRows) pMap[p.plugin_code] = !!(p.is_install && p.is_enable);
    // —— 今日业绩（借鉴推广中心布局）：今日佣金 / 今日分账订单 / 今日新增下线 ——
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayCommission = db.prepare(
      "SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type IN ('level1','level2') AND substr(created_at,1,10) = ?"
    ).get(tenantId, userId, identityType, todayKey).s;
    const todayOrder = db.prepare(
      "SELECT COUNT(*) n FROM dist_order_split WHERE tenant_id = ? AND substr(created_at,1,10) = ?"
    ).get(tenantId, todayKey).n;
    const todayNew = db.prepare(
      "SELECT COUNT(*) n FROM dist_user_relation WHERE tenant_id = ? AND (pid1 = ? OR pid2 = ?) AND status = 'bound' AND substr(bind_time,1,10) = ?"
    ).get(tenantId, userId, userId, todayKey).n;
    // 提现中金额（待审核 + 待打款，参考图「提现中」栏）
    const withdrawing = db.prepare(
      "SELECT COALESCE(SUM(amount),0) s FROM dist_withdraw WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND status IN ('pending','approved')"
    ).get(tenantId, userId, identityType).s;

    // 身份标签（小程序分销中心聚合）
    const tags = [];
    const partner = db.prepare('SELECT id, mode FROM dist_partner WHERE tenant_id = ? AND user_id = ? AND status = 1').get(tenantId, userId);
    const partnerMode = partner ? partner.mode : 0;
    if (partner) tags.push(partner.mode === 2 ? '全局合伙人' : '团队合伙人');
    const shareAll = db.prepare('SELECT id FROM dist_share_all WHERE tenant_id = ? AND user_id = ? AND status = 1').get(tenantId, userId);
    if (shareAll) tags.push('全民股东');
    const cats = db.prepare('SELECT category_id FROM dist_share_cat WHERE tenant_id = ? AND user_id = ? AND status = 1').all(tenantId, userId);
    for (const c of cats) tags.push(`行业-${c.category_id}股东`);
    const areas = db.prepare('SELECT area_code FROM dist_share_area WHERE tenant_id = ? AND user_id = ? AND status = 1').all(tenantId, userId);
    for (const a of areas) tags.push(`地区-${a.area_code}股东`);

    // 合伙人待分红/累计
    let partnerPending = 0, partnerTotal = 0;
    if (partner) {
      partnerPending = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type = 'partner' AND status = 'pending'").get(tenantId, userId, identityType).s;
      partnerTotal = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type = 'partner'").get(tenantId, userId, identityType).s;
    }
    // 股东待分红/累计
    const sharePending = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type IN ('share_all','share_cat','share_area') AND status = 'pending'").get(tenantId, userId, identityType).s;
    const shareTotal = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type IN ('share_all','share_cat','share_area')").get(tenantId, userId, identityType).s;
    // 分类型股东待分红/累计（壳页应用卡独立展示，避免汇总误导）
    const shareAllPending = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type = 'share_all' AND status = 'pending'").get(tenantId, userId, identityType).s;
    const shareAllTotal = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type = 'share_all'").get(tenantId, userId, identityType).s;
    const shareCatPending = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type = 'share_cat' AND status = 'pending'").get(tenantId, userId, identityType).s;
    const shareCatTotal = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type = 'share_cat'").get(tenantId, userId, identityType).s;
    const shareAreaPending = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type = 'share_area' AND status = 'pending'").get(tenantId, userId, identityType).s;
    const shareAreaTotal = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type = 'share_area'").get(tenantId, userId, identityType).s;

    // 基本设置 + 分销参数（C 端文案/申请页/展示开关）
    const cfg = svc.getConfig(tenantId);
    const myParent = svc.getRelation(tenantId, userId, identityType);
    // 当前用户信息（顶部用户卡头像/昵称）
    const self = db.prepare('SELECT nickname, avatar FROM platform_user WHERE id = ?').get(userId);
    // 分销等级判定（累计收益 + 直推人数 → 当前/下一等级）
    const lv = svc.resolveLevel(tenantId, (wallet && wallet.total_income) || 0, direct);
    // 微信订阅模板 ID（小程序端 requestSubscribeMessage 用）
    const distPlugRow = db.prepare("SELECT config FROM sys_tenant_plugin WHERE tenant_id = ? AND plugin_code = 'dist'").get(tenantId);
    let distSub = {};
    try { distSub = JSON.parse(distPlugRow?.config || '{}').subscribe || {}; } catch {}

    return {
      wallet,
      directCount: direct,
      indirectCount: indirect,
      monthCommission,
      monthNew,
      todayCommission,
      todayOrder,
      todayNew,
      withdrawing,
      totalCommission,
      totalOrders,
      // 分销等级判定（累计收益 + 直推人数 → 当前/下一等级）
      currentLevelName: lv.currentLevel.name,
      currentLevelNo: lv.currentLevel.no,
      nextLevel: lv.nextLevel,
      // 完整等级阶梯（C 端「等级说明」弹层）
      levels: svc.getLevels(tenantId),
      // 微信订阅模板 ID（小程序端 requestSubscribeMessage 用）
      subTmplReview: distSub.tmplReview || '',
      subTmplDone: distSub.tmplDone || '',
      // 类目/区域股东按维度分组（行业/地区维度待分红+累计，供 C 端分组展示）
      shareCatGroups: db.prepare(`
        SELECT s.category_id AS category,
          SUM(CASE WHEN l.status = 'pending' THEN l.amount ELSE 0 END) AS pending,
          SUM(CASE WHEN l.status IN ('pending','settled') THEN l.amount ELSE 0 END) AS total
        FROM dist_user_log l LEFT JOIN dist_order_split s ON s.order_id = l.order_id AND s.tenant_id = l.tenant_id
        WHERE l.tenant_id = ? AND l.user_id = ? AND l.identity_type = ? AND l.type = 'share_cat' AND s.category_id != ''
        GROUP BY s.category_id
      `).all(tenantId, userId, identityType),
      shareAreaGroups: db.prepare(`
        SELECT s.area_code AS area,
          SUM(CASE WHEN l.status = 'pending' THEN l.amount ELSE 0 END) AS pending,
          SUM(CASE WHEN l.status IN ('pending','settled') THEN l.amount ELSE 0 END) AS total
        FROM dist_user_log l LEFT JOIN dist_order_split s ON s.order_id = l.order_id AND s.tenant_id = l.tenant_id
        WHERE l.tenant_id = ? AND l.user_id = ? AND l.identity_type = ? AND l.type = 'share_area' AND s.area_code != ''
        GROUP BY s.area_code
      `).all(tenantId, userId, identityType),
      // 壳页卡片渲染依据：租户已开通的分销应用
      isEnableDist: !!pMap.dist,
      isEnablePartner: !!pMap.partner,
      isEnableShareAll: !!pMap['share-all'],
      isEnableShareCat: !!pMap['share-cat'],
      isEnableShareArea: !!pMap['share-area'],
      isPartner: !!partner,
      partnerMode,
      shareTags: tags,
      partnerPending,
      partnerTotal,
      sharePending,
      shareTotal,
      shareAllPending,
      shareAllTotal,
      shareCatPending,
      shareCatTotal,
      shareAreaPending,
      shareAreaTotal,
      // —— 2026-09-09 基本设置 / 分销参数透传 ——
      distName: cfg.dist_name || '推广员',
      subName: cfg.sub_name || '下级',
      applyTopImg: cfg.apply_top_img || '',
      promoteImg: cfg.promote_img || '',
      posterTemplates: (() => { try { return JSON.parse(cfg.poster_templates || '[]'); } catch { return []; } })(),
      applyTip: cfg.apply_tip || '',
      zeroOrder: !!cfg.zero_order,
      showParent: !!cfg.show_parent,
      showPhone: !!cfg.show_phone,
      withdrawMin: Number(cfg.min_withdraw || 0),
      withdrawFeeRate: Number(cfg.withdraw_fee_rate || 0),
      defaultLevel: cfg.default_level || '默认等级',
      selfName: self ? (self.nickname || '我') : '我',
      selfAvatar: self ? (self.avatar || '') : '',
      // —— 2026-09-09 关系设置 / 分享设置 / 申请协议 / 分销须知 ——
      bindRule: cfg.bind_rule || 0,
      becomeRule: cfg.become_rule !== undefined ? cfg.become_rule : (cfg.distributor_gate || 0),
      becomeAmount: Number(cfg.become_amount || 0),
      becomeProducts: cfg.become_products || '',
      shareTitle: cfg.share_title || '',
      shareImg: cfg.share_img || '',
      applyAgreement: cfg.apply_agreement || '',
      distNotice: cfg.dist_notice || '',
      posterBadge: cfg.poster_badge !== undefined ? !!cfg.poster_badge : true,
      // 显示上级：我的上级推荐人（仅 show_parent 开启时前端展示）
      parent: myParent && myParent.pid1
        ? (() => { const pu = db.prepare('SELECT id, nickname, avatar FROM platform_user WHERE id = ?').get(myParent.pid1); return pu ? { userId: pu.id, nickname: pu.nickname || '微信用户', avatar: pu.avatar || '' } : null; })()
        : null,
    };
  };

  /** 合伙人「我的团队」：沿 pid1 递归收集全部团队成员（BFS，防环） */
  svc.buildTeam = (tenantId, rootUserId, identityType) => {
    const visited = new Set([String(rootUserId)]);
    const queue = [{ id: rootUserId, depth: 0 }];
    const team = [];
    let guard = 0;
    while (queue.length && guard++ < 5000) {
      const cur = queue.shift();
      const rows = db.prepare(`
        SELECT r.user_id AS userId, r.bind_time AS bindTime, u.nickname, u.avatar
        FROM dist_user_relation r LEFT JOIN platform_user u ON u.id = r.user_id
        WHERE r.tenant_id = ? AND r.pid1 = ? AND r.identity_type = ? AND r.status = 'bound'
      `).all(tenantId, cur.id, identityType);
      for (const r of rows) {
        if (visited.has(String(r.userId))) continue;
        visited.add(String(r.userId));
        team.push({ id: r.userId, nickname: r.nickname || '微信用户', avatar: r.avatar || '', createdAt: r.bindTime, level: cur.depth + 1 });
        queue.push({ id: r.userId, depth: cur.depth + 1 });
      }
    }
    return { team, total: team.length };
  };

  /** 合伙人「团队流水」：团队成员产生的付费订单明细（含该订单给合伙人的分红） */
  svc.getTeamOrders = (tenantId, partnerUserId, identityType, { page = 1, pageSize = 20 } = {}) => {
    const { team } = svc.buildTeam(tenantId, partnerUserId, identityType);
    const ids = team.map((m) => m.id);
    if (!ids.length) return { total: 0, list: [] };
    const marks = ids.map(() => '?').join(',');
    const params = [tenantId, ...ids];
    const total = db.prepare(`SELECT COUNT(*) n FROM dist_order_split WHERE tenant_id = ? AND buyer_user_id IN (${marks})`).get(...params).n;
    const rows = db.prepare(`
      SELECT s.order_no, s.order_amount, s.partner_bonus, s.settle_status, s.created_at, u.nickname
      FROM dist_order_split s LEFT JOIN platform_user u ON u.id = s.buyer_user_id
      WHERE s.tenant_id = ? AND s.buyer_user_id IN (${marks})
      ORDER BY s.id DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize);
    const stZh = { pending: '待结算', settled: '已结算', refunded: '已退款回滚' };
    return {
      total,
      list: rows.map((r) => ({
        orderNo: r.order_no || '', nickname: r.nickname || '微信用户',
        orderAmount: r.order_amount, partnerBonus: r.partner_bonus,
        settleStatus: r.settle_status, settleLabel: stZh[r.settle_status] || r.settle_status,
        createdAt: r.created_at,
      })),
    };
  };

  /** 我的下级客户列表（PRD 5.2：直推 pid1=me / 间推 pid2=me；含是否付费） */
  svc.getSubs = (tenantId, userId, identityType, { level = 1, page = 1, pageSize = 20 } = {}) => {
    const pidCol = level === 2 ? 'pid2' : 'pid1';
    const where = `r.tenant_id = ? AND r.${pidCol} = ? AND r.identity_type = ? AND r.status = 'bound'`;
    const total = db.prepare(`SELECT COUNT(*) n FROM dist_user_relation r WHERE ${where}`).get(tenantId, userId, identityType).n;
    const list = db.prepare(`
      SELECT r.user_id AS userId, r.bind_time, r.source_type,
        u.nickname, u.avatar, u.phone,
        (SELECT COUNT(*) FROM payment_orders o WHERE o.user_id = r.user_id AND o.status = 'paid') AS paidCount
      FROM dist_user_relation r
      LEFT JOIN platform_user u ON u.id = r.user_id
      WHERE ${where}
      ORDER BY r.id DESC LIMIT ? OFFSET ?
    `).all(tenantId, userId, identityType, pageSize, (page - 1) * pageSize);
    return {
      total,
      list: list.map((r) => ({
        userId: r.userId, nickname: r.nickname || '微信用户', avatar: r.avatar || '',
        bindTime: r.bind_time, sourceType: r.source_type, paid: r.paidCount > 0,
        phone: r.phone || '',
      })),
    };
  };

  /** 收益流水（分页） */
  /** 分账快照列表（租户对账：逐笔订单完整分账明细） */
  svc.getSplits = (tenantId, { page = 1, pageSize = 20, settleStatus = '' } = {}) => {
    let where = 'WHERE s.tenant_id = ?';
    const params = [tenantId];
    if (settleStatus) { where += ' AND s.settle_status = ?'; params.push(settleStatus); }
    const total = db.prepare(`SELECT COUNT(*) n FROM dist_order_split s ${where}`).get(...params).n;
    const list = db.prepare(`
      SELECT s.*, u.nickname
      FROM dist_order_split s LEFT JOIN platform_user u ON u.id = s.buyer_user_id
      ${where} ORDER BY s.id DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize);
    const fmt = (row) => ({
      id: row.id, orderNo: row.order_no, orderAmount: row.order_amount,
      buyerUserId: row.buyer_user_id, buyerIdentityType: row.buyer_identity_type,
      nickname: row.nickname || '微信用户',
      categoryId: row.category_id, areaCode: row.area_code,
      commission1: row.commission1, commission2: row.commission2,
      partner: row.partner_bonus, shareAll: row.share_all_bonus, shareCat: row.share_cat_bonus, shareArea: row.share_area_bonus,
      totalBonus: row.total_bonus, settleStatus: row.settle_status, createdAt: row.created_at,
    });
    return { total, list: list.map(fmt) };
  };

  svc.getLogs = (tenantId, userId, identityType, { page = 1, pageSize = 20, type = '' } = {}) => {
    let sql = "SELECT l.*, s.order_no, s.category_id, s.area_code FROM dist_user_log l LEFT JOIN dist_order_split s ON s.order_id = l.order_id AND s.tenant_id = l.tenant_id WHERE l.tenant_id = ? AND l.user_id = ? AND l.identity_type = ?";
    const params = [tenantId, userId, identityType];
    if (type) { sql += ' AND l.type = ?'; params.push(type); }
    const total = db.prepare(sql.replace('SELECT l.*, s.order_no, s.category_id, s.area_code', 'SELECT COUNT(*) n')).get(...params).n;
    sql += ' ORDER BY l.id DESC LIMIT ? OFFSET ?';
    params.push(pageSize, (page - 1) * pageSize);
    const rows = db.prepare(sql).all(...params);
    // 驼峰化 + 类型/状态中文化（供 C 端直接渲染）
    const typeZh = { level1: '一级佣金', level2: '二级佣金', self: '自购返佣', partner: '合伙人分红', share_all: '全民股东分红', share_cat: '类目股东分红', share_area: '区域股东分红' };
    const statusZh = { pending: '待结算', settled: '已结算', charged_back: '已扣回' };
    return {
      total,
      list: rows.map((r) => ({
        id: r.id,
        type: r.type,
        typeLabel: typeZh[r.type] || r.type,
        amount: r.amount,
        status: r.status,
        statusLabel: statusZh[r.status] || r.status,
        orderNo: r.order_no || '',
        orderId: r.order_id,
        sourceCategory: r.category_id || '',
        sourceArea: r.area_code || '',
        remark: r.remark || '',
        createdAt: r.created_at,
      })),
    };
  };

  /** 提现记录（分页） */
  svc.getWithdraws = (tenantId, userId, identityType, { page = 1, pageSize = 20, status = '' } = {}) => {
    let sql = 'SELECT * FROM dist_withdraw WHERE tenant_id = ? AND user_id = ? AND identity_type = ?';
    const params = [tenantId, userId, identityType];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) n')).get(...params).n;
    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(pageSize, (page - 1) * pageSize);
    return { total, list: db.prepare(sql).all(...params) };
  };

  return svc;
}

/** 推广分享链接（PRD：名片ID + 租户归属，扫码跳名片自动绑定上下级） */
export function buildShareUrl(userId, origin) {
  const base = origin.replace(/\/$/, '');
  return `${base}/card/#/pages/card/cardDetail?id=${Number(userId)}&inviter=${Number(userId)}`;
}

/** 构建分销关系树：根 = 无 pid1 或 pid1 不在本租户关系集的节点；防环 guard 20 层 */
export function buildRelationTree(relations, tagMap = new Map()) {
  const byUser = new Map();
  for (const r of relations) byUser.set(r.userId, r);
  const roots = [];
  const visited = new Set();
  const build = (userId, depth = 0) => {
    if (depth > 20 || visited.has(userId)) return null; // 防环
    visited.add(userId);
    const rel = byUser.get(userId);
    const node = {
      userId,
      nickname: rel ? rel.nickname || `用户${userId}` : `用户${userId}`,
      identityType: rel ? rel.identity_type : 'individual',
      tags: tagMap.get(userId) || [],
      children: [],
    };
    for (const [id, r] of byUser) {
      if (r.pid1 === userId) {
        const child = build(id, depth + 1);
        if (child) node.children.push(child);
      }
    }
    return node;
  };
  for (const [id, r] of byUser) {
    const isRoot = !r.pid1 || !byUser.has(r.pid1);
    if (isRoot) {
      const n = build(id);
      if (n) roots.push(n);
    }
  }
  return roots;
}

const WITHDRAW_STATUS_ZH = { pending: '待审核', approved: '待打款', rejected: '已驳回', done: '已完成' };

/** 提现对账 CSV（带 BOM；金额分转元两位小数；字段含流水号/打款备注，可完整对账） */
export function buildWithdrawCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['提现单号', '用户', '身份', '提现金额(元)', '手续费(元)', '实际到账(元)', '状态', '收款方式', '提交时间', '打款时间', '打款流水号', '打款备注', '驳回原因'];
  const acctLabel = (r) => {
    if (!r.pay_account) return '';
    try {
      const o = JSON.parse(r.pay_account);
      const typeZh = { wx: '微信', alipay: '支付宝', bank: '银行卡' };
      return `${typeZh[o.type] || o.type}${o.name ? '·' + o.name : ''}:${o.value}`;
    } catch { return r.pay_account; }
  };
  const lines = [head.map(esc).join(',')];
  for (const r of rows) {
    lines.push([
      r.withdraw_no, r.nickname || '微信用户', r.identity_type === 'employee' ? '企业员工' : '入驻个人',
      (r.amount / 100).toFixed(2), (r.service_fee / 100).toFixed(2), (r.actual_amount / 100).toFixed(2),
      WITHDRAW_STATUS_ZH[r.status] || r.status, acctLabel(r), r.created_at, r.paid_at || '', r.pay_no || '', r.pay_remark || '', r.reject_reason || ''
    ].map(esc).join(','));
  }
  return '\uFEFF' + lines.join('\n');
}

/** 月度汇总 CSV：按用户 + 收益类型汇总（BOM；金额分转元；类型中文化） */
export function buildMonthlyCsv(summary) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const TYPES = [['level1', '一级佣金'], ['level2', '二级佣金'], ['partner', '合伙人分红'], ['share_all', '全民股东'], ['share_cat', '类目股东'], ['share_area', '区域股东']];
  const head = ['用户', ...TYPES.map((t) => t[1] + '(元)'), '合计(元)'];
  const lines = [head.map(esc).join(',')];
  for (const u of summary.byUser) {
    const cells = [u.nickname];
    for (const [k] of TYPES) cells.push((u[k] / 100).toFixed(2));
    cells.push((u.total / 100).toFixed(2));
    lines.push(cells.map(esc).join(','));
  }
  // 末行合计
  const totalCells = ['合计'];
  for (const [k] of TYPES) totalCells.push((summary.byType[k] / 100).toFixed(2));
  totalCells.push((summary.total / 100).toFixed(2));
  lines.push(totalCells.map(esc).join(','));
  return '\uFEFF' + lines.join('\n');
}

/** 月度对账 CSV（升级口径：扣回负计、实得、提现；含合计行） */
export function buildStatementCsv(summary) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const TYPES = [['level1', '一级佣金'], ['level2', '二级佣金'], ['partner', '合伙人分红'], ['share_all', '全民股东'], ['share_cat', '类目股东'], ['share_area', '区域股东']];
  const head = ['用户', '身份', ...TYPES.map((t) => t[1] + '(元)'), '扣回(元)', '实得(元)', '提现(元)'];
  const lines = [head.map(esc).join(',')];
  for (const u of summary.byUser) {
    const cells = [u.nickname, u.identityType === 'employee' ? '企业员工' : '入驻个人'];
    for (const [k] of TYPES) cells.push((u[k] / 100).toFixed(2));
    cells.push((u.chargedBack / 100).toFixed(2));
    cells.push((u.total / 100).toFixed(2));
    cells.push((u.withdraw / 100).toFixed(2));
    lines.push(cells.map(esc).join(','));
  }
  const totalCells = ['合计', ''];
  for (const [k] of TYPES) totalCells.push((summary.byType[k] / 100).toFixed(2));
  totalCells.push((summary.chargedBack / 100).toFixed(2));
  totalCells.push((summary.total / 100).toFixed(2));
  totalCells.push((summary.withdrawTotal / 100).toFixed(2));
  lines.push(totalCells.map(esc).join(','));
  return '\uFEFF' + lines.join('\n');
}

/** 月度对账 HTML（自包含，浏览器打印即存 PDF；含汇总卡/明细表/合计/欠款提示） */
export function buildStatementHtml(summary, opts = {}) {
  const TYPES = [['level1', '一级佣金'], ['level2', '二级佣金'], ['partner', '合伙人分红'], ['share_all', '全民股东'], ['share_cat', '类目股东'], ['share_area', '区域股东']];
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = (v) => (Number(v) / 100).toFixed(2);
  const rowsHtml = summary.byUser.map((u) => {
    const tds = [esc(u.nickname), u.identityType === 'employee' ? '企业员工' : '入驻个人']
      .concat(TYPES.map(([k]) => `<td>${fmt(u[k])}</td>`))
      .concat([`<td class="neg">${fmt(u.chargedBack)}</td>`, `<td><b>${fmt(u.total)}</b></td>`, `<td>${fmt(u.withdraw)}</td>`]);
    return `<tr>${tds.join('')}</tr>`;
  }).join('\n');
  const totalRow = `<tr class="total">${['<td>合计</td>', '<td></td>'].concat(TYPES.map(([k]) => `<td>${fmt(summary.byType[k])}</td>`)).concat([`<td class="neg">${fmt(summary.chargedBack)}</td>`, `<td><b>${fmt(summary.total)}</b></td>`, `<td>${fmt(summary.withdrawTotal)}</td>`]).join('')}</tr>`;
  const debtTip = summary.debtAmount > 0
    ? `<div class="debt-tip">本月扣回产生待追缴欠款 <b>${fmt(summary.debtAmount)} 元</b>（余额不足抵扣），请在后台核实并线下追缴。</div>`
    : '';
  const cards = [
    ['总收益（净）', `${fmt(summary.total)} 元`],
    ['已结算', `${fmt(summary.settled)} 元`],
    ['待结算', `${fmt(summary.pending)} 元`],
    ['扣回', `${fmt(summary.chargedBack)} 元`],
    ['提现（实得）', `${fmt(summary.withdrawTotal)} 元`],
    ['欠款', `${fmt(summary.debtAmount)} 元`],
  ].map(([k, v]) => `<div class="card"><div class="card-label">${k}</div><div class="card-val">${v}</div></div>`).join('');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>分销佣金月度对账单 - ${summary.month}</title>
<style>
  body { font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #1d2129; margin: 32px auto; max-width: 1080px; padding: 0 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; } .sub { color: #86909c; font-size: 13px; margin-bottom: 20px; }
  .cards { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .card { flex: 1 1 140px; border: 1px solid #e5e6eb; border-radius: 8px; padding: 12px 16px; }
  .card-label { font-size: 12px; color: #86909c; } .card-val { font-size: 20px; font-weight: 600; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #e5e6eb; padding: 8px 10px; text-align: right; white-space: nowrap; }
  th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
  th { background: #f7f8fa; font-weight: 600; }
  tr.total td { background: #f0f7ff; font-weight: 600; }
  .neg { color: #f53f3f; }
  .debt-tip { margin: 16px 0; padding: 12px 16px; background: #fff7e8; border: 1px solid #ffd24a; border-radius: 8px; font-size: 13px; color: #ad6800; }
  .foot { margin-top: 24px; color: #86909c; font-size: 12px; }
  @media print { body { margin: 0; } }
</style></head><body>
  <h1>分销佣金月度对账单</h1>
  <div class="sub">租户：${esc(opts.tenantName || `#${opts.tenantId || ''}`)} ｜ 账期：${summary.month} ｜ 生成时间：${new Date().toLocaleString('zh-CN')}</div>
  <div class="cards">${cards}</div>
  ${debtTip}
  <table>
    <thead><tr><th>用户</th><th>身份</th>${TYPES.map((t) => `<th>${t[1]}(元)</th>`).join('')}<th>扣回(元)</th><th>实得(元)</th><th>提现(元)</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="11" style="text-align:center;color:#86909c;">本月暂无收益记录</td></tr>'}</tbody>
    <tfoot>${totalRow}</tfoot>
  </table>
  <div class="foot">口径说明：实得 = 各类收益净额（扣回按负额计入）；提现 = 提现金额 - 手续费；欠款 = 退款回滚时余额不足产生的待追缴金额。<br>本对账单由系统生成，可浏览器打印（Ctrl/Cmd + P）另存为 PDF。</div>
</body></html>`;
}
const LOG_TYPE_ZH = { level1: '一级佣金', level2: '二级佣金', partner: '合伙人分红', share_all: '全民股东', share_cat: '类目股东', share_area: '区域股东' };
const LOG_STATUS_ZH = { pending: '待结算', settled: '已结算', charged_back: '已扣回' };

/** 佣金/分红明细 CSV（BOM；金额分转元；类型/状态中文化；含订单号可对账） */
export function buildLogCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['用户', '身份', '收益类型', '金额(元)', '状态', '订单号', '时间'];
  const lines = [head.map(esc).join(',')];
  for (const r of rows) {
    lines.push([
      r.nickname || '微信用户', r.identity_type === 'employee' ? '企业员工' : '入驻个人',
      LOG_TYPE_ZH[r.type] || r.type, (r.amount / 100).toFixed(2),
      LOG_STATUS_ZH[r.status] || r.status, r.order_no || '', r.created_at || ''
    ].map(esc).join(','));
  }
  return '\uFEFF' + lines.join('\n');
}
