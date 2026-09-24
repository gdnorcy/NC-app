<template>
  <view class="tpl-select-page">
    <!-- 导航 -->
    <view class="nav-bar">
      <view class="nav-back" @click="uni.navigateBack()">‹</view>
      <view class="nav-title">更换模板</view>
      <view class="nav-right"></view>
    </view>

    <view class="cur-tpl" v-if="card.templateId">
      <text class="cur-label">当前模板</text>
      <text class="cur-name">{{ currentName || '默认样式' }}</text>
    </view>
    <view class="cur-tpl" v-else>
      <text class="cur-label">当前模板</text>
      <text class="cur-name">默认样式</text>
    </view>

    <!-- 模板网格 -->
    <view class="tpl-grid">
      <view
        v-for="t in templates"
        :key="t.id"
        class="tpl-item"
        :class="{ active: applyingId === t.id || card.templateId === t.id }"
      >
        <view class="tpl-cover" :style="{ background: (t.themeConfig && t.themeConfig.primary) || '#165dff' }">
          <image v-if="t.cover" :src="t.cover" class="tpl-cover-img" mode="aspectFill" />
          <text v-else class="tpl-cover-text">{{ t.name.slice(0, 2) }}</text>
          <text class="tpl-layout" v-if="t.layout === 'full'">全屏大图</text>
          <text class="tpl-price-tag" :class="Number(t.price) > 0 ? 'paid' : 'free'">{{ Number(t.price) > 0 ? '¥' + Number(t.price) : '免费' }}</text>
          <view class="tpl-owned" v-if="t.purchased">已购</view>
          <view class="tpl-check" v-if="applyingId === t.id || (card.templateId === t.id && !applyingId)">✓</view>
        </view>
        <view class="tpl-name">{{ t.name }}</view>
        <view
          class="tpl-apply"
          :class="{ disabled: applyingId === t.id }"
          @click="applyTemplate(t)"
        >{{ applyingId === t.id ? '应用中…' : (card.templateId === t.id ? '使用中' : (Number(t.price) > 0 && !t.purchased ? `购买并应用 ¥${Number(t.price)}` : '应用此模板')) }}</view>
      </view>
    </view>
    <view class="empty" v-if="!templates.length">暂无可用模板</view>
    <view class="bind-hint">付费模板购买后永久解锁，可随时更换；免费模板可直接应用</view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { cardApi, paymentApi } from '../../utils/cardApi.js';

const cardId = ref(null);
const card = ref({});
const templates = ref([]);
const applyingId = ref(null);

const currentName = computed(() => {
  const t = templates.value.find((x) => x.id === Number(card.value.templateId));
  return t ? t.name : '';
});

async function loadCard() {
  try {
    const res = await cardApi.getCard(cardId.value);
    card.value = res.card || {};
  } catch (e) {
    uni.showToast({ title: e.message || '名片加载失败', icon: 'none' });
  }
}

async function loadTemplates() {
  try {
    const res = await cardApi.getTemplates();
    templates.value = res.templates || [];
  } catch (e) {
    uni.showToast({ title: e.message || '模板加载失败', icon: 'none' });
  }
}

async function buyThenApply(t) {
  uni.showModal({
    title: '购买模板',
    content: `「${t.name}」需付费 ¥${Number(t.price)}，购买后永久可用。是否购买？`,
    success: async (r) => {
      if (!r.confirm) return;
      uni.showLoading({ title: '创建订单...' });
      try {
        const res = await cardApi.buyTemplate(t.id);
        uni.hideLoading();
        uni.showModal({
          title: '确认支付',
          content: `确认支付 ¥${(res.amount / 100).toFixed(2)} 购买「${res.templateName}」？`,
          success: async (r2) => {
            if (!r2.confirm) return;
            uni.showLoading({ title: '支付中...' });
            try {
              await paymentApi.mockPay(res.orderNo);
              uni.hideLoading();
              uni.showToast({ title: '购买成功', icon: 'success' });
              await loadTemplates();
              applyTemplate(t);
            } catch (e) {
              uni.hideLoading();
              uni.showToast({ title: e.message || '支付失败', icon: 'none' });
            }
          },
        });
      } catch (e) {
        uni.hideLoading();
        uni.showToast({ title: e.message || '创建订单失败', icon: 'none' });
      }
    },
  });
}

