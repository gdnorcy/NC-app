<template>
  <view class="radar-page">
    <!-- 统计卡片（demo radar-stats） -->
    <view class="radar-stats">
      <view class="rstat up">
        <view class="lbl">今日访问</view>
        <view class="num"><text class="n">{{ displayToday }}</text><i>人</i></view>
        <view class="sub">
          <SIcon name="chart" size="small" color="#07c160" />
          <text>较昨日 {{ diffText }}</text>
        </view>
      </view>
      <view class="rstat blue">
        <view class="lbl">本周访问</view>
        <view class="num"><text class="n">{{ displayWeek }}</text><i>人</i></view>
        <view class="sub">
          <SIcon name="radar" size="small" color="#07c160" />
          <text>累计访问 {{ displayTotal }} 人</text>
        </view>
      </view>
    </view>

    <!-- 访客记录（demo card-row visitor） -->
    <view class="sec-t">访客记录 <small>{{ visitors.length }} 条</small></view>
    <view class="visitor-list" v-if="visitors.length">
      <view class="card-row visitor" v-for="v in visitors" :key="v.id" @click="viewTimeline(v)">
        <view class="v-av" :style="{ background: v.tagColor + '22', color: v.tagColor }">
          {{ v.nickname[0] || '访' }}
          <view class="red" v-if="v.unread"></view>
        </view>
        <view class="v-info">
          <view class="v-name">
            {{ v.nickname }}
            <text class="v-tag" :class="tagCls(v.tag)">{{ v.tag }}</text>
          </view>
          <view class="v-behav">{{ v.behavior }} · {{ v.timeAgo }}</view>
        </view>
        <view class="v-act" @click.stop="convert(v)">
          <view class="btn">转为客户</view>
        </view>
      </view>
    </view>
    <view class="empty-state" v-else>
      <view class="empty-icon"><SIcon name="analytics" size="xlarge" color="#c9cdd4" /></view>
      <view class="empty-text">暂无访客记录</view>
      <view class="empty-hint">分享名片后，访客行为将在这里展示</view>
    </view>

    <!-- 行为时间线弹层（demo openVisitor） -->
    <view class="sheet-mask" :class="{ on: showTimeline }" @click="closeTimeline"></view>
    <view class="sheet" :class="{ on: showTimeline }">
      <view class="grip"></view>
      <view class="sheet-title">{{ timelineName }} · 行为轨迹</view>
      <view class="sheet-sub">访客来源：微信名片分享</view>
      <view class="tline">
        <view class="tl-item" v-for="(t, i) in timelineItems" :key="i">
          <view class="tl-dot" :class="t.cls"><SIcon :name="t.icon" size="small" color="#ffffff" /></view>
          <view class="tl-t">{{ t.t }}</view>
          <view class="tl-s">{{ t.s }}</view>
        </view>
      </view>
      <view class="btn-main blue" @click="timelineToConvert">转为客户</view>
      <view class="btn-ghost" @click="closeTimeline">关闭</view>
    </view>

    <!-- 转为客户弹层（demo openConvert） -->
    <view class="sheet-mask" :class="{ on: showConvert }" @click="closeConvert"></view>
    <view class="sheet" :class="{ on: showConvert }">
      <view class="grip"></view>
      <view class="sheet-title">转为客户</view>
      <view class="sheet-sub">已自动回填访客来源与访问信息</view>
      <view class="card-row" style="display: flex; align-items: center; gap: 20rpx; margin: 24rpx 0">
        <view class="v-av" :style="{ background: current.tagColor + '22', color: current.tagColor }">{{ current.nickname[0] }}</view>
        <view style="flex: 1">
          <view class="sheet-name">{{ current.nickname }}</view>
          <view class="sheet-src">来源：名片访问 · {{ current.behavior }}</view>
        </view>
      </view>
      <view class="sheet-input-wrap"><input class="sheet-input" v-model="convName" placeholder="姓名" /></view>
      <view class="sheet-input-wrap"><input class="sheet-input" v-model="convPhone" type="number" placeholder="联系电话" /></view>
      <view class="sheet-input-wrap"><textarea class="sheet-textarea" v-model="convRemark" placeholder="备注（可选）" rows="2" /></view>
      <view class="btn-main" @click="saveConvert">保存并转为客户</view>
      <view class="btn-ghost" @click="closeConvert">取消</view>
    </view>

    <!-- 底部TabBar（公共组件） -->
    <CardTabBar active="radar" />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { onUnload } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { trackPageView } from '../../utils/analytics.js';
