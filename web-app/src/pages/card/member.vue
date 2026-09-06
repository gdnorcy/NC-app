<template>
  <view class="member-page">
    <view class="header">
      <view class="member-status">
        <view class="member-icon">👑</view>
        <view class="member-info">
          <view class="member-level">{{ currentLevelText }}</view>
          <view class="member-expire" v-if="isMember">有效期至 {{ memberExpire }}</view>
          <view class="member-expire" v-else>开通会员，解锁全部高级功能</view>
        </view>
      </view>
    </view>

    <!-- 权益说明 -->
    <view class="benefits-section">
      <view class="section-title">会员专属权益</view>
      <view class="benefits-grid">
        <view class="benefit-item" v-for="b in benefits" :key="b.title">
          <view class="benefit-icon">{{ b.icon }}</view>
          <view class="benefit-title">{{ b.title }}</view>
          <view class="benefit-desc">{{ b.desc }}</view>
        </view>
      </view>
    </view>

    <!-- 套餐对比 -->
    <view class="packages-section">
      <view class="section-title">选择套餐</view>
      <view class="packages-list">
        <view class="package-card" v-for="p in packages" :key="p.level"
              :class="{ selected: selectedPackage === p.level, recommended: p.level === 'gold' }"
              @click="selectedPackage = p.level">
          <view class="recommend-tag" v-if="p.level === 'gold'">推荐</view>
          <view class="package-name">{{ p.name }}</view>
          <view class="package-price">
            <text class="price-symbol">¥</text>
            <text class="price-num">{{ p.price }}</text>
            <text class="price-unit" v-if="p.duration_days > 0">/{{ p.duration_days >= 365 ? '年' : '月' }}</text>
          </view>
          <view class="package-features">
            <view class="feature" v-for="f in getFeatureTexts(p.features)" :key="f">✓ {{ f }}</view>
          </view>
        </view>
      </view>
    </view>

    <!-- 开通按钮 -->
    <view class="footer">
      <button class="open-btn" @click="openMember" :disabled="selectedPackage === 'free'">
        {{ selectedPackage === 'free' ? '当前为免费版' : `立即开通${getPackageName(selectedPackage)}` }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';

const packages = ref([]);
const selectedPackage = ref('gold');
const isMember = ref(false);
const memberLevel = ref('free');
const memberExpire = ref('');

const currentLevelText = computed(() => ({ free: '免费用户', silver: '白银会员', gold: '黄金会员', diamond: '钻石会员' }[memberLevel.value]));

const benefits = [
  { icon: '🎨', title: '高级模板', desc: '解锁全部精美名片模板' },
  { icon: '📊', title: '详细访客分析', desc: '访客行为时间线、深度分析' },
  { icon: '🌐', title: '人脉集市', desc: '高级筛选、精准搜索' },
  { icon: '🚫', title: '无广告', desc: '纯净使用体验' },
  { icon: '🏅', title: '专属标识', desc: '会员徽章、尊贵展示' },
  { icon: '📈', title: '高级数据统计', desc: '多维度商机数据分析' },
];

onMounted(async () => {
  try {
    const [pkgRes, memberRes] = await Promise.all([
      cardApi.getPackages(),
      cardApi.getMemberStatus(),
    ]);
    packages.value = pkgRes.packages || [];
    isMember.value = memberRes.isMember;
    memberLevel.value = memberRes.level;
    memberExpire.value = memberRes.expireAt?.slice(0, 10) || '';
  } catch (e) {}
});

function getFeatureTexts(features) {
  const map = {
    basic_card: '基础名片功能',
    advanced_visitor: '详细访客分析',
    basic_customer: '基础客户管理',
    advanced_customer: '高级客户管理',
    all_template: '全部模板',
    free_template: '免费模板',
    market_full: '人脉集市全部权限',
    no_ads: '无广告',
    badge: '专属会员标识',
    priority_support: '优先客服支持',
    advanced_stats: '高级数据统计',
  };
  return (features || []).map(f => map[f] || f);
}

function getPackageName(level) {
  return { free: '免费版', silver: '白银会员', gold: '黄金会员', diamond: '钻石会员' }[level] || '';
}

function openMember() {
  uni.showToast({ title: '支付功能开发中', icon: 'none' });
}
</script>

<style scoped>
.member-page {
  min-height: 100vh;
  background: #f2f3f5;
  padding-bottom: 160rpx;
}
.header {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  padding: 88px 32rpx 60rpx;
}
.member-status {
  display: flex;
  align-items: center;
  gap: 24rpx;
}
.member-icon {
  font-size: 80rpx;
}
.member-level {
  font-size: 40rpx;
  font-weight: 700;
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 8rpx;
}
.member-expire {
  font-size: 24rpx;
  color: rgba(255,255,255,0.7);
}
.benefits-section {
  margin: -30rpx 24rpx 24rpx;
  background: #fff;
  border-radius: 20px;
  padding: 32rpx 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 24rpx;
}
.benefits-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24rpx;
}
.benefit-item {
  text-align: center;
}
.benefit-icon {
  font-size: 48rpx;
  margin-bottom: 12rpx;
}
.benefit-title {
  font-size: 24rpx;
  font-weight: 500;
  color: #1d2129;
  margin-bottom: 6rpx;
}
.benefit-desc {
  font-size: 20rpx;
  color: #86909c;
  line-height: 1.4;
}
.packages-section {
  margin: 0 24rpx;
}
.packages-list {
  display: flex;
  gap: 16rpx;
  overflow-x: auto;
  padding-bottom: 16rpx;
}
.package-card {
  flex: 0 0 200rpx;
  background: #fff;
  border-radius: 16px;
  padding: 28rpx 20rpx;
  text-align: center;
  border: 3px solid transparent;
  position: relative;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.package-card.selected {
  border-color: #ffd700;
}
.package-card.recommended {
  background: linear-gradient(135deg, #fffbe6, #fff7cc);
}
.recommend-tag {
  position: absolute;
  top: -16rpx;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  color: #fff;
  font-size: 20rpx;
  padding: 4rpx 16rpx;
  border-radius: 16rpx;
  font-weight: 600;
}
.package-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 12rpx;
}
.package-price {
  margin-bottom: 20rpx;
}
.price-symbol {
  font-size: 24rpx;
  color: #ff7d00;
}
.price-num {
  font-size: 44rpx;
  font-weight: 700;
  color: #ff7d00;
}
.price-unit {
  font-size: 20rpx;
  color: #86909c;
}
.package-features {
  text-align: left;
}
.feature {
  font-size: 20rpx;
  color: #4e5969;
  margin-bottom: 8rpx;
  line-height: 1.4;
}
.footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  padding: 24rpx 32rpx 36px;
  border-top: 1px solid #f2f3f5;
}
.open-btn {
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  color: #fff;
  border-radius: 44rpx;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 32rpx;
  font-weight: 600;
}
.open-btn[disabled] {
  background: #f2f3f5;
  color: #86909c;
}
</style>
