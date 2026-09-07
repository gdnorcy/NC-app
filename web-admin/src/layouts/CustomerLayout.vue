<template>
  <el-container class="customer-layout">
    <el-aside :width="collapsed ? '64px' : '220px'" class="sidebar">
      <div class="logo">
        <img v-if="systemLogo" :src="systemLogo" alt="logo" class="logo-img" />
        <span v-else class="logo-text">{{ systemName }}</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :collapse="collapsed"
        router
        class="side-menu"
      >
        <el-menu-item index="/dashboard">
          <SIcon name="dashboard" size="default" />
          <span>工作台</span>
        </el-menu-item>
        <el-menu-item index="/apps">
          <SIcon name="apps" size="default" />
          <span>应用中心</span>
        </el-menu-item>
        <el-menu-item index="/billing">
          <SIcon name="wallet" size="default" />
          <span>套餐与续费</span>
        </el-menu-item>
        <el-menu-item index="/orders">
          <SIcon name="orders" size="default" />
          <span>我的账单</span>
        </el-menu-item>
        <el-menu-item v-if="isTenantAdmin" index="/members">
          <SIcon name="team" size="default" />
          <span>成员管理</span>
        </el-menu-item>
        <el-sub-menu index="/settings">
          <template #title>
            <SIcon name="settings" size="default" />
            <span>系统设置</span>
          </template>
          <el-menu-item index="/settings/account">账号设置</el-menu-item>
          <el-menu-item index="/settings/storage">远程附件</el-menu-item>
          <el-menu-item index="/settings/sms">短信配置</el-menu-item>
          <el-menu-item index="/settings/payment">支付配置</el-menu-item>
        </el-sub-menu>
      </el-menu>
      <div class="sidebar-extras">
        <el-button text class="extra-help" @click="showHelp">
          <el-icon><QuestionFilled /></el-icon>
          <span v-if="!collapsed">帮助中心</span>
        </el-button>
        <span v-if="!collapsed" class="extra-version">零壹系统云 v1.0.0</span>
      </div>
      <div class="sidebar-footer">
        <el-button text @click="logout">
          <el-icon><SwitchButton /></el-icon>
          <span v-if="!collapsed">退出登录</span>
        </el-button>
      </div>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-button v-if="isImpersonate" type="primary" plain size="small" @click="backToAdmin">
            <el-icon><Back /></el-icon>返回总后台
          </el-button>
          <el-button text @click="collapsed = !collapsed">
            <el-icon :size="18"><Fold v-if="!collapsed" /><Expand v-else /></el-icon>
          </el-button>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item v-for="(item, i) in breadcrumbs" :key="i">
              {{ item }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <span class="customer-name">{{ customerName }}</span>
          <el-dropdown @command="handleCommand">
            <div class="user-info">
              <el-avatar :size="32" class="user-avatar">{{ userInitial }}</el-avatar>
              <span class="user-name">{{ authStore.user?.username }}</span>
              <el-icon><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main-content">
        <el-alert
          v-if="tenantExpired"
          title="服务已到期"
          type="error"
          show-icon
          :closable="false"
          class="expire-alert"
        >
          <template #default>
            <span>当前租户服务已于 {{ tenantValidUntil || '到期日' }} 到期，业务功能已暂停。请联系平台管理员续费后恢复使用。</span>
          </template>
        </el-alert>
        <el-alert
          v-else-if="tenantDaysLeft !== null && tenantDaysLeft <= 7"
          :title="`服务将于 ${tenantDaysLeft} 天后到期（${tenantValidUntil || ''}）`"
          type="warning"
          show-icon
          :closable="false"
          class="expire-alert"
        >
          <template #default>
            <span>为避免业务中断，请尽快联系平台管理员办理续费。</span>
          </template>
        </el-alert>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  SwitchButton, Fold, Expand, ArrowDown, Back, QuestionFilled,
} from '@element-plus/icons-vue';
import SIcon from '../components/SIcon.vue';

const route = useRoute();
const router = useRouter();

const collapsed = ref(false);
const systemName = ref('零壹系统云');
const systemLogo = ref('');
const customerName = ref('');
const tenantExpired = ref(false);
const tenantValidUntil = ref('');
const tenantDaysLeft = ref(null);

