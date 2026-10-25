/**
 * 测试辅助：在新会员模型下把某用户开成某档套餐。
 *
 * 新模型事实来源 = member_user(tenant_id, user_id) + member_level_app_benefits(套餐×应用矩阵)。
 * 本 helper 同时：
 *   - 写 platform_user.customer_id / member_level（镜像，兼容仍读它的展示路径 + resolver 兜底）
 *   - ensureTenantDefaultLevels 确保该租户四档已播种 → 取 pkg_level=tier 的 level_id
 *   - 按 matrixOverride 覆盖该档位某应用的权益（如 { card:{collect_limit:2}, radar:{push_quota:1} }）
 *   - 写/更新 member_user（新模型事实来源，status=active，永久有效）
 *
 * 仅供 member-entitlements / card-radar 等测试复用；不写任何产品代码。
 */
import { ensureTenantDefaultLevels } from '../../src/db.js';

export function grantTier(db, userId, tenantId, tier, matrixOverride = {}) {
  ensureTenantDefaultLevels(db, tenantId);
  const exp = '2999-12-31 23:59:59';
  // 旧镜像同步（member_level + member_expire_at）：旧读法（后台降级、存量工具）仍认这两个列
  db.prepare('UPDATE platform_user SET customer_id = ?, member_level = ?, member_expire_at = ? WHERE id = ?').run(tenantId, tier, exp, userId);
  const lvl = db.prepare('SELECT id FROM member_levels WHERE tenant_id = ? AND pkg_level = ?').get(tenantId, tier);
  if (!lvl) return null;
  for (const [appCode, benefits] of Object.entries(matrixOverride)) {
    db.prepare(
      `INSERT INTO member_level_app_benefits (tenant_id, level_id, app_code, benefits)
       VALUES (?,?,?,?)
       ON CONFLICT(tenant_id, level_id, app_code) DO UPDATE SET benefits = excluded.benefits`
    ).run(tenantId, lvl.id, appCode, JSON.stringify(benefits));
  }
  const exist = db.prepare('SELECT id FROM member_user WHERE tenant_id = ? AND user_id = ?').get(tenantId, userId);
  if (exist) {
    db.prepare("UPDATE member_user SET level_id = ?, status = 'active', expire_at = ? WHERE id = ?").run(lvl.id, exp, exist.id);
  } else {
    db.prepare("INSERT INTO member_user (tenant_id, user_id, level_id, status, expire_at, updated_at) VALUES (?,?,?, 'active', ?, datetime('now'))").run(tenantId, userId, lvl.id, exp);
  }
  return lvl.id;
}
