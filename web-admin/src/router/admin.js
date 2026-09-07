import { createRouter, createWebHashHistory } from 'vue-router';
import AdminLayout from '../layouts/AdminLayout.vue';

const routes = [
  { path: '/login', component: () => import('../views/admin/Login.vue'), meta: { title: '登录' } },
  { path: '/oauth/authorize', component: () => import('../views/admin/OAuthAuthorize.vue'), meta: { title: '授权' } },
  {
    path: '/',
    component: AdminLayout,
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: () => import('../views/admin/Dashboard.vue'), meta: { title: '工作台', breadcrumbs: ['工作台'] } },
      { path: 'customers', component: () => import('../views/admin/Customers.vue'), meta: { title: '客户项目', breadcrumbs: ['客户项目'] } },
      { path: 'customers/:id/edit', component: () => import('../views/admin/CustomerEdit.vue'), meta: { title: '编辑客户', breadcrumbs: ['客户项目', '编辑客户'] } },
      { path: 'customers/:id/plans', component: () => import('../views/admin/Plans.vue'), meta: { title: '方案管理', breadcrumbs: ['客户项目', '方案管理'] } },
      { path: 'customers/:id/plans/:planId/scenes', component: () => import('../views/admin/Scenes.vue'), meta: { title: '场景管理', breadcrumbs: ['客户项目', '方案管理', '场景管理'] } },
      { path: 'customers/:id/plans/:planId/scenes/:sceneId/edit', component: () => import('../views/admin/SceneEdit.vue'), meta: { title: '编辑场景', breadcrumbs: ['客户项目', '方案管理', '场景管理', '编辑场景'] } },
      { path: 'users', component: () => import('../views/admin/Users.vue'), meta: { title: '用户管理', breadcrumbs: ['用户管理'] } },
      { path: 'solutions', component: () => import('../views/admin/Solutions.vue'), meta: { title: '解决方案', breadcrumbs: ['解决方案'] } },
      { path: 'templates', component: () => import('../views/admin/TemplateLibrary.vue'), meta: { title: '名片模板', breadcrumbs: ['名片模板'] } },
      { path: 'billing-plans', component: () => import('../views/admin/BillingPlans.vue'), meta: { title: '计费套餐', breadcrumbs: ['计费套餐'] } },
      { path: 'billing-plans/new', component: () => import('../views/admin/BillingPlanEdit.vue'), meta: { title: '新建套餐', breadcrumbs: ['计费套餐', '新建套餐'] } },
      { path: 'billing-plans/:id/edit', component: () => import('../views/admin/BillingPlanEdit.vue'), meta: { title: '编辑套餐', breadcrumbs: ['计费套餐', '编辑套餐'] } },
      { path: 'invoices', component: () => import('../views/admin/Invoices.vue'), meta: { title: '发票管理', breadcrumbs: ['发票管理'] } },
      { path: 'payment', component: () => import('../views/admin/PaymentAdmin.vue'), meta: { title: '支付管理', breadcrumbs: ['支付管理'] } },
      { path: 'logs', component: () => import('../views/admin/Logs.vue'), meta: { title: '操作日志', breadcrumbs: ['操作日志'] } },
      { path: 'settings/basic', component: () => import('../views/admin/settings/Basic.vue'), meta: { title: '基础设置', breadcrumbs: ['系统设置', '基础设置'] } },
      { path: 'settings/storage', component: () => import('../views/admin/settings/Storage.vue'), meta: { title: '存储设置', breadcrumbs: ['系统设置', '存储设置'] } },
      { path: 'settings/sms', component: () => import('../views/admin/settings/Sms.vue'), meta: { title: '短信接口', breadcrumbs: ['系统设置', '短信接口'] } },
      { path: 'settings/payment', component: () => import('../views/admin/settings/Payment.vue'), meta: { title: '支付设置', breadcrumbs: ['系统设置', '支付设置'] } },
      { path: 'settings/security', component: () => import('../views/admin/settings/Security.vue'), meta: { title: '安全设置', breadcrumbs: ['系统设置', '安全设置'] } },
      { path: 'settings/open', component: () => import('../views/admin/settings/OpenPlatform.vue'), meta: { title: '开放平台', breadcrumbs: ['系统设置', '开放平台'] } },
      { path: 'channel', component: () => import('../views/admin/channel/ChannelOverview.vue'), meta: { title: '全端渠道', breadcrumbs: ['全端渠道'] } },
      { path: 'channel/defaults', component: () => import('../views/admin/channel/ChannelDefaults.vue'), meta: { title: '平台默认配置', breadcrumbs: ['全端渠道', '平台默认配置'] } },
      { path: 'channel/mini', component: () => import('../views/admin/channel/ChannelMini.vue'), meta: { title: '小程序管理', breadcrumbs: ['全端渠道', '小程序管理'] } },
      { path: 'channel/h5', component: () => import('../views/admin/channel/ChannelH5.vue'), meta: { title: 'H5管理', breadcrumbs: ['全端渠道', 'H5管理'] } },
      { path: 'channel/mp', component: () => import('../views/admin/channel/ChannelH5.vue'), meta: { title: '公众号管理', breadcrumbs: ['全端渠道', '公众号管理'] } },
      { path: 'channel/pc', component: () => import('../views/admin/channel/ChannelH5.vue'), meta: { title: 'PC网站管理', breadcrumbs: ['全端渠道', 'PC网站管理'] } },
    ],
  },
];

const router = createRouter({ history: createWebHashHistory(), routes });

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('panorama_token');
  if (to.path !== '/login' && !token) next('/login');
  else next();
});

export default router;
