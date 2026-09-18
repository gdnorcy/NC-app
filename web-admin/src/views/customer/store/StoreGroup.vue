<template>
  <div>
    <AppPageHeader title="门店分组" desc="1:1 nshop 门店分组：组名称 / 分配门店 / 启用禁用">
      <template #default><el-button type="primary" @click="openAdd">+ 添加分组</el-button></template>
    </AppPageHeader>

    <el-card>
      <el-table v-loading="loading" :data="list" size="default">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="组名称" min-width="200" />
        <el-table-column label="门店数" width="100">
          <template #default="{ row }">{{ row.storeCount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }"><el-tag :type="row.status ? 'success' : 'info'">{{ row.status ? '启用' : '禁用' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !list.length" description="暂无门店分组" :image-size="80" />
    </el-card>

    <el-dialog v-model="dialog.show" :title="dialog.id ? '编辑分组' : '添加分组'" width="480px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-form-item label="组名称" required>
          <el-input v-model="form.name" maxlength="20" show-word-limit placeholder="请输入组名称（0/20）" />
        </el-form-item>
        <el-form-item label="分配门店">
          <el-select v-model="form.storeIds" multiple placeholder="选择分配的门店" clearable style="width:100%">
            <el-option v-for="s in allStores" :key="s.id" :label="`${s.name}（${s.province}${s.city}）`" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.show = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
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
const dialog = ref({ show: false, id: null });
const form = ref({ name: '', storeIds: [], status: 1 });

async function load() {
  loading.value = true;
  try {
    const [c, s] = await Promise.all([
      customerApiCall.get('/store/categories'),
      customerApiCall.get('/store/all'),
    ]);
    list.value = c.list || [];
    allStores.value = s.stores || [];
  } catch (e) {
    ElMessage.error(e || '加载失败');
  } finally {
    loading.value = false;
  }
}

function openAdd() { form.value = { name: '', storeIds: [], status: 1 }; dialog.value = { show: true, id: null }; }
function openEdit(row) { form.value = { name: row.name, storeIds: [], status: row.status }; dialog.value = { show: true, id: row.id }; }

async function save() {
  if (!form.value.name) return ElMessage.warning('请输入组名称');
  saving.value = true;
  try {
    if (dialog.value.id) await customerApiCall.put(`/store/categories/${dialog.value.id}`, { name: form.value.name, status: form.value.status });
    else await customerApiCall.post('/store/categories', { name: form.value.name, status: form.value.status });
    ElMessage.success('保存成功');
    dialog.value.show = false;
    load();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认删除分组「${row.name}」？门店将变为未分组`, '删除确认', { type: 'warning' });
    await customerApiCall.delete(`/store/categories/${row.id}`);
    ElMessage.success('已删除');
    load();
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e || '删除失败');
  }
}

onMounted(load);
</script>
