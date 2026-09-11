<template>
  <view v-if="ew" class="dnew-nav" :style="navStyle">
    <!-- 功能模块 = 无：仅标题 + 文字颜色 -->
    <view v-if="ew.funcModule === 'none'" class="dnew-line dnew-line-none">
      <text class="dnew-title-text" :style="{ color: titleColor }">{{ pageName || '首页' }}</text>
    </view>

    <!-- 单层 / 双层模块：每层左/中/右三段 -->
    <template v-else>
      <view v-for="(layer, li) in shownLayers" :key="li" class="dnew-line" :style="lineStyle">
        <!-- 左侧部分 -->
        <view class="dnew-side">
          <view v-if="layer.left.type === 'image' && layer.left.image" class="dnew-side-item" @click="tapLink(layer.left.link)">
            <image class="dnew-img dnew-img-45" :src="resolveUrl(layer.left.image)" mode="aspectFit" />
          </view>
          <view v-else-if="layer.left.type === 'icon'" class="dnew-side-item" @click="tapLink(layer.left.link)">
            <SIcon v-if="layer.left.icon" :name="layer.left.icon" :color="layer.left.color || '#1d2129'" size="default" />
          </view>
          <view v-else-if="layer.left.type === 'store'" class="dnew-side-item dnew-store" @click="tapLink(layer.left.link)">
            <SIcon name="radar" :color="layer.left.store.color || '#1d2129'" size="small" />
            <text class="dnew-store-name" :style="{ color: layer.left.store.color || '#1d2129' }">{{ layer.left.store.name || '门店' }}</text>
          </view>
          <view v-else-if="layer.left.type === 'city'" class="dnew-side-item" @click="tapLink(layer.left.link)">
            <SIcon name="location" :color="layer.left.color || '#1d2129'" size="small" />
            <text class="dnew-city-text" :style="{ color: layer.left.color || '#1d2129' }">{{ pageName || '首页' }}</text>
          </view>
        </view>

        <!-- 中间部分 -->
        <view class="dnew-title" @click="tapLink(layer.middle.link)">
          <image v-if="layer.middle.type === 'image' && layer.middle.image" class="dnew-img dnew-img-96" :src="resolveUrl(layer.middle.image)" mode="aspectFit" />
          <view v-else-if="layer.middle.type === 'search'" class="dnew-search" :style="searchStyle(layer)" @click.stop="goSearch">
            <SIcon name="dynamic" :color="layer.middle.search.iconColor || '#3d404d'" size="small" />
            <text class="dnew-search-txt" :style="{ color: layer.middle.search.textColor || '#3d404d' }">{{ layer.middle.search.placeholder || '请输入关键字' }}</text>
            <view v-if="layer.middle.search.showBtn" class="dnew-search-btn" :style="{ background: layer.middle.search.borderBg || '#ffffff', color: layer.middle.search.iconColor || '#3d404d' }">搜索</view>
          </view>
          <text v-else class="dnew-title-text" :style="{ color: titleColor }">{{ pageName || '首页' }}</text>
        </view>

        <!-- 右侧部分 -->
        <view class="dnew-side dnew-right">
          <view v-if="layer.right.type === 'image' && layer.right.image" class="dnew-side-item" @click="tapLink(layer.right.link)">
            <image class="dnew-img dnew-img-45" :src="resolveUrl(layer.right.image)" mode="aspectFit" />
          </view>
          <view v-else-if="layer.right.type === 'icon'" class="dnew-side-item" @click="tapLink(layer.right.link)">
            <SIcon v-if="layer.right.icon" :name="layer.right.icon" :color="layer.right.color || '#1d2129'" size="default" />
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script>
import { API_DOMAIN } from '../utils/cardApi.js';
import SIcon from './SIcon.vue';

export default {
  name: 'DesignNavEw',
  components: { SIcon },
  props: {
    header: { type: Object, default: null }, // { scheme:2, ew:{...} }
    pageName: { type: String, default: '' },
    scrolled: { type: Boolean, default: false },
  },
  computed: {
    ew() {
      const h = this.header || {};
      if (h.scheme === 2 && h.ew) return h.ew;
      return null;
    },
    titleColor() {
      const ew = this.ew;
      if (!ew) return '#1d2129';
      if (ew.funcModule === 'none') return ew.textColor === 'white' ? '#ffffff' : '#1d2129';
      return '#1d2129';
    },
    shownLayers() {
      const ew = this.ew;
      if (!ew) return [];
      const layers = Array.isArray(ew.layers) ? ew.layers : [];
      return ew.funcModule === 'double' ? layers : [layers[0] || {}];
    },
    navStyle() {
      const ew = this.ew || {};
      const bg = this.scrolled ? ew.scrollBg : ew.headBg;
      if (!bg) return {};
      if (bg.mode === 'image' && bg.image) {
        return {
          backgroundImage: `url(${this.resolveUrl(bg.image)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        };
      }
      return { background: bg.color || (this.scrolled ? 'transparent' : '#ffffff') };
    },
    lineStyle() {
      const ew = this.ew || {};
      const pad = ew.padding || 0;
      return pad ? { paddingLeft: `${pad}px`, paddingRight: `${pad}px` } : {};
    },
  },
  methods: {
    resolveUrl(u) {
      if (!u) return '';
      if (/^https?:\/\//.test(u)) return u;
      return API_DOMAIN + (u.startsWith('/') ? u : '/' + u);
    },
    searchStyle(layer) {
      const s = layer.middle.search || {};
      const arr = [];
      if (s.fillBg) arr.push(`background:${s.fillBg}`);
      if (s.borderBg) arr.push(`border:1rpx solid ${s.borderBg}`);
      return arr.join(';');
    },
    goSearch() {
      this.$emit('search');
    },
    tapLink(link) {
      if (!link) return;
      uni.navigateTo({ url: link, fail: () => uni.showToast({ title: '页面不存在', icon: 'none' }) });
    },
  },
};
</script>

<style scoped>
.dnew-nav {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  position: relative;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
}
.dnew-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  width: 100%;
}
.dnew-line-none {
  justify-content: center;
}
.dnew-side {
  flex: 0 0 auto;
  max-width: 40%;
  display: flex;
  align-items: center;
  overflow: hidden;
}
.dnew-right { justify-content: flex-end; }
.dnew-side-item {
  display: flex;
  align-items: center;
  gap: 6rpx;
  max-width: 100%;
  overflow: hidden;
}
.dnew-title {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0 16rpx;
  overflow: hidden;
}
.dnew-title-text {
  font-size: 34rpx;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.dnew-img { display: block; }
.dnew-img-45 { width: 45px; height: 45px; }
.dnew-img-96 { width: 96px; height: 30px; }
.dnew-store { display: flex; align-items: center; gap: 6rpx; }
.dnew-store-name { font-size: 24rpx; white-space: nowrap; }
.dnew-city-text { font-size: 24rpx; white-space: nowrap; }
.dnew-search {
  display: flex;
  align-items: center;
  gap: 8rpx;
  border-radius: 30rpx;
  padding: 8rpx 10rpx 8rpx 20rpx;
  height: 60rpx;
  box-sizing: border-box;
  width: 100%;
}
.dnew-search-txt { font-size: 24rpx; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.dnew-search-btn {
  font-size: 22rpx;
  line-height: 1;
  padding: 10rpx 18rpx;
  border-radius: 26rpx;
  flex-shrink: 0;
}
</style>
