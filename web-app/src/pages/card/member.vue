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

    <!-- ===== 第22轮：我的权益（按应用分区全量展示：平台目录 ⊕ 租户矩阵，含已用量） ===== -->
    <block v-if="appBenefits.length">
      <view class="sec-t">我的权益<small>{{ currentLevelText || '免费版' }}</small></view>
      <view class="ent-card" v-for="app in appBenefits" :key="app.code">
        <view class="ent-app">{{ app.name }}</view>
        <view class="ent-row" v-for="it in app.items" :key="it.type">
          <text class="ent-k">{{ it.label }}</text>
          <text class="ent-v" :class="{ off: isEntOff(it) }">{{ entValueText(it) }}</text>
        </view>
      </view>
    </block>

    <!-- 1b 收敛：购买统一走租户会员等级（/member/buy 需租户上下文）。
         未入驻用户（platform_user.customer_id 为空）旧 A 路是唯一入口，现降级为引导文案，不做无声隐藏 -->
    <view v-if="tenantUnbound && !showTenantMember" class="unbound-tip">
      <view class="ut-title">会员开通</view>
      <view class="ut-sub">你还未入驻任何客户，暂无法购买会员卡。入驻后即可开通会员，解锁全部权益。</view>
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
import { cardApi, payOrder } from '../../utils/cardApi.js';
import LoginGateModal from '../../components/LoginGateModal.vue';
import { useInlineLogin } from '../../utils/loginGate.js';
// 🔴 #312-18c 原地登录守卫：requireLogin 返回 Promise，登录成功自动继续被拦下的动作
const { showLoginGate, requireLogin, cancelLogin, onLoginGateSuccess } = useInlineLogin();
import { heroGradient, brandPalette } from '../../utils/color.js';
import { trackPageView } from '../../utils/analytics.js';
import { saveCardTabState, restoreScrollTop, h5ScrollTop } from './utils/cardTabState.js';
import { getChannelTenantName } from './utils/joinMode.js';
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
const isMember = ref(false);
const memberLevel = ref('free');
const memberExpire = ref('');
// 第21轮：套餐权益实况（/member/status 的 entitlements），让「买了什么」在会员中心对得上
const entitlements = ref(null);
// 第22轮：按应用分区的全量权益（/member/status 的 appBenefits），含目录/矩阵/已用量
const appBenefits = ref([]);
// 套餐点选态（cur=真实会员等级，sel=点选高亮——用户反馈「选中状态不会变化」）
// 租户会员卡（1:1 复刻菜鸟云）
const memberCard = ref(null);
const tenantLevels = ref([]);
// 1b：未入驻租户（my-card 返回 unbound）→ 展示购买引导而非无声隐藏
const tenantUnbound = ref(false);
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
// 第20轮：渠道租户名（购买成功文案消费）
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
    memberExpire.value = memberRes.expireAt?.slice(0, 10) || '';
    entitlements.value = memberRes.entitlements || null;
    appBenefits.value = memberRes.appBenefits || [];
    // 租户会员卡：未入驻租户不展示区块（降级为购买引导）
    tenantUnbound.value = !!(tCardRes && tCardRes.unbound);
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

// ===== 租户会员卡：购买 / 申请 / 签到 =====
// 🔴 #312-18c：老 gotoLogin（toast + reLaunch 登录页）已删除——原地登录由
// useInlineLogin 的 requireLogin 提供，调用方 `if (!(await requireLogin())) return;`。

async function refreshMemberCard() {
  try {
    const res = await cardApi.memberMyCard();
    if (res && !res.unbound) memberCard.value = res.card;
  } catch (e) {}
}

