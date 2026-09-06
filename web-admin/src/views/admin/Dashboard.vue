<template>
  <div>
    <!-- 平台全局概览 -->
    <div class="global-overview">
      <div class="global-title">
        <span class="global-label">平台全局</span>
        <span class="global-desc">所有解决方案汇总数据</span>
      </div>
      <div class="global-cards">
        <div class="global-card" @click="$router.push('/customers')">
          <div class="global-value">{{ global.customers }}</div>
          <div class="global-label-text">客户项目</div>
        </div>
        <div class="global-card" @click="$router.push('/solutions')">
          <div class="global-value">{{ global.solutions }}</div>
          <div class="global-label-text">解决方案</div>
        </div>
        <div class="global-card" @click="$router.push('/channel')">
          <div class="global-value">{{ global.channels }}</div>
          <div class="global-label-text">已开通渠道</div>
        </div>
        <div class="global-card" @click="$router.push('/settings/open')">
          <div class="global-value">{{ global.apiCalls }}</div>
          <div class="global-label-text">API调用(今日)</div>
        </div>
      </div>
    </div>

    <!-- 按解决方案分组统计 -->
    <div class="section-header">
      <h3>按解决方案统计</h3>
      <span class="section-desc">各解决方案独立数据，点击查看详情</span>
    </div>
    <div class="solution-stats">
      <div class="solution-stat-card" v-for="sol in bySolution" :key="sol.solutionId" @click="goSolution(sol)">
        <div class="solution-stat-header">
          <span class="solution-stat-icon"><SIcon :name="getSolutionIcon(sol.solutionCode)" size="default" /></span>
          <div class="solution-stat-info">
            <div class="solution-stat-name">{{ sol.solutionName }}</div>
            <el-tag :type="sol.enabled ? 'success' : 'info'" size="small">{{ sol.enabled ? '已启用' : '已禁用' }}</el-tag>
          </div>
        </div>
        <div class="solution-stat-metrics">
          <div class="metric">
            <div class="metric-value">{{ sol.customers }}</div>
            <div class="metric-label">客户</div>
          </div>
          <div class="metric-divider"></div>
          <div class="metric">
            <div class="metric-value">{{ sol.plans }}</div>
            <div class="metric-label">方案</div>
          </div>
          <div class="metric-divider"></div>
          <div class="metric">
            <div class="metric-value">{{ sol.scenes }}</div>
            <div class="metric-label">场景</div>
          </div>
        </div>
        <div class="solution-stat-bar">
          <div class="bar-fill" :style="{ width: getSolutionPercent(sol) + '%' }"></div>
        </div>
        <div class="solution-stat-percent">占平台 {{ getSolutionPercent(sol) }}% 客户</div>
      </div>
    </div>

    <!-- 渠道分布 + 系统状态 -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
      <div class="page-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="margin:0;">全端渠道分布</h3>
          <el-button text type="primary" @click="$router.push('/channel')">查看详情</el-button>
        </div>
        <div class="channel-stats">
          <div class="channel-stat-item" v-for="ch in channelStats" :key="ch.type">
            <span class="channel-stat-icon"><SIcon :name="ch.icon" size="default" /></span>
            <span class="channel-stat-name">{{ ch.name }}</span>
            <span class="channel-stat-count">{{ ch.count }}</span>
            <el-progress :percentage="ch.percent" :stroke-width="6" :show-text="false" style="flex:1;margin-left:12px;" />
          </div>
        </div>
      </div>

      <div class="page-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="margin:0;">系统配置状态</h3>
          <el-button text type="primary" @click="$router.push('/settings/basic')">去配置</el-button>
        </div>
        <div class="config-status">
          <div class="config-item">
            <span>远程存储</span>
            <el-tag :type="configStatus.storage ? 'success' : 'warning'" size="small">{{ configStatus.storage ? '已配置' : '本地存储' }}</el-tag>
          </div>
          <div class="config-item">
            <span>短信接口</span>
            <el-tag :type="configStatus.sms ? 'success' : 'warning'" size="small">{{ configStatus.sms ? '已配置' : '未配置' }}</el-tag>
          </div>
          <div class="config-item">
            <span>微信支付</span>
            <el-tag :type="configStatus.wechatPay ? 'success' : 'info'" size="small">{{ configStatus.wechatPay ? '已配置' : '未配置' }}</el-tag>
          </div>
          <div class="config-item">
            <span>微信第三方平台</span>
            <el-tag :type="configStatus.wxComponent ? 'success' : 'warning'" size="small">{{ configStatus.wxComponent ? '已配置' : '未配置' }}</el-tag>
          </div>
          <div class="config-item">
            <span>开放平台</span>
            <el-tag :type="global.oauthApps > 0 ? 'success' : 'info'" size="small">{{ global.oauthApps > 0 ? '已启用' : '未启用' }}</el-tag>
          </div>
        </div>
      </div>
    </div>

    <!-- 最近操作 -->
    <div class="page-card" style="margin-top:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="margin:0;">最近操作</h3>
        <el-button text type="primary" @click="$router.push('/logs')">全部日志</el-button>
      </div>
      <el-table :data="recentLogs" size="small">
        <el-table-column prop="createdAt" label="时间" width="160" />
        <el-table-column prop="username" label="用户" width="120" />
        <el-table-column prop="action" label="操作" />
      </el-table>
      <el-empty v-if="!recentLogs.length" description="暂无操作记录" :image-size="60" />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  fetchDashboardStats, fetchLogs,
  fetchChannelStats, fetchChannelComponent,
  fetchOAuthStats, fetchSettings, fetchStorageConfig,
} from '../../api';
import SIcon from '../../components/SIcon.vue';

