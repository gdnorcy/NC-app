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

/**
 * 应用级会员权益解析（"平台权益目录 + 租户套餐 × 应用"模型的单一事实来源）。
 *
 * 设计要点：
 * - 权益维度由平台统一定义在 `benefit_catalog`（type / app_scope / kind / default_value），
 *   租户只能配已有 type 的值，不能自建 type。
 * - 套餐 = `member_levels` 一行；每套餐在每个已开通应用上的权益存放于
 *   `member_level_app_benefits`（UNIQUE(tenant_id, level_id, app_code)）。
 * - 解析结果 = 目录默认 ⊕ 套餐在该应用的覆盖；非会员 / 过期 / 无等级 → 仅目录默认值。
 * - 会员身份是租户级统一（`member_user(tenant_id, user_id)`），权益按应用兑现，不拆 per-app。
 *
 * 🔴 与旧 benefits.js / quota.js（读 platform_user.member_level + member_package）隔离：
 *   本模块是新旧模型之间的桥。P1d/P1e 起，benefits.js / quota.js 改调本解析器。
 */

/** 权益值按 kind 还原为 JS 类型 */
export function castBenefit(value, kind) {
  if (kind === 'number') return Number(value ?? 0);
  if (kind === 'switch') return Number(value ?? 0) === 1;
  return value ?? ''; // text
}

/**
 * 平台硬上限（绝对天花板，租户套餐权益取 min）。单位与 catalog 一致。
 * 与租户套餐权益分层：租户配得再高也不超过这里。
 */
export const HARD_CAPS = {
  works_limit: 500,
  videos_limit: 50,
  collect_limit: 500,
  lead_quota: 1000,
  push_quota: 5000,
};

/**
 * 租户默认套餐档位（member_package 的「种子模板」）。
 * 落地为：每个租户的 member_levels（pkg_level 标记）+ member_level_app_benefits（按应用拆分）。
 * 同时作为过渡期兜底：platform_user.member_level 旧档 → 本模板（保证存量 VIP 权益不丢失，
 * 直到 migrateLegacyMemberVip 把其转为 member_user）。
 */
export const TIER_PKG = {
  free:    { name: '免费版', price: 0,   card: { works_limit: 3, videos_limit: 0,  collect_limit: 0, custom_works_label: 0, voice_enabled: 0, no_ads: 0, all_template: 0 },
                       member: { badge: 0, advanced_stats: 0, priority_support: 0, enterprise: 0, ai_report: 0, ai_words: 0, point_rate: 1, rebate: 0 },
                       mall: { discount: 0, price_visible: 0 }, market: { market_subject: 0 }, radar: { lead_quota: 0, push_quota: 0 } },
  silver:  { name: '白银会员', price: 29.9, card: { works_limit: 15, videos_limit: 2, collect_limit: 0, custom_works_label: 1, voice_enabled: 1, no_ads: 1, all_template: 1 },
                       member: { badge: 0, advanced_stats: 0, priority_support: 0, enterprise: 0, ai_report: 1, ai_words: 0, point_rate: 1, rebate: 0 },
                       mall: { discount: 0, price_visible: 0 }, market: { market_subject: 1 }, radar: { lead_quota: 0, push_quota: 0 } },
  gold:    { name: '黄金会员', price: 99,  card: { works_limit: 40, videos_limit: 6, collect_limit: 0, custom_works_label: 1, voice_enabled: 1, no_ads: 1, all_template: 1 },
                       member: { badge: 1, advanced_stats: 0, priority_support: 0, enterprise: 0, ai_report: 1, ai_words: 1, point_rate: 1, rebate: 0 },
                       mall: { discount: 0, price_visible: 0 }, market: { market_subject: 1 }, radar: { lead_quota: 50, push_quota: 0 } },
  diamond: { name: '钻石会员', price: 299, card: { works_limit: 120, videos_limit: 20, collect_limit: 0, custom_works_label: 1, voice_enabled: 1, no_ads: 1, all_template: 1 },
                       member: { badge: 1, advanced_stats: 1, priority_support: 1, enterprise: 1, ai_report: 1, ai_words: 1, point_rate: 1, rebate: 0 },
                       mall: { discount: 0, price_visible: 0 }, market: { market_subject: 1 }, radar: { lead_quota: 50, push_quota: 100 } },
};

