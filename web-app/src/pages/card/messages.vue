<template>
  <view class="msg-page">
    <!-- 导航栏 -->
    <view class="msg-nav">
      <view class="mn-back" @click="goBack"><SIcon name="dynamic" size="default" color="#1a1a1a" /></view>
      <view class="mn-title">消息中心</view>
      <view class="mn-clear" @click="readAll" v-if="messages.length">全部已读</view>
    </view>

    <!-- 类型页签 -->
    <view class="msg-tabs">
      <view class="mt-item" :class="{ on: tab === '' }" @click="switchTab('')">
        全部<text v-if="unreadTotal" class="mt-dot">{{ unreadTotal }}</text>
      </view>
      <view class="mt-item" :class="{ on: tab === 'exchange' }" @click="switchTab('exchange')">交换</view>
      <view class="mt-item" :class="{ on: tab === 'visitor' }" @click="switchTab('visitor')">访客</view>
      <view class="mt-item" :class="{ on: tab === 'system' }" @click="switchTab('system')">系统</view>
      <view class="mt-item" :class="{ on: tab === 'radar' }" @click="switchTab('radar')">雷达<text v-if="radarUnread" class="mt-dot">{{ radarUnread }}</text></view>
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
      <view class="me-icon"><SIcon name="dynamic" size="xlarge" color="#c9cdd4" /></view>
      <view class="me-text">暂无消息</view>
      <view class="me-hint">交换申请、访客动态等通知会显示在这里</view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { trackPageView } from '../../utils/analytics.js';
import SIcon from '../../components/SIcon.vue';

const messages = ref([]);
const unreadTotal = ref(0);
const radarUnread = ref(0);
const tab = ref('');

onShow(() => { trackPageView('/pages/card/messages'); });

onMounted(async () => {
  await load();
});

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
.msg-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 32rpx 16rpx;
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 5;
}
.mn-back {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
}
.mn-title { font-size: 34rpx; font-weight: 600; color: var(--t5); }
.mn-clear { font-size: 26rpx; color: var(--success); }

.msg-tabs {
  display: flex;
  gap: 8rpx;
  padding: 16rpx 32rpx;
  background: #fff;
}
.mt-item {
  flex: 1;
  text-align: center;
  font-size: 28rpx;
  color: var(--t2);
  padding: 14rpx 0;
  border-radius: 12rpx;
  position: relative;
}
.mt-item.on { background: rgba(7, 193, 96, 0.08); color: var(--success); font-weight: 600; }
.mt-dot {
  display: inline-block;
  min-width: 28rpx;
  height: 28rpx;
  line-height: 28rpx;
  border-radius: 14rpx;
  background: var(--danger);
  color: #fff;
  font-size: 20rpx;
  padding: 0 6rpx;
  margin-left: 6rpx;
  box-sizing: border-box;
}

.msg-list { padding: 16rpx 24rpx; }
.msg-item {
  display: flex;
  gap: 20rpx;
  background: #fff;
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
.m-ic.exchange { background: linear-gradient(135deg, var(--success), #05a050); }
.m-ic.visitor { background: linear-gradient(135deg, var(--primary-deep), #2e6bb8); }
.m-ic.system { background: linear-gradient(135deg, #8c8c8c, #6b6b6b); }
.m-body { flex: 1; min-width: 0; }
.m-row { display: flex; align-items: center; justify-content: space-between; }
.m-title { font-size: 28rpx; font-weight: 600; color: var(--t5); }
.m-time { font-size: 22rpx; color: var(--t4); }
.m-content {
  font-size: 25rpx;
  color: #5b5b5b;
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
.me-hint { font-size: 24rpx; color: var(--t4); margin-top: 12rpx; }
</style>
