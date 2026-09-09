<template>
  <view class="dist-page">
    <!-- 顶部 -->
    <view class="hero g3" :style="heroStyle">
      <view class="hero-top">
        <view class="hero-title">类目股东</view>
        <view class="hero-top-r">
          <view class="rule-link" @click="showRules = true"><SIcon name="audit" size="small" color="#ffffff" /><text>规则</text></view>
          <view class="id-switch" @click="switchIdentity"><SIcon name="exchange" size="small" color="#ffffff" /><text>{{ identityLabel }}</text></view>
        </view>
      </view>
      <view class="user-row">
        <view class="user-line">
          <image v-if="summary.selfAvatar" class="user-avatar" :src="summary.selfAvatar" mode="aspectFill" />
          <view v-else class="user-avatar placeholder">{{ (summary.selfName || '我')[0] }}</view>
          <view class="user-name">{{ summary.selfName || '我' }}</view>
        </view>
        <!-- 行业股东标签组 -->
        <view v-if="catTags.length" class="tag-row">
          <view v-for="t in catTags" :key="t" class="tag">{{ t }}</view>
        </view>
      </view>
      <view class="money-row">
        <view class="money-left">
          <view class="money-label">待分红（元）</view>
          <view class="money-val">{{ fen(summary.sharePending) }}</view>
        </view>
        <view class="money-right">
          <view class="money-right-item"><text class="mr-lb">累计分红</text><text class="mr-val">{{ fen(summary.shareTotal) }}</text></view>
        </view>
      </view>
    </view>

    <!-- 无身份提示 -->
    <view v-if="!catTags.length" class="tip-box">
      <text v-if="summary.unbound">当前暂无分红权限，入驻租户后可查看收益</text>
      <text v-else>暂未获得类目股东身份，可以向租户管理员申请开通</text>
    </view>

    <!-- 权益说明（无身份时展示） -->
    <view v-if="!catTags.length" class="benefit-card">
      <view class="benefit-title">类目股东是什么？</view>
      <view class="benefit-line">· 面向<text class="benefit-em">各行业分会负责人</text>，只分本行业订单</view>
      <view class="benefit-line">· 订单归属行业 = 付费用户名片所选行业类目</view>
      <view class="benefit-line">· 每个行业独立分红比例、独立股东列表，可兼任多行业</view>
      <view class="benefit-line">· 退款自动扣回对应分红，历史明细永久保留</view>
      <view class="benefit-cta">获得身份后，本页将按行业分组展示你的分红收益</view>
    </view>

    <!-- 行业分组（类目股东多行业时按维度汇总+筛选） -->
    <view v-if="catGroups.length" class="grp-wrap">
      <view class="grp-tabs">
        <view class="grp-tab" :class="{ on: activeCat === '' }" @click="activeCat = ''">全部</view>
        <view v-for="g in catGroups" :key="g.category" class="grp-tab" :class="{ on: activeCat === g.category }" @click="activeCat = g.category">{{ g.category }}</view>
      </view>
      <view class="grp-cards">
        <view class="grp-card">
          <text class="gc-lb">待分红（元）</text>
          <text class="gc-val">{{ fen(curCatPending) }}</text>
        </view>
        <view class="grp-card">
          <text class="gc-lb">累计分红（元）</text>
          <text class="gc-val">{{ fen(curCatTotal) }}</text>
        </view>
      </view>
    </view>

    <!-- 分红明细 -->
    <view class="sec-t">分红明细</view>
    <view class="log-list">
      <view v-for="l in showLogs" :key="l.id" class="log-item">
        <view class="log-top">
          <text class="log-type">{{ l.typeLabel }}</text>
          <text v-if="l.sourceCategory" class="log-src">来源行业：{{ l.sourceCategory }}</text>
          <text class="log-amt" :class="{ neg: l.status === 'charged_back' }">{{ l.status === 'charged_back' ? '-' : '+' }}{{ fen(l.amount) }}</text>
        </view>
        <view class="log-mid">
          <text class="log-no">{{ l.orderNo }}</text>
          <text class="log-st" :class="stCls(l.status)">{{ l.statusLabel }}</text>
        </view>
        <view class="log-bot">
          <text>{{ l.createdAt }}</text>
          <text v-if="l.remark" class="log-rm">{{ l.remark }}</text>
        </view>
      </view>
      <view v-if="!showLogs.length" class="empty">还没有产生分红，订单完成后分红会在这里展示</view>
    </view>

    <!-- 规则 -->
    <view v-if="showRules" class="qr-mask" @click="showRules = false">
      <view class="qr-panel rules-panel" @click.stop>
        <view class="qr-title">业务规则</view>
        <scroll-view scroll-y class="rules-scroll">
          <view class="rules-text">
            <view class="rule-p">· 类目股东按「订单买家所属行业」触发对应行业分红池</view>
            <view class="rule-p">· 分红金额 = 订单实付金额 × 该类目分红比例 × 权重占比</view>
            <view class="rule-p">· 订单售后退款会扣回对应分红</view>
            <view class="rule-p">· 后台撤销类目股东身份后，历史收益保留、不再产生新分红</view>
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
const summary = ref({ wallet: null, selfName: '我', selfAvatar: '', unbound: false, shareTags: [], sharePending: 0, shareTotal: 0, shareCatGroups: [] });
const showRules = ref(false);
const logs = ref([]);
const activeCat = ref('');
const catTags = computed(() => summary.value.shareTags.filter((t) => t.startsWith('行业-')));
const catGroups = computed(() => summary.value.shareCatGroups || []);
const curCatGroup = computed(() => (activeCat.value ? (catGroups.value.find((g) => g.category === activeCat.value) || null) : null));
const curCatPending = computed(() => (curCatGroup.value ? curCatGroup.value.pending : summary.value.shareCatPending || 0));
const curCatTotal = computed(() => (curCatGroup.value ? curCatGroup.value.total : summary.value.shareCatTotal || 0));
const showLogs = computed(() => (activeCat.value ? logs.value.filter((l) => l.sourceCategory === activeCat.value) : logs.value));

