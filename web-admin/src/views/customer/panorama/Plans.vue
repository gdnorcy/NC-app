<template>
  <div>
    <PanoramaTabs />
    <div class="page-header">
      <div>
        <h2 class="page-title">方案管理</h2>
        <p class="page-desc">为每个客户项目创建全景方案，方案下可添加多个场景</p>
      </div>
      <el-button type="primary" @click="showEdit = true"><el-icon><Plus /></el-icon>新建方案</el-button>
    </div>
    <div class="page-card">
      <el-table :data="plans" stripe>
        <el-table-column prop="name" label="方案名称" />
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column prop="sceneCount" label="场景数" width="100" />
        <el-table-column label="操作" width="240">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="$router.push(`/apps/panorama/plans/${row.id}/scenes`)">管理场景</el-button>
            <el-button size="small" @click="edit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-dialog v-model="showEdit" :title="editing ? '编辑方案' : '新建方案'" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { customerApiCall } from '../../../api';
import { ElMessage, ElMessageBox } from 'element-plus';
import PanoramaTabs from '../apps/panorama/PanoramaTabs.vue';

const plans = ref([]);
const showEdit = ref(false);
const editing = ref(null);
const form = reactive({ name: '', description: '' });

async function load() {
  try { plans.value = (await customerApiCall.get('/plans')).plans || []; } catch (e) { ElMessage.error(e); }
}
function edit(row) { editing.value = row; Object.assign(form, row); showEdit.value = true; }
async function save() {
  try {
    if (editing.value) await customerApiCall.put(`/plans/${editing.value.id}`, form);
    else await customerApiCall.post('/plans', form);
    ElMessage.success('保存成功'); showEdit.value = false; load();
  } catch (e) { ElMessage.error(e); }
}
async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除方案「${row.name}」？`, '确认', { type: 'warning' });
    await customerApiCall.delete(`/plans/${row.id}`); ElMessage.success('删除成功'); load();
  } catch (e) {}
}
onMounted(load);
</script>
