<template>
  <view class="radar-page">
    <!-- 付费解锁引导（免费/过期用户） -->
    <view class="radar-locked" v-if="locked">
      <view class="lock-card">
        <view class="lock-icon"><SIcon name="radar" size="xlarge" color="#07c160" /></view>
        <view class="lock-title">访客雷达</view>
        <view class="lock-desc">解锁后查看谁看过你的名片</view>
        <view class="lock-benefits">
          <view class="lb-item"><SIcon name="chart" size="small" color="#07c160" /><text>今日/本周访问统计</text></view>
          <view class="lb-item"><SIcon name="customer" size="small" color="#07c160" /><text>访客行为轨迹追踪</text></view>
          <view class="lb-item"><SIcon name="exchange" size="small" color="#07c160" /><text>高意向访客识别</text></view>
        </view>
        <view class="btn-main" @click="goMember">立即解锁</view>
        <view class="lock-foot">开通黄金会员 · 全部功能畅享</view>
      </view>
    </view>

    <!-- 统计卡片（demo radar-stats） -->
    <view class="radar-stats" v-else>
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

    <!-- 近7日访问趋势（AI雷达） -->
    <view class="trend-card" v-if="!locked && trend.length">
      <view class="trend-head">
        <text class="trend-t">近7日访问趋势</text>
        <text class="trend-peak">峰值 {{ trendPeak }} 次</text>
      </view>
      <view class="trend-bars">
        <view class="tbar" v-for="(d, i) in trend" :key="i" @click="trendTip = d">
          <view class="tbar-col">
            <view class="tbar-val" v-if="d.count">{{ d.count }}</view>
            <view
              class="tbar-fill"
              :class="{ hot: d.count === trendPeak && d.count > 0 }"
              :style="{ height: barHeight(d.count) }"
            ></view>
          </view>
          <text class="tbar-lbl">{{ d.date }}</text>
        </view>
      </view>
    </view>

    <!-- 高潜榜（会员内，AI 意向识别） -->
    <view class="lead-card" v-if="!locked && topLeads.length">
      <view class="sec-t lead-sec">
        <text>高潜榜 <small>AI 意向识别</small></text>
        <view class="lead-ai" v-if="hasFeature('ai_report')" @click="openAiReport">AI 意向报告</view>
        <view class="lead-ai locked" v-else @click="goMember">升级查看</view>
      </view>
      <view class="lead-list">
        <view class="lead-row" v-for="(l, i) in topLeads" :key="i" @click="viewLeadIntent(l)">
          <view class="lead-rank" :class="{ hot: i < 3 }">{{ i + 1 }}</view>
          <view class="lead-info">
            <view class="lead-name">
              {{ leadName(l) }}
              <text class="lead-lv" :class="l.level === '高意向' ? 'green' : (l.level === '中意向' ? 'blue' : 'gray')">{{ l.level }}</text>
            </view>
            <view class="lead-meta">意向分 {{ l.score }} · 命中 {{ l.hitCount }} 次</view>
            <view class="lead-words" v-if="l.words && l.words.length">建议：{{ l.words[0] }}</view>
          </view>
        </view>
      </view>
    </view>

    <!-- AI 意向报告弹层（ai_report 权益） -->
    <view class="sheet-mask" :class="{ on: showAiReport }" @click="showAiReport = false"></view>
    <view class="sheet" :class="{ on: showAiReport }">
      <view class="grip"></view>
      <view class="sheet-title">AI 意向报告</view>
      <view class="sheet-sub">基于近期访客行为生成 · 数据每 5 分钟更新</view>
      <view class="ai-report">
        <view class="ai-row">
          <view class="ai-k">高意向访客</view>
          <view class="ai-v">{{ aiHigh }} 人</view>
        </view>
        <view class="ai-row">
          <view class="ai-k">中意向访客</view>
          <view class="ai-v">{{ aiMid }} 人</view>
        </view>
        <view class="ai-row">
          <view class="ai-k">低意向访客</view>
          <view class="ai-v">{{ aiLow }} 人</view>
        </view>
        <view class="ai-row">
          <view class="ai-k">建议优先跟进</view>
          <view class="ai-v">{{ aiSuggest }}</view>
        </view>
      </view>
      <view class="btn-main blue" @click="showAiReport = false">知道了</view>
    </view>

    <!-- 意向详情弹层（会员内） -->
    <view class="sheet-mask" :class="{ on: showLeadIntent }" @click="closeLeadIntent"></view>
    <view class="sheet" :class="{ on: showLeadIntent }">
      <view class="grip"></view>
      <view class="sheet-title">{{ leadIntent ? leadIntent.visitorName : '' }} · 意向详情</view>
      <view class="sheet-sub" v-if="leadIntent">意向分 {{ leadIntent.score }} / 100 · 命中 {{ leadIntent.hitCount }} 次</view>
      <view class="li-box" v-if="leadIntent">
        <view class="li-item" v-for="(t, i) in leadIntent.items" :key="i">
          <view class="li-dot" :class="t.cls"><SIcon :name="t.icon" size="small" color="#ffffff" /></view>
          <view class="li-t">{{ t.t }}</view>
          <view class="li-s">{{ t.s }}</view>
        </view>
      </view>
      <view class="li-words" v-if="leadIntent && leadIntent.words && leadIntent.words.length">
        <view class="li-words-t">推荐跟进话术</view>
        <view class="li-words-c" v-for="(w, i) in leadIntent.words" :key="i">{{ w }}</view>
      </view>
      <view class="btn-main" @click="convertFromIntent">转为客户</view>
      <view class="btn-ghost" @click="closeLeadIntent">关闭</view>
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
            <text class="v-score" v-if="v.score !== undefined" :style="{ color: v.levelColor }">{{ v.level }} {{ v.score }}分</text>
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
const trend = ref([]);
const displayToday = ref(0);
const displayWeek = ref(0);
const displayTotal = ref(0);
const locked = ref(false);
const topLeads = ref([]);
const features = ref([]);
const showAiReport = ref(false);
const showLeadIntent = ref(false);
const leadIntent = ref(null);

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

