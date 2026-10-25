<template>
  <div class="join-code-page">
    <CardTabs />

    <AppPageHeader title="入驻兑换码" desc="个人入驻凭证：一人一码、用完即废。生成后发给用户，用户在入驻时填入，审核通过后自动核销">
      <el-button @click="loadAll">
        <SIcon name="dynamic" size="small" color="#4e5969" />
        刷新
      </el-button>
      <el-button :disabled="!stats.unused" @click="exportCodes">导出未使用</el-button>
      <el-button type="primary" @click="openGen">生成兑换码</el-button>
    </AppPageHeader>

    <!-- 统计 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">累计生成</div>
        <div class="stat-num">{{ stats.total || 0 }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">未使用</div>
        <div class="stat-num ok">{{ stats.unused || 0 }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已占用（待审）</div>
        <div class="stat-num warn">{{ stats.occupied || 0 }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已核销</div>
        <div class="stat-num muted">{{ stats.consumed || 0 }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已作废</div>
        <div class="stat-num danger">{{ stats.voided || 0 }}</div>
      </div>
    </div>

    <div class="content-card">
      <div class="toolbar">
        <el-select v-model="filter.batchId" placeholder="全部批次" clearable style="width: 220px" @change="loadCodes">
          <el-option v-for="b in batches" :key="b.id" :label="`${b.name}（${b.total}）`" :value="b.id" />
        </el-select>
        <el-radio-group v-model="filter.status" size="small" @change="loadCodes">
          <el-radio-button :value="''">全部</el-radio-button>
          <el-radio-button :value="0">未使用</el-radio-button>
          <el-radio-button :value="1">已占用</el-radio-button>
          <el-radio-button :value="2">已核销</el-radio-button>
          <el-radio-button :value="3">已作废</el-radio-button>
        </el-radio-group>
        <el-input v-model="filter.key" placeholder="搜索兑换码" clearable style="width: 200px" @keyup.enter="loadCodes" />
        <div class="toolbar-right">
          <el-button type="danger" plain size="small" :disabled="!selection.length" @click="batchVoid">批量作废（{{ selection.length }}）</el-button>
        </div>
      </div>

      <el-table :data="list" v-loading="loading" size="default" @selection-change="(rows) => (selection = rows)">
        <el-table-column type="selection" width="44" :selectable="(row) => row.status === 0 || row.status === 1" />
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="兑换码" min-width="150">
          <template #default="{ row }">
            <span class="code-text">{{ row.code }}</span>
            <el-button link type="primary" size="small" @click="copyCode(row.code)">复制</el-button>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small" effect="light">{{ row.statusLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="使用人" min-width="140">
          <template #default="{ row }">
            <span v-if="row.usedBy">{{ row.usedByName || row.usedByPhone || `用户#${row.usedBy}` }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="入驻主体" min-width="120">
          <template #default="{ row }">
            <span v-if="row.applyName">{{ row.applyName }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="usedAt" label="使用时间" width="170" />
        <el-table-column label="有效期" width="120">
          <template #default="{ row }">
            <span v-if="row.expiresAt">{{ row.expiresAt }}</span>
            <span v-else class="muted">长期</span>
          </template>
        </el-table-column>
        <el-table-column label="批次" width="90">
          <template #default="{ row }">
            <span v-if="row.batchId">#{{ row.batchId }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" :disabled="row.status === 2 || row.status === 3" @click="voidOne(row)">作废</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          background layout="total, prev, pager, next"
          :total="total" :page-size="pageSize" :current-page="page"
          @current-change="(p) => { page = p; loadCodes(); }"
        />
      </div>

      <div class="empty-state" v-if="!loading && !list.length">
        <SIcon name="voucher" size="xlarge" color="#c9cdd4" />
        <div class="empty-text">还没有兑换码，点击右上角「生成兑换码」批量创建</div>
      </div>
    </div>

    <!-- 生成弹窗 -->
    <el-dialog v-model="genDlg.show" title="生成入驻兑换码" width="560px">
      <el-form label-width="110px">
        <el-form-item label="批次名称">
          <el-input v-model="genDlg.form.name" placeholder="留空按日期自动命名" maxlength="40" />
        </el-form-item>
        <el-form-item label="生成数量" required>
          <el-input-number v-model="genDlg.form.count" :min="1" :max="2000" />
          <div class="form-tip">单次最多 2000 个</div>
        </el-form-item>
        <el-form-item label="码长">
          <el-input-number v-model="genDlg.form.length" :min="6" :max="20" />
          <div class="form-tip">默认 10 位（大写字母+数字，已剔除 0/O/1/I/L 等易混淆字符）</div>
        </el-form-item>
        <el-form-item label="有效期">
          <el-date-picker v-model="genDlg.form.expiresAt" type="date" value-format="YYYY-MM-DD" placeholder="留空为长期有效" style="width: 220px" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="genDlg.form.remark" placeholder="仅后台可见，例如：发给 10 月线下活动客户" maxlength="100" />
        </el-form-item>
        <el-form-item label="用途">
          <el-tag size="small" effect="plain">个人入驻</el-tag>
          <div class="form-tip">当前仅个人入驻走兑换码；企业入驻仍使用「入驻口令」。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="genDlg.show = false">取消</el-button>
        <el-button type="primary" :loading="genDlg.saving" @click="doGenerate">生成</el-button>
      </template>
    </el-dialog>

    <!-- 生成结果（可直接复制走） -->
    <el-dialog v-model="resultDlg.show" title="生成成功" width="600px">
      <div class="result-head">
        共生成 <b>{{ resultDlg.codes.length }}</b> 个兑换码，请复制后发给用户：
      </div>
      <el-input :model-value="resultDlg.codes.join('\n')" type="textarea" :rows="12" readonly class="result-box" />
      <template #footer>
        <el-button @click="resultDlg.show = false">关闭</el-button>
        <el-button type="primary" @click="copyCode(resultDlg.codes.join('\n'))">全部复制</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../../components/SIcon.vue';
import { customerApiCall } from '../../../../api';
import CardTabs from './CardTabs.vue';

const stats = ref({ total: 0, unused: 0, occupied: 0, consumed: 0, voided: 0, batchCount: 0 });
const batches = ref([]);
const list = ref([]);
const selection = ref([]);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const filter = reactive({ batchId: null, status: '', key: '' });

const genDlg = reactive({
  show: false, saving: false,
  form: { name: '', count: 50, length: 10, expiresAt: '', remark: '' },
});
const resultDlg = reactive({ show: false, codes: [] });

onMounted(loadAll);

async function loadAll() {
  await Promise.all([loadStats(), loadBatches(), loadCodes()]);
}

async function loadStats() {
  try {
    stats.value = await customerApiCall.get('/join-code/stats');
  } catch (e) { /* 统计失败不阻断列表 */ }
}

async function loadBatches() {
  try {
    batches.value = await customerApiCall.get('/join-code/batches');
  } catch (e) { batches.value = []; }
}

async function loadCodes() {
  loading.value = true;
  try {
    const r = await customerApiCall.get('/join-code/codes', {
      params: { batchId: filter.batchId || '', status: filter.status, key: filter.key, page: page.value, pageSize: pageSize.value },
    });
    list.value = r.list;
    total.value = r.total;
  } catch (e) {
    ElMessage.error(e);
  } finally {
    loading.value = false;
  }
}

function statusType(s) {
  return ['info', 'warning', 'success', 'danger'][s] || 'info';
}

function openGen() {
  genDlg.form = { name: '', count: 50, length: 10, expiresAt: '', remark: '' };
  genDlg.show = true;
}

async function doGenerate() {
  if (!(genDlg.form.count > 0)) return ElMessage.warning('请输入生成数量');
  genDlg.saving = true;
  try {
    const r = await customerApiCall.post('/join-code/batches', {
      name: genDlg.form.name,
      count: genDlg.form.count,
      length: genDlg.form.length,
      expiresAt: genDlg.form.expiresAt,
      remark: genDlg.form.remark,
      applyType: 'individual',
    });
    resultDlg.codes = r.codes || [];
    resultDlg.show = true;
    genDlg.show = false;
    await loadAll();
  } catch (e) {
    ElMessage.error(e);
  } finally {
    genDlg.saving = false;
  }
}

async function copyCode(text) {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch (e) {
    ElMessage.warning('浏览器拒绝了剪贴板访问，请手动选中复制');
  }
}

async function exportCodes() {
  try {
    const r = await customerApiCall.get('/join-code/codes/export', {
      params: { batchId: filter.batchId || '', status: 0 },
    });
    if (!r.codes?.length) return ElMessage.warning('没有未使用的兑换码');
    await copyCode(r.codes.join('\n'));
    ElMessage.success(`已复制 ${r.codes.length} 个未使用兑换码`);
  } catch (e) {
    ElMessage.error(e);
  }
}

async function voidOne(row) {
  try {
    await ElMessageBox.confirm(`确定作废兑换码「${row.code}」吗？作废后不可恢复。`, '作废兑换码', { type: 'warning' });
    await customerApiCall.post(`/join-code/codes/${row.id}/void`);
    ElMessage.success('已作废');
    loadAll();
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e);
  }
}

async function batchVoid() {
  const ids = selection.value.map((r) => r.id);
  if (!ids.length) return;
  try {
    await ElMessageBox.confirm(`确定作废选中的 ${ids.length} 个兑换码吗？已核销的会跳过。`, '批量作废', { type: 'warning' });
    const r = await customerApiCall.post('/join-code/codes/batch-void', { ids });
    ElMessage.success(`已作废 ${r.voided} 个`);
    loadAll();
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e);
  }
}
</script>

<style scoped>
.join-code-page { padding: 0; }

.stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
.stat-card { background: #fff; border-radius: 8px; padding: 16px 18px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.stat-label { font-size: 12px; color: #86909c; }
.stat-num { font-size: 22px; font-weight: 700; color: #1d2129; margin-top: 4px; }
.stat-num.ok { color: #00b42a; }
.stat-num.warn { color: #ff7d00; }
.stat-num.danger { color: #f53f3f; }
.stat-num.muted { color: #86909c; }

.content-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); padding: 20px; }
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.toolbar-right { margin-left: auto; }

.code-text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: 1px; font-weight: 600; }
.muted { color: #c9cdd4; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 40px 0; }
.empty-text { font-size: 14px; color: #86909c; margin-top: 12px; }

.form-tip { font-size: 12px; color: #86909c; line-height: 1.6; margin-top: 4px; width: 100%; }
.result-head { font-size: 14px; color: #1d2129; margin-bottom: 10px; }
.result-box :deep(textarea) { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
</style>
