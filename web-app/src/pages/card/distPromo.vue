<template>
  <view class="dist-page">
    <!-- 顶部主视觉卡：用户信息 + 上级推广员 + 已邀请 + 业绩双栏 + 佣金区 -->
    <view class="hero g3" :style="heroStyle">
      <view class="hero-top">
        <view class="hero-title">推广中心</view>
        <view class="hero-top-r">
          <view class="rule-link" @click="showRules = true"><SIcon name="audit" size="small" color="#ffffff" /><text>规则</text></view>
          <view class="id-switch" @click="switchIdentity"><SIcon name="exchange" size="small" color="#ffffff" /><text>{{ identityLabel }}</text></view>
        </view>
      </view>
      <!-- 用户信息 -->
      <view class="user-row">
        <view class="user-left">
          <view class="user-line">
            <image v-if="summary.selfAvatar" class="user-avatar" :src="summary.selfAvatar" mode="aspectFill" />
            <view v-else class="user-avatar placeholder">{{ (summary.selfName || '我')[0] }}</view>
            <view class="user-name">{{ summary.selfName || '我' }}</view>
            <view class="user-level">{{ summary.defaultLevel || '默认等级' }}</view>
          </view>
          <view v-if="summary.showParent && summary.parent" class="user-parent">上级推广员：{{ summary.parent.nickname || '-' }}</view>
          <view class="user-invited" @click="scrollTo('subs')">已邀请成功：{{ summary.directCount }}人 ›</view>
        </view>
      </view>
      <!-- 业绩双栏：今日 / 累计（累计可点开明细弹层） -->
      <view class="perf-row">
        <view class="perf-col">
          <view class="perf-title">今日业绩</view>
          <view class="perf-num">{{ fen(summary.todayCommission) }}</view>
          <view class="perf-sub">{{ summary.todayOrder }}单 · 新增{{ summary.todayNew }}人</view>
        </view>
        <view class="perf-divider"></view>
        <view class="perf-col" @click="showTotal = true">
          <view class="perf-title">累计业绩 ›</view>
          <view class="perf-num">{{ fen(summary.totalCommission) }}</view>
          <view class="perf-sub">直推{{ summary.directCount }} · 间推{{ summary.indirectCount }}</view>
        </view>
      </view>
      <!-- 佣金区：可提现大字 + 提现中/待入账 + 提现 -->
      <view class="money-row">
        <view class="money-left">
          <view class="money-label">可提现佣金（元）</view>
          <view class="money-val">{{ fen(summary.wallet?.available) }}</view>
          <view class="money-sub">
            <text class="m-sub-item">提现中 {{ fen(summary.withdrawing) }}</text>
            <text class="m-sub-item">待入账 {{ fen(summary.wallet?.waitSettle) }}</text>
          </view>
        </view>
        <view class="money-right">
          <view class="wd-detail-link" @click="goWallet">提现明细 ›</view>
          <view class="withdraw-btn" @click="goWallet">提现</view>
        </view>
      </view>
    </view>

    <!-- 无权限提示 -->
    <view v-if="summary.unbound" class="tip-box">
      当前暂无分销权限，入驻租户并绑定推广关系后可查看收益
    </view>

    <!-- 分销资格申请 / 门槛提示 -->
    <view v-else-if="(summary.gate === 1 || summary.gate === 2) && !summary.inWhitelist" class="apply-box">
      <image v-if="summary.applyTopImg" class="apply-img" :src="summary.applyTopImg" mode="widthFix" />
      <view class="apply-row">
        <view class="apply-txt">
          <text v-if="summary.applyStatus === 'pending'" class="apply-title">申请审核中</text>
          <text v-else-if="summary.applyStatus === 'rejected'" class="apply-title">申请被驳回</text>
          <text v-else class="apply-title">成为{{ summary.distName || '分销商' }}</text>
          <view class="apply-desc">
            <text v-if="summary.applyStatus === 'pending'">{{ summary.gate === 1 ? '申请已自动通过，可开始推广' : '租户审核通过后自动获得推广佣金资格' }}</text>
            <text v-else-if="summary.applyStatus === 'rejected'">驳回原因：{{ summary.rejectReason || '未填写' }}</text>
            <text v-else>{{ summary.applyTip || (summary.gate === 1 ? '提交申请后自动成为分销商' : '当前为申请制，需通过后才能获得推广佣金') }}</text>
          </view>
        </view>
        <button
          v-if="summary.canApply"
          class="apply-btn"
          :disabled="applying || (!!summary.applyAgreement && !agreed)"
          @click="submitApply"
        >{{ summary.applyStatus === 'rejected' ? '重新申请' : '申请成为' + (summary.distName || '分销商') }}</button>
        <text v-else-if="summary.applyStatus === 'pending'" class="apply-wait">等待审核</text>
      </view>
      <view v-if="summary.applyAgreement" class="apply-agreement">
        <view class="agreement-box">
          <rich-text :nodes="summary.applyAgreement" />
        </view>
        <label class="agreement-check" @click="agreed = !agreed">
          <radio :checked="agreed" color="#165DFF" style="transform: scale(0.75)" />
          <text>我已阅读并同意以上协议</text>
        </label>
      </view>
    </view>
    <view v-else-if="(summary.gate === 3 || summary.gate === 4 || summary.gate === 5) && !summary.inWhitelist" class="tip-box">
      <text v-if="summary.gate === 3">当前为消费门槛：累计实付满 {{ fen(summary.becomeAmount * 100) }} 元后自动获得分销资格</text>
      <text v-else-if="summary.gate === 4">当前为购买门槛：完成任意付费订单后自动获得分销资格</text>
      <text v-else>当前为指定商品门槛：购买指定商品并支付完成后自动获得分销资格</text>
    </view>

    <!-- 显示上级 -->
    <view v-if="summary.showParent && summary.parent" class="parent-box">
      <view class="parent-lb">我的上级推荐人</view>
      <image v-if="summary.parent.avatar" class="parent-avatar" :src="summary.parent.avatar" mode="aspectFill" />
      <view v-else class="parent-avatar placeholder">{{ (summary.parent.nickname || '上')[0] }}</view>
      <view class="parent-name">{{ summary.parent.nickname }}</view>
      <view class="parent-tag">{{ summary.defaultLevel || '默认等级' }}</view>
    </view>

    <!-- 生成专属邀请码（渐变模块） -->
    <view class="invite-box g3" :style="heroStyle">
      <view class="invite-left">
        <view class="invite-title">生成专属邀请码</view>
        <view class="invite-desc">分享名片给客户，绑定后付费即可获得佣金</view>
        <view class="invite-btns">
          <button class="mini-btn invite-btn" @click="openQr">推广二维码</button>
          <button class="mini-btn invite-btn solid" @click="openPoster">生成海报</button>
          <button class="mini-btn invite-btn ghost" @click="copyShareUrl">复制链接</button>
        </view>
      </view>
      <view class="invite-right" @click="openQr">
        <view class="deco-qr">
          <view v-for="n in 49" :key="n" class="dqr-cell" :class="qrCellCls(n)" />
        </view>
      </view>
    </view>

    <!-- 直推/间推统计卡 -->
    <view id="anchor-subs" class="sec-t">我的下线</view>
    <view class="stat-cards">
      <view class="s-card"><view class="s-num">{{ summary.directCount }}</view><view class="s-lb">直推{{ summary.subName || '下级' }}</view></view>
      <view class="s-card"><view class="s-num">{{ summary.indirectCount }}</view><view class="s-lb">间推{{ summary.subName || '下级' }}</view></view>
      <view class="s-card"><view class="s-num">{{ summary.monthNew }}</view><view class="s-lb">本月新增</view></view>
      <view class="s-card"><view class="s-num">{{ fen(summary.monthCommission) }}</view><view class="s-lb">本月佣金(元)</view></view>
    </view>

    <!-- 下级客户列表 -->
    <view class="sub-box">
      <view class="sub-tabs">
        <view class="sub-tab" :class="subLevel === 1 ? 'on' : ''" @click="switchSubLevel(1)">直推{{ summary.subName || '下级' }}</view>
        <view class="sub-tab" :class="subLevel === 2 ? 'on' : ''" @click="switchSubLevel(2)">间推{{ summary.subName || '下级' }}</view>
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
            <view class="sub-time">绑定 {{ s.bindTime }}<text v-if="summary.showPhone && s.phone" class="sub-phone"> · {{ s.phone }}</text></view>
          </view>
          <view class="sub-arrow">›</view>
        </view>
      </view>
    </view>

    <!-- 推广佣金明细 -->
    <view id="anchor-logs" class="sec-t">推广佣金明细</view>
    <view class="tabs">
      <view v-for="t in logTabs" :key="t.key" class="tab" :class="{ on: logType === t.key }" @click="switchLog(t.key)">{{ t.label }}</view>
    </view>
    <view class="log-list">
      <view v-for="l in logs" :key="l.id" class="log-item">
        <view class="log-top">
          <text class="log-type">{{ l.typeLabel }}</text>
          <text class="log-amt" :class="{ neg: l.status === 'charged_back' }">{{ l.status === 'charged_back' ? '-' : '+' }}{{ fen(l.amount) }}</text>
        </view>
        <view class="log-mid">
          <text class="log-no">{{ l.orderNo }}</text>
          <text class="log-st" :class="stCls(l.status)">{{ l.statusLabel }}</text>
        </view>
        <view class="log-bot">
          <text>{{ l.createdAt }}</text>
          <text v-if="l.remark" class="log-rm">{{ l.remark }}</text>
        </view>
      </view>
      <view v-if="!logs.length" class="empty">还没有产生收益，客户付费升级套餐后收益会在这里展示</view>
    </view>

    <!-- 累计业绩弹层 -->
    <view v-if="showTotal" class="qr-mask" @click="showTotal = false">
      <view class="qr-panel" @click.stop>
        <view class="qr-title">累计业绩</view>
        <view class="total-grid">
          <view class="t-card"><view class="t-num">{{ fen(summary.totalCommission) }}</view><view class="t-lb">累计佣金(元)</view></view>
          <view class="t-card"><view class="t-num">{{ summary.totalOrders }}</view><view class="t-lb">累计带来订单</view></view>
          <view class="t-card"><view class="t-num">{{ summary.directCount }}</view><view class="t-lb">直推{{ summary.subName || '下级' }}</view></view>
          <view class="t-card"><view class="t-num">{{ summary.indirectCount }}</view><view class="t-lb">间推{{ summary.subName || '下级' }}</view></view>
          <view class="t-card"><view class="t-num">{{ summary.monthNew }}</view><view class="t-lb">本月新增</view></view>
          <view class="t-card"><view class="t-num">{{ fen(summary.monthCommission) }}</view><view class="t-lb">本月佣金(元)</view></view>
        </view>
        <button class="mini-btn ghost" @click="showTotal = false">关闭</button>
      </view>
    </view>

    <!-- 推广二维码弹层 -->
    <view v-if="qr.show" class="qr-mask" @click="qr.show = false">
      <view class="qr-panel" @click.stop>
        <image v-if="summary.shareImg" class="qr-shareimg" :src="summary.shareImg" mode="aspectFill" />
        <view class="qr-title">{{ summary.shareTitle || '我的推广二维码' }}</view>
        <image v-if="qr.dataUrl" class="qr-img" :src="qr.dataUrl" mode="aspectFit" />
        <view v-else class="qr-loading">二维码生成中…</view>
        <view class="qr-hint">客户扫码进入我的名片，首次进入自动绑定为我的下级</view>
        <button class="mini-btn" @click="copyShareUrl">复制推广链接</button>
        <button class="mini-btn ghost" @click="qr.show = false">关闭</button>
      </view>
    </view>

    <!-- 业务规则 -->
    <view v-if="showRules" class="qr-mask" @click="showRules = false">
      <view class="qr-panel rules-panel" @click.stop>
        <view class="qr-title">业务规则</view>
        <scroll-view scroll-y class="rules-scroll">
          <rich-text v-if="summary.distNotice" :nodes="summary.distNotice" />
          <view v-else class="rules-text">
            <view class="rule-p">· 一级{{ summary.subName || '下级' }}付费订单产生一级推广佣金，比例为 {{ fmtRatio(summary.ratio1) }}</view>
            <view class="rule-p">· 二级{{ summary.subName || '下级' }}付费订单产生二级推广佣金，比例为 {{ fmtRatio(summary.ratio2) }}</view>
            <view class="rule-p">· 收益按订单实付金额计算，订单售后退款会扣回对应收益</view>
            <view class="rule-p">· 订单完成后进入 {{ summary.settleDay || 7 }} 天结算周期，期满后可提现</view>
          </view>
        </scroll-view>
        <button class="mini-btn ghost" @click="showRules = false">关闭</button>
      </view>
    </view>

    <!-- 分享海报 -->
    <view v-if="poster.show" class="qr-mask" @click="poster.show = false">
      <view class="qr-panel poster-panel" @click.stop>
        <view class="qr-title">分享海报</view>
        <view class="poster-canvas-box">
          <canvas canvas-id="dist-poster" id="dist-poster" class="poster-canvas" />
        </view>
        <button class="mini-btn" :disabled="poster.saving" @click="savePoster">{{ poster.saving ? '生成中…' : '保存海报' }}</button>
        <button class="mini-btn ghost" @click="poster.show = false">关闭</button>
      </view>
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
const summary = ref({ wallet: null, directCount: 0, indirectCount: 0, monthCommission: 0, monthNew: 0, todayCommission: 0, todayOrder: 0, todayNew: 0, totalCommission: 0, totalOrders: 0, withdrawing: 0, selfName: '我', selfAvatar: '', unbound: false, gate: 0, inWhitelist: false, canApply: false, applyStatus: null, rejectReason: '', distName: '推广员', subName: '下级', applyTopImg: '', applyTip: '', shareTitle: '', shareImg: '', applyAgreement: '', distNotice: '', ratio1: 0.2, ratio2: 0.05, settleDay: 7, showPhone: false, becomeAmount: 0, showParent: false, parent: null });

