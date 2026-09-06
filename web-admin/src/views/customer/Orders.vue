<template>
  <div>
    <div class="page-header"><h2 class="page-title">我的账单</h2></div>
    <div class="page-card">
      <el-table :data="orders" stripe>
        <el-table-column prop="orderNo" label="订单号" width="200" />
        <el-table-column prop="description" label="商品" />
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="{ row }">¥{{ row.amount }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'paid' ? 'success' : row.status === 'pending' ? 'warning' : 'info'" size="small">
              {{ row.status === 'paid' ? '已支付' : row.status === 'pending' ? '待支付' : '已取消' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
      </el-table>
      <el-empty v-if="!orders.length" description="暂无订单" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { customerApiCall } from '../../api';
import { ElMessage } from 'element-plus';

const orders = ref([]);
onMounted(async () => {
  try { orders.value = (await customerApiCall.get('/orders')).orders || []; }
  catch (e) { ElMessage.error(e); }
});
</script>
