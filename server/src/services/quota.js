/**
 * 会员套餐与权益配额服务（智能名片 · 阶段B对齐：套餐有效期累计 + 成功才扣 + 超限引导升级）
 *
 * 🔴 模型切换（租户会员套餐）：本服务不再读 platform_user.member_level + member_package，
 *   改为消费 `resolveAppBenefits(db, tenantId, userId, <对应 app>)`（平台目录 + 租户套餐 × 应用）。
 *   - canVoice  → card.voice_enabled
 *   - discountOf → mall.discount（百分比，0=无折扣，10=打9折）
 *   - quotaLeft(lead/push) → radar.lead_quota / radar.push_quota
 *   - quotaLeft(collect)    → card.collect_limit
 *   - hasFeature(type)      → 按 catalog type 反查 app_scope，取该应用下该开关
 *   解析器已施加平台硬上限（HARD_CAPS）；free（无有效会员）取目录默认（配额类默认 0 = 不限）。
 *
 * 调用点签名不变（仅传 userId），tenantId 由 resolver 内部从 userId 反查 customer_id；
 * 过渡期兜底：旧 platform_user.member_level 档位由 resolver 落到 TIER_PKG 模板。
 */

import { resolveAppBenefits, tenantOfUser, effectiveMembership } from './member.js';

