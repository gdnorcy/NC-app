<template>
  <div class="goods-category">
    <AppPageHeader title="商品分类" desc="支持二级分类；分类用于商品归类与前台展示">
      <div class="hd-actions">
        <el-button type="primary" @click="openEdit(null, 0)">新增分类</el-button>
        <el-button :disabled="!selection.length" @click="batchOp('up')">批量上架</el-button>
        <el-button :disabled="!selection.length" @click="batchOp('down')">批量下架</el-button>
        <el-button type="danger" plain :disabled="!selection.length" @click="batchOp('del')">批量删除</el-button>
        <el-button @click="exportCsv">导出</el-button>
      </div>
    </AppPageHeader>

    <div class="stat-row">
      <span>共 <b>{{ total }}</b> 个分类</span>
      <span>一级分类 <b>{{ level1Count }}</b> 个</span>
      <span>二级分类 <b>{{ level2Count }}</b> 个</span>
    </div>

    <div class="filter-bar">
      <el-input v-model="keyword" placeholder="搜索分类名称" clearable class="w240" @keyup.enter="load" @clear="load">
        <template #append>
          <el-button @click="load"><el-icon><Search /></el-icon></el-button>
        </template>
      </el-input>
    </div>

    <el-table
      v-loading="loading"
      :data="tree"
      row-key="id"
      class="mt12"
      :tree-props="{ children: 'children' }"
      default-expand-all
      @selection-change="(rows) => (selection = rows)"
    >
      <el-table-column type="selection" width="44" :selectable="(row) => row.pid === 0" />
      <el-table-column label="排序" width="80" align="center">
        <template #default="{ row }">
          <el-input-number v-if="editingSort === row.id" v-model="row.sortOrder" :min="0" size="small" controls-position="right" class="sort-input" @change="saveSort(row)" @blur="editingSort = 0" />
          <span v-else class="sort-val" @click="editingSort = row.id">{{ row.sortOrder }}</span>
        </template>
      </el-table-column>
      <el-table-column label="ID" prop="id" width="70" align="center" />
      <el-table-column label="分类图片" width="84">
        <template #default="{ row }">
          <el-image v-if="row.image" :src="resolveUrl(row.image)" fit="cover" class="cate-thumb" :preview-src-list="[resolveUrl(row.image)]" preview-teleported />
          <div v-else class="cate-thumb cate-thumb-empty"><el-icon><Picture /></el-icon></div>
        </template>
      </el-table-column>
      <el-table-column label="分类名称" min-width="200">
        <template #default="{ row }">
          <span class="cate-name">{{ row.name }}</span>
          <span v-if="row.pid !== 0" class="cate-sub-tag">二级</span>
          <span v-if="row.goodsCount" class="cate-goods-n">商品 {{ row.goodsCount }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.pid === 0" size="small" text type="primary" @click="openEdit(null, row.id)">添加子分类</el-button>
          <el-button size="small" text @click="openEdit(row, row.pid)">编辑</el-button>
          <el-button size="small" text @click="toggleStatus(row)">{{ row.status === 1 ? '下架' : '上架' }}</el-button>
          <el-button size="small" text type="danger" @click="delCat(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty><div class="empty-tip">暂无分类，点击「新增分类」创建</div></template>
    </el-table>

    <!-- 新增/编辑分类 -->
    <el-dialog v-model="dialog.show" :title="dialog.id ? '编辑分类' : (dialog.pid ? '新增子分类' : '新增分类')" width="480px" append-to-body>
      <el-form label-width="90px">
        <el-form-item label="上级分类" v-if="dialog.pid">
          <span>{{ parentName }}</span>
        </el-form-item>
        <el-form-item label="分类名称" required>
          <el-input v-model="dialog.name" placeholder="请输入分类名称" maxlength="20" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="dialog.sortOrder" :min="0" controls-position="right" />
        </el-form-item>
        <el-form-item label="分类图片">
          <div class="img-picker">
            <el-image v-if="dialog.image" :src="resolveUrl(dialog.image)" fit="cover" class="picker-img" :preview-src-list="[resolveUrl(dialog.image)]" preview-teleported />
            <div v-else class="picker-img picker-empty" @click="openPicker('image')"><el-icon><Plus /></el-icon></div>
            <div class="picker-ops">
              <el-button size="small" @click="openPicker('image')">选择图片</el-button>
              <el-button v-if="dialog.image" size="small" text type="danger" @click="dialog.image = ''">移除</el-button>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.show = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 素材库选择弹窗 -->
    <MaterialPicker v-model="picker.show" @confirm="onPickImg" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Picture, Plus } from '@element-plus/icons-vue';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import MaterialPicker from '../apps/design/MaterialPicker.vue';

const list = ref([]);
const tree = ref([]);
const total = ref(0);
const level1Count = ref(0);
const level2Count = ref(0);
const loading = ref(false);
const selection = ref([]);
const editingSort = ref(0);
const keyword = ref('');
const dialog = ref({ show: false, id: null, pid: 0, name: '', sortOrder: 0, image: '' });
const saving = ref(false);
const picker = ref({ show: false, target: '' });

const parentName = computed(() => {
  if (!dialog.value.pid) return '';
  const p = list.value.find((c) => c.id === dialog.value.pid);
  return p ? p.name : '';
});

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}

