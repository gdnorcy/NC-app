<template>
  <view class="dist-page" :style="[navVars, themeStyle, brandVars, brandInkVars, tabBarPad]">
<!-- PageNav -->
<PageNav title="分销中心" back overlay :sticky="false" bg="transparent" :color="heroInk" />
    <!-- 顶部主视觉卡：用户信息 + 上级推广员 + 已邀请 + 收益总览 -->
    <view class="hero g3" :style="heroStyle">
      <view class="hero-top">
        <view class="hero-title">分销中心</view>
        <view class="hero-top-r">
          <view class="rule-link" @click="showRules = true"><SIcon name="audit" size="small" :color="heroInk" /><text>规则</text></view>
          <view class="id-switch" @click="switchIdentity"><SIcon name="exchange" size="small" :color="heroInk" /><text>{{ identityLabel }}</text></view>
        </view>
      </view>
      <!-- 用户信息 -->
      <view class="user-row">
        <view class="user-line">
          <image v-if="summary.selfAvatar" class="user-avatar" :src="summary.selfAvatar" mode="aspectFill" />
          <view v-else class="user-avatar placeholder">{{ (summary.selfName || '我')[0] }}</view>
          <view class="user-name">{{ summary.selfName || '我' }}</view>
          <view class="user-level">{{ summary.currentLevelName || summary.defaultLevel || '默认等级' }}</view>
        </view>
        <view v-if="summary.nextLevel" class="user-next" @click="showLevels = true">距「{{ summary.nextLevel.name }}」{{ nextGap }} ›</view>
        <view v-if="summary.isEnableDist" class="user-level-link" @click="showLevels = true">等级说明 ›</view>
        <view v-if="summary.isEnableDist && summary.showParent && summary.parent" class="user-parent">上级推广员：{{ summary.parent.nickname || '-' }}</view>
        <view v-if="summary.isEnableDist" class="user-invited" @click="scrollTo('subs')">已邀请成功：{{ summary.directCount }}人 ›</view>
      </view>
      <!-- 收益总览 -->
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

    <!-- 业绩区：今日 / 累计 -->
    <view class="perf-cards">
      <view class="perf-card">
        <view class="perf-label">今日业绩</view>
        <view class="perf-val">¥{{ fen(summary.todayCommission) }}</view>
        <view class="perf-sub">{{ summary.todayOrder }}单 · 新增{{ summary.todayNew }}人</view>
      </view>
      <view class="perf-card perf-click" @click="showTotal = true">
        <view class="perf-label">累计业绩 <text class="perf-more">›</text></view>
        <view class="perf-val">¥{{ fen(summary.totalCommission) }}</view>
        <view class="perf-sub">直推{{ summary.directCount }} · 间推{{ summary.indirectCount }}</view>
      </view>
    </view>

    <!-- 无权限提示 -->
    <view v-if="summary.unbound" class="tip-box">
      当前暂无分销/分红权限，入驻租户并绑定推广关系后可查看收益
    </view>

    <!-- 分销资格申请 / 门槛提示（仅 dist 插件开通） -->
    <template v-if="summary.isEnableDist">
      <view v-if="(summary.gate === 1 || summary.gate === 2) && !summary.inWhitelist" class="apply-box">
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
            <radio :checked="agreed" :color="themeColor" style="transform: scale(0.75)" />
            <text>我已阅读并同意以上协议</text>
          </label>
        </view>
      </view>
      <view v-else-if="(summary.gate === 3 || summary.gate === 4 || summary.gate === 5) && !summary.inWhitelist" class="tip-box">
        <text v-if="summary.gate === 3">当前为消费门槛：累计实付满 {{ fen(summary.becomeAmount * 100) }} 元后自动获得分销资格</text>
        <text v-else-if="summary.gate === 4">当前为购买门槛：完成任意付费订单后自动获得分销资格</text>
        <text v-else>当前为指定商品门槛：购买指定商品并支付完成后自动获得分销资格</text>
      </view>

      <!-- 生成专属邀请码（白卡：与页面其它卡同一观感）
           旧版是「第二块品牌渐变 + 装饰性假二维码」→ 整页两块大面积品牌色，观感廉价
           （用户报修「太黄了，太多黄的色块」）。改为白卡 + 单一主按钮承载品牌色，
           假二维码删除（真码在点「推广二维码」后的弹层里生成）。 -->
      <view class="invite-box">
        <view class="invite-title">生成专属邀请码</view>
        <view class="invite-desc">分享名片给客户，绑定后付费即可获得佣金</view>
        <view class="invite-btns">
          <button class="mini-btn invite-btn solid" :style="heroStyle" @click="openPoster">生成海报</button>
          <button class="mini-btn invite-btn ghost" @click="openQr">推广二维码</button>
          <button class="mini-btn invite-btn ghost" @click="copyShareUrl">复制链接</button>
        </view>
      </view>

      <!-- 我的下线 -->
      <view id="anchor-subs" class="sec-t">我的下线</view>
      <view class="stat-cards">
        <view class="s-card"><view class="s-num">{{ summary.directCount }}</view><view class="s-lb">直推{{ summary.subName || '下级' }}</view></view>
        <view class="s-card"><view class="s-num">{{ summary.indirectCount }}</view><view class="s-lb">间推{{ summary.subName || '下级' }}</view></view>
        <view class="s-card"><view class="s-num">{{ summary.monthNew }}</view><view class="s-lb">本月新增</view></view>
        <view class="s-card"><view class="s-num">{{ fen(summary.monthCommission) }}</view><view class="s-lb">本月佣金(元)</view></view>
      </view>
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
    </template>

    <!-- 我的分销应用：其余 4 个插件应用，两列 -->
    <view class="sec-t">我的分销应用</view>
    <view class="app-grid">
      <view v-if="summary.isEnablePartner" class="app-card" @click="go('distPartner')">
        <view class="app-ic ic-orange"><SIcon name="crown" size="large" /></view>
        <view class="app-name-row">
          <text class="app-name">合伙人分红</text>
          <text class="app-state" :class="summary.isPartner ? 'ok' : 'warn'">{{ summary.isPartner ? '已获身份' : '未获身份' }}</text>
        </view>
        <view class="app-desc">{{ summary.isPartner ? '待分红 ¥' + fen(summary.partnerPending) + ' · 累计 ¥' + fen(summary.partnerTotal) : '团队 / 全局流水' }}</view>
      </view>

      <view v-if="summary.isEnableShareAll" class="app-card" @click="go('distShareAll')">
        <view class="app-ic ic-purple"><SIcon name="badge" size="large" /></view>
        <view class="app-name-row">
          <text class="app-name">全民股东</text>
          <text class="app-state" :class="shareAllTag ? 'ok' : 'warn'">{{ shareAllTag ? '已获身份' : '未获身份' }}</text>
        </view>
        <view class="app-desc">{{ shareAllTag ? '待分红 ¥' + fen(summary.shareAllPending) + ' · 累计 ¥' + fen(summary.shareAllTotal) : '全站流水分红' }}</view>
      </view>

      <view v-if="summary.isEnableShareCat" class="app-card" @click="go('distShareCat')">
        <view class="app-ic ic-green"><SIcon name="dynamic" size="large" /></view>
        <view class="app-name-row">
          <text class="app-name">类目股东</text>
          <text class="app-state" :class="shareCatTag ? 'ok' : 'warn'">{{ shareCatTag ? '已获身份' : '未获身份' }}</text>
        </view>
        <view class="app-desc">{{ shareCatTag ? '待分红 ¥' + fen(summary.shareCatPending) + ' · 累计 ¥' + fen(summary.shareCatTotal) : '按行业维度分红' }}</view>
      </view>

      <view v-if="summary.isEnableShareArea" class="app-card" @click="go('distShareArea')">
        <view class="app-ic ic-cyan"><SIcon name="pool" size="large" /></view>
        <view class="app-name-row">
          <text class="app-name">区域股东</text>
          <text class="app-state" :class="shareAreaTag ? 'ok' : 'warn'">{{ shareAreaTag ? '已获身份' : '未获身份' }}</text>
        </view>
        <view class="app-desc">{{ shareAreaTag ? '待分红 ¥' + fen(summary.shareAreaPending) + ' · 累计 ¥' + fen(summary.shareAreaTotal) : '按地区维度分红' }}</view>
      </view>
    </view>
    <!-- 未入驻（新微信账号没绑定租户）≠ 租户没开通应用，文案要区分，否则新用户被误导去找管理员 -->
    <view v-if="!hasAnyApp" class="empty-box">{{ summary.unbound ? '未入驻企业，暂无法使用分销应用；创建名片并加入企业后即可开通' : '当前租户未开通分销应用，请先联系租户管理员开通' }}</view>

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

    <!-- 分享海报 -->
    <view v-if="poster.show" class="qr-mask" @click="poster.show = false">
      <view class="qr-panel poster-panel" @click.stop>
        <view class="qr-title">分享海报</view>
        <!-- 模板选择（多模板时展示） -->
        <view v-if="posterTemplates.length > 1" class="poster-tpl-row">
          <view v-for="t in posterTemplates" :key="t.id" class="poster-tpl-item" :class="{ on: posterActiveUrl === t.url }" @click="switchPosterTpl(t.url)">
            <image class="poster-tpl-thumb" :src="t.url" mode="aspectFill" />
          </view>
        </view>
        <view class="poster-canvas-box">
          <canvas canvas-id="dist-poster" id="dist-poster" class="poster-canvas" />
        </view>
        <button class="mini-btn" :disabled="poster.saving" @click="savePoster">{{ poster.saving ? '生成中…' : '保存海报' }}</button>
        <button class="mini-btn ghost" @click="poster.show = false">关闭</button>
      </view>
    </view>

    <!-- 等级说明 -->
    <view v-if="showLevels" class="qr-mask" @click="showLevels = false">
      <view class="qr-panel rules-panel" @click.stop>
        <view class="qr-title">分销等级</view>
        <scroll-view scroll-y class="rules-scroll">
          <view class="level-list">
            <view v-for="lv in summary.levels || []" :key="lv.level_no" class="level-item" :class="{ cur: lv.level_no === summary.currentLevelNo }">
              <view class="level-head">
                <text class="level-name">{{ lv.name }}</text>
                <text v-if="lv.level_no === summary.currentLevelNo" class="level-cur">当前等级</text>
              </view>
              <view v-if="lv.benefits" class="level-benefit">{{ lv.benefits }}</view>
              <view class="level-meta">累计收益 ≥ {{ fen(lv.min_total_income) }} 元 · 直推 ≥ {{ lv.min_direct }} 人</view>
            </view>
          </view>
          <view class="rules-text level-tip">任一条件达标即升级；等级越高，海报角标与身份标识越亮眼</view>
        </scroll-view>
        <button class="mini-btn ghost" @click="showLevels = false">关闭</button>
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

    <CardTabBar active="member" />
  </view>
