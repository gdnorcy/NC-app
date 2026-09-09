<template>
  <view class="home-page">
    <!-- 设计中心装修区（发布/预览的首页组件） -->
    <DesignPage v-if="designComps.length" :comps="designComps" :stats="visitorStats" :tenant-id="designTenantId" class="design-section" />

    <!-- 顶部搜索栏 -->
    <view class="top-bar">
      <view class="search-box" @click="goSearch">
        <SIcon name="dynamic" size="small" color="#86909c" />
        <text class="search-placeholder">搜索名片、客户、人脉</text>
      </view>
      <view class="msg-icon" @click="goMessages">
        <SIcon name="audit" size="default" color="#4e5969" />
        <view class="msg-dot" v-if="unreadCount > 0"></view>
      </view>
    </view>

    <!-- 功能九宫格 -->
    <view class="grid-section">
      <view class="grid">
        <view class="grid-item" v-for="item in features" :key="item.key" @click="goPage(item.path)">
          <view class="grid-icon" :style="{ background: item.bg }">
            <SIcon :name="item.icon" size="large" color="#ffffff" />
          </view>
          <view class="grid-label">{{ item.label }}</view>
        </view>
      </view>
    </view>

    <!-- 我的名片卡片 -->
    <view class="section">
      <view class="section-header">
        <view class="section-title">我的名片</view>
        <view class="section-more" @click="goMyCard">查看详情 ›</view>
      </view>
      <view class="my-card" v-if="myCard" @click="goMyCard">
        <view class="card-avatar" :style="avatarStyle">
          <image v-if="myCard.avatar" :src="myCard.avatar" class="avatar-img" mode="aspectFill" />
          <text v-else>{{ myCard.name?.[0] || '名' }}</text>
        </view>
        <view class="card-info">
          <view class="card-name">{{ myCard.name }}</view>
          <view class="card-position">{{ myCard.position || '未设置职位' }}</view>
          <view class="card-company">{{ myCard.company || '未设置公司' }}</view>
        </view>
        <view class="card-edit" @click.stop="goEdit">
          <SIcon name="template" size="small" color="#165dff" />
          <text>编辑</text>
        </view>
      </view>
      <view class="my-card create" v-else @click="goCreate">
        <view class="create-icon"><SIcon name="card" size="xlarge" color="#165dff" /></view>
        <view class="create-info">
          <view class="create-title">创建我的名片</view>
          <view class="create-desc">三步完成，快速创建专属名片</view>
        </view>
        <view class="create-arrow">›</view>
      </view>
    </view>

    <!-- 访客雷达 -->
    <view class="section">
      <view class="section-header">
        <view class="section-title">
          <SIcon name="radar" size="default" color="#00b42a" />
          <text>访客雷达</text>
        </view>
        <view class="section-more" @click="goVisitors">查看全部 ›</view>
      </view>
      <view class="visitor-stats">
        <view class="visitor-stat">
          <view class="visitor-num">{{ visitorStats.today || 0 }}</view>
          <view class="visitor-label">今日访客</view>
        </view>
        <view class="visitor-divider"></view>
        <view class="visitor-stat">
          <view class="visitor-num">{{ visitorStats.total || 0 }}</view>
          <view class="visitor-label">累计访客</view>
        </view>
        <view class="visitor-divider"></view>
        <view class="visitor-stat">
          <view class="visitor-num">{{ visitorStats.exchange || 0 }}</view>
          <view class="visitor-label">名片交换</view>
        </view>
      </view>
      <view class="visitor-list" v-if="visitorList.length">
        <view class="visitor-item" v-for="v in visitorList" :key="v.id">
          <view class="visitor-avatar">{{ v.name?.[0] || '访' }}</view>
          <view class="visitor-info">
            <view class="visitor-name">{{ v.name || '匿名访客' }}</view>
            <view class="visitor-time">{{ v.visitTime || '刚刚' }}</view>
          </view>
          <view class="visitor-action">查看名片</view>
        </view>
      </view>
      <view class="empty-hint" v-else>暂无访客记录</view>
    </view>

    <!-- 人脉集市推荐 -->
    <view class="section">
      <view class="section-header">
        <view class="section-title">
          <SIcon name="market" size="default" color="#722ed1" />
          <text>人脉集市</text>
        </view>
        <view class="section-more" @click="goMarket">进入集市 ›</view>
      </view>
      <scroll-view class="market-scroll" scroll-x v-if="marketList.length">
        <view class="market-list">
          <view class="market-card" v-for="item in marketList" :key="item.id" @click="viewMarketCard(item)">
            <view class="market-avatar">{{ item.name?.[0] || '名' }}</view>
            <view class="market-name">{{ item.name }}</view>
            <view class="market-position">{{ item.position || '—' }}</view>
            <view class="market-company">{{ item.companyName || item.company || '—' }}</view>
          </view>
        </view>
      </scroll-view>
      <view class="empty-hint" v-else>暂无人脉推荐</view>
    </view>

    <!-- 底部间距 -->
    <view class="bottom-space"></view>

    <!-- 底部Tab：优先渲染设计中心发布的默认导航方案，未发布时兜底默认项 -->
    <CardTabBar active="home" />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { onShow, onLoad } from '@dcloudio/uni-app';
