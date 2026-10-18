<template>
  <!-- ===== 视频号作品管理·轻量编辑页（我的名片「名片内容」入口分流）
       card_videos 为纯元数据（封面+标题+时长），无视频文件；历史上仅 seed 写入 + 公开 GET，
       本页补齐 C 端视频号作品的增/改/删/排序（服务端 card.js 有归属校验 + 会员分级门禁）。 ===== -->
  <view class="wk-page" :style="[themeStyle, brandVars]">
    <PageNav title="视频管理" back></PageNav>

    <view class="pg-error" v-if="loadFailed">
      <view class="pg-err-text">{{ loadFailedMsg }}</view>
      <view class="pg-btn" @click="reloadPage">重新加载</view>
    </view>

    <view class="wk-body" v-else>
      <view class="wk-desc">
        视频号作品展示在名片详情页「视频」标签，支持封面、标题与时长，可拖动排序。
        <text class="wk-quota" :class="{ full: videos.length >= videosLimit }">已添加 {{ videos.length }}/{{ videosLimit }} 个</text>
      </view>

      <!-- 无视频位（free）或已达上限：升级引导卡 -->
      <view class="vt-upgrade" v-if="videosLimit <= 0 || videos.length >= videosLimit">
        <view class="vt-up-t">视频号作品需白银及以上会员</view>
        <view class="vt-up-d">白银可添加 2 个、黄金 6 个、钻石 20 个视频号作品</view>
        <view class="vt-up-btn" @click="goUpgrade">去升级</view>
      </view>

      <view class="wk-empty" v-if="!videos.length && !loading && videosLimit > 0">
        <view class="wk-empty-t">还没有视频号作品</view>
        <view class="wk-empty-d">点击下方按钮添加第一个视频</view>
      </view>

      <view class="wk-list">
        <view class="wk-row" v-for="(v, i) in videos" :key="v.id">
          <view class="wk-idx">{{ i + 1 }}</view>
          <image class="wk-img" :src="v.coverUrl" mode="aspectFill" />
          <view class="wk-mid">
            <input
              class="wk-title-input"
              v-model="v.title"
              placeholder="视频标题（选填）"
              placeholder-class="ph"
              @blur="saveMeta(v)"
            />
            <input
              class="wk-dur-input"
              v-model="v.duration"
              placeholder="时长（选填，如 03:24）"
              placeholder-class="ph"
              @blur="saveMeta(v)"
            />
            <view class="wk-ops">
              <text class="wk-op" :class="{ off: i === 0 }" @click="move(v, -1)">上移</text>
              <text class="wk-op" :class="{ off: i === videos.length - 1 }" @click="move(v, 1)">下移</text>
              <text class="wk-op del" @click="remove(v)">删除</text>
            </view>
          </view>
        </view>
      </view>

      <view class="wk-add" @click="add" v-if="videosLimit > 0 && videos.length < videosLimit">
        <text class="wk-add-plus">＋</text>
        <text>添加视频</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import { ref, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import { loginEntryUrl, LOGIN_PATH } from '../../utils/loginEntry.js';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';
const themeStyle = useDesignTheme();
const { brandVars } = useBrandOverride();

const cardId = ref(null);
const videos = ref([]);
const loading = ref(false);
const loadFailed = ref(false);
const loadFailedMsg = ref('加载失败，请检查网络后重试');
// 会员分级权益（benefits.js 单一来源经 /member/status 下发；free 档 videosLimit=0）
const videosLimit = ref(0);

// 无显式 id 时按本人名片兜底（与 worksEdit 同款）
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
  loading.value = true;
  const id = await resolveCardId();
  if (!id) {
    loadFailed.value = true;
    loadFailedMsg.value = '未找到你的名片，请先创建名片';
    loading.value = false;
    return;
  }
  cardId.value = id;
  try {
    // 权益快照 + 视频列表（并行，互不依赖）
    const [st, res] = await Promise.all([
      cardApi.getMemberStatus().catch(() => null),
      cardApi.getCardVideos(id),
    ]);
    const b = (st && st.benefits) || {};
    videosLimit.value = Number(b.videosLimit) >= 0 ? Number(b.videosLimit) : 0;
    videos.value = (res.videos || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    loadFailed.value = false;
  } catch (e) {
    loadFailed.value = true;
    loadFailedMsg.value = '视频加载失败，请检查网络后重试';
  } finally {
    loading.value = false;
  }
}

// 升级引导（超限/无视频位共用）
function showUpgrade(text) {
  uni.showModal({
    title: '升级会员',
    content: text,
    confirmText: '去升级',
    cancelText: '以后再说',
    success: (r) => {
      if (r.confirm) uni.navigateTo({ url: '/pages/card/member' });
    },
  });
}

function goUpgrade() {
  showUpgrade('视频号作品是白银及以上会员权益：白银 2 个、黄金 6 个、钻石 20 个，升级后即可添加');
}

async function add() {
  if (!cardId.value) return;
  // 前端预检（服务端 POST /videos 同样强制，双保险）
  if (videosLimit.value <= 0) { goUpgrade(); return; }
  if (videos.value.length >= videosLimit.value) {
    showUpgrade(`视频号作品数量已达上限（${videos.value.length}/${videosLimit.value} 个），升级会员可添加更多`);
    return;
  }
  uni.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sizeType: ['compressed'],
    success: async (res) => {
      const f = (res.tempFiles && res.tempFiles[0]) || {};
      if (!f.tempFilePath) return;
      uni.showLoading({ title: '上传中…', mask: true });
      try {
        const data = await cardApi.addCardVideo(cardId.value, f.tempFilePath, '', '');
        uni.hideLoading();
        if (data && data.video) {
          videos.value.push(data.video);
          uni.showToast({ title: '已添加', icon: 'success' });
        }
      } catch (e) {
        uni.hideLoading();
        // 服务端限额命中（403 limitHit）：弹升级引导而非普通错误
        if (String(e.message || '').indexOf('上限') >= 0) {
          showUpgrade(e.message);
        } else {
          uni.showToast({ title: e.message || '上传失败', icon: 'none' });
        }
      }
    },
  });
}

