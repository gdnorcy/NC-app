<template>
  <view class="col-page">
    <view class="msg-nav">
      <view class="mn-back" @click="goBack"><SIcon name="dynamic" size="default" color="#1a1a1a" /></view>
      <view class="mn-title">我的收藏</view>
      <view class="mn-clear" @click="load" v-if="collects.length">刷新</view>
    </view>

    <!-- 分组 Tab -->
    <view class="group-bar" v-if="groups.length">
      <scroll-view scroll-x class="group-scroll" :show-scrollbar="false">
        <view class="group-tabs">
          <view class="g-tab" :class="{ on: activeGroup === 'all' }" @click="activeGroup = 'all'">
            全部 <text class="g-count">{{ collects.length }}</text>
          </view>
          <view class="g-tab" v-for="g in groups" :key="g.name" :class="{ on: activeGroup === g.name }" @click="activeGroup = g.name">
            {{ g.name }} <text class="g-count">{{ g.count }}</text>
          </view>
        </view>
      </scroll-view>
      <view class="group-ops">
        <view class="g-op" @click="addGroup">＋新建</view>
        <view class="g-op" v-if="activeGroup !== 'all' && activeGroup !== '未分组'" @click="delGroup(activeGroup)">删除</view>
      </view>
    </view>

    <view class="col-list" v-if="shownCollects.length">
      <view class="col-item" v-for="c in shownCollects" :key="c.cardId" @click="openCard(c)" @longpress="moveGroup(c)">
        <view class="c-av">
          <image v-if="c.avatar" :src="c.avatar" class="c-av-img" mode="aspectFill" />
          <view v-else class="c-av-txt">{{ c.name[0] || '名' }}</view>
        </view>
        <view class="c-info">
          <view class="c-name">{{ c.name || '未命名名片' }}</view>
          <view class="c-sub">{{ [c.position, c.company].filter(Boolean).join(' · ') || '—' }}</view>
          <view class="c-time">收藏于 {{ timeText(c.createdAt) }}<text class="c-grp" v-if="activeGroup === 'all'"> · {{ c.groupName }}</text></view>
        </view>
        <view class="c-act" @click.stop="remove(c)">
          <SIcon name="star" size="small" color="#ffd21e" />
          <text>已收藏</text>
        </view>
      </view>
    </view>
    <view class="msg-empty" v-else>
      <view class="me-icon"><SIcon name="star" size="xlarge" color="#c9cdd4" /></view>
      <view class="me-text">{{ activeGroup === 'all' ? '暂无收藏' : '该分组暂无名片' }}</view>
      <view class="me-hint" v-if="activeGroup === 'all'">浏览名片时点击"收藏"，会出现在这里；长按收藏可移动分组</view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';

const collects = ref([]);
const groups = ref([]);
const activeGroup = ref('all');

const shownCollects = computed(() => {
  if (activeGroup.value === 'all') return collects.value;
  return collects.value.filter((c) => c.groupName === activeGroup.value);
});

onMounted(() => { load(); });

async function load() {
  try {
    const res = await cardApi.getMyCollects(200);
    collects.value = res.collects || [];
    groups.value = res.groups || [];
    // 保证"未分组"Tab 存在（有收藏却无该组时补一个）
    if (collects.value.length && !groups.value.some((g) => g.name === '未分组')) {
      groups.value.unshift({ name: '未分组', count: collects.value.filter((c) => c.groupName === '未分组').length });
    }
  } catch (e) {}
}

async function addGroup() {
  // #ifdef H5
  const name = window.prompt('输入新分组名称（20字以内）');
  if (!name || !name.trim()) return;
  const n = String(name).trim().slice(0, 20);
  if (groups.value.some((g) => g.name === n)) return uni.showToast({ title: '分组已存在', icon: 'none' });
  try {
    await cardApi.createCollectGroup(n);
    const res = await cardApi.getMyCollects(200);
    groups.value = res.groups || [];
    if (!groups.value.some((g) => g.name === n)) groups.value.push({ name: n, count: 0 });
    activeGroup.value = n;
    uni.showToast({ title: '分组已创建', icon: 'success' });
  } catch (e) { uni.showToast({ title: e.message || '创建失败', icon: 'none' }); }
  // #endif
  // #ifndef H5
  uni.showModal({
    title: '新建分组',
    editable: true,
    placeholderText: '分组名称（20字以内）',
    success: async (r) => {
      if (!r.confirm || !r.content || !r.content.trim()) return;
      const n = String(r.content).trim().slice(0, 20);
      if (groups.value.some((g) => g.name === n)) return uni.showToast({ title: '分组已存在', icon: 'none' });
      try {
        await cardApi.createCollectGroup(n);
        const res = await cardApi.getMyCollects(200);
        groups.value = res.groups || [];
        if (!groups.value.some((g) => g.name === n)) groups.value.push({ name: n, count: 0 });
        activeGroup.value = n;
        uni.showToast({ title: '分组已创建', icon: 'success' });
      } catch (e) { uni.showToast({ title: e.message || '创建失败', icon: 'none' }); }
    },
  });
  // #endif
}

