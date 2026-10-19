/**
 * 名片身份单一事实来源（2026-10-20 身份模型重构 A+B）
 *
 * 旧模型的问题：identity 一个五值枚举同时混了三件变化频率不同的事——
 *   ① 主体类型（人/企业，几乎不变）
 *   ② 归属通道（怎么进来的：租户直挂/企业挂靠/入驻/花名册，随时可变）
 *   ③ 认证与能力（能不能上集市，随审核变）
 * 「挂靠成员（ent_member）」是登录兜底影子企业的 bug 遗产，却配了产品流程。
 *
 * 新模型（对齐 HubSpot/企微/加推的共性范式）：
 *   - 轴1 主体类型 subject_type：person / enterprise（本文件用 identity==='enterprise' 派生）
 *   - 轴2 认证状态 certification：名册 active（tenant_individuals / tenant_enterprise_employees）
 *     —— 这是唯一的能力判据
 *   - 轴3 归属：只进可见性（TENANT_CARD_SCOPE_SQL），永不进能力判定
 *   - identity 降级为纯展示派生值，四值：
 *       employee   企业员工（花名册 active）
 *       individual 入驻个人（入驻审核 active）
 *       enterprise 企业名片（企业主体档案，不是人）
 *       personal   个人名片（未认证个人，含旧 ent_member/tenant 两种来源）
 *
 * 🔴 能力判定一律走本文件的 isCertifiedUser / cardCapabilities，读名册，
 *    不再读 identity；新增能力只改 cardCapabilities 一处。
 */

// 展示标签（与前端徽章一一对应）
export const IDENTITY_LABEL = {
  employee: '企业员工',
  individual: '入驻个人',
  enterprise: '企业名片',
  personal: '个人名片',
};

// 运营视角的三组（前端图例/筛选用）：能干活 / 待认证 / 主体档案
export const IDENTITY_GROUP = {
  employee: 'certified',
  individual: 'certified',
  personal: 'personal',
  enterprise: 'enterprise',
};

export const IDENTITY_GROUP_LABEL = {
  certified: '正式成员',
  personal: '个人名片',
  enterprise: '企业名片',
};

// 徽章可解释：每个身份都回答「为什么 + 能干嘛 + 怎么升级」
export const IDENTITY_HINT = {
  employee: '企业员工：已认证，可上架集市、可交换名片',
  individual: '入驻个人：已认证，可上架集市、可交换名片',
  personal: '个人名片：未认证。通过入驻认证后可上架集市',
  enterprise: '企业名片：企业主体档案，非个人成员，不参与成员统计',
};

// 身份判定 SQL（展示派生，优先级从高到低）
// 🔴 企业子查询必须带 status='active'：停用/影子企业不得提供身份（2026-10-20）
export const CARD_IDENTITY_SQL = `CASE
    WHEN c.user_id IN (SELECT user_id FROM tenant_enterprise_employees WHERE customer_id = ? AND status = 'active') THEN 'employee'
    WHEN c.user_id IN (SELECT user_id FROM tenant_individuals WHERE customer_id = ? AND status = 'active') THEN 'individual'
    WHEN c.enterprise_id IN (SELECT id FROM tenant_enterprises WHERE customer_id = ? AND status = 'active') THEN 'enterprise'
    ELSE 'personal'
  END`;

// 身份 CASE 的 3 个占位符（重复 3 次租户ID）
export function cardIdentityParams(customerId) {
  return [customerId, customerId, customerId];
}

// identity → subject_type（轴1 主体类型，派生不落库，与身份判定同源）
export function subjectTypeOf(identity) {
  return identity === 'enterprise' ? 'enterprise' : 'person';
}

// 用户在本租户的名册主体（认证状态的真值）
// 返回全量主体（含 pending/rejected，供 my-status 展示与 pickPrimarySubject 过滤），
// certified 只认 active——这是唯一的能力判据
export function getUserSubjects(db, customerId, userId) {
  const individuals = db.prepare(
    'SELECT id, status FROM tenant_individuals WHERE customer_id = ? AND user_id = ?'
  ).all(customerId, userId);
  const employees = db.prepare(
    'SELECT emp.id, emp.status FROM tenant_enterprise_employees emp WHERE emp.customer_id = ? AND emp.user_id = ?'
  ).all(customerId, userId);
  const subjects = [
    ...individuals.map((i) => ({ subjectType: 'individual', subjectId: i.id, status: i.status })),
    ...employees.map((e) => ({ subjectType: 'employee', subjectId: e.id, status: e.status })),
  ];
  return { subjects, certified: subjects.some((s) => s.status === 'active') };
}

// 是否已认证（唯一能力判据）
export function isCertifiedUser(db, customerId, userId) {
  return getUserSubjects(db, customerId, userId).certified;
}

/**
 * 名片能力矩阵（唯一收口处）
 * - 集市上架：需认证（名册 active）——与 C 端 displaySettings 的 toast 话术一致
 * - 名片交换：通讯基础功能，对全部 active 名片开放；防骚扰走频控/会员等级，不按身份
 * - 成员统计：企业名片不参与（非人）
 */
export function cardCapabilities(db, { customerId, userId }) {
  const certified = userId ? isCertifiedUser(db, customerId, userId) : false;
  return {
    canListMarket: certified,
    canExchange: true,
  };
}
