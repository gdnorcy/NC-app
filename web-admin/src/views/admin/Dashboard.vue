<template>
  <div>
    <!-- 核心统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card" @click="$router.push('/customers')">
        <div class="stat-icon" style="background:rgba(22,93,255,0.1);color:#165DFF;">🏢</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.customers }}</div>
          <div class="stat-label">客户项目</div>
        </div>
      </div>
      <div class="stat-card" @click="$router.push('/solutions')">
        <div class="stat-icon" style="background:rgba(82,196,26,0.1);color:#52C41A;">🧩</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.solutions }}</div>
          <div class="stat-label">解决方案</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(250,173,20,0.1);color:#FAAD14;">📋</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.plans }}</div>
          <div class="stat-label">方案数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(114,46,209,0.1);color:#722ED1;">🌐</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.scenes }}</div>
          <div class="stat-label">场景数</div>
        </div>
      </div>
      <div class="stat-card" @click="$router.push('/users')">
        <div class="stat-icon" style="background:rgba(24,144,255,0.1);color:#1890FF;">👥</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.users }}</div>
          <div class="stat-label">用户数</div>
        </div>
      </div>
      <div class="stat-card" @click="$router.push('/channel')">
        <div class="stat-icon" style="background:rgba(235,47,150,0.1);color:#EB2F96;">📱</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.channels }}</div>
          <div class="stat-label">已开通渠道</div>
        </div>
      </div>
      <div class="stat-card" @click="$router.push('/settings/open')">
        <div class="stat-icon" style="background:rgba(19,194,194,0.1);color:#13C2C2;">🔌</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.oauthApps }}</div>
          <div class="stat-label">开放平台应用</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(250,84,28,0.1);color:#FA541C;">📊</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.apiCalls }}</div>
          <div class="stat-label">API调用(今日)</div>
        </div>
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
            <span class="channel-stat-icon">{{ ch.icon }}</span>
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
            <span>支付宝</span>
            <el-tag :type="configStatus.alipay ? 'success' : 'info'" size="small">{{ configStatus.alipay ? '已配置' : '未配置' }}</el-tag>
          </div>
          <div class="config-item">
            <span>微信第三方平台</span>
            <el-tag :type="configStatus.wxComponent ? 'success' : 'warning'" size="small">{{ configStatus.wxComponent ? '已配置' : '未配置' }}</el-tag>
          </div>
          <div class="config-item">
            <span>开放平台</span>
            <el-tag :type="stats.oauthApps > 0 ? 'success' : 'info'" size="small">{{ stats.oauthApps > 0 ? '已启用' : '未启用' }}</el-tag>
          </div>
        </div>
      </div>
    </div>

    <!-- 最近操作 + 解决方案 -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
      <div class="page-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="margin:0;">最近操作</h3>
          <el-button text type="primary" @click="$router.push('/logs')">全部日志</el-button>
        </div>
        <el-table :data="recentLogs" size="small" :show-header="true">
          <el-table-column prop="createdAt" label="时间" width="150" />
          <el-table-column prop="username" label="用户" width="100" />
          <el-table-column prop="action" label="操作" />
        </el-table>
        <el-empty v-if="!recentLogs.length" description="暂无操作记录" :image-size="60" />
      </div>

      <div class="page-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="margin:0;">解决方案</h3>
          <el-button text type="primary" @click="$router.push('/solutions')">管理</el-button>
        </div>
        <div class="solution-list">
          <div class="solution-item" v-for="s in solutions" :key="s.id">
            <span class="solution-name">{{ s.name }}</span>
            <el-tag :type="s.enabled ? 'success' : 'info'" size="small">{{ s.enabled ? '已启用' : '已禁用' }}</el-tag>
          </div>
        </div>
        <el-empty v-if="!solutions.length" description="暂无解决方案" :image-size="60" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import {
  fetchCustomers, fetchPlans, fetchScenes, fetchUsers, fetchLogs,
  fetchSolutions, fetchChannelStats, fetchChannelComponent,
  fetchOAuthApps, fetchOAuthStats, fetchSettings, fetchStorageConfig,
} from '../../api';

const stats = ref({ customers: 0, solutions: 0, plans: 0, scenes: 0, users: 0, channels: 0, oauthApps: 0, apiCalls: 0 });
const recentLogs = ref([]);
const solutions = ref([]);
const channelStats = ref([]);
const configStatus = reactive({ storage: false, sms: false, wechatPay: false, alipay: false, wxComponent: false });

onMounted(async () => {
  // 并行加载所有统计数据
  const promises = [
    fetchCustomers().then(r => { stats.value.customers = r.projects?.length || 0; }).catch(() => {}),
    fetchSolutions().then(r => {
      solutions.value = r.solutions || [];
      stats.value.solutions = solutions.value.filter(s => s.enabled).length;
    }).catch(() => {}),
    fetchPlans().then(r => { stats.value.plans = r.plans?.length || 0; }).catch(() => {}),
    fetchScenes().then(r => { stats.value.scenes = r.scenes?.length || 0; }).catch(() => {}),
    fetchUsers().then(r => { stats.value.users = r.users?.length || 0; }).catch(() => {}),
    fetchChannelStats().then(r => {
      const byType = r.byType || [];
      const total = byType.reduce((sum, b) => sum + (b.count || 0), 0);
      stats.value.channels = total;
      const max = Math.max(...byType.map(b => b.count || 0), 1);
      const iconMap = { mini: '💬', h5: '📱', mp: '📢', pc: '💻' };
      const nameMap = { mini: '微信小程序', h5: 'H5手机端', mp: '微信公众号', pc: 'PC网站' };
      channelStats.value = ['mini', 'h5', 'mp', 'pc'].map(type => {
        const found = byType.find(b => b.channelType === type);
        const count = found?.count || 0;
        return { type, icon: iconMap[type], name: nameMap[type], count, percent: Math.round(count / max * 100) };
      });
    }).catch(() => {}),
    fetchChannelComponent().then(r => {
      configStatus.wxComponent = !!r.config?.hasAppSecret;
    }).catch(() => {}),
    fetchOAuthApps().then(r => { stats.value.oauthApps = r.apps?.length || 0; }).catch(() => {}),
    fetchOAuthStats().then(r => { stats.value.apiCalls = r.todayCalls || 0; }).catch(() => {}),
    fetchSettings().then(r => {
      const s = r.settings || {};
      configStatus.sms = !!s.smsProvider && s.smsProvider !== 'mock';
      configStatus.wechatPay = !!s.wechatPayMode;
      configStatus.alipay = !!s.alipayEnabled;
    }).catch(() => {}),
    fetchStorageConfig().then(r => {
      configStatus.storage = r.config?.provider && r.config.provider !== 'local';
    }).catch(() => {}),
    fetchLogs({ limit: 5 }).then(r => { recentLogs.value = r.logs || []; }).catch(() => {}),
  ];
  await Promise.all(promises);
});
</script>

<style scoped>
.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.2s;
}
.stat-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transform: translateY(-2px);
}
.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}
.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #1a1b1c;
  line-height: 1.2;
}
.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
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
  font-size: 18px;
  width: 24px;
  text-align: center;
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
.solution-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.solution-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 13px;
}
.solution-name {
  font-weight: 500;
  color: #1a1b1c;
}
</style>
