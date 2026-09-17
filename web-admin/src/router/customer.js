import { createRouter, createWebHashHistory } from 'vue-router';
import { buildSidebarMenus, isAppRouteAllowed } from '../utils/menuPermissions';
import CustomerLayout from '../layouts/CustomerLayout.vue';

const routes = [
  { path: '/login', component: () => import('../views/customer/Login.vue'), meta: { title: '登录' } },
  // 设计中心·独立装修编辑窗口（无后台壳全屏，参考云菜鸟/eweishop）
  { path: '/design/edit', component: () => import('../views/customer/apps/design/DesignEditorPage.vue'), meta: { title: '页面装修' } },
  {
    path: '/',
    component: CustomerLayout,
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: () => import('../views/customer/Dashboard.vue'), meta: { title: '工作台', breadcrumbs: ['工作台'] } },
      { path: 'analytics', redirect: '/apps/card' },
      { path: 'apps', component: () => import('../views/customer/Apps.vue'), meta: { title: '应用中心', breadcrumbs: ['应用中心'] } },
      { path: 'apps/panorama', component: () => import('../views/customer/apps/card/Analytics.vue'), meta: { title: '数据洞察', breadcrumbs: ['应用中心', '360全景', '数据洞察'], solution: 'panorama' } },
      { path: 'apps/panorama/leads', component: () => import('../views/customer/panorama/Leads.vue'), meta: { title: '线索管理', breadcrumbs: ['应用中心', '360全景', '线索管理'] } },
      { path: 'apps/panorama/plans', component: () => import('../views/customer/panorama/Plans.vue'), meta: { title: '方案管理', breadcrumbs: ['应用中心', '360全景', '方案管理'] } },
      { path: 'apps/panorama/plans/:id/scenes', component: () => import('../views/customer/panorama/Scenes.vue'), meta: { title: '场景管理', breadcrumbs: ['应用中心', '360全景', '场景管理'] } },
      { path: 'apps/panorama/plans/:id/scenes/:sceneId/edit', component: () => import('../views/customer/panorama/SceneEdit.vue'), meta: { title: '编辑场景', breadcrumbs: ['应用中心', '360全景', '场景管理', '编辑场景'] } },
      { path: 'apps/channel', redirect: '/apps?cat=全端渠道' },
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
      { path: 'apps/card/forms', component: () => import('../views/customer/apps/card/FormCollect.vue'), meta: { title: '表单收集', breadcrumbs: ['应用中心', '智能名片', '表单收集'] } },
      { path: 'apps/card/brand', component: () => import('../views/customer/apps/card/BrandAppearance.vue'), meta: { title: '品牌外观', breadcrumbs: ['应用中心', '智能名片', '品牌外观'] } },
      // 分销体系（5 个独立应用；P0 已实现 dist 底座，其余 4 个为占位）
      { path: 'apps/dist', component: () => import('../views/customer/apps/dist/DistHome.vue'), meta: { title: '分销裂变', breadcrumbs: ['应用中心', '分销体系', '分销裂变'] } },
      { path: 'apps/partner', component: () => import('../views/customer/apps/dist/PartnerHome.vue'), meta: { title: '合伙人分红', breadcrumbs: ['应用中心', '分销体系', '合伙人分红'] } },
      { path: 'apps/share-all', component: () => import('../views/customer/apps/dist/ShareAllHome.vue'), meta: { title: '全民股东', breadcrumbs: ['应用中心', '分销体系', '全民股东'] } },
      { path: 'apps/share-cat', component: () => import('../views/customer/apps/dist/ShareCatHome.vue'), meta: { title: '类目股东', breadcrumbs: ['应用中心', '分销体系', '类目股东'] } },
      { path: 'apps/share-area', component: () => import('../views/customer/apps/dist/ShareAreaHome.vue'), meta: { title: '区域股东', breadcrumbs: ['应用中心', '分销体系', '区域股东'] } },
      // 营销引流应用（电子卡密=卡密库管理端二期-C已实现；礼品卡券/送礼物待二期）
      { path: 'apps/card-carmi', component: () => import('../views/customer/apps/CardCarmiHome.vue'), meta: { title: '电子卡密', breadcrumbs: ['应用中心', '营销引流', '电子卡密'] } },
      { path: 'apps/card-ticket', component: () => import('../views/customer/apps/CardTicketHome.vue'), meta: { title: '礼品卡券', breadcrumbs: ['应用中心', '营销引流', '礼品卡券'] } },
      { path: 'apps/card-gift', component: () => import('../views/customer/apps/CardGiftHome.vue'), meta: { title: '送礼物', breadcrumbs: ['应用中心', '营销引流', '送礼物'] } },
      { path: 'apps/goods-collect', component: () => import('../views/customer/apps/GoodsCollectHome.vue'), meta: { title: '商品采集', breadcrumbs: ['应用中心', '营销引流', '商品采集'] } },
      // 小程序直播（应用中心「客群维护」：1:1 菜鸟云「微信直播」直播列表/商品同步/商品审核）
      { path: 'apps/live', component: () => import('../views/customer/live/LiveHome.vue'), meta: { title: '小程序直播', breadcrumbs: ['应用中心', '客群维护', '小程序直播'] } },
      // 设计中心（侧边栏一级菜单：素材/风格/导航/模板/首页/页面装修）
      { path: 'design', component: () => import('../views/customer/apps/design/DesignHome.vue'), meta: { title: '设计中心', breadcrumbs: ['设计中心'] } },
      // 商品管理（侧边栏一级菜单：1:1 菜鸟云「东莞同城通」duoproducts）
      { path: 'goods', component: () => import('../views/customer/goods/GoodsHome.vue'), meta: { title: '商品管理', breadcrumbs: ['商品管理'] } },
      { path: 'goods/edit', component: () => import('../views/customer/goods/GoodsEdit.vue'), meta: { title: '添加/编辑商品', breadcrumbs: ['商品管理', '商品列表', '添加/编辑商品'] } },
      // 内容管理（侧边栏一级菜单：1:1 菜鸟云「东莞同城通」内容）
      { path: 'content', component: () => import('../views/customer/content/ContentHome.vue'), meta: { title: '内容管理', breadcrumbs: ['内容管理'] } },
      { path: 'content/article/edit', component: () => import('../views/customer/content/ContentArticleEdit.vue'), meta: { title: '添加/编辑文章', breadcrumbs: ['内容管理', '文章列表', '添加/编辑文章'] } },
      { path: 'orders', component: () => import('../views/customer/Orders.vue'), meta: { title: '我的账单', breadcrumbs: ['我的账单'] } },
      { path: 'member', component: () => import('../views/customer/member/MemberHome.vue'), meta: { title: '会员', breadcrumbs: ['会员'] } },
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

/** 角色可访问路径集（含子菜单） */
function allowedPaths(user) {
  const set = new Set(['/login', '/dashboard', '/design', '/design/edit', '/goods', '/goods/edit', '/content', '/content/article/edit']);
  for (const m of buildSidebarMenus(user)) {
    set.add(m.path);
    for (const c of m.children || []) set.add(c.path);
  }
  return set;
}

const router = createRouter({ history: createWebHashHistory(), routes });

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('customer_token');
  if (to.path !== '/login' && !token) next('/login');
  else {
    // 企业管理员默认落地企业工作台，不进租户工作台
    const user = JSON.parse(localStorage.getItem('customer_user') || 'null');
    if (user?.enterpriseId && user?.role !== 'tenant_admin' && to.path === '/dashboard') {
      next('/enterprise');
    } else if (token && to.path !== '/login' && !allowedPaths(user).has(to.path)) {
      // 应用中心内的应用路由：应用中心对全员开放，子路由按前缀放行
      if (!isAppRouteAllowed(user, to.path)) {
        // 越权拦截：普通成员访问成员管理/企业面板等 → 回工作台
        next('/dashboard');
      } else next();
    } else next();
  }
});

export default router;
