<template>
  <div class="store-home">
    <!-- 应用内顶部 Tab（选项卡栏常驻：1:1 nshop 连锁门店 7 菜单） -->
    <div class="card-tabs">
      <div v-for="t in topTabs" :key="t.key" class="ctab" :class="{ active: activeTab === t.key }" @click="switchTab(t.key)">
        <SIcon :name="t.icon" size="default" :color="activeTab === t.key ? '#165dff' : '#4e5969'" />
        <span>{{ t.label }}</span>
      </div>
    </div>

    <main class="store-content">
      <component :is="activeComp" :key="activeTab" @go="onChildGo" :open-create="createSignal" />
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SIcon from '../../../components/SIcon.vue';
import StoreStats from './StoreStats.vue';
import StoreManage from './StoreManage.vue';
import StoreGroup from './StoreGroup.vue';
import StoreTag from './StoreTag.vue';
import StoreWithdraw from './StoreWithdraw.vue';
import StoreSetting from './StoreSetting.vue';
import StoreBuy from './StoreBuy.vue';
import StoreOrders from './StoreOrders.vue';

const route = useRoute();
const router = useRouter();

const topTabs = [
  { key: 'stats', label: '门店统计', icon: 'analytics' },
  { key: 'manage', label: '门店管理', icon: 'building' },
  { key: 'group', label: '门店分组', icon: 'team' },
  { key: 'tag', label: '门店标签', icon: 'badge' },
  { key: 'withdraw', label: '提现管理', icon: 'wallet' },
  { key: 'setting', label: '基础设置', icon: 'settings' },
  { key: 'orders', label: '门店订单', icon: 'orders' },
  { key: 'buy', label: '购买门店', icon: 'orders' },
];

// URL 记忆：?m=stats|manage|...，刷新/直达保持当前 Tab
const activeTab = ref(route.query.m || 'stats');
function switchTab(key) {
  activeTab.value = key;
  router.replace({ query: { ...route.query, m: key } });
}
watch(() => route.query.m, (v) => {
  if (v && topTabs.some((t) => t.key === v) && v !== activeTab.value) activeTab.value = v;
});

const comps = { stats: StoreStats, manage: StoreManage, group: StoreGroup, tag: StoreTag, withdraw: StoreWithdraw, setting: StoreSetting, orders: StoreOrders, buy: StoreBuy };
const activeComp = computed(() => comps[activeTab.value] || StoreStats);

// 子组件联动：StoreStats「创建门店」→ 切到门店管理并打开创建弹窗
const createSignal = ref(0);
function onChildGo(key) {
  if (key === 'manage:create') {
    switchTab('manage');
    createSignal.value = Date.now();
  } else if (topTabs.some((t) => t.key === key)) {
    switchTab(key);
  }
}
</script>

<style scoped>
.store-home { padding: 20px; }
/* CardTabs：圆角块导航、激活态主色（与 GoodsHome/LiveHome 顶部横向 Tab 一致） */
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
.store-content { min-height: 400px; }
</style>
