<template>
  <view class="home-page" :style="pageBgStyle">
    <!-- 分享进入 + 主题设置「返回上页」开启：顶部返回首页按钮（小程序端） -->
    <view v-if="shareBack" class="share-back" @click="goHomeByShare">
      <text class="share-back-arrow">‹</text>
      <text class="share-back-text">返回首页</text>
    </view>
    <!-- 设计中心头部设置（方案一：custom/immersive/official；方案二：ew 风格头部） -->
    <DesignNav v-if="designHeader && designHeader.scheme !== 2" :header="designHeader" page-name="首页" />
    <DesignNavEw v-else-if="designHeader" :header="designHeader" page-name="首页" :scrolled="headerScrolled" @search="goSearch" />
    <!-- 无页面头部配置时：系统风格「头部颜色/头部文字」全局默认头部（页面装修头部设置可单页覆盖） -->
    <view v-else-if="sysHeadStyle" class="sys-head" :style="sysHeadStyle" @click="goPage('/pages/card/profile')">
      <text class="sys-head-title" :style="{ color: sysHeadText }">{{ designTheme.shareTitle || '首页' }}</text>
      <view class="sys-head-avatar" :style="{ background: sysHeadText }">
        <SIcon name="user" size="small" color="#ffffff" />
      </view>
    </view>

    <!-- 装修组件区：DIY 组件与名片模块组件按配置顺序渲染（可穿插排序） -->
    <template v-if="designComps.length" v-for="(c, i) in designComps" :key="i">
      <!-- 名片搜索栏 -->
      <view v-if="c.type === 'native-search'" class="top-bar" :class="{ 'with-design-nav': (designHeader && designHeader.type !== 'immersive') || sysHeadStyle }" :style="nativeMargin(c.props)">
        <view class="search-box" @click="goSearch">
          <SIcon name="dynamic" size="small" color="#86909c" />
          <text class="search-placeholder">搜索名片、客户、人脉</text>
        </view>
        <view class="msg-icon" @click="goMessages">
          <SIcon name="audit" size="default" color="#4e5969" />
          <view class="msg-dot" v-if="unreadCount > 0"></view>
        </view>
      </view>
      <!-- 名片宫格（9 宫格） -->
      <view v-else-if="c.type === 'native-grid'" class="grid-section" :style="nativeMargin(c.props)">
        <view class="grid">
          <view class="grid-item" v-for="item in features" :key="item.key" @click="goPage(item.path)">
            <view class="grid-icon" :style="{ background: item.bg }">
              <SIcon :name="item.icon" size="large" color="#ffffff" />
            </view>
            <view class="grid-label">{{ item.label }}</view>
          </view>
        </view>
      </view>
      <!-- 我的名片 -->
      <view v-else-if="c.type === 'native-mycard'" class="section" :style="nativeMargin(c.props)">
        <view class="section-header" v-if="c.props.showTitle !== false">
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
      <view v-else-if="c.type === 'native-radar'" class="section" :style="nativeMargin(c.props)">
        <view class="section-header" v-if="c.props.showTitle !== false">
          <view class="section-title">
            <SIcon name="radar" size="default" color="#00b42a" />
            <text>访客雷达</text>
          </view>
          <view class="section-more" @click="goVisitors">查看全部 ›</view>
        </view>
        <view class="visitor-stats">
          <view class="visitor-stat" v-if="c.props.showToday !== false">
            <view class="visitor-num">{{ visitorStats.today || 0 }}</view>
            <view class="visitor-label">今日访客</view>
          </view>
          <view class="visitor-divider" v-if="c.props.showToday !== false && c.props.showTotal !== false"></view>
          <view class="visitor-stat" v-if="c.props.showTotal !== false">
            <view class="visitor-num">{{ visitorStats.total || 0 }}</view>
            <view class="visitor-label">累计访客</view>
          </view>
          <view class="visitor-divider" v-if="c.props.showTotal !== false && c.props.showExchange !== false"></view>
          <view class="visitor-stat" v-if="c.props.showExchange !== false">
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
      <!-- 人脉集市 -->
      <view v-else-if="c.type === 'native-market'" class="section" :style="nativeMargin(c.props)">
        <view class="section-header" v-if="c.props.showTitle !== false">
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
      <!-- 其余 DIY 组件 -->
      <DesignPage v-else :comps="[c]" :stats="visitorStats" :tenant-id="designTenantId" :global="designGlobal" /> </template>

    <!-- 底部间距 -->
    <view class="bottom-space"></view>

    <!-- 底部Tab：优先渲染设计中心发布的默认导航方案，未发布时兜底默认项 -->
    <CardTabBar active="home" />
  </view>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { onShow, onLoad, onPageScroll, onShareAppMessage } from '@dcloudio/uni-app';
import { shadeHex } from '../../utils/color.js';
import { cardApi } from '../../utils/cardApi.js';
import { fetchDesignConfig, resolveHomePath, JUMP_DONE_KEY, buildShareCard, shouldShowShareBack, resolveAssetUrl } from '../../utils/design.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';
import DesignPage from '../../components/DesignPage.vue';
import DesignNav from '../../components/DesignNav.vue';
import DesignNavEw from '../../components/DesignNavEw.vue';

