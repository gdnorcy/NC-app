<template>
  <view class="mall-page" :style="themeStyle">
    <!-- 顶部栏：返回(有来源时) + 标题 + 购物车入口 -->
<!-- PageNav -->
    <PageNav title="商城" :back="canBack">
      <template #right>
        <view class="nav-cart" @click="goCart">
          <SIcon name="cart" size="default" :color="ICON_T1" />
          <view class="cart-badge" v-if="cartCount > 0">{{ cartCount > 99 ? '99+' : cartCount }}</view>
        </view>
      </template>
    </PageNav>

    <!-- 首页装修区（商品管理-首页装修；未配置/未发布时为空，走下方瀑布流兜底） -->
    <view v-if="designComps.length" class="design-zone">
      <template v-for="(c, i) in designComps" :key="i">
        <DesignPage :comps="[c]" :tenant-id="Number(tid)" :global="designGlobal" />
      </template>
    </view>

    <!-- 兜底商品列表（装修稿未含「商品列表」组件时展示：分类 + 排序 + 瀑布流） -->
    <template v-if="!hasGoodsList">
    <!-- 分类横向滚动 -->
    <scroll-view class="cate-scroll" scroll-x :show-scrollbar="false">
      <view class="cate-list">
        <view
          v-for="c in cateList"
          :key="c.id"
          class="cate-item"
          :class="{ active: activeCat === c.id }"
          @click="switchCat(c.id)"
        >{{ c.name }}</view>
      </view>
    </scroll-view>

    <!-- 排序条 -->
    <view class="sort-bar">
      <view
        v-for="s in sortItems"
        :key="s.key"
        class="sort-item"
        :class="{ active: sortBy === s.key }"
        @click="switchSort(s.key)"
      >
        {{ s.label }}
        <text v-if="s.key === 'priceAsc'" class="sort-arrow">{{ sortBy === 'priceDesc' ? '↑' : '↓' }}</text>
      </view>
    </view>

    <!-- 商品双列列表 -->
    <scroll-view class="goods-scroll" scroll-y :show-scrollbar="false" @scrolltolower="loadMore">
      <view class="goods-grid" v-if="goodsList.length">
        <view class="goods-card" v-for="g in goodsList" :key="g.id" @click="goDetail(g.id)">
          <view class="goods-img-wrap">
            <image v-if="g.thumb" :src="resolveUrl(g.thumb)" class="goods-img" mode="aspectFill" />
            <view v-else class="goods-img goods-img-empty"><SIcon name="show" size="large" :color="ICON_DECOR" /></view>
            <view class="soldout-mask" v-if="g.soldout">已售罄</view>
          </view>
          <view class="goods-info">
            <text class="goods-title">{{ g.title }}</text>
            <view class="goods-bottom">
              <view class="goods-price">
                <text class="price-symbol">¥</text>
                <text class="price-num">{{ yuanFmt(g.price) }}</text>
                <text class="price-market" v-if="g.market_price && Number(g.market_price) > Number(g.price)">¥{{ yuanFmt(g.market_price) }}</text>
              </view>
              <text class="goods-sales">已售{{ g.sales || 0 }}</text>
            </view>
          </view>
        </view>
      </view>
      <view v-else-if="!loading" class="empty-box">
        <view class="empty-icon"><SIcon name="show" size="xlarge" :color="ICON_DECOR" /></view>
        <text class="empty-text">{{ loadError || '暂无商品' }}</text>
      </view>
      <view class="load-more" v-if="goodsList.length">{{ noMore ? '没有更多了' : '加载中…' }}</view>
    </scroll-view>
    </template>
    <CardTabBar active="mall" page-type="mall-home" />
    <view class="tabbar-space"></view>
  </view>
</template>

<script setup>
import { ICON_DECOR, ICON_T1 } from '../../utils/iconColor.js';
import PageNav from '../../components/PageNav.vue';
import { ref, computed, nextTick } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { mallApi } from '../../utils/mallApi.js';
import { yuanFmt, getTid, getToken } from '../../utils/mallUtil.js';
import { resolveAssetUrl } from '../../utils/design.js';
import { useDesignTheme } from '../../utils/design.js';

