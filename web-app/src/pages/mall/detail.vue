<template>
  <view class="detail-page">
    <view class="mall-nav">
      <view class="nav-back" @click="goBack"><text>‹</text></view>
      <text class="nav-title">商品详情</text>
      <view class="nav-cart" @click="goCart">
        <text class="cart-ico">🛒</text>
        <view class="cart-badge" v-if="cartCount > 0">{{ cartCount > 99 ? '99+' : cartCount }}</view>
      </view>
    </view>

    <scroll-view class="detail-scroll" scroll-y :show-scrollbar="false">
      <!-- 商品图 -->
      <view class="banner" v-if="goods">
        <swiper v-if="images.length" class="swiper" circular :indicator-dots="images.length > 1" indicator-active-color="#165dff">
          <swiper-item v-for="(img, i) in images" :key="i">
            <image :src="resolveUrl(img)" class="swiper-img" mode="aspectFill" />
          </swiper-item>
        </swiper>
        <view v-else class="banner-empty"><SIcon name="show" size="xlarge" color="#c9cdd4" /></view>
        <view class="soldout-tag" v-if="goods.soldout">已售罄</view>
      </view>

      <!-- 价格/标题 -->
      <view class="info-card" v-if="goods">
        <view class="price-row">
          <text class="price-symbol">¥</text>
          <text class="price-num">{{ yuanFmt(curPrice) }}</text>
          <text class="price-market" v-if="goods.marketPrice && Number(goods.marketPrice) > Number(goods.price)">¥{{ yuanFmt(goods.marketPrice) }}</text>
          <text class="sales">已售{{ goods.sales || 0 }}</text>
        </view>
        <view class="title-row">
          <text class="goods-title">{{ goods.title }}</text>
          <view class="type-tag" v-if="goods.type === 'virtual'">虚拟商品</view>
        </view>
        <view class="delivery-row" v-if="deliveryTexts.length">
          <text class="delivery-label">配送</text>
          <text class="delivery-tag" v-for="d in deliveryTexts" :key="d">{{ d }}</text>
        </view>
      </view>

      <!-- 图文详情 -->
      <view class="detail-section" v-if="goods">
        <view class="section-title">商品详情</view>
        <view class="info-text">
          <text v-if="goods.info">{{ goods.info }}</text>
          <text v-else class="no-info">暂无详情</text>
        </view>
      </view>
      <view class="bottom-space"></view>
    </scroll-view>

    <!-- 底部操作栏 -->
    <view class="action-bar" v-if="goods">
      <view class="action-cart" @click="openSku('cart')">
        <text class="action-ico">🛒</text>
        <text>购物车</text>
      </view>
      <view class="action-btn add" @click="openSku('cart')" :class="{ disabled: goods.soldout }">加入购物车</view>
      <view class="action-btn buy" @click="openSku('buy')" :class="{ disabled: goods.soldout }">立即购买</view>
    </view>

    <!-- SKU/数量选择弹层 -->
    <view class="mask" v-if="skuVisible" @click="skuVisible = false">
      <view class="sku-panel" @click.stop>
        <view class="sku-head">
          <image v-if="goods" :src="resolveUrl(goods.thumb)" class="sku-thumb" mode="aspectFill" />
          <view class="sku-price">
            <text class="price-symbol">¥</text>
            <text class="price-num">{{ yuanFmt(curPrice) }}</text>
          </view>
          <view class="sku-close" @click="skuVisible = false">✕</view>
        </view>
        <scroll-view scroll-y class="sku-body">
          <view class="sku-group" v-if="goods && goods.specMode === 'multi' && goods.skus.length">
            <text class="sku-group-title">规格</text>
            <view class="sku-options">
              <view
                v-for="s in goods.skus"
                :key="s.id"
                class="sku-option"
                :class="{ active: selectedSku && selectedSku.id === s.id, disabled: Number(s.stock) <= 0 }"
                @click="selectSku(s)"
              >{{ skuText(s.spec_json) }}</view>
            </view>
          </view>
          <view class="sku-group">
            <text class="sku-group-title">数量</text>
            <view class="num-stepper">
              <view class="step-btn" @click="changeQty(-1)">−</view>
              <text class="step-num">{{ qty }}</text>
              <view class="step-btn" @click="changeQty(1)">＋</view>
            </view>
          </view>
          <view class="sku-stock">库存：{{ curStock }}</view>
        </scroll-view>
        <view class="sku-footer">
          <view class="action-btn add" @click="confirmSku">{{ skuAction === 'buy' ? '立即购买' : '加入购物车' }}</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { mallApi } from '../../utils/mallApi.js';