import { shadeHex } from '../../utils/color.js';
import { cardApi } from '../../utils/cardApi.js';
import { fetchDesignConfig, resolveHomePath, JUMP_DONE_KEY } from '../../utils/design.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';
import DesignPage from '../../components/DesignPage.vue';

const user = ref({});
const myCard = ref(null);
const unreadCount = ref(0);
const visitorStats = ref({ today: 0, total: 0, exchange: 0 });
const visitorList = ref([]);
const marketList = ref([]);
const designComps = ref([]);
const designTenantId = ref(0);
let pageOptions = {};
onLoad((o) => { pageOptions = o || {}; });

// 预览标志：优先 onLoad options，H5 端兜底直接读 hash query（避免 onLoad 解析差异）
function isPreviewMode() {
  if (pageOptions.preview === '1') return true;
  // #ifdef H5
  try {
    const q = (window.location.hash.split('?')[1] || '');
    if (new URLSearchParams(q).get('preview') === '1') return true;
  } catch { /* 忽略 */ }
  // #endif
  return false;
}

const features = [
  { key: 'card', icon: 'card', label: '我的名片', path: '/pages/card/myCard', bg: 'linear-gradient(135deg,#165dff,#4080ff)' },
  { key: 'visitors', icon: 'radar', label: '访客雷达', path: '/pages/card/visitors', bg: 'linear-gradient(135deg,#00b42a,#23c343)' },
  { key: 'customers', icon: 'customer', label: '客户管理', path: '/pages/card/customers', bg: 'linear-gradient(135deg,#ff7d00,#ff9a2e)' },
  { key: 'market', icon: 'market', label: '人脉集市', path: '/pages/card/market', bg: 'linear-gradient(135deg,#722ed1,#9254de)' },
  { key: 'exchange', icon: 'exchange', label: '名片交换', path: '/pages/card/connections', bg: 'linear-gradient(135deg,#13c2c2,#36cfc9)' },
  { key: 'distribution', icon: 'wallet', label: '分销中心', path: '/pages/card/distribution', bg: 'linear-gradient(135deg,#f5222d,#ff4d4f)' },
  { key: 'member', icon: 'crown', label: '会员中心', path: '/pages/card/member', bg: 'linear-gradient(135deg,#faad14,#ffc53d)' },
  { key: 'dynamic', icon: 'dynamic', label: '我的动态', path: '/pages/card/dynamic', bg: 'linear-gradient(135deg,#eb2f96,#f759ab)' },
  { key: 'more', icon: 'apps', label: '更多', path: '/pages/card/profile', bg: 'linear-gradient(135deg,#86909c,#a9aeb8)' },
];

