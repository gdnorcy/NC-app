<template>
  <view class="art-detail-page">
    <view class="nav-bar">
      <view class="nav-back" @click="goBack"><text class="back-arrow">‹</text></view>
      <view class="nav-title">文章详情</view>
      <view class="nav-right" @click="share"><text class="share-btn">分享</text></view>
    </view>

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
    const res = await cardApi.contentAddComment({ articleId: id.value, content: text, nickname: '' });
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
.art-detail-page { min-height: 100vh; background: #fff; padding-bottom: 60px; }
.nav-bar { display: flex; align-items: center; height: 44px; padding: 0 8px; background: #fff; position: sticky; top: 0; z-index: 10; border-bottom: 1px solid #f2f3f5; }
.nav-back { width: 44px; height: 44px; display: flex; align-items: center; }
.back-arrow { font-size: 28px; color: #1d2129; line-height: 1; }
.nav-title { flex: 1; text-align: center; font-size: 16px; font-weight: 600; color: #1d2129; }
.nav-right { width: 44px; text-align: right; }
.share-btn { font-size: 13px; color: #165dff; }
.detail-body { padding: 16px; }
.d-title { font-size: 20px; font-weight: 700; color: #1d2129; line-height: 1.4; }
.d-meta { display: flex; align-items: center; margin-top: 8px; font-size: 12px; color: #86909c; }
.cate-tag { color: #165dff; background: #e8f3ff; padding: 1px 6px; border-radius: 4px; font-size: 11px; }
.time { margin-left: 8px; }
.views { margin-left: 8px; }
.d-thumb { margin-top: 12px; }
.d-thumb-img { width: 100%; border-radius: 8px; }
.d-slider { margin-top: 8px; }
.d-slider-img { width: 100%; border-radius: 8px; margin-bottom: 8px; }
.d-content { display: block; margin-top: 14px; font-size: 15px; color: #333; line-height: 1.8; word-break: break-all; }
.d-actions { display: flex; justify-content: center; gap: 48px; margin: 24px 0 8px; }
.act { display: flex; align-items: center; gap: 4px; font-size: 13px; color: #4e5969; }
.act.on { color: #165dff; }
.act-icon { font-size: 18px; }
.comment-sec { border-top: 8px solid #f7f8fa; padding: 16px; }
.sec-title { font-size: 15px; font-weight: 600; color: #1d2129; margin-bottom: 12px; }
.comment-item { padding: 12px 0; border-bottom: 1px solid #f7f8fa; }
.c-head { display: flex; align-items: center; }
.c-avatar { width: 32px; height: 32px; border-radius: 50%; background: #e8f3ff; color: #165dff; display: flex; align-items: center; justify-content: center; font-size: 14px; }
.c-main { margin-left: 8px; }
.c-name { font-size: 13px; color: #1d2129; }
.c-time { font-size: 11px; color: #c9cdd4; margin-top: 2px; }
.c-content { margin-top: 6px; font-size: 14px; color: #333; line-height: 1.6; }
.no-comment { text-align: center; color: #c9cdd4; font-size: 13px; padding: 24px 0; }
.empty { padding: 100px 0; text-align: center; color: #86909c; font-size: 13px; }
.empty-icon { display: block; font-size: 36px; margin-bottom: 8px; }
.comment-bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; padding: 8px 12px; background: #fff; border-top: 1px solid #f2f3f5; }
.comment-input { flex: 1; height: 36px; background: #f7f8fa; border-radius: 18px; padding: 0 14px; font-size: 13px; }
.send-btn { margin-left: 10px; color: #165dff; font-size: 14px; font-weight: 500; }
</style>