const themeStyle = useDesignTheme();
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';
import DesignPage from '../../components/DesignPage.vue';

const tid = ref('');
const cateList = ref([{ id: 0, name: '全部' }]);
const activeCat = ref(0);
const sortBy = ref('default');
const sortItems = [
  { key: 'default', label: '综合' },
  { key: 'sales', label: '销量' },
  { key: 'new', label: '新品' },
  { key: 'priceAsc', label: '价格' },
];
const goodsList = ref([]);
const page = ref(1);
const pageSize = 10;
const noMore = ref(false);
const loading = ref(false);
const loadError = ref('');
const cartCount = ref(0);
const canBack = ref(getCurrentPages().length > 1);
// 首页装修：mall-home 页面草稿/发布稿（C 端读取发布稿→草稿回退），组件由 DesignPage 渲染
const designComps = ref([]);
const designGlobal = ref({});
const pageType = ref('');
const hasGoodsList = computed(() => designComps.value.some((c) => ['goods-group','goods-list','goods-all','goods-tabs','goods-rank','goods-like','goods-swiper','goods-show','goods-featured'].includes(c.type)));

const resolveUrl = (u) => resolveAssetUrl(u, tid.value);

function fetchCates() {
  return mallApi.getCates({ tid: tid.value })
    .then((res) => {
      cateList.value = [{ id: 0, name: '全部' }, ...(res.list || [])];
    })
    .catch(() => { /* 分类失败不阻断列表 */ });
}

function fetchGoods(reset = false) {
  if (loading.value) return Promise.resolve();
  loading.value = true;
  if (reset) { page.value = 1; noMore.value = false; loadError.value = ''; }
  return mallApi.getGoods({
    tid: tid.value,
    catId: activeCat.value || '',
    sortBy: sortBy.value,
    page: page.value,
    pageSize,
  })
    .then((res) => {
      const list = res.list || [];
      if (reset) goodsList.value = list;
      else goodsList.value = goodsList.value.concat(list);
      noMore.value = list.length < pageSize;
      if (list.length >= pageSize) page.value += 1;
      loading.value = false;
    })
    .catch((e) => {
      loadError.value = e || '加载失败';
      loading.value = false;
    });
}

function loadMore() {
  if (!noMore.value) fetchGoods(false);
}

function switchCat(id) {
  if (activeCat.value === id) return;
  activeCat.value = id;
  fetchGoods(true);
}

function switchSort(key) {
  // 价格排序：点击交替 升/降
  if (key === 'priceAsc') {
    sortBy.value = sortBy.value === 'priceAsc' ? 'priceDesc' : 'priceAsc';
  } else {
    sortBy.value = key;
  }
  fetchGoods(true);
}

function goDetail(id) {
  uni.navigateTo({ url: `/pages/mall/detail?id=${id}${tid.value ? `&tid=${tid.value}` : ''}` });
}

function goCart() {
  uni.navigateTo({ url: `/pages/mall/cart${tid.value ? `?tid=${tid.value}` : ''}` });
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: '/pages/cardMain/home' });
}

function fetchCartCount() {
  const token = getToken();
  if (!token) return;
  mallApi.getCart()
    .then((res) => {
      cartCount.value = (res.list || []).reduce((sum, it) => sum + it.quantity, 0);
    })
    .catch(() => {});
}

function fetchMallDesign() {
  const p = { tid: tid.value };
  if (pageType.value) p.pageType = pageType.value;
  return mallApi.getDesignHome(p)
    .then((res) => {
      designComps.value = (res?.components || []).filter((c) => c && c.type);
    })
    .catch(() => { designComps.value = []; });
}

onLoad((o) => {
  tid.value = getTid(o);
  // 行业首页联动：/pages/mall/index?pageType=xxx（「设为商城首页」写入的装修页面）
  if (o && o.pageType) pageType.value = String(o.pageType).trim();
  // 分类导航跳入：/pages/mall/index?catId=xx 定位到指定分类（兜底列表生效时）
  if (o && o.catId) {
    activeCat.value = Number(o.catId) || 0;
    if (tid.value) {
      mallApi.getCates({ tid: tid.value })
        .then((res) => {
          cateList.value = [{ id: 0, name: '全部' }, ...(res.list || [])];
          fetchGoods(true);
        })
        .catch(() => { fetchGoods(true); });
    } else {
      fetchGoods(true);
    }
  }
});

