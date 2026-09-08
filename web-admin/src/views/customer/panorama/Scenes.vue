<template>
  <div>
    <PanoramaTabs />
<AppPageHeader title="场景管理" :desc="planName">
<el-button type="primary" @click="$router.push(`/apps/panorama/plans/${planId}/scenes/new/edit`)">
        <el-icon><Plus /></el-icon>新建场景
      </el-button>
</AppPageHeader>
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
        <el-table-column label="操作" width="280">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="$router.push(`/apps/panorama/plans/${planId}/scenes/${row.id}/edit`)">编辑</el-button>
            <el-button size="small" @click="copy(row)">复制</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import AppPageHeader from '../../../components/AppPageHeader.vue';
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { customerApiCall } from '../../../api';
import PanoramaTabs from '../apps/panorama/PanoramaTabs.vue';
import { ElMessage, ElMessageBox } from 'element-plus';

const route = useRoute();
const planId = route.params.id;
const planName = ref('');
const scenes = ref([]);

async function load() {
  try {
    const [ps, sc] = await Promise.all([
      customerApiCall.get('/plans'),
      customerApiCall.get(`/plans/${planId}/scenes`),
    ]);
    const plan = (ps.plans || []).find((x) => String(x.id) === String(planId));
    planName.value = plan ? `方案：${plan.name}` : '';
    scenes.value = sc.scenes || [];
  } catch (e) { ElMessage.error(e); }
}
async function copy(row) {
  try {
    await ElMessageBox.confirm(`复制场景「${row.title}」？将保留热点与内容增强配置，复制到方案末尾。`, '确认复制', { type: 'info' });
    const { scene } = await customerApiCall.post(`/scenes/${row.id}/copy`);
    ElMessage.success(`已复制为「${scene.title}」`); load();
  } catch (e) { ElMessage.error(e); }
}
async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除场景「${row.title}」？`, '确认', { type: 'warning' });
    await customerApiCall.delete(`/scenes/${row.id}`); ElMessage.success('删除成功'); load();
  } catch (e) {}
}
onMounted(load);
</script>
