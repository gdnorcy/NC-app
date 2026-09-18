<template>
  <div>
    <div class="page-header">
      <div>
        <h2 class="page-title">角色管理</h2>
        <p class="page-desc">内置角色（租户管理员 / 普通成员 / 门店管理员）不可删除；自定义角色可分配菜单权限点</p>
      </div>
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon>新建角色</el-button>
    </div>

    <div class="page-card">
      <el-table :data="roles" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="角色名称" min-width="160">
          <template #default="{ row }">
            {{ row.name }}
            <el-tag v-if="row.builtin" type="warning" size="small" effect="light" class="tag-gap">内置</el-tag>
            <el-tag v-else type="info" size="small" effect="light" class="tag-gap">自定义</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="范围" width="100">
          <template #default="{ row }">
            <el-tag :type="row.scope === 'store' ? 'success' : 'primary'" size="small" effect="plain">{{ row.scope === 'store' ? '门店' : '租户' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="member_count" label="成员数" width="90" />
        <el-table-column prop="perm_count" label="权限数" width="90" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="primary" plain @click="openPerms(row)">分配权限</el-button>
            <el-button size="small" type="danger" :disabled="row.builtin === 1" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新建/编辑角色 -->
    <el-dialog v-model="showEdit" :title="editId ? '编辑角色' : '新建角色'" width="440px" :close-on-click-modal="false">
      <el-form :model="form" label-width="90px">
        <el-form-item label="角色名称" required><el-input v-model="form.name" placeholder="如：商品运营 / 客服专员" /></el-form-item>
        <el-form-item label="范围">
          <el-radio-group v-model="form.scope" :disabled="editId && editRoleBuiltin === 1">
            <el-radio value="tenant">租户级</el-radio>
            <el-radio value="store">门店级</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="saveRole">保存</el-button>
      </template>
    </el-dialog>

    <!-- 分配权限 -->
    <el-dialog v-model="showPerms" title="分配权限" width="560px" :close-on-click-modal="false">
      <p class="dialog-tip">为角色「{{ current.name }}」勾选菜单权限（按应用分组，多选）</p>
      <div class="perm-tree" v-loading="permLoading">
        <div v-for="app in permTree" :key="app.code" class="perm-app">
          <el-checkbox
            :model-value="appChecked(app)"
            :indeterminate="appIndeterminate(app)"
            @change="(v) => toggleApp(app, v)"
          >{{ app.name }}</el-checkbox>
          <div class="perm-menus">
            <el-checkbox
              v-for="m in app.menus" :key="m.key"
              :model-value="permSet.has(`${app.code}:${m.key}`)"
              @change="(v) => togglePerm(app, m, v)"
            >{{ m.label }}</el-checkbox>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showPerms = false">取消</el-button>
        <el-button type="primary" @click="savePerms">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { customerApiCall } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const roles = ref([]);
const showEdit = ref(false);
const showPerms = ref(false);
const editId = ref(null);
const editRoleBuiltin = ref(0);
const current = ref({});
const form = reactive({ name: '', scope: 'tenant' });
const permTree = ref([]);
const permSet = ref(new Set());
const permLoading = ref(false);

async function load() {
  try {
    const res = await customerApiCall.get('/roles');
    roles.value = res.roles || [];
  } catch (e) { ElMessage.error(e); }
}

function openCreate() {
  editId.value = null; editRoleBuiltin.value = 0;
  Object.assign(form, { name: '', scope: 'tenant' });
  showEdit.value = true;
}
function openEdit(row) {
  editId.value = row.id; editRoleBuiltin.value = row.builtin;
  Object.assign(form, { name: row.name, scope: row.scope });
  showEdit.value = true;
}
async function saveRole() {
  if (!form.name.trim()) return ElMessage.warning('请输入角色名称');
  try {
    if (editId.value) await customerApiCall.put(`/roles/${editId.value}`, { name: form.name, scope: form.scope });
    else await customerApiCall.post('/roles', { name: form.name, scope: form.scope });
    ElMessage.success('保存成功'); showEdit.value = false; load();
  } catch (e) { ElMessage.error(e); }
}
async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除角色「${row.name}」？将同时解除该角色与成员的关联。`, '确认删除', { type: 'warning' });
    await customerApiCall.delete(`/roles/${row.id}`);
    ElMessage.success('删除成功'); load();
  } catch (e) {}
}

async function openPerms(row) {
  current.value = row;
  showPerms.value = true;
  permLoading.value = true;
  try {
    const [treeRes, rolesRes] = await Promise.all([
      customerApiCall.get('/roles/permission-tree'),
      customerApiCall.get('/roles'),
    ]);
    permTree.value = treeRes.tree || [];
    const target = (rolesRes.roles || []).find((r) => r.id === row.id);
    permSet.value = new Set((target?.perms || []).map((p) => `${p.app_code}:${p.menu_key}`));
  } catch (e) { ElMessage.error(e); }
  permLoading.value = false;
}
function appChecked(app) {
  return app.menus.length > 0 && app.menus.every((m) => permSet.value.has(`${app.code}:${m.key}`));
}
function appIndeterminate(app) {
  const n = app.menus.filter((m) => permSet.value.has(`${app.code}:${m.key}`)).length;
  return n > 0 && n < app.menus.length;
}
function toggleApp(app, val) {
  const next = new Set(permSet.value);
  for (const m of app.menus) {
    if (val) next.add(`${app.code}:${m.key}`);
    else next.delete(`${app.code}:${m.key}`);
  }
  permSet.value = next;
}
function togglePerm(app, m, val) {
  const next = new Set(permSet.value);
  const k = `${app.code}:${m.key}`;
  if (val) next.add(k); else next.delete(k);
  permSet.value = next;
}
async function savePerms() {
  // menu_key 本身含冒号（如 card:overview），必须按第一个冒号切分，禁止 k.split(':') 解构（会截断 key）
  const perms = Array.from(permSet.value).map((k) => {
    const idx = k.indexOf(':');
    return { app: k.slice(0, idx), key: k.slice(idx + 1) };
  });
  try {
    await customerApiCall.put(`/roles/${current.value.id}/permissions`, { perms });
    ElMessage.success('权限已保存'); showPerms.value = false; load();
  } catch (e) { ElMessage.error(e); }
}

onMounted(load);
</script>

<style scoped>
.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909c; margin: 4px 0 0; }
.page-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.tag-gap { margin-left: 4px; }
.dialog-tip { font-size: 13px; color: #86909c; margin: 0 0 12px; }
.perm-tree { max-height: 420px; overflow: auto; border: 1px solid #e5e6eb; border-radius: 8px; padding: 12px 16px; }
.perm-app { margin-bottom: 14px; }
.perm-app:last-child { margin-bottom: 0; }
.perm-app > .el-checkbox { font-weight: 600; color: #1d2129; }
.perm-menus { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 8px 0 0 28px; }
</style>
