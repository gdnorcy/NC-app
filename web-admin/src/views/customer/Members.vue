<template>
  <div>
    <div v-if="!embedded" class="page-header">
      <div>
        <h2 class="page-title">成员管理</h2>
        <p class="page-desc">统一账号体系：账号（登录凭据）与成员（业务身份）分离，一人可持多角色；门店负责人也是成员</p>
      </div>
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon>添加成员</el-button>
    </div>

    <div class="page-card">
      <div class="toolbar">
        <div class="toolbar-filters">
          <el-input v-model="keyword" placeholder="搜索姓名 / 账号 / 手机号" clearable style="width: 240px" @input="applyFilter" />
          <el-select v-model="filterRole" placeholder="全部角色" clearable style="width: 180px" @change="applyFilter">
            <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-select v-model="filterStore" placeholder="全部成员" clearable style="width: 160px" @change="applyFilter">
            <el-option label="门店负责人" value="store" />
            <el-option label="非门店负责人" value="none" />
          </el-select>
        </div>
        <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon>添加成员</el-button>
      </div>

      <el-table :data="filtered" stripe>
        <el-table-column label="成员" min-width="200">
          <template #default="{ row }">
            <div class="member-cell">
              <el-avatar :size="32" :src="row.avatar || undefined">{{ (row.name || row.username || '?').slice(0, 1) }}</el-avatar>
              <div>
                <div class="member-name">{{ row.name || row.username }}
                  <el-tag v-if="row.isTenantAdmin" type="danger" size="small" effect="light" class="tag-gap">管理员</el-tag>
                  <el-tag v-if="row.need_reset" type="warning" size="small" effect="light" class="tag-gap">待重置密码</el-tag>
                </div>
                <div class="member-sub">{{ row.username }}<template v-if="row.phone"> · {{ row.phone }}</template></div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色" min-width="180">
          <template #default="{ row }">
            <el-tag v-for="r in row.roles" :key="r.id" :type="tagType(r)" size="small" effect="light" class="tag-gap">{{ r.name }}</el-tag>
            <span v-if="!row.roles || !row.roles.length" class="no-tag">未分配</span>
          </template>
        </el-table-column>
        <el-table-column label="身份" min-width="160">
          <template #default="{ row }">
            <el-tag v-for="(label, i) in identityLabels(row.identities)" :key="i" type="info" size="small" effect="plain" class="tag-gap">{{ label }}</el-tag>
            <span v-if="!identityLabels(row.identities).length" class="no-tag">-</span>
          </template>
        </el-table-column>
        <el-table-column label="门店" width="140">
          <template #default="{ row }">
            <el-tag v-if="row.store_name" type="success" size="small" effect="light">负责人 · {{ row.store_name }}</el-tag>
            <span v-else class="no-tag">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small" effect="light">
              {{ row.status === 'active' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" @click="openRoles(row)">角色</el-button>
            <el-button size="small" @click="openResetPwd(row)">重置密码</el-button>
            <el-button size="small" :type="row.status === 'active' ? 'warning' : 'success'" @click="toggleStatus(row)">
              {{ row.status === 'active' ? '停用' : '启用' }}
            </el-button>
            <el-button size="small" type="danger" :disabled="row.isTenantAdmin && tenantAdminCount <= 1" @click="remove(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 添加/编辑成员 -->
    <el-dialog v-model="showEdit" :title="editId ? '编辑成员' : '添加成员'" width="560px" :close-on-click-modal="false">
      <el-form :model="form" label-width="90px">
        <el-form-item label="姓名" required><el-input v-model="form.name" placeholder="成员姓名" /></el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.phone" placeholder="手机号（可作登录账号）" />
        </el-form-item>
        <template v-if="!editId">
          <el-form-item label="登录账号">
            <el-input v-model="form.username" placeholder="不填则用手机号" />
          </el-form-item>
          <el-form-item label="密码" required>
            <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
          </el-form-item>
        </template>
        <el-form-item label="身份">
          <el-checkbox-group v-model="form.identities">
            <el-checkbox value="backend_admin">后台管理员</el-checkbox>
            <el-checkbox value="mini_admin">小程序管理员</el-checkbox>
            <el-checkbox value="promoter">推广员</el-checkbox>
            <el-checkbox value="notify">消息推送</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.roleIds" multiple placeholder="选择角色（可多选）" style="width: 100%">
            <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="saveMember">保存</el-button>
      </template>
    </el-dialog>

    <!-- 分配角色 -->
    <el-dialog v-model="showRoles" title="分配角色" width="480px" :close-on-click-modal="false">
      <p class="dialog-tip">为成员「{{ current.name }}」分配角色（可多选，权限按角色叠加）</p>
      <el-select v-model="roleForm.roleIds" multiple placeholder="选择角色" style="width: 100%">
        <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
      </el-select>
      <template #footer>
        <el-button @click="showRoles = false">取消</el-button>
        <el-button type="primary" @click="saveRoles">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="showPwd" title="重置密码" width="440px" :close-on-click-modal="false">
      <el-form :model="pwdForm" label-width="90px">
        <el-form-item label="新密码" required>
          <el-input v-model="pwdForm.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPwd = false">取消</el-button>
        <el-button type="primary" @click="savePwd">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { customerApiCall } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

// 合并页嵌入模式：隐藏自身页头（标题/描述/右上按钮），由「成员与权限」页统一承载
defineProps({ embedded: { type: Boolean, default: false } });

const IDENTITY_MAP = { backend_admin: '后台管理员', mini_admin: '小程序管理员', promoter: '推广员', notify: '消息推送' };

const members = ref([]);
const roles = ref([]);
const keyword = ref('');
const filterRole = ref(null);
const filterStore = ref(null);
const showEdit = ref(false);
const showRoles = ref(false);
const showPwd = ref(false);
const editId = ref(null);
const current = ref({});
const form = reactive({ name: '', phone: '', username: '', password: '', identities: ['backend_admin'], roleIds: [] });
const roleForm = reactive({ roleIds: [] });
const pwdForm = reactive({ password: '' });

const tenantAdminCount = computed(() => members.value.filter((m) => m.isTenantAdmin).length);
const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return members.value.filter((m) => {
    if (kw && !((m.name || '').toLowerCase().includes(kw) || (m.username || '').toLowerCase().includes(kw) || (m.phone || '').includes(kw))) return false;
    if (filterRole.value && !(m.roles || []).some((r) => r.id === filterRole.value)) return false;
    if (filterStore.value === 'store' && !m.store_name) return false;
    if (filterStore.value === 'none' && m.store_name) return false;
    return true;
  });
});

