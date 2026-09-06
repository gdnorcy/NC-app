<template>
  <view class="home-page">
    <!-- 顶部横幅 -->
    <view class="banner">
      <view class="banner-content">
        <view class="greeting">你好，{{ user.nickname || '用户' }} 👋</view>
        <view class="slogan">让每一次相遇都成为商机</view>
      </view>
      <view class="member-badge" v-if="isMember">
        <text class="member-icon">👑</text>
        <text>{{ memberLevelText }}</text>
      </view>
    </view>

    <!-- 我的名片快捷入口 -->
    <view class="card-entry" v-if="myCard" @click="goMyCard">
      <view class="card-avatar">{{ myCard.avatar ? '' : myCard.name?.[0] || '名' }}</view>
      <view class="card-info">
        <view class="card-name">{{ myCard.name }}</view>
        <view class="card-position">{{ myCard.position || '未设置职位' }}</view>
      </view>
      <view class="card-stats">
        <view class="stat">
          <view class="stat-num">{{ myCard.viewCount }}</view>
          <view class="stat-label">访问</view>
        </view>
        <view class="stat">
          <view class="stat-num">{{ myCard.exchangeCount }}</view>
          <view class="stat-label">交换</view>
        </view>
      </view>
      <view class="card-arrow">›</view>
    </view>

    <view class="card-entry create-card" v-else @click="goCreate">
      <view class="create-icon">➕</view>
      <view class="create-text">创建我的名片</view>
    </view>

    <!-- 功能九宫格 -->
    <view class="grid-section">
      <view class="section-title">功能中心</view>
      <view class="grid">
        <view class="grid-item" v-for="item in features" :key="item.key" @click="goPage(item.path)">
          <view class="grid-icon" :style="{ background: item.bg }">{{ item.icon }}</view>
          <view class="grid-label">{{ item.label }}</view>
          <view class="grid-dot" v-if="item.dot"></view>
        </view>
      </view>
    </view>

    <!-- 底部Tab -->
    <view class="tabbar">
      <view class="tab-item active">
        <view class="tab-icon">🏠</view>
        <view class="tab-label">首页</view>
      </view>
      <view class="tab-item" @click="goPage('/pages/card/market')">
        <view class="tab-icon">🌐</view>
        <view class="tab-label">集市</view>
      </view>
      <view class="tab-item" @click="goPage('/pages/card/member')">
        <view class="tab-icon">👑</view>
        <view class="tab-label">会员</view>
      </view>
      <view class="tab-item" @click="goPage('/pages/card/profile')">
        <view class="tab-icon">👤</view>
        <view class="tab-label">我的</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';

const user = ref({});
const myCard = ref(null);
const isMember = ref(false);
const memberLevelText = ref('');

const features = [
  { key: 'card', icon: '💳', label: '我的名片', path: '/pages/card/myCard', bg: 'linear-gradient(135deg,#165dff,#4080ff)' },
  { key: 'visitors', icon: '📊', label: '访客雷达', path: '/pages/card/visitors', bg: 'linear-gradient(135deg,#00b42a,#23c343)', dot: true },
  { key: 'customers', icon: '👥', label: '客户管理', path: '/pages/card/customers', bg: 'linear-gradient(135deg,#ff7d00,#ff9a2e)' },
  { key: 'market', icon: '🌐', label: '人脉集市', path: '/pages/card/market', bg: 'linear-gradient(135deg,#722ed1,#9254de)' },
  { key: 'exchange', icon: '🔄', label: '名片交换', path: '/pages/card/exchange', bg: 'linear-gradient(135deg,#13c2c2,#36cfc9)' },
  { key: 'distribution', icon: '💰', label: '分销中心', path: '/pages/card/distribution', bg: 'linear-gradient(135deg,#f5222d,#ff4d4f)' },
  { key: 'dynamic', icon: '📝', label: '我的动态', path: '/pages/card/dynamic', bg: 'linear-gradient(135deg,#eb2f96,#f759ab)' },
  { key: 'settings', icon: '⚙️', label: '设置', path: '/pages/card/profile', bg: 'linear-gradient(135deg,#86909c,#a9aeb8)' },
];

onMounted(async () => {
  try {
    const res = await cardApi.getProfile();
    user.value = res.user;
    myCard.value = res.card;
    const member = await cardApi.getMemberStatus();
    isMember.value = member.isMember;
    memberLevelText.value = { free: '免费', silver: '白银', gold: '黄金', diamond: '钻石' }[member.level] || '';
  } catch (e) {}
});

function goPage(path) {
  uni.navigateTo({ url: path });
}
function goMyCard() {
  uni.navigateTo({ url: `/pages/card/myCard?id=${myCard.value.id}` });
}
function goCreate() {
  uni.navigateTo({ url: '/pages/card/create' });
}
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: #f2f3f5;
  padding-bottom: 120rpx;
}
.banner {
  background: linear-gradient(135deg, #165dff 0%, #4080ff 100%);
  padding: 88px 32rpx 40rpx;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.greeting {
  font-size: 36rpx;
  font-weight: 600;
  color: #fff;
  margin-bottom: 8rpx;
}
.slogan {
  font-size: 24rpx;
  color: rgba(255,255,255,0.8);
}
.member-badge {
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  color: #fff;
  padding: 8rpx 20rpx;
  border-radius: 24rpx;
  font-size: 22rpx;
  display: flex;
  align-items: center;
  gap: 6rpx;
}
.card-entry {
  margin: -20rpx 24rpx 24rpx;
  background: #fff;
  border-radius: 20px;
  padding: 28rpx 24rpx;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.card-avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #165dff, #4080ff);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;
  font-weight: 600;
  margin-right: 20rpx;
}
.card-info {
  flex: 1;
}
.card-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 6rpx;
}
.card-position {
  font-size: 24rpx;
  color: #86909c;
}
.card-stats {
  display: flex;
  gap: 32rpx;
}
.stat {
  text-align: center;
}
.stat-num {
  font-size: 32rpx;
  font-weight: 700;
  color: #165dff;
}
.stat-label {
  font-size: 20rpx;
  color: #86909c;
}
.card-arrow {
  font-size: 40rpx;
  color: #c9cdd4;
  margin-left: 16rpx;
}
.create-card {
  justify-content: center;
  flex-direction: column;
  gap: 12rpx;
}
.create-icon {
  font-size: 48rpx;
}
.create-text {
  font-size: 28rpx;
  color: #165dff;
  font-weight: 500;
}
.grid-section {
  padding: 0 24rpx;
}
.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 20rpx;
}
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24rpx;
  background: #fff;
  border-radius: 20px;
  padding: 32rpx 16rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}
.grid-icon {
  width: 88rpx;
  height: 88rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  margin-bottom: 12rpx;
}
.grid-label {
  font-size: 22rpx;
  color: #4e5969;
}
.grid-dot {
  position: absolute;
  top: 0;
  right: 20rpx;
  width: 16rpx;
  height: 16rpx;
  background: #f5222d;
  border-radius: 50%;
}
.tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  display: flex;
  padding: 16rpx 0 36px;
  border-top: 1px solid #f2f3f5;
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}
.tab-icon {
  font-size: 40rpx;
}
.tab-label {
  font-size: 20rpx;
  color: #86909c;
}
.tab-item.active .tab-label {
  color: #165dff;
}
</style>
