<template>
  <div class="app-manage">
    <div class="page-header">
      <el-button text @click="router.back()">
        <el-icon :size="14"><ArrowLeft /></el-icon>
        <span style="margin-left: 4px">返回应用中心</span>
      </el-button>
      <h2 class="page-title">{{ appName }} · 应用配置</h2>
    </div>
    <div class="manage-grid">
      <div
        v-for="item in entries"
        :key="item.path"
        class="manage-card"
        @click="router.push(item.path)"
      >
        <span class="manage-icon"><SIcon :name="item.icon" size="xlarge" /></span>
        <div class="manage-body">
          <div class="manage-name">{{ item.title }}</div>
          <div class="manage-desc">{{ item.desc }}</div>
        </div>
        <el-icon class="manage-arrow"><ArrowRight /></el-icon>
      </div>
      <el-empty v-if="!entries.length" description="该应用暂无总后台配置项" :image-size="90" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue';
import SIcon from '../../components/SIcon.vue';

import { ADMIN_APP_CONFIGS } from '../../config/adminAppConfigs';

const route = useRoute();
const router = useRouter();
const code = computed(() => route.params.code || '');
const appName = computed(() => ADMIN_APP_CONFIGS[code.value]?.name || code.value);
const entries = computed(() => ADMIN_APP_CONFIGS[code.value]?.entries || []);
</script>

<style scoped>
.page-header { margin-bottom: 16px; }
.page-title { margin: 8px 0 0; font-size: 18px; font-weight: 600; }
.manage-grid { display: flex; flex-wrap: wrap; gap: 16px; }
.manage-card {
  width: 240px;
  padding: 18px;
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  background: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.manage-card:hover { border-color: #165dff; box-shadow: 0 4px 12px rgba(22,93,255,0.1); }
.manage-icon { flex-shrink: 0; }
.manage-body { flex: 1; min-width: 0; }
.manage-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.manage-desc { margin-top: 4px; font-size: 12px; color: #86909c; line-height: 1.5; }
.manage-arrow { color: #c9cdd4; }
</style>
