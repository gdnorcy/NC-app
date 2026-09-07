<template>
  <view class="market-page">
    <!-- 顶部导航栏 -->
    <view class="nav-bar">
      <view class="nav-back" @click="goBack">
        <SIcon name="dynamic" size="default" color="#1a1a1a" />
      </view>
      <view class="nav-title">{{ settings.title || '人脉集市' }}</view>
      <view class="nav-tag" v-if="tenantName">{{ tenantName }}</view>
      <view class="nav-right"></view>
    </view>

    <!-- 搜索 -->
    <view class="search-bar">
      <view class="search-box">
        <SIcon name="dynamic" size="small" color="#9a9a9a" />
        <input class="search-input" v-model="keyword" placeholder="搜索姓名/公司/职位" placeholder-class="ph" @confirm="search" />
        <view v-if="keyword" class="search-clear" @click="clearSearch">✕</view>
      </view>
    </view>

    <!-- 我的集市开关 -->
    <view class="market-switch-row" v-if="mySubject">
      <view class="switch-info">
        <view class="switch-title">将我的名片展示到集市</view>
        <view class="switch-desc">{{ switchDesc }}</view>
      </view>
      <switch :checked="myOn" color="#07c160" @change="toggleMyCard" style="transform: scale(0.8);" />
    </view>

    <!-- 公告 -->
    <view class="notice-bar" v-if="settings.notice">
      <text class="notice-icon">📢</text>
      <text class="notice-text">{{ settings.notice }}</text>
    </view>

    <!-- ===== 方案C：分类页签 ===== -->
    <template v-if="style === 'C'">
      <view class="c-tabs">
        <view class="c-tab" :class="{ on: cTab === 'all' }" @click="switchCTab('all')">全部人脉</view>
        <view class="c-tab" :class="{ on: cTab === 'top' }" @click="switchCTab('top')">置顶会员</view>
        <view class="c-tab" :class="{ on: cTab === 'new' }" @click="switchCTab('new')">新入驻</view>
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
            <view class="filter-chip" :class="{ on: filterType === 'individual' }" @click="selectType('individual')">入驻个人</view>
            <view class="filter-chip" :class="{ on: filterType === 'enterprise' }" @click="selectType('enterprise')">企业主体</view>
            <view class="filter-chip" :class="{ on: filterType === 'employee' }" @click="selectType('employee')">企业员工</view>
            <view class="filter-chip has-need" :class="{ on: needFilter }" @click="toggleNeed">有供需</view>
            <view class="filter-chip" :class="{ on: sort === 'newest' }" @click="toggleSort">排序：{{ sort === 'newest' ? '新入驻' : '综合' }}</view>
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
            <view class="filter-chip" :class="{ on: filterType === 'individual' }" @click="selectType('individual')">入驻个人</view>
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
      <SIcon name="market" size="xlarge" color="#c9cdd4" />
      <view class="empty-text">暂无公开名片</view>
      <view class="empty-hint">成为第一个公开名片的人吧</view>
    </view>

    <!-- 底部TabBar（公共组件） -->
    <CardTabBar active="market" />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { onUnload } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { trackPageView } from '../../utils/analytics.js';
import { saveCardTabState, loadCardTabState, restoreScrollTop, h5ScrollTop } from '../../utils/cardTabState.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';

const items = ref([]);
const keyword = ref('');
const filterType = ref('all');
const needFilter = ref(false);
const sort = ref('comprehensive');
const style = ref('A');
const settings = ref({});
const tenantName = ref('');
const loading = ref(false);
const foldOpen = ref(false);
const cTab = ref('all');
const myStatus = ref(null); // { items, subjects }
const exchangedUserIds = ref([]);

const mySubject = computed(() => (myStatus.value?.subjects || []).find((s) => s.status === 'active'));
const myOn = computed(() => {
  if (!mySubject.value) return false;
  return (myStatus.value?.items || []).some((it) => it.subjectType === mySubject.value.subjectType && it.subjectId === mySubject.value.subjectId);
});
const switchDesc = computed(() => {
  if (!mySubject.value) return '';
  const mine = (myStatus.value?.items || []).find((it) => it.subjectType === mySubject.value.subjectType && it.subjectId === mySubject.value.subjectId);
  if (!mine) return '开启后你的名片将对租户内所有人可见';
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
  loadAll();
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
    }
    if (statusRes.status === 'fulfilled') myStatus.value = statusRes.value;
    if (connRes.status === 'fulfilled' && connRes.value.connections) {
      exchangedUserIds.value = connRes.value.connections
        .filter((c) => c.status === 'accepted')
        .map((c) => c.otherUserId || c.toUserId || c.fromUserId);
    }
  } catch (e) { console.error('加载集市配置失败', e); }
  await loadMarket();
  loading.value = false;
}

async function loadMarket() {
  try {
    const params = { type: filterType.value, keyword: keyword.value, sort: sort.value };
    if (needFilter.value) params.need = '找渠道';
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
    uni.showToast({ title: typeof err === 'string' ? err : '操作失败', icon: 'none' });
  }
}

