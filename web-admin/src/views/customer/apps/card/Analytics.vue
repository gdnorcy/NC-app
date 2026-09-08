<template>
  <div class="analytics-page">
    <!-- 统一Tab导航 -->
    <CardTabs v-if="solution === 'card'" />
    <PanoramaTabs v-else />

    <!-- 页头 -->
    <AppPageHeader title="数据洞察" desc="行为漏斗 · 转化趋势 · 客户项目健康分，驱动业务增长">
      <div class="days-switch">
        <span class="days-label">趋势周期</span>
        <span
          v-for="d in [7, 14, 30]"
          :key="d"
          class="days-btn"
          :class="{ active: days === d }"
          @click="loadTrend(d)"
        >{{ d }}天</span>
      </div>
    </AppPageHeader>

    <!-- 健康分 -->
    <div class="health-card">
      <div class="health-left">
        <div class="health-ring" :style="{ '--score': health.score || 0 }">
          <div class="health-ring-inner">
            <div class="health-score">{{ health.score ?? '—' }}</div>
            <div class="health-score-label">健康分</div>
          </div>
        </div>
        <div class="health-info">
          <div class="health-level">
            <span class="health-level-tag" :class="levelClass">{{ health.level || '—' }}</span>
            <span class="health-updated">更新于 {{ health.updatedAt || '—' }}</span>
          </div>
          <div class="health-desc">综合资料完整度、内容活跃、访客活跃、转化表现与集市参与五个维度评分（满分 100）</div>
        </div>
      </div>
      <div class="health-dims">
        <div class="dim" v-for="dim in health.dimensions || []" :key="dim.key">
          <div class="dim-head">
            <span class="dim-label">{{ dim.label }}</span>
            <span class="dim-score">{{ dim.score }} / {{ dim.max }}</span>
          </div>
          <div class="dim-bar">
            <div class="dim-bar-fill" :style="{ width: pct(dim.score, dim.max), background: dimColor(dim.key) }"></div>
          </div>
        </div>
      </div>
      <div class="health-advice" v-if="(health.advice || []).length">
        <div class="advice-title">优化建议</div>
        <ul class="advice-list">
          <li v-for="(a, i) in health.advice" :key="i">{{ a }}</li>
        </ul>
      </div>
    </div>

    <div class="row-grid">
      <!-- 漏斗 -->
      <div class="card funnel-card">
        <div class="card-title">转化漏斗</div>
        <p class="card-sub">近 14 天 · 访客去重统计</p>
        <div class="funnel" v-if="funnel.length">
          <div class="funnel-step" v-for="(step, i) in funnel" :key="step.key">
            <div class="funnel-bar-wrap">
              <div class="funnel-bar" :style="{ width: barWidth(step, funnel[0]), background: funnelColor(i) }">
                <span class="funnel-bar-label">{{ step.label }}</span>
              </div>
            </div>
            <div class="funnel-meta">
              <span class="funnel-count">{{ step.visitors }} 人</span>
              <span class="funnel-rate">{{ step.conversion }}%</span>
            </div>
          </div>
        </div>
        <div class="empty" v-else>暂无埋点数据，C 端访问后将自动采集</div>
      </div>

      <!-- 趋势 -->
      <div class="card trend-card">
        <div class="card-title">访问趋势</div>
        <p class="card-sub">事件量与独立访客（近 {{ days }} 天）</p>
        <div class="trend" v-if="trend.length">
          <div class="trend-bars">
            <div
              v-for="(t, i) in trend"
              :key="t.date"
              class="trend-col"
              :title="`${t.date}：${t.events} 事件 / ${t.visitors} 访客`"
            >
              <div class="trend-events" :style="{ height: pctH(t.events, maxEvents) }"></div>
              <div class="trend-visitors" :style="{ height: pctH(t.visitors, maxVisitors) }"></div>
              <div class="trend-date">{{ shortDate(t.date, i) }}</div>
            </div>
          </div>
          <div class="trend-legend">
            <span class="lg"><i class="dot" style="background:#165dff;"></i>事件量</span>
            <span class="lg"><i class="dot" style="background:#00b42a;"></i>独立访客</span>
          </div>
        </div>
        <div class="empty" v-else>暂无趋势数据</div>
      </div>
    </div>

    <div class="row-grid">
      <!-- 事件分布 -->
      <div class="card">
        <div class="card-title">事件分布</div>
        <p class="card-sub">各类行为事件占比</p>
        <div class="dist-list" v-if="distribution.length">
          <div class="dist-row" v-for="d in distribution" :key="d.type">
            <span class="dist-type">{{ eventLabel(d.type) }}</span>
            <div class="dist-bar"><div class="dist-bar-fill" :style="{ width: pct(d.count, maxDist) }"></div></div>
            <span class="dist-count">{{ d.count }}</span>
          </div>
        </div>
        <div class="empty" v-else>暂无事件数据</div>
      </div>

      <!-- 名片TOP -->
      <div class="card">
        <div class="card-title">{{ topTitle }}</div>
        <p class="card-sub">{{ topSub }}</p>
        <table class="simple-table" v-if="topCards.length">
          <thead>
            <tr v-if="solution !== 'panorama'"><th>名片</th><th>浏览</th><th>留资</th><th>交换</th></tr>
            <tr v-else><th>场景</th><th>浏览</th><th>留资</th><th>方案浏览</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in topCards" :key="c.cardId">
              <td>
                <div class="cell-name">{{ c.name }}</div>
                <div class="cell-sub">{{ c.company }}{{ c.position ? ' · ' + c.position : '' }}</div>
              </td>
              <td>{{ c.views }}</td>
              <td>{{ c.leads }}</td>
              <td v-if="solution !== 'panorama'">{{ c.exchanges }}</td>
              <td v-else>{{ c.planViews }}</td>
            </tr>
          </tbody>
        </table>
        <div class="empty" v-else>{{ topEmpty }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { customerApiCall } from '../../../../api';
import CardTabs from './CardTabs.vue';
import PanoramaTabs from '../panorama/PanoramaTabs.vue';

// 解决方案上下文：card=智能名片 / panorama=全景（由路由 meta 指定）
const route = useRoute();
const solution = route.meta.solution || 'card';
const topTitle = solution === 'panorama' ? '热门场景' : '热门名片';
const topSub = solution === 'panorama' ? '按场景浏览排序 TOP5' : '按浏览量排序 TOP5';
const topEmpty = solution === 'panorama' ? '暂无场景数据' : '暂无名片数据';

const days = ref(14);
const health = ref({});
const funnel = ref([]);
const trend = ref([]);
const distribution = ref([]);
const topCards = ref([]);

const levelClass = () => {
  const s = health.value.score || 0;
  if (s >= 80) return 'lv-good';
  if (s >= 60) return 'lv-mid';
  if (s >= 40) return 'lv-warn';
  return 'lv-bad';
};
const pct = (v, max) => `${max > 0 ? Math.min(100, Math.round((v / max) * 100)) : 0}%`;
const pctH = (v, max) => `${max > 0 ? Math.max(4, Math.round((v / max) * 100)) : 4}%`;
const dimColor = (key) => ({ profile: '#165dff', content: '#722ed1', visitor: '#00b42a', conversion: '#ff7d00', market: '#00a4ae', plan: '#165dff', scene: '#722ed1', interact: '#00a4ae' }[key] || '#165dff');
const funnelColor = (i) => ['#165dff', '#4080ff', '#6ba0ff', '#94bdff'][i] || '#165dff';
const barWidth = (step, first) => (first && first.visitors > 0 ? Math.max(12, Math.round((step.visitors / first.visitors) * 100)) : 12);
const eventLabel = (t) => ({
  page_view: '页面曝光', card_view: '浏览名片', form_submit: '表单留资',
  exchange_init: '发起交换', exchange_success: '交换成功', share_click: '分享点击', dynamic_view: '动态浏览',
  panorama_view: '浏览方案', scene_view: '浏览场景', hotspot_click: '热点点击',
}[t] || t);
const shortDate = (d, i) => {
  if (i === 0 || i === trend.value.length - 1 || trend.value.length <= 7) return d.slice(5);
  return '';
};

const maxEvents = () => Math.max(...trend.value.map((t) => t.events), 1);
const maxVisitors = () => Math.max(...trend.value.map((t) => t.visitors), 1);
const maxDist = () => Math.max(...distribution.value.map((d) => d.count), 1);

async function loadAll() {
  try {
    const [h, f, t, d, top] = await Promise.all([
      customerApiCall.get(`/analytics/health?solution=${solution}`),
      customerApiCall.get(`/analytics/funnel?solution=${solution}`),
      customerApiCall.get(`/analytics/trend?days=${days.value}&solution=${solution}`),
      customerApiCall.get(`/analytics/distribution?solution=${solution}`),
      customerApiCall.get(`/analytics/top?solution=${solution}`),
    ]);
    health.value = h.health || {};
    funnel.value = f.funnel || [];
    trend.value = t.trend || [];
    distribution.value = d.distribution || [];
    topCards.value = top.top || [];
  } catch (e) {
    console.error('数据洞察加载失败', e);
  }
}

function loadTrend(d) {
  days.value = d;
  loadAll();
}

onMounted(loadAll);
</script>

<style scoped>
.analytics-page { display: flex; flex-direction: column; gap: 16px; }
.analytics-page :deep(.card-tabs) { margin-bottom: 0; }

.days-switch { display: flex; align-items: center; gap: 4px; background: #fff; border-radius: 8px; padding: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.days-label { font-size: 12px; color: #86909c; padding: 0 8px; }
.days-btn { font-size: 13px; color: #4e5969; padding: 6px 14px; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
.days-btn:hover { color: #165dff; }
.days-btn.active { background: #165dff; color: #fff; }

/* 健康分 */
.health-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); display: flex; flex-wrap: wrap; gap: 24px; align-items: center; }
.health-left { display: flex; align-items: center; gap: 20px; min-width: 280px; }
.health-ring { width: 96px; height: 96px; border-radius: 50%; background: conic-gradient(#165dff calc(var(--score) * 1%), #e8f3ff 0); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.health-ring-inner { width: 76px; height: 76px; border-radius: 50%; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.health-score { font-size: 26px; font-weight: 700; color: #1d2129; line-height: 1; }
.health-score-label { font-size: 12px; color: #86909c; margin-top: 4px; }
.health-info { display: flex; flex-direction: column; gap: 8px; }
.health-level { display: flex; align-items: center; gap: 10px; }
.health-level-tag { font-size: 13px; font-weight: 500; padding: 3px 12px; border-radius: 999px; }
.lv-good { background: rgba(0,180,42,0.1); color: #00b42a; }
.lv-mid { background: rgba(22,93,255,0.1); color: #165dff; }
.lv-warn { background: rgba(255,125,0,0.1); color: #ff7d00; }
.lv-bad { background: rgba(245,63,63,0.1); color: #f53f3f; }
.health-updated { font-size: 12px; color: #86909c; }
.health-desc { font-size: 13px; color: #4e5969; max-width: 320px; }
.health-dims { flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 12px; }
.dim-head { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
.dim-label { color: #4e5969; }
.dim-score { color: #86909c; }
.dim-bar { height: 8px; border-radius: 4px; background: #f2f3f5; overflow: hidden; }
.dim-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
.health-advice { width: 100%; background: #f7f8fa; border-radius: 8px; padding: 14px 16px; }
.advice-title { font-size: 13px; font-weight: 600; color: #1d2129; margin-bottom: 8px; }
.advice-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.advice-list li { font-size: 13px; color: #4e5969; }

.row-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 1100px) { .row-grid { grid-template-columns: 1fr; } }

.card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.card-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.card-sub { font-size: 12px; color: #86909c; margin: 4px 0 16px; }

/* 漏斗 */
.funnel { display: flex; flex-direction: column; gap: 12px; }
.funnel-step { display: flex; align-items: center; gap: 12px; }
.funnel-bar-wrap { flex: 1; }
.funnel-bar { height: 36px; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; transition: width 0.3s; min-width: 60px; }
.funnel-bar-label { color: #fff; font-size: 13px; white-space: nowrap; }
.funnel-meta { width: 120px; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.funnel-count { font-size: 14px; font-weight: 600; color: #1d2129; }
.funnel-rate { font-size: 12px; color: #86909c; }

/* 趋势 */
.trend-bars { display: flex; align-items: flex-end; gap: 6px; height: 160px; border-bottom: 1px solid #f2f3f5; padding-bottom: 0; }
.trend-col { flex: 1; display: flex; align-items: flex-end; gap: 2px; height: 100%; min-width: 0; }
.trend-events { flex: 1; background: #165dff; border-radius: 3px 3px 0 0; min-width: 3px; transition: height 0.3s; }
.trend-visitors { flex: 1; background: #00b42a; border-radius: 3px 3px 0 0; min-width: 3px; transition: height 0.3s; }
.trend-date { position: absolute; bottom: -20px; font-size: 10px; color: #86909c; width: 100%; text-align: center; white-space: nowrap; }
.trend-col { position: relative; }
.trend-legend { display: flex; gap: 16px; margin-top: 24px; }
.lg { font-size: 12px; color: #4e5969; display: flex; align-items: center; gap: 6px; }
.dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }

/* 事件分布 */
.dist-list { display: flex; flex-direction: column; gap: 12px; }
.dist-row { display: flex; align-items: center; gap: 12px; }
.dist-type { width: 88px; font-size: 13px; color: #4e5969; flex-shrink: 0; }
.dist-bar { flex: 1; height: 10px; background: #f2f3f5; border-radius: 5px; overflow: hidden; }
.dist-bar-fill { height: 100%; background: #4080ff; border-radius: 5px; transition: width 0.3s; }
.dist-count { width: 40px; text-align: right; font-size: 13px; color: #1d2129; }

/* 表格 */
.simple-table { width: 100%; border-collapse: collapse; }
.simple-table th { font-size: 12px; color: #86909c; font-weight: 500; text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e6eb; }
.simple-table td { font-size: 13px; color: #1d2129; padding: 12px 10px; border-bottom: 1px solid #f2f3f5; }
.simple-table tr:last-child td { border-bottom: none; }
.cell-name { font-weight: 500; }
.cell-sub { font-size: 12px; color: #86909c; margin-top: 2px; }

.empty { font-size: 13px; color: #86909c; padding: 32px 0; text-align: center; background: #f7f8fa; border-radius: 8px; }
</style>
