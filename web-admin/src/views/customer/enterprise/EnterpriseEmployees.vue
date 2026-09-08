<template>
  <div class="ent-employees">
    <div class="page-header">
      <div>
        <h2 class="page-title">企业员工</h2>
        <p class="page-desc">管理本企业员工、设置企业管理员；员工名片数据实时汇总</p>
      </div>
      <button class="btn-primary" @click="dialogVisible = true">添加员工</button>
    </div>

    <div class="toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索姓名 / 职位"
        clearable
        class="search-input"
        @keyup.enter="load"
        @clear="load"
      />
      <el-button @click="load">搜索</el-button>
    </div>

    <div class="tbl-card">
      <el-table :data="employees" stripe>
        <el-table-column label="员工" min-width="180">
          <template #default="{ row }">
            <div class="emp-cell">
              <el-avatar :size="32" :src="row.avatar || undefined" class="emp-avatar">{{ (row.name || row.nickname || '员')[0] }}</el-avatar>
              <div>
                <div class="emp-name">{{ row.name || row.nickname || '未命名' }}</div>
                <div class="emp-sub">{{ row.nickname && row.nickname !== row.name ? '昵称 ' + row.nickname : '' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="position" label="职位" min-width="120">
          <template #default="{ row }">{{ row.position || '-' }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" min-width="130">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column label="数据" width="140">
          <template #default="{ row }">
            <span class="data-num">{{ row.viewCount }} 访问 · {{ row.exchangeCount }} 交换</span>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="110">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small" effect="light">
              {{ row.role === 'admin' ? '企业管理员' : '员工' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.role !== 'admin'"
              link
              type="primary"
              @click="setRole(row, 'admin')"
            >设为管理员</el-button>
            <el-button
              v-else
              link
              @click="setRole(row, 'member')"
            >取消管理员</el-button>
            <el-button link type="danger" @click="removeEmp(row)">移出企业</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!employees.length" class="empty">暂无员工，点击右上角「添加员工」从已入驻人员中选择</div>
    </div>

    <!-- 添加员工 -->
    <el-dialog v-model="dialogVisible" title="添加员工" width="560px" :close-on-click-modal="false">
      <p class="dialog-tip">从已入驻的个人中，选择加入本企业（每人只能属于一个企业）</p>
      <el-input v-model="candKeyword" placeholder="搜索姓名 / 手机号" clearable class="cand-search" @input="filterCands" />
      <div class="cand-list">
        <div
          v-for="c in filteredCands"
          :key="c.userId"
          class="cand-item"
          :class="{ picked: picked === c.userId }"
          @click="picked = c.userId"
        >
          <el-avatar :size="30" :src="c.avatar || undefined">{{ (c.name || c.nickname || '员')[0] }}</el-avatar>
          <div class="cand-info">
            <div class="cand-name">{{ c.name || c.nickname || '未命名' }}</div>
            <div class="cand-sub">{{ c.position || '未设置职位' }}{{ c.phone ? ' · ' + c.phone : '' }}</div>
          </div>
          <el-radio :model-value="picked" :value="c.userId" class="cand-radio" />
        </div>
        <div v-if="!filteredCands.length" class="empty small">暂无可添加人员（未入驻个人，或均已加入企业）</div>
      </div>
      <div class="role-row">
        <span class="role-label">加入身份：</span>
        <el-radio-group v-model="newRole">
          <el-radio value="member">普通员工</el-radio>
          <el-radio value="admin">企业管理员</el-radio>
        </el-radio-group>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!picked" @click="addEmployee">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customerApiCall } from '../../../api';

const employees = ref([]);
const candidates = ref([]);
const keyword = ref('');
const candKeyword = ref('');
const dialogVisible = ref(false);
const picked = ref(null);
const newRole = ref('member');
const saving = ref(false);

const filteredCands = computed(() => {
  const k = candKeyword.value.trim();
  if (!k) return candidates.value;
  return candidates.value.filter(c =>
    (c.name || '').includes(k) || (c.nickname || '').includes(k) || (c.phone || '').includes(k)
  );
});

async function load() {
  try {
    const res = await customerApiCall.get('/enterprise/employees', { params: { keyword: keyword.value } });
    employees.value = res.employees || [];
  } catch (e) { ElMessage.error(e || '加载失败'); }
}
async function loadCands() {
  try {
    const res = await customerApiCall.get('/enterprise/candidates');
    candidates.value = res.candidates || [];
  } catch (e) { ElMessage.error(e || '加载失败'); }
}
function filterCands() {}

async function addEmployee() {
  saving.value = true;
  try {
    await customerApiCall.post('/enterprise/employees', { userId: picked.value, role: newRole.value });
    ElMessage.success('添加成功');
    dialogVisible.value = false;
    picked.value = null;
    load();
    loadCands();
  } catch (e) { ElMessage.error(e || '添加失败'); }
  finally { saving.value = false; }
}
async function setRole(row, role) {
  try {
    await customerApiCall.put(`/enterprise/employees/${row.userId}`, { role });
    ElMessage.success(role === 'admin' ? '已设为管理员' : '已取消管理员');
    load();
  } catch (e) { ElMessage.error(e || '操作失败'); }
}
async function removeEmp(row) {
  try {
    await ElMessageBox.confirm(`确认将「${row.name || row.nickname}」移出本企业？其名下客户将自动回收至本企业公海，名片不再计入企业数据。`, '移出确认', {
      confirmButtonText: '移出', cancelButtonText: '取消', type: 'warning',
    });
  } catch { return; }
  try {
    await customerApiCall.put(`/enterprise/employees/${row.userId}`, { action: 'remove' });
    ElMessage.success('已移出');
    load();
  } catch (e) { ElMessage.error(e || '操作失败'); }
}

onMounted(() => { load(); loadCands(); });
</script>

<style scoped>
.ent-employees { display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909c; margin: 4px 0 0; }
.btn-primary { background: #165dff; color: #fff; border: none; border-radius: 8px; padding: 9px 20px; font-size: 14px; cursor: pointer; transition: opacity 0.2s; }
.btn-primary:hover { opacity: 0.85; }
.toolbar { display: flex; gap: 12px; }
.search-input { width: 260px; }
.tbl-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.emp-cell { display: flex; align-items: center; gap: 10px; }
.emp-avatar { background: rgba(22,93,255,0.1); color: #165dff; flex-shrink: 0; }
.emp-name { font-size: 14px; color: #1d2129; }
.emp-sub { font-size: 12px; color: #86909c; }
.data-num { font-size: 13px; color: #4e5969; }
.dialog-tip { font-size: 13px; color: #86909c; margin: 0 0 12px; }
.cand-search { margin-bottom: 12px; }
.cand-list { max-height: 320px; overflow-y: auto; border: 1px solid #f2f3f5; border-radius: 8px; padding: 4px; }
.cand-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 6px; cursor: pointer; }
.cand-item:hover { background: #f7f8fa; }
.cand-item.picked { background: #e8f3ff; }
.cand-info { flex: 1; min-width: 0; }
.cand-name { font-size: 14px; color: #1d2129; }
.cand-sub { font-size: 12px; color: #86909c; }
.role-row { margin-top: 16px; display: flex; align-items: center; gap: 8px; }
.role-label { font-size: 14px; color: #4e5969; }
.empty { padding: 48px 0; text-align: center; color: #86909c; font-size: 13px; }
.empty.small { padding: 24px 0; }
</style>
