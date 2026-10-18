<template>
  <!-- ===== 我的名片·商务增强版（本人视角管理控制台｜仅本人可见） =====
       对外展示统一走 /pages/card/cardDetail -->
  <!-- 加载骨架（小程序/H5 通用）：带返回按钮，弱网时不至于无路可退 -->
  <view class="page-loading" v-if="loading" :style="[themeStyle, brandVars]">
    <PageNav title="我的名片" back></PageNav>
    <view class="sk-card">
      <view class="sk-avatar"></view>
      <view class="sk-lines">
        <view class="sk-line w60"></view>
        <view class="sk-line w40"></view>
      </view>
    </view>
    <view class="sk-block"><view class="sk-line w30"></view></view>
    <view class="sk-block"><view class="sk-line w30"></view></view>
  </view>
  <!-- 加载失败（弱网/接口异常） -->
  <view class="page-error" v-else-if="loadFailed" :style="[themeStyle, brandVars]">
    <view class="pe-icon"><SIcon name="logs" size="xlarge" :color="ICON_DECOR" /></view>
    <view class="pe-text">{{ loadFailedMsg }}</view>
    <view class="pe-btn" @click="reloadPage">重新加载</view>
  </view>
  <!-- 未登录引导 -->
  <view class="page-error" v-else-if="notLogin" :style="[themeStyle, brandVars]">
    <view class="pe-icon"><SIcon name="user" size="xlarge" :color="ICON_DECOR" /></view>
    <view class="pe-text">登录后即可查看和管理你的名片</view>
    <view class="pe-btn" @click="goApply">去登录</view>
  </view>

  <view class="owner-page" v-else :style="[themeStyle, brandVars, tabBarPad]">
    <!-- 导航栏 -->
    <!-- 右上角「编辑」入口已移除（2026-10-16）：本页下方已有完整的「名片内容编辑列表」，
         顶部再挂一个入口属重复；且该位置正对微信胶囊右侧，容易被遮挡/误触。 -->
    <PageNav title="我的名片" back />

    <!-- 身份切换器（入驻个人/企业员工，双身份时显示） -->
    <view class="owner-switch" v-if="subjectList.length > 1">
      <view class="os-chip" v-for="sub in subjectList" :key="sub.subjectType + sub.subjectId"
            :class="{ on: activeSubject?.subjectType === sub.subjectType && activeSubject?.subjectId === sub.subjectId }"
            @click="activeSubject = sub">
        {{ sub.subjectType === 'individual' ? '入驻个人' : '企业员工' }}
      </view>
    </view>

    <!-- 名片头部卡片 -->
    <view class="owner-card">
      <view class="oc-head">
        <view class="oc-avatar" :style="avatarStyle">
          <image v-if="card.avatar" :src="card.avatar" class="oc-avatar-img" mode="aspectFill" />
          <view v-else>{{ card.name?.[0] || '名' }}</view>
        </view>
        <view class="oc-id">
          <view class="oc-name">{{ card.name }}</view>
          <view class="oc-pos">{{ card.position || '未设置职位' }}</view>
          <view class="oc-co">{{ card.company || '' }}</view>
        </view>
      </view>
      <view class="oc-needs" v-if="needTagList.length">
        <text class="oc-need" v-for="t in needTagList" :key="t">{{ t }}</text>
      </view>
      <view class="oc-actions">
        <view class="oc-act" @click="previewCard"><SIcon name="card" size="default" :color="ICON_T1" /><text>预览</text></view>
        <view class="oc-act" @click="shareOwnerCard"><SIcon name="channel" size="default" :color="ICON_T1" /><text>分享</text></view>
        <view class="oc-act" @click="copyLink"><SIcon name="devices" size="default" :color="ICON_T1" /><text>二维码/链接</text></view>
      </view>
    </view>

    <!-- 三栏数据看板 -->
    <view class="owner-stats">
      <view class="os-item">
        <view class="os-num">{{ stats.totalViews || 0 }}</view>
        <view class="os-label">总访问</view>
      </view>
      <view class="os-item">
        <view class="os-num">{{ stats.totalExchanges || 0 }}</view>
        <view class="os-label">被交换</view>
      </view>
      <view class="os-item">
        <view class="os-num">{{ stats.marketViews || 0 }}</view>
        <view class="os-label">集市曝光</view>
      </view>
    </view>

    <!-- 集市状态专属卡片（整卡可点：未上架去上架，已上架看位置） -->
    <view class="owner-market" @click="locateInMarket">
      <view class="om-title"><SIcon name="market" size="default" :color="themeColor" /><text>集市状态</text></view>
      <view class="om-status" :class="marketStatusClass">{{ marketStatusText }}</view>
      <view class="om-desc">{{ marketStatusDesc }}</view>
      <view class="om-locate" v-if="marketOn" @click="locateInMarket">查看我在集市的位置 ›</view>
    </view>

    <!-- 名片内容编辑列表 -->
    <view class="owner-section">
      <view class="os-t">名片内容</view>
      <view class="os-row" @click="editCard">
        <view class="osr-icon"><SIcon name="card" size="default" :color="themeColor" /></view>
        <view class="osr-main"><view class="osr-name">名片资料</view><view class="osr-desc">姓名、职位、企业、联系方式</view></view>
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row" @click="goNeedTags">
        <view class="osr-icon"><SIcon name="radar" size="default" :color="themeColor" /></view>
        <view class="osr-main"><view class="osr-name">供需标签</view><view class="osr-desc">找渠道/求合作/招合伙人等</view></view>
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row" @click="goDisplaySettings">
        <view class="osr-icon"><SIcon name="settings" size="default" :color="themeColor" /></view>
        <view class="osr-main"><view class="osr-name">展示设置</view><view class="osr-desc">公开状态、模板样式</view></view>
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row" @click="goWorksEdit">
        <view class="osr-icon"><SIcon name="category" size="default" :color="themeColor" /></view>
        <view class="osr-main"><view class="osr-name">作品管理</view><view class="osr-desc">上传 / 排序作品图，展示在名片「作品」标签</view></view>
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row" @click="goVideosEdit">
        <view class="osr-icon"><SIcon name="dynamic" size="default" :color="themeColor" /></view>
        <view class="osr-main"><view class="osr-name">视频管理</view><view class="osr-desc">视频号作品（封面 / 标题 / 时长），白银+ 可添加</view></view>
        <text class="osr-arrow">›</text>
      </view>
    </view>

    <!-- 访客雷达 TOP3 -->
    <view class="owner-section">
      <view class="os-t">访客雷达 <small>最近访客</small></view>
      <view class="ov-list" v-if="visitorTop.length">
        <!-- 2026-10-21 用户反馈：最近访客应可直接点击查看详情 → 跳访客雷达（列表页内
             有行为轨迹弹层 + 转为客户等完整操作；此处不重复实现弹层） -->
        <view class="ov-item" v-for="v in visitorTop" :key="v.id" @click="goVisitors">
          <view class="ov-avatar">{{ (v.nickname || '客')[0] }}</view>
          <view class="ov-info">
            <view class="ov-name">{{ v.nickname || '匿名访客' }}</view>
            <view class="ov-time">{{ timeText(v.lastVisitAt) }} · {{ v.visitCount }}次</view>
          </view>
          <text class="ov-arrow">›</text>
        </view>
      </view>
      <view class="ov-empty" v-else>还没有访客，快去分享你的名片吧</view>
      <view class="ov-more" @click="goVisitors">查看全部访客 ›</view>
      <view class="ov-more" @click="goRadarConfig">雷达配置 ›</view>
    </view>

    <!-- 高级工具 -->
    <view class="owner-section">
      <view class="os-t">高级工具</view>
      <view class="os-row" @click="goConnections">
        <view class="osr-icon"><SIcon name="market" size="default" :color="themeColor" /></view>
        <view class="osr-main"><view class="osr-name">我的人脉库</view><view class="osr-desc">管理交换得来的人脉，可转为客户线索</view></view>
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row" @click="goMessages">
        <view class="osr-icon"><SIcon name="dynamic" size="default" :color="themeColor" /></view>
        <view class="osr-main"><view class="osr-name">消息中心</view><view class="osr-desc">交换申请、访客动态等通知</view></view>
        <Badge v-if="msgUnread > 0" :count="msgUnread" :max="99" />
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row" @click="goCollects">
        <view class="osr-icon"><SIcon name="star" size="default" :color="themeColor" /></view>
        <view class="osr-main"><view class="osr-name">我的收藏</view><view class="osr-desc">收藏的名片，随时回访</view></view>
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row" @click="saveCardInfo">
        <view class="osr-icon"><SIcon name="storage" size="default" :color="themeColor" /></view>
        <view class="osr-main"><view class="osr-name">保存名片</view><view class="osr-desc">一键写入手机通讯录</view></view>
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row" @click="exportData">
        <view class="osr-icon"><SIcon name="analytics" size="default" :color="themeColor" /></view>
        <view class="osr-main"><view class="osr-name">导出数据</view><view class="osr-desc">导出名片与访客数据为 CSV 文件</view></view>
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row danger" @click="leaveTenant">
        <view class="osr-icon"><SIcon name="logs" size="default" color="#f53f3f" /></view>
        <view class="osr-main"><view class="osr-name">退出平台</view><view class="osr-desc">退出当前客户项目空间</view></view>
        <text class="osr-arrow">›</text>
      </view>
    </view>

    <CardTabBar active="card" />

    <!-- 二维码/链接弹层（2026-10-21 重做：原「复制 H5 链接」→ 真二维码 + 保存按钮，供下载印刷） -->
    <view class="sheet-mask" v-if="showQr" @click="showQr = false"></view>
    <view class="qr-sheet" v-if="showQr">
      <view class="grip"></view>
      <view class="qs-title">名片二维码</view>
      <view class="qs-sub">{{ qrType === 'wxacode' ? '微信扫一扫，直达名片详情' : '扫码打开网页版名片（当前小程序渠道未接入，暂用网页链接码）' }}</view>
      <view class="qs-img-wrap">
        <image v-if="qrImage" class="qs-img" :src="qrImage" mode="aspectFit" show-menu-by-longpress />
        <view v-else class="qs-loading">生成中…</view>
      </view>
      <button class="qs-save" :disabled="!qrImage" @click="saveQrImage">保存到相册（可下载印刷）</button>
      <view class="qs-close" @click="showQr = false">关闭</view>
    </view>

    <!-- 分享海报弹层（2026-10-21 新增：生成当前模板配色的带二维码名片图，可保存/印刷） -->
    <view class="sheet-mask" v-if="showPoster" @click="showPoster = false"></view>
    <view class="qr-sheet" v-if="showPoster">
      <view class="grip"></view>
      <view class="qs-title">名片分享海报</view>
      <view class="qs-sub">保存图片后可发朋友圈或印刷，扫码直达名片</view>
      <view class="qs-img-wrap" :class="{ 'poster-wrap': true }">
        <image v-if="posterPath" class="qs-img poster" :src="posterPath" mode="aspectFit" show-menu-by-longpress />
        <view v-else class="qs-loading">海报生成中…</view>
      </view>
      <button class="qs-save" :disabled="!posterPath" @click="savePosterImage">保存到相册</button>
      <view class="qs-close" @click="showPoster = false">关闭</view>
    </view>
    <!-- 离屏海报画布（移出屏幕；H5 不渲染，直接用内存 canvas） -->
    <!-- #ifdef MP-WEIXIN -->
    <canvas id="posterCanvas" type="2d" class="poster-canvas"></canvas>
    <!-- #endif -->

    <!-- 雷达悬浮球 + 未读角标（脉冲圈动效 + 抬高避开底部Tab） -->
    <view class="radar-float" @click="goVisitors">
      <view class="radar-pulse"></view>
      <view class="radar-pulse delay"></view>
      <SIcon name="radar" size="xlarge" color="#ffffff" />
      <Badge v-if="msgUnread > 0" :count="msgUnread" :max="99" />
    </view>
  </view>
