/**
 * 租户（客户项目）生命周期与解决方案授权统一判定
 *
 * 供 auth 登录、客户后台、智能名片域（card / card-market）共用：
 * - 生命周期：status=active 且未超过 valid_until（到期自动冻结访问，续费后恢复）
 * - 解决方案授权：projects.solutions JSON 数组是否包含指定 code
 */

/** 计算今天 YYYY-MM-DD（与服务端存储格式一致） */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 租户状态
 * @returns {{ project?: object, active: boolean, expired: boolean, missing: boolean, reason?: string }}
 */
export function tenantState(db, customerId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(customerId);
  if (!project) return { active: false, missing: true, expired: false, reason: '租户不存在' };

  if (project.status === 'trashed') {
    return { project, active: false, missing: false, expired: false, reason: '租户已删除' };
  }
  if (project.status !== 'active') {
    return { project, active: false, missing: false, expired: false, reason: '租户已停用' };
  }
  if (project.valid_until && project.valid_until < today()) {
    return { project, active: false, missing: false, expired: true, reason: '租户服务已到期，请联系平台续费' };
  }
  return { project, active: true, missing: false, expired: false };
}

/** 解决方案是否已开通给该租户 */
export function hasSolution(db, customerId, code) {
  const project = db.prepare('SELECT solutions FROM projects WHERE id = ?').get(customerId);
  if (!project) return false;
  try {
    const arr = JSON.parse(project.solutions || '[]');
    return Array.isArray(arr) && arr.includes(code);
  } catch {
    return false;
  }
}

/**
 * 校验租户可用且已开通指定解决方案。
 * 供 express 中间件复用：返回 null 表示通过，否则返回 { status, error }
 */
export function checkTenantAccess(db, customerId, solutionCode) {
  if (!customerId) return { status: 403, error: '未关联租户' };
  const state = tenantState(db, customerId);
  if (!state.active) return { status: state.missing ? 404 : 403, error: state.reason };
  if (solutionCode && !hasSolution(db, customerId, solutionCode)) {
    return { status: 403, error: '未开通该解决方案，请联系平台管理员' };
  }
  return null;
}
