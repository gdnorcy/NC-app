<template>
  <view class="live-page">
    <!-- 自定义导航 -->
    <view class="nav-bar">
      <view class="nav-back" @click="goBack"><text class="back-arrow">‹</text></view>
      <view class="nav-title">直播</view>
      <view class="nav-right"></view>
    </view>

    <view class="body">
      <!-- 小程序端：微信直播播放器（room-id = 微信直播间ID） -->
      <view v-if="isMpWeixin" class="player-wrap">
        <live-player
          v-if="roomId"
          class="live-player"
          :room-id="String(roomId)"
          mode="live"
          autoplay
          object-fit="contain"
          @statechange="onPlayerState"
        />
        <view v-else class="player-empty"><text>缺少直播间ID</text></view>
      </view>

      <!-- H5 端：微信小程序直播无网页播放，展示封面 + 提示 -->
      <view v-else class="h5-cover" :style="coverBg">
        <view class="h5-mask">
          <text class="h5-icon">📺</text>
          <text class="h5-tip">直播间已开播，请在微信小程序内观看</text>
          <text class="h5-sub">在微信中搜索小程序并进入「直播间」</text>
        </view>
      </view>

      <!-- 房间信息 -->
      <view class="room-info" v-if="title">
        <view class="room-title">{{ title }}</view>
        <view class="room-meta">
          <text v-if="anchor" class="anchor">{{ anchor }}</text>
          <text class="status" :class="{ live: status === '直播中' }">{{ statusText }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

const roomId = ref('');
const tid = ref('');
const title = ref('');
const cover = ref('');
const anchor = ref('');
const status = ref('直播中');
const isMpWeixin = ref(false);

onLoad((options) => {
  roomId.value = options.roomId || '';
  tid.value = options.tid || '';
  title.value = options.title ? decodeURIComponent(options.title) : '';
  cover.value = options.cover ? decodeURIComponent(options.cover) : '';
  anchor.value = options.anchor ? decodeURIComponent(options.anchor) : '';
  // #ifdef MP-WEIXIN
  isMpWeixin.value = true;
  // #endif
});

const statusText = status.value === '直播中' ? '直播中' : (status.value || '直播');

function onPlayerState(e) {
  const code = e && e.detail && e.detail.code;
  // 2001=已连接 2002=加载中 2003=播放中 2004=播放失败 -2301=网络断
  if (code === 2004 || code === -2301) {
    uni.showToast({ title: '直播加载失败，请稍后重试', icon: 'none' });
  }
}

function coverBg() {
  return cover.value ? { backgroundImage: `url(${cover.value})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {};
}

function goBack() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/cardMain/home' }) });
}
</script>

<style>
.live-page { min-height: 100vh; background: #000; }
.nav-bar { display: flex; align-items: center; height: 88rpx; padding: 0 24rpx; background: rgba(0,0,0,0.85); color: #fff; }
.nav-back { width: 72rpx; }
.back-arrow { font-size: 40rpx; color: #fff; }
.nav-title { flex: 1; text-align: center; font-size: 32rpx; font-weight: 600; }
.nav-right { width: 72rpx; }
.body { padding: 20rpx; }
.player-wrap { background: #000; border-radius: 16rpx; overflow: hidden; }
.live-player { width: 100%; height: 840rpx; }
.player-empty { display: flex; align-items: center; justify-content: center; height: 840rpx; color: #fff; font-size: 28rpx; }
.h5-cover { position: relative; height: 840rpx; border-radius: 16rpx; overflow: hidden; }
.h5-mask { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(0,0,0,0.55); color: #fff; padding: 0 48rpx; }
.h5-icon { font-size: 72rpx; margin-bottom: 20rpx; }
.h5-tip { font-size: 30rpx; font-weight: 600; text-align: center; }
.h5-sub { font-size: 24rpx; opacity: 0.8; margin-top: 12rpx; text-align: center; }
.room-info { padding: 28rpx 8rpx; }
.room-title { font-size: 34rpx; font-weight: 600; color: #fff; }
.room-meta { display: flex; align-items: center; gap: 20rpx; margin-top: 12rpx; font-size: 26rpx; color: #C9CDD4; }
.status.live { color: #F53F3F; }
</style>