</template>

<script setup>
import { ICON_DECOR, ICON_T1 } from '../../utils/iconColor.js';
import PageNav from '../../components/PageNav.vue';
import { ref, computed, onMounted, getCurrentInstance } from 'vue';
import { onUnload } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { track, trackPageView } from '../../utils/analytics.js';
import { shadeHex, brandPalette } from '../../utils/color.js';
import { heroForeground } from '../../utils/templateTheme.js';
import { loginEntryUrl, LOGIN_PATH } from '../../utils/loginEntry.js';
import Badge from '../../components/Badge.vue';
import { saveCardTabState, restoreScrollTop, h5ScrollTop } from './utils/cardTabState.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';
import { useDesignTheme, brandThemeOverride } from '../../utils/design.js';
import { useTabBarPadding } from '../../utils/cardTabBarSpace.js';
const themeStyle = useDesignTheme();
// 底部导航条实测占位（高度随设计方案浮动，禁止写死 → 见 utils/cardTabBarSpace.js）
const tabBarPad = useTabBarPadding();

const card = ref({});
const loading = ref(true);
const loadFailed = ref(false);
const loadFailedMsg = ref('名片加载失败，请检查网络后重试');
const notLogin = ref(false);
// 品牌 5 色：头像背景用品牌色渐变（无配置回退默认蓝）
const brand = computed(() => brandPalette(card.value));
// 🔴 品牌主色覆盖页面主题变量（--design-primary/-rgb/gradient）：后台「品牌外观」设了，
// 全页主题色消费点（标签按钮/图标底/悬浮球/tab 激活态等）跟随品牌色；未设回落设计中心系统主题色
const brandVars = computed(() => brandThemeOverride(brand.value));
// 租户主题色：SIcon 的 color 是 prop、不能吃 var()，取真实 hex（与 create/displaySettings 同款）
// 🔴 品牌主色优先（SIcon 不吃 var()，必须喂真实 hex）
const themeColor = computed(() => brand.value.primary || (themeStyle.value && themeStyle.value['--design-primary']) || '#165dff');
const avatarStyle = computed(() => {
  // 🔴 2026-10-18 模板分层对齐（自选模板 > 品牌主色，与 cardDetail resolvedTheme 同口径）：
  // 用户选了模板（如曜石黑金）→ 头像底色跟模板 primary，管理台与详情页观感一致；
  // 无模板才回落品牌色/系统主题。
  const b = brand.value;
  const c = card.value.templateTheme?.primary || b.primary;
  if (!c || !/^#[0-9a-fA-F]{6}$/.test(c)) return {};
  const dark = card.value.templateTheme?.bgEnd && /^#[0-9a-fA-F]{3,6}$/.test(card.value.templateTheme.bgEnd)
    ? card.value.templateTheme.bgEnd
    : (b.gradient && /^#[0-9a-fA-F]{3,6}$/.test(b.gradient) ? b.gradient : shadeHex(c, -0.3));
  // 🔴 首字母前景必须与这张渐变同判据：CSS 里写死 #fff，主色一换成亮黄（#FCB801）
  //    白字就整个消失（真机报修「圆形头像整个填充白的了」）。与 cardDetail hero 同源裁决。
  const fg = heroForeground(dark, c, { text: '#ffffff' });
  return { brand: 1, background: `linear-gradient(135deg, ${dark}, ${c})`, color: fg.text };
});
const currentUserId = ref(null);
const myStatus = ref(null);   // { items, subjects }
const stats = ref({});
const visitorTop = ref([]);
const msgUnread = ref(0);
const activeSubject = ref(null);
const pageCardId = ref(null);

const subjectList = computed(() => (myStatus.value?.subjects || []).filter((s) => s.status === 'active'));
const myMarketItem = computed(() => {
  if (!activeSubject.value) return null;
  return (myStatus.value?.items || []).find((it) => it.subjectType === activeSubject.value.subjectType && it.subjectId === activeSubject.value.subjectId) || null;
});
const marketOn = computed(() => !!myMarketItem.value);
const marketStatusText = computed(() => {
  const it = myMarketItem.value;
  if (!it) return '未上架';
  if (it.auditStatus === 'pending') return '待审核';
  if (it.auditStatus === 'rejected') return '已下架';
  if (it.isTop) return '🔥 已置顶';
  if (it.isNew) return '✨ 生效中';
  return '✅ 已上架';
});
const marketStatusClass = computed(() => {
  const it = myMarketItem.value;
  if (!it) return 'off';
  if (it.auditStatus === 'pending') return 'pend';
  if (it.auditStatus === 'rejected') return 'off';
  return 'on';
});
const marketStatusDesc = computed(() => {
  const it = myMarketItem.value;
  if (!it) return '开启后将你的名片展示给平台所有人，可在集市页一键上架';
  if (it.auditStatus === 'pending') return '已提交上架申请，等待管理员审核';
  if (it.auditStatus === 'rejected') return '上架申请未通过，可联系管理员或修改名片后重新申请';
  return '你的名片正在集市展示' + (it.isNew ? '（新入驻7天角标）' : '');
});
const needTagList = computed(() => {
  try {
    const arr = JSON.parse(card.value.needTags || '[]');
    return Array.isArray(arr) ? arr.slice(0, 3) : [];
  } catch { return []; }
});

/**
 * 当前登录用户 id。
 * ⚠️ 旧实现用 atob 解析 token —— **小程序端没有全局 atob**（只有 H5 有），真机上抛错被
 * catch 吞成 null → 恒判定「未登录」，表现为「每次点我的名片都跳去登录页」；开发者工具
 * 常带 polyfill 所以不复现。改为优先读登录时缓存的 card_user.id（跨端可靠），
 * token 解析只作兜底且用 uni.base64ToArrayBuffer（跨端可用）。
 */
function decodeTokenUid() {
  const me = uni.getStorageSync('card_user');
  if (me && me.id) return Number(me.id);
  const token = uni.getStorageSync('card_token');
  if (!token) return null;
  try {
    // card_token 格式为 base64({uid}).signature，payload 在前（与后端 comboAuth 一致）
    const payload = token.split('.')[0];
    if (!payload || typeof uni.base64ToArrayBuffer !== 'function') return null;
    const bytes = new Uint8Array(uni.base64ToArrayBuffer(payload));
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return Number(JSON.parse(bin).uid) || null;
  } catch { return null; }
}

function timeText(t) {
  if (!t) return '';
  const diff = (Date.now() - new Date(t.replace(' ', 'T')).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 172800) return '昨天';
  return new Date(t).toLocaleDateString('zh-CN');
}

async function loadOwnerData() {
  currentUserId.value = decodeTokenUid();
  if (!currentUserId.value) return;
  try {
    const [st, mk, mst, unread] = await Promise.allSettled([
      cardApi.getVisitorSummary(),
      cardApi.getMarketMyStats(),
      cardApi.getMarketMyStatus(),
      cardApi.getMessageUnread(),
    ]);
    if (st.status === 'fulfilled') visitorTop.value = (st.value.visitors || []).slice(0, 3);
    if (mk.status === 'fulfilled') stats.value = mk.value.stats || mk.value;
    if (mst.status === 'fulfilled') myStatus.value = mst.value;
    if (unread.status === 'fulfilled') msgUnread.value = unread.value.count || 0;
  } catch (e) {}
  const mst = myStatus.value;
  if (mst) {
    const subs = (mst.subjects || []).filter((s) => s.status === 'active');
    if (subs.length && !activeSubject.value) {
      activeSubject.value = subs.find((s) => s.subjectType === 'individual') || subs[0];
    }
  }
}

// 请求超时兜底：弱网/接口卡死时骨架屏不无限转圈，8s 后进入失败态
function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

onMounted(async () => {
  // 未登录时扫码暂存的推广人：登录后静默补绑（首次绑定永久锁定）
  if (uni.getStorageSync('card_token')) {
    const pending = uni.getStorageSync('pendingInviter');
    if (pending) {
      uni.removeStorageSync('pendingInviter');
      try {
        const me = uni.getStorageSync('card_user');
        if (!me || Number(pending) !== Number(me?.id)) {
          await cardApi.distBind(Number(pending), 'individual');
        }
      } catch (e) {}
    }
  }
  const pages = getCurrentPages();
  const opts = pages[pages.length - 1].options || {};
  const explicitId = opts.id || '';
  // 未登录直接引导登录（不依赖 id，覆盖从底部Tab进入无 id 的场景）
  if (!decodeTokenUid()) {
    loading.value = false;
    notLogin.value = true;
    return;
  }
  // 从底部Tab/首页进入不带 id 时，按本人名片兜底解析 pageCardId。
  // 🔴 不带 id 时**绝不能**用 cardLastViewId：它可能是浏览过的他人名片（历史上 cardDetail
  // 无条件写入），会让「我的名片」打开别人的名片（表现为跳到「测试用户」）。
  let id = explicitId || '';
  if (!id) {
    try {
      const safe = await cardApi.getCardsSafe();
      id = (safe.cards && safe.cards[0] && safe.cards[0].id) || '';
    } catch (e) {}
  }
  pageCardId.value = id || null;
  if (id) {
    uni.setStorageSync('cardLastViewId', id);
    restoreScrollTop('myCard');
    loading.value = true;
    loadFailed.value = false;
    try {
      const res = await withTimeout(cardApi.getCard(id), 8000);
      card.value = res.card;
      // 非本人名片：直接转对外展示页
      currentUserId.value = decodeTokenUid();
      if (currentUserId.value && Number(card.value.userId) !== Number(currentUserId.value)) {
        uni.redirectTo({ url: `/pages/card/cardDetail?id=${id}` });
        return;
      }
      // 采集访客行为
      cardApi.trackVisitor({ cardId: id, actionType: 'view', page: 'profile' });
      // 行为埋点：浏览名片
      trackPageView('/pages/card/myCard');
      track('card_view', { cardId: Number(id), page: '/pages/card/myCard', extra: { name: card.value.name } });
      // 商务增强版数据（本人名片）
      await loadOwnerData();
      // 阶段C：会员权益（features + quota）
      try {
        features.value = await cardApi.getRadarFeatures();
      } catch (e) {}
    } catch (e) {
      loadFailed.value = true;
      loadFailedMsg.value = e && e.message === 'timeout'
        ? '名片加载超时，网络较慢请稍后重试'
        : '名片加载失败，请检查网络后重试';
      console.error('我的名片加载失败:', e);
    } finally {
      loading.value = false;
    }
  } else {
    loading.value = false;
  }
});

// 失败重试：重进本页触发完整重新加载
function reloadPage() {
  const pages = getCurrentPages();
  const id = pages[pages.length - 1].options.id;
  if (id) uni.redirectTo({ url: `/pages/card/myCard?id=${id}` });
}
function goApply() {
  // ⚠️ 旧实现跳 `/pages/card/apply`——该页从未存在（文件无、pages.json 未注册），
  // reLaunch 到不存在的页会**静默失败**，表现为「点去登录没反应」。真实登录页是
  // pages/cardMain/login，用 loginEntryUrl 统一拼（必带 manual=1 让冷启动首页联动让路，
  // redirect 让登录后回到本页，而不是被丢到首页）。
  uni.reLaunch({ url: loginEntryUrl(LOGIN_PATH, '/pages/card/myCard') });
}

// 离开时保存滚动位置，切Tab返回后恢复
onUnload(() => {
  saveCardTabState('myCard', { scrollTop: h5ScrollTop() });
});

/* ===== 商务增强版操作 ===== */
function goBack() { uni.navigateBack(); }
function editCard() {
  if (!pageCardId.value) return;
  uni.navigateTo({ url: `/pages/card/create?id=${pageCardId.value}` });
}
// 「名片内容」入口分流：三个入口不再同跳 create 向导
// （历史上三行全是 editCard()，供需标签要从第1步翻两页、展示设置描述是空头支票）
function goNeedTags() {
  if (!pageCardId.value) return;
  uni.navigateTo({ url: `/pages/card/needTagsEdit?id=${pageCardId.value}` });
}
function goDisplaySettings() {
  if (!pageCardId.value) return;
  uni.navigateTo({ url: `/pages/card/displaySettings?id=${pageCardId.value}` });
}
function goWorksEdit() {
  if (!pageCardId.value) return;
  uni.navigateTo({ url: `/pages/card/worksEdit?id=${pageCardId.value}` });
}
function goVideosEdit() {
  if (!pageCardId.value) return;
  uni.navigateTo({ url: `/pages/card/videosEdit?id=${pageCardId.value}` });
}
function previewCard() {
  // 打开对外展示页 cardDetail（本人会看到本人态：操作栏只留「分享」，
  // 右侧悬浮入口可换模板）。访客视角预览已按用户要求下线，不再传 preview=1。
  uni.navigateTo({ url: `/pages/card/cardDetail?id=${pageCardId.value}` });
}

/* ===== 分享 / 二维码（2026-10-21 重做 =====
   原「分享」「二维码/链接」在 MP 端都退化为复制 H5 链接甚至「暂不支持」toast。
   现在：
   - 分享 → 生成「当前模板配色 + 姓名/职位/公司 + 名片二维码」的海报图（canvas 绘制），
     弹层预览 + 保存到相册，可发朋友圈/印刷。
   - 二维码/链接 → 服务端 /card/wxacode：租户已授权小程序时返回真·小程序码
     （scene 携名片 id 扫码直达），否则降级 H5 链接二维码；弹层内一键保存。 */
const showQr = ref(false);
const qrImage = ref('');
const qrType = ref('');
const showPoster = ref(false);
const posterPath = ref('');

async function fetchCardQr() {
  // 已取过直接复用（同一张名片码不变；换名片时 pageCardId 变 → 缓存键不匹配就重取）
  if (qrImage.value && qrForCard.value === pageCardId.value) return qrImage.value;
  const res = await cardApi.getWxacode(pageCardId.value);
  qrImage.value = res.image || '';
  qrType.value = res.type || 'h5';
  qrForCard.value = pageCardId.value;
  return qrImage.value;
}
const qrForCard = ref('');

async function copyLink() {
  showQr.value = true;
  qrImage.value = '';
  try {
    await fetchCardQr();
  } catch (e) {
    showQr.value = false;
    uni.showToast({ title: '二维码生成失败，请稍后重试', icon: 'none' });
  }
}

// dataURL → 本地文件（MP 端 saveImageToPhotosAlbum 需要文件路径；H5 直接用 dataURL 下载）
function dataUrlToFile(dataUrl, name) {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    const fs = uni.getFileSystemManager();
    const path = `${wx.env.USER_DATA_PATH}/${name}-${Date.now()}.png`;
    fs.writeFile({
      filePath: path,
      data: dataUrl.replace(/^data:image\/\w+;base64,/, ''),
      encoding: 'base64',
      success: () => resolve(path),
      fail: reject,
    });
    // #endif
    // #ifndef MP-WEIXIN
    resolve(dataUrl);
    // #endif
  });
}
function saveImageCommon(filePath, tipName) {
  // #ifdef MP-WEIXIN
  uni.saveImageToPhotosAlbum({
    filePath,
    success: () => uni.showToast({ title: '已保存到相册', icon: 'success' }),
    fail: (e) => {
      const msg = (e && e.errMsg) || '';
      if (msg.indexOf('auth') >= 0 || msg.indexOf('denied') >= 0) {
        uni.showModal({ title: '需要相册权限', content: '请在设置中允许保存图片到相册', confirmText: '去设置', success: (r) => { if (r.confirm) uni.openSetting({}); } });
      } else if (msg.indexOf('cancel') < 0) {
        uni.showToast({ title: '保存失败，请重试', icon: 'none' });
      }
    },
  });
  // #endif
  // #ifndef MP-WEIXIN
  if (typeof document !== 'undefined') {
    const a = document.createElement('a');
    a.href = filePath;
    a.download = `${tipName}.png`;
    a.click();
    uni.showToast({ title: '已下载', icon: 'success' });
  }
  // #endif
}
async function saveQrImage() {
  if (!qrImage.value) return;
  try {
    saveImageCommon(await dataUrlToFile(qrImage.value, 'card-qrcode'), '名片二维码');
  } catch (e) {
    uni.showToast({ title: '保存失败，请重试', icon: 'none' });
  }
}
async function savePosterImage() {
  if (!posterPath.value) return;
  // MP：posterPath 已是临时文件；H5：是 dataURL
  saveImageCommon(posterPath.value, '名片海报');
}

