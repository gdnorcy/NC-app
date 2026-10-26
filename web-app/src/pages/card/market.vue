<template>
  <view class="market-page" :style="[themeStyle, brandVars, tabBarPad, brandInkVars]">
    <!-- 顶部导航栏：主题色 hero（与会员中心一致），PageNav 透明融入 -->
<!-- PageNav -->
    <view class="market-hero">
      <PageNav back bg="transparent" color="#ffffff">
        <template #title>
          <view class="pnv-title-group">
            <text class="nav-title">{{ settings.title || '人脉集市' }}</text>
            <text class="nav-tag" v-if="tenantName">{{ tenantName }}</text>
          </view>
        </template>
        <!-- 🔴 右上角不再挂图标（2026-10-22 用户反馈：上面太拥挤、容易点错）。
             交换请求 / 人脉库两个入口下沉到搜索框右侧（见 .sb-icon），
             既缩短拇指行程，也把「未读红点」放到真正会被看到的位置。 -->
      </PageNav>
    </view>

    <!-- 搜索 + 集市入口（搜索框三段式：放大镜｜输入框｜交换请求/人脉库） -->
    <view class="search-bar">
      <view class="search-box">
        <SIcon name="dynamic" size="small" :color="ICON_DECOR" />
        <input class="search-input" v-model="keyword" placeholder="搜索姓名/公司/职位" placeholder-class="ph" @confirm="search" />
        <view v-if="keyword" class="search-clear" @click="clearSearch">✕</view>
        <view class="sb-sep"></view>
        <view class="sb-icon" @click="goRequests">
          <SIcon name="exchange" size="small" :color="themeColor" />
          <view v-if="unreadCount > 0" class="red-dot">{{ unreadCount > 99 ? '99+' : unreadCount }}</view>
        </view>
        <view class="sb-icon" @click="goConnections">
          <SIcon name="market" size="small" :color="themeColor" />
        </view>
      </view>
    </view>

    <!-- 我的集市开关 -->
    <view class="market-switch-row" v-if="mySubject">
      <view class="switch-info">
        <view class="switch-title">将我的名片展示到集市</view>
        <view class="switch-desc">{{ switchDesc }}</view>
      </view>
      <switch :checked="myOn" :color="themeColor" @change="toggleMyCard" style="transform: scale(0.8);" />
    </view>

    <!-- 公告 -->
    <view class="notice-bar" v-if="settings.notice">
      <text class="notice-icon">📢</text>
      <text class="notice-text">{{ settings.notice }}</text>
    </view>

    <!-- 广告轮播（管理端集市设置配置 banners） -->
    <swiper v-if="banners.length" class="banner-swiper" circular indicator-dots autoplay interval="4000" indicator-color="rgba(255,255,255,0.5)" indicator-active-color="#ffffff">
      <swiper-item v-for="(b, i) in banners" :key="i" @click="openBanner(b)">
        <image v-if="b.image" :src="b.image" class="banner-img" mode="aspectFill" />
        <view v-else class="banner-placeholder">广告位</view>
      </swiper-item>
    </swiper>

    <!-- 同城筛选（按本人名片所在城市匹配集市主体城市） -->
    <view class="samecity-row">
      <view class="sc-pill" :class="{ on: sameCity }" @click="toggleSameCity">
        {{ sameCity ? '📍 同城' : '🌐 全部' }}<text class="sc-city" v-if="myCity">（{{ myCity }}）</text>
      </view>
      <text class="sc-tip" v-if="!myCity">完善名片"所在城市"后可开启同城</text>
    </view>

    <!-- ===== 方案C：分类页签 ===== -->
    <template v-if="style === 'C'">
      <view class="c-tabs">
        <view class="c-tab" :class="{ on: cTab === 'all' }" @click="switchCTab('all')">全部人脉</view>
        <view class="c-tab" :class="{ on: cTab === 'top' }" @click="switchCTab('top')">置顶会员</view>
        <view class="c-tab" :class="{ on: cTab === 'new' }" @click="switchCTab('new')">新上架</view>
      </view>
      <view class="c-list">
        <view class="c-card" v-for="item in shownItems" :key="item.id" @click="viewCard(item)">
          <view class="c-badges">
            <text v-if="item.isTop" class="badge-top">🔥 置顶</text>
            <text v-if="item.isNew" class="badge-new">✨ NEW</text>
          </view>
          <view class="c-main">
            <view class="c-avatar" :class="'avatar-' + item.subjectType">{{ item.name?.[0] || '名' }}</view>
            <view class="c-info">
              <view class="c-name">{{ item.name }}</view>
              <view class="c-position">{{ item.position || '未设置职位' }}</view>
              <view class="c-company" v-if="item.companyName">{{ item.companyName }}</view>
            </view>
          </view>
          <view class="c-tags" v-if="needTagList(item).length">
            <text class="tag-need" v-for="t in needTagList(item)" :key="t">{{ t }}</text>
          </view>
          <view class="c-foot">
            <text class="c-type">{{ typeName(item.subjectType) }}</text>
            <view class="exchange-btn" :class="{ done: isExchanged(item) }" @click.stop="quickExchange(item)">
              {{ isExchanged(item) ? '已交换' : '交换名片' }}
            </view>
          </view>
        </view>
      </view>
    </template>

    <!-- ===== 方案A：角标权重（双列卡片流） ===== -->
    <template v-else-if="style === 'A'">
      <!-- 筛选栏 -->
      <view class="filter-bar">
        <scroll-view scroll-x class="filter-scroll" :show-scrollbar="false">
          <view class="filter-inner">
            <view class="filter-chip" :class="{ on: filterType === 'all' }" @click="selectType('all')">全部</view>
            <view class="filter-chip" :class="{ on: filterType === 'individual' }" @click="selectType('individual')">认证个人</view>
            <view class="filter-chip" :class="{ on: filterType === 'enterprise' }" @click="selectType('enterprise')">企业主体</view>
            <view class="filter-chip" :class="{ on: filterType === 'employee' }" @click="selectType('employee')">企业员工</view>
            <view class="filter-chip has-need" :class="{ on: needFilter }" @click="toggleNeed">有供需</view>
            <view class="filter-chip" :class="{ on: sort === 'newest' }" @click="toggleSort">排序：{{ sort === 'newest' ? '新上架' : '综合' }}</view>
          </view>
        </scroll-view>
      </view>

      <!-- 双列卡片流 -->
      <view class="dual-list">
        <view class="dual-col">
          <view class="m-card" v-for="item in colItems(0)" :key="item.id" @click="viewCard(item)">
            <view class="m-badges">
              <text v-if="item.isTop" class="badge-top">🔥 置顶</text>
              <text v-if="item.isNew" class="badge-new">✨ NEW</text>
            </view>
            <view class="m-head">
              <view class="m-avatar" :class="'avatar-' + item.subjectType">{{ item.name?.[0] || '名' }}</view>
              <view class="m-type-tag" :class="'type-' + item.subjectType">{{ typeName(item.subjectType) }}</view>
            </view>
            <view class="m-name">{{ item.name }}</view>
            <view class="m-position">{{ item.position || '未设置职位' }}</view>
            <view class="m-company" v-if="item.companyName">{{ item.companyName }}</view>
            <view class="m-need" v-if="needTagList(item).length">
              <text class="need-tag" v-for="t in needTagList(item)" :key="t">{{ t }}</text>
            </view>
            <view class="m-tags" v-if="item.industry">
              <text class="m-industry">{{ item.industry }}</text>
            </view>
            <view class="m-foot">
              <text class="m-views">{{ item.viewCount || 0 }} 人看过</text>
              <view class="m-exchange" :class="{ done: isExchanged(item) }" @click.stop="quickExchange(item)">
                {{ isExchanged(item) ? '已交换' : '交换' }}
              </view>
            </view>
          </view>
        </view>
        <view class="dual-col">
          <view class="m-card" v-for="item in colItems(1)" :key="item.id" @click="viewCard(item)">
            <view class="m-badges">
              <text v-if="item.isTop" class="badge-top">🔥 置顶</text>
              <text v-if="item.isNew" class="badge-new">✨ NEW</text>
            </view>
            <view class="m-head">
              <view class="m-avatar" :class="'avatar-' + item.subjectType">{{ item.name?.[0] || '名' }}</view>
              <view class="m-type-tag" :class="'type-' + item.subjectType">{{ typeName(item.subjectType) }}</view>
            </view>
            <view class="m-name">{{ item.name }}</view>
            <view class="m-position">{{ item.position || '未设置职位' }}</view>
            <view class="m-company" v-if="item.companyName">{{ item.companyName }}</view>
            <view class="m-need" v-if="needTagList(item).length">
              <text class="need-tag" v-for="t in needTagList(item)" :key="t">{{ t }}</text>
            </view>
            <view class="m-tags" v-if="item.industry">
              <text class="m-industry">{{ item.industry }}</text>
            </view>
            <view class="m-foot">
              <text class="m-views">{{ item.viewCount || 0 }} 人看过</text>
              <view class="m-exchange" :class="{ done: isExchanged(item) }" @click.stop="quickExchange(item)">
                {{ isExchanged(item) ? '已交换' : '交换' }}
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 底部折叠：集市榜单 -->
      <view class="fold-panel" v-if="topItems.length > 1">
        <view class="fold-title" @click="foldOpen = !foldOpen">
          <text>🏆 集市榜单</text>
          <text class="fold-arrow">{{ foldOpen ? '收起' : '展开' }}</text>
        </view>
        <view class="fold-body" v-if="foldOpen">
          <view class="rank-row" v-for="(it, idx) in topItems" :key="it.id" @click="viewCard(it)">
            <text class="rank-no" :class="{ top: idx < 3 }">{{ idx + 1 }}</text>
            <view class="rank-name">{{ it.name }}</view>
            <text class="rank-num">{{ it.viewCount || 0 }} 看过</text>
          </view>
        </view>
      </view>
    </template>

    <!-- ===== 方案B：重点会员横滚 + 双列 ===== -->
    <template v-else-if="style === 'B'">
      <view class="b-section-title">⭐ 重点会员</view>
      <scroll-view scroll-x class="b-scroll" :show-scrollbar="false">
        <view class="b-inner">
          <view class="b-card" v-for="item in featuredItems" :key="item.id" @click="viewCard(item)">
            <view class="b-badges">
              <text v-if="item.isTop" class="badge-top">🔥 置顶</text>
              <text v-if="item.isNew" class="badge-new">✨ NEW</text>
            </view>
            <view class="b-avatar" :class="'avatar-' + item.subjectType">{{ item.name?.[0] || '名' }}</view>
            <view class="b-name">{{ item.name }}</view>
            <view class="b-position">{{ item.position || '' }}</view>
            <view class="b-company" v-if="item.companyName">{{ item.companyName }}</view>
            <view class="b-exchange" @click.stop="quickExchange(item)">{{ isExchanged(item) ? '已交换' : '交换' }}</view>
          </view>
        </view>
      </scroll-view>

      <!-- 筛选 -->
      <view class="filter-bar">
        <scroll-view scroll-x class="filter-scroll" :show-scrollbar="false">
          <view class="filter-inner">
            <view class="filter-chip" :class="{ on: filterType === 'all' }" @click="selectType('all')">全部</view>
            <view class="filter-chip" :class="{ on: filterType === 'individual' }" @click="selectType('individual')">认证个人</view>
            <view class="filter-chip" :class="{ on: filterType === 'enterprise' }" @click="selectType('enterprise')">企业主体</view>
            <view class="filter-chip" :class="{ on: filterType === 'employee' }" @click="selectType('employee')">企业员工</view>
            <view class="filter-chip has-need" :class="{ on: needFilter }" @click="toggleNeed">有供需</view>
          </view>
        </scroll-view>
      </view>

      <view class="dual-list">
        <view class="dual-col">
          <view class="m-card" v-for="item in colItems(0)" :key="item.id" @click="viewCard(item)">
            <view class="m-badges">
              <text v-if="item.isTop" class="badge-top">🔥 置顶</text>
              <text v-if="item.isNew" class="badge-new">✨ NEW</text>
            </view>
            <view class="m-head">
              <view class="m-avatar" :class="'avatar-' + item.subjectType">{{ item.name?.[0] || '名' }}</view>
              <view class="m-type-tag" :class="'type-' + item.subjectType">{{ typeName(item.subjectType) }}</view>
            </view>
            <view class="m-name">{{ item.name }}</view>
            <view class="m-position">{{ item.position || '未设置职位' }}</view>
            <view class="m-company" v-if="item.companyName">{{ item.companyName }}</view>
            <view class="m-need" v-if="needTagList(item).length">
              <text class="need-tag" v-for="t in needTagList(item)" :key="t">{{ t }}</text>
            </view>
            <view class="m-foot">
              <view class="m-exchange" :class="{ done: isExchanged(item) }" @click.stop="quickExchange(item)">
                {{ isExchanged(item) ? '已交换' : '交换' }}
              </view>
            </view>
          </view>
        </view>
        <view class="dual-col">
          <view class="m-card" v-for="item in colItems(1)" :key="item.id" @click="viewCard(item)">
            <view class="m-badges">
              <text v-if="item.isTop" class="badge-top">🔥 置顶</text>
              <text v-if="item.isNew" class="badge-new">✨ NEW</text>
            </view>
            <view class="m-head">
              <view class="m-avatar" :class="'avatar-' + item.subjectType">{{ item.name?.[0] || '名' }}</view>
              <view class="m-type-tag" :class="'type-' + item.subjectType">{{ typeName(item.subjectType) }}</view>
            </view>
            <view class="m-name">{{ item.name }}</view>
            <view class="m-position">{{ item.position || '未设置职位' }}</view>
            <view class="m-company" v-if="item.companyName">{{ item.companyName }}</view>
            <view class="m-need" v-if="needTagList(item).length">
              <text class="need-tag" v-for="t in needTagList(item)" :key="t">{{ t }}</text>
            </view>
            <view class="m-foot">
              <view class="m-exchange" :class="{ done: isExchanged(item) }" @click.stop="quickExchange(item)">
                {{ isExchanged(item) ? '已交换' : '交换' }}
              </view>
            </view>
          </view>
        </view>
      </view>
    </template>

    <!-- 空状态 -->
    <view class="empty-state" v-if="!shownItems.length && !loading">
      <SIcon name="market" size="xlarge" :color="ICON_DECOR" />
      <view class="empty-text">暂无公开名片</view>
      <view class="empty-hint">成为第一个公开名片的人吧</view>
    </view>

    <!-- 底部TabBar（公共组件） -->
    <CardTabBar active="market" />

    <!-- 🔴 登录浮层：人脉集市的列表接口走 comboAuth（无 token 直接 401），
         游客进来若无兜底会看到「暂无公开名片」假空态。登录成功后原地重入取数。 -->
    <LoginGateModal :show="showLoginGate" @close="cancelLogin" @success="onLoginGateSuccess" />
  </view>
