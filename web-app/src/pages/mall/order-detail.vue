<template>
  <view class="order-detail-page">
    <view class="mall-nav">
      <view class="nav-back" @click="goBack"><text>‹</text></view>
      <text class="nav-title">订单详情</text>
      <view class="nav-side"></view>
    </view>

    <scroll-view class="detail-scroll" scroll-y :show-scrollbar="false">
      <template v-if="order">
        <!-- 状态头 -->
        <view class="status-head" :class="'hd-' + order.status">
          <view class="status-title">{{ statusTitle }}</view>
          <view class="status-desc">{{ statusDesc }}</view>
        </view>

        <!-- 配送信息 -->
        <view class="card">
          <view class="card-title">配送信息</view>
          <view class="info-row" v-if="order.delivery_mode === 'pickup'">
            <text class="info-label">自提门店</text>
            <text class="info-value">{{ order.store_name || '-' }}</text>
          </view>
          <view class="info-row pickup-code" v-if="order.delivery_mode === 'pickup' && order.pickup_code">
            <text class="info-label">核销码</text>
            <text class="code-value">{{ order.pickup_code }}</text>
          </view>
          <template v-else>
            <view class="info-row">
              <text class="info-label">收货人</text>
              <text class="info-value">{{ order.receiver_name }} {{ order.receiver_phone }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">收货地址</text>
              <text class="info-value">{{ order.receiver_address }}</text>
            </view>
          </template>
          <view class="info-row">
            <text class="info-label">配送方式</text>
            <text class="info-value">{{ order.delivery_mode === 'pickup' ? '到店自提' : '快递配送' }}</text>
          </view>
        </view>

        <!-- 商品 -->
        <view class="card">
          <view class="card-title">商品信息</view>
          <view class="goods-item" v-for="it in order.items" :key="it.id">
            <image :src="resolveUrl(it.thumb)" class="goods-img" mode="aspectFill" />
            <view class="goods-info">
              <text class="goods-title">{{ it.title }}</text>
              <text class="goods-spec" v-if="it.spec_json && it.spec_json !== '{}'">{{ skuText(it.spec_json) }}</text>
            </view>
            <view class="goods-right">
              <view class="goods-price">
                <text class="price-symbol">¥</text>
                <text class="price-num">{{ fen2yuan(it.price) }}</text>
              </view>
              <text class="goods-qty">x{{ it.num }}</text>
            </view>
          </view>
          <view class="amount-row">
            <text class="amount-label">订单金额</text>
            <view class="amount-val">
              <text class="price-symbol">¥</text>
              <text class="amount-num">{{ fen2yuan(order.pay_amount) }}</text>
            </view>
          </view>
        </view>

        <!-- 订单信息 -->
        <view class="card">
          <view class="card-title">订单信息</view>
          <view class="info-row"><text class="info-label">订单编号</text><text class="info-value">{{ order.order_no }}</text></view>
          <view class="info-row"><text class="info-label">下单时间</text><text class="info-value">{{ order.created_at }}</text></view>
          <view class="info-row" v-if="order.remark"><text class="info-label">备注</text><text class="info-value">{{ order.remark }}</text></view>
        </view>
        <view class="bottom-space"></view>
      </template>
      <view v-else class="empty-box">
        <text class="empty-text">{{ loadError || '订单不存在' }}</text>
      </view>
    </scroll-view>

    <!-- 操作栏 -->
    <view class="action-bar" v-if="order">
      <view class="mini-btn cancel" v-if="order.status === 'pending'" @click="cancelOrder">取消订单</view>
      <view class="mini-btn pay" v-if="order.status === 'pending'" @click="goPay">去支付</view>
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
const order = ref(null);
const loadError = ref('');

const STATUS_TITLE = {
  pending: '等待支付', paid: '已支付，待发货', shipped: '商家已发货',
  done: '交易完成', closed: '订单已关闭', refunding: '退款处理中', refunded: '已退款',
};
const STATUS_DESC = {
  pending: '请尽快完成支付',
  paid: '商家正在准备商品',
  shipped: '请留意收货',
  done: '感谢您的购买',
  closed: '订单已取消',
  refunding: '请耐心等待',
  refunded: '退款已原路退回',
};

const statusTitle = computed(() => STATUS_TITLE[order.value?.status] || order.value?.status);
const statusDesc = computed(() => STATUS_DESC[order.value?.status] || '');

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

function fetchOrder() {
  if (!ensureLogin()) return;
  mallApi.getOrder(orderId)
    .then((res) => { order.value = res; })
    .catch((e) => { loadError.value = e || '订单不存在'; });
}

function cancelOrder() {
  uni.showModal({
    title: '提示',
    content: '确定取消该订单吗？',
    success: (r) => {
      if (!r.confirm) return;
      mallApi.cancelOrder(order.value.id)
        .then(() => { uni.showToast({ title: '已取消', icon: 'success' }); fetchOrder(); })
        .catch((e) => uni.showToast({ title: e || '取消失败', icon: 'none' }));
    },
  });
}

function goPay() {
  uni.showLoading({ title: '支付中…' });
  paymentApi.mockPay(order.value.order_no)
    .then(() => {
      uni.hideLoading();
      uni.showToast({ title: '支付成功', icon: 'success' });
      setTimeout(fetchOrder, 600);
    })
    .catch((e) => {
      uni.hideLoading();
      uni.showToast({ title: e || '支付失败', icon: 'none' });
    });
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: '/pages/cardMain/home' });
}

