<template>
  <view class="art-detail-page">
<!-- PageNav -->
    <PageNav title="文章详情" back></PageNav>

    <view v-if="art.id" class="detail-body">
      <view class="d-title">{{ art.title }}</view>
      <view class="d-meta">
        <text class="cate-tag">{{ cateName }}</text>
        <text class="time">{{ art.created_at ? art.created_at.slice(0, 10) : '' }}</text>
        <text class="views">浏览 {{ art.views || 0 }}</text>
      </view>
      <view class="d-thumb" v-if="art.thumb">
        <image :src="art.thumb" mode="widthFix" class="d-thumb-img" />
      </view>
      <view class="d-slider" v-if="(art.slider || []).length">
        <image v-for="(s, i) in art.slider" :key="i" :src="s" mode="widthFix" class="d-slider-img" />
      </view>
      <!-- 富文本正文 -->
      <rich-text class="d-content" :nodes="art.detail || ''"></rich-text>

      <view class="d-actions">
        <view class="act" :class="{ on: liked }" @click="toggleLike">
          <text class="act-icon">{{ liked ? '👍' : '👍' }}</text>
          <text>{{ art.likes || 0 }}</text>
        </view>
        <view class="act" @click="scrollToComment">
          <text class="act-icon">💬</text>
          <text>{{ art.comment_count || 0 }}</text>
        </view>
      </view>

      <!-- 评论区 -->
      <view class="comment-sec" id="comments">
        <view class="sec-title">全部评论（{{ art.comment_count || 0 }}）</view>
        <view v-if="comments.length" class="comment-list">
          <view v-for="c in comments" :key="c.id" class="comment-item">
            <view class="c-head">
              <view class="c-avatar">{{ (c.nickname || '用')[0] }}</view>
              <view class="c-main">
                <view class="c-name">{{ c.nickname || '匿名用户' }}</view>
                <view class="c-time">{{ c.created_at ? c.created_at.slice(0, 16) : '' }}</view>
              </view>
            </view>
            <view class="c-content">{{ c.content }}</view>
          </view>
        </view>
        <view v-else class="no-comment">暂无评论，来抢沙发吧</view>
      </view>
    </view>

    <view v-else class="empty">
      <text class="empty-icon">📄</text>
      <text>{{ errMsg || '文章不存在或已删除' }}</text>
    </view>

    <!-- 评论输入 -->
    <view class="comment-bar" v-if="art.id">
      <input v-model="commentText" class="comment-input" placeholder="写下你的评论…" confirm-type="send" @confirm="submitComment" />
      <view class="send-btn" @click="submitComment">发送</view>
    </view>
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi';

const id = ref(0);
const tid = ref('');
const art = ref({});
const comments = ref([]);
const liked = ref(false);
const commentText = ref('');
const errMsg = ref('');

const cateName = computed(() => {
  const ids = art.value.cate_ids;
  if (!ids) return '';
  const first = String(ids).split(',')[0];
  const c = cates.value.find((x) => x.id === Number(first));
  return c ? c.name : '';
});
const cates = ref([]);

onLoad(async (options) => {
  id.value = Number(options.id || 0);
  tid.value = options.tid || '';
  await load();
});

async function load() {
  try {
    const [res, cateRes] = await Promise.all([
      cardApi.contentArticle(id.value, tid.value),
      cardApi.contentArticleCates(tid.value),
    ]);
    art.value = res.article || res || {};
    cates.value = (cateRes.list || []).filter((c) => c.status === 1);
    if (!art.value.id && !art.value.title) { errMsg.value = '文章不存在或已删除'; return; }
    loadComments();
    uni.setNavigationBarTitle({ title: art.value.title || '文章详情' });
  } catch (e) {
    errMsg.value = e.message || '加载失败';
  }
}

async function loadComments() {
  try {
    const res = await cardApi.contentComments({ tid: tid.value, articleId: id.value, page: 1, pageSize: 50 });
    comments.value = res.list || [];
    if (art.value) art.value.comment_count = res.total || comments.value.length;
  } catch (e) { /* 评论加载失败不阻断 */ }
}

