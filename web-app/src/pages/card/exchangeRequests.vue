<template>
  <view class="req-page">
    <!-- 顶部导航栏 -->
    <view class="nav-bar">
      <view class="nav-back" @click="goBack">
        <SIcon name="dynamic" size="default" color="#1a1a1a" />
      </view>
      <view class="nav-title">交换申请</view>
      <view class="nav-right"></view>
    </view>

    <view class="req-tabs">
      <view class="req-tab" :class="{ on: activeTab === 'incoming' }" @click="activeTab = 'incoming'">
        收到的<text v-if="incoming.length" class="tab-badge">{{ incoming.length }}</text>
      </view>
      <view class="req-tab" :class="{ on: activeTab === 'outgoing' }" @click="activeTab = 'outgoing'">我发出的</view>
    </view>

    <!-- 空状态 -->
    <view v-if="!loading && filtered.length === 0" class="empty">
      <view class="empty-icon"><SIcon name="exchange" size="large" color="#9a9a9a" /></view>
      <view class="empty-title">{{ activeTab === 'incoming' ? '暂无交换申请' : '暂无发出的申请' }}</view>
      <view class="empty-desc" v-if="activeTab === 'incoming'">有人向你发起名片交换时会显示在这里</view>
      <view class="empty-desc" v-else>去集市逛逛，向感兴趣的人发起名片交换</view>
      <view class="empty-btn" v-if="activeTab === 'outgoing'" @click="goMarket">去人脉集市</view>
    </view>

    <!-- 列表 -->
    <view v-if="filtered.length" class="req-list">
      <view v-for="r in filtered" :key="r.id" class="req-item">
        <view class="req-avatar">{{ (activeTab === 'incoming' ? r.from_name : r.to_name || '我').slice(0, 1) }}</view>
        <view class="req-info">
          <view class="req-name-row">
            <text class="req-name">{{ activeTab === 'incoming' ? r.from_name : r.to_name }}</text>
            <text class="req-status" :class="statusClass(r.status)">{{ statusText(r.status) }}</text>
          </view>
          <view class="req-msg" v-if="r.message">{{ r.message }}</view>
          <view class="req-time">{{ fmtTime(r.created_at) }}</view>
        </view>
        <view class="req-ops" v-if="activeTab === 'incoming' && r.status === 'pending'">
          <view class="req-btn reject" @click="handle(r, 'reject')">拒绝</view>
          <view class="req-btn accept" @click="handle(r, 'accept')">接受</view>
        </view>
        <view class="req-ops" v-else-if="activeTab === 'outgoing' && r.status === 'pending'">
          <view class="req-btn waiting">等待对方处理</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { trackPageView } from '../../utils/analytics.js';

const requests = ref([]);
const loading = ref(true);
const activeTab = ref('incoming');

const incoming = computed(() => requests.value.filter((r) => r.status === 'pending' && r.to_user_id === myUid()));
const outgoing = computed(() => requests.value.filter((r) => r.from_user_id === myUid()));
const filtered = computed(() => (activeTab.value === 'incoming' ? incoming.value : outgoing.value));

let myUidCache = null;
function myUid() {
  if (myUidCache) return myUidCache;
  try {
    const token = uni.getStorageSync('card_token');
    if (!token) return 0;
    // card_token 格式 base64({uid}).sig；H5 无 Buffer，用 atob（与 myCard.decodeTokenUid 一致）
    const payload = token.split('.')[0];
    const json = typeof atob === 'function'
      ? decodeURIComponent(escape(atob(payload)))
      : (typeof Buffer !== 'undefined' ? Buffer.from(payload, 'base64').toString('utf8') : '');
    myUidCache = JSON.parse(json).uid || 0;
  } catch (e) { myUidCache = 0; }
  return myUidCache;
}

const statusText = (s) => ({ pending: '待处理', accepted: '已接受', rejected: '已拒绝' }[s] || s);
const statusClass = (s) => ({ pending: 'st-pending', accepted: 'st-accepted', rejected: 'st-rejected' }[s] || '');

