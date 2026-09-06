<template>
  <div>
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-value">{{ stats.customers }}</div>
        <div class="stat-label">客户项目</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.plans }}</div>
        <div class="stat-label">方案数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.scenes }}</div>
        <div class="stat-label">场景数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.users }}</div>
        <div class="stat-label">用户数</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="page-card">
        <h3 style="margin-bottom:12px;">系统状态</h3>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="存储">
            <el-tag type="success">本地</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="短信">
            <el-tag type="warning">Mock（开发）</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="微信支付">
            <el-tag type="info">未配置</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="支付宝">
            <el-tag type="info">未配置</el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </div>
      <div class="page-card">
        <h3 style="margin-bottom:12px;">最近操作</h3>
        <el-table :data="recentLogs" size="small">
          <el-table-column prop="createdAt" label="时间" width="140" />
          <el-table-column prop="username" label="用户" width="100" />
          <el-table-column prop="action" label="操作" />
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { fetchCustomers, fetchPlans, fetchScenes, fetchUsers, fetchLogs } from '../../api';

const stats = ref({ customers: 0, plans: 0, scenes: 0, users: 0 });
const recentLogs = ref([]);

onMounted(async () => {
  try {
    const [c, p, s, u] = await Promise.all([
      fetchCustomers(), fetchPlans(), fetchScenes(), fetchUsers(),
    ]);
    stats.value = {
      customers: c.projects?.length || 0,
      plans: p.plans?.length || 0,
      scenes: s.scenes?.length || 0,
      users: u.users?.length || 0,
    };
  } catch (e) {}
  try {
    const logs = await fetchLogs({ limit: 5 });
    recentLogs.value = logs.logs || [];
  } catch (e) {}
});
</script>