const showRules = ref(false);
const showTotal = ref(false);
const applying = ref(false);
const agreed = ref(false);
const fmtRatio = (v) => (Math.round((Number(v) || 0) * 1000) / 10) + '%';

const QR_PATTERN = [
  1,1,1,0,1,1,1,
  1,0,1,0,1,0,1,
  1,1,1,0,1,1,1,
  0,0,0,1,0,0,0,
  1,0,1,1,1,0,1,
  1,1,0,0,1,1,0,
  0,1,1,0,0,1,1,
];
function qrCellCls(n) { return QR_PATTERN[n - 1] ? 'on' : ''; }
function scrollTo(anchor) { uni.pageScrollTo({ selector: `#anchor-${anchor}`, duration: 300 }); }

const logs = ref([]);
const subs = ref([]);
const subLevel = ref(1);
const subTotal = ref(0);
const subPage = ref(1);
const subLoading = ref(false);
const logType = ref('');
const logTabs = [
  { key: '', label: '全部' },
  { key: 'level1', label: '一级佣金' },
  { key: 'level2', label: '二级佣金' },
];

async function loadAll() {
  try {
    summary.value = await cardApi.distSummary(identity.value);
  } catch (e) {
    summary.value = { wallet: null, directCount: 0, indirectCount: 0, monthCommission: 0, monthNew: 0, todayCommission: 0, todayOrder: 0, todayNew: 0, totalCommission: 0, totalOrders: 0, withdrawing: 0, selfName: '我', selfAvatar: '', unbound: true };
  }
  loadLogs();
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
function goSubCard(uid) { uni.navigateTo({ url: `/pages/card/cardDetail?id=${uid}` }); }

async function loadLogs() {
  try {
    const res = await cardApi.distLogs({ page: 1, pageSize: 20, type: logType.value, identityType: identity.value });
    logs.value = res.list || [];
  } catch (e) { logs.value = []; }
}
function switchLog(key) { logType.value = key; loadLogs(); }

function switchIdentity() {
  identity.value = identity.value === 'individual' ? 'employee' : 'individual';
  loadAll();
}

async function submitApply() {
  if (applying.value) return;
  if (summary.value.applyAgreement && !agreed.value) {
    uni.showToast({ title: '请先阅读并勾选申请协议', icon: 'none' });
    return;
  }
  applying.value = true;
  try {
    const res = await cardApi.distApply();
    if (!res || res.ok === false) { uni.showToast({ title: (res && res.error) || '申请失败', icon: 'none' }); return; }
    await loadAll();
    uni.showToast({ title: summary.value.gate === 1 ? '申请成功，已自动通过' : '申请已提交，等待审核', icon: 'none' });
  } catch (e) { uni.showToast({ title: e || '申请失败', icon: 'none' }); } finally { applying.value = false; }
}

const qr = ref({ show: false, dataUrl: '', shareUrl: '' });
const poster = ref({ show: false, saving: false, tempPath: '' });

async function openQr() {
  if (!qr.value.shareUrl) {
    try {
      const res = await cardApi.distQrcode();
      if (res && res.qrDataUrl) qr.value = { show: true, dataUrl: res.qrDataUrl, shareUrl: res.shareUrl };
    } catch (e) { uni.showToast({ title: e || '二维码生成失败', icon: 'none' }); }
  } else {
    qr.value = { ...qr.value, show: true };
  }
}

/** 海报装修：推广图 + 昵称 + 二维码合成，双端统一 uni canvas 绘制 */
async function openPoster() {
  if (!qr.value.dataUrl) {
    try {
      const res = await cardApi.distQrcode();
      if (res && res.qrDataUrl) { qr.value.dataUrl = res.qrDataUrl; qr.value.shareUrl = res.shareUrl; }
      else { uni.showToast({ title: '二维码生成失败', icon: 'none' }); return; }
    } catch (e) { uni.showToast({ title: e || '二维码生成失败', icon: 'none' }); return; }
  }
  poster.value = { show: true, saving: false, tempPath: '' };
  poster.value.saving = true;
  await new Promise((r) => setTimeout(r, 400));
  await drawPoster();
  poster.value.saving = false;
}

/** uni canvas 绘制（小程序）：CSS 300x450 坐标系，导出放大到 1200x1800 */
function drawPosterUni() {
  return new Promise((resolve) => {
    const W = 300, H = 450;
    const ctx = uni.createCanvasContext('dist-poster');
    const TITLE = summary.value.distName || '分销中心';
    const NICK = (summary.value.parent && summary.value.parent.nickname) || '我的名片';
    const LEVEL = summary.value.defaultLevel || '默认等级';
    const showBadge = summary.value.posterBadge !== false && TITLE && LEVEL;
    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    const paint = (bgPath) => {
      if (bgPath) { ctx.drawImage(bgPath, 0, 0, W, H); }
      else { ctx.setFillStyle('#165DFF'); ctx.fillRect(0, 0, W, H); }
      ctx.setFillStyle('rgba(0,0,0,0.30)'); ctx.fillRect(0, 0, W, H);
      if (showBadge) {
        const bw = 64 * (TITLE.length + LEVEL.length + 1), bh = 28, bx = 22, by = 22;
        ctx.setFillStyle('rgba(255,255,255,0.92)');
        roundRect(bx, by, bw, bh, 14); ctx.fill();
        ctx.setFillStyle('#165DFF');
        ctx.setFontSize(12); ctx.setTextAlign('left');
        ctx.fillText(`${TITLE} · ${LEVEL}`, bx + 11, by + 18);
      }
      ctx.setFillStyle('#ffffff');
      ctx.setFontSize(32); ctx.setTextAlign('center');
      ctx.fillText(TITLE, W / 2, 95);
      ctx.setFontSize(48);
      ctx.fillText(NICK, W / 2, 165);
      ctx.setFontSize(15); ctx.setFillStyle('rgba(255,255,255,0.92)');
      ctx.fillText('扫码进入我的名片，绑定后获取推广佣金', W / 2, 210);
      const qs = 170, qx = (W - qs) / 2, qy = 240;
      ctx.setFillStyle('#ffffff');
      roundRect(qx, qy, qs, qs, 16); ctx.fill();
      ctx.drawImage(qr.value.dataUrl, qx + 12, qy + 12, qs - 24, qs - 24);
      ctx.setFillStyle('rgba(255,255,255,0.92)'); ctx.setFontSize(13); ctx.setTextAlign('center');
      ctx.fillText('长按识别二维码 · 保存海报到相册', W / 2, H - 35);
      ctx.draw(false, () => {
        setTimeout(() => {
          uni.canvasToTempFilePath({ canvasId: 'dist-poster', width: W, height: H, destWidth: 1200, destHeight: 1800, success: (r) => { poster.value.tempPath = r.tempFilePath; resolve(); }, fail: () => resolve() });
        }, 400);
      });
    };
    if (summary.value.promoteImg) {
      uni.getImageInfo({ src: summary.value.promoteImg, success: (info) => paint(info.path), fail: () => paint(null) });
    } else paint(null);
  });
}

/** H5：原生 canvas 2D，600x900 逻辑坐标 + dpr 高清缓冲区，toBlob 导出 */
function drawPosterH5() {
  return new Promise((resolve) => {
    const c = document.querySelector('uni-canvas canvas, canvas#dist-poster');
    if (!c) return resolve();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = 600, H = 900;
    c.width = W * dpr; c.height = H * dpr;
    c.style.width = '300px'; c.style.height = '450px';
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    const TITLE = summary.value.distName || '分销中心';
    const NICK = (summary.value.parent && summary.value.parent.nickname) || '我的名片';
    const LEVEL = summary.value.defaultLevel || '默认等级';
    const showBadge = summary.value.posterBadge !== false && TITLE && LEVEL;
    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    const paint = (bg) => {
      if (bg) ctx.drawImage(bg, 0, 0, W, H);
      else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#165DFF'); g.addColorStop(1, '#0B3A8C');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(0, 0, W, H);
      if (showBadge) {
        const bw = 64 * (TITLE.length + LEVEL.length + 1), bh = 56, bx = 44, by = 44;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        roundRect(bx, by, bw, bh, 28); ctx.fill();
        ctx.fillStyle = '#165DFF';
        ctx.font = '600 24px "PingFang SC", sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(`${TITLE} · ${LEVEL}`, bx + 22, by + 36);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 64px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(TITLE, W / 2, 190);
      ctx.font = '600 96px "PingFang SC", sans-serif';
      ctx.fillText(NICK, W / 2, 330);
      ctx.font = '30px "PingFang SC", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText('扫码进入我的名片，绑定后获取推广佣金', W / 2, 420);
      const qs = 340, qx = (W - qs) / 2, qy = 480;
      ctx.fillStyle = '#ffffff';
      roundRect(qx, qy, qs, qs, 32); ctx.fill();
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, qx + 24, qy + 24, qs - 48, qs - 48);
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = '26px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('长按识别二维码 · 保存海报到相册', W / 2, H - 70);
        c.toBlob((blob) => {
          if (blob) poster.value.tempPath = URL.createObjectURL(blob);
          resolve();
        }, 'image/png');
      };
      img.onerror = () => resolve();
      img.src = qr.value.dataUrl;
    };
    if (summary.value.promoteImg) {
      const bg = new Image();
      bg.crossOrigin = 'anonymous';
      bg.onload = () => paint(bg);
      bg.onerror = () => paint(null);
      bg.src = summary.value.promoteImg;
    } else paint(null);
  });
}

