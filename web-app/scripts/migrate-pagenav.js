#!/usr/bin/env node
/**
 * 批量迁移：散弹枪式自绘导航 → 统一 <PageNav>（沉浸式：状态栏占位 + 胶囊避让）
 *
 * 幂等：已含 MARK 的页面跳过。未命中正则的页面会在结果里报 MISS，需人工处理。
 * 用法：node scripts/migrate-pagenav.js [--dry]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');
const MARK = '<!-- PageNav -->';
const DRY = process.argv.includes('--dry');

const P = (p) => path.join(ROOT, p);
const read = (p) => fs.readFileSync(P(p), 'utf8');
const write = (p, s) => fs.writeFileSync(P(p), s, 'utf8');

/**
 * 任务表
 * nav: 旧导航块正则（缩进 4 空格起，匹配到对应结束 </view>）
 * right: PageNav #right 插槽内容
 * title: 标题（对齐 pages.json navigationBarTitleText）
 * back: 是否显示返回
 * importLine: 组件 import 锚点
 */
const JOBS = [
  // ---------- 商城 6 页（mall-nav） ----------
  {
    f: 'pages/mall/detail.vue', title: '商品详情', back: true,
    nav: / {4}<view class="mall-nav">[\s\S]*?\n {4}<\/view>\n/,
    right: `      <template #right>
        <view class="nav-cart" @click="goCart">
          <SIcon name="cart" size="default" color="#1d2129" />
          <view class="cart-badge" v-if="cartCount > 0">{{ cartCount > 99 ? '99+' : cartCount }}</view>
        </view>
      </template>`,
  },
  {
    f: 'pages/mall/cart.vue', title: '购物车', back: true,
    nav: / {4}<view class="mall-nav">[\s\S]*?\n {4}<\/view>\n/,
    right: `      <template #right>
        <view class="nav-clear" @click="clearAll" v-if="list.length">清空</view>
      </template>`,
  },
  { f: 'pages/mall/checkout.vue', title: '确认订单', back: true, nav: / {4}<view class="mall-nav">[\s\S]*?\n {4}<\/view>\n/ },
  { f: 'pages/mall/orders.vue', title: '我的订单', back: true, nav: / {4}<view class="mall-nav">[\s\S]*?\n {4}<\/view>\n/ },
  { f: 'pages/mall/order-detail.vue', title: '订单详情', back: true, nav: / {4}<view class="mall-nav">[\s\S]*?\n {4}<\/view>\n/ },
  {
    f: 'pages/mall/index.vue', title: '商城', back: true, backIf: 'canBack',
    nav: / {4}<view class="mall-nav" v-if="!designComps\.length">[\s\S]*?\n {4}<\/view>\n/,
    right: `      <template #right>
        <view class="nav-cart" @click="goCart">
          <SIcon name="cart" size="default" color="#1d2129" />
          <view class="cart-badge" v-if="cartCount > 0">{{ cartCount > 99 ? '99+' : cartCount }}</view>
        </view>
      </template>`,
  },

  // ---------- 消息/收藏/雷达 3 页（msg-nav） ----------
  { f: 'pages/card/messages.vue', title: '消息中心', back: true, nav: / {4}<view class="msg-nav">[\s\S]*?\n {4}<\/view>\n/ },
  {
    f: 'pages/card/collects.vue', title: '我的收藏', back: true,
    nav: / {4}<view class="msg-nav">[\s\S]*?\n {4}<\/view>\n/,
    right: `      <template #right>
        <view class="mn-clear" @click="load" v-if="collects.length">刷新</view>
      </template>`,
  },
  {
    f: 'pages/card/radarConfig.vue', title: '雷达配置', back: true,
    nav: / {4}<view class="msg-nav">[\s\S]*?\n {4}<\/view>\n/,
    right: `      <template #right>
        <view class="mn-clear" @click="load">刷新</view>
      </template>`,
  },

  // ---------- 标准 nav-bar 11 页 ----------
  { f: 'pages/live/list.vue', title: '直播间', back: true, nav: / {4}<view class="nav-bar">[\s\S]*?\n {4}<\/view>\n/ },
  { f: 'pages/cardMain/live.vue', title: '直播', back: true, nav: / {4}<view class="nav-bar">[\s\S]*?\n {4}<\/view>\n/ },
  { f: 'pages/card/connections.vue', title: '我的人脉库', back: true, nav: / {4}<view class="nav-bar">[\s\S]*?\n {4}<\/view>\n/ },
  { f: 'pages/card/exchangeRequests.vue', title: '交换申请', back: true, nav: / {4}<view class="nav-bar">[\s\S]*?\n {4}<\/view>\n/ },
  { f: 'pages/card/templateSelect.vue', title: '更换模板', back: true, nav: / {4}<view class="nav-bar">[\s\S]*?\n {4}<\/view>\n/ },
  { f: 'pagesReads/articleList/articleList.vue', title: '文章列表', back: true, nav: / {4}<view class="nav-bar">[\s\S]*?\n {4}<\/view>\n/ },
  { f: 'pagesReads/showArt/showArt.vue', title: '文章详情', back: true, nav: / {4}<view class="nav-bar">[\s\S]*?\n {4}<\/view>\n/ },
  { f: 'pagesReads/picList/picList.vue', title: '组图列表', back: true, nav: / {4}<view class="nav-bar">[\s\S]*?\n {4}<\/view>\n/ },
  { f: 'pagesReads/showPictures/showPictures.vue', title: '组图详情', back: true, nav: / {4}<view class="nav-bar">[\s\S]*?\n {4}<\/view>\n/ },
  { f: 'pagesReads/videoList/videoList.vue', title: '视频列表', back: true, nav: / {4}<view class="nav-bar">[\s\S]*?\n {4}<\/view>\n/ },
  {
    f: 'pages/card/market.vue', title: '', back: true, titleSlot: true,
    nav: / {4}<view class="nav-bar">[\s\S]*?\n {4}<\/view>\n/,
    right: `      <template #title>
        <view class="pnv-title-group">
          <text class="nav-title">{{ settings.title || '人脉集市' }}</text>
          <text class="nav-tag" v-if="tenantName">{{ tenantName }}</text>
        </view>
      </template>
      <template #right>
        <view class="nav-right">
          <view class="nav-icon" @click="goRequests">
            <SIcon name="exchange" size="default" color="#1a1a1a" />
            <view v-if="unreadCount > 0" class="red-dot">{{ unreadCount > 99 ? '99+' : unreadCount }}</view>
          </view>
          <view class="nav-icon" @click="goConnections">
            <SIcon name="market" size="default" color="#1a1a1a" />
          </view>
        </view>
      </template>`,
  },
];

