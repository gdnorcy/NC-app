<template>
  <!-- ===== 供需标签·轻量编辑页（我的名片「名片内容」入口分流）
       只编辑 needTags 一个字段，即时定位、即改即存，不再穿越三步向导。
       数据源与保存接口与 create.vue 完全一致（PUT /cards/:id 支持部分字段更新）。 ===== -->
  <view class="nt-page" :style="themeStyle">
    <PageNav title="供需标签" back></PageNav>

    <!-- 加载失败 -->
    <view class="pg-error" v-if="loadFailed">
      <view class="pg-err-text">{{ loadFailedMsg }}</view>
      <view class="pg-btn" @click="reloadPage">重新加载</view>
    </view>

    <view class="nt-body" v-else>
      <view class="nt-card">
        <view class="nt-title">选择你的供需标签</view>
        <view class="nt-desc">最多选 3 个，展示在名片详情页，帮助别人快速了解你的需求</view>
        <view class="need-row">
          <view
            class="need-item"
            v-for="t in NEED_OPTIONS"
            :key="t"
            :class="{ on: selected.includes(t) }"
            @click="toggleNeed(t)"
          >{{ t }}</view>
        </view>
        <view class="nt-count" :class="{ max: selected.length >= 3 }">{{ selected.length }} / 3</view>
      </view>

      <button class="nt-save" :disabled="saving || loadFailed" @click="save">
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </view>
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import { ref, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import { loginEntryUrl, LOGIN_PATH } from '../../utils/loginEntry.js';
import { useDesignTheme } from '../../utils/design.js';
const themeStyle = useDesignTheme();

// 与 create.vue 保持同一份选项（改动时两处同步；量大后可抽 utils）
const NEED_OPTIONS = ['找渠道', '求合作', '招合伙人', '寻资源', '招代理', '找投资'];

const cardId = ref(null);
const selected = ref([]);
const saving = ref(false);
const loadFailed = ref(false);
const loadFailedMsg = ref('加载失败，请检查网络后重试');

function parseNeedTags(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (!v) return [];
  try { const arr = JSON.parse(v); return Array.isArray(arr) ? arr.filter(Boolean) : []; } catch (e) { return []; }
}

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
    const res = await cardApi.getCard(id);
    selected.value = parseNeedTags(res.card.needTags);
    loadFailed.value = false;
  } catch (e) {
    loadFailed.value = true;
    loadFailedMsg.value = '名片加载失败，请检查网络后重试';
  }
}

function toggleNeed(t) {
  const i = selected.value.indexOf(t);
  if (i >= 0) selected.value.splice(i, 1);
  else if (selected.value.length < 3) selected.value.push(t);
  else uni.showToast({ title: '最多选择 3 个', icon: 'none' });
}

async function save() {
  if (!cardId.value || saving.value) return;
  saving.value = true;
  try {
    await cardApi.updateCard(cardId.value, { needTags: JSON.stringify(selected.value) });
    uni.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e) {
    uni.showToast({ title: '保存失败，请重试', icon: 'none' });
  } finally {
    saving.value = false;
  }
}

function reloadPage() { load(); }

onMounted(() => {
  // 登录门禁：与 create.vue 同款（未登录跳登录并回跳本页，编辑场景必须带 id）
  const pages = getCurrentPages();
  const opts = (pages[pages.length - 1] || {}).options || {};
  const me = uni.getStorageSync('card_user') || {};
  if (!me.id && !uni.getStorageSync('card_token')) {
    uni.redirectTo({ url: loginEntryUrl(LOGIN_PATH, '/pages/card/needTagsEdit' + (opts.id ? `?id=${opts.id}` : '')) });
    return;
  }
  load();
});
</script>

<style scoped>
.nt-page { min-height: 100vh; background: var(--bg-page); }
.nt-body { padding: 20rpx 24rpx 60rpx; }
.nt-card {
  background: #fff; border-radius: 20rpx; padding: 32rpx 28rpx;
  box-shadow: 0 4px 14px rgba(20,40,70,.08);
}
.nt-title { font-size: 32rpx; font-weight: 600; color: var(--t5); }
.nt-desc { font-size: 22rpx; color: var(--t3); margin-top: 8rpx; line-height: 1.5; }
.need-row { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 28rpx; }
.need-item { padding: 12rpx 28rpx; border-radius: 30rpx; background: var(--bg-card); color: var(--t3); font-size: 26rpx; border: 2rpx dashed var(--border-strong); }
.need-item.on { background: var(--theme-tint, rgba(22,93,255,0.08)); color: var(--primary); border-color: var(--primary); font-weight: 500; }
.nt-count { margin-top: 24rpx; font-size: 22rpx; color: var(--t4); text-align: right; }
.nt-count.max { color: var(--warning); }
.nt-save {
  margin-top: 40rpx; height: 88rpx; line-height: 88rpx; border-radius: 44rpx;
  background: var(--primary); color: #fff; font-size: 30rpx; border: none;
}
.nt-save[disabled] { opacity: 0.5; }
.pg-error { padding: 200rpx 60rpx; text-align: center; }
.pg-err-text { font-size: 26rpx; color: var(--t3); }
.pg-btn {
  margin: 24rpx auto 0; display: inline-block; padding: 16rpx 56rpx; border-radius: 40rpx;
  background: var(--primary); color: #fff; font-size: 28rpx;
}
</style>
