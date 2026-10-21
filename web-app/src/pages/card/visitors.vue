<template>
  <view class="radar-page" :style="[themeStyle, brandVars, tabBarPad]">
<!-- PageNav -->
<PageNav title="访客雷达" back />
    <!-- 付费解锁引导（免费/过期用户） -->
    <view class="radar-locked" v-if="locked">
      <view class="lock-card">
        <view class="lock-icon"><SIcon name="radar" size="xlarge" :color="themeColor" /></view>
        <view class="lock-title">访客雷达</view>
        <view class="lock-desc">解锁后查看谁看过你的名片</view>
        <view class="lock-benefits">
          <view class="lb-item"><SIcon name="chart" size="small" :color="themeColor" /><text>今日/本周访问统计</text></view>
          <view class="lb-item"><SIcon name="customer" size="small" :color="themeColor" /><text>访客行为轨迹追踪</text></view>
          <view class="lb-item"><SIcon name="exchange" size="small" :color="themeColor" /><text>高意向访客识别</text></view>
        </view>
        <view class="btn-main" @click="goMember">立即解锁</view>
        <view class="lock-foot">开通黄金会员 · 全部功能畅享</view>
      </view>
    </view>

    <!-- 统计卡片（demo radar-stats） -->
    <view class="radar-stats" v-else>
      <view class="rstat up">
        <view class="lbl">今日访问</view>
        <view class="num"><text class="n">{{ displayToday }}</text><text class="num-unit">人</text></view>
        <view class="sub">
          <SIcon name="chart" size="small" :color="themeColor" />
          <text>较昨日 {{ diffText }}</text>
        </view>
      </view>
      <view class="rstat blue">
        <view class="lbl">本周访问</view>
        <view class="num"><text class="n">{{ displayWeek }}</text><text class="num-unit">人</text></view>
        <view class="sub">
          <SIcon name="radar" size="small" :color="themeColor" />
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
    <view class="lead-card" v-if="!locked && (leadLoading || topLeads.length)">
      <view class="sec-t lead-sec">
        <text>高潜榜 <small>AI 意向识别</small></text>
        <view class="lead-ai" v-if="hasFeature('ai_report')" @click="openAiReport">AI 意向报告</view>
        <view class="lead-ai locked" v-else @click="goMember">升级查看</view>
      </view>
      <Skeleton v-if="leadLoading" :rows="3" avatar />
      <view class="lead-list" v-else>
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
          {{ (v.nickname || '')[0] || '访' }}
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
      <view class="empty-icon"><SIcon name="analytics" size="xlarge" :color="ICON_DECOR" /></view>
      <view class="empty-text">暂无访客记录</view>
      <view class="empty-hint">分享名片后，访客行为将在这里展示</view>
    </view>

    <!-- 行为时间线弹层（2026-10-18 重构：真实动作+时间+画像摘要+可滚动） -->
    <view class="sheet-mask" :class="{ on: showTimeline }" @click="closeTimeline"></view>
    <view class="sheet" :class="{ on: showTimeline }">
      <view class="grip"></view>
      <view class="sheet-title">行为轨迹</view>
      <!-- 访客画像摘要：全部取 summary 真实字段，不再编造 -->
      <view class="tl-profile" v-if="timelineVisitor">
        <view class="tl-av" :style="{ background: (timelineVisitor.tagColor || '') + '22', color: timelineVisitor.tagColor || themeColor }">{{ (timelineVisitor.nickname || '')[0] || '访' }}</view>
        <view class="tl-pinfo">
          <view class="tl-pname">
            {{ timelineVisitor.nickname || '匿名访客' }}
            <text class="v-tag" :class="tagCls(timelineVisitor.tag)">{{ timelineVisitor.tag }}</text>
          </view>
          <view class="tl-pstats">{{ timelineVisitor.behavior }} · 意向 {{ timelineVisitor.score }} 分</view>
        </view>
      </view>
      <scroll-view scroll-y class="tl-scroll">
        <view class="tline" v-if="timelineItems.length">
          <view class="tl-item" v-for="(t, i) in timelineItems" :key="i">
            <view class="tl-dot" :class="t.cls"><SIcon :name="t.icon" size="small" color="#ffffff" /></view>
            <view class="tl-main">
              <view class="tl-t">{{ t.t }}</view>
              <view class="tl-s" v-if="t.s">{{ t.s }}</view>
            </view>
          </view>
        </view>
        <view class="tl-empty" v-else>
          <view class="tl-empty-t">暂无详细行为记录</view>
          <view class="tl-empty-s">访客后续的浏览、交换等行为会自动补充到这里</view>
        </view>
      </scroll-view>
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
        <view class="v-av" :style="{ background: (current.tagColor || '') + '22', color: current.tagColor }">{{ (current.nickname || '')[0] }}</view>
        <view style="flex: 1">
          <view class="sheet-name">{{ current.nickname }}</view>
          <view class="sheet-src">来源：名片访问 · {{ current.behavior }}</view>
        </view>
      </view>
      <view class="sheet-input-wrap"><input class="sheet-input" v-model="convName" placeholder="姓名" /></view>
      <view class="sheet-input-wrap"><input class="sheet-input" v-model="convPhone" type="number" placeholder="联系电话" /></view>
      <view class="sheet-input-wrap"><textarea class="sheet-textarea" v-model="convRemark" placeholder="备注（可选）" rows="2" /></view>
      <view class="sheet-label">客户阶段</view>
      <view class="stage-group">
        <view class="stage-chip" v-for="s in STAGES" :key="s" :class="{ active: convStage === s }" @click="convStage = s">{{ s }}</view>
      </view>
      <view class="btn-main" @click="saveConvert">保存并转为客户</view>
      <view class="btn-ghost" @click="closeConvert">取消</view>
    </view>

    <!-- 底部TabBar（公共组件） -->
    <CardTabBar active="radar" />
  </view>
