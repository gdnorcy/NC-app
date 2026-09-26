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
import { onShow } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { getTid } from '../../utils/mallUtil.js';
import { buildGlobalHomeRedirect } from '../../utils/globalHome.js';
import { JUMP_DONE_KEY } from '../../utils/design.js';
import { DEFAULT_TENANT_ID } from '../../config.js';

// 冷启动首页联动：装修中心「首页」（is_home=1）配置谁就跳谁（商城/全景/名片/自定义页）
// 仅小程序冷启动页检查；游客自动带默认租户读取公开配置；跳转目标页自身不重复检查，无死循环
onShow(() => {
  // #ifndef H5
  checkGlobalHome();
  // #endif
});

async function checkGlobalHome() {
  try {
    // 冷启动跳转按「部署默认租户」的装修首页配置（单租户部署 DEFAULT_TENANT_ID>0），
    // 显式传租户避免登录态被解析到无装修配置的租户导致不跳转；分享/URL 带 tid 时优先
    const tid = getTid();
    const homeTid = tid || (DEFAULT_TENANT_ID ? String(DEFAULT_TENANT_ID) : '');
    const raw = await cardApi.designConfig(false, '', homeTid);
    const pages = getCurrentPages();
    const cur = pages.length ? pages[pages.length - 1].route || '' : '';
    const target = buildGlobalHomeRedirect(raw && raw.homePageUrl, homeTid, cur);
    if (target) {
      // 已按装修中心「首页」完成冷启动跳转：置位会话内首页跳转标记，home 页老逻辑不再二次跳
      uni.setStorageSync(JUMP_DONE_KEY, '1');
      uni.reLaunch({
        url: target,
        fail: (e) => console.warn('[global-home] 跳转失败（开发者工具需清缓存完整编译以更新 app.json 注册）', e && e.errMsg ? e.errMsg : e),
      });
    }
    else console.log('[global-home] 无首页配置或已在本页，跳过跳转', raw && raw.homePageUrl, cur);
  } catch (e) {
    // 配置读取失败不阻断登录页；输出日志便于排查（小程序端需勾选「不校验合法域名」访问 localhost）
    console.warn('[global-home] 首页配置读取失败', e && e.message ? e.message : e);
  }
}

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
