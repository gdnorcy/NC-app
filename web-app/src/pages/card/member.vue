<template>
  <view class="member-page" :style="[navVars, themeStyle, brandVars, tabBarPad]">
    <view class="hero g3" :style="heroStyle">
      <view class="row1">
        <view class="mb-back" @click="goBack"><SIcon name="back" size="large" :color="heroInk" /></view>
        <view class="hero-left">
          <view class="hero-title-row">
            <view class="hero-title">会员中心</view>
            <!-- FREE/等级徽章放标题旁（原先挂 row1 右端与胶囊同排，避让后仍显突兀） -->
            <view class="hero-badge"><SIcon name="crown" size="small" :color="heroInk" /> {{ memberLevel === 'free' ? 'FREE' : memberLevel.toUpperCase() }}</view>
          </view>
          <view class="hero-sub">当前：{{ currentLevelText }}{{ isMember ? ' · 有效期至 ' + memberExpire : ' · 尚未开通' }}</view>
        </view>
      </view>
    </view>

    <!-- 分销中心入口 -->
    <view class="dist-entry" @click="goDistribution">
      <view class="de-left">
        <view class="de-icon"><SIcon name="dist" size="large" :color="themeColor" /></view>
        <view>
          <view class="de-title">分销中心</view>
          <view class="de-sub">推广赚佣金 · 查看收益与提现</view>
        </view>
      </view>
      <view class="de-arrow">›</view>
    </view>

    <!-- ===== 租户会员卡（1:1 复刻菜鸟云会员中心） ===== -->
    <block v-if="showTenantMember">
      <!-- 会员卡 -->
      <view v-if="memberCard" class="tcard" :style="cardBg">
        <view class="tc-top">
          <view class="tc-level">{{ memberCard.levelName || '普通会员' }}</view>
          <view class="tc-badge" v-if="memberCard.levelNo">Lv{{ memberCard.levelNo }}</view>
        </view>
        <view class="tc-no">卡号：{{ memberCard.cardNo }}</view>
        <view class="tc-foot">
          <view class="tc-cell"><text class="tc-label">到期时间</text><text class="tc-val">{{ memberCard.expireAt || '永久有效' }}</text></view>
          <view class="tc-cell"><text class="tc-label">积分</text><text class="tc-val">{{ memberCard.score }}</text></view>
          <view class="tc-cell"><text class="tc-label">余额</text><text class="tc-val">¥{{ (memberCard.balance / 100).toFixed(2) }}</text></view>
        </view>
      </view>

      <!-- 签到 -->
      <view v-if="memberCard" class="sign-row">
        <view class="sign-info">
          <view class="si-title">每日签到</view>
          <view class="si-sub">签到 +2 积分，积分可用于会员权益</view>
        </view>
        <view class="sign-btn" @click="doSign">签到</view>
      </view>

      <!-- 等级购买/申请 -->
      <view class="sec-t">会员等级<small>升级解锁更多权益</small></view>
      <view class="tlevels">
        <view class="tlv" v-for="lv in tenantLevels" :key="lv.id" :class="{ cur: memberCard && memberCard.levelId === lv.id }">
          <view class="tlv-head">
            <view class="tlv-name">{{ lv.name }}</view>
            <view class="tlv-no">Lv{{ lv.level_no }}</view>
          </view>
          <view class="tlv-desc">{{ lv.description || (lv.upgrade_mode === 'apply' ? '申请模式：提交申请，审核通过后开通' : '消费模式：累计消费满额自动升级') }}</view>
          <view v-if="memberCard && memberCard.levelId === lv.id" class="tlv-btn on">当前等级</view>
          <view v-else-if="lv.upgrade_mode === 'consume' && lv.buy_price > 0" class="tlv-btn buy" @click="buyLevel(lv)">¥{{ (lv.buy_price / 100).toFixed(0) }} 购买</view>
          <view v-else-if="lv.upgrade_mode === 'apply'" class="tlv-btn apply" @click="applyLevel(lv)">申请开通</view>
          <view v-else class="tlv-btn disabled">满额自动升级</view>
        </view>
      </view>

      <!-- 申请状态提示 -->
      <view v-if="applyStatus" class="apply-tip" :class="'st-' + applyStatus.status">
        {{ applyTipText }}
      </view>
    </block>

    <!-- 选择套餐 -->
    <view class="sec-t">选择套餐<small>解锁更多能力</small></view>
    <view class="plan-grid">
      <view class="plan" v-for="p in packages" :key="p.level"
            :class="{ hot: p.level === 'gold', cur: isCurrent(p.level), sel: selectedLevel === p.level }"
            @click="selectPlan(p.level)">
        <view class="pn">
          {{ p.name }}
          <text v-if="isCurrent(p.level)" class="cur-tag">· 当前</text>
          <text v-else-if="p.level === 'gold'" class="hot-tag">最受欢迎</text>
        </view>
        <view class="price">¥{{ formatPrice(p.price) }}<text class="price-unit"> / 月</text></view>
        <view class="plan-features">
          <view class="pf" v-for="f in getFeatureTexts(p.features)" :key="f">
            <view class="check"><SIcon name="badge" size="small" :color="themeColor" /></view>
            <text>{{ f }}</text>
          </view>
          <view class="pf" v-if="p.voice_enabled === 1">
            <view class="check"><SIcon name="badge" size="small" :color="themeColor" /></view>
            <text>语音简介</text>
          </view>
          <view class="pf" v-if="p.discount && p.discount > 0 && p.discount < 1">
            <view class="check"><SIcon name="badge" size="small" :color="themeColor" /></view>
            <text>名片模板 {{ Math.round(p.discount * 10) }} 折</text>
          </view>
        </view>
        <view v-if="isCurrent(p.level) || p.level === 'free'" class="btn on" @click="p.level !== 'free' && openMember(p)">当前套餐</view>
        <view v-else class="btn buy" @click="openMember(p)">立即开通</view>
      </view>
    </view>

    <!-- 底部TabBar（公共组件） -->
    <CardTabBar active="member" />
  </view>
