<template>
  <view class="checkout-page">
    <view class="mall-nav">
      <view class="nav-back" @click="goBack"><text>‹</text></view>
      <text class="nav-title">确认订单</text>
      <view class="nav-side"></view>
    </view>

    <scroll-view class="checkout-scroll" scroll-y :show-scrollbar="false">
      <!-- 配送方式 -->
      <view class="card">
        <view class="card-title">配送方式</view>
        <view class="delivery-options">
          <view
            class="delivery-option"
            :class="{ active: deliveryMode === 'express' }"
            @click="switchDelivery('express')"
            v-if="delivery.express"
          >快递配送</view>
          <view
            v-if="delivery.takeSelf"
            class="delivery-option"
            :class="{ active: deliveryMode === 'pickup' }"
            @click="switchDelivery('pickup')"
          >到店自提</view>
        </view>

        <!-- 快递：收货信息 -->
        <view v-if="deliveryMode === 'express'" class="form-box">
          <view class="form-row">
            <text class="form-label">收货人</text>
            <input class="form-input" v-model="receiverName" placeholder="请输入收货人姓名" placeholder-class="ph" />
          </view>
          <view class="form-row">
            <text class="form-label">手机号</text>
            <input class="form-input" v-model="receiverPhone" type="number" maxlength="11" placeholder="请输入手机号" placeholder-class="ph" />
          </view>
          <view class="form-row">
            <text class="form-label">收货地址</text>
            <input class="form-input" v-model="receiverAddress" placeholder="请输入详细收货地址" placeholder-class="ph" />
          </view>
        </view>

        <!-- 自提：门店选择 -->
        <view v-else class="form-box">
          <view class="form-row" @click="showStorePicker = true">
            <text class="form-label">自提门店</text>
            <view class="store-value" :class="{ placeholder: !selectedStore }">
              {{ selectedStore ? selectedStore.name : '请选择自提门店' }}
            </view>
            <text class="form-arrow">›</text>
          </view>
          <view class="form-tip" v-if="selectedStore">门店地址：{{ storeAddress(selectedStore) }}</view>
        </view>
      </view>

      <!-- 商品清单 -->
      <view class="card">
        <view class="card-title">商品清单</view>
        <view class="goods-item" v-for="it in items" :key="it.key">
          <image :src="resolveUrl(it.thumb)" class="item-img" mode="aspectFill" />
          <view class="item-info">
            <text class="item-title">{{ it.title }}</text>
            <text class="item-spec" v-if="it.specText">{{ it.specText }}</text>
          </view>
          <view class="item-right">
            <view class="item-price">
              <text class="price-symbol">¥</text>
              <text class="price-num">{{ fen2yuan(it.price) }}</text>
            </view>
            <text class="item-qty">x{{ it.qty }}</text>
          </view>
        </view>
      </view>

      <view class="card">
        <view class="card-title">备注</view>
        <input class="remark-input" v-model="remark" placeholder="选填，给商家留言" placeholder-class="ph" />
      </view>
      <view class="bottom-space"></view>
    </scroll-view>

    <!-- 底部提交 -->
    <view class="submit-bar">
      <view class="total">
        <text class="total-label">合计：</text>
        <text class="price-symbol">¥</text>
        <text class="total-num">{{ fen2yuan(totalAmount) }}</text>
      </view>
      <view class="submit-btn" :class="{ loading: submitting }" @click="submitOrder">{{ submitting ? '提交中…' : '提交订单' }}</view>
    </view>

    <!-- 门店选择弹层 -->
    <view class="mask" v-if="showStorePicker" @click="showStorePicker = false">
      <view class="store-panel" @click.stop>
        <view class="panel-title">选择自提门店</view>
        <scroll-view scroll-y class="store-list">
          <view v-if="stores.length === 0" class="store-empty">暂无可用门店</view>
          <view
            v-for="s in stores"
            :key="s.id"
            class="store-item"
            :class="{ active: selectedStore && selectedStore.id === s.id }"
            @click="selectStore(s)"
          >
            <view class="store-name">{{ s.name }}</view>
            <view class="store-addr">{{ storeAddress(s) }}</view>
          </view>
        </scroll-view>
        <view class="panel-close" @click="showStorePicker = false">关闭</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { mallApi } from '../../utils/mallApi.js';
import { fen2yuan, getTid, getToken } from '../../utils/mallUtil.js';
import { resolveAssetUrl } from '../../utils/design.js';
import { paymentApi } from '../../utils/cardApi.js';

const tid = ref('');
const deliveryMode = ref('express');
const delivery = ref({ express: true, citySend: false, takeSelf: false });
const receiverName = ref('');
const receiverPhone = ref('');
const receiverAddress = ref('');
const remark = ref('');
const items = ref([]);
const cartIds = ref('');
const directGoods = ref(null); // 立即购买：{goodsId, skuId, qty}
const stores = ref([]);
const selectedStore = ref(null);
const showStorePicker = ref(false);
const submitting = ref(false);