// 7日趋势峰值与柱高
const trendPeak = computed(() => Math.max(1, ...(trend.value.map(d => d.count || 0))));
function barHeight(count) {
  const max = trendPeak.value;
  const h = max > 0 ? Math.round(((count || 0) / max) * 72) : 2;
  return Math.max(2, h) + 'rpx';
}

onShow(() => { trackPageView('/pages/card/visitors'); });

onMounted(async () => {
  restoreScrollTop('visitors');
  try {
    const res = await cardApi.getVisitorSummary();
    if (res && res.locked) { locked.value = true; return; }
    summary.value = res;
    visitors.value = res.visitors || [];
    trend.value = res.trend || [];
    animateNumber('today', res.today);
    animateNumber('week', res.week);
    animateNumber('total', res.total);
    // 阶段C：会员权益 + 高潜榜（免费用户在 locked 分支已 return）
    try {
      const feat = await cardApi.getRadarFeatures();
      features.value = feat.features || [];
      const leads = await cardApi.getRadarTopLeads(10);
      topLeads.value = leads.leads || [];
    } catch (e) {}
  } catch (e) {}
});

function goMember() {
  uni.navigateTo({ url: '/pages/card/member' });
}

// ===== 阶段C：高潜榜 / AI 报告 / 意向详情 =====
function hasFeature(f) {
  return (features.value || []).includes(f);
}

function leadName(l) {
  const v = (visitors.value || []).find((x) => x.visitorOpenid === l.visitorOpenid);
  return (v && v.nickname && v.nickname !== '匿名访客') ? v.nickname : '匿名访客';
}

const aiHigh = computed(() => topLeads.value.filter((l) => l.level === '高意向').length);
const aiMid = computed(() => topLeads.value.filter((l) => l.level === '中意向').length);
const aiLow = computed(() => topLeads.value.filter((l) => l.level === '低意向').length);
const aiSuggest = computed(() => {
  const t = topLeads.value[0];
  return t ? `${leadName(t)}（意向 ${t.score} 分）` : '暂无高潜访客';
});

function openAiReport() {
  if (!hasFeature('ai_report')) return goMember();
  showAiReport.value = true;
}

async function viewLeadIntent(l) {
  if (!l.visitorOpenid || l.visitorOpenid === 'anonymous') {
    uni.showToast({ title: '匿名访客暂无意向详情', icon: 'none' });
    return;
  }
  leadIntent.value = { visitorOpenid: l.visitorOpenid, visitorName: leadName(l), score: l.score, hitCount: l.hitCount, words: l.words || [], items: [
    { t: '访问你的名片', s: '来源：微信分享', cls: 'gray', icon: 'analytics' },
    { t: '命中 ' + l.hitCount + ' 个关键行为', s: '意向分 ' + l.score + ' 分', cls: l.level === '高意向' ? 'green' : 'blue', icon: 'radar' },
  ] };
  showLeadIntent.value = true;
  try {
    const res = await cardApi.getRadarIntent(l.visitorOpenid);
    if (res.intent) {
      leadIntent.value.score = res.intent.score;
      leadIntent.value.hitCount = res.intent.hit_count;
      leadIntent.value.items = [
        { t: '访问你的名片', s: '来源：微信分享', cls: 'gray', icon: 'analytics' },
        { t: '关键行为 ' + res.intent.hit_count + ' 次', s: '意向分 ' + res.intent.score + ' 分', cls: res.intent.level === '高意向' ? 'green' : 'blue', icon: 'radar' },
      ];
      leadIntent.value.words = res.intent.words || [];
    }
  } catch (e) {}
}

function closeLeadIntent() {
  showLeadIntent.value = false;
  leadIntent.value = null;
}

function convertFromIntent() {
  if (!leadIntent.value) return;
  const v = (visitors.value || []).find((x) => x.visitorOpenid === (leadIntent.value.visitorOpenid || ''));
  closeLeadIntent();
  setTimeout(() => convert(v || { nickname: leadIntent.value.visitorName, tag: '高意向' }), 250);
}

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

