<template>
  <!-- ===== 我的名片·商务增强版（本人视角管理控制台） ===== -->
  <view class="owner-page" v-if="isOwner">
    <!-- 导航栏 -->
    <view class="owner-nav">
      <view class="on-back" @click="goBack"><SIcon name="dynamic" size="default" color="#1a1a1a" /></view>
      <view class="on-title">我的名片</view>
      <view class="on-edit" @click="editCard">编辑</view>
    </view>

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
        <view class="oc-avatar">
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
        <view class="oc-act" @click="previewCard"><SIcon name="card" size="default" color="#07c160" /><text>预览</text></view>
        <view class="oc-act" @click="shareOwnerCard"><SIcon name="channel" size="default" color="#07c160" /><text>分享</text></view>
        <view class="oc-act" @click="copyLink"><SIcon name="devices" size="default" color="#07c160" /><text>二维码/链接</text></view>
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

    <!-- 集市状态专属卡片 -->
    <view class="owner-market">
      <view class="om-title"><SIcon name="market" size="default" color="#1d4e8f" /><text>集市状态</text></view>
      <view class="om-status" :class="marketStatusClass">{{ marketStatusText }}</view>
      <view class="om-desc">{{ marketStatusDesc }}</view>
      <view class="om-locate" v-if="marketOn" @click="locateInMarket">查看我在集市的位置 ›</view>
    </view>

    <!-- 名片内容编辑列表 -->
    <view class="owner-section">
      <view class="os-t">名片内容</view>
      <view class="os-row" @click="editCard">
        <view class="osr-icon"><SIcon name="card" size="default" color="#1d4e8f" /></view>
        <view class="osr-main"><view class="osr-name">名片资料</view><view class="osr-desc">姓名、职位、企业、联系方式</view></view>
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row" @click="editCard">
        <view class="osr-icon"><SIcon name="radar" size="default" color="#1d4e8f" /></view>
        <view class="osr-main"><view class="osr-name">供需标签</view><view class="osr-desc">找渠道/求合作/招合伙人等</view></view>
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row" @click="editCard">
        <view class="osr-icon"><SIcon name="settings" size="default" color="#1d4e8f" /></view>
        <view class="osr-main"><view class="osr-name">展示设置</view><view class="osr-desc">公开状态、模板样式</view></view>
        <text class="osr-arrow">›</text>
      </view>
    </view>

    <!-- 访客雷达 TOP3 -->
    <view class="owner-section">
      <view class="os-t">访客雷达 <small>最近访客</small></view>
      <view class="ov-list" v-if="visitorTop.length">
        <view class="ov-item" v-for="v in visitorTop" :key="v.id">
          <view class="ov-avatar">{{ (v.nickname || '客')[0] }}</view>
          <view class="ov-info">
            <view class="ov-name">{{ v.nickname || '匿名访客' }}</view>
            <view class="ov-time">{{ timeText(v.lastVisitAt) }} · {{ v.visitCount }}次</view>
          </view>
        </view>
      </view>
      <view class="ov-empty" v-else>还没有访客，快去分享你的名片吧</view>
      <view class="ov-more" @click="goVisitors">查看全部访客 ›</view>
    </view>

    <!-- 高级工具 -->
    <view class="owner-section">
      <view class="os-t">高级工具</view>
      <view class="os-row" @click="saveCardInfo">
        <view class="osr-icon"><SIcon name="storage" size="default" color="#1d4e8f" /></view>
        <view class="osr-main"><view class="osr-name">保存名片</view><view class="osr-desc">复制名片信息，可保存到手机通讯录</view></view>
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row" @click="exportData">
        <view class="osr-icon"><SIcon name="analytics" size="default" color="#1d4e8f" /></view>
        <view class="osr-main"><view class="osr-name">导出数据</view><view class="osr-desc">复制我的名片与访客数据</view></view>
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row danger" @click="leaveTenant">
        <view class="osr-icon"><SIcon name="logs" size="default" color="#f53f3f" /></view>
        <view class="osr-main"><view class="osr-name">退出租户</view><view class="osr-desc">退出当前客户项目空间</view></view>
        <text class="osr-arrow">›</text>
      </view>
    </view>

    <CardTabBar active="card" />
  </view>

  <!-- ===== 名片展示视图（他人名片/预览） ===== -->
  <view class="profile-page" v-else>
    <!-- 沉浸式hero（demo g4 橙色渐变） -->
    <view class="hero">
      <view class="row1">
        <view class="hero-avatar">
          <image v-if="card.avatar" :src="card.avatar" class="avatar-img" mode="aspectFill" />
          <view v-else class="avatar-txt">{{ card.name?.[0] || '名' }}</view>
        </view>
        <view class="hero-id">
          <view class="nm">{{ card.name || '您的姓名' }}</view>
          <view class="pos">{{ card.position || '—' }}</view>
          <view class="co">{{ cityLine }}</view>
        </view>
        <view class="hero-badge" v-if="memberLevel !== 'free'"><SIcon name="crown" size="small" color="#fff" /> {{ memberLevelText }}</view>
      </view>
      <!-- quickbar（demo四键） -->
      <view class="quickbar">
        <view class="qb" @click="callPhone" v-if="card.phone">
          <SIcon name="mobile" size="default" color="#ffffff" />
          <text>拨号</text>
        </view>
        <view class="qb" @click="copyWechat" v-if="card.wechat">
          <SIcon name="exchange" size="default" color="#ffffff" />
          <text>复制微信</text>
        </view>
        <view class="qb" @click="navigateTo">
          <SIcon name="location" size="default" color="#ffffff" />
          <text>导航</text>
        </view>
        <view class="qb" @click="shareCard">
          <SIcon name="channel" size="default" color="#ffffff" />
          <text>分享</text>
        </view>
      </view>
    </view>

    <!-- Tab切换（demo mp-tabs） -->
    <view class="mp-tabs">
      <view class="mp-tab" :class="{ on: activeTab === 'intro' }" @click="activeTab='intro'">简介<span class="bar"></span></view>
      <view class="mp-tab" :class="{ on: activeTab === 'works' }" @click="activeTab='works'">作品<span class="bar"></span></view>
      <view class="mp-tab" :class="{ on: activeTab === 'dynamic' }" @click="activeTab='dynamic'">动态<span class="bar"></span></view>
      <view class="mp-tab" :class="{ on: activeTab === 'video' }" @click="activeTab='video'">视频<span class="bar"></span></view>
    </view>

    <!-- 简介面板 -->
    <view class="tab-panel" v-if="activeTab === 'intro'">
      <view class="sec-t">个人简介</view>
      <view class="card-row">
        <view class="intro-line" v-if="card.position">
          <SIcon name="user" size="small" color="#86909c" />
          <text class="lb">身份</text>
          <text class="vl">{{ card.position }}</text>
        </view>
        <view class="intro-line" v-if="card.bio">
          <SIcon name="doc" size="small" color="#86909c" />
          <text class="lb">简介</text>
          <text class="vl">{{ card.bio }}</text>
        </view>
        <view class="intro-line" v-if="card.businessField">
          <SIcon name="radar" size="small" color="#86909c" />
          <text class="lb">专注</text>
          <text class="vl">{{ card.businessField }}</text>
        </view>
        <view class="intro-line" v-if="tagList.length">
          <SIcon name="star" size="small" color="#86909c" />
          <text class="lb">标签</text>
          <view class="skill-tags">
            <view class="skill-tag" v-for="(tag, i) in tagList" :key="i">{{ tag }}</view>
          </view>
        </view>
      </view>
    </view>

    <!-- 作品面板 -->
    <view class="tab-panel" v-if="activeTab === 'works'">
      <view class="sec-t">我的作品<small>品牌案例</small></view>
      <view class="gall" v-if="works.length">
        <image v-for="w in works" :key="w.id" class="gall-img" :src="w.imageUrl" mode="aspectFill" @click="previewWork(w)" />
      </view>
      <view class="empty-state" v-else>
        <view class="empty-icon"><SIcon name="template" size="xlarge" color="#c9cdd4" /></view>
        <view class="empty-text">暂无作品案例</view>
      </view>
    </view>

    <!-- 动态面板 -->
    <view class="tab-panel" v-if="activeTab === 'dynamic'">
      <view class="sec-t">最新动态</view>
      <view class="dyn-list" v-if="dynamics.length">
        <view class="dyn-card" v-for="d in dynamics" :key="d.id">
          <view class="dyn-head">
            <view class="dyn-av">
              <image v-if="d.authorAvatar" :src="d.authorAvatar" mode="aspectFill" />
              <view v-else>{{ (d.authorName || card.name || '名')[0] }}</view>
            </view>
            <view class="dyn-who">
              <b>{{ d.authorName || card.name }}</b>
              <span>{{ timeText(d.createdAt) }}</span>
            </view>
          </view>
          <view class="dyn-body">
            <h4 v-if="d.title">{{ d.title }}</h4>
            <p>{{ d.content }}</p>
          </view>
          <image v-if="d.images && d.images.length" class="dyn-img" :src="d.images[0]" mode="aspectFill" @click="previewDyn(d)" />
          <view class="dyn-meta">
            <span><SIcon name="analytics" size="small" color="#9a9a9a" /> {{ d.likeCount }}</span>
            <span><SIcon name="exchange" size="small" color="#9a9a9a" /> {{ d.commentCount }}</span>
          </view>
        </view>
      </view>
      <view class="empty-state" v-else>
        <view class="empty-icon"><SIcon name="dynamic" size="xlarge" color="#c9cdd4" /></view>
        <view class="empty-text">暂无动态</view>
      </view>
    </view>

    <!-- 视频面板 -->
    <view class="tab-panel" v-if="activeTab === 'video'">
      <view class="sec-t">视频作品<small>对接视频号</small></view>
      <view class="vids-row" v-if="videos.length">
        <view class="vid-card" v-for="v in videos" :key="v.id" @click="openVideo">
          <image class="vid-cover" :src="v.coverUrl" mode="aspectFill" />
          <view class="vid-play"><SIcon name="dynamic" size="large" color="#ffffff" /></view>
          <view class="vid-title">{{ v.title }}</view>
          <view class="vid-dur" v-if="v.duration">{{ v.duration }}</view>
        </view>
      </view>
      <view class="empty-state" v-else-if="!card.videoChannel">
        <view class="empty-icon"><SIcon name="dynamic" size="xlarge" color="#c9cdd4" /></view>
        <view class="empty-text">暂无视频作品</view>
      </view>
      <view class="video-card" v-else @click="openVideo">
        <view class="video-cover"><SIcon name="dynamic" size="large" color="#fff" /></view>
        <view class="video-info">
          <view class="video-title">{{ card.videoChannel }}</view>
          <view class="video-desc">点击跳转视频号</view>
        </view>
      </view>
    </view>

    <!-- 底部TabBar（公共组件：名片/雷达/集市/会员） -->
    <CardTabBar active="card" />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { track, trackPageView } from '../../utils/analytics.js';
