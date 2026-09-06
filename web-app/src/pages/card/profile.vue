<template>
  <view class="profile-page">
    <!-- 用户信息头部 -->
    <view class="header">
      <view class="user-info">
        <view class="avatar">{{ user.nickname?.[0] || '用' }}</view>
        <view class="info">
          <view class="nickname">{{ user.nickname || '未设置昵称' }}</view>
          <view class="member-tag" v-if="isMember"><SIcon name="crown" size="small" color="#faad14" /> {{ memberLevelText }}</view>
        </view>
        <view class="edit-btn" @click="goEdit">编辑</view>
      </view>

      <!-- 数据看板 -->
      <view class="stats-row">
        <view class="stat-item">
          <view class="stat-num">{{ stats.cardCount }}</view>
          <view class="stat-label">名片</view>
        </view>
        <view class="stat-item">
          <view class="stat-num">{{ stats.visitorCount }}</view>
          <view class="stat-label">访客</view>
        </view>
        <view class="stat-item">
          <view class="stat-num">{{ stats.customerCount }}</view>
          <view class="stat-label">客户</view>
        </view>
        <view class="stat-item">
          <view class="stat-num">{{ stats.exchangeCount }}</view>
          <view class="stat-label">交换</view>
        </view>
      </view>
    </view>

    <!-- 功能菜单 -->
    <view class="menu-section">
      <view class="menu-group">
        <view class="menu-item" @click="goPage('/pages/card/myCard')">
          <view class="menu-icon"><SIcon name="card" size="default" color="#4e5969" /></view>
          <view class="menu-label">我的名片</view>
          <view class="menu-arrow">›</view>
        </view>
        <view class="menu-item" @click="goPage('/pages/card/create')">
          <view class="menu-icon"><SIcon name="template" size="default" color="#4e5969" /></view>
          <view class="menu-label">编辑名片</view>
          <view class="menu-arrow">›</view>
        </view>
        <view class="menu-item" @click="goPage('/pages/card/distribution')">
          <view class="menu-icon"><SIcon name="wallet" size="default" color="#4e5969" /></view>
          <view class="menu-label">分销中心</view>
          <view class="menu-arrow">›</view>
        </view>
      </view>

      <view class="menu-group">
        <view class="menu-item" @click="goPage('/pages/card/member')">
          <view class="menu-icon"><SIcon name="crown" size="default" color="#4e5969" /></view>
          <view class="menu-label">会员中心</view>
          <view class="menu-value" v-if="isMember">{{ memberLevelText }}</view>
          <view class="menu-arrow">›</view>
        </view>
        <view class="menu-item" @click="goPage('/pages/card/dynamic')">
          <view class="menu-icon"><SIcon name="dynamic" size="default" color="#4e5969" /></view>
          <view class="menu-label">我的动态</view>
          <view class="menu-arrow">›</view>
        </view>
      </view>

      <view class="menu-group">
        <view class="menu-item" @click="showSettings">
          <view class="menu-icon"><SIcon name="settings" size="default" color="#4e5969" /></view>
          <view class="menu-label">设置</view>
          <view class="menu-arrow">›</view>
        </view>
        <view class="menu-item" @click="showAbout">
          <view class="menu-icon"><SIcon name="audit" size="default" color="#4e5969" /></view>
          <view class="menu-label">关于我们</view>
          <view class="menu-arrow">›</view>
        </view>
        <view class="menu-item logout" @click="logout">
          <view class="menu-icon"><SIcon name="key" size="default" color="#f53f3f" /></view>
          <view class="menu-label">退出登录</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import SIcon from '../../components/SIcon.vue';

const user = ref({});
const isMember = ref(false);
const memberLevel = ref('free');
const stats = ref({ cardCount: 0, visitorCount: 0, customerCount: 0, exchangeCount: 0 });

const memberLevelText = computed(() => ({ free: '', silver: '白银', gold: '黄金', diamond: '钻石' }[memberLevel.value]));

onMounted(async () => {
  try {
    const res = await cardApi.getProfile();
    user.value = res.user;
    if (res.card) {
      stats.value.cardCount = 1;
      stats.value.visitorCount = res.card.viewCount;
      stats.value.exchangeCount = res.card.exchangeCount;
    }
    const member = await cardApi.getMemberStatus();
    isMember.value = member.isMember;
    memberLevel.value = member.level;
    const customers = await cardApi.getCustomers();
    stats.value.customerCount = customers.customers?.length || 0;
  } catch (e) {}
});

function goPage(path) {
  uni.navigateTo({ url: path });
}
function goEdit() {
  uni.navigateTo({ url: '/pages/card/create' });
}
function showSettings() {
  uni.showToast({ title: '设置功能开发中', icon: 'none' });
}
function showAbout() {
  uni.showModal({
    title: '关于智能名片',
    content: '平台型智能名片系统\n个人自主创建 · 企业统一管理\n版本 1.0.0',
    showCancel: false,
  });
}
function logout() {
  uni.showModal({
    title: '提示',
    content: '确定退出登录吗？',
    success: (res) => {
      if (res.confirm) {
        uni.removeStorageSync('card_token');
        uni.removeStorageSync('card_user');
        uni.reLaunch({ url: '/pages/cardMain/login' });
      }
    },
  });
}
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: #f2f3f5;
  padding-bottom: 40rpx;
}
.header {
  background: linear-gradient(135deg, #165dff, #4080ff);
  padding: 88px 32rpx 40rpx;
}
.user-info {
  display: flex;
  align-items: center;
  margin-bottom: 32rpx;
}
.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: #fff;
  color: #165dff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
  font-weight: 700;
  margin-right: 24rpx;
}
.info { flex: 1; }
.nickname {
  font-size: 36rpx;
  font-weight: 600;
  color: #fff;
  margin-bottom: 8rpx;
}
.member-tag {
  display: inline-block;
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  color: #fff;
  padding: 4rpx 16rpx;
  border-radius: 20rpx;
  font-size: 20rpx;
}
.edit-btn {
  background: rgba(255,255,255,0.2);
  color: #fff;
  padding: 12rpx 28rpx;
  border-radius: 32rpx;
  font-size: 24rpx;
}
.stats-row {
  display: flex;
  background: rgba(255,255,255,0.15);
  border-radius: 16px;
  padding: 24rpx 0;
}
.stat-item {
  flex: 1;
  text-align: center;
}
.stat-num {
  font-size: 36rpx;
  font-weight: 700;
  color: #fff;
  margin-bottom: 6rpx;
}
.stat-label {
  font-size: 22rpx;
  color: rgba(255,255,255,0.8);
}
.menu-section {
  margin: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.menu-group {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.menu-item {
  display: flex;
  align-items: center;
  padding: 28rpx 24rpx;
  border-bottom: 1px solid #f7f8fa;
}
.menu-item:last-child { border-bottom: none; }
.menu-icon {
  font-size: 36rpx;
  margin-right: 20rpx;
}
.menu-label {
  flex: 1;
  font-size: 28rpx;
  color: #1d2129;
}
.menu-value {
  font-size: 24rpx;
  color: #ff7d00;
  margin-right: 12rpx;
}
.menu-arrow {
  font-size: 32rpx;
  color: #c9cdd4;
}
.menu-item.logout .menu-label {
  color: #f5222d;
  text-align: center;
}
</style>