</template>

<script setup>
import { useTabBarPadding } from '../../utils/cardTabBarSpace.js';
import { heroBrandStyle } from '../../utils/templateTheme.js';
import PageNav from '../../components/PageNav.vue';
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { onUnload } from '@dcloudio/uni-app';
import { cardApi, paymentApi } from '../../utils/cardApi.js';
import { loginEntryUrl, LOGIN_PATH } from '../../utils/loginEntry.js';
import { heroGradient, brandPalette } from '../../utils/color.js';
import { trackPageView } from '../../utils/analytics.js';
import { saveCardTabState, restoreScrollTop, h5ScrollTop } from './utils/cardTabState.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';
import { navVarsStyle } from '../../utils/navMetrics.js';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';

const navVars = navVarsStyle();
const themeStyle = useDesignTheme();
// 底部导航条实测占位（高度随设计方案浮动，禁止写死 → 见 utils/cardTabBarSpace.js）
const tabBarPad = useTabBarPadding();
const { brandVars, brandPrimary } = useBrandOverride();
// SIcon 不能消费 var()（构建期烘焙 hex），用真实 hex 喂图标：主题主色，回落品牌蓝
// （勿改 --design-subtext：那是租户可配文字辅色，配了会与其他页图标色漂移）
const themeColor = computed(() => brandPrimary.value || (themeStyle.value && themeStyle.value['--design-primary']) || '#165dff');
const packages = ref([]);
const isMember = ref(false);
const memberLevel = ref('free');
const memberExpire = ref('');
// 套餐点选态（cur=真实会员等级，sel=点选高亮——用户反馈「选中状态不会变化」）
const selectedLevel = ref('free');
function selectPlan(level) { selectedLevel.value = level; }
// 租户会员卡（1:1 复刻菜鸟云）
const memberCard = ref(null);
const tenantLevels = ref([]);
const signing = ref(false);
const applyStatus = ref(null);
const showTenantMember = computed(() => !!memberCard.value || tenantLevels.value.length > 0);
// 品牌 5 色 hero：本人名片优先，无则回退品牌蓝渐变（对象形式，与 cardDetail 一致）
const brand = ref({ primary: '', gradient: '', secondary: '', text: '', subText: '' });
// hero 前景（SIcon / PageNav 需要真实 hex，吃不了 var()）：与 heroStyle 同判据产出，
// 品牌亮黄时自动转深灰，避免白图标白字消失在黄底上
const heroInk = computed(() => heroStyle.value.color);
const heroStyle = computed(() => heroBrandStyle(brand.value, 'linear-gradient(155deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff))'));
const paying = ref(false);

