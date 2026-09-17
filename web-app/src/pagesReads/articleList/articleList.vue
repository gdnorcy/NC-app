<template>
  <view class="art-list-page">
    <!-- 自定义导航 -->
    <view class="nav-bar">
      <view class="nav-back" @click="goBack"><text class="back-arrow">‹</text></view>
      <view class="nav-title">文章列表</view>
      <view class="nav-right"></view>
    </view>

    <!-- 分类 tab -->
    <scroll-view scroll-x class="cate-tabs" :show-scrollbar="false">
      <view class="cate-tab" :class="{ on: activeCate === 0 }" @click="switchCate(0)">全部</view>
      <view v-for="c in cates" :key="c.id" class="cate-tab" :class="{ on: activeCate === c.id }" @click="switchCate(c.id)">{{ c.name }}</view>
    </scroll-view>

    <!-- 列表 -->
    <view class="list" v-if="list.length">
      <view v-for="a in list" :key="a.id" class="art-card" @click="openArt(a.id)">
        <image v-if="a.thumb" :src="a.thumb" class="art-thumb" mode="aspectFill" />
        <view v-else class="art-thumb art-thumb-empty"><text>暂无图</text></view>
        <view class="art-info">
          <view class="art-title">{{ a.title }}</view>
          <view class="art-meta">
            <text class="cate-tag">{{ cateName(a.cate_ids) }}</text>
            <text class="time">{{ a.created_at ? a.created_at.slice(0, 10) : '' }}</text>
          </view>
          <view class="art-desc" v-if="a.intro">{{ a.intro }}</view>
          <view class="art-stat">
            <text>浏览 {{ a.views || 0 }}</text>
            <text class="dot">·</text>
            <text>点赞 {{ a.likes || 0 }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="empty" v-else-if="!loading">
      <text class="empty-icon">📄</text>
      <text>暂无文章</text>
    </view>

    <view class="load-more" v-if="list.length && hasMore" @click="loadMore">加载更多</view>
    <view class="load-more" v-else-if="list.length">已加载全部</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi';

const tid = ref('');
const cates = ref([]);
const list = ref([]);
const activeCate = ref(0);
const page = ref(1);
const hasMore = ref(true);
const loading = ref(false);

onLoad((options) => {
  tid.value = options.tid || options.customerId || '';
  loadCates();
  loadList(true);
});

function cateName(ids) {
  if (!ids) return '';
  const first = String(ids).split(',')[0];
  const c = cates.value.find((x) => x.id === Number(first));
  return c ? c.name : '';
}

async function loadCates() {
  try {
    const res = await cardApi.contentArticleCates(tid.value);
    cates.value = (res.list || []).filter((c) => c.status === 1);
  } catch (e) { /* 分类加载失败不阻断列表 */ }
}

async function loadList(reset) {
  if (loading.value) return;
  loading.value = true;
  try {
    const params = { tid: tid.value, page: reset ? 1 : page.value, pageSize: 10 };
    if (activeCate.value) params.cateId = activeCate.value;
    const res = await cardApi.contentArticles(params);
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

function switchCate(id) {
  activeCate.value = id;
  loadList(true);
}

function loadMore() { loadList(false); }
function openArt(id) {
  uni.navigateTo({ url: `/pagesReads/showArt/showArt?id=${id}&tid=${tid.value}` });
}
function goBack() { uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/cardMain/home' }) }); }
</script>

<style scoped>
.art-list-page { min-height: 100vh; background: #f7f8fa; }
.nav-bar { display: flex; align-items: center; height: 44px; padding: 0 8px; background: #fff; position: sticky; top: 0; z-index: 10; }
.nav-back { width: 44px; height: 44px; display: flex; align-items: center; }
.back-arrow { font-size: 28px; color: #1d2129; line-height: 1; }
.nav-title { flex: 1; text-align: center; font-size: 16px; font-weight: 600; color: #1d2129; }
.nav-right { width: 44px; }
.cate-tabs { white-space: nowrap; background: #fff; padding: 8px 4px; border-bottom: 1px solid #f2f3f5; }
.cate-tab { display: inline-block; padding: 6px 14px; margin: 0 4px; font-size: 13px; color: #4e5969; background: #f7f8fa; border-radius: 16px; }
.cate-tab.on { color: #165dff; background: #e8f3ff; font-weight: 500; }
.list { padding: 12px; }
.art-card { display: flex; background: #fff; border-radius: 8px; margin-bottom: 12px; padding: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.art-thumb { width: 96px; height: 72px; border-radius: 6px; flex-shrink: 0; }
.art-thumb-empty { background: #f2f3f5; display: flex; align-items: center; justify-content: center; color: #c9cdd4; font-size: 12px; }
.art-info { flex: 1; margin-left: 10px; overflow: hidden; }
.art-title { font-size: 15px; font-weight: 600; color: #1d2129; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.art-meta { display: flex; align-items: center; margin-top: 4px; }
.cate-tag { font-size: 11px; color: #165dff; background: #e8f3ff; padding: 1px 6px; border-radius: 4px; }
.time { font-size: 11px; color: #86909c; margin-left: 8px; }
.art-desc { font-size: 12px; color: #86909c; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.art-stat { font-size: 11px; color: #c9cdd4; margin-top: 6px; }
.dot { margin: 0 4px; }
.empty { padding: 80px 0; text-align: center; color: #86909c; font-size: 13px; }
.empty-icon { display: block; font-size: 36px; margin-bottom: 8px; }
.load-more { text-align: center; padding: 12px 0 24px; font-size: 12px; color: #86909c; }
</style>
