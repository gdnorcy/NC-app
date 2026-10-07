<template>
  <view class="home-page" :style="[pageBgStyle, themeStyle]">
    <!-- 分享进入 + 主题设置「返回上页」开启：顶部返回首页按钮（小程序端） -->
    <view v-if="shareBack" class="share-back" :style="{ top: shareBackTop }" @click="goHomeByShare">
      <text class="share-back-arrow">‹</text>
      <text class="share-back-text">返回首页</text>
    </view>
    <!-- 设计中心头部设置（方案一：custom/immersive/official；方案二：ew 风格头部） -->
    <DesignNav v-if="designHeader && designHeader.scheme !== 2" :header="designHeader" page-name="首页" />
    <DesignNavEw v-else-if="designHeader" :header="designHeader" page-name="首页" :scrolled="headerScrolled" @search="goSearch" />
    <!-- 无页面头部配置时：系统风格「头部颜色/头部文字」全局默认头部（页面装修头部设置可单页覆盖） -->
    <view v-else-if="sysHeadStyle" class="sys-head" :style="[sysHeadStyle, { paddingTop: sysHeadPadTop, paddingRight: sysHeadPadRight }]" @click="goPage('/pages/card/profile')">
      <text class="sys-head-title" :style="{ color: sysHeadText }">{{ headerTitle || '首页' }}</text>
      <view class="sys-head-avatar" :style="{ background: sysHeadText }">
        <SIcon name="user" size="small" color="#ffffff" />
      </view>
    </view>

    <!-- 装修组件区：DIY 组件与名片模块组件按配置顺序渲染（可穿插排序） -->
    <template v-if="designComps.length" v-for="(c, i) in designComps" :key="i">
      <!-- 名片搜索栏 -->
      <view v-if="c.type === 'native-search'" class="top-bar" :class="{ 'with-design-nav': (designHeader && designHeader.type !== 'immersive') || sysHeadStyle }" :style="topBarStyle(c.props)">
        <!-- 🔴 铃铛永远贴右：给搜索框 `margin-right:auto`（把剩余空间让给铃铛），
             搜索框自己靠左。原先用 `margin:0auto`（两侧auto）会把剩余空间平分，
             导致铃铛被推到中间 —— 用户反馈「一直居左，感觉是多余的」。 -->
        <view class="search-box" :style="searchBoxStyle(c.props)" @click="goSearch">
          <SIcon name="dynamic" size="small" :color="c.props.textColor || '#86909c'" />
          <view class="search-placeholder" :style="placeholderStyle(c.props)">{{ c.props.placeholder || '搜索名片、客户、人脉' }}</view>
        </view>
        <view class="msg-icon" v-if="c.props.showMsg !== false" :class="{ 'has-unread': unreadCount > 0 }" @click="goMessages">
          <view class="msg-icon-inner"><SIcon name="bell" size="default" color="#4e5969" /></view>
          <view class="msg-badge" v-if="unreadCount > 0">{{ unreadCount > 99 ? '99+' : unreadCount }}</view>
        </view>
      </view>
      <!-- 名片宫格（系统功能快捷入口，可自定义：宫格项/列数/形状/图标/角标/字号） -->
      <view v-else-if="c.type === 'native-grid'" class="grid-section" :style="nativeMargin(c.props)">
        <view class="grid" :style="gridStyle(c.props)">
          <view class="grid-item" v-for="(item, i) in gridItems(c.props)" :key="i" @click="goPage(item.url || item.path)">
            <view class="grid-icon" :style="gridIconStyle(c.props, item)">
              <image v-if="item.iconImage" :src="resolveAssetUrl(item.iconImage)" mode="aspectFit" class="grid-icon-img" />
              <SIcon v-else-if="item.icon" :name="item.icon" :size="gridIconSize(c.props)" color="#ffffff" />
              <view v-if="item.badge" class="grid-badge"><text>{{ item.badge }}</text></view>
            </view>
            <view class="grid-label" :style="gridLabelStyle(c.props)">{{ item.text || item.label }}</view>
          </view>
        </view>
      </view>
      <!-- 我的名片 -->
      <view v-else-if="c.type === 'native-mycard'" class="section" :style="nativeMargin(c.props)">
        <view class="section-header" v-if="c.props.showTitle !== false">
          <view class="section-title">{{ c.props.title || '我的名片' }}</view>
          <view class="section-more" v-if="c.props.showMore !== false" @click="goMyCard">{{ c.props.moreText || '查看详情' }} ›</view>
        </view>
        <view class="my-card" :style="myCardStyle(c.props)" v-if="myCard" @click="goMyCard">
          <view class="card-avatar" :style="avatarStyle">
            <image v-if="myCard.avatar" :src="myCard.avatar" class="avatar-img" mode="aspectFill" />
            <text v-else>{{ myCard.name?.[0] || '名' }}</text>
          </view>
          <view class="card-info">
            <view class="card-name">{{ myCard.name }}</view>
            <view class="card-position" v-if="c.props.showPosition !== false">{{ myCard.position || '未设置职位' }}</view>
            <view class="card-company" v-if="c.props.showCompany !== false">{{ myCard.company || '未设置公司' }}</view>
          </view>
          <view class="card-edit" v-if="c.props.showEdit !== false" @click.stop="goEdit">
            <SIcon name="template" size="small" color="#165dff" />
            <text>编辑</text>
          </view>
        </view>
        <view class="my-card create" v-else @click="goCreate">
          <view class="create-icon"><SIcon name="card" size="xlarge" color="#165dff" /></view>
          <view class="create-info">
            <view class="create-title">创建我的名片</view>
            <view class="create-desc">{{ hasLogin ? '三步完成，快速创建专属名片' : '登录后三步完成，快速创建专属名片' }}</view>
          </view>
          <view class="create-arrow">›</view>
        </view>
      </view>
      <!-- 访客雷达 -->
      <view v-else-if="c.type === 'native-radar'" class="section" :style="nativeMargin(c.props)">
        <view class="section-header" v-if="c.props.showTitle !== false">
          <view class="section-title">
            <SIcon name="radar" size="default" color="#00b42a" />
            <text>{{ c.props.title || '访客雷达' }}</text>
          </view>
          <view class="section-more" v-if="c.props.showMore !== false" @click="goVisitors">{{ c.props.moreText || '查看全部' }} ›</view>
        </view>
        <view class="visitor-stats">
          <view class="visitor-stat" v-if="c.props.showToday !== false">
            <view class="visitor-num" :style="{ color: (c.props.numColor && c.props.numColor !== '#165dff') ? c.props.numColor : 'var(--design-primary, #165dff)' }">{{ visitorStats.today || 0 }}</view>
            <view class="visitor-label">{{ c.props.todayText || '今日访客' }}</view>
          </view>
          <view class="visitor-divider" v-if="c.props.showToday !== false && c.props.showTotal !== false"></view>
          <view class="visitor-stat" v-if="c.props.showTotal !== false">
            <view class="visitor-num" :style="{ color: (c.props.numColor && c.props.numColor !== '#165dff') ? c.props.numColor : 'var(--design-primary, #165dff)' }">{{ visitorStats.total || 0 }}</view>
            <view class="visitor-label">{{ c.props.totalText || '累计访客' }}</view>
          </view>
          <view class="visitor-divider" v-if="c.props.showTotal !== false && c.props.showExchange !== false"></view>
          <view class="visitor-stat" v-if="c.props.showExchange !== false">
            <view class="visitor-num" :style="{ color: (c.props.numColor && c.props.numColor !== '#165dff') ? c.props.numColor : 'var(--design-primary, #165dff)' }">{{ visitorStats.exchange || 0 }}</view>
            <view class="visitor-label">{{ c.props.exchangeText || '名片交换' }}</view>
          </view>
        </view>
        <view class="visitor-list" v-if="c.props.showList !== false && visitorList.length">
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
            <text>{{ c.props.title || '人脉集市' }}</text>
          </view>
          <view class="section-more" @click="goMarket">{{ c.props.moreText || '进入集市' }} ›</view>
        </view>
        <scroll-view class="market-scroll" scroll-x v-if="marketList.length">
          <view class="market-list">
            <view class="market-card" v-for="item in marketList" :key="item.id" :style="{ borderRadius: (c.props.cardRadius ?? 12) + 'px' }" @click="viewMarketCard(item)">
              <view class="market-avatar">{{ item.name?.[0] || '名' }}</view>
              <view class="market-name">{{ item.name }}</view>
              <view class="market-position">{{ item.position || '—' }}</view>
              <view class="market-company">{{ item.companyName || item.company || '—' }}</view>
            </view>
          </view>
        </scroll-view>
        <view class="empty-hint" v-else>{{ c.props.emptyText || '暂无人脉推荐' }}</view>
      </view>
      <!-- 其余 DIY 组件 -->
      <DesignPage v-else :comps="[c]" :stats="visitorStats" :tenant-id="designTenantId" :global="designGlobal" /> </template>

    <!-- 底部间距 -->
    <view v-if="navMode !== 'none'" class="bottom-space"></view>

    <!-- 底部Tab：优先渲染设计中心发布的默认导航方案，未发布时兜底默认项 -->
    <CardTabBar active="home" page-type="home" />
  </view>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { onShow, onLoad, onPageScroll, onShareAppMessage, onPullDownRefresh } from '@dcloudio/uni-app';
