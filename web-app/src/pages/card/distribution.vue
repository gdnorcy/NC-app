<template>
  <view class="distribution-page">
    <view class="header">
      <view class="title">分销中心</view>
      <view class="subtitle">分享赚钱，二级佣金</view>
    </view>

    <!-- 佣金统计 -->
    <view class="stats-row">
      <view class="stat-card">
        <view class="stat-num">¥{{ summary.totalCommission?.toFixed(2) || '0.00' }}</view>
        <view class="stat-label">累计佣金</view>
      </view>
      <view class="stat-card">
        <view class="stat-num">¥{{ summary.pendingCommission?.toFixed(2) || '0.00' }}</view>
        <view class="stat-label">待结算</view>
      </view>
    </view>

    <!-- 团队统计 -->
    <view class="team-section">
      <view class="team-card">
        <view class="team-num">{{ summary.firstLevel || 0 }}</view>
        <view class="team-label">一级团队</view>
      </view>
      <view class="team-card">
        <view class="team-num">{{ summary.secondLevel || 0 }}</view>
        <view class="team-label">二级团队</view>
      </view>
    </view>

    <!-- 推广海报 -->
    <view class="poster-section">
      <view class="poster-card" @click="showPoster = true">
        <view class="poster-icon">📱</view>
        <view class="poster-info">
          <view class="poster-title">生成推广海报</view>
          <view class="poster-desc">分享给好友，好友注册后你将获得佣金</view>
        </view>
        <view class="poster-arrow">›</view>
      </view>
    </view>

    <!-- 佣金明细 -->
    <view class="detail-section">
      <view class="section-title">佣金明细</view>
      <view class="commission-list" v-if="commissions.length">
        <view class="commission-item" v-for="c in commissions" :key="c.id">
          <view class="commission-info">
            <view class="commission-title">{{ c.level === 1 ? '一级' : '二级' }}佣金</view>
            <view class="commission-time">{{ c.created_at?.slice(0, 16) }}</view>
          </view>
          <view class="commission-amount" :class="c.status">+¥{{ c.amount?.toFixed(2) }}</view>
        </view>
      </view>
      <view class="empty-state" v-else>
        <view class="empty-icon">💰</view>
        <view class="empty-text">暂无佣金记录</view>
        <view class="empty-hint">分享海报邀请好友注册即可获得佣金</view>
      </view>
    </view>

    <!-- 分销规则 -->
    <view class="rules-section">
      <view class="section-title">分销规则</view>
      <view class="rule-item">1. 一级佣金：直接推荐用户付费，获得20%佣金</view>
      <view class="rule-item">2. 二级佣金：间接推荐用户付费，获得5%佣金</view>
      <view class="rule-item">3. 佣金T+7结算，可提现或抵扣消费</view>
      <view class="rule-item">4. 退款订单佣金相应扣除</view>
    </view>

    <!-- 海报弹窗 -->
    <view class="modal-mask" v-if="showPoster" @click="showPoster=false">
      <view class="poster-modal" @click.stop>
        <view class="poster-preview">
          <view class="poster-placeholder">
            <view class="poster-logo">💼</view>
            <view class="poster-slogan">智能名片</view>
            <view class="poster-desc">让每一次相遇都成为商机</view>
            <view class="qrcode">
              <view class="qrcode-placeholder">二维码</view>
            </view>
            <view class="poster-tip">长按识别小程序码</view>
          </view>
        </view>
        <view class="poster-actions">
          <button class="poster-btn" @click="savePoster">保存海报</button>
          <button class="poster-btn cancel" @click="showPoster=false">关闭</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';

const summary = ref({});
const commissions = ref([]);
const showPoster = ref(false);

onMounted(async () => {
  try {
    const [s, c] = await Promise.all([
      cardApi.getDistributionSummary(),
      cardApi.getCommissions(),
    ]);
    summary.value = s;
    commissions.value = c.commissions || [];
  } catch (e) {}
});

function savePoster() {
  uni.showToast({ title: '海报生成中...', icon: 'none' });
}
</script>

<style scoped>
.distribution-page {
  min-height: 100vh;
  background: #f2f3f5;
  padding-bottom: 40rpx;
}
.header {
  background: linear-gradient(135deg, #f5222d, #ff4d4f);
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
  font-size: 36rpx;
  font-weight: 700;
  color: #f5222d;
  margin-bottom: 8rpx;
}
.stat-label {
  font-size: 22rpx;
  color: #86909c;
}
.team-section {
  display: flex;
  gap: 16rpx;
  margin: 0 24rpx 24rpx;
}
.team-card {
  flex: 1;
  background: #fff;
  border-radius: 16px;
  padding: 24rpx;
  text-align: center;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.team-num {
  font-size: 40rpx;
  font-weight: 700;
  color: #1d2129;
  margin-bottom: 6rpx;
}
.team-label {
  font-size: 22rpx;
  color: #86909c;
}
.poster-section {
  margin: 0 24rpx 24rpx;
}
.poster-card {
  background: #fff;
  border-radius: 16px;
  padding: 28rpx 24rpx;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.poster-icon {
  font-size: 48rpx;
  margin-right: 20rpx;
}
.poster-info { flex: 1; }
.poster-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 6rpx;
}
.poster-desc {
  font-size: 22rpx;
  color: #86909c;
}
.poster-arrow {
  font-size: 36rpx;
  color: #c9cdd4;
}
.detail-section, .rules-section {
  margin: 0 24rpx 24rpx;
  background: #fff;
  border-radius: 16px;
  padding: 28rpx 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 20rpx;
}
.commission-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1px solid #f7f8fa;
}
.commission-item:last-child { border-bottom: none; }
.commission-title {
  font-size: 26rpx;
  color: #1d2129;
  margin-bottom: 4rpx;
}
.commission-time {
  font-size: 22rpx;
  color: #c9cdd4;
}
.commission-amount {
  font-size: 30rpx;
  font-weight: 600;
  color: #00b42a;
}
.commission-amount.pending { color: #ff7d00; }
.rule-item {
  font-size: 24rpx;
  color: #4e5969;
  line-height: 2;
}
.empty-state {
  text-align: center;
  padding: 60rpx 0;
}
.empty-icon { font-size: 64rpx; margin-bottom: 16rpx; }
.empty-text { font-size: 26rpx; color: #4e5969; margin-bottom: 6rpx; }
.empty-hint { font-size: 22rpx; color: #86909c; }
.modal-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.poster-modal {
  width: 600rpx;
}
.poster-preview {
  background: #fff;
  border-radius: 20px;
  padding: 40rpx;
  margin-bottom: 24rpx;
}
.poster-placeholder {
  text-align: center;
}
.poster-logo {
  font-size: 80rpx;
  margin-bottom: 16rpx;
}
.poster-slogan {
  font-size: 36rpx;
  font-weight: 700;
  color: #165dff;
  margin-bottom: 8rpx;
}
.poster-desc {
  font-size: 24rpx;
  color: #86909c;
  margin-bottom: 40rpx;
}
.qrcode {
  width: 200rpx;
  height: 200rpx;
  background: #f2f3f5;
  border-radius: 12px;
  margin: 0 auto 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.qrcode-placeholder {
  font-size: 24rpx;
  color: #c9cdd4;
}
.poster-tip {
  font-size: 22rpx;
  color: #86909c;
}
.poster-actions {
  display: flex;
  gap: 16rpx;
}
.poster-btn {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 40rpx;
  font-size: 28rpx;
  background: #165dff;
  color: #fff;
}
.poster-btn.cancel {
  background: rgba(255,255,255,0.2);
  color: #fff;
}
</style>
