<template>
  <view class="msg-page" :style="[themeStyle, brandVars]">
    <!-- 导航栏 -->
<!-- PageNav -->
    <PageNav title="消息中心" back></PageNav>

    <!-- 类型页签 -->
    <view class="msg-tabs">
      <view class="mt-item" :class="{ on: tab === '' }" @click="switchTab('')">
        全部<Badge v-if="unreadTotal" :count="unreadTotal" :max="99" />
      </view>
      <view class="mt-item" :class="{ on: tab === 'exchange' }" @click="switchTab('exchange')">交换</view>
      <view class="mt-item" :class="{ on: tab === 'visitor' }" @click="switchTab('visitor')">访客</view>
      <view class="mt-item" :class="{ on: tab === 'system' }" @click="switchTab('system')">系统</view>
      <view class="mt-item" :class="{ on: tab === 'radar' }" @click="switchTab('radar')">雷达<Badge v-if="radarUnread" :count="radarUnread" :max="99" /></view>
    </view>

    <!-- 列表 -->
    <view class="msg-list" v-if="messages.length">
      <view class="msg-item" v-for="m in messages" :key="m.id" @click="open(m)">
        <view class="m-ic" :class="m.type">
          <SIcon :name="iconOf(m.type)" size="default" color="#ffffff" />
        </view>
        <view class="m-body">
          <view class="m-row">
            <view class="m-title">{{ m.title }}</view>
            <view class="m-time">{{ timeText(m.created_at) }}</view>
          </view>
          <view class="m-content">{{ m.content }}</view>
        </view>
        <view class="m-dot" v-if="!m.is_read"></view>
      </view>
    </view>
    <view class="msg-empty" v-else>
      <view class="me-icon"><SIcon name="dynamic" size="xlarge" :color="ICON_DECOR" /></view>
      <view class="me-text">暂无消息</view>
      <view class="me-hint">交换申请、访客动态等通知会显示在这里</view>
    </view>

    <!-- 🔴 登录浮层：消息接口走 comboAuth（无 token 直接 401），未登录会落到
         「暂无消息」假空态。登录成功后原地重入取数。 -->
    <LoginGateModal :show="showLoginGate" @close="cancelLogin" @success="onLoginGateSuccess" />
  </view>
</template>

