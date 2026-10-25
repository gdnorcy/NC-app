/**
 * 会员分级权益服务（作品/视频号数量 + 自定义作品标签名）——单一事实来源
 *
 * 🔴 模型切换（租户会员套餐）：本服务不再读 platform_user.member_level + 硬编码阶梯，
 *   改为消费 `resolveAppBenefits(db, tenantId, userId, 'card')`（平台目录 + 租户套餐 × 应用）。
 *   - 作品/视频上限、自定义标签开关均来自 catalog 在 card 应用的权益维度；
 *   - 租户可在后台按套餐 × 应用配置，未来应用只需往 catalog 加一行即自动支持；
 *   - 解析器已施加平台硬上限（HARD_CAPS），本服务直接消费结果。
 *   - 过渡期兜底：旧 platform_user.member_level 档位由 resolver 落到 TIER_PKG 模板，权益不丢失。
 *
 * 调用点签名不变（仅传 userId），tenantId 由 resolver 内部从 userId 反查 customer_id。
 */

import { resolveAppBenefits, tenantOfUser, effectiveMembership } from './member.js';

/** 自定义标签名长度上限（tab 窄，超长必溢出） */
export const WORKS_LABEL_MAX = 6;

export function createBenefitsService(db) {
  const svc = {};

  /** 用户在 card 应用下的权益（目录默认 ⊕ 套餐覆盖，已施硬上限） */
  svc.benefitsOf = (userId) => resolveAppBenefits(db, tenantOfUser(db, userId), userId, 'card');

  /** 已用作品数：跨用户名下所有未删除名片累计（card_works ⋈ card_profile.user_id） */
  svc.worksUsed = (userId) => db.prepare(
    `SELECT COUNT(*) AS c FROM card_works w
     JOIN card_profile cp ON cp.id = w.card_id
     WHERE cp.user_id = ? AND (cp.status IS NULL OR cp.status != 'deleted')`
  ).get(userId).c || 0;

  /** 已用视频条目数：同上口径 */
  svc.videosUsed = (userId) => db.prepare(
    `SELECT COUNT(*) AS c FROM card_videos v
     JOIN card_profile cp ON cp.id = v.card_id
     WHERE cp.user_id = ? AND (cp.status IS NULL OR cp.status != 'deleted')`
  ).get(userId).c || 0;

  /** 能否新增作品：{ ok, used, limit }（limit 已达 → ok=false，调用方 403 + 引导升级） */
  svc.canAddWork = (userId) => {
    const b = svc.benefitsOf(userId);
    const used = svc.worksUsed(userId);
    return { ok: used < b.works_limit, used, limit: b.works_limit };
  };

  /** 能否新增视频条目：同上 */
  svc.canAddVideo = (userId) => {
    const b = svc.benefitsOf(userId);
    const used = svc.videosUsed(userId);
    return { ok: used < b.videos_limit, used, limit: b.videos_limit };
  };

  /** 是否允许自定义作品标签名 */
  svc.canCustomWorksLabel = (userId) => !!svc.benefitsOf(userId).custom_works_label;

  /** 前端展示用：当前用户权益快照（/member/status 消费） */
  svc.snapshot = (userId) => {
    const b = svc.benefitsOf(userId);
    // 等级口径与 quota.planOf 一致：非会员/过期 → free
    const mem = effectiveMembership(db, userId);
    return {
      level: mem ? mem.level : 'free',
      worksLimit: b.works_limit,
      worksUsed: svc.worksUsed(userId),
      videosLimit: b.videos_limit,
      videosUsed: svc.videosUsed(userId),
      customWorksLabel: !!b.custom_works_label,
    };
  };

  return svc;
}