import { shadeHex } from '../../utils/color.js';
import { cardApi } from '../../utils/cardApi.js';
import { getNavMetrics } from '../../utils/navMetrics.js';
import { searchBoxSizeStyle } from '../../utils/containerChildSize.js';
import { qsParse } from '../../utils/qs.js';
import { fetchDesignConfig, resolveHomePath, JUMP_DONE_KEY, buildShareCard, shouldShowShareBack, resolveAssetUrl, useDesignTheme } from '../../utils/design.js';
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
const navMode = ref('default');
const designStyle = ref(null);
const shareBack = ref(false);
const headerScrolled = ref(false);
// 名片模块组件的**容器**样式（边距 + 底色 + 圆角）
//
// 🔴 2026-10-07 用户反馈「这个名片搜索框组件的参数是有问题的，跟之前的『按钮』有同样的问题，
//   背景设置，也是设置按钮本身，对于容器的背景设置是没有地方设置的」：
//   面板通用项里有「组件背景色（compBgColor）」，但**本函数原先完全不消费它** →
//   控件能拖、预览不变 = **参数被架空**，与 button 当年「一个『背景色』两层含义」同类。
//   ⚠️ admin 侧 `ComponentRender.vue` 的 `nativeMargin()` 同样问题；两端同源手写、互不共享
//      —— 改一处必须同步另一处（本项目已因此只修一端、留半边 bug 两次）。
//
// 🔴 2026-10-07 另一则：「小程序端左右边距没渲染出来，后台预览有」——
//   本函数原先**只输出上下**，`marginLR` 被完全丢弃 → 宫格（.grid-section 通栏白底）
//   直接贴到屏幕左右边缘；而 admin 画布因为 `.pe-comp` 自身有内缩，看起来「有边距」。
//
// ⚠️ 原生组件（native-*）不走共享 containerStyle.js，容器样式必须在这里显式下发；
//   漏一个字段就「某一端有、另一端没有」。
function nativeMargin(props) {
  const p = props || {};
  const s = {};
  // ⚠️ 下边距给 8px 兜底（= 原 `.section{margin-bottom:16rpx}` 的值）：
  //   清理 CSS 里的写死 margin 后，卡间白缝靠这里保证，不会因marginBottom=0 而全部贴死。
  const mb = p.marginBottom ?? 8;
  if (mb) s.marginBottom = mb + 'px';
  const mt = p.marginTop ?? 0;
  if (mt) s.marginTop = mt + 'px';
  // 左右边距：与 admin 画布/共享 containerStyle 的 marginLR 语义一致。
  // ⚠️ 允许 0：0 是合法值（组件可以故意通栏），故用 ?? 而非 ||。
  const lr = p.marginLR ?? p.marginLeft ?? p.marginRight;
  if (lr !== undefined && lr !== '' && lr !== null) {
    s.marginLeft = lr + 'px';
    s.marginRight = lr + 'px';
  }
  // 🔴 容器底色：消费面板「组件背景色」。未设/空串 → **不输出 background**，
  //   保持各组件自己的白底（.top-bar / .section / .grid-section 都有 background:#fff）；
  //   无条件输出会把组件自身底色也覆盖掉。
  if (p.compBgColor) s.background = p.compBgColor;
  // 容器圆角：独立字段 radiusContainer，与组件自身 radius（搜索框圆角）互不影响。
  const rc = p.radiusContainer;
  if (rc !== undefined && rc !== '') s.borderRadius = rc + 'px';
  return s;
}

