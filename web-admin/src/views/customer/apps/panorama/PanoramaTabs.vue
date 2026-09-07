<template>
  <div class="panorama-tabs">
    <div
      v-for="t in tabs"
      :key="t.path"
      class="ptab"
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

// 360全景应用内统一Tab导航：数据洞察（默认）+ 方案管理（含场景二级）
const tabs = [
  { label: '数据洞察', path: '/apps/panorama', icon: 'analytics' },
  { label: '方案管理', path: '/apps/panorama/plans', icon: 'panorama' },
];

const route = useRoute();
const router = useRouter();

function isActive(path) {
  if (path === '/apps/panorama') return route.path === '/apps/panorama';
  return route.path === path || route.path.startsWith(path + '/');
}

function go(t) {
  try {
    localStorage.setItem('panoramaLastTab', t.path);
  } catch (e) {}
  if (route.path !== t.path) router.push(t.path);
}
</script>

<style scoped>
.panorama-tabs {
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
.panorama-tabs::-webkit-scrollbar { display: none; }
.ptab {
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
.ptab:hover {
  background: #f2f3f5;
  color: #1d2129;
}
.ptab.active {
  background: #e8f3ff;
  color: #165dff;
  font-weight: 500;
}
</style>
