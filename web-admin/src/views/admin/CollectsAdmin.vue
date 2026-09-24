<template>
  <div>
    <div class="sec-title"><span>名片收藏管理</span></div>
    <el-table :data="collects" size="small" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column label="被收藏名片" min-width="180">
        <template #default="{ row }">{{ row.card_name || `名片#${row.card_id}` }}</template>
      </el-table-column>
      <el-table-column label="收藏者" min-width="160">
        <template #default="{ row }">{{ row.collector_name || `用户#${row.user_id}` }}</template>
      </el-table-column>
      <el-table-column prop="created_at" label="收藏时间" min-width="170" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="danger" @click="removeCollect(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pager">
      <el-pagination
        layout="prev, pager, next, total"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="load"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchAdminCollects, deleteAdminCollect } from '../../api';

const collects = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;

const load = async (p = 1) => {
  page.value = p;
  const r = await fetchAdminCollects({ page: p, pageSize: pageSize.value });
  collects.value = r.collects;
  total.value = r.total;
};
onMounted(() => load(1));

const removeCollect = async (row) => {
  try {
    await ElMessageBox.confirm('确认删除该收藏记录？', '删除确认', { type: 'warning' });
    await deleteAdminCollect(row.id);
    ElMessage.success('已删除');
    await load(page.value);
  } catch {}
};
</script>

<style scoped>
.sec-title { display: flex; justify-content: space-between; align-items: center; margin: 12px 0; font-weight: 600; font-size: 15px; }
.pager { margin-top: 12px; display: flex; justify-content: flex-end; }
</style>
