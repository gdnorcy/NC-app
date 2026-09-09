<template>
  <view class="dist-page">
    <!-- 顶部 -->
    <view class="hero g3" :style="heroStyle">
      <view class="hero-top">
        <view class="hero-title">我的钱包</view>
        <view class="hero-top-r">
          <view class="id-switch" @click="switchIdentity"><SIcon name="exchange" size="small" color="#ffffff" /><text>{{ identityLabel }}</text></view>
        </view>
      </view>
      <view class="money-row">
        <view class="money-left">
          <view class="money-label">可提现余额（元）</view>
          <view class="money-val">{{ fen(summary.wallet?.available) }}</view>
          <view class="money-sub">
            <text class="m-sub-item">提现中 {{ fen(summary.withdrawing) }}</text>
            <text class="m-sub-item">待入账 {{ fen(summary.wallet?.waitSettle) }}</text>
          </view>
        </view>
      </view>
      <!-- 钱包统计 -->
      <view class="wallet-stats">
        <view class="ws-item"><text class="ws-num">{{ fen(summary.wallet?.totalIncome) }}</text><text class="ws-lb">累计收益</text></view>
        <view class="ws-divider"></view>
        <view class="ws-item"><text class="ws-num">{{ fen(summary.wallet?.totalWithdraw) }}</text><text class="ws-lb">累计提现</text></view>
      </view>
    </view>

    <!-- 无权限 -->
    <view v-if="summary.unbound" class="tip-box">当前暂无分销/分红权限，入驻租户并绑定推广关系后可查看收益</view>

    <!-- 提现申请 -->
    <view class="withdraw-box">
      <view class="wd-row">
        <text class="wd-label">可提现余额</text>
        <text class="wd-val">{{ fen(summary.wallet?.available) }} 元</text>
      </view>
      <view class="wd-input-row">
        <text class="wd-label">提现金额(元)</text>
        <input class="wd-input" type="digit" v-model="withdrawAmount" placeholder="输入提现金额" />
      </view>
      <button class="primary-btn" :disabled="withdrawing || summary.unbound" @click="applyWithdraw">申请提现</button>
    </view>

    <!-- 提现记录 -->
    <view class="sec-t">提现记录</view>
    <view class="withdraw-list">
      <view v-for="w in withdraws" :key="w.id" class="wd-item">
        <view class="wd-top">
          <text class="wd-no">{{ w.withdraw_no }}</text>
          <text class="wd-status" :class="wdCls(w.status)">{{ withdrawLabel(w.status) }}</text>
        </view>
        <view class="wd-mid">提现 {{ fen(w.amount) }} 元 · 手续费 {{ fen(w.service_fee) }} · 实到 {{ fen(w.actual_amount) }}</view>
        <view v-if="w.status === 'rejected' && w.reject_reason" class="wd-reason">驳回原因：{{ w.reject_reason }}</view>
      </view>
      <view v-if="!withdraws.length" class="empty">暂无提现记录</view>
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
const summary = ref({ wallet: null, withdrawing: 0, selfName: '我', unbound: false });
const withdraws = ref([]);
const withdrawAmount = ref('');
const withdrawing = ref(false);

function fen(v) { return ((Number(v) || 0) / 100).toFixed(2); }
function withdrawLabel(s) { return { pending: '待审核', approved: '待打款', rejected: '已驳回', done: '已完成' }[s] || s; }
function wdCls(s) { return { pending: 'st-p', approved: 'st-s', rejected: 'st-c', done: 'st-d' }[s] || ''; }

function switchIdentity() {
  identity.value = identity.value === 'individual' ? 'employee' : 'individual';
  loadAll();
}
async function loadAll() {
  try {
    summary.value = await cardApi.distSummary(identity.value);
  } catch (e) {
    summary.value = { wallet: null, withdrawing: 0, selfName: '我', unbound: true };
  }
  try {
    const res = await cardApi.distWithdraws({ page: 1, pageSize: 20, identityType: identity.value });
    withdraws.value = res.list || [];
  } catch (e) { withdraws.value = []; }
}

