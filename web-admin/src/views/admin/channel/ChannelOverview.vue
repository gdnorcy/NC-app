<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">全端渠道</h2>
      <span style="font-size:12px;color:#909399;">第三方平台配置与平台默认配置已迁至「系统设置」</span>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">{{ stats.totalChannels || 0 }}</div><div class="stat-label">渠道配置总数</div></div>
      <div class="stat-card"><div class="stat-value">{{ stats.authorized || 0 }}</div><div class="stat-label">已授权</div></div>
      <div class="stat-card"><div class="stat-value">{{ stats.released || 0 }}</div><div class="stat-label">已发布上线</div></div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.byType?.length || 0 }}</div>
        <div class="stat-label">渠道类型覆盖</div>
      </div>
    </div>

    <!-- 四渠道卡片 -->
    <div class="channel-grid">
      <!-- H5 -->
      <div class="channel-card" v-for="ch in channels" :key="ch.type">
        <div class="channel-header">
          <span class="channel-icon"><SIcon :name="ch.icon" size="large" /></span>
          <div>
            <div class="channel-name">{{ ch.name }}</div>
            <div class="channel-desc">{{ ch.desc }}</div>
          </div>
          <el-tag :type="ch.statusType" size="small">{{ ch.statusText }}</el-tag>
        </div>
        <div class="channel-body">
          <div class="channel-info">
            <span class="info-label">已开通</span>
            <span class="info-value">{{ ch.count }} 个客户</span>
          </div>
          <div class="channel-info" v-if="ch.appid">
            <span class="info-label">AppID</span>
            <span class="info-value"><code>{{ ch.appid }}</code></span>
          </div>
        </div>
        <div class="channel-footer">
          <el-button size="small" @click="goDetail(ch.type)">管理</el-button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { fetchChannelStats } from '../../../api';
import { ElMessage } from 'element-plus';
import SIcon from '../../../components/SIcon.vue';

const router = useRouter();
const stats = ref({});

const channels = [
  { type: 'mini', name: '微信小程序', icon: 'wechat', desc: '客户独立AppID，第三方平台代开发', statusText: '运行中', statusType: 'success', count: 0, appid: '' },
  { type: 'h5', name: 'H5手机端', icon: 'mobile', desc: '/mobile路径，支持独立域名', statusText: '运行中', statusType: 'success', count: 0, appid: '' },
  { type: 'mp', name: '微信公众号', icon: 'official', desc: 'OAuth授权 + H5嵌入', statusText: '运行中', statusType: 'success', count: 0, appid: '' },
  { type: 'pc', name: 'PC网站', icon: 'pc', desc: '独立域名，PC适配', statusText: '待开通', statusType: 'info', count: 0, appid: '' },
];

async function loadData() {
  try {
    stats.value = await fetchChannelStats();
    // 更新各渠道的已开通数量
    const byType = stats.value.byType || [];
    channels.forEach(ch => {
      const found = byType.find(b => b.channelType === ch.type);
      ch.count = found?.count || 0;
    });
  } catch (e) { ElMessage.error(e); }
}

function goDetail(type) {
  router.push(`/channel/${type}`);
}

onMounted(loadData);
</script>

<style scoped>
.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px; }
.stat-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.stat-value { font-size: 28px; font-weight: 700; color: #165DFF; }
.stat-value.warning { color: #fa8c16; font-size: 20px; }
.stat-label { font-size: 13px; color: #909399; margin-top: 4px; }
.channel-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.channel-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.channel-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.channel-icon {
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
.channel-name { font-size: 15px; font-weight: 600; color: #1a1b1c; }
.channel-desc { font-size: 12px; color: #909399; margin-top: 2px; }
.channel-header .el-tag { margin-left: auto; }
.channel-body { margin-bottom: 16px; }
.channel-info { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
.info-label { color: #909399; }
.info-value { color: #303133; }
.info-value code { font-size: 12px; background: #f5f7fa; padding: 2px 6px; border-radius: 4px; }
.channel-footer { border-top: 1px solid #f0f0f0; padding-top: 12px; }
</style>
