<template>
  <div>
    <AppPageHeader title="门店标签" desc="1:1 nshop 门店标签：标签组 + 组内标签（名称/排序/分配门店/启用）">
      <template #default><el-button type="primary" @click="openGroupAdd">+ 添加标签组</el-button></template>
    </AppPageHeader>

    <el-card v-loading="loading">
      <el-collapse v-if="list.length">
        <el-collapse-item v-for="g in list" :key="g.id" :name="g.id">
          <template #title>
            <span class="group-name">{{ g.name }}</span>
            <el-tag size="small" :type="g.status ? 'success' : 'info'" style="margin-left:8px">{{ g.status ? '启用' : '禁用' }}</el-tag>
            <span class="group-count">{{ g.tags.length }} 个标签</span>
          </template>
          <div class="tag-actions">
            <el-button size="small" type="primary" plain @click="openTagAdd(g)">+ 添加标签</el-button>
            <el-button size="small" @click="openGroupEdit(g)">编辑组</el-button>
            <el-button size="small" type="danger" plain @click="removeGroup(g)">删除组</el-button>
          </div>
          <el-table :data="g.tags" size="small" class="tag-table">
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="name" label="标签名称" min-width="160" />
            <el-table-column prop="sort_order" label="排序" width="80" />
            <el-table-column label="应用门店" width="100">
              <template #default="{ row }">{{ row.storeCount }} 家</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }"><el-tag size="small" :type="row.status ? 'success' : 'info'">{{ row.status ? '启用' : '禁用' }}</el-tag></template>
            </el-table-column>
            <el-table-column label="操作" width="140">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openTagEdit(g, row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="removeTag(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-collapse-item>
      </el-collapse>
      <el-empty v-else description="暂无标签组，点击右上角「添加标签组」" :image-size="80" />
    </el-card>

    <!-- 标签组弹窗 -->
    <el-dialog v-model="groupDlg.show" :title="groupDlg.id ? '编辑标签组' : '添加标签组'" width="440px" destroy-on-close>
      <el-form :model="groupForm" label-width="90px">
        <el-form-item label="组名称" required>
          <el-input v-model="groupForm.name" maxlength="20" show-word-limit placeholder="请输入标签组名称" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="groupForm.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupDlg.show = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveGroup">保存</el-button>
      </template>
    </el-dialog>

    <!-- 标签弹窗（含分配门店） -->
    <el-dialog v-model="tagDlg.show" :title="tagDlg.id ? '编辑标签' : '添加标签'" width="520px" destroy-on-close>
      <el-form :model="tagForm" label-width="90px">
        <el-form-item label="标签组" required>
          <el-select v-model="tagForm.groupId" placeholder="请选择标签组" style="width:100%" :disabled="!!tagDlg.id">
            <el-option v-for="g in list" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签名称" required>
          <el-input v-model="tagForm.name" maxlength="4" show-word-limit placeholder="标签名称（0/4）" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="tagForm.sortOrder" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="分配门店">
          <el-select v-model="tagForm.storeIds" multiple placeholder="选择分配的门店" clearable style="width:100%">
            <el-option v-for="s in allStores" :key="s.id" :label="`${s.name}（${s.province}${s.city}）`" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="是否启用">
          <el-switch v-model="tagForm.status" :active-value="1" :inactive-value="0" active-text="是" inactive-text="否" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tagDlg.show = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveTag">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const list = ref([]);
const allStores = ref([]);
const loading = ref(false);
const saving = ref(false);
const groupDlg = ref({ show: false, id: null });
const groupForm = ref({ name: '', status: 1 });
const tagDlg = ref({ show: false, id: null });
const tagForm = ref({ groupId: null, name: '', sortOrder: 0, storeIds: [], status: 1 });

async function load() {
  loading.value = true;
  try {
    const [t, s] = await Promise.all([
      customerApiCall.get('/store/tag-groups'),
      customerApiCall.get('/store/all'),
    ]);
    list.value = t.list || [];
    allStores.value = s.stores || [];
  } catch (e) {
    ElMessage.error(e || '加载失败');
  } finally {
    loading.value = false;
  }
}

function openGroupAdd() { groupForm.value = { name: '', status: 1 }; groupDlg.value = { show: true, id: null }; }
function openGroupEdit(g) { groupForm.value = { name: g.name, status: g.status }; groupDlg.value = { show: true, id: g.id }; }
async function saveGroup() {
  if (!groupForm.value.name) return ElMessage.warning('请输入组名称');
  saving.value = true;
  try {
    if (groupDlg.value.id) await customerApiCall.put(`/store/tag-groups/${groupDlg.value.id}`, { name: groupForm.value.name, status: groupForm.value.status });
    else await customerApiCall.post('/store/tag-groups', { name: groupForm.value.name, status: groupForm.value.status });
    ElMessage.success('保存成功');
    groupDlg.value.show = false;
    load();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saving.value = false;
  }
}
async function removeGroup(g) {
  try {
    await ElMessageBox.confirm(`确认删除标签组「${g.name}」？组内标签将一并删除`, '删除确认', { type: 'warning' });
    await customerApiCall.delete(`/store/tag-groups/${g.id}`);
    ElMessage.success('已删除');
    load();
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e || '删除失败');
  }
}

function openTagAdd(g) { tagForm.value = { groupId: g.id, name: '', sortOrder: 0, storeIds: [], status: 1 }; tagDlg.value = { show: true, id: null }; }
function openTagEdit(g, row) {
  tagForm.value = { groupId: g.id, name: row.name, sortOrder: row.sort_order, storeIds: [], status: row.status };
  tagDlg.value = { show: true, id: row.id };
}
async function saveTag() {
  if (!tagForm.value.groupId) return ElMessage.warning('请选择标签组');
  if (!tagForm.value.name) return ElMessage.warning('请输入标签名称');
  saving.value = true;
  try {
    const payload = { groupId: tagForm.value.groupId, name: tagForm.value.name, sortOrder: tagForm.value.sortOrder, storeIds: tagForm.value.storeIds, status: tagForm.value.status };
    if (tagDlg.value.id) await customerApiCall.put(`/store/tags/${tagDlg.value.id}`, payload);
    else await customerApiCall.post('/store/tags', payload);
    ElMessage.success('保存成功');
    tagDlg.value.show = false;
    load();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saving.value = false;
  }
}
async function removeTag(row) {
  try {
    await ElMessageBox.confirm(`确认删除标签「${row.name}」？`, '删除确认', { type: 'warning' });
    await customerApiCall.delete(`/store/tags/${row.id}`);
    ElMessage.success('已删除');
    load();
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e || '删除失败');
  }
}

onMounted(load);
</script>

<style scoped>
.group-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.group-count { margin-left: 12px; font-size: 12px; color: #86909c; }
.tag-actions { margin-bottom: 12px; }
.tag-table { margin-top: 4px; }
</style>