import { yuanFmt, getTid, getToken } from '../../utils/mallUtil.js';
import { resolveAssetUrl } from '../../utils/design.js';
import SIcon from '../../components/SIcon.vue';

const tid = ref('');
const id = ref(0);
const goods = ref(null);
const images = computed(() => {
  const list = goods.value?.images;
  if (Array.isArray(list) && list.length) return list;
  return goods.value?.thumb ? [goods.value.thumb] : [];
});
const selectedSku = ref(null);
const qty = ref(1);
const skuVisible = ref(false);
const skuAction = ref('cart');
const cartCount = ref(0);

const deliveryTexts = computed(() => {
  const d = goods.value?.delivery || {};
  const list = [];
  if (d.express) list.push('快递配送');
  if (d.citySend) list.push('同城配送');
  if (d.takeSelf) list.push('到店自提');
  return list;
});

const curPrice = computed(() => {
  if (goods.value?.specMode === 'multi' && selectedSku.value) return selectedSku.value.price;
  return goods.value?.price || 0;
});

const curStock = computed(() => {
  if (goods.value?.specMode === 'multi' && selectedSku.value) return selectedSku.value.stock;
  return goods.value?.stock || 0;
});

const resolveUrl = (u) => resolveAssetUrl(u, tid.value);

function skuText(specJson) {
  try {
    const o = JSON.parse(specJson || '{}');
    return Object.values(o).join(' / ') || '默认';
  } catch { return '默认'; }
}

function selectSku(s) {
  if (Number(s.stock) <= 0) return;
  selectedSku.value = s;
}

function changeQty(delta) {
  const max = Math.max(1, Number(curStock.value));
  qty.value = Math.min(max, Math.max(1, qty.value + delta));
}

function openSku(action) {
  if (goods.value?.soldout) {
    uni.showToast({ title: '商品已售罄', icon: 'none' });
    return;
  }
  skuAction.value = action;
  qty.value = 1;
  skuVisible.value = true;
}

function ensureLogin() {
  if (getToken()) return true;
  uni.showToast({ title: '请先登录', icon: 'none' });
  uni.reLaunch({ url: '/pages/card/login' });
  return false;
}

function confirmSku() {
  if (!ensureLogin()) return;
  if (goods.value?.specMode === 'multi' && !selectedSku.value) {
    uni.showToast({ title: '请选择规格', icon: 'none' });
    return;
  }
  const payload = { goodsId: goods.value.id, skuId: selectedSku.value?.id || 0, quantity: qty.value };
  const finish = () => {
    if (skuAction.value === 'buy') {
      // 立即购买：直接进入确认订单（带商品参数）
      uni.navigateTo({
        url: `/pages/mall/checkout?goodsId=${payload.goodsId}&skuId=${payload.skuId}&qty=${payload.quantity}${tid.value ? `&tid=${tid.value}` : ''}`,
      });
    } else {
      uni.showToast({ title: '已加入购物车', icon: 'success' });
    }
  };
  if (skuAction.value === 'cart') {
    mallApi.addCart(payload)
      .then(() => { skuVisible.value = false; finish(); fetchCartCount(); })
      .catch((e) => uni.showToast({ title: e || '加入失败', icon: 'none' }));
  } else {
    finish();
  }
}

function fetchCartCount() {
  if (!getToken()) return;
  mallApi.getCart()
    .then((res) => {
      cartCount.value = (res.list || []).reduce((sum, it) => sum + it.quantity, 0);
    })
    .catch(() => {});
}

function goCart() {
  uni.navigateTo({ url: `/pages/mall/cart${tid.value ? `?tid=${tid.value}` : ''}` });
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: '/pages/cardMain/home' });
}

onLoad((o) => {
  tid.value = getTid(o);
  id.value = Number(o?.id || 0);
  mallApi.getGoodsDetail(id.value)
    .then((res) => {
      goods.value = res;
      if (res.specMode === 'multi' && res.skus && res.skus.length) {
        selectedSku.value = res.skus[0];
      }
    })
    .catch((e) => {
      uni.showToast({ title: e || '商品不存在或已下架', icon: 'none' });
      setTimeout(goBack, 800);
    });
});
</script>

