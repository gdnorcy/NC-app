<template>
  <div>
    <PanoramaTabs />
    <AppPageHeader title="线索管理" desc="访客通过热点留资表单提交的线索，可筛选方案并导出 CSV">
      <template #default>
        <el-select v-model="planId" placeholder="全部方案" clearable style="width:180px;" @change="load">
          <el-option v-for="p in plans" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-button @click="exportCsv">导出 CSV</el-button>
      </template>
    </AppPageHeader>
    <div class="page-card">
      <el-table :data="leads" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="plan_name" label="方案" width="140" show-overflow-tooltip />
        <el-table-column prop="scene_name" label="场景" width="140" show-overflow-tooltip />
        <el-table-column prop="hotspot_title" label="热点" width="140" show-overflow-tooltip />
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column prop="message" label="留言" show-overflow-tooltip />
        <el-table-column label="自定义字段" width="140">
          <template #default="{ row }">
            <span v-if="extraList(row).length">{{ extraList(row).map(([k, v]) => `${k}:${v}`).join('; ') }}</span>
            <span v-else style="color:#86909C;">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="提交时间" width="170" />
      </el-table>
      <div class="empty" v-if="!leads.length" style="padding:40px 0;text-align:center;color:#86909C;">暂无留资线索。请在场景编辑中为信息点开启「留资表单」后，访客提交即可在这里查看。</div>
    </div>
  </div>
</template>

<script setup>
import AppPageHeader from '../../../components/AppPageHeader.vue';
import { ref, onMounted } from 'vue';
import { customerApiCall } from '../../../api';
import { ElMessage } from 'element-plus';
import PanoramaTabs from '../apps/panorama/PanoramaTabs.vue';

const plans = ref([]);
const planId = ref('');
const leads = ref([]);

const extraList = (row) => {
  try { return Object.entries(JSON.parse(row.extra || '{}')); } catch { return []; }
};

async function load() {
  try {
    const q = planId.value ? `?planId=${planId.value}` : '';
    const [ps, ls] = await Promise.all([
      customerApiCall.get('/plans'),
      customerApiCall.get(`/panorama/leads${q}`),
    ]);
    plans.value = ps.plans || [];
    leads.value = ls.leads || [];
  } catch (e) { ElMessage.error(e); }
}

function exportCsv() {
  window.open(`/api/customer/panorama/leads?export=csv${planId.value ? `&planId=${planId.value}` : ''}`, '_blank');
}

onMounted(load);
</script>
