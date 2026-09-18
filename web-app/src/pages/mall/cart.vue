<template>
  <view class="cart-page">
    <view class="mall-nav">
      <view class="nav-back" @click="goBack"><text>‹</text></view>
      <text class="nav-title">购物车</text>
      <view class="nav-clear" @click="clearAll" v-if="list.length">清空</view>
    </view>

    <scroll-view class="cart-scroll" scroll-y :show-scrollbar="false">
      <view v-if="list.length" class="cart-list">
        <view class="cart-item" v-for="it in list" :key="it.id" :class="{ off: !it.onShelf }">
          <view class="check" :class="{ checked: checkedIds.includes(it.id) }" @click="toggle(it.id)"></view>
          <image :src="resolveUrl(it.thumb)" class="item-img" mode="aspectFill" @click="goDetail(it.goodsId)" />
          <view class="item-info" @click="goDetail(it.goodsId)">
            <text class="item-title">{{ it.title }}</text>
            <text class="item-spec" v-if="it.specJson && it.specJson !== '{}'">{{ skuText(it.specJson) }}</text>
            <view class="item-bottom">
              <view class="item-price">
                <text class="price-symbol">¥</text>
                <text class="price-num">{{ fen2yuan(it.price) }}</text>
              </view>
              <view class="num-stepper" @click.stop>
                <view class="step-btn" @click="changeQty(it, -1)">−</view>
                <text class="step-num">{{ it.quantity }}</text>
                <view class="step-btn" @click="changeQty(it, 1)">＋</view>
              </view>
            </view>
          </view>
          <view class="item-off-tag" v-if="!it.onShelf">已下架</view>
          <view class="item-del" @click.stop="removeItem(it)">✕</view>
        </view>
      </view>
      <view v-else class="empty-box">
        <view class="empty-icon"><SIcon name="show" size="xlarge" color="#c9cdd4" /></view>
        <text class="empty-text">购物车还是空的</text>
        <view class="empty-btn" @click="goHome">去逛逛</view>
      </view>
    </scroll-view>

    <view class="settle-bar" v-if="list.length">
      <view class="check-all" @click="toggleAll">
        <view class="check" :class="{ checked: allChecked }"></view>
        <text>全选</text>
      </view>
      <view class="total">
        <text class="total-label">合计：</text>
        <text class="price-symbol">¥</text>
        <text class="total-num">{{ fen2yuan(totalAmount) }}</text>
      </view>
      <view class="settle-btn" :class="{ disabled: !selectedCount }" @click="goCheckout">结算({{ selectedCount }})</view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { mallApi } from '../../utils/mallApi.js';
import { fen2yuan, getTid, getToken } from '../../utils/mallUtil.js';
import { resolveAssetUrl } from '../../utils/design.js';
import SIcon from '../../components/SIcon.vue';

const tid = ref('');
const list = ref([]);
const checkedIds = ref([]);

const allChecked = computed(() => list.value.length > 0 && checkedIds.value.length === list.value.length);
const selectedItems = computed(() => list.value.filter((it) => checkedIds.value.includes(it.id)));
const selectedCount = computed(() => selectedItems.value.length);
const totalAmount = computed(() => selectedItems.value.reduce((sum, it) => sum + (Number(it.price) || 0) * it.quantity, 0));

const resolveUrl = (u) => resolveAssetUrl(u, tid.value);

function skuText(specJson) {
  try {
    const o = JSON.parse(specJson || '{}');
    return Object.values(o).join(' / ');
  } catch { return ''; }
}

function ensureLogin() {
  if (getToken()) return true;
  uni.showToast({ title: '请先登录', icon: 'none' });
  uni.reLaunch({ url: '/pages/card/login' });
  return false;
}

function fetchCart() {
  if (!ensureLogin()) return;
  mallApi.getCart()
    .then((res) => {
      const rows = res.list || [];
      // 默认全选（在售项），下架项默认不选
      const valid = rows.filter((r) => r.onShelf);
      checkedIds.value = valid.map((r) => r.id);
      list.value = rows;
    })
    .catch((e) => {
      if (e && !String(e).includes('请先登录')) {
        uni.showToast({ title: e || '加载失败', icon: 'none' });
      }
    });
}

function toggle(id) {
  if (checkedIds.value.includes(id)) checkedIds.value = checkedIds.value.filter((x) => x !== id);
  else checkedIds.value = [...checkedIds.value, id];
}

function toggleAll() {
  if (allChecked.value) checkedIds.value = [];
  else checkedIds.value = list.value.filter((r) => r.onShelf).map((r) => r.id);
}

function changeQty(it, delta) {
  const next = it.quantity + delta;
  if (next < 1) return;
  if (Number(it.stock) !== null && Number(it.stock) !== undefined && next > Number(it.stock)) {
    uni.showToast({ title: '库存不足', icon: 'none' });
    return;
  }
  mallApi.updateCart(it.id, { quantity: next })
    .then(() => { it.quantity = next; })
    .catch((e) => uni.showToast({ title: e || '修改失败', icon: 'none' }));
}

function removeItem(it) {
  uni.showModal({
    title: '提示',
    content: '确定删除该商品吗？',
    success: (r) => {
      if (!r.confirm) return;
      mallApi.removeCart(it.id)
        .then(() => {
          list.value = list.value.filter((x) => x.id !== it.id);
          checkedIds.value = checkedIds.value.filter((x) => x !== it.id);
        })
        .catch((e) => uni.showToast({ title: e || '删除失败', icon: 'none' }));
    },
  });
}