import { saveCardTabState, restoreScrollTop, h5ScrollTop } from '../../utils/cardTabState.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';

const summary = ref({ today: 0, week: 0, total: 0, diff: 0, visitors: [] });
const visitors = ref([]);
const displayToday = ref(0);
const displayWeek = ref(0);
const displayTotal = ref(0);

const showConvert = ref(false);
const showTimeline = ref(false);
const current = ref({});
const convName = ref('');
const convPhone = ref('');
const convRemark = ref('');
const timelineName = ref('');
const timelineItems = ref([]);

const diffText = computed(() => {
  const d = summary.value.diff || 0;
  return d > 0 ? `+${d}%` : d < 0 ? `${d}%` : '持平';
});

onShow(() => { trackPageView('/pages/card/visitors'); });

onMounted(async () => {
  restoreScrollTop('visitors');
  try {
    const res = await cardApi.getVisitorSummary();
    summary.value = res;
    visitors.value = res.visitors || [];
    animateNumber('today', res.today);
    animateNumber('week', res.week);
    animateNumber('total', res.total);
  } catch (e) {}
});

// 离开时保存滚动位置，切Tab返回后恢复
onUnload(() => {
  saveCardTabState('visitors', { scrollTop: h5ScrollTop() });
});

function animateNumber(key, target) {
  const duration = 800;
  const startTime = Date.now();
  function step() {
    const progress = Math.min((Date.now() - startTime) / duration, 1);
    const value = Math.round(target * (1 - Math.pow(1 - progress, 3)));
    if (key === 'today') displayToday.value = value;
    if (key === 'week') displayWeek.value = value;
    if (key === 'total') displayTotal.value = value;
    if (progress < 1) requestAnimationFrame(step);
  }
  step();
}

function tagCls(tag) {
  return { '高意向': 'green', '已交换名片': 'green', '观看视频': 'blue', '新访客': 'gray' }[tag] || 'gray';
}

async function viewTimeline(v) {
  if (v.visitorOpenid === 'anonymous') {
    uni.showToast({ title: '匿名访客暂无轨迹', icon: 'none' });
    return;
  }
  // 标记已读（红点消失）
  if (v.unread) {
    v.unread = false;
    try { await cardApi.markVisitorRead(v.visitorOpenid); } catch (e) {}
  }
  timelineName.value = v.nickname;
  timelineItems.value = buildDefaultTimeline(v);
  showTimeline.value = true;
  try {
    const res = await cardApi.getVisitorTimeline(v.visitorOpenid);
    if (res.actions && res.actions.length) {
      timelineItems.value = res.actions.map(mapAction);
    }
  } catch (e) {}
}

function mapAction(a) {
  const map = {
    exchange: { t: a.actionDetail || '交换电子名片', s: '已获取联系方式', cls: 'green', icon: 'card' },
    video: { t: a.actionDetail || '观看视频', s: a.duration ? `观看 ${a.duration} 秒` : '', cls: 'blue', icon: 'doc' },
    doc: { t: a.actionDetail || '浏览作品 / 简介', s: '来源：微信分享', cls: 'blue', icon: 'doc' },
    visit: { t: a.actionDetail || '访问了你的名片', s: '来源：微信分享', cls: 'gray', icon: 'analytics' },
  };
  return map[a.actionType] || { t: '访问了你的名片', s: '来源：微信分享', cls: 'gray', icon: 'analytics' };
}

