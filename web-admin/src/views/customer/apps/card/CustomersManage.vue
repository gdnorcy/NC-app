<template>
  <div class="customers-manage">
    <!-- 统一Tab导航（5个管理功能共用） -->
    <CardTabs />

    <!-- 页面标题 -->
    <AppPageHeader title="企业客户" desc="名片交换、访客转化与公海分配而来的客户线索，可查看跟进记录" />

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
              <th>最近跟进</th>
              <th>操作</th>
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
              <td>{{ formatDate(cust.lastFollowAt) }}</td>
              <td>
                <button class="link-btn" @click="openFollows(cust)">跟进记录</button>
              </td>
            </tr>
            <tr v-if="customers.length === 0">
              <td colspan="8" class="empty-cell">暂无企业客户</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 跟进记录弹窗 -->
    <el-dialog v-model="showFollowDialog" title="跟进记录" width="600px" class="follow-dialog">
      <div v-if="follows.length === 0" class="follow-empty">暂无跟进记录</div>
      <div v-for="f in follows" :key="f.id" class="follow-item">
        <div class="follow-content">{{ f.content }}</div>
        <div class="follow-meta">
          <span>跟进时间：{{ formatDateTime(f.createdAt) }}</span>
          <span v-if="f.nextFollowAt">下次跟进：{{ formatDate(f.nextFollowAt) }}</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="showFollowDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import { ref, onMounted } from 'vue';
import { customerApiCall } from '../../../../api';
import CardTabs from './CardTabs.vue';

const customers = ref([]);
const custKeyword = ref('');
const custStatus = ref('');
const showFollowDialog = ref(false);
const follows = ref([]);

async function loadCustomers() {
  try {
    const res = await customerApiCall.get('/card/customers', { params: { keyword: custKeyword.value, status: custStatus.value } });
    customers.value = res.customers || [];
  } catch (e) { console.error(e); }
}

async function openFollows(cust) {
  try {
    const res = await customerApiCall.get(`/card/customers/${cust.id}/follows`);
    follows.value = res.follows || [];
    showFollowDialog.value = true;
  } catch (e) {
    follows.value = [];
    showFollowDialog.value = true;
  }
}

function formatDate(d) {
  if (!d) return '-';
  return d.substring(0, 10);
}

function formatDateTime(d) {
  if (!d) return '-';
  return d.substring(0, 16).replace('T', ' ');
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
.link-btn { background: none; border: none; color: #165dff; font-size: 13px; cursor: pointer; padding: 0; }
.link-btn:hover { text-decoration: underline; }
.empty-cell { text-align: center; color: #86909c; padding: 40px !important; }
.follow-dialog .follow-empty { text-align: center; color: #86909c; padding: 32px 0; }
.follow-item { padding: 12px 0; border-bottom: 1px solid #f2f3f5; }
.follow-item:last-child { border-bottom: none; }
.follow-content { font-size: 14px; color: #1d2129; line-height: 1.6; }
.follow-meta { display: flex; gap: 16px; margin-top: 6px; font-size: 12px; color: #86909c; }
</style>
