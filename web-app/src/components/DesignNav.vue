<template>
  <view
    v-if="header"
    class="dn-nav"
    :class="{ 'dn-immersive': header.type === 'immersive' }"
    :style="navStyle"
  >
    <!-- 左侧内容 -->
    <view class="dn-side" @click="tapPos('left')">
      <block v-if="header.content.left.type === 'text'">
        <text class="dn-text" :style="posColor('left')">{{ header.content.left.text }}</text>
      </block>
      <block v-else-if="header.content.left.type === 'image' && header.content.left.image">
        <image :src="resolveUrl(header.content.left.image)" class="dn-img" mode="aspectFit" />
      </block>
      <block v-else-if="header.content.left.type === 'search'">
        <view class="dn-search" :style="searchStyle">
          <text class="dn-search-ico">⌕</text>
          <text class="dn-search-txt" :style="posColor('left')">{{ header.content.left.text || '搜索' }}</text>
        </view>
      </block>
      <block v-else-if="header.content.left.type === 'iconText'">
        <view class="dn-icon-text">
          <text class="dn-ico-dot" :style="posColor('left')">●</text>
          <text class="dn-text" :style="posColor('left')">{{ header.content.left.text }}</text>
        </view>
      </block>
    </view>

    <!-- 标题（居中） -->
    <view class="dn-title" :style="{ color: textColor }">{{ header.titleText || pageName }}</view>

    <!-- 右侧内容 -->
    <view class="dn-side dn-right" @click="tapPos('right')">
      <block v-if="header.content.right.type === 'text'">
        <text class="dn-text" :style="posColor('right')">{{ header.content.right.text }}</text>
      </block>
      <block v-else-if="header.content.right.type === 'image' && header.content.right.image">
        <image :src="resolveUrl(header.content.right.image)" class="dn-img" mode="aspectFit" />
      </block>
      <block v-else-if="header.content.right.type === 'search'">
        <view class="dn-search" :style="searchStyle">
          <text class="dn-search-ico">⌕</text>
          <text class="dn-search-txt" :style="posColor('right')">{{ header.content.right.text || '搜索' }}</text>
        </view>
      </block>
      <block v-else-if="header.content.right.type === 'iconText'">
        <view class="dn-icon-text">
          <text class="dn-ico-dot" :style="posColor('right')">●</text>
          <text class="dn-text" :style="posColor('right')">{{ header.content.right.text }}</text>
        </view>
      </block>
    </view>
  </view>
</template>

<script>
import { API_DOMAIN } from '../utils/cardApi.js';

export default {
  name: 'DesignNav',
  props: {
    header: { type: Object, default: null },
    pageName: { type: String, default: '' },
  },
  computed: {
    // 导航栏容器样式：custom 按背景配置 / immersive 透明悬浮 / official 白底
    navStyle() {
      const h = this.header || {};
      const s = {};
      if (h.type === 'immersive') {
        s.background = 'transparent';
        s.position = 'absolute';
        s.zIndex = 20;
      } else if (h.type === 'official') {
        s.background = '#ffffff';
      } else if (h.bgImage) {
        s.backgroundImage = `url(${this.resolveUrl(h.bgImage)})`;
        s.backgroundSize = 'cover';
        s.backgroundPosition = 'center';
      } else {
        s.background = h.bgColor || '#ffffff';
      }
      if (h.padding) {
        s.paddingLeft = `${h.padding}px`;
        s.paddingRight = `${h.padding}px`;
      }
      return s;
    },
    textColor() {
      const h = this.header || {};
      if (h.type === 'immersive') return '#ffffff';
      if (h.type === 'official') return '#1d2129';
      return h.textColor || '#1d2129';
    },
    searchStyle() {
      const h = this.header || {};
      const bg = h.type === 'immersive' ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.05)';
      return { background: bg };
    },
  },
  methods: {
    resolveUrl(u) {
      if (!u) return '';
      if (/^https?:\/\//.test(u)) return u;
      return API_DOMAIN + (u.startsWith('/') ? u : '/' + u);
    },
    posColor(pos) {
      const h = this.header || {};
      if (h.type === 'immersive') return { color: '#ffffff' };
      const c = (h.content && h.content[pos]) || {};
      return { color: c.color || '#1d2129' };
    },
    tapPos(pos) {
      const link = (this.header && this.header.content && this.header.content[pos] && this.header.content[pos].link) || '';
      if (!link) return;
      uni.navigateTo({ url: link, fail: () => uni.showToast({ title: '页面不存在', icon: 'none' }) });
    },
  },
};
</script>

<style scoped>
.dn-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  position: relative;
  top: 0;
  left: 0;
  right: 0;
}
.dn-side {
  flex: 0 0 auto;
  max-width: 40%;
  display: flex;
  align-items: center;
  overflow: hidden;
}
.dn-right { justify-content: flex-end; }
.dn-title {
  flex: 1;
  text-align: center;
  font-size: 34rpx;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 16rpx;
}
.dn-text { font-size: 28rpx; line-height: 1; white-space: nowrap; }
.dn-img { width: 64rpx; height: 56rpx; }
.dn-search {
  display: flex;
  align-items: center;
  gap: 8rpx;
  border-radius: 26rpx;
  padding: 8rpx 20rpx;
}
.dn-search-ico { font-size: 24rpx; line-height: 1; }
.dn-search-txt { font-size: 24rpx; line-height: 1.4; }
.dn-icon-text { display: flex; align-items: center; gap: 8rpx; }
.dn-ico-dot { font-size: 18rpx; line-height: 1; }
</style>
