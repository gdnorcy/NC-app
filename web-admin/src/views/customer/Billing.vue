<template>
  <div>
    <div class="page-header"><h2 class="page-title">套餐与续费</h2></div>

    <!-- 当前方案卡片 -->
    <div class="page-card current-plan">
      <div class="cp-left">
        <div class="cp-badge">{{ planData.project?.name || '我的项目' }}</div>
        <div class="cp-desc">
          <template v-for="s in planData.solutions || []" :key="s.code">
            <el-tag size="small" effect="light" type="primary" style="margin-right:6px;">{{ s.name }}</el-tag>
          </template>
        </div>
      </div>
      <div class="cp-right">
        <div class="cp-item">
          <span class="cp-label">到期时间</span>
          <span class="cp-value">{{ planData.project?.validUntil || '长期有效' }}</span>
        </div>
        <div class="cp-item">
          <span class="cp-label">项目状态</span>
          <el-tag :type="planData.project?.status === 'active' ? 'success' : 'danger'" size="small">
            {{ planData.project?.status === 'active' ? '使用中' : '已停用' }}
          </el-tag>
        </div>
      </div>
    </div>

    <!-- 用量概览 -->
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

    <!-- 方案续费（价格/时长同步总后台解决方案设置） -->
    <div class="page-card" v-if="(planData.solutions || []).length && planData.selfRenew !== false">
      <h3 class="section-title">方案续费</h3>
      <div class="sol-renew-grid">
        <div v-for="s in planData.solutions" :key="s.id" class="sol-renew">
          <div class="sol-renew-head">
            <SIcon :name="getAppIcon(s.icon)" size="default" />
            <span class="sol-renew-name">{{ s.name }}</span>
          </div>
          <div v-if="s.pricing.length" class="price-cards">
            <div v-for="p in s.pricing" :key="p.durationMonths" class="price-card">
              <div class="price-duration">{{ p.durationMonths === 0 ? '永久' : p.durationMonths + '个月' }}</div>
              <div class="price-main">
                <template v-if="p.durationMonths === 0">
                  <div class="price-num">¥{{ fmt(p.userPrice) }}</div>
                  <div class="price-sub">永久买断</div>
                </template>
                <template v-else>
                  <div class="price-num">¥{{ fmt(p.userPrice) }}</div>
                  <div class="price-sub">续费 ¥{{ fmt(p.renewPrice) }}</div>
                </template>
              </div>
              <div class="price-actions">
                <el-button size="small" type="primary" plain style="width:100%;margin:0;" @click="purchase(s, p, 'subscribe')">开通</el-button>
                <el-button size="small" text type="primary" style="width:100%;margin:0;" :style="{ visibility: p.durationMonths === 0 ? 'hidden' : 'visible' }" @click="purchase(s, p, 'renew')">续费</el-button>
              </div>
            </div>
          </div>
          <div v-else class="price-empty">该方案暂未配置价格，如需开通请联系平台</div>
        </div>
      </div>
      <div class="usage-note">价格为总后台「解决方案 → 价格设置」中配置的用户价/续费价；支付完成后服务期自动顺延。</div>
    </div>
    <!-- 未开通自助续费提示（selfRenew=false：不显示续费购买入口） -->
    <div class="page-card" v-else-if="(planData.solutions || []).length && planData.selfRenew === false">
      <h3 class="section-title">续费服务</h3>
      <el-alert type="info" show-icon :closable="false" style="border-radius:8px;">
        <template #title>
          <span>当前项目未开通自助续费，续费请<strong>联系平台管理员</strong>办理。</span>
        </template>
      </el-alert>
    </div>
    <div class="page-card" v-else>
      <h3 class="section-title">方案续费</h3>
      <el-empty description="当前项目未开通任何解决方案，请联系平台开通" :image-size="80" />
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
import SIcon from '../../components/SIcon.vue';

const planData = ref({ project: {}, solutions: [] });
const usagePlan = ref({});
const invoices = ref([]);

async function load() {
  try {
    const [solRes, useRes, invRes] = await Promise.all([
      customerApiCall.get('/billing/solution-plan'),
      customerApiCall.get('/billing/plan'),
      customerApiCall.get('/billing/invoices'),
    ]);
    planData.value = solRes;
    usagePlan.value = useRes;
    invoices.value = invRes.invoices || [];
  } catch (e) { ElMessage.error(typeof e === 'string' ? e : '加载套餐信息失败'); }
}
onMounted(load);

const iconMap = { panorama: 'panorama', card: 'card', devices: 'devices', template: 'template', market: 'market', chart: 'chart', building: 'building', dynamic: 'dynamic', apps: 'apps' };
function getAppIcon(icon) { return iconMap[icon] || 'apps'; }
function fmt(v) { return Number(v || 0).toLocaleString(); }

const usageItems = computed(() => {
  const q = usagePlan.value.plan?.quotas || {};
  const u = usagePlan.value.usage || {};
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

async function purchase(sol, p, action) {
  const durationLabel = p.durationMonths === 0 ? '永久' : `${p.durationMonths}个月`;
  const amount = action === 'renew' ? p.renewPrice : p.userPrice;
  try {
    await ElMessageBox.confirm(`确认${action === 'renew' ? '续费' : '开通'}「${sol.name}」${durationLabel}，支付 ¥${fmt(amount)}？`, '支付确认', { type: 'warning' });
    const res = await customerApiCall.post('/billing/solution-purchase', {
      solutionId: sol.id, durationMonths: p.durationMonths, action,
    });
    ElMessage.info('订单已创建，正在拉起支付…');
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
    await customerApiCall.post('/billing/invoices', {
      orderId: row.order_id ?? row.id ?? undefined,
      title: value.trim(),
    });
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
.cp-badge { font-size: 20px; font-weight: 600; color: #165DFF; }
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

.sol-renew-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px; }
.sol-renew { border: 1px solid #E5E6EB; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; }
.sol-renew-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.sol-renew-name { font-size: 14px; font-weight: 600; color: #1D2129; }
.sol-renew .price-cards { flex: 1 1 auto; }
.price-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; align-items: stretch; }
.price-card { border: 1px solid #F2F3F5; border-radius: 8px; padding: 12px; text-align: center; display: flex; flex-direction: column; }
.price-duration { font-size: 13px; font-weight: 500; color: #4E5969; }
.price-main { margin: 8px 0 10px; flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center; }
.price-num { font-size: 20px; font-weight: 600; color: #165DFF; }
.price-sub { font-size: 12px; color: #86909C; margin-top: 2px; }
.price-actions { display: flex; flex-direction: column; gap: 4px; margin-top: auto; }
.price-empty { font-size: 13px; color: #86909C; padding: 12px 0; }
</style>
