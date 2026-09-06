<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">操作日志</h2>
    </div>
    <div class="page-card">
      <el-table :data="logs" stripe>
        <el-table-column prop="createdAt" label="时间" width="180" />
        <el-table-column prop="username" label="用户" width="120" />
        <el-table-column prop="action" label="操作" />
        <el-table-column prop="ip" label="IP" width="140" />
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { fetchLogs } from '../../api';
import { ElMessage } from 'element-plus';

const logs = ref([]);
onMounted(async () => {
  try { logs.value = (await fetchLogs({ limit: 100 })).logs || []; } catch (e) { ElMessage.error(e); }
});
</script>
