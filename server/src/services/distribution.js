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
  // 分账调度器（订单支付成功后调用）
  // ============================================================

  /**
   * 对已支付订单做分账（幂等：每租户每订单一条快照）
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

    // dist 插件未安装/未启用则不分账（partner/share-* 后续插件各自扩展）
    const plugin = svc.getPlugin(tenantId, 'dist');
    const pluginOn = plugin ? plugin.is_install && plugin.is_enable : false;
    if (!pluginOn) return null;

    const config = svc.getConfig(tenantId);
    const buyer = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(order.userId);
    if (!buyer) return null;
    const buyerIdentity = order.buyerIdentityType || buyer.identity_type || 'individual';
    const rel = svc.getRelation(tenantId, order.userId, buyerIdentity);

    // 计算基数：1实付 2原价
    const base = config.calc_type === 2 ? (order.originalAmount || order.amount) : order.amount;
    if (!base || base <= 0) return null;

    const logRows = []; // {userId, identityType, type, amount, remark}
    let c1 = 0, c2 = 0, self = 0;

    // 一级佣金
    if (rel && rel.pid1) {
      c1 = Math.floor(base * config.ratio1);
      if (c1 > 0) logRows.push({ userId: rel.pid1, identityType: buyerIdentity, type: 'level1', amount: c1, remark: '一级推广佣金' });
    }
    // 二级佣金
    if (rel && config.is_open_level2 && rel.pid2) {
      c2 = Math.floor(base * config.ratio2);
      if (c2 > 0) logRows.push({ userId: rel.pid2, identityType: buyerIdentity, type: 'level2', amount: c2, remark: '二级推广佣金' });
    }
    // 自购返佣（买家本人为分销商时，给自己返一份一级比例）
    if (config.is_self_buy && rel) {
      self = Math.floor(base * config.ratio1);
      if (self > 0) logRows.push({ userId: order.userId, identityType: buyerIdentity, type: 'level1', amount: self, remark: '自购返佣' });
    }

    // 订单总让利上限裁剪
    const maxTotal = Math.floor(base * config.max_total_ratio);
    let total = c1 + c2 + self;
    if (total > maxTotal && total > 0) {
      const scale = maxTotal / total;
      for (const row of logRows) row.amount = Math.floor(row.amount * scale);
      c1 = Math.floor(c1 * scale); c2 = Math.floor(c2 * scale); self = Math.floor(self * scale);
      total = c1 + c2 + self;
    }
    if (total <= 0) return null;

    const doSplit = () => {
      const r = db.prepare(`
        INSERT INTO dist_order_split (tenant_id, order_id, order_no, order_amount, buyer_user_id, buyer_identity_type,
          category_id, area_code, commission1, commission2, partner_bonus, share_all_bonus, share_cat_bonus, share_area_bonus,
          total_bonus, settle_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, 'pending')
      `).run(tenantId, order.id, order.orderNo, base, order.userId, buyerIdentity,
        buyer.category_id || null, buyer.area_code || null, c1, c2, total);
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

  /** 用户收益汇总（钱包 + 直推/间推人数 + 本月佣金） */
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
    return {
      wallet,
      directCount: direct,
      indirectCount: indirect,
      monthCommission,
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