import { saveCardTabState, restoreScrollTop, h5ScrollTop } from '../../utils/cardTabState.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';

const card = ref({});
const works = ref([]);
const dynamics = ref([]);
const videos = ref([]);
const activeTab = ref('intro');
const memberLevel = ref('free');

/* ===== 商务增强版（本人管理控制台） ===== */
const currentUserId = ref(null);
const forcePreview = ref(false);
const myStatus = ref(null);   // { items, subjects }
const stats = ref({});
const visitorTop = ref([]);
const activeSubject = ref(null);
const pageCardId = ref(null);

const subjectList = computed(() => (myStatus.value?.subjects || []).filter((s) => s.status === 'active'));
const isOwner = computed(() => {
  if (forcePreview.value) return false;
  return !!card.value.userId && !!currentUserId.value && Number(card.value.userId) === Number(currentUserId.value);
});
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
  if (!it) return '开启后将你的名片展示给租户内所有人，可在集市页一键上架';
  if (it.auditStatus === 'pending') return '已提交上架申请，等待租户管理员审核';
  if (it.auditStatus === 'rejected') return '上架申请未通过，可联系管理员或修改名片后重新申请';
  return '你的名片正在集市展示' + (it.isNew ? '（新入驻7天角标）' : '');
});
const needTagList = computed(() => {
  try {
    const arr = JSON.parse(card.value.needTags || '[]');
    return Array.isArray(arr) ? arr.slice(0, 3) : [];
  } catch { return []; }
});