</template>

<script setup>
import { ICON_DECOR } from '../../utils/iconColor.js';
import { useTabBarPadding } from '../../utils/cardTabBarSpace.js';
import PageNav from '../../components/PageNav.vue';
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { onUnload } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { trackPageView } from '../../utils/analytics.js';
import { saveCardTabState, loadCardTabState, restoreScrollTop, h5ScrollTop } from './utils/cardTabState.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';
// 🔴 页面级登录守卫（深链兜底）：集市列表需 token，游客进来弹原地登录浮层，
//   登录成功后自动重跑 loadAll（守卫与浮层收编到共享实现，禁各页再抄一份）。
import LoginGateModal from '../../components/LoginGateModal.vue';
import { usePageGuard } from '../../utils/pageGuard.js';

const themeStyle = useDesignTheme();
// 底部导航条实测占位（高度随设计方案浮动，禁止写死 → 见 utils/cardTabBarSpace.js）
const tabBarPad = useTabBarPadding();
const { brandVars, brandPrimary, brandInkVars } = useBrandOverride();
// SIcon/switch 的 color 是 prop，不能消费 var()（构建期烘焙 hex）→ 传真实 hex
const themeColor = computed(() => brandPrimary.value || (themeStyle.value && themeStyle.value['--design-primary']) || '#165dff');