function fen(v) { return ((Number(v) || 0) / 100).toFixed(2); }
function stCls(s) { return { pending: 'st-p', settled: 'st-s', charged_back: 'st-c' }[s] || ''; }

function switchIdentity() {
  identity.value = identity.value === 'individual' ? 'employee' : 'individual';
  loadAll();
}
async function loadAll() {
  try {
    summary.value = await cardApi.distSummary(identity.value);
  } catch (e) {
    summary.value = { wallet: null, selfName: '我', selfAvatar: '', unbound: true, shareTags: [], sharePending: 0, shareTotal: 0, shareCatGroups: [] };
  }
  try {
    const res = await cardApi.distLogs({ page: 1, pageSize: 50, type: 'share_cat', identityType: identity.value });
    logs.value = res.list || [];
  } catch (e) { logs.value = []; }
}

onShow(() => {
  trackPageView('distribution_share_cat');
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
.rule-link, .id-switch { display: flex; align-items: center; gap: 8rpx; font-size: 24rpx; opacity: 0.92; }
.user-row { margin-top: 30rpx; }
.user-line { display: flex; align-items: center; gap: 16rpx; }
.user-avatar { width: 88rpx; height: 88rpx; border-radius: 50%; background: rgba(255,255,255,0.25); border: 2rpx solid rgba(255,255,255,0.6); }
.user-avatar.placeholder { display: flex; align-items: center; justify-content: center; font-size: 36rpx; color: #fff; }
.user-name { font-size: 34rpx; font-weight: 600; }
.tag-row { margin-top: 18rpx; display: flex; flex-wrap: wrap; gap: 12rpx; }
.tag { font-size: 22rpx; padding: 6rpx 18rpx; border-radius: 999rpx; background: rgba(255,255,255,0.22); }
.money-row { margin-top: 28rpx; display: flex; align-items: flex-end; justify-content: space-between; }
.money-label { font-size: 24rpx; opacity: 0.85; }
.money-val { font-size: 56rpx; font-weight: 700; line-height: 1.2; }
.money-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8rpx; }
.money-right-item { display: flex; flex-direction: column; align-items: flex-end; gap: 6rpx; }
.mr-lb { font-size: 22rpx; opacity: 0.85; }
.mr-val { font-size: 32rpx; font-weight: 600; }
.tip-box { margin: 24rpx 32rpx; padding: 24rpx; background: #fff8e6; color: #ad6800; font-size: 26rpx; border-radius: 16rpx; line-height: 1.6; }
.benefit-card { margin: 0 32rpx 24rpx; padding: 28rpx; background: #f0f7ff; border: 1rpx solid #c8e0ff; border-radius: 16rpx; }
.benefit-title { font-size: 28rpx; font-weight: 600; color: #165dff; margin-bottom: 14rpx; }
.benefit-line { font-size: 25rpx; color: #4e5969; line-height: 1.8; }
.benefit-em { color: #165dff; font-weight: 500; }
.benefit-cta { margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx dashed #c8e0ff; font-size: 24rpx; color: #86909c; }
.grp-wrap { margin: 24rpx 32rpx 0; }
.grp-tabs { display: flex; flex-wrap: wrap; gap: 12rpx; }
.grp-tab { font-size: 24rpx; padding: 10rpx 26rpx; border-radius: 999rpx; background: #fff; color: #4e5969; border: 1rpx solid #e5e6eb; }
.grp-tab.on { background: #e8f3ff; color: #165dff; border-color: #165dff; font-weight: 500; }
.grp-cards { margin-top: 16rpx; display: flex; gap: 16rpx; }
.grp-card { flex: 1; background: #fff; border-radius: 16rpx; padding: 20rpx 24rpx; display: flex; flex-direction: column; gap: 8rpx; }
.gc-lb { font-size: 22rpx; color: #86909c; }
.gc-val { font-size: 36rpx; font-weight: 700; color: #1d2129; }
.sec-t { margin: 32rpx 32rpx 16rpx; font-size: 30rpx; font-weight: 600; color: #1d2129; }
.log-list { margin: 0 32rpx; background: #fff; border-radius: 20rpx; padding: 8rpx 24rpx; }
.log-item { padding: 24rpx 0; border-top: 1rpx solid #f2f3f5; }
.log-item:first-child { border-top: none; }
.log-top { display: flex; align-items: center; gap: 12rpx; }
.log-type { font-size: 28rpx; color: #1d2129; }
.log-src { font-size: 22rpx; color: #ff7d00; background: #fff3e8; padding: 2rpx 12rpx; border-radius: 999rpx; }
.log-amt { margin-left: auto; font-size: 30rpx; font-weight: 700; color: #00b42a; }
.log-amt.neg { color: #f53f3f; }
.log-mid { margin-top: 8rpx; display: flex; justify-content: space-between; align-items: center; }
.log-no { font-size: 22rpx; color: #86909c; }
.log-st { font-size: 22rpx; }
.st-p { color: #ff7d00; } .st-s { color: #00b42a; } .st-c { color: #f53f3f; }
.log-bot { margin-top: 8rpx; font-size: 22rpx; color: #c9cdd4; display: flex; gap: 16rpx; }
.empty { padding: 40rpx 0; text-align: center; color: #86909c; font-size: 26rpx; }
.qr-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 99; display: flex; align-items: center; justify-content: center; }
.qr-panel { width: 600rpx; background: #fff; border-radius: 24rpx; padding: 40rpx 32rpx 32rpx; display: flex; flex-direction: column; gap: 20rpx; max-height: 80vh; }
.qr-title { font-size: 32rpx; font-weight: 600; text-align: center; color: #1d2129; }
.rules-scroll { max-height: 46vh; }
.rules-text { font-size: 26rpx; color: #4e5969; line-height: 2; }
.rule-p { padding: 4rpx 0; }
.mini-btn.ghost { background: #fff; color: #4e5969; border: 1rpx solid #e5e6eb; }
</style>