/**
 * 搜索栏样式 = 组件配置的上下外边距 +（无设计导航时）状态栏占位。
 * 状态栏高度必须按机型动态取（getNavMetrics），不能用 88rpx 写死：
 * 刘海机状态栏约 44px、非刘海约 20px，写死必然一头高一头低。
 * with-design-nav 时设计导航已占位，不再重复加。
 */
function topBarStyle(props) {
  const s = nativeMargin(props);
  const hasDesignNav = (designHeader.value && designHeader.value.type !== 'immersive') || sysHeadStyle.value;
  if (!hasDesignNav) s.paddingTop = getNavMetrics().statusBarHeight + 'px';
  return s;
}
// 名片宫格：配置 items 优先；无配置（旧数据）回退系统默认宫格
function gridItems(props) {
  const items = (props && props.items) || [];
  // 宫格项显示/隐藏：visible === false 的项不渲染
  const visible = items.filter((it) => it.visible !== false);
  if (visible.length) return visible;
  return features.map((f) => ({ icon: f.icon, text: f.label, url: f.path, bg: f.bg }));
}
function gridStyle(props) {
  const p = props || {};
  // 旧数据无 items：回退系统默认宫格，保持原 3 列布局；配置了 items 才按 columns 渲染
  const cols = (p.items || []).length ? (p.columns || 4) : 3;
  return {
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: (p.gap || 0) + 'px',
  };
}
function gridIconStyle(props, item) {
  const p = props || {};
  const size = (p.iconSize || 40) + 'px';
  const shape = p.shape || 'rounded';
  return {
    width: size,
    height: size,
    background: item.bg || '#165dff',
    borderRadius: shape === 'circle' ? '50%' : ((p.iconRadius ?? 14) + 'px'),
  };
}
// 图标本体尺寸：**不能等于框大小**。
// 「名片宫格图标方案 v5」的规格是 46px 圆角方块 + 内含 32px 描边图标
// （图标占框 32/46 ≈ 69.6%，四周留白 7px）。此前 iconSize 同时充当框与图标尺寸，
// 图标几乎撑满方块（43px 框内 40px 图标 = 93%），显得拥挤且描边被挤到边缘。
// 这里按方案比例内缩，iconSize 只控制方块大小。
const GRID_ICON_RATIO = 32 / 46;
function gridIconSize(props) {
  const box = Number((props && props.iconSize) || 40);
  return Math.round(box * GRID_ICON_RATIO);
}
function gridLabelStyle(props) {
  const p = props || {};
  const hasItems = (p.items || []).length;
  // 旧数据无 items：保持原 24rpx 常规字重
  return {
    fontSize: (hasItems ? (p.fontSize || 12) : 12) + 'px',
    fontWeight: hasItems && p.bold ? '600' : '400',
  };
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
// 沉浸式：状态栏高度按机型动态取（刘海机 ~44px / 非刘海 ~20px），并预留右侧胶囊宽度
const sysHeadPadTop = computed(() => getNavMetrics().statusBarHeight + 'px');
const sysHeadPadRight = computed(() => getNavMetrics().capsuleRightPad + 8 + 'px');
const shareBackTop = computed(() => getNavMetrics().statusBarHeight + 8 + 'px');
// 头部标题：后台「头部标题」设置优先，其次分享标题，最后「首页」。
// 三条渲染路径（DesignNav / DesignNavEw / sys-head 兜底）必须同源，否则标题会各显示各的。
const headerTitle = computed(() => {
  const h = designHeader.value;
  return h?.titleText || designTheme.value?.shareTitle || '首页';
});
// 页面背景 = 页面装修「全局设置」的背景色/背景图（C 端真机渲染，编辑端 phoneStyle 同源）
const themeStyle = useDesignTheme();
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
    if (qsParse(q).preview === '1') return true;
  } catch { /* 忽略 */ }
  // #endif
  return false;
}