const items = ref([]);
const keyword = ref('');
const filterType = ref('all');
const needFilter = ref(false);
const sort = ref('comprehensive');
const style = ref('A');
const settings = ref({});
const banners = ref([]);
const myCity = ref('');
const sameCity = ref(false);
const tenantName = ref('');
const loading = ref(false);
const foldOpen = ref(false);
const cTab = ref('all');
const myStatus = ref(null); // { items, subjects }
const exchangedUserIds = ref([]);
const unreadCount = ref(0);

const mySubject = computed(() => (myStatus.value?.subjects || []).find((s) => s.status === 'active'));
const myOn = computed(() => {
  if (!mySubject.value) return false;
  return (myStatus.value?.items || []).some((it) => it.subjectType === mySubject.value.subjectType && it.subjectId === mySubject.value.subjectId);
});
const switchDesc = computed(() => {
  if (!mySubject.value) return '';
  const mine = (myStatus.value?.items || []).find((it) => it.subjectType === mySubject.value.subjectType && it.subjectId === mySubject.value.subjectId);
  if (!mine) return '开启后你的名片将对平台所有人可见';
  if (mine.auditStatus === 'pending') return '已提交申请，等待管理员审核';
  if (mine.auditStatus === 'rejected') return '上架申请未通过，请联系管理员';
  return '你的名片正在集市展示' + (mine.isTop ? '（已置顶）' : '') + (mine.isNew ? '（NEW 7天）' : '');
});

