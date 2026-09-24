<template>
  <view v-if="show" class="bd-wrap" :style="{ background: color }">
    <view v-if="dot" class="bd-dot"></view>
    <text v-else-if="count > 0" class="bd-text">{{ displayCount }}</text>
  </view>
</template>

<script>
export default {
  name: 'Badge',
  props: {
    count: { type: [Number, String], default: 0 },
    max: { type: Number, default: 99 },
    dot: { type: Boolean, default: false },
    color: { type: String, default: '#f53f3f' }
  },
  computed: {
    show() {
      if (this.dot) return true;
      return Number(this.count) > 0;
    },
    displayCount() {
      const n = Number(this.count);
      if (n > this.max) return `${this.max}+`;
      return String(n);
    }
  }
};
</script>

<style scoped>
.bd-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32rpx;
  height: 32rpx;
  padding: 0 8rpx;
  border-radius: 32rpx;
  box-sizing: border-box;
  color: #ffffff;
  font-size: 20rpx;
  line-height: 1;
}
.bd-text {
  color: #ffffff;
  font-size: 20rpx;
  line-height: 1;
}
.bd-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: inherit;
}
</style>
