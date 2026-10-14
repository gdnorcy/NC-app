<template>
  <!-- ===== 展示设置·轻量页（我的名片「名片内容」入口分流）
       两项真实功能：模板样式（复用 templateSelect 页）+ 公开状态（isPublic 即时保存）。
       之前该入口与「名片资料」同跳 create 向导，描述是空头支票——本页让它变成真话。 ===== -->
  <view class="ds-page" :style="themeStyle">
    <PageNav title="展示设置" back></PageNav>

    <!-- 加载失败 -->
    <view class="pg-error" v-if="loadFailed">
      <view class="pg-err-text">{{ loadFailedMsg }}</view>
      <view class="pg-btn" @click="reloadPage">重新加载</view>
    </view>

    <view class="ds-body" v-else>
      <!-- 模板样式 -->
      <view class="ds-card">
        <view class="ds-sec-title">模板样式</view>
        <view class="ds-row" @click="goTemplateSelect">
          <view class="dsr-icon"><SIcon name="card" size="default" :color="themeColor" /></view>
          <view class="dsr-main">
            <view class="dsr-name">当前模板</view>
            <view class="dsr-desc">{{ currentTemplateName }}</view>
          </view>
          <text class="dsr-arrow">›</text>
        </view>
        <view class="ds-hint">更换模板后名片详情页样式即时生效</view>
      </view>

      <!-- 公开状态 -->
      <view class="ds-card">
        <view class="ds-sec-title">公开状态</view>
        <view class="ds-switch-row">
          <view class="dsr-main">
            <view class="dsr-name">公开到人脉集市</view>
            <view class="dsr-desc">开启后你的名片可在集市页被所有人发现</view>
          </view>
          <switch :checked="isPublic" @change="onPublicChange" :color="themeColor" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import SIcon from '../../components/SIcon.vue';
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { loginEntryUrl, LOGIN_PATH } from '../../utils/loginEntry.js';
import { useDesignTheme } from '../../utils/design.js';
const themeStyle = useDesignTheme();
// 租户主题色（platform UI 跟随系统主题）；无主题时回落品牌蓝
const themeColor = computed(() => (themeStyle.value && themeStyle.value['--design-primary']) || '#165dff');

const cardId = ref(null);
const isPublic = ref(true);
const currentTemplateName = ref('加载中…');
const loadFailed = ref(false);
const loadFailedMsg = ref('加载失败，请检查网络后重试');

// 无显式 id 时按本人名片兜底（与 myCard 同款，绝不能用 cardLastViewId——可能是他人名片）
async function resolveCardId() {
  const pages = getCurrentPages();
  const opts = (pages[pages.length - 1] || {}).options || {};
  if (opts.id) return opts.id;
  try {
    const safe = await cardApi.getCardsSafe();
    return (safe.cards && safe.cards[0] && safe.cards[0].id) || null;
  } catch (e) { return null; }
}

async function load() {
  const id = await resolveCardId();
  if (!id) {
    loadFailed.value = true;
    loadFailedMsg.value = '未找到你的名片，请先创建名片';
    return;
  }
  cardId.value = id;
  try {
    const [cardRes, tplRes] = await Promise.allSettled([cardApi.getCard(id), cardApi.getTemplates()]);
    if (cardRes.status !== 'fulfilled') throw cardRes.reason;
    const card = cardRes.value.card;
    isPublic.value = !!card.isPublic;
    const tpls = tplRes.status === 'fulfilled' ? (tplRes.value.templates || []) : [];
    const cur = tpls.find((t) => t.id === Number(card.templateId));
    currentTemplateName.value = cur ? cur.name : (card.templateId ? '自定义模板' : '默认模板');
    loadFailed.value = false;
  } catch (e) {
    loadFailed.value = true;
    loadFailedMsg.value = '名片加载失败，请检查网络后重试';
  }
}

// onShow 驱动：从 templateSelect 返回后自动刷新当前模板名
onShow(() => {
  const pages = getCurrentPages();
  const opts = (pages[pages.length - 1] || {}).options || {};
  const me = uni.getStorageSync('card_user') || {};
  if (!me.id && !uni.getStorageSync('card_token')) {
    uni.redirectTo({ url: loginEntryUrl(LOGIN_PATH, '/pages/card/displaySettings' + (opts.id ? `?id=${opts.id}` : '')) });
    return;
  }
  load();
});

function goTemplateSelect() {
  if (!cardId.value) return;
  uni.navigateTo({ url: `/pages/card/templateSelect?cardId=${cardId.value}` });
}

// 公开状态即时保存（PUT /cards/:id 支持部分字段更新，未传字段不受影响）
async function onPublicChange(e) {
  const val = e.detail.value;
  isPublic.value = val; // 乐观更新，失败回滚
  if (!cardId.value) return;
  try {
    await cardApi.updateCard(cardId.value, { isPublic: val });
    uni.showToast({ title: val ? '已公开到集市' : '已关闭公开', icon: 'none' });
  } catch (err) {
    isPublic.value = !val;
    uni.showToast({ title: '保存失败，请重试', icon: 'none' });
  }
}

function reloadPage() { load(); }
</script>

<style scoped>
.ds-page { min-height: 100vh; background: var(--bg-page); }
.ds-body { padding: 20rpx 24rpx 60rpx; }
.ds-card {
  background: #fff; border-radius: 20rpx; padding: 24rpx 28rpx; margin-bottom: 20rpx;
  box-shadow: 0 4px 14px rgba(20,40,70,.08);
}
.ds-sec-title { font-size: 28rpx; font-weight: 600; color: var(--t5); padding: 8rpx 0 16rpx; }
.ds-row { display: flex; align-items: center; gap: 16rpx; padding: 16rpx 0; }
.dsr-icon { width: 72rpx; height: 72rpx; border-radius: 16rpx; background: rgba(var(--design-primary-rgb, 22, 93, 255), .06); display: flex; align-items: center; justify-content: center; }
.dsr-main { flex: 1; min-width: 0; }
.dsr-name { font-size: 28rpx; color: var(--t5); }
.dsr-desc { font-size: 22rpx; color: var(--t4); margin-top: 4rpx; }
.dsr-arrow { font-size: 32rpx; color: var(--border-strong); }
.ds-hint { font-size: 22rpx; color: var(--t4); padding: 8rpx 0 4rpx; }
.ds-switch-row { display: flex; align-items: center; gap: 16rpx; padding: 8rpx 0 16rpx; }
.pg-error { padding: 200rpx 60rpx; text-align: center; }
.pg-err-text { font-size: 26rpx; color: var(--t3); }
.pg-btn {
  margin: 24rpx auto 0; display: inline-block; padding: 16rpx 56rpx; border-radius: 40rpx;
  background: var(--design-primary, #165dff); color: #fff; font-size: 28rpx;
}
</style>
