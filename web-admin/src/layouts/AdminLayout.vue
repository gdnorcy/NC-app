<template>
  <el-container class="admin-layout">
    <el-aside :width="collapsed ? '64px' : '220px'" class="sidebar">
      <div class="logo" :class="{ collapsed: collapsed }">
        <img v-if="logo" :src="logo" alt="logo" class="logo-img" />
        <span v-else-if="!collapsed" class="logo-text">零壹系统云</span>
        <span v-else class="logo-text-mini">云</span>
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
        <el-menu-item index="/customers">
          <SIcon name="building" size="default" />
          <span>客户项目</span>
        </el-menu-item>
        <el-menu-item v-if="isAdmin" index="/users">
          <SIcon name="users" size="default" />
          <span>用户管理</span>
        </el-menu-item>
        <template v-if="isAdmin">
          <div v-if="!collapsed" class="menu-group-title">方案中心</div>
          <el-menu-item index="/solutions">
            <SIcon name="solutions" size="default" />
            <span>解决方案</span>
          </el-menu-item>
          <el-menu-item index="/apps-center">
            <SIcon name="apps" size="default" />
            <span>应用中心</span>
          </el-menu-item>
        </template>
        <el-menu-item v-if="!isAdmin" index="/solutions">
          <SIcon name="solutions" size="default" />
          <span>解决方案</span>
        </el-menu-item>
        <el-menu-item index="/finance">
          <SIcon name="wallet" size="default" />
          <span>财务管理</span>
        </el-menu-item>
        <el-menu-item v-if="isAdmin" index="/logs">
          <SIcon name="logs" size="default" />
          <span>操作日志</span>
        </el-menu-item>
        <template v-if="isAdmin">
          <div v-if="!collapsed" class="menu-group-title">系统设置</div>
          <el-menu-item index="/settings">
            <SIcon name="settings" size="default" />
            <span>系统设置</span>
          </el-menu-item>
        </template>
      </el-menu>
      <div class="sidebar-footer">
        <el-tooltip :disabled="!collapsed" content="退出登录" placement="right" :show-after="200">
          <el-button text @click="logout">
            <el-icon><SwitchButton /></el-icon>
            <span v-if="!collapsed">退出登录</span>
          </el-button>
        </el-tooltip>
      </div>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-button text @click="toggleCollapsed">
            <el-icon :size="18"><Fold v-if="!collapsed" /><Expand v-else /></el-icon>
          </el-button>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item v-for="(item, i) in breadcrumbs" :key="i">
              <router-link v-if="i < breadcrumbs.length - 1 && crumbHref(item)" :to="crumbHref(item)">{{ item }}</router-link>
              <span v-else>{{ item }}</span>
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-input v-model="search" placeholder="全局搜索..." class="search-input" clearable>
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
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
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { ElMessage } from 'element-plus';
import {
  SwitchButton, Fold, Expand, Search, ArrowDown,
} from '@element-plus/icons-vue';
import SIcon from '../components/SIcon.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const collapsed = ref(localStorage.getItem('admin-sidebar-collapsed') === '1');
function toggleCollapsed() {
  collapsed.value = !collapsed.value;
  localStorage.setItem('admin-sidebar-collapsed', collapsed.value ? '1' : '0');
}
const search = ref('');
const logo = ref('');

const isAdmin = computed(() => authStore.user?.role === 'admin');
const activeMenu = computed(() => route.path);
const userInitial = computed(() => authStore.user?.username?.[0]?.toUpperCase() || 'U');
const breadcrumbs = computed(() => route.meta?.breadcrumbs || [route.meta?.title || '']);
// 面包屑链接映射：可点击项跳对应顶层入口（当前页/无映射项不可点）
const CRUMB_LINKS = {
  '工作台': '/dashboard',
  '客户项目': '/customers',
  '解决方案': '/solutions',
  '应用中心': '/apps-center',
  '系统设置': '/settings',
  '财务管理': '/finance',
  '全端渠道': '/channel',
};
function crumbHref(label) { return CRUMB_LINKS[label] || ''; }

function handleCommand(cmd) {
  if (cmd === 'logout') {
    authStore.logout();
    router.push('/login');
    ElMessage.success('已退出登录');
  }
}
function logout() {
  authStore.logout();
  router.push('/login');
}
</script>

<style scoped>
.admin-layout { height: 100vh; }
.sidebar {
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  transition: width 0.3s;
}
.logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #f0f0f0;
  font-size: 16px;
  font-weight: 600;
  color: #165DFF;
}
.logo-img { width: 32px; height: 32px; border-radius: 6px; }
.logo.collapsed { padding: 0; }
.logo-text-mini {
  width: 32px; height: 32px; border-radius: 6px; background: #165DFF; color: #fff;
  font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center;
}
.side-menu { border-right: none; flex: 1; padding: 8px 12px; }
.side-menu :deep(.s-icon) { margin-right: 10px; }
/* 折叠态：菜单项图标水平居中，去除展开态遗留的图标右间距 */
.side-menu.el-menu--collapse :deep(.el-menu-item) {
  padding: 0 !important;
  justify-content: center;
}
.side-menu.el-menu--collapse :deep(.s-icon) { margin-right: 0; }
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
.menu-group-title {
  padding: 12px 12px 6px;
  font-size: 11px;
  color: #909399;
  text-transform: uppercase;
}
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
.search-input { width: 240px; }
.user-info { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.user-avatar { background: #165DFF; color: #fff; font-size: 14px; }
.user-name { font-size: 13px; color: #303133; }
.main-content { background: #f5f7fa; padding: 20px; }
</style>
