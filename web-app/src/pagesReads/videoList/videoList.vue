<template>
  <view class="video-list-page">
    <view class="nav-bar">
      <view class="nav-back" @click="goBack"><text class="back-arrow">‹</text></view>
      <view class="nav-title">视频列表</view>
      <view class="nav-right"></view>
    </view>

    <view class="list" v-if="list.length">
      <view v-for="v in list" :key="v.id" class="video-card">
        <view class="video-player">
          <video
            v-if="videoSrc(v)"
            :src="videoSrc(v)"
            :poster="v.cover ? absUrl(v.cover) : ''"
            class="video-el"
            object-fit="cover"
            :controls="true"
          />
          <view v-else class="video-empty" @click="playFallback(v)">
            <image v-if="v.cover" :src="absUrl(v.cover)" mode="aspectFill" class="video-cover" />
            <text class="play-icon">▶</text>
          </view>
        </view>
        <view class="video-info">
          <view class="v-title">{{ v.title }}</view>
          <view class="v-meta">
            <text>浏览 {{ v.views || 0 }}</text>
            <text class="dot">·</text>
            <text>点赞 {{ v.likes || 0 }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="empty" v-else-if="!loading">
      <text class="empty-icon">🎬</text>
      <text>暂无视频</text>
    </view>

    <view class="load-more" v-if="list.length && hasMore" @click="loadMore">加载更多</view>
    <view class="load-more" v-else-if="list.length">已加载全部</view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { cardApi, API_DOMAIN } from '../../utils/cardApi';

const tid = ref('');
const list = ref([]);
const page = ref(1);
const hasMore = ref(true);
const loading = ref(false);

onLoad((options) => {
  tid.value = options.tid || '';
  loadList(true);
});

function absUrl(u) {
  if (!u) return '';
  return u.startsWith('http') ? u : `${API_DOMAIN}${u.startsWith('/') ? u : '/' + u}`;
}
function videoSrc(v) {
  const u = v.video_url || '';
  // 仅直链 mp4 等可直接播放；第三方平台链接走点击跳转
  if (/\.(mp4|m3u8|mov|webm)(\?|$)/i.test(u)) return absUrl(u);
  return '';
}
function playFallback(v) {
  if (!v.video_url) return;
  if (/^https?:/.test(v.video_url)) {
    // #ifdef H5
    window.open(v.video_url);
    // #endif
    // #ifndef H5
    uni.setClipboardData({ data: v.video_url });
    uni.showToast({ title: '链接已复制，请到浏览器打开', icon: 'none' });
    // #endif
  }
}

async function loadList(reset) {
  if (loading.value) return;
  loading.value = true;
  try {
    const params = { tid: tid.value, page: reset ? 1 : page.value, pageSize: 10, online: 1 };
    const res = await cardApi.contentVideos(params);
    const rows = res.list || [];
    if (reset) list.value = rows;
    else list.value = list.value.concat(rows);
    hasMore.value = list.value.length < (res.total || 0);
    page.value = reset ? 2 : page.value + 1;
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function loadMore() { loadList(false); }
function goBack() { uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/cardMain/home' }) }); }
</script>

<style scoped>
.video-list-page { min-height: 100vh; background: #f7f8fa; }
.nav-bar { display: flex; align-items: center; height: 44px; padding: 0 8px; background: #fff; position: sticky; top: 0; z-index: 10; }
.nav-back { width: 44px; height: 44px; display: flex; align-items: center; }
.back-arrow { font-size: 28px; color: #1d2129; line-height: 1; }
.nav-title { flex: 1; text-align: center; font-size: 16px; font-weight: 600; color: #1d2129; }
.nav-right { width: 44px; }
.list { padding: 12px; }
.video-card { background: #fff; border-radius: 8px; margin-bottom: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.video-player { width: 100%; background: #000; }
.video-el { width: 100%; height: 200px; display: block; }
.video-empty { position: relative; width: 100%; height: 200px; }
.video-cover { width: 100%; height: 100%; }
.play-icon { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 48px; height: 48px; border-radius: 50%; background: rgba(0,0,0,0.45); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; padding-left: 4px; }
.video-info { padding: 10px 12px; }
.v-title { font-size: 15px; font-weight: 600; color: #1d2129; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.v-meta { font-size: 11px; color: #86909c; margin-top: 6px; }
.dot { margin: 0 4px; }
.empty { padding: 80px 0; text-align: center; color: #86909c; font-size: 13px; }
.empty-icon { display: block; font-size: 36px; margin-bottom: 8px; }
.load-more { text-align: center; padding: 12px 0 24px; font-size: 12px; color: #86909c; }
</style>