function clearAll() {
  uni.showModal({
    title: '提示',
    content: '确定清空购物车吗？',
    success: (r) => {
      if (!r.confirm) return;
      mallApi.clearCart()
        .then(() => { list.value = []; checkedIds.value = []; })
        .catch((e) => uni.showToast({ title: e || '清空失败', icon: 'none' }));
    },
  });
}

function goCheckout() {
  if (!selectedCount.value) {
    uni.showToast({ title: '请选择商品', icon: 'none' });
    return;
  }
  const ids = selectedItems.value.map((it) => it.id).join(',');
  uni.navigateTo({ url: `/pages/mall/checkout?cartIds=${ids}${tid.value ? `&tid=${tid.value}` : ''}` });
}

function goDetail(id) {
  uni.navigateTo({ url: `/pages/mall/detail?id=${id}${tid.value ? `&tid=${tid.value}` : ''}` });
}

function goHome() {
  uni.reLaunch({ url: `/pages/mall/index${tid.value ? `?tid=${tid.value}` : ''}` });
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: '/pages/cardMain/home' });
}

onLoad((o) => {
  tid.value = getTid(o);
});

onShow(() => {
  fetchCart();
});
</script>

<style scoped>
.cart-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f7f8fa;
  overflow: hidden;
  box-sizing: border-box;
}
.mall-nav {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 24rpx;
  background: #ffffff;
  border-bottom: 1rpx solid #f2f3f5;
  box-sizing: border-box;
}
.nav-back { width: 60rpx; font-size: 44rpx; color: #1d2129; line-height: 1; }
.nav-title { flex: 1; text-align: center; font-size: 32rpx; font-weight: 600; color: #1d2129; }
.nav-clear { font-size: 26rpx; color: #4e5969; padding: 8rpx; }
.cart-scroll { flex: 1; height: 0; }
.cart-list { padding: 16rpx; }
.cart-item {
  position: relative;
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
}
.cart-item.off { opacity: 0.6; }
.check {
  width: 36rpx; height: 36rpx; border-radius: 50%;
  border: 2rpx solid #c9cdd4; box-sizing: border-box;
  margin-right: 16rpx; flex-shrink: 0;
  position: relative;
}
.check.checked {
  background: #165dff; border-color: #165dff;
}
.check.checked::after {
  content: '';
  position: absolute; left: 11rpx; top: 5rpx;
  width: 10rpx; height: 18rpx;
  border-right: 3rpx solid #fff; border-bottom: 3rpx solid #fff;
  transform: rotate(45deg);
}
.item-img { width: 160rpx; height: 160rpx; border-radius: 12rpx; background: #f2f3f5; flex-shrink: 0; }
.item-info { flex: 1; margin-left: 16rpx; min-width: 0; }
.item-title {
  font-size: 28rpx; color: #1d2129; display: block;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.item-spec {
  display: inline-block; margin-top: 8rpx; padding: 4rpx 12rpx;
  background: #f2f3f5; border-radius: 8rpx; font-size: 22rpx; color: #86909c;
}
.item-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 12rpx; }
.item-price { display: flex; align-items: baseline; }
.price-symbol { font-size: 22rpx; color: #f53f3f; }
.price-num { font-size: 32rpx; font-weight: 600; color: #f53f3f; }
.num-stepper { display: flex; align-items: center; }
.step-btn {
  width: 48rpx; height: 48rpx; border-radius: 8rpx; background: #f2f3f5;
  color: #1d2129; font-size: 28rpx; display: flex; align-items: center; justify-content: center;
}
.step-num { min-width: 60rpx; text-align: center; font-size: 26rpx; }
.item-off-tag {
  position: absolute; right: 16rpx; top: 16rpx;
  background: rgba(0,0,0,0.5); color: #fff; font-size: 20rpx;
  padding: 4rpx 12rpx; border-radius: 8rpx;
}
.item-del {
  position: absolute; right: 10rpx; top: 10rpx;
  width: 44rpx; height: 44rpx; display: flex; align-items: center; justify-content: center;
  color: #c9cdd4; font-size: 26rpx; z-index: 2;
}
.empty-box {
  padding: 180rpx 0;
  display: flex; flex-direction: column; align-items: center;
}
.empty-icon {
  width: 140rpx; height: 140rpx; border-radius: 28rpx; background: #f2f3f5;
  display: flex; align-items: center; justify-content: center; margin-bottom: 24rpx;
}
.empty-text { font-size: 26rpx; color: #86909c; margin-bottom: 32rpx; }
.empty-btn {
  padding: 16rpx 56rpx; border-radius: 40rpx; background: #165dff;
  color: #fff; font-size: 28rpx;
}
.settle-bar {
  display: flex; align-items: center;
  background: #fff; padding: 16rpx 24rpx;
  border-top: 1rpx solid #f2f3f5;
}
.check-all { display: flex; align-items: center; font-size: 26rpx; color: #4e5969; }
.total { margin-left: auto; display: flex; align-items: baseline; margin-right: 24rpx; }
.total-label { font-size: 24rpx; color: #4e5969; }
.total-num { font-size: 36rpx; font-weight: 600; color: #f53f3f; }
.settle-btn {
  padding: 0 48rpx; height: 76rpx; line-height: 76rpx;
  background: #165dff; color: #fff; border-radius: 38rpx; font-size: 28rpx; font-weight: 500;
}
.settle-btn.disabled { opacity: 0.5; }
</style>