async function load() {
  loading.value = true;
  try {
    const data = await customerApiCall.get('/goods/categories');
    list.value = data.list || [];
    let rows = list.value;
    if (keyword.value.trim()) {
      const kw = keyword.value.trim();
      const hit = new Set();
      list.value.filter((c) => c.name.includes(kw)).forEach((c) => {
        hit.add(c.id);
        if (c.pid !== 0) hit.add(c.pid);
      });
      rows = list.value.filter((c) => hit.has(c.id));
    }
    const l1 = rows.filter((c) => c.pid === 0);
    const l2 = rows.filter((c) => c.pid !== 0);
    tree.value = l1.map((c) => ({ ...c, children: l2.filter((s) => s.pid === c.id) }));
    total.value = data.total || 0;
    level1Count.value = data.level1Count || 0;
    level2Count.value = data.level2Count || 0;
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}

function openEdit(row, pid) {
  dialog.value = {
    show: true,
    id: row?.id || null,
    pid: row ? row.pid : pid,
    name: row?.name || '',
    sortOrder: row?.sortOrder || 0,
    image: row?.image || '',
  };
}

async function save() {
  if (!dialog.value.name.trim()) { ElMessage.warning('请输入分类名称'); return; }
  saving.value = true;
  try {
    if (dialog.value.id) {
      await customerApiCall.put(`/goods/categories/${dialog.value.id}`, {
        name: dialog.value.name, image: dialog.value.image, sortOrder: dialog.value.sortOrder,
      });
    } else {
      await customerApiCall.post('/goods/categories', {
        pid: dialog.value.pid, name: dialog.value.name, image: dialog.value.image, sortOrder: dialog.value.sortOrder,
      });
    }
    ElMessage.success('已保存');
    dialog.value.show = false;
    load();
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}

async function delCat(row) {
  try {
    await ElMessageBox.confirm(`确认删除分类「${row.name}」？`, '删除确认', { type: 'warning' });
  } catch { return; }
  try {
    await customerApiCall.delete(`/goods/categories/${row.id}`);
    ElMessage.success('已删除');
    load();
  } catch (e) { ElMessage.error(e); }
}

async function toggleStatus(row) {
  try {
    await customerApiCall.put(`/goods/categories/${row.id}`, { status: row.status === 1 ? 0 : 1 });
    ElMessage.success(row.status === 1 ? '已下架' : '已上架');
    load();
  } catch (e) { ElMessage.error(e); }
}

async function saveSort(row) {
  try {
    await customerApiCall.put(`/goods/categories/${row.id}`, { sortOrder: row.sortOrder });
    ElMessage.success('排序已更新');
  } catch (e) { ElMessage.error(e); }
  editingSort.value = 0;
}

async function batchOp(action) {
  const actionLabel = { up: '上架', down: '下架', del: '删除' }[action];
  try {
    await ElMessageBox.confirm(`确认批量${actionLabel}选中的 ${selection.value.length} 个一级分类？`, '批量操作', { type: 'warning' });
  } catch { return; }
  try {
    await customerApiCall.post('/goods/categories/batch', { ids: selection.value.map((r) => r.id), action });
    ElMessage.success(`已批量${actionLabel}`);
    load();
  } catch (e) { ElMessage.error(e); }
}

function exportCsv() {
  const headers = ['排序', 'ID', '分类名称', '状态', '商品数'];
  const rows = [headers.join(',')];
  const flatten = (arr, level) => {
    arr.forEach((c) => {
      rows.push([c.sortOrder, c.id, (level ? '  ' : '') + c.name, c.status === 1 ? '启用' : '停用', c.goodsCount || 0].join(','));
      if (c.children?.length) flatten(c.children, level + 1);
    });
  };
  flatten(tree.value, 0);
  const csv = '\uFEFF' + rows.join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `商品分类-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function openPicker(target) { picker.value = { show: true, target }; }
function onPickImg(url) {
  if (!url) return;
  if (picker.value.target === 'image') dialog.value.image = url;
}

onMounted(load);
</script>

<style scoped>
.hd-actions { display: flex; gap: 8px; }
.stat-row { display: flex; gap: 24px; font-size: 13px; color: #86909c; margin: 4px 0 12px; }
.stat-row b { color: #1d2129; }
.filter-bar { display: flex; align-items: center; gap: 12px; }
.w240 { width: 240px; }
.mt12 { margin-top: 12px; }
.cate-thumb { width: 48px; height: 48px; border-radius: 6px; display: block; }
.cate-thumb-empty {
  background: #f7f8fa; display: flex; align-items: center; justify-content: center; color: #c9cdd4;
}
.cate-name { font-weight: 500; }
.cate-sub-tag { font-size: 11px; color: #86909c; background: #f2f3f5; border-radius: 4px; padding: 1px 5px; margin-left: 6px; }
.cate-goods-n { font-size: 12px; color: #165dff; margin-left: 8px; }
.sort-val { cursor: pointer; color: #165dff; }
.sort-input { width: 70px; }
.empty-tip { color: #86909c; font-size: 13px; padding: 24px 0; }
.img-picker { display: flex; align-items: center; gap: 10px; }
.picker-img { width: 56px; height: 56px; border-radius: 6px; display: block; }
.picker-empty {
  border: 1px dashed #c9cdd4; background: #f7f8fa; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: #86909c;
}
.picker-ops { display: flex; flex-direction: column; gap: 4px; }
.hide { display: none; }
</style>
