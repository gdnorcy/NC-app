<template>
  <!-- 名片模板缩略图：有 cover 用真实封面图；无 cover 用代码渲染的迷你名片。
       传入 card（真实名片）时渲染头像+姓名+公司（让用户在网格里看到"自己的卡"）；
       无 card 时回落灰色占位条（按 themeConfig 版式+视觉）。 -->
  <view class="tt" :style="boxStyle">
    <image v-if="template.cover" :src="template.cover" class="tt-img" mode="aspectFill" />
    <view v-else class="tt-mini" :class="'tt-' + layout">
      <!-- 经典横排：头像左 + 信息右 -->
      <view v-if="layout === 'cls'" class="tt-cls">
        <view class="tt-avatar" :style="avatarStyle">
          <image v-if="hasReal && realAvatar" :src="realAvatar" class="tt-ava-img" mode="aspectFill" />
          <text v-else-if="hasReal" class="tt-ava-txt" :style="{ color: theme.textColor }">{{ realInitial }}</text>
        </view>
        <view class="tt-lines">
          <template v-if="hasReal">
            <text class="tt-name" :style="{ color: theme.textColor }">{{ realName }}</text>
            <text class="tt-sub" :style="{ color: theme.textColor }">{{ realSub }}</text>
          </template>
          <template v-else>
            <view class="tt-bar" :style="barStyle"></view>
            <view class="tt-bar tt-bar-dim" :style="barDimStyle"></view>
          </template>
        </view>
      </view>
      <!-- 居中展示：头像/名字居中（royal/pano 形象照版无 cover 时的近似缩略图） -->
      <view v-else-if="layout === 'ctr' || photoLike" class="tt-ctr">
        <view class="tt-avatar tt-avatar-lg" :style="avatarStyle">
          <image v-if="hasReal && realAvatar" :src="realAvatar" class="tt-ava-img" mode="aspectFill" />
          <text v-else-if="hasReal" class="tt-ava-txt" :style="{ color: theme.textColor }">{{ realInitial }}</text>
        </view>
        <template v-if="hasReal">
          <text class="tt-name" :style="{ color: theme.textColor }">{{ realName }}</text>
          <text class="tt-sub" :style="{ color: theme.textColor }">{{ realSub }}</text>
        </template>
        <template v-else>
          <view class="tt-bar tt-bar-w" :style="barStyle"></view>
          <view class="tt-bar tt-bar-dim tt-bar-w" :style="barDimStyle"></view>
        </template>
      </view>
      <!-- 杂志大字：左对齐大字 + 细条 + 分隔线 -->
      <view v-else class="tt-mag">
        <template v-if="hasReal">
          <text class="tt-name tt-name-mag" :style="{ color: theme.textColor }">{{ realName }}</text>
          <view class="tt-rule" :style="ruleStyle"></view>
          <text class="tt-sub" :style="{ color: theme.textColor }">{{ realSub }}</text>
        </template>
        <template v-else>
          <view class="tt-bar tt-bar-mag" :style="barStyle"></view>
          <view class="tt-bar tt-bar-dim tt-bar-mid" :style="barDimStyle"></view>
          <view class="tt-rule" :style="ruleStyle"></view>
        </template>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue';
import { parseTheme, heroRadius, heroTextureBg } from '../utils/templateTheme.js';
// 🔴 #312-9：名片头像可能是 /uploads/ 相对路径（MP 端不补域名显示空白），统一补基址
import { absUrl } from '../utils/apiBase.js';

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
  card: { type: Object, default: null },
});

const theme = computed(() => parseTheme(props.template?.themeConfig) || {});

const layout = computed(() => theme.value.heroLayout || 'cls');

// 形象照版/曜石黑金（royal/pano1-6）：无 cover 时按居中迷你卡近似渲染
const photoLike = computed(() => ['royal', 'pano1', 'pano2', 'pano3', 'pano4', 'pano5', 'pano6'].includes(layout.value));

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

// ===== 真实名片数据（有 card 才渲染，让网格显示"用户自己的卡"）=====
const hasReal = computed(() => !!(props.card && props.card.name));
const realName = computed(() => props.card?.name || '');
// 🔴 #312-9：名片头像可能是 /uploads/ 相对路径（MP 端不补域名显示空白），统一补基址
const realAvatar = computed(() => absUrl(props.card?.avatar || ''));
const realInitial = computed(() => (props.card?.name || '名').trim().charAt(0) || '名');
const realCompany = computed(() => {
  const c = props.card;
  if (!c) return '';
  if (c.company) return c.company;
  if (Array.isArray(c.companies) && c.companies.length && c.companies[0] && c.companies[0].name) return c.companies[0].name;
  return '';
});
// 副标题：公司 · 职位（任一为空则只显示有值的）
const realSub = computed(() => {
  const c = props.card;
  if (!c) return '';
  return [realCompany.value, c.position || ''].filter(Boolean).join(' · ');
});
</script>

<style scoped>
.tt { position: relative; width: 100%; height: 100%; overflow: hidden; }
.tt-img { position: absolute; inset: 0; width: 100%; height: 100%; }
.tt-mini { height: 100%; }

/* 经典横排 */
.tt-cls { display: flex; align-items: center; gap: 10rpx; padding: 0 14rpx; height: 100%; }
.tt-avatar { width: 30rpx; height: 30rpx; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.tt-ava-img { width: 100%; height: 100%; }
.tt-ava-txt { font-size: 16rpx; font-weight: 500; }
.tt-lines { flex: 1; display: flex; flex-direction: column; gap: 4rpx; min-width: 0; }
.tt-name { font-size: 17rpx; font-weight: 500; line-height: 1.2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tt-sub { font-size: 13rpx; line-height: 1.2; opacity: 0.72; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

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
.tt-name-mag { font-size: 20rpx; }
</style>
