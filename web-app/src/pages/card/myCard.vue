<template>
  <view class="profile-page">
    <!-- 沉浸式头部 -->
    <view class="header">
      <view class="header-bg"></view>
      <view class="header-content">
        <view class="avatar">{{ card.avatar ? '' : card.name?.[0] || '名' }}</view>
        <view class="name-row">
          <text class="name">{{ card.name }}</text>
          <view class="member-tag" v-if="memberLevel !== 'free'"><SIcon name="crown" size="small" color="#faad14" /> {{ memberLevelText }}</view>
        </view>
        <view class="position">{{ card.position }}</view>
        <view class="company">{{ card.company }}</view>
      </view>
    </view>

    <!-- Tab切换 -->
    <view class="tabs">
      <view class="tab" :class="{ active: activeTab === 'intro' }" @click="activeTab='intro'">简介</view>
      <view class="tab" :class="{ active: activeTab === 'works' }" @click="activeTab='works'">作品</view>
      <view class="tab" :class="{ active: activeTab === 'dynamic' }" @click="activeTab='dynamic'">动态</view>
      <view class="tab" :class="{ active: activeTab === 'video' }" @click="activeTab='video'">视频号</view>
      <view class="tab-indicator" :style="{ left: indicatorLeft }"></view>
    </view>

    <!-- 内容区 -->
    <view class="content">
      <!-- 个人简介 -->
      <view v-if="activeTab === 'intro'" class="tab-content">
        <view class="info-card">
          <view class="info-item" v-if="card.bio">
            <view class="info-label">个人简介</view>
            <view class="info-value">{{ card.bio }}</view>
          </view>
          <view class="info-item" v-if="card.businessField">
            <view class="info-label">业务领域</view>
            <view class="info-value">{{ card.businessField }}</view>
          </view>
          <view class="info-item" v-if="card.phone">
            <view class="info-label">联系电话</view>
            <view class="info-value link" @click="callPhone">{{ card.phone }}</view>
          </view>
          <view class="info-item" v-if="card.wechat">
            <view class="info-label">微信号</view>
            <view class="info-value" @click="copyWechat">{{ card.wechat }}</view>
          </view>
          <view class="info-item" v-if="card.email">
            <view class="info-label">邮箱</view>
            <view class="info-value">{{ card.email }}</view>
          </view>
        </view>
      </view>

      <!-- 作品案例 -->
      <view v-if="activeTab === 'works'" class="tab-content">
        <view class="empty-state">
          <view class="empty-icon"><SIcon name="template" size="xlarge" color="#c9cdd4" /></view>
          <view class="empty-text">暂无作品案例</view>
        </view>
      </view>

      <!-- 个人动态 -->
      <view v-if="activeTab === 'dynamic'" class="tab-content">
        <view class="empty-state">
          <view class="empty-icon"><SIcon name="dynamic" size="xlarge" color="#c9cdd4" /></view>
          <view class="empty-text">暂无动态</view>
        </view>
      </view>

      <!-- 视频号 -->
      <view v-if="activeTab === 'video'" class="tab-content">
        <view class="empty-state" v-if="!card.videoChannel">
          <view class="empty-icon">📹</view>
          <view class="empty-text">未绑定视频号</view>
        </view>
        <view class="video-card" v-else @click="openVideo">
          <view class="video-cover"><SIcon name="dynamic" size="large" color="#fff" /></view>
          <view class="video-info">
            <view class="video-title">{{ card.videoChannel }}</view>
            <view class="video-desc">点击跳转视频号</view>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view class="action-bar">
      <view class="action-btn" @click="callPhone" v-if="card.phone">
        <view class="action-icon">📞</view>
        <view class="action-label">拨号</view>
      </view>
      <view class="action-btn" @click="copyWechat" v-if="card.wechat">
        <view class="action-icon"><SIcon name="exchange" size="default" color="#fff" /></view>
        <view class="action-label">微信</view>
      </view>
      <view class="action-btn" @click="showExchange = true">
        <view class="action-icon">🔄</view>
        <view class="action-label">交换名片</view>
      </view>
      <view class="action-btn primary" @click="shareCard">
        <view class="action-icon"><SIcon name="dynamic" size="default" color="#fff" /></view>
        <view class="action-label">分享</view>
      </view>
    </view>

    <!-- 交换名片弹窗 -->
    <view class="modal-mask" v-if="showExchange" @click="showExchange=false">
      <view class="modal" @click.stop>
        <view class="modal-title">交换名片</view>
        <view class="modal-desc">交换后双方均可查看对方名片信息</view>
        <view class="exchange-option">
          <view class="option-label">同时授权我的手机号</view>
          <switch :checked="sharePhone" @change="sharePhone=$event.detail.value" color="#165dff"/>
        </view>
        <view class="modal-actions">
          <button class="modal-btn cancel" @click="showExchange=false">取消</button>
          <button class="modal-btn confirm" @click="doExchange">确认交换</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import SIcon from '../../components/SIcon.vue';

const card = ref({});
const activeTab = ref('intro');
const showExchange = ref(false);
const sharePhone = ref(false);
const memberLevel = ref('free');

const memberLevelText = computed(() => ({ free: '', silver: '白银', gold: '黄金', diamond: '钻石' }[memberLevel.value]));
const indicatorLeft = computed(() => {
  const tabs = ['intro', 'works', 'dynamic', 'video'];
  return (tabs.indexOf(activeTab.value) * 25 + 12.5) + '%';
});