/**
 * 购买会员卡（1b 收敛后全页唯一购买路径：租户等级 member_levels → /member/buy → productType=member_card）。
 *
 * 🔴 支付确认必须 await：`try{} finally{ paying=false }` 只包住「创建订单」的同步段，
 *    showModal 是异步的 → 弹窗还没点，`paying` 锁已释放 → 用户再点一个等级会重复下单。
 *    ✅ 把 showModal 包成 Promise，让锁覆盖到「支付回调结束」为止（与已下线的老 A 路同修法）。
 */
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

    const payConfirmed = await new Promise((resolve) => {
      uni.showModal({
        title: '确认支付',
        content: `确认支付 ¥${(res.amount / 100).toFixed(2)} 开通「${lv.name}」？`,
        success: (r) => resolve(!!r.confirm),
        fail: () => resolve(false),
      });
    });
    if (!payConfirmed) return;

    uni.showLoading({ title: '支付中...' });
    try {
      // 真实微信支付：预下单 → 调起支付（未配置真实商户号时服务端回落 mock）
      const pay = await payOrder(orderNo, { allowMock: true });
      uni.hideLoading();
      if (pay.paid) {
        uni.showToast({ title: pay.mock ? '开通成功（模拟）' : '开通成功', icon: 'success' });
        setTimeout(async () => {
          await refreshMemberCard();
          // 第20轮口径：purchase 模式购买含场席等级且授予成功 → 补一句场席说明
          try {
            const st = await cardApi.getMemberStatus();
            if (st.marketSubject && st.marketSubject.hasSeat) {
              uni.showToast({ title: `已开通会员，并获得${tenantName.value || '本租户'}集市场席`, icon: 'none' });
            }
          } catch (e) {}
        }, 600);
      } else if (pay.canceled) {
        uni.showToast({ title: '已取消支付', icon: 'none' });
      } else {
        uni.showToast({ title: pay.message || '支付失败', icon: 'none' });
      }
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

/** 折扣数值 → 中文几折（0.85 → 8.5 折） */
/**
 * 折扣文案（第22轮起 mall.discount 为百分比口径：0=无折扣，10=打9折，80=打二折）。
 * 🔴 旧版按小数口径（0.8→8折）已在百分比模型下彻底错乱，勿回退。
 */
function discountText(pct) {
  const n = Number(pct) || 0;
  if (n <= 0 || n >= 100) return n >= 100 ? '免单' : '无折扣';
  const zhe = (100 - n) / 10;
  return `${Number.isInteger(zhe) ? zhe : zhe.toFixed(1)} 折`;
}

/** 权益行取值文案：switch→开通态；折扣→折数；配额→已用/上限（0=不限）；其余→值+单位 */
function entValueText(it) {
  if (it.kind === 'switch') return it.value ? '已开通' : '未开通';
  if (it.type === 'discount') return discountText(it.value);
  if (it.used != null) return Number(it.value) > 0 ? `${it.used} / ${it.value}${it.unit ? ' ' + it.unit : ''}` : '不限';
  return `${it.value}${it.unit ? ' ' + it.unit : ''}`;
}

/** 权益行是否置灰（未开通/无折扣） */
function isEntOff(it) {
  if (it.kind === 'switch') return !it.value;
  if (it.type === 'discount') return !(Number(it.value) > 0);
  return false;
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

/* ===== 选择套餐区（1b 收敛：A 路 member_package 购买已下线，CSS 随模板一并移除） ===== */
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

/* 1b：未入驻租户的购买引导（替代无声隐藏） */
.unbound-tip {
  margin: 28rpx 28rpx 0; background: var(--white); border-radius: var(--radius-md);
  border: 1px solid var(--border); padding: 32rpx 28rpx;
}
.ut-title { font-size: var(--fs-5); font-weight: 600; color: var(--t5); }
.ut-sub { font-size: var(--fs-3); color: var(--t4); margin-top: 10rpx; line-height: 1.6; }

/* 第21轮：我的权益（套餐实况）；第22轮改按应用分区（每应用一张卡） */
.ent-app {
  padding: 20rpx 0 6rpx;
  font-size: var(--fs-3);
  font-weight: 600;
  color: var(--t1);
}
.ent-card {
  background: var(--white);
  border-radius: var(--radius-md);
  padding: 8rpx 24rpx;
  margin-bottom: 24rpx;
}
.ent-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 0;
  border-bottom: 2rpx solid var(--bg-2);
}
.ent-row:last-child {
  border-bottom: none;
}
.ent-k {
  font-size: var(--fs-3);
  color: var(--t2);
}
.ent-v {
  font-size: var(--fs-3);
  font-weight: 600;
  color: var(--design-primary);
}
.ent-v.off {
  font-weight: 400;
  color: var(--t4);
}

.dist-entry {
  display: flex; justify-content: space-between; align-items: center;
  margin: 24rpx 40rpx 0; background: linear-gradient(90deg, var(--design-secondary), var(--white));
  border: 1px solid rgba(var(--design-primary-rgb), 0.2); border-radius: var(--radius-xs); padding: 28rpx 32rpx;
}
.de-left { display: flex; align-items: center; gap: 24rpx; }
.de-icon { width: 88rpx; height: 88rpx; border-radius: 20rpx; background: rgba(var(--design-primary-rgb), 0.08); display: flex; align-items: center; justify-content: center; }
.de-title { font-size: 30rpx; font-weight: 600; color: var(--t1); }
.de-sub { font-size: var(--fs-3); color: var(--t3); margin-top: 4rpx; }
.de-arrow { font-size: var(--fs-8); color: var(--border-strong); }

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
