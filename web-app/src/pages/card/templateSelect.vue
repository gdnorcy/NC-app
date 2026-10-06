<template>
  <view class="tpl-select-page" :style="themeStyle">
    <!-- 导航 -->
<!-- PageNav -->
    <PageNav title="更换模板" back></PageNav>

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
        <view class="tpl-cover">
          <TplThumb :template="t" class="tpl-thumb" />
          <text class="tpl-layout" v-if="t.layout === 'full'">全屏大图</text>
          <text class="tpl-price-tag" :class="Number(t.price) > 0 ? 'paid' : 'free'">{{ Number(t.price) > 0 ? '¥' + Number(t.price) : '免费' }}</text>
          <view class="tpl-owned" v-if="t.purchased">已购</view>
          <view class="tpl-check" v-if="applyingId === t.id || (card.templateId === t.id && !applyingId)">✓</view>
        </view>
        <view class="tpl-name">{{ t.name }}</view>
        <view
          class="tpl-apply"
          :class="{ disabled: applyingId === t.id }"
          :style="applyBtnStyle(t)"
          @click="applyTemplate(t)"
        >{{ applyingId === t.id ? '应用中…' : (card.templateId === t.id ? '使用中' : (Number(t.price) > 0 && !t.purchased ? `购买并应用 ¥${Number(t.price)}` : '应用此模板')) }}</view>
      </view>
    </view>
    <view class="empty" v-if="!templates.length">暂无可用模板</view>
    <view class="bind-hint">付费模板购买后永久解锁，可随时更换；免费模板可直接应用</view>
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { cardApi, paymentApi } from '../../utils/cardApi.js';
import TplThumb from '../../components/TplThumb.vue';
import { useDesignTheme } from '../../utils/design.js';

// 系统主题（设计中心「系统风格」）。小程序端不能运行时注入 <style>，故必须由根视图
// 内联下发（CSS 变量向下继承）；之前本页完全没接 → 整页写死 #165dff，与主题脱节。
const themeStyle = useDesignTheme();
// 模板缩略图必须保持模板真实配色（那是用户要买的东西），但「应用此模板」按钮是平台 UI → 跟主题
const themeGradient = computed(() => {
  const s = themeStyle.value || {};
  const p = s['--design-primary'] || '#165dff';
  const g = s['--design-gradient'] || '';
  return g ? `linear-gradient(135deg, ${p}, ${g})` : p;
});
/**
 * 可点击态 → 主色渐变；使用中/应用中 → 空对象让CSS 的 --design-primary 生效（实心）。
 * ⚠️ 不能传 background:'' —— 那会把 CSS 声明整个清掉，按钮变透明（内联空值 ≠ 不覆盖）。
 */
function applyBtnStyle(t) {
  const inUse = applyingId.value === t.id || (card.value.templateId === t.id && !applyingId.value);
  return inUse ? {} : { background: themeGradient.value };
}

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
.cur-tpl { margin: 20rpx 24rpx 0; padding: 20rpx 24rpx; background: #fff; border-radius: 16rpx; display: flex; align-items: center; gap: 16rpx; }
.cur-label { font-size: 26rpx; color: #86909c; }
.cur-name { font-size: 28rpx; font-weight: 600; color: var(--design-primary, #165dff); }
.tpl-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20rpx; padding: 24rpx; }
.tpl-item { background: #fff; border-radius: 16rpx; overflow: hidden; border: 2rpx solid transparent; }
.tpl-item.active { border-color: var(--design-primary, #165dff); }
.tpl-cover { position: relative; height: 200rpx; }
.tpl-thumb { position: absolute; inset: 0; }
.tpl-layout { position: absolute; left: 8rpx; top: 8rpx; font-size: 18rpx; color: #fff; background: rgba(0,0,0,0.45); padding: 4rpx 10rpx; border-radius: 8rpx; }
.tpl-price-tag { position: absolute; left: 8rpx; bottom: 8rpx; font-size: 18rpx; padding: 4rpx 10rpx; border-radius: 8rpx; color: #fff; }
/* 价格/已购标签是语义色（免费=绿、付费=橙、已购=品牌蓝），刻意不跟主题 */
.tpl-price-tag.free { background: rgba(0,180,42,0.85); }
.tpl-price-tag.paid { background: rgba(255,125,0,0.92); }
.tpl-owned { position: absolute; right: 8rpx; bottom: 8rpx; font-size: 18rpx; color: #fff; background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.85); padding: 4rpx 10rpx; border-radius: 8rpx; }
.tpl-check { position: absolute; top: 8rpx; right: 8rpx; width: 40rpx; height: 40rpx; border-radius: 50%; background: var(--design-primary, #165dff); color: #fff; font-size: 24rpx; display: flex; align-items: center; justify-content: center; }
.tpl-name { padding: 14rpx 16rpx 8rpx; font-size: 26rpx; color: #1d2129; text-align: center; white-space: normal; word-break: break-all; }
/* 默认底色由内联 themeGradient 给（跟随系统主题）；使用中/应用中态回落到 --design-primary */
.tpl-apply { margin: 0 16rpx 16rpx; padding: 14rpx 0; text-align: center; border-radius: 12rpx; background: var(--design-primary, #165dff); color: #fff; font-size: 24rpx; }
.tpl-apply.disabled { opacity: 0.6; }
.empty { text-align: center; color: #86909c; font-size: 26rpx; padding: 60rpx 0; }
.bind-hint { text-align: center; color: #86909c; font-size: 22rpx; padding: 0 40rpx; }
</style>