onMounted(async () => {
  try {
    const res = await cardApi.getProfile();
    user.value = res.user;
    myCard.value = res.card;
  } catch (e) {}

  // 设计中心首页装修：预览模式（?preview=1）加载草稿组件，否则加载已发布组件
  try {
    const preview = isPreviewMode();
    const config = await fetchDesignConfig(preview, preview);
    const comps = config?.pages?.components || [];
    designComps.value = Array.isArray(comps) ? comps : [];
    designTenantId.value = config?.tenantId || 0;
    if (preview && !designComps.value.length) uni.showToast({ title: '草稿暂无组件', icon: 'none' });
    else if (preview) uni.showToast({ title: '草稿预览模式', icon: 'none' });
  } catch (e) {}

  // 消息未读红点
  try {
    const unread = await cardApi.getMessageUnread();
    unreadCount.value = unread.count || 0;
  } catch (e) {}

  // 加载访客统计
  try {
    const summary = await cardApi.getVisitorSummary();
    visitorStats.value = {
      today: summary.todayCount || 0,
      total: summary.totalCount || 0,
      exchange: summary.exchangeCount || 0,
    };
  } catch (e) {}

  // 加载人脉集市推荐
  try {
    const market = await cardApi.getMarketList({ type: 'all' });
    marketList.value = (market.items || []).slice(0, 6);
  } catch (e) {}
});

// 我的名片头像/卡片品牌色渐变（租户 brandColor，无则默认蓝）
const avatarStyle = computed(() => {
  const c = myCard.value?.brandColor;
  if (!c || !/^#[0-9a-fA-F]{6}$/.test(c)) return {};
  const dark = shadeHex(c, -0.3);
  return { background: `linear-gradient(135deg, ${dark}, ${c})` };
});

// 设计中心首页跳转：配置了非默认首页时，首次进入自动跳转到对应页面
const homeJumpChecked = ref(false);
onShow(() => {
  if (isPreviewMode()) return; // 预览模式不触发首页跳转
  if (homeJumpChecked.value) return;
  homeJumpChecked.value = true;
  (async () => {
    try {
      if (uni.getStorageSync(JUMP_DONE_KEY)) return;
      const config = await fetchDesignConfig(false);
      const target = resolveHomePath(config?.homePage);
      if (!target) return;
      uni.setStorageSync(JUMP_DONE_KEY, '1');
      uni.reLaunch({ url: target });
    } catch (e) { /* 配置拉取失败不阻断首页 */ }
  })();
});

function goPage(path) {
  uni.navigateTo({ url: path });
}
function goMyCard() {
  if (myCard.value) {
    uni.navigateTo({ url: `/pages/card/myCard?id=${myCard.value.id}` });
  } else {
    goCreate();
  }
}
function goEdit() {
  if (myCard.value) {
    uni.navigateTo({ url: `/pages/card/create?id=${myCard.value.id}` });
  }
}
function goCreate() {
  uni.navigateTo({ url: '/pages/card/create' });
}
function goVisitors() {
  uni.navigateTo({ url: '/pages/card/visitors' });
}
function goMarket() {
  uni.navigateTo({ url: '/pages/card/market' });
}
function goSearch() {
  uni.showToast({ title: '搜索功能开发中', icon: 'none' });
}
function goMessages() {
  uni.navigateTo({ url: '/pages/card/messages' });
}
function viewMarketCard(item) {
  uni.navigateTo({ url: `/pages/card/cardDetail?id=${item.userId || item.id}` });
}
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: #f5f7fa;
  padding-bottom: 120rpx;
}

