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
      { path: 'logs', component: () => import('../views/admin/Logs.vue'), meta: { title: '操作日志', breadcrumbs: ['操作日志'] } },
      { path: 'settings/basic', component: () => import('../views/admin/settings/Basic.vue'), meta: { title: '基础设置', breadcrumbs: ['系统设置', '基础设置'] } },
      { path: 'settings/storage', component: () => import('../views/admin/settings/Storage.vue'), meta: { title: '存储设置', breadcrumbs: ['系统设置', '存储设置'] } },
      { path: 'settings/sms', component: () => import('../views/admin/settings/Sms.vue'), meta: { title: '短信接口', breadcrumbs: ['系统设置', '短信接口'] } },
      { path: 'settings/payment', component: () => import('../views/admin/settings/Payment.vue'), meta: { title: '支付设置', breadcrumbs: ['系统设置', '支付设置'] } },
      { path: 'settings/security', component: () => import('../views/admin/settings/Security.vue'), meta: { title: '安全设置', breadcrumbs: ['系统设置', '安全设置'] } },
      { path: 'settings/open', component: () => import('../views/admin/settings/OpenPlatform.vue'), meta: { title: '开放平台', breadcrumbs: ['系统设置', '开放平台'] } },
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