/** 全站页面统一为 <script setup>：只需 import 即自动注册 */
function addComponent(src, rel) {
  const importLine = `import PageNav from '${rel}';`;
  if (src.includes(importLine)) return { src };
  const m = src.match(/^<script setup>\n/m);
  if (!m) return { src, err: 'no <script setup>' };
  return { src: src.replace(/^<script setup>\n/m, `<script setup>\n${importLine}\n`) };
}

const rel = (f) => {
  const depth = f.split('/').length - 1; // pages/mall/index.vue -> 2
  return '../'.repeat(depth) + 'components/PageNav.vue';
};

const results = [];
for (const job of JOBS) {
  const { f, title, back, backIf, right, titleSlot, nav } = job;
  let src = read(f);
  if (src.includes(MARK)) { results.push({ f, s: 'skip' }); continue; }

  if (!nav.test(src)) { results.push({ f, s: 'MISS-nav' }); continue; }

  const attrs = [];
  if (title) attrs.push(`title="${title}"`);
  if (back) attrs.push(backIf ? `:back="${backIf}"` : 'back');
  const block = `${MARK}\n    <PageNav ${attrs.join(' ')}>${right ? '\n' + right + '\n    ' : ''}</PageNav>\n`;
  src = src.replace(nav, block);

  const r = addComponent(src, rel(f));
  if (r.err) { results.push({ f, s: 'MISS-' + r.err }); continue; }
  if (!DRY) write(f, r.src);
  results.push({ f, s: DRY ? 'dry' : 'ok' });
}

console.log(results.map((r) => `${r.s.padEnd(14)} ${r.f}`).join('\n'));
const bad = results.filter((r) => r.s.startsWith('MISS'));
console.log(`\n合计 ${results.length}：ok=${results.filter(r=>r.s==='ok').length} skip=${results.filter(r=>r.s==='skip').length} MISS=${bad.length}`);
