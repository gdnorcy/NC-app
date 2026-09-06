<template>
  <view class="radar-page">
    <!-- 顶部导航栏 -->
    <view class="nav-bar">
      <view class="nav-back" @click="goBack">
        <SIcon name="dynamic" size="default" color="#1d2129" />
      </view>
      <view class="nav-title">访客雷达</view>
      <view class="nav-right"></view>
    </view>

    <!-- 统计卡片（demo radar-stats） -->
    <view class="radar-stats">
      <view class="rstat up">
        <view class="lbl">今日访问</view>
        <view class="num"><text class="n">{{ displayToday }}</text><i>人</i></view>
        <view class="sub">
          <SIcon name="chart" size="small" :color="diffColor" />
          <text :style="{ color: diffColor }">较昨日 {{ diffText }}</text>
        </view>
      </view>
      <view class="rstat blue">
        <view class="lbl">本周访问</view>
        <view class="num"><text class="n">{{ displayWeek }}</text><i>人</i></view>
        <view class="sub">
          <SIcon name="radar" size="small" color="#1d4e8f" />
          <text style="color: #1d4e8f">累计访问 {{ displayTotal }} 人</text>
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
            <text class="v-tag" :class="{ gray: v.tag === '新访客' }" :style="{ color: v.tagColor, background: v.tagColor + '1a' }">{{ v.tag }}</text>
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

    <!-- 转为客户弹层（demo sheet） -->
    <view class="sheet-mask" v-if="showConvert" @click="closeConvert"></view>
    <view class="sheet" v-if="showConvert">
      <view class="grip"></view>
      <view class="sheet-title">转为客户</view>
      <view class="sheet-sub">已自动回填访客来源与访问信息</view>
      <view class="sheet-person">
        <view class="v-av" :style="{ background: current.tagColor + '22', color: current.tagColor }">{{ current.nickname[0] }}</view>
        <view class="sheet-info">
          <view class="sheet-name">{{ current.nickname }}</view>
          <view class="sheet-src">来源：名片访问 · {{ current.behavior }}</view>
        </view>
      </view>
      <input class="sheet-input" v-model="convName" placeholder="姓名" />
      <input class="sheet-input" v-model="convPhone" type="number" placeholder="联系电话" />
      <textarea class="sheet-textarea" v-model="convRemark" placeholder="备注（可选）" rows="2" />
      <view class="btn-main" @click="saveConvert">保存并转为客户</view>
      <view class="btn-ghost" @click="closeConvert">取消</view>
    </view>

    <!-- 底部TabBar（公共组件：名片/雷达/集市/会员） -->
    <CardTabBar active="radar" />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';

const summary = ref({ today: 0, week: 0, total: 0, diff: 0, visitors: [] });
const visitors = ref([]);
const displayToday = ref(0);
const displayWeek = ref(0);
const displayTotal = ref(0);

const showConvert = ref(false);
const current = ref({});
const convName = ref('');
const convPhone = ref('');
const convRemark = ref('');

const diffText = computed(() => {
  const d = summary.value.diff || 0;
  return d > 0 ? `+${d}%` : d < 0 ? `${d}%` : '持平';
});
const diffColor = computed(() => {
  const d = summary.value.diff || 0;
  return d > 0 ? '#07c160' : d < 0 ? '#f53f3f' : '#9a9a9a';
});

