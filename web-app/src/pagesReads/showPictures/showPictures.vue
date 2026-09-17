<template>
  <view class="pic-detail-page">
    <view class="nav-bar">
      <view class="nav-back" @click="goBack"><text class="back-arrow">‹</text></view>
      <view class="nav-title">组图详情</view>
      <view class="nav-right" @click="share"><text class="share-btn">分享</text></view>
    </view>

    <view v-if="pic.id" class="detail-body">
      <view class="d-title">{{ pic.title }}</view>
      <view class="d-meta">
        <text>{{ pic.created_at ? pic.created_at.slice(0, 10) : '' }}</text>
        <text class="dot">·</text>
        <text>{{ (pic.pics || []).length || 0 }} 张图</text>
        <text class="dot">·</text>
        <text>浏览 {{ pic.views || 0 }}</text>
      </view>
      <view class="d-intro" v-if="pic.intro">{{ pic.intro }}</view>

      <!-- 图片墙 -->
      <view class="pic-wall">
        <image v-for="(img, i) in pic.pics" :key="i" :src="img" mode="widthFix" class="wall-img" :data-idx="i" @click="preview(i)" />
      </view>
    </view>

    <view v-else class="empty">
      <text class="empty-icon">🖼️</text>
      <text>{{ errMsg || '组图不存在或已删除' }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { cardApi, API_DOMAIN } from '../../utils/cardApi';

const id = ref(0);
const tid = ref('');
const pic = ref({});
const errMsg = ref('');

onLoad(async (options) => {
  id.value = Number(options.id || 0);
  tid.value = options.tid || '';
  await load();
});

async function load() {
  try {
    const res = await cardApi.contentPic(id.value, tid.value);
    pic.value = res.pic || res || {};
    // pics 兼容字符串（逗号分隔）与数组
    if (typeof pic.value.pics === 'string') {
      pic.value.pics = pic.value.pics.split(',').filter(Boolean);
    }
    if (!pic.value.id && !pic.value.title) { errMsg.value = '组图不存在或已删除'; return; }
    uni.setNavigationBarTitle({ title: pic.value.title || '组图详情' });
  } catch (e) {
    errMsg.value = e.message || '加载失败';
  }
}

function preview(index) {
  const urls = (pic.value.pics || []).map((u) => (u.startsWith('http') ? u : `${API_DOMAIN}${u}`));
  uni.previewImage({ current: index, urls });
}

function share() {
  // #ifdef H5
  const url = `${window.location.origin}/card/#/pagesReads/showPictures/showPictures?id=${id.value}&tid=${tid.value}`;
  uni.setClipboardData({ data: url });
  // #endif
}

function goBack() { uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/cardMain/home' }) }); }
</script>

<style scoped>
.pic-detail-page { min-height: 100vh; background: #fff; }
.nav-bar { display: flex; align-items: center; height: 44px; padding: 0 8px; background: #fff; position: sticky; top: 0; z-index: 10; border-bottom: 1px solid #f2f3f5; }
.nav-back { width: 44px; height: 44px; display: flex; align-items: center; }
.back-arrow { font-size: 28px; color: #1d2129; line-height: 1; }
.nav-title { flex: 1; text-align: center; font-size: 16px; font-weight: 600; color: #1d2129; }
.nav-right { width: 44px; text-align: right; }
.share-btn { font-size: 13px; color: #165dff; }
.detail-body { padding: 16px; }
.d-title { font-size: 19px; font-weight: 700; color: #1d2129; line-height: 1.4; }
.d-meta { display: flex; align-items: center; margin-top: 8px; font-size: 12px; color: #86909c; }
.dot { margin: 0 6px; }
.d-intro { margin-top: 10px; font-size: 14px; color: #4e5969; line-height: 1.6; }
.pic-wall { margin-top: 14px; }
.wall-img { width: 100%; border-radius: 8px; margin-bottom: 10px; }
.empty { padding: 100px 0; text-align: center; color: #86909c; font-size: 13px; }
.empty-icon { display: block; font-size: 36px; margin-bottom: 8px; }
</style>