const shownItems = computed(() => {
  let list = items.value;
  if (style.value === 'C') {
    if (cTab.value === 'top') list = list.filter((i) => i.isTop);
    else if (cTab.value === 'new') list = list.filter((i) => i.isNew);
  }
  return list;
});

const topItems = computed(() => items.value.filter((i) => i.isTop));
const featuredItems = computed(() => {
  const tops = items.value.filter((i) => i.isTop);
  const news = items.value.filter((i) => i.isNew && !i.isTop);
  const rest = items.value.filter((i) => !i.isTop && !i.isNew);
  return [...tops, ...news, ...rest].slice(0, 10);
});

function colItems(idx) {
  return shownItems.value.filter((_, i) => i % 2 === idx);
}

function needTagList(item) {
  try {
    const arr = JSON.parse(item.needTags || '[]');
    return Array.isArray(arr) ? arr.slice(0, 2) : [];
  } catch { return []; }
}

function typeName(t) {
  return { individual: '个人', enterprise: '企业', employee: '员工' }[t] || '个人';
}

onShow(() => { trackPageView('/pages/card/market'); });

onMounted(() => {
  const cached = loadCardTabState('market');
  if (cached) {
    if (cached.keyword) keyword.value = cached.keyword;
    if (cached.filterType) filterType.value = cached.filterType;
    if (cached.items && cached.items.length) items.value = cached.items;
  }
  // 🔴 未登录 → 弹登录浮层并停住取数（登录成功后自动重跑 loadAll）
  guardPage();
  restoreScrollTop('market');
});