// 无装修配置时的默认宫格（items 缺失/为空时回退）
// 底色与图标必须与「名片宫格图标方案 v5」的**方案 A（品牌多彩渐变）**一致 ——
// 该方案 2026-09-26 由用户确认：渐变底 + 圆角方形，9 图标已定稿，差异只在底色。
// 权威副本：componentRegistry.js native-grid 默认 items、DB tenant_page_design.home.design_json
//            （三者当前已核对为 9/9 一致，改这里前先对齐那两处）
const features = [
  { key: 'card', icon: 'card', label: '我的名片', path: '/pages/card/myCard', bg: 'linear-gradient(135deg,#2979ff,#00b0ff)' },
  { key: 'visitors', icon: 'radar', label: '访客雷达', path: '/pages/card/visitors', bg: 'linear-gradient(135deg,#00b8a9,#00d68f)' },
  { key: 'customers', icon: 'customer', label: '客户管理', path: '/pages/card/customers', bg: 'linear-gradient(135deg,#ff6b35,#ff9800)' },
  { key: 'market', icon: 'market', label: '人脉集市', path: '/pages/card/market', bg: 'linear-gradient(135deg,#7c4dff,#b388ff)' },
  { key: 'exchange', icon: 'exchange', label: '名片交换', path: '/pages/card/connections', bg: 'linear-gradient(135deg,#00b0ff,#536dfe)' },
  { key: 'distribution', icon: 'dist', label: '分销中心', path: '/pages/card/distribution', bg: 'linear-gradient(135deg,#ff3d3d,#ff7043)' },
  { key: 'member', icon: 'crown', label: '会员中心', path: '/pages/card/member', bg: 'linear-gradient(135deg,#ffb300,#ff8f00)' },
  { key: 'dynamic', icon: 'dynamic', label: '我的动态', path: '/pages/card/dynamic', bg: 'linear-gradient(135deg,#ec407a,#ab47bc)' },
  { key: 'more', icon: 'apps', label: '更多', path: '/pages/card/profile', bg: 'linear-gradient(135deg,#78909c,#546e7a)' },
];

