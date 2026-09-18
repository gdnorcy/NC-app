<template>
  <view
    v-if="header"
    class="dn-nav"
    :class="{ 'dn-immersive': header.type === 'immersive' }"
    :style="navStyle"
  >
    <!-- 第一行 -->
    <view class="dn-line">
      <view class="dn-side" @click="tapPos('left', 'content')">
        <pos-item :item="header.content.left" :pos="'left'" :header="header" :resolve="resolveUrl" />
      </view>
      <view class="dn-title" :style="centerStyle('content')">
        <pos-center :item="header.content.center" :header="header" :fallback="header.titleText || pageName" :resolve="resolveUrl" />
      </view>
      <view class="dn-side dn-right" @click="tapPos('right', 'content')">
        <pos-item :item="header.content.right" :pos="'right'" :header="header" :resolve="resolveUrl" />
      </view>
    </view>

    <!-- 第二行（两行内容） -->
    <view v-if="header.lines === 2 && header.type === 'custom'" class="dn-line dn-line2">
      <view class="dn-side" @click="tapPos('left', 'content2')">
        <pos-item :item="header.content2.left" :pos="'left'" :header="header" :resolve="resolveUrl" />
      </view>
      <view class="dn-title" :style="centerStyle('content2')">
        <pos-center :item="header.content2.center" :header="header" :fallback="''" :resolve="resolveUrl" />
      </view>
      <view class="dn-side dn-right" @click="tapPos('right', 'content2')">
        <pos-item :item="header.content2.right" :pos="'right'" :header="header" :resolve="resolveUrl" />
      </view>
    </view>
  </view>
</template>

<script>
import { h } from 'vue';
import { API_DOMAIN } from '../utils/cardApi.js';

// 左/右单项：文字（加粗/字号）/图片/搜索/图标+文字
const PosItem = {
  name: 'PosItem',
  props: {
    item: { type: Object, default: () => ({}) },
    pos: { type: String, default: 'left' },
    header: { type: Object, default: null },
    resolve: { type: Function, default: (u) => u },
  },
  computed: {
    color() {
      const h = this.header || {};
      if (h.type === 'immersive') return '#ffffff';
      return this.item.color || '#1d2129';
    },
    bold() {
      return this.item.bold ? 'font-weight:600;' : '';
    },
  },
  render() {
    const it = this.item;
    const style = (extra) => `color:${this.color};font-size:${it.fontSize || 13}px;${this.bold}${extra || ''}`;
    if (it.type === 'text') {
      return h('text', { class: 'dn-text', style: style('') }, it.text || '');
    }
    if (it.type === 'search') {
      return h('view', { class: 'dn-search', style: `background:${this.header && this.header.type === 'immersive' ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.05)'}` }, [
        h('text', { class: 'dn-search-ico' }, '⌕'),
        h('text', { class: 'dn-search-txt', style: `color:${this.color}` }, it.text || '搜索'),
      ]);
    }
    if (it.type === 'image' && it.image) {
      return h('image', { class: 'dn-img', attrs: { src: this.resolve(it.image), mode: 'aspectFit' } });
    }
    if (it.type === 'iconText') {
      return h('view', { class: 'dn-icon-text' }, [
        h('text', { class: 'dn-ico-dot', style: `color:${this.color}` }, '●'),
        h('text', { class: 'dn-text', style: style('') }, it.text || ''),
      ]);
    }
    return null;
  },
};

// 中间项：配置了内容按配置（背景/边框/宽度/圆角/对齐/字体色/字号/加粗），否则回退标题
const PosCenter = {
  name: 'PosCenter',
  props: {
    item: { type: Object, default: () => ({}) },
    header: { type: Object, default: null },
    fallback: { type: String, default: '' },
    resolve: { type: Function, default: (u) => u },
  },
  computed: {
    color() {
      const h = this.header || {};
      if (h.type === 'immersive') return '#ffffff';
      return this.item.color || h.textColor || '#1d2129';
    },
    hasContent() {
      return this.item.type && this.item.type !== 'none' && (this.item.text || this.item.image);
    },
  },
  render() {
    const it = this.item;
    if (!this.hasContent) {
      const base = this.header && this.header.type === 'immersive' ? '#ffffff' : ((this.header && this.header.textColor) || '#1d2129');
      // fallback 为空字符串（第二行/未配中心内容）时不兜底显示「首页」，避免与第一行标题重复；仅 fallback 有值时显示
      if (!this.fallback) return h('text', { class: 'dn-title-text', style: `color:${base}` });
      return h('text', { class: 'dn-title-text', style: `color:${base}` }, this.fallback);
    }
    let inner = null;
    if (it.type === 'text') {
      inner = h('text', { class: 'dn-text', style: `color:${this.color};font-size:${it.fontSize || 13}px;${it.bold ? 'font-weight:600;' : ''}` }, it.text);
    } else if (it.type === 'image' && it.image) {
      inner = h('image', { class: 'dn-center-img', attrs: { src: this.resolve(it.image), mode: 'aspectFit' } });
    } else if (it.type === 'search') {
      inner = h('text', { class: 'dn-text', style: `color:${this.color};font-size:${it.fontSize || 12}px` }, `⌕ ${it.text || '搜索'}`);
    }
    const box = [];
    if (it.bgColor) box.push(`background:${it.bgColor}`);
    if (it.borderColor) box.push(`border:1rpx solid ${it.borderColor}`);
    if (it.width) box.push(`width:${it.width}px`);
    if (typeof it.radius === 'number') box.push(`border-radius:${it.radius}px`);
    box.push('display:inline-flex;align-items:center;justify-content:center;height:56rpx;padding:0 16rpx;box-sizing:border-box;max-width:100%');
    return h('view', { style: box.join(';') }, [inner]);
  },
};

export default {
  name: 'DesignNav',
  components: { PosItem, PosCenter },
  props: {
    header: { type: Object, default: null },
    pageName: { type: String, default: '' },
  },
  computed: {
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
  },
  methods: {
    resolveUrl(u) {
      if (!u) return '';
      if (/^https?:\/\//.test(u)) return u;
      return API_DOMAIN + (u.startsWith('/') ? u : '/' + u);
    },
    centerStyle(rowKey) {
      const h = this.header || {};
      const c = (h[rowKey] && h[rowKey].center) || {};
      const align = (c.align || 'center') === 'left' ? 'flex-start' : 'center';
      return { justifyContent: align };
    },
    tapPos(pos, rowKey) {
      const h = this.header || {};
      const row = (h[rowKey] || h.content || {});
      const link = (row[pos] && row[pos].link) || '';
      if (!link) return;
      uni.navigateTo({ url: link, fail: () => uni.showToast({ title: '页面不存在', icon: 'none' }) });
    },
  },
};
</script>

<style scoped>
.dn-nav {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  position: relative;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
}
.dn-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  width: 100%;
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
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34rpx;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 16rpx;
  min-width: 0;
}
.dn-title-text { font-size: 34rpx; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.dn-text { font-size: 28rpx; line-height: 1; white-space: nowrap; }
.dn-img { width: 64rpx; height: 56rpx; }
.dn-center-img { width: 200rpx; height: 52rpx; }
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
