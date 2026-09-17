<template>
  <div class="live-audit">
    <AppPageHeader title="商品审核" desc="本地商品提交微信小程序直播审核，审核通过后进入商品库">
      <div class="hd-actions">
        <el-button type="primary" @click="syncAuditStatus"><el-icon class="btn-ic"><Refresh /></el-icon>同步审核状态</el-button>
      </div>
    </AppPageHeader>

    <!-- 黄色提示（1:1 对齐菜鸟云商品审核页） -->
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
      <el-table-column prop="pagePath" label="页面路径" min-width="220" show-overflow-tooltip />
      <el-table-column label="审核状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="row.audit_status === 'approved' ? 'success' : (row.audit_status === 'failed' ? 'danger' : 'warning')">{{ auditLabel(row.audit_status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.audit_status === 'failed'" link type="primary" size="small" @click="reaudit(row)">重新提交审核</el-button>
          <el-button v-else link type="primary" size="small" :disabled="row.audit_status === 'approved'" @click="submitAudit(row)">提交审核</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination v-model:current-page="page" :page-size="query.pageSize" :total="total" layout="total, prev, pager, next" @current-change="load" />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
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
    const res = await customerApiCall.get('/live/goods/source', { params });
    list.value = (res.rows || []).map(r => ({ ...r, thumb: '' }));
    total.value = res.total || 0;
  } catch (e) { ElMessage.error(e || '加载商品失败'); }
  finally { loading.value = false; }
}

async function submitAudit(row) {
  try {
    await customerApiCall.post(`/live/goods/${row.goods_id}/audit`);
    ElMessage.success('已提交审核');
    load();
  } catch (e) { ElMessage.error(e || '提交失败'); }
}

async function reaudit(row) {
  try {
    await customerApiCall.post(`/live/goods/${row.live_id}/reaudit`);
    ElMessage.success('已重新提交审核');
    load();
  } catch (e) { ElMessage.error(e || '提交失败'); }
}

async function syncAuditStatus() {
  try {
    const res = await customerApiCall.post('/live/goods/audit-status');
    ElMessage.success(`审核状态已同步：更新 ${res.updated} 个`);
    load();
  } catch (e) { ElMessage.error(e || '同步失败'); }
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
</style>
