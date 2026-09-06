<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">客户项目</h2>
      <el-button type="primary" @click="$router.push('/customers/new/edit')">
        <el-icon><Plus /></el-icon>新建客户
      </el-button>
    </div>
    <div class="page-card">
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <el-radio-group v-model="filter" @change="loadCustomers">
          <el-radio-button label="all">全部</el-radio-button>
          <el-radio-button label="active">正常</el-radio-button>
          <el-radio-button label="expiring">即将到期</el-radio-button>
          <el-radio-button label="expired">已过期</el-radio-button>
          <el-radio-button label="disabled">已停用</el-radio-button>
        </el-radio-group>
        <el-input v-model="search" placeholder="搜索客户名称" clearable style="width:240px;" @input="loadCustomers" />
      </div>
      <div class="customer-grid">
        <div v-for="c in filteredList" :key="c.id" class="customer-card">
          <div class="customer-card-header">
            <img v-if="c.logo" :src="c.logo" class="customer-logo" />
            <div v-else class="customer-logo-placeholder">{{ c.customerName?.[0] }}</div>
            <div class="customer-info">
              <div class="customer-name">{{ c.customerName }}</div>
              <div class="customer-meta">ID: {{ c.id }} | {{ c.planCount || 0 }}个方案 | {{ c.sceneCount || 0 }}个场景</div>
            </div>
            <el-tag v-if="c.status === 'disabled'" type="danger" size="small">已停用</el-tag>
            <el-tag v-else-if="daysUntil(c.validUntil) < 0" type="info" size="small">已过期</el-tag>
            <el-tag v-else-if="daysUntil(c.validUntil) <= 30" type="warning" size="small">剩{{ daysUntil(c.validUntil) }}天</el-tag>
            <el-tag v-else type="success" size="small">正常</el-tag>
          </div>
          <div class="customer-card-footer">
            <el-button size="small" @click="$router.push(`/customers/${c.id}/edit`)">编辑</el-button>
            <el-button size="small" type="primary" @click="enterCustomer(c)">进入</el-button>
            <el-button size="small" type="danger" @click="removeCustomer(c)">删除</el-button>
          </div>
        </div>
      </div>
      <div v-if="filteredList.length === 0" class="empty-state">
        <el-empty description="暂无客户项目" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { fetchCustomers, deleteCustomer, impersonateCustomer } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const router = useRouter();
const customers = ref([]);
const filter = ref('all');
const search = ref('');

const filteredList = computed(() => {
  let list = customers.value;
  if (search.value) list = list.filter(c => c.customerName?.includes(search.value));
  if (filter.value === 'active') list = list.filter(c => c.status !== 'disabled' && daysUntil(c.validUntil) >= 0);
  if (filter.value === 'expiring') list = list.filter(c => c.status !== 'disabled' && daysUntil(c.validUntil) >= 0 && daysUntil(c.validUntil) <= 30);
  if (filter.value === 'expired') list = list.filter(c => daysUntil(c.validUntil) < 0);
  if (filter.value === 'disabled') list = list.filter(c => c.status === 'disabled');
  return list;
});

function daysUntil(dateStr) {
  if (!dateStr) return 999;
  return Math.ceil((new Date(dateStr + 'T23:59:59') - new Date()) / 86400000);
}

async function loadCustomers() {
  try {
    const res = await fetchCustomers();
    customers.value = res.projects || [];
  } catch (e) { ElMessage.error(e); }
}

async function enterCustomer(c) {
  try {
    const res = await impersonateCustomer(c.id);
    localStorage.setItem('customer_token', res.token);
    localStorage.setItem('customer_user', JSON.stringify(res.user));
    localStorage.setItem('admin_token_backup', localStorage.getItem('panorama_token'));
    window.location.href = '/customer.html';
  } catch (e) { ElMessage.error(e); }
}

async function removeCustomer(c) {
  try {
    await ElMessageBox.confirm(`确定删除客户「${c.customerName}」？该操作不可恢复。`, '确认删除', { type: 'warning' });
    await deleteCustomer(c.id);
    ElMessage.success('删除成功');
    loadCustomers();
  } catch (e) { if (e !== 'cancel') ElMessage.error(e); }
}

onMounted(loadCustomers);
</script>

<style scoped>
.customer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.customer-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
}
.customer-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.customer-card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.customer-logo { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; }
.customer-logo-placeholder {
  width: 48px; height: 48px; border-radius: 8px;
  background: #165DFF; color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 600;
}
.customer-info { flex: 1; }
.customer-name { font-size: 15px; font-weight: 600; color: #1a1b1c; }
.customer-meta { font-size: 12px; color: #909399; margin-top: 2px; }
.customer-card-footer { display: flex; gap: 8px; justify-content: flex-end; }
</style>
