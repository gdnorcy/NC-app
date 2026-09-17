<template>
  <div class="goods-tag-list">
    <AppPageHeader :title="title" :desc="desc">
      <div class="hd-actions">
        <el-button type="primary" @click="openAdd(null)">新增{{ title }}</el-button>
      </div>
    </AppPageHeader>

    <div class="filter-bar">
      <el-input v-model="keyword" :placeholder="`搜索${title}名称`" clearable class="w240" @keyup.enter="load" @clear="load">
        <template #append>
          <el-button @click="load"><el-icon><Search /></el-icon></el-button>
        </template>
      </el-input>
      <span class="p-total">共 {{ list.length }} 个</span>
    </div>

    <el-table v-loading="loading" :data="list" class="mt12">
      <el-table-column label="ID" prop="id" width="80" align="center" />
      <el-table-column label="排序" prop="sortOrder" width="90" align="center" />
      <el-table-column label="标签名称" prop="name" min-width="160" />
      <el-table-column v-if="hasContent" label="标签内容" prop="content" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">{{ row.content || '-' }}</template>
      </el-table-column>
      <el-table-column v-if="hasIcon" label="图标" prop="icon" min-width="140">
        <template #default="{ row }">
          <span v-if="row.icon" class="icon-chip">{{ row.icon }}</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="启用情况" width="110" align="center">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled === 1" @change="(v) => toggle(row, v)" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click="openAdd(row)">编辑</el-button>
          <el-button size="small" text type="danger" @click="del(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty><div class="empty-tip">暂无{{ title }}，点击「新增{{ title }}」创建</div></template>
    </el-table>

    <el-dialog v-model="dialog.show" :title="dialog.id ? `编辑${title}` : `新增${title}`" width="480px" append-to-body>
      <el-form label-width="90px">
        <el-form-item :label="hasIcon ? '标签名称' : '标签名称'" required>
          <el-input v-model="dialog.name" :placeholder="`请输入${title}名称`" maxlength="30" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="dialog.sortOrder" :min="0" :max="9999" style="width: 180px" />
          <span class="sort-hint">数字越大越靠前</span>
        </el-form-item>
        <el-form-item v-if="hasContent" label="标签内容">
          <el-input v-model="dialog.content" type="textarea" :rows="2" :placeholder="`请输入${title}内容`" maxlength="120" />
        </el-form-item>
        <el-form-item v-if="hasIcon" label="图标">
          <el-input v-model="dialog.icon" placeholder="图标名称（如：七天无理由）" maxlength="30" />
          <span class="sort-hint">显示在商品服务保障位</span>
        </el-form-item>
        <el-form-item label="启用情况">
          <el-switch v-model="dialog.enabled" :active-value="1" :inactive-value="0" />
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

const props = defineProps({
  title: { type: String, default: '标签' },
  desc: { type: String, default: '' },
  endpoint: { type: String, required: true }, // 如 /goods/brand-tags
  hasContent: { type: Boolean, default: false },
  hasIcon: { type: Boolean, default: false },
});

const list = ref([]);
const loading = ref(false);
const saving = ref(false);
const keyword = ref('');
const dialog = ref({ show: false, id: null, name: '', sortOrder: 0, content: '', icon: '', enabled: 1 });

async function load() {
  loading.value = true;
  try {
    const data = await customerApiCall.get(props.endpoint, { params: { keyword: keyword.value.trim() } });
    list.value = data.list || [];
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}

function openAdd(row) {
  dialog.value = row
    ? { show: true, id: row.id, name: row.name, sortOrder: row.sortOrder, content: row.content || '', icon: row.icon || '', enabled: row.enabled }
    : { show: true, id: null, name: '', sortOrder: 0, content: '', icon: '', enabled: 1 };
}

async function save() {
  const d = dialog.value;
  if (!d.name.trim()) { ElMessage.warning('请输入名称'); return; }
  saving.value = true;
  try {
    if (d.id) {
      await customerApiCall.put(`${props.endpoint}/${d.id}`, { name: d.name, sortOrder: d.sortOrder, content: d.content, icon: d.icon, enabled: d.enabled });
    } else {
      await customerApiCall.post(props.endpoint, { name: d.name, sortOrder: d.sortOrder, content: d.content, icon: d.icon, enabled: d.enabled });
    }
    ElMessage.success('已保存');
    dialog.value.show = false;
    load();
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}

async function toggle(row, v) {
  try {
    await customerApiCall.put(`${props.endpoint}/${row.id}`, { enabled: v ? 1 : 0 });
    row.enabled = v ? 1 : 0;
    ElMessage.success(v ? '已启用' : '已禁用');
  } catch (e) { ElMessage.error(e); }
}

async function del(row) {
  try { await ElMessageBox.confirm(`确认删除「${row.name}」？`, '删除确认', { type: 'warning' }); } catch { return; }
  try {
    await customerApiCall.delete(`${props.endpoint}/${row.id}`);
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
.sort-hint { font-size: 12px; color: #86909c; margin-left: 10px; }
.icon-chip { font-size: 13px; color: #165dff; background: rgba(22, 93, 255, 0.06); border-radius: 6px; padding: 2px 8px; }
</style>
