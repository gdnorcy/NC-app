<template>
  <view class="share-page">
    <view class="share-card">
      <image class="qrcode" :src="qrCodeUrl" mode="aspectFit" />
      <text class="share-title">{{ planName }}</text>
      <text class="share-desc">扫描二维码查看360°全景</text>
      <view class="share-buttons">
        <button class="share-btn" @tap="shareToFriend">分享给朋友</button>
        <button class="share-btn secondary" @tap="copyLink">复制链接</button>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      planId: null,
      planName: '',
      shareUrl: '',
      qrCodeUrl: '',
    };
  },
  onLoad(options) {
    this.planId = options.planId;
    this.planName = options.planName || '360全景';
    this.shareUrl = `${location.origin}/?plan=${this.planId}`;
    this.qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(this.shareUrl)}`;
  },
  methods: {
    shareToFriend() {
      // #ifdef MP-WEIXIN
      uni.showToast({ title: '点击右上角分享', icon: 'none' });
      // #endif
      // #ifdef H5
      if (navigator.share) {
        navigator.share({ title: this.planName, url: this.shareUrl });
      } else {
        this.copyLink();
      }
      // #endif
    },
    copyLink() {
      uni.setClipboardData({
        data: this.shareUrl,
        success: () => uni.showToast({ title: '链接已复制', icon: 'success' }),
      });
    },
  },
};
</script>

<style scoped>
.share-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}
.share-card {
  background: var(--white);
  border-radius: 32rpx;
  padding: 64rpx 48rpx;
  text-align: center;
  width: 100%;
  max-width: 720rpx;
}
.qrcode {
  width: 400rpx;
  height: 400rpx;
  margin: 0 auto 40rpx;
}
.share-title {
  font-size: var(--fs-7);
  font-weight: 600;
  color: var(--t5);
  display: block;
}
.share-desc {
  font-size: var(--fs-5);
  color: var(--decor);
  margin-top: 16rpx;
  display: block;
}
.share-buttons {
  margin-top: 48rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.share-btn {
  width: 100%;
  background: var(--primary);
  color: var(--white);
  border-radius: var(--radius-sm);
  font-size: 30rpx;
}
.share-btn.secondary {
  background: var(--bg-card-2);
  color: var(--t5);
}
</style>
