<template>
  <div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">{{ stats.planCount || 0 }}</div><div class="stat-label">方案总数</div></div>
      <div class="stat-card"><div class="stat-value">{{ stats.sceneCount || 0 }}</div><div class="stat-label">场景总数</div></div>
      <div class="stat-card"><div class="stat-value">{{ stats.memberCount || 0 }}</div><div class="stat-label">团队成员</div></div>
      <div class="stat-card"><div class="stat-value">¥{{ stats.totalAmount || '0.00' }}</div><div class="stat-label">累计消费</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="page-card">
        <h3 style="margin-bottom:12px;">最近场景</h3>
        <el-table :data="recentScenes" size="small">
          <el-table-column prop="title" label="场景名称" />
          <el-table-column prop="createdAt" label="创建时间" width="160" />
        </el-table>
      </div>
      <div class="page-card">
        <h3 style="margin-bottom:12px;">最近订单</h3>
        <el-table :data="recentOrders" size="small">
          <el-table-column prop="description" label="订单" />
          <el-table-column prop="amount" label="金额" width="100" />
        </el-table>
        <el-empty v-if="!recentOrders.length" description="暂无订单" :image-size="60" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { customerApiCall } from '../../api';

const stats = ref({});
const recentScenes = ref([]);
const recentOrders = ref([]);

onMounted(async () => {
  try {
    const data = await customerApiCall.get('/dashboard');
    stats.value = data;
    recentScenes.value = data.recentScenes || [];
    recentOrders.value = data.recentOrders || [];
  } catch (e) {}
});
</script>
