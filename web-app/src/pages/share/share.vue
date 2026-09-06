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
  padding: 20px;
}
.share-card {
  background: #fff;
  border-radius: 16px;
  padding: 32px 24px;
  text-align: center;
  width: 100%;
  max-width: 360px;
}
.qrcode {
  width: 200px;
  height: 200px;
  margin: 0 auto 20px;
}
.share-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1b1c;
  display: block;
}
.share-desc {
  font-size: 14px;
  color: #909399;
  margin-top: 8px;
  display: block;
}
.share-buttons {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.share-btn {
  width: 100%;
  background: #165DFF;
  color: #fff;
  border-radius: 8px;
  font-size: 15px;
}
.share-btn.secondary {
  background: #f0f2f5;
  color: #1a1b1c;
}
</style>
