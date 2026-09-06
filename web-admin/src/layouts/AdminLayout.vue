<template>
  <el-container class="admin-layout">
    <el-aside :width="collapsed ? '64px' : '220px'" class="sidebar">
      <div class="logo">
        <img v-if="logo" :src="logo" alt="logo" class="logo-img" />
        <span v-else class="logo-text">360全景</span>
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
        <el-menu-item index="/customers">
          <el-icon><OfficeBuilding /></el-icon>
          <span>客户项目</span>
        </el-menu-item>
        <el-menu-item v-if="isAdmin" index="/users">
          <el-icon><User /></el-icon>
          <span>用户管理</span>
        </el-menu-item>
        <el-menu-item index="/solutions">
          <el-icon><Grid /></el-icon>
          <span>解决方案</span>
        </el-menu-item>
        <el-menu-item v-if="isAdmin" index="/logs">
          <el-icon><Document /></el-icon>
          <span>操作日志</span>
        </el-menu-item>
        <template v-if="isAdmin">
          <div class="menu-group-title">系统设置</div>
          <el-menu-item index="/settings/basic">
            <el-icon><Setting /></el-icon>
            <span>基础设置</span>
          </el-menu-item>
          <el-menu-item index="/settings/storage">
            <el-icon><Folder /></el-icon>
            <span>存储设置</span>
          </el-menu-item>
          <el-menu-item index="/settings/sms">
            <el-icon><Message /></el-icon>
            <span>短信接口</span>
          </el-menu-item>
          <el-menu-item index="/settings/payment">
            <el-icon><Wallet /></el-icon>
            <span>支付设置</span>
          </el-menu-item>
          <el-menu-item index="/settings/security">
            <el-icon><Lock /></el-icon>
            <span>安全设置</span>
          </el-menu-item>
          <el-menu-item index="/settings/open">
            <el-icon><Connection /></el-icon>
            <span>开放平台</span>
          </el-menu-item>
        </template>
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
  DataAnalysis, OfficeBuilding, User, Grid, Document, Setting,
  Folder, Message, Wallet, Lock, Connection, SwitchButton,
  Fold, Expand, Search, ArrowDown,
} from '@element-plus/icons-vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const collapsed = ref(false);
const search = ref('');
const logo = ref('');

const isAdmin = computed(() => authStore.user?.role === 'admin');
const activeMenu = computed(() => route.path);
const userInitial = computed(() => authStore.user?.username?.[0]?.toUpperCase() || 'U');
const breadcrumbs = computed(() => route.meta?.breadcrumbs || [route.meta?.title || '']);

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
.side-menu { border-right: none; flex: 1; }
.menu-group-title {
  padding: 10px 20px 6px;
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
