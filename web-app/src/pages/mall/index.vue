<template>
  <view class="mall-page">
    <view class="empty-icon">
      <SIcon name="show" size="xlarge" color="#C9CDD4" />
    </view>
    <text class="empty-title">商城建设中</text>
    <text class="empty-desc">商城（商品管理 C 端）正在开发中，敬请期待</text>
  </view>
</template>

<script>
import SIcon from '../../components/SIcon.vue';
export default {
  components: { SIcon },
};
</script>

<style scoped>
.mall-page {
  min-height: 100vh;
  background: #f7f8fa;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 48rpx;
  box-sizing: border-box;
}
.empty-icon {
  width: 160rpx;
  height: 160rpx;
  border-radius: 32rpx;
  background: #f2f3f5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32rpx;
}
.empty-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 12rpx;
}
.empty-desc {
  font-size: 26rpx;
  color: #86909c;
  text-align: center;
  line-height: 1.6;
}
</style>
