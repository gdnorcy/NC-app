<template>
  <div class="goods-placeholder">
    <AppPageHeader title="功能开发中" desc="该功能已在路线图中，即将上线，敬请期待" />
    <div class="ph-body">
      <SIcon name="dynamic" size="xlarge" class="ph-icon" />
      <div class="ph-text">{{ label }} 正在开发中</div>
      <div class="ph-desc">按菜鸟云「东莞同城通」1:1 复刻计划，该功能将在后续迭代开放</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import SIcon from '../../../components/SIcon.vue';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const route = useRoute();
const label = computed(() => route.query.m || '该功能');
</script>

<style scoped>
.goods-placeholder { min-height: 420px; }
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