// 会员卡背景：等级背景色 → 默认蓝渐变
const cardBg = computed(() => {
  const c = memberCard.value;
  if (c && c.levelBgColor) return { background: c.levelBgColor };
  return { background: 'linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff))' };
});

const applyTipText = computed(() => {
  const s = applyStatus.value;
  if (!s) return '';
  if (s.status === 'pending') return '你的会员申请正在审核中，请耐心等待';
  if (s.status === 'approved') return '你的会员申请已通过';
  return `你的会员申请已被驳回：${s.reason || '未填写原因'}`;
});


function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: '/pages/cardMain/home' });
}
function goDistribution() {
  uni.navigateTo({ url: '/pages/card/distribution' });
}

const currentLevelText = computed(() => ({ free: '免费版', silver: '白银会员', gold: '黄金会员', diamond: '钻石会员' }[memberLevel.value] || ''));

onShow(() => { trackPageView('/pages/card/member'); });

onMounted(async () => {
  console.log('[member] mounted start');
  restoreScrollTop('member');
  // 公共数据：套餐列表不依赖登录态，独立加载（任何登录接口失败不得拖垮套餐展示）
  try {
    const pkgRes = await cardApi.getPackages();
    packages.value = (pkgRes.packages || []).filter((p) => p.enabled !== 0);
  } catch (e) {
    console.warn('套餐列表加载失败', e);
  }
  // 登录类数据：未登录/游客降级为默认态，不阻塞页面
  try {
    const [memberRes, cardsRes, tCardRes, tLevelsRes] = await Promise.all([
      cardApi.getMemberStatus(),
      cardApi.getCardsSafe(),
      cardApi.memberMyCard(),
      cardApi.memberLevels(),
    ]);
    const myCard0 = (cardsRes.cards || [])[0];
    if (myCard0) { const b = brandPalette(myCard0); if (b.primary) Object.assign(brand.value, b); }
    isMember.value = memberRes.isMember;
    memberLevel.value = memberRes.level;
    selectedLevel.value = memberRes.level || 'free';
    memberExpire.value = memberRes.expireAt?.slice(0, 10) || '';
    // 租户会员卡：未入驻租户不展示区块
    if (tCardRes && !tCardRes.unbound) {
      memberCard.value = tCardRes.card;
      tenantLevels.value = tCardRes.levels || [];
      applyStatus.value = tCardRes.applyStatus || null;
    }
  } catch (e) {
    console.warn('会员信息加载失败（未登录或接口异常，保持默认态）', e);
  }
});

// 离开时保存滚动位置，切Tab返回后恢复
onUnload(() => {
  saveCardTabState('member', { scrollTop: h5ScrollTop() });
});

function isCurrent(level) {
  return level === memberLevel.value || (level === 'free' && !isMember.value);
}

