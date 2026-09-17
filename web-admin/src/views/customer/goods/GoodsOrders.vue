<template>
  <div class="goods-orders">
    <!-- 页头：标题 + 状态筛选（AppPageHeader 规范） -->
    <div class="page-head">
      <div>
        <div class="page-title">商品订单</div>
        <div class="page-desc">订单闭环：下单 → 支付 → 扣库存/分销分账 → 发货 → 完成；退款自动恢复库存</div>
      </div>
    </div>

    <!-- 状态 Tab -->
    <div class="status-tabs">
      <div
        v-for="t in statusTabs"
        :key="t.value"
        class="stab"
        :class="{ active: status === t.value }"
        @click="switchStatus(t.value)"
      >{{ t.label }}</div>
    </div>

    <!-- 搜索 -->
    <div class="toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索订单号 / 商品名称"
        clearable
        style="width: 260px"
        @keyup.enter="load"
        @clear="load"
      >
        <template #append><el-button @click="load">搜索</el-button></template>
      </el-input>
      <span class="total-text">共 {{ total }} 个订单</span>
    </div>

    <!-- 订单表格 -->
    <el-table v-loading="loading" :data="list" style="width: 100%">
      <el-table-column label="订单号" width="210">
        <template #default="{ row }">
          <span class="mono">{{ row.order_no }}</span>
        </template>
      </el-table-column>
      <el-table-column label="买家" width="120">
        <template #default="{ row }">
          <div class="buyer">
            <el-avatar :size="26" :src="row.buyerAvatar || ''">{{ (row.buyerName || '?')[0] }}</el-avatar>
            <span>{{ row.buyerName }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="商品" min-width="220">
        <template #default="{ row }">
          <div v-for="(it, i) in row.items" :key="i" class="item-cell">
            <span class="item-title">{{ it.title }}</span>
            <span v-if="it.num > 1" class="item-num">×{{ it.num }}</span>
            <span class="item-type" :class="'t-' + it.goods_type">{{ typeLabel(it.goods_type) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="实付" width="110" align="right">
        <template #default="{ row }">
          <span class="pay-amount">¥{{ row.payAmountY }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="下单时间" width="170">
        <template #default="{ row }">
          <span class="time">{{ row.created_at }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button v-if="row.status === 'paid'" link type="primary" @click="ship(row)">发货</el-button>
          <el-button v-if="['paid', 'shipped'].includes(row.status)" link type="success" @click="done(row)">完成</el-button>
          <el-button v-if="['paid', 'shipped'].includes(row.status)" link type="danger" @click="refund(row)">退款</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pager">
      <el-pagination
        layout="prev, pager, next, total"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="(p) => { page = p; load(); }"
      />
    </div>

    <!-- 订单详情弹窗 -->
    <el-dialog v-model="detailVisible" title="订单详情" width="640px" top="6vh">
      <div v-if="detail" class="detail">
        <div class="d-section">
          <div class="d-title">订单信息</div>
          <el-descriptions :column="2" size="small" border>
            <el-descriptions-item label="订单号"><span class="mono">{{ detail.order_no }}</span></el-descriptions-item>
            <el-descriptions-item label="状态">{{ statusLabel(detail.status) }}</el-descriptions-item>
            <el-descriptions-item label="买家">{{ detail.buyerName }}</el-descriptions-item>
            <el-descriptions-item label="配送方式">{{ detail.delivery_mode === 'pickup' ? '门店自提' : '快递配送' }}</el-descriptions-item>
            <el-descriptions-item label="商品总额">¥{{ detail.totalAmountY }}</el-descriptions-item>
            <el-descriptions-item label="实付金额"><b>¥{{ detail.payAmountY }}</b></el-descriptions-item>
            <el-descriptions-item v-if="detail.receiver_name" label="收货人">{{ detail.receiver_name }} {{ detail.receiver_phone }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.receiver_address" label="收货地址">{{ detail.receiver_address }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.remark" label="买家备注">{{ detail.remark }}</el-descriptions-item>
            <el-descriptions-item label="下单时间">{{ detail.created_at }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.paid_at" label="支付时间">{{ detail.paid_at }}</el-descriptions-item>
          </el-descriptions>
        </div>
        <div class="d-section">
          <div class="d-title">商品明细</div>
          <el-table :data="detail.items" size="small">
            <el-table-column prop="title" label="商品" min-width="160" />
            <el-table-column label="规格" width="120">
              <template #default="{ row }">
                <span v-if="row.spec_json && row.spec_json !== '{}'">{{ specText(row.spec_json) }}</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="单价" width="90" align="right">
              <template #default="{ row }">¥{{ (row.price / 100).toFixed(2) }}</template>
            </el-table-column>
            <el-table-column prop="num" label="数量" width="70" align="center" />
            <el-table-column label="小计" width="100" align="right">
              <template #default="{ row }">¥{{ (row.price * row.num / 100).toFixed(2) }}</template>
            </el-table-column>
          </el-table>
        </div>
        <div class="d-section">
          <div class="d-title">状态记录</div>
          <el-timeline style="padding-left: 4px">
            <el-timeline-item v-for="(l, i) in detail.logs" :key="i" :timestamp="l.created_at">
              {{ logLabel(l.action) }}<span v-if="l.remark"> — {{ l.remark }}</span>
            </el-timeline-item>
          </el-timeline>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customerApiCall } from '../../../api';

const statusTabs = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待支付' },
  { value: 'paid', label: '已支付' },
  { value: 'shipped', label: '已发货' },
  { value: 'done', label: '已完成' },
  { value: 'refunded', label: '已退款' },
  { value: 'closed', label: '已关闭' },
];

const STATUS_MAP = {
  pending: { label: '待支付', tag: 'warning' },
  paid: { label: '已支付', tag: 'primary' },
  shipped: { label: '已发货', tag: 'info' },
  done: { label: '已完成', tag: 'success' },
  refunding: { label: '退款中', tag: 'warning' },
  refunded: { label: '已退款', tag: 'danger' },
  closed: { label: '已关闭', tag: 'info' },
};

const TYPE_MAP = { normal: '普通', carmi: '卡密', virtual: '虚拟' };
const LOG_MAP = {
  create: '创建订单', paid: '支付成功', auto_refund: '自动退款',
  ship: '商家发货', done: '订单完成', refund: '订单退款',
};

const status = ref('');
const keyword = ref('');
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const list = ref([]);
const loading = ref(false);
const detailVisible = ref(false);
const detail = ref(null);

const statusLabel = (s) => STATUS_MAP[s]?.label || s;
const statusTag = (s) => STATUS_MAP[s]?.tag || 'info';
const typeLabel = (t) => TYPE_MAP[t] || t;
const logLabel = (a) => LOG_MAP[a] || a;
const specText = (s) => { try { return Object.entries(JSON.parse(s)).map(([k, v]) => `${k}:${v}`).join(' / '); } catch { return s; } };

async function load() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/goods/orders', {
      params: { status: status.value, keyword: keyword.value, page: page.value, pageSize },
    });
    list.value = res.list || [];
    total.value = res.total || 0;
  } catch (e) {
    ElMessage.error(e || '加载失败');
  } finally {
    loading.value = false;
  }
}

function switchStatus(v) {
  if (status.value === v) return;
  status.value = v;
  page.value = 1;
  load();
}

async function openDetail(row) {
  try {
    const res = await customerApiCall.get(`/goods/orders/${row.id}`);
    detail.value = res;
    detailVisible.value = true;
  } catch (e) {
    ElMessage.error(e || '加载失败');
  }
}

async function ship(row) {
  try {
    await ElMessageBox.confirm(`确认对订单 ${row.order_no} 发货？`, '发货确认', { type: 'warning' });
  } catch { return; }
  try {
    await customerApiCall.post(`/goods/orders/${row.id}/ship`);
    ElMessage.success('已发货');
    load();
  } catch (e) {
    ElMessage.error(e || '发货失败');
  }
}

async function done(row) {
  try {
    await ElMessageBox.confirm(`确认将订单 ${row.order_no} 标记为完成？`, '完成确认', { type: 'info' });
  } catch { return; }
  try {
    await customerApiCall.post(`/goods/orders/${row.id}/done`);
    ElMessage.success('订单已完成');
    load();
  } catch (e) {
    ElMessage.error(e || '操作失败');
  }
}

async function refund(row) {
  try {
    await ElMessageBox.confirm(`确认对订单 ${row.order_no} 退款？退款将自动恢复库存。`, '退款确认', { type: 'warning' });
  } catch { return; }
  try {
    await customerApiCall.post(`/goods/orders/${row.id}/refund`);
    ElMessage.success('已退款');
    load();
  } catch (e) {
    ElMessage.error(e || '退款失败');
  }
}

onMounted(load);
</script>

<style scoped>
.goods-orders {
  padding: 4px 2px;
}
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1d2129;
  line-height: 1.4;
}
.page-desc {
  font-size: 13px;
  color: #86909c;
  margin-top: 4px;
  line-height: 1.5;
}
.status-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.stab {
  padding: 6px 16px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e5e6eb;
  color: #4e5969;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.stab:hover { color: #165dff; border-color: #165dff; }
.stab.active {
  background: #e8f3ff;
  border-color: #165dff;
  color: #165dff;
  font-weight: 500;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.total-text { font-size: 13px; color: #86909c; }
.mono { font-family: Menlo, Consolas, monospace; font-size: 12px; }
.buyer { display: flex; align-items: center; gap: 8px; }
.item-cell { display: flex; align-items: center; gap: 6px; line-height: 22px; }
.item-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; }
.item-num { color: #86909c; font-size: 12px; }
.item-type { font-size: 11px; padding: 0 6px; border-radius: 4px; background: #f2f3f5; color: #4e5969; }
.item-type.t-carmi { background: #fff7e8; color: #ff7d00; }
.item-type.t-gift { background: #e8f3ff; color: #165dff; }
.pay-amount { font-weight: 600; color: #f53f3f; }
.time { color: #86909c; font-size: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.detail { max-height: 60vh; overflow-y: auto; }
.d-section { margin-bottom: 20px; }
.d-title { font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 10px; }
</style>