const user = ref({});
const myCard = ref(null);
const unreadCount = ref(0);
const visitorStats = ref({ today: 0, total: 0, exchange: 0 });
const visitorList = ref([]);
const marketList = ref([]);
const designComps = ref([]);
const designTenantId = ref(0);
const designHeader = ref(null);
const designGlobal = ref({});
const designTheme = ref({});
const designStyle = ref(null);
const shareBack = ref(false);
const headerScrolled = ref(false);
// 名片模块组件外边距（schema 上边距/下边距）
function nativeMargin(props) {
  const p = props || {};
  const s = {};
  if (p.marginTop) s.marginTop = p.marginTop + 'px';
  if (p.marginBottom) s.marginBottom = p.marginBottom + 'px';
  return s;
}
// 系统风格头部（无页面头部配置时全局默认）：headColor 跟随主色→主题色底 / 白色头部→白底；文字色对应
const sysHeadStyle = computed(() => {
  const st = designStyle.value;
  if (!st) return null;
  const bg = st.headColor === '2' ? '#FFFFFF' : st.primaryColor;
  return { background: bg, color: st.headColor === '2' ? '#000000' : st.headText };
});
const sysHeadText = computed(() => {
  const st = designStyle.value;
  if (!st) return '#ffffff';
  return st.headColor === '2' ? '#000000' : st.headText;
});
// 页面背景 = 页面装修「全局设置」的背景色/背景图（C 端真机渲染，编辑端 phoneStyle 同源）
const pageBgStyle = computed(() => {
  const g = designGlobal.value || {};
  const s = {};
  if (g.bgImage) {
    s.backgroundImage = `url(${resolveAssetUrl(g.bgImage)})`;
    s.backgroundSize = 'cover';
    s.backgroundPosition = 'center';
  }
  if (g.bgColor) s.backgroundColor = g.bgColor;
  return s;
});
onPageScroll((e) => { headerScrolled.value = (e?.scrollTop || 0) > 10; });
let pageOptions = {};
onLoad((o) => { pageOptions = o || {}; });

// 小程序分享卡片：标题/图片取主题设置「分享标题/分享图片」，path 带当前租户 tid
onShareAppMessage(() => {
  const tid = pageOptions.tid ? `?tid=${pageOptions.tid}` : '';
  return buildShareCard(designTheme.value, '首页', `/pages/cardMain/home${tid}`);
});

// 「返回上页」开启时，分享进入 → 返回首页
function goHomeByShare() {
  // #ifdef MP-WEIXIN
  uni.reLaunch({ url: `/pages/cardMain/home${pageOptions.tid ? `?tid=${pageOptions.tid}` : ''}` });
  // #endif
}

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

  // 设计中心首页装修：预览模式（?preview=1）加载草稿组件，否则加载已发布组件；
  // 首页跳转选择器支持指定 DIY 装修页面（?pageType=xxx，如 /pages/cardMain/home?pageType=product）
  try {
    const preview = isPreviewMode();
    const pageType = String(pageOptions.pageType || '').trim();
    const config = await fetchDesignConfig(preview, preview, pageType);
    const comps = config?.pages?.components || [];
    designComps.value = Array.isArray(comps) ? comps : [];
    designTenantId.value = config?.tenantId || 0;
    designHeader.value = config?.header || null;
    designGlobal.value = config?.pages?.meta?.global || {};
    designTheme.value = config?.pages?.meta?.theme || {};
    designStyle.value = config?.style || null;
    // 分享进入 + 主题设置「返回上页」开启 → 顶部显示返回首页按钮
    shareBack.value = shouldShowShareBack(pageOptions, designTheme.value);
    // 编辑预览（iframe 画布）下不弹草稿提示，避免干扰真实渲染观感
    if (preview && !isEditor) {
      if (!designComps.value.length) uni.showToast({ title: '草稿暂无组件', icon: 'none' });
      else uni.showToast({ title: '草稿预览模式', icon: 'none' });
    }
  } catch (e) { console.error('[design-load-error]', e && e.message ? e.message : e); }

  // 消息未读红点（编辑预览跳过：游客视角无登录态）
  if (!isEditor) {
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
  }
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
/* 分享进入 + 「返回上页」开启：顶部返回首页按钮 */
.share-back {
  position: fixed;
  top: calc(var(--status-bar-height, 0px) + 8px);
  left: 10px;
  z-index: 300;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 12px 5px 8px;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 18px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  font-size: 13px;
  color: #1d2129;
}
.share-back-arrow { font-size: 18px; line-height: 1; margin-right: 2px; }
.share-back-text { font-size: 13px; }
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
/* 系统风格全局默认头部（无页面头部配置时）：背景=头部颜色，文字=头部文字 */
.sys-head {
  display: flex; align-items: center; justify-content: space-between;
  height: 88rpx; padding: 88rpx 32rpx 0;
  box-sizing: content-box;
}
.sys-head-title { font-size: 34rpx; font-weight: 600; }
.sys-head-avatar { width: 56rpx; height: 56rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: .2; }
/* 有设计导航（custom/official 占文档流）时去掉顶部安全距，由导航占位 */
.top-bar.with-design-nav {
  padding-top: 16rpx;
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

/* ---- 编辑预览（设计中心 iframe）：组件槽点击选中高亮 ---- */
</style>
