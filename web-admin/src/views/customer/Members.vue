<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">成员管理</h2>
      <el-button type="primary" @click="showEdit = true"><el-icon><Plus /></el-icon>添加成员</el-button>
    </div>
    <div class="page-card">
      <el-table :data="members" stripe>
        <el-table-column prop="username" label="账号" />
        <el-table-column prop="role" label="角色" width="120">
          <template #default="{ row }">
            <el-tag :type="row.role === 'tenant_admin' ? 'danger' : 'info'" size="small">
              {{ row.role === 'tenant_admin' ? '管理员' : '成员' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column prop="createdAt" label="加入时间" width="180" />
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="remove(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-dialog v-model="showEdit" title="添加成员" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="账号" required><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="密码" required><el-input v-model="form.password" type="password" /></el-form-item>
        <el-form-item label="角色">
          <el-radio-group v-model="form.role">
            <el-radio label="tenant_admin">管理员</el-radio>
            <el-radio label="tenant_member">普通成员</el-radio>
          </el-radio-group>
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
import { customerApiCall } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const members = ref([]);
const showEdit = ref(false);
const form = reactive({ username: '', password: '', role: 'tenant_member', phone: '' });

async function load() {
  try { members.value = (await customerApiCall.get('/members')).members || []; }
  catch (e) { ElMessage.error(e); }
}
async function save() {
  try {
    await customerApiCall.post('/members', form);
    ElMessage.success('添加成功'); showEdit.value = false; load();
  } catch (e) { ElMessage.error(e); }
}
async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定移除成员「${row.username}」？`, '确认', { type: 'warning' });
    await customerApiCall.delete(`/members/${row.id}`);
    ElMessage.success('移除成功'); load();
  } catch (e) {}
}
onMounted(load);
</script>
