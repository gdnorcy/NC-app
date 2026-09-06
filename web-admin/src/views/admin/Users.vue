<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">用户管理</h2>
      <el-button type="primary" @click="showEdit = true"><el-icon><Plus /></el-icon>新建用户</el-button>
    </div>
    <div class="page-card">
      <el-table :data="users" stripe>
        <el-table-column prop="username" label="账号" />
        <el-table-column prop="role" label="角色" width="120">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'danger' : row.role === 'operator' ? 'warning' : 'info'" size="small">
              {{ roleMap[row.role] || row.role }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="240">
          <template #default="{ row }">
            <el-button size="small" @click="editUser(row)">编辑</el-button>
            <el-button size="small" @click="resetPwd(row)">重置密码</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-dialog v-model="showEdit" :title="editing ? '编辑用户' : '新建用户'" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="账号" required><el-input v-model="form.username" :disabled="!!editing" /></el-form-item>
        <el-form-item label="密码" v-if="!editing" required><el-input v-model="form.password" type="password" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width:100%;">
            <el-option label="超级管理员" value="admin" />
            <el-option label="运营人员" value="operator" />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号"><el-input v-model="form.phone" /></el-form-item>
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
import { fetchUsers, createUser, updateUser, deleteUser, resetUserPassword } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const roleMap = { admin: '超级管理员', operator: '运营人员', tenant_admin: '客户管理员', tenant_member: '客户成员' };
const users = ref([]);
const showEdit = ref(false);
const editing = ref(null);
const form = reactive({ username: '', password: '', role: 'operator', phone: '' });

async function load() {
  try { users.value = (await fetchUsers()).users || []; } catch (e) { ElMessage.error(e); }
}
function editUser(row) { editing.value = row; Object.assign(form, row); showEdit.value = true; }
async function save() {
  try {
    if (editing.value) await updateUser(editing.value.id, form);
    else await createUser(form);
    ElMessage.success('保存成功'); showEdit.value = false; load();
  } catch (e) { ElMessage.error(e); }
}
async function resetPwd(row) {
  try {
    await ElMessageBox.confirm(`确定重置「${row.username}」的密码？`, '确认', { type: 'warning' });
    const res = await resetUserPassword(row.id);
    ElMessage.success(`新密码：${res.password}`);
  } catch (e) {}
}
async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除用户「${row.username}」？`, '确认', { type: 'warning' });
    await deleteUser(row.id); ElMessage.success('删除成功'); load();
  } catch (e) {}
}
onMounted(load);
</script>