async function applyWithdraw() {
  const amt = Number(withdrawAmount.value);
  if (!amt || amt <= 0) { uni.showToast({ title: '请输入提现金额', icon: 'none' }); return; }
  withdrawing.value = true;
  try {
    // 小程序端先请求微信订阅授权（提现审核/打款通知；用户拒绝不阻断提现）
    // #ifdef MP-WEIXIN
    try {
      await uni.requestSubscribeMessage({
        tmplIds: [summary.value.subTmplReview, summary.value.subTmplDone].filter(Boolean),
      });
    } catch (e) { /* 用户拒绝订阅不阻断提现 */ }
    // #endif
    await cardApi.distWithdraw(amt, identity.value);
    uni.showToast({ title: '提现申请已提交', icon: 'success' });
    withdrawAmount.value = '';
    loadAll();
  } catch (e) {
    uni.showToast({ title: e.message || '提现失败', icon: 'none' });
  } finally { withdrawing.value = false; }
}

onShow(() => {
  trackPageView('distribution_wallet');
  loadAll();
});
</script>

<style scoped>
.dist-page { min-height: 100vh; background: #f5f6f7; padding-bottom: 120rpx; }
.g3 { background: linear-gradient(155deg, #0f766e, #14b8a6); }
.hero { padding: 32rpx 32rpx 36rpx; color: #fff; border-radius: 0 0 32rpx 32rpx; }
.hero-top { display: flex; align-items: center; justify-content: space-between; }
.hero-title { font-size: 38rpx; font-weight: 700; }
.hero-top-r { display: flex; align-items: center; gap: 24rpx; }
.id-switch { display: flex; align-items: center; gap: 8rpx; font-size: 24rpx; opacity: 0.92; }
.money-row { margin-top: 28rpx; }
.money-label { font-size: 24rpx; opacity: 0.85; }
.money-val { font-size: 56rpx; font-weight: 700; line-height: 1.2; }
.money-sub { display: flex; gap: 20rpx; margin-top: 8rpx; font-size: 22rpx; opacity: 0.9; }
.wallet-stats { margin-top: 28rpx; display: flex; align-items: center; background: rgba(255,255,255,0.14); border-radius: 20rpx; padding: 22rpx 0; }
.ws-item { flex: 1; text-align: center; display: flex; flex-direction: column; gap: 6rpx; }
.ws-num { font-size: 34rpx; font-weight: 700; }
.ws-lb { font-size: 22rpx; opacity: 0.88; }
.ws-divider { width: 2rpx; height: 56rpx; background: rgba(255,255,255,0.28); }
.tip-box { margin: 24rpx 32rpx; padding: 24rpx; background: #fff8e6; color: #ad6800; font-size: 26rpx; border-radius: 16rpx; line-height: 1.6; }
.withdraw-box { margin: 24rpx 32rpx; background: #fff; border-radius: 20rpx; padding: 28rpx 24rpx; }
.wd-row { display: flex; justify-content: space-between; align-items: center; }
.wd-label { font-size: 26rpx; color: #4e5969; }
.wd-val { font-size: 30rpx; font-weight: 600; color: #1d2129; }
.wd-input-row { margin-top: 24rpx; display: flex; align-items: center; gap: 20rpx; }
.wd-input { flex: 1; background: #f7f8fa; border-radius: 12rpx; padding: 18rpx 24rpx; font-size: 30rpx; }
.primary-btn { margin-top: 28rpx; background: #165dff; color: #fff; font-size: 30rpx; font-weight: 600; border-radius: 999rpx; line-height: 2.6; }
.primary-btn[disabled] { opacity: 0.5; }
.sec-t { margin: 32rpx 32rpx 16rpx; font-size: 30rpx; font-weight: 600; color: #1d2129; }
.withdraw-list { margin: 0 32rpx; background: #fff; border-radius: 20rpx; padding: 8rpx 24rpx; }
.wd-item { padding: 24rpx 0; border-top: 1rpx solid #f2f3f5; }
.wd-item:first-child { border-top: none; }
.wd-top { display: flex; justify-content: space-between; align-items: center; }
.wd-no { font-size: 24rpx; color: #4e5969; }
.wd-status { font-size: 24rpx; }
.st-p { color: #ff7d00; } .st-s { color: #165dff; } .st-c { color: #f53f3f; } .st-d { color: #00b42a; }
.wd-mid { margin-top: 10rpx; font-size: 24rpx; color: #86909c; }
.wd-reason { margin-top: 8rpx; font-size: 22rpx; color: #f53f3f; }
.empty { padding: 40rpx 0; text-align: center; color: #86909c; font-size: 26rpx; }
</style>
