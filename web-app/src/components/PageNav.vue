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

      <!-- 中间：标题（绝对定位覆盖整行 → 按屏宽居中，不是按剩余空间居中；
           左右对称安全区由 navTitleSafePad 下发，避免压到返回键/胶囊） -->
      <view class="pnv-title-wrap" :style="titlePadStyle">
        <text v-if="title" class="pnv-title" :style="{ color: color, fontSize: fontSize }">{{ title }}</text>
        <slot name="title"></slot>
      </view>

      <!-- 右侧：页面级操作（购物车/刷新/…）；胶囊避让见 rightStyle（仅在有右插槽时才占位） -->
      <view class="pnv-side pnv-right" :style="rightStyle">
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
import { navRootStyle, navBarRowStyle, getNavMetrics, navTitleSafePad, goBack as navGoBack } from '../utils/navMetrics.js';

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
    /**
     * 标题左右**对称**安全区：自带防御——只让出一侧就会重演「标题偏向返回键」。
     * 居中本身由 CSS 绝对定位覆盖整行保证（按屏宽居中，与微信原生口径一致）。
     */
    titlePadStyle() {
      const pad = navTitleSafePad();
      return { padding: '0 ' + pad + 'px' };
    },
    /**
     * 右侧胶囊避让：微信「最小化 + 三个点」是原生控件、不可覆盖，
     * 右插槽若不额外让出胶囊宽度就会被压住（myCard「编辑」、集市页两个图标都被挡过）。
     * 只在**确实有右插槽内容**时占位，否则空插槽的 margin 也会把标题挤偏。
     */
    rightStyle() {
      if (!this.$slots.right) return {};
      const m = getNavMetrics();
      return m.isMp ? { marginRight: m.capsuleWidth + 'px' } : {};
    },
  },
  methods: {
    onBack() {
      // Vue3：$listeners 已移除，原生事件监听落在 $attrs.onBack（故 back 不再声明于 emits，否则会被剔除）
      if (this.$attrs.onBack) {
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
  position: relative; /* 标题绝对定位的包含块（abs 参照 padding box → 覆盖整行含左右 padding） */
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
.pnv-back-ico { font-size: var(--fs-8); line-height: 1; }
.pnv-hover { opacity: 0.6; }

.pnv-title-wrap {
  /* 绝对定位覆盖整行：居中的基准是「行宽=屏宽」，而不是「左右操作之间的剩余宽度」
     —— 后者两侧不等宽（返回键≈26px vs 胶囊区≈94px），标题必然偏。
     左右对称 padding 兜住重叠；pointer-events:none 让点击穿透给左右侧按钮。 */
  position: absolute;
  left: 0; right: 0; top: 0; bottom: 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  pointer-events: none;
}
/* 标题自身（含 #title 插槽内容）恢复可点击 */
.pnv-title-wrap > * { pointer-events: auto; }
.pnv-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.pnv-extra { width: 100%; }
</style>
