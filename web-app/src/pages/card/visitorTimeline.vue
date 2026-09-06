<template>
  <view class="timeline-page">
    <view class="header">
      <view class="title">访客行为时间线</view>
      <view class="subtitle">{{ visitorOpenid === 'anonymous' ? '匿名访客' : '实名用户' }}</view>
    </view>

    <view class="timeline" v-if="actions.length">
      <view class="timeline-item" v-for="(a, i) in actions" :key="a.id">
        <view class="timeline-dot" :class="a.action_type"></view>
        <view class="timeline-line" v-if="i < actions.length - 1"></view>
        <view class="timeline-content">
          <view class="action-title">{{ actionText(a.action_type) }}</view>
          <view class="action-detail" v-if="a.action_detail">{{ a.action_detail }}</view>
          <view class="action-time">{{ formatTime(a.createdAt) }}</view>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <view class="empty-icon"><SIcon name="radar" size="xlarge" color="#c9cdd4" /></view>
      <view class="empty-text">暂无行为记录</view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import SIcon from '../../components/SIcon.vue';

const actions = ref([]);
const visitorOpenid = ref('');

onMounted(async () => {
  const pages = getCurrentPages();
  visitorOpenid.value = pages[pages.length - 1].options.openid || 'anonymous';
  try {
    const res = await cardApi.getVisitorTimeline(visitorOpenid.value);
    actions.value = res.actions || [];
  } catch (e) {}
});

function actionText(type) {
  return { view: '浏览名片', dynamic: '查看动态', video: '观看视频', exchange: '交换名片', phone: '查看电话', wechat: '查看微信' }[type] || type;
}

function formatTime(time) {
  if (!time) return '';
  return time.slice(5, 16);
}
</script>

<style scoped>
.timeline-page {
  min-height: 100vh;
  background: #f2f3f5;
}
.header {
  background: linear-gradient(135deg, #00b42a, #23c343);
  padding: 88px 32rpx 40rpx;
}
.title {
  font-size: 36rpx;
  font-weight: 700;
  color: #fff;
  margin-bottom: 8rpx;
}
.subtitle {
  font-size: 24rpx;
  color: rgba(255,255,255,0.8);
}
.timeline {
  margin: 24rpx;
  background: #fff;
  border-radius: 20px;
  padding: 32rpx 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.timeline-item {
  display: flex;
  position: relative;
  padding-bottom: 32rpx;
}
.timeline-item:last-child { padding-bottom: 0; }
.timeline-dot {
  width: 24rpx;
  height: 24rpx;
  border-radius: 50%;
  background: #165dff;
  margin-right: 24rpx;
  margin-top: 8rpx;
  flex-shrink: 0;
  z-index: 1;
}
.timeline-dot.view { background: #165dff; }
.timeline-dot.exchange { background: #00b42a; }
.timeline-dot.video { background: #f5222d; }
.timeline-dot.dynamic { background: #722ed1; }
.timeline-line {
  position: absolute;
  left: 11rpx;
  top: 40rpx;
  bottom: 0;
  width: 2rpx;
  background: #e5e6eb;
}
.timeline-content { flex: 1; }
.action-title {
  font-size: 28rpx;
  font-weight: 500;
  color: #1d2129;
  margin-bottom: 6rpx;
}
.action-detail {
  font-size: 24rpx;
  color: #86909c;
  margin-bottom: 6rpx;
}
.action-time {
  font-size: 22rpx;
  color: #c9cdd4;
}
.empty-state {
  text-align: center;
  padding: 120rpx 0;
}
.empty-icon { font-size: 80rpx; margin-bottom: 20rpx; }
.empty-text { font-size: 28rpx; color: #86909c; }
</style>