// 首页数据加载（onMounted 首屏 + 下拉强刷新共用）
// force=true 时跳过 design.js 的 5 分钟本地缓存直连服务端 —— 后台改装修后
// 小程序「重新进入」仍命中缓存导致看到旧内容（云菜鸟靠下拉强刷新解决，本项目原先没复刻）。
async function loadHomeData(force = false) {
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
    // force 与 preview 同为 true 时才绕过缓存；预览模式本就直连草稿，不受影响
    const config = await fetchDesignConfig(force || preview, preview, pageType);
    const comps = config?.pages?.components || [];
    designComps.value = Array.isArray(comps) ? comps : [];
    designTenantId.value = config?.tenantId || 0;
    designHeader.value = config?.header || null;
    designGlobal.value = config?.pages?.meta?.global || {};
    designTheme.value = config?.pages?.meta?.theme || {};
    navMode.value = config?.navMode || 'default';
    designStyle.value = config?.style || null;
    // 分享进入 + 主题设置「返回上页」开启 → 顶部显示返回首页按钮
    shareBack.value = shouldShowShareBack(pageOptions, designTheme.value);
    // 编辑预览（iframe 画布）下不弹「草稿」类提示，避免干扰真实渲染观感（原「草稿暂无组件」
    // 在已发布页面会误弹——预览已改为草稿空时回退发布版，见 card.js 预览分支）。
    // 仅当草稿与发布版皆空（确实无任何组件）时给出中性提示。
    if (preview && !designComps.value.length) {
      uni.showToast({ title: '暂无内容', icon: 'none' });
    }
  } catch (e) { console.error('[design-load-error]', e && e.message ? e.message : e); }

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
}

