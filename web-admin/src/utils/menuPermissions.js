/**
 * 租户端菜单权限纯函数（核心多租户权限逻辑）
 * 所有角色判定集中于此，供 CustomerLayout 侧边栏、路由守卫复用
 * 角色模型：tenant_admin（租户管理员）/ enterprise_admin（入驻企业管理-员）/ member（普通成员）
 */
export function isTenantAdmin(user) {
  return user?.role === 'tenant_admin';
}

export function isEnterpriseAdmin(user) {
  return !!user?.enterpriseId && user?.role !== 'tenant_admin';
}

export function isMember(user) {
  return !!user && user?.role !== 'tenant_admin' && !isEnterpriseAdmin(user);
}

/** 当前用户是否拥有指定菜单权限点（menu_key，如 set-members）；租户管理员天然全权 */
export function hasPerm(user, menuKey) {
  if (isTenantAdmin(user)) return true;
  return !!user && Array.isArray(user?.perms) && user.perms.includes(menuKey);
}

/** 侧边栏菜单结构：code 用于断言，label/path 用于渲染 */
export function buildSidebarMenus(user) {
  const menus = [
    { code: 'dashboard', label: '工作台', path: '/dashboard' },
    { code: 'apps', label: '应用中心', path: '/apps' },
    { code: 'goods', label: '商品管理', path: '/goods' },
    { code: 'content', label: '内容管理', path: '/content' },
    { code: 'billing', label: '套餐与续费', path: '/billing' },
    { code: 'orders', label: '我的账单', path: '/orders' },
    { code: 'member', label: '会员', path: '/member' },
  ];
  // 入驻企业管理员：企业子面板（工作台/员工/公海/设置）
  if (isEnterpriseAdmin(user)) {
    menus.push({
      code: 'enterprise',
      label: '企业管理',
      path: '/enterprise',
      children: [
        { code: 'ent-dashboard', label: '企业工作台', path: '/enterprise' },
        { code: 'ent-employees', label: '企业员工', path: '/enterprise/employees' },
        { code: 'ent-pool', label: '企业公海', path: '/enterprise/pool' },
        { code: 'ent-settings', label: '企业设置', path: '/enterprise/settings' },
      ],
    });
  }
  menus.push({
    code: 'settings',
    label: '系统设置',
    path: '/settings',
    children: [
      { code: 'set-account', label: '账号设置', path: '/settings/account' },
      { code: 'set-storage', label: '远程附件', path: '/settings/storage' },
      { code: 'set-sms', label: '短信配置', path: '/settings/sms' },
      { code: 'set-payment', label: '支付配置', path: '/settings/payment' },
    ],
  });
  // 成员与权限（合并页，页内 Tab 承载成员管理/角色管理）：租户管理员 或 拥有 set-members 权限点的成员可见；
  // 角色管理 Tab 仍仅租户管理员（防提权环），在 MemberAccess.vue 内按 isTenantAdmin 控制
  if (isTenantAdmin(user) || hasPerm(user, 'set-members')) {
    const settingsMenu = menus.find((m) => m.code === 'settings');
    settingsMenu.children.splice(1, 0, { code: 'set-access', label: '成员与权限', path: '/access' });
  }
  return menus;
}

/** 断言用：返回某角色可见的顶层菜单 code 集合 */
export function visibleMenuCodes(user) {
  return buildSidebarMenus(user).map((m) => m.code);
}

/**
 * 应用中心内的应用路由是否放行。
 * 应用中心（/apps）对全部角色可见，其子路由（/apps/panorama、/apps/card 等）
 * 由应用卡片跳转进入，不属于侧边菜单，路由守卫需按 /apps 前缀放行。
 */
export function isAppRouteAllowed(user, path) {
  if (!user || typeof path !== 'string' || !path.startsWith('/apps/')) return false;
  const menus = buildSidebarMenus(user);
  return menus.some((m) => m.path === '/apps');
}
