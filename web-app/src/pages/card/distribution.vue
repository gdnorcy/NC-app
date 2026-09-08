<template>
  <view class="dist-page">
    <!-- 顶部身份切换 + 收益汇总 -->
    <view class="hero g3" :style="heroStyle">
      <view class="row1">
        <view class="hero-left">
          <view class="hero-title">分销中心</view>
          <view class="hero-sub">{{ identityLabel }} · 收益数据完全隔离</view>
        </view>
        <view class="id-switch" @click="switchIdentity">
          <SIcon name="exchange" size="small" color="#ffffff" />
          <text>{{ identityLabel }}</text>
        </view>
      </view>
      <view class="wallet-grid">
        <view class="w-cell"><view class="w-label">可提现(元)</view><view class="w-val">{{ fen(summary.wallet?.available) }}</view></view>
        <view class="w-cell"><view class="w-label">待结算(元)</view><view class="w-val">{{ fen(summary.wallet?.waitSettle) }}</view></view>
        <view class="w-cell"><view class="w-label">累计收益(元)</view><view class="w-val">{{ fen(summary.wallet?.totalIncome) }}</view></view>
        <view class="w-cell"><view class="w-label">累计提现(元)</view><view class="w-val">{{ fen(summary.wallet?.totalWithdraw) }}</view></view>
      </view>
    </view>

    <!-- 无权限提示 -->
    <view v-if="summary.unbound" class="tip-box">
      当前暂无分销/分红权限，入驻租户并绑定推广关系后可查看收益
    </view>

    <!-- 分销资格申请（门槛=2 指定名单：申请 → 租户后台审核） -->
    <view v-else-if="summary.gate === 2 && !summary.inWhitelist" class="apply-box">
      <view class="apply-row">
        <view class="apply-txt">
          <text v-if="summary.applyStatus === 'pending'" class="apply-title">申请审核中</text>
          <text v-else-if="summary.applyStatus === 'rejected'" class="apply-title">申请被驳回</text>
          <text v-else class="apply-title">成为分销商</text>
          <view class="apply-desc">
            <text v-if="summary.applyStatus === 'pending'">租户审核通过后自动获得推广佣金资格</text>
            <text v-else-if="summary.applyStatus === 'rejected'">驳回原因：{{ summary.rejectReason || '未填写' }}</text>
            <text v-else>当前为指定名单门槛，需申请通过后才能获得推广佣金</text>
          </view>
        </view>
        <button
          v-if="summary.canApply"
          class="apply-btn"
          :disabled="applying"
          @click="submitApply"
        >{{ summary.applyStatus === 'rejected' ? '重新申请' : '申请成为分销商' }}</button>
        <text v-else-if="summary.applyStatus === 'pending'" class="apply-wait">等待审核</text>
      </view>
    </view>

    <!-- 门槛=1 付费用户：未付费提示 -->
    <view v-else-if="summary.gate === 1 && !summary.inWhitelist" class="tip-box">
      当前为付费门槛：完成任意付费订单后自动获得分销资格
    </view>

    <!-- 推广模块 -->
    <view class="sec-t">我的推广</view>
    <view class="stat-cards">
      <view class="s-card"><view class="s-num">{{ summary.directCount }}</view><view class="s-lb">直推下级</view></view>
      <view class="s-card"><view class="s-num">{{ summary.indirectCount }}</view><view class="s-lb">间推下级</view></view>
      <view class="s-card"><view class="s-num">{{ summary.monthNew }}</view><view class="s-lb">本月新增</view></view>
      <view class="s-card"><view class="s-num">{{ fen(summary.monthCommission) }}</view><view class="s-lb">本月佣金(元)</view></view>
    </view>
    <view class="qrcode-box">
      <button class="mini-btn" @click="openQr">我的推广二维码</button>
      <button class="mini-btn ghost" @click="copyShareUrl">复制推广链接</button>
      <text class="qrcode-tip">把名片分享给客户，客户扫码进入后自动绑定上下级，付费即可获取推广佣金</text>
    </view>

    <!-- 下级客户列表（直推/间推） -->
    <view class="sub-box">
      <view class="sub-tabs">
        <view class="sub-tab" :class="subLevel === 1 ? 'on' : ''" @click="switchSubLevel(1)">直推客户</view>
        <view class="sub-tab" :class="subLevel === 2 ? 'on' : ''" @click="switchSubLevel(2)">间推客户</view>
        <view class="sub-count">{{ subTotal }}</view>
      </view>
      <view v-if="subLoading" class="sub-empty">加载中…</view>
      <view v-else-if="!subs.length" class="sub-empty">还没有通过你的名片带来的客户，多多分享名片即可获得客户</view>
      <view v-else class="sub-list">
        <view v-for="s in subs" :key="s.userId" class="sub-item" @click="goSubCard(s.userId)">
          <image v-if="s.avatar" class="sub-avatar" :src="s.avatar" mode="aspectFill" />
          <view v-else class="sub-avatar placeholder">{{ (s.nickname || '客')[0] }}</view>
          <view class="sub-info">
            <view class="sub-name">{{ s.nickname }}<text v-if="s.paid" class="sub-paid">已付费</text></view>
            <view class="sub-time">绑定 {{ s.bindTime }}</view>
          </view>
          <view class="sub-arrow">›</view>
        </view>
      </view>
    </view>

    <!-- 推广二维码弹层 -->
    <view v-if="qr.show" class="qr-mask" @click="qr.show = false">
      <view class="qr-panel" @click.stop>
        <view class="qr-title">我的推广二维码</view>
        <image v-if="qr.dataUrl" class="qr-img" :src="qr.dataUrl" mode="aspectFit" />
        <view v-else class="qr-loading">二维码生成中…</view>
        <view class="qr-hint">客户扫码进入我的名片，首次进入自动绑定为我的下级</view>
        <button class="mini-btn" @click="copyShareUrl">复制推广链接</button>
        <button class="mini-btn ghost" @click="qr.show = false">关闭</button>
      </view>
    </view>

    <!-- 合伙人模块（插件启用 + 本人为合伙人才显示） -->
    <template v-if="summary.isPartner">
      <view class="sec-t">合伙人收益</view>
      <view class="stat-cards">
        <view class="s-card"><view class="s-num">{{ fen(summary.partnerPending) }}</view><view class="s-lb">待分红(元)</view></view>
        <view class="s-card"><view class="s-num">{{ fen(summary.partnerTotal) }}</view><view class="s-lb">累计分红(元)</view></view>
        <view class="s-card"><view class="s-num">{{ summary.shareTags.filter((t) => t.includes('合伙人')).length ? '是' : '-' }}</view><view class="s-lb">合伙人身份</view></view>
      </view>
    </template>

    <!-- 股东中心模块（任意股东插件启用即渲染） -->
    <view class="sec-t">股东中心</view>
    <view v-if="summary.shareTags.length" class="tag-list">
      <view v-for="t in summary.shareTags" :key="t" class="tag">{{ t }}</view>
    </view>
    <view v-else class="tip-box">暂未获得股东身份，可以向租户管理员申请开通</view>
    <view class="stat-cards">
      <view class="s-card"><view class="s-num">{{ fen(summary.sharePending) }}</view><view class="s-lb">股东待分红(元)</view></view>
      <view class="s-card"><view class="s-num">{{ fen(summary.shareTotal) }}</view><view class="s-lb">股东累计分红(元)</view></view>
    </view>

    <!-- 收益明细 -->
    <view class="sec-t">收益明细</view>
    <view class="tabs">
      <view v-for="t in logTabs" :key="t.key" class="tab" :class="{ on: logType === t.key }" @click="switchLog(t.key)">{{ t.label }}</view>
    </view>
    <view class="log-list">
      <view v-for="l in logs" :key="l.id" class="log-item">
        <view class="log-top">
          <text class="log-type">{{ logTypeLabel(l.type) }}</text>
          <text class="log-amt" :class="{ neg: l.status === 'charged_back' }">{{ l.status === 'charged_back' ? '-' : '+' }}{{ fen(l.amount) }}</text>
        </view>
        <view class="log-mid">
          <text class="log-no">{{ l.order_no }}</text>
          <text class="log-st" :class="stCls(l.status)">{{ statusLabel(l.status) }}</text>
        </view>
        <view class="log-bot">
          <text>{{ l.created_at }}</text>
          <text v-if="l.remark" class="log-rm">{{ l.remark }}</text>
        </view>
      </view>
      <view v-if="!logs.length" class="empty">还没有产生收益，客户付费升级套餐后收益会在这里展示</view>
    </view>

    <!-- 提现中心 -->
    <view class="sec-t">提现中心</view>
    <view class="withdraw-box">
      <view class="wd-row">
        <text class="wd-label">可提现余额</text>
        <text class="wd-val">{{ fen(summary.wallet?.available) }} 元</text>
      </view>
      <view class="wd-input-row">
        <text class="wd-label">提现金额(元)</text>
        <input class="wd-input" type="digit" v-model="withdrawAmount" placeholder="输入提现金额" />
      </view>
      <button class="primary-btn" :disabled="withdrawing" @click="applyWithdraw">申请提现</button>
    </view>
    <view class="withdraw-list">
      <view v-for="w in withdraws" :key="w.id" class="wd-item">
        <view class="wd-top">
          <text class="wd-no">{{ w.withdraw_no }}</text>
          <text class="wd-status" :class="wdCls(w.status)">{{ withdrawLabel(w.status) }}</text>
        </view>
        <view class="wd-mid">提现 {{ fen(w.amount) }} 元 · 手续费 {{ fen(w.service_fee) }} · 实到 {{ fen(w.actual_amount) }}</view>
        <view v-if="w.status === 'rejected' && w.reject_reason" class="wd-reason">驳回原因：{{ w.reject_reason }}</view>
      </view>
      <view v-if="!withdraws.length" class="empty">暂无提现记录</view>
    </view>

    <CardTabBar active="member" />
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { heroGradient } from '../../utils/color.js';
import { trackPageView } from '../../utils/analytics.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';

