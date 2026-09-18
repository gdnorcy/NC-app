import { describe, it, expect } from 'vitest';
import {
  isTenantAdmin,
  isEnterpriseAdmin,
  isMember,
  buildSidebarMenus,
  isAppRouteAllowed,
  hasPerm,
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

  it('租户管理员：成员管理/角色管理归入系统设置二级，无企业面板', () => {
    const menus = buildSidebarMenus({ role: 'tenant_admin' });
    const all = codes(menus).join(',');
    expect(all).toContain('settings');
    expect(all).not.toContain('enterprise');
    // 基础模块始终存在
    expect(all).toContain('dashboard');
    expect(all).toContain('apps');
    expect(all).toContain('billing');
    expect(all).toContain('orders');
    // 系统设置 children 含成员管理/角色管理（不再是一级菜单）
    const settings = menus.find((m) => m.code === 'settings');
    const setCodes = settings.children.map((c) => c.code).join(',');
    expect(setCodes).toContain('set-members');
    expect(setCodes).toContain('set-roles');
    expect(setCodes).toContain('set-account');
  });

  it('入驻企业管理员：含企业子面板 4 项，系统设置无成员管理', () => {
    const menus = buildSidebarMenus({ enterpriseId: 3, role: 'member' });
    const all = codes(menus).join(',');
    expect(all).toContain('enterprise');
    const ent = menus.find((m) => m.code === 'enterprise');
    expect(ent.children.map((c) => c.code)).toEqual([
      'ent-dashboard', 'ent-employees', 'ent-pool', 'ent-settings',
    ]);
    const settings = menus.find((m) => m.code === 'settings');
    const setCodes = settings.children.map((c) => c.code).join(',');
    expect(setCodes).not.toContain('set-members');
    expect(setCodes).not.toContain('set-roles');
  });

  it('普通成员：无企业面板，系统设置无成员管理', () => {
    const menus = buildSidebarMenus({ role: 'member' });
    const all = codes(menus).join(',');
    expect(all).not.toContain('enterprise');
    expect(all).toContain('settings');
    const settings = menus.find((m) => m.code === 'settings');
    const setCodes = settings.children.map((c) => c.code).join(',');
    expect(setCodes).not.toContain('set-members');
    expect(setCodes).not.toContain('set-roles');
  });

  it('异常入参不抛错', () => {
    expect(() => buildSidebarMenus(null)).not.toThrow();
    expect(() => buildSidebarMenus({})).not.toThrow();
  });
});

describe('hasPerm 权限点判定（成员管理可授权）', () => {
  it('租户管理员天然全权', () => {
    expect(hasPerm({ role: 'tenant_admin' }, 'set-members')).toBe(true);
    expect(hasPerm({ role: 'tenant_admin' }, 'anything')).toBe(true);
  });

  it('普通成员按 perms 数组判定', () => {
    const withPerm = { role: 'member', perms: ['set-members', 'card:overview'] };
    expect(hasPerm(withPerm, 'set-members')).toBe(true);
    expect(hasPerm(withPerm, 'set-roles')).toBe(false);
    expect(hasPerm({ role: 'member', perms: [] }, 'set-members')).toBe(false);
    expect(hasPerm({ role: 'member' }, 'set-members')).toBe(false);
    expect(hasPerm(null, 'set-members')).toBe(false);
  });

  it('拥有 set-members 的普通成员：可见成员管理，角色管理仍仅管理员', () => {
    const menus = buildSidebarMenus({ role: 'member', perms: ['set-members'] });
    const settings = menus.find((m) => m.code === 'settings');
    const setCodes = settings.children.map((c) => c.code).join(',');
    expect(setCodes).toContain('set-members');
    expect(setCodes).not.toContain('set-roles');
  });
});

describe('isAppRouteAllowed 应用路由守卫', () => {
  const tenantAdmin = { role: 'tenant_admin' };
  const entAdmin = { role: 'enterprise_admin', enterpriseId: 2 };
  const member = { role: 'member' };

  it('应用中心子路由对租户管理员放行', () => {
    expect(isAppRouteAllowed(tenantAdmin, '/apps/panorama')).toBe(true);
    expect(isAppRouteAllowed(tenantAdmin, '/apps/card/employees')).toBe(true);
  });

  it('应用中心子路由对入驻企业管理员放行', () => {
    expect(isAppRouteAllowed(entAdmin, '/apps/card/market')).toBe(true);
    expect(isAppRouteAllowed(entAdmin, '/apps/channel/mini')).toBe(true);
  });

  it('应用中心子路由对普通成员放行（应用中心全员可见）', () => {
    expect(isAppRouteAllowed(member, '/apps/card')).toBe(true);
  });

  it('非应用中心路由不放行', () => {
    expect(isAppRouteAllowed(tenantAdmin, '/enterprise')).toBe(false);
    expect(isAppRouteAllowed(tenantAdmin, '/dashboard')).toBe(false);
    expect(isAppRouteAllowed(tenantAdmin, '/apps')).toBe(false); // 顶层菜单走 allowedPaths
  });

  it('异常入参不抛错', () => {
    expect(isAppRouteAllowed(null, '/apps/panorama')).toBe(false);
    expect(isAppRouteAllowed(tenantAdmin, '')).toBe(false);
    expect(isAppRouteAllowed(tenantAdmin, null)).toBe(false);
  });
});