// ===== 租户会员卡：购买 / 申请 / 签到 =====
/**
 * 未登录引导：toast + 跳登录页（loginEntryUrl 必带 manual=1，登录页兼任冷启动首页，
 * 不带会被 onShow 首页联动立刻弹走）+ redirect 回跳本页——与 cardDetail.ensureLogin 同款。
 */
function gotoLogin() {
  uni.showToast({ title: '请先登录', icon: 'none' });
  uni.reLaunch({ url: loginEntryUrl(LOGIN_PATH, '/pages/card/member') });
  return false;
}

async function refreshMemberCard() {
  try {
    const res = await cardApi.memberMyCard();
    if (res && !res.unbound) memberCard.value = res.card;
  } catch (e) {}
}

async function buyLevel(lv) {
  if (paying.value) return;
  const userInfo = uni.getStorageSync('card_user') || {};
  if (!userInfo.id) return gotoLogin();
  paying.value = true;
  uni.showLoading({ title: '创建订单...' });
  try {
    const res = await cardApi.memberBuy({ levelId: lv.id, channel: 'wechat' });
    const orderNo = res.orderNo;
    uni.hideLoading();
    uni.showModal({
      title: '确认支付',
      content: `确认支付 ¥${(res.amount / 100).toFixed(2)} 开通「${lv.name}」？`,
      success: async (r) => {
        if (!r.confirm) return;
        uni.showLoading({ title: '支付中...' });
        try {
          await paymentApi.mockPay(orderNo);
          uni.hideLoading();
          uni.showToast({ title: '开通成功', icon: 'success' });
          setTimeout(refreshMemberCard, 600);
        } catch (e) {
          uni.hideLoading();
          uni.showToast({ title: e.message || '支付失败', icon: 'none' });
        }
      },
    });
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: e.message || '创建订单失败', icon: 'none' });
  } finally {
    paying.value = false;
  }
}

async function applyLevel(lv) {
  const userInfo = uni.getStorageSync('card_user') || {};
  if (!userInfo.id) return gotoLogin();
  uni.showModal({
    title: '申请开通',
    content: `确认申请开通「${lv.name}」会员？审核通过后自动开卡。`,
    success: async (r) => {
      if (!r.confirm) return;
      uni.showLoading({ title: '提交中...' });
      try {
        await cardApi.memberApply({ name: userInfo.nickname || '', phone: userInfo.phone || '', levelId: lv.id });
        uni.hideLoading();
        uni.showToast({ title: '已提交申请', icon: 'success' });
        setTimeout(refreshMemberCard, 600);
      } catch (e) {
        uni.hideLoading();
        uni.showToast({ title: e.message || '提交失败', icon: 'none' });
      }
    },
  });
}

async function doSign() {
  if (signing.value) return;
  signing.value = true;
  try {
    const res = await cardApi.memberSign();
    uni.showToast({ title: `签到成功 +${res.score || 2} 积分`, icon: 'success' });
    setTimeout(refreshMemberCard, 600);
  } catch (e) {
    uni.showToast({ title: e.message || '签到失败', icon: 'none' });
  } finally {
    signing.value = false;
  }
}

function formatPrice(price) {
  return Number(price).toFixed(price % 1 === 0 ? 0 : 1);
}

function getFeatureTexts(features) {
  const map = {
    basic_card: '基础名片模板',
    basic_visitor: '访客雷达 · 每日 10 条',
    advanced_visitor: '访客雷达 · 每日 100 条',
    basic_customer: '客户管理 · 30 个',
    advanced_customer: '客户管理 · 不限',
    all_template: '全部精美模板',
    free_template: '分享名片',
    market_full: '人脉集市',
    no_ads: '名片去水印',
    badge: '会员专属标识',
    priority_support: '专属客服',
    advanced_stats: '商机数据分析',
    // VIP 权益扩展（db.js featureMigrate 新增枚举，缺映射会在套餐里直接显示英文 key）
    ai_report: 'AI 意向报告',
    ai_words: 'AI 沟通话术',
    quota_lead: '留资线索额度',
    quota_push: '访客动态推送',
    enterprise: '企业团队管理',
  };
  return (features || []).map((f) => map[f] || f);
}

