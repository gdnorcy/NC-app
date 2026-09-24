<template>
  <view class="col-page">
    <view class="msg-nav">
      <view class="mn-back" @click="goBack"><SIcon name="dynamic" size="default" color="#1a1a1a" /></view>
      <view class="mn-title">我的收藏</view>
      <view class="mn-clear" @click="load" v-if="collects.length">刷新</view>
    </view>

    <view class="col-list" v-if="collects.length">
      <view class="col-item" v-for="c in collects" :key="c.cardId" @click="openCard(c)">
        <view class="c-av">
          <image v-if="c.avatar" :src="c.avatar" class="c-av-img" mode="aspectFill" />
          <view v-else class="c-av-txt">{{ c.name[0] || '名' }}</view>
        </view>
        <view class="c-info">
          <view class="c-name">{{ c.name || '未命名名片' }}</view>
          <view class="c-sub">{{ [c.position, c.company].filter(Boolean).join(' · ') || '—' }}</view>
          <view class="c-time">收藏于 {{ timeText(c.createdAt) }}</view>
        </view>
        <view class="c-act" @click.stop="remove(c)">
          <SIcon name="star" size="small" color="#ffd21e" />
          <text>已收藏</text>
        </view>
      </view>
    </view>
    <view class="msg-empty" v-else>
      <view class="me-icon"><SIcon name="star" size="xlarge" color="#c9cdd4" /></view>
      <view class="me-text">暂无收藏</view>
      <view class="me-hint">浏览名片时点击"收藏"，会出现在这里</view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';

const collects = ref([]);

onMounted(() => { load(); });

async function load() {
  try {
    const res = await cardApi.getMyCollects(200);
    collects.value = res.collects || [];
  } catch (e) {}
}

async function remove(c) {
  try {
    await cardApi.uncollectCard(c.cardId);
    collects.value = collects.value.filter((x) => x.cardId !== c.cardId);
    uni.showToast({ title: '已取消收藏', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: e.message || '操作失败', icon: 'none' });
  }
}

function openCard(c) {
  uni.navigateTo({ url: `/pages/card/cardDetail?id=${c.cardId}` });
}

function timeText(t) {
  if (!t) return '';
  const diff = (Date.now() - new Date(String(t).replace(' ', 'T')).getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}天前`;
  return String(t).slice(0, 10);
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.redirectTo({ url: '/pages/card/myCard' });
}
</script>

<style scoped>
.col-page { min-height: 100vh; background: #f5f6f7; padding-bottom: 80rpx; }
.msg-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 24rpx 28rpx; background: #fff;
  position: sticky; top: 0; z-index: 10;
}
.mn-back, .mn-clear { font-size: 28rpx; color: #1a1a1a; }
.mn-title { font-size: 32rpx; font-weight: 600; color: #1d2129; }
.mn-clear { color: #86909c; }
.col-list { padding: 20rpx 28rpx; }
.col-item {
  display: flex; align-items: center; gap: 22rpx;
  background: #fff; border-radius: 24rpx; padding: 26rpx;
  margin-bottom: 18rpx; border: 1px solid #e5e6eb;
}
.c-av {
  width: 96rpx; height: 96rpx; border-radius: 50%; overflow: hidden;
  background: rgba(7, 193, 96, 0.1); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.c-av-img { width: 100%; height: 100%; }
.c-av-txt { font-size: 36rpx; font-weight: 600; color: #07c160; }
.c-info { flex: 1; min-width: 0; }
.c-name { font-size: 30rpx; font-weight: 600; color: #1d2129; }
.c-sub { font-size: 24rpx; color: #86909c; margin-top: 6rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c-time { font-size: 22rpx; color: #c9cdd4; margin-top: 8rpx; }
.c-act {
  display: flex; align-items: center; gap: 8rpx;
  font-size: 22rpx; color: #86909c;
  background: #f7f8fa; border-radius: 999rpx; padding: 10rpx 20rpx;
  flex-shrink: 0;
}
.msg-empty { text-align: center; padding: 120rpx 40rpx; }
.me-icon { margin-bottom: 20rpx; }
.me-text { font-size: 30rpx; color: #1d2129; }
.me-hint { font-size: 24rpx; color: #86909c; margin-top: 12rpx; }
</style>
