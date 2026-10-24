<template>
  <view class="member-page" :style="[navVars, themeStyle, brandVars, tabBarPad]">
    <view class="hero g3" :style="heroStyle">
      <!-- 🔴 2026-10-21 真机报修「会员中心也有上轮的换行问题」：原 hero 用
           padding-top(状态栏+导航行高) 把「返回+标题」整体推到胶囊行下方，
           与上轮 cardDetail/create 修复前同病。改为 PageNav 沉浸式导航行
           （返回+标题与胶囊同排，bg 透明融入渐变），hero 渐变区只留副标题。 -->
      <view class="hero-nav">
        <PageNav title="会员中心" back bg="transparent" :color="heroInk" font-size="30rpx" />
      </view>
      <view class="hero-sub">当前：{{ currentLevelText }}{{ isMember ? ' · 有效期至 ' + memberExpire : ' · 尚未开通' }}</view>
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
          <!-- 第20轮：含集市场席的套餐，仅在租户 purchase 模式展示（code 模式走口令，买了也不自动入场） -->
          <view class="pf" v-if="p.market_subject === 1 && joinMode === 'purchase'">
            <view class="check"><SIcon name="badge" size="small" :color="themeColor" /></view>
            <text>含集市入驻资格——购买后自动入驻{{ tenantName || '本租户' }}，可上架至名片集市</text>
          </view>
        </view>
        <view v-if="isCurrent(p.level) || p.level === 'free'" class="btn on" @click="p.level !== 'free' && openMember(p)">当前套餐</view>
        <view v-else class="btn buy" @click="openMember(p)">立即开通</view>
      </view>
    </view>

    <!-- 🔴 #312-18c 动作守卫改原地登录：购买/申请未登录时当页弹浮层，登录成功自动继续 -->
    <LoginGateModal :show="showLoginGate" @close="cancelLogin" @success="onLoginGateSuccess" />
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
import { cardApi, paymentApi, payOrder } from '../../utils/cardApi.js';
import LoginGateModal from '../../components/LoginGateModal.vue';
import { useInlineLogin } from '../../utils/loginGate.js';
// 🔴 #312-18c 原地登录守卫：requireLogin 返回 Promise，登录成功自动继续被拦下的动作
const { showLoginGate, requireLogin, cancelLogin, onLoginGateSuccess } = useInlineLogin();
import { heroGradient, brandPalette } from '../../utils/color.js';
import { trackPageView } from '../../utils/analytics.js';
import { saveCardTabState, restoreScrollTop, h5ScrollTop } from './utils/cardTabState.js';
import { getTid } from '../../utils/mallUtil.js';
import { getIndividualJoinMode, getChannelTenantName } from './utils/joinMode.js';
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
// 第20轮：租户个人入驻双模 + 渠道租户名（套餐权益行/购买成功文案消费）
const joinMode = computed(() => getIndividualJoinMode());
const tenantName = computed(() => getChannelTenantName());

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
// 🔴 #312-18c：老 gotoLogin（toast + reLaunch 登录页）已删除——原地登录由
// useInlineLogin 的 requireLogin 提供，调用方 `if (!(await requireLogin())) return;`。

async function refreshMemberCard() {
  try {
    const res = await cardApi.memberMyCard();
    if (res && !res.unbound) memberCard.value = res.card;
  } catch (e) {}
}

