<template>
  <!-- 名片模板缩略图：有 cover 用真实封面图；无 cover 用代码渲染的迷你名片（按 themeConfig 版式+视觉） -->
  <view class="tt" :style="boxStyle">
    <image v-if="template.cover" :src="template.cover" class="tt-img" mode="aspectFill" />
    <view v-else class="tt-mini" :class="'tt-' + layout">
      <!-- 经典横排：头像左 + 信息右 -->
      <view v-if="layout === 'cls'" class="tt-cls">
        <view class="tt-avatar" :style="avatarStyle"></view>
        <view class="tt-lines">
          <view class="tt-bar" :style="barStyle"></view>
          <view class="tt-bar tt-bar-dim" :style="barDimStyle"></view>
        </view>
      </view>
      <!-- 居中展示：头像/名字居中 -->
      <view v-else-if="layout === 'ctr'" class="tt-ctr">
        <view class="tt-avatar tt-avatar-lg" :style="avatarStyle"></view>
        <view class="tt-bar tt-bar-w" :style="barStyle"></view>
        <view class="tt-bar tt-bar-dim tt-bar-w" :style="barDimStyle"></view>
      </view>
      <!-- 杂志大字：左对齐大字 + 细条 + 分隔线 -->
      <view v-else class="tt-mag">
        <view class="tt-bar tt-bar-mag" :style="barStyle"></view>
        <view class="tt-bar tt-bar-dim tt-bar-mid" :style="barDimStyle"></view>
        <view class="tt-rule" :style="ruleStyle"></view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue';
import { parseTheme, heroRadius, heroTextureBg } from '../utils/templateTheme.js';

// 16 进制色转 rgba（带透明度）
function hexA(color, alpha) {
  if (!color) return `rgba(22,93,255,${alpha})`;
  let c = String(color).trim();
  if (c.startsWith('#')) {
    c = c.slice(1);
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const n = parseInt(c, 16);
    if (!Number.isNaN(n) && c.length === 6) {
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
    }
  }
  // rgba()/rgb() 原样返回
  return color;
}

const props = defineProps({
  template: { type: Object, default: null },
});

const theme = computed(() => parseTheme(props.template?.themeConfig) || {});

const layout = computed(() => theme.value.heroLayout || 'cls');

// 容器：渐变/纯色 + 描边 + 纹理（纹理与渐变合并为多层 background）
const boxStyle = computed(() => {
  const t = theme.value;
  const s = {};
  const texture = heroTextureBg(t);
  if (t.bgType === 'solid') {
    s.background = texture ? `${texture}, ${t.bgStart}` : t.bgStart;
  } else {
    const grad = `linear-gradient(${t.bgAngle}deg, ${t.bgStart}, ${t.bgEnd})`;
    s.background = texture ? `${texture}, ${grad}` : grad;
  }
  if (t.border === 'gold') {
    s.border = '1px solid ' + (t.borderColor || '#c9a25e');
    s.boxShadow = '0 0 6rpx rgba(201,162,94,.35)';
  } else if (t.border === 'glow') {
    s.border = '1px solid ' + (t.borderColor || '#4d8dff');
    s.boxShadow = '0 0 8rpx rgba(77,141,255,.5)';
  }
  return s;
});

// 头像：accent 半透明底 + accent 描边，圆角按版式（mag 圆形）
const avatarStyle = computed(() => {
  const t = theme.value;
  return {
    background: hexA(t.accent, 0.32),
    border: '1px solid ' + hexA(t.accent, 0.75),
    borderRadius: t.heroLayout === 'mag' ? '50%' : heroRadius(t, true),
  };
});

// 名字条：直接用模板主文字色（深色模板=浅条、浅色模板=深条，自动适配）
const barStyle = computed(() => ({ background: theme.value.textColor }));

const barDimStyle = computed(() => ({ background: theme.value.textColor, opacity: 0.55 }));

const ruleStyle = computed(() => ({ background: theme.value.accent }));
</script>

<style scoped>
.tt { position: relative; width: 100%; height: 100%; overflow: hidden; }
.tt-img { position: absolute; inset: 0; width: 100%; height: 100%; }
.tt-mini { height: 100%; }

/* 经典横排 */
.tt-cls { display: flex; align-items: center; gap: 10rpx; padding: 0 14rpx; height: 100%; }
.tt-avatar { width: 30rpx; height: 30rpx; flex-shrink: 0; }
.tt-lines { flex: 1; display: flex; flex-direction: column; gap: 5rpx; min-width: 0; }

/* 居中展示 */
.tt-ctr { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5rpx; height: 100%; padding: 0 10rpx; }
.tt-avatar-lg { width: 38rpx; height: 38rpx; margin-bottom: 3rpx; }
.tt-bar-w { width: 72%; }

/* 杂志大字 */
.tt-mag { display: flex; flex-direction: column; justify-content: center; gap: 5rpx; height: 100%; padding: 0 14rpx; }
.tt-bar { height: 6rpx; border-radius: 3rpx; width: 82%; }
.tt-bar-mag { height: 9rpx; width: 76%; border-radius: 4rpx; }
.tt-bar-mid { width: 52%; }
.tt-bar-dim { opacity: .55; }
.tt-rule { height: 2rpx; width: 60%; margin-top: 3rpx; border-radius: 1rpx; }
</style>
