<template>
  <div class="payment-admin">
    <div class="page-header">
      <h2 class="page-title">支付管理</h2>
      <p class="page-desc">双层支付架构：平台级支付 + 客户级支付，交易统计与结算管理</p>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon blue"><SIcon name="orders" color="#165DFF" /></div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalOrders || 0 }}</div>
          <div class="stat-label">总订单数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green"><SIcon name="badge" color="#00B42A" /></div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.paidOrders || 0 }}</div>
          <div class="stat-label">已支付订单</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange"><SIcon name="wallet" color="#FF7D00" /></div>
        <div class="stat-info">
          <div class="stat-value">¥{{ formatMoney(stats.totalAmount) }}</div>
          <div class="stat-label">交易总额</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon purple"><SIcon name="analytics" color="#722ED1" /></div>
        <div class="stat-info">
          <div class="stat-value">¥{{ formatMoney(stats.platformFee) }}</div>
          <div class="stat-label">平台手续费</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon cyan"><SIcon name="building" color="#00A4AE" /></div>
        <div class="stat-info">
          <div class="stat-value">¥{{ formatMoney(stats.platformAmount) }}</div>
          <div class="stat-label">平台级收入</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon pink"><SIcon name="team" color="#F53F3F" /></div>
        <div class="stat-info">
          <div class="stat-value">¥{{ formatMoney(stats.tenantAmount) }}</div>
          <div class="stat-label">客户级交易</div>
        </div>
      </div>
    </div>

    <!-- Tab切换 -->
    <div class="content-card">
      <div class="tab-bar">
        <div class="tab" :class="{ active: activeTab === 'orders' }" @click="activeTab = 'orders'">交易订单</div>
        <div class="tab" :class="{ active: activeTab === 'settlements' }" @click="activeTab = 'settlements'">结算管理</div>
        <div class="tab" :class="{ active: activeTab === 'config' }" @click="activeTab = 'config'">平台支付配置</div>
      </div>

      <!-- 订单列表 -->
      <div v-if="activeTab === 'orders'" class="tab-content">
        <div class="toolbar">
          <select v-model="filter.status" class="filter-select" @change="loadOrders">
            <option value="">全部状态</option>
            <option value="pending">待支付</option>
            <option value="paid">已支付</option>
            <option value="refunded">已退款</option>
            <option value="closed">已关闭</option>
          </select>
          <select v-model="filter.payerType" class="filter-select" @change="loadOrders">
            <option value="">全部类型</option>
            <option value="platform">平台级支付</option>
            <option value="tenant">客户级支付</option>
          </select>
          <input v-model="filter.keyword" class="search-input" placeholder="搜索订单号/产品名称" @keyup.enter="loadOrders" />
          <button class="btn-primary" @click="loadOrders">搜索</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>订单号</th>
              <th>类型</th>
              <th>客户ID</th>
              <th>产品</th>
              <th>金额</th>
              <th>平台手续费</th>
              <th>支付方式</th>
              <th>收款模式</th>
              <th>状态</th>
              <th>支付时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in orders" :key="order.id">
              <td class="order-no">{{ order.orderNo }}</td>
              <td>
                <span class="badge" :class="order.payerType === 'platform' ? 'info' : 'warning'">
                  {{ order.payerType === 'platform' ? '平台级' : '客户级' }}
                </span>
              </td>
              <td>{{ order.customerId }}</td>
              <td>{{ order.productName }}</td>
              <td>¥{{ formatMoney(order.amount) }}</td>
              <td>¥{{ formatMoney(order.platformFee) }}</td>
              <td>{{ order.payChannel === 'wechat' ? '微信支付' : '支付宝' }}</td>
              <td>{{ order.payMode === 'platform' ? '平台代收' : '自主接入' }}</td>
              <td>
                <span class="badge" :class="statusClass(order.status)">{{ statusText(order.status) }}</span>
              </td>
              <td>{{ order.paidAt || '-' }}</td>
            </tr>
            <tr v-if="orders.length === 0">
              <td colspan="10" class="empty-cell">暂无订单</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 结算管理 -->
      <div v-if="activeTab === 'settlements'" class="tab-content">
        <div class="toolbar">
          <select v-model="settlementFilter.status" class="filter-select" @change="loadSettlements">
            <option value="">全部状态</option>
            <option value="pending">待结算</option>
            <option value="settled">已结算</option>
            <option value="rejected">已拒绝</option>
          </select>
          <button class="btn-primary" @click="loadSettlements">刷新</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>结算单号</th>
              <th>客户ID</th>
              <th>订单总数</th>
              <th>订单总额</th>
              <th>平台手续费</th>
              <th>结算金额</th>
              <th>状态</th>
              <th>结算时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in settlements" :key="s.id">
              <td class="order-no">{{ s.settlement_no }}</td>
              <td>{{ s.customer_id }}</td>
              <td>{{ JSON.parse(s.order_ids || '[]').length }}</td>
              <td>¥{{ formatMoney(s.total_amount) }}</td>
              <td>¥{{ formatMoney(s.platform_fee) }}</td>
              <td class="settle-amount">¥{{ formatMoney(s.settle_amount) }}</td>
              <td>
                <span class="badge" :class="s.status === 'settled' ? 'success' : 'warning'">
                  {{ s.status === 'settled' ? '已结算' : s.status === 'rejected' ? '已拒绝' : '待结算' }}
                </span>
              </td>
              <td>{{ s.settled_at || '-' }}</td>
              <td>
                <button v-if="s.status === 'pending'" class="btn-link" @click="confirmSettlement(s.id)">确认结算</button>
                <span v-else>-</span>
              </td>
            </tr>
            <tr v-if="settlements.length === 0">
              <td colspan="9" class="empty-cell">暂无结算记录</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 平台支付配置 -->
      <div v-if="activeTab === 'config'" class="tab-content">
        <el-form :model="platformConfig" label-width="140px" size="default">
          <el-divider content-position="left">微信支付</el-divider>
          <el-form-item label="启用微信支付">
            <el-switch v-model="platformConfig.wechat.enabled" active-text="启用" />
          </el-form-item>
          <template v-if="platformConfig.wechat.enabled">
            <el-form-item label="商户号" required>
              <el-input v-model="platformConfig.wechat.mchId" placeholder="微信支付商户号" />
            </el-form-item>
            <el-form-item label="APIv3密钥" required>
              <el-input v-model="platformConfig.wechat.apiV3Key" type="password" show-password placeholder="APIv3密钥" />
            </el-form-item>
            <el-form-item label="绑定AppID" required>
              <el-input v-model="platformConfig.wechat.appid" placeholder="小程序/公众号AppID" />
            </el-form-item>
            <el-form-item label="证书序列号">
              <el-input v-model="platformConfig.wechat.certSerial" placeholder="商户证书序列号" />
            </el-form-item>
            <el-form-item label="商户私钥">
              <el-input v-model="platformConfig.wechat.privateKey" type="textarea" :rows="3" placeholder="商户私钥内容" />
            </el-form-item>
          </template>

          <el-divider content-position="left">支付宝</el-divider>
          <el-form-item label="启用支付宝">
            <el-switch v-model="platformConfig.alipay.enabled" active-text="启用" />
          </el-form-item>
          <template v-if="platformConfig.alipay.enabled">
            <el-form-item label="应用AppID" required>
              <el-input v-model="platformConfig.alipay.appId" placeholder="支付宝应用AppID" />
            </el-form-item>
            <el-form-item label="应用私钥" required>
              <el-input v-model="platformConfig.alipay.privateKey" type="textarea" :rows="3" placeholder="应用私钥" />
            </el-form-item>
            <el-form-item label="支付宝公钥" required>
              <el-input v-model="platformConfig.alipay.alipayPublicKey" type="textarea" :rows="3" placeholder="支付宝公钥" />
            </el-form-item>
          </template>

          <el-form-item>
            <el-button type="primary" @click="savePlatformConfig" :loading="saving">保存配置</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup>
