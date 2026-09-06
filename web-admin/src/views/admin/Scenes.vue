<template>
  <div>
    <div class="page-header">
      <div>
        <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon>返回</el-button>
        <h2 class="page-title" style="display:inline;margin-left:8px;">场景管理</h2>
      </div>
      <el-button type="primary" @click="$router.push(`/customers/${customerId}/plans/${planId}/scenes/new/edit`)">
        <el-icon><Plus /></el-icon>新建场景
      </el-button>
    </div>
    <div class="page-card">
      <el-table :data="scenes" stripe>
        <el-table-column prop="title" label="场景名称" />
        <el-table-column label="预览" width="100">
          <template #default="{ row }">
            <el-image v-if="row.previewPath || row.imagePath" :src="row.previewPath || row.imagePath" style="width:60px;height:40px;border-radius:4px;" fit="cover" />
            <span v-else style="color:#c0c4cc;">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="sortOrder" label="排序" width="80" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.published ? 'success' : 'info'" size="small">{{ row.published ? '已上架' : '未上架' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button size="small" @click="$router.push(`/customers/${customerId}/plans/${planId}/scenes/${row.id}/edit`)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { fetchScenes, deleteScene } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const route = useRoute();
const customerId = route.params.id;
const planId = route.params.planId;
const scenes = ref([]);

async function load() {
  try {
    const res = await fetchScenes();
    scenes.value = (res.scenes || []).filter(s => s.planId === Number(planId));
  } catch (e) { ElMessage.error(e); }
}
async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除场景「${row.title}」？`, '确认', { type: 'warning' });
    await deleteScene(row.id); ElMessage.success('删除成功'); load();
  } catch (e) {}
}
onMounted(load);
</script>
