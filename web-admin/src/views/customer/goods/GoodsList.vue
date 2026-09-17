<template>
  <div class="goods-list">
    <AppPageHeader title="商品列表" desc="管理店铺商品：出售中/库存预警/已售空/未上架/已失效">
      <div class="hd-actions">
        <el-button type="primary" @click="goAdd"><el-icon class="btn-ic"><Plus /></el-icon>添加商品</el-button>
        <el-button @click="downloadTemplate">下载模板</el-button>
        <el-button @click="importTip">导入商品</el-button>
        <el-button type="danger" plain :disabled="!selection.length" @click="batchDown">批量下架</el-button>
      </div>
    </AppPageHeader>

    <!-- 状态 Tab（对标：出售中/库存预警/已售空/未上架/已失效，另加「全部」便于管理） -->
    <div class="status-tabs">
      <div v-for="t in statusTabs" :key="t.key" class="st-tab" :class="{ active: status === t.key }" @click="status = t.key; page = 1; load()">
        {{ t.label }}<span v-if="t.key === status" class="st-count">{{ total }}</span>
      </div>
    </div>

    <!-- 筛选：分类（多级）+ 关键字 -->
    <div class="filter-bar">
      <el-cascader
        v-model="catFilter"
        :options="cateOptions"
        :props="{ value: 'id', label: 'name', children: 'children', checkStrictly: true, emitPath: false }"
        placeholder="全部分类"
        clearable
        class="w200"
        @change="page = 1; load()"
      />
      <el-input v-model="keyword" placeholder="搜索商品名称 / 货号" clearable class="w240" @keyup.enter="page = 1; load()" @clear="page = 1; load()">
        <template #append>
          <el-button @click="page = 1; load()"><el-icon><Search /></el-icon></el-button>
        </template>
      </el-input>
      <span class="list-total">共 {{ total }} 个商品</span>
    </div>

    <el-table v-loading="loading" :data="list" class="mt12" @selection-change="(rows) => (selection = rows)">
      <el-table-column type="selection" width="44" />
      <el-table-column label="排序" width="76" align="center">
        <template #default="{ row }">
          <el-input-number v-if="editingSort === row.id" v-model="row.sortOrder" :min="0" size="small" controls-position="right" class="sort-input" @change="saveSort(row)" @blur="editingSort = 0" />
          <span v-else class="sort-val" @click="editingSort = row.id">{{ row.sortOrder }}</span>
        </template>
      </el-table-column>
      <el-table-column label="ID" prop="id" width="70" align="center" />
      <el-table-column label="缩略图" width="84">
        <template #default="{ row }">
          <el-image v-if="row.thumb" :src="resolveUrl(row.thumb)" fit="cover" class="thumb" :preview-src-list="[resolveUrl(row.thumb)]" preview-teleported />
          <div v-else class="thumb thumb-empty"><el-icon><Picture /></el-icon></div>
        </template>
      </el-table-column>
      <el-table-column label="标题" min-width="200">
        <template #default="{ row }">
          <div class="g-title">
            <span class="g-type" :class="'gt-' + row.topType">{{ typeLabel(row.topType) }}</span>
            <span class="g-name" :title="row.title">{{ row.title }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="推荐" width="84" align="center">
        <template #default="{ row }">
          <el-switch :model-value="!!row.recommend" size="small" @change="(v) => toggleRecommend(row, v)" />
        </template>
      </el-table-column>
      <el-table-column label="库存" width="90" align="center">
        <template #default="{ row }">
          <span :class="{ 'stock-warn': row.stock > 0 && row.stock <= 10 && row.status === 'sell' }">{{ row.stock }}</span>
        </template>
      </el-table-column>
      <el-table-column label="价格" width="110" align="right">
        <template #default="{ row }">
          <span class="g-price">{{ fmtPrice(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="84" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTag(row).type" size="small">{{ statusTag(row).label }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click="goEdit(row)">编辑</el-button>
          <el-button size="small" text @click="copyGoods(row)">复制</el-button>
          <el-button size="small" text @click="soon('推广')">推广</el-button>
          <el-button size="small" text @click="soon('评论')">评论</el-button>
          <el-button size="small" text type="danger" @click="delGoods(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <div class="empty-tip">暂无商品，点击「添加商品」创建第一个商品</div>
      </template>
    </el-table>

    <div class="pager-wrap">
      <el-pagination
        v-if="total > pageSize"
        background
        layout="prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="(p) => { page = p; load(); }"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, Picture } from '@element-plus/icons-vue';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const router = useRouter();

const statusTabs = [
  { key: 'all', label: '全部' },
  { key: 'sell', label: '出售中' },
  { key: 'stockwarn', label: '库存预警' },
  { key: 'soldout', label: '已售空' },
  { key: 'off', label: '未上架' },
  { key: 'expired', label: '已失效' },
];

const status = ref('all');
const catFilter = ref(null);
const keyword = ref('');
const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 10;
const loading = ref(false);
const selection = ref([]);
const editingSort = ref(0);
const cateOptions = ref([]);

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function typeLabel(t) {
  return { 1: '普通', 3: '卡密', 4: '虚拟' }[t] || '普通';
}
function fmtPrice(row) {
  if (row.saleMode === 'consult') return '价格面议';
  return `¥${Number(row.price).toFixed(2)}`;
}
function statusTag(row) {
  if (row.status === 'off') return { label: '未上架', type: 'info' };
  if (row.status === 'expired') return { label: '已失效', type: 'danger' };
  if (row.stock <= 0) return { label: '已售空', type: 'warning' };
  if (row.stock <= 10) return { label: '库存预警', type: 'warning' };
  return { label: '出售中', type: 'success' };
}

async function loadCates() {
  try {
    const data = await customerApiCall.get('/goods/categories');
    cateOptions.value = data.tree || [];
  } catch { cateOptions.value = []; }
}

async function load() {
  loading.value = true;
  try {
    const params = { status: status.value, page: page.value, pageSize, keyword: keyword.value.trim() };
    if (catFilter.value) params.catId = catFilter.value;
    const data = await customerApiCall.get('/goods', { params });
    list.value = data.list || [];
    total.value = data.total || 0;
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}

function goAdd() { router.push('/goods/edit'); }
function goEdit(row) { router.push(`/goods/edit?id=${row.id}`); }

async function toggleRecommend(row, v) {
  try {
    await customerApiCall.put(`/goods/${row.id}`, { ...row, recommend: v ? 1 : 0 });
    row.recommend = v ? 1 : 0;
    ElMessage.success(v ? '已设为推荐' : '已取消推荐');
  } catch (e) { ElMessage.error(e); }
}

async function saveSort(row) {
  try {
    await customerApiCall.put(`/goods/${row.id}`, { ...row });
    ElMessage.success('排序已更新');
  } catch (e) { ElMessage.error(e); }
  editingSort.value = 0;
}

async function copyGoods(row) {
  try {
    await customerApiCall.post(`/goods/${row.id}/copy`);
    ElMessage.success('已复制，副本默认未上架');
    load();
  } catch (e) { ElMessage.error(e); }
}

async function delGoods(row) {
  try { await ElMessageBox.confirm(`确认删除商品「${row.title}」？删除后不可恢复。`, '删除确认', { type: 'warning' }); } catch { return; }
  try {
    await customerApiCall.delete(`/goods/${row.id}`);
    ElMessage.success('已删除');
    if (list.value.length === 1 && page.value > 1) page.value -= 1;
    load();
  } catch (e) { ElMessage.error(e); }
}

async function batchDown() {
  try { await ElMessageBox.confirm(`确认下架选中的 ${selection.value.length} 个商品？`, '批量下架', { type: 'warning' }); } catch { return; }
  try {
    await customerApiCall.post('/goods/batch', { ids: selection.value.map((r) => r.id), action: 'down' });
    ElMessage.success('已批量下架');
    load();
  } catch (e) { ElMessage.error(e); }
}

function soon(name) { ElMessage.info(`「${name}」功能开发中，将在后续迭代开放`); }

// 下载导入模板（CSV：标题/分类/价格/库存/货号/详情）
function downloadTemplate() {
  const headers = ['商品名称', '分类名称', '售价', '库存', '货号', '商品简介', '商品详情'];
  const rows = [headers.join(',')];
  const csv = '\uFEFF' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '商品导入模板.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  ElMessage.success('模板已下载');
}
function importTip() { ElMessage.info('「导入商品」功能开发中，将在后续迭代开放'); }

onMounted(() => {
  loadCates();
  load();
});
</script>

<style scoped>
.hd-actions { display: flex; gap: 8px; }
.btn-ic { margin-right: 2px; }
.status-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #e5e6eb;
  margin: 4px 0 12px;
}
.st-tab {
  padding: 10px 14px;
  font-size: 14px;
  color: #4e5969;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.2s;
}
.st-tab:hover { color: #1d2129; }
.st-tab.active { color: #165dff; border-bottom-color: #165dff; font-weight: 500; }
.st-count { font-size: 12px; color: #86909c; margin-left: 4px; }
.filter-bar { display: flex; align-items: center; gap: 12px; }
.w200 { width: 200px; }
.w240 { width: 240px; }
.list-total { font-size: 13px; color: #86909c; margin-left: auto; }
.mt12 { margin-top: 12px; }
.thumb { width: 56px; height: 56px; border-radius: 6px; display: block; }
.thumb-empty {
  background: #f7f8fa;
  display: flex; align-items: center; justify-content: center;
  color: #c9cdd4;
}
.g-title { display: flex; align-items: center; gap: 6px; }
.g-type {
  font-size: 11px; color: #165dff; background: rgba(22, 93, 255, 0.06);
  border-radius: 4px; padding: 1px 5px; flex-shrink: 0;
}
.gt-3 { color: #ff7d00; background: rgba(255, 125, 0, 0.08); }
.gt-4 { color: #00b42a; background: rgba(0, 180, 42, 0.08); }
.g-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 240px;
}
.g-price { color: #f53f3f; font-weight: 600; }
.stock-warn { color: #ff7d00; font-weight: 600; }
.sort-val { cursor: pointer; color: #165dff; }
.sort-input { width: 70px; }
.pager-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
.empty-tip { color: #86909c; font-size: 13px; padding: 24px 0; }
</style>