const brandColor = ref('');
const heroStyle = computed(() => ({ background: heroGradient(brandColor.value, 'linear-gradient(155deg, #0f766e, #14b8a6)') }));
const identity = ref('individual');
const identityLabel = computed(() => (identity.value === 'employee' ? '企业员工身份' : '入驻个人身份'));
const summary = ref({ wallet: null, directCount: 0, indirectCount: 0, monthCommission: 0, monthNew: 0, unbound: false, isPartner: false, shareTags: [], partnerPending: 0, partnerTotal: 0, sharePending: 0, shareTotal: 0, gate: 0, inWhitelist: false, canApply: false, applyStatus: null, rejectReason: '' });
const applying = ref(false);

async function submitApply() {
  if (applying.value) return;
  applying.value = true;
  try {
    const res = await cardApi.distApply();
    if (!res || res.ok === false) { uni.showToast({ title: (res && res.error) || '申请失败', icon: 'none' }); return; }
    await loadSummary();
    uni.showToast({ title: '申请已提交，等待审核', icon: 'none' });
  } catch (e) { uni.showToast({ title: e || '申请失败', icon: 'none' }); } finally { applying.value = false; }
}
const logs = ref([]);
const withdraws = ref([]);
const subs = ref([]);
const subLevel = ref(1);
const subTotal = ref(0);
const subPage = ref(1);
const subLoading = ref(false);
const logType = ref('');
const logTabs = [
  { key: '', label: '全部' },
  { key: 'level1', label: '推广佣金' },
  { key: 'partner', label: '合伙人分红' },
  { key: 'share_all', label: '股东分红' },
];
const withdrawAmount = ref('');
const withdrawing = ref(false);

