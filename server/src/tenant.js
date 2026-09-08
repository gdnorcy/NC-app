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

/** 读取租户独立配置（projects.config JSON：miniExpireMode/adminExpireMode/selfRenew） */
export function getProjectConfig(db, customerId) {
  const proj = db.prepare('SELECT config FROM projects WHERE id = ?').get(customerId);
  if (!proj) return {};
  try { return JSON.parse(proj.config || '{}'); } catch { return {}; }
}

/**
 * 租户状态
 * @returns {{ project?: object, active: boolean, expired: boolean, missing: boolean, reason?: string }}
 */
export function tenantState(db, customerId, opts = {}) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(customerId);
  if (!project) return { active: false, missing: true, expired: false, reason: '客户项目不存在' };

  if (project.status === 'trashed') {
    return { project, active: false, missing: false, expired: false, reason: '客户项目已删除' };
  }
  if (project.status !== 'active') {
    return { project, active: false, missing: false, expired: false, reason: '客户项目已停用' };
  }
  if (project.valid_until && project.valid_until < today()) {
    // 到期策略（读 projects.config，注册续费配置）：
    // - ctx='admin'（租户后台）：adminExpireMode==='allow' → 只读放行；否则拦截
    // - ctx='mini'（C端小程序/H5）：miniExpireMode==='prompt' → 只读放行；否则拦截
    // 只读 = 仅 GET 放行，写操作由各路由中间件拒绝
    const cfg = getProjectConfig(db, customerId);
    const ctx = opts.ctx || 'mini';
    const allow = ctx === 'admin'
      ? cfg.adminExpireMode === 'allow'
      : cfg.miniExpireMode === 'prompt';
    if (allow) {
      return { project, active: false, missing: false, expired: true, readonly: true, reason: '服务已到期，当前为只读模式，请及时续费' };
    }
    return { project, active: false, missing: false, expired: true, reason: '服务已到期，请联系平台续费' };
  }
  return { project, active: true, missing: false, expired: false };
}

/** 解决方案是否已开通给该租户（兼容：直接开通应用 code / 开通包含该应用的组合包方案） */
export function hasSolution(db, customerId, code) {
  const project = db.prepare('SELECT solutions FROM projects WHERE id = ?').get(customerId);
  if (!project) return false;
  let arr;
  try {
    arr = JSON.parse(project.solutions || '[]');
  } catch {
    return false;
  }
  if (!Array.isArray(arr)) return false;
  // 直接开通
  if (arr.includes(code)) return true;
  // 组合包：开通的方案（solution code）→ solution_apps 是否授权该应用
  for (const solCode of arr) {
    const hit = db.prepare(`
      SELECT sa.id FROM solution_apps sa
      JOIN solutions s ON s.id = sa.solution_id
      JOIN apps a ON a.id = sa.app_id
      WHERE s.code = ? AND a.code = ? AND sa.enabled = 1
    `).get(solCode, code);
    if (hit) return true;
  }
  return false;
}

/**
 * 校验租户可用且已开通指定解决方案。
 * 供 express 中间件复用：返回 null 表示通过，否则返回 { status, error }
 */
export function checkTenantAccess(db, customerId, solutionCode, ctx = 'mini') {
  if (!customerId) return { status: 403, error: '未关联客户项目' };
  const state = tenantState(db, customerId, { ctx });
  if (!state.active) {
    // 只读模式：调用方（路由中间件）据此对 GET 放行、写请求拒绝
    if (state.readonly) return { status: 403, error: state.reason, readonly: true };
    return { status: state.missing ? 404 : 403, error: state.reason };
  }
  if (solutionCode && !hasSolution(db, customerId, solutionCode)) {
    return { status: 403, error: '未开通该解决方案，请联系平台管理员' };
  }
  return null;
}
