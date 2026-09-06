<template>
  <view class="login-page">
    <view class="login-bg"></view>
    <view class="login-content">
      <view class="logo">💼</view>
      <view class="title">智能名片</view>
      <view class="subtitle">平台型智能名片系统</view>
      <view class="slogan">个人自主创建 · 企业统一管理 · 平台运营</view>
      
      <button class="wx-login-btn" @click="handleWxLogin">
        <text class="wx-icon">💬</text>
        <text>微信一键登录</text>
      </button>
      
      <view class="tips">
        <text>登录即表示同意</text>
        <text class="link">《用户协议》</text>
        <text>和</text>
        <text class="link">《隐私政策》</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { cardApi } from '../../utils/cardApi.js';

function handleWxLogin() {
  // #ifdef H5
  // H5端不支持微信登录，使用模拟code直接登录
  doLogin('h5_mock_' + Date.now());
  // #endif
  // #ifndef H5
  uni.login({
    provider: 'weixin',
    success: (res) => doLogin(res.code),
    fail: () => {
      uni.showToast({ title: '微信登录失败', icon: 'none' });
    },
  });
  // #endif
}

async function doLogin(code) {
  try {
    const parentId = uni.getStorageSync('share_parent_id') || '';
    const result = await cardApi.wxLogin(code, parentId);
    uni.setStorageSync('card_token', result.token);
    uni.setStorageSync('card_user', result.user);
    
    if (result.isNew || !result.hasCard) {
      uni.reLaunch({ url: '/pages/card/create' });
    } else {
      uni.reLaunch({ url: '/pages/cardMain/home' });
    }
  } catch (e) {
    uni.showToast({ title: e.message || '登录失败', icon: 'none' });
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #165dff 0%, #4080ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 40rpx;
  padding-top: 88px;
  padding-bottom: 36px;
}
.login-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(circle at 30% 20%, rgba(255,255,255,0.1) 0%, transparent 50%);
}
.login-content {
  width: 100%;
  text-align: center;
  position: relative;
  z-index: 1;
}
.logo {
  font-size: 120rpx;
  margin-bottom: 30rpx;
}
.title {
  font-size: 48rpx;
  font-weight: 700;
  color: #fff;
  margin-bottom: 16rpx;
}
.subtitle {
  font-size: 28rpx;
  color: rgba(255,255,255,0.9);
  margin-bottom: 12rpx;
}
.slogan {
  font-size: 24rpx;
  color: rgba(255,255,255,0.7);
  margin-bottom: 80rpx;
}
.wx-login-btn {
  background: #fff;
  color: #165dff;
  border-radius: 48rpx;
  height: 96rpx;
  line-height: 96rpx;
  font-size: 32rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-bottom: 40rpx;
}
.wx-icon {
  font-size: 36rpx;
}
.tips {
  font-size: 22rpx;
  color: rgba(255,255,255,0.6);
}
.link {
  color: rgba(255,255,255,0.9);
  text-decoration: underline;
}
</style>