async function loadAll() {
  try {
    summary.value = await cardApi.distSummary(identity.value);
  } catch (e) {
    summary.value = { wallet: null, directCount: 0, indirectCount: 0, monthCommission: 0, monthNew: 0, unbound: true };
  }
  loadLogs();
  loadWithdraws();
  loadSubs();
}

async function loadSubs() {
  if (summary.value.unbound) return;
  subLoading.value = true;
  try {
    const res = await cardApi.distSubs(subLevel.value, subPage.value);
    subs.value = res.list || [];
    subTotal.value = res.total || 0;
  } catch (e) { subs.value = []; } finally { subLoading.value = false; }
}
function switchSubLevel(lv) {
  if (subLevel.value === lv) return;
  subLevel.value = lv;
  subPage.value = 1;
  loadSubs();
}
function goSubCard(uid) {
  uni.navigateTo({ url: `/pages/card/cardDetail?id=${uid}` });
}

async function loadLogs() {
  try {
    const res = await cardApi.distLogs({ page: 1, pageSize: 20, type: logType.value, identityType: identity.value });
    logs.value = res.list || [];
  } catch (e) { logs.value = []; }
}

async function loadWithdraws() {
  try {
    const res = await cardApi.distWithdraws({ page: 1, pageSize: 20, identityType: identity.value });
    withdraws.value = res.list || [];
  } catch (e) { withdraws.value = []; }
}

