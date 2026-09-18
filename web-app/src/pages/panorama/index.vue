<template>
  <view class="index-page">
    <view class="header">
      <text class="title">360°全景</text>
      <text class="subtitle">沉浸式全景展示平台</text>
    </view>
    <view class="plan-list">
      <view
        v-for="plan in plans"
        :key="plan.id"
        class="plan-card"
        @tap="openPlan(plan)"
      >
        <image class="plan-cover" :src="plan.cover || '/static/default-cover.jpg'" mode="aspectFill" />
        <view class="plan-info">
          <text class="plan-name">{{ plan.name }}</text>
          <text class="plan-desc">{{ plan.description || '点击查看全景' }}</text>
          <text class="plan-count">{{ plan.sceneCount }}个场景</text>
        </view>
      </view>
      <view v-if="!plans.length" class="empty">
        <text>暂无全景方案</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return { plans: [] };
  },
  onLoad() {
    this.loadPlans();
  },
  methods: {
    async loadPlans() {
      try {
        const res = await uni.request({
          url: '/api/plans',
          method: 'GET',
        });
        this.plans = res.data?.plans || [];
      } catch (e) {
        console.error('加载方案失败:', e);
      }
    },
    openPlan(plan) {
      uni.navigateTo({ url: `/pages/viewer/viewer?planId=${plan.id}` });
    },
  },
};
</script>

<style scoped>
.index-page {
  min-height: 100vh;
  background: #f5f7fa;
  padding: 20px 16px;
}
.header {
  text-align: center;
  margin-bottom: 24px;
}
.title {
  font-size: 28px;
  font-weight: 700;
  color: #1a1b1c;
  display: block;
}
.subtitle {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
  display: block;
}
.plan-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.plan-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.plan-cover {
  width: 100%;
  height: 160px;
}
.plan-info {
  padding: 16px;
}
.plan-name {
  font-size: 16px;
  font-weight: 600;
  color: #1a1b1c;
  display: block;
}
.plan-desc {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
  display: block;
}
.plan-count {
  font-size: 12px;
  color: #165DFF;
  margin-top: 8px;
  display: block;
}
.empty {
  text-align: center;
  padding: 60px 0;
  color: #c0c4cc;
}
</style>
