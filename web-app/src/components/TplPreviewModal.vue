<template>
  <!-- 模板全屏预览：用候选模板的主题色 + 当前名片真实数据渲染，
       让用户"先看后换"，不再盲换。点网格封面打开，底部确认应用。 -->
  <view class="tpl-pv-mask" v-if="template" @click.self="$emit('close')">
    <view class="tpl-pv">
      <view class="pv-hero" :style="heroStyle" :class="'pv-' + family">
        <view class="pv-ava" :style="avaStyle">
          <!-- 🔴 #312-9：card.avatar 可能是 /uploads/ 相对路径，MP 端不补域名就是空白 -->
          <image v-if="card.avatar" :src="absUrl(card.avatar)" class="pv-ava-img" mode="aspectFill" />
          <text v-else class="pv-ava-txt" :style="{ color: textColor }">{{ (card.name || '名').trim().charAt(0) || '名' }}</text>
        </view>
        <view class="pv-info">
          <view class="pv-name" :style="{ color: textColor }">{{ card.name || '您的姓名' }}</view>
          <view class="pv-pos" :style="{ color: textColor }">{{ card.position || '—' }}</view>
          <view class="pv-co" :style="{ color: textColor }" v-if="coLine">
            <SIcon name="building" size="small" :color="textColor" />
            <text>{{ coLine }}</text>
          </view>
          <view class="pv-city" :style="{ color: textColor }">{{ cityLine }}</view>
        </view>
      </view>
      <view class="pv-foot">
        <view class="pv-tplname">{{ template.name }}</view>
        <view class="pv-actions">
          <view class="pv-btn pv-cancel" @click="$emit('close')">再看看</view>
          <view class="pv-btn pv-apply" @click="$emit('apply')">应用此模板</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue';
import SIcon from './SIcon.vue';
import { parseTheme, heroRadius, heroTextureBg } from '../utils/templateTheme.js';
// 🔴 #312-9：名片头像可能是 /uploads/ 相对路径（MP 端不补域名显示空白），统一补基址
import { absUrl } from '../utils/apiBase.js';

const props = defineProps({
  template: { type: Object, default: null },
  card: { type: Object, default: () => ({}) },
});
defineEmits(['apply', 'close']);

const theme = computed(() => parseTheme(props.template?.themeConfig) || {});
const layout = computed(() => theme.value.heroLayout || 'cls');
// 预览按三大家族近似：cls 横排 / mag 杂志大字 / 其余(ctr/royal/pano*) 居中
const family = computed(() => (layout.value === 'cls' ? 'cls' : (layout.value === 'mag' ? 'mag' : 'ctr')));
const textColor = computed(() => theme.value.textColor || '#ffffff');

const heroStyle = computed(() => {
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
    s.border = '2rpx solid ' + (t.borderColor || '#c9a25e');
  } else if (t.border === 'glow') {
    s.border = '2rpx solid ' + (t.borderColor || '#4d8dff');
  }
  return s;
});

const avaStyle = computed(() => {
  const t = theme.value;
  return {
    background: t.accent ? `${t.accent}55` : 'rgba(255,255,255,0.2)',
    border: '2rpx solid ' + (t.accent || 'rgba(255,255,255,0.5)'),
    borderRadius: layout.value === 'mag' ? '50%' : heroRadius(t, false),
  };
});

const coLine = computed(() => {
  const c = props.card;
  if (!c) return '';
  if (c.company) return c.company;
  if (Array.isArray(c.companies) && c.companies.length && c.companies[0] && c.companies[0].name) return c.companies[0].name;
  return '';
});
const cityLine = computed(() => {
  const c = props.card;
  const city = (c && c.city) || '';
  const biz = (c && (c.slogan || c.businessField)) || '';
  return [city, biz].filter(Boolean).join(' · ') || '';
});
</script>

<style scoped>
.tpl-pv-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 999; display: flex; align-items: center; justify-content: center; padding: 40rpx; }
.tpl-pv { width: 100%; max-width: 560rpx; background: var(--white); border-radius: 28rpx; overflow: hidden; }
.pv-hero { padding: 60rpx 44rpx; min-height: 420rpx; }
.pv-hero.pv-cls { display: flex; align-items: center; gap: 28rpx; }
.pv-hero.pv-ctr { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18rpx; text-align: center; }
.pv-hero.pv-mag { display: flex; flex-direction: column; justify-content: center; gap: 16rpx; }
.pv-ava { width: 132rpx; height: 132rpx; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.pv-ava-img { width: 100%; height: 100%; }
.pv-ava-txt { font-size: 56rpx; font-weight: 500; }
.pv-info { display: flex; flex-direction: column; gap: 10rpx; min-width: 0; }
.pv-hero.pv-ctr .pv-info { align-items: center; }
.pv-name { font-size: 40rpx; font-weight: 500; }
.pv-hero.pv-mag .pv-name { font-size: 52rpx; letter-spacing: 2rpx; }
.pv-pos { font-size: var(--fs-4); opacity: 0.9; }
.pv-co { font-size: var(--fs-3); opacity: 0.82; display: flex; align-items: center; gap: 8rpx; }
.pv-city { font-size: var(--fs-2); opacity: 0.7; }
.pv-foot { padding: 28rpx 32rpx 36rpx; background: var(--white); }
.pv-tplname { font-size: 30rpx; font-weight: 500; color: var(--t1); margin-bottom: 24rpx; }
.pv-actions { display: flex; gap: 20rpx; }
.pv-btn { flex: 1; height: 88rpx; border-radius: 44rpx; display: flex; align-items: center; justify-content: center; font-size: var(--fs-5); }
.pv-cancel { background: var(--bg-hover); color: var(--t1); }
.pv-apply { background: var(--design-primary, #165dff); color: var(--white); font-weight: 500; }
</style>
