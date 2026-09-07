<template>
  <!-- ===== 我的名片·商务增强版（本人视角管理控制台｜仅本人可见） =====
       对外展示统一走 /pages/card/cardDetail -->
  <view class="owner-page">
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
      <view class="os-row" @click="goConnections">
        <view class="osr-icon"><SIcon name="market" size="default" color="#1d4e8f" /></view>
        <view class="osr-main"><view class="osr-name">我的人脉库</view><view class="osr-desc">管理交换得来的人脉，可转为客户线索</view></view>
        <text class="osr-arrow">›</text>
      </view>
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
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { onUnload } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { track, trackPageView } from '../../utils/analytics.js';
import { saveCardTabState, restoreScrollTop, h5ScrollTop } from '../../utils/cardTabState.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';

const card = ref({});
const currentUserId = ref(null);
const myStatus = ref(null);   // { items, subjects }
const stats = ref({});
const visitorTop = ref([]);
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

onMounted(async () => {
  const pages = getCurrentPages();
  const id = pages[pages.length - 1].options.id;
  const opts = pages[pages.length - 1].options;
  // 本页仅服务本人管理台；preview/他人统一跳转对外展示页 cardDetail
  if (opts && opts.preview && id) {
    uni.redirectTo({ url: `/pages/card/cardDetail?id=${id}` });
    return;
  }
  pageCardId.value = id || null;
  if (id) {
    uni.setStorageSync('cardLastViewId', id);
    restoreScrollTop('myCard');
    try {
      const res = await cardApi.getCard(id);
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
    } catch (e) {}
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
  // 他人视角预览：跳对外展示页
  uni.navigateTo({ url: `/pages/card/cardDetail?id=${pageCardId.value}` });
}
function shareOwnerCard() {
  const href = typeof window !== 'undefined' ? window.location.href.split('#')[0] + '#/pages/card/cardDetail?id=' + pageCardId.value : '';
  if (href) {
    uni.setClipboardData({ data: href, success: () => uni.showToast({ title: '名片链接已复制，可分享给好友', icon: 'none' }) });
  } else {
    uni.showToast({ title: '当前环境暂不支持分享', icon: 'none' });
  }
}
function copyLink() {
  const href = typeof window !== 'undefined' ? window.location.href.split('#')[0] + '#/pages/card/cardDetail?id=' + pageCardId.value : '';
  uni.setClipboardData({ data: href, success: () => uni.showToast({ title: '名片链接已复制', icon: 'success' }) });
}
function locateInMarket() {
  uni.navigateTo({ url: '/pages/card/market' });
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
const goConnections = () => uni.navigateTo({ url: '/pages/card/connections' });
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
</script>

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
