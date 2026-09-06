<template>
  <div class="tenant-manage-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div>
        <h2 class="page-title">入驻管理</h2>
        <p class="page-desc">管理租户内入驻个人和入驻企业单位</p>
      </div>
    </div>

    <!-- Tab切换 -->
    <div class="content-card">
      <div class="tab-bar">
        <div class="tab" :class="{ active: activeTab === 'individuals' }" @click="activeTab = 'individuals'; loadIndividuals()">
          <SIcon name="user" size="default" :color="activeTab === 'individuals' ? '#165dff' : '#4e5969'" />
          入驻个人
          <el-tag size="small" type="info">{{ individuals.length }}</el-tag>
        </div>
        <div class="tab" :class="{ active: activeTab === 'enterprises' }" @click="activeTab = 'enterprises'; loadEnterprises()">
          <SIcon name="building" size="default" :color="activeTab === 'enterprises' ? '#165dff' : '#4e5969'" />
          入驻企业
          <el-tag size="small" type="info">{{ enterprises.length }}</el-tag>
        </div>
      </div>

      <!-- 入驻个人列表 -->
      <div v-if="activeTab === 'individuals'" class="tab-content">
        <div class="toolbar">
          <el-input v-model="indKeyword" placeholder="搜索姓名/手机号" style="width: 240px;" clearable @keyup.enter="loadIndividuals" />
          <el-button type="primary" @click="loadIndividuals">
            <SIcon name="dynamic" size="small" color="#fff" />
            刷新
          </el-button>
        </div>

        <el-table :data="filteredIndividuals" style="width: 100%" size="default">
          <el-table-column label="姓名" min-width="120">
            <template #default="{ row }">
              <div class="user-cell">
                <div class="user-avatar">{{ row.name?.[0] || '用' }}</div>
                <span>{{ row.name || '未设置' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="手机号" width="140" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
                {{ row.status === 'active' ? '正常' : '已停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="入驻时间" width="180" />
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === 'active'" type="danger" size="small" link @click="disableIndividual(row)">停用</el-button>
              <el-button v-else type="success" size="small" link @click="enableIndividual(row)">启用</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="empty-state" v-if="!individuals.length">
          <SIcon name="user" size="xlarge" color="#c9cdd4" />
          <div class="empty-text">暂无入驻个人</div>
        </div>
      </div>

      <!-- 入驻企业列表 -->
      <div v-if="activeTab === 'enterprises'" class="tab-content">
        <div class="toolbar">
          <el-input v-model="entKeyword" placeholder="搜索企业名称" style="width: 240px;" clearable @keyup.enter="loadEnterprises" />
          <el-button type="primary" @click="loadEnterprises">
            <SIcon name="dynamic" size="small" color="#fff" />
            刷新
          </el-button>
        </div>

        <el-table :data="filteredEnterprises" style="width: 100%" size="default">
          <el-table-column label="企业名称" min-width="180">
            <template #default="{ row }">
              <div class="user-cell">
                <div class="ent-avatar">{{ row.name?.[0] || '企' }}</div>
                <span>{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="industry" label="行业" width="120" />
          <el-table-column prop="employee_count" label="员工数" width="100" align="center" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
                {{ row.status === 'active' ? '正常' : '已停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" size="small" link @click="viewEmployees(row)">员工管理</el-button>
              <el-button v-if="row.status === 'active'" type="danger" size="small" link @click="disableEnterprise(row)">停用</el-button>
              <el-button v-else type="success" size="small" link @click="enableEnterprise(row)">启用</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="empty-state" v-if="!enterprises.length">
          <SIcon name="building" size="xlarge" color="#c9cdd4" />
          <div class="empty-text">暂无入驻企业</div>
        </div>
      </div>
    </div>

    <!-- 企业员工管理弹窗 -->
    <el-dialog v-model="showEmployees" title="企业员工管理" width="600px" class="emp-dialog">
      <div class="emp-header">
        <div class="emp-ent-name">{{ currentEnterprise?.name }}</div>
        <el-tag size="small">{{ employees.length }} 名员工</el-tag>
      </div>
      <el-table :data="employees" style="width: 100%" size="small">
        <el-table-column label="姓名" min-width="100">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="user-avatar small">{{ row.name?.[0] || '员' }}</div>
              <span>{{ row.name || '未设置' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="position" label="职位" width="120" />
        <el-table-column prop="department" label="部门" width="100" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '在职' : '离职' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <div class="empty-state" v-if="!employees.length" style="padding: 40px 0;">
        <div class="empty-text">暂无员工</div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../../components/SIcon.vue';
import { publicApi } from '../../../../api';

const activeTab = ref('individuals');
const individuals = ref([]);
const enterprises = ref([]);
const employees = ref([]);
const indKeyword = ref('');
const entKeyword = ref('');
const showEmployees = ref(false);
const currentEnterprise = ref(null);

const filteredIndividuals = computed(() => {
  if (!indKeyword.value) return individuals.value;
  const kw = indKeyword.value.toLowerCase();
  return individuals.value.filter(i =>
    (i.name || '').toLowerCase().includes(kw) || (i.phone || '').includes(kw)
  );
});

const filteredEnterprises = computed(() => {
  if (!entKeyword.value) return enterprises.value;
  const kw = entKeyword.value.toLowerCase();
  return enterprises.value.filter(e => (e.name || '').toLowerCase().includes(kw));
});

onMounted(() => {
  loadIndividuals();
});

async function loadIndividuals() {
  try {
    const res = await publicApi.get('/card-market/individuals');
    individuals.value = res.individuals || [];
  } catch (e) {
    console.error('加载入驻个人失败', e);
  }
}

async function loadEnterprises() {
  try {
    const res = await publicApi.get('/card-market/enterprises');
    enterprises.value = res.enterprises || [];
  } catch (e) {
    console.error('加载入驻企业失败', e);
  }
}

async function disableIndividual(row) {
  try {
    await ElMessageBox.confirm(`确定停用「${row.name}」吗？停用后其客户将回收至公海池，并从人脉集市移除。`, '停用确认', { type: 'warning' });
    await publicApi.post(`/card-market/individuals/${row.id}/disable`);
    ElMessage.success('已停用');
    loadIndividuals();
  } catch {}
}

async function enableIndividual(row) {
  try {
    await ElMessageBox.confirm(`确定启用「${row.name}」吗？启用后该个人恢复名片与客户管理权限。`, '启用确认', { type: 'info' });
    await publicApi.post(`/card-market/individuals/${row.id}/enable`);
    ElMessage.success('已启用');
    loadIndividuals();
  } catch {}
}

async function disableEnterprise(row) {
  try {
    await ElMessageBox.confirm(`确定停用「${row.name}」吗？停用后企业及全部员工将从集市移除，客户回收至公海池。`, '停用确认', { type: 'warning' });
    await publicApi.post(`/card-market/enterprises/${row.id}/disable`);
    ElMessage.success('已停用');
    loadEnterprises();
  } catch {}
}

async function enableEnterprise(row) {
  try {
    await ElMessageBox.confirm(`确定启用「${row.name}」吗？启用后恢复企业主体，企业员工需重新加入。`, '启用确认', { type: 'info' });
    await publicApi.post(`/card-market/enterprises/${row.id}/enable`);
    ElMessage.success('已启用');
    loadEnterprises();
  } catch {}
}

async function viewEmployees(row) {
  currentEnterprise.value = row;
  showEmployees.value = true;
  try {
    const res = await publicApi.get(`/card-market/enterprises/${row.id}/employees`);
    employees.value = res.employees || [];
  } catch (e) {
    employees.value = [];
  }
}
</script>

<style scoped>
.tenant-manage-page { padding: 20px; }
.page-header { margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909c; margin-top: 4px; }

.content-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.tab-bar { display: flex; border-bottom: 1px solid #f2f3f5; padding: 0 20px; }
.tab { display: flex; align-items: center; gap: 8px; padding: 16px 20px; font-size: 14px; color: #4e5969; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
.tab.active { color: #165dff; border-bottom-color: #165dff; font-weight: 500; }
.tab-content { padding: 20px; }

.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }

.user-cell { display: flex; align-items: center; gap: 10px; }
.user-avatar { width: 32px; height: 32px; border-radius: 16px; background: linear-gradient(135deg, #165dff, #4080ff); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; }
.user-avatar.small { width: 28px; height: 28px; font-size: 12px; }
.ent-avatar { width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #722ed1, #9254de); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 40px 0; }
.empty-text { font-size: 14px; color: #86909c; margin-top: 12px; }

.emp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f2f3f5; }
.emp-ent-name { font-size: 15px; font-weight: 600; color: #1d2129; }
</style>