const totalAmount = computed(() => items.value.reduce((sum, it) => sum + (Number(it.price) || 0) * it.qty, 0));

const resolveUrl = (u) => resolveAssetUrl(u, tid.value);

function skuText(specJson) {
  try {
    const o = JSON.parse(specJson || '{}');
    return Object.values(o).join(' / ');
  } catch { return ''; }
}

function storeAddress(s) {
  return [s.province, s.city, s.district, s.address].filter(Boolean).join('') || '暂无地址';
}

function ensureLogin() {
  if (getToken()) return true;
  uni.showToast({ title: '请先登录', icon: 'none' });
  uni.reLaunch({ url: '/pages/card/login' });
  return false;
}

function loadFromCart() {
  if (!cartIds.value) return Promise.resolve();
  return mallApi.getCart().then((res) => {
    const rows = res.list || [];
    const idSet = cartIds.value.split(',').map(Number);
    items.value = rows
      .filter((r) => idSet.includes(r.id) && r.onShelf)
      .map((r) => ({
        key: 'c' + r.id,
        cartId: r.id,
        goodsId: r.goodsId,
        skuId: r.skuId,
        qty: r.quantity,
        title: r.title,
        thumb: r.thumb,
        specText: skuText(r.specJson),
        price: r.price,
      }));
    if (items.value.length === 0) {
      uni.showToast({ title: '购物车商品不可用', icon: 'none' });
      setTimeout(goBack, 800);
      return Promise.resolve();
    }
    // 配送方式取第一个商品的配送设置（一期多商品统一配送）
    return mallApi.getGoodsDetail(items.value[0].goodsId).then((g) => {
      delivery.value = g.delivery || { express: true, citySend: false, takeSelf: false };
      if (!delivery.value.express && delivery.value.takeSelf) deliveryMode.value = 'pickup';
    });
  });
}

function loadDirect() {
  const d = directGoods.value;
  if (!d) return Promise.resolve();
  return mallApi.getGoodsDetail(d.goodsId).then((g) => {
    let price = Math.round(g.price * 100); // 详情价格=元 → 统一转分
    let specText = '';
    if (g.specMode === 'multi' && d.skuId) {
      const sku = (g.skus || []).find((s) => s.id === Number(d.skuId));
      if (sku) { price = Math.round(sku.price * 100); specText = skuText(sku.spec_json); }
    }
    delivery.value = g.delivery || { express: true, citySend: false, takeSelf: false };
    if (!delivery.value.express && delivery.value.takeSelf) deliveryMode.value = 'pickup';
    items.value = [{
      key: 'd' + d.goodsId + '_' + d.skuId,
      goodsId: d.goodsId,
      skuId: Number(d.skuId || 0),
      qty: d.qty,
      title: g.title,
      thumb: g.thumb,
      specText,
      price,
    }];
  });
}

function switchDelivery(mode) {
  deliveryMode.value = mode;
}

function selectStore(s) {
  selectedStore.value = s;
  showStorePicker.value = false;
}

function submitOrder() {
  if (!ensureLogin()) return;
  if (submitting.value) return;
  if (!items.value.length) { uni.showToast({ title: '请选择商品', icon: 'none' }); return; }

  const payload = {
    items: items.value.map((it) => ({ goodsId: it.goodsId, skuId: it.skuId, quantity: it.qty })),
    deliveryMode: deliveryMode.value,
    remark: remark.value,
  };

  if (deliveryMode.value === 'express') {
    if (!receiverName.value || !receiverPhone.value || !receiverAddress.value) {
      uni.showToast({ title: '请填写完整收货信息', icon: 'none' });
      return;
    }
    if (!/^1\d{10}$/.test(receiverPhone.value)) {
      uni.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    payload.receiverName = receiverName.value;
    payload.receiverPhone = receiverPhone.value;
    payload.receiverAddress = receiverAddress.value;
  } else {
    if (!selectedStore.value) {
      uni.showToast({ title: '请选择自提门店', icon: 'none' });
      return;
    }
    payload.storeId = selectedStore.value.id;
  }

  submitting.value = true;
  mallApi.createOrder(payload)
    .then((order) => {
      // 一期 mock 支付：创建支付单后直接模拟支付成功（正式微信支付另行排期）
      return paymentApi.mockPay(order.payOrderNo).then(() => order);
    })
    .then((order) => {
      submitting.value = false;
      // 购物车下单成功后清除对应购物车项（直接购买路径 cartIds 为空，跳过）
      if (cartIds.value) {
        cartIds.value.split(',').filter(Boolean).forEach((id) => mallApi.removeCart(id).catch(() => {}));
      }
      uni.showToast({ title: '支付成功', icon: 'success' });
      setTimeout(() => {
        uni.redirectTo({ url: `/pages/mall/order-detail?id=${order.id}${tid.value ? `&tid=${tid.value}` : ''}` });
      }, 600);
    })
    .catch((e) => {
      submitting.value = false;
      uni.showToast({ title: e || '下单失败', icon: 'none' });
    });
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: '/pages/cardMain/home' });
}