function toggleLike() {
  liked.value = !liked.value;
  art.value.likes = Math.max(0, (art.value.likes || 0) + (liked.value ? 1 : -1));
}

async function submitComment() {
  const text = commentText.value.trim();
  if (!text) { uni.showToast({ title: '请输入评论内容', icon: 'none' }); return; }
  try {
    const res = await cardApi.contentAddComment({ articleId: id.value, content: text, nickname: '', tid: tid.value });
    commentText.value = '';
    uni.showToast({ title: '评论成功', icon: 'success' });
    loadComments();
  } catch (e) {
    uni.showToast({ title: e.message || '评论失败', icon: 'none' });
  }
}

function share() {
  // 分享链接：H5 复制；小程序走右上角原生分享
  // #ifdef H5
  const url = `${window.location.origin}/card/#/pagesReads/showArt/showArt?id=${id.value}&tid=${tid.value}`;
  uni.setClipboardData({ data: url });
  // #endif
}

function scrollToComment() {
  uni.pageScrollTo({ selector: '#comments', duration: 200 });
}

function goBack() { uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/cardMain/home' }) }); }
</script>

<style scoped>
.art-detail-page { min-height: 100vh; background: var(--white); padding-bottom: 120rpx; }
.share-btn { font-size: var(--fs-4); color: var(--primary); }
.detail-body { padding: 32rpx; }
.d-title { font-size: 40rpx; font-weight: 700; color: var(--t1); line-height: 1.4; }
.d-meta { display: flex; align-items: center; margin-top: 16rpx; font-size: var(--fs-3); color: var(--decor); }
.cate-tag { color: var(--primary); background: #e8f3ff; padding: 1px 12rpx; border-radius: var(--radius-sm); font-size: var(--fs-2); }
.time { margin-left: 16rpx; }
.views { margin-left: 16rpx; }
.d-thumb { margin-top: 24rpx; }
.d-thumb-img { width: 100%; border-radius: var(--radius-sm); }
.d-slider { margin-top: 16rpx; }
.d-slider-img { width: 100%; border-radius: var(--radius-sm); margin-bottom: 16rpx; }
.d-content { display: block; margin-top: 28rpx; font-size: 30rpx; color: var(--t1); line-height: 1.8; word-break: break-all; }
.d-actions { display: flex; justify-content: center; gap: 96rpx; margin: 48rpx 0 16rpx; }
.act { display: flex; align-items: center; gap: 8rpx; font-size: var(--fs-4); color: var(--t2); }
.act.on { color: var(--primary); }
.act-icon { font-size: var(--fs-7); }
.comment-sec { border-top: 8px solid var(--bg-card); padding: 32rpx; }
.sec-title { font-size: 30rpx; font-weight: 600; color: var(--t1); margin-bottom: 24rpx; }
.comment-item { padding: 24rpx 0; border-bottom: 1px solid var(--bg-card); }
.c-head { display: flex; align-items: center; }
.c-avatar { width: 64rpx; height: 64rpx; border-radius: 50%; background: #e8f3ff; color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: var(--fs-5); }
.c-main { margin-left: 16rpx; }
.c-name { font-size: var(--fs-4); color: var(--t1); }
.c-time { font-size: var(--fs-2); color: var(--border); margin-top: 4rpx; }
.c-content { margin-top: 12rpx; font-size: var(--fs-5); color: var(--t1); line-height: 1.6; }
.no-comment { text-align: center; color: var(--border); font-size: var(--fs-4); padding: 48rpx 0; }
.empty { padding: 200rpx 0; text-align: center; color: var(--decor); font-size: var(--fs-4); }
.empty-icon { display: block; font-size: 72rpx; margin-bottom: 16rpx; }
.comment-bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; padding: 16rpx 24rpx; background: var(--white); border-top: 1px solid var(--bg-hover); }
.comment-input { flex: 1; height: 72rpx; background: var(--bg-card); border-radius: 36rpx; padding: 0 28rpx; font-size: var(--fs-4); }
.send-btn { margin-left: 20rpx; color: var(--primary); font-size: var(--fs-5); font-weight: 500; }
</style>