</template>

<script setup>
import { useTabBarPadding } from '../../utils/cardTabBarSpace.js';
import { heroBrandStyle } from '../../utils/templateTheme.js';
import PageNav from '../../components/PageNav.vue';
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { heroGradient, brandPalette } from '../../utils/color.js';
import { trackPageView } from '../../utils/analytics.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';
import { navVarsStyle } from '../../utils/navMetrics.js';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';

const navVars = navVarsStyle();
const themeStyle = useDesignTheme();
// 底部导航条实测占位（高度随设计方案浮动，禁止写死 → 见 utils/cardTabBarSpace.js）
const tabBarPad = useTabBarPadding();
const { brandVars, brandPrimary, brandInkVars } = useBrandOverride();
// SIcon/radio/canvas 不能消费 var()（构建期烘焙 hex / canvas 只吃真实色），主题主色喂真实 hex：回落品牌蓝
const themeColor = computed(() => brandPrimary.value || (themeStyle.value && themeStyle.value['--design-primary']) || '#165dff');
// 品牌 5 色 hero：本人名片优先，无则回落主题渐变（曾 ref('') 恒空 → 品牌链路断）
const brand = ref({ primary: '', gradient: '', secondary: '', text: '', subText: '' });
// hero 前景（SIcon / PageNav 需要真实 hex，吃不了 var()）：与 heroStyle 同判据产出，
// 品牌亮黄时自动转深灰，避免白图标白字消失在黄底上
const heroInk = computed(() => heroStyle.value.color);
// 第三个参数：无品牌色时按**系统主题主色**裁决前景（否则背景走了系统主题、文字却按
// 兜底蓝判白字 → 系统配浅色时白字消失）。背景兜底仍是 var() 渐变，跟着设计中心走。
const heroStyle = computed(() => heroBrandStyle(brand.value, 'linear-gradient(155deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff))', themeColor.value));
const identity = ref('individual');
const identityLabel = computed(() => (identity.value === 'employee' ? '企业员工身份' : '入驻个人身份'));
const summary = ref({ wallet: null, directCount: 0, indirectCount: 0, monthCommission: 0, monthNew: 0, todayCommission: 0, todayOrder: 0, todayNew: 0, totalCommission: 0, totalOrders: 0, withdrawing: 0, selfName: '我', selfAvatar: '', unbound: false, isEnableDist: false, isEnablePartner: false, isEnableShareAll: false, isEnableShareCat: false, isEnableShareArea: false, isPartner: false, shareTags: [], partnerPending: 0, partnerTotal: 0, sharePending: 0, shareTotal: 0, gate: 0, inWhitelist: false, canApply: false, applyStatus: null, rejectReason: '', distName: '推广员', subName: '下级', applyTopImg: '', applyTip: '', shareTitle: '', shareImg: '', applyAgreement: '', distNotice: '', ratio1: 0.2, ratio2: 0.05, settleDay: 7, showPhone: false, becomeAmount: 0, showParent: false, parent: null, posterBadge: true, defaultLevel: '默认等级' });

