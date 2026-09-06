<template>
  <view class="visitors-page">
    <view class="header">
      <view class="title">访客雷达</view>
      <view class="subtitle">实时掌握商机动态</view>
    </view>

    <!-- 统计卡片 -->
    <view class="stats-row">
      <view class="stat-card">
        <view class="stat-num" :data-num="summary.today">{{ displayToday }}</view>
        <view class="stat-label">今日访问</view>
      </view>
      <view class="stat-card">
        <view class="stat-num" :data-num="summary.week">{{ displayWeek }}</view>
        <view class="stat-label">本周访问</view>
      </view>
      <view class="stat-card">
        <view class="stat-num" :data-num="summary.total">{{ displayTotal }}</view>
        <view class="stat-label">累计访问</view>
      </view>
    </view>

    <!-- 访客列表 -->
    <view class="list-section">
      <view class="section-header">
        <text class="section-title">访客记录</text>
        <text class="section-count">{{ visitors.length }}人</text>
      </view>

      <view class="visitor-list" v-if="visitors.length">
        <view class="visitor-item" v-for="v in visitors" :key="v.id" @click="viewTimeline(v)">
          <view class="visitor-avatar">{{ v.visitorOpenid === 'anonymous' ? '匿' : '实' }}</view>
          <view class="visitor-info">
            <view class="visitor-name">
              {{ v.visitorOpenid === 'anonymous' ? '匿名访客' : '实名用户' }}
              <view class="unread-dot" v-if="v.visitCount > 1"></view>
            </view>
            <view class="visitor-meta">
              <text>访问{{ v.visitCount }}次</text>
              <text class="dot">·</text>
              <text>停留{{ formatDuration(v.duration) }}</text>
            </view>
          </view>
          <view class="visitor-time">{{ formatTime(v.lastVisitAt) }}</view>
          <view class="visitor-arrow">›</view>
        </view>
      </view>

      <view class="empty-state" v-else>
        <view class="empty-icon"><SIcon name="analytics" size="xlarge" color="#c9cdd4" /></view>
        <view class="empty-text">暂无访客记录</view>
        <view class="empty-hint">分享名片后，访客行为将在这里展示</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import SIcon from '../../components/SIcon.vue';

const summary = ref({ today: 0, week: 0, total: 0 });
const visitors = ref([]);
const displayToday = ref(0);
const displayWeek = ref(0);
const displayTotal = ref(0);

onMounted(async () => {
  try {
    const res = await cardApi.getVisitorSummary();
    summary.value = res;
    visitors.value = res.visitors || [];
    // 数字滚动动画
    animateNumber('today', summary.value.today);
    animateNumber('week', summary.value.week);
    animateNumber('total', summary.value.total);
  } catch (e) {}
});

function animateNumber(key, target) {
  const duration = 1000;
  const start = 0;
  const startTime = Date.now();
  function step() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const value = Math.floor(start + (target - start) * progress);
    if (key === 'today') displayToday.value = value;
    if (key === 'week') displayWeek.value = value;
    if (key === 'total') displayTotal.value = value;
    if (progress < 1) requestAnimationFrame(step);
  }
  step();
}

function formatDuration(seconds) {
  if (seconds < 60) return seconds + '秒';
  return Math.floor(seconds / 60) + '分' + (seconds % 60) + '秒';
}

function formatTime(time) {
  if (!time) return '';
  const date = new Date(time.replace(' ', 'T'));
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return time.slice(5, 16);
}

function viewTimeline(v) {
  uni.navigateTo({ url: `/pages/card/visitorTimeline?openid=${v.visitorOpenid}` });
}
</script>

<style scoped>
.visitors-page {
  min-height: 100vh;
  background: #f2f3f5;
  padding-bottom: 40rpx;
}
.header {
  background: linear-gradient(135deg, #00b42a, #23c343);
  padding: 88px 32rpx 40rpx;
}
.title {
  font-size: 40rpx;
  font-weight: 700;
  color: #fff;
  margin-bottom: 8rpx;
}
.subtitle {
  font-size: 24rpx;
  color: rgba(255,255,255,0.8);
}
.stats-row {
  display: flex;
  gap: 16rpx;
  margin: -20rpx 24rpx 24rpx;
}
.stat-card {
  flex: 1;
  background: #fff;
  border-radius: 20px;
  padding: 28rpx 16rpx;
  text-align: center;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.stat-num {
  font-size: 44rpx;
  font-weight: 700;
  color: #00b42a;
  margin-bottom: 8rpx;
}
.stat-label {
  font-size: 22rpx;
  color: #86909c;
}
.list-section {
  margin: 0 24rpx;
  background: #fff;
  border-radius: 20px;
  padding: 28rpx 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}
.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
}
.section-count {
  font-size: 24rpx;
  color: #86909c;
}
.visitor-item {
  display: flex;
  align-items: center;
  padding: 24rpx 0;
  border-bottom: 1px solid #f7f8fa;
}
.visitor-item:last-child {
  border-bottom: none;
}
.visitor-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #165dff, #4080ff);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  margin-right: 20rpx;
}
.visitor-info {
  flex: 1;
}
.visitor-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #1d2129;
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 6rpx;
}
.unread-dot {
  width: 14rpx;
  height: 14rpx;
  background: #f5222d;
  border-radius: 50%;
}
.visitor-meta {
  font-size: 22rpx;
  color: #86909c;
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.dot {
  color: #c9cdd4;
}
.visitor-time {
  font-size: 22rpx;
  color: #c9cdd4;
  margin-right: 12rpx;
}
.visitor-arrow {
  font-size: 32rpx;
  color: #c9cdd4;
}
.empty-state {
  text-align: center;
  padding: 80rpx 0;
}
.empty-icon {
  font-size: 80rpx;
  margin-bottom: 20rpx;
}
.empty-text {
  font-size: 28rpx;
  color: #4e5969;
  margin-bottom: 8rpx;
}
.empty-hint {
  font-size: 24rpx;
  color: #86909c;
}
</style>
