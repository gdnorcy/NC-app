<template>
  <div class="design-editor-page">
    <div class="de-top">
      <div class="de-top-left">
        <el-button size="small" @click="goBack">← 返回设计中心</el-button>
        <span class="de-title">页面装修</span>
        <span class="de-sub">独立编辑窗口</span>
      </div>
      <div class="de-top-right">
        <span class="de-page-label">装修页面</span>
        <el-select v-model="pageType" size="small" style="width: 170px">
          <el-option v-for="p in pageTypes" :key="p.value" :value="p.value" :label="p.label" />
        </el-select>
      </div>
    </div>
    <PageEditor :page-type="pageType" />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageEditor from './PageEditor.vue';

const route = useRoute();
const router = useRouter();

const pageTypes = [
  { value: 'home', label: '首页' },
  { value: 'card', label: '名片详情页' },
  { value: 'dynamic', label: '个人动态页' },
  { value: 'mine', label: '个人中心' },
];

const pageType = ref(route.query.pageType || 'home');

// 切换页面类型时同步 URL（刷新/分享直达）
watch(pageType, (v) => {
  router.replace({ path: '/design/edit', query: { pageType: v } });
});

function goBack() {
  router.push('/design');
}
</script>

<style scoped>
.design-editor-page {
  min-height: 100vh;
  background: #f7f8fa;
  padding: 14px 20px 40px;
  box-sizing: border-box;
}
.de-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.de-top-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.de-title { font-size: 16px; font-weight: 600; color: #1d2129; white-space: nowrap; }
.de-sub { font-size: 12px; color: #86909c; background: #e8f3ff; color: #165dff; border-radius: 10px; padding: 2px 10px; line-height: 18px; white-space: nowrap; }
.de-top-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.de-page-label { font-size: 13px; color: #4e5969; white-space: nowrap; }
</style>
