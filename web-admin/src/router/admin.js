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
      { path: 'solutions', component: () => import('../views/admin/SolutionCenter.vue'), meta: { title: '解决方案', breadcrumbs: ['解决方案'] } },
      { path: 'solutions/new', component: () => import('../views/admin/SolutionEdit.vue'), meta: { title: '新建解决方案', breadcrumbs: ['解决方案', '新建解决方案'] } },
      { path: 'solutions/:id/edit', component: () => import('../views/admin/SolutionEdit.vue'), meta: { title: '编辑解决方案', breadcrumbs: ['解决方案', '编辑解决方案'] } },
      { path: 'solution-categories', component: () => import('../views/admin/SolutionCategories.vue'), meta: { title: '方案分类', breadcrumbs: ['解决方案', '方案分类'] } },
      { path: 'templates', component: () => import('../views/admin/TemplateLibrary.vue'), meta: { title: '名片模板', breadcrumbs: ['名片模板'] } },
      { path: 'finance', component: () => import('../views/admin/FinanceAdmin.vue'), meta: { title: '财务管理', breadcrumbs: ['财务管理'] } },
      { path: 'invoices', component: () => import('../views/admin/FinanceAdmin.vue'), meta: { title: '发票管理', breadcrumbs: ['财务管理', '发票管理'] } },
      { path: 'payment', component: () => import('../views/admin/FinanceAdmin.vue'), meta: { title: '支付管理', breadcrumbs: ['财务管理', '支付管理'] } },
      { path: 'logs', component: () => import('../views/admin/Logs.vue'), meta: { title: '操作日志', breadcrumbs: ['操作日志'] } },
      { path: 'settings', component: () => import('../views/admin/settings/SystemSettings.vue'), meta: { title: '系统设置', breadcrumbs: ['系统设置'] } },
      // 旧设置入口兼容：重定向到系统设置对应页签
      { path: 'settings/basic', redirect: '/settings?tab=basic' },
      { path: 'settings/storage', redirect: '/settings?tab=storage' },
      { path: 'settings/sms', redirect: '/settings?tab=sms' },
      { path: 'settings/payment', redirect: '/settings?tab=payment' },
      { path: 'settings/security', redirect: '/settings?tab=security' },
      { path: 'settings/open', redirect: '/settings?tab=open' },
      { path: 'apps-center', component: () => import('../views/admin/AppCenter.vue'), meta: { title: '应用中心', breadcrumbs: ['应用中心'] } },
      { path: 'channel', redirect: '/apps-center?cat=全端渠道' },
      { path: 'channel/defaults', redirect: '/settings?tab=channel-defaults' },
      { path: 'channel/mini', component: () => import('../views/admin/channel/ChannelMini.vue'), meta: { title: '小程序管理', breadcrumbs: ['应用中心', '全端渠道', '小程序管理'] } },
      { path: 'channel/h5', component: () => import('../views/admin/channel/ChannelH5.vue'), meta: { title: 'H5管理', breadcrumbs: ['应用中心', '全端渠道', 'H5管理'] } },
      { path: 'channel/mp', component: () => import('../views/admin/channel/ChannelH5.vue'), meta: { title: '公众号管理', breadcrumbs: ['应用中心', '全端渠道', '公众号管理'] } },
      { path: 'channel/pc', component: () => import('../views/admin/channel/ChannelH5.vue'), meta: { title: 'PC网站管理', breadcrumbs: ['应用中心', '全端渠道', 'PC网站管理'] } },
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
