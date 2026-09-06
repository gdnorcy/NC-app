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
      { path: 'apps', component: () => import('../views/customer/Apps.vue'), meta: { title: '应用中心', breadcrumbs: ['应用中心'] } },
      { path: 'apps/panorama/plans', component: () => import('../views/customer/panorama/Plans.vue'), meta: { title: '360全景', breadcrumbs: ['应用中心', '360全景'] } },
      { path: 'apps/panorama/plans/:id/scenes', component: () => import('../views/customer/panorama/Scenes.vue'), meta: { title: '场景管理', breadcrumbs: ['应用中心', '360全景', '场景管理'] } },
      { path: 'apps/panorama/plans/:id/scenes/:sceneId/edit', component: () => import('../views/customer/panorama/SceneEdit.vue'), meta: { title: '编辑场景', breadcrumbs: ['应用中心', '360全景', '场景管理', '编辑场景'] } },
      { path: 'apps/channel', component: () => import('../views/customer/channel/ChannelOverview.vue'), meta: { title: '全端渠道', breadcrumbs: ['应用中心', '全端渠道'] } },
      { path: 'apps/channel/mini', component: () => import('../views/customer/channel/ChannelMini.vue'), meta: { title: '微信小程序', breadcrumbs: ['应用中心', '全端渠道', '微信小程序'] } },
      { path: 'apps/channel/config', component: () => import('../views/customer/channel/ChannelConfig.vue'), meta: { title: '渠道配置', breadcrumbs: ['应用中心', '全端渠道', '渠道配置'] } },
      { path: 'apps/card', component: () => import('../views/customer/card/CardAdmin.vue'), meta: { title: '智能名片', breadcrumbs: ['应用中心', '智能名片'] } },
      { path: 'orders', component: () => import('../views/customer/Orders.vue'), meta: { title: '我的账单', breadcrumbs: ['我的账单'] } },
      { path: 'members', component: () => import('../views/customer/Members.vue'), meta: { title: '成员管理', breadcrumbs: ['成员管理'] } },
      { path: 'settings', component: () => import('../views/customer/Settings.vue'), meta: { title: '账号设置', breadcrumbs: ['账号设置'] } },
    ],
  },
];

const router = createRouter({ history: createWebHashHistory(), routes });

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('customer_token');
  if (to.path !== '/login' && !token) next('/login');
  else next();
});

export default router;