onUnload(() => {
  saveCardTabState('market', {
    scrollTop: h5ScrollTop(),
    keyword: keyword.value,
    filterType: filterType.value,
    items: items.value,
  });
});

// 🔴 页面级登录守卫：集市列表接口走 comboAuth（无 token 直接 401），
//   未登录弹原地登录浮层并停住取数；登录成功后自动重跑 loadAll（零跳转）。
const { showLoginGate, cancelLogin, onLoginGateSuccess, guardPage } = usePageGuard(loadAll);

async function loadAll() {
  loading.value = true;
  try {
    const [settingsRes, statusRes, connRes] = await Promise.allSettled([
      cardApi.getMarketSettings(),
      cardApi.getMarketMyStatus(),
      cardApi.getConnections(),
    ]);
    if (settingsRes.status === 'fulfilled' && settingsRes.value.settings) {
      settings.value = settingsRes.value.settings;
      style.value = settings.value.style || 'A';
      banners.value = settings.value.banners || [];
    }
    // 本人名片城市（同城筛选基准）
    // ⚠️ 必须取**个人名片** /cards（toCard 带 city）；/member/my-card 是租户会员卡，没有 city 字段
    // → 用它会导致「明明填了所在城市，却一直提示先完善城市」
    try {
      const safe = await cardApi.getCardsSafe();
      const c = (safe && safe.cards && safe.cards[0]) || null;
      myCity.value = (c && c.city) || '';
    } catch (e2) {}
    if (statusRes.status === 'fulfilled') myStatus.value = statusRes.value;
    if (connRes.status === 'fulfilled' && connRes.value.connections) {
      exchangedUserIds.value = connRes.value.connections
        .filter((c) => c.status === 'accepted')
        .map((c) => c.otherUserId || c.toUserId || c.fromUserId);
    }
    try {
      const un = await cardApi.getExchangeUnread();
      unreadCount.value = un.count || 0;
    } catch (e) {}
  } catch (e) { console.error('加载集市配置失败', e); }
  await loadMarket();
  loading.value = false;
}

async function loadMarket() {
  try {
    const params = { type: filterType.value, keyword: keyword.value, sort: sort.value };
    if (needFilter.value) params.need = '找渠道';
    if (sameCity.value && myCity.value) params.city = myCity.value;
    const res = await cardApi.getMarketList(params);
    items.value = res.items || [];
  } catch (e) {
    console.error('加载集市失败', e);
  }
}

function selectType(type) {
  filterType.value = type;
  loadMarket();
}
function toggleSameCity() {
  if (!sameCity.value && !myCity.value) {
    return uni.showToast({ title: '请先在"创建/编辑名片"中完善所在城市', icon: 'none' });
  }
  sameCity.value = !sameCity.value;
  loadMarket();
}
function openBanner(b) {
  if (b.link) {
    // #ifdef H5
    window.open(b.link, '_blank');
    // #endif
  }
}
function toggleNeed() {
  needFilter.value = !needFilter.value;
  loadMarket();
}
function toggleSort() {
  sort.value = sort.value === 'newest' ? 'comprehensive' : 'newest';
  loadMarket();
}
function switchCTab(t) { cTab.value = t; }
function search() { loadMarket(); }
function clearSearch() { keyword.value = ''; loadMarket(); }

async function toggleMyCard(e) {
  if (!mySubject.value) return;
  const wantOn = e.detail.value;
  if (wantOn === myOn.value) return;
  try {
    if (wantOn) {
      await cardApi.toggleMarket({ subjectType: mySubject.value.subjectType, subjectId: mySubject.value.subjectId });
      uni.showToast({ title: '已上架，等待审核/生效', icon: 'none' });
    } else {
      // 下架：找到我的集市条目
      const mine = (myStatus.value?.items || []).find((it) => it.subjectType === mySubject.value.subjectType && it.subjectId === mySubject.value.subjectId);
      if (mine) await cardApi.toggleMarket({ subjectType: mine.subjectType, subjectId: mine.subjectId });
    }
    const st = await cardApi.getMarketMyStatus();
    myStatus.value = st;
    loadMarket();
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
  }
}

function isExchanged(item) {
  return exchangedUserIds.value.includes(item.userId);
}

function viewCard(item) {
  // 详情页保持原有逻辑：跳转名片展示页（展示对方公开名片）
  const cardId = item.cardId || item.id;
  uni.navigateTo({ url: `/pages/card/cardDetail?id=${cardId}` });
}

