<template>
  <view
    class="pnv"
    :class="{ 'pnv-sticky': sticky && !overlay, 'pnv-fixed': fixed, 'pnv-overlay': overlay }"
    :style="rootStyle"
  >
    <!-- 标题栏：高度按胶囊算，左右按胶囊宽度对称留白（标题视觉居中且不被胶囊压） -->
    <view class="pnv-bar" :style="barStyle">
      <!-- 左侧：返回 / 自定义 -->
      <view class="pnv-side pnv-left">
        <slot name="left">
          <view v-if="back" class="pnv-back" hover-class="pnv-hover" :hover-stay-time="80" @click="onBack">
            <text class="pnv-back-ico" :style="{ color: color }">‹</text>
          </view>
        </slot>
      </view>

      <!-- 中间：标题（超长省略） -->
      <view class="pnv-title-wrap">
        <text v-if="title" class="pnv-title" :style="{ color: color, fontSize: fontSize }">{{ title }}</text>
        <slot name="title"></slot>
      </view>

      <!-- 右侧：页面级操作（购物车/刷新/…）；padRight 已含胶囊避让 -->
      <view class="pnv-side pnv-right">
        <slot name="right"></slot>
      </view>
    </view>

    <!-- 二级行：搜索框 / Tab / 副标题等（可选，占位不参与胶囊避让） -->
    <view v-if="$slots.extra" class="pnv-extra">
      <slot name="extra"></slot>
    </view>
  </view>
</template>

<script>
import { navRootStyle, navBarRowStyle, goBack as navGoBack } from '../utils/navMetrics.js';

/**
 * 全站统一导航条（沉浸式）
 *
 * 解决两个根因问题：
 *   1. navigationStyle:'custom' 下原生标题不显示 → 标题由 title 显式渲染（对齐 pages.json 的 navigationBarTitleText）
 *   2. 自绘头部与右上角胶囊（最小化 + 三个点）重叠 → 状态栏占位 + 胶囊宽度对称避让
 *
 * 用法：
 *   <PageNav title="商品详情" back @back="onBack">
 *     <template #right> ... </template>
 *   </PageNav>
 */
export default {
  name: 'PageNav',
  props: {
    // 标题（对应 pages.json 的 navigationBarTitleText）
    title: { type: String, default: '' },
    // 是否显示返回按钮
    back: { type: Boolean, default: true },
    // 背景色 / 前景色
    bg: { type: String, default: '#ffffff' },
    color: { type: String, default: '#1d2129' },
    fontSize: { type: String, default: '32rpx' },
    // 定位方式：sticky（跟随滚动，默认）/ fixed（悬浮）
    sticky: { type: Boolean, default: true },
    fixed: { type: Boolean, default: false },
    /**
     * 浮层模式：absolute 覆盖在页面内容之上，不占文档流。
     * 用于「沉浸式」页面——内容需要顶到屏幕最上方（如全屏地图/渐变 hero），
     * 但状态栏占位与胶囊避让仍要生效。此时通常配 bg="transparent" + 白字。
     */
    overlay: { type: Boolean, default: false },
    // 无历史栈时的兜底页
    fallback: { type: String, default: '/pages/cardMain/home' },
  },
  emits: ['back'],
  computed: {
    rootStyle() {
      const s = navRootStyle({ bg: this.bg, color: this.color });
      // 浮层模式下背景透明，交给下层内容（渐变/图片）显示
      if (this.overlay) s.background = 'transparent';
      return s;
    },
    barStyle() {
      return navBarRowStyle();
    },
  },
  methods: {
    onBack() {
      // 有监听则交给页面自己处理（部分页面返回后需要刷新列表）
      if (this.$listeners.back) {
        this.$emit('back');
        return;
      }
      navGoBack(this.fallback);
    },
  },
};
</script>

<style scoped>
.pnv {
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
  z-index: 30;
}
.pnv-sticky { position: sticky; top: 0; }
.pnv-fixed { position: fixed; top: 0; left: 0; right: 0; }
/* 浮层：不占文档流，压在内容之上（沉浸式页面） */
.pnv-overlay { position: absolute; top: 0; left: 0; right: 0; }

.pnv-bar {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.pnv-side {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  min-width: 0;
}
.pnv-right { justify-content: flex-end; }
.pnv-left { justify-content: flex-start; }

.pnv-back {
  /* 命中区域 7mm~9mm（官方 3.3 避免误操作），视觉仍为小箭头 */
  width: 64rpx;
  height: 64rpx;
  margin-left: -12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pnv-back-ico { font-size: 44rpx; line-height: 1; }
.pnv-hover { opacity: 0.6; }

.pnv-title-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8rpx;
  overflow: hidden;
}
.pnv-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.pnv-extra { width: 100%; }
</style>