async function openMember(pkg) {
  if (!pkg || pkg.level === 'free' || paying.value) return;

  paying.value = true;
  uni.showLoading({ title: '创建订单...' });

  try {
    const userInfo = uni.getStorageSync('card_user') || {};
    const orderRes = await paymentApi.createOrder({
      payerType: 'tenant',
      customerId: userInfo.enterpriseId || 1,
      userId: userInfo.id || 0,
      solution: 'card',
      productType: 'member',
      productId: String(pkg.id),
      productName: pkg.name,
      amount: Math.round(pkg.price * 100),
      channel: 'wechat',
      remark: `智能名片-${pkg.name}`,
    });
    const order = orderRes.order;
    uni.hideLoading();

    // 🔴 支付确认必须 await：`try{} finally{ paying=false }` 只包住「创建订单」的同步段，
    //    showModal 是异步的 → 弹窗还没点，`paying` 锁已释放 → 用户再点另一个套餐会重复下单。
    //    ✅ 把 showModal 包成 Promise，让锁覆盖到「支付回调结束」为止。
    const payConfirmed = await new Promise((resolve) => {
      uni.showModal({
        title: '确认支付',
        content: `确认支付 ¥${formatPrice(pkg.price)} 开通${pkg.name}？`,
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!payConfirmed) return;

    uni.showLoading({ title: '支付中...' });
    try {
      await paymentApi.mockPay(order.orderNo);
      uni.hideLoading();
      uni.showToast({ title: '支付成功', icon: 'success' });
      setTimeout(async () => {
        try {
          const memberRes = await cardApi.getMemberStatus();
          isMember.value = memberRes.isMember;
          memberLevel.value = memberRes.level;
          memberExpire.value = memberRes.expireAt?.slice(0, 10) || '';
        } catch (e) {}
      }, 500);
    } catch (e) {
      uni.hideLoading();
      uni.showToast({ title: e.message || '支付失败', icon: 'none' });
    }
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: e.message || '创建订单失败', icon: 'none' });
  } finally {
    paying.value = false;
  }
}
</script>

<style scoped>
.member-page {
  min-height: 100vh;
  background: var(--bg-page);
  /* 兜底值：真实占位由根视图内联的 tabBarPad 给出（CardTabBar 实测高度 + 24rpx 呼吸间隙）。
     🔴 旧版只靠这个写死的 160rpx，而导航条在「凸起/嵌入 + 安全区」下可达 190rpx+
        → 最后一个套餐卡被导航条压住（真机报修）。勿删内联 tabBarPad。 */
  padding-bottom: 160rpx;
}

/* ===== hero（主题渐变；内联 heroStyle 恒定覆盖此兜底，保持一致防内联失效露 demo 色）===== */
/* 沉浸式：状态栏占位按机型动态取（刘海机 ~44px / 非刘海 ~20px），
   右侧留出胶囊宽度（最小化 + 三个点），不再用写死的 88rpx。 */
.hero.g3 {
  position: relative;
  /* 完整避让：状态栏 + 导航行高。右上 FREE 徽章与胶囊同高，只避状态栏(+30rpx)会撞胶囊 */
  padding: calc(var(--pnv-status-bar, 20px) + var(--pnv-nav-h, 44px) + 8rpx) 40rpx 44rpx;
  padding-right: calc(var(--pnv-capsule-pad, 7px) + 40rpx);
  color: var(--design-text, #fff);
  background: linear-gradient(155deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff));
  overflow: hidden;
}
.mb-back { width: 44rpx; height: 44rpx; display: flex; align-items: center; justify-content: center; margin-right: 8rpx; flex-shrink: 0; }
.hero-left { flex: 1; min-width: 0; }
.hero-title-row { display: flex; align-items: center; gap: 14rpx; }
.row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}
.hero-title {
  font-size: 36rpx;
  font-weight: 700;
}
.hero-sub {
  font-size: 24rpx;
  opacity: 0.85;
  margin-top: 12rpx;
}
.hero-badge {
  font-size: 21rpx;
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.25);
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ===== 套餐列表（demo plan-grid）===== */
.sec-t {
  margin: 36rpx 32rpx 20rpx;
  font-size: 28rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  /* 副标题内联跟在标题后（勿用 space-between 顶到最右侧——悬空在卡片右上角不和谐） */
  gap: 12rpx;
  color: var(--t5);
}
.sec-t small {
  font-size: 22rpx;
  color: var(--t4);
  font-weight: 400;
}
.plan-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24rpx;
  margin: 0 28rpx;
}
.plan {
  background: var(--white);
  border-radius: 32rpx;
  padding: 36rpx;
  border: 1.5px solid var(--border);
  position: relative;
  transition: border-color 0.2s, box-shadow 0.2s;
}
/* 「最受欢迎」保留常驻主题色边框（用户复评：仅角标文案不显眼；选中环 sel 更粗可区分） */
.plan.hot {
  border-color: var(--design-primary);
  box-shadow: 0 4px 16px rgba(var(--design-primary-rgb), 0.08);
}
/* 点选高亮（sel）：cur=真实当前等级（含「· 当前」文案），sel 只跟随点按 */
.plan.sel {
  border-color: var(--design-primary);
  box-shadow: 0 0 0 2px var(--design-primary), 0 4px 16px rgba(var(--design-primary-rgb), 0.12);
}
.pn {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--t5);
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.cur-tag {
  font-size: 22rpx;
  color: var(--design-primary);
  font-weight: 400;
}
.hot-tag {
  font-size: 20rpx;
  /* 实底主题色白字（用户反馈描边角标不明显） */
  color: var(--design-text, #fff);
  background: var(--design-primary);
  padding: 4rpx 14rpx;
  border-radius: 12rpx;
  font-weight: 400;
}
.price {
  font-size: 44rpx;
  font-weight: 700;
  color: var(--design-primary);
  margin: 16rpx 0 8rpx;
}
.price-unit {
  font-style: normal;
  font-size: 22rpx;
  font-weight: 400;
  color: var(--t4);
  margin-left: 4rpx;
}
.plan-features {
  list-style: none;
  font-size: 24rpx;
  color: var(--t2);
  line-height: 2;
  margin-top: 8rpx;
}
.pf {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.check {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.btn {
  width: 100%;
  box-sizing: border-box;
  margin-top: 24rpx;
  padding: 22rpx;
  border-radius: 20rpx;
  font-size: 28rpx;
  font-weight: 600;
  text-align: center;
  transition: opacity 0.15s;
}
.btn.buy {
  background: var(--design-primary);
  color: var(--design-text, #fff);
}
.btn.on {
  background: var(--design-secondary);
  color: var(--design-primary);
}
.btn:active {
  opacity: 0.75;
}

.dist-entry {
  display: flex; justify-content: space-between; align-items: center;
  margin: 12px 20px 0; background: linear-gradient(90deg, var(--design-secondary), #fff);
  border: 1px solid rgba(var(--design-primary-rgb), 0.2); border-radius: 12px; padding: 14px 16px;
}
.de-left { display: flex; align-items: center; gap: 12px; }
.de-icon { width: 44px; height: 44px; border-radius: 10px; background: rgba(var(--design-primary-rgb), 0.08); display: flex; align-items: center; justify-content: center; }
.de-title { font-size: 15px; font-weight: 600; color: var(--t1); }
.de-sub { font-size: 12px; color: var(--t3); margin-top: 2px; }
.de-arrow { font-size: 22px; color: var(--border-strong); }

/* ===== 租户会员卡 ===== */
.tcard {
  margin: 28rpx 28rpx 0; border-radius: 24rpx; padding: 36rpx 32rpx;
  color: var(--white); position: relative; overflow: hidden; box-shadow: 0 8px 24px rgba(var(--design-primary-rgb), 0.18);
}
.tcard::after {
  content: ''; position: absolute; right: -60rpx; top: -60rpx; width: 240rpx; height: 240rpx;
  border-radius: 50%; background: rgba(255,255,255,0.12);
}
.tc-top { display: flex; align-items: center; justify-content: space-between; position: relative; z-index: 1; }
.tc-level { font-size: 40rpx; font-weight: 700; }
.tc-badge { font-size: 22rpx; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); padding: 6rpx 18rpx; border-radius: 999rpx; }
.tc-no { font-size: 24rpx; opacity: 0.9; margin-top: 10rpx; position: relative; z-index: 1; }
.tc-foot { display: flex; margin-top: 36rpx; position: relative; z-index: 1; }
.tc-cell { flex: 1; }
.tc-label { display: block; font-size: 21rpx; opacity: 0.8; }
.tc-val { display: block; font-size: 28rpx; font-weight: 600; margin-top: 6rpx; }
.sign-row {
  display: flex; align-items: center; justify-content: space-between;
  margin: 24rpx 28rpx 0; background: var(--white); border-radius: 20rpx; padding: 26rpx 28rpx;
  border: 1px solid var(--border);
}
.si-title { font-size: 28rpx; font-weight: 600; color: var(--t5); }
.si-sub { font-size: 22rpx; color: var(--t4); margin-top: 6rpx; }
.sign-btn { background: var(--design-primary); color: var(--design-text, #fff); font-size: 26rpx; font-weight: 600; padding: 16rpx 44rpx; border-radius: 999rpx; }
.sign-btn:active { opacity: 0.8; }
.tlevels { margin: 0 28rpx; display: flex; flex-direction: column; gap: 20rpx; }
.tlv { background: var(--white); border-radius: 20rpx; padding: 28rpx; border: 1.5px solid var(--border); }
.tlv.cur { border-color: var(--design-primary); background: var(--design-secondary); }
.tlv-head { display: flex; align-items: center; justify-content: space-between; }
.tlv-name { font-size: 30rpx; font-weight: 700; color: var(--t5); }
.tlv-no { font-size: 22rpx; color: var(--design-primary); background: var(--design-secondary); padding: 4rpx 16rpx; border-radius: 10rpx; }
.tlv-desc { font-size: 23rpx; color: var(--t4); margin-top: 10rpx; line-height: 1.5; }
.tlv-btn { margin-top: 20rpx; text-align: center; padding: 18rpx; border-radius: 16rpx; font-size: 27rpx; font-weight: 600; }
.tlv-btn.buy { background: var(--design-primary); color: var(--design-text, #fff); }
/* b 案：申请开通改次级样式（辅助色底 + 主色字），实心主色为整页唯一强 CTA */
.tlv-btn.apply { background: var(--design-secondary); color: var(--design-primary); border: 1px solid rgba(var(--design-primary-rgb), 0.35); }
.tlv-btn.on { background: var(--design-secondary); color: var(--design-primary); }
.tlv-btn.disabled { background: var(--bg-hover); color: var(--border-strong); }
.tlv-btn:active { opacity: 0.8; }
.apply-tip { margin: 20rpx 28rpx 0; padding: 20rpx 24rpx; border-radius: 16rpx; font-size: 24rpx; line-height: 1.5; }
.apply-tip.st-pending { background: #fff7e6; color: #ad6800; border: 1px solid #ffd591; }
.apply-tip.st-approved { background: #e7f7ee; color: #07893c; border: 1px solid #a9e7c1; }
.apply-tip.st-rejected { background: #fdecec; color: #b42318; border: 1px solid #f8c4c4; }
</style>
