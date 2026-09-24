<template>
  <view class="member-page">
    <!-- hero（demo g3 青绿渐变） -->
    <view class="hero g3" :style="heroStyle">
      <view class="row1">
        <view class="hero-left">
          <view class="hero-title">会员中心</view>
          <view class="hero-sub">当前：{{ currentLevelText }}{{ isMember ? ' · 有效期至 ' + memberExpire : ' · 尚未开通' }}</view>
        </view>
        <view class="hero-badge"><SIcon name="crown" size="small" color="#ffffff" /> {{ memberLevel === 'free' ? 'FREE' : memberLevel.toUpperCase() }}</view>
      </view>
    </view>

    <!-- 分销中心入口 -->
    <view class="dist-entry" @click="goDistribution">
      <view class="de-left">
        <view class="de-icon"><SIcon name="dist" size="large" color="#165dff" /></view>
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
            :class="{ hot: p.level === 'gold', cur: isCurrent(p.level) }">
        <view class="pn">
          {{ p.name }}
          <text v-if="isCurrent(p.level)" class="cur-tag">· 当前</text>
          <text v-else-if="p.level === 'gold'" class="hot-tag">最受欢迎</text>
        </view>
        <view class="price">¥{{ formatPrice(p.price) }}<i> / 月</i></view>
        <view class="plan-features">
          <view class="pf" v-for="f in getFeatureTexts(p.features)" :key="f">
            <view class="check"><SIcon name="badge" size="small" color="#07c160" /></view>
            <text>{{ f }}</text>
          </view>
          <view class="pf" v-if="p.voice_enabled === 1">
            <view class="check"><SIcon name="badge" size="small" color="#07c160" /></view>
            <text>语音简介</text>
          </view>
          <view class="pf" v-if="p.discount && p.discount > 0 && p.discount < 1">
            <view class="check"><SIcon name="badge" size="small" color="#07c160" /></view>
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
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { onUnload } from '@dcloudio/uni-app';
import { cardApi, paymentApi } from '../../utils/cardApi.js';
import { heroGradient } from '../../utils/color.js';
import { trackPageView } from '../../utils/analytics.js';
import { saveCardTabState, restoreScrollTop, h5ScrollTop } from '../../utils/cardTabState.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';

const packages = ref([]);
const isMember = ref(false);
const memberLevel = ref('free');
const memberExpire = ref('');
// 租户会员卡（1:1 复刻菜鸟云）
const memberCard = ref(null);
const tenantLevels = ref([]);
const signing = ref(false);
const applyStatus = ref(null);
const showTenantMember = computed(() => !!memberCard.value || tenantLevels.value.length > 0);
// 品牌色 hero：租户配置 brandColor，无则回退 demo g3 青绿渐变（对象形式，与 cardDetail 一致）
const heroStyle = computed(() => ({ background: heroGradient(brandColor.value, 'linear-gradient(155deg, #0f766e, #14b8a6)') }));
const brandColor = ref('');
const paying = ref(false);

// 会员卡背景：等级背景色 → 默认蓝渐变
const cardBg = computed(() => {
  const c = memberCard.value;
  if (c && c.levelBgColor) return { background: c.levelBgColor };
  return { background: 'linear-gradient(135deg, #2f6bff, #5b8cff)' };
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
  restoreScrollTop('member');
  try {
    const [pkgRes, memberRes, cardsRes, tCardRes, tLevelsRes] = await Promise.all([
      cardApi.getPackages(),
      cardApi.getMemberStatus(),
      cardApi.getCards(),
      cardApi.memberMyCard(),
      cardApi.memberLevels(),
    ]);
    const myCard0 = (cardsRes.cards || [])[0];
    if (myCard0?.brandColor) brandColor.value = myCard0.brandColor;
    packages.value = (pkgRes.packages || []).filter((p) => p.enabled !== 0);
    isMember.value = memberRes.isMember;
    memberLevel.value = memberRes.level;
    memberExpire.value = memberRes.expireAt?.slice(0, 10) || '';
    // 租户会员卡：未入驻租户不展示区块
    if (tCardRes && !tCardRes.unbound) {
      memberCard.value = tCardRes.card;
      tenantLevels.value = tCardRes.levels || [];
      applyStatus.value = tCardRes.applyStatus || null;
    }  } catch (e) {}
});

// 离开时保存滚动位置，切Tab返回后恢复
onUnload(() => {
  saveCardTabState('member', { scrollTop: h5ScrollTop() });
});

function isCurrent(level) {
  return level === memberLevel.value || (level === 'free' && !isMember.value);
}

// ===== 租户会员卡：购买 / 申请 / 签到 =====
async function refreshMemberCard() {
  try {
    const res = await cardApi.memberMyCard();
    if (res && !res.unbound) memberCard.value = res.card;
  } catch (e) {}
}

