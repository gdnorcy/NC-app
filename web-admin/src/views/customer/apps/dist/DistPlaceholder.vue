<template>
  <div>
    <AppPageHeader :title="title" :desc="desc">
      <div class="hd-actions">
        <el-tag type="warning">P1 规划中</el-tag>
      </div>
    </AppPageHeader>
    <el-card shadow="never">
      <el-empty :description="emptyDesc" />
      <div class="plan-box">
        <div class="plan-title">规划能力</div>
        <ul>
          <li v-for="(f, i) in features" :key="i">{{ f }}</li>
        </ul>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import AppPageHeader from '../../../../components/AppPageHeader.vue';

const props = defineProps({
  title: { type: String, required: true },
  desc: { type: String, default: '' },
  emptyDesc: { type: String, default: '' },
  features: { type: Array, default: () => [] },
});
</script>

<style scoped>
.hd-actions { display: flex; gap: 12px; align-items: center; }
.plan-box { margin-top: 8px; padding: 16px 20px; background: #f7f8fa; border-radius: 8px; }
.plan-title { font-size: 13px; font-weight: 600; color: #1d2129; margin-bottom: 8px; }
.plan-box ul { margin: 0; padding-left: 18px; color: #4e5969; font-size: 13px; line-height: 2; }
</style>
