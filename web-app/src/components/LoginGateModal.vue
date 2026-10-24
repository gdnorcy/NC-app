<template>
  <!--
    🔴 #312-18c 登录浮层统一出口：遮罩 + 居中白卡 + LoginGate + 「暂不登录」。
    dynamic.vue 第 18b 轮首建的内联版收编到这里，之后所有原地登录页面共用这一份
    （样式/滚动穿透/文案单点实现，禁止各页再抄一份 lgmask）。
    用法：
      <LoginGateModal :show="showLoginGate" @close="cancelLogin" @success="onLoginGateSuccess" />
    show/cancelLogin/onLoginGateSuccess 由 utils/loginGate.js 的 useInlineLogin() 提供。
  -->
  <view class="lgm-mask" v-if="show" @click="emit('close')" @touchmove.stop.prevent="noop">
    <view class="lgm-sheet" @click.stop @touchmove.stop="noop">
      <view class="lgm-title">登录后继续</view>
      <LoginGate @success="(r) => emit('success', r)" />
      <view class="lgm-close" @click="emit('close')">暂不登录</view>
    </view>
  </view>
</template>

<script setup>
import LoginGate from './LoginGate.vue';

defineProps({ show: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'success']);
function noop() {}
</script>

<style scoped>
/* 遮罩走 --bg-mask 令牌（不写 rgba 字面量）；层级用 --z-popup（全屏弹窗层），
   不新增裸 z-index。居中白卡、普通块级堆叠——与发布弹窗（底部 sheet）区分：
   登录是一次性阻断，不该像表单那样从底部升起。 */
.lgm-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-mask);
  z-index: var(--z-popup);
  display: flex;
  align-items: center;
  justify-content: center;
}
.lgm-sheet {
  width: 560rpx;
  box-sizing: border-box;
  background: var(--white);
  border-radius: var(--radius-lg);
  padding: 48rpx 32rpx 32rpx;
}
.lgm-title {
  font-size: var(--fs-6);
  font-weight: 600;
  color: var(--t1);
  text-align: center;
}
.lgm-close {
  margin-top: 24rpx;
  text-align: center;
  font-size: var(--fs-3);
  color: var(--t3);
}
</style>