// 是否已登录（仅驱动引导文案；真正的门禁在 create.vue 入口，覆盖所有入口）
const hasLogin = ref(false);
function refreshLoginFlag() {
  const me = uni.getStorageSync('card_user') || {};
  hasLogin.value = !!me.id || !!uni.getStorageSync('card_token');
}

onMounted(() => { refreshLoginFlag(); loadHomeData(false); });

// 下拉强刷新（复刻云菜鸟）：绕过 design.js 的 5 分钟本地缓存直连服务端，
// 让后台「设计中心」刚保存/发布的装修配置立刻在真机生效，无需等缓存过期或重装。
// H5 端无此交互（浏览器刷新即重新请求），故只在 MP 端注册。
// eslint-disable-next-line no-undef
if (typeof onPullDownRefresh === 'function') {
  onPullDownRefresh(async () => {
    try {
      await loadHomeData(true);
    } catch (e) {
      uni.showToast({ title: '刷新失败，请重试', icon: 'none' });
    } finally {
      // 必须无条件停止：否则下拉动画卡住不消失（即使抛错）
      uni.stopPullDownRefresh();
    }
  });
}

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
  refreshLoginFlag(); // 登录后返回首页时刷新「是否需先登录」的引导文案
  uni.$emit('cart:changed'); // 购物车组件（fab-cart）数量刷新
  if (isPreviewMode()) return; // 预览模式不触发首页跳转
  if (homeJumpChecked.value) return;
  homeJumpChecked.value = true;
  (async () => {
    try {
      if (uni.getStorageSync(JUMP_DONE_KEY)) return;
      const config = await fetchDesignConfig(false);
      const target = resolveHomePath(config?.homePage);
      if (!target) return;
      // 目标即当前页（配置的 card 应用首页就是本页）时不跳，避免 reLaunch 自身超时
      const cur = getCurrentPages();
      const curRoute = cur.length ? cur[cur.length - 1].route || '' : '';
      if (('/' + curRoute) === target.split('?')[0]) {
        uni.setStorageSync(JUMP_DONE_KEY, '1');
        return;
      }
      uni.setStorageSync(JUMP_DONE_KEY, '1');
      uni.reLaunch({ url: target });
    } catch (e) { /* 配置拉取失败不阻断首页 */ }
  })();
});

// 名片搜索栏样式（可自定义：高/圆角/背景/文字色/风格）
//
// 🔴 2026-10-07 用户反馈「容器左右边距调了会同步调小搜索框，没有单独调搜索框大小的了」：
//   本函数原先**只输出外观**（底色/圆角/高），搜索框宽度完全由 CSS `.search-box{flex:1}` 决定
//   → 容器左右边距一变，它就被挤着一起变，**两个控件缠死**。
//   解法与 button 同源（见 utils/containerChildSize.js）：宽度改由 widthMode/widthPercent 决定，
//   并**必须覆盖 flex**（`flex:1` 会把 width 压掉 → 表现为「宽度滑块完全没反应」）。
function searchBoxStyle(p) {
  const s = {
    background: p.bgColor || '#f2f3f5',
    borderRadius: ((p.radius ?? 18) * 2) + 'rpx',
    height: ((p.height || 36) * 2) + 'rpx',
  };
  if (p.style === 'shadow') s.boxShadow = '0 2rpx 8rpx rgba(31,35,41,0.08)';
  if (p.style === 'border') s.border = '1rpx solid #E5E6EB';
  // 宽度：与容器左右边距解耦（flexChild=true → 额外覆盖 flex）
  return Object.assign(s, searchBoxSizeStyle(p));
}
// 占位文案样式：颜色 + 横向对齐 + **行高等于搜索框高**（垂直居中的唯一正解）
//
// 🔴 2026-10-07 用户反馈「框中的文字还是没有垂直居中，还是偏上」：
//   上一轮加的 `line-height:1` 是错的。像素实测（框高36/字号13）：
//     line-height:1      → 上 -1 / 下 22（文字顶出框外，最偏）
//     line-height:normal → 上  2 / 下 19（仍偏上 17px）
//     line-height:36px   → 上 10 / 下 11（✅ 真居中）
//   `align-items:center` 居中的是**行盒**，行盒高 = line-height；
//   line-height < 容器高 → 行盒贴上边 → 视觉偏上。
//   ✅ 所以 line-height 必须**等于搜索框高度** → 行盒撑满整个框，必然居中。
//   ⚠️ 须与 admin `placeholderStyle()` 保持一致，否则后台预览与真机错位。
function placeholderStyle(p) {
  const h = (p && p.height) || 36;      // 搜索框高度（px 语义）
  return {
    color: (p && p.textColor) || '#86909c',
    textAlign: (p && p.textAlign) || 'center',
    lineHeight: (h * 2) + 'rpx',        // 与 searchBoxStyle 的 height 同源（×2 转 rpx）
  };
}
// 我的名片卡片样式（圆角/阴影）
function myCardStyle(p) {
  const s = { borderRadius: (p.radius ?? 12) + 'px' };
  if (p.shadow !== false) s.boxShadow = '0 4rpx 16rpx rgba(31,35,41,0.06)';
  return s;
}
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
  top: calc(var(--pnv-status-bar, 20px) + 8px);
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