const showRules = ref(false);
const showLevels = ref(false);
const showTotal = ref(false);
const applying = ref(false);
const agreed = ref(false);
const fmtRatio = (v) => (Math.round((Number(v) || 0) * 1000) / 10) + '%';

const shareAllTag = computed(() => summary.value.shareTags.includes('全民股东'));
const shareCatTag = computed(() => summary.value.shareTags.find((t) => t.startsWith('行业-')));
const shareAreaTag = computed(() => summary.value.shareTags.find((t) => t.startsWith('地区-')));
const hasAnyApp = computed(() => summary.value.isEnablePartner || summary.value.isEnableShareAll || summary.value.isEnableShareCat || summary.value.isEnableShareArea);
const nextGap = computed(() => {
  const n = summary.value.nextLevel;
  if (!n) return '已达最高等级';
  const total = Number(summary.value.wallet?.totalIncome || 0);
  if (n.minTotalIncome > 0 && total < n.minTotalIncome) return `还差 ¥${((n.minTotalIncome - total) / 100).toFixed(2)}`;
  if (n.minDirect > 0 && summary.value.directCount < n.minDirect) return `还差 ${n.minDirect - summary.value.directCount} 位直推`;
  return '即将达成';
});

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
  // 头像/昵称兜底：新微信账号服务端无资料时回退登录缓存（否则恒显示「我」）
  const cachedUser = uni.getStorageSync('card_user') || {};
  if ((!summary.value.selfName || summary.value.selfName === '我') && cachedUser.nickname) summary.value.selfName = cachedUser.nickname;
  if (!summary.value.selfAvatar && cachedUser.avatar) summary.value.selfAvatar = cachedUser.avatar;
  // 品牌色 hero：与 member 同款——本人名片 brandColor 优先，无则回落主题渐变
  //（brandColor 原先恒空：ref('') 后无任何赋值处，heroGradient 第一参数永远走 fallback，品牌链路断）
  try {
    const cardsRes = await cardApi.getCardsSafe();
    const myCard0 = (cardsRes.cards || [])[0];
    if (myCard0) { const b = brandPalette(myCard0); if (b.primary) Object.assign(brand.value, b); }
  } catch (e) {}
  if (summary.value.isEnableDist) { loadLogs(); loadSubs(); }
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

