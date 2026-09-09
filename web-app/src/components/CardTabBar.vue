<template>
  <view class="mp-tabbar" :style="{ gridTemplateColumns: 'repeat(' + (designItems.length || 4) + ', 1fr)' }">
    <!-- 设计中心已发布底部导航方案：优先渲染配置项 -->
    <template v-if="designItems.length">
      <view v-for="(it, i) in designItems" :key="i" class="mtb" :class="{ on: isOn(it) }" @click="goDesign(it)">
        <image v-if="it.icon" :src="iconUrl(it.icon)" class="tab-icon-img" mode="aspectFit" />
        <SIcon v-else :name="fallbackTabIcon(it.text)" size="default" :color="isOn(it) ? primary : '#9a9a9a'" />
        <text :style="{ color: isOn(it) ? primary : '#9a9a9a' }">{{ it.text }}</text>
      </view>
    </template>
    <!-- 默认导航（未发布设计配置） -->
    <template v-else>
      <view class="mtb" :class="{ on: active === 'card' }" @click="goCard">
        <SIcon name="card" size="default" :color="active === 'card' ? '#07c160' : '#9a9a9a'" />
        <text>名片</text>
      </view>
      <view class="mtb" :class="{ on: active === 'radar' }" @click="goPage('/pages/card/visitors', 'radar')">
        <SIcon name="radar" size="default" :color="active === 'radar' ? '#07c160' : '#9a9a9a'" />
        <text>雷达</text>
      </view>
      <view class="mtb" :class="{ on: active === 'market' }" @click="goPage('/pages/card/market', 'market')">
        <SIcon name="market" size="default" :color="active === 'market' ? '#07c160' : '#9a9a9a'" />
        <text>集市</text>
      </view>
      <view class="mtb" :class="{ on: active === 'member' }" @click="goPage('/pages/card/member', 'member')">
        <SIcon name="crown" size="default" :color="active === 'member' ? '#07c160' : '#9a9a9a'" />
        <text>会员</text>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { cardApi, API_DOMAIN } from '../utils/cardApi.js';
import { readDesignConfig, fetchDesignConfig, fallbackTabIcon } from '../utils/design.js';
import SIcon from './SIcon.vue';

const props = defineProps({
  // 当前高亮tab: card / radar / market / member / home
  active: { type: String, default: '' },
});

const myCardId = ref(null);

// 设计中心配置：优先响应式本地值（挂载时拉取），回退 storage 缓存
const localCfg = ref(null);
const designConfig = computed(() => localCfg.value || readDesignConfig());
const designItems = computed(() => designConfig.value?.tabItems || []);
const primary = computed(() => designConfig.value?.style?.primaryColor || '#165DFF');

function iconUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:/.test(u)) return u;
  return u.startsWith('/') ? API_DOMAIN + u : API_DOMAIN + '/' + u;
}
function currentRoute() {
  const pages = getCurrentPages();
  const cur = pages[pages.length - 1];
  return cur ? '/' + (cur.route || '') : '';
}
function isOn(it) {
  const cur = currentRoute();
  if (!cur || !it.url) return false;
  return cur === it.url || cur.indexOf(it.url) === 0;
}
function goDesign(it) {
  if (isOn(it) || !it.url) return;
  uni.reLaunch({ url: it.url });
}

onMounted(async () => {
  // 拉取设计配置（缓存 5 分钟内不重复请求），就绪后刷新导航
  try {
    const cfg = await fetchDesignConfig(false);
    if (cfg) localCfg.value = cfg;
  } catch (e) { /* 拉取失败保持兜底 */ }
  try {
    const res = await cardApi.getCards();
    if (res.cards && res.cards.length) myCardId.value = res.cards[0].id;
  } catch (e) {}
});

function goCard() {
  if (props.active === 'card') return;
  // 优先回到最近查看的名片，避免多张名片时固定跳第一张
  const lastId = uni.getStorageSync('cardLastViewId');
  if (lastId) {
    uni.reLaunch({ url: `/pages/card/myCard?id=${lastId}` });
  } else if (myCardId.value) {
    uni.reLaunch({ url: `/pages/card/myCard?id=${myCardId.value}` });
  } else {
    uni.navigateTo({ url: '/pages/card/create' });
  }
}

function goPage(path, key) {
  if (props.active === key) return;
  uni.reLaunch({ url: path });
}
</script>

<style scoped>
.mp-tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 14rpx 0 calc(14rpx + env(safe-area-inset-bottom));
  border-top: 1px solid #f2f3f5;
  z-index: 50;
}
.mtb {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  font-size: 22rpx;
  color: #9a9a9a;
  background: none;
  border: none;
  padding: 0;
}
.mtb.on {
  color: #07c160;
  font-weight: 500;
}
.mtb.on text { color: inherit; }
.tab-icon-img { width: 44rpx; height: 44rpx; }
</style>