/* —— 海报绘制 —— */
// 跨端取图：MP 用 canvas.createImage，H5 用 Image
function loadImage(canvas, src) {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    const img = canvas.createImage();
    // #endif
    // #ifndef MP-WEIXIN
    const img = new Image();
    // #endif
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function drawPoster(ctx, W, H, c, primary, gradient, ink, qrImg) {
  // 白底
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  // 顶部品牌渐变头（当前模板/品牌主色）
  const g = ctx.createLinearGradient(0, 0, W * 0.35, 330);
  g.addColorStop(0, primary);
  g.addColorStop(1, gradient);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 330);
  // 头部文字：颜色按渐变亮度裁决（亮主色转深字，与 heroForeground 同判据）
  ctx.fillStyle = ink;
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText(c.name || '电子名片', 48, 130);
  ctx.globalAlpha = 0.9;
  ctx.font = '30px sans-serif';
  ctx.fillText(c.position || '', 48, 185);
  ctx.fillText([c.company, c.city].filter(Boolean).join(' · '), 48, 235);
  ctx.globalAlpha = 0.75;
  ctx.fillText((c.businessField || ''), 48, 285);
  ctx.globalAlpha = 1;
  // 需求标签
  let tags = [];
  try { const a = JSON.parse(c.needTags || '[]'); tags = Array.isArray(a) ? a.slice(0, 3) : []; } catch (e) {}
  if (tags.length) {
    let tx = 48;
    ctx.font = '24px sans-serif';
    tags.forEach((t) => {
      const tw = ctx.measureText(t).width + 32;
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = ink;
      ctx.fillRect(tx, 320 - 60, tw, 40);
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      ctx.fillText(t, tx + 16, 320 - 32);
      tx += tw + 16;
    });
  }
  // 引导语 + 二维码
  ctx.fillStyle = '#1d2129';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('扫码查看电子名片', 48, 430);
  ctx.fillStyle = '#86909c';
  ctx.font = '24px sans-serif';
  ctx.fillText('长按或微信扫一扫', 48, 475);
  if (qrImg) ctx.drawImage(qrImg, W / 2 - 190, 520, 380, 380);
  // 底部署名
  ctx.fillStyle = '#c9cdd4';
  ctx.font = '22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(c.phone ? `电话 ${c.phone}` : '', W / 2, H - 40);
  ctx.textAlign = 'left';
}
async function shareOwnerCard() {
  if (!pageCardId.value) return;
  showPoster.value = true;
  posterPath.value = '';
  try {
    const qrData = await fetchCardQr();
    const c = card.value;
    // 🔴 海报配色跟「当前模板」（用户原话：生成当前模板带二维码的名片图）：
    // 有模板用模板 bgStart/bgEnd（如曜石黑金=黑金海报），无模板回落品牌/系统主题
    const tt = card.value.templateTheme || {};
    const themePrimary = (themeStyle.value && themeStyle.value['--design-primary']) || '#165dff';
    const primary = (card.value.templateId && /^#[0-9a-fA-F]{3,6}$/.test(String(tt.bgStart || '')))
      ? tt.bgStart
      : (brand.value.primary || themePrimary);
    const gradient = (card.value.templateId && /^#[0-9a-fA-F]{3,6}$/.test(String(tt.bgEnd || '')))
      ? tt.bgEnd
      : (brand.value.gradient || shadeHex(primary, -0.25));
    const ink = heroForeground(shadeHex(primary, -0.25), primary, { text: '#ffffff' }).text;
    const W = 600, H = 960;
    // #ifdef MP-WEIXIN
    const inst = getCurrentInstance();
    uni.createSelectorQuery().in(inst.proxy).select('#posterCanvas').fields({ node: true, size: true }).exec(async (res) => {
      if (!res || !res[0] || !res[0].node) { uni.showToast({ title: '海报绘制失败', icon: 'none' }); return; }
      const canvas = res[0].node;
      const dpr = (uni.getWindowInfo && uni.getWindowInfo().pixelRatio) || 2;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      try {
        const qrImg = await loadImage(canvas, qrData);
        drawPoster(ctx, W, H, c, primary, gradient, ink, qrImg);
      } catch (e) {
        drawPoster(ctx, W, H, c, primary, gradient, ink, null);
      }
      uni.canvasToTempFilePath({
        canvas,
        success: (r) => { posterPath.value = r.tempFilePath; },
        fail: () => uni.showToast({ title: '海报导出失败', icon: 'none' }),
      });
    });
    // #endif
    // #ifndef MP-WEIXIN
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    let qrImg = null;
    try { qrImg = await loadImage(null, qrData); } catch (e) {}
    drawPoster(ctx, W, H, c, primary, gradient, ink, qrImg);
    posterPath.value = canvas.toDataURL('image/png');
    // #endif
  } catch (e) {
    showPoster.value = false;
    uni.showToast({ title: '海报生成失败，请稍后重试', icon: 'none' });
  }
}
function locateInMarket() {
  uni.navigateTo({ url: '/pages/card/market' });
}
function goVisitors() { uni.navigateTo({ url: '/pages/card/visitors' }); }
function goRadarConfig() { uni.navigateTo({ url: '/pages/card/radarConfig' }); }
/* ===== 高级工具（2026-10-21 重做：原两行都只是「复制文本」，用户反馈功能不合理 =====
   保存名片：小程序端直接调系统通讯录写入（wx.addPhoneContact），不再是复制后手动粘贴；
             H5 无该 API，降级为复制 vCard 格式文本。
   导出数据：生成 CSV 文件——小程序端写用户目录后调 shareFileMessage 让用户发给
             自己/电脑（文件可存档）；H5 直接触发浏览器下载。复制文本仅作失败降级。 */
function saveCardInfo() {
  const c = card.value;
  // #ifdef MP-WEIXIN
  uni.addPhoneContact({
    firstName: c.name || '名片联系人',
    mobilePhoneNumber: c.phone || '',
    weChatNumber: c.wechat || '',
    organization: c.company || '',
    title: c.position || '',
    email: c.email || '',
    success: () => uni.showToast({ title: '已保存到手机通讯录', icon: 'success' }),
    fail: (e) => {
      // 用户取消不提示；授权拒绝/其他失败降级为复制
      if (e && e.errMsg && e.errMsg.indexOf('cancel') >= 0) return;
      copyCardText();
    },
  });
  // #endif
  // #ifndef MP-WEIXIN
  copyCardText();
  // #endif
}
function copyCardText() {
  const c = card.value;
  const lines = [
    `姓名：${c.name || ''}`,
    c.position ? `职位：${c.position}` : '',
    c.company ? `公司：${c.company}` : '',
    c.phone ? `电话：${c.phone}` : '',
    c.wechat ? `微信：${c.wechat}` : '',
    c.email ? `邮箱：${c.email}` : '',
  ].filter(Boolean).join('\n');
  uni.setClipboardData({ data: lines, success: () => uni.showToast({ title: '名片信息已复制', icon: 'none' }) });
}
function buildExportCsv(visitors) {
  const c = card.value;
  const esc = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ['字段', '值'].map(esc).join(','),
    ['姓名', c.name || ''].map(esc).join(','),
    ['职位', c.position || ''].map(esc).join(','),
    ['公司', c.company || ''].map(esc).join(','),
    ['电话', c.phone || ''].map(esc).join(','),
    ['微信', c.wechat || ''].map(esc).join(','),
    ['邮箱', c.email || ''].map(esc).join(','),
    ['总访问', stats.value.totalViews || 0].map(esc).join(','),
    ['被交换', stats.value.totalExchanges || 0].map(esc).join(','),
    ['集市曝光', stats.value.marketViews || 0].map(esc).join(','),
    '',
    ['访客昵称', '访问次数', '最近访问'].map(esc).join(','),
  ];
  (visitors || []).forEach((v) => {
    rows.push([v.nickname || '匿名访客', v.visitCount || 0, v.lastVisitAt || ''].map(esc).join(','));
  });
  return rows.join('\n');
}
function copyExport(csv) {
  uni.setClipboardData({ data: csv, success: () => uni.showToast({ title: '数据已复制为文本', icon: 'none' }) });
}
async function exportData() {
  // 导出前拉一次完整访客列表（myCard 页常驻的只有 TOP3）
  let allVisitors = visitorTop.value;
  try {
    const res = await cardApi.getVisitorSummary();
    if (res && res.visitors && res.visitors.length) allVisitors = res.visitors;
  } catch (e) {}
  const csv = buildExportCsv(allVisitors);
  // #ifdef MP-WEIXIN
  try {
    const fs = uni.getFileSystemManager();
    const path = `${wx.env.USER_DATA_PATH}/card-data-${Date.now()}.csv`;
    fs.writeFileSync(path, '\ufeff' + csv, 'utf8');
    uni.shareFileMessage({
      filePath: path,
      fileName: '我的名片数据.csv',
      success: () => uni.showToast({ title: '已导出，可发送给好友或电脑', icon: 'none' }),
      fail: (e) => {
        // 🔴 用户主动取消转发（errMsg 含 'cancel'）不应提示"数据已复制为文本"——
        //   那是真实失败时的降级文案。仅真正失败才降级复制，取消则静默回到页面。
        const msg = (e && e.errMsg) || '';
        if (msg.indexOf('cancel') >= 0) return;
        copyExport(csv);
      },
    });
  } catch (e) { copyExport(csv); }
  // #endif
  // #ifndef MP-WEIXIN
  if (typeof document !== 'undefined') {
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '我的名片数据.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    uni.showToast({ title: 'CSV 文件已下载', icon: 'success' });
  } else {
    copyExport(csv);
  }
  // #endif
}
const goConnections = () => uni.navigateTo({ url: '/pages/card/connections' });
const goCollects = () => uni.navigateTo({ url: '/pages/card/collects' });
const goMessages = () => uni.navigateTo({ url: '/pages/card/messages' });
function leaveTenant() {
  uni.showModal({
    title: '退出平台',
    content: '退出后将无法查看本客户项目空间内的名片与人脉，确定退出吗？',
    confirmColor: '#f53f3f',
    success: (r) => {
      if (r.confirm) {
        uni.removeStorageSync('card_token');
        uni.removeStorageSync('card_user');
        uni.reLaunch({ url: loginEntryUrl(LOGIN_PATH) });
      }
    },
  });
}
</script>

<style scoped>
/* ===== 我的名片·商务增强版 ===== */
.owner-page { min-height: 100vh; background: var(--bg-page); padding-bottom: 160rpx; }

/* 加载骨架（小程序/H5 通用） */
.page-loading { min-height: 100vh; background: var(--bg-page); padding: 0 24rpx; }
.sk-nav { height: 88rpx; display: flex; align-items: center; gap: 24rpx; }
.sk-back { width: 64rpx; height: 64rpx; display: flex; align-items: center; flex-shrink: 0; }
.sk-title { width: 200rpx; height: 36rpx; border-radius: var(--radius-sm); background: linear-gradient(90deg,#f0f1f3 25%,#e8eaed 37%,#f0f1f3 63%); background-size: 400% 100%; animation: sk-loading 1.4s ease infinite; }
.sk-card {
  display: flex; align-items: center; gap: 24rpx;
  background: var(--white); border-radius: var(--radius-md); padding: 32rpx 24rpx; margin-top: 8rpx;
}
.sk-avatar { width: 112rpx; height: 112rpx; border-radius: 50%; background: linear-gradient(90deg,#f0f1f3 25%,#e8eaed 37%,#f0f1f3 63%); background-size: 400% 100%; animation: sk-loading 1.4s ease infinite; }
.sk-lines { flex: 1; display: flex; flex-direction: column; gap: 16rpx; }
.sk-line { height: 28rpx; border-radius: var(--radius-sm); background: linear-gradient(90deg,#f0f1f3 25%,#e8eaed 37%,#f0f1f3 63%); background-size: 400% 100%; animation: sk-loading 1.4s ease infinite; }
.sk-line.w60 { width: 60%; }
.sk-line.w40 { width: 40%; }
.sk-line.w30 { width: 30%; }
.sk-block { background: var(--white); border-radius: var(--radius-md); padding: 28rpx 24rpx; margin-top: 24rpx; }
@keyframes sk-loading { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }

/* 加载失败态 */
.page-error {
  min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: var(--bg-page); gap: 20rpx; padding-bottom: 120rpx;
}
.pe-text { font-size: var(--fs-4); color: var(--t3); }
.pe-btn {
  margin-top: 12rpx; padding: 16rpx 56rpx; border-radius: 40rpx;
  background: linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, var(--design-primary, #165dff)));
  color: var(--design-text, #fff); font-size: var(--fs-5);
}
.owner-switch { display: flex; gap: 16rpx; padding: 20rpx 24rpx 0; }
.os-chip { font-size: var(--fs-3); color: var(--t2); background: var(--white); border: 1rpx solid #eeeeee; padding: 10rpx 28rpx; border-radius: var(--radius-pill); }
.os-chip.on { color: var(--white); background: var(--design-primary, #165dff); border-color: var(--design-primary, #165dff); font-weight: 500; }
/* .on-edit（右上角「编辑」）已随入口一并移除，勿复活：下方「名片内容编辑列表」已覆盖该能力 */

.owner-card { background: var(--white); border-radius: 20rpx; margin: 20rpx 24rpx; padding: 28rpx; box-shadow: 0 8rpx 28rpx rgba(20,40,70,.08); }
.oc-head { display: flex; gap: 20rpx; align-items: center; }
.oc-avatar { width: 120rpx; height: 120rpx; border-radius: 50%; background: linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff)); color: var(--white); font-size: var(--fs-8); font-weight: 600; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.oc-avatar-img { width: 100%; height: 100%; }
.oc-id { flex: 1; min-width: 0; }
.oc-name { font-size: 38rpx; font-weight: 700; color: var(--t5); }
.oc-pos { font-size: var(--fs-4); color: var(--t2); margin-top: 6rpx; }
.oc-co { font-size: var(--fs-3); color: var(--t4); margin-top: 4rpx; }
.oc-needs { display: flex; gap: 10rpx; margin-top: 20rpx; flex-wrap: wrap; }
.oc-need { font-size: var(--fs-2); color: var(--design-primary, #165dff); background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08); padding: 6rpx 16rpx; border-radius: var(--radius-sm); }
.oc-actions { display: flex; margin-top: 24rpx; padding-top: 24rpx; border-top: 1rpx solid #f0f0f0; }
.oc-act { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx; font-size: var(--fs-2); color: var(--t2); }

.owner-stats { display: flex; background: var(--white); border-radius: 20rpx; margin: 0 24rpx; padding: 28rpx 0; box-shadow: 0 8rpx 28rpx rgba(20,40,70,.08); }
.os-item { flex: 1; text-align: center; }
.os-num { font-size: var(--fs-7); font-weight: 700; color: var(--t5); }
.os-label { font-size: var(--fs-2); color: var(--t4); margin-top: 6rpx; }

.owner-market { background: var(--white); border-radius: 20rpx; margin: 20rpx 24rpx; padding: 28rpx; box-shadow: 0 8rpx 28rpx rgba(20,40,70,.08); }
.om-title { display: flex; align-items: center; gap: 10rpx; font-size: var(--fs-5); font-weight: 600; color: var(--t5); }
.om-status { display: inline-block; margin-top: 16rpx; font-size: 30rpx; font-weight: 700; }
.om-status.on { color: var(--success); }
.om-status.pend { color: #f59e0b; }
.om-status.off { color: var(--t4); }
.om-desc { font-size: var(--fs-2); color: var(--t2); margin-top: 8rpx; line-height: 1.5; }
.om-locate { margin-top: 16rpx; font-size: var(--fs-3); color: var(--design-primary, #165dff); }

.owner-section { background: var(--white); border-radius: 20rpx; margin: 0 24rpx 20rpx; padding: 8rpx 28rpx; box-shadow: 0 8rpx 28rpx rgba(20,40,70,.08); }
/* 会员横幅 mb-* 为死代码（模板未引用），移除以免配色漂移 */

.os-t { font-size: var(--fs-5); font-weight: 600; color: var(--t5); padding: 24rpx 0 8rpx; }
.os-t small { font-size: var(--fs-1); color: var(--t4); font-weight: 400; }
.os-row { display: flex; align-items: center; gap: 16rpx; padding: 24rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.os-row:last-child { border-bottom: none; }
.os-row.danger .osr-name { color: var(--danger); }
.osr-icon { width: 72rpx; height: 72rpx; border-radius: var(--radius-md); background: rgba(var(--design-primary-rgb, 22, 93, 255), .06); display: flex; align-items: center; justify-content: center; }
.osr-main { flex: 1; }
.osr-name { font-size: var(--fs-5); color: var(--t5); }
.osr-desc { font-size: var(--fs-2); color: var(--t4); margin-top: 4rpx; }
.osr-arrow { font-size: var(--fs-6); color: var(--border-strong); }
.osr-badge {
  min-width: 32rpx;
  height: 32rpx;
  line-height: 32rpx;
  border-radius: var(--radius-md);
  background: var(--danger);
  color: var(--white);
  font-size: var(--fs-1);
  text-align: center;
  padding: 0 8rpx;
  margin-right: 8rpx;
  box-sizing: border-box;
}

.ov-list { padding: 8rpx 0; }
.ov-item { display: flex; align-items: center; gap: 16rpx; padding: 16rpx 0; }
.ov-arrow { font-size: var(--fs-6); color: var(--border-strong); flex-shrink: 0; }
.ov-avatar { width: 64rpx; height: 64rpx; border-radius: 50%; background: rgba(var(--design-primary-rgb, 22, 93, 255), .08); color: var(--design-primary, #165dff); font-size: var(--fs-4); display: flex; align-items: center; justify-content: center; }
.ov-info { flex: 1; }
.ov-name { font-size: var(--fs-4); color: var(--t5); }
.ov-time { font-size: var(--fs-2); color: var(--t4); margin-top: 4rpx; }
.ov-empty { font-size: var(--fs-3); color: var(--t4); padding: 20rpx 0; }
.ov-more { font-size: var(--fs-3); color: var(--design-primary, #165dff); padding: 16rpx 0 8rpx; text-align: center; }

/* ===== 二维码 / 海报弹层 ===== */
.sheet-mask {
  position: fixed; left: 0; right: 0; top: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5); z-index: var(--z-popup);
}
.qr-sheet {
  position: fixed; left: 0; right: 0; bottom: 0;
  background: var(--white); border-radius: 28rpx 28rpx 0 0;
  /* 与 mask 同层（--z-popup）：DOM 顺序在后自然盖住遮罩；--z-toast 让给系统 toast */
  z-index: var(--z-popup);
  padding: 16rpx 40rpx calc(40rpx + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; align-items: center;
}
.grip { width: 72rpx; height: 8rpx; border-radius: 4rpx; background: #e5e6eb; margin-bottom: 20rpx; }
.qs-title { font-size: var(--fs-6); font-weight: 600; color: var(--t5); }
.qs-sub { font-size: var(--fs-2); color: var(--t4); margin-top: 8rpx; text-align: center; }
.qs-img-wrap {
  margin-top: 24rpx; width: 460rpx; height: 460rpx;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-page); border-radius: 20rpx; overflow: hidden;
}
.qs-img { width: 440rpx; height: 440rpx; }
.qs-img.poster { height: 640rpx; }
.qs-img-wrap.poster-wrap { height: 660rpx; }
.qs-loading { font-size: var(--fs-3); color: var(--t4); }
.qs-save {
  margin-top: 28rpx; width: 100%; height: 88rpx; line-height: 88rpx;
  border-radius: 44rpx; border: none;
  background: linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, var(--design-primary, #165dff)));
  color: var(--white); font-size: var(--fs-5);
}
.qs-save[disabled] { opacity: 0.5; }
.qs-close { margin-top: 16rpx; font-size: var(--fs-3); color: var(--t4); padding: 12rpx 40rpx; }
/* 离屏海报画布：type=2d canvas 不能 display:none（节点不布局会拿不到 node），移出屏幕即可 */
.poster-canvas {
  position: fixed; left: -9999rpx; top: 0;
  width: 600px; height: 960px;
}
.radar-float {
  position: fixed; right: 32rpx; bottom: calc(160rpx + env(safe-area-inset-bottom)); z-index: var(--z-sticky);
  width: 96rpx; height: 96rpx; border-radius: 50%;
  background: linear-gradient(135deg, var(--design-primary), var(--design-gradient));
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(var(--design-primary-rgb), 0.35);
  animation: radarBreathe 2.4s ease-in-out infinite;
}
.radar-float .bd-wrap { position: absolute; top: -6rpx; right: -6rpx; }
/* 雷达脉冲圈：扩散+淡出，让悬浮球一眼可见 */
.radar-float .radar-pulse {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  border-radius: 50%; border: 2rpx solid var(--design-primary);
  opacity: 0; animation: radarPulse 2s ease-out infinite; pointer-events: none;
}
.radar-float .radar-pulse.delay { animation-delay: 1s; }
@keyframes radarPulse {
  0% { transform: scale(1); opacity: 0.55; }
  100% { transform: scale(2.3); opacity: 0; }
}
@keyframes radarBreathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
</style>
