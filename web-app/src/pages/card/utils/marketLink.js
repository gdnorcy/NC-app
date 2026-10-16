/**
 * 「公开到人脉集市」开关 ↔ 集市场上架记录（card_market_items）联动。
 *
 * 病根（2026-10-15 真机报修）：「我的名片-集市状态一直显示没上架，公开状态里已上架」。
 * displaySettings 的「公开到人脉集市」开关（及 create 表单同款开关）只写
 * card_profile.is_public（名片可见性字段，服务端仅 admin 客户列表消费），
 * 从不建 card_market_items；而 myCard 的集市状态 / market 列表只认 card_market_items。
 * 两套并行体系，开关是空头支票——toast 说「已公开到集市」，实际从未上架。
 *
 * 修复模型：开关就是集市场上架控制（它的文案本就承诺「可在集市页被所有人发现」），
 * is_public 降级为可见性派生 flag。开=确保主体有上架记录，关=确保没有。
 *
 * 主体解析与 myCard/market.vue 完全同源（active 个体优先，否则首个 active），
 * 保证「开关状态」与「我的名片-集市状态」永远指向同一个主体、不会再各说各话。
 *
 * api 注入而非直接 import cardApi：单测可用 fake api 跑全流程，不 mock uni.request。
 */

/** active 个体优先，否则首个 active 主体；无 active 主体返回 null（与 myCard activeSubject 同款） */
export function pickPrimarySubject(subjects) {
  const act = (subjects || []).filter((s) => s && s.status === 'active');
  if (!act.length) return null;
  return act.find((s) => s.subjectType === 'individual') || act[0];
}

/** 主体在上架记录里的匹配项（subjectType+subjectId 双匹配，与 myCard myMarketItem 同款） */
export function findMarketItem(items, subject) {
  if (!subject) return null;
  return (
    (items || []).find(
      (it) => it && it.subjectType === subject.subjectType && it.subjectId === subject.subjectId
    ) || null
  );
}

/** 服务端错误文案提取（request reject 的是 Error(res.data?.error || '请求失败')） */
function errText(e) {
  return (e && e.message) || '操作失败，请重试';
}

/**
 * 把开关状态同步到集市场上架记录。
 *
 * @param api {{ getMarketMyStatus: Function, toggleMarket: Function }} 传 cardApi 即可
 * @param isPublic 开关目标值
 * @returns {Promise<{ok: boolean, changed: boolean, auditStatus?: string,
 *                    reason?: string, error?: string, soft?: boolean}>}
 *   ok        — 是否达到「开关值 ⇔ 上架记录」一致（或本就一致）
 *   changed   — 本次是否真的发起了 toggle
 *   reason    — 'no-subject'：无 active 主体（未入驻/审核中），上架无从谈起
 *   soft      — true 表示 my-status 查询失败（网络），调用方不应回滚 is_public
 *   auditStatus — 新上架记录的审核态（manual 模式为 'pending'，myCard 会显示「待审核」）
 */
export async function syncMarketWithIsPublic(api, isPublic) {
  let st;
  try {
    st = await api.getMarketMyStatus();
  } catch (e) {
    // 查不到状态就不知道主体/记录，不能乱 toggle；交由调用方决定（软失败不回滚 is_public）
    return { ok: false, changed: false, soft: true, error: errText(e) };
  }
  const subject = pickPrimarySubject(st && st.subjects);
  if (!subject) return { ok: true, changed: false, reason: 'no-subject' };

  const listed = !!findMarketItem(st && st.items, subject);
  if (isPublic === !!listed) return { ok: true, changed: false }; // 已一致，幂等

  try {
    const r = await api.toggleMarket({ subjectType: subject.subjectType, subjectId: subject.subjectId });
    return { ok: true, changed: true, auditStatus: r && r.auditStatus };
  } catch (e) {
    return { ok: false, changed: false, error: errText(e) };
  }
}
