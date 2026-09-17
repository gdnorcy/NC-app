<template>
  <div class="goods-insight">
    <AppPageHeader title="数据洞察" desc="交易趋势 · 核心指标 · 商品/用户排行，驱动经营决策">
      <div class="range-switch">
        <span
          v-for="r in ranges"
          :key="r.key"
          class="range-btn"
          :class="{ active: range === r.key }"
          @click="load(r.key)"
        >{{ r.label }}</span>
      </div>
    </AppPageHeader>

    <div class="insight-grid">
      <!-- 左：交易趋势 -->
      <div class="card trend-card">
        <div class="card-title">交易趋势<em>成交额 / 成交量（按天）</em></div>
        <div v-if="trend.length" class="trend-chart">
          <svg :viewBox="`0 0 ${W} ${H}`" class="trend-svg">
            <!-- 网格线 -->
            <line v-for="gy in gridYs" :key="gy" :x1="padL" :y1="gy" :x2="W - padR" :y2="gy" class="grid-line" />
            <!-- 金额折线 -->
            <polyline :points="amountPoints()" class="line-amount" />
            <!-- 单量折线 -->
            <polyline :points="ordersPoints()" class="line-orders" />
            <!-- 点 + 日期 -->
            <g v-for="(t, i) in trend" :key="t.date">
              <circle :cx="xAt(i)" :cy="yAmount(t.amount)" r="3" class="dot-amount" />
              <circle :cx="xAt(i)" :cy="yOrders(t.orders)" r="3" class="dot-orders" />
              <text :x="xAt(i)" :y="innerH + padT + 18" text-anchor="middle" class="axis-label">{{ shortDate(t.date, i) }}</text>
            </g>
          </svg>
          <div class="trend-legend">
            <span><i class="dot" style="background:#165dff;"></i>成交额</span>
            <span><i class="dot" style="background:#00b42a;"></i>成交量</span>
          </div>
        </div>
        <div v-else class="empty">暂无交易数据</div>
      </div>

      <!-- 右：核心指标 -->
      <div class="card metrics-card">
        <div class="card-title">核心指标<em>成交口径：已支付订单</em></div>
        <div class="metrics-grid">
          <div v-for="m in metricCards" :key="m.key" class="metric-item">
            <div class="metric-icon" :style="{ background: m.bg }">
              <SIcon :name="m.icon" size="default" :color="m.color" />
            </div>
            <div class="metric-info">
              <div class="metric-value">{{ m.value }}</div>
              <div class="metric-label">{{ m.label }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 左下：商品热销榜 -->
      <div class="card rank-card">
        <div class="card-title">商品热销榜<em>按销售总额 TOP10</em></div>
        <table class="rank-table">
          <thead>
            <tr><th>排名</th><th>商品名称</th><th>订单数量</th><th>销售总额</th></tr>
          </thead>
          <tbody>
            <tr v-for="g in hotGoods" :key="g.rank">
              <td><span class="rank-badge" :class="rankClass(g.rank)">{{ g.rank }}</span></td>
              <td class="cell-main">{{ g.title }}</td>
              <td>{{ g.orders }}</td>
              <td class="cell-amount">¥{{ yuan(g.amount) }}</td>
            </tr>
            <tr v-if="!hotGoods.length"><td colspan="4" class="cell-empty">暂无热销商品</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 右下：用户购买榜 -->
      <div class="card rank-card">
        <div class="card-title">用户购买榜<em>按消费金额 TOP10</em></div>
        <table class="rank-table">
          <thead>
            <tr><th>排名</th><th>用户名称</th><th>订单数量</th><th>消费金额</th></tr>
          </thead>
          <tbody>
            <tr v-for="u in hotUsers" :key="u.rank">
              <td><span class="rank-badge" :class="rankClass(u.rank)">{{ u.rank }}</span></td>
              <td class="cell-main">{{ u.nickname }}</td>
              <td>{{ u.orders }}</td>
              <td class="cell-amount">¥{{ yuan(u.amount) }}</td>
            </tr>
            <tr v-if="!hotUsers.length"><td colspan="4" class="cell-empty">暂无购买用户</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import SIcon from '../../../components/SIcon.vue';
import { customerApiCall } from '../../../api';

const ranges = [
  { key: 'today', label: '今天' },
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
];
const range = ref('7d');
const data = ref({ metrics: {}, trend: [], hotGoods: [], hotUsers: [] });
const trend = computed(() => data.value.trend || []);
const hotGoods = computed(() => data.value.hotGoods || []);
const hotUsers = computed(() => data.value.hotUsers || []);

const W = 560; const H = 230;
const padL = 34; const padR = 12; const padT = 16; const padB = 30;
const innerW = W - padL - padR;
const innerH = H - padT - padB;
const gridYs = [padT, padT + innerH * 0.25, padT + innerH * 0.5, padT + innerH * 0.75, padT + innerH];

const maxAmount = () => Math.max(...data.value.trend.map((t) => t.amount), 1);
const maxOrders = () => Math.max(...data.value.trend.map((t) => t.orders), 1);
const xAt = (i) => padL + (data.value.trend.length > 1 ? (innerW * i) / (data.value.trend.length - 1) : innerW / 2);
const yAmount = (v) => padT + innerH - (v / maxAmount()) * innerH;
const yOrders = (v) => padT + innerH - (v / maxOrders()) * innerH;
const amountPoints = () => data.value.trend.map((t, i) => `${xAt(i)},${yAmount(t.amount)}`).join(' ');
const ordersPoints = () => data.value.trend.map((t, i) => `${xAt(i)},${yOrders(t.orders)}`).join(' ');
const shortDate = (d, i) => {
  if (i === 0 || i === data.value.trend.length - 1 || data.value.trend.length <= 7) return d.slice(5);
  return '';
};

const yuan = (fen) => (Number(fen || 0) / 100).toFixed(2);
const metricCards = computed(() => {
  const m = data.value.metrics || {};
  return [
    { key: 'orders', label: '成交量（笔）', value: m.orders ?? 0, icon: 'orders', color: '#165dff', bg: 'rgba(22,93,255,0.08)' },
    { key: 'amount', label: '成交额（元）', value: `¥${yuan(m.amount)}`, icon: 'wallet', color: '#ff7d00', bg: 'rgba(255,125,0,0.1)' },
    { key: 'avg', label: '平均额（元）', value: `¥${yuan(m.avg)}`, icon: 'chart', color: '#722ed1', bg: 'rgba(114,46,209,0.08)' },
    { key: 'pendingShip', label: '待发货（笔）', value: m.pendingShip ?? 0, icon: 'orders', color: '#00b42a', bg: 'rgba(0,180,42,0.08)' },
    { key: 'pendingPickup', label: '待核销（笔）', value: m.pendingPickup ?? 0, icon: 'storage', color: '#00a4ae', bg: 'rgba(0,164,174,0.1)' },
    { key: 'afterSale', label: '售后单（笔）', value: m.afterSale ?? 0, icon: 'logs', color: '#f53f3f', bg: 'rgba(245,63,63,0.08)' },
  ];
});
const rankClass = (r) => (r <= 3 ? `top${r}` : '');

async function load(r) {
  range.value = r;
  try {
    const res = await customerApiCall.get('/goods/insight', { params: { range: r } });
    data.value = res || { metrics: {}, trend: [], hotGoods: [], hotUsers: [] };
  } catch (e) {
    console.error('数据洞察加载失败', e);
  }
}
onMounted(() => load('7d'));
</script>

<style scoped>
.goods-insight { display: flex; flex-direction: column; gap: 16px; }
.range-switch { display: flex; gap: 8px; }
.range-btn {
  padding: 6px 14px; border-radius: 8px; border: 1px solid #e5e6eb;
  font-size: 13px; color: #4e5969; cursor: pointer; background: #fff; transition: all .2s;
}
.range-btn.active { background: #165dff; border-color: #165dff; color: #fff; }
.insight-grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; }
.card {
  background: #fff; border-radius: 8px; padding: 20px;
  box-shadow: 0 1px 4px rgba(0,0,0,.04); min-width: 0;
}
.card-title { font-size: 15px; font-weight: 600; color: #1d2129; margin-bottom: 14px; display: flex; align-items: baseline; gap: 8px; }
.card-title em { font-style: normal; font-size: 12px; color: #86909c; font-weight: 400; }
.trend-svg { width: 100%; height: auto; display: block; }
.grid-line { stroke: #f2f3f5; stroke-width: 1; }
.line-amount { fill: none; stroke: #165dff; stroke-width: 2; }
.line-orders { fill: none; stroke: #00b42a; stroke-width: 2; }
.dot-amount { fill: #165dff; }
.dot-orders { fill: #00b42a; }
.axis-label { font-size: 11px; fill: #86909c; }
.trend-legend { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: #4e5969; }
.trend-legend .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.metrics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.metric-item { display: flex; align-items: center; gap: 10px; background: #f7f8fa; border-radius: 8px; padding: 12px; }
.metric-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.metric-value { font-size: 20px; font-weight: 600; color: #1d2129; line-height: 1.2; }
.metric-label { font-size: 12px; color: #86909c; margin-top: 2px; }
.rank-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rank-table th { text-align: left; font-weight: 500; color: #86909c; padding: 8px 6px; border-bottom: 1px solid #f2f3f5; }
.rank-table td { padding: 9px 6px; border-bottom: 1px solid #f7f8fa; color: #4e5969; }
.rank-table tr:last-child td { border-bottom: none; }
.rank-badge {
  display: inline-flex; width: 20px; height: 20px; border-radius: 50%;
  align-items: center; justify-content: center; font-size: 12px; background: #f2f3f5; color: #4e5969;
}
.rank-badge.top1 { background: #165dff; color: #fff; }
.rank-badge.top2 { background: #4080ff; color: #fff; }
.rank-badge.top3 { background: #94bdff; color: #fff; }
.cell-main { color: #1d2129; }
.cell-amount { color: #1d2129; font-weight: 500; }
.cell-empty { color: #86909c; text-align: center; padding: 24px 0 !important; }
.empty { color: #86909c; text-align: center; padding: 60px 0; }
@media (max-width: 1100px) { .insight-grid { grid-template-columns: 1fr; } }
</style>