function delGroup(name) {
  uni.showModal({
    title: '删除分组',
    content: `删除「${name}」后，组内名片将移回「未分组」，确定删除？`,
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await cardApi.deleteCollectGroup(name);
        activeGroup.value = 'all';
        await load();
        uni.showToast({ title: '分组已删除', icon: 'success' });
      } catch (e) { uni.showToast({ title: e.message || '删除失败', icon: 'none' }); }
    },
  });
}

function moveGroup(c) {
  const names = groups.value.map((g) => g.name).filter((n) => n !== c.groupName);
  if (!names.length) return uni.showToast({ title: '暂无其他分组，先新建一个吧', icon: 'none' });
  uni.showActionSheet({
    itemList: names.map((n) => `移动到「${n}」`),
    success: async (r) => {
      const target = names[r.tapIndex];
      if (!target) return;
      try {
        await cardApi.moveCollectGroup(c.id, target);
        await load();
        uni.showToast({ title: `已移动到「${target}」`, icon: 'success' });
      } catch (e) { uni.showToast({ title: e.message || '移动失败', icon: 'none' }); }
    },
  });
}

async function remove(c) {
  try {
    await cardApi.uncollectCard(c.cardId);
    collects.value = collects.value.filter((x) => x.cardId !== c.cardId);
    await load();
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
.col-page { min-height: 100vh; background: var(--bg-page); padding-bottom: 80rpx; }
.msg-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 24rpx 28rpx; background: #fff;
  position: sticky; top: 0; z-index: 10;
}
.mn-back, .mn-clear { font-size: 28rpx; color: var(--t5); }
.mn-title { font-size: 32rpx; font-weight: 600; color: var(--t1); }
.mn-clear { color: var(--t3); }
.group-bar {
  display: flex; align-items: center; gap: 12rpx;
  background: #fff; padding: 0 28rpx 16rpx;
  border-bottom: 1px solid var(--border);
  position: sticky; top: 88rpx; z-index: 9;
}
.group-scroll { flex: 1; min-width: 0; }
.group-tabs { display: flex; gap: 12rpx; white-space: nowrap; }
.g-tab {
  font-size: 26rpx; color: var(--t3);
  background: var(--bg-page); border-radius: 999rpx;
  padding: 10rpx 24rpx; border: 1px solid var(--border);
}
.g-tab.on { color: #fff; background: #165dff; border-color: #165dff; }
.g-count { font-size: 22rpx; opacity: 0.75; margin-left: 4rpx; }
.group-ops { display: flex; gap: 8rpx; flex-shrink: 0; }
.g-op { font-size: 24rpx; color: #165dff; padding: 10rpx 12rpx; }
.col-list { padding: 20rpx 28rpx; }
.col-item {
  display: flex; align-items: center; gap: 22rpx;
  background: #fff; border-radius: 24rpx; padding: 26rpx;
  margin-bottom: 18rpx; border: 1px solid var(--border);
}
.c-av {
  width: 96rpx; height: 96rpx; border-radius: 50%; overflow: hidden;
  background: rgba(7, 193, 96, 0.1); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.c-av-img { width: 100%; height: 100%; }
.c-av-txt { font-size: 36rpx; font-weight: 600; color: var(--success); }
.c-info { flex: 1; min-width: 0; }
.c-name { font-size: 30rpx; font-weight: 600; color: var(--t1); }
.c-sub { font-size: 24rpx; color: var(--t3); margin-top: 6rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c-time { font-size: 22rpx; color: var(--border-strong); margin-top: 8rpx; }
.c-grp { color: #165dff; }
.c-act {
  display: flex; align-items: center; gap: 8rpx;
  font-size: 22rpx; color: var(--t3);
  background: var(--bg-card); border-radius: 999rpx; padding: 10rpx 20rpx;
  flex-shrink: 0;
}
.msg-empty { text-align: center; padding: 120rpx 40rpx; }
.me-icon { margin-bottom: 20rpx; }
.me-text { font-size: 30rpx; color: var(--t1); }
.me-hint { font-size: 24rpx; color: var(--t3); margin-top: 12rpx; }
</style>
