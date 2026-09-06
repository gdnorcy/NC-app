<template>
  <view class="market-page">
    <view class="header">
      <view class="title">人脉集市</view>
      <view class="subtitle">发现优质人脉，拓展商业机会</view>
    </view>

    <!-- 搜索 -->
    <view class="search-bar">
      <view class="search-box">
        <text class="search-icon">🔍</text>
        <input class="search-input" v-model="keyword" placeholder="搜索姓名/公司/职位" placeholder-class="ph" @confirm="search"/>
      </view>
    </view>

    <!-- 行业筛选 -->
    <scroll-view class="industry-scroll" scroll-x>
      <view class="industry-list">
        <view class="industry-tag" :class="{ active: !industry }" @click="selectIndustry('')">全部</view>
        <view class="industry-tag" :class="{ active: industry === i }" v-for="i in industries" :key="i" @click="selectIndustry(i)">{{ i }}</view>
      </view>
    </scroll-view>

    <!-- 名片列表 -->
    <view class="card-list" v-if="cards.length">
      <view class="market-card" v-for="card in cards" :key="card.id" @click="viewCard(card)">
        <view class="card-header">
          <view class="card-avatar">{{ card.name?.[0] || '名' }}</view>
          <view class="card-info">
            <view class="card-name">
              {{ card.name }}
              <view class="member-badge" v-if="card.viewCount > 100">👑</view>
            </view>
            <view class="card-position">{{ card.position }}</view>
          </view>
          <view class="exchange-btn" @click.stop="quickExchange(card)">交换</view>
        </view>
        <view class="card-company" v-if="card.company">🏢 {{ card.company }}</view>
        <view class="card-bio" v-if="card.bio">{{ card.bio }}</view>
        <view class="card-footer">
          <view class="footer-stat">
            <text class="stat-num">{{ card.viewCount }}</text>
            <text class="stat-label">访问</text>
          </view>
          <view class="footer-stat">
            <text class="stat-num">{{ card.exchangeCount }}</text>
            <text class="stat-label">交换</text>
          </view>
          <view class="footer-field" v-if="card.businessField">{{ card.businessField }}</view>
        </view>
      </view>

      <view class="load-more" v-if="hasMore">
        <text @click="loadMore">加载更多</text>
      </view>
    </view>

    <view class="empty-state" v-else>
      <view class="empty-icon">🌐</view>
      <view class="empty-text">暂无公开名片</view>
      <view class="empty-hint">成为第一个公开名片的人吧</view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';

const cards = ref([]);
const keyword = ref('');
const industry = ref('');
const page = ref(1);
const hasMore = ref(true);
const industries = ['互联网', '教育', '医疗', '金融', '房地产', '制造业', '零售', '餐饮'];

onMounted(() => loadCards());

async function loadCards(reset = false) {
  if (reset) { page.value = 1; hasMore.value = true; }
  try {
    const res = await cardApi.getMarket({
      keyword: keyword.value,
      businessField: industry.value,
      page: page.value,
      pageSize: 20,
    });
    if (reset) cards.value = res.cards || [];
    else cards.value = [...cards.value, ...(res.cards || [])];
    hasMore.value = cards.value.length < res.total;
  } catch (e) {}
}

function search() {
  loadCards(true);
}

function selectIndustry(i) {
  industry.value = i;
  loadCards(true);
}

function loadMore() {
  page.value++;
  loadCards();
}

function viewCard(card) {
  uni.navigateTo({ url: `/pages/card/myCard?id=${card.id}` });
}

async function quickExchange(card) {
  try {
    await cardApi.exchangeCard({ toCardId: card.id, sharePhone: false });
    uni.showToast({ title: '交换成功', icon: 'success' });
  } catch (e) {
    uni.showToast({ title: e.message || '交换失败', icon: 'none' });
  }
}
</script>

<style scoped>
.market-page {
  min-height: 100vh;
  background: #f2f3f5;
  padding-bottom: 40rpx;
}
.header {
  background: linear-gradient(135deg, #722ed1, #9254de);
  padding: 88px 32rpx 40rpx;
}
.title {
  font-size: 40rpx;
  font-weight: 700;
  color: #fff;
  margin-bottom: 8rpx;
}
.subtitle {
  font-size: 24rpx;
  color: rgba(255,255,255,0.8);
}
.search-bar {
  margin: -20rpx 24rpx 16rpx;
}
.search-box {
  background: #fff;
  border-radius: 40rpx;
  padding: 0 24rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.search-icon { font-size: 28rpx; margin-right: 12rpx; }
.search-input { flex: 1; font-size: 26rpx; color: #1d2129; }
.ph { color: #c9cdd4; }
.industry-scroll {
  white-space: nowrap;
  padding: 0 24rpx;
  margin-bottom: 16rpx;
}
.industry-list {
  display: inline-flex;
  gap: 12rpx;
}
.industry-tag {
  padding: 10rpx 24rpx;
  background: #fff;
  border-radius: 28rpx;
  font-size: 22rpx;
  color: #4e5969;
  white-space: nowrap;
}
.industry-tag.active {
  background: #722ed1;
  color: #fff;
}
.card-list {
  padding: 0 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.market-card {
  background: #fff;
  border-radius: 20px;
  padding: 28rpx 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.card-header {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}
.card-avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #722ed1, #9254de);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;
  font-weight: 600;
  margin-right: 20rpx;
}
.card-info { flex: 1; }
.card-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #1d2129;
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 6rpx;
}
.member-badge { font-size: 24rpx; }
.card-position {
  font-size: 24rpx;
  color: #86909c;
}
.exchange-btn {
  background: linear-gradient(135deg, #722ed1, #9254de);
  color: #fff;
  padding: 12rpx 28rpx;
  border-radius: 32rpx;
  font-size: 24rpx;
  font-weight: 500;
}
.card-company {
  font-size: 24rpx;
  color: #4e5969;
  margin-bottom: 8rpx;
}
.card-bio {
  font-size: 24rpx;
  color: #86909c;
  line-height: 1.6;
  margin-bottom: 16rpx;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-footer {
  display: flex;
  align-items: center;
  gap: 32rpx;
  padding-top: 16rpx;
  border-top: 1px solid #f7f8fa;
}
.footer-stat {
  display: flex;
  align-items: baseline;
  gap: 6rpx;
}
.stat-num {
  font-size: 28rpx;
  font-weight: 700;
  color: #722ed1;
}
.stat-label {
  font-size: 20rpx;
  color: #86909c;
}
.footer-field {
  margin-left: auto;
  font-size: 20rpx;
  color: #c9cdd4;
  background: #f7f8fa;
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
}
.load-more {
  text-align: center;
  padding: 32rpx;
  font-size: 26rpx;
  color: #86909c;
}
.empty-state {
  text-align: center;
  padding: 120rpx 0;
}
.empty-icon { font-size: 80rpx; margin-bottom: 20rpx; }
.empty-text { font-size: 28rpx; color: #4e5969; margin-bottom: 8rpx; }
.empty-hint { font-size: 24rpx; color: #86909c; }
</style>