function tagType(r) {
  if (r.code === 'tenant_admin') return 'danger';
  if (r.code === 'store_admin') return 'success';
  if (r.code === 'tenant_member') return 'info';
  return 'primary';
}
function identityLabels(ids) {
  try {
    const arr = Array.isArray(ids) ? ids : JSON.parse(ids || '[]');
    return arr.map((i) => IDENTITY_MAP[i] || i).filter(Boolean);
  } catch { return []; }
}
function applyFilter() {}

async function load() {
  try {
    const res = await customerApiCall.get('/members');
    members.value = res.members || [];
  } catch (e) { ElMessage.error(e); }
}
async function loadRoles() {
  try {
    const res = await customerApiCall.get('/roles');
    roles.value = res.roles || [];
  } catch (e) { ElMessage.error(e); }
}

function openCreate() {
  editId.value = null;
  Object.assign(form, { name: '', phone: '', username: '', password: '', identities: ['backend_admin'], roleIds: [] });
  showEdit.value = true;
}
function openEdit(row) {
  editId.value = row.id;
  Object.assign(form, {
    name: row.name || '',
    phone: row.phone || '',
    username: row.username || '',
    password: '',
    identities: (() => { try { return Array.isArray(row.identities) ? row.identities : JSON.parse(row.identities || '[]'); } catch { return []; } })(),
    roleIds: (row.roles || []).map((r) => r.id),
  });
  showEdit.value = true;
}
async function saveMember() {
  if (!form.name.trim()) return ElMessage.warning('请输入成员姓名');
  if (!editId.value && !form.password) return ElMessage.warning('新成员需设置密码');
  try {
    if (editId.value) {
      await customerApiCall.put(`/members/${editId.value}`, { name: form.name, phone: form.phone, identities: form.identities });
      if (form.roleIds.length) await customerApiCall.put(`/members/${editId.value}/roles`, { roleIds: form.roleIds });
    } else {
      await customerApiCall.post('/members', {
        name: form.name, phone: form.phone, username: form.username, password: form.password,
        identities: form.identities, roleIds: form.roleIds,
      });
    }
    ElMessage.success('保存成功'); showEdit.value = false; load();
  } catch (e) { ElMessage.error(e); }
}
function openRoles(row) {
  current.value = row;
  roleForm.roleIds = (row.roles || []).map((r) => r.id);
  showRoles.value = true;
}
async function saveRoles() {
  // 最后管理员保护（后端同样兜底）：唯一租户管理员不能移除自身 tenant_admin 角色
  const adminRole = roles.value.find((r) => r.code === 'tenant_admin');
  if (current.value.isTenantAdmin && tenantAdminCount.value <= 1 && adminRole && !roleForm.roleIds.includes(adminRole.id)) {
    return ElMessage.warning('至少保留一名租户管理员');
  }
  try {
    await customerApiCall.put(`/members/${current.value.id}/roles`, { roleIds: roleForm.roleIds });
    ElMessage.success('角色已更新'); showRoles.value = false; load();
  } catch (e) { ElMessage.error(e); }
}
function openResetPwd(row) {
  current.value = row;
  pwdForm.password = '';
  showPwd.value = true;
}
async function savePwd() {
  if (!pwdForm.password || pwdForm.password.length < 6) return ElMessage.warning('密码至少 6 位');
  try {
    await customerApiCall.put(`/members/${current.value.id}/reset-password`, { password: pwdForm.password });
    ElMessage.success('密码已重置'); showPwd.value = false;
  } catch (e) { ElMessage.error(e); }
}
async function toggleStatus(row) {
  const next = row.status === 'active' ? 'disabled' : 'active';
  try {
    await customerApiCall.put(`/members/${row.id}`, { status: next });
    ElMessage.success(next === 'active' ? '已启用' : '已停用'); load();
  } catch (e) { ElMessage.error(e); }
}
async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定移除成员「${row.name || row.username}」？移除后该成员将无法登录本租户后台（账号保留）。`, '确认移除', { type: 'warning' });
    await customerApiCall.delete(`/members/${row.id}`);
    ElMessage.success('移除成功'); load();
  } catch (e) {}
}

onMounted(() => { load(); loadRoles(); });
</script>

<style scoped>
.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909c; margin: 4px 0 0; }
.page-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.toolbar { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 16px; align-items: center; }
.toolbar-filters { display: flex; gap: 12px; flex-wrap: wrap; }
.member-cell { display: flex; align-items: center; gap: 10px; }
.member-name { font-size: 14px; color: #1d2129; font-weight: 500; display: flex; align-items: center; }
.member-sub { font-size: 12px; color: #86909c; margin-top: 2px; }
.tag-gap { margin-right: 4px; }
.no-tag { color: #c0c4cc; font-size: 12px; }
.dialog-tip { font-size: 13px; color: #86909c; margin: 0 0 12px; }
</style>
