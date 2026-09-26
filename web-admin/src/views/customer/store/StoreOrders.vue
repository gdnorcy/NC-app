<template>
  <div>
    <AppPageHeader title="门店订单" desc="商城二期：门店自提订单核销 / 确认收款 / 售后处理（store_admin 自动绑定本门店，租户管理员按门店查看）">
      <template #default>
        <el-select v-if="!storeAdmin" v-model="storeId" placeholder="选择门店" style="width: 220px" @change="storeId && (tab = 'orders', loadOrders(1), loadAfterSales(1))">
          <el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-tag v-else type="primary" effect="plain">{{ storeName || '本门店' }}</el-tag>
      </template>
    </AppPageHeader>

    <el-card v-if="storeAdmin" class="store-tip">
      当前身份：门店管理员（自动限定本门店订单，不可查看其他门店）
    </el-card>

    <el-card>
      <el-tabs v-model="tab">
        <!-- ============ 门店订单 ============ -->
        <el-tab-pane label="门店订单" name="orders">
          <el-form inline class="filter-bar">
            <el-form-item label="订单状态">
              <el-select v-model="fStatus" placeholder="全部" clearable style="width: 130px" @change="loadOrders(1)">
                <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="核销状态">
              <el-select v-model="fVerify" placeholder="全部" clearable style="width: 130px" @change="loadOrders(1)">
                <el-option label="待核销" value="pending" />
                <el-option label="已核销" value="verified" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="loadOrders(1)">查询</el-button>
              <el-button @click="resetOrders">重置</el-button>
            </el-form-item>
          </el-form>

          <el-table v-loading="loading" :data="orders" size="default">
            <el-table-column prop="order_no" label="订单号" width="170" />
            <el-table-column label="商品" min-width="180">
              <template #default="{ row }">
                <div v-for="it in row.items || []" :key="it.id" class="goods-line">
                  {{ it.goods_title }}<span v-if="it.spec_json" class="muted">（{{ specText(it.spec_json) }}）</span>
                  <span class="muted">×{{ it.num }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="买家" width="110">
              <template #default="{ row }">{{ row.buyerName || '-' }}</template>
            </el-table-column>
            <el-table-column label="金额" width="90">
              <template #default="{ row }">¥{{ row.payAmountY || row.totalAmountY }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }"><el-tag :type="statusTag(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
            </el-table-column>
            <el-table-column label="核销" width="120">
              <template #default="{ row }">
                <el-tag v-if="row.verify_status === 'verified'" type="success" size="small">已核销</el-tag>
                <el-tag v-else type="info" size="small">待核销 {{ row.pickup_code }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="下单时间" width="160" />
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.delivery_mode === 'pickup' && row.status === 'paid' && row.verify_status !== 'verified'" size="small" type="primary" link @click="openVerify(row)">核销</el-button>
                <el-button v-if="row.delivery_mode === 'pickup' && row.status === 'pending' && confirmEnabled" size="small" type="warning" link @click="confirmPay(row)">确认收款</el-button>
                <el-button size="small" link @click="openDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next, total" class="pager" @current-change="loadOrders" />
        </el-tab-pane>

        <!-- ============ 售后处理 ============ -->
        <el-tab-pane label="售后处理" name="afterSales">
          <el-table v-loading="asLoading" :data="afterSales" size="default">
            <el-table-column prop="order_no" label="订单号" width="170" />
            <el-table-column label="商品" min-width="180">
              <template #default="{ row }">{{ row.goods_desc || '-' }}</template>
            </el-table-column>
            <el-table-column label="买家" width="110">
              <template #default="{ row }">{{ row.nickname || '-' }}</template>
            </el-table-column>
            <el-table-column label="申请金额" width="100">
              <template #default="{ row }">¥{{ row.amountY || row.orderPayAmountY }}</template>
            </el-table-column>
            <el-table-column label="原因" min-width="140">
              <template #default="{ row }">{{ row.reason || '-' }}<div v-if="row.refuse_reason" class="muted">拒绝：{{ row.refuse_reason }}</div></template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><el-tag :type="asStatusTag(row.status)">{{ asStatusLabel(row.status) }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="created_at" label="申请时间" width="160" />
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 'pending'">
                  <el-button size="small" type="primary" link @click="agreeRefund(row)">同意退款</el-button>
                  <el-button size="small" type="danger" link @click="refuseRefund(row)">拒绝</el-button>
                </template>
                <span v-else class="muted">已处理</span>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination v-model:current-page="asPage" :page-size="pageSize" :total="asTotal" layout="prev, pager, next, total" class="pager" @current-change="loadAfterSales" />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 订单详情抽屉 -->
    <el-drawer v-model="detailVisible" title="订单详情" size="480px">
      <template v-if="detail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="订单号">{{ detail.order_no }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusLabel(detail.status) }} / 核销 {{ detail.verify_status === 'verified' ? '已核销' : '待核销' }}</el-descriptions-item>
          <el-descriptions-item label="配送方式">{{ detail.delivery_mode === 'pickup' ? '到店自提' : '快递配送' }}</el-descriptions-item>
          <el-descriptions-item label="核销码">{{ detail.pickup_code || '-' }}</el-descriptions-item>
          <el-descriptions-item label="商品金额">¥{{ detail.totalAmountY }}</el-descriptions-item>
          <el-descriptions-item label="实付金额">¥{{ detail.payAmountY }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ detail.created_at }}</el-descriptions-item>
          <el-descriptions-item label="买家">{{ detail.buyerName || '-' }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>

    <!-- 核销弹窗 -->
    <el-dialog v-model="verifyVisible" title="门店核销" width="420px">
      <p class="muted">请输入顾客提供的 6 位核销码（订单 #{{ verifyTarget?.order_no }}）</p>
      <el-input v-model="verifyCode" placeholder="6 位核销码" maxlength="6" style="width: 220px" @keyup.enter="doVerify" />
      <template #footer>
        <el-button @click="verifyVisible = false">取消</el-button>
        <el-button type="primary" :loading="verifyLoading" @click="doVerify">确认核销</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const storeAdmin = ref(false); // 后端返回 storeAdmin=true 表示当前账号是门店管理员
const storeName = ref('');
const storeId = ref(null);
const stores = ref([]);

const tab = ref('orders');
const statusOptions = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待支付' },
  { value: 'paid', label: '已支付' },
  { value: 'closed', label: '已关闭' },
  { value: 'refunding', label: '退款中' },
  { value: 'refunded', label: '已退款' },
];
const STATUS_MAP = {
  pending: { label: '待支付', tag: 'warning' },
  paid: { label: '已支付', tag: 'primary' },
  closed: { label: '已关闭', tag: 'info' },
  refunding: { label: '退款中', tag: 'warning' },
  refunded: { label: '已退款', tag: 'danger' },
  done: { label: '已完成', tag: 'success' },
};
const AS_MAP = {
  pending: { label: '待处理', tag: 'warning' },
  processing: { label: '处理中', tag: 'primary' },
  refunded: { label: '已退款', tag: 'danger' },
  cancelled: { label: '已拒绝', tag: 'info' },
};
const statusLabel = (s) => STATUS_MAP[s]?.label || s;
const statusTag = (s) => STATUS_MAP[s]?.tag || 'info';
const asStatusLabel = (s) => AS_MAP[s]?.label || s;
const asStatusTag = (s) => AS_MAP[s]?.tag || 'info';
const specText = (s) => { try { return Object.entries(JSON.parse(s)).map(([k, v]) => `${k}:${v}`).join(' / '); } catch { return s; } };

const fStatus = ref('');
const fVerify = ref('');
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const orders = ref([]);
const loading = ref(false);
const confirmEnabled = ref(false);

const asPage = ref(1);
const asTotal = ref(0);
const afterSales = ref([]);
const asLoading = ref(false);

const detailVisible = ref(false);
const detail = ref(null);
const verifyVisible = ref(false);
const verifyTarget = ref(null);
const verifyCode = ref('');
const verifyLoading = ref(false);

/** 拉取门店列表（租户管理员选门店） */
async function loadStores() {
  try {
    const r = await customerApiCall.get('/store', { params: { status: 1, pageSize: 100 } });
    stores.value = r.list || [];
    if (stores.value.length && !storeId.value) {
      storeId.value = stores.value[0].id;
      loadOrders(1); loadAfterSales(1);
    }
  } catch (e) { ElMessage.error(String(e)); }
}

async function loadOrders(p = page.value) {
  if (!storeAdmin.value && !storeId.value) return;
  page.value = p;
  loading.value = true;
  try {
    const params = { status: fStatus.value, verifyStatus: fVerify.value, page: p, pageSize };
    if (!storeAdmin.value) params.storeId = storeId.value;
    const r = await customerApiCall.get('/store/orders', { params });
    orders.value = r.list || [];
    total.value = r.total || 0;
    if (r.store) { storeName.value = r.store.name; storeId.value = r.store.id; }
    if (r.storeAdmin) storeAdmin.value = true;
  } catch (e) { ElMessage.error(String(e)); }
  finally { loading.value = false; }
}

async function loadAfterSales(p = asPage.value) {
  if (!storeAdmin.value && !storeId.value) return;
  asPage.value = p;
  asLoading.value = true;
  try {
    const params = { page: p, pageSize };
    if (!storeAdmin.value) params.storeId = storeId.value;
    const r = await customerApiCall.get('/store/after-sales', { params });
    afterSales.value = r.list || [];
    asTotal.value = r.total || 0;
  } catch (e) { ElMessage.error(String(e)); }
  finally { asLoading.value = false; }
}

function resetOrders() { fStatus.value = ''; fVerify.value = ''; loadOrders(1); }

function openDetail(row) { detail.value = row; detailVisible.value = true; }

function openVerify(row) { verifyTarget.value = row; verifyCode.value = ''; verifyVisible.value = true; }

async function doVerify() {
  if (!/^\d{6}$/.test(verifyCode.value)) { ElMessage.warning('请输入 6 位数字核销码'); return; }
  verifyLoading.value = true;
  try {
    const body = { code: verifyCode.value };
    if (!storeAdmin.value) body.storeId = storeId.value;
    await customerApiCall.post(`/store/orders/${verifyTarget.value.id}/verify`, body);
    ElMessage.success('核销成功');
    verifyVisible.value = false;
    loadOrders(page.value); loadAfterSales(asPage.value);
  } catch (e) { ElMessage.error(String(e)); }
  finally { verifyLoading.value = false; }
}

async function confirmPay(row) {
  try {
    await ElMessageBox.confirm(`确认已收到该自提订单的线下付款？（订单 #${row.order_no}）`, '门店确认收款', { type: 'warning' });
    const body = {};
    if (!storeAdmin.value) body.storeId = storeId.value;
    await customerApiCall.post(`/store/orders/${row.id}/confirm-pay`, body);
    ElMessage.success('已确认收款');
    loadOrders(page.value);
  } catch (e) { if (e !== 'cancel') ElMessage.error(String(e)); }
}

async function agreeRefund(row) {
  try {
    const { value } = await ElMessageBox.prompt('请输入退款金额（元）', '同意退款', {
      inputValue: row.amountY || row.orderPayAmountY,
      inputPattern: /^\d+(\.\d{1,2})?$/,
      inputErrorMessage: '金额格式不正确',
    });
    const body = { amount: Number(value) };
    if (!storeAdmin.value) body.storeId = storeId.value;
    await customerApiCall.post(`/store/after-sales/${row.id}/agree`, body);
    ElMessage.success('已同意退款');
    loadAfterSales(asPage.value);
  } catch (e) { if (e !== 'cancel') ElMessage.error(String(e)); }
}

async function refuseRefund(row) {
  try {
    const { value } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝退款', { inputPattern: /.+/, inputErrorMessage: '请填写原因' });
    const body = { reason: value };
    if (!storeAdmin.value) body.storeId = storeId.value;
    await customerApiCall.post(`/store/after-sales/${row.id}/refuse`, body);
    ElMessage.success('已拒绝');
    loadAfterSales(asPage.value);
  } catch (e) { if (e !== 'cancel') ElMessage.error(String(e)); }
}

onMounted(async () => {
  // 先尝试 store_admin 直连（自动绑定本门店）；租户管理员无 storeId 会被 400 拒绝 → 走选店流程
  try {
    const r = await customerApiCall.get('/store/orders', { params: { page: 1, pageSize } });
    orders.value = r.list || [];
    total.value = r.total || 0;
    if (r.store) { storeName.value = r.store.name; storeId.value = r.store.id; }
    if (r.storeAdmin) {
      storeAdmin.value = true;
      await loadAfterSales(1);
      return;
    }
  } catch { /* 非 store_admin：忽略，进入租户管理员选店流程 */ }
  await loadStores();
  await loadAfterSales(1);
});
</script>

<style scoped>
.store-tip { margin-bottom: 12px; }
.filter-bar { margin-bottom: 8px; }
.goods-line { line-height: 1.6; }
.muted { color: #86909c; font-size: 12px; margin-left: 4px; }
.pager { margin-top: 14px; justify-content: flex-end; }
</style>
