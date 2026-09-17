<template>
  <div class="goods-supplier">
    <AppPageHeader title="供应厂商" desc="商品供应厂商管理（1:1 复刻菜鸟云供应厂商）">
      <div class="hd-actions">
        <el-button type="primary" @click="openAdd">添加供应商</el-button>
      </div>
    </AppPageHeader>

    <div class="filter-bar">
      <el-input v-model="keyword" placeholder="搜索供应商名称" clearable class="w240" @keyup.enter="load" @clear="load">
        <template #append>
          <el-button @click="load"><el-icon><Search /></el-icon></el-button>
        </template>
      </el-input>
      <span class="p-total">共 {{ list.length }} 个</span>
    </div>

    <el-table v-loading="loading" :data="list" class="mt12">
      <el-table-column label="ID" prop="id" width="90" align="center" />
      <el-table-column label="供应商名称" prop="name" min-width="260" />
      <el-table-column label="创建时间" prop="createdAt" width="180" />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="danger" @click="del(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty><div class="empty-tip">暂无供应商，点击「添加供应商」创建</div></template>
    </el-table>

    <el-dialog v-model="dialog.show" title="添加供应商" width="440px" append-to-body>
      <el-form label-width="90px">
        <el-form-item label="供应商名称" required>
          <el-input v-model="dialog.name" placeholder="请输入供应商名称" maxlength="30" />
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
import { Search } from '@element-plus/icons-vue';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const list = ref([]);
const loading = ref(false);
const saving = ref(false);
const keyword = ref('');
const dialog = ref({ show: false, name: '' });

async function load() {
  loading.value = true;
  try {
    const data = await customerApiCall.get('/goods/suppliers', { params: { keyword: keyword.value.trim() } });
    list.value = data.list || [];
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}

function openAdd() { dialog.value = { show: true, name: '' }; }

async function save() {
  if (!dialog.value.name.trim()) { ElMessage.warning('请输入供应商名称'); return; }
  saving.value = true;
  try {
    await customerApiCall.post('/goods/suppliers', { name: dialog.value.name });
    ElMessage.success('已添加');
    dialog.value.show = false;
    load();
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}

async function del(row) {
  try { await ElMessageBox.confirm(`确认删除供应商「${row.name}」？`, '删除确认', { type: 'warning' }); } catch { return; }
  try {
    await customerApiCall.delete(`/goods/suppliers/${row.id}`);
    ElMessage.success('已删除');
    load();
  } catch (e) { ElMessage.error(e); }
}

onMounted(load);
</script>

<style scoped>
.hd-actions { display: flex; gap: 8px; }
.filter-bar { display: flex; align-items: center; gap: 12px; }
.w240 { width: 240px; }
.p-total { font-size: 13px; color: #86909c; }
.mt12 { margin-top: 12px; }
.empty-tip { color: #86909c; font-size: 13px; padding: 24px 0; }
</style>
