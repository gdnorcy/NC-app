<template>
  <div class="tenant-manage-page">
    <!-- 统一Tab导航（5个管理功能共用） -->
    <CardTabs />

    <!-- 页面标题 -->
    <AppPageHeader title="入驻管理" desc="管理入驻企业单位；个人认证与集市上下架已并入「名片管理」" />

    <!-- Tab切换 -->
    <div class="content-card">
      <div class="tab-bar">
        <div class="tab active" @click="loadEnterprises()">
          <SIcon name="building" size="default" color="#165dff" />
          入驻企业
          <el-tag size="small" type="info">{{ enterprises.length }}</el-tag>
        </div>
        <!-- 第21轮：入驻凭证改兑换码（当前仅个人入驻，见 JoinCodeManage）。入口是页面级操作，
             放 tab 行右侧——曾错放在入驻企业工具栏里。第26轮起个人入驻审核并入名片管理，
             本页只保留企业入驻，兑换码管理入口保留在页面级 -->
        <el-button class="tab-bar-action" @click="router.push('/apps/card/join-codes')">
          <SIcon name="voucher" size="small" color="#4e5969" />
          入驻兑换码
        </el-button>
      </div>

      <!-- 入驻企业列表 -->
      <div class="tab-content">
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
              <el-tag v-if="row.status === 'active'" type="success" size="small">正常</el-tag>
              <el-tag v-else-if="row.status === 'pending'" type="warning" size="small">待审核</el-tag>
              <el-tag v-else-if="row.status === 'rejected'" type="info" size="small">已拒绝</el-tag>
              <el-tag v-else type="danger" size="small">已停用</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === 'pending'">
                <el-button type="success" size="small" link @click="auditEnterprise(row, 'approve')">通过</el-button>
                <el-button type="danger" size="small" link @click="auditEnterprise(row, 'reject')">拒绝</el-button>
              </template>
              <template v-else>
                <el-button type="primary" size="small" link @click="viewEmployees(row)">员工管理</el-button>
                <el-button v-if="row.status === 'active'" type="danger" size="small" link @click="disableEnterprise(row)">停用</el-button>
                <el-button v-else-if="row.status !== 'pending' && row.status !== 'rejected'" type="success" size="small" link @click="enableEnterprise(row)">启用</el-button>
              </template>
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
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../../components/SIcon.vue';
import { publicApi } from '../../../../api';
import CardTabs from './CardTabs.vue';

const router = useRouter();

// 第26轮整合：入驻个人审核/启用停用已并入「名片管理」（身份列 + 行内直审 + 编辑弹窗认证开关），
// 本页只剩企业入驻；activeTab 变量与 individuals 相关状态一并移除
const enterprises = ref([]);
const employees = ref([]);
const entKeyword = ref('');
const showEmployees = ref(false);
const currentEnterprise = ref(null);

const filteredEnterprises = computed(() => {
  if (!entKeyword.value) return enterprises.value;
  const kw = entKeyword.value.toLowerCase();
  return enterprises.value.filter(e => (e.name || '').toLowerCase().includes(kw));
});

onMounted(() => {
  loadEnterprises();
});

async function loadEnterprises() {
  try {
    const res = await publicApi.get('/card-market/enterprises');
    enterprises.value = res.enterprises || [];
  } catch (e) {
    console.error('加载入驻企业失败', e);
  }
}

function auditEnterprise(row, action) {
  const t = action === 'approve' ? '通过' : '拒绝';
  ElMessageBox.confirm(`确定${t}「${row.name}」的入驻申请吗？${action === 'approve' ? '通过后企业主体及其管理员立即获得平台内权限。' : '拒绝后对方可修改资料重新申请。'}`, `${t}入驻申请`, {
    type: action === 'approve' ? 'success' : 'warning',
  }).then(async () => {
    try {
      await publicApi.post('/card-market/apply/audit', { type: 'enterprise', id: row.id, action });
      ElMessage.success(`已${t}`);
      loadEnterprises();
    } catch (e) {
      ElMessage.error(e.message || '操作失败');
    }
  }).catch(() => {});
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
.tenant-manage-page { padding: 0; }

.content-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.tab-bar { display: flex; border-bottom: 1px solid #f2f3f5; padding: 0 20px; }
/* 页面级操作按钮：靠 tab 行右侧（不随 tab 切换隐藏） */
.tab-bar-action { margin-left: auto; align-self: center; }
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
