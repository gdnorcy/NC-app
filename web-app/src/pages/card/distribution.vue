<template>
  <view class="dist-page">
    <!-- 顶部主视觉卡：身份切换 + 规则 + 收益总览 -->
    <view class="hero g3" :style="heroStyle">
      <view class="hero-top">
        <view class="hero-title">分销中心</view>
        <view class="hero-top-r">
          <view class="rule-link" @click="showRules = true"><SIcon name="audit" size="small" color="#ffffff" /><text>规则</text></view>
          <view class="id-switch" @click="switchIdentity"><SIcon name="exchange" size="small" color="#ffffff" /><text>{{ identityLabel }}</text></view>
        </view>
      </view>
      <!-- 用户信息 -->
      <view class="user-row">
        <view class="user-left">
          <view class="user-line">
            <image v-if="summary.selfAvatar" class="user-avatar" :src="summary.selfAvatar" mode="aspectFill" />
            <view v-else class="user-avatar placeholder">{{ (summary.selfName || '我')[0] }}</view>
            <view class="user-name">{{ summary.selfName || '我' }}</view>
            <view class="user-level">{{ summary.defaultLevel || '默认等级' }}</view>
          </view>
        </view>
      </view>
      <!-- 收益总览 -->
      <view class="money-row">
        <view class="money-left">
          <view class="money-label">可提现佣金（元）</view>
          <view class="money-val">{{ fen(summary.wallet?.available) }}</view>
          <view class="money-sub">
            <text class="m-sub-item">提现中 {{ fen(summary.withdrawing) }}</text>
            <text class="m-sub-item">待入账 {{ fen(summary.wallet?.waitSettle) }}</text>
          </view>
        </view>
        <view class="money-right">
          <view class="wd-detail-link" @click="goWallet">提现明细 ›</view>
          <view class="withdraw-btn" @click="goWallet">提现</view>
        </view>
      </view>
    </view>

    <!-- 无权限提示 -->
    <view v-if="summary.unbound" class="tip-box">
      当前暂无分销/分红权限，入驻租户并绑定推广关系后可查看收益
    </view>

    <!-- 应用卡片区：按租户开通 + 本人身份动态渲染 -->
    <view class="sec-t">我的分销应用</view>
    <view class="app-cards">
      <view v-if="summary.isEnableDist" class="app-card" @click="go('distPromo')">
        <view class="app-ic ic-blue"><SIcon name="team" size="large" /></view>
        <view class="app-info">
          <view class="app-name">二级推广分销</view>
          <view class="app-sub">今日 ¥{{ fen(summary.todayCommission) }} · 累计 ¥{{ fen(summary.totalCommission) }}</view>
        </view>
        <view v-if="!distQualified" class="app-status st-warn">未获资格</view>
        <view class="app-arrow">›</view>
      </view>

      <view v-if="summary.isEnablePartner" class="app-card" @click="go('distPartner')">
        <view class="app-ic ic-orange"><SIcon name="crown" size="large" /></view>
        <view class="app-info">
          <view class="app-name">合伙人分红</view>
          <view class="app-sub">团队/全局流水分红 · 待分红 ¥{{ fen(summary.partnerPending) }}</view>
        </view>
        <view v-if="!summary.isPartner" class="app-status st-warn">未获身份</view>
        <view class="app-arrow">›</view>
      </view>

      <view v-if="summary.isEnableShareAll" class="app-card" @click="go('distShareAll')">
        <view class="app-ic ic-purple"><SIcon name="badge" size="large" /></view>
        <view class="app-info">
          <view class="app-name">全民股东</view>
          <view class="app-sub">全站流水分红 · 待分红 ¥{{ fen(summary.sharePending) }}</view>
        </view>
        <view v-if="!shareAllTag" class="app-status st-warn">未获身份</view>
        <view class="app-arrow">›</view>
      </view>

      <view v-if="summary.isEnableShareCat" class="app-card" @click="go('distShareCat')">
        <view class="app-ic ic-green"><SIcon name="chart" size="large" /></view>
        <view class="app-info">
          <view class="app-name">类目股东</view>
          <view class="app-sub">行业维度分红 · {{ shareCatTag || '未获身份' }}</view>
        </view>
        <view v-if="!shareCatTag" class="app-status st-warn">未获身份</view>
        <view class="app-arrow">›</view>
      </view>

      <view v-if="summary.isEnableShareArea" class="app-card" @click="go('distShareArea')">
        <view class="app-ic ic-cyan"><SIcon name="orders" size="large" /></view>
        <view class="app-info">
          <view class="app-name">区域股东</view>
          <view class="app-sub">地域维度分红 · {{ shareAreaTag || '未获身份' }}</view>
        </view>
        <view v-if="!shareAreaTag" class="app-status st-warn">未获身份</view>
        <view class="app-arrow">›</view>
      </view>

      <view v-if="!hasAnyApp" class="empty-box">当前租户未开通分销应用，请先联系租户管理员开通</view>
    </view>

    <!-- 分销须知 -->
    <view v-if="showRules" class="qr-mask" @click="showRules = false">
      <view class="qr-panel rules-panel" @click.stop>
        <view class="qr-title">业务规则</view>
        <scroll-view scroll-y class="rules-scroll">
          <rich-text v-if="summary.distNotice" :nodes="summary.distNotice" />
          <view v-else class="rules-text">
            <view class="rule-p">· 一级{{ summary.subName || '下级' }}付费订单产生一级推广佣金，比例为 {{ fmtRatio(summary.ratio1) }}</view>
            <view class="rule-p">· 二级{{ summary.subName || '下级' }}付费订单产生二级推广佣金，比例为 {{ fmtRatio(summary.ratio2) }}</view>
            <view class="rule-p">· 收益按订单实付金额计算，订单售后退款会扣回对应收益</view>
            <view class="rule-p">· 订单完成后进入 {{ summary.settleDay || 7 }} 天结算周期，期满后可提现</view>
          </view>
        </scroll-view>
        <button class="mini-btn ghost" @click="showRules = false">关闭</button>
      </view>
    </view>

    <CardTabBar active="member" />
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { heroGradient } from '../../utils/color.js';
import { trackPageView } from '../../utils/analytics.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';