function decodeTokenUid() {
  try {
    const token = uni.getStorageSync('card_token');
    if (!token) return null;
    // card_token 格式为 base64({uid}).signature，payload 在前（与后端 comboAuth 一致）
    const payload = token.split('.')[0];
    if (!payload) return null;
    return JSON.parse(decodeURIComponent(escape(atob(payload)))).uid || null;
  } catch { return null; }
}

async function loadOwnerData() {
  currentUserId.value = decodeTokenUid();
  if (!currentUserId.value) return;
  try {
    const [st, mk] = await Promise.allSettled([
      cardApi.getVisitorSummary(),
      cardApi.getMarketMyStats(),
      cardApi.getMarketMyStatus(),
    ]);
    if (st.status === 'fulfilled') visitorTop.value = (st.value.visitors || []).slice(0, 3);
    if (mk.status === 'fulfilled') stats.value = mk.value.stats || mk.value;
  } catch (e) {}
  try {
    const mst = await cardApi.getMarketMyStatus();
    myStatus.value = mst;
    const subs = (mst.subjects || []).filter((s) => s.status === 'active');
    if (subs.length && !activeSubject.value) {
      activeSubject.value = subs.find((s) => s.subjectType === 'individual') || subs[0];
    }
  } catch (e) {}
}

const memberLevelText = computed(() => ({ free: '', silver: '白银', gold: '黄金', diamond: '钻石' }[memberLevel.value]));
// demo: 东莞 · 约拍·商业摄影（城市 · slogan/业务）
const cityLine = computed(() => {
  const city = card.value.city || '';
  const biz = card.value.slogan || card.value.businessField || card.value.company || '';
  return [city, biz].filter(Boolean).join(' · ') || '—';
});
// 标签：优先独立tags字段，回退业务领域拆分
const tagList = computed(() => {
  if (card.value.tags) return card.value.tags.split(/[,，、\/]/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
  if (!card.value.businessField) return [];
  return card.value.businessField.split(/[/,，、]/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
});

onLoad((options) => {
  if (options && options.preview) forcePreview.value = true;
});

onMounted(async () => {
  const pages = getCurrentPages();
  const id = pages[pages.length - 1].options.id;
  pageCardId.value = id || null;
  if (id) {
    // 记住最近查看的名片，供底部"名片"Tab切回时使用
    uni.setStorageSync('cardLastViewId', id);
    restoreScrollTop('myCard');
    try {
      const res = await cardApi.getCard(id);
      card.value = res.card;
      memberLevel.value = res.card.ownerMemberLevel || 'free';
      // 采集访客行为
      cardApi.trackVisitor({ cardId: id, actionType: 'view', page: 'profile' });
      // 行为埋点：浏览名片
      trackPageView('/pages/card/myCard');
      track('card_view', { cardId: Number(id), page: '/pages/card/myCard', extra: { name: card.value.name } });
      // 加载作品集
      try {
        const w = await cardApi.getCardWorks(id);
        works.value = w.works || [];
      } catch (e) {}
      // 加载动态
      try {
        const d = await cardApi.getCardDynamics(id);
        dynamics.value = d.dynamics || [];
      } catch (e) {}
      // 加载视频
      try {
        const v = await cardApi.getCardVideos(id);
        videos.value = v.videos || [];
      } catch (e) {}
    } catch (e) {}
    // 商务增强版数据（本人名片）
    if (!forcePreview.value) {
      await loadOwnerData();
      isOwner.value; // 触发 computed
    }
  }
});

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
function previewCard() {
  // 他人视角预览
  uni.navigateTo({ url: `/pages/card/myCard?id=${pageCardId.value}&preview=1` });
}
function shareOwnerCard() {
  const href = typeof window !== 'undefined' ? window.location.href.split('#')[0] + '#/pages/card/myCard?id=' + pageCardId.value : '';
  if (href) {
    uni.setClipboardData({ data: href, success: () => uni.showToast({ title: '名片链接已复制，可分享给好友', icon: 'none' }) });
  } else {
    uni.showToast({ title: '当前环境暂不支持分享', icon: 'none' });
  }
}
function copyLink() {
  const href = typeof window !== 'undefined' ? window.location.href.split('#')[0] + '#/pages/card/myCard?id=' + pageCardId.value : '';
  uni.setClipboardData({ data: href, success: () => uni.showToast({ title: '名片链接已复制', icon: 'success' }) });
}
function locateInMarket() {
  uni.switchTab ? uni.navigateTo({ url: '/pages/card/market' }) : uni.redirectTo({ url: '/pages/card/market' });
}
function goVisitors() { uni.navigateTo({ url: '/pages/card/visitors' }); }
function saveCardInfo() {
  const c = card.value;
  const lines = [
    `姓名：${c.name || ''}`,
    c.position ? `职位：${c.position}` : '',
    c.company ? `公司：${c.company}` : '',
    c.phone ? `电话：${c.phone}` : '',
    c.wechat ? `微信：${c.wechat}` : '',
    c.email ? `邮箱：${c.email}` : '',
  ].filter(Boolean).join('\n');
  uni.setClipboardData({ data: lines, success: () => uni.showToast({ title: '名片信息已复制，可粘贴到通讯录', icon: 'none' }) });
}
function exportData() {
  const c = card.value;
  const text = [
    `我的名片（${c.name || ''}）`,
    `职位：${c.position || '-'}｜企业：${c.company || '-'}`,
    `电话：${c.phone || '-'}｜微信：${c.wechat || '-'}`,
    `总访问：${stats.value.totalViews || 0}｜被交换：${stats.value.totalExchanges || 0}｜集市曝光：${stats.value.marketViews || 0}`,
    `最近访客：${visitorTop.value.map((v) => v.nickname || '匿名').join('、') || '暂无'}`,
  ].join('\n');
  uni.setClipboardData({ data: text, success: () => uni.showToast({ title: '名片与访客数据已复制', icon: 'none' }) });
}
function leaveTenant() {
  uni.showModal({
    title: '退出租户',
    content: '退出后将无法查看本客户项目空间内的名片与人脉，确定退出吗？',
    confirmColor: '#f53f3f',
    success: (r) => {
      if (r.confirm) {
        uni.removeStorageSync('card_token');
        uni.removeStorageSync('card_user');
        uni.reLaunch({ url: '/pages/card/apply' });
      }
    },
  });
}

function callPhone() {
  if (card.value.phone) uni.makePhoneCall({ phoneNumber: card.value.phone });
}
function copyWechat() {
  if (card.value.wechat) {
    uni.setClipboardData({ data: card.value.wechat, success: () => uni.showToast({ title: '微信号已复制', icon: 'success' }) });
  }
}
function navigateTo() {
  const addr = [card.value.city, card.value.businessField || card.value.company].filter(Boolean).join(' · ');
  if (!addr) {
    uni.showToast({ title: '名片未设置位置', icon: 'none' });
    return;
  }
  uni.setClipboardData({
    data: addr,
    success: () => uni.showToast({ title: '地址已复制，可粘贴到地图导航', icon: 'none' }),
  });
}
function previewWork(w) {
  if (w.imageUrl) uni.previewImage({ urls: works.value.map((x) => x.imageUrl), current: w.imageUrl });
}
function previewDyn(d) {
  if (d.images && d.images.length) uni.previewImage({ urls: d.images, current: d.images[0] });
}
function timeText(t) {
  if (!t) return '';
  const diff = (Date.now() - new Date(t.replace(' ', 'T')).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 172800) return '昨天';
  return new Date(t).toLocaleDateString('zh-CN');
}
function openVideo() {
  uni.showToast({ title: '跳转视频号', icon: 'none' });
}
function shareCard() {
  uni.showToast({ title: '请点击右上角分享', icon: 'none' });
}
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: #f5f6f7;
  padding-bottom: 140rpx;
}

/* ===== hero（demo g4 橙色渐变）===== */
.hero {
  position: relative;
  padding: calc(88rpx + 30rpx) 40rpx 52rpx;
  color: #fff;
  background: linear-gradient(155deg, #b45309, #f59e0b);
  overflow: hidden;
}
.row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}
.hero-avatar {
  width: 132rpx;
  height: 132rpx;
  border-radius: 36rpx;
  overflow: hidden;
  border: 2px solid rgba(255,255,255,0.35);
  box-shadow: 0 12rpx 32rpx rgba(0,0,0,0.25);
  flex-shrink: 0;
  background: rgba(255,255,255,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-img {
  width: 100%;
  height: 100%;
}
.avatar-txt {
  font-size: 48rpx;
  font-weight: 700;
  color: #fff;
}
.hero-id {
  flex: 1;
  margin-left: 28rpx;
}
.nm {
  font-size: 40rpx;
  font-weight: 700;
}
.pos {
  font-size: 25rpx;
  opacity: 0.88;
  margin-top: 6rpx;
}
.co {
  font-size: 23rpx;
  opacity: 0.72;
  margin-top: 10rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  font-size: 21rpx;
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.25);
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ===== quickbar（demo四键）===== */
.quickbar {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16rpx;
  margin-top: 36rpx;
}
.qb {
  background: rgba(255,255,255,0.14);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 26rpx;
  padding: 18rpx 0 16rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  color: #fff;
  font-size: 22rpx;
}

/* ===== mp-tabs（demo）===== */
.mp-tabs {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  background: #f5f6f7;
  border-bottom: 1px solid #eeeeee;
  padding: 0 12rpx;
}
.mp-tab {
  flex: 1;
  text-align: center;
  padding: 26rpx 0 22rpx;
  font-size: 28rpx;
  color: #9a9a9a;
  font-weight: 500;
  position: relative;
  transition: color 0.2s;
}
.mp-tab.on {
  color: #07c160;
  font-weight: 600;
}
.bar {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 44rpx;
  height: 6rpx;
  border-radius: 6rpx;
  background: #07c160;
  transform: translateX(-50%) scaleX(0);
  transition: transform 0.28s;
}
.mp-tab.on .bar {
  transform: translateX(-50%) scaleX(1);
}

/* ===== 内容面板 ===== */
.tab-panel {
  padding-bottom: 24rpx;
}
.sec-t {
  margin: 36rpx 32rpx 20rpx;
  font-size: 28rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #1a1a1a;
}
.sec-t small {
  font-size: 22rpx;
  color: #9a9a9a;
  font-weight: 400;
}
.card-row {
  margin: 0 28rpx;
  background: #fff;
  border-radius: 20rpx;
  padding: 8rpx 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.intro-line {
  display: flex;
  gap: 16rpx;
  align-items: flex-start;
  padding: 22rpx 0;
  border-bottom: 1px dashed #eeeeee;
  font-size: 26rpx;
}
.intro-line:last-child {
  border-bottom: none;
}
.lb {
  color: #9a9a9a;
  flex-shrink: 0;
  width: 72rpx;
}
.vl {
  color: #1a1a1a;
  flex: 1;
  line-height: 1.6;
}
.vl.link {
  color: #165dff;
}
.skill-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-top: 4rpx;
}
.skill-tag {
  background: rgba(7,193,96,0.1);
  color: #07c160;
  font-size: 22rpx;
  padding: 6rpx 18rpx;
  border-radius: 24rpx;
}

/* ===== 作品网格（demo gall）===== */
.gall {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18rpx;
  margin: 0 28rpx;
}
.gall-img {
  width: 100%;
  height: 184rpx;
  object-fit: cover;
  border-radius: 24rpx;
  display: block;
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
  font-size: 26rpx;
  color: #9a9a9a;
}

/* ===== 视频 ===== */
.video-card {
  margin: 0 28rpx;
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  display: flex;
  align-items: center;
  gap: 20rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.video-cover {
  width: 120rpx;
  height: 120rpx;
  background: #000;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.video-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 8rpx;
}
.video-desc {
  font-size: 24rpx;
  color: #9a9a9a;
}

/* ===== 动态（demo dyn-card）===== */
.dyn-list {
  padding: 0 28rpx;
}
.dyn-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.dyn-head {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.dyn-av {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  overflow: hidden;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9a9a9a;
  font-size: 28rpx;
  flex-shrink: 0;
}
.dyn-av image {
  width: 100%;
  height: 100%;
}
.dyn-who {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.dyn-who b {
  font-size: 27rpx;
  color: #1a1a1a;
}
.dyn-who span {
  font-size: 22rpx;
  color: #9a9a9a;
}
.dyn-body {
  margin-top: 16rpx;
}
.dyn-body h4 {
  font-size: 28rpx;
  color: #1a1a1a;
  margin-bottom: 8rpx;
  font-weight: 600;
}
.dyn-body p {
  font-size: 25rpx;
  color: #4e5969;
  line-height: 1.6;
}
.dyn-img {
  width: 100%;
  height: 320rpx;
  border-radius: 16rpx;
  margin-top: 16rpx;
  display: block;
}
.dyn-meta {
  display: flex;
  gap: 32rpx;
  margin-top: 16rpx;
  font-size: 23rpx;
  color: #9a9a9a;
}
.dyn-meta span {
  display: flex;
  align-items: center;
  gap: 6rpx;
}

/* ===== 视频（demo vids 横滑卡片）===== */
.vids-row {
  display: flex;
  gap: 20rpx;
  padding: 4rpx 28rpx;
  overflow-x: auto;
}
.vid-card {
  flex: 0 0 300rpx;
  border-radius: 26rpx;
  overflow: hidden;
  position: relative;
  background: #000;
}
.vid-cover {
  width: 100%;
  height: 300rpx;
  object-fit: cover;
  display: block;
}
.vid-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.1);
}
.vid-title {
  position: absolute;
  left: 16rpx;
  right: 16rpx;
  bottom: 16rpx;
  color: #fff;
  font-size: 22rpx;
  line-height: 1.4;
}
.vid-dur {
  position: absolute;
  right: 10rpx;
  top: 10rpx;
  background: rgba(0,0,0,0.55);
  color: #fff;
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
}
</style>

<style scoped>
/* ===== 我的名片·商务增强版 ===== */
.owner-page { min-height: 100vh; background: #f5f6f7; padding-bottom: 160rpx; }
.owner-nav { display: flex; align-items: center; justify-content: space-between; height: 88rpx; padding: 88rpx 32rpx 0; background: #fff; position: sticky; top: 0; z-index: 10; }
.on-back { width: 64rpx; height: 64rpx; display: flex; align-items: center; }
.on-title { font-size: 34rpx; font-weight: 600; color: #1a1a1a; }
.on-edit { font-size: 28rpx; color: #07c160; padding: 8rpx 16rpx; }

.owner-switch { display: flex; gap: 16rpx; padding: 20rpx 24rpx 0; }
.os-chip { font-size: 24rpx; color: #5b5b5b; background: #fff; border: 1rpx solid #eeeeee; padding: 10rpx 28rpx; border-radius: 999rpx; }
.os-chip.on { color: #fff; background: #07c160; border-color: #07c160; font-weight: 500; }

.owner-card { background: #fff; border-radius: 20rpx; margin: 20rpx 24rpx; padding: 28rpx; box-shadow: 0 4px 14px rgba(20,40,70,.08); }
.oc-head { display: flex; gap: 20rpx; align-items: center; }
.oc-avatar { width: 120rpx; height: 120rpx; border-radius: 50%; background: linear-gradient(135deg, #1d4e8f, #2e6bb8); color: #fff; font-size: 44rpx; font-weight: 600; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.oc-avatar-img { width: 100%; height: 100%; }
.oc-id { flex: 1; min-width: 0; }
.oc-name { font-size: 38rpx; font-weight: 700; color: #1a1a1a; }
.oc-pos { font-size: 26rpx; color: #5b5b5b; margin-top: 6rpx; }
.oc-co { font-size: 24rpx; color: #9a9a9a; margin-top: 4rpx; }
.oc-needs { display: flex; gap: 10rpx; margin-top: 20rpx; flex-wrap: wrap; }
.oc-need { font-size: 22rpx; color: #f59e0b; background: #fef3e2; padding: 6rpx 16rpx; border-radius: 8rpx; }
.oc-actions { display: flex; margin-top: 24rpx; padding-top: 24rpx; border-top: 1rpx solid #f0f0f0; }
.oc-act { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx; font-size: 22rpx; color: #5b5b5b; }

.owner-stats { display: flex; background: #fff; border-radius: 20rpx; margin: 0 24rpx; padding: 28rpx 0; box-shadow: 0 4px 14px rgba(20,40,70,.08); }
.os-item { flex: 1; text-align: center; }
.os-num { font-size: 36rpx; font-weight: 700; color: #1a1a1a; }
.os-label { font-size: 22rpx; color: #9a9a9a; margin-top: 6rpx; }

.owner-market { background: #fff; border-radius: 20rpx; margin: 20rpx 24rpx; padding: 28rpx; box-shadow: 0 4px 14px rgba(20,40,70,.08); }
.om-title { display: flex; align-items: center; gap: 10rpx; font-size: 28rpx; font-weight: 600; color: #1a1a1a; }
.om-status { display: inline-block; margin-top: 16rpx; font-size: 30rpx; font-weight: 700; }
.om-status.on { color: #07c160; }
.om-status.pend { color: #f59e0b; }
.om-status.off { color: #9a9a9a; }
.om-desc { font-size: 22rpx; color: #5b5b5b; margin-top: 8rpx; line-height: 1.5; }
.om-locate { margin-top: 16rpx; font-size: 24rpx; color: #1d4e8f; }

.owner-section { background: #fff; border-radius: 20rpx; margin: 0 24rpx 20rpx; padding: 8rpx 28rpx; box-shadow: 0 4px 14px rgba(20,40,70,.08); }
.os-t { font-size: 28rpx; font-weight: 600; color: #1a1a1a; padding: 24rpx 0 8rpx; }
.os-t small { font-size: 20rpx; color: #9a9a9a; font-weight: 400; }
.os-row { display: flex; align-items: center; gap: 16rpx; padding: 24rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.os-row:last-child { border-bottom: none; }
.os-row.danger .osr-name { color: #f53f3f; }
.osr-icon { width: 72rpx; height: 72rpx; border-radius: 16rpx; background: rgba(22,93,255,.06); display: flex; align-items: center; justify-content: center; }
.osr-main { flex: 1; }
.osr-name { font-size: 28rpx; color: #1a1a1a; }
.osr-desc { font-size: 22rpx; color: #9a9a9a; margin-top: 4rpx; }
.osr-arrow { font-size: 32rpx; color: #c9cdd4; }

.ov-list { padding: 8rpx 0; }
.ov-item { display: flex; align-items: center; gap: 16rpx; padding: 16rpx 0; }
.ov-avatar { width: 64rpx; height: 64rpx; border-radius: 50%; background: #e9f1fb; color: #1d4e8f; font-size: 26rpx; display: flex; align-items: center; justify-content: center; }
.ov-info { flex: 1; }
.ov-name { font-size: 26rpx; color: #1a1a1a; }
.ov-time { font-size: 22rpx; color: #9a9a9a; margin-top: 4rpx; }
.ov-empty { font-size: 24rpx; color: #9a9a9a; padding: 20rpx 0; }
.ov-more { font-size: 24rpx; color: #1d4e8f; padding: 16rpx 0 8rpx; text-align: center; }
</style>