onShow(() => {
  uni.$emit('cart:changed'); // 购物车组件（fab-cart）数量刷新
  if (tid.value) fetchCates();
  fetchCartCount();
  // 装修稿含商品列表组件时，由装修区承载商品展示，跳过瀑布流兜底
  fetchMallDesign().then(() => { if (!hasGoodsList.value) fetchGoods(true); });
});
</script>

<style scoped>
.tabbar-space { height: 140rpx; }
.mall-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg-card);
  overflow: visible;
  box-sizing: border-box;
}
/* 编辑预览（设计中心 iframe）：页面自然撑高，滚动交给父容器 */
.mp-editor .goods-scroll { height: auto !important; flex: none; }
/* 编辑预览组件槽：点击选中高亮 */
.nav-cart {
  width: 60rpx;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.cart-badge {
  position: absolute;
  top: -8rpx;
  right: -12rpx;
  min-width: 30rpx;
  height: 30rpx;
  padding: 0 6rpx;
  border-radius: 15rpx;
  background: var(--danger);
  color: var(--white);
  font-size: var(--fs-1);
  line-height: 30rpx;
  text-align: center;
  box-sizing: border-box;
}
.cate-scroll {
  background: var(--white);
  white-space: nowrap;
  border-bottom: 1rpx solid var(--bg-hover);
}
.cate-list {
  display: inline-flex;
  padding: 20rpx 16rpx;
}
.cate-item {
  padding: 10rpx 28rpx;
  margin: 0 8rpx;
  border-radius: 30rpx;
  font-size: var(--fs-4);
  color: var(--t2);
  background: var(--bg-hover);
}
.cate-item.active {
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  color: var(--design-primary, #165dff);
  font-weight: 500;
}
.sort-bar {
  display: flex;
  background: var(--white);
  border-bottom: 1rpx solid var(--bg-hover);
}
.sort-item {
  flex: 1;
  text-align: center;
  padding: 20rpx 0;
  font-size: var(--fs-4);
  color: var(--t2);
}
.sort-item.active {
  color: var(--design-primary, #165dff);
  font-weight: 500;
}
.sort-arrow { font-size: var(--fs-2); margin-left: 4rpx; }
.goods-scroll {
  flex: 1;
  height: 0;
}
.goods-grid {
  display: flex;
  flex-wrap: wrap;
  padding: 16rpx;
}
.goods-card {
  width: calc(50% - 12rpx);
  margin: 6rpx;
  background: var(--white);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.goods-img-wrap {
  position: relative;
  width: 100%;
  height: 340rpx;
}
.goods-img {
  width: 100%;
  height: 100%;
}
.goods-img-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
}
.soldout-mask {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.6);
  color: var(--t2);
  font-size: var(--fs-5);
}
.goods-info {
  padding: 16rpx;
}
.goods-title {
  font-size: var(--fs-5);
  color: var(--t1);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  line-height: 1.4;
  min-height: 78rpx;
}
.goods-bottom {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 8rpx;
}
.goods-price { display: flex; align-items: baseline; }
.price-symbol { font-size: var(--fs-2); color: var(--danger); }
.price-num { font-size: 34rpx; font-weight: 600; color: var(--danger); }
.price-market {
  font-size: var(--fs-2);
  color: var(--decor);
  text-decoration: line-through;
  margin-left: 8rpx;
}
.goods-sales { font-size: var(--fs-2); color: var(--decor); }
.empty-box {
  padding: 160rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-icon {
  width: 140rpx;
  height: 140rpx;
  border-radius: 28rpx;
  background: var(--bg-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}
.empty-text { font-size: var(--fs-4); color: var(--decor); }
.load-more {
  text-align: center;
  padding: 24rpx 0 40rpx;
  font-size: var(--fs-3);
  color: var(--border);
}

.design-zone { background: var(--bg-card); }

</style>
