import { createRouter, createWebHashHistory } from 'vue-router';
import CustomerLayout from '../layouts/CustomerLayout.vue';

const routes = [
  { path: '/login', component: () => import('../views/customer/Login.vue'), meta: { title: '登录' } },
  {
    path: '/',
    component: CustomerLayout,
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: () => import('../views/customer/Dashboard.vue'), meta: { title: '工作台', breadcrumbs: ['工作台'] } },
      { path: 'analytics', redirect: '/apps/card' },
      { path: 'apps', component: () => import('../views/customer/Apps.vue'), meta: { title: '应用中心', breadcrumbs: ['应用中心'] } },
      { path: 'apps/panorama', component: () => import('../views/customer/apps/card/Analytics.vue'), meta: { title: '数据洞察', breadcrumbs: ['应用中心', '360全景', '数据洞察'], solution: 'panorama' } },
      { path: 'apps/panorama/plans', component: () => import('../views/customer/panorama/Plans.vue'), meta: { title: '方案管理', breadcrumbs: ['应用中心', '360全景', '方案管理'] } },
      { path: 'apps/panorama/plans/:id/scenes', component: () => import('../views/customer/panorama/Scenes.vue'), meta: { title: '场景管理', breadcrumbs: ['应用中心', '360全景', '场景管理'] } },
      { path: 'apps/panorama/plans/:id/scenes/:sceneId/edit', component: () => import('../views/customer/panorama/SceneEdit.vue'), meta: { title: '编辑场景', breadcrumbs: ['应用中心', '360全景', '场景管理', '编辑场景'] } },
      { path: 'apps/channel', component: () => import('../views/customer/channel/ChannelOverview.vue'), meta: { title: '全端渠道', breadcrumbs: ['应用中心', '全端渠道'] } },
      { path: 'apps/channel/mini', component: () => import('../views/customer/channel/ChannelMini.vue'), meta: { title: '微信小程序', breadcrumbs: ['应用中心', '全端渠道', '微信小程序'] } },
      { path: 'apps/channel/config', component: () => import('../views/customer/channel/ChannelConfig.vue'), meta: { title: '渠道配置', breadcrumbs: ['应用中心', '全端渠道', '渠道配置'] } },
      { path: 'apps/card', component: () => import('../views/customer/apps/card/Analytics.vue'), meta: { title: '数据洞察', breadcrumbs: ['应用中心', '智能名片', '数据洞察'], solution: 'card' } },
      { path: 'apps/card/employees', component: () => import('../views/customer/card/CardAdmin.vue'), meta: { title: '员工名片', breadcrumbs: ['应用中心', '智能名片', '员工名片'] } },
      { path: 'apps/card/customers', component: () => import('../views/customer/apps/card/CustomersManage.vue'), meta: { title: '企业客户', breadcrumbs: ['应用中心', '智能名片', '企业客户'] } },
      { path: 'apps/card/market', component: () => import('../views/customer/apps/card/MarketManage.vue'), meta: { title: '集市管理', breadcrumbs: ['应用中心', '智能名片', '集市管理'] } },
      { path: 'apps/card/tenant', component: () => import('../views/customer/apps/card/TenantManage.vue'), meta: { title: '入驻管理', breadcrumbs: ['应用中心', '智能名片', '入驻管理'] } },
      { path: 'apps/card/pool', component: () => import('../views/customer/apps/card/PublicPool.vue'), meta: { title: '公海池', breadcrumbs: ['应用中心', '智能名片', '公海池'] } },
      { path: 'apps/card/templates', component: () => import('../views/customer/apps/card/TemplateMarket.vue'), meta: { title: '模板市场', breadcrumbs: ['应用中心', '智能名片', '模板市场'] } },
      { path: 'apps/card/exchanges', component: () => import('../views/customer/apps/card/ExchangeRecords.vue'), meta: { title: '交换记录', breadcrumbs: ['应用中心', '智能名片', '交换记录'] } },
      { path: 'orders', component: () => import('../views/customer/Orders.vue'), meta: { title: '我的账单', breadcrumbs: ['我的账单'] } },
      { path: 'billing', component: () => import('../views/customer/Billing.vue'), meta: { title: '套餐与续费', breadcrumbs: ['套餐与续费'] } },
      { path: 'members', component: () => import('../views/customer/Members.vue'), meta: { title: '成员管理', breadcrumbs: ['成员管理'] } },
      // 企业管理员端（企业角色化子面板）
      { path: 'enterprise', component: () => import('../views/customer/enterprise/EnterpriseDashboard.vue'), meta: { title: '企业工作台', breadcrumbs: ['企业工作台'] } },
      { path: 'enterprise/employees', component: () => import('../views/customer/enterprise/EnterpriseEmployees.vue'), meta: { title: '企业员工', breadcrumbs: ['企业工作台', '企业员工'] } },
      { path: 'enterprise/pool', component: () => import('../views/customer/enterprise/EnterprisePool.vue'), meta: { title: '企业公海', breadcrumbs: ['企业工作台', '企业公海'] } },
      { path: 'enterprise/settings', component: () => import('../views/customer/enterprise/EnterpriseSettings.vue'), meta: { title: '企业设置', breadcrumbs: ['企业工作台', '企业设置'] } },
      { path: 'settings', redirect: '/settings/account', meta: { title: '系统设置', breadcrumbs: ['系统设置'] } },
      { path: 'settings/account', component: () => import('../views/customer/settings/AccountSettings.vue'), meta: { title: '账号设置', breadcrumbs: ['系统设置', '账号设置'] } },
      { path: 'settings/storage', component: () => import('../views/customer/settings/StorageSettings.vue'), meta: { title: '远程附件', breadcrumbs: ['系统设置', '远程附件'] } },
      { path: 'settings/sms', component: () => import('../views/customer/settings/SmsSettings.vue'), meta: { title: '短信配置', breadcrumbs: ['系统设置', '短信配置'] } },
      { path: 'settings/payment', component: () => import('../views/customer/settings/PaymentConfig.vue'), meta: { title: '支付配置', breadcrumbs: ['系统设置', '支付配置'] } },
    ],
  },
];

const router = createRouter({ history: createWebHashHistory(), routes });

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('customer_token');
  if (to.path !== '/login' && !token) next('/login');
  else {
    // 企业管理员默认落地企业工作台，不进租户工作台
    const user = JSON.parse(localStorage.getItem('customer_user') || 'null');
    if (user?.enterpriseId && user?.role !== 'tenant_admin' && to.path === '/dashboard') {
      next('/enterprise');
    } else next();
  }
});

export default router;
