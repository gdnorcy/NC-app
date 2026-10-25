/**
 * 入驻兑换码服务（第21轮）
 *
 * 替代原来的裸静态口令 `projects.invite_code`——那个模型是「一租户一个静态字符串」：
 * 全员共用、无使用上限、用后不核销、无有效期，列上连 UNIQUE 都没有（生成还是
 * Math.random base36）。新模型是「一人一码、用完即废」的兑换码。
 *
 * 生命周期：0 未使用 →(用户提交入驻) 1 已占用 →(管理员审核通过) 2 已核销
 *                        └─(管理员拒绝) 回滚 0 未使用
 *                     3 已作废（管理员手动停用，不可逆）
 *
 * 🔴 本轮范围（用户拍板）：只收编「个人入驻」。
 *    企业入驻（POST /apply type=enterprise）仍走旧 projects.invite_code，
 *    ENT 员工码（/enterprise/join）完全不动，见 resolveBindTarget 的分流注释。
 *
 * 🔴 并发安全：占用必须是「带 status=0 条件的原子 UPDATE + changes 判定」，
 *    不能先 SELECT 再 UPDATE（两步之间会被第二个请求插进来，同一码被两人占用）。
 *    更进一步：整个「占码 + 建主体」放进一个事务，任何一步失败整回滚，
 *    避免占了个码但主体没建成 → 码永久卡在 status=1。
 */
import { generateJoinCodes } from '../utils/codes.js';

export { generateJoinCodes };

/** 状态码（与 DB 注释一致） */
export const CODE_STATUS = { UNUSED: 0, OCCUPIED: 1, CONSUMED: 2, VOIDED: 3 };

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * 解析并占用一个入驻兑换码（个人入驻专用）
 *
 * @returns {{ok:true, customerId:number, codeRow:object} | {ok:false, error:string}}
 */
export function occupyIndividualJoinCode(db, { code, userId }) {
  const raw = String(code || '').trim();
  if (!raw) return { ok: false, error: '请输入入驻兑换码' };

  const row = db.prepare('SELECT * FROM tenant_join_code WHERE code = ?').get(raw);
  if (!row) return { ok: false, error: '入驻兑换码无效' };
  if (row.apply_type !== 'individual') return { ok: false, error: '该兑换码不是个人入驻码' };
  if (row.status === CODE_STATUS.CONSUMED) return { ok: false, error: '该兑换码已被使用' };
  if (row.status === CODE_STATUS.OCCUPIED) return { ok: false, error: '该兑换码已被占用，请勿重复使用' };
  if (row.status === CODE_STATUS.VOIDED) return { ok: false, error: '该兑换码已作废，请联系管理员重新获取' };
  if (row.expires_at && row.expires_at < todayStr()) return { ok: false, error: '该兑换码已过期' };

  // 租户本身必须可用（沿用旧口令对 projects 的校验口径）
  const project = db.prepare('SELECT id, status, valid_until FROM projects WHERE id = ?').get(row.customer_id);
  if (!project) return { ok: false, error: '入驻兑换码对应的客户项目不存在' };
  if (project.status !== 'active') return { ok: false, error: '该客户项目已停用，无法入驻' };
  if (project.valid_until && project.valid_until < todayStr()) {
    return { ok: false, error: '该客户项目已过期，无法入驻' };
  }

  // 原子占用：WHERE 里带 status=0，两个请求同时抢同一码时只有一个能 changes===1
  const info = db.prepare(`
    UPDATE tenant_join_code
    SET status = ?, used_by = ?, used_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND status = ?
  `).run(CODE_STATUS.OCCUPIED, userId, row.id, CODE_STATUS.UNUSED);
  if (!info.changes) return { ok: false, error: '该兑换码刚刚被使用，请向管理员获取新的兑换码' };

  return { ok: true, customerId: row.customer_id, codeRow: row };
}

/**
 * 把新创建出来的入驻主体回写到码上（用于审计追溯：谁用了哪个码入驻成哪条主体）
 * 必须在「占码 → 建主体」的同一个事务里调用。
 */
export function linkJoinCodeToApply(db, { code, applyId }) {
  if (!code || !applyId) return;
  db.prepare('UPDATE tenant_join_code SET apply_id = ?, updated_at = datetime(\'now\') WHERE code = ?')
    .run(Number(applyId), String(code).trim());
}

/**
 * 审核通过：占用 → 核销（用完即废）
 */
export function consumeJoinCode(db, { codeId, applyId }) {
  const where = codeId ? 'id = ?' : 'apply_id = ?';
  const val = codeId ? Number(codeId) : Number(applyId);
  if (!val) return;
  db.prepare(`UPDATE tenant_join_code SET status = ?, updated_at = datetime('now') WHERE ${where} AND status = ?`)
    .run(CODE_STATUS.CONSUMED, val, CODE_STATUS.OCCUPIED);
}

/**
 * 审核拒绝：占用 → 回滚成未使用
 *
 * 🔴 不做这一步的话「被拒绝一次就白瞎一个码」：用户重申请还得重新要码，
 *    管理员侧看到已用数虚高。这是核销型资产最常见的漏账。
 */
export function releaseJoinCode(db, { codeId, applyId }) {
  const where = codeId ? 'id = ?' : 'apply_id = ?';
  const val = codeId ? Number(codeId) : Number(applyId);
  if (!val) return;
  db.prepare(`
    UPDATE tenant_join_code
    SET status = ?, used_by = 0, used_at = NULL, apply_id = 0, updated_at = datetime('now')
    WHERE ${where} AND status = ?
  `).run(CODE_STATUS.UNUSED, val, CODE_STATUS.OCCUPIED);
}

/**
 * 占位失败后的兜底回滚（事务中途异常时使用）
 */
export function unoccupyJoinCode(db, { code }) {
  if (!code) return;
  db.prepare(`
    UPDATE tenant_join_code
    SET status = ?, used_by = 0, used_at = NULL, apply_id = 0, updated_at = datetime('now')
    WHERE code = ? AND status = ?
  `).run(CODE_STATUS.UNUSED, String(code).trim(), CODE_STATUS.OCCUPIED);
}

/**
 * 统一入口：按申请类型分流绑定到哪个租户
 *
 * - individual（个人入驻）→ 兑换码（本轮新模型）
 * - enterprise（企业入驻）→ 旧 projects.invite_code（本轮不动，用户明确只收编个人）
 *
 * 之所以保持 enterprise 走旧逻辑，是因为租户后台目前给企业用的仍是那个静态口令，
 * 一次性切换会让正在入驻的企业用户当场失败。待后续收编时只需改这个函数的分支。
 *
 * @returns {{ok:true, customerId:number, project?:object, codeRow?:object} | {ok:false, error:string}}
 */
export function resolveBindTarget(db, { bindCode, applyType, userId }) {
  if (applyType === 'enterprise') {
    const project = db.prepare('SELECT * FROM projects WHERE invite_code = ?').get(String(bindCode || '').trim());
    if (!project) return { ok: false, error: '入驻口令无效' };
    if (project.status !== 'active') return { ok: false, error: '该客户项目已停用，无法入驻' };
    if (project.valid_until && project.valid_until < todayStr()) {
      return { ok: false, error: '该客户项目已过期，无法入驻' };
    }
    return { ok: true, customerId: project.id, project };
  }
  // individual（以及未显式指定类型时的默认行为）
  return occupyIndividualJoinCode(db, { code: bindCode, userId });
}