let orderId = 0;
onLoad((o) => {
  tid.value = getTid(o);
  orderId = Number(o?.id || 0);
  fetchOrder();
});
</script>

<style scoped>
.order-detail-page {
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
.detail-scroll { flex: 1; height: 0; }
.status-head { padding: 48rpx 32rpx; color: #fff; }
.hd-pending { background: #f53f3f; }
.hd-paid { background: #ff7d00; }
.hd-shipped { background: #165dff; }
.hd-done { background: #00b42a; }
.hd-closed { background: #86909c; }
.hd-refunding { background: #ff7d00; }
.hd-refunded { background: #86909c; }
.status-title { font-size: 38rpx; font-weight: 600; }
.status-desc { font-size: 26rpx; margin-top: 8rpx; opacity: 0.85; }
.card {
  background: #fff; border-radius: 16rpx; margin: 16rpx; padding: 24rpx;
}
.card-title { font-size: 30rpx; font-weight: 600; color: #1d2129; margin-bottom: 16rpx; }
.info-row {
  display: flex; padding: 12rpx 0; align-items: flex-start;
}
.info-label {
  width: 140rpx; font-size: 26rpx; color: #86909c; flex-shrink: 0;
}
.info-value { flex: 1; font-size: 26rpx; color: #1d2129; line-height: 1.5; word-break: break-all; }
.pickup-code { align-items: center; }
.code-value {
  font-size: 44rpx; font-weight: 700; color: #165dff; letter-spacing: 6rpx;
}
.goods-item { display: flex; align-items: center; padding: 14rpx 0; }
.goods-img { width: 110rpx; height: 110rpx; border-radius: 10rpx; background: #f2f3f5; flex-shrink: 0; }
.goods-info { flex: 1; margin-left: 14rpx; min-width: 0; }
.goods-title {
  font-size: 28rpx; color: #1d2129; display: block;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.goods-spec {
  display: inline-block; margin-top: 6rpx; padding: 2rpx 10rpx;
  background: #f2f3f5; border-radius: 6rpx; font-size: 20rpx; color: #86909c;
}
.goods-right { text-align: right; }
.goods-price { display: flex; align-items: baseline; justify-content: flex-end; }
.price-symbol { font-size: 20rpx; color: #f53f3f; }
.price-num { font-size: 28rpx; font-weight: 600; color: #f53f3f; }
.goods-qty { font-size: 22rpx; color: #86909c; }
.amount-row {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 16rpx; border-top: 1rpx solid #f2f3f5;
}
.amount-label { font-size: 26rpx; color: #4e5969; }
.amount-val { display: flex; align-items: baseline; }
.amount-num { font-size: 34rpx; font-weight: 600; color: #f53f3f; }
.bottom-space { height: 140rpx; }
.empty-box { padding: 200rpx 0; text-align: center; }
.empty-text { font-size: 28rpx; color: #c9cdd4; }
.action-bar {
  display: flex; justify-content: flex-end; padding: 16rpx 24rpx;
  background: #fff; border-top: 1rpx solid #f2f3f5;
}
.mini-btn {
  padding: 14rpx 44rpx; border-radius: 34rpx; font-size: 28rpx; margin-left: 16rpx;
}
.mini-btn.cancel { border: 1rpx solid #e5e6eb; color: #4e5969; }
.mini-btn.pay { background: #165dff; color: #fff; }
</style>
