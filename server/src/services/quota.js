/**
 * 会员套餐与权益配额服务（智能名片 · 评估修订后）
 * - planOf：platform_user.member_level + member_package 取套餐（member_level 在行内，不依赖 tenant 条件）
 * - hasFeature：features 数组包含校验
 * - quotaLeft：留资配额（card_lead 计数）与收藏配额（card_collect 计数），0 = 不限
 * - canCollect：收藏上限拦截（collect_limit = 0 不限；超限返回剩余 0）
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

  /** 配额余量：kind = lead（留资）/ collect（收藏）；limit 0 = 不限（收藏），或无配额（留资） */
  svc.quotaLeft = (userId, kind) => {
    const pkg = svc.planOf(userId);
    let limit = 0;
    if (kind === 'lead') {
      // 留资配额：features 含 quota_lead 才可用，示例基数 50（方案占位，待运营确认）
      limit = svc.hasFeature(userId, 'quota_lead') ? 50 : 0;
    } else {
      limit = pkg ? Number(pkg.collect_limit ?? 0) : 0; // collect_limit：0 = 不限
    }
    let used = 0;
    if (kind === 'lead') {
      used = db.prepare('SELECT COUNT(*) AS c FROM card_lead WHERE owner_user_id = ?').get(userId).c || 0;
    } else {
      used = db.prepare('SELECT COUNT(*) AS c FROM card_collect WHERE user_id = ?').get(userId).c || 0;
    }
    return { limit, used, left: limit === 0 ? Infinity : Math.max(0, limit - used), unlimited: limit === 0 };
  };

  /** 收藏校验：超限返回 false（调用方提示升级），不写库 */
  svc.canCollect = (userId) => {
    const q = svc.quotaLeft(userId, 'collect');
    return q.unlimited || q.left > 0;
  };

  return svc;
}