const authStore = { user: JSON.parse(localStorage.getItem('customer_user') || 'null') };
const isTenantAdmin = computed(() => authStore.user?.role === 'tenant_admin');
const isImpersonate = computed(() => !!localStorage.getItem('admin_token_backup'));
const activeMenu = computed(() => route.path);
const userInitial = computed(() => authStore.user?.username?.[0]?.toUpperCase() || 'U');
const breadcrumbs = computed(() => route.meta?.breadcrumbs || [route.meta?.title || '']);

onMounted(async () => {
  try {
    const res = await fetch('/api/settings/public').then(r => r.json());
    systemName.value = res.siteName || '零壹系统云';
    systemLogo.value = res.logo || '';
  } catch (e) {}
  // 租户生命周期状态（到期提示/续费引导）
  try {
    const token = localStorage.getItem('customer_token');
    const st = await fetch('/api/customer/tenant/status', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(r => r.json());
    if (st && typeof st.expired === 'boolean') {
      tenantExpired.value = st.expired;
      tenantValidUntil.value = st.validUntil || '';
      tenantDaysLeft.value = st.daysLeft ?? null;
      if (!st.expired && st.customerName) customerName.value = st.customerName;
    }
  } catch (e) {}
});

function handleCommand(cmd) {
  if (cmd === 'logout') logout();
}
function showHelp() {
  ElMessage.info('帮助文档建设中，如有疑问请联系平台客服。');
}
function logout() {
  localStorage.removeItem('customer_token');
  localStorage.removeItem('customer_user');
  router.push('/login');
}
function backToAdmin() {
  const token = localStorage.getItem('admin_token_backup');
  if (token) {
    localStorage.setItem('panorama_token', token);
    localStorage.removeItem('admin_token_backup');
  }
  window.location.href = '/admin.html';
}
</script>

<style scoped>
.customer-layout { height: 100vh; }
.sidebar {
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
}
.logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #f0f0f0;
  font-size: 15px;
  font-weight: 600;
  color: #165DFF;
}
.logo-img { width: 30px; height: 30px; border-radius: 6px; }
.side-menu { border-right: none; padding: 8px 12px; }
.side-menu :deep(.s-icon) { margin-right: 10px; }
/* 图2风格：圆角背景块菜单 */
.side-menu :deep(.el-menu-item) {
  border-radius: 8px;
  margin-bottom: 4px;
  height: 44px;
  line-height: 44px;
  color: #4e5969;
}
.side-menu :deep(.el-menu-item:hover) {
  background-color: #f2f3f5;
  color: #1d2129;
}
.side-menu :deep(.el-menu-item.is-active) {
  background-color: #e8f3ff;
  color: #165dff;
  font-weight: 500;
}
.side-menu :deep(.el-sub-menu__title) {
  border-radius: 8px;
  margin-bottom: 4px;
  height: 44px;
  line-height: 44px;
  color: #4e5969;
}
.side-menu :deep(.el-sub-menu__title:hover) {
  background-color: #f2f3f5;
  color: #1d2129;
}
.side-menu :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
  color: #165dff;
}
.side-menu :deep(.el-menu--inline .el-menu-item) {
  height: 40px;
  line-height: 40px;
  padding-left: 48px !important;
  font-size: 13px;
}
.sidebar-extras {
  margin-top: auto;
  padding: 12px 12px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
}
.extra-help { color: #4e5969; font-size: 13px; padding: 4px 8px; height: auto; }
.extra-help:hover { color: #165dff; background: #f2f3f5; }
.extra-version { font-size: 11px; color: #c0c4cc; padding: 0 8px; user-select: none; }
.sidebar-footer { padding: 12px; border-top: 1px solid #f0f0f0; }
.header {
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}
.header-left { display: flex; align-items: center; gap: 12px; }
.header-right { display: flex; align-items: center; gap: 16px; }
.customer-name { font-size: 13px; color: #606266; }
.user-info { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.user-avatar { background: #165DFF; color: #fff; font-size: 14px; }
.user-name { font-size: 13px; color: #303133; }
.el-main.main-content { background: #f7f8fa; padding: 20px; }
.expire-alert { margin-bottom: 16px; border-radius: 8px; }
</style>
