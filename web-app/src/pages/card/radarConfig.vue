<template>
  <view class="rc-page">
    <view class="msg-nav">
      <view class="mn-back" @click="goBack"><SIcon name="dynamic" size="default" color="#1a1a1a" /></view>
      <view class="mn-title">雷达配置</view>
      <view class="mn-clear" @click="load">刷新</view>
    </view>

    <!-- 推送开关 -->
    <view class="rc-card">
      <view class="rc-head">推送提醒</view>
      <view class="rc-row">
        <view class="rc-row-main">
          <view class="rc-name">开启高意向访客提醒</view>
          <view class="rc-desc">高意向访客行为发生时，第一时间通知你</view>
        </view>
        <switch :checked="config.switch === 1" color="#07c160" @change="toggleSwitch" />
      </view>
      <view class="rc-sub" v-if="saving">保存中…</view>
    </view>

    <!-- 订阅授权引导（阶段D联调微信/公众号通道；阶段C仅留存授权记录） -->
    <view class="rc-card">
      <view class="rc-head">微信订阅提醒</view>
      <view class="rc-row">
        <view class="rc-row-main">
          <view class="rc-name">订阅消息授权</view>
          <view class="rc-desc">授权后访客动态将通过微信订阅消息推送（通道联调中）</view>
        </view>
        <view class="rc-btn" :class="{ on: subscribed }" @click="subscribe">{{ subscribed ? '已开启' : '开启提醒' }}</view>
      </view>
    </view>

    <!-- 话术库设置 -->
    <view class="rc-card">
      <view class="rc-head">AI 话术库</view>
      <view class="rc-desc rc-pad">访客命中关键行为时，自动推荐对应跟进话术</view>
      <view class="rc-group" v-for="g in groups" :key="g.eventId">
        <view class="rc-group-t">{{ g.title || g.name }}<text class="rc-imp" v-if="g.importance">· {{ g.importance }}</text></view>
        <view class="rc-word" v-for="(w, i) in g.words" :key="i">
          <text class="rc-word-t">{{ w.words }}</text>
          <text class="rc-word-time">{{ timeRange(w) }}</text>
        </view>
        <view class="rc-word empty" v-if="!g.words.length">暂无话术，可下方添加</view>
      </view>
      <!-- 新增话术 -->
      <view class="rc-add">
        <picker :range="groupNames" @change="onPickGroup">
          <view class="rc-pick">{{ newEventName || '选择事件' }} ▾</view>
        </picker>
        <textarea class="rc-ta" v-model="newWords" placeholder="输入推荐话术内容（可选时间段后生效）" placeholder-class="ph" rows="2" />
        <view class="rc-btn main" @click="addWord">添加话术</view>
      </view>
    </view>

    <!-- 转发追踪 -->
    <view class="rc-card">
      <view class="rc-head">转发追踪</view>
      <view class="rc-desc rc-pad">名片被转发后的传播记录</view>
      <view class="rc-share" v-if="shares.length">
        <view class="rc-share-item" v-for="(s, i) in shares" :key="i">
          <view class="rs-av"><SIcon name="channel" size="small" color="#ffffff" /></view>
          <view class="rs-body">
            <view class="rs-t">转发给新访客</view>
            <view class="rs-s">{{ s.toOpenid ? shortOpenid(s.toOpenid) : '未知来源' }} · {{ timeText(s.createdAt) }}</view>
          </view>
        </view>
      </view>
      <view class="rc-share empty" v-else>暂无转发记录</view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import SIcon from '../../components/SIcon.vue';

const config = ref({ switch: 0 });
const subscribed = ref(false);
const groups = ref([]);
const shares = ref([]);
const saving = ref(false);

const newEventId = ref(0);
const newEventName = ref('');
const newWords = ref('');
const groupNames = computed(() => groups.value.map((g) => g.title || g.name));

onMounted(() => { load(); });

async function load() {
  try {
    const cfg = await cardApi.getRadarConfig();
    config.value = cfg.config || { switch: 0 };
    const w = await cardApi.getRadarWords();
    groups.value = w.groups || [];
    const s = await cardApi.getRadarShares(50);
    shares.value = s.shares || [];
  } catch (e) {}
}

async function toggleSwitch(e) {
  const next = e.detail.value ? 1 : 0;
  saving.value = true;
  try {
    await cardApi.saveRadarConfig({ switch: next });
    config.value.switch = next;
    uni.showToast({ title: next ? '已开启提醒' : '已关闭提醒', icon: 'none' });
  } catch (err) {
    config.value.switch = config.value.switch === 1 ? 0 : 1;
    uni.showToast({ title: err.message || '保存失败', icon: 'none' });
  } finally {
    saving.value = false;
  }
}

async function subscribe() {
  if (subscribed.value) return;
  try {
    await cardApi.radarSubscribe({ granted: true, tmplIds: [] });
    subscribed.value = true;
    uni.showToast({ title: '已开启（通道联调中，后续生效）', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: e.message || '开启失败', icon: 'none' });
  }
}

