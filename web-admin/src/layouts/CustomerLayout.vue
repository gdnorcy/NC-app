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
          <el-icon><DataAnalysis /></el-icon>
          <span>工作台</span>
        </el-menu-item>
        <el-menu-item index="/apps">
          <el-icon><Grid /></el-icon>
          <span>应用中心</span>
        </el-menu-item>
        <el-menu-item index="/orders">
          <el-icon><Tickets /></el-icon>
          <span>我的账单</span>
        </el-menu-item>
        <el-menu-item v-if="isTenantAdmin" index="/members">
          <el-icon><User /></el-icon>
          <span>成员管理</span>
        </el-menu-item>
        <el-sub-menu index="/settings">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>系统设置</span>
          </template>
          <el-menu-item index="/settings/account">账号设置</el-menu-item>
          <el-menu-item index="/settings/storage">远程附件</el-menu-item>
          <el-menu-item index="/settings/sms">短信配置</el-menu-item>
          <el-menu-item index="/settings/payment">支付配置</el-menu-item>
        </el-sub-menu>
      </el-menu>
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
  DataAnalysis, Grid, Tickets, User, Setting, SwitchButton,
  Fold, Expand, ArrowDown, Back,
} from '@element-plus/icons-vue';

const route = useRoute();
const router = useRouter();

const collapsed = ref(false);
const systemName = ref('全景云平台');
const systemLogo = ref('');
const customerName = ref('');

const authStore = { user: JSON.parse(localStorage.getItem('customer_user') || 'null') };
const isTenantAdmin = computed(() => authStore.user?.role === 'tenant_admin');
const isImpersonate = computed(() => !!localStorage.getItem('admin_token_backup'));
const activeMenu = computed(() => route.path);
const userInitial = computed(() => authStore.user?.username?.[0]?.toUpperCase() || 'U');
const breadcrumbs = computed(() => route.meta?.breadcrumbs || [route.meta?.title || '']);

onMounted(async () => {
  try {
    const res = await fetch('/api/settings/public').then(r => r.json());
    systemName.value = res.siteName || '全景云平台';
    systemLogo.value = res.logo || '';
  } catch (e) {}
});

function handleCommand(cmd) {
  if (cmd === 'logout') logout();
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
.side-menu { border-right: none; flex: 1; }
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
.main-content { background: #f7f8fa; padding: 20px; }
</style>
