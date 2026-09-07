import { describe, it, expect } from 'vitest';
import {
  isTenantAdmin,
  isEnterpriseAdmin,
  isMember,
  buildSidebarMenus,
  visibleMenuCodes,
} from '../src/utils/menuPermissions';

const tenantAdmin = { role: 'tenant_admin', enterpriseId: null };
const entAdmin = { role: 'enterprise_admin', enterpriseId: 2 };
const member = { role: 'member', enterpriseId: null };
// 异常：enterpriseId 存在但角色却是 tenant_admin → 应仍按租户管理员
const weird = { role: 'tenant_admin', enterpriseId: 2 };

describe('角色判定', () => {
  it('租户管理员：有 enterpriseId 也仍算租户管理员（防止伪装企业身份）', () => {
    expect(isTenantAdmin(tenantAdmin)).toBe(true);
    expect(isTenantAdmin(weird)).toBe(true);
    expect(isEnterpriseAdmin(weird)).toBe(false);
  });

  it('企业管理员：需 enterpriseId 且非租户管理员', () => {
    expect(isEnterpriseAdmin(entAdmin)).toBe(true);
    expect(isEnterpriseAdmin(member)).toBe(false);
    expect(isEnterpriseAdmin(null)).toBe(false);
  });

  it('普通成员：非租户管理员且非企业管理员', () => {
    expect(isMember(member)).toBe(true);
    expect(isMember(tenantAdmin)).toBe(false);
    expect(isMember(entAdmin)).toBe(false);
    expect(isMember(null)).toBe(false);
  });
});

describe('侧边栏菜单权限（多租户核心）', () => {
  it('租户管理员：有成员管理，无企业管理', () => {
    const codes = visibleMenuCodes(tenantAdmin);
    expect(codes).toEqual(['dashboard', 'apps', 'billing', 'orders', 'members', 'settings']);
  });

  it('企业管理员：有企业管理面板，无成员管理', () => {
    const menus = buildSidebarMenus(entAdmin);
    const codes = visibleMenuCodes(entAdmin);
    expect(codes).toContain('enterprise');
    expect(codes).not.toContain('members');
    const ent = menus.find((m) => m.code === 'enterprise');
    expect(ent.children.map((c) => c.code)).toEqual([
      'ent-dashboard', 'ent-employees', 'ent-pool', 'ent-settings',
    ]);
  });

  it('普通成员：仅基础菜单 + 系统设置，无成员管理/企业管理', () => {
    const codes = visibleMenuCodes(member);
    expect(codes).toEqual(['dashboard', 'apps', 'billing', 'orders', 'settings']);
  });

  it('未登录(null)：仅基础菜单，全部管理入口不可见', () => {
    const codes = visibleMenuCodes(null);
    expect(codes).toEqual(['dashboard', 'apps', 'billing', 'orders', 'settings']);
  });

  it('越权路径拦截：普通成员无权访问 /members 与 /enterprise/*', () => {
    const allowed = new Set(['/login', '/dashboard']);
    for (const m of buildSidebarMenus(member)) {
      allowed.add(m.path);
      for (const c of m.children || []) allowed.add(c.path);
    }
    expect(allowed.has('/members')).toBe(false);
    expect(allowed.has('/enterprise')).toBe(false);
    expect(allowed.has('/enterprise/pool')).toBe(false);
    expect(allowed.has('/settings/payment')).toBe(true);
  });
});
