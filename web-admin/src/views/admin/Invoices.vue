<template>
  <div>
    <div class="page-header"><h2 class="page-title">发票管理</h2></div>
    <div class="page-card">
      <el-table :data="invoices" stripe>
        <el-table-column prop="invoiceNo" label="发票单号" width="180" />
        <el-table-column prop="orderNo" label="关联订单" width="200" />
        <el-table-column prop="title" label="抬头" min-width="160" />
        <el-table-column prop="taxNo" label="税号" width="170" />
        <el-table-column label="金额" width="110">
          <template #default="{ row }">¥{{ row.amount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'issued' ? 'success' : row.status === 'pending' ? 'warning' : 'info'" size="small">
              {{ row.status === 'issued' ? '已开票' : row.status === 'pending' ? '待开票' : '已驳回' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="申请时间" width="180" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button link type="primary" @click="issue(row)">开票</el-button>
              <el-button link type="danger" @click="reject(row)">驳回</el-button>
            </template>
            <span v-else class="muted">{{ row.remark || '—' }}</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!invoices.length" description="暂无发票申请" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { adminApi } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const invoices = ref([]);

async function load() {
  try { invoices.value = (await adminApi.get('/invoices')).invoices || []; }
  catch (e) { ElMessage.error(typeof e === 'string' ? e : '加载发票失败'); }
}
onMounted(load);

async function issue(row) {
  try {
    await ElMessageBox.confirm(`确认为「${row.title}」开票 ¥${row.amount}？`, '开票确认', { type: 'warning' });
    await adminApi.post(`/invoices/${row.id}/issue`);
    ElMessage.success('已开票');
    load();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(typeof e === 'string' ? e : '操作失败'); }
}

async function reject(row) {
  try {
    const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回申请', { inputPlaceholder: '如：税号有误，请重新提交', type: 'warning' });
    await adminApi.post(`/invoices/${row.id}/reject`, { reason: value || '' });
    ElMessage.success('已驳回');
    load();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(typeof e === 'string' ? e : '操作失败'); }
}
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title { font-size: 18px; font-weight: 600; color: #1D2129; margin: 0; }
.page-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.muted { color: #86909C; font-size: 13px; }
</style>
