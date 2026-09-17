<template>
  <div class="goods-params">
    <AppPageHeader title="商品参数" desc="商品参数模板，编辑商品时可选填（如 品牌/材质/产地 等）">
      <div class="hd-actions">
        <el-button type="primary" @click="openAdd">添加商品参数</el-button>
      </div>
    </AppPageHeader>

    <div class="filter-bar">
      <el-input v-model="keyword" placeholder="搜索参数名称" clearable class="w240" @keyup.enter="load" @clear="load">
        <template #append>
          <el-button @click="load"><el-icon><Search /></el-icon></el-button>
        </template>
      </el-input>
      <span class="p-total">共 {{ total }} 个参数</span>
    </div>

    <el-table v-loading="loading" :data="list" class="mt12">
      <el-table-column label="ID" prop="id" width="90" align="center" />
      <el-table-column label="参数名称" prop="name" min-width="200" />
      <el-table-column label="类型" prop="type" min-width="120">
        <template #default="{ row }">{{ row.type || '文本' }}</template>
      </el-table-column>
      <el-table-column label="创建时间" prop="createdAt" width="180" />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="danger" @click="del(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty><div class="empty-tip">暂无参数，点击「添加商品参数」创建</div></template>
    </el-table>

    <el-dialog v-model="dialog.show" title="添加商品参数" width="440px" append-to-body>
      <el-form label-width="90px">
        <el-form-item label="参数名称" required>
          <el-input v-model="dialog.name" placeholder="如：品牌" maxlength="20" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="dialog.type" placeholder="文本" style="width: 100%">
            <el-option label="文本" value="" />
            <el-option label="数字" value="number" />
          </el-select>
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
const total = ref(0);
const loading = ref(false);
const keyword = ref('');
const dialog = ref({ show: false, name: '', type: '' });
const saving = ref(false);

async function load() {
  loading.value = true;
  try {
    const data = await customerApiCall.get('/goods/params', { params: { keyword: keyword.value.trim() } });
    list.value = data.list || [];
    total.value = data.total || 0;
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}

function openAdd() { dialog.value = { show: true, name: '', type: '' }; }

async function save() {
  if (!dialog.value.name.trim()) { ElMessage.warning('请输入参数名称'); return; }
  saving.value = true;
  try {
    await customerApiCall.post('/goods/params', { name: dialog.value.name, type: dialog.value.type });
    ElMessage.success('已添加');
    dialog.value.show = false;
    load();
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}

async function del(row) {
  try { await ElMessageBox.confirm(`确认删除参数「${row.name}」？`, '删除确认', { type: 'warning' }); } catch { return; }
  try {
    await customerApiCall.delete(`/goods/params/${row.id}`);
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