import SIcon from '../../components/SIcon.vue';
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { paymentApi } from '../../api';

const stats = ref({});
const orders = ref([]);
const settlements = ref([]);
const activeTab = ref('orders');
const saving = ref(false);
const filter = ref({ status: '', payerType: '', keyword: '' });
const settlementFilter = ref({ status: '' });
const platformConfig = ref({
  wechat: { enabled: false, mchId: '', apiV3Key: '', appid: '', certSerial: '', privateKey: '' },
  alipay: { enabled: false, appId: '', privateKey: '', alipayPublicKey: '' },
});

function formatMoney(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function statusText(s) {
  return { pending: '待支付', paid: '已支付', refunded: '已退款', closed: '已关闭' }[s] || s;
}

function statusClass(s) {
  return { pending: 'warning', paid: 'success', refunded: 'danger', closed: 'info' }[s] || 'info';
}

async function loadStats() {
  try {
    const res = await paymentApi.get('/payment/platform-stats');
    stats.value = res;
  } catch (e) { console.error(e); }
}

async function loadOrders() {
  try {
    // 暂时用平台统计接口获取所有订单
    const res = await paymentApi.get('/payment/platform-stats');
    // TODO: 添加订单列表API
    orders.value = [];
  } catch (e) { console.error(e); }
}

async function loadSettlements() {
  try {
    const res = await paymentApi.get('/payment/settlements', { params: settlementFilter.value });
    settlements.value = res.settlements || [];
  } catch (e) { console.error(e); }
}

async function loadPlatformConfig() {
  try {
    const res = await paymentApi.get('/payment/platform-config');
    if (res.config) platformConfig.value = res.config;
  } catch (e) { console.error(e); }
}

async function savePlatformConfig() {
  saving.value = true;
  try {
    await paymentApi.put('/payment/platform-config', platformConfig.value);
    ElMessage.success('保存成功');
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function confirmSettlement(id) {
  try {
    await ElMessageBox.confirm('确认结算该笔款项？结算后不可撤销。', '确认结算', { type: 'warning' });
    await paymentApi.post(`/payment/settlements/${id}/confirm`);
    ElMessage.success('结算成功');
    loadSettlements();
    loadStats();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '操作失败');
  }
}

onMounted(() => {
  loadStats();
  loadOrders();
  loadSettlements();
  loadPlatformConfig();
});
</script>

<style scoped>
.payment-admin { padding: 0; }
.page-header { margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0 0 4px; }
.page-desc { font-size: 13px; color: #86909c; margin: 0; }
.stats-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 16px; }
.stat-card { background: #fff; border-radius: 8px; padding: 16px; display: flex; align-items: center; gap: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.stat-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
.stat-icon.blue { background: rgba(22,93,255,0.1); }
.stat-icon.green { background: rgba(0,180,42,0.1); }
.stat-icon.orange { background: rgba(255,125,0,0.1); }
.stat-icon.purple { background: rgba(114,46,209,0.1); }
.stat-icon.cyan { background: rgba(0,164,174,0.1); }
.stat-icon.pink { background: rgba(245,63,63,0.1); }
.stat-value { font-size: 18px; font-weight: 600; color: #1d2129; }
.stat-label { font-size: 12px; color: #86909c; margin-top: 2px; }
.content-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.tab-bar { display: flex; border-bottom: 1px solid #e5e6eb; padding: 0 20px; }
.tab { padding: 14px 20px; font-size: 14px; color: #4e5969; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
.tab.active { color: #165dff; border-bottom-color: #165dff; font-weight: 500; }
.tab-content { padding: 20px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
.filter-select { padding: 8px 12px; border: 1px solid #e5e6eb; border-radius: 6px; font-size: 13px; outline: none; background: #fff; }
.search-input { flex: 1; max-width: 300px; padding: 8px 12px; border: 1px solid #e5e6eb; border-radius: 6px; font-size: 13px; outline: none; }
.search-input:focus { border-color: #165dff; }
.btn-primary { padding: 8px 16px; background: #165dff; color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
.btn-primary:hover { background: #0e4fd6; }
.btn-link { background: none; border: none; color: #165dff; cursor: pointer; font-size: 13px; padding: 0; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; padding: 12px; background: #f7f8fa; color: #4e5969; font-weight: 500; border-bottom: 1px solid #e5e6eb; }
.data-table td { padding: 12px; border-bottom: 1px solid #f2f3f5; color: #1d2129; }
.data-table tbody tr:hover { background: #f7f8fa; }
.order-no { font-family: monospace; font-size: 12px; color: #4e5969; }
.settle-amount { font-weight: 600; color: #00b42a; }
.badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.badge.success { background: rgba(0,180,42,0.1); color: #00b42a; }
.badge.warning { background: rgba(255,125,0,0.1); color: #ff7d00; }
.badge.info { background: rgba(22,93,255,0.1); color: #165dff; }
.badge.danger { background: rgba(245,63,63,0.1); color: #f53f3f; }
.empty-cell { text-align: center; color: #86909c; padding: 40px !important; }
</style>
