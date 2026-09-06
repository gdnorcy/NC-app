<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">全端渠道</h2>
      <span class="page-desc">管理您的各端渠道配置和发布</span>
    </div>

    <!-- 渠道统计 -->
    <div class="stat-row">
      <div class="stat-item">
        <div class="stat-num">{{ enabledCount }}</div>
        <div class="stat-text">已开通渠道</div>
      </div>
      <div class="stat-item">
        <div class="stat-num">{{ miniReleased ? '已发布' : '未发布' }}</div>
        <div class="stat-text">小程序状态</div>
      </div>
    </div>

    <!-- 四渠道卡片 -->
    <div class="channel-grid">
      <div class="channel-card" v-for="ch in channels" :key="ch.type" @click="goChannel(ch.type)">
        <div class="channel-icon">{{ ch.icon }}</div>
        <div class="channel-name">{{ ch.name }}</div>
        <div class="channel-desc">{{ ch.desc }}</div>
        <div class="channel-status">
          <el-tag :type="ch.enabled ? 'success' : 'info'" size="small">{{ ch.enabled ? '已启用' : '未启用' }}</el-tag>
        </div>
        <div class="channel-action">
          <el-button type="primary" size="small" plain>去配置</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { fetchCustomerChannels } from '../../../api';

const router = useRouter();
const channelList = ref([]);

const channels = computed(() => {
  const base = [
    { type: 'mini', name: '微信小程序', icon: '💬', desc: '独立小程序，自主发布', enabled: false },
    { type: 'h5', name: 'H5手机端', icon: '📱', desc: '移动端网页，支持自定义域名', enabled: false },
    { type: 'mp', name: '微信公众号', icon: '📢', desc: '公众号内嵌H5', enabled: false },
    { type: 'pc', name: 'PC网站', icon: '💻', desc: '桌面端网站，支持自定义域名', enabled: false },
  ];
  base.forEach(ch => {
    const found = channelList.value.find(c => c.channel_type === ch.type);
    if (found) ch.enabled = !!found.enabled;
  });
  return base;
});

const enabledCount = computed(() => channels.value.filter(c => c.enabled).length);
const miniReleased = computed(() => {
  const mini = channelList.value.find(c => c.channel_type === 'mini');
  return mini?.audit_status === 'released';
});

onMounted(async () => {
  try {
    const res = await fetchCustomerChannels();
    channelList.value = res.channels || [];
  } catch (e) {}
});

function goChannel(type) {
  if (type === 'mini') {
    router.push('/apps/channel/mini');
  } else {
    router.push(`/apps/channel/config?type=${type}`);
  }
}
</script>

<style scoped>
.page-header {
  margin-bottom: 20px;
}
.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1a1b1c;
}
.page-desc {
  font-size: 13px;
  color: #909399;
  margin-left: 12px;
}
.stat-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}
.stat-item {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.stat-num {
  font-size: 22px;
  font-weight: 600;
  color: #165DFF;
}
.stat-text {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
.channel-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.channel-card {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}
.channel-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transform: translateY(-2px);
}
.channel-icon {
  font-size: 36px;
  margin-bottom: 12px;
}
.channel-name {
  font-size: 15px;
  font-weight: 600;
  color: #1a1b1c;
  margin-bottom: 6px;
}
.channel-desc {
  font-size: 12px;
  color: #909399;
  margin-bottom: 12px;
  min-height: 32px;
}
.channel-status {
  margin-bottom: 12px;
}
.channel-action {
  padding-top: 12px;
  border-top: 1px solid #f5f7fa;
}
</style>