<script setup>
import { ICON_DECOR } from '../../utils/iconColor.js';
import PageNav from '../../components/PageNav.vue';
import { ref, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { trackPageView } from '../../utils/analytics.js';
import SIcon from '../../components/SIcon.vue';
import Badge from '../../components/Badge.vue';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';
// 🔴 页面级登录守卫（深链兜底）：消息接口要 token，未登录弹原地登录浮层，
//   登录成功后自动重跑 load（守卫与浮层收编到共享实现，禁各页再抄一份）。
import LoginGateModal from '../../components/LoginGateModal.vue';
import { usePageGuard } from '../../utils/pageGuard.js';

const themeStyle = useDesignTheme();
const { brandVars, brandPrimary } = useBrandOverride();

const messages = ref([]);
const unreadTotal = ref(0);
const radarUnread = ref(0);
const tab = ref('');

onShow(() => { trackPageView('/pages/card/messages'); });

onMounted(async () => {
  await guardPage();
});

// 🔴 页面级登录守卫：登录成功后自动重跑 load
const { showLoginGate, cancelLogin, onLoginGateSuccess, guardPage } = usePageGuard(load);

async function load() {
  if (tab.value === 'radar') {
    // 阶段C：运营型雷达站内提醒（card_radar_notify，独立于市场消息）
    try {
      const res = await cardApi.getRadarNotifies(50);
      messages.value = (res.notifies || []).map((n) => ({
        id: n.id,
        type: 'visitor',
        title: n.title || '访客动态',
        content: (n.visitorName || '有访客') + ' · ' + (n.eventName || '') + (n.channel === 0 ? '' : ' · 订阅推送'),
        created_at: n.createdAt,
        is_read: n.readAt ? 1 : 0,
        radar: true,
      }));
      radarUnread.value = messages.value.filter((m) => !m.is_read).length;
      unreadTotal.value = 0;
    } catch (e) {}
    return;
  }
  try {
    const [listRes, unreadRes] = await Promise.all([
      cardApi.getMessages(tab.value),
      cardApi.getMessageUnread(),
    ]);
    messages.value = listRes.messages || [];
    unreadTotal.value = unreadRes.count || 0;
  } catch (e) {}
}

function switchTab(t) {
  tab.value = t;
  load();
}

function open(m) {
  if (!m.is_read) {
    m.is_read = 1;
    if (m.radar) {
      cardApi.readRadarNotify(m.id).catch(() => {});
      if (radarUnread.value > 0) radarUnread.value -= 1;
    } else {
      cardApi.markMessagesRead([m.id]).catch(() => {});
      if (unreadTotal.value > 0) unreadTotal.value -= 1;
    }
  }
  if (m.link) {
    uni.navigateTo({ url: m.link });
  }
}

function readAll() {
  if (tab.value === 'radar') {
    const radarIds = messages.value.filter((m) => !m.is_read).map((m) => m.id);
    if (!radarIds.length) return;
    Promise.all(radarIds.map((id) => cardApi.readRadarNotify(id))).then(() => {
      messages.value.forEach((m) => (m.is_read = 1));
      radarUnread.value = 0;
    }).catch(() => {});
    return;
  }
  cardApi.markMessagesRead([]).then(() => {
    messages.value.forEach((m) => (m.is_read = 1));
    unreadTotal.value = 0;
  }).catch(() => {});
}

function iconOf(type) {
  if (type === 'exchange') return 'exchange';
  if (type === 'visitor') return 'radar';
  return 'dynamic';
}

function timeText(t) {
  if (!t) return '';
  const diff = (Date.now() - new Date(t.replace(' ', 'T')).getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}天前`;
  return String(t).slice(0, 10);
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.redirectTo({ url: '/pages/card/myCard?id=' + (uni.getStorageSync('card_my_id') || '') });
}
</script>

<style scoped>
.msg-page {
  min-height: 100vh;
  background: var(--bg-page);
  padding-bottom: 60rpx;
  box-sizing: border-box;
}
/* 消息分类 Tab（sticky 顶栏：top 需让开 PageNav 高度，此处紧贴其下） */
.msg-tabs {
  display: flex;
  gap: 8rpx;
  padding: 16rpx 32rpx;
  background: var(--white);
  position: sticky;
  top: 0;
  z-index: var(--z-content);
}
.mt-item {
  flex: 1;
  text-align: center;
  font-size: var(--fs-5);
  color: var(--t2);
  padding: 14rpx 0;
  border-radius: var(--radius-xs);
  position: relative;
}
.mt-item.on { background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08); color: var(--design-primary, #165dff); font-weight: 600; }
.mt-dot {
  display: inline-block;
  min-width: 28rpx;
  height: 28rpx;
  line-height: 28rpx;
  border-radius: 14rpx;
  background: var(--danger);
  color: var(--white);
  font-size: var(--fs-1);
  padding: 0 6rpx;
  margin-left: 6rpx;
  box-sizing: border-box;
}

.msg-list { padding: 16rpx 24rpx; }
.msg-item {
  display: flex;
  gap: 20rpx;
  background: var(--white);
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  position: relative;
}
.m-ic {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.m-ic.exchange { background: linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff)); }
.m-ic.visitor { background: linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff)); }
.m-ic.system { background: linear-gradient(135deg, #8c8c8c, #6b6b6b); }
.m-body { flex: 1; min-width: 0; }
.m-row { display: flex; align-items: center; justify-content: space-between; }
.m-title { font-size: var(--fs-5); font-weight: 600; color: var(--t5); }
.m-time { font-size: var(--fs-2); color: var(--t4); }
.m-content {
  font-size: 25rpx;
  color: var(--t2);
  margin-top: 8rpx;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.m-dot {
  position: absolute;
  top: 24rpx;
  right: 20rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--danger);
}
.msg-empty {
  padding: 160rpx 40rpx;
  text-align: center;
}
.me-icon { width: 120rpx; height: 120rpx; margin: 0 auto 24rpx; }
.me-text { font-size: 30rpx; color: var(--t5); font-weight: 500; }
.me-hint { font-size: var(--fs-3); color: var(--t4); margin-top: 12rpx; }
</style>
