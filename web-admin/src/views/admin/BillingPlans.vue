<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">计费套餐</h2>
      <el-button type="primary" @click="$router.push('/billing-plans/new')">
        <SIcon name="plus" size="small" style="margin-right:6px" />新建套餐
      </el-button>
    </div>

    <div class="page-card">
      <el-table :data="plans" stripe>
        <el-table-column label="套餐" min-width="180">
          <template #default="{ row }">
            <div class="plan-name">{{ row.name }}</div>
            <div class="plan-code">{{ row.code }}</div>
          </template>
        </el-table-column>
        <el-table-column label="价格" width="140">
          <template #default="{ row }">
            <span class="plan-price">¥{{ row.price }}</span>
            <span class="plan-cycle">/{{ row.cycle === 'month' ? '月' : '年' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="配额" min-width="220">
          <template #default="{ row }">
            <div class="quota-line">入驻个人 {{ row.quotas.max_individuals ?? '∞' }} · 入驻企业 {{ row.quotas.max_enterprises ?? '∞' }} · 员工 {{ row.quotas.max_employees ?? '∞' }}</div>
            <div class="quota-line">场景 {{ row.quotas.max_scenes ?? '∞' }} · 集市上架 {{ row.quotas.max_market_items ?? '∞' }} · 存储 {{ row.quotas.max_storage_mb ?? '∞' }}MB</div>
          </template>
        </el-table-column>
        <el-table-column label="功能" width="180">
          <template #default="{ row }">
            <el-tag v-if="row.features.market_enabled" size="small" type="success">人脉集市</el-tag>
            <el-tag v-if="row.features.distribution_enabled" size="small" type="primary" style="margin-left:4px">二级分销</el-tag>
            <el-tag v-else size="small" type="info">无分销</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="$router.push(`/billing-plans/${row.id}/edit`)">编辑</el-button>
            <el-button v-if="row.code !== 'free'" link :type="row.enabled ? 'warning' : 'success'" @click="togglePlan(row)">
              {{ row.enabled ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!plans.length" description="暂无套餐" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { adminApi } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const plans = ref([]);

async function load() {
  try { plans.value = (await adminApi.get('/billing-plans')).plans || []; }
  catch (e) { ElMessage.error(typeof e === 'string' ? e : '加载套餐失败'); }
}
onMounted(load);

async function togglePlan(row) {
  try {
    await ElMessageBox.confirm(`确认${row.enabled ? '停用' : '启用'}套餐「${row.name}」？`, '提示', { type: 'warning' });
    await adminApi.put(`/billing-plans/${row.id}`, { enabled: !row.enabled });
    ElMessage.success('操作成功');
    load();
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(typeof e === 'string' ? e : '操作失败');
  }
}
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title { font-size: 18px; font-weight: 600; color: #1D2129; margin: 0; }
.page-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.plan-name { font-weight: 600; color: #1D2129; }
.plan-code { font-size: 12px; color: #86909C; margin-top: 2px; }
.plan-price { font-size: 18px; font-weight: 600; color: #165DFF; }
.plan-cycle { font-size: 12px; color: #86909C; margin-left: 2px; }
.quota-line { font-size: 13px; color: #4E5969; line-height: 22px; }
</style>