/** 海报绘制入口：H5 原生 canvas / 小程序 uni canvas */
function drawPoster() {
  // #ifdef H5
  return drawPosterH5();
  // #endif
  // #ifndef H5
  return drawPosterUni();
  // #endif
}

/** 保存海报：H5 下载（Blob URL）；小程序保存相册（含授权） */
function savePoster() {
  if (!poster.value.tempPath) { uni.showToast({ title: '海报生成中，请稍候', icon: 'none' }); return; }
  // #ifdef H5
  const a = document.createElement('a');
  a.href = poster.value.tempPath; a.download = `分销海报-${Date.now()}.png`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  uni.showToast({ title: '海报已下载', icon: 'none' });
  // #endif
  // #ifndef H5
  uni.saveImageToPhotosAlbum({
    filePath: poster.value.tempPath,
    success: () => uni.showToast({ title: '已保存到相册', icon: 'none' }),
    fail: (e) => {
      if (e && (e.errMsg || '').includes('auth')) {
        uni.showModal({ title: '需要相册权限', content: '请在设置中开启保存到相册权限后重试', showCancel: false });
      } else uni.showToast({ title: '保存失败', icon: 'none' });
    },
  });
  // #endif
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

function goWallet() { uni.navigateTo({ url: '/pages/card/distWallet' }); }
function fen(v) { return ((Number(v) || 0) / 100).toFixed(2); }
function statusLabel(s) { return { pending: '待结算', settled: '已结算', charged_back: '已扣回' }[s] || s; }
function stCls(s) { return { pending: 'st-p', settled: 'st-s', charged_back: 'st-c' }[s] || ''; }

onShow(() => {
  trackPageView('distribution_promo');
  loadAll();
});
</script>

<style scoped>
.dist-page { min-height: 100vh; background: #f5f6f7; padding-bottom: 120rpx; }
.g3 { background: linear-gradient(155deg, #0f766e, #14b8a6); }
.hero { padding: 32rpx 32rpx 36rpx; color: #fff; border-radius: 0 0 32rpx 32rpx; }
.hero-top { display: flex; align-items: center; justify-content: space-between; }
.hero-title { font-size: 38rpx; font-weight: 700; }
.hero-top-r { display: flex; align-items: center; gap: 24rpx; }
.rule-link, .id-switch { display: flex; align-items: center; gap: 8rpx; font-size: 24rpx; opacity: 0.92; }
.user-row { margin-top: 30rpx; }
.user-line { display: flex; align-items: center; gap: 16rpx; }
.user-avatar { width: 88rpx; height: 88rpx; border-radius: 50%; background: rgba(255,255,255,0.25); border: 2rpx solid rgba(255,255,255,0.6); }
.user-avatar.placeholder { display: flex; align-items: center; justify-content: center; font-size: 36rpx; color: #fff; }
.user-name { font-size: 34rpx; font-weight: 600; }
.user-level { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 999rpx; background: rgba(255,255,255,0.22); }
.user-parent { margin-top: 14rpx; font-size: 24rpx; opacity: 0.92; }
.user-invited { margin-top: 10rpx; font-size: 24rpx; opacity: 0.92; }
.perf-row { margin-top: 28rpx; display: flex; align-items: stretch; background: rgba(255,255,255,0.14); border-radius: 20rpx; padding: 22rpx 0; }
.perf-col { flex: 1; text-align: center; }
.perf-title { font-size: 24rpx; opacity: 0.88; }
.perf-num { font-size: 40rpx; font-weight: 700; margin-top: 6rpx; }
.perf-sub { font-size: 22rpx; opacity: 0.85; margin-top: 4rpx; }
.perf-divider { width: 2rpx; background: rgba(255,255,255,0.28); }
.money-row { margin-top: 28rpx; display: flex; align-items: flex-end; justify-content: space-between; }
.money-label { font-size: 24rpx; opacity: 0.85; }
.money-val { font-size: 56rpx; font-weight: 700; line-height: 1.2; }
.money-sub { display: flex; gap: 20rpx; margin-top: 8rpx; font-size: 22rpx; opacity: 0.9; }
.money-right { display: flex; flex-direction: column; align-items: flex-end; gap: 14rpx; }
.wd-detail-link { font-size: 22rpx; opacity: 0.9; }
.withdraw-btn { background: #fff; color: #0f766e; font-size: 28rpx; font-weight: 600; padding: 14rpx 44rpx; border-radius: 999rpx; box-shadow: 0 6rpx 16rpx rgba(0,0,0,0.12); }
.tip-box { margin: 24rpx 32rpx; padding: 24rpx; background: #fff8e6; color: #ad6800; font-size: 26rpx; border-radius: 16rpx; line-height: 1.6; }
.apply-box { margin: 24rpx 32rpx; background: #fff; border-radius: 20rpx; padding: 24rpx; }
.apply-img { width: 100%; border-radius: 16rpx; }
.apply-row { display: flex; align-items: center; gap: 20rpx; margin-top: 16rpx; }
.apply-txt { flex: 1; min-width: 0; }
.apply-title { font-size: 30rpx; font-weight: 600; color: #1d2129; display: block; }
.apply-desc { margin-top: 8rpx; font-size: 24rpx; color: #86909c; line-height: 1.6; }
.apply-btn { flex-shrink: 0; background: #165dff; color: #fff; font-size: 26rpx; border-radius: 999rpx; padding: 0 28rpx; line-height: 2.4; }
.apply-wait { flex-shrink: 0; font-size: 24rpx; color: #86909c; }
.apply-agreement { margin-top: 20rpx; }
.agreement-box { background: #f7f8fa; border-radius: 12rpx; padding: 20rpx; font-size: 24rpx; color: #4e5969; max-height: 240rpx; overflow: auto; }
.agreement-check { display: flex; align-items: center; gap: 12rpx; margin-top: 16rpx; font-size: 24rpx; color: #4e5969; }
.parent-box { margin: 24rpx 32rpx; background: #fff; border-radius: 20rpx; padding: 24rpx; display: flex; align-items: center; gap: 20rpx; }
.parent-lb { font-size: 24rpx; color: #86909c; }
.parent-avatar { width: 72rpx; height: 72rpx; border-radius: 50%; background: #f2f3f5; }
.parent-avatar.placeholder { display: flex; align-items: center; justify-content: center; color: #4e5969; font-size: 28rpx; }
.parent-name { font-size: 28rpx; font-weight: 600; color: #1d2129; flex: 1; }
.parent-tag { font-size: 22rpx; color: #165dff; background: #e8f3ff; padding: 4rpx 16rpx; border-radius: 999rpx; }
.invite-box { margin: 32rpx; border-radius: 24rpx; padding: 32rpx; display: flex; align-items: center; gap: 24rpx; color: #fff; }
.invite-left { flex: 1; min-width: 0; }
.invite-title { font-size: 32rpx; font-weight: 700; }
.invite-desc { margin-top: 10rpx; font-size: 24rpx; opacity: 0.9; }
.invite-btns { margin-top: 24rpx; display: flex; gap: 16rpx; flex-wrap: wrap; }
.mini-btn { font-size: 26rpx; border-radius: 999rpx; line-height: 2.3; padding: 0 28rpx; }
.invite-btn { background: rgba(255,255,255,0.2); color: #fff; border: 1rpx solid rgba(255,255,255,0.5); }
.invite-btn.solid { background: #fff; color: #0f766e; font-weight: 600; border: none; }
.invite-btn.ghost { background: transparent; }
.invite-right { flex-shrink: 0; }
.deco-qr { width: 150rpx; height: 150rpx; border-radius: 16rpx; background: #fff; padding: 14rpx; display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: repeat(7, 1fr); gap: 3rpx; }
.dqr-cell { background: transparent; }
.dqr-cell.on { background: #0f766e; border-radius: 2rpx; }
.sec-t { margin: 32rpx 32rpx 16rpx; font-size: 30rpx; font-weight: 600; color: #1d2129; }
.stat-cards { margin: 0 32rpx; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16rpx; }
.s-card { background: #fff; border-radius: 16rpx; padding: 24rpx 12rpx; text-align: center; }
.s-num { font-size: 36rpx; font-weight: 700; color: #1d2129; }
.s-lb { margin-top: 8rpx; font-size: 22rpx; color: #86909c; }
.sub-box, .log-list { margin: 0 32rpx; background: #fff; border-radius: 20rpx; padding: 8rpx 24rpx; }
.sub-tabs { display: flex; align-items: center; gap: 8rpx; padding: 20rpx 0 12rpx; }
.sub-tab { font-size: 28rpx; color: #86909c; padding: 8rpx 20rpx; border-radius: 999rpx; }
.sub-tab.on { color: #165dff; background: #e8f3ff; font-weight: 600; }
.sub-count { margin-left: auto; font-size: 24rpx; color: #c9cdd4; }
.sub-empty { padding: 40rpx 0; text-align: center; color: #86909c; font-size: 26rpx; }
.sub-item { display: flex; align-items: center; gap: 20rpx; padding: 22rpx 0; border-top: 1rpx solid #f2f3f5; }
.sub-item:first-of-type { border-top: none; }
.sub-avatar { width: 76rpx; height: 76rpx; border-radius: 50%; background: #f2f3f5; }
.sub-avatar.placeholder { display: flex; align-items: center; justify-content: center; color: #4e5969; font-size: 28rpx; }
.sub-info { flex: 1; min-width: 0; }
.sub-name { font-size: 28rpx; color: #1d2129; display: flex; align-items: center; gap: 12rpx; }
.sub-paid { font-size: 20rpx; color: #fff; background: #00b42a; padding: 2rpx 12rpx; border-radius: 999rpx; }
.sub-time { margin-top: 6rpx; font-size: 22rpx; color: #86909c; }
.sub-arrow { color: #c9cdd4; font-size: 32rpx; }
.tabs { margin: 0 32rpx 16rpx; display: flex; gap: 12rpx; overflow-x: auto; }
.tab { flex-shrink: 0; font-size: 26rpx; color: #4e5969; background: #fff; border-radius: 999rpx; padding: 10rpx 28rpx; }
.tab.on { color: #165dff; background: #e8f3ff; font-weight: 600; }
.log-item { padding: 24rpx 0; border-top: 1rpx solid #f2f3f5; }
.log-item:first-child { border-top: none; }
.log-top { display: flex; justify-content: space-between; align-items: center; }
.log-type { font-size: 28rpx; color: #1d2129; }
.log-amt { font-size: 30rpx; font-weight: 700; color: #00b42a; }
.log-amt.neg { color: #f53f3f; }
.log-mid { margin-top: 8rpx; display: flex; justify-content: space-between; align-items: center; }
.log-no { font-size: 22rpx; color: #86909c; }
.log-st { font-size: 22rpx; }
.st-p { color: #ff7d00; } .st-s { color: #00b42a; } .st-c { color: #f53f3f; }
.log-bot { margin-top: 8rpx; font-size: 22rpx; color: #c9cdd4; display: flex; gap: 16rpx; }
.empty { padding: 40rpx 0; text-align: center; color: #86909c; font-size: 26rpx; }
.qr-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 99; display: flex; align-items: center; justify-content: center; }
.qr-panel { width: 600rpx; background: #fff; border-radius: 24rpx; padding: 40rpx 32rpx 32rpx; display: flex; flex-direction: column; gap: 20rpx; max-height: 80vh; }
.qr-title { font-size: 32rpx; font-weight: 600; text-align: center; color: #1d2129; }
.qr-shareimg { width: 100%; border-radius: 16rpx; }
.qr-img { width: 400rpx; height: 400rpx; align-self: center; }
.qr-loading { text-align: center; color: #86909c; padding: 100rpx 0; font-size: 26rpx; }
.qr-hint { text-align: center; color: #86909c; font-size: 24rpx; }
.rules-scroll { max-height: 46vh; }
.rules-text { font-size: 26rpx; color: #4e5969; line-height: 2; }
.rule-p { padding: 4rpx 0; }
.poster-canvas-box { display: flex; justify-content: center; }
.poster-canvas { width: 300px; height: 450px; background: #f2f3f5; border-radius: 16rpx; }
.mini-btn.ghost { background: #fff; color: #4e5969; border: 1rpx solid #e5e6eb; }
.total-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16rpx; }
.t-card { background: #f7f8fa; border-radius: 16rpx; padding: 28rpx 20rpx; text-align: center; }
.t-num { font-size: 40rpx; font-weight: 700; color: #1d2129; }
.t-lb { margin-top: 8rpx; font-size: 24rpx; color: #86909c; }
</style>
