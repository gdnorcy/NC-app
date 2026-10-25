/**
 * 会员套餐与权益配额服务（智能名片 · 阶段B对齐：套餐有效期累计 + 成功才扣 + 超限引导升级）
 * - planOf：platform_user.member_level + member_package 取套餐（含会员有效期校验，过期视为无套餐）
 * - hasFeature：features 数组包含校验（会员卡能力点展示用）
 * - quotaLeft：留资配额（card_lead 计数）/ 推送配额（已占用真实推送通道的提醒条数）/ 收藏配额（card_collect 计数）
 *   配额数值来自套餐列 lead_quota / push_quota / collect_limit（0 = 不限），不硬编码；
 *   free（无有效套餐）不设限，维持基础能力；会员超限由调用方返回提示并引导升级。
 *
 * 🔴 第21轮：member_package 有 6 个权益列，此前只有 collect_limit / lead_quota 真被消费，
 *    voice_enabled / discount / push_quota 是「配了字段没人读」的空头权益——后台能配、
 *    C 端套餐卡能吹，服务端完全不认。本轮把三者接进真实链路：
 *      canVoice   → POST /voice-upload、POST /voice-history 门禁
 *      discountOf → POST /templates/:id/purchase 下单实付
 *      canPush    → radar.sendNotify 推送前拦截（超限降级站内提醒）
 */

export function createQuotaService(db) {
  const svc = {};

  /** 用户当前有效套餐：非会员/过期返回 null */
  svc.planOf = (userId) => {
    if (!userId) return null;
    const user = db.prepare('SELECT member_level, member_expire_at FROM platform_user WHERE id = ?').get(userId);
    if (!user || !user.member_level || user.member_level === 'free') return null;
    const pkg = db.prepare('SELECT * FROM member_package WHERE level = ? AND enabled = 1').get(user.member_level);
    if (!pkg) return null;
    if (user.member_expire_at && user.member_expire_at !== '') {
      const exp = new Date(user.member_expire_at.replace(' ', 'T'));
      if (Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) return null;
    }
    return pkg;
  };

  /**
   * 用户等级对应的套餐行（不校验有效期）
   *
   * 🔴 与 planOf 的区别：planOf 对 free / 过期返回 null（用于"是否享受会员权益"），
   *    但有些权益列是**按等级配置**的（voice_enabled 免费档就是 0），
   *    判定必须拿到 free 行本身，不能因为"不是会员"就跳过。
   */
  svc.rowOf = (userId) => {
    if (!userId) return null;
    const user = db.prepare('SELECT member_level FROM platform_user WHERE id = ?').get(userId);
    const level = user?.member_level || 'free';
    return db.prepare('SELECT * FROM member_package WHERE level = ? AND enabled = 1').get(level) || null;
  };

  /** 语音简介权限：套餐列 voice_enabled（第21轮真门禁，原来谁都能传） */
  svc.canVoice = (userId) => {
    const row = svc.rowOf(userId);
    return !!row && Number(row.voice_enabled ?? 0) === 1;
  };

  /**
   * 模板购买折扣：套餐列 discount（0<d<=1）；无有效套餐 / 值越界 → 1（不打折）
   * 注意用 planOf（含有效期），会员过期后不再享受折扣。
   */
  svc.discountOf = (userId) => {
    const pkg = svc.planOf(userId);
    if (!pkg) return 1;
    const d = Number(pkg.discount);
    return d > 0 && d <= 1 ? d : 1;
  };

  /** features 是否包含某能力 */
  svc.hasFeature = (userId, feature) => {
    const pkg = svc.planOf(userId);
    if (!pkg) return false;
    try {
      return (JSON.parse(pkg.features || '[]') || []).includes(feature);
    } catch (e) {
      return false;
    }
  };

  /** 配额余量：kind = lead（留资）/ push（推送）/ collect（收藏）；limit 0 = 不限 */
  svc.quotaLeft = (userId, kind) => {
    const pkg = svc.planOf(userId);
    let limit = 0;
    let used = 0;
    if (kind === 'lead') {
      // 留资配额：套餐列 lead_quota（0=不限）；无有效套餐（free）不限，维持无感留资基础能力
      limit = pkg ? Number(pkg.lead_quota ?? 0) : 0;
      used = db.prepare('SELECT COUNT(*) AS c FROM card_lead WHERE owner_user_id = ?').get(userId).c || 0;
    } else if (kind === 'push') {
      // 推送配额：套餐列 push_quota（0=不限）。
      // 🔴 第21轮口径修正：原来只数 status='sent'，但阶段D通道未联调时行永远是 'pending'，
      //    used 恒为 0 → 配额永远用不完 = 完全没拦截。改为数「已占用真实推送通道(1/2)的条数」，
      //    下发成功与否都占额，否则失败重试能把额度刷穿。
      limit = pkg ? Number(pkg.push_quota ?? 0) : 0;
      used = db.prepare('SELECT COUNT(*) AS c FROM card_radar_notify WHERE owner_user_id = ? AND channel IN (1,2)').get(userId).c || 0;
    } else {
      // 收藏配额：套餐列 collect_limit（0=不限）；无有效套餐（free）不限
      limit = pkg ? Number(pkg.collect_limit ?? 0) : 0;
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