/** 从 userId 反查其所属租户（platform_user.customer_id）。无则 null。 */
export function tenantOfUser(db, userId) {
  if (!userId) return null;
  const r = db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(userId);
  return r && r.customer_id ? r.customer_id : null;
}

/** 某应用的全量默认权益（来自 benefit_catalog 目录默认值） */
export function defaultBenefits(db, appCode) {
  const rows = db.prepare(
    `SELECT type, default_value, kind FROM benefit_catalog
     WHERE app_scope = '*' OR app_scope LIKE ?
     ORDER BY sort_order ASC`
  ).all(`%${appCode}%`);
  const out = {};
  for (const r of rows) out[r.type] = castBenefit(r.default_value, r.kind);
  return out;
}

/** 把覆盖权益按 catalog kind 还原，并施加平台硬上限 */
function applyBenefits(base, pkg, kinds) {
  const out = { ...base };
  for (const [k, v] of Object.entries(pkg || {})) out[k] = castBenefit(v, kinds[k] || 'number');
  for (const k of Object.keys(HARD_CAPS)) if (typeof out[k] === 'number') out[k] = Math.min(out[k], HARD_CAPS[k]);
  return out;
}

/**
 * 有效会员身份解析（全库唯一会员判据，取代各处散读的 platform_user.member_level）。
 *
 * 事实来源顺序：
 *   ① member_user(tenant_id, user_id) 有效（status='active' 且未过期）→ 新模型事实来源
 *   ② 无 member_user 行 → 过渡期兜底 platform_user.member_level 旧镜像（存量 VIP 未迁完时）
 *   ③ 有 member_user 行但已过期/停用 → 视为非会员（不再回落旧镜像，避免过期卡仍享权）
 *
 * @returns {null | {level:string, name:string, expireAt:string, source:'member_user'|'legacy_mirror'}}
 */
export function effectiveMembership(db, userId) {
  if (!userId) return null;
  const tid = tenantOfUser(db, userId);
  if (tid) {
    const mu = db.prepare(
      `SELECT mu.level_id, mu.status, mu.expire_at, ml.name, ml.pkg_level
       FROM member_user mu LEFT JOIN member_levels ml ON ml.id = mu.level_id
       WHERE mu.tenant_id = ? AND mu.user_id = ?`
    ).get(tid, userId);
    if (mu && mu.level_id) {
      const exp = mu.expire_at ? new Date(String(mu.expire_at).replace(' ', 'T')) : null;
      const expired = exp && !Number.isNaN(exp.getTime()) && exp.getTime() < Date.now();
      if (mu.status === 'active' && !expired) {
        return { level: mu.pkg_level || 'custom', name: mu.name || '', expireAt: mu.expire_at || '', source: 'member_user' };
      }
      return null; // 已有会员身份行 → 以它为准（过期即失效）
    }
  }
  // 过渡期兜底：旧 platform_user.member_level 镜像（存量 VIP 尚未迁到 member_user）
  const u = db.prepare('SELECT member_level, member_expire_at FROM platform_user WHERE id = ?').get(userId);
  if (u && u.member_level && u.member_level !== 'free') {
    const exp = u.member_expire_at ? new Date(String(u.member_expire_at).replace(' ', 'T')) : null;
    const expired = exp && !Number.isNaN(exp.getTime()) && exp.getTime() < Date.now();
    if (!expired) {
      const pkg = TIER_PKG[u.member_level];
      return { level: u.member_level, name: pkg ? pkg.name : '', expireAt: u.member_expire_at || '', source: 'legacy_mirror' };
    }
  }
  return null;
}