<style scoped>
.detail-page {
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
.nav-cart { width: 60rpx; position: relative; display: flex; align-items: center; justify-content: flex-end; }
.cart-ico { font-size: 36rpx; }
.cart-badge {
  position: absolute; top: -8rpx; right: -12rpx; min-width: 30rpx; height: 30rpx;
  padding: 0 6rpx; border-radius: 15rpx; background: #f53f3f; color: #fff;
  font-size: 20rpx; line-height: 30rpx; text-align: center; box-sizing: border-box;
}
.detail-scroll { flex: 1; height: 0; }
.banner { position: relative; width: 100%; height: 750rpx; background: #f2f3f5; }
.swiper, .swiper-img { width: 100%; height: 100%; }
.banner-empty {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
}
.soldout-tag {
  position: absolute; top: 24rpx; right: 24rpx; padding: 8rpx 20rpx;
  background: rgba(0,0,0,0.5); color: #fff; font-size: 24rpx; border-radius: 24rpx;
}
.info-card { background: #fff; padding: 24rpx; margin-top: 16rpx; }
.price-row { display: flex; align-items: baseline; }
.price-symbol { font-size: 28rpx; color: #f53f3f; }
.price-num { font-size: 48rpx; font-weight: 600; color: #f53f3f; }
.price-market { font-size: 26rpx; color: #86909c; text-decoration: line-through; margin-left: 12rpx; }
.sales { margin-left: auto; font-size: 24rpx; color: #86909c; }
.title-row { display: flex; align-items: center; margin-top: 12rpx; }
.goods-title { flex: 1; font-size: 32rpx; font-weight: 500; color: #1d2129; line-height: 1.4; }
.type-tag { padding: 4rpx 14rpx; border-radius: 8rpx; background: #e8f3ff; color: #165dff; font-size: 22rpx; }
.delivery-row { display: flex; align-items: center; margin-top: 16rpx; }
.delivery-label { font-size: 24rpx; color: #86909c; margin-right: 12rpx; }
.delivery-tag { margin-right: 10rpx; padding: 4rpx 14rpx; border-radius: 8rpx; background: #f2f3f5; color: #4e5969; font-size: 22rpx; }
.detail-section { background: #fff; padding: 24rpx; margin-top: 16rpx; }
.section-title { font-size: 30rpx; font-weight: 600; color: #1d2129; margin-bottom: 16rpx; }
.info-text { font-size: 28rpx; color: #4e5969; line-height: 1.7; white-space: pre-wrap; }
.no-info { color: #c9cdd4; }
.bottom-space { height: 140rpx; }
.action-bar {
  display: flex; align-items: center; padding: 16rpx 24rpx;
  background: #fff; border-top: 1rpx solid #f2f3f5;
}
.action-cart { display: flex; flex-direction: column; align-items: center; margin-right: 24rpx; font-size: 20rpx; color: #4e5969; }
.action-ico { font-size: 40rpx; }
.action-btn {
  flex: 1; height: 80rpx; line-height: 80rpx; text-align: center;
  border-radius: 40rpx; font-size: 28rpx; font-weight: 500;
}
.action-btn.add { background: #ffb400; color: #fff; margin-right: 16rpx; }
.action-btn.buy { background: #165dff; color: #fff; }
.action-btn.disabled { opacity: 0.5; }
.mask {
  position: fixed; left: 0; top: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5); z-index: 99; display: flex; align-items: flex-end;
}
.sku-panel {
  width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0;
  padding: 24rpx; box-sizing: border-box; max-height: 70vh; display: flex; flex-direction: column;
}
.sku-head { display: flex; align-items: center; }
.sku-thumb { width: 120rpx; height: 120rpx; border-radius: 12rpx; background: #f2f3f5; }
.sku-price { display: flex; align-items: baseline; margin-left: 20rpx; flex: 1; }
.sku-close { font-size: 32rpx; color: #86909c; padding: 8rpx; }
.sku-body { flex: 1; margin-top: 20rpx; }
.sku-group { margin-bottom: 24rpx; }
.sku-group-title { font-size: 26rpx; color: #1d2129; display: block; margin-bottom: 12rpx; }
.sku-options { display: flex; flex-wrap: wrap; }
.sku-option {
  padding: 12rpx 28rpx; margin: 0 12rpx 12rpx 0; border-radius: 10rpx;
  background: #f2f3f5; color: #4e5969; font-size: 26rpx;
}
.sku-option.active { background: #e8f3ff; color: #165dff; border: 1rpx solid #165dff; }
.sku-option.disabled { opacity: 0.4; }
.num-stepper { display: flex; align-items: center; }
.step-btn {
  width: 56rpx; height: 56rpx; border-radius: 8rpx; background: #f2f3f5;
  color: #1d2129; font-size: 32rpx; display: flex; align-items: center; justify-content: center;
}
.step-num { min-width: 80rpx; text-align: center; font-size: 28rpx; }
.sku-stock { font-size: 24rpx; color: #86909c; }
.sku-footer { padding-top: 16rpx; }
</style>