const brandColor = ref('');
const heroStyle = computed(() => ({ background: heroGradient(brandColor.value, 'linear-gradient(155deg, #0f766e, #14b8a6)') }));
const identity = ref('individual');
const identityLabel = computed(() => (identity.value === 'employee' ? '企业员工身份' : '入驻个人身份'));
const summary = ref({ wallet: null, directCount: 0, indirectCount: 0, monthCommission: 0, monthNew: 0, todayCommission: 0, todayOrder: 0, todayNew: 0, totalCommission: 0, totalOrders: 0, withdrawing: 0, selfName: '我', selfAvatar: '', unbound: false, isEnableDist: false, isEnablePartner: false, isEnableShareAll: false, isEnableShareCat: false, isEnableShareArea: false, isPartner: false, shareTags: [], partnerPending: 0, partnerTotal: 0, sharePending: 0, shareTotal: 0, gate: 0, inWhitelist: false, distName: '推广员', subName: '下级', ratio1: 0.2, ratio2: 0.05, settleDay: 7, distNotice: '' });
const showRules = ref(false);
const fmtRatio = (v) => (Math.round((Number(v) || 0) * 1000) / 10) + '%';

const shareAllTag = computed(() => summary.value.shareTags.includes('全民股东'));
const shareCatTag = computed(() => summary.value.shareTags.find((t) => t.startsWith('行业-')));
const shareAreaTag = computed(() => summary.value.shareTags.find((t) => t.startsWith('地区-')));
/** 分销资格：有推广关系（直推/间推数>0）或已入白名单/申请通过，才不算"未获资格" */
const distQualified = computed(() => {
  if (!summary.value.unbound && (summary.value.directCount + summary.value.indirectCount > 0)) return true;
  return summary.value.inWhitelist === true;
});
const hasAnyApp = computed(() => summary.value.isEnableDist || summary.value.isEnablePartner || summary.value.isEnableShareAll || summary.value.isEnableShareCat || summary.value.isEnableShareArea);

function fen(v) { return ((Number(v) || 0) / 100).toFixed(2); }
function go(page) {
  uni.navigateTo({ url: `/pages/card/${page}` });
}
function goWallet() {
  uni.navigateTo({ url: '/pages/card/distWallet' });
}
function switchIdentity() {
  identity.value = identity.value === 'individual' ? 'employee' : 'individual';
  loadSummary();
}
async function loadSummary() {
  try {
    summary.value = await cardApi.distSummary(identity.value);
  } catch (e) {
    summary.value = { wallet: null, directCount: 0, indirectCount: 0, monthCommission: 0, monthNew: 0, todayCommission: 0, todayOrder: 0, todayNew: 0, totalCommission: 0, totalOrders: 0, withdrawing: 0, selfName: '我', selfAvatar: '', unbound: true, isEnableDist: false, isEnablePartner: false, isEnableShareAll: false, isEnableShareCat: false, isEnableShareArea: false };
  }
}

onShow(() => {
  trackPageView('distribution');
  loadSummary();
});
</script>

