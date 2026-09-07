<template>
  <div class="card-tabs">
    <div
      v-for="t in tabs"
      :key="t.path"
      class="ctab"
      :class="{ active: isActive(t.path) }"
      @click="go(t)"
    >
      <SIcon :name="t.icon" size="default" :color="isActive(t.path) ? '#165dff' : '#4e5969'" />
      <span>{{ t.label }}</span>
    </div>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router';
import SIcon from '../../../../components/SIcon.vue';

// 智能名片5个管理功能的统一Tab导航：所有页共用，切换行为一致
const tabs = [
  { label: '数据洞察', path: '/apps/card', icon: 'analytics' },
  { label: '员工名片', path: '/apps/card/employees', icon: 'team' },
  { label: '企业客户', path: '/apps/card/customers', icon: 'customer' },
  { label: '集市管理', path: '/apps/card/market', icon: 'market' },
  { label: '入驻管理', path: '/apps/card/tenant', icon: 'audit' },
  { label: '公海池', path: '/apps/card/pool', icon: 'pool' },
  { label: '模板市场', path: '/apps/card/templates', icon: 'template' },
];

const route = useRoute();
const router = useRouter();

function isActive(path) {
  if (path === '/apps/card') return route.path === '/apps/card';
  return route.path === path || route.path.startsWith(path + '/');
}

function go(t) {
  try {
    localStorage.setItem('cardAdminLastTab', t.path);
  } catch (e) {}
  if (route.path !== t.path) router.push(t.path);
}
</script>

<style scoped>
.card-tabs {
  display: flex;
  align-items: center;
  overflow-x: auto;
  gap: 4px;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  margin-bottom: 16px;
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
}
.card-tabs::-webkit-scrollbar { display: none; }
.ctab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 14px;
  color: #4e5969;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.ctab:hover {
  background: #f2f3f5;
  color: #1d2129;
}
.ctab.active {
  background: #e8f3ff;
  color: #165dff;
  font-weight: 500;
}
</style>