onMounted(async () => {
  const pages = getCurrentPages();
  const id = pages[pages.length - 1].options.id;
  if (id) {
    try {
      const res = await cardApi.getCard(id);
      card.value = res.card;
      // 采集访客行为
      cardApi.trackVisitor({ cardId: id, actionType: 'view', page: 'profile' });
    } catch (e) {}
  }
  // 1.5秒后自动弹出交换名片
  setTimeout(() => {
    if (!showExchange.value) showExchange.value = true;
  }, 1500);
});

function callPhone() {
  if (card.value.phone) uni.makePhoneCall({ phoneNumber: card.value.phone });
}
function copyWechat() {
  if (card.value.wechat) {
    uni.setClipboardData({ data: card.value.wechat, success: () => uni.showToast({ title: '微信号已复制', icon: 'success' }) });
  }
}
function openVideo() {
  uni.showToast({ title: '跳转视频号', icon: 'none' });
}
async function doExchange() {
  try {
    await cardApi.exchangeCard({ toCardId: card.value.id, sharePhone: sharePhone.value });
    uni.showToast({ title: '交换成功', icon: 'success' });
    showExchange.value = false;
  } catch (e) {
    uni.showToast({ title: e.message || '交换失败', icon: 'none' });
  }
}
function shareCard() {
  uni.showToast({ title: '请点击右上角分享', icon: 'none' });
}
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: #f2f3f5;
  padding-bottom: 140rpx;
}
.header {
  position: relative;
  padding-top: 88px;
  padding-bottom: 40rpx;
}
.header-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 320rpx;
  background: linear-gradient(135deg, #165dff 0%, #4080ff 100%);
}
.header-content {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 0 32rpx;
}
.avatar {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background: #fff;
  margin: 0 auto 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 64rpx;
  font-weight: 700;
  color: #165dff;
  border: 6rpx solid rgba(255,255,255,0.3);
}
.name-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
}
.name {
  font-size: 40rpx;
  font-weight: 700;
  color: #fff;
}
.member-tag {
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  color: #fff;
  padding: 4rpx 16rpx;
  border-radius: 20rpx;
  font-size: 20rpx;
}
.position {
  font-size: 28rpx;
  color: rgba(255,255,255,0.9);
  margin-bottom: 6rpx;
}
.company {
  font-size: 24rpx;
  color: rgba(255,255,255,0.7);
}
.tabs {
  background: #fff;
  display: flex;
  position: relative;
  padding: 0 16rpx;
  border-bottom: 1px solid #f2f3f5;
}
.tab {
  flex: 1;
  text-align: center;
  padding: 28rpx 0;
  font-size: 28rpx;
  color: #86909c;
  position: relative;
}
.tab.active {
  color: #165dff;
  font-weight: 600;
}
.tab-indicator {
  position: absolute;
  bottom: 0;
  width: 48rpx;
  height: 6rpx;
  background: #165dff;
  border-radius: 3rpx;
  transform: translateX(-50%);
  transition: left 0.3s;
}
.content {
  padding: 24rpx;
}
.info-card {
  background: #fff;
  border-radius: 20px;
  padding: 28rpx 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.info-item {
  padding: 20rpx 0;
  border-bottom: 1px solid #f7f8fa;
}
.info-item:last-child {
  border-bottom: none;
}
.info-label {
  font-size: 24rpx;
  color: #86909c;
  margin-bottom: 8rpx;
}
.info-value {
  font-size: 28rpx;
  color: #1d2129;
  line-height: 1.6;
}
.info-value.link {
  color: #165dff;
}
.empty-state {
  text-align: center;
  padding: 120rpx 0;
}
.empty-icon {
  font-size: 80rpx;
  margin-bottom: 20rpx;
}
.empty-text {
  font-size: 28rpx;
  color: #86909c;
}
.video-card {
  background: #fff;
  border-radius: 20px;
  padding: 24rpx;
  display: flex;
  align-items: center;
  gap: 20rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.video-cover {
  width: 120rpx;
  height: 120rpx;
  background: #000;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  color: #fff;
}
.video-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 8rpx;
}
.video-desc {
  font-size: 24rpx;
  color: #86909c;
}
.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  display: flex;
  padding: 20rpx 24rpx 36px;
  border-top: 1px solid #f2f3f5;
  gap: 16rpx;
}
.action-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}
.action-icon {
  font-size: 36rpx;
}
.action-label {
  font-size: 20rpx;
  color: #4e5969;
}
.action-btn.primary .action-label {
  color: #165dff;
  font-weight: 600;
}
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.modal {
  width: 600rpx;
  background: #fff;
  border-radius: 20px;
  padding: 40rpx 32rpx 32rpx;
}
.modal-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1d2129;
  text-align: center;
  margin-bottom: 12rpx;
}
.modal-desc {
  font-size: 24rpx;
  color: #86909c;
  text-align: center;
  margin-bottom: 32rpx;
}
.exchange-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx;
  background: #f7f8fa;
  border-radius: 12px;
  margin-bottom: 32rpx;
}
.option-label {
  font-size: 26rpx;
  color: #4e5969;
}
.modal-actions {
  display: flex;
  gap: 20rpx;
}
.modal-btn {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 40rpx;
  font-size: 28rpx;
  text-align: center;
}
.modal-btn.cancel {
  background: #f2f3f5;
  color: #4e5969;
}
.modal-btn.confirm {
  background: #165dff;
  color: #fff;
}
</style>