function switchLog(key) {
  logType.value = key;
  loadLogs();
}

function switchIdentity() {
  identity.value = identity.value === 'individual' ? 'employee' : 'individual';
  loadAll();
}

async function applyWithdraw() {
  const amt = Number(withdrawAmount.value);
  if (!amt || amt <= 0) { uni.showToast({ title: '请输入提现金额', icon: 'none' }); return; }
  withdrawing.value = true;
  try {
    await cardApi.distWithdraw(amt, identity.value);
    uni.showToast({ title: '提现申请已提交', icon: 'success' });
    withdrawAmount.value = '';
    loadAll();
  } catch (e) {
    uni.showToast({ title: e.message || '提现失败', icon: 'none' });
  } finally { withdrawing.value = false; }
}

function shareCard() {
  // 分享自己名片（简化：跳我的名片，用户自行分享）
  uni.switchTab({ url: '/pages/card/myCard' }).catch(() => {
    uni.navigateTo({ url: '/pages/card/myCard?id=' + (uni.getStorageSync('card_user')?.id || '') });
  });
}

const qr = ref({ show: false, dataUrl: '', shareUrl: '' });
async function openQr() {
  if (qr.dataUrl) { qr.show = true; return; }
  try {
    const res = await cardApi.distQrcode();
    qr.value = { show: true, dataUrl: res.qrDataUrl, shareUrl: res.shareUrl };
  } catch (e) {
    uni.showToast({ title: e.message || '二维码生成失败', icon: 'none' });
  }
}
async function copyShareUrl() {
  if (!qr.value.shareUrl) {
    try {
      const res = await cardApi.distQrcode();
      qr.value = { show: qr.value.show, dataUrl: res.qrDataUrl, shareUrl: res.shareUrl };
    } catch (e) { uni.showToast({ title: e.message || '生成失败', icon: 'none' }); return; }
  }
  try {
    await uni.setClipboardData({ data: qr.value.shareUrl });
    uni.showToast({ title: '推广链接已复制', icon: 'success' });
  } catch (e) {}
}