async function quickExchange(item) {
  if (isExchanged(item)) {
    uni.showToast({ title: '已交换过名片', icon: 'none' });
    return;
  }
  if (!item.userId) { uni.showToast({ title: '对方暂不支持交换', icon: 'none' }); return; }
  try {
    await cardApi.exchangeRequest({ toUserId: item.userId });
    uni.showToast({ title: '交换请求已发送', icon: 'none' });
  } catch (err) {
    // 🔴 apiClient 永远 reject Error 对象（非字符串），旧代码 `typeof err==='string'`
    //    恒为 false → 把后端真实错误（或偶发网络/403）一律显示成"交换失败"，掩盖真相。
    //    改用 err.message 透传真实原因（后端会返回"已是人脉关系"等可读信息）。
    uni.showToast({ title: (err && err.message) || '交换失败', icon: 'none' });
  }
}

function goBack() { uni.navigateBack(); }
const goRequests = () => uni.navigateTo({ url: '/pages/card/exchangeRequests' });
const goConnections = () => uni.navigateTo({ url: '/pages/card/connections' });
</script>

<style scoped>
.market-page { min-height: 100vh; background: var(--bg-page); padding-bottom: 160rpx; }
/* 顶部主题色 hero（用户反馈「集市顶部没色彩」→ 与会员中心同一套渐变）；
   PageNav 透明融入，SIcon 传真实 #ffffff（不能消费 var()） */