async function applyTemplate(t) {
  // 用最新模板对象判断（购买刷新后 t 可能是旧引用）
  const cur = templates.value.find((x) => x.id === t.id) || t;
  if (applyingId.value) return;
  if (Number(cur.price) > 0 && !cur.purchased) return buyThenApply(cur);
  if (card.value.templateId === cur.id) return uni.showToast({ title: '正在使用该模板', icon: 'none' });
  applyingId.value = cur.id;
  try {
    await cardApi.updateCard(cardId.value, { templateId: cur.id });
    uni.showToast({ title: '模板已更换', icon: 'success' });
    await loadCard();
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e) {
    uni.showToast({ title: e.message || '应用失败', icon: 'none' });
  } finally {
    applyingId.value = null;
  }
}

onLoad((options) => {
  cardId.value = options.cardId;
  loadCard();
  loadTemplates();
});
</script>

<style scoped>
.tpl-select-page { min-height: 100vh; background: #f6f7fb; display: flex; flex-direction: column; padding-bottom: 40rpx; }
.nav-bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; padding: 20rpx 24rpx; background: #fff; }
.nav-back { font-size: 44rpx; color: #1d2129; width: 60rpx; }
.nav-title { flex: 1; text-align: center; font-size: 32rpx; font-weight: 600; color: #1d2129; }
.nav-right { width: 60rpx; }
.cur-tpl { margin: 20rpx 24rpx 0; padding: 20rpx 24rpx; background: #fff; border-radius: 16rpx; display: flex; align-items: center; gap: 16rpx; }
.cur-label { font-size: 26rpx; color: #86909c; }
.cur-name { font-size: 28rpx; font-weight: 600; color: #165dff; }
.tpl-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20rpx; padding: 24rpx; }
.tpl-item { background: #fff; border-radius: 16rpx; overflow: hidden; border: 2rpx solid transparent; }
.tpl-item.active { border-color: #165dff; }
.tpl-cover { position: relative; height: 200rpx; display: flex; align-items: center; justify-content: center; }
.tpl-cover-img { position: absolute; inset: 0; width: 100%; height: 100%; }
.tpl-cover-text { font-size: 40rpx; color: #fff; font-weight: 600; }
.tpl-layout { position: absolute; left: 8rpx; top: 8rpx; font-size: 18rpx; color: #fff; background: rgba(0,0,0,0.45); padding: 4rpx 10rpx; border-radius: 8rpx; }
.tpl-price-tag { position: absolute; left: 8rpx; bottom: 8rpx; font-size: 18rpx; padding: 4rpx 10rpx; border-radius: 8rpx; color: #fff; }
.tpl-price-tag.free { background: rgba(0,180,42,0.85); }
.tpl-price-tag.paid { background: rgba(255,125,0,0.92); }
.tpl-owned { position: absolute; right: 8rpx; bottom: 8rpx; font-size: 18rpx; color: #fff; background: rgba(22,93,255,0.85); padding: 4rpx 10rpx; border-radius: 8rpx; }
.tpl-check { position: absolute; top: 8rpx; right: 8rpx; width: 40rpx; height: 40rpx; border-radius: 50%; background: #165dff; color: #fff; font-size: 24rpx; display: flex; align-items: center; justify-content: center; }
.tpl-name { padding: 14rpx 16rpx 8rpx; font-size: 26rpx; color: #1d2129; text-align: center; white-space: normal; word-break: break-all; }
.tpl-apply { margin: 0 16rpx 16rpx; padding: 14rpx 0; text-align: center; border-radius: 12rpx; background: #165dff; color: #fff; font-size: 24rpx; }
.tpl-apply.disabled { opacity: 0.6; }
.empty { text-align: center; color: #86909c; font-size: 26rpx; padding: 60rpx 0; }
.bind-hint { text-align: center; color: #86909c; font-size: 22rpx; padding: 0 40rpx; }
</style>
