<template>
  <view v-if="loading" class="sk-wrap">
    <view v-if="avatar" class="sk-avatar"></view>
    <view class="sk-body">
      <view v-if="title" class="sk-title"></view>
      <view v-for="i in rows" :key="i" class="sk-line" :style="{ width: widths[(i - 1) % widths.length] }"></view>
    </view>
  </view>
  <slot v-else></slot>
</template>

<script>
export default {
  name: 'Skeleton',
  props: {
    loading: { type: Boolean, default: true },
    rows: { type: Number, default: 3 },
    avatar: { type: Boolean, default: false },
    title: { type: Boolean, default: false }
  },
  data() {
    return {
      widths: ['100%', '88%', '72%', '94%', '60%']
    };
  }
};
</script>

<style scoped>
.sk-wrap {
  display: flex;
  padding: 24rpx;
  background: #ffffff;
  border-radius: 16rpx;
}
.sk-avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 16rpx;
  flex-shrink: 0;
  background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-card) 37%, var(--bg-hover) 63%);
  background-size: 400% 100%;
  animation: sk-shine 1.4s ease infinite;
}
.sk-body {
  flex: 1;
  margin-left: 24rpx;
  padding-top: 4rpx;
}
.sk-title {
  height: 32rpx;
  width: 40%;
  margin-bottom: 20rpx;
  border-radius: 8rpx;
  background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-card) 37%, var(--bg-hover) 63%);
  background-size: 400% 100%;
  animation: sk-shine 1.4s ease infinite;
}
.sk-line {
  height: 28rpx;
  margin-top: 16rpx;
  border-radius: 8rpx;
  background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-card) 37%, var(--bg-hover) 63%);
  background-size: 400% 100%;
  animation: sk-shine 1.4s ease infinite;
}
@keyframes sk-shine {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}
</style>