<style scoped>
.dist-page { min-height: 100vh; background: #f5f6f7; padding-bottom: 120rpx; }
.g3 { background: linear-gradient(155deg, #0f766e, #14b8a6); }
.hero { padding: 32rpx 32rpx 36rpx; color: #fff; border-radius: 0 0 32rpx 32rpx; }
.hero-top { display: flex; align-items: center; justify-content: space-between; }
.hero-title { font-size: 38rpx; font-weight: 700; }
.hero-top-r { display: flex; align-items: center; gap: 24rpx; }
.rule-link, .id-switch { display: flex; align-items: center; gap: 8rpx; font-size: 24rpx; opacity: 0.92; }
.user-row { margin-top: 30rpx; }
.user-line { display: flex; align-items: center; gap: 16rpx; }
.user-avatar { width: 88rpx; height: 88rpx; border-radius: 50%; background: rgba(255,255,255,0.25); border: 2rpx solid rgba(255,255,255,0.6); }
.user-avatar.placeholder { display: flex; align-items: center; justify-content: center; font-size: 36rpx; color: #fff; }
.user-name { font-size: 34rpx; font-weight: 600; }
.user-level { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 999rpx; background: rgba(255,255,255,0.22); }
.money-row { margin-top: 32rpx; display: flex; align-items: flex-end; justify-content: space-between; }
.money-label { font-size: 24rpx; opacity: 0.85; }
.money-val { font-size: 56rpx; font-weight: 700; line-height: 1.2; }
.money-sub { display: flex; gap: 20rpx; margin-top: 8rpx; font-size: 22rpx; opacity: 0.9; }
.money-right { display: flex; flex-direction: column; align-items: flex-end; gap: 14rpx; }
.wd-detail-link { font-size: 22rpx; opacity: 0.9; }
.withdraw-btn { background: #fff; color: #0f766e; font-size: 28rpx; font-weight: 600; padding: 14rpx 44rpx; border-radius: 999rpx; box-shadow: 0 6rpx 16rpx rgba(0,0,0,0.12); }
.tip-box { margin: 24rpx 32rpx; padding: 24rpx; background: #fff8e6; color: #ad6800; font-size: 26rpx; border-radius: 16rpx; line-height: 1.6; }
.sec-t { margin: 32rpx 32rpx 16rpx; font-size: 30rpx; font-weight: 600; color: #1d2129; }
.app-cards { margin: 0 32rpx; display: flex; flex-direction: column; gap: 20rpx; }
.app-card { display: flex; align-items: center; gap: 24rpx; background: #fff; border-radius: 20rpx; padding: 28rpx 28rpx; box-shadow: 0 4rpx 16rpx rgba(31,35,41,0.05); }
.app-ic { width: 96rpx; height: 96rpx; border-radius: 24rpx; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ic-blue { background: rgba(22,93,255,0.10); } .ic-orange { background: rgba(255,125,0,0.10); }
.ic-purple { background: rgba(114,46,209,0.10); } .ic-green { background: rgba(0,180,42,0.10); }
.ic-cyan { background: rgba(14,165,190,0.10); }
.app-ic :deep(.s-icon) { color: #4e5969; }
.app-info { flex: 1; min-width: 0; }
.app-name { font-size: 30rpx; font-weight: 600; color: #1d2129; }
.app-sub { margin-top: 8rpx; font-size: 24rpx; color: #86909c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-status { flex-shrink: 0; font-size: 22rpx; padding: 6rpx 16rpx; border-radius: 999rpx; }
.st-warn { background: #fff3e8; color: #ff7d00; }
.app-arrow { flex-shrink: 0; color: #c9cdd4; font-size: 32rpx; margin-left: 8rpx; }
.empty-box { padding: 60rpx 20rpx; text-align: center; color: #86909c; font-size: 26rpx; }
.qr-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 99; display: flex; align-items: center; justify-content: center; }
.qr-panel { width: 600rpx; background: #fff; border-radius: 24rpx; padding: 40rpx 32rpx 32rpx; display: flex; flex-direction: column; gap: 20rpx; max-height: 80vh; }
.qr-title { font-size: 32rpx; font-weight: 600; text-align: center; color: #1d2129; }
.rules-scroll { max-height: 46vh; }
.rules-text { font-size: 26rpx; color: #4e5969; line-height: 2; }
.rule-p { padding: 4rpx 0; }
.mini-btn { font-size: 28rpx; background: #165dff; color: #fff; border-radius: 999rpx; line-height: 2.4; }
.mini-btn.ghost { background: #fff; color: #4e5969; border: 1rpx solid #e5e6eb; }
</style>