export function createQuotaService(db) {
  const svc = {};

  /**
   * 用户当前有效套餐（全库统一会员判据 effectiveMembership）：
   *   事实来源 member_user(租户级) → 过渡期兜底 platform_user.member_level 旧镜像。
   *   返回 { level, name } 或 null（free/过期/无）。
   */
  svc.planOf = (userId) => {
    const m = effectiveMembership(db, userId);
    if (!m) return null;
    return { level: m.level, name: m.name, expireAt: m.expireAt };
  };

  /** 语音简介权限：card.voice_enabled（0=关，1=开） */
  svc.canVoice = (userId) => !!resolveAppBenefits(db, tenantOfUser(db, userId), userId, 'card').voice_enabled;

  /**
   * 模板购买折扣：mall.discount（百分比，0=无折扣，10=打9折，即实付 90%）。
   * 无有效会员 / 未配置 → 0（不打折）。
   */
  svc.discountOf = (userId) => {
    const d = resolveAppBenefits(db, tenantOfUser(db, userId), userId, 'mall').discount;
    const n = Number(d) || 0;
    return n > 0 && n <= 100 ? n : 0;
  };

  /** features 类型是否开启（type 即 catalog 的 switch 型权益标识） */
  svc.hasFeature = (userId, feature) => {
    const scope = db.prepare('SELECT app_scope FROM benefit_catalog WHERE type = ?').get(feature);
    if (!scope) return false;
    return !!resolveAppBenefits(db, tenantOfUser(db, userId), userId, scope.app_scope)[feature];
  };

  /** 配额余量：kind = lead（留资）/ push（推送）/ collect（收藏）；limit 0 = 不限 */
  svc.quotaLeft = (userId, kind) => {
    const tid = tenantOfUser(db, userId);
    let limit = 0;
    let used = 0;
    if (kind === 'lead') {
      limit = resolveAppBenefits(db, tid, userId, 'radar').lead_quota;
      used = db.prepare('SELECT COUNT(*) AS c FROM card_lead WHERE owner_user_id = ?').get(userId).c || 0;
    } else if (kind === 'push') {
      limit = resolveAppBenefits(db, tid, userId, 'radar').push_quota;
      used = db.prepare('SELECT COUNT(*) AS c FROM card_radar_notify WHERE owner_user_id = ? AND channel IN (1,2)').get(userId).c || 0;
    } else {
      limit = resolveAppBenefits(db, tid, userId, 'card').collect_limit;
      used = db.prepare('SELECT COUNT(*) AS c FROM card_collect WHERE user_id = ?').get(userId).c || 0;
    }
    return { limit, used, left: limit === 0 ? Infinity : Math.max(0, limit - used), unlimited: limit === 0 };
  };

  /** 收藏校验：超限返回 false（调用方提示升级），不写库 */
  svc.canCollect = (userId) => {
    const q = svc.quotaLeft(userId, 'collect');
    return q.unlimited || q.left > 0;
  };

  /** 留资校验：超限返回 false（调用方提示升级），不写库 */
  svc.canLead = (userId) => {
    const q = svc.quotaLeft(userId, 'lead');
    return q.unlimited || q.left > 0;
  };

  /** 推送校验：超限返回 false（radar 侧降级为站内提醒，不硬失败） */
  svc.canPush = (userId) => {
    const q = svc.quotaLeft(userId, 'push');
    return q.unlimited || q.left > 0;
  };

  /** C 端「我的权益」快照：/member/status 消费，让套餐权益在智能名片里看得见 */
  svc.entitlements = (userId) => {
    const push = svc.quotaLeft(userId, 'push');
    const lead = svc.quotaLeft(userId, 'lead');
    const collect = svc.quotaLeft(userId, 'collect');
    return {
      voice: svc.canVoice(userId),
      discount: svc.discountOf(userId),
      push: { limit: push.limit, used: push.used, unlimited: push.unlimited },
      lead: { limit: lead.limit, used: lead.used, unlimited: lead.unlimited },
      collect: { limit: collect.limit, used: collect.used, unlimited: collect.unlimited },
    };
  };

  /**
   * C 端「我的权益」按应用分区全量快照（/member/status 消费）：
   *   平台目录 benefit_catalog 按 app_scope 分组（'*' 挂所有应用），值取 resolveAppBenefits
   *   （目录默认 ⊕ 租户矩阵，已施硬上限）；可计数权益附带已用量（与 quotaLeft/benefits 同口径）。
   *   应用名取自 solutions.name（自维护），租户无需在前端硬编码。
   *
   * 🔴 表达层改造（用户诉求：「权益列表不够高级美观、很占位置、难分清是哪个应用」）：
   *   - label      = 后台配置口径（如"商城折扣百分比（0=无折扣）"）→ **不再直给 C 端**
   *   - displayLabel = C 端展示短词（如"商城会员价"）→ C 端首选；空则回落 label
   *   - valueText  = 服务端算好的展示串（C 端零逻辑，避免各处口径漂移）
   *   - active     = 该权益当前是否真正生效（C 端据此置灰/打标）
   *   - appIcon / appColor = 应用色标（一眼分清归属应用）
   *   - stats      = 分组统计（已开通 / 共 N 项），用于卡片头概览
   * @returns {Array<{code,name,appIcon,appColor,stats:{active,total},items:Array}>}
   */
  svc.appBenefits = (userId) => {
    const tid = tenantOfUser(db, userId);
    const solNames = new Map(db.prepare('SELECT code, name FROM solutions').all().map((r) => [r.code, r.name]));
    // solutions 表未必给每个权益应用都建行（生产曾只有 panorama/card/demo）→ 兜底映射防 C 端露出裸 code
    const APP_NAME_FALLBACK = { card: '智能名片', member: '会员中心', mall: '商城', market: '集市', radar: '雷达拓客' };
    // 🔴 应用色标：C 端一眼分清权益属于哪个应用（图标名走 SIcon，色值走主题令牌的前端映射）
    // ⚠️ 图标名必须是 SIcon.vue svgMap 里真实存在的 key（mall 用 cart，shop 不存在）
    const APP_ICON_FALLBACK = { card: 'card', member: 'crown', mall: 'cart', market: 'market', radar: 'radar' };
    const rows = db.prepare('SELECT type, app_scope, kind, unit, label, display_label, sort_order FROM benefit_catalog ORDER BY sort_order ASC').all();
    const globals = rows.filter((r) => r.app_scope === '*');
    const byApp = new Map();
    for (const r of rows) {
      if (r.app_scope === '*') continue;
      for (const s of String(r.app_scope).split(',').map((x) => x.trim())) {
        if (!byApp.has(s)) byApp.set(s, []);
        byApp.get(s).push(r);
      }
    }
    const usedOf = (type) => {
      if (type === 'works_limit') return db.prepare(
        `SELECT COUNT(*) AS c FROM card_works w JOIN card_profile cp ON cp.id = w.card_id
         WHERE cp.user_id = ? AND (cp.status IS NULL OR cp.status != 'deleted')`).get(userId).c || 0;
      if (type === 'videos_limit') return db.prepare(
        `SELECT COUNT(*) AS c FROM card_videos v JOIN card_profile cp ON cp.id = v.card_id
         WHERE cp.user_id = ? AND (cp.status IS NULL OR cp.status != 'deleted')`).get(userId).c || 0;
      if (type === 'lead_quota') return svc.quotaLeft(userId, 'lead').used;
      if (type === 'push_quota') return svc.quotaLeft(userId, 'push').used;
      if (type === 'collect_limit') return svc.quotaLeft(userId, 'collect').used;
      return null;
    };
    // 🔴 商城折扣：百分比口径（10 = 打9折）→ C 端展示「9 折」，避免暴露"10%"这种配置口径
    const mallDiscountText = (v) => {
      const pct = Number(v) || 0;
      if (pct <= 0) return '无折扣';
      if (pct >= 100) return '无折扣';
      const zhe = (10 - pct / 10).toFixed(1).replace(/\.0$/, '');
      return `${zhe} 折`;
    };
    const apps = [];
    for (const [code, items] of byApp) {
      const resolved = resolveAppBenefits(db, tid, userId, code);
      const list = [...items, ...globals]
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((r) => {
          const used = usedOf(r.type);
          const value = resolved[r.type];
          const isSwitch = r.kind === 'switch';
          const isDiscount = r.type === 'discount';
          // valueText：服务端算好，C 端零逻辑
          let valueText;
          if (isSwitch) valueText = value ? '已开通' : '未开通';
          else if (isDiscount) valueText = mallDiscountText(value);
          else if (used != null) valueText = Number(value) > 0 ? `${used} / ${value}${r.unit ? ' ' + r.unit : ''}` : '不限';
          else valueText = `${value}${r.unit ? ' ' + r.unit : ''}`;
          // active：是否真正生效（C 端据此置灰）
          const active = isSwitch ? !!value
            : isDiscount ? Number(value) > 0
            : used != null ? !(Number(value) <= 0)     // 配额类：0 = 不限 → 视为生效
            : Number(value) > 0;
          return {
            type: r.type,
            label: r.label,                          // 后台口径（保留，管理端/调试用）
            displayLabel: r.display_label || r.label, // C 端展示名（首选）
            unit: r.unit || '',
            kind: r.kind,
            value,
            used,
            valueText,
            active,
          };
        });
      apps.push({
        code,
        name: solNames.get(code) || APP_NAME_FALLBACK[code] || code,
        appIcon: APP_ICON_FALLBACK[code] || 'star',
        stats: { active: list.filter((x) => x.active).length, total: list.length },
        items: list,
      });
    }
    return apps;
  };

  return svc;
}
