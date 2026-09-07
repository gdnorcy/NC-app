<template>
  <div class="pool-page">
    <!-- 统一Tab导航（5个管理功能共用） -->
    <CardTabs />

    <!-- 页面标题 -->
    <div class="page-header">
      <div>
        <h2 class="page-title">公海池</h2>
        <p class="page-desc">收纳停用个人/企业回收的客户，可重新分配</p>
      </div>
      <div class="header-stats">
        <div class="stat-item">
          <div class="stat-num">{{ pool.length }}</div>
          <div class="stat-label">公海客户</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">{{ availableCount }}</div>
          <div class="stat-label">可领取</div>
        </div>
      </div>
    </div>

    <!-- 客户列表 -->
    <div class="content-card">
      <div class="toolbar">
        <el-input v-model="keyword" placeholder="搜索姓名/公司/手机号" style="width: 280px;" clearable />
        <el-select v-model="filterStatus" placeholder="状态" style="width: 120px;">
          <el-option label="全部" value="" />
          <el-option label="可领取" value="available" />
          <el-option label="已领取" value="claimed" />
        </el-select>
        <el-button type="primary" @click="loadPool">
          <SIcon name="dynamic" size="small" color="#fff" />
          刷新
        </el-button>
      </div>

      <el-table :data="filteredPool" style="width: 100%" size="default">
        <el-table-column label="客户信息" min-width="180">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="user-avatar">{{ row.name?.[0] || '客' }}</div>
              <div>
                <div class="cell-name">{{ row.name || '未命名' }}</div>
                <div class="cell-sub">{{ row.position || '—' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="company" label="公司" min-width="140" />
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column label="来源" width="100">
          <template #default="{ row }">
            <el-tag :type="row.sourceType === 'individual' ? '' : 'warning'" size="small">
              {{ row.sourceType === 'individual' ? '个人' : '企业' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'available' ? 'success' : 'info'" size="small">
              {{ row.status === 'available' ? '可领取' : '已领取' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="recycledAt" label="回收时间" width="180" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'available' && isManager" type="primary" size="small" link @click="openAssign(row)">分配</el-button>
            <el-button v-else-if="row.status === 'available'" type="primary" size="small" link @click="claimCustomer(row)">领取</el-button>
            <span v-else class="claimed-by">领取人: {{ row.claimedByName || row.claimedBy || '—' }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="empty-state" v-if="!pool.length">
        <SIcon name="pool" size="xlarge" color="#c9cdd4" />
        <div class="empty-text">公海池暂无客户</div>
        <div class="empty-hint">停用入驻个人/企业时，其客户将自动回收至公海池</div>
      </div>
    </div>

    <!-- 分配弹窗（管理员） -->
    <el-dialog v-model="assignVisible" title="分配公海客户" width="480px" align-center>
      <div class="assign-tip">将「{{ assignRow?.name || '该客户' }}」分配给以下成员：</div>
      <el-select v-model="assigneeUserId" placeholder="请选择入驻个人 / 企业员工" style="width: 100%;" filterable>
        <el-option
          v-for="m in assignMembers"
          :key="m.userId"
          :value="m.userId"
          :label="`${m.displayName || m.nickname || '未命名'}（${m.type === 'individual' ? '入驻个人' : '企业员工'}）`"
        />
      </el-select>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" :loading="assigning" @click="confirmAssign">确认分配</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../../components/SIcon.vue';
import { publicApi } from '../../../../api';
import { isTenantAdmin, isEnterpriseAdmin } from '../../../../utils/menuPermissions';
import CardTabs from './CardTabs.vue';

const pool = ref([]);
const keyword = ref('');
const filterStatus = ref('');
// 管理员身份（租户管理员 / 入驻企业管理员）：显示「分配」，成员显示「领取」
const curUser = JSON.parse(localStorage.getItem('customer_user') || 'null');
const isManager = computed(() => isTenantAdmin(curUser) || isEnterpriseAdmin(curUser));
// 分配弹窗
const assignVisible = ref(false);
const assignRow = ref(null);
const assignMembers = ref([]);
const assigneeUserId = ref(null);
const assigning = ref(false);

const availableCount = computed(() => pool.value.filter(p => p.status === 'available').length);

const filteredPool = computed(() => {
  let list = pool.value;
  if (filterStatus.value) {
    list = list.filter(p => p.status === filterStatus.value);
  }
  if (keyword.value) {
    const kw = keyword.value.toLowerCase();
    list = list.filter(p =>
      (p.name || '').toLowerCase().includes(kw) ||
      (p.company || '').toLowerCase().includes(kw) ||
      (p.phone || '').includes(kw)
    );
  }
  return list;
});

onMounted(() => loadPool());

async function loadPool() {
  try {
    const res = await publicApi.get('/card-market/public-pool');
    pool.value = res.pool || [];
  } catch (e) {
    console.error('加载公海池失败', e);
  }
}

async function claimCustomer(row) {
  try {
    await ElMessageBox.confirm(`确定领取「${row.name || '该客户'}」吗？领取后将进入您的客户列表。`, '领取确认', { type: 'info' });
    await publicApi.post(`/card-market/public-pool/${row.id}/claim`);
    ElMessage.success('领取成功');
    loadPool();
  } catch {}
}

// 管理员：打开分配弹窗并加载可分配成员
async function openAssign(row) {
  assignRow.value = row;
  assigneeUserId.value = null;
  assignVisible.value = true;
  try {
    const res = await publicApi.get('/card-market/public-pool/members');
    assignMembers.value = res.members || [];
    if (!assignMembers.value.length) {
      ElMessage.warning('暂无活跃的入驻个人或企业员工可分配');
    }
  } catch (e) {
    console.error('加载分配成员失败', e);
  }
}

async function confirmAssign() {
  if (!assigneeUserId.value) {
    ElMessage.warning('请选择分配对象');
    return;
  }
  assigning.value = true;
  try {
    await publicApi.post(`/card-market/public-pool/${assignRow.value.id}/assign`, { assigneeUserId: assigneeUserId.value });
    ElMessage.success('分配成功');
    assignVisible.value = false;
    loadPool();
  } catch (e) {
    ElMessage.error(e?.message || '分配失败');
  } finally {
    assigning.value = false;
  }
}
</script>

<style scoped>
.pool-page { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909c; margin-top: 4px; }

.header-stats { display: flex; gap: 24px; }
.stat-item { text-align: center; }
.stat-num { font-size: 24px; font-weight: 700; color: #165dff; }
.stat-label { font-size: 12px; color: #86909c; margin-top: 2px; }

.content-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }

.user-cell { display: flex; align-items: center; gap: 10px; }
.user-avatar { width: 36px; height: 36px; border-radius: 18px; background: linear-gradient(135deg, #ff7d00, #ff9a2e); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; flex-shrink: 0; }
.cell-name { font-size: 14px; color: #1d2129; font-weight: 500; }
.cell-sub { font-size: 12px; color: #86909c; margin-top: 2px; }

.claimed-by { font-size: 12px; color: #86909c; }

.assign-tip { font-size: 13px; color: #4e5969; margin-bottom: 12px; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 60px 0; }
.empty-text { font-size: 14px; color: #4e5969; margin-top: 12px; }
.empty-hint { font-size: 12px; color: #86909c; margin-top: 4px; }
</style>
