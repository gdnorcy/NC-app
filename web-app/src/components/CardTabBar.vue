<template>
  <view class="mp-tabbar">
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
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { cardApi } from '../utils/cardApi.js';
import SIcon from './SIcon.vue';

const props = defineProps({
  // 当前高亮tab: card / radar / market / member
  active: { type: String, default: '' },
});

const myCardId = ref(null);

onMounted(async () => {
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
</style>