</template>

<script setup>
import { ICON_DECOR } from '../../utils/iconColor.js';
import { useTabBarPadding } from '../../utils/cardTabBarSpace.js';
import PageNav from '../../components/PageNav.vue';
import { ref, computed, onMounted } from 'vue';
import { onShow, onLoad, onUnload } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { trackPageView } from '../../utils/analytics.js';
import { saveCardTabState, restoreScrollTop, h5ScrollTop } from './utils/cardTabState.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';
import Skeleton from '../../components/Skeleton.vue';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';

// SIcon 不能消费 var()（构建期烘焙 hex），用真实 hex 喂图标：主题主色，回落品牌蓝
const themeStyle = useDesignTheme();
// 底部导航条实测占位（高度随设计方案浮动，禁止写死 → 见 utils/cardTabBarSpace.js）
const tabBarPad = useTabBarPadding();
const { brandVars, brandPrimary } = useBrandOverride();
const themeColor = computed(() => brandPrimary.value || (themeStyle.value && themeStyle.value['--design-primary']) || '#165dff');

const summary = ref({ today: 0, week: 0, total: 0, diff: 0, visitors: [] });
const visitors = ref([]);
const trend = ref([]);
const displayToday = ref(0);
const displayWeek = ref(0);
const displayTotal = ref(0);
const locked = ref(false);
const topLeads = ref([]);
const leadLoading = ref(false);
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
// 客户阶段常用标签：转为客户时选择，写入客户 tags，便于在客户管理页识别阶段
const STAGES = ['初步接触', '跟进中', '报价阶段', '已合作', '暂不跟进'];
const convStage = ref('');
const timelineName = ref('');
const timelineItems = ref([]);
// 时间线弹层头部画像：取 summary 真实字段（昵称/标签/访问行为/意向分），不编造任何内容
const timelineVisitor = ref(null);
// 首页访客雷达列表点击带 openid 跳过来时，自动展开该访客轨迹（deep-link 进详情）
const pendingOpenid = ref('');

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

onLoad((o) => {
  // 首页访客雷达列表项点击带 openid 进来（openVisitor 跳转），记下待展开访客
  pendingOpenid.value = (o && o.openid) || '';
});