function go(page) { uni.navigateTo({ url: `/pages/card/${page}` }); }
function goWallet() { uni.navigateTo({ url: '/pages/card/distWallet' }); }
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
const posterTemplates = computed(() => summary.value.posterTemplates || []);
const posterActiveUrl = ref('');
async function switchPosterTpl(url) {
  posterActiveUrl.value = url;
  poster.value.saving = true;
  await new Promise((r) => setTimeout(r, 120));
  await drawPoster();
  poster.value.saving = false;
}
async function openPoster() {
  if (!qr.value.dataUrl) {
    try {
      const res = await cardApi.distQrcode();
      if (res && res.qrDataUrl) { qr.value.dataUrl = res.qrDataUrl; qr.value.shareUrl = res.shareUrl; }
      else { uni.showToast({ title: '二维码生成失败', icon: 'none' }); return; }
    } catch (e) { uni.showToast({ title: e || '二维码生成失败', icon: 'none' }); return; }
  }
  poster.value = { show: true, saving: false, tempPath: '' };
  posterActiveUrl.value = summary.value.promoteImg || (posterTemplates.value[0] && posterTemplates.value[0].url) || '';
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
    const LEVEL = summary.value.currentLevelName || summary.value.defaultLevel || '默认等级';
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
      else { ctx.setFillStyle(themeColor.value); ctx.fillRect(0, 0, W, H); }
      ctx.setFillStyle('rgba(0,0,0,0.30)'); ctx.fillRect(0, 0, W, H);
      if (showBadge) {
        const bw = 64 * (TITLE.length + LEVEL.length + 1), bh = 28, bx = 22, by = 22;
        ctx.setFillStyle('rgba(255,255,255,0.92)');
        roundRect(bx, by, bw, bh, 14); ctx.fill();
        ctx.setFillStyle(themeColor.value);
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
    if (posterActiveUrl.value) {
      uni.getImageInfo({ src: posterActiveUrl.value, success: (info) => paint(info.path), fail: () => paint(null) });
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
    const LEVEL = summary.value.currentLevelName || summary.value.defaultLevel || '默认等级';
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
        g.addColorStop(0, themeColor.value); g.addColorStop(1, shadeHex(themeColor.value, -0.35));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(0, 0, W, H);
      if (showBadge) {
        const bw = 64 * (TITLE.length + LEVEL.length + 1), bh = 56, bx = 44, by = 44;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        roundRect(bx, by, bw, bh, 28); ctx.fill();
        ctx.fillStyle = themeColor.value;
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
    if (posterActiveUrl.value) {
      const bg = new Image();
      bg.crossOrigin = 'anonymous';
      bg.onload = () => paint(bg);
      bg.onerror = () => paint(null);
      bg.src = posterActiveUrl.value;
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
  trackShare();
  // #endif
  // #ifndef H5
  uni.saveImageToPhotosAlbum({
    filePath: poster.value.tempPath,
    success: () => { uni.showToast({ title: '已保存到相册', icon: 'none' }); trackShare(); },
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
    trackShare();
  } catch (e) {}
}
// 分销漏斗：分享埋点（静默失败）
function trackShare() {
  try { cardApi.distFunnel({ eventType: 'share' }); } catch (e) {}
}

function fen(v) { return ((Number(v) || 0) / 100).toFixed(2); }
function stCls(s) { return { pending: 'st-p', settled: 'st-s', charged_back: 'st-c' }[s] || ''; }

onShow(() => {
  trackPageView('distribution');
  loadAll();
});
</script>

<style scoped>
.dist-page { min-height: 100vh; background: var(--bg-page); padding-bottom: 120rpx; }
/* demo g3 青绿渐变 → 主题渐变（hero/invite-box 内联 heroStyle 恒定覆盖此类，同步防内联失效露 demo 色） */
.g3 { background: linear-gradient(155deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff)); }
.hero { padding: calc(var(--pnv-status-bar, 20px) + var(--pnv-nav-h, 44px) + 16rpx) 32rpx 36rpx; color: var(--white); border-radius: 0 0 32rpx 32rpx; }
.hero-top { display: flex; align-items: center; justify-content: space-between; }
.hero-title { font-size: 38rpx; font-weight: 700; }
.hero-top-r { display: flex; align-items: center; gap: 24rpx; }
.rule-link, .id-switch { display: flex; align-items: center; gap: 8rpx; font-size: var(--fs-3); opacity: 0.92; }
.user-row { margin-top: 30rpx; }
.user-line { display: flex; align-items: center; gap: 16rpx; }
.user-avatar { width: 88rpx; height: 88rpx; border-radius: 50%; background: rgba(255,255,255,0.25); border: 2rpx solid rgba(255,255,255,0.6); }
/* 占位首字母：白底圆 + --brand-ink 文字。判据是**头像自己的白底**而非 hero 背景——
   旧版写死 #fff 白字直接坐在品牌渐变上，品牌色一换成亮黄就整个消失（真机报修） */
.user-avatar.placeholder {
  display: flex; align-items: center; justify-content: center; font-size: var(--fs-7); font-weight: 600;
  background: rgba(255,255,255,0.92); border-color: rgba(255,255,255,0.9);
  color: var(--brand-ink, #165dff);
}
.user-name { font-size: 34rpx; font-weight: 600; }
.user-level { font-size: var(--fs-2); padding: 4rpx 16rpx; border-radius: var(--radius-pill); background: rgba(255,255,255,0.22); }
.user-level-link { margin-top: 12rpx; font-size: var(--fs-3); opacity: 0.92; display: inline-flex; align-items: center; }
.level-list { display: flex; flex-direction: column; gap: 14rpx; }
.level-item { border: 1rpx solid var(--border); border-radius: var(--radius-xs); padding: 18rpx 20rpx; background: var(--white); }
.level-item.cur { border-color: var(--design-primary); background: var(--brand-tint, var(--design-secondary)); }
.level-head { display: flex; align-items: center; gap: 12rpx; }
.level-name { font-size: var(--fs-5); font-weight: 600; color: var(--t1); }
.level-cur { font-size: var(--fs-1); color: var(--brand-ink, var(--design-primary)); background: var(--brand-tint, var(--design-secondary)); padding: 2rpx 12rpx; border-radius: var(--radius-pill); }
.level-meta { margin-top: 6rpx; font-size: var(--fs-2); color: var(--t3); }
.level-benefit { margin-top: 8rpx; padding: 10rpx 14rpx; background: var(--bg-card); border-radius: 10rpx; font-size: var(--fs-3); color: var(--t2); line-height: 1.6; }
.level-tip { margin-top: 16rpx; color: var(--t3); }
.user-next { margin-top: 12rpx; font-size: var(--fs-3); opacity: 0.92; display: inline-flex; align-items: center; gap: 6rpx; }
.user-parent { margin-top: 14rpx; font-size: var(--fs-3); opacity: 0.92; }
.user-invited { margin-top: 14rpx; font-size: var(--fs-3); opacity: 0.92; }
.money-row { margin-top: 40rpx; display: flex; align-items: flex-end; justify-content: space-between; }
.money-label { font-size: var(--fs-3); opacity: 0.85; }
.money-val { font-size: 56rpx; font-weight: 700; line-height: 1.2; }
.money-sub { display: flex; gap: 20rpx; margin-top: 8rpx; font-size: var(--fs-2); opacity: 0.9; }
.money-right { display: flex; flex-direction: column; align-items: flex-end; gap: 14rpx; }
.wd-detail-link { font-size: var(--fs-2); opacity: 0.9; }
/* 白药丸按钮：文字坐在**白底**上 → 用 --brand-ink（亮黄主色在白底只有 1.75:1，必须压暗） */
.withdraw-btn { background: var(--white); color: var(--brand-ink, var(--design-primary)); font-size: var(--fs-5); font-weight: 600; padding: 14rpx 44rpx; border-radius: var(--radius-pill); box-shadow: 0 6rpx 16rpx rgba(0,0,0,0.12); }
.perf-cards { margin: 24rpx 32rpx; display: grid; grid-template-columns: repeat(2, 1fr); gap: 16rpx; }
.perf-card { background: var(--white); border-radius: 20rpx; padding: 26rpx 24rpx; }
.perf-card.perf-click { cursor: pointer; }
.perf-label { font-size: var(--fs-3); color: var(--t3); display: flex; align-items: center; justify-content: space-between; }
.perf-more { font-size: var(--fs-5); color: var(--border); }
.perf-val { margin-top: 12rpx; font-size: 40rpx; font-weight: 700; color: var(--t1); }
.perf-sub { margin-top: 8rpx; font-size: var(--fs-2); color: #a9aeb8; }
.tip-box { margin: 24rpx 32rpx; padding: 24rpx; background: #fff8e6; color: #ad6800; font-size: var(--fs-4); border-radius: var(--radius-md); line-height: 1.6; }
.apply-box { margin: 24rpx 32rpx; background: var(--white); border-radius: 20rpx; padding: 24rpx; }
.apply-img { width: 100%; border-radius: var(--radius-md); }
.apply-row { display: flex; align-items: center; gap: 20rpx; margin-top: 16rpx; }
.apply-txt { flex: 1; min-width: 0; }
.apply-title { font-size: 30rpx; font-weight: 600; color: var(--t1); display: block; }
.apply-desc { margin-top: 8rpx; font-size: var(--fs-3); color: var(--t3); line-height: 1.6; }
.apply-btn { flex-shrink: 0; background: var(--design-primary); color: var(--design-text, #fff); font-size: var(--fs-4); border-radius: var(--radius-pill); padding: 0 28rpx; line-height: 2.4; }
.apply-wait { flex-shrink: 0; font-size: var(--fs-3); color: var(--t3); }
.apply-agreement { margin-top: 20rpx; }
.agreement-box { background: var(--bg-card); border-radius: var(--radius-xs); padding: 20rpx; font-size: var(--fs-3); color: var(--t2); max-height: 240rpx; overflow: auto; }
.agreement-check { display: flex; align-items: center; gap: 12rpx; margin-top: 16rpx; font-size: var(--fs-3); color: var(--t2); }
.invite-box { margin: 32rpx; border-radius: var(--radius-lg); padding: 32rpx; background: var(--white); box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.05); }
.invite-title { font-size: var(--fs-6); font-weight: 700; color: var(--t1); }
.invite-desc { margin-top: 12rpx; font-size: var(--fs-3); color: var(--t3); line-height: 1.6; }
.invite-btns { margin-top: 28rpx; display: grid; grid-template-columns: repeat(2, 1fr); gap: 16rpx; }
.mini-btn { font-size: var(--fs-4); border-radius: var(--radius-pill); line-height: 2.4; padding: 0 20rpx; }
/* 描边次按钮：文字/描边用 --brand-ink（白底上可读的主色），亮黄主色会自动压暗，
   直接用 var(--design-primary) 的话黄字压白底只有 1.75:1，等于看不见 */
.invite-btn.ghost { background: transparent; border: 1rpx solid var(--brand-ink, #165dff); color: var(--brand-ink, #165dff); }
/* 主按钮：品牌渐变 + 由 heroForeground 裁决的可读文字（内联 heroStyle 覆盖此处兜底） */
.invite-btn.solid { grid-column: span 2; background: var(--design-primary); color: var(--design-text, #fff); border: none; font-weight: 600; }
.sec-t { margin: 40rpx 32rpx 16rpx; font-size: 30rpx; font-weight: 600; color: var(--t1); }
.stat-cards { margin: 0 32rpx; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16rpx; }
.s-card { background: var(--white); border-radius: var(--radius-md); padding: 24rpx 12rpx; text-align: center; }
.s-num { font-size: var(--fs-7); font-weight: 700; color: var(--t1); }
.s-lb { margin-top: 8rpx; font-size: var(--fs-2); color: var(--t3); }
.sub-box, .log-list { margin: 16rpx 32rpx 0; background: var(--white); border-radius: 20rpx; padding: 8rpx 24rpx; }
.sub-tabs { display: flex; align-items: center; gap: 8rpx; padding: 20rpx 0 12rpx; }
.sub-tab { font-size: var(--fs-5); color: var(--t3); padding: 8rpx 20rpx; border-radius: var(--radius-pill); }
.sub-tab.on { color: var(--brand-ink, var(--design-primary)); background: var(--brand-tint, var(--design-secondary)); font-weight: 600; }
.sub-count { margin-left: auto; font-size: var(--fs-3); color: var(--border); }
.sub-empty { padding: 40rpx 0; text-align: center; color: var(--t3); font-size: var(--fs-4); }
.sub-item { display: flex; align-items: center; gap: 20rpx; padding: 22rpx 0; border-top: 1rpx solid var(--bg-hover); }
.sub-item:first-of-type { border-top: none; }
.sub-avatar { width: 76rpx; height: 76rpx; border-radius: 50%; background: var(--bg-hover); }
.sub-avatar.placeholder { display: flex; align-items: center; justify-content: center; color: var(--t2); font-size: var(--fs-5); }
.sub-info { flex: 1; min-width: 0; }
.sub-name { font-size: var(--fs-5); color: var(--t1); display: flex; align-items: center; gap: 12rpx; }
.sub-paid { font-size: var(--fs-1); color: var(--white); background: #00b42a; padding: 2rpx 12rpx; border-radius: var(--radius-pill); }
.sub-time { margin-top: 6rpx; font-size: var(--fs-2); color: var(--t3); }
.sub-arrow { color: var(--border); font-size: var(--fs-6); }
.tabs { margin: 0 32rpx; display: flex; gap: 12rpx; overflow-x: auto; }
.tab { flex-shrink: 0; font-size: var(--fs-4); color: var(--t2); background: var(--white); border-radius: var(--radius-pill); padding: 10rpx 28rpx; }
.tab.on { color: var(--brand-ink, var(--design-primary)); background: var(--brand-tint, var(--design-secondary)); font-weight: 600; }
.log-item { padding: 24rpx 0; border-top: 1rpx solid var(--bg-hover); }
.log-item:first-child { border-top: none; }
.log-top { display: flex; justify-content: space-between; align-items: center; }
.log-type { font-size: var(--fs-5); color: var(--t1); }
.log-amt { font-size: 30rpx; font-weight: 700; color: #00b42a; }
.log-amt.neg { color: var(--danger); }
.log-mid { margin-top: 8rpx; display: flex; justify-content: space-between; align-items: center; }
.log-no { font-size: var(--fs-2); color: var(--t3); }
.log-st { font-size: var(--fs-2); }
.st-p { color: var(--brand-orange); } .st-s { color: #00b42a; } .st-c { color: var(--danger); }
.log-bot { margin-top: 8rpx; font-size: var(--fs-2); color: var(--border); display: flex; gap: 16rpx; }
.empty { padding: 40rpx 0; text-align: center; color: var(--t3); font-size: var(--fs-4); }
.app-grid { margin: 16rpx 32rpx 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 20rpx; }
.app-card { background: var(--white); border-radius: 20rpx; padding: 26rpx 24rpx; display: flex; flex-direction: column; gap: 12rpx; }
.app-ic { width: 64rpx; height: 64rpx; border-radius: 18rpx; display: flex; align-items: center; justify-content: center; }
/* 🔴 应用图标底色四分（2026-10-16 修）：旧版四个类全写 var(--design-secondary)
      → 四张卡一模一样（默认还是粉底），类名承诺的橙/紫/绿/青一个没生效。
      改用全仓统一的「4 业务域色板」（见 pages/cardMain/gridDomainPalette.test.js），
      与首页宫格同一套语义：不跟随租户主题，四域互不相同、一眼可分。
      白图标在四域起点对比度均 ≥3:1（橙 3.58 / 蓝紫 4.3 / 青绿 3.30 / 石墨 8+）。 */
.ic-orange { background: linear-gradient(135deg,#e8590c,#f59e0b); }  /* 经营域：合伙人分红 */
.ic-purple { background: linear-gradient(135deg,#3b6ef7,#6a4bf5); }  /* 身份域：全民股东 */
.ic-green  { background: linear-gradient(135deg,#0a9f8f,#10b981); }  /* 关系域：类目股东 */
.ic-cyan   { background: linear-gradient(135deg,#5c6470,#3d424b); }  /* 工具域：区域股东 */
.app-ic :deep(.s-icon) { color: var(--white); }
.app-name-row { display: flex; align-items: center; justify-content: space-between; gap: 8rpx; }
.app-name { font-size: var(--fs-5); font-weight: 600; color: var(--t1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-state { flex-shrink: 0; font-size: var(--fs-1); padding: 2rpx 12rpx; border-radius: var(--radius-pill); }
.app-state.ok { color: #00b42a; background: rgba(0,180,42,0.10); }
.app-state.warn { color: var(--brand-orange); background: rgba(255,125,0,0.10); }
.app-desc { font-size: var(--fs-2); color: var(--t3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.empty-box { margin: 24rpx 32rpx; padding: 60rpx 20rpx; text-align: center; color: var(--t3); font-size: var(--fs-4); background: var(--white); border-radius: 20rpx; }
.qr-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 99; display: flex; align-items: center; justify-content: center; }
.qr-panel { width: 600rpx; background: var(--white); border-radius: var(--radius-lg); padding: 40rpx 32rpx 32rpx; display: flex; flex-direction: column; gap: 20rpx; max-height: 80vh; }
.qr-title { font-size: var(--fs-6); font-weight: 600; text-align: center; color: var(--t1); }
.qr-shareimg { width: 100%; border-radius: var(--radius-md); }
.qr-img { width: 400rpx; height: 400rpx; align-self: center; }
.qr-loading { text-align: center; color: var(--t3); padding: 100rpx 0; font-size: var(--fs-4); }
.qr-hint { text-align: center; color: var(--t3); font-size: var(--fs-3); }
.rules-scroll { max-height: 46vh; }
.rules-text { font-size: var(--fs-4); color: var(--t2); line-height: 2; }
.rule-p { padding: 4rpx 0; }
.poster-canvas-box { display: flex; justify-content: center; }
.poster-tpl-row { display: flex; gap: 16rpx; overflow-x: auto; padding: 8rpx 0; }
.poster-tpl-item { flex: 0 0 auto; width: 96rpx; height: 96rpx; border-radius: var(--radius-xs); border: 3rpx solid transparent; overflow: hidden; }
.poster-tpl-item.on { border-color: var(--design-primary); }
.poster-tpl-thumb { width: 100%; height: 100%; display: block; }
.poster-canvas { width: 300px; height: 450px; background: var(--bg-hover); border-radius: var(--radius-md); }
.mini-btn.ghost { background: var(--white); color: var(--t2); border: 1rpx solid var(--border); }
.total-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16rpx; }
.t-card { background: var(--bg-card); border-radius: var(--radius-md); padding: 28rpx 20rpx; text-align: center; }
.t-num { font-size: 40rpx; font-weight: 700; color: var(--t1); }
.t-lb { margin-top: 8rpx; font-size: var(--fs-3); color: var(--t3); }
</style>
