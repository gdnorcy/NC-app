<template>
  <div class="customers-manage">
    <!-- 统一Tab导航（5个管理功能共用） -->
    <CardTabs />

    <!-- 企业客户列表 -->
    <div class="content-card">
      <div class="tab-content">
        <div class="toolbar">
          <input v-model="custKeyword" class="search-input" placeholder="搜索客户姓名/公司/电话" @keyup.enter="loadCustomers" />
          <select v-model="custStatus" class="filter-select" @change="loadCustomers">
            <option value="">全部状态</option>
            <option value="pending">待跟进</option>
            <option value="following">跟进中</option>
            <option value="won">已成交</option>
            <option value="lost">已流失</option>
          </select>
          <button class="btn-primary" @click="loadCustomers">搜索</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>客户姓名</th>
              <th>公司</th>
              <th>电话</th>
              <th>标签</th>
              <th>来源</th>
              <th>状态</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cust in customers" :key="cust.id">
              <td>{{ cust.name }}</td>
              <td>{{ cust.company || '-' }}</td>
              <td>{{ cust.phone || '-' }}</td>
              <td>
                <span v-for="tag in cust.tags" :key="tag" class="tag">{{ tag }}</span>
              </td>
              <td>{{ cust.source || '名片交换' }}</td>
              <td>
                <span class="badge" :class="statusClass(cust.status)">{{ statusText(cust.status) }}</span>
              </td>
              <td>{{ formatDate(cust.createdAt) }}</td>
            </tr>
            <tr v-if="customers.length === 0">
              <td colspan="7" class="empty-cell">暂无企业客户</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { customerApiCall } from '../../../../api';
import CardTabs from './CardTabs.vue';

const customers = ref([]);
const custKeyword = ref('');
const custStatus = ref('');

async function loadCustomers() {
  try {
    const res = await customerApiCall.get('/card/customers', { params: { keyword: custKeyword.value, status: custStatus.value } });
    customers.value = res.customers || [];
  } catch (e) { console.error(e); }
}

function formatDate(d) {
  if (!d) return '-';
  return d.substring(0, 10);
}

function statusText(s) {
  return { pending: '待跟进', following: '跟进中', won: '已成交', lost: '已流失' }[s] || s;
}

function statusClass(s) {
  return { pending: 'warning', following: 'info', won: 'success', lost: 'danger' }[s] || 'info';
}

onMounted(loadCustomers);
</script>

<style scoped>
.customers-manage { padding: 0; }
.content-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.tab-content { padding: 20px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.search-input { flex: 1; max-width: 300px; padding: 8px 12px; border: 1px solid #e5e6eb; border-radius: 6px; font-size: 13px; outline: none; }
.search-input:focus { border-color: #165dff; }
.filter-select { padding: 8px 12px; border: 1px solid #e5e6eb; border-radius: 6px; font-size: 13px; outline: none; background: #fff; }
.btn-primary { padding: 8px 16px; background: #165dff; color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
.btn-primary:hover { background: #0e4fd6; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; padding: 12px; background: #f7f8fa; color: #4e5969; font-weight: 500; border-bottom: 1px solid #e5e6eb; }
.data-table td { padding: 12px; border-bottom: 1px solid #f2f3f5; color: #1d2129; }
.data-table tbody tr:hover { background: #f7f8fa; }
.badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.badge.success { background: rgba(0,180,42,0.1); color: #00b42a; }
.badge.warning { background: rgba(255,125,0,0.1); color: #ff7d00; }
.badge.info { background: rgba(22,93,255,0.1); color: #165dff; }
.badge.danger { background: rgba(245,63,63,0.1); color: #f53f3f; }
.tag { display: inline-block; padding: 2px 8px; background: #f2f3f5; border-radius: 4px; font-size: 12px; color: #4e5969; margin-right: 4px; }
.empty-cell { text-align: center; color: #86909c; padding: 40px !important; }
</style>
