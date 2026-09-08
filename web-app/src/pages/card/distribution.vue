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
      <view class="row-rules">
        <view class="rule-link" @click="showRules = true">
          <SIcon name="audit" size="small" color="#ffffff" />
          <text>规则</text>
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

    <!-- 分销资格申请（申请制：成为分销商=申请即通过 / 申请需审核） -->
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
      <!-- 申请协议（勾选后才可提交） -->
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

    <!-- 自动资格门槛提示（总消费金额 / 购买商品 / 指定商品） -->
    <view v-else-if="(summary.gate === 3 || summary.gate === 4 || summary.gate === 5) && !summary.inWhitelist" class="tip-box">
      <text v-if="summary.gate === 3">当前为消费门槛：累计实付满 {{ fen(summary.becomeAmount * 100) }} 元后自动获得分销资格</text>
      <text v-else-if="summary.gate === 4">当前为购买门槛：完成任意付费订单后自动获得分销资格</text>
      <text v-else>当前为指定商品门槛：购买指定商品并支付完成后自动获得分销资格</text>
    </view>

    <!-- 显示上级（分销参数 show_parent 开启） -->
    <view v-if="summary.showParent && summary.parent" class="parent-box">
      <view class="parent-lb">我的上级推荐人</view>
      <image v-if="summary.parent.avatar" class="parent-avatar" :src="summary.parent.avatar" mode="aspectFill" />
      <view v-else class="parent-avatar placeholder">{{ (summary.parent.nickname || '上')[0] }}</view>
      <view class="parent-name">{{ summary.parent.nickname }}</view>
      <view class="parent-tag">{{ summary.defaultLevel || '默认等级' }}</view>
    </view>

    <!-- 推广模块 -->
    <view class="sec-t">我的推广</view>
    <view class="stat-cards">
      <view class="s-card"><view class="s-num">{{ summary.directCount }}</view><view class="s-lb">直推{{ summary.subName || '下级' }}</view></view>
      <view class="s-card"><view class="s-num">{{ summary.indirectCount }}</view><view class="s-lb">间推{{ summary.subName || '下级' }}</view></view>
      <view class="s-card"><view class="s-num">{{ summary.monthNew }}</view><view class="s-lb">本月新增</view></view>
      <view class="s-card"><view class="s-num">{{ fen(summary.monthCommission) }}</view><view class="s-lb">本月佣金(元)</view></view>
    </view>
    <view class="qrcode-box">
      <button class="mini-btn" @click="openQr">推广二维码</button>
      <button class="mini-btn primary" @click="openPoster">生成海报</button>
      <button class="mini-btn ghost" @click="copyShareUrl">复制推广链接</button>
      <text class="qrcode-tip">把名片分享给客户，客户扫码进入后自动绑定上下级，付费即可获取推广佣金</text>
    </view>

    <!-- 下级客户列表（直推/间推） -->
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

    <!-- 分销须知（dist_notice 优先，否则默认规则拼接） -->
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

    <!-- 分享海报（海报装修：推广图 + 昵称 + 二维码，可保存相册/下载） -->
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
const summary = ref({ wallet: null, directCount: 0, indirectCount: 0, monthCommission: 0, monthNew: 0, unbound: false, isPartner: false, shareTags: [], partnerPending: 0, partnerTotal: 0, sharePending: 0, shareTotal: 0, gate: 0, inWhitelist: false, canApply: false, applyStatus: null, rejectReason: '', distName: '推广员', subName: '下级', applyTopImg: '', promoteImg: '', applyTip: '', shareTitle: '', shareImg: '', applyAgreement: '', distNotice: '', posterBadge: true, ratio1: 0.2, ratio2: 0.05, settleDay: 7, showPhone: false, becomeAmount: 0 });
const applying = ref(false);
const agreed = ref(false);
const showRules = ref(false);
const fmtRatio = (v) => (Math.round((Number(v) || 0) * 1000) / 10) + '%';

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
    await loadSummary();
    uni.showToast({ title: summary.value.gate === 1 ? '申请成功，已自动通过' : '申请已提交，等待审核', icon: 'none' });
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
  // 等待弹层 canvas 挂载完成再绘制（H5/小程序均需）
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
.row-rules { display: flex; justify-content: flex-end; margin: -6px 20px 0 0; }
.rule-link { display: flex; align-items: center; gap: 4px; color: rgba(255,255,255,0.92); font-size: 12px; padding: 4px 6px; }
.rules-panel { max-height: 80vh; display: flex; flex-direction: column; }
.rules-scroll { max-height: 52vh; margin-bottom: 4px; text-align: left; }
.rules-text { font-size: 13px; color: #4e5969; line-height: 1.8; }
.rule-p { margin-bottom: 6px; }
.qr-shareimg { width: 260px; height: 208px; border-radius: 8px; margin: -4px 0 10px; }
.apply-agreement { margin: 12px 2px 0; border-top: 1px solid #f2f3f5; padding-top: 10px; }
.agreement-box { max-height: 140px; overflow-y: auto; background: #f7f8fa; border-radius: 8px; padding: 10px; font-size: 12px; color: #4e5969; line-height: 1.7; }
.agreement-check { display: flex; align-items: center; gap: 4px; margin-top: 8px; font-size: 12px; color: #4e5969; }
.poster-panel { width: 340px; }
.poster-canvas-box { display: flex; justify-content: center; margin-bottom: 12px; }
.poster-canvas { width: 300px; height: 450px; border-radius: 10px; background: #165dff; }
.mini-btn.primary { background: #165dff; color: #fff; border-color: #165dff; }
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
.apply-box { margin: 12px 20px 0; background: #f0f7ff; border: 1px solid #b3d6ff; border-radius: 10px; padding: 12px 14px; overflow: hidden; }
.apply-img { width: 100%; max-height: 150rpx; border-radius: 8px; margin-bottom: 10px; }
.apply-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.parent-box { margin: 12px 20px 0; background: #fff; border: 1px solid #e5e6eb; border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
.parent-lb { font-size: 13px; color: #86909c; flex-shrink: 0; }
.parent-avatar { width: 36px; height: 36px; border-radius: 50%; background: #f2f3f5; }
.parent-avatar.placeholder { display: flex; align-items: center; justify-content: center; color: #86909c; font-size: 15px; }
.parent-name { font-size: 14px; color: #1d2129; font-weight: 500; }
.parent-tag { font-size: 12px; color: #165dff; background: #e8f3ff; border-radius: 6px; padding: 2px 8px; }
.sub-phone { color: #86909c; font-size: 12px; }
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