onLoad((o) => {
  tid.value = getTid(o);
  cartIds.value = o?.cartIds || '';
  if (o?.goodsId) {
    directGoods.value = { goodsId: Number(o.goodsId), skuId: Number(o.skuId || 0), qty: Number(o.qty || 1) };
  }
  Promise.all([
    cartIds.value ? loadFromCart() : loadDirect(),
    mallApi.getStores({ tid: tid.value })
      .then((res) => { stores.value = res.list || []; })
      .catch((e) => { stores.value = []; console.warn('门店加载失败', e); }),
  ]).catch((e) => {
    uni.showToast({ title: e || '加载失败', icon: 'none' });
  });
});
</script>

<style scoped>
.checkout-page {
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
.nav-side { width: 60rpx; }
.checkout-scroll { flex: 1; height: 0; }
.card {
  background: #fff; border-radius: 16rpx; margin: 16rpx; padding: 24rpx;
}
.card-title { font-size: 30rpx; font-weight: 600; color: #1d2129; margin-bottom: 20rpx; }
.delivery-options { display: flex; }
.delivery-option {
  padding: 14rpx 36rpx; border-radius: 30rpx; background: #f2f3f5;
  color: #4e5969; font-size: 26rpx; margin-right: 16rpx;
}
.delivery-option.active { background: #e8f3ff; color: #165dff; font-weight: 500; }
.form-box { margin-top: 20rpx; }
.form-row {
  display: flex; align-items: center;
  padding: 20rpx 0; border-bottom: 1rpx solid #f2f3f5;
}
.form-row:last-child { border-bottom: none; }
.form-label { width: 140rpx; font-size: 28rpx; color: #1d2129; }
.form-input { flex: 1; font-size: 28rpx; color: #1d2129; }
.ph { color: #c9cdd4; }
.store-value { flex: 1; font-size: 28rpx; color: #1d2129; }
.store-value.placeholder { color: #c9cdd4; }
.form-arrow { color: #c9cdd4; font-size: 32rpx; }
.form-tip { font-size: 24rpx; color: #86909c; margin-top: 12rpx; }
.goods-item { display: flex; align-items: center; padding: 16rpx 0; }
.goods-item:first-of-type { padding-top: 0; }
.item-img { width: 120rpx; height: 120rpx; border-radius: 12rpx; background: #f2f3f5; flex-shrink: 0; }
.item-info { flex: 1; margin-left: 16rpx; min-width: 0; }
.item-title {
  font-size: 28rpx; color: #1d2129; display: block;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.item-spec {
  display: inline-block; margin-top: 8rpx; padding: 4rpx 12rpx;
  background: #f2f3f5; border-radius: 8rpx; font-size: 22rpx; color: #86909c;
}
.item-right { text-align: right; }
.item-price { display: flex; align-items: baseline; justify-content: flex-end; }
.price-symbol { font-size: 22rpx; color: #f53f3f; }
.price-num { font-size: 30rpx; font-weight: 600; color: #f53f3f; }
.item-qty { font-size: 24rpx; color: #86909c; }
.remark-input { font-size: 28rpx; color: #1d2129; padding: 8rpx 0; }
.bottom-space { height: 140rpx; }
.submit-bar {
  display: flex; align-items: center;
  background: #fff; padding: 16rpx 24rpx;
  border-top: 1rpx solid #f2f3f5;
}
.total { margin-right: 24rpx; display: flex; align-items: baseline; }
.total-label { font-size: 26rpx; color: #4e5969; }
.total-num { font-size: 40rpx; font-weight: 600; color: #f53f3f; }
.submit-btn {
  flex: 1; height: 80rpx; line-height: 80rpx; text-align: center;
  background: #165dff; color: #fff; border-radius: 40rpx;
  font-size: 30rpx; font-weight: 500;
}
.submit-btn.loading { opacity: 0.6; }
.mask {
  position: fixed; left: 0; top: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5); z-index: 99; display: flex; align-items: flex-end;
}
.store-panel {
  width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0;
  padding: 24rpx; box-sizing: border-box; max-height: 60vh;
  display: flex; flex-direction: column;
}
.panel-title { font-size: 30rpx; font-weight: 600; color: #1d2129; text-align: center; margin-bottom: 16rpx; }
.store-list { flex: 1; min-height: 200rpx; }
.store-item {
  padding: 20rpx; border-radius: 12rpx; background: #f7f8fa;
  margin-bottom: 12rpx; border: 2rpx solid transparent;
}
.store-item.active { border-color: #165dff; background: #e8f3ff; }
.store-name { font-size: 28rpx; color: #1d2129; font-weight: 500; }
.store-addr { font-size: 24rpx; color: #86909c; margin-top: 6rpx; }
.store-empty { text-align: center; color: #c9cdd4; font-size: 26rpx; padding: 60rpx 0; }
.panel-close {
  margin-top: 16rpx; text-align: center; padding: 20rpx 0;
  color: #165dff; font-size: 28rpx;
}
</style>
