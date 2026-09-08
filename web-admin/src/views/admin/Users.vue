<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">用户管理</h2>
      <el-button type="primary" @click="showEdit = true"><el-icon><Plus /></el-icon>新建用户</el-button>
    </div>
    <div class="page-card">
      <el-table :data="users" stripe>
        <el-table-column prop="username" label="账号" min-width="140" />
        <el-table-column prop="role" label="角色" width="110">
          <template #default="{ row }">
            <el-tag :type="roleTagType(row.role)" size="small">
              {{ roleMap[row.role] || row.role }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="所属客户" min-width="180">
          <template #default="{ row }">
            <template v-if="row.customerId">
              <el-link type="primary" :underline="false" @click="goCustomer(row)">
                {{ row.customerName || `客户 #${row.customerId}` }}
              </el-link>
              <div style="margin-top:4px;display:flex;align-items:center;gap:6px;">
                <el-tag :type="customerStatusType(row)" size="small">
                  {{ customerStatusText(row) }}
                </el-tag>
                <span v-if="row.customerSelfRenew" class="renew-tag">自主续费开</span>
              </div>
            </template>
            <span v-else class="form-help">—</span>
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
      <el-form :model="form" label-width="90px">
        <el-form-item label="账号" required><el-input v-model="form.username" :disabled="!!editing" /></el-form-item>
        <el-form-item label="密码" v-if="!editing" required><el-input v-model="form.password" type="password" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width:100%;" @change="onRoleChange">
            <el-option label="超级管理员" value="admin" />
            <el-option label="运营人员" value="operator" />
            <el-option label="客户管理员" value="tenant_admin" />
            <el-option label="客户成员" value="tenant_member" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="isTenantRole(form.role)" label="关联客户项目" required>
          <el-select v-model="form.customerId" filterable placeholder="选择该用户所属的客户项目" style="width:100%;">
            <el-option v-for="c in customers" :key="c.id" :label="`${c.customerName}（${c.customerName}）`" :value="c.id" />
          </el-select>
          <div class="form-help">客户管理员/客户成员必须关联一个客户项目，登录后进入该客户的管理后台</div>
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
import { useRouter } from 'vue-router';
import { fetchUsers, createUser, updateUser, deleteUser, resetUserPassword, fetchCustomers } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const router = useRouter();
const roleMap = { admin: '超级管理员', operator: '运营人员', tenant_admin: '客户管理员', tenant_member: '客户成员' };
const users = ref([]);
const customers = ref([]);
const showEdit = ref(false);
const editing = ref(null);
const form = reactive({ username: '', password: '', role: 'operator', phone: '', customerId: null });

function isTenantRole(role) { return role === 'tenant_admin' || role === 'tenant_member'; }
function roleTagType(role) {
  return role === 'admin' ? 'danger' : role === 'operator' ? 'warning' : role === 'tenant_admin' ? 'primary' : 'info';
}
function customerStatusText(row) {
  if (!row.customerValidUntil) return '长期有效';
  return row.customerValidUntil < new Date().toISOString().slice(0, 10) ? '已到期' : `至 ${row.customerValidUntil}`;
}
function customerStatusType(row) {
  if (!row.customerValidUntil) return 'success';
  return row.customerValidUntil < new Date().toISOString().slice(0, 10) ? 'danger' : 'success';
}
function onRoleChange() {
  if (!isTenantRole(form.role)) form.customerId = null;
}
function goCustomer(row) {
  if (row.customerId) router.push(`/customers/${row.customerId}/edit`);
}

async function load() {
  try {
    users.value = (await fetchUsers()).users || [];
    const cRes = await fetchCustomers();
    customers.value = cRes.projects || [];
  } catch (e) { ElMessage.error(e); }
}
function editUser(row) {
  editing.value = row;
  Object.assign(form, {
    username: row.username, password: '', role: row.role, phone: row.phone,
    customerId: row.customerId || null,
  });
  showEdit.value = true;
}
async function save() {
  if (isTenantRole(form.role) && !form.customerId) { ElMessage.error('客户管理员/客户成员必须关联客户项目'); return; }
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

<style scoped>
.form-help { font-size:12px; color:#86909C; line-height:1.6; margin-top:4px; }
.renew-tag { font-size:12px; color:#00B42A; }
</style>
