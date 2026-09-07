<template>
  <div class="exchange-records-page">
    <!-- 统一Tab导航 -->
    <CardTabs />

    <AppPageHeader title="交换记录" desc="查看租户内所有名片交换往来" />

    <div class="card">
      <div class="filter-bar">
        <el-select v-model="status" placeholder="全部状态" style="width: 160px" @change="load">
          <el-option label="全部状态" value="" />
          <el-option label="待处理" value="pending" />
          <el-option label="已接受" value="accepted" />
          <el-option label="已拒绝" value="rejected" />
        </el-select>
        <span class="filter-tip">共 {{ total }} 条交换记录</span>
      </div>

      <el-table :data="records" v-loading="loading" stripe style="width: 100%">
        <el-table-column label="发起方" min-width="180">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="uc-avatar" :style="{ background: '#165dff22', color: '#165dff' }">{{ (row.from_name || '?')[0] }}</div>
              <div>
                <div class="uc-name">{{ row.from_card_name || row.from_name || '未知' }}</div>
                <div class="uc-sub">{{ row.from_position || '—' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="" width="60" align="center">
          <template #default>
            <SIcon name="exchange" size="small" color="#c9cdd4" />
          </template>
        </el-table-column>
        <el-table-column label="接收方" min-width="180">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="uc-avatar" :style="{ background: '#00b42a22', color: '#00b42a' }">{{ (row.to_name || '?')[0] }}</div>
              <div>
                <div class="uc-name">{{ row.to_card_name || row.to_name || '未知' }}</div>
                <div class="uc-sub">{{ row.to_position || '—' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请留言" prop="message" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.message || '—' }}</template>
        </el-table-column>
        <el-table-column label="交换时间" width="170">
          <template #default="{ row }">{{ row.exchanged_at || '—' }}</template>
        </el-table-column>
        <el-table-column label="发起时间" width="170">
          <template #default="{ row }">{{ row.created_at }}</template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          layout="prev, pager, next"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          @current-change="(p) => { page = p; load(); }"
        />
      </div>

      <div v-if="!records.length && !loading" class="empty-hint">暂无交换记录</div>
    </div>
  </div>
</template>

<script setup>
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import { ref, onMounted } from 'vue';
import { publicApi } from '../../../../api';
import SIcon from '../../../../components/SIcon.vue';
import CardTabs from './CardTabs.vue';

const records = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const status = ref('');
const loading = ref(false);

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const res = await publicApi.get('/card-market/exchange/records', {
      params: { status: status.value, page: page.value, pageSize },
    });
    records.value = res.records || [];
    total.value = res.total || 0;
  } catch (e) {
    records.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function statusText(s) {
  return { pending: '待处理', accepted: '已接受', rejected: '已拒绝' }[s] || s;
}
function statusTag(s) {
  return { pending: 'warning', accepted: 'success', rejected: 'danger' }[s] || 'info';
}
</script>

<style scoped>
.exchange-records-page { padding: 0; }
.card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.filter-tip { font-size: 13px; color: #86909c; }
.user-cell { display: flex; align-items: center; gap: 10px; }
.uc-avatar {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}
.uc-name { font-size: 14px; color: #1d2129; font-weight: 500; }
.uc-sub { font-size: 12px; color: #86909c; margin-top: 2px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.empty-hint { text-align: center; color: #86909c; padding: 32px 0; font-size: 13px; }
</style>
