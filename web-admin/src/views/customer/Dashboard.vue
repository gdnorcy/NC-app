<template>
  <div>
    <!-- 客户全局概览 -->
    <div class="global-overview">
      <div class="global-title">
        <span class="global-label">{{ customerName }}</span>
        <span class="global-desc">已开通 {{ stats.appCount || 0 }} 个应用</span>
      </div>
      <div class="global-cards">
        <div class="global-card" @click="$router.push('/members')">
          <div class="global-icon"><SIcon name="team" size="default" /></div>
          <div class="global-value">{{ stats.memberCount || 0 }}</div>
          <div class="global-label-text">团队成员</div>
        </div>
        <div class="global-card">
          <div class="global-icon"><SIcon name="building" size="default" /></div>
          <div class="global-value">{{ stats.enterpriseCount || 0 }}</div>
          <div class="global-label-text">入驻企业</div>
        </div>
        <div class="global-card" @click="$router.push('/apps/card')">
          <div class="global-icon"><SIcon name="card" size="default" /></div>
          <div class="global-value">{{ stats.cardCount || 0 }}</div>
          <div class="global-label-text">名片总数</div>
        </div>
        <div class="global-card" @click="$router.push('/orders')">
          <div class="global-icon"><SIcon name="wallet" size="default" /></div>
          <div class="global-value">¥{{ formatAmount(stats.totalAmount) }}</div>
          <div class="global-label-text">累计消费</div>
        </div>
      </div>
    </div>

    <!-- 按应用统计 -->
    <div class="section-header">
      <h3>我的应用</h3>
      <span class="section-desc">各应用独立数据，点击进入应用</span>
    </div>
    <div class="app-stats">
      <div class="app-stat-card" v-for="app in byApp" :key="app.appId" @click="goApp(app)">
        <div class="app-stat-header">
          <span class="app-stat-icon"><SIcon :name="getAppIcon(app.appCode)" size="default" /></span>
          <div class="app-stat-info">
            <div class="app-stat-name">{{ app.appName }}</div>
            <el-tag type="success" size="small">已开通</el-tag>
          </div>
        </div>
        <div class="app-stat-metrics">
          <div class="metric">
            <div class="metric-value">{{ app.plans }}</div>
            <div class="metric-label">{{ app.metricLabel || '方案' }}</div>
          </div>
          <div class="metric-divider"></div>
          <div class="metric">
            <div class="metric-value">{{ app.scenes }}</div>
            <div class="metric-label">{{ app.metricLabel2 || '场景' }}</div>
          </div>
        </div>
      </div>
      <el-empty v-if="!byApp.length" description="暂未开通任何应用" :image-size="80" />
    </div>

    <!-- 最近场景 + 最近订单 -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
      <div class="page-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="margin:0;">最近场景</h3>
          <el-button text type="primary" @click="$router.push('/apps/panorama/scenes')">全部场景</el-button>
        </div>
        <el-table :data="recentScenes" size="small">
          <el-table-column prop="title" label="场景名称" />
          <el-table-column prop="createdAt" label="创建时间" width="160" />
        </el-table>
        <el-empty v-if="!recentScenes.length" description="暂无场景" :image-size="60" />
      </div>

      <div class="page-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="margin:0;">最近订单</h3>
          <el-button text type="primary" @click="$router.push('/orders')">全部订单</el-button>
        </div>
        <el-table :data="recentOrders" size="small">
          <el-table-column prop="productName" label="订单" />
          <el-table-column prop="amount" label="金额" width="100" />
        </el-table>
        <el-empty v-if="!recentOrders.length" description="暂无订单" :image-size="60" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { customerApiCall } from '../../api';
import SIcon from '../../components/SIcon.vue';

const router = useRouter();
const stats = ref({});
const byApp = ref([]);
const recentScenes = ref([]);
const recentOrders = ref([]);
const customerName = ref('我的工作台');

function getAppIcon(code) {
  const map = { panorama: 'panorama', card: 'card', channel: 'devices' };
  return map[code] || 'apps';
}

onMounted(async () => {
  try {
    const data = await customerApiCall.get('/dashboard');
    stats.value = data.stats || {};
    byApp.value = data.byApp || [];
    recentScenes.value = data.recentScenes || [];
    recentOrders.value = data.recentOrders || [];
    // 从localStorage获取客户名称
    customerName.value = localStorage.getItem('customer_name') || '我的工作台';
  } catch (e) {}
});

function formatAmount(amount) {
  if (!amount) return '0.00';
  return Number(amount).toFixed(2);
}

function goApp(app) {
  // 跳转到对应应用首页（360 全景默认「数据洞察」、智能名片默认 Tab 首项）
  const routeMap = {
    panorama: '/apps/panorama',
    card: '/apps/card',
    channel: '/apps?cat=全端渠道',
    dist: '/apps/dist',
    partner: '/apps/partner',
    'share-all': '/apps/share-all',
    'share-cat': '/apps/share-cat',
    'share-area': '/apps/share-area',
  };
  router.push(routeMap[app.appCode] || '/apps');
}
</script>

<style scoped>
.global-overview {
  background: linear-gradient(135deg, #165DFF 0%, #4080FF 100%);
  border-radius: 8px;
  padding: 20px 24px;
  margin-bottom: 16px;
  color: #fff;
}
.global-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}
.global-label {
  font-size: 16px;
  font-weight: 600;
}
.global-desc {
  font-size: 12px;
  opacity: 0.8;
}
.global-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.global-card {
  background: rgba(255,255,255,0.15);
  border-radius: 6px;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  transition: background 0.2s;
}
.global-card:hover {
  background: rgba(255,255,255,0.25);
}
.global-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 8px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}
.global-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}
.global-label-text {
  font-size: 12px;
  opacity: 0.9;
  margin-top: 4px;
}
.section-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
}
.section-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1a1b1c;
}
.section-desc {
  font-size: 12px;
  color: #909399;
}
.app-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.app-stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  cursor: pointer;
  transition: all 0.2s;
  border-left: 3px solid #165DFF;
  display: flex;
  flex-direction: column;
}
.app-stat-card:hover {
  box-shadow: 0 4px 12px rgba(22,93,255,0.14);
  transform: translateY(-2px);
  border-left-color: #165DFF;
}
.app-stat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.app-stat-icon {
  width: 44px;
  height: 44px;
  background: rgba(22,93,255,0.08);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #165dff;
  flex-shrink: 0;
}
.app-stat-name {
  font-size: 15px;
  font-weight: 600;
  color: #1a1b1c;
  margin-bottom: 4px;
}
.app-stat-metrics {
  display: flex;
  align-items: center;
  justify-content: space-around;
  flex: 1 1 auto;
}
.metric {
  text-align: center;
}
.metric-value {
  font-size: 20px;
  font-weight: 600;
  color: #1a1b1c;
}
.metric-label {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}
.metric-divider {
  width: 1px;
  height: 24px;
  background: #e4e7ed;
}
</style>