onMounted(async () => {
  try {
    const res = await cardApi.getVisitorSummary();
    summary.value = res;
    visitors.value = res.visitors || [];
    animateNumber('today', res.today);
    animateNumber('week', res.week);
    animateNumber('total', res.total);
  } catch (e) {}
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

function viewTimeline(v) {
  if (v.visitorOpenid === 'anonymous') return;
  uni.navigateTo({ url: `/pages/card/visitorTimeline?openid=${v.visitorOpenid}` });
}

function convert(v) {
  current.value = v;
  convName.value = v.nickname === '匿名访客' ? '' : v.nickname;
  convPhone.value = '';
  convRemark.value = '';
  showConvert.value = true;
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

function goBack() {
  uni.navigateBack();
}
</script>

<style scoped>
.radar-page {
  min-height: 100vh;
  background: #f5f6f7;
  padding-bottom: 60rpx;
}

/* 顶部导航栏 */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88rpx;
  padding: 88rpx 32rpx 0;
  background: #fff;
}
.nav-back {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1d2129;
}
.nav-right {
  width: 64rpx;
}

/* ===== 统计卡片（demo radar-stats）===== */
.radar-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
  padding: 24rpx 28rpx;
}
.rstat {
  background: #fff;
  border-radius: 24rpx;
  padding: 28rpx 28rpx 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.rstat.up {
  background: linear-gradient(155deg, #e8f8ef, #ffffff);
}
.rstat.blue {
  background: linear-gradient(155deg, #e6f0fb, #ffffff);
}
.lbl {
  font-size: 24rpx;
  color: #4e5969;
}
.num {
  display: flex;
  align-items: baseline;
  gap: 6rpx;
  margin-top: 10rpx;
}
.num .n {
  font-size: 56rpx;
  font-weight: 700;
  color: #1a1a1a;
  line-height: 1;
}
.num i {
  font-style: normal;
  font-size: 24rpx;
  color: #9a9a9a;
}
.sub {
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin-top: 14rpx;
  font-size: 22rpx;
}

/* ===== 访客记录（demo card-row visitor）===== */
.sec-t {
  margin: 16rpx 32rpx 20rpx;
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
.visitor-list {
  margin: 0 28rpx;
  background: #fff;
  border-radius: 24rpx;
  padding: 8rpx 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.card-row.visitor {
  display: flex;
  align-items: center;
  padding: 26rpx 0;
  border-bottom: 1px dashed #f0f0f0;
}
.card-row.visitor:last-child {
  border-bottom: none;
}
.v-av {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  font-weight: 600;
  position: relative;
  flex-shrink: 0;
}
.v-av .red {
  position: absolute;
  right: 2rpx;
  top: 2rpx;
  width: 16rpx;
  height: 16rpx;
  background: #f53f3f;
  border-radius: 50%;
  border: 2rpx solid #fff;
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
}
.v-tag {
  font-size: 20rpx;
  font-weight: 400;
  padding: 0 12rpx;
  border-radius: 8rpx;
  line-height: 32rpx;
}
.v-behav {
  font-size: 22rpx;
  color: #9a9a9a;
  margin-top: 8rpx;
}
.v-act {
  flex-shrink: 0;
}
.btn {
  font-size: 22rpx;
  color: #165dff;
  border: 1px solid #165dff;
  border-radius: 14rpx;
  padding: 8rpx 20rpx;
  background: #fff;
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

/* ===== 转为客户弹层（demo sheet）===== */
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 90;
  animation: fadeIn 0.2s;
}
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fff;
  border-radius: 28rpx 28rpx 0 0;
  padding: 20rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
  z-index: 91;
  animation: slideUp 0.25s;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes slideUp {
  from { transform: translateY(60rpx); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.grip {
  width: 72rpx;
  height: 8rpx;
  border-radius: 8rpx;
  background: #e5e6eb;
  margin: 8rpx auto 24rpx;
}
.sheet-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1a1a1a;
}
.sheet-sub {
  font-size: 23rpx;
  color: #9a9a9a;
  margin-top: 8rpx;
}
.sheet-person {
  display: flex;
  align-items: center;
  gap: 20rpx;
  background: #f7f8fa;
  border-radius: 16rpx;
  padding: 20rpx;
  margin: 24rpx 0;
}
.sheet-info {
  flex: 1;
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
.sheet-input {
  border: 1px solid #e5e6eb;
  border-radius: 22rpx;
  padding: 24rpx 26rpx;
  font-size: 28rpx;
  margin-bottom: 20rpx;
  background: #fff;
  color: #1a1a1a;
}
.sheet-textarea {
  border: 1px solid #e5e6eb;
  border-radius: 22rpx;
  padding: 24rpx 26rpx;
  font-size: 28rpx;
  width: auto;
  min-height: 120rpx;
  margin-bottom: 24rpx;
  background: #fff;
  color: #1a1a1a;
}
.btn-main {
  background: #07c160;
  color: #fff;
  text-align: center;
  border-radius: 22rpx;
  padding: 26rpx 0;
  font-size: 30rpx;
  font-weight: 500;
}
.btn-ghost {
  text-align: center;
  border-radius: 22rpx;
  padding: 24rpx 0;
  font-size: 28rpx;
  color: #4e5969;
  margin-top: 16rpx;
}
</style>