function onPickGroup(e) {
  const g = groups.value[Number(e.detail.value)];
  if (g) { newEventId.value = g.eventId; newEventName.value = g.title || g.name; }
}

async function addWord() {
  if (!newEventId.value) return uni.showToast({ title: '请选择事件', icon: 'none' });
  if (!newWords.value.trim()) return uni.showToast({ title: '请输入话术内容', icon: 'none' });
  try {
    await cardApi.saveRadarWord({ eventId: newEventId.value, timeStart: 0, timeEnd: 0, words: newWords.value.trim() });
    uni.showToast({ title: '话术已添加', icon: 'success' });
    newWords.value = '';
    await load();
  } catch (e) {
    uni.showToast({ title: e.message || '添加失败', icon: 'none' });
  }
}

function timeRange(w) {
  if (!w.time_start && !w.time_end) return '长期有效';
  return `${w.time_start || 0}–${w.time_end || '不限'} 天`;
}

function shortOpenid(s) {
  if (s.length <= 12) return s;
  return s.slice(0, 6) + '…' + s.slice(-4);
}

function timeText(t) {
  if (!t) return '';
  const diff = (Date.now() - new Date(String(t).replace(' ', 'T')).getTime()) / 1000;
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
.rc-page { min-height: 100vh; background: #f5f6f7; padding-bottom: 80rpx; }
.msg-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 24rpx 28rpx; background: #fff;
  position: sticky; top: 0; z-index: 10;
}
.mn-back, .mn-clear { font-size: 28rpx; color: #1a1a1a; }
.mn-title { font-size: 32rpx; font-weight: 600; color: #1d2129; }
.mn-clear { color: #86909c; }
.rc-card {
  background: #fff; border-radius: 24rpx; padding: 28rpx;
  margin: 20rpx 28rpx; border: 1px solid #e5e6eb;
}
.rc-head { font-size: 30rpx; font-weight: 600; color: #1d2129; }
.rc-pad { padding: 12rpx 0 8rpx; }
.rc-desc { font-size: 24rpx; color: #86909c; }
.rc-sub { font-size: 22rpx; color: #c9cdd4; margin-top: 12rpx; }
.rc-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 20rpx; margin-top: 20rpx;
}
.rc-row-main { flex: 1; min-width: 0; }
.rc-name { font-size: 28rpx; color: #1d2129; }
.rc-row-main .rc-desc { margin-top: 6rpx; }
.rc-btn {
  font-size: 24rpx; color: #86909c;
  background: #f2f3f5; border-radius: 999rpx; padding: 12rpx 28rpx;
  flex-shrink: 0;
}
.rc-btn.on { color: #07c160; background: rgba(7, 193, 96, 0.1); }
.rc-btn.main { color: #fff; background: #07c160; text-align: center; margin-top: 16rpx; }
.rc-group { margin-top: 24rpx; border-top: 1px solid #f2f3f5; padding-top: 20rpx; }
.rc-group-t { font-size: 26rpx; font-weight: 600; color: #4e5969; margin-bottom: 12rpx; }
.rc-imp { font-size: 22rpx; color: #ff8800; font-weight: 400; }
.rc-word {
  font-size: 24rpx; color: #4e5969; background: #f7f8fa;
  border-radius: 12rpx; padding: 14rpx 18rpx; margin-bottom: 10rpx; line-height: 1.5;
}
.rc-word.empty { color: #c9cdd4; background: none; }
.rc-word-t { display: block; }
.rc-word-time { font-size: 20rpx; color: #86909c; }
.rc-add { margin-top: 24rpx; border-top: 1px solid #f2f3f5; padding-top: 20rpx; }
.rc-pick {
  font-size: 26rpx; color: #1d2129; background: #f7f8fa;
  border-radius: 12rpx; padding: 16rpx 20rpx; margin-bottom: 14rpx;
}
.rc-ta {
  width: 100%; box-sizing: border-box; font-size: 26rpx; color: #1d2129;
  background: #f7f8fa; border-radius: 12rpx; padding: 16rpx 20rpx; min-height: 100rpx;
}
.rc-share { margin-top: 20rpx; }
.rc-share-item {
  display: flex; align-items: center; gap: 18rpx;
  padding: 16rpx 0; border-bottom: 1px solid #f2f3f5;
}
.rc-share-item:last-child { border-bottom: none; }
.rs-av {
  width: 56rpx; height: 56rpx; border-radius: 50%; background: #165dff;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.rs-body { flex: 1; min-width: 0; }
.rs-t { font-size: 28rpx; color: #1d2129; }
.rs-s { font-size: 22rpx; color: #86909c; margin-top: 6rpx; }
.rc-share.empty { font-size: 24rpx; color: #c9cdd4; text-align: center; padding: 24rpx 0; }
</style>
