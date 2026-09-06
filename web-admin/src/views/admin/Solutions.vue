<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">解决方案</h2>
      <el-button type="primary" @click="showEdit = true"><el-icon><Plus /></el-icon>新建解决方案</el-button>
    </div>
    <div class="page-card">
      <div class="solution-grid">
        <div v-for="s in solutions" :key="s.id" class="solution-card" :class="{ disabled: !s.enabled }">
          <div class="solution-icon">{{ s.icon || '📦' }}</div>
          <div class="solution-name">{{ s.name }}</div>
          <div class="solution-desc">{{ s.description }}</div>
          <div class="solution-status">
            <el-tag :type="s.enabled ? 'success' : 'info'" size="small">{{ s.enabled ? '已启用' : '已禁用' }}</el-tag>
          </div>
          <div class="solution-actions">
            <el-button size="small" @click="edit(s)">编辑</el-button>
            <el-button size="small" :type="s.enabled ? 'warning' : 'success'" @click="toggle(s)">
              {{ s.enabled ? '禁用' : '启用' }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
    <el-dialog v-model="showEdit" :title="editing ? '编辑解决方案' : '新建解决方案'" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="标识" required><el-input v-model="form.code" placeholder="如：panorama" /></el-form-item>
        <el-form-item label="图标"><el-input v-model="form.icon" placeholder="emoji或图标名" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
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
import { fetchSolutions, createSolution, updateSolution } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const solutions = ref([]);
const showEdit = ref(false);
const editing = ref(null);
const form = reactive({ name: '', code: '', icon: '', description: '', sortOrder: 0, enabled: true });

async function load() {
  try { solutions.value = (await fetchSolutions()).solutions || []; } catch (e) { ElMessage.error(e); }
}
function edit(row) { editing.value = row; Object.assign(form, row); showEdit.value = true; }
async function save() {
  try {
    if (editing.value) await updateSolution(editing.value.id, form);
    else await createSolution(form);
    ElMessage.success('保存成功'); showEdit.value = false; load();
  } catch (e) { ElMessage.error(e); }
}
async function toggle(row) {
  const action = row.enabled ? '禁用' : '启用';
  try {
    await ElMessageBox.confirm(`确定${action}「${row.name}」？${row.enabled ? '禁用后新客户不可选择，已开通的客户不受影响。' : ''}`, '确认', { type: 'warning' });
    await updateSolution(row.id, { ...row, enabled: !row.enabled });
    ElMessage.success(`${action}成功`);
    load();
  } catch (e) {}
}
onMounted(load);
</script>

<style scoped>
.solution-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.solution-card { border: 1px solid #e4e7ed; border-radius: 8px; padding: 20px; text-align: center; transition: all 0.2s; }
.solution-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.solution-card.disabled { opacity: 0.5; background: #f5f7fa; }
.solution-icon { font-size: 40px; margin-bottom: 12px; }
.solution-name { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
.solution-desc { font-size: 13px; color: #909399; margin-bottom: 12px; min-height: 40px; }
.solution-status { margin-bottom: 12px; }
.solution-actions { display: flex; gap: 8px; justify-content: center; }
</style>
