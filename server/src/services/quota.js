/**
 * 会员套餐与权益配额服务（智能名片 · 阶段B对齐：套餐有效期累计 + 成功才扣 + 超限引导升级）
 * - planOf：platform_user.member_level + member_package 取套餐（含会员有效期校验，过期视为无套餐）
 * - hasFeature：features 数组包含校验（会员卡能力点展示用）
 * - quotaLeft：留资配额（card_lead 计数）/ 推送配额（已发送订阅/公众号消息计数）/ 收藏配额（card_collect 计数）
 *   配额数值来自套餐列 lead_quota / push_quota / collect_limit（0 = 不限），不硬编码；
 *   free（无有效套餐）不设限，维持基础能力；会员超限由调用方返回提示并引导升级。
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
      // 推送配额：套餐列 push_quota（0=不限）；统计已成功发送的订阅消息/公众号模板（阶段D联调后消费）
      limit = pkg ? Number(pkg.push_quota ?? 0) : 0;
      used = db.prepare("SELECT COUNT(*) AS c FROM card_radar_notify WHERE owner_user_id = ? AND channel IN (1,2) AND status = 'sent'").get(userId).c || 0;
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

  return svc;
}
