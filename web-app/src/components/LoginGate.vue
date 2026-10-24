<template>
  <!-- 🔴 #312-18 页面内原地登录：替代「跳登录页→再跳回来」的两次跳转 -->
  <view class="lg-wrap">
    <view class="lg-btn" :class="{ 'is-busy': busy }" @click="start">
      <text class="lg-ico">💬</text>
      <text class="lg-txt">{{ busy ? '登录中…' : '微信一键登录' }}</text>
    </view>
    <view class="lg-tips">
      <text>登录即表示同意</text>
      <text class="lg-link">《用户协议》</text>
      <text>和</text>
      <text class="lg-link">《隐私政策》</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { performWxLogin } from '../utils/inlineLogin.js';

const emit = defineEmits(['success', 'fail']);
const busy = ref(false);
// 🔴 微信 code 一次性：连点会产生第二个 code，后端可能两个都成功、状态反覆。这里做单飞。
let inflight = false;

async function start() {
  if (busy.value || inflight) return;
  inflight = true;
  busy.value = true;
  try {
    const res = await performWxLogin();
    emit('success', res);
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '登录失败', icon: 'none' });
    emit('fail', e);
  } finally {
    busy.value = false;
    inflight = false;
  }
}
</script>

<style scoped>
.lg-wrap {
  margin-top: 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.lg-btn {
  width: 480rpx;
  height: 96rpx;
  border-radius: 48rpx;
  background: var(--primary);
  color: var(--white);
  font-size: var(--fs-6);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}
.lg-btn.is-busy {
  opacity: 0.65;
}
.lg-ico {
  font-size: var(--fs-7);
  margin-right: 12rpx;
}
.lg-txt {
  font-size: var(--fs-6);
}
.lg-tips {
  font-size: var(--fs-2);
  color: var(--t4);
}
.lg-link {
  color: var(--t2);
  text-decoration: underline;
}
</style>
