import { describe, it, expect } from 'vitest';
import {
  isTenantAdmin,
  isEnterpriseAdmin,
  isMember,
  buildSidebarMenus,
} from './menuPermissions.js';

// ============================================================
// 角色判定纯函数（多租户权限核心）
// ============================================================
describe('角色判定', () => {
  it('isTenantAdmin 仅租户管理员为 true', () => {
    expect(isTenantAdmin({ role: 'tenant_admin' })).toBe(true);
    expect(isTenantAdmin({ role: 'enterprise_admin' })).toBe(false);
    expect(isTenantAdmin({ role: 'member' })).toBe(false);
    expect(isTenantAdmin(null)).toBe(false);
    expect(isTenantAdmin({})).toBe(false);
  });

  it('isEnterpriseAdmin 入驻企业管理员为 true，租户管理员为 false', () => {
    expect(isEnterpriseAdmin({ enterpriseId: 3, role: 'member' })).toBe(true);
    expect(isEnterpriseAdmin({ enterpriseId: 3, role: 'tenant_admin' })).toBe(false);
    expect(isEnterpriseAdmin({ role: 'tenant_admin' })).toBe(false);
    expect(isEnterpriseAdmin({})).toBe(false);
  });

  it('isMember 普通成员为 true，管理员为 false', () => {
    expect(isMember({ role: 'member' })).toBe(true);
    expect(isMember({ role: 'tenant_admin' })).toBe(false);
    expect(isMember({ enterpriseId: 3, role: 'member' })).toBe(false);
    expect(isMember(null)).toBe(false);
  });
});

// ============================================================
// 侧边栏菜单构建（角色可见性矩阵）
// ============================================================
describe('buildSidebarMenus 权限矩阵', () => {
  const codes = (menus) => menus.map((m) => m.code);

  it('租户管理员：含成员管理+系统设置，无企业面板', () => {
    const menus = buildSidebarMenus({ role: 'tenant_admin' });
    const all = codes(menus).join(',');
    expect(all).toContain('members');
    expect(all).toContain('settings');
    expect(all).not.toContain('enterprise');
    // 基础模块始终存在
    expect(all).toContain('dashboard');
    expect(all).toContain('apps');
    expect(all).toContain('billing');
    expect(all).toContain('orders');
  });

  it('入驻企业管理员：含企业子面板 4 项，无成员管理', () => {
    const menus = buildSidebarMenus({ enterpriseId: 3, role: 'member' });
    const all = codes(menus).join(',');
    expect(all).toContain('enterprise');
    expect(all).not.toContain('members');
    const ent = menus.find((m) => m.code === 'enterprise');
    expect(ent.children.map((c) => c.code)).toEqual([
      'ent-dashboard', 'ent-employees', 'ent-pool', 'ent-settings',
    ]);
  });

  it('普通成员：无企业面板、无成员管理', () => {
    const menus = buildSidebarMenus({ role: 'member' });
    const all = codes(menus).join(',');
    expect(all).not.toContain('enterprise');
    expect(all).not.toContain('members');
    expect(all).toContain('settings');
  });

  it('异常入参不抛错', () => {
    expect(() => buildSidebarMenus(null)).not.toThrow();
    expect(() => buildSidebarMenus({})).not.toThrow();
  });
});