function isExchanged(item) {
  return exchangedUserIds.value.includes(item.userId);
}

function viewCard(item) {
  // 详情页保持原有逻辑：跳转名片展示页（展示对方公开名片）
  const cardId = item.cardId || item.id;
  uni.navigateTo({ url: `/pages/card/myCard?id=${cardId}` });
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
    uni.showToast({ title: typeof err === 'string' ? err : '交换失败', icon: 'none' });
  }
}

function goBack() { uni.navigateBack(); }
</script>

<style scoped>
.market-page { min-height: 100vh; background: #f5f6f7; padding-bottom: 160rpx; }

/* 顶部导航栏 */
.nav-bar { display: flex; align-items: center; height: 88rpx; padding: 88rpx 32rpx 0; background: #fff; position: sticky; top: 0; z-index: 10; }
.nav-back { width: 64rpx; height: 64rpx; display: flex; align-items: center; justify-content: center; }
.nav-title { font-size: 34rpx; font-weight: 600; color: #1a1a1a; }
.nav-tag { margin-left: 12rpx; font-size: 20rpx; color: #1d4e8f; background: #e9f1fb; padding: 4rpx 12rpx; border-radius: 8rpx; }
.nav-right { width: 64rpx; }

/* 搜索 */
.search-bar { padding: 20rpx 24rpx; background: #fff; }
.search-box { background: #f5f6f7; border-radius: 12rpx; padding: 16rpx 20rpx; display: flex; align-items: center; gap: 12rpx; }
.search-input { flex: 1; font-size: 28rpx; }
.ph { color: #9a9a9a; }
.search-clear { font-size: 24rpx; color: #9a9a9a; padding: 0 8rpx; }

/* 我的集市开关 */
.market-switch-row { display: flex; align-items: center; justify-content: space-between; background: #fff; padding: 20rpx 24rpx; margin-top: 2rpx; }
.switch-title { font-size: 28rpx; color: #1a1a1a; font-weight: 500; }
.switch-desc { font-size: 22rpx; color: #9a9a9a; margin-top: 4rpx; }

/* 公告 */
.notice-bar { display: flex; align-items: center; gap: 10rpx; background: #e9f1fb; margin: 16rpx 24rpx; padding: 16rpx 20rpx; border-radius: 12rpx; }
.notice-icon { font-size: 24rpx; }
.notice-text { font-size: 24rpx; color: #1d4e8f; flex: 1; }

/* 筛选栏 */
.filter-bar { padding: 16rpx 0 4rpx; background: #f5f6f7; }
.filter-scroll { white-space: nowrap; }
.filter-inner { display: inline-flex; gap: 16rpx; padding: 0 24rpx; }
.filter-chip { padding: 10rpx 26rpx; border-radius: 999rpx; font-size: 24rpx; color: #5b5b5b; background: #fff; border: 1rpx solid #eeeeee; }
.filter-chip.on { color: #fff; background: #07c160; border-color: #07c160; font-weight: 500; }
.filter-chip.has-need.on { background: #1d4e8f; border-color: #1d4e8f; }

/* ===== 方案A 双列卡片 ===== */
.dual-list { display: flex; gap: 16rpx; padding: 16rpx 24rpx; }
.dual-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16rpx; }
.m-card { background: #fff; border-radius: 16rpx; padding: 20rpx; box-shadow: 0 4px 14px rgba(20,40,70,.08); position: relative; }
.m-badges { position: absolute; top: 16rpx; right: 16rpx; display: flex; gap: 8rpx; z-index: 2; }
.badge-top { font-size: 18rpx; color: #fff; background: #ff4d4f; padding: 4rpx 10rpx; border-radius: 8rpx; font-weight: 500; }
.badge-new { font-size: 18rpx; color: #fff; background: #1d4e8f; padding: 4rpx 10rpx; border-radius: 8rpx; font-weight: 500; }
.m-head { display: flex; align-items: center; gap: 12rpx; margin-bottom: 14rpx; }
.m-avatar { width: 80rpx; height: 80rpx; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32rpx; font-weight: 600; }
.avatar-individual { background: linear-gradient(135deg, #1d4e8f, #2e6bb8); }
.avatar-enterprise { background: linear-gradient(135deg, #7c3aed, #9d5cff); }
.avatar-employee { background: linear-gradient(135deg, #07c160, #2fd47d); }
.m-type-tag { font-size: 18rpx; padding: 4rpx 12rpx; border-radius: 8rpx; }
.type-individual { color: #1d4e8f; background: #e9f1fb; }
.type-enterprise { color: #7c3aed; background: #f3eeff; }
.type-employee { color: #07c160; background: #e6f9ef; }
.m-name { font-size: 30rpx; font-weight: 600; color: #1a1a1a; }
.m-position { font-size: 22rpx; color: #5b5b5b; margin-top: 4rpx; }
.m-company { font-size: 22rpx; color: #9a9a9a; margin-top: 4rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-need { display: flex; gap: 8rpx; margin-top: 12rpx; flex-wrap: wrap; }
.need-tag { font-size: 20rpx; color: #f59e0b; background: #fef3e2; padding: 4rpx 12rpx; border-radius: 8rpx; }
.m-tags { margin-top: 10rpx; }
.m-industry { font-size: 20rpx; color: #5b5b5b; background: #f5f6f7; padding: 4rpx 12rpx; border-radius: 8rpx; }
.m-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx solid #f0f0f0; }
.m-views { font-size: 20rpx; color: #9a9a9a; }
.m-exchange { font-size: 22rpx; color: #fff; background: #07c160; padding: 8rpx 22rpx; border-radius: 999rpx; font-weight: 500; }
.m-exchange.done { background: #9a9a9a; }

/* 折叠面板 */
.fold-panel { margin: 8rpx 24rpx 24rpx; background: #fff; border-radius: 16rpx; padding: 24rpx; box-shadow: 0 4px 14px rgba(20,40,70,.08); }
.fold-title { display: flex; justify-content: space-between; font-size: 26rpx; font-weight: 600; color: #1a1a1a; }
.fold-arrow { font-size: 22rpx; color: #9a9a9a; font-weight: 400; }
.fold-body { margin-top: 16rpx; }
.rank-row { display: flex; align-items: center; gap: 16rpx; padding: 14rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.rank-row:last-child { border-bottom: none; }
.rank-no { width: 36rpx; height: 36rpx; border-radius: 8rpx; background: #f5f6f7; color: #9a9a9a; font-size: 22rpx; display: flex; align-items: center; justify-content: center; font-weight: 600; }
.rank-no.top { background: #1d4e8f; color: #fff; }
.rank-name { flex: 1; font-size: 26rpx; color: #1a1a1a; }
.rank-num { font-size: 22rpx; color: #9a9a9a; }

/* ===== 方案B 重点会员横滚 ===== */
.b-section-title { font-size: 28rpx; font-weight: 600; color: #1a1a1a; padding: 24rpx 24rpx 8rpx; }
.b-scroll { white-space: nowrap; padding: 8rpx 0 16rpx; }
.b-inner { display: inline-flex; gap: 16rpx; padding: 0 24rpx; }
.b-card { width: 220rpx; background: #fff; border-radius: 16rpx; padding: 20rpx; box-shadow: 0 4px 14px rgba(20,40,70,.08); position: relative; display: inline-block; white-space: normal; vertical-align: top; }
.b-badges { position: absolute; top: 12rpx; right: 12rpx; display: flex; gap: 6rpx; }
.b-avatar { width: 72rpx; height: 72rpx; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 28rpx; font-weight: 600; }
.b-name { font-size: 26rpx; font-weight: 600; color: #1a1a1a; margin-top: 12rpx; }
.b-position { font-size: 20rpx; color: #5b5b5b; margin-top: 4rpx; }
.b-company { font-size: 20rpx; color: #9a9a9a; margin-top: 4rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.b-exchange { margin-top: 14rpx; font-size: 22rpx; color: #fff; background: #07c160; text-align: center; padding: 10rpx 0; border-radius: 999rpx; }

/* ===== 方案C 分类页签 ===== */
.c-tabs { display: flex; background: #fff; padding: 16rpx 24rpx; gap: 24rpx; }
.c-tab { font-size: 28rpx; color: #5b5b5b; padding: 8rpx 4rpx; position: relative; }
.c-tab.on { color: #07c160; font-weight: 600; }
.c-tab.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 6rpx; border-radius: 3rpx; background: #07c160; }
.c-list { padding: 16rpx 24rpx; display: flex; flex-direction: column; gap: 16rpx; }
.c-card { background: #fff; border-radius: 16rpx; padding: 24rpx; box-shadow: 0 4px 14px rgba(20,40,70,.08); position: relative; }
.c-badges { position: absolute; top: 20rpx; right: 20rpx; display: flex; gap: 8rpx; }
.c-main { display: flex; gap: 16rpx; align-items: center; }
.c-avatar { width: 88rpx; height: 88rpx; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 34rpx; font-weight: 600; }
.c-info { flex: 1; }
.c-name { font-size: 30rpx; font-weight: 600; color: #1a1a1a; }
.c-position { font-size: 24rpx; color: #5b5b5b; margin-top: 4rpx; }
.c-company { font-size: 22rpx; color: #9a9a9a; margin-top: 4rpx; }
.c-tags { display: flex; gap: 8rpx; margin-top: 14rpx; flex-wrap: wrap; }
.tag-need { font-size: 20rpx; color: #f59e0b; background: #fef3e2; padding: 4rpx 12rpx; border-radius: 8rpx; }
.c-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid #f0f0f0; }
.c-type { font-size: 22rpx; color: #9a9a9a; }
.exchange-btn { font-size: 22rpx; color: #fff; background: #07c160; padding: 10rpx 26rpx; border-radius: 999rpx; font-weight: 500; }
.exchange-btn.done { background: #9a9a9a; }

/* 空状态 */
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; }
.empty-text { font-size: 30rpx; color: #5b5b5b; margin-top: 24rpx; }
.empty-hint { font-size: 24rpx; color: #9a9a9a; margin-top: 8rpx; }
</style>
