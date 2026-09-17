<template>
  <div class="after-sale-page">
    <!-- 状态 Tab（对齐菜鸟云：待处理/处理中/退款完成/退款取消/全部） -->
    <div class="stabs">
      <div v-for="s in statusTabs" :key="s.value" class="stab" :class="{ active: q.status === s.value }" @click="switchStatus(s.value)">
        {{ s.label }}
      </div>
    </div>

    <AppPageHeader title="售后订单" desc="商品订单售后处理（1:1 复刻菜鸟云 duoproducts/service）">
      <el-input v-model="q.keyword" placeholder="售后单号/原订单号/手机/昵称/商品名称" clearable style="width: 260px" @keyup.enter="load" />
      <el-button type="primary" @click="load">搜索</el-button>
      <el-button @click="exportCsv">导出</el-button>
    </AppPageHeader>

    <div class="card">
      <el-table :data="list" v-loading="loading">
        <el-table-column label="订单信息" min-width="240">
          <template #default="{ row }">
            <div class="o-no">{{ row.after_sale_no }}</div>
            <div class="o-item">原订单号：{{ row.order_no }}</div>
            <div class="o-item">{{ row.goods_desc }}</div>
          </template>
        </el-table-column>
        <el-table-column label="收货信息" width="160">
          <template #default="{ row }">
            <div v-if="row.receiver_name">{{ row.receiver_name }} {{ row.receiver_phone }}</div>
            <span v-else class="sub">—</span>
          </template>
        </el-table-column>
        <el-table-column label="售后类型" width="100">
          <template #default="{ row }">{{ row.type === 'return' ? '退货退款' : '仅退款' }}</template>
        </el-table-column>
        <el-table-column label="售后状态" width="110">
          <template #default="{ row }">
            <el-tag size="small" effect="light" :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="退款金额" width="100">
          <template #default="{ row }">
            <span class="amt">¥{{ row.amountY }}</span>
            <div class="sub">订单实付 ¥{{ row.orderPayAmountY }}</div>
          </template>
        </el-table-column>
        <el-table-column label="退款理由" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.reason || '—' }}</span>
            <div v-if="row.status === 'cancelled' && row.refuse_reason" class="refuse">拒绝原因：{{ row.refuse_reason }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button link type="primary" @click="openAgree(row)">同意</el-button>
              <el-button link type="danger" @click="openRefuse(row)">拒绝</el-button>
            </template>
            <span v-else class="sub">—</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !list.length" description="暂无售后订单" />
    </div>

    <!-- 同意退款弹窗（对齐菜鸟云：可填金额，最大为订单实付） -->
    <el-dialog v-model="agreeShow" title="同意退款" width="440px">
      <el-form label-width="100px">
        <el-form-item label="退款金额">
          <el-input-number v-model="agreeAmount" :min="0.01" :max="agreeMax" :precision="2" controls-position="right" style="width: 200px" />
          <span class="sub" style="margin-left: 8px">最大可退 ¥{{ agreeMax.toFixed(2) }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="agreeShow = false">取消</el-button>
        <el-button type="primary" :loading="agreeLoading" @click="submitAgree">确定</el-button>
      </template>
    </el-dialog>

    <!-- 拒绝弹窗（原因必填） -->
    <el-dialog v-model="refuseShow" title="拒绝退款" width="440px">
      <el-form label-width="100px">
        <el-form-item label="拒绝原因" required>
          <el-input v-model="refuseReason" type="textarea" :rows="3" placeholder="请填写拒绝原因" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refuseShow = false">取消</el-button>
        <el-button type="danger" :loading="refuseLoading" @click="submitRefuse">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import { customerApiCall } from '../../../api';

const statusTabs = [
  { label: '待处理', value: 'pending' },
  { label: '处理中', value: 'processing' },
  { label: '退款完成', value: 'refunded' },
  { label: '退款取消', value: 'cancelled' },
  { label: '全部', value: '' },
];
const STATUS = {
  pending: ['待处理', 'warning'], processing: ['处理中', 'primary'],
  refunded: ['退款完成', 'success'], cancelled: ['退款取消', 'info'],
};
const statusText = (s) => STATUS[s]?.[0] || s;
const statusType = (s) => STATUS[s]?.[1] || 'info';

const list = ref([]);
const loading = ref(false);
const q = reactive({ status: '', keyword: '' });
function switchStatus(v) { q.status = v; load(); }

async function load() {
  loading.value = true;
  try {
    list.value = (await customerApiCall.get('/goods/after-sales', { params: { ...q } })).list || [];
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}
function exportCsv() {
  window.open(`/api/customer/goods/after-sales/export?status=${q.status}&keyword=${encodeURIComponent(q.keyword)}`, '_blank');
}

// 同意
const agreeShow = ref(false);
const agreeAmount = ref(0);
const agreeMax = ref(0);
const agreeLoading = ref(false);
const currentRow = ref(null);
function openAgree(row) {
  currentRow.value = row;
  agreeMax.value = Number(row.orderPayAmountY);
  agreeAmount.value = Number(row.orderPayAmountY);
  agreeShow.value = true;
}
async function submitAgree() {
  agreeLoading.value = true;
  try {
    await customerApiCall.post(`/goods/after-sales/${currentRow.value.id}/agree`, { amount: agreeAmount.value });
    ElMessage.success('已同意，进入处理中');
    agreeShow.value = false;
    load();
  } catch (e) { ElMessage.error(e); } finally { agreeLoading.value = false; }
}

// 拒绝
const refuseShow = ref(false);
const refuseReason = ref('');
const refuseLoading = ref(false);
function openRefuse(row) {
  currentRow.value = row;
  refuseReason.value = '';
  refuseShow.value = true;
}
async function submitRefuse() {
  if (!refuseReason.value.trim()) { ElMessage.warning('请填写拒绝原因'); return; }
  refuseLoading.value = true;
  try {
    await customerApiCall.post(`/goods/after-sales/${currentRow.value.id}/refuse`, { reason: refuseReason.value });
    ElMessage.success('已拒绝');
    refuseShow.value = false;
    load();
  } catch (e) { ElMessage.error(e); } finally { refuseLoading.value = false; }
}

onMounted(load);
</script>

<style scoped>
.after-sale-page { padding: 0 0 20px; }
.card { background: #fff; border-radius: 8px; padding: 20px; }
.stabs { display: flex; gap: 8px; margin-bottom: 16px; }
.stab { padding: 7px 18px; border-radius: 8px; background: #F2F3F5; color: #4E5969; font-size: 13px; cursor: pointer; }
.stab.active { background: #E8F3FF; color: #165DFF; font-weight: 500; }
.o-no { font-weight: 500; color: #1D2129; }
.o-item { font-size: 12px; color: #86909C; line-height: 1.7; }
.amt { color: #F53F3F; font-weight: 500; }
.sub { font-size: 12px; color: #86909C; }
.refuse { font-size: 12px; color: #F53F3F; margin-top: 2px; }
</style>
