/**
 * 会员体系服务层（租户级会员，1:1 复刻菜鸟云「用户」菜单）
 * 等级/开卡/申请审核/积分签到/消费积分流水/用户标签/会员设置/列表统计/导出
 */
import { randomBytes } from 'node:crypto';

const DEFAULT_SETTINGS = () => ({
  card_enabled: 1,
  expire_remind_days: 7,
  show_name: 1,
  show_expire: 1,
  permissions: {},
});

function parseJson(s, fallback) {
  try { return JSON.parse(s || '') || fallback; } catch { return fallback; }
}

export function createMemberService(db) {
  // ---------------- 工具 ----------------
  function genCardNo() {
    // 菜鸟云同款：时间戳样式卡号
    return String(Date.now()) + String(Math.floor(Math.random() * 100)).padStart(2, '0');
  }
  function esc(s) {
    return String(s ?? '').replace(/"/g, '""');
  }
  function buildCsv(headers, rows) {
    return '\ufeff' + headers.map(esc).join(',') + '\n' + rows.map((r) => r.map(esc).join(',')).join('\n');
  }
  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  // ---------------- 会员等级 ----------------
  function fmtLevel(r) {
    return { ...r, benefits: parseJson(r.benefits, {}) };
  }
  function getLevel(tenantId, id) {
    const r = db.prepare('SELECT * FROM member_levels WHERE id = ? AND tenant_id = ?').get(id, tenantId);
    return r ? fmtLevel(r) : null;
  }
  function listLevels(tenantId) {
    return db.prepare('SELECT * FROM member_levels WHERE tenant_id = ? ORDER BY level_no ASC').all(tenantId).map(fmtLevel);
  }
  function addLevel(tenantId, d) {
    const levelNo = Number(d.levelNo) || 1;
    const info = db.prepare(
      `INSERT INTO member_levels (tenant_id, level_no, name, status, icon, bg_color, text_show, text_color, upgrade_mode, consume_amount, buy_price, buy_product, form_id, benefits, description, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      tenantId, levelNo, d.name || '', d.status === 0 ? 0 : 1, d.icon || '', d.bgColor || '',
      d.textShow === 0 ? 0 : 1, d.textColor || '#ffffff', d.upgradeMode || 'consume',
      Math.round(Number(d.consumeAmount) || 0), Math.round(Number(d.buyPrice) || 0),
      d.buyProduct || '', Number(d.formId) || 0, JSON.stringify(d.benefits || {}),
      d.description || '', Number(d.sortOrder) || levelNo
    );
    return getLevel(tenantId, info.lastInsertRowid);
  }
  function updateLevel(tenantId, id, d) {
    const cur = getLevel(tenantId, id);
    if (!cur) return null;
    db.prepare(
      `UPDATE member_levels SET level_no=?, name=?, status=?, icon=?, bg_color=?, text_show=?, text_color=?, upgrade_mode=?, consume_amount=?, buy_price=?, buy_product=?, form_id=?, benefits=?, description=?, sort_order=? WHERE id=? AND tenant_id=?`
    ).run(
      d.levelNo ?? cur.level_no, d.name ?? cur.name,
      d.status === undefined ? cur.status : (d.status === 0 ? 0 : 1),
      d.icon ?? cur.icon, d.bgColor ?? cur.bg_color,
      d.textShow === undefined ? cur.text_show : (d.textShow === 0 ? 0 : 1),
      d.textColor ?? cur.text_color, d.upgradeMode ?? cur.upgrade_mode,
      d.consumeAmount === undefined ? cur.consume_amount : Math.round(Number(d.consumeAmount) || 0),
      d.buyPrice === undefined ? cur.buy_price : Math.round(Number(d.buyPrice) || 0),
      d.buyProduct ?? cur.buy_product,
      d.formId === undefined ? cur.form_id : Number(d.formId) || 0,
      d.benefits === undefined ? JSON.stringify(cur.benefits) : JSON.stringify(d.benefits),
      d.description ?? cur.description,
      d.sortOrder ?? cur.sort_order, id, tenantId
    );
    return getLevel(tenantId, id);
  }
  function deleteLevel(tenantId, id) {
    const used = db.prepare('SELECT COUNT(*) AS n FROM member_user WHERE tenant_id = ? AND level_id = ?').get(tenantId, id).n;
    if (used) return { ok: false, error: '该等级已有会员使用，禁止删除' };
    db.prepare('DELETE FROM member_levels WHERE id = ? AND tenant_id = ?').run(id, tenantId);
    return { ok: true };
  }

  // ---------------- 会员设置 ----------------
  function getSettings(tenantId) {
    const r = db.prepare('SELECT * FROM member_settings WHERE tenant_id = ?').get(tenantId);
    if (!r) return DEFAULT_SETTINGS();
    return {
      card_enabled: r.card_enabled,
      expire_remind_days: r.expire_remind_days,
      show_name: r.show_name,
      show_expire: r.show_expire,
      permissions: parseJson(r.permissions, {}),
    };
  }
  function saveSettings(tenantId, d) {
    db.prepare(
      `INSERT INTO member_settings (tenant_id, card_enabled, expire_remind_days, show_name, show_expire, permissions, updated_at)
       VALUES (?,?,?,?,?,?, datetime('now'))
       ON CONFLICT(tenant_id) DO UPDATE SET card_enabled=excluded.card_enabled, expire_remind_days=excluded.expire_remind_days, show_name=excluded.show_name, show_expire=excluded.show_expire, permissions=excluded.permissions, updated_at=datetime('now')`
    ).run(
      tenantId,
      d.cardEnabled === undefined ? 1 : (d.cardEnabled ? 1 : 0),
      Number(d.expireRemindDays) || 7,
      d.showName === undefined ? 1 : (d.showName ? 1 : 0),
      d.showExpire === undefined ? 1 : (d.showExpire ? 1 : 0),
      JSON.stringify(d.permissions || {})
    );
    return getSettings(tenantId);
  }

  // ---------------- 用户标签 ----------------
  function listLabels(tenantId) {
    return db.prepare(
      `SELECT l.id, l.name, l.created_at, COUNT(ul.user_id) AS user_count
       FROM member_labels l
       LEFT JOIN member_user_labels ul ON ul.label_id = l.id AND ul.tenant_id = l.tenant_id
       WHERE l.tenant_id = ?
       GROUP BY l.id ORDER BY l.id DESC`
    ).all(tenantId);
  }
  function addLabel(tenantId, name) {
    const n = String(name || '').trim();
    if (!n) return { ok: false, error: '标签名称不能为空' };
    const exists = db.prepare('SELECT id FROM member_labels WHERE tenant_id = ? AND name = ?').get(tenantId, n);
    if (exists) return { ok: false, error: '标签已存在' };
    const info = db.prepare('INSERT INTO member_labels (tenant_id, name) VALUES (?,?)').run(tenantId, n);
    return { ok: true, id: info.lastInsertRowid };
  }
  function deleteLabel(tenantId, id) {
    db.prepare('DELETE FROM member_labels WHERE id = ? AND tenant_id = ?').run(id, tenantId);
    db.prepare('DELETE FROM member_user_labels WHERE label_id = ? AND tenant_id = ?').run(id, tenantId);
    return { ok: true };
  }
  function setUserLabels(tenantId, userId, labelIds) {
    db.prepare('DELETE FROM member_user_labels WHERE tenant_id = ? AND user_id = ?').run(tenantId, userId);
    for (const lid of (labelIds || [])) {
      db.prepare('INSERT OR IGNORE INTO member_user_labels (tenant_id, user_id, label_id) VALUES (?,?,?)').run(tenantId, userId, Number(lid));
    }
    return userLabels(tenantId, userId);
  }
  function userLabels(tenantId, userId) {
    return db.prepare(
      `SELECT ml.id, ml.name FROM member_user_labels ul JOIN member_labels ml ON ml.id = ul.label_id WHERE ul.tenant_id = ? AND ul.user_id = ?`
    ).all(tenantId, userId);
  }

  // ---------------- 会员身份 / 开卡 ----------------
  function getMemberUser(tenantId, userId) {
    const r = db.prepare('SELECT * FROM member_user WHERE tenant_id = ? AND user_id = ?').get(tenantId, userId);
    return r || null;
  }
  function openCard(tenantId, userId, levelId, source = 'auto') {
    const level = getLevel(tenantId, levelId);
    if (!level) return { ok: false, error: '会员等级不存在' };
    const settings = getSettings(tenantId);
    if (!settings.card_enabled) return { ok: false, error: '会员卡未启用' };
    const cardNo = genCardNo();
    const cur = getMemberUser(tenantId, userId);
    db.prepare(
      `INSERT INTO member_user (tenant_id, user_id, card_no, level_id, status, updated_at)
       VALUES (?,?,?,?, 'active', datetime('now'))
       ON CONFLICT(tenant_id, user_id) DO UPDATE SET level_id=excluded.level_id, card_no=CASE WHEN member_user.card_no='' THEN excluded.card_no ELSE member_user.card_no END, status='active', updated_at=datetime('now')`
    ).run(tenantId, userId, cardNo, levelId);
    db.prepare(
      "INSERT INTO member_cards (tenant_id, user_id, card_no, level_id, source, opened_at) VALUES (?,?,?,?,?, datetime('now'))"
    ).run(tenantId, userId, cardNo, levelId, source);
    return { ok: true, cardNo: cur && cur.card_no ? cur.card_no : cardNo };
  }
  /** 支付成功回调：会员卡购买开卡 */
  function openCardByOrder(order) {
    if (!order || order.status !== 'paid' || !order.userId) return null;
    try {
      const r = openCard(order.customerId, order.userId, Number(order.productId), 'buy');
      // 消费流水（余额消费口径：购买会员扣减金额，写入流水便于对账）
      db.prepare(
        `INSERT INTO member_logs (tenant_id, user_id, type, amount, note, order_no) VALUES (?,?,?,?,?,?)`
      ).run(order.customerId, order.userId, 'consume', -Math.round(Number(order.amount) || 0), `购买会员：${order.productName || '会员卡'}`, order.orderNo);
      return r;
    } catch (e) {
      console.error('会员卡开卡失败:', e?.message || e);
      return null;
    }
  }

  // ---------------- C端：我的会员卡 / 申请 / 签到 ----------------
  function myCard(tenantId, userId) {
    const mu = getMemberUser(tenantId, userId);
    const levels = listLevels(tenantId);
    const settings = getSettings(tenantId);
    let applyStatus = null;
    const ap = db.prepare("SELECT * FROM member_apply WHERE tenant_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1").get(tenantId, userId);
    if (ap) applyStatus = { status: ap.status, reason: ap.reason, applyLevelId: ap.apply_level_id, createdAt: ap.created_at };
    let card = null;
    if (mu && mu.level_id) {
      const level = levels.find((l) => l.id === mu.level_id) || null;
      card = {
        cardNo: mu.card_no,
        levelId: mu.level_id,
        levelName: level ? level.name : '',
        levelNo: level ? level.level_no : 0,
        levelIcon: level ? level.icon : '',
        levelBgColor: level ? level.bg_color : '',
        levelTextColor: level ? level.text_color : '',
        textShow: level ? level.text_show : 1,
        expireAt: mu.expire_at || '',
        balance: mu.balance,
        score: mu.score,
        settings,
      };
    }
    return { card, levels, settings, applyStatus };
  }
  function apply(tenantId, userId, { name, phone, levelId }) {
    const level = getLevel(tenantId, Number(levelId));
    if (!level) return { ok: false, error: '会员等级不存在' };
    if (level.upgrade_mode !== 'apply') return { ok: false, error: '该等级不支持申请模式' };
    const pending = db.prepare("SELECT id FROM member_apply WHERE tenant_id = ? AND user_id = ? AND status IN ('pending','approved')").get(tenantId, userId);
    if (pending) return { ok: false, error: '已有待审核或已通过的申请' };
    const mu = getMemberUser(tenantId, userId);
    if (mu && mu.level_id === Number(levelId)) return { ok: false, error: '已是该等级会员' };
    const info = db.prepare(
      "INSERT INTO member_apply (tenant_id, user_id, name, phone, apply_level_id) VALUES (?,?,?,?,?)"
    ).run(tenantId, userId, String(name || '').slice(0, 32), String(phone || '').slice(0, 20), Number(levelId));
    return { ok: true, id: info.lastInsertRowid };
  }
  function sign(tenantId, userId) {
    const settings = getSettings(tenantId);
    const perm = settings.permissions?.score_sign || 'all'; // all/仅会员
    if (perm === 'member') {
      const mu = getMemberUser(tenantId, userId);
      if (!mu || !mu.level_id) return { ok: false, error: '仅会员可签到' };
    }
    const today = todayStr();
    const done = db.prepare("SELECT id FROM member_score_logs WHERE tenant_id = ? AND user_id = ? AND note = ? AND substr(created_at,1,10) = ?").get(tenantId, userId, '签到增加积分', today);
    if (done) return { ok: false, error: '今日已签到' };
    db.prepare(
      `INSERT INTO member_score_logs (tenant_id, user_id, type, score, note) VALUES (?,?, 'get', 2, '签到增加积分')`
    ).run(tenantId, userId);
    db.prepare(
      `INSERT INTO member_user (tenant_id, user_id, score, updated_at) VALUES (?,?,2, datetime('now'))
       ON CONFLICT(tenant_id, user_id) DO UPDATE SET score = member_user.score + 2, updated_at = datetime('now')`
    ).run(tenantId, userId);
    return { ok: true, score: 2 };
  }

  // ---------------- 会员列表（用户管理） ----------------
  function listUsers(tenantId, f = {}) {
    const where = ['pu.customer_id = ?'];
    const params = [tenantId];
    if (f.source && f.source !== 'all') {
      where.push('pu.identity_type = ?');
      params.push(f.source);
    }
    if (f.identity && f.identity !== 'all') {
      if (f.identity === 'nonmember') where.push('(mu.id IS NULL OR mu.level_id IS NULL OR mu.level_id = 0)');
      else if (f.identity === 'member') where.push('(mu.level_id IS NOT NULL AND mu.level_id > 0)');
      else { where.push('mu.level_id = ?'); params.push(Number(f.identity)); }
    }
    if (f.label) {
      where.push('EXISTS (SELECT 1 FROM member_user_labels ul WHERE ul.tenant_id = ? AND ul.user_id = pu.id AND ul.label_id = ?)');
      params.push(tenantId, Number(f.label));
    }
    if (f.start) { where.push('pu.created_at >= ?'); params.push(String(f.start) + ' 00:00:00'); }
    if (f.end) { where.push('pu.created_at <= ?'); params.push(String(f.end) + ' 23:59:59'); }
    if (f.keyword) {
      where.push('(pu.nickname LIKE ? OR pu.phone LIKE ? OR mu.card_no LIKE ?)');
      const kw = `%${f.keyword}%`;
      params.push(kw, kw, kw);
    }
    const whereSql = 'WHERE ' + where.join(' AND ');
    const page = Math.max(1, Number(f.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(f.pageSize) || 20));
    const rows = db.prepare(
      `SELECT pu.id, pu.nickname, pu.phone, pu.avatar, pu.identity_type, pu.created_at, pu.status,
              mu.card_no, mu.level_id, mu.expire_at, mu.balance, mu.score,
              ml.name AS level_name, ml.level_no AS member_level_no
       FROM platform_user pu
       LEFT JOIN member_user mu ON mu.tenant_id = pu.customer_id AND mu.user_id = pu.id
       LEFT JOIN member_levels ml ON ml.id = mu.level_id
       ${whereSql}
       ORDER BY pu.id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, (page - 1) * pageSize);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM platform_user pu LEFT JOIN member_user mu ON mu.tenant_id = pu.customer_id AND mu.user_id = pu.id ${whereSql}`).get(...params).n;
    const users = rows.map((r) => ({
      id: r.id, nickname: r.nickname, phone: r.phone || '', avatar: r.avatar,
      identityType: r.identity_type || 'individual', createdAt: r.created_at, status: r.status,
      cardNo: r.card_no || '', levelId: r.level_id || 0, levelName: r.level_name || '',
      memberLevelNo: r.member_level_no || 0, expireAt: r.expire_at || '',
      balance: r.balance || 0, score: r.score || 0,
      labels: userLabels(tenantId, r.id),
    }));
    return { users, total, page, pageSize };
  }
  function buildUsersCsv(users) {
    const headers = ['ID', '昵称', '手机号', '身份', '用户来源', '注册时间', '到期时间', '卡号', '等级', '积分', '余额', '状态'];
    return buildCsv(headers, users.map((u) => [
      u.id, u.nickname, u.phone, u.identityType === 'employee' ? '企业员工' : '个人用户',
      u.identityType === 'employee' ? '企业员工' : '普通获客',
      u.createdAt, u.expireAt || '永久有效', u.cardNo, u.levelName || (u.levelId ? '会员' : '非会员'),
      u.score, (u.balance / 100).toFixed(2), u.status,
    ]));
  }

  // ---------------- 统计（数据统计） ----------------
  function summary(tenantId) {
    const totalUsers = db.prepare('SELECT COUNT(*) AS n FROM platform_user WHERE customer_id = ?').get(tenantId).n;
    const levelUsers = db.prepare('SELECT COUNT(*) AS n FROM member_user WHERE tenant_id = ? AND level_id > 0').get(tenantId).n;
    const activeUsers = db.prepare(
      `SELECT COUNT(DISTINCT user_id) AS n FROM (
         SELECT user_id FROM member_logs WHERE tenant_id = ? AND created_at >= datetime('now','-30 day')
         UNION SELECT user_id FROM member_score_logs WHERE tenant_id = ? AND created_at >= datetime('now','-30 day')
       )`
    ).get(tenantId, tenantId).n;
    const expiring = db.prepare(
      "SELECT COUNT(*) AS n FROM member_user WHERE tenant_id = ? AND level_id > 0 AND expire_at IS NOT NULL AND expire_at != '' AND expire_at <= datetime('now','+30 day')"
    ).get(tenantId).n;
    const new7 = db.prepare("SELECT COUNT(*) AS n FROM platform_user WHERE customer_id = ? AND created_at >= datetime('now','-7 day')").get(tenantId).n;
    const new15 = db.prepare("SELECT COUNT(*) AS n FROM platform_user WHERE customer_id = ? AND created_at >= datetime('now','-15 day')").get(tenantId).n;
    const new30 = db.prepare("SELECT COUNT(*) AS n FROM platform_user WHERE customer_id = ? AND created_at >= datetime('now','-30 day')").get(tenantId).n;
    const levelCounts = db.prepare(
      `SELECT ml.id, ml.name, ml.level_no, COUNT(mu.id) AS cnt,
              SUM(CASE WHEN mu.expire_at IS NOT NULL AND mu.expire_at != '' AND mu.expire_at <= datetime('now','+30 day') THEN 1 ELSE 0 END) AS expiring
       FROM member_levels ml LEFT JOIN member_user mu ON mu.level_id = ml.id AND mu.tenant_id = ml.tenant_id
       WHERE ml.tenant_id = ? GROUP BY ml.id ORDER BY ml.level_no ASC`
    ).all(tenantId).map((r) => ({ id: r.id, name: r.name, levelNo: r.level_no, count: r.cnt, expiring: r.expiring || 0 }));
    const labelCounts = db.prepare(
      `SELECT ml.name, COUNT(ul.id) AS cnt FROM member_labels ml LEFT JOIN member_user_labels ul ON ul.label_id = ml.id AND ul.tenant_id = ml.tenant_id
       WHERE ml.tenant_id = ? GROUP BY ml.id`
    ).all(tenantId).map((r) => ({ name: r.name, count: r.cnt }));
    return {
      totalUsers, levelUsers, activeUsers, monthBirthday: 0, expiring,
      newUsers: { d7: new7, d15: new15, d30: new30 },
      levelCounts, labelCounts,
    };
  }

  // ---------------- 申请记录 ----------------
  function listApplies(tenantId, f = {}) {
    const where = ['a.tenant_id = ?'];
    const params = [tenantId];
    if (f.status) { where.push('a.status = ?'); params.push(f.status); }
    const page = Math.max(1, Number(f.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(f.pageSize) || 20));
    const rows = db.prepare(
      `SELECT a.*, pu.nickname, pu.avatar, ml.name AS level_name FROM member_apply a
       LEFT JOIN platform_user pu ON pu.id = a.user_id
       LEFT JOIN member_levels ml ON ml.id = a.apply_level_id
       ${'WHERE ' + where.join(' AND ')}
       ORDER BY a.id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, (page - 1) * pageSize);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM member_apply a ${'WHERE ' + where.join(' AND ')}`).get(...params).n;
    return { applies: rows, total };
  }
  function reviewApply(tenantId, id, action, reason = '') {
    const ap = db.prepare('SELECT * FROM member_apply WHERE id = ? AND tenant_id = ?').get(id, tenantId);
    if (!ap) return { ok: false, error: '申请不存在' };
    if (ap.status !== 'pending') return { ok: false, error: '该申请已处理' };
    if (action === 'approve') {
      const r = openCard(tenantId, ap.user_id, ap.apply_level_id, 'apply');
      if (!r.ok) return r;
      db.prepare("UPDATE member_apply SET status='approved', review_at=datetime('now') WHERE id = ?").run(id);
      return { ok: true };
    }
    if (action === 'reject') {
      if (!reason) return { ok: false, error: '请填写驳回原因' };
      db.prepare("UPDATE member_apply SET status='rejected', review_at=datetime('now'), reason=? WHERE id = ?").run(String(reason).slice(0, 200), id);
      return { ok: true };
    }
    return { ok: false, error: '未知操作' };
  }

  // ---------------- 开卡记录 ----------------
  function listCards(tenantId, f = {}) {
    const where = ['c.tenant_id = ?'];
    const params = [tenantId];
    if (f.keyword) {
      where.push('(pu.nickname LIKE ? OR c.card_no LIKE ?)');
      const kw = `%${f.keyword}%`;
      params.push(kw, kw);
    }
    const page = Math.max(1, Number(f.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(f.pageSize) || 20));
    const rows = db.prepare(
      `SELECT c.*, pu.nickname, pu.avatar, ml.name AS level_name FROM member_cards c
       LEFT JOIN platform_user pu ON pu.id = c.user_id
       LEFT JOIN member_levels ml ON ml.id = c.level_id
       ${'WHERE ' + where.join(' AND ')}
       ORDER BY c.id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, (page - 1) * pageSize);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM member_cards c LEFT JOIN platform_user pu ON pu.id = c.user_id ${'WHERE ' + where.join(' AND ')}`).get(...params).n;
    return { cards: rows, total };
  }

  // ---------------- 消费 / 积分流水 ----------------
  function listLogs(tenantId, f = {}) {
    const where = ['l.tenant_id = ?'];
    const params = [tenantId];
    if (f.type && f.type !== 'all') { where.push('l.type = ?'); params.push(f.type); }
    if (f.start) { where.push('l.created_at >= ?'); params.push(String(f.start) + ' 00:00:00'); }
    if (f.end) { where.push('l.created_at <= ?'); params.push(String(f.end) + ' 23:59:59'); }
    if (f.keyword) {
      where.push('(pu.nickname LIKE ? OR l.order_no LIKE ? OR l.note LIKE ?)');
      const kw = `%${f.keyword}%`;
      params.push(kw, kw, kw);
    }
    const page = Math.max(1, Number(f.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(f.pageSize) || 20));
    const rows = db.prepare(
      `SELECT l.*, pu.nickname FROM member_logs l LEFT JOIN platform_user pu ON pu.id = l.user_id
       ${'WHERE ' + where.join(' AND ')} ORDER BY l.id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, (page - 1) * pageSize);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM member_logs l LEFT JOIN platform_user pu ON pu.id = l.user_id ${'WHERE ' + where.join(' AND ')}`).get(...params).n;
    return { logs: rows, total };
  }
  function buildLogsCsv(rows) {
    const headers = ['用户信息', '金额', '类型', '说明', '订单号', '时间'];
    return buildCsv(headers, rows.map((r) => [
      r.nickname || '', (Number(r.amount) / 100).toFixed(2),
      r.type === 'consume' ? '消费' : r.type === 'recharge' ? '充值' : '获取',
      r.note, r.order_no || '', r.created_at,
    ]));
  }
  function listScoreLogs(tenantId, f = {}) {
    const where = ['l.tenant_id = ?'];
    const params = [tenantId];
    if (f.type && f.type !== 'all') { where.push('l.type = ?'); params.push(f.type); }
    if (f.start) { where.push('l.created_at >= ?'); params.push(String(f.start) + ' 00:00:00'); }
    if (f.end) { where.push('l.created_at <= ?'); params.push(String(f.end) + ' 23:59:59'); }
    if (f.keyword) {
      where.push('(pu.nickname LIKE ? OR l.note LIKE ?)');
      const kw = `%${f.keyword}%`;
      params.push(kw, kw);
    }
    const page = Math.max(1, Number(f.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(f.pageSize) || 20));
    const rows = db.prepare(
      `SELECT l.*, pu.nickname FROM member_score_logs l LEFT JOIN platform_user pu ON pu.id = l.user_id
       ${'WHERE ' + where.join(' AND ')} ORDER BY l.id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, (page - 1) * pageSize);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM member_score_logs l LEFT JOIN platform_user pu ON pu.id = l.user_id ${'WHERE ' + where.join(' AND ')}`).get(...params).n;
    return { logs: rows, total };
  }
  function buildScoreLogsCsv(rows) {
    const headers = ['用户信息', '积分', '类型', '说明', '订单号', '时间'];
    return buildCsv(headers, rows.map((r) => [
      r.nickname || '', r.score, r.type === 'get' ? '获得' : '使用',
      r.note, r.order_no || '', r.created_at,
    ]));
  }

  return {
    genCardNo, getLevel, listLevels, addLevel, updateLevel, deleteLevel,
    getSettings, saveSettings,
    listLabels, addLabel, deleteLabel, setUserLabels, userLabels,
    getMemberUser, openCard, openCardByOrder,
    myCard, apply, sign,
    listUsers, buildUsersCsv, summary,
    listApplies, reviewApply, listCards,
    listLogs, buildLogsCsv, listScoreLogs, buildScoreLogsCsv,
  };
}
