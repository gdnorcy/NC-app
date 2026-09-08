/**
 * 分销体系核心服务（插件化二级推广分销底座）
 * - 金额统一「分」整数，与 payment_orders 一致
 * - 全表 tenant_id 租户隔离；钱包三键隔离 (tenant_id, user_id, identity_type)
 * - 核心对账：dist_order_split 快照唯一数据源，退款/插件关闭均不删除
 */
export function createDistributionService(db) {
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

  /** 保存租户二级分销配置（数值白名单校验） */
  svc.saveConfig = (tenantId, patch = {}) => {
    const cur = svc.getConfig(tenantId);
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
    };
    db.prepare(`
      UPDATE dist_config SET ratio1=?, ratio2=?, is_open_level2=?, is_self_buy=?, calc_type=?,
        settle_day=?, min_withdraw=?, withdraw_fee_rate=?, max_total_ratio=?, updated_at=datetime('now')
      WHERE tenant_id=?
    `).run(next.ratio1, next.ratio2, next.is_open_level2, next.is_self_buy, next.calc_type,
      next.settle_day, next.min_withdraw, next.withdraw_fee_rate, next.max_total_ratio, tenantId);
    return svc.getConfig(tenantId);
  };

  // ============================================================
  // 溯源绑定（租户维度永久锁定）
  // ============================================================

  /** 读取绑定关系（不存在返回 null） */
  svc.getRelation = (tenantId, userId, identityType = 'individual') => {
    return db.prepare('SELECT * FROM dist_user_relation WHERE tenant_id = ? AND user_id = ? AND identity_type = ?')
      .get(tenantId, userId, identityType) || null;
  };

  /**
   * 绑定上下级：已绑定永久锁定；pid 需为有效用户、非自己、且沿上级链无环
   * 返回 { ok, error?, relation? }
   */
  svc.bindRelation = (tenantId, userId, identityType, pid, sourceType = 'card') => {
    if (!tenantId || !userId) return { ok: false, error: '参数缺失' };
    if (pid === userId) return { ok: false, error: '不能绑定自己' };
    const exist = svc.getRelation(tenantId, userId, identityType);
    if (exist) return { ok: true, relation: exist }; // 永久锁定

    let pid1 = null, pid2 = null;
    if (pid) {
      const parentUser = db.prepare('SELECT id FROM platform_user WHERE id = ?').get(pid);
      if (!parentUser) return { ok: false, error: '上级不存在' };
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
    const r = db.prepare('INSERT INTO dist_user_relation (tenant_id, user_id, identity_type, pid1, pid2, source_type) VALUES (?, ?, ?, ?, ?, ?)')
      .run(tenantId, userId, identityType, pid1, pid2, sourceType);
    return { ok: true, relation: svc.getRelation(tenantId, userId, identityType) };
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

    // —— 插件一：二级推广分销 ——
    if (active.includes('dist')) {
      if (rel && rel.pid1) {
        col.c1 = Math.floor(base * config.ratio1);
        if (col.c1 > 0) logRows.push({ userId: rel.pid1, identityType: buyerIdentity, type: 'level1', amount: col.c1, remark: '一级推广佣金' });
      }
      if (rel && config.is_open_level2 && rel.pid2) {
        col.c2 = Math.floor(base * config.ratio2);
        if (col.c2 > 0) logRows.push({ userId: rel.pid2, identityType: buyerIdentity, type: 'level2', amount: col.c2, remark: '二级推广佣金' });
      }
      if (config.is_self_buy && rel) {
        col.self = Math.floor(base * config.ratio1);
        if (col.self > 0) logRows.push({ userId: order.userId, identityType: buyerIdentity, type: 'level1', amount: col.self, remark: '自购返佣' });
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
        VALUES (?, ?, ?, ?, 0, 0, 0)
        ON CONFLICT(tenant_id, user_id, identity_type) DO UPDATE SET
          wait_settle = dist_wallet.wait_settle + excluded.wait_settle,
          total_income = dist_wallet.total_income + excluded.total_income,
          updated_at = datetime('now')
      `);
      for (const row of logRows) {
        logIns.run(tenantId, row.userId, row.identityType, order.id, order.orderNo, splitId, row.type, row.amount, row.remark);
        walletAdd.run(tenantId, row.userId, row.identityType, row.amount);
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
    let settledLogs = 0;
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
          settledLogs++;
        }
      }
    };
    for (const t of tenants) tx(() => doSettle(t.tenant_id, t.settle_day));
    return settledLogs;
  };

  // ============================================================
  // 提现
  // ============================================================

  /**
   * 申请提现：校验余额/最低门槛 → 计算手续费 → 冻结余额 → 生成记录
   */
  svc.applyWithdraw = (tenantId, userId, identityType, amountYuan) => {
    const config = svc.getConfig(tenantId);
    const wallet = svc.getWallet(tenantId, userId, identityType);
    const amount = Math.round(Number(amountYuan) * 100); // 分
    if (amount <= 0) return { ok: false, error: '提现金额无效' };
    if (wallet.available < amount) return { ok: false, error: '可提现余额不足' };
    if (amount < config.min_withdraw * 100) return { ok: false, error: `可提现余额不足最低提现门槛${config.min_withdraw}元` };

    const fee = Math.floor(amount * config.withdraw_fee_rate);
    const actual = amount - fee;
    const no = 'WD' + Date.now() + String(userId).slice(-4);
    const doApply = () => {
      db.prepare("UPDATE dist_wallet SET available = available - ?, total_withdraw = total_withdraw + ?, updated_at = datetime('now') WHERE tenant_id = ? AND user_id = ? AND identity_type = ?")
        .run(amount, amount, tenantId, userId, identityType);
      db.prepare('INSERT INTO dist_withdraw (withdraw_no, tenant_id, user_id, identity_type, amount, service_fee, actual_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(no, tenantId, userId, identityType, amount, fee, actual, 'pending');
    };
    tx(doApply);
    return { ok: true, withdrawNo: no };
  };

  /** 提现审核：reject（驳回退款） / approve（通过待打款） / done（完成打款） */
  svc.reviewWithdraw = (withdrawId, action, reason = '') => {
    const row = db.prepare('SELECT * FROM dist_withdraw WHERE id = ?').get(withdrawId);
    if (!row) return { ok: false, error: '提现记录不存在' };
    if (action === 'reject') {
      if (row.status !== 'pending') return { ok: false, error: '仅待审核可驳回' };
      const doReject = () => {
        db.prepare("UPDATE dist_withdraw SET status = 'rejected', reject_reason = ?, updated_at = datetime('now') WHERE id = ?").run(reason || '审核不通过', withdrawId);
        db.prepare("UPDATE dist_wallet SET available = available + ?, total_withdraw = MAX(0, total_withdraw - ?), updated_at = datetime('now') WHERE tenant_id = ? AND user_id = ? AND identity_type = ?")
          .run(row.amount, row.amount, row.tenant_id, row.user_id, row.identity_type);
      };
      tx(doReject);
      return { ok: true };
    }
    if (action === 'approve') {
      if (row.status !== 'pending') return { ok: false, error: '仅待审核可通过' };
      db.prepare("UPDATE dist_withdraw SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(withdrawId);
      return { ok: true };
    }
    if (action === 'done') {
      if (row.status !== 'approved') return { ok: false, error: '仅审核通过可打款完成' };
      db.prepare("UPDATE dist_withdraw SET status = 'done', paid_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(withdrawId);
      return { ok: true };
    }
    return { ok: false, error: '未知操作' };
  };

  // ============================================================
  // 查询（租户后台/小程序端）
  // ============================================================

  /** 用户收益汇总（钱包 + 直推/间推人数 + 本月佣金 + 身份标签） */
  svc.getSummary = (tenantId, userId, identityType) => {
    const wallet = svc.getWallet(tenantId, userId, identityType);
    const direct = db.prepare('SELECT COUNT(*) n FROM dist_user_relation WHERE tenant_id = ? AND pid1 = ?').get(tenantId, userId).n;
    const indirect = db.prepare('SELECT COUNT(*) n FROM dist_user_relation WHERE tenant_id = ? AND pid2 = ?').get(tenantId, userId).n;
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthKey = monthStart.toISOString().slice(0, 10);
    const monthCommission = db.prepare(
      "SELECT COALESCE(SUM(amount),0) s FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ? AND type IN ('level1','level2') AND substr(created_at,1,10) >= ?"
    ).get(tenantId, userId, identityType, monthKey).s;

    // 身份标签（小程序分销中心聚合）
    const tags = [];
    const partner = db.prepare('SELECT id, mode FROM dist_partner WHERE tenant_id = ? AND user_id = ? AND status = 1').get(tenantId, userId);
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

    return {
      wallet,
      directCount: direct,
      indirectCount: indirect,
      monthCommission,
      isPartner: !!partner,
      shareTags: tags,
      partnerPending,
      partnerTotal,
      sharePending,
      shareTotal,
    };
  };

  /** 收益流水（分页） */
  svc.getLogs = (tenantId, userId, identityType, { page = 1, pageSize = 20, type = '' } = {}) => {
    let sql = "SELECT * FROM dist_user_log WHERE tenant_id = ? AND user_id = ? AND identity_type = ?";
    const params = [tenantId, userId, identityType];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) n')).get(...params).n;
    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(pageSize, (page - 1) * pageSize);
    return { total, list: db.prepare(sql).all(...params) };
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
