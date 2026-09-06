<template>
  <div>
    <div class="page-header">
      <div>
        <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon>返回</el-button>
        <h2 class="page-title" style="display:inline;margin-left:8px;">方案管理</h2>
      </div>
      <el-button type="primary" @click="showEdit = true"><el-icon><Plus /></el-icon>新建方案</el-button>
    </div>
    <div class="page-card">
      <el-table :data="plans" stripe>
        <el-table-column prop="name" label="方案名称" />
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column prop="sceneCount" label="场景数" width="100" />
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="240">
          <template #default="{ row }">
            <el-button size="small" @click="$router.push(`/customers/${customerId}/plans/${row.id}/scenes`)">管理场景</el-button>
            <el-button size="small" @click="editPlan(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="removePlan(row)">删除</el-button>
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
        <el-button type="primary" @click="savePlan">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { fetchPlans, createPlan, updatePlan, deletePlan } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const route = useRoute();
const customerId = route.params.id;
const plans = ref([]);
const showEdit = ref(false);
const editing = ref(null);
const form = reactive({ name: '', description: '' });

async function load() {
  try {
    const res = await fetchPlans();
    plans.value = (res.plans || []).filter(p => p.projectId === Number(customerId));
  } catch (e) { ElMessage.error(e); }
}
function editPlan(row) { editing.value = row; Object.assign(form, row); showEdit.value = true; }
async function savePlan() {
  try {
    if (editing.value) await updatePlan(editing.value.id, { ...form, projectId: Number(customerId) });
    else await createPlan({ ...form, projectId: Number(customerId) });
    ElMessage.success('保存成功'); showEdit.value = false; load();
  } catch (e) { ElMessage.error(e); }
}
async function removePlan(row) {
  try {
    await ElMessageBox.confirm(`确定删除方案「${row.name}」？`, '确认', { type: 'warning' });
    await deletePlan(row.id); ElMessage.success('删除成功'); load();
  } catch (e) {}
}
onMounted(load);
</script>