.market-hero { background: linear-gradient(155deg, var(--design-primary, #0f766e), var(--design-gradient, #14b8a6)); }

/* 顶部导航栏 */
/* 旧导航栏右上角的图标区已随本次下沉一并删除（勿复活：上面挤且易点错）。
   🔴 彻栏空出来后 PageNav 右侧不再占位；若以后要把功能图标放回导航栏，
      必须同步恢复 PageNav 的 #right 插槽，否则会被微信胶囊压住。 */
.nav-title { font-size: 34rpx; font-weight: 600; color: var(--white); }
.nav-tag { margin-left: 12rpx; font-size: var(--fs-1); color: var(--white); background: rgba(255,255,255,0.2); padding: 4rpx 12rpx; border-radius: var(--radius-sm); }
/* 搜索 */
.search-bar { padding: 20rpx 24rpx; background: var(--white); }
.search-box { background: var(--bg-page); border-radius: var(--radius-xs); padding: 16rpx 20rpx; display: flex; align-items: center; gap: 12rpx; }
.search-input { flex: 1; min-width: 0; font-size: var(--fs-5); }
/* 交换请求 / 人脉库：从导航栏下沉到搜索框内右侧。
   🔴 touch 目标 ≥56rpx（旧 56rpx 图标在导航栏里与胶囊挤在一起易误触，
      下沉后四周是搜索框留白，误触率显著下降）。 */
.sb-sep { width: 2rpx; height: 32rpx; background: var(--bg-hover); flex-shrink: 0; }
.sb-icon { position: relative; flex-shrink: 0; width: 64rpx; height: 64rpx; display: flex; align-items: center; justify-content: center; }
.red-dot { position: absolute; top: -4rpx; right: -8rpx; min-width: 30rpx; height: 30rpx; line-height: 30rpx; border-radius: var(--radius-pill); background: #ff4d4f; color: var(--white); font-size: var(--fs-1); text-align: center; padding: 0 6rpx; box-sizing: border-box; }
.ph { color: var(--decor-2); }
.search-clear { font-size: var(--fs-3); color: var(--decor-2); padding: 0 8rpx; }

/* 我的集市开关 */
.market-switch-row { display: flex; align-items: center; justify-content: space-between; background: var(--white); padding: 20rpx 24rpx; margin-top: 2rpx; }
.switch-title { font-size: var(--fs-5); color: var(--t5); font-weight: 500; }
.switch-desc { font-size: var(--fs-2); color: var(--ink-3); margin-top: 4rpx; }

/* 公告 */
.notice-bar { display: flex; align-items: center; gap: 10rpx; background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.06); margin: 16rpx 24rpx; padding: 16rpx 20rpx; border-radius: var(--radius-xs); }
.notice-icon { font-size: var(--fs-3); }
.notice-text { font-size: var(--fs-3); color: var(--design-primary, #165dff); flex: 1; }

/* 筛选栏 */
.filter-bar { padding: 16rpx 0 4rpx; background: var(--bg-page); }
.filter-scroll { white-space: nowrap; }
.filter-inner { display: inline-flex; gap: 16rpx; padding: 0 24rpx; }
.filter-chip { padding: 10rpx 26rpx; border-radius: var(--radius-pill); font-size: var(--fs-3); color: var(--t2); background: var(--white); border: 1rpx solid var(--border); }
/* 筛选激活态：跟随租户主题（收敛前绿 #07c160 / 藏蓝 #1d4e8f 双色相） */
.filter-chip.on { color: var(--white); background: var(--design-primary, #165dff); border-color: var(--design-primary, #165dff); font-weight: 500; }
.filter-chip.has-need.on { background: var(--design-primary, #165dff); border-color: var(--design-primary, #165dff); }

/* ===== 方案A 双列卡片 ===== */
.dual-list { display: flex; gap: 16rpx; padding: 16rpx 24rpx; }
.dual-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16rpx; }
.m-card { background: var(--white); border-radius: var(--radius-md); padding: 20rpx; box-shadow: 0 8rpx 28rpx rgba(20,40,70,.08); position: relative; }
.m-badges { position: absolute; top: 16rpx; right: 16rpx; display: flex; gap: 8rpx; z-index: 2; }
.badge-top { font-size: 18rpx; color: var(--white); background: #ff4d4f; padding: 4rpx 10rpx; border-radius: var(--radius-sm); font-weight: 500; }
.badge-new { font-size: 18rpx; color: var(--white); background: var(--design-primary, #165dff); padding: 4rpx 10rpx; border-radius: var(--radius-sm); font-weight: 500; }
.m-head { display: flex; align-items: center; gap: 12rpx; margin-bottom: 14rpx; }
.m-avatar { width: 80rpx; height: 80rpx; border-radius: 50%; color: var(--brand-hero-ink, #fff); display: flex; align-items: center; justify-content: center; font-size: var(--fs-6); font-weight: 600; }
/* 身份头像渐变：个人/企业/员工三分收敛为同一主题渐变（类型区分靠 .type-* 徽章文字，
   收敛前蓝 #1d4e8f / 紫 #7c3aed / 绿 #07c160 三色相是集市页最杂的一处） */
.avatar-individual { background: linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff)); }
.avatar-enterprise { background: linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff)); }
.avatar-employee { background: linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff)); }
.m-type-tag { font-size: 18rpx; padding: 4rpx 12rpx; border-radius: var(--radius-sm); }
/* 身份类型徽章：三分统一主题 tint（类型靠文字表达，不再靠三色相） */
.type-individual { color: var(--design-primary, #165dff); background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08); }
.type-enterprise { color: var(--design-primary, #165dff); background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08); }
.type-employee { color: var(--design-primary, #165dff); background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08); }
.m-name { font-size: 30rpx; font-weight: 600; color: var(--t5); }
.m-position { font-size: var(--fs-2); color: var(--t2); margin-top: 4rpx; }
.m-company { font-size: var(--fs-2); color: var(--ink-3); margin-top: 4rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-need { display: flex; gap: 8rpx; margin-top: 12rpx; flex-wrap: wrap; }
/* 需求标签：跟随租户主题 tint（与 myCard .oc-need / cardDetail .skill-tag 同款，
   收敛前琥珀 #f59e0b + #fef3e2） */
.need-tag { font-size: var(--fs-1); color: var(--design-primary, #165dff); background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08); padding: 4rpx 12rpx; border-radius: var(--radius-sm); }
.m-tags { margin-top: 10rpx; }
.m-industry { font-size: var(--fs-1); color: var(--t2); background: var(--bg-page); padding: 4rpx 12rpx; border-radius: var(--radius-sm); }
.m-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx solid var(--border); }
.m-views { font-size: var(--fs-1); color: var(--ink-3); }
.m-exchange { font-size: var(--fs-2); color: var(--white); background: var(--design-primary, #165dff); padding: 8rpx 22rpx; border-radius: var(--radius-pill); font-weight: 500; }
.m-exchange.done { background: var(--decor-2); }

/* 折叠面板 */
.fold-panel { margin: 8rpx 24rpx 24rpx; background: var(--white); border-radius: var(--radius-md); padding: 24rpx; box-shadow: 0 8rpx 28rpx rgba(20,40,70,.08); }
.fold-title { display: flex; justify-content: space-between; font-size: var(--fs-4); font-weight: 600; color: var(--t5); }
.fold-arrow { font-size: var(--fs-2); color: var(--ink-3); font-weight: 400; }
.fold-body { margin-top: 16rpx; }
.rank-row { display: flex; align-items: center; gap: 16rpx; padding: 14rpx 0; border-bottom: 1rpx solid var(--border); }
.rank-row:last-child { border-bottom: none; }
.rank-no { width: 36rpx; height: 36rpx; border-radius: var(--radius-sm); background: var(--bg-page); color: var(--decor-2); font-size: var(--fs-2); display: flex; align-items: center; justify-content: center; font-weight: 600; }
.rank-no.top { background: var(--design-primary, #165dff); color: var(--white); }
.rank-name { flex: 1; font-size: var(--fs-4); color: var(--t5); }
.rank-num { font-size: var(--fs-2); color: var(--ink-3); }

/* ===== 方案B 重点会员横滚 ===== */
.b-section-title { font-size: var(--fs-5); font-weight: 600; color: var(--t5); padding: 24rpx 24rpx 8rpx; }
.b-scroll { white-space: nowrap; padding: 8rpx 0 16rpx; }
.b-inner { display: inline-flex; gap: 16rpx; padding: 0 24rpx; }
.b-card { width: 220rpx; background: var(--white); border-radius: var(--radius-md); padding: 20rpx; box-shadow: 0 8rpx 28rpx rgba(20,40,70,.08); position: relative; display: inline-block; white-space: normal; vertical-align: top; }
.b-badges { position: absolute; top: 12rpx; right: 12rpx; display: flex; gap: 6rpx; }
.b-avatar { width: 72rpx; height: 72rpx; border-radius: 50%; color: var(--brand-hero-ink, #fff); display: flex; align-items: center; justify-content: center; font-size: var(--fs-5); font-weight: 600; }
.b-name { font-size: var(--fs-4); font-weight: 600; color: var(--t5); margin-top: 12rpx; }
.b-position { font-size: var(--fs-1); color: var(--t2); margin-top: 4rpx; }
.b-company { font-size: var(--fs-1); color: var(--ink-3); margin-top: 4rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.b-exchange { margin-top: 14rpx; font-size: var(--fs-2); color: var(--white); background: var(--design-primary, #165dff); text-align: center; padding: 10rpx 0; border-radius: var(--radius-pill); }

/* ===== 方案C 分类页签 ===== */
.c-tabs { display: flex; background: var(--white); padding: 16rpx 24rpx; gap: 24rpx; }
.c-tab { font-size: var(--fs-5); color: var(--t2); padding: 8rpx 4rpx; position: relative; }
.c-tab.on { color: var(--design-primary, #165dff); font-weight: 600; }
.c-tab.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 6rpx; border-radius: 3rpx; background: var(--design-primary, #165dff); }
.c-list { padding: 16rpx 24rpx; display: flex; flex-direction: column; gap: 16rpx; }
.c-card { background: var(--white); border-radius: var(--radius-md); padding: 24rpx; box-shadow: 0 8rpx 28rpx rgba(20,40,70,.08); position: relative; }
.c-badges { position: absolute; top: 20rpx; right: 20rpx; display: flex; gap: 8rpx; }
.c-main { display: flex; gap: 16rpx; align-items: center; }
/* 头像底色是品牌渐变 → 白字在亮黄主色上只剩 1.75:1，改走 hero 同源裁决的 --brand-hero-ink */
.c-avatar { width: 88rpx; height: 88rpx; border-radius: 50%; color: var(--brand-hero-ink, #fff); display: flex; align-items: center; justify-content: center; font-size: 34rpx; font-weight: 600; }
.c-info { flex: 1; }
.c-name { font-size: 30rpx; font-weight: 600; color: var(--t5); }
.c-position { font-size: var(--fs-3); color: var(--t2); margin-top: 4rpx; }
.c-company { font-size: var(--fs-2); color: var(--ink-3); margin-top: 4rpx; }
.c-tags { display: flex; gap: 8rpx; margin-top: 14rpx; flex-wrap: wrap; }
.tag-need { font-size: var(--fs-1); color: var(--design-primary, #165dff); background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08); padding: 4rpx 12rpx; border-radius: var(--radius-sm); }
.c-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid var(--border); }
.c-type { font-size: var(--fs-2); color: var(--ink-3); }
.exchange-btn { font-size: var(--fs-2); color: var(--white); background: var(--design-primary, #165dff); padding: 10rpx 26rpx; border-radius: var(--radius-pill); font-weight: 500; }
.exchange-btn.done { background: var(--decor-2); }

/* 空状态 */
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; }
.empty-text { font-size: 30rpx; color: var(--t2); margin-top: 24rpx; }
.empty-hint { font-size: var(--fs-3); color: var(--ink-3); margin-top: 8rpx; }

.banner-swiper { height: 240rpx; margin: 16rpx 24rpx; border-radius: var(--radius-md); overflow: hidden; }
.banner-img { width: 100%; height: 100%; border-radius: var(--radius-md); }
.banner-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--bg-card-2); color: var(--decor-2); font-size: var(--fs-4); border-radius: var(--radius-md); }
.samecity-row { display: flex; align-items: center; gap: 12rpx; padding: 12rpx 24rpx 4rpx; }
.sc-pill { display: inline-flex; align-items: center; gap: 6rpx; font-size: var(--fs-3); color: var(--ink-3); background: var(--white); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 10rpx 22rpx; }
.sc-pill.on { color: var(--white); background: var(--design-primary, #165dff); border-color: var(--design-primary, #165dff); }
.sc-city { font-size: var(--fs-2); opacity: 0.8; }
.sc-tip { font-size: var(--fs-2); color: var(--ink-3); }
</style>