function buildDefaultTimeline(v) {
  return [
    { t: '访问了你的名片', s: v.timeAgo, cls: 'gray', icon: 'analytics' },
    { t: v.behavior, s: '来源：微信分享', cls: 'blue', icon: 'doc' },
    { t: `停留 ${v.duration || 0} 秒`, s: '行为：浏览内容', cls: 'gray', icon: 'chart' },
    { t: '交换电子名片', s: '已获取联系方式', cls: 'green', icon: 'card' },
  ];
}

function timelineToConvert() {
  const v = visitors.value.find((x) => x.nickname === timelineName.value) || {};
  closeTimeline();
  setTimeout(() => convert(v), 250);
}

function convert(v) {
  current.value = v;
  convName.value = v.nickname && v.nickname !== '匿名访客' ? v.nickname : '';
  convPhone.value = '';
  convRemark.value = '';
  showConvert.value = true;
}

function closeTimeline() {
  showTimeline.value = false;
}

function closeConvert() {
  showConvert.value = false;
}

async function saveConvert() {
  if (!convName.value) {
    uni.showToast({ title: '请输入姓名', icon: 'none' });
    return;
  }
  try {
    await cardApi.createCustomer({
      name: convName.value,
      phone: convPhone.value,
      source: 'visitor',
      sourceCardId: current.value.cardId,
      tags: ['访客转化'],
    });
    showConvert.value = false;
    uni.showToast({ title: '已转为客户', icon: 'success' });
  } catch (e) {
    uni.showToast({ title: e.message || '转化失败', icon: 'none' });
  }
}
</script>

<style scoped>
.radar-page {
  min-height: 100vh;
  background: #f5f6f7;
  padding-bottom: 160rpx;
}

/* ===== 统计卡片（demo radar-stats）===== */
.radar-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22rpx;
  margin: 24rpx 28rpx 8rpx;
}
.rstat {
  background: #fff;
  border-radius: 32rpx;
  padding: 30rpx;
  border: 1px solid #e5e6eb;
  box-shadow: 0 2px 10px rgba(0,0,0,0.04);
}
.rstat .lbl {
  font-size: 24rpx;
  color: #9a9a9a;
}
.rstat .num {
  font-size: 52rpx;
  font-weight: 700;
  margin-top: 8rpx;
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: baseline;
}
.rstat .num .n {
  color: #1a1a1a;
  line-height: 1;
}
.rstat .num i {
  font-style: normal;
  font-size: 26rpx;
  font-weight: 500;
  color: #9a9a9a;
  margin-left: 4rpx;
}
.rstat .sub {
  font-size: 22rpx;
  color: #07c160;
  margin-top: 10rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

/* ===== 访客记录（demo card-row 独立卡片）===== */
.sec-t {
  margin: 36rpx 28rpx 20rpx;
  font-size: 28rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #1a1a1a;
}
.sec-t small {
  font-size: 22rpx;
  color: #9a9a9a;
  font-weight: 400;
}
.card-row.visitor {
  display: flex;
  align-items: center;
  background: #fff;
  margin: 0 28rpx 24rpx;
  border-radius: 32rpx;
  padding: 30rpx;
  box-shadow: 0 2px 10px rgba(0,0,0,0.04);
  border: 1px solid #e5e6eb;
}
.v-av {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: #e7f7ee;
  color: #07c160;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 28rpx;
  flex-shrink: 0;
  position: relative;
}
.v-av .red {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #ff4d4f;
  border: 2px solid #fff;
  animation: blink 1.6s infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.v-info {
  flex: 1;
  margin-left: 20rpx;
  min-width: 0;
}
.v-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #1a1a1a;
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-wrap: wrap;
}
.v-tag {
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  font-weight: 500;
  white-space: nowrap;
}
.v-tag.green {
  background: #e7f7ee;
  color: #0b8f4a;
}
.v-tag.blue {
  background: #e9f1fb;
  color: #2e6bb8;
}
.v-tag.gray {
  background: #f0f0f0;
  color: #9a9a9a;
}
.v-behav {
  font-size: 22rpx;
  color: #9a9a9a;
  margin-top: 6rpx;
}
.v-act {
  flex-shrink: 0;
}
.v-act .btn {
  font-size: 24rpx;
  font-weight: 600;
  padding: 14rpx 26rpx;
  border-radius: 18rpx;
  background: #e7f7ee;
  color: #07c160;
}

/* ===== 空状态 ===== */
.empty-state {
  text-align: center;
  padding: 100rpx 0;
}
.empty-icon {
  margin-bottom: 20rpx;
}
.empty-text {
  font-size: 28rpx;
  color: #4e5969;
  margin-bottom: 8rpx;
}
.empty-hint {
  font-size: 24rpx;
  color: #9a9a9a;
}

/* ===== 弹层（demo sheet-mask / sheet）===== */
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 90;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
}
.sheet-mask.on {
  opacity: 1;
  pointer-events: auto;
}
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fff;
  border-radius: 56rpx 56rpx 0 0;
  padding: 40rpx 64rpx calc(40rpx + env(safe-area-inset-bottom));
  z-index: 91;
  transform: translateY(100%);
  transition: transform 0.25s ease-out;
}
.sheet.on {
  transform: translateY(0);
}
.grip {
  width: 76rpx;
  height: 8rpx;
  border-radius: 4rpx;
  background: #e2e2e2;
  margin: 0 auto 28rpx;
}
.sheet-title {
  font-size: 32rpx;
  font-weight: 700;
  text-align: center;
  color: #1a1a1a;
}
.sheet-sub {
  font-size: 24rpx;
  color: #9a9a9a;
  text-align: center;
  margin-top: 10rpx;
  line-height: 1.6;
}
.sheet-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #1a1a1a;
}
.sheet-src {
  font-size: 22rpx;
  color: #9a9a9a;
  margin-top: 4rpx;
}