async function buyLevel(lv) {
  if (paying.value) return;
  const userInfo = uni.getStorageSync('card_user') || {};
  if (!userInfo.id && !(await requireLogin())) return;
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
          // 真实微信支付：预下单 → 调起支付（未配置真实商户号时服务端回落 mock）
          const pay = await payOrder(orderNo, { allowMock: true });
          uni.hideLoading();
          if (pay.paid) {
            uni.showToast({ title: pay.mock ? '开通成功（模拟）' : '开通成功', icon: 'success' });
            setTimeout(refreshMemberCard, 600);
          } else if (pay.canceled) {
            uni.showToast({ title: '已取消支付', icon: 'none' });
          } else {
            uni.showToast({ title: pay.message || '支付失败', icon: 'none' });
          }
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
  if (!userInfo.id && !(await requireLogin())) return;
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
    // 🔴 归属修复（第20轮）：原来 customerId 传 enterpriseId || 1——个人用户全被记到租户1，
    //    钱进错租户、赠错场席。现在以渠道租户上下文（mall_tid/channel_config）为准，
    //    取不到再回落账号企业绑定；都没有则不传，由服务端 comboAuth 兜底解析。
    const tid = getTid() || userInfo.enterpriseId || '';
    const orderRes = await paymentApi.createOrder({
      payerType: 'tenant',
      ...(tid ? { customerId: Number(tid) } : {}),
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
      const pay = await payOrder(order.orderNo, { allowMock: true });
      uni.hideLoading();
      if (!pay.paid) {
        if (pay.canceled) uni.showToast({ title: '已取消支付', icon: 'none' });
        else uni.showToast({ title: pay.message || '支付失败', icon: 'none' });
        return;
      }
      uni.showToast({ title: pay.mock ? '支付成功（模拟）' : '支付成功', icon: 'success' });
      setTimeout(async () => {
        try {
          const memberRes = await cardApi.getMemberStatus();
          isMember.value = memberRes.isMember;
          memberLevel.value = memberRes.level;
          memberExpire.value = memberRes.expireAt?.slice(0, 10) || '';
          // 第20轮：purchase 模式购买含场席套餐且授予成功 → 补一句场席说明
          if (memberRes.marketSubject && memberRes.marketSubject.hasSeat) {
            uni.showToast({ title: `已开通会员，并获得${tenantName.value || '本租户'}集市场席`, icon: 'none' });
          }
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
  /* 状态栏+导航行占位由 PageNav 自理（与 create/cardDetail 同方案）；
     hero 渐变区只留副标题行。右侧仍避让胶囊宽度。 */
  padding: 0 40rpx 36rpx;
  padding-right: calc(var(--pnv-capsule-pad, 7px) + 40rpx);
  color: var(--design-text, #fff);
  background: linear-gradient(155deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff));
  overflow: hidden;
}
/* PageNav 负 margin 通栏：抵消 hero 的 40rpx 左右内边距，让导航条背景（透明）通栏 */
.hero-nav { margin: 0 -40rpx; }
.hero-sub { font-size: var(--fs-3); opacity: 0.85; padding-top: 8rpx; }

/* ===== 套餐列表（demo plan-grid）===== */
.sec-t {
  margin: 36rpx 32rpx 20rpx;
  font-size: var(--fs-5);
  font-weight: 600;
  display: flex;
  align-items: center;
  /* 副标题内联跟在标题后（勿用 space-between 顶到最右侧——悬空在卡片右上角不和谐） */
  gap: 12rpx;
  color: var(--t5);
}
.sec-t small {
  font-size: var(--fs-2);
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
  font-size: var(--fs-5);
  font-weight: 600;
  color: var(--t5);
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.cur-tag {
  font-size: var(--fs-2);
  color: var(--design-primary);
  font-weight: 400;
}
.hot-tag {
  font-size: var(--fs-1);
  /* 实底主题色白字（用户反馈描边角标不明显） */
  color: var(--design-text, #fff);
  background: var(--design-primary);
  padding: 4rpx 14rpx;
  border-radius: var(--radius-xs);
  font-weight: 400;
}
.price {
  font-size: var(--fs-8);
  font-weight: 700;
  color: var(--design-primary);
  margin: 16rpx 0 8rpx;
}
.price-unit {
  font-style: normal;
  font-size: var(--fs-2);
  font-weight: 400;
  color: var(--t4);
  margin-left: 4rpx;
}
.plan-features {
  list-style: none;
  font-size: var(--fs-3);
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
  font-size: var(--fs-5);
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
  margin: 24rpx 40rpx 0; background: linear-gradient(90deg, var(--design-secondary), #fff);
  border: 1px solid rgba(var(--design-primary-rgb), 0.2); border-radius: var(--radius-xs); padding: 28rpx 32rpx;
}
.de-left { display: flex; align-items: center; gap: 24rpx; }
.de-icon { width: 88rpx; height: 88rpx; border-radius: 20rpx; background: rgba(var(--design-primary-rgb), 0.08); display: flex; align-items: center; justify-content: center; }
.de-title { font-size: 30rpx; font-weight: 600; color: var(--t1); }
.de-sub { font-size: 24rpx; color: var(--t3); margin-top: 4rpx; }
.de-arrow { font-size: 44rpx; color: var(--border-strong); }

/* ===== 租户会员卡 ===== */
.tcard {
  margin: 28rpx 28rpx 0; border-radius: var(--radius-lg); padding: 36rpx 32rpx;
  color: var(--white); position: relative; overflow: hidden; box-shadow: 0 8px 24px rgba(var(--design-primary-rgb), 0.18);
}
.tcard::after {
  content: ''; position: absolute; right: -60rpx; top: -60rpx; width: 240rpx; height: 240rpx;
  border-radius: 50%; background: rgba(255,255,255,0.12);
}
.tc-top { display: flex; align-items: center; justify-content: space-between; position: relative; z-index: 1; }
.tc-level { font-size: 40rpx; font-weight: 700; }
.tc-badge { font-size: var(--fs-2); background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); padding: 6rpx 18rpx; border-radius: var(--radius-pill); }
.tc-no { font-size: var(--fs-3); opacity: 0.9; margin-top: 10rpx; position: relative; z-index: 1; }
.tc-foot { display: flex; margin-top: 36rpx; position: relative; z-index: 1; }
.tc-cell { flex: 1; }
.tc-label { display: block; font-size: 21rpx; opacity: 0.8; }
.tc-val { display: block; font-size: var(--fs-5); font-weight: 600; margin-top: 6rpx; }
.sign-row {
  display: flex; align-items: center; justify-content: space-between;
  margin: 24rpx 28rpx 0; background: var(--white); border-radius: 20rpx; padding: 26rpx 28rpx;
  border: 1px solid var(--border);
}
.si-title { font-size: var(--fs-5); font-weight: 600; color: var(--t5); }
.si-sub { font-size: var(--fs-2); color: var(--t4); margin-top: 6rpx; }
.sign-btn { background: var(--design-primary); color: var(--design-text, #fff); font-size: var(--fs-4); font-weight: 600; padding: 16rpx 44rpx; border-radius: var(--radius-pill); }
.sign-btn:active { opacity: 0.8; }
.tlevels { margin: 0 28rpx; display: flex; flex-direction: column; gap: 20rpx; }
.tlv { background: var(--white); border-radius: 20rpx; padding: 28rpx; border: 1.5px solid var(--border); }
.tlv.cur { border-color: var(--design-primary); background: var(--design-secondary); }
.tlv-head { display: flex; align-items: center; justify-content: space-between; }
.tlv-name { font-size: 30rpx; font-weight: 700; color: var(--t5); }
.tlv-no { font-size: var(--fs-2); color: var(--design-primary); background: var(--design-secondary); padding: 4rpx 16rpx; border-radius: 10rpx; }
.tlv-desc { font-size: 23rpx; color: var(--t4); margin-top: 10rpx; line-height: 1.5; }
.tlv-btn { margin-top: 20rpx; text-align: center; padding: 18rpx; border-radius: var(--radius-md); font-size: 27rpx; font-weight: 600; }
.tlv-btn.buy { background: var(--design-primary); color: var(--design-text, #fff); }
/* b 案：申请开通改次级样式（辅助色底 + 主色字），实心主色为整页唯一强 CTA */
.tlv-btn.apply { background: var(--design-secondary); color: var(--design-primary); border: 1px solid rgba(var(--design-primary-rgb), 0.35); }
.tlv-btn.on { background: var(--design-secondary); color: var(--design-primary); }
.tlv-btn.disabled { background: var(--bg-hover); color: var(--border-strong); }
.tlv-btn:active { opacity: 0.8; }
.apply-tip { margin: 20rpx 28rpx 0; padding: 20rpx 24rpx; border-radius: var(--radius-md); font-size: var(--fs-3); line-height: 1.5; }
.apply-tip.st-pending { background: #fff7e6; color: #ad6800; border: 1px solid #ffd591; }
.apply-tip.st-approved { background: #e7f7ee; color: #07893c; border: 1px solid #a9e7c1; }
.apply-tip.st-rejected { background: #fdecec; color: #b42318; border: 1px solid #f8c4c4; }
</style>