onMounted(async () => {
  restoreScrollTop('visitors');
  try {
    const res = await cardApi.getVisitorSummary();
    if (res && res.locked) { locked.value = true; return; }
    summary.value = res;
    visitors.value = res.visitors || [];
    trend.value = res.trend || [];
    // 首页 deep-link：自动展开首页点进来的那位访客轨迹
    tryAutoOpenTimeline();
    animateNumber('today', res.today);
    animateNumber('week', res.week);
    animateNumber('total', res.total);
    // 阶段C：会员权益 + 高潜榜（免费用户在 locked 分支已 return）
    leadLoading.value = true;
    try {
      const feat = await cardApi.getRadarFeatures();
      features.value = feat.features || [];
      const leads = await cardApi.getRadarTopLeads(10);
      topLeads.value = leads.leads || [];
    } catch (e) {
    } finally {
      leadLoading.value = false;
    }
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
  // 🔴 必须先取快照：`closeLeadIntent()` 会把 leadIntent 置 null，
  //    而下面 setTimeout 里再读 `leadIntent.value.visitorName` 必抛 TypeError（原实现），
  //    表现为「高潜榜 → 转为客户」弹层永远打不开。
  const snapshot = leadIntent.value;
  const v = (visitors.value || []).find((x) => x.visitorOpenid === (snapshot.visitorOpenid || ''));
  closeLeadIntent();
  const fallback = { nickname: snapshot.visitorName, tag: '高意向' };
  setTimeout(() => convert(v || fallback), 250);
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
  // 🔴 2026-10-18：标签只表「行为」（已交换名片/观看视频/回访客/新访客），
  //    意向强弱唯一由「意向分」徽标表达——避免与中意向/高意向 同屏自相矛盾。
  return { '高意向': 'green', '已交换名片': 'green', '观看视频': 'blue', '回访客': 'blue', '新访客': 'gray' }[tag] || 'gray';
}

async function viewTimeline(v) {
  // 🔴 2026-10-21 用户反馈：匿名访客点击只弹"暂无轨迹"且不进详情、红点也不消失。
  //    根因是这里对 anonymous 直接 return —— 既不展开轨迹、也不清未读红点。
  //    匿名访客虽无身份，但后端仍有 visit_count/duration/last_visit 等行为数据，
  //    应照常展开"行为轨迹"弹层（默认时间线展示访问/停留信息），并在展开时清红点。
  // 标记已读（红点消失）
  if (v.unread) {
    v.unread = false;
    try { await cardApi.markVisitorRead(v.id); } catch (e) {}
  }
  // 画像摘要：直接取 summary 真实字段；原 timelineName（昵称）已由画像块承担
  timelineVisitor.value = v;
  timelineName.value = v.nickname;
  timelineItems.value = buildDefaultTimeline(v);
  showTimeline.value = true;
  try {
    const res = await cardApi.getVisitorTimeline(v.visitorOpenid);
    if (res.actions && res.actions.length) {
      // 同类型相邻动作聚合（避免 231 条 view 刷屏），再映射真实时间
      timelineItems.value = mergeSameActions(res.actions).map(mapAction);
    }
  } catch (e) {}
}

// 首页访客雷达列表点击 deep-link：自动展开对应访客轨迹（仅一次）
function tryAutoOpenTimeline() {
  if (!pendingOpenid.value) return;
  const target = (visitors.value || []).find((x) => x.visitorOpenid === pendingOpenid.value);
  pendingOpenid.value = '';
  if (target) viewTimeline(target);
}

// 行为时间格式（手动解析，规避 iOS JSCore 对 'YYYY-MM-DD HH:mm:ss' 解析差异）
// 今天→今天 HH:mm；昨天→昨天 HH:mm；今年→MM-DD HH:mm；跨年→YYYY-MM-DD HH:mm
function formatActionTime(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (isNaN(d.getTime())) return '';
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const now = new Date();
  const day0 = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day0(now) - day0(d)) / 86400000);
  if (diffDays === 0) return `今天 ${hm}`;
  if (diffDays === 1) return `昨天 ${hm}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}-${d.getDate()} ${hm}`;
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${hm}`;
}

// 同类型相邻动作聚合（消除 231 条 view 同质刷屏；合并项保留最近/最早时间用于展示）
function mergeSameActions(actions) {
  const out = [];
  for (const a of actions) {
    const prev = out[out.length - 1];
    if (prev && prev.actionType === a.actionType) {
      prev.count = (prev.count || 1) + 1;
      prev.earliestCreatedAt = a.createdAt;
    } else {
      out.push({ ...a, count: 1, latestCreatedAt: a.createdAt, earliestCreatedAt: a.createdAt });
    }
  }
  return out;
}

function mapAction(a) {
  const latest = formatActionTime(a.latestCreatedAt || a.createdAt);
  const first = formatActionTime(a.earliestCreatedAt || a.createdAt);
  // 聚合项：显示「最近时间 · 共 N 次」；单条：显示真实时间
  const time = a.count > 1 ? `最近 ${latest} · 共 ${a.count} 次` : latest;
  const map = {
    view: { t: '浏览了你的名片', s: time, cls: 'gray', icon: 'analytics' },
    visit: { t: a.actionDetail || '访问了你的名片', s: time, cls: 'gray', icon: 'analytics' },
    doc: { t: a.actionDetail || '浏览作品 / 简介', s: time, cls: 'blue', icon: 'doc' },
    video: { t: a.actionDetail || '观看视频', s: time, cls: 'blue', icon: 'doc' },
    exchange: { t: a.actionDetail || '交换电子名片', s: time || '已获取联系方式', cls: 'green', icon: 'card' },
  };
  return map[a.actionType] || { t: a.actionDetail || '浏览了你的名片', s: time, cls: 'gray', icon: 'analytics' };
}

// 默认时间线：只展示 summary 真实字段，绝不编造未发生的行为（如未交换却显示"已获取联系方式"）
function buildDefaultTimeline(v) {
  return [
    { t: '最近访问', s: v.timeAgo || '刚刚', cls: 'gray', icon: 'analytics' },
    { t: v.behavior || '首次访问', s: '', cls: 'blue', icon: 'chart' },
  ];
}

function timelineToConvert() {
  // 直接用画像里的真实访客对象（原按 nickname 匹配：多个"匿名访客"会错配首条）
  const v = timelineVisitor.value || {};
  closeTimeline();
  setTimeout(() => convert(v), 250);
}

function convert(v) {
  current.value = v;
  convName.value = v.nickname && v.nickname !== '匿名访客' ? v.nickname : '';
  convPhone.value = '';
  convRemark.value = '';
  convStage.value = '';
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
    const tags = ['访客转化'];
    if (convStage.value) tags.push(convStage.value);
    await cardApi.createCustomer({
      name: convName.value,
      phone: convPhone.value,
      source: 'visitor',
      sourceCardId: current.value.cardId,
      tags,
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
  background: var(--bg-page);
  padding-bottom: 160rpx;
}

/* ===== 付费解锁引导 ===== */
/* 顶对齐（勿用 min-height:100vh 垂直居中——全面屏真机上卡片上方留白近半屏，视觉像空页面） */
.radar-locked {
  padding: 24rpx 40rpx 48rpx;
  box-sizing: border-box;
}
.lock-card {
  width: 100%;
  background: var(--white);
  border-radius: var(--radius-lg);
  padding: 64rpx 40rpx 48rpx;
  text-align: center;
  box-shadow: 0 8rpx 40rpx rgba(0, 0, 0, 0.06);
}
.lock-icon {
  width: 128rpx;
  height: 128rpx;
  margin: 0 auto 28rpx;
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lock-title {
  font-size: 40rpx;
  font-weight: 600;
  color: var(--t1);
}
.lock-desc {
  font-size: var(--fs-4);
  color: var(--t3);
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
  font-size: var(--fs-5);
  color: var(--t2);
  padding: 16rpx 8rpx;
}
.lb-item text { flex: 1; }
.lock-foot {
  font-size: var(--fs-3);
  color: var(--t3);
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
  background: var(--white);
  border-radius: 32rpx;
  padding: 30rpx;
  border: 1px solid var(--border);
  box-shadow: 0 4rpx 20rpx rgba(0,0,0,0.04);
}
.rstat .lbl {
  font-size: var(--fs-3);
  color: var(--t4);
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
  color: var(--t5);
  line-height: 1;
}
.rstat .num .num-unit {
  font-style: normal;
  font-size: var(--fs-4);
  font-weight: 500;
  color: var(--t4);
  margin-left: 4rpx;
}
.rstat .sub {
  font-size: var(--fs-2);
  color: var(--design-primary, #165dff);
  margin-top: 10rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

/* ===== 近7日访问趋势 ===== */
.trend-card {
  margin: 24rpx 28rpx 0;
  background: var(--white);
  border-radius: var(--radius-md);
  padding: 24rpx 24rpx 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(31, 42, 68, 0.05);
}
.trend-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}
.trend-t { font-size: var(--fs-5); font-weight: 600; color: var(--t1); }
.trend-peak { font-size: var(--fs-2); color: var(--t3); }
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
  color: var(--t2);
  margin-bottom: 4rpx;
}
.tbar-fill {
  width: 24rpx;
  border-radius: 6rpx 6rpx 2rpx 2rpx;
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.25);
  min-height: 2rpx;
  transition: height 0.3s ease;
}
.tbar-fill.hot { background: var(--design-primary); }
.tbar-lbl { font-size: var(--fs-1); color: var(--t3); }

/* ===== 访客记录（demo card-row 独立卡片）===== */
.sec-t {
  margin: 36rpx 28rpx 20rpx;
  font-size: var(--fs-5);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--t5);
}
.sec-t small {
  font-size: var(--fs-2);
  color: var(--t4);
  font-weight: 400;
}
.card-row.visitor {
  display: flex;
  align-items: center;
  background: var(--white);
  margin: 0 28rpx 24rpx;
  border-radius: 32rpx;
  padding: 30rpx;
  box-shadow: 0 4rpx 20rpx rgba(0,0,0,0.04);
  border: 1px solid var(--border);
}
.v-av {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  color: var(--design-primary, #165dff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: var(--fs-5);
  flex-shrink: 0;
  position: relative;
}
.v-av .red {
  position: absolute;
  top: -4rpx;
  right: -4rpx;
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  background: #ff4d4f;
  border: 2px solid var(--white);
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
  font-size: var(--fs-5);
  font-weight: 600;
  color: var(--t5);
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-wrap: wrap;
}
.v-tag {
  font-size: var(--fs-1);
  padding: 4rpx 14rpx;
  border-radius: var(--radius-pill);
  font-weight: 500;
  white-space: nowrap;
}
.v-score {
  font-size: var(--fs-1);
  font-weight: 600;
  margin-left: 8rpx;
  white-space: nowrap;
}
.v-tag.green {
  background: #e7f7ee;
  color: #0b8f4a;
}
.v-tag.blue {
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  color: var(--design-primary, #165dff);
}
.v-tag.gray {
  background: #f0f0f0;
  color: var(--t4);
}
.v-behav {
  font-size: var(--fs-2);
  color: var(--t4);
  margin-top: 6rpx;
}
.v-act {
  flex-shrink: 0;
}
.v-act .btn {
  font-size: var(--fs-3);
  font-weight: 600;
  padding: 14rpx 26rpx;
  border-radius: 18rpx;
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  color: var(--design-primary, #165dff);
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
  font-size: var(--fs-5);
  color: var(--t2);
  margin-bottom: 8rpx;
}
.empty-hint {
  font-size: var(--fs-3);
  color: var(--t4);
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
  background: var(--white);
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
  font-size: var(--fs-6);
  font-weight: 700;
  text-align: center;
  color: var(--t5);
}
.sheet-sub {
  font-size: var(--fs-3);
  color: var(--t4);
  text-align: center;
  margin-top: 10rpx;
  line-height: 1.6;
}
.sheet-name {
  font-size: var(--fs-5);
  font-weight: 600;
  color: var(--t5);
}
.sheet-src {
  font-size: var(--fs-2);
  color: var(--t4);
  margin-top: 4rpx;
}

/* ===== 时间线（demo tline）===== */
.tl-profile {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin: 24rpx 0 4rpx;
  text-align: left;
}
.tl-av {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: var(--fs-5);
  flex-shrink: 0;
}
.tl-pinfo { flex: 1; min-width: 0; }
.tl-pname {
  font-size: var(--fs-5);
  font-weight: 600;
  color: var(--t5);
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-wrap: wrap;
}
.tl-pstats {
  font-size: var(--fs-3);
  color: var(--t4);
  margin-top: 6rpx;
}
/* 弹层列表可滚动：动作多时按钮不再被顶出屏（MP 用 scroll-view） */
.tl-scroll {
  max-height: 46vh;
  margin-top: 8rpx;
}
.tl-empty {
  text-align: center;
  padding: 60rpx 0 30rpx;
}
.tl-empty-t {
  font-size: var(--fs-4);
  color: var(--t3);
}
.tl-empty-s {
  font-size: var(--fs-2);
  color: var(--t4);
  margin-top: 10rpx;
  line-height: 1.5;
}
.tline {
  margin: 24rpx 0 0;
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
  background: var(--design-primary);
}
.tl-dot.green {
  background: var(--success);
}
.tl-main {
  flex: 1;
  min-width: 0;
}
.tl-t {
  font-size: var(--fs-4);
  color: var(--t2);
}
.tl-s {
  font-size: var(--fs-2);
  color: var(--t4);
  margin-top: 4rpx;
}

/* ===== 表单 ===== */
.sheet-input-wrap {
  margin-bottom: 20rpx;
}
.sheet-input {
  border: 1px solid var(--border);
  border-radius: 22rpx;
  padding: 24rpx 26rpx;
  font-size: var(--fs-5);
  background: var(--white);
  color: var(--t5);
  width: auto;
}
.sheet-textarea {
  border: 1px solid var(--border);
  border-radius: 22rpx;
  padding: 24rpx 26rpx;
  font-size: var(--fs-5);
  width: auto;
  min-height: 120rpx;
  background: var(--white);
  color: var(--t5);
  resize: none;
}
.sheet-label {
  font-size: var(--fs-5);
  color: var(--t2);
  font-weight: 600;
  margin: 8rpx 4rpx 16rpx;
}
.stage-group {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-bottom: 24rpx;
}
.stage-chip {
  font-size: var(--fs-5);
  color: var(--t3);
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: 999rpx;
  padding: 14rpx 28rpx;
  line-height: 1;
}
.stage-chip.active {
  color: var(--design-primary, #165dff);
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  border-color: var(--design-primary, #165dff);
}

/* ===== 按钮（demo btn-main / btn-ghost）===== */
.btn-main {
  width: 100%;
  box-sizing: border-box;
  background: var(--design-primary);
  color: var(--design-text, #fff);
  font-size: 30rpx;
  font-weight: 600;
  padding: 28rpx;
  border-radius: 26rpx;
  margin-top: 32rpx;
  text-align: center;
  transition: opacity 0.15s;
}
/* 弹层次要钮（知道了/时间线转为客户）：次级样式，实底主色为整页唯一强 CTA */
.btn-main.blue {
  background: var(--design-secondary);
  color: var(--design-primary);
}
.btn-main:active {
  opacity: 0.75;
}
.btn-ghost {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-page);
  color: var(--t2);
  font-size: var(--fs-5);
  padding: 26rpx;
  border-radius: 26rpx;
  margin-top: 20rpx;
  text-align: center;
}

/* ===== 高潜榜（阶段C）===== */
.lead-card {
  margin: 8rpx 28rpx 24rpx;
  background: var(--white);
  border-radius: 32rpx;
  padding: 28rpx;
  border: 1px solid var(--border);
  box-shadow: 0 4rpx 20rpx rgba(0,0,0,0.04);
}
.lead-sec {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 20rpx;
}
.lead-sec small { color: var(--t3); }
.lead-ai {
  font-size: var(--fs-3);
  color: var(--design-primary, #165dff);
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  border-radius: var(--radius-pill);
  padding: 8rpx 22rpx;
}
.lead-ai.locked { color: var(--t3); background: var(--bg-hover); }
.lead-list { display: flex; flex-direction: column; }
.lead-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 0;
  border-bottom: 1px solid var(--bg-hover);
}
.lead-row:last-child { border-bottom: none; }
.lead-rank {
  width: 56rpx;
  height: 56rpx;
  border-radius: var(--radius-md);
  background: var(--bg-hover);
  color: var(--t3);
  font-size: var(--fs-5);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.lead-rank.hot { background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.12); color: var(--design-primary, #165dff); }
.lead-info { flex: 1; min-width: 0; }
.lead-name {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--t1);
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.lead-lv {
  font-size: var(--fs-1);
  padding: 4rpx 14rpx;
  border-radius: var(--radius-pill);
  font-weight: 400;
}
.lead-lv.green { color: var(--success); background: rgba(7,193,96,.1); }
.lead-lv.blue { color: var(--design-primary, #165dff); background: rgba(var(--design-primary-rgb, 22, 93, 255), .1); }
.lead-lv.gray { color: var(--t3); background: var(--bg-hover); }
.lead-meta { font-size: var(--fs-3); color: var(--t3); margin-top: 8rpx; }
.lead-words {
  font-size: var(--fs-2);
  color: var(--t2);
  background: var(--bg-card);
  border-radius: var(--radius-xs);
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
  border-bottom: 1px solid var(--bg-hover);
}
.ai-row:last-child { border-bottom: none; }
.ai-k { font-size: var(--fs-5); color: var(--t2); }
.ai-v { font-size: var(--fs-5); font-weight: 600; color: var(--t1); }

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
  background: var(--t3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.li-dot.green { background: var(--success); }
.li-dot.blue { background: var(--design-primary); }
.li-t { font-size: var(--fs-5); color: var(--t1); }
.li-s { font-size: var(--fs-3); color: var(--t3); }
.li-words { margin: 8rpx 0 20rpx; }
.li-words-t { font-size: var(--fs-4); font-weight: 600; color: var(--t1); margin-bottom: 12rpx; }
.li-words-c {
  font-size: var(--fs-3);
  color: var(--t2);
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  padding: 14rpx 18rpx;
  margin-bottom: 10rpx;
  line-height: 1.5;
}
</style>