/* ===== 时间线（demo tline）===== */
.tline {
  margin: 28rpx 0 0;
}
.tl-item {
  position: relative;
  padding: 0 0 40rpx 52rpx;
}
.tl-item:last-child {
  padding-bottom: 8rpx;
}
.tl-dot {
  position: absolute;
  left: 0;
  top: 4rpx;
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tl-dot.gray {
  background: #c9cdd3;
}
.tl-dot.blue {
  background: #2e6bb8;
}
.tl-dot.green {
  background: #07c160;
}
.tl-t {
  font-size: 26rpx;
  color: #5b5b5b;
}
.tl-s {
  font-size: 22rpx;
  color: #9a9a9a;
  margin-top: 4rpx;
}

/* ===== 表单 ===== */
.sheet-input-wrap {
  margin-bottom: 20rpx;
}
.sheet-input {
  border: 1px solid #e5e6eb;
  border-radius: 22rpx;
  padding: 24rpx 26rpx;
  font-size: 28rpx;
  background: #fff;
  color: #1a1a1a;
  width: auto;
}
.sheet-textarea {
  border: 1px solid #e5e6eb;
  border-radius: 22rpx;
  padding: 24rpx 26rpx;
  font-size: 28rpx;
  width: auto;
  min-height: 120rpx;
  background: #fff;
  color: #1a1a1a;
  resize: none;
}

/* ===== 按钮（demo btn-main / btn-ghost）===== */
.btn-main {
  width: 100%;
  box-sizing: border-box;
  background: #07c160;
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  padding: 28rpx;
  border-radius: 26rpx;
  margin-top: 32rpx;
  text-align: center;
  transition: opacity 0.15s;
}
.btn-main.blue {
  background: #2e6bb8;
}
.btn-main:active {
  opacity: 0.75;
}
.btn-ghost {
  width: 100%;
  box-sizing: border-box;
  background: #f5f6f7;
  color: #5b5b5b;
  font-size: 28rpx;
  padding: 26rpx;
  border-radius: 26rpx;
  margin-top: 20rpx;
  text-align: center;
}
</style>
