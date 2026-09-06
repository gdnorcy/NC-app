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
        <view class="company">{{ card.city ? card.city + ' · ' : '' }}{{ card.businessField || card.company }}</view>
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
          <view class="info-item" v-if="card.position">
            <view class="info-label">身份</view>
            <view class="info-value">{{ card.position }}</view>
          </view>
          <view class="info-item" v-if="card.bio">
            <view class="info-label">个人简介</view>
            <view class="info-value">{{ card.bio }}</view>
          </view>
          <view class="info-item" v-if="card.businessField">
            <view class="info-label">专注</view>
            <view class="info-value">{{ card.businessField }}</view>
          </view>
          <view class="info-item" v-if="tagList.length">
            <view class="info-label">标签</view>
            <view class="skill-tags">
              <view class="skill-tag" v-for="(tag, i) in tagList" :key="i">{{ tag }}</view>
            </view>
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
        <view class="works-head">
          <view class="sec-title">我的作品</view>
          <view class="sec-sub">品牌案例</view>
        </view>
        <view class="works-grid" v-if="works.length">
          <view class="work-item" v-for="w in works" :key="w.id" @click="previewWork(w)">
            <image class="work-img" :src="w.imageUrl" mode="aspectFill" />
            <view class="work-title" v-if="w.title">{{ w.title }}</view>
          </view>
        </view>
        <view class="empty-state" v-else>
          <view class="empty-icon"><SIcon name="template" size="xlarge" color="#c9cdd4" /></view>
          <view class="empty-text">暂无作品案例</view>
          <view class="empty-hint">作品上传功能即将上线</view>
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
        <view class="action-icon"><SIcon name="mobile" size="default" color="#4e5969" /></view>
        <view class="action-label">拨号</view>
      </view>
      <view class="action-btn" @click="copyWechat" v-if="card.wechat">
        <view class="action-icon"><SIcon name="exchange" size="default" color="#4e5969" /></view>
        <view class="action-label">微信</view>
      </view>
      <view class="action-btn" @click="navigateTo">
        <view class="action-icon"><SIcon name="location" size="default" color="#4e5969" /></view>
        <view class="action-label">导航</view>
      </view>
      <view class="action-btn primary" @click="shareCard">
        <view class="action-icon"><SIcon name="channel" size="default" color="#165dff" /></view>
        <view class="action-label">分享</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import SIcon from '../../components/SIcon.vue';

const card = ref({});
const works = ref([]);
const activeTab = ref('intro');
const memberLevel = ref('free');

const memberLevelText = computed(() => ({ free: '', silver: '白银', gold: '黄金', diamond: '钻石' }[memberLevel.value]));
const indicatorLeft = computed(() => {
  const tabs = ['intro', 'works', 'dynamic', 'video'];
  return (tabs.indexOf(activeTab.value) * 25 + 12.5) + '%';
});
// 业务领域按 / 拆分成标签
const tagList = computed(() => {
  if (!card.value.businessField) return [];
  return card.value.businessField.split(/[/,，、]/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
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
      // 加载作品集
      try {
        const w = await cardApi.getCardWorks(id);
        works.value = w.works || [];
      } catch (e) {}
    } catch (e) {}
  }
});

function navigateTo() {
  const addr = [card.value.city, card.value.businessField || card.value.company].filter(Boolean).join(' · ');
  if (!addr) {
    uni.showToast({ title: '名片未设置位置', icon: 'none' });
    return;
  }
  uni.setClipboardData({
    data: addr,
    success: () => uni.showToast({ title: '地址已复制，可粘贴到地图导航', icon: 'none' }),
  });
}
function previewWork(w) {
  if (w.imageUrl) uni.previewImage({ urls: works.value.map((x) => x.imageUrl), current: w.imageUrl });
}

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
  background: linear-gradient(155deg, #0e2a4e, #1d4e8f 55%, #3b7bd4);
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
.skill-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 8rpx;
}
.skill-tag {
  background: rgba(22,93,255,0.08);
  color: #165dff;
  font-size: 22rpx;
  padding: 8rpx 20rpx;
  border-radius: 24rpx;
}
.works-head {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.sec-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1d2129;
}
.sec-sub {
  font-size: 22rpx;
  color: #86909c;
}
.works-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}
.work-item {
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.work-img {
  width: 100%;
  height: 240rpx;
  display: block;
}
.work-title {
  font-size: 24rpx;
  color: #4e5969;
  padding: 12rpx 16rpx;
}
.empty-hint {
  font-size: 22rpx;
  color: #c9cdd4;
  margin-top: 8rpx;
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
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  background: rgba(22,93,255,0.06);
  display: flex;
  align-items: center;
  justify-content: center;
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