/* ===== 付费解锁引导 ===== */
.radar-locked {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx 40rpx;
  box-sizing: border-box;
}
.lock-card {
  width: 100%;
  background: #ffffff;
  border-radius: 24rpx;
  padding: 64rpx 40rpx 48rpx;
  text-align: center;
  box-shadow: 0 8rpx 40rpx rgba(0, 0, 0, 0.06);
}
.lock-icon {
  width: 128rpx;
  height: 128rpx;
  margin: 0 auto 28rpx;
  background: rgba(7, 193, 96, 0.08);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lock-title {
  font-size: 40rpx;
  font-weight: 600;
  color: #1d2129;
}
.lock-desc {
  font-size: 26rpx;
  color: #86909c;
  margin-top: 12rpx;
}
.lock-benefits {
  margin: 40rpx 0 48rpx;
  text-align: left;
}
.lb-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  font-size: 28rpx;
  color: #4e5969;
  padding: 16rpx 8rpx;
}
.lb-item text { flex: 1; }
.lock-foot {
  font-size: 24rpx;
  color: #86909c;
  margin-top: 24rpx;
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

/* ===== 近7日访问趋势 ===== */
.trend-card {
  margin: 24rpx 28rpx 0;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx 24rpx 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(31, 42, 68, 0.05);
}
.trend-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}
.trend-t { font-size: 28rpx; font-weight: 600; color: #1D2129; }
.trend-peak { font-size: 22rpx; color: #86909C; }
.trend-bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 110rpx;
}
.tbar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 6rpx;
}
.tbar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 88rpx;
}
.tbar-val {
  font-size: 18rpx;
  color: #4E5969;
  margin-bottom: 4rpx;
}
.tbar-fill {
  width: 24rpx;
  border-radius: 6rpx 6rpx 2rpx 2rpx;
  background: rgba(22, 93, 255, 0.25);
  min-height: 2rpx;
  transition: height 0.3s ease;
}
.tbar-fill.hot { background: #165DFF; }
.tbar-lbl { font-size: 20rpx; color: #86909C; }

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
.v-score {
  font-size: 20rpx;
  font-weight: 600;
  margin-left: 8rpx;
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

/* ===== 高潜榜（阶段C）===== */
.lead-card {
  margin: 8rpx 28rpx 24rpx;
  background: #fff;
  border-radius: 32rpx;
  padding: 28rpx;
  border: 1px solid #e5e6eb;
  box-shadow: 0 2px 10px rgba(0,0,0,0.04);
}
.lead-sec {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 20rpx;
}
.lead-sec small { color: #86909c; }
.lead-ai {
  font-size: 24rpx;
  color: #07c160;
  background: rgba(7, 193, 96, 0.08);
  border-radius: 999rpx;
  padding: 8rpx 22rpx;
}
.lead-ai.locked { color: #86909c; background: #f2f3f5; }
.lead-list { display: flex; flex-direction: column; }
.lead-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 0;
  border-bottom: 1px solid #f2f3f5;
}
.lead-row:last-child { border-bottom: none; }
.lead-rank {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  background: #f2f3f5;
  color: #86909c;
  font-size: 28rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.lead-rank.hot { background: rgba(7, 193, 96, 0.12); color: #07c160; }
.lead-info { flex: 1; min-width: 0; }
.lead-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #1d2129;
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.lead-lv {
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  font-weight: 400;
}
.lead-lv.green { color: #07c160; background: rgba(7,193,96,.1); }
.lead-lv.blue { color: #165dff; background: rgba(22,93,255,.1); }
.lead-lv.gray { color: #86909c; background: #f2f3f5; }
.lead-meta { font-size: 24rpx; color: #86909c; margin-top: 8rpx; }
.lead-words {
  font-size: 22rpx;
  color: #4e5969;
  background: #f7f8fa;
  border-radius: 12rpx;
  padding: 10rpx 16rpx;
  margin-top: 12rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== AI 意向报告 ===== */
.ai-report { margin: 28rpx 0; }
.ai-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
  border-bottom: 1px solid #f2f3f5;
}
.ai-row:last-child { border-bottom: none; }
.ai-k { font-size: 28rpx; color: #4e5969; }
.ai-v { font-size: 28rpx; font-weight: 600; color: #1d2129; }

/* ===== 意向详情 ===== */
.li-box { margin: 28rpx 0; }
.li-item {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 16rpx 0;
}
.li-dot {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: #86909c;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.li-dot.green { background: #07c160; }
.li-dot.blue { background: #165dff; }
.li-t { font-size: 28rpx; color: #1d2129; }
.li-s { font-size: 24rpx; color: #86909c; }
.li-words { margin: 8rpx 0 20rpx; }
.li-words-t { font-size: 26rpx; font-weight: 600; color: #1d2129; margin-bottom: 12rpx; }
.li-words-c {
  font-size: 24rpx;
  color: #4e5969;
  background: #f7f8fa;
  border-radius: 12rpx;
  padding: 14rpx 18rpx;
  margin-bottom: 10rpx;
  line-height: 1.5;
}
</style>