/* 顶部搜索栏 */
.top-bar {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 88rpx 32rpx 24rpx;
  background: #fff;
}
.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12rpx;
  height: 72rpx;
  background: #f2f3f5;
  border-radius: 36rpx;
  padding: 0 28rpx;
}
.search-placeholder {
  font-size: 26rpx;
  color: #86909c;
}
.msg-icon {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.msg-dot {
  position: absolute;
  top: 14rpx;
  right: 14rpx;
  width: 16rpx;
  height: 16rpx;
  background: #f53f3f;
  border-radius: 8rpx;
}

/* 功能九宫格 */
.grid-section {
  background: #fff;
  padding: 32rpx 16rpx;
  margin-bottom: 16rpx;
}
.grid {
  display: flex;
  flex-wrap: wrap;
}
.grid-item {
  width: 33.33%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 0;
}
.grid-icon {
  width: 88rpx;
  height: 88rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12rpx;
}
.grid-label {
  font-size: 24rpx;
  color: #4e5969;
}

/* 通用区块 */
.section {
  background: #fff;
  margin: 0 24rpx 16rpx;
  border-radius: 16rpx;
  padding: 28rpx;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #1d2129;
}
.section-more {
  font-size: 24rpx;
  color: #86909c;
}

/* 我的名片卡片 */
.my-card {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx;
  background: linear-gradient(135deg, #165dff, #4080ff);
  border-radius: 16rpx;
}
.my-card.create {
  background: #f7f8fa;
  border: 2rpx dashed #c9cdd4;
}
.card-avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 48rpx;
  background: rgba(255,255,255,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  flex-shrink: 0;
}
.avatar-img {
  width: 100%;
  height: 100%;
}
.card-info {
  flex: 1;
  min-width: 0;
}
.card-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #fff;
}
.card-position {
  font-size: 24rpx;
  color: rgba(255,255,255,0.85);
  margin-top: 4rpx;
}
.card-company {
  font-size: 22rpx;
  color: rgba(255,255,255,0.65);
  margin-top: 4rpx;
}
.card-edit {
  display: flex;
  align-items: center;
  gap: 6rpx;
  background: rgba(255,255,255,0.2);
  padding: 10rpx 20rpx;
  border-radius: 24rpx;
  font-size: 24rpx;
  color: #fff;
  flex-shrink: 0;
}
.create-icon {
  width: 80rpx;
  height: 80rpx;
  background: rgba(22,93,255,0.1);
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.create-info {
  flex: 1;
}
.create-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
}
.create-desc {
  font-size: 22rpx;
  color: #86909c;
  margin-top: 4rpx;
}
.create-arrow {
  font-size: 36rpx;
  color: #c9cdd4;
}

/* 访客雷达 */
.visitor-stats {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  background: #f7f8fa;
  border-radius: 12rpx;
  margin-bottom: 20rpx;
}
.visitor-stat {
  flex: 1;
  text-align: center;
}
.visitor-num {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--design-primary, #165dff);
}
.visitor-label {
  font-size: 22rpx;
  color: #86909c;
  margin-top: 4rpx;
}
.visitor-divider {
  width: 2rpx;
  height: 48rpx;
  background: #e5e6eb;
}
.visitor-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.visitor-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 12rpx 0;
}
.visitor-avatar {
  width: 64rpx;
  height: 64rpx;
  border-radius: 32rpx;
  background: linear-gradient(135deg, #00b42a, #23c343);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  font-weight: 600;
}
.visitor-info {
  flex: 1;
}
.visitor-name {
  font-size: 26rpx;
  color: #1d2129;
}
.visitor-time {
  font-size: 22rpx;
  color: #86909c;
  margin-top: 2rpx;
}
.visitor-action {
  font-size: 24rpx;
  color: var(--design-primary, #165dff);
}

/* 人脉集市 */
.market-scroll {
  white-space: nowrap;
  margin: 0 -28rpx;
  padding: 0 28rpx;
}
.market-list {
  display: inline-flex;
  gap: 16rpx;
}
.market-card {
  width: 200rpx;
  background: #f7f8fa;
  border-radius: 12rpx;
  padding: 20rpx;
  text-align: center;
  display: inline-block;
}
.market-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 36rpx;
  background: linear-gradient(135deg, #722ed1, #9254de);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
  margin: 0 auto 12rpx;
}
.market-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #1d2129;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.market-position {
  font-size: 22rpx;
  color: #4e5969;
  margin-top: 4rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.market-company {
  font-size: 20rpx;
  color: #86909c;
  margin-top: 2rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-hint {
  text-align: center;
  font-size: 24rpx;
  color: #c9cdd4;
  padding: 32rpx 0;
}
.bottom-space {
  height: 140rpx;
}

/* 底部Tab：由 CardTabBar 组件承载（设计中心导航方案优先） */
</style>
