<template>
  <div>
    <div class="page-header"><h2 class="page-title">套餐与续费</h2></div>

    <!-- 当前套餐卡片 -->
    <div class="page-card current-plan">
      <div class="cp-left">
        <div class="cp-badge">{{ plan.plan?.name || '体验套餐' }}</div>
        <div class="cp-desc">{{ plan.plan?.description || '体验基础能力' }}</div>
      </div>
      <div class="cp-right">
        <div class="cp-item">
          <span class="cp-label">到期时间</span>
          <span class="cp-value">{{ plan.validUntil || '未开通（默认体验套餐）' }}</span>
        </div>
        <div class="cp-item">
          <span class="cp-label">计费周期</span>
          <span class="cp-value">{{ plan.cycle === 'month' ? '按月' : '按年' }}</span>
        </div>
      </div>
    </div>

    <!-- 用量进度 -->
    <div class="page-card">
      <h3 class="section-title">用量概览</h3>
      <div class="usage-grid">
        <div v-for="u in usageItems" :key="u.key" class="usage-item">
          <div class="usage-head">
            <span class="usage-name">{{ u.label }}</span>
            <span class="usage-num" :class="{ over: u.over }">{{ u.used }}/{{ u.limit }}</span>
          </div>
          <el-progress :percentage="u.pct" :color="u.over ? '#F53F3F' : '#165DFF'" :stroke-width="6" :show-text="false" />
        </div>
      </div>
      <div class="usage-note">存储用量仅统计本地存储场景（含瓦片估算）；远程存储场景不计入。短信用量按条计。</div>
    </div>

    <!-- 套餐选择 -->
    <div class="page-card">
      <h3 class="section-title">选择套餐</h3>
      <div class="plan-grid">
        <div v-for="p in plans" :key="p.id" class="plan-card" :class="{ current: p.id === plan.plan?.id }">
          <div class="plan-name">{{ p.name }}</div>
          <div class="plan-price">¥{{ p.price }}<span class="plan-cycle">/{{ p.cycle === 'month' ? '月' : '年' }}</span></div>
          <div class="plan-desc">{{ p.description }}</div>
          <ul class="plan-quota">
            <li>入驻个人 {{ p.quotas.max_individuals ?? '∞' }} 个</li>
            <li>入驻企业 {{ p.quotas.max_enterprises ?? '∞' }} 家</li>
            <li>全景场景 {{ p.quotas.max_scenes ?? '∞' }} 个</li>
            <li v-if="p.features.market_enabled">人脉集市（{{ p.quotas.max_market_items ?? '∞' }} 上架）</li>
            <li v-else>人脉集市未开通</li>
            <li v-if="p.features.distribution_enabled">二级分销已开通</li>
          </ul>
          <el-button
            :type="p.id === plan.plan?.id ? 'info' : 'primary'"
            :disabled="p.id === plan.plan?.id"
            style="width:100%"
            @click="purchase(p, 'subscribe')"
          >{{ p.id === plan.plan?.id ? '当前套餐' : '立即开通' }}</el-button>
          <el-button v-if="p.id === plan.plan?.id" text type="primary" style="width:100%;margin-top:6px" @click="purchase(p, 'renew')">续费一年</el-button>
        </div>
      </div>
    </div>

    <!-- 发票 -->
    <div class="page-card">
      <h3 class="section-title">发票管理</h3>
      <el-table :data="invoices" stripe>
        <el-table-column prop="invoiceNo" label="发票单号" width="180" />
        <el-table-column prop="orderNo" label="关联订单" width="200" />
        <el-table-column prop="title" label="抬头" min-width="160" />
        <el-table-column label="金额" width="100">
          <template #default="{ row }">¥{{ row.amount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'issued' ? 'success' : row.status === 'pending' ? 'warning' : 'info'" size="small">
              {{ row.status === 'issued' ? '已开票' : row.status === 'pending' ? '待开票' : '已驳回' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button v-if="row.status === 'rejected'" link type="primary" @click="applyInvoice(row)">重新申请</el-button>
            <el-button v-else link type="primary" @click="applyInvoice(row)">申请开票</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!invoices.length" description="暂无发票记录" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { customerApiCall, customerPaymentCall } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const plan = ref({});
const plans = ref([]);
const invoices = ref([]);

async function load() {
  try {
    const [planRes, listRes, invRes] = await Promise.all([
      customerApiCall.get('/billing/plan'),
      customerApiCall.get('/billing/plans'),
      customerApiCall.get('/billing/invoices'),
    ]);
    plan.value = planRes;
    plans.value = listRes.plans || [];
    invoices.value = invRes.invoices || [];
  } catch (e) { ElMessage.error(typeof e === 'string' ? e : '加载套餐信息失败'); }
}
onMounted(load);

const usageItems = computed(() => {
  const q = plan.value.plan?.quotas || {};
  const u = plan.value.usage || {};
  const items = [
    { key: 'individuals', label: '入驻个人', used: u.individuals || 0, limit: q.max_individuals },
    { key: 'enterprises', label: '入驻企业', used: u.enterprises || 0, limit: q.max_enterprises },
    { key: 'employees', label: '企业员工', used: u.employees || 0, limit: q.max_employees },
    { key: 'scenes', label: '全景场景', used: u.scenes || 0, limit: q.max_scenes },
    { key: 'marketItems', label: '集市上架', used: u.marketItems || 0, limit: q.max_market_items },
    { key: 'storageMb', label: '存储空间(MB)', used: u.storageMb || 0, limit: q.max_storage_mb },
  ];
  return items.map((it) => {
    const unlimited = it.limit === undefined || it.limit === null || it.limit < 0;
    const limit = unlimited ? Math.max(it.used, 1) : it.limit;
    const pct = unlimited ? (it.used > 0 ? 5 : 0) : Math.min(100, Math.round((it.used / (limit || 1)) * 100));
    return { ...it, limit: unlimited ? '不限' : limit, pct, over: !unlimited && it.used > limit };
  });
});

async function purchase(p, action) {
  const tip = action === 'renew' ? `确认续费「${p.name}」一年，支付 ¥${p.price}？` : `确认开通「${p.name}」，支付 ¥${p.price}？`;
  try {
    await ElMessageBox.confirm(tip, '支付确认', { type: 'warning' });
    const res = await customerApiCall.post('/billing/purchase', { planId: p.id, action });
    ElMessage.info('订单已创建，正在拉起支付…');
    // 当前环境为模拟支付：直接调用 mock-pay（真实接入后改为拉起收银台）
    const pay = await customerPaymentCall.post('/payment/mock-pay', { orderNo: res.order.orderNo });
    if (pay.order?.status === 'paid') {
      ElMessage.success(action === 'renew' ? '续费成功，服务期已顺延' : '开通成功');
      load();
    } else {
      ElMessage.warning('支付未完成，可在「我的账单」中继续');
    }
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(typeof e === 'string' ? e : '下单失败');
  }
}

async function applyInvoice(row) {
  try {
    const { value } = await ElMessageBox.prompt('请输入发票抬头（企业请填全称）', '申请开票', {
      inputPlaceholder: '如：东莞市某某科技有限公司', type: 'info',
    });
    if (!value || !value.trim()) { ElMessage.warning('抬头不能为空'); return; }
    const { data } = await customerApiCall.post('/billing/invoices', {
      orderId: row.order_id ?? row.id ?? undefined,
      title: value.trim(),
    });
    // 若该发票申请已存在则用其 id 重提（幂等场景由后端保证），成功即刷新
    ElMessage.success('开票申请已提交');
    load();
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(typeof e === 'string' ? e : '申请失败');
  }
}
</script>

<style scoped>
.page-header { margin-bottom: 16px; }
.page-title { font-size: 18px; font-weight: 600; color: #1D2129; margin: 0; }
.page-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); margin-bottom: 16px; }
.section-title { font-size: 15px; font-weight: 600; color: #1D2129; margin: 0 0 16px; }

.current-plan { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
.cp-left { display: flex; flex-direction: column; gap: 8px; }
.cp-badge { display: inline-block; font-size: 20px; font-weight: 600; color: #165DFF; }
.cp-desc { color: #86909C; font-size: 13px; }
.cp-right { display: flex; gap: 32px; }
.cp-item { display: flex; flex-direction: column; gap: 4px; }
.cp-label { font-size: 12px; color: #86909C; }
.cp-value { font-size: 14px; color: #1D2129; font-weight: 500; }

.usage-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px 24px; }
.usage-item { padding: 4px 0; }
.usage-head { display: flex; justify-content: space-between; margin-bottom: 6px; }
.usage-name { font-size: 13px; color: #4E5969; }
.usage-num { font-size: 13px; font-weight: 500; color: #1D2129; }
.usage-num.over { color: #F53F3F; }
.usage-note { margin-top: 12px; font-size: 12px; color: #86909C; }

.plan-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.plan-card { border: 1px solid #E5E6EB; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; gap: 8px; transition: all .2s; }
.plan-card:hover { box-shadow: 0 4px 16px rgba(22,93,255,0.08); }
.plan-card.current { border-color: #165DFF; background: rgba(22,93,255,0.03); }
.plan-name { font-size: 16px; font-weight: 600; color: #1D2129; }
.plan-price { font-size: 24px; font-weight: 600; color: #165DFF; }
.plan-cycle { font-size: 12px; color: #86909C; font-weight: 400; }
.plan-desc { font-size: 13px; color: #86909C; min-height: 18px; }
.plan-quota { list-style: none; margin: 4px 0; padding: 0; font-size: 13px; color: #4E5969; line-height: 24px; flex: 1; }
</style>
