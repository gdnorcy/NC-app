<template>
  <view class="fab-cart" @click="goCart">
    <SIcon name="cart" size="default" color="#ffffff" />
    <view class="fab-cart-badge" v-if="cartCount > 0">{{ cartCount > 99 ? '99+' : cartCount }}</view>
  </view>
</template>

<script>
import SIcon from './SIcon.vue';
import { mallApi } from '../utils/mallApi.js';
import { getToken } from '../utils/mallUtil.js';

export default {
  name: 'FabCart',
  components: { SIcon },
  props: {
    tid: { type: [String, Number], default: '' },
  },
  data() {
    return { cartCount: 0 };
  },
  onShow() {
    this.fetchCartCount();
  },
  methods: {
    fetchCartCount() {
      if (!getToken()) return;
      mallApi
        .getCart()
        .then((res) => {
          this.cartCount = (res.list || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
        })
        .catch(() => {});
    },
    goCart() {
      uni.navigateTo({ url: `/pages/mall/cart${this.tid ? `?tid=${this.tid}` : ''}` });
    },
  },
};
</script>

<style scoped>
.fab-cart {
  position: fixed;
  right: 28rpx;
  top: 180rpx;
  z-index: 99;
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: rgba(22, 93, 255, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.15);
}
.fab-cart-badge {
  position: absolute;
  top: -6rpx;
  right: -6rpx;
  min-width: 32rpx;
  height: 32rpx;
  line-height: 32rpx;
  border-radius: 16rpx;
  background: #ff3b30;
  color: #fff;
  font-size: 20rpx;
  text-align: center;
  padding: 0 8rpx;
  box-sizing: border-box;
}
</style>
