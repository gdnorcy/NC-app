<template>
  <div>
    <AppPageHeader title="门店统计" desc="1:1 nshop 连锁门店概览：待提现 / 门店与分组标签规模 / 最近创建">
      <template #default>
        <el-button type="primary" @click="$emit('go', 'manage:create')">创建门店</el-button>
      </template>
    </AppPageHeader>

    <el-row :gutter="16" class="stat-cards">
      <el-col :span="6"><div class="stat-card"><div class="stat-num">{{ stats.storeCount }}</div><div class="stat-label">门店总数</div></div></el-col>
      <el-col :span="6"><div class="stat-card"><div class="stat-num">{{ stats.enabledCount }}</div><div class="stat-label">已启用门店</div></div></el-col>
      <el-col :span="6"><div class="stat-card"><div class="stat-num">{{ stats.categoryCount }}</div><div class="stat-label">门店分组</div></div></el-col>
      <el-col :span="6"><div class="stat-card"><div class="stat-num">{{ stats.tagGroupCount }} / {{ stats.tagCount }}</div><div class="stat-label">标签组 / 标签</div></div></el-col>
    </el-row>

    <el-card class="quota-card">
      <div class="quota-line">
        <span>门店配额：<b>{{ stats.quota }}</b> 个 · 已创建 <b>{{ stats.used }}</b> 个 · 剩余可创建 <b class="remain">{{ stats.remaining }}</b> 个</span>
        <el-button type="primary" link @click="$emit('go', 'buy')">立即购买数量</el-button>
      </div>
    </el-card>

    <el-card>
      <template #header><span class="card-title">最近创建门店</span></template>
      <el-table v-if="stats.recent.length" :data="stats.recent" size="default">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="门店" min-width="200" />
        <el-table-column prop="type" label="门店类型" width="120" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }"><el-tag :type="row.status ? 'success' : 'info'">{{ row.status ? '启用' : '禁用' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="created_at" label="建店时间" width="180" />
      </el-table>
      <el-empty v-else description="暂无门店，点击右上角「创建门店」开始" :image-size="80" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

defineEmits(['go']);

const stats = ref({ storeCount: 0, enabledCount: 0, categoryCount: 0, tagCount: 0, tagGroupCount: 0, recent: [], quota: 0, used: 0, remaining: 0 });

async function load() {
  try {
    const r = await customerApiCall.get('/store/stats');
    stats.value = r || stats.value;
  } catch (e) {
    ElMessage.error(e || '门店统计加载失败');
  }
}
onMounted(load);
</script>

<style scoped>
.stat-cards { margin-bottom: 16px; }
.stat-card {
  background: #fff; border-radius: 8px; padding: 20px; text-align: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.stat-num { font-size: 28px; font-weight: 600; color: #165dff; line-height: 1.2; }
.stat-label { font-size: 13px; color: #86909c; margin-top: 6px; }
.quota-card { margin-bottom: 16px; }
.quota-line { display: flex; align-items: center; justify-content: space-between; font-size: 14px; color: #4e5969; }
.remain { color: #ff7d00; }
.card-title { font-size: 15px; font-weight: 600; color: #1d2129; }
</style>
