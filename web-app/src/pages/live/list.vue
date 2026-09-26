<template>
  <view class="live-list-page">
    <!-- 自定义导航 -->
    <view class="nav-bar">
      <view class="nav-back" @click="goBack"><text class="back-arrow">‹</text></view>
      <view class="nav-title">直播间</view>
      <view class="nav-right"></view>
    </view>

    <!-- 列表 -->
    <view class="list" v-if="list.length">
      <view v-for="r in list" :key="r.id" class="live-card" @click="openRoom(r)">
        <view class="live-cover">
          <image v-if="r.cover" :src="resolveUrl(r.cover)" class="cover-img" mode="aspectFill" />
          <view v-else class="cover-img cover-empty"><text>直播</text></view>
          <view class="live-tag" :class="{ off: r.status !== '直播中' }">
            <text v-if="r.status === '直播中'" class="tag-dot"></text>{{ liveStatusText(r.status) }}
          </view>
          <view class="live-viewer" v-if="r.viewer"><text>{{ fmtViewer(r.viewer) }}人观看</text></view>
        </view>
        <view class="live-info">
          <view class="live-title">{{ r.title }}</view>
          <view class="live-meta">
            <text class="anchor">{{ r.anchor || '主播' }}</text>
            <text v-if="r.startTime" class="time">{{ r.startTime.slice(5, 16) }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="empty" v-else-if="!loading">
      <text class="empty-icon">📺</text>
      <text>暂无直播</text>
    </view>

    <view class="load-more" v-if="list.length && hasMore" @click="loadMore">加载更多</view>
    <view class="load-more" v-else-if="list.length">已加载全部</view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi';

const tid = ref('');
const list = ref([]);
const page = ref(1);
const hasMore = ref(true);
const loading = ref(false);

onLoad((options) => {
  tid.value = options.tid || options.customerId || '';
  loadList(true);
});

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:\/\//.test(u) || u.startsWith('data:')) return u;
  // H5 端同源相对路径；小程序端补完整域名
  if (typeof window !== 'undefined' && window.location) return u;
  return (u.startsWith('/') ? '' : '/') + u;
}

function liveStatusText(s) {
  return s === '未开始' ? '未开始' : (s === '直播中' ? '直播中' : (s || '直播'));
}

function fmtViewer(n) {
  return n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n);
}

async function loadList(reset) {
  if (loading.value) return;
  loading.value = true;
  try {
    const res = await cardApi.liveRooms({ tid: tid.value, page: reset ? 1 : page.value, pageSize: 10 });
    const rows = res.list || [];
    list.value = reset ? rows : list.value.concat(rows);
    hasMore.value = list.value.length < (res.total || 0);
    page.value = reset ? 2 : page.value + 1;
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function openRoom(r) {
  if (!r || !r.roomId) {
    uni.showToast({ title: '该直播间暂未开放观看', icon: 'none' });
    return;
  }
  const q = `roomId=${r.roomId}&tid=${tid.value || ''}&title=${encodeURIComponent(r.title || '')}&cover=${encodeURIComponent(r.cover || '')}&anchor=${encodeURIComponent(r.anchor || '')}`;
  uni.navigateTo({ url: `/pages/cardMain/live?${q}` });
}

function goBack() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/cardMain/home' }) });
}
</script>

<style>
.live-list-page { min-height: 100vh; background: #F7F8FA; padding-bottom: 40rpx; }
.nav-bar { display: flex; align-items: center; height: 88rpx; padding: 0 24rpx; background: #fff; position: sticky; top: 0; z-index: 10; }
.nav-back { width: 72rpx; }
.back-arrow { font-size: 40rpx; color: #1D2129; }
.nav-title { flex: 1; text-align: center; font-size: 32rpx; font-weight: 600; color: #1D2129; }
.nav-right { width: 72rpx; }
.list { padding: 20rpx 24rpx 0; }
.live-card { background: #fff; border-radius: 16rpx; overflow: hidden; margin-bottom: 20rpx; }
.live-cover { position: relative; }
.cover-img { width: 100%; height: 360rpx; display: block; }
.cover-empty { display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #F2F3F5, #E5E6EB); color: #86909C; font-size: 30rpx; }
.live-tag { position: absolute; left: 16rpx; top: 16rpx; display: flex; align-items: center; gap: 8rpx; padding: 6rpx 16rpx; border-radius: 999rpx; background: rgba(0,0,0,0.55); color: #fff; font-size: 22rpx; }
.live-tag.off { background: rgba(0,0,0,0.45); }
.tag-dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: #F53F3F; }
.live-viewer { position: absolute; right: 16rpx; bottom: 16rpx; padding: 4rpx 12rpx; border-radius: 999rpx; background: rgba(0,0,0,0.5); color: #fff; font-size: 20rpx; }
.live-info { padding: 20rpx 24rpx 24rpx; }
.live-title { font-size: 30rpx; font-weight: 600; color: #1D2129; line-height: 1.4; }
.live-meta { display: flex; align-items: center; gap: 16rpx; margin-top: 10rpx; font-size: 24rpx; color: #86909C; }
.empty { display: flex; flex-direction: column; align-items: center; padding: 160rpx 0; color: #86909C; font-size: 26rpx; }
.empty-icon { font-size: 64rpx; margin-bottom: 16rpx; }
.load-more { text-align: center; padding: 24rpx; color: #86909C; font-size: 24rpx; }
</style>