function remove(v) {
  uni.showModal({
    title: '删除视频',
    content: '确定删除这个视频号作品吗？',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await cardApi.deleteCardVideo(cardId.value, v.id);
        videos.value = videos.value.filter((x) => x.id !== v.id);
        uni.showToast({ title: '已删除', icon: 'success' });
      } catch (e) {
        uni.showToast({ title: e.message || '删除失败', icon: 'none' });
      }
    },
  });
}

async function move(v, dir) {
  const i = videos.value.indexOf(v);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= videos.value.length) return;
  const arr = videos.value.slice();
  const tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
  videos.value = arr;
  try {
    await cardApi.sortCardVideos(cardId.value, arr.map((x) => x.id));
  } catch (e) {
    uni.showToast({ title: '排序保存失败', icon: 'none' });
  }
}

let metaTimer = null;
function saveMeta(v) {
  // 防抖：聚焦连续编辑只保存一次（标题/时长一并提交）
  if (metaTimer) clearTimeout(metaTimer);
  metaTimer = setTimeout(async () => {
    try {
      await cardApi.updateCardVideo(cardId.value, v.id, { title: v.title || '', duration: v.duration || '' });
    } catch (e) { /* 静默：失焦保存失败不打扰，用户可再次编辑触发 */ }
  }, 300);
}

function reloadPage() { load(); }

onMounted(() => {
  // 登录门禁：与 worksEdit 同款（未登录跳登录并回跳本页）
  const pages = getCurrentPages();
  const opts = (pages[pages.length - 1] || {}).options || {};
  const me = uni.getStorageSync('card_user') || {};
  if (!me.id && !uni.getStorageSync('card_token')) {
    uni.redirectTo({ url: loginEntryUrl(LOGIN_PATH, '/pages/card/videosEdit' + (opts.id ? `?id=${opts.id}` : '')) });
    return;
  }
  load();
});
</script>

<style scoped>
.wk-page { min-height: 100vh; background: var(--bg-page); }
.wk-body { padding: 20rpx 24rpx 80rpx; }
.wk-desc { font-size: var(--fs-2); color: var(--t3); line-height: 1.5; margin-bottom: 24rpx; }
.wk-quota { margin-left: 16rpx; color: var(--t3); }
.wk-quota.full { color: var(--t1); font-weight: 500; }
.vt-upgrade { background: var(--white); border: 1rpx solid var(--border-strong); border-radius: 18rpx; padding: 32rpx 24rpx; text-align: center; margin-bottom: 24rpx; }
.vt-up-t { font-size: var(--fs-4); font-weight: 500; color: var(--t1); }
.vt-up-d { font-size: var(--fs-2); color: var(--t3); margin-top: 10rpx; line-height: 1.5; }
.vt-up-btn { margin: 24rpx auto 0; display: inline-block; padding: 12rpx 48rpx; border-radius: 40rpx; background: var(--design-primary); color: var(--white); font-size: var(--fs-4); }
.wk-empty { text-align: center; padding: 80rpx 40rpx; background: var(--white); border-radius: 20rpx; }
.wk-empty-t { font-size: var(--fs-5); font-weight: 500; color: var(--t5); }
.wk-empty-d { font-size: var(--fs-2); color: var(--t3); margin-top: 10rpx; }
.wk-list { display: flex; flex-direction: column; gap: 20rpx; }
.wk-row { display: flex; align-items: center; gap: 18rpx; background: var(--white); border: 1rpx solid var(--border-strong); border-radius: 18rpx; padding: 20rpx; }
.wk-idx { width: 36rpx; text-align: center; font-size: var(--fs-4); color: var(--t3); flex-shrink: 0; }
.wk-img { width: 120rpx; height: 120rpx; border-radius: 12rpx; background: var(--bg-hover); flex-shrink: 0; }
.wk-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14rpx; }
.wk-title-input { font-size: var(--fs-4); color: var(--t1); border-bottom: 1rpx solid var(--border-strong); padding: 8rpx 0; }
.wk-dur-input { font-size: var(--fs-2); color: var(--t3); border-bottom: 1rpx solid var(--border-strong); padding: 6rpx 0; }
.ph { color: var(--t3); }
.wk-ops { display: flex; gap: 24rpx; }
.wk-op { font-size: var(--fs-3); color: var(--design-primary); }
.wk-op.off { color: var(--t3); opacity: 0.5; }
.wk-op.del { color: var(--danger); }
.wk-add {
  margin-top: 28rpx; height: 92rpx; border-radius: 20rpx; border: 2rpx dashed var(--border-strong);
  display: flex; align-items: center; justify-content: center; gap: 12rpx;
  color: var(--design-primary); font-size: var(--fs-4); background: var(--white);
}
.wk-add-plus { font-size: 34rpx; }
.pg-error { padding: 200rpx 60rpx; text-align: center; }
.pg-err-text { font-size: var(--fs-4); color: var(--t3); }
.pg-btn { margin: 24rpx auto 0; display: inline-block; padding: 16rpx 56rpx; border-radius: 40rpx; background: var(--design-primary); color: var(--white); font-size: var(--fs-5); }
</style>