function fen(v) { return ((Number(v) || 0) / 100).toFixed(2); }
function logTypeLabel(t) { return { level1: '推广佣金', level2: '推广佣金', partner: '合伙人分红', share_all: '全民股东', share_cat: '类目股东', share_area: '区域股东' }[t] || t || '-'; }
function statusLabel(s) { return { pending: '待结算', settled: '已结算', charged_back: '已扣回' }[s] || s; }
function stCls(s) { return { pending: 'st-p', settled: 'st-s', charged_back: 'st-c' }[s] || ''; }
function withdrawLabel(s) { return { pending: '待审核', approved: '待打款', rejected: '已驳回', done: '已完成' }[s] || s; }
function wdCls(s) { return { pending: 'st-p', approved: 'st-s', rejected: 'st-c', done: 'st-d' }[s] || ''; }

onShow(() => {
  trackPageView('distribution');
  loadAll();
});
</script>

<style scoped>
.dist-page { min-height: 100vh; background: #f7f8fa; padding-bottom: 40px; }
.hero { padding: 24px 20px 16px; }
.row1 { display: flex; justify-content: space-between; align-items: center; }
.hero-title { font-size: 22px; font-weight: 700; color: #fff; }
.hero-sub { font-size: 12px; color: rgba(255,255,255,0.85); margin-top: 4px; }
.id-switch { display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.18); border-radius: 20px; padding: 6px 12px; color: #fff; font-size: 12px; }
.wallet-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.w-cell { flex: 1 1 45%; background: rgba(255,255,255,0.14); border-radius: 10px; padding: 10px 12px; }
.w-label { font-size: 11px; color: rgba(255,255,255,0.8); }
.w-val { font-size: 18px; font-weight: 600; color: #fff; margin-top: 2px; }
.sec-t { font-size: 15px; font-weight: 600; color: #1d2129; margin: 16px 20px 10px; }
.stat-cards { display: flex; gap: 10px; margin: 0 20px; }
.s-card { flex: 1; background: #fff; border-radius: 10px; padding: 14px 0; text-align: center; }
.s-num { font-size: 20px; font-weight: 700; color: #165dff; }
.s-lb { font-size: 11px; color: #86909c; margin-top: 2px; }
.qrcode-box { margin: 12px 20px 0; background: #fff; border-radius: 10px; padding: 14px; }
.mini-btn { background: #165dff; color: #fff; border-radius: 8px; font-size: 14px; height: 40px; line-height: 40px; }
.mini-btn.ghost { background: #f2f3f5; color: #1d2129; margin-left: 10px; }
.qrcode-tip { display: block; font-size: 11px; color: #86909c; margin-top: 8px; }
.sub-box { background: #fff; border-radius: 10px; padding: 12px; margin-top: 12px; }
.sub-tabs { display: flex; align-items: center; gap: 16px; }
.sub-tab { font-size: 14px; color: #86909c; padding: 4px 0; position: relative; }
.sub-tab.on { color: #165dff; font-weight: 600; }
.sub-tab.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: -4px; height: 2px; background: #165dff; border-radius: 1px; }
.sub-count { margin-left: auto; font-size: 12px; color: #86909c; }
.sub-empty { padding: 24px 0; text-align: center; font-size: 12px; color: #86909c; }
.sub-list { margin-top: 8px; }
.sub-item { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f2f3f5; }
.sub-item:last-child { border-bottom: none; }
.sub-avatar { width: 38px; height: 38px; border-radius: 50%; background: #e8f3ff; flex-shrink: 0; }
.sub-avatar.placeholder { display: flex; align-items: center; justify-content: center; color: #165dff; font-size: 16px; font-weight: 600; }
.sub-info { flex: 1; min-width: 0; }
.sub-name { font-size: 14px; color: #1d2129; font-weight: 500; display: flex; align-items: center; gap: 6px; }
.sub-paid { font-size: 10px; color: #fff; background: #00b42a; border-radius: 4px; padding: 1px 5px; }
.sub-time { font-size: 11px; color: #86909c; margin-top: 3px; }
.sub-arrow { color: #c9cdd4; font-size: 18px; }
.qr-mask { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 999; display: flex; align-items: center; justify-content: center; }
.qr-panel { width: 300px; background: #fff; border-radius: 14px; padding: 24px 20px 20px; text-align: center; }
.qr-title { font-size: 16px; font-weight: 600; color: #1d2129; margin-bottom: 14px; }
.qr-img { width: 220px; height: 220px; margin: 0 auto; }
.qr-loading { height: 220px; line-height: 220px; color: #86909c; font-size: 13px; }
.qr-hint { font-size: 12px; color: #86909c; margin: 10px 0 14px; }
.tabs { display: flex; gap: 8px; margin: 0 20px 10px; }
.tab { padding: 6px 14px; border-radius: 16px; background: #fff; color: #4e5969; font-size: 13px; }
.tab.on { background: #165dff; color: #fff; }
.log-list, .withdraw-list { margin: 0 20px; background: #fff; border-radius: 10px; padding: 4px 14px; }
.log-item, .wd-item { padding: 12px 0; border-bottom: 1px solid #f2f3f5; }
.log-top, .wd-top { display: flex; justify-content: space-between; align-items: center; }
.log-type { font-size: 14px; color: #1d2129; font-weight: 500; }
.log-amt { font-size: 15px; font-weight: 600; color: #07c160; }
.log-amt.neg { color: #f53f3f; }
.log-mid { display: flex; justify-content: space-between; margin-top: 4px; }
.log-no { font-size: 11px; color: #86909c; }
.log-st { font-size: 11px; }
.st-p { color: #ff7d00; } .st-s { color: #07c160; } .st-c { color: #f53f3f; } .st-d { color: #165dff; }
.log-bot { display: flex; flex-direction: column; margin-top: 4px; font-size: 11px; color: #86909c; }
.log-rm { margin-top: 2px; color: #ff7d00; }
.empty { padding: 24px 0; text-align: center; font-size: 12px; color: #86909c; }
.tip-box { margin: 12px 20px 0; background: #fff7e8; border: 1px solid #ffd666; color: #ad6800; border-radius: 10px; padding: 12px; font-size: 13px; }
.apply-box { margin: 12px 20px 0; background: #f0f7ff; border: 1px solid #b3d6ff; border-radius: 10px; padding: 12px 14px; }
.apply-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.apply-txt { flex: 1; min-width: 0; }
.apply-title { font-size: 14px; font-weight: 600; color: #165dff; }
.apply-desc { font-size: 12px; color: #4e5969; margin-top: 4px; line-height: 1.5; }
.apply-btn { background: #165dff; color: #fff; border-radius: 8px; font-size: 13px; height: 36px; line-height: 36px; padding: 0 14px; flex-shrink: 0; }
.apply-btn[disabled] { opacity: 0.6; }
.apply-wait { font-size: 12px; color: #86909c; flex-shrink: 0; }
.tag-list { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 20px 0; }
.tag { background: rgba(22, 93, 255, 0.08); color: #165dff; border: 1px solid rgba(22, 93, 255, 0.2); border-radius: 999px; padding: 4px 12px; font-size: 12px; }
.withdraw-box { margin: 0 20px; background: #fff; border-radius: 10px; padding: 14px; }
.wd-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
.wd-label { font-size: 13px; color: #4e5969; }
.wd-val { font-size: 14px; font-weight: 600; color: #1d2129; }
.wd-input-row { display: flex; align-items: center; margin-bottom: 12px; }
.wd-input { flex: 1; border: 1px solid #e5e6eb; border-radius: 8px; padding: 8px 10px; font-size: 14px; }
.primary-btn { background: #165dff; color: #fff; border-radius: 8px; height: 44px; line-height: 44px; font-size: 15px; }
.primary-btn[disabled] { opacity: 0.6; }
.wd-no { font-size: 12px; color: #1d2129; }
.wd-status { font-size: 12px; }
.wd-mid { font-size: 11px; color: #86909c; margin-top: 4px; }
.wd-reason { font-size: 11px; color: #f53f3f; margin-top: 4px; }
</style>
