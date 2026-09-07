<template>
  <view class="member-page">
    <!-- hero（demo g3 青绿渐变） -->
    <view class="hero g3">
      <view class="row1">
        <view class="hero-left">
          <view class="hero-title">会员中心</view>
          <view class="hero-sub">当前：{{ currentLevelText }}{{ isMember ? ' · 有效期至 ' + memberExpire : ' · 尚未开通' }}</view>
        </view>
        <view class="hero-badge"><SIcon name="crown" size="small" color="#ffffff" /> {{ memberLevel === 'free' ? 'FREE' : memberLevel.toUpperCase() }}</view>
      </view>
    </view>

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
import { trackPageView } from '../../utils/analytics.js';
import { saveCardTabState, restoreScrollTop, h5ScrollTop } from '../../utils/cardTabState.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';

const packages = ref([]);
const isMember = ref(false);
const memberLevel = ref('free');
const memberExpire = ref('');
const paying = ref(false);

const currentLevelText = computed(() => ({ free: '免费版', silver: '白银会员', gold: '黄金会员', diamond: '钻石会员' }[memberLevel.value] || ''));

onShow(() => { trackPageView('/pages/card/member'); });

onMounted(async () => {
  restoreScrollTop('member');
  try {
    const [pkgRes, memberRes] = await Promise.all([
      cardApi.getPackages(),
      cardApi.getMemberStatus(),
    ]);
    packages.value = (pkgRes.packages || []).filter((p) => p.enabled !== 0);
    isMember.value = memberRes.isMember;
    memberLevel.value = memberRes.level;
    memberExpire.value = memberRes.expireAt?.slice(0, 10) || '';
  } catch (e) {}
});

// 离开时保存滚动位置，切Tab返回后恢复
onUnload(() => {
  saveCardTabState('member', { scrollTop: h5ScrollTop() });
});

function isCurrent(level) {
  return level === memberLevel.value || (level === 'free' && !isMember.value);
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
</style>