const fmtTime = (t) => {
  if (!t) return '';
  const d = new Date(String(t).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(t).slice(0, 10);
  const now = new Date();
  const diff = now - d;
  if (diff < 3600 * 1000) return Math.max(1, Math.floor(diff / 60000)) + '分钟前';
  if (diff < 24 * 3600 * 1000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 7 * 24 * 3600 * 1000) return Math.floor(diff / 86400000) + '天前';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const load = async () => {
  loading.value = true;
  try {
    const res = await cardApi.getExchangeList();
    requests.value = res.requests || [];
  } catch (e) {
    uni.showToast({ title: String(e || '加载失败'), icon: 'none' });
  } finally {
    loading.value = false;
  }
};

const handle = (r, action) => {
  const text = action === 'accept' ? `接受「${r.from_name}」的名片交换？接受后双方互为人脉。` : `拒绝「${r.from_name}」的交换申请？`;
  uni.showModal({
    title: action === 'accept' ? '接受交换' : '拒绝申请',
    content: text,
    confirmText: action === 'accept' ? '接受' : '拒绝',
    confirmColor: action === 'accept' ? '#07C160' : '#FF4D4F',
    success: async (m) => {
      if (!m.confirm) return;
      try {
        await cardApi.exchangeHandle({ connectionId: r.id, action });
        uni.showToast({ title: action === 'accept' ? '已接受，成为人脉' : '已拒绝', icon: 'success' });
        load();
      } catch (e) {
        uni.showToast({ title: String(e || '操作失败'), icon: 'none' });
      }
    },
  });
};

const goBack = () => uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/cardMain/home' }) });
const goMarket = () => uni.redirectTo({ url: '/pages/card/market' });

onShow(() => {
  trackPageView('/pages/card/exchangeRequests');
  load();
});
onMounted(load);
</script>

<style scoped>
.req-page { min-height: 100vh; background: var(--bg, #f5f6f7); padding-bottom: 60rpx; }

.nav-bar { display: flex; align-items: center; height: 88rpx; padding: 88rpx 32rpx 0; background: #fff; position: sticky; top: 0; z-index: 10; }
.nav-back { width: 64rpx; height: 64rpx; display: flex; align-items: center; justify-content: center; margin-left: -12rpx; }
.nav-title { flex: 1; font-size: 34rpx; font-weight: 600; color: #1a1a1a; }
.nav-right { width: 64rpx; }

.req-tabs { display: flex; margin: 20rpx 24rpx 0; background: #fff; border-radius: 999rpx; padding: 6rpx; box-shadow: var(--shadow, 0 4rpx 14rpx rgba(20, 40, 70, 0.06)); }
.req-tab { flex: 1; text-align: center; padding: 16rpx 0; border-radius: 999rpx; font-size: 28rpx; color: #5b5b5b; position: relative; }
.req-tab.on { background: var(--wx, #07c160); color: #fff; font-weight: 500; }
.tab-badge { display: inline-block; min-width: 32rpx; height: 32rpx; line-height: 32rpx; border-radius: 999rpx; background: #ff4d4f; color: #fff; font-size: 20rpx; text-align: center; margin-left: 6rpx; padding: 0 8rpx; }

.empty { padding: 120rpx 40rpx; text-align: center; }
.empty-icon { width: 96rpx; height: 96rpx; margin: 0 auto 24rpx; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow, 0 4rpx 14rpx rgba(20, 40, 70, 0.08)); }
.empty-title { font-size: 30rpx; font-weight: 600; color: #1a1a1a; }
.empty-desc { font-size: 24rpx; color: #9a9a9a; margin-top: 10rpx; }
.empty-btn { display: inline-block; margin-top: 36rpx; padding: 16rpx 56rpx; background: var(--wx, #07c160); color: #fff; font-size: 28rpx; border-radius: 999rpx; }

.req-list { padding: 16rpx 24rpx; display: flex; flex-direction: column; gap: 16rpx; }
.req-item { background: #fff; border-radius: 24rpx; padding: 24rpx; display: flex; align-items: center; gap: 20rpx; box-shadow: var(--shadow, 0 4rpx 14rpx rgba(20, 40, 70, 0.06)); }
.req-avatar { width: 80rpx; height: 80rpx; border-radius: 50%; background: var(--blue-soft, #e9f1fb); color: var(--blue, #1d4e8f); font-size: 32rpx; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.req-info { flex: 1; min-width: 0; }
.req-name-row { display: flex; align-items: center; gap: 12rpx; }
.req-name { font-size: 30rpx; font-weight: 600; color: #1a1a1a; }
.req-status { font-size: 20rpx; padding: 4rpx 14rpx; border-radius: 999rpx; }
.st-pending { color: var(--orange, #f59e0b); background: #fdf3e3; }
.st-accepted { color: #07c160; background: #e8f7ef; }
.st-rejected { color: #9a9a9a; background: #f5f6f7; }
.req-msg { font-size: 24rpx; color: #5b5b5b; margin-top: 6rpx; }
.req-time { font-size: 20rpx; color: #9a9a9a; margin-top: 6rpx; }
.req-ops { display: flex; gap: 12rpx; flex-shrink: 0; }
.req-btn { font-size: 24rpx; padding: 10rpx 26rpx; border-radius: 999rpx; text-align: center; }
.req-btn.accept { color: #07c160; background: #e8f7ef; }
.req-btn.reject { color: #ff4d4f; background: #fdecec; }
.req-btn.waiting { color: #9a9a9a; background: #f5f6f7; font-size: 22rpx; }
</style>