/* 顶部搜索栏：无设计导航时状态栏占位由 topBarStyle() 内联注入（按机型动态算） */
.top-bar {
  display: flex;
  align-items: center;
  gap: 12rpx;
  /* 🔴 横向内缩原先写死 24rpx，与 `nativeMargin()` 内联的 marginLeft/Right **叠加**，
     导致搜索框比后台设计器多缩一层（用户反馈「搜索框没按后台设计的显示」）。
     横向交给 marginLR 单独控制，这里只留纵向。 */
  padding: 24rpx 0;
  background: #fff;
}
/* 系统风格全局默认头部（无页面头部配置时）：背景=头部颜色，文字=头部文字
   状态栏占位与右侧胶囊避让由 sysHeadPadTop / sysHeadPadRight 内联注入 */
.sys-head {
  display: flex; align-items: center; justify-content: space-between;
  height: 88rpx;
  padding-left: 32rpx;
  box-sizing: content-box;
}
.sys-head-title { font-size: 34rpx; font-weight: 600; }
.sys-head-avatar { width: 56rpx; height: 56rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: .2; }
/* 有设计导航（custom/official 占文档流）时去掉顶部安全距，由导航占位 */
.top-bar.with-design-nav {
  padding-top: 16rpx;
}
.search-box {
  /* 🔴 `flex:1` 只是**兜底**（未设widthPercent 时的历史视觉）；
     正常路径由 `searchBoxStyle()` 内联下发 `flex:none` + `width:%` + auto 边距，
     让「搜索框宽度」与「容器左右边距」解耦（用户 2026-10-07 反馈：调边距会同步调小搜索框）。
     ⚠️ 勿删 `flex:none` 那条内联 —— 留着 flex:1 会把 width 压掉、滑块完全没反应。 */
  flex: 1;
  min-width: 0; /* 防止占位文案把搜索框撑破（flex 子项默认 min-width:auto） */
  display: flex;
  align-items: center;
  gap: 12rpx;
  height: 72rpx;
  background: #f2f3f5;
  border-radius: 36rpx;
  padding: 0 28rpx;
}
/* 🔴 垂直居中（用户反馈「框中的文字还是没有垂直居中，还是偏上」）：
   ⚠️ 上一轮加的 `line-height:1` **是错的** —— 像素实测（框高36/字号13）：
        line-height:1     → 上间距 -1px、下间距 22px（文字顶出框外，偏得最厉害）
        line-height:normal→ 上间距  2px、下间距 19px（仍偏上 17px）
        line-height:36px  → 上间距 10px、下间距 11px（✅ 真居中）
   根因：`align-items:center` 居中的是**行盒**，而行盒高度 = line-height。
   line-height 比字号小 → 行盒比容器矮，居中后行盒贴上边 → 视觉偏上。
   ✅ 正解：让 line-height **等于搜索框高度**（由 `searchBoxStyle()` 按height 参数内联下发），
      行盒撑满整个框 → 文字必然垂直居中，且不依赖 align-items。
   ⚠️ 两端必须一致：admin 预览也用同一函数下发 line-height，否则后台与真机错位。 */
