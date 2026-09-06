<template>
  <div class="card-admin">
    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon-wrap icon-blue"><SIcon name="team" size="default" color="#165dff" /></div>
        <div class="stat-info">
          <div class="stat-value">{{ overview.employeeCount || 0 }}</div>
          <div class="stat-label">企业成员</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap icon-green"><SIcon name="card" size="default" color="#00b42a" /></div>
        <div class="stat-info">
          <div class="stat-value">{{ overview.cardCount || 0 }}</div>
          <div class="stat-label">名片总数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap icon-orange"><SIcon name="analytics" size="default" color="#ff7d00" /></div>
        <div class="stat-info">
          <div class="stat-value">{{ overview.totalViews || 0 }}</div>
          <div class="stat-label">总访问量</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap icon-purple"><SIcon name="customer" size="default" color="#722ed1" /></div>
        <div class="stat-info">
          <div class="stat-value">{{ overview.customerCount || 0 }}</div>
          <div class="stat-label">企业客户</div>
        </div>
      </div>
    </div>

    <!-- Tab切换 -->
    <div class="content-card">
      <div class="tab-bar">
        <div class="tab" :class="{ active: activeTab === 'employees' }" @click="activeTab = 'employees'">
          员工名片
        </div>
        <div class="tab" :class="{ active: activeTab === 'customers' }" @click="activeTab = 'customers'">
          企业客户
        </div>
        <div class="tab" @click="$router.push('/apps/card/market')">
          集市管理
        </div>
        <div class="tab" @click="$router.push('/apps/card/tenant')">
          入驻管理
        </div>
        <div class="tab" @click="$router.push('/apps/card/pool')">
          公海池
        </div>
      </div>

      <!-- 员工名片列表 -->
      <div v-if="activeTab === 'employees'" class="tab-content">
        <div class="toolbar">
          <input v-model="empKeyword" class="search-input" placeholder="搜索姓名/职位/公司" @keyup.enter="loadEmployees" />
          <button class="btn-primary" @click="loadEmployees">搜索</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>员工</th>
              <th>职位</th>
              <th>公司</th>
              <th>手机号</th>
              <th>访问量</th>
              <th>交换数</th>
              <th>公开状态</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="emp in employees" :key="emp.id">
              <td>
                <div class="user-cell">
                  <div class="avatar">{{ emp.name ? emp.name[0] : '?' }}</div>
                  <span>{{ emp.name }}</span>
                </div>
              </td>
              <td>{{ emp.position || '-' }}</td>
              <td>{{ emp.company || '-' }}</td>
              <td>{{ emp.phone || '-' }}</td>
              <td>{{ emp.viewCount }}</td>
              <td>{{ emp.exchangeCount }}</td>
              <td>
                <span class="badge" :class="emp.isPublic ? 'success' : 'warning'">
                  {{ emp.isPublic ? '已公开' : '未公开' }}
                </span>
              </td>
              <td>{{ formatDate(emp.createdAt) }}</td>
            </tr>
            <tr v-if="employees.length === 0">
              <td colspan="8" class="empty-cell">暂无员工名片，员工通过小程序/H5创建名片后将自动展示</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 企业客户列表 -->
      <div v-if="activeTab === 'customers'" class="tab-content">
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
import { customerApiCall } from '../../../api';
import SIcon from '../../../components/SIcon.vue';

const overview = ref({});
const employees = ref([]);
const customers = ref([]);
const activeTab = ref('employees');
const empKeyword = ref('');
const custKeyword = ref('');
const custStatus = ref('');

async function loadOverview() {
  try {
    const res = await customerApiCall.get('/card/overview');
    overview.value = res;
  } catch (e) { console.error(e); }
}

async function loadEmployees() {
  try {
    const res = await customerApiCall.get('/card/employees', { params: { keyword: empKeyword.value } });
    employees.value = res.cards || [];
  } catch (e) { console.error(e); }
}

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

onMounted(() => {
  loadOverview();
  loadEmployees();
  loadCustomers();
});
</script>

<style scoped>
.card-admin { padding: 0; }
.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px; }
.stat-card { background: #fff; border-radius: 8px; padding: 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.stat-icon-wrap { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
.stat-icon-wrap.icon-blue { background: rgba(22,93,255,0.1); }
.stat-icon-wrap.icon-green { background: rgba(0,180,42,0.1); }
.stat-icon-wrap.icon-orange { background: rgba(255,125,0,0.1); }
.stat-icon-wrap.icon-purple { background: rgba(114,46,209,0.1); }
.stat-value { font-size: 24px; font-weight: 600; color: #1d2129; }
.stat-label { font-size: 13px; color: #86909c; margin-top: 2px; }
.content-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.tab-bar { display: flex; border-bottom: 1px solid #e5e6eb; padding: 0 20px; }
.tab { padding: 14px 20px; font-size: 14px; color: #4e5969; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
.tab.active { color: #165dff; border-bottom-color: #165dff; font-weight: 500; }
.tab-content { padding: 20px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
.search-input { flex: 1; max-width: 300px; padding: 8px 12px; border: 1px solid #e5e6eb; border-radius: 6px; font-size: 13px; outline: none; }
.search-input:focus { border-color: #165dff; }
.filter-select { padding: 8px 12px; border: 1px solid #e5e6eb; border-radius: 6px; font-size: 13px; outline: none; background: #fff; }
.btn-primary { padding: 8px 16px; background: #165dff; color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
.btn-primary:hover { background: #0e4fd6; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; padding: 12px; background: #f7f8fa; color: #4e5969; font-weight: 500; border-bottom: 1px solid #e5e6eb; }
.data-table td { padding: 12px; border-bottom: 1px solid #f2f3f5; color: #1d2129; }
.data-table tbody tr:hover { background: #f7f8fa; }
.user-cell { display: flex; align-items: center; gap: 10px; }
.avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #165dff, #4080ff); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500; }
.badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.badge.success { background: rgba(0,180,42,0.1); color: #00b42a; }
.badge.warning { background: rgba(255,125,0,0.1); color: #ff7d00; }
.badge.info { background: rgba(22,93,255,0.1); color: #165dff; }
.badge.danger { background: rgba(245,63,63,0.1); color: #f53f3f; }
.tag { display: inline-block; padding: 2px 8px; background: #f2f3f5; border-radius: 4px; font-size: 12px; color: #4e5969; margin-right: 4px; }
.empty-cell { text-align: center; color: #86909c; padding: 40px !important; }
</style>
