<template>
  <div class="ent-pool">
    <div class="page-header">
      <div>
        <h2 class="page-title">企业公海</h2>
        <p class="page-desc">企业公海客户池：可领取分配给本企业员工跟进，或释放回公海</p>
      </div>
    </div>

    <div class="tbl-card">
      <div class="pool-head">
        <el-radio-group v-model="status" @change="load">
          <el-radio-button value="available">可用（{{ counts.available }}）</el-radio-button>
          <el-radio-button value="claimed">已领取（{{ counts.claimed }}）</el-radio-button>
        </el-radio-group>
        <el-input v-model="keyword" placeholder="搜索姓名 / 手机号 / 公司" clearable class="pool-search" @keyup.enter="load" @clear="load" />
      </div>
      <el-table :data="items" stripe>
        <el-table-column prop="name" label="客户" min-width="140">
          <template #default="{ row }">
            <div class="pool-name">{{ row.name || '未命名' }}</div>
            <div class="pool-sub">{{ row.sourceType === 'employee' ? '员工回流' : '企业回收' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" min-width="130" />
        <el-table-column prop="company" label="公司" min-width="140">
          <template #default="{ row }">{{ row.company || '-' }}</template>
        </el-table-column>
        <el-table-column prop="position" label="职位" min-width="110">
          <template #default="{ row }">{{ row.position || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.status === 'available' ? 'success' : 'warning'" size="small" effect="light">
              {{ row.status === 'available' ? '可用' : '已领取' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="领取人" width="120">
          <template #default="{ row }">{{ row.claimerName || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'available'">
              <el-button link type="primary" @click="openClaim(row)">领取</el-button>
              <el-button link @click="floatUp(row)">上浮租户公海</el-button>
            </template>
            <template v-else>
              <el-button link @click="release(row)">释放回公海</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!items.length" class="empty">暂无{{ status === 'available' ? '可用' : '已领取' }}客户</div>
    </div>

    <!-- 领取弹窗：可分配给指定员工 -->
    <el-dialog v-model="claimVisible" title="领取公海客户" width="480px" :close-on-click-modal="false">
      <p class="claim-tip">客户「{{ claimRow?.name || claimRow?.phone }}」领取后进入名下客户，可分配给本企业员工</p>
      <el-select v-model="claimTarget" placeholder="领取给自己（默认）" clearable class="claim-select">
        <el-option
          v-for="e in employees"
          :key="e.userId"
          :label="`${e.name || e.nickname}${e.role === 'admin' ? '（管理员）' : ''}`"
          :value="e.userId"
        />
      </el-select>
      <template #footer>
        <el-button @click="claimVisible = false">取消</el-button>
        <el-button type="primary" :loading="claiming" @click="claim">确认领取</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customerApiCall } from '../../../api';

const items = ref([]);
const employees = ref([]);
const status = ref('available');
const keyword = ref('');
const counts = ref({ available: 0, claimed: 0 });
const claimVisible = ref(false);
const claimRow = ref(null);
const claimTarget = ref(null);
const claiming = ref(false);

async function load() {
  try {
    const res = await customerApiCall.get('/enterprise/pool', { params: { status: status.value, keyword: keyword.value } });
    items.value = res.items || [];
  } catch (e) { ElMessage.error(e || '加载失败'); }
}
async function loadCounts() {
  try {
    const res = await customerApiCall.get('/enterprise/me');
    counts.value = { available: res.stats.poolAvailable, claimed: res.stats.poolClaimed };
  } catch (e) {}
}
async function loadEmployees() {
  try {
    const res = await customerApiCall.get('/enterprise/employees');
    employees.value = res.employees || [];
  } catch (e) {}
}
function openClaim(row) {
  claimRow.value = row;
  claimTarget.value = null;
  claimVisible.value = true;
}
async function claim() {
  claiming.value = true;
  try {
    await customerApiCall.post(`/enterprise/pool/${claimRow.value.id}/claim`, { userId: claimTarget.value });
    ElMessage.success('领取成功');
    claimVisible.value = false;
    load(); loadCounts();
  } catch (e) { ElMessage.error(e || '领取失败'); }
  finally { claiming.value = false; }
}
async function release(row) {
  try {
    await customerApiCall.post(`/enterprise/pool/${row.id}/release`);
    ElMessage.success('已释放回公海');
    load(); loadCounts();
  } catch (e) { ElMessage.error(e || '操作失败'); }
}
async function floatUp(row) {
  try {
    await ElMessageBox.confirm(`确认将「${row.name || row.phone}」上浮到租户全局公海？上浮后本租户所有成员可见可领。`, '上浮确认', {
      confirmButtonText: '上浮', cancelButtonText: '取消', type: 'warning',
    });
  } catch { return; }
  try {
    await customerApiCall.post(`/enterprise/pool/${row.id}/float-up`);
    ElMessage.success('已上浮到租户公海');
    load(); loadCounts();
  } catch (e) { ElMessage.error(e || '操作失败'); }
}

onMounted(() => { load(); loadCounts(); loadEmployees(); });
</script>

<style scoped>
.ent-pool { display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909c; margin: 4px 0 0; }
.tbl-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.pool-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.pool-search { width: 260px; }
.pool-name { font-size: 14px; color: #1d2129; }
.pool-sub { font-size: 12px; color: #86909c; margin-top: 2px; }
.claim-tip { font-size: 13px; color: #4e5969; margin: 0 0 16px; }
.claim-select { width: 100%; }
.empty { padding: 48px 0; text-align: center; color: #86909c; font-size: 13px; }
</style>