const router = useRouter();

function getSolutionIcon(code) {
  const map = { panorama: 'panorama', card: 'card', channel: 'devices' };
  return map[code] || 'template';
}
const global = ref({ customers: 0, solutions: 0, channels: 0, apiCalls: 0, oauthApps: 0 });
const bySolution = ref([]);
const recentLogs = ref([]);
const channelStats = ref([]);
const configStatus = reactive({ storage: false, sms: false, wechatPay: false, wxComponent: false });

onMounted(async () => {
  // 并行加载所有数据
  await Promise.all([
    // 工作台核心统计（全局+按解决方案）
    fetchDashboardStats().then(r => {
      global.value.customers = r.global?.customers || 0;
      global.value.solutions = (r.bySolution || []).filter(s => s.enabled).length;
      bySolution.value = r.bySolution || [];
    }).catch(() => {}),
    // 渠道统计
    fetchChannelStats().then(r => {
      const byType = r.byType || [];
      global.value.channels = byType.reduce((sum, b) => sum + (b.count || 0), 0);
      const max = Math.max(...byType.map(b => b.count || 0), 1);
      const iconMap = { mini: 'wechat', h5: 'mobile', mp: 'official', pc: 'pc' };
      const nameMap = { mini: '微信小程序', h5: 'H5手机端', mp: '微信公众号', pc: 'PC网站' };
      channelStats.value = ['mini', 'h5', 'mp', 'pc'].map(type => {
        const found = byType.find(b => b.channelType === type);
        const count = found?.count || 0;
        return { type, icon: iconMap[type], name: nameMap[type], count, percent: Math.round(count / max * 100) };
      });
    }).catch(() => {}),
    // 系统配置状态
    fetchChannelComponent().then(r => { configStatus.wxComponent = !!r.config?.hasAppSecret; }).catch(() => {}),
    fetchOAuthStats().then(r => {
      global.value.apiCalls = r.todayCalls || 0;
      global.value.oauthApps = r.totalApps || 0;
    }).catch(() => {}),
    fetchSettings().then(r => {
      const s = r.settings || {};
      configStatus.sms = !!s.smsProvider && s.smsProvider !== 'mock';
      configStatus.wechatPay = !!s.wechatPayMode;
    }).catch(() => {}),
    fetchStorageConfig().then(r => {
      configStatus.storage = r.config?.provider && r.config.provider !== 'local';
    }).catch(() => {}),
    // 最近操作
    fetchLogs({ limit: 8 }).then(r => { recentLogs.value = r.logs || []; }).catch(() => {}),
  ]);
});

function getSolutionPercent(sol) {
  const total = global.value.customers || 1;
  return Math.round((sol.customers / total) * 100);
}

function goSolution(sol) {
  // 跳转到客户项目页，可按解决方案筛选（后续扩展）
  router.push('/customers');
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
.global-value {
  font-size: 28px;
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
.solution-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.solution-stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  cursor: pointer;
  transition: all 0.2s;
  border-left: 3px solid #165DFF;
}
.solution-stat-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transform: translateY(-2px);
}
.solution-stat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.solution-stat-icon {
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
.solution-stat-name {
  font-size: 15px;
  font-weight: 600;
  color: #1a1b1c;
  margin-bottom: 4px;
}
.solution-stat-metrics {
  display: flex;
  align-items: center;
  justify-content: space-around;
  margin-bottom: 12px;
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
.solution-stat-bar {
  height: 4px;
  background: #f0f2f5;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}
.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #165DFF, #4080FF);
  border-radius: 2px;
  transition: width 0.3s;
}
.solution-stat-percent {
  font-size: 11px;
  color: #909399;
  text-align: right;
}
.channel-stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.channel-stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.channel-stat-icon {
  width: 28px;
  height: 28px;
  background: rgba(22,93,255,0.06);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4e5969;
  flex-shrink: 0;
}
.channel-stat-name {
  font-size: 13px;
  color: #606266;
  width: 90px;
}
.channel-stat-count {
  font-size: 16px;
  font-weight: 600;
  color: #1a1b1c;
  width: 40px;
  text-align: right;
}
.config-status {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #606266;
  padding: 8px 0;
  border-bottom: 1px solid #f5f7fa;
}
.config-item:last-child {
  border-bottom: none;
}
</style>