.search-placeholder {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 26rpx;
  color: #86909c;
}
.msg-icon {
  width: 56rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0; /* 有未读角标时不能被搜索框挤压变形 */
}
.msg-icon-inner { display: flex; align-items: center; justify-content: center; }
/* 🔴 优化「无新消息时铃铛显得多余、一直居左」（2026-10-07 用户反馈）：
   ① 位置：`searchBoxSizeStyle()` 给搜索框 `margin-right:auto`，剩余空间全让给铃铛 → 铃铛贴右。
      原来两侧 auto 会平分剩余空间，把铃铛推到中间。
   ② 观感：无未读时降到 45% 透明 + 缩到 88%，退成一个「安静的入口」；
      有未读立刻恢复全不透明并放大回 100%（配 badge-pulse 呼吸 + bell-shake 抖动）。
      → 有新信息时它自己会跳出来，不需要一个常驻抢眼的存在。 */
.msg-icon { transition: opacity .2s; }
.msg-icon:not(.has-unread) { opacity: .45; transform: scale(.88); }
.msg-icon.has-unread { opacity: 1; }
/* 有新未读：铃铛每 4s 抖动一次 + 徽章呼吸脉冲 */
.msg-icon.has-unread .msg-icon-inner { animation: bell-shake 1s ease-in-out 3s infinite; }
@keyframes bell-shake {
  0%, 55%, 100% { transform: rotate(0); }
  10% { transform: rotate(14deg); }
  20% { transform: rotate(-10deg); }
  30% { transform: rotate(8deg); }
  40% { transform: rotate(-6deg); }
  50% { transform: rotate(0); }
}
.msg-badge {
  position: absolute;
  top: 4rpx;
  right: -6rpx;
  min-width: 28rpx;
  height: 28rpx;
  padding: 0 8rpx;
  border-radius: 14rpx;
  background: #f53f3f;
  color: #fff;
  font-size: 18rpx;
  line-height: 28rpx;
  text-align: center;
  box-sizing: border-box;
  z-index: 2;
  animation: badge-pulse 2s ease-in-out infinite;
  /* 角标挂在铃铛上，铃铛缩放时角标跟着缩，避免「小铃铛配大角标」的怪比例 */
  transform-origin: center;
}

@keyframes badge-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}

/* 功能九宫格 */
.grid-section {
  background: #fff;
  padding: 32rpx 16rpx;
  margin-bottom: 16rpx;
  /* 🔴 圆角原先漏写 → 真机四个角是硬直角，而 admin 的 .r-native-grid 有 border-radius:8px，
     两端不一致（2026-10-07 用户反馈「四个角没有圆角」）。
     与 .section 保持同一量级（16rpx = 8px），且不写死——由 nativeRadiusStyle 注入覆盖。 */
  border-radius: 16rpx;
}
.grid {
  display: grid;
  /* 列数由组件配置注入 gridTemplateColumns；间距由 gap 注入 */
}
.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 0;
}
.grid-icon {
  position: relative;
  width: 88rpx;
  height: 88rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12rpx;
}
.grid-icon-img {
  width: 72%;
  height: 72%;
}
.grid-badge {
  position: absolute;
  top: -8rpx;
  right: -14rpx;
  min-width: 30rpx;
  height: 30rpx;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background: #f53f3f;
  color: #fff;
  font-size: 18rpx;
  line-height: 30rpx;
  text-align: center;
}
.grid-label {
  font-size: 24rpx;
  color: #4e5969;
}

/* 通用区块 */
.section {
  background: #fff;
  /* 🔴 横向 margin 交给 `nativeMargin()` 内联下发（读marginLR），CSS 不再写死 ——
     否则与内联的 marginLeft/Right 抢同一属性，且运营在后台调「左右边距」时
     只有一半生效（上下仍被这里锁死）。上下边距同理走内联。 */
  margin: 0;
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
  /* 跟随系统主题色：主色→渐变辅助色（tenant 主题设置 primaryColor/gradientColor） */
  background: linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff));
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