/**
 * 解析用户在指定应用下的实际权益（"平台目录 + 租户套餐 × 应用"模型单一事实来源）。
 * 优先级：member_user(有效) → 该应用权益矩阵；矩阵未配置该应用（存量自建等级）→ 回落旧档位模板；
 *          无 member_user → 过渡期兜底 platform_user.member_level 旧档 → TIER_PKG；否则仅目录默认。
 * @returns {object} 合并后的权益键值对（已施加平台硬上限）
 */
export function resolveAppBenefits(db, tenantId, userId, appCode) {
  const base = defaultBenefits(db, appCode);
  const kinds = Object.fromEntries(db.prepare('SELECT type, kind FROM benefit_catalog').all().map((r) => [r.type, r.kind]));
  if (!userId) return applyBenefits(base, {}, kinds);

  // 旧档位模板（存量自建等级未迁到矩阵时兜底；也让旧镜像在过渡期仍能兑现权益）
  // ⚠️ 必须带有效期判定：旧 levelOf 口径是「过期 → free」，不能只看档位名。
  const u = db.prepare('SELECT member_level, member_expire_at FROM platform_user WHERE id = ?').get(userId);
  let legacy = null;
  if (u && u.member_level && u.member_level !== 'free' && TIER_PKG[u.member_level] && TIER_PKG[u.member_level][appCode]) {
    const exp = u.member_expire_at ? new Date(String(u.member_expire_at).replace(' ', 'T')) : null;
    const expired = exp && !Number.isNaN(exp.getTime()) && exp.getTime() < Date.now();
    if (!expired) legacy = TIER_PKG[u.member_level][appCode];
  }

  if (tenantId) {
    const mu = db.prepare('SELECT level_id, status, expire_at FROM member_user WHERE tenant_id = ? AND user_id = ?').get(tenantId, userId);
    if (mu && mu.level_id) {
      const exp = mu.expire_at ? new Date(String(mu.expire_at).replace(' ', 'T')) : null;
      if (mu.status === 'active' && (!exp || Number.isNaN(exp.getTime()) || exp.getTime() >= Date.now())) {
        const row = db.prepare('SELECT benefits FROM member_level_app_benefits WHERE tenant_id = ? AND level_id = ? AND app_code = ?').get(tenantId, mu.level_id, appCode);
        // 矩阵已配置 → 以租户配置为准
        if (row) return applyBenefits(base, parseJson(row.benefits, {}), kinds);
        // 矩阵未配置该应用（存量自建等级尚未迁到「套餐 × 应用」）→ 回落旧档位模板，避免存量用户降权
        if (legacy) return applyBenefits(base, legacy, kinds);
      }
      // 有会员身份行但已过期/停用 → 不回落旧镜像（过期卡不再享权）
      return applyBenefits(base, {}, kinds);
    }
  }
  // 无 member_user（含未绑定租户的存量 VIP）→ 过渡期兜底：旧 platform_user.member_level 档位 → TIER_PKG 模板
  if (legacy) return applyBenefits(base, legacy, kinds);
  return applyBenefits(base, {}, kinds);
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
      `INSERT INTO member_levels (tenant_id, level_no, name, status, icon, bg_color, text_show, text_color, upgrade_mode, consume_amount, buy_price, buy_product, form_id, benefits, description, sort_order, review_mode, valid_days)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      tenantId, levelNo, d.name || '', d.status === 0 ? 0 : 1, d.icon || '', d.bgColor || '',
      d.textShow === 0 ? 0 : 1, d.textColor || '#ffffff', d.upgradeMode || 'consume',
      Math.round(Number(d.consumeAmount) || 0), Math.round(Number(d.buyPrice) || 0),
      d.buyProduct || '', Number(d.formId) || 0, JSON.stringify(d.benefits || {}),
      d.description || '', Number(d.sortOrder) || levelNo,
      d.reviewMode === 'auto' ? 'auto' : 'manual', Number(d.validDays) || 0
    );
    return getLevel(tenantId, info.lastInsertRowid);
  }
  function updateLevel(tenantId, id, d) {
    const cur = getLevel(tenantId, id);
    if (!cur) return null;
    db.prepare(
      `UPDATE member_levels SET level_no=?, name=?, status=?, icon=?, bg_color=?, text_show=?, text_color=?, upgrade_mode=?, consume_amount=?, buy_price=?, buy_product=?, form_id=?, benefits=?, description=?, sort_order=?, review_mode=?, valid_days=? WHERE id=? AND tenant_id=?`
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
      d.sortOrder ?? cur.sort_order,
      d.reviewMode === undefined ? cur.review_mode : (d.reviewMode === 'auto' ? 'auto' : 'manual'),
      d.validDays === undefined ? cur.valid_days : Number(d.validDays) || 0,
      id, tenantId
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
  function renameLabel(tenantId, id, name) {
    const n = String(name || '').trim();
    if (!n) return { ok: false, error: '标签名称不能为空' };
    const exists = db.prepare('SELECT id FROM member_labels WHERE tenant_id = ? AND name = ? AND id != ?').get(tenantId, n, Number(id));
    if (exists) return { ok: false, error: '标签已存在' };
    db.prepare("UPDATE member_labels SET name = ? WHERE id = ? AND tenant_id = ?").run(n, Number(id), tenantId);
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
    // 有效期：valid_days>0 时按开卡日 +N 天写入 expire_at；0 视为永久（NULL）。
    // 与 SQLite datetime('now') 保持一致用 UTC（Date.now()/toISOString 均为 UTC）。
    const vd = Number(level.valid_days) || 0;
    const expireAt = vd > 0 ? new Date(Date.now() + vd * 86400000).toISOString().slice(0, 19).replace('T', ' ') : null;
    db.prepare(
      `INSERT INTO member_user (tenant_id, user_id, card_no, level_id, status, expire_at, updated_at)
       VALUES (?,?,?,?, 'active', ?, datetime('now'))
       ON CONFLICT(tenant_id, user_id) DO UPDATE SET level_id=excluded.level_id, card_no=CASE WHEN member_user.card_no='' THEN excluded.card_no ELSE member_user.card_no END, status='active', expire_at=excluded.expire_at, updated_at=datetime('now')`
    ).run(tenantId, userId, cardNo, levelId, expireAt);
    db.prepare(
      "INSERT INTO member_cards (tenant_id, user_id, card_no, level_id, source, opened_at) VALUES (?,?,?,?,?, datetime('now'))"
    ).run(tenantId, userId, cardNo, levelId, source);
    // 同步旧镜像 platform_user.member_level / member_expire_at：
    // 新模型事实来源是 member_user，但仍有旧代码读这两个列（后台套餐降级、存量工具等），
    // 不镜像会让「已开通会员」在旧读法里显示为 free。自建等级（pkg_level 为空）不镜像。
    if (level.pkg_level) {
      db.prepare(
        "UPDATE platform_user SET member_level = ?, member_expire_at = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(level.pkg_level, expireAt, userId);
    }
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
    const mu = getMemberUser(tenantId, userId);
    if (mu && mu.level_id === Number(levelId)) return { ok: false, error: '已是该等级会员' };
    // 自动审核：直接开户，不落 pending 申请
    if (level.review_mode === 'auto') {
      const r = openCard(tenantId, userId, Number(levelId), 'apply');
      if (!r.ok) return r;
      return { ok: true, autoApproved: true, cardNo: r.cardNo };
    }
    // 人工审核：已有待审核或已通过的申请则拦截
    const pending = db.prepare("SELECT id FROM member_apply WHERE tenant_id = ? AND user_id = ? AND status IN ('pending','approved')").get(tenantId, userId);
    if (pending) return { ok: false, error: '已有待审核或已通过的申请' };
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
    listLabels, addLabel, deleteLabel, renameLabel, setUserLabels, userLabels,
    getMemberUser, openCard, openCardByOrder,
    myCard, apply, sign,
    listUsers, buildUsersCsv, summary,
    listApplies, reviewApply, listCards,
    listLogs, buildLogsCsv, listScoreLogs, buildScoreLogsCsv,
  };
}
