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
import { onShow, onReady } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { getTid } from '../../utils/mallUtil.js';
import { buildGlobalHomeRedirect } from '../../utils/globalHome.js';
import { isManualEntry as isManual, safeRedirect } from '../../utils/loginEntry.js';
import { JUMP_DONE_KEY } from '../../utils/design.js';
import { DEFAULT_TENANT_ID } from '../../config.js';
import { performWxLogin, mustCreateCard } from '../../utils/inlineLogin.js';

// 🔴 冷启动 reLaunch 竞态防护（2026-10-21 真机报修「扫体验码打开是空白，要点左上角
//   回首页才会加载出首页」）：onShow 里 designConfig 请求返回后立刻 reLaunch，可能
//   早于本页首帧渲染完成；WeChat 在该时机处理 reLaunch，目标页（装修首页）会停在
//   空白首帧，必须二次进入（回首页→login→再跳）才恢复。
//   解法：reLaunch 延到本页 onReady（首帧渲染完成）之后；网络慢时登录页先完整
//   渲染出来再跳，用户也不再面对空白。
let resolveFirstRender;
const firstRenderDone = new Promise((r) => { resolveFirstRender = r; });
onReady(() => resolveFirstRender());

// 冷启动首页联动：装修中心「首页」（is_home=1）配置谁就跳谁（商城/全景/名片/自定义页）
// 仅小程序冷启动页检查；游客自动带默认租户读取公开配置；跳转目标页自身不重复检查，无死循环
onShow(() => {
  // #ifndef H5
  checkGlobalHome();
  // #endif
});

async function checkGlobalHome() {
  if (isManualEntry()) {
    console.log('[global-home] 人为进入登录页，跳过冷启动首页跳转');
    return;
  }
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
      // 等本页首帧渲染完成再跳：规避冷启动 reLaunch 竞态（目标页空白首帧）
      await firstRenderDone;
      uni.reLaunch({ url: target });
    }
    else console.log('[global-home] 无首页配置或已在本页，跳过跳转', raw && raw.homePageUrl, cur);
  } catch (e) {
    // 配置读取失败不阻断登录页；输出日志便于排查（小程序端需勾选「不校验合法域名」访问 localhost）
    console.warn('[global-home] 首页配置读取失败', e && e.message ? e.message : e);
  }
}

async function handleWxLogin() {
  // 🔴 登录实现收敛到 utils/inlineLogin.js（与页面内 LoginGate 浮层共用一份）：
  // 取码（H5 模拟码 / MP wx.login + appid）、租户兜底、清品牌色缓存三件事只写一遍，
  // 两边各写一份必然漂移（曾出现「能登录但装修首页空白」）。
  try {
    const result = await performWxLogin();
    afterLogin(result);
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '登录失败', icon: 'none' });
  }
}

async function afterLogin(result) {
  if (mustCreateCard(result)) {
    // 新用户/没名片：必须先建名片，忽略 redirect（否则会跳回一个空壳页）
    uni.reLaunch({ url: '/pages/card/create' });
  } else {
    const redirect = getRedirectTarget();
    uni.reLaunch({ url: redirect || '/pages/cardMain/home' });
  }
}

/** 读取当前页 query 参数 */
function pageOptions() {
  try {
    const pages = getCurrentPages();
    return (pages[pages.length - 1] && pages[pages.length - 1].options) || {};
  } catch (e) {
    return {};
  }
}

/**
 * 是否「人为进入登录页」（如未登录引导点「去登录」、退出平台后跳登录）。
 * 登录页同时是**冷启动首页**，onShow 里 checkGlobalHome 会在检测到装修首页配置时
 * 立刻 reLaunch 走 —— 那样用户刚到登录页就被弹去首页，按钮根本点不到（表现为
 * 「点登录没反应」）。带 manual=1 时让冷启动跳转让路。
 */
function isManualEntry() {
  return isManual(pageOptions());
}

/**
 * 登录后回跳目标（如「我的名片」未登录引导 → 登录后回到名片页，而不是被丢到首页）。
 * 校验逻辑在 utils/loginEntry.js（safeRedirect：只接受站内绝对路径，排除 '//'）。
 */
function getRedirectTarget() {
  return safeRedirect(pageOptions().redirect);
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
  padding-top: 176rpx;
  padding-bottom: 72rpx;
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
  color: var(--white);
  margin-bottom: 16rpx;
}
.subtitle {
  font-size: var(--fs-5);
  color: rgba(255,255,255,0.9);
  margin-bottom: 12rpx;
}
.slogan {
  font-size: var(--fs-3);
  color: rgba(255,255,255,0.7);
  margin-bottom: 80rpx;
}
.wx-login-btn {
  background: var(--white);
  color: var(--primary);
  border-radius: 48rpx;
  height: 96rpx;
  line-height: 96rpx;
  font-size: var(--fs-6);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-bottom: 40rpx;
}
.wx-icon {
  font-size: var(--fs-7);
}
.tips {
  font-size: var(--fs-2);
  color: rgba(255,255,255,0.6);
}
.link {
  color: rgba(255,255,255,0.9);
  text-decoration: underline;
}
</style>
