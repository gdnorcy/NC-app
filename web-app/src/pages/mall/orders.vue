<template>
  <view class="orders-page">
    <view class="mall-nav">
      <view class="nav-back" @click="goBack"><text>‹</text></view>
      <text class="nav-title">我的订单</text>
      <view class="nav-side"></view>
    </view>

    <!-- 状态筛选 -->
    <scroll-view class="status-scroll" scroll-x :show-scrollbar="false">
      <view class="status-list">
        <view
          v-for="s in statusTabs"
          :key="s.key"
          class="status-item"
          :class="{ active: status === s.key }"
          @click="switchStatus(s.key)"
        >{{ s.label }}</view>
      </view>
    </scroll-view>

    <scroll-view class="order-scroll" scroll-y :show-scrollbar="false" @scrolltolower="loadMore">
      <view v-if="orders.length" class="order-list">
        <view class="order-card" v-for="o in orders" :key="o.id" @click="goDetail(o.id)">
          <view class="order-head">
            <text class="order-no">订单号：{{ o.order_no }}</text>
            <text class="order-status" :class="'st-' + o.status">{{ statusLabel(o.status) }}</text>
          </view>
          <view class="order-goods" v-for="it in o.items" :key="it.id">
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
          <view class="order-foot">
            <text class="order-time">{{ o.created_at }}</text>
            <text class="order-amount">合计：<text class="amount-num">¥{{ fen2yuan(o.pay_amount) }}</text></text>
          </view>
          <view class="order-actions" v-if="o.status === 'pending'">
            <view class="mini-btn cancel" @click.stop="cancelOrder(o)">取消订单</view>
            <view class="mini-btn pay" @click.stop="goPay(o)">去支付</view>
          </view>
        </view>
      </view>
      <view v-else-if="!loading" class="empty-box">
        <view class="empty-icon"><SIcon name="show" size="xlarge" color="#c9cdd4" /></view>
        <text class="empty-text">暂无订单</text>
      </view>
      <view class="load-more" v-if="orders.length">{{ noMore ? '没有更多了' : '加载中…' }}</view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { mallApi } from '../../utils/mallApi.js';
import { fen2yuan, getTid, getToken } from '../../utils/mallUtil.js';
import { resolveAssetUrl } from '../../utils/design.js';
import { paymentApi } from '../../utils/cardApi.js';
import SIcon from '../../components/SIcon.vue';

const tid = ref('');
const status = ref('');
const statusTabs = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待支付' },
  { key: 'paid', label: '待发货' },
  { key: 'shipped', label: '待收货' },
  { key: 'done', label: '已完成' },
  { key: 'closed', label: '已关闭' },
];
const orders = ref([]);
const page = ref(1);
const pageSize = 10;
const noMore = ref(false);
const loading = ref(false);

const resolveUrl = (u) => resolveAssetUrl(u, tid.value);

const STATUS_LABELS = {
  pending: '待支付', paid: '待发货', shipped: '待收货',
  done: '已完成', closed: '已关闭', refunding: '退款中', refunded: '已退款',
};
function statusLabel(s) { return STATUS_LABELS[s] || s; }

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

function fetchOrders(reset = false) {
  if (loading.value) return;
  loading.value = true;
  if (reset) { page.value = 1; noMore.value = false; }
  mallApi.getOrders({ status: status.value, page: page.value, pageSize })
    .then((res) => {
      const list = res.list || [];
      if (reset) orders.value = list;
      else orders.value = orders.value.concat(list);
      noMore.value = list.length < pageSize;
      if (list.length >= pageSize) page.value += 1;
      loading.value = false;
    })
    .catch((e) => {
      loading.value = false;
      uni.showToast({ title: e || '加载失败', icon: 'none' });
    });
}

function loadMore() {
  if (!noMore.value) fetchOrders(false);
}

function switchStatus(key) {
  if (status.value === key) return;
  status.value = key;
  fetchOrders(true);
}

function cancelOrder(o) {
  uni.showModal({
    title: '提示',
    content: '确定取消该订单吗？',
    success: (r) => {
      if (!r.confirm) return;
      mallApi.cancelOrder(o.id)
        .then(() => {
          uni.showToast({ title: '已取消', icon: 'success' });
          fetchOrders(true);
        })
        .catch((e) => uni.showToast({ title: e || '取消失败', icon: 'none' }));
    },
  });
}

function goPay(o) {
  uni.showLoading({ title: '支付中…' });
  paymentApi.mockPay(o.order_no)
    .then(() => {
      uni.hideLoading();
      uni.showToast({ title: '支付成功', icon: 'success' });
      setTimeout(() => fetchOrders(true), 600);
    })
    .catch((e) => {
      uni.hideLoading();
      uni.showToast({ title: e || '支付失败', icon: 'none' });
    });
}

function goDetail(id) {
  uni.navigateTo({ url: `/pages/mall/order-detail?id=${id}${tid.value ? `&tid=${tid.value}` : ''}` });
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: '/pages/cardMain/home' });
}

onLoad((o) => {
  tid.value = getTid(o);
  if (o?.status) status.value = o.status;
});

onShow(() => {
  if (ensureLogin()) fetchOrders(true);
});
</script>

<style scoped>
.orders-page {
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
.status-scroll { background: #fff; white-space: nowrap; border-bottom: 1rpx solid #f2f3f5; }
.status-list { display: inline-flex; padding: 0 8rpx; }
.status-item {
  padding: 24rpx 28rpx; font-size: 26rpx; color: #4e5969;
  border-bottom: 4rpx solid transparent;
}
.status-item.active {
  color: #165dff; font-weight: 500; border-bottom-color: #165dff;
}
.order-scroll { flex: 1; height: 0; }
.order-list { padding: 16rpx; }
.order-card {
  background: #fff; border-radius: 16rpx; padding: 20rpx;
  margin-bottom: 16rpx;
}
.order-head {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 16rpx; border-bottom: 1rpx solid #f2f3f5;
}
.order-no { font-size: 24rpx; color: #86909c; }
.order-status { font-size: 26rpx; font-weight: 500; }
.st-pending { color: #f53f3f; }
.st-paid { color: #ff7d00; }
.st-shipped { color: #165dff; }
.st-done { color: #00b42a; }
.st-closed { color: #c9cdd4; }
.order-goods {
  display: flex; align-items: center;
  padding: 16rpx 0;
}
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
.order-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 16rpx; border-top: 1rpx solid #f2f3f5;
}
.order-time { font-size: 22rpx; color: #c9cdd4; }
.order-amount { font-size: 24rpx; color: #4e5969; }
.amount-num { font-size: 30rpx; font-weight: 600; color: #f53f3f; }
.order-actions { display: flex; justify-content: flex-end; padding-top: 16rpx; }
.mini-btn {
  padding: 10rpx 32rpx; border-radius: 30rpx; font-size: 26rpx; margin-left: 16rpx;
}
.mini-btn.cancel { border: 1rpx solid #e5e6eb; color: #4e5969; }
.mini-btn.pay { background: #165dff; color: #fff; }
.empty-box {
  padding: 180rpx 0;
  display: flex; flex-direction: column; align-items: center;
}
.empty-icon {
  width: 140rpx; height: 140rpx; border-radius: 28rpx; background: #f2f3f5;
  display: flex; align-items: center; justify-content: center; margin-bottom: 24rpx;
}
.empty-text { font-size: 26rpx; color: #86909c; }
.load-more { text-align: center; padding: 24rpx 0 40rpx; font-size: 24rpx; color: #c9cdd4; }
</style>
