<template>
  <div>
    <div class="page-header">
      <div>
        <h2 class="page-title">成员管理</h2>
        <p class="page-desc">创建租户后台账号；绑定企业的成员登录后进入「企业工作台」，仅管理本企业数据</p>
      </div>
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon>添加成员</el-button>
    </div>
    <div class="page-card">
      <el-table :data="members" stripe>
        <el-table-column prop="username" label="账号" />
        <el-table-column prop="role" label="角色" width="120">
          <template #default="{ row }">
            <el-tag :type="row.role === 'tenant_admin' ? 'danger' : 'info'" size="small" effect="light">
              {{ row.role === 'tenant_admin' ? '租户管理员' : '租户成员' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="绑定企业" width="200">
          <template #default="{ row }">
            <el-tag v-if="row.enterpriseId" type="success" size="small" effect="light">企业管理员</el-tag>
            <span v-else class="no-ent">-</span>
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
    <el-dialog v-model="showEdit" title="添加成员" width="500px" :close-on-click-modal="false">
      <el-form :model="form" label-width="90px">
        <el-form-item label="账号" required><el-input v-model="form.username" placeholder="登录账号" /></el-form-item>
        <el-form-item label="密码" required><el-input v-model="form.password" type="password" placeholder="至少 6 位" /></el-form-item>
        <el-form-item label="角色">
          <el-radio-group v-model="form.role">
            <el-radio label="tenant_admin">租户管理员</el-radio>
            <el-radio label="tenant_member">租户成员</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="绑定企业">
          <el-select v-model="form.enterpriseId" placeholder="不绑定（普通租户成员）" clearable style="width: 100%;">
            <el-option v-for="e in enterprises" :key="e.id" :label="`${e.name}（${e.employeeCount} 员工）`" :value="e.id" />
          </el-select>
          <p class="field-tip">绑定企业后，该成员登录仅见本企业数据，成为「企业管理员」</p>
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
const enterprises = ref([]);
const showEdit = ref(false);
const form = reactive({ username: '', password: '', role: 'tenant_member', phone: '', enterpriseId: null });

async function load() {
  try { members.value = (await customerApiCall.get('/members')).members || []; }
  catch (e) { ElMessage.error(e); }
}
async function loadEnterprises() {
  try { enterprises.value = (await customerApiCall.get('/enterprises')).enterprises || []; }
  catch (e) {}
}
function openCreate() {
  Object.assign(form, { username: '', password: '', role: 'tenant_member', phone: '', enterpriseId: null });
  showEdit.value = true;
}
async function save() {
  if (!form.username || !form.password) return ElMessage.warning('请填写账号和密码');
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
onMounted(() => { load(); loadEnterprises(); });
</script>

<style scoped>
.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909c; margin: 4px 0 0; }
.page-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.no-ent { color: #c0c4cc; }
.field-tip { font-size: 12px; color: #86909c; margin: 6px 0 0; }
</style>
