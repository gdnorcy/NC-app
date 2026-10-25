/**
 * 集市场席与三层身份（第20轮）
 *
 * 产品模型（已拍板）：
 *   三层身份——普通用户（0 门槛建名片+分享）/ 集市场席 / 组织成员（ENT 码+企业审批）
 *   租户双模开关（card_market_settings.individual_join_mode）：
 *     'code'（默认）= 口令+审核入驻，存量行为不变；
 *     'purchase'    = 购买会员套餐即获得场席（pkg.market_subject=1），无需口令。
 *   收入归属：进租户（payer_type='tenant'），除非平台级支付代收（'platform'）。
 *
 * 本模块是三个消费方的共享事实来源：
 *   - routes/cardMarket.js：开关读写、上架资格、过期懒铲除
 *   - routes/card.js：/member/status 回传场席状态（C 端购买引导）
 *   - services/payment.js：activateCardMember 购买赠主体
 */
import { checkTenantQuota, checkTenantSolutionQuota } from './billing.js';
import { effectiveMembership } from './member.js';
import { addOperationLog } from '../db.js';

/** 读租户个人入驻模式（无设置行=默认 code，保守不改变存量行为）
 *  三值（第26轮起）：'code'=兑换码+审核 / 'apply'=自助申请认证（免码，仍走审核） / 'purchase'=购买套餐自助获得场席 */
export function readIndividualJoinMode(db, customerId) {
  const row = db.prepare('SELECT individual_join_mode FROM card_market_settings WHERE customer_id = ?').get(customerId);
  const m = row?.individual_join_mode;
  return m === 'purchase' || m === 'apply' ? m : 'code';
}

/**
 * 会员是否有效（全库统一判据：effectiveMembership —— member_user 事实来源 + 旧镜像兜底）。
 * 与 card.js /member/status 的 isMember 同口径（本地时区解析，避免两处偏差）。
 */
export function isMemberActive(db, userId) {
  return !!effectiveMembership(db, userId);
}

/**
 * 会员过期懒铲除（purchase 来源主体）：
 *   会员失效 → 移出集市（删 card_market_items + 名片 is_public 回落），主体行保留。
 *   在集市读路径（list/my-status/settings/toggle）惰性调用，不依赖定时任务。
 * @returns {number} 本轮铲除的主体数
 */
export function purgeExpiredPurchaseSubjects(db, customerId) {
  const rows = db.prepare(
    "SELECT id, user_id FROM tenant_individuals WHERE customer_id = ? AND source = 'purchase' AND status = 'active'"
  ).all(customerId);
  let purged = 0;
  for (const r of rows) {
    if (isMemberActive(db, r.user_id)) continue;
    db.prepare("DELETE FROM card_market_items WHERE customer_id = ? AND subject_type = 'individual' AND subject_id = ?")
      .run(customerId, r.id);
    db.prepare('UPDATE card_profile SET is_public = 0 WHERE user_id = ?').run(r.user_id);
    purged++;
  }
  return purged;
}

/**
 * 购买赠主体（payment.activateCardMember 支付成功回调内调用）。
 *
 * 前置条件（任一不满足即跳过，不影响会员本身开通）：
 *   - pkg.market_subject=1（后台套餐勾选「含集市入驻资格」）
 *   - 租户 individualJoinMode='purchase'（code 模式不自动授予）
 *   - 配额未满：方案配额 card.memberCount + 套餐额度 max_individuals
 *   - 用户未绑定其他租户（防跨租户抢人；已在本租户有行则复活该行）
 *
 * 幂等：已有行 → 复活为 active 并置 source='purchase'；无行 → 新建 active 行。
 * 绑定镜像 apply/audit approve：platform_user.customer_id + identity_type、
 * 名下未关联名片补 customer_id。
 *
 * @returns {{granted:boolean, reason?:string}}
 */
export function grantMarketSubjectByPurchase(db, { customerId, userId, pkg }) {
  if (!pkg?.market_subject) return { granted: false, reason: 'pkg-no-subject' };
  const cid = Number(customerId) || 0;
  if (!cid) return { granted: false, reason: 'no-tenant' };
  if (readIndividualJoinMode(db, cid) !== 'purchase') return { granted: false, reason: 'code-mode' };

  // 跨租户保护：已绑定别的租户则不授予（会员权益不受影响，场席留给他自己的租户）
  const pu = db.prepare('SELECT nickname, phone, customer_id FROM platform_user WHERE id = ?').get(userId);
  if (!pu) return { granted: false, reason: 'no-user' };
  if (pu.customer_id && Number(pu.customer_id) !== cid) return { granted: false, reason: 'cross-tenant' };

  // 配额（与 apply/audit approve 同口径：方案 memberCount + 套餐 max_individuals）
  const iq = checkTenantSolutionQuota(db, cid, 'card', 'memberCount');
  if (!iq.ok) return { granted: false, reason: 'quota-solution' };
  const q = checkTenantQuota(db, cid, 'max_individuals');
  if (!q.ok) return { granted: false, reason: 'quota-plan' };

  // 姓名/电话取最新有效名片，回落账号（company 列存量语义=城市，与 card.js 口令路径一致）
  const card = db.prepare("SELECT name, phone, position, city FROM card_profile WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(userId);
  const name = card?.name || pu.nickname || '';
  const phone = card?.phone || pu.phone || '';

  const exist = db.prepare('SELECT id FROM tenant_individuals WHERE customer_id = ? AND user_id = ?').get(cid, userId);
  if (exist) {
    db.prepare(`UPDATE tenant_individuals SET status = 'active', source = 'purchase',
      name = CASE WHEN ? != '' THEN ? ELSE name END,
      phone = CASE WHEN ? != '' THEN ? ELSE phone END,
      position = CASE WHEN ? != '' THEN ? ELSE position END,
      company = CASE WHEN ? != '' THEN ? ELSE company END,
      updated_at = datetime('now') WHERE id = ?`)
      .run(name, name, phone, phone, card?.position || '', card?.position || '', card?.city || '', card?.city || '', exist.id);
  } else {
    db.prepare(`INSERT INTO tenant_individuals (customer_id, user_id, name, phone, position, company, status, source)
      VALUES (?, ?, ?, ?, ?, ?, 'active', 'purchase')`)
      .run(cid, userId, name, phone, card?.position || '', card?.city || '');
  }

  // 绑定租户 + 关联名下未关联名片（镜像 apply/audit approve）
  db.prepare("UPDATE platform_user SET customer_id = ?, identity_type = 'individual', updated_at = datetime('now') WHERE id = ?")
    .run(cid, userId);
  db.prepare("UPDATE card_profile SET customer_id = ? WHERE user_id = ? AND (customer_id IS NULL OR customer_id = '')")
    .run(cid, userId);

  addOperationLog(db, {
    userId,
    username: pu.nickname || '',
    action: 'purchase_grant_market_subject',
    targetType: 'tenant_individual',
    targetId: exist?.id ?? null,
    detail: `购买会员套餐获得集市场席（租户#${cid}，套餐 ${pkg.name || pkg.level || pkg.id}）`,
    ip: '',
  });
  return { granted: true, individualId: exist?.id ?? null };
}
