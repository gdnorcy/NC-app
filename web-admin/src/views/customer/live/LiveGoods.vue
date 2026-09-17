<template>
  <div class="live-goods">
    <AppPageHeader title="商品同步" desc="直播间商品库：审核通过的商品在直播间展示，可同步更新">
      <div class="hd-actions">
        <el-button @click="syncAuditStatus">同步审核状态</el-button>
        <el-button type="primary" @click="syncGoods"><el-icon class="btn-ic"><Refresh /></el-icon>同步商品列表</el-button>
      </div>
    </AppPageHeader>

    <!-- 黄色提示（1:1 对齐菜鸟云商品同步页） -->
    <div class="warn-box">审核通过的商品仅允许更新价格类型与价格，审核中的商品不允许更新</div>

    <div class="filter-bar">
      <el-input v-model="query.keyword" placeholder="商品名称" clearable class="w200" @keyup.enter="page = 1; load()" @clear="page = 1; load()" />
      <span class="list-total">共 {{ total }} 个商品</span>
    </div>

    <el-table v-loading="loading" :data="list" class="mt12">
      <el-table-column label="缩略图" width="80" align="center">
        <template #default="{ row }">
          <el-image v-if="row.thumb" :src="resolveUrl(row.thumb)" fit="cover" class="g-thumb" />
          <div v-else class="g-thumb g-empty" />
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" min-width="180" />
      <el-table-column label="价格" width="110">
        <template #default="{ row }"><span>¥{{ Number(row.priceYuan ?? 0).toFixed(2) }}</span></template>
      </el-table-column>
      <el-table-column prop="page_path" label="页面路径" min-width="220" show-overflow-tooltip />
      <el-table-column label="审核状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="row.audit_status === 'approved' ? 'success' : 'info'">{{ auditLabel(row.audit_status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">更新商品</el-button>
          <el-button link type="danger" size="small" @click="delGoods(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination v-model:current-page="page" :page-size="query.pageSize" :total="total" layout="total, prev, pager, next" @current-change="load" />
    </div>

    <!-- 更新商品弹窗（对齐菜鸟云：审核通过的商品仅允许更新价格与价格类型） -->
    <el-dialog v-model="dlg.show" title="更新商品" width="520px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="商品名称"><el-input v-model="dlg.form.name" disabled /></el-form-item>
        <el-form-item label="价格"><el-input-number v-model="dlg.form.price" :min="0" :precision="2" controls-position="right" class="w200" /><span class="form-hint"> 元</span></el-form-item>
        <el-form-item label="页面路径"><el-input v-model="dlg.form.pagePath" disabled /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.show = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const auditLabel = (s) => ({ pending: '待审核', approved: '已通过', failed: '审核失败' }[s] || s);
const resolveUrl = (u) => u || '';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const query = reactive({ keyword: '', pageSize: 10 });

async function load() {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize: query.pageSize };
    if (query.keyword) params.keyword = query.keyword;
    const res = await customerApiCall.get('/live/goods', { params });
    list.value = (res.rows || []).map(r => ({ ...r, thumb: '' }));
    total.value = res.total || 0;
  } catch (e) { ElMessage.error(e || '加载商品库失败'); }
  finally { loading.value = false; }
}

async function syncGoods() {
  try {
    const res = await customerApiCall.post('/live/goods/sync');
    ElMessage.success(`同步完成：新增 ${res.added} 个商品`);
    load();
  } catch (e) { ElMessage.error(e || '同步失败'); }
}

async function syncAuditStatus() {
  try {
    const res = await customerApiCall.post('/live/goods/audit-status');
    ElMessage.success(`审核状态已同步：更新 ${res.updated} 个`);
    load();
  } catch (e) { ElMessage.error(e || '同步失败'); }
}

const dlg = reactive({ show: false, form: {} });
const saving = ref(false);
function openEdit(row) {
  dlg.form = { id: row.id, name: row.name, price: Number(row.priceYuan ?? 0), pagePath: row.page_path };
  dlg.show = true;
}
async function save() {
  saving.value = true;
  try {
    await customerApiCall.put(`/live/goods/${dlg.form.id}`, { price: dlg.form.price });
    ElMessage.success('更新成功');
    dlg.show = false;
    load();
  } catch (e) { ElMessage.error(e || '更新失败'); }
  finally { saving.value = false; }
}

async function delGoods(row) {
  try {
    await ElMessageBox.confirm(`确定删除商品「${row.name}」吗？删除后直播间上架商品同步删除，不可恢复`, '删除商品', { type: 'warning' });
  } catch { return; }
  try {
    await customerApiCall.delete(`/live/goods/${row.id}`);
    ElMessage.success('删除成功');
    load();
  } catch (e) { ElMessage.error(e || '删除失败'); }
}

onMounted(load);
</script>

<style scoped>
.hd-actions { display: flex; gap: 12px; }
.btn-ic { margin-right: 4px; }
.warn-box { background: #fffbe6; border: 1px solid #ffe58f; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; color: #ad6800; line-height: 1.8; }
.filter-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.list-total { font-size: 13px; color: #86909c; }
.w200 { width: 200px; }
.g-thumb { width: 56px; height: 56px; border-radius: 6px; }
.g-empty { border: 1px dashed #c9cdd4; }
.mt12 { margin-top: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.form-hint { font-size: 13px; color: #86909c; }
</style>
