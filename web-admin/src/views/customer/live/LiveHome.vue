<template>
  <div class="live-home">
    <!-- 应用内顶部 Tab（选项卡栏常驻：直播列表 / 商品同步 / 商品审核，1:1 对齐菜鸟云「微信直播」三菜单） -->
    <div class="card-tabs">
      <div v-for="t in topTabs" :key="t.key" class="ctab" :class="{ active: activeTab === t.key }" @click="switchTab(t.key)">
        <SIcon :name="t.icon" size="default" :color="activeTab === t.key ? '#165dff' : '#4e5969'" />
        <span>{{ t.label }}</span>
      </div>
    </div>

    <main class="live-content">
      <component :is="activeComp" :key="activeTab" />
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SIcon from '../../../components/SIcon.vue';
import LiveRooms from './LiveRooms.vue';
import LiveGoods from './LiveGoods.vue';
import LiveAudit from './LiveAudit.vue';

const route = useRoute();
const router = useRouter();

const topTabs = [
  { key: 'rooms', label: '直播列表', icon: 'panorama' },
  { key: 'goods', label: '商品同步', icon: 'template' },
  { key: 'audit', label: '商品审核', icon: 'audit' },
];

// URL 记忆：?m=rooms|goods|audit，刷新/直达保持当前 Tab
const activeTab = ref(route.query.m || 'rooms');
function switchTab(key) {
  activeTab.value = key;
  router.replace({ query: { ...route.query, m: key } });
}
watch(() => route.query.m, (v) => {
  if (v && topTabs.some(t => t.key === v) && v !== activeTab.value) activeTab.value = v;
});

const comps = { rooms: LiveRooms, goods: LiveGoods, audit: LiveAudit };
const activeComp = computed(() => comps[activeTab.value] || LiveRooms);
</script>

<style scoped>
.live-home { padding: 20px; }
/* CardTabs：圆角块导航、激活态主色（与设计中心/GoodsHome 顶部横向 Tab 一致） */
.card-tabs {
  display: flex; gap: 8px; background: #fff; border-radius: 8px; padding: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04); overflow-x: auto; margin-bottom: 16px;
}
.ctab {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: 8px;
  font-size: 14px; color: #4e5969; cursor: pointer; white-space: nowrap; transition: all 0.2s;
}
.ctab:hover { background: #f2f3f5; color: #1d2129; }
.ctab.active { background: #e8f3ff; color: #165dff; font-weight: 500; }
.live-content { min-height: 400px; }
</style>
