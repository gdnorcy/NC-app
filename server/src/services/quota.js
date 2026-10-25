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

  return svc;
}