async function buyLevel(lv) {
  if (paying.value) return;
  const userInfo = uni.getStorageSync('card_user') || {};
  if (!userInfo.id) return uni.showToast({ title: '请先登录', icon: 'none' });
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
  if (!userInfo.id) return uni.showToast({ title: '请先登录', icon: 'none' });
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

    uni.showModal({
      title: '确认支付',
      content: `确认支付 ¥${formatPrice(pkg.price)} 开通${pkg.name}？`,
      success: async (res) => {
        if (res.confirm) {
          uni.showLoading({ title: '支付中...' });
          try {
            await paymentApi.mockPay(order.orderNo);
            uni.hideLoading();
            uni.showToast({ title: '支付成功', icon: 'success' });
            setTimeout(async () => {
              const memberRes = await cardApi.getMemberStatus();
              isMember.value = memberRes.isMember;
              memberLevel.value = memberRes.level;
              memberExpire.value = memberRes.expireAt?.slice(0, 10) || '';
            }, 500);
          } catch (e) {
            uni.hideLoading();
            uni.showToast({ title: e.message || '支付失败', icon: 'none' });
          }
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
</script>

<style scoped>
.member-page {
  min-height: 100vh;
  background: #f5f6f7;
  padding-bottom: 160rpx;
}

/* ===== hero（demo g3 青绿渐变）===== */
.hero.g3 {
  position: relative;
  padding: calc(88rpx + 30rpx) 40rpx 44rpx;
  color: #fff;
  background: linear-gradient(155deg, #0f766e, #14b8a6);
  overflow: hidden;
}
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
  justify-content: space-between;
  color: #1a1a1a;
}
.sec-t small {
  font-size: 22rpx;
  color: #9a9a9a;
  font-weight: 400;
}
.plan-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24rpx;
  margin: 0 28rpx;
}
.plan {
  background: #fff;
  border-radius: 32rpx;
  padding: 36rpx;
  border: 1.5px solid #e5e6eb;
  position: relative;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.plan.hot {
  border-color: #07c160;
  box-shadow: 0 4px 16px rgba(7,193,96,0.08);
}
.pn {
  font-size: 28rpx;
  font-weight: 600;
  color: #1a1a1a;
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.cur-tag {
  font-size: 22rpx;
  color: #07c160;
  font-weight: 400;
}
.hot-tag {
  font-size: 20rpx;
  color: #07c160;
  background: #e7f7ee;
  padding: 4rpx 14rpx;
  border-radius: 12rpx;
  font-weight: 400;
}
.price {
  font-size: 44rpx;
  font-weight: 700;
  color: #2e6bb8;
  margin: 16rpx 0 8rpx;
}
.price i {
  font-style: normal;
  font-size: 22rpx;
  font-weight: 400;
  color: #9a9a9a;
  margin-left: 4rpx;
}
.plan-features {
  list-style: none;
  font-size: 24rpx;
  color: #5b5b5b;
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
  background: #07c160;
  color: #fff;
}
.btn.on {
  background: #e7f7ee;
  color: #07c160;
}
.btn:active {
  opacity: 0.75;
}

.dist-entry {
  display: flex; justify-content: space-between; align-items: center;
  margin: 12px 20px 0; background: linear-gradient(90deg, #e8f3ff, #fff);
  border: 1px solid #d3e5ff; border-radius: 12px; padding: 14px 16px;
}
.de-left { display: flex; align-items: center; gap: 12px; }
.de-icon { width: 44px; height: 44px; border-radius: 10px; background: rgba(22,93,255,0.08); display: flex; align-items: center; justify-content: center; }
.de-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.de-sub { font-size: 12px; color: #86909c; margin-top: 2px; }
.de-arrow { font-size: 22px; color: #c9cdd4; }

/* ===== 租户会员卡 ===== */
.tcard {
  margin: 28rpx 28rpx 0; border-radius: 24rpx; padding: 36rpx 32rpx;
  color: #fff; position: relative; overflow: hidden; box-shadow: 0 8px 24px rgba(47,107,255,0.18);
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
  margin: 24rpx 28rpx 0; background: #fff; border-radius: 20rpx; padding: 26rpx 28rpx;
  border: 1px solid #e5e6eb;
}
.si-title { font-size: 28rpx; font-weight: 600; color: #1a1a1a; }
.si-sub { font-size: 22rpx; color: #9a9a9a; margin-top: 6rpx; }
.sign-btn { background: #165dff; color: #fff; font-size: 26rpx; font-weight: 600; padding: 16rpx 44rpx; border-radius: 999rpx; }
.sign-btn:active { opacity: 0.8; }
.tlevels { margin: 0 28rpx; display: flex; flex-direction: column; gap: 20rpx; }
.tlv { background: #fff; border-radius: 20rpx; padding: 28rpx; border: 1.5px solid #e5e6eb; }
.tlv.cur { border-color: #165dff; background: #f7fbff; }
.tlv-head { display: flex; align-items: center; justify-content: space-between; }
.tlv-name { font-size: 30rpx; font-weight: 700; color: #1a1a1a; }
.tlv-no { font-size: 22rpx; color: #165dff; background: #e8f3ff; padding: 4rpx 16rpx; border-radius: 10rpx; }
.tlv-desc { font-size: 23rpx; color: #9a9a9a; margin-top: 10rpx; line-height: 1.5; }
.tlv-btn { margin-top: 20rpx; text-align: center; padding: 18rpx; border-radius: 16rpx; font-size: 27rpx; font-weight: 600; }
.tlv-btn.buy { background: #165dff; color: #fff; }
.tlv-btn.apply { background: #ff7d00; color: #fff; }
.tlv-btn.on { background: #e8f3ff; color: #165dff; }
.tlv-btn.disabled { background: #f2f3f5; color: #c9cdd4; }
.tlv-btn:active { opacity: 0.8; }
.apply-tip { margin: 20rpx 28rpx 0; padding: 20rpx 24rpx; border-radius: 16rpx; font-size: 24rpx; line-height: 1.5; }
.apply-tip.st-pending { background: #fff7e6; color: #ad6800; border: 1px solid #ffd591; }
.apply-tip.st-approved { background: #e7f7ee; color: #07893c; border: 1px solid #a9e7c1; }
.apply-tip.st-rejected { background: #fdecec; color: #b42318; border: 1px solid #f8c4c4; }
</style>
