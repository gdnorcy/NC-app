<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">客户项目</h2>
      <el-button type="primary" @click="$router.push('/customers/new/edit')">
        <el-icon><Plus /></el-icon>新建客户
      </el-button>
    </div>
    <div class="page-card">
      <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center;">
        <el-radio-group v-model="filter" @change="loadCustomers">
          <el-radio-button label="active">正常</el-radio-button>
          <el-radio-button label="disabled">已禁用</el-radio-button>
          <el-radio-button label="trashed">回收站</el-radio-button>
        </el-radio-group>
        <el-input v-model="search" placeholder="搜索客户名称" clearable style="width:240px;" @input="loadCustomers" />
      </div>
      <div class="customer-grid">
        <div v-for="c in filteredList" :key="c.id" class="customer-card" :class="{ 'card-disabled': c.status === 'disabled', 'card-trashed': c.status === 'trashed' }">
          <div class="customer-card-header">
            <img v-if="c.logo" :src="c.logo" class="customer-logo" />
            <div v-else class="customer-logo-placeholder">{{ c.customerName?.[0] }}</div>
            <div class="customer-info">
              <div class="customer-name">{{ c.customerName }}</div>
              <div class="customer-meta">ID: {{ c.id }} | {{ c.planCount || 0 }}个方案 | {{ c.sceneCount || 0 }}个场景</div>
            </div>
            <el-tag v-if="c.status === 'trashed'" type="info" size="small">回收站</el-tag>
            <el-tag v-else-if="c.status === 'disabled'" type="danger" size="small">已禁用</el-tag>
            <el-tag v-else-if="daysUntil(c.validUntil) < 0" type="info" size="small">已过期</el-tag>
            <el-tag v-else-if="daysUntil(c.validUntil) <= 30" type="warning" size="small">剩{{ daysUntil(c.validUntil) }}天</el-tag>
            <el-tag v-else type="success" size="small">正常</el-tag>
          </div>
          <div class="customer-card-footer">
            <template v-if="c.status === 'trashed'">
              <el-button size="small" type="success" @click="restoreCustomer(c)">恢复</el-button>
              <el-button size="small" type="danger" @click="permanentDelete(c)">彻底删除</el-button>
            </template>
            <template v-else>
              <el-button size="small" @click="$router.push(`/customers/${c.id}/edit`)">编辑</el-button>
              <el-button size="small" type="primary" @click="enterCustomer(c)" :disabled="c.status === 'disabled'">进入</el-button>
              <el-button size="small" :type="c.status === 'disabled' ? 'success' : 'warning'" @click="toggleStatus(c)">
                {{ c.status === 'disabled' ? '启用' : '禁用' }}
              </el-button>
              <el-button size="small" type="danger" @click="trashCustomer(c)">删除</el-button>
            </template>
          </div>
        </div>
      </div>
      <div v-if="filteredList.length === 0" class="empty-state">
        <el-empty :description="filter === 'trashed' ? '回收站为空' : filter === 'disabled' ? '暂无已禁用客户' : '暂无客户项目'" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { fetchCustomers, deleteCustomer, impersonateCustomer, updateCustomer } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const router = useRouter();
const customers = ref([]);
const filter = ref('active');
const search = ref('');

const filteredList = computed(() => {
  let list = customers.value;
  if (search.value) list = list.filter(c => c.customerName?.includes(search.value));
  if (filter.value === 'active') list = list.filter(c => !c.status || c.status === 'active');
  if (filter.value === 'disabled') list = list.filter(c => c.status === 'disabled');
  if (filter.value === 'trashed') list = list.filter(c => c.status === 'trashed');
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

async function toggleStatus(c) {
  const newStatus = c.status === 'disabled' ? 'active' : 'disabled';
  const action = newStatus === 'disabled' ? '禁用' : '启用';
  try {
    await ElMessageBox.confirm(
      `确定${action}客户「${c.customerName}」？${newStatus === 'disabled' ? '禁用后该客户下所有用户无法登录，数据保留。' : ''}`,
      '确认', { type: 'warning' }
    );
    await updateCustomer(c.id, { status: newStatus });
    ElMessage.success(`${action}成功`);
    loadCustomers();
  } catch (e) {}
}

async function trashCustomer(c) {
  try {
    await ElMessageBox.confirm(
      `确定将客户「${c.customerName}」移入回收站？\n移入后客户无法登录，30天内可恢复，超期将彻底删除。`,
      '移入回收站', { type: 'warning' }
    );
    await updateCustomer(c.id, { status: 'trashed' });
    ElMessage.success('已移入回收站');
    loadCustomers();
  } catch (e) {}
}

async function restoreCustomer(c) {
  try {
    await updateCustomer(c.id, { status: 'active' });
    ElMessage.success('恢复成功');
    loadCustomers();
  } catch (e) { ElMessage.error(e); }
}

async function permanentDelete(c) {
  try {
    await ElMessageBox.confirm(
      `确定彻底删除客户「${c.customerName}」？\n该操作不可恢复，所有方案、场景、数据将被清除并归入默认项目。`,
      '彻底删除', { type: 'error', confirmButtonText: '确认删除', confirmButtonClass: 'el-button--danger' }
    );
    await deleteCustomer(c.id);
    ElMessage.success('彻底删除成功');
    loadCustomers();
  } catch (e) {}
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
.customer-card.card-disabled { opacity: 0.6; background: #fafafa; }
.customer-card.card-trashed { opacity: 0.5; background: #f5f7fa; border-style: dashed; }
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
.customer-card-footer { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
</style>
