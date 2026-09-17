<template>
  <div class="app-placeholder">
    <div class="card-tabs">
      <div v-for="t in tabs" :key="t.key" class="ctab" :class="{ active: activeTab === t.key }" @click="activeTab = t.key">
        {{ t.label }}
      </div>
    </div>
    <AppPageHeader :title="appName" :desc="appDesc">
      <template #default>
        <span class="app-dev-tag">二期-C 排期中</span>
      </template>
    </AppPageHeader>
    <div class="ph-body">
      <SIcon name="dynamic" size="xlarge" class="ph-icon" />
      <div class="ph-text">{{ activeLabel }} 正在开发中</div>
      <div class="ph-desc">按菜鸟云「东莞同城通」1:1 复刻计划，该功能将在二期-C 迭代开放</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import SIcon from '../../../components/SIcon.vue';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const route = useRoute();

// 三个营销引流应用的占位配置（tab 与 app_menus 一致）
const APPS = {
  'card-carmi': {
    name: '电子卡密',
    desc: '卡密商品，用户付款自动发货',
    tabs: [
      { key: 'carmi:list', label: '卡密库' },
      { key: 'carmi:cates', label: '卡密分类' },
    ],
  },
  'card-ticket': {
    name: '礼品卡券',
    desc: '虚品实物，自己兑用转人兑用',
    tabs: [{ key: 'ticket:list', label: '卡券库' }],
  },
  'card-gift': {
    name: '送礼物',
    desc: '实物礼品，购买商品转赠好友',
    tabs: [{ key: 'gift:list', label: '商品列表' }],
  },
};

const code = computed(() => route.path.split('/').pop());
const app = computed(() => APPS[code.value] || { name: code.value, desc: '', tabs: [] });
const appName = computed(() => app.value.name);
const appDesc = computed(() => app.value.desc);
const tabs = computed(() => app.value.tabs);
const activeTab = ref(tabs.value[0]?.key || '');
const activeLabel = computed(() => tabs.value.find((t) => t.key === activeTab.value)?.label || appName.value);
</script>

<style scoped>
.app-placeholder { min-height: 420px; }
.card-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
}
.ctab {
  flex-shrink: 0;
  padding: 8px 18px;
  border-radius: 8px;
  background: #fff;
  color: #4e5969;
  cursor: pointer;
  font-size: 14px;
  border: 1px solid #e5e6eb;
  transition: all 0.2s;
}
.ctab.active {
  background: #165dff;
  border-color: #165dff;
  color: #fff;
  font-weight: 500;
}
.app-dev-tag {
  font-size: 12px;
  color: #ff7d00;
  background: #fff7e8;
  border-radius: 4px;
  padding: 2px 8px;
}
.ph-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0 60px;
  color: #86909c;
}
.ph-icon { color: #c9cdd4; margin-bottom: 16px; }
.ph-text { font-size: 15px; color: #4e5969; margin-bottom: 6px; }
.ph-desc { font-size: 13px; }
</style>
