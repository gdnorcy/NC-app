<template>
  <view class="customers-page">
    <view class="header">
      <view class="title">客户管理</view>
      <view class="subtitle">沉淀私域客户资产</view>
    </view>

    <!-- 搜索和筛选 -->
    <view class="toolbar">
      <view class="search-box">
        <SIcon name="dynamic" size="small" color="#86909c" />
        <input class="search-input" v-model="keyword" placeholder="搜索客户姓名/公司" placeholder-class="ph" @confirm="loadCustomers"/>
      </view>
    </view>

    <!-- 标签筛选 -->
    <scroll-view class="tag-scroll" scroll-x>
      <view class="tag-list">
        <view class="tag" :class="{ active: statusFilter === '' }" @click="setStatus('')">全部</view>
        <view class="tag" :class="{ active: statusFilter === 'pending' }" @click="setStatus('pending')">待跟进</view>
        <view class="tag" :class="{ active: statusFilter === 'following' }" @click="setStatus('following')">跟进中</view>
        <view class="tag" :class="{ active: statusFilter === 'converted' }" @click="setStatus('converted')">已成交</view>
        <view class="tag" :class="{ active: statusFilter === 'lost' }" @click="setStatus('lost')">已流失</view>
      </view>
    </scroll-view>

    <!-- 客户列表 -->
    <view class="customer-list" v-if="customers.length">
      <view class="customer-item" v-for="c in customers" :key="c.id" @click="viewCustomer(c)">
        <view class="customer-avatar">{{ c.name?.[0] || '客' }}</view>
        <view class="customer-info">
          <view class="customer-name">
            {{ c.name }}
            <view class="status-tag" :class="c.status">{{ statusText(c.status) }}</view>
            <view class="follow-dot" v-if="c.nextFollowAt && new Date(c.nextFollowAt) < new Date()"></view>
          </view>
          <view class="customer-meta">
            <text v-if="c.company">{{ c.company }}</text>
            <text v-if="c.company && c.phone" class="dot">·</text>
            <text v-if="c.phone">{{ c.phone }}</text>
          </view>
          <view class="customer-tags" v-if="c.tags?.length">
            <text class="mini-tag" v-for="t in c.tags.slice(0,3)" :key="t">{{ t }}</text>
          </view>
        </view>
        <view class="customer-arrow">›</view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <view class="empty-icon"><SIcon name="customer" size="xlarge" color="#c9cdd4" /></view>
      <view class="empty-text">暂无客户</view>
      <view class="empty-hint">交换名片后，客户将自动添加到这里</view>
    </view>

    <!-- 新增按钮 -->
    <view class="fab" @click="showAdd = true">
      <text class="fab-icon">+</text>
    </view>

    <!-- 新增客户弹窗 -->
    <view class="modal-mask" v-if="showAdd" @click="showAdd=false">
      <view class="bottom-sheet" @click.stop>
        <view class="sheet-header">
          <text class="sheet-title">新增客户</text>
          <text class="sheet-close" @click="showAdd=false">✕</text>
        </view>
        <view class="sheet-body">
          <view class="form-item">
            <view class="form-label">姓名 *</view>
            <input class="form-input" v-model="newCustomer.name" placeholder="请输入客户姓名" placeholder-class="ph"/>
          </view>
          <view class="form-item">
            <view class="form-label">电话</view>
            <input class="form-input" v-model="newCustomer.phone" type="number" placeholder="请输入电话" placeholder-class="ph"/>
          </view>
          <view class="form-item">
            <view class="form-label">公司</view>
            <input class="form-input" v-model="newCustomer.company" placeholder="请输入公司名称" placeholder-class="ph"/>
          </view>
          <view class="form-item">
            <view class="form-label">标签</view>
            <input class="form-input" v-model="tagInput" placeholder="多个标签用逗号分隔" placeholder-class="ph"/>
          </view>
        </view>
        <view class="sheet-footer">
          <button class="submit-btn" @click="addCustomer">保存</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { trackPageView } from '../../utils/analytics.js';
import SIcon from '../../components/SIcon.vue';

const customers = ref([]);
const keyword = ref('');
const statusFilter = ref('');
const showAdd = ref(false);
const newCustomer = ref({ name: '', phone: '', company: '' });
const tagInput = ref('');

onShow(() => { trackPageView('/pages/card/customers'); });

onMounted(() => loadCustomers());

async function loadCustomers() {
  try {
    const params = {};
    if (statusFilter.value) params.status = statusFilter.value;
    const res = await cardApi.getCustomers(params);
    customers.value = res.customers || [];
  } catch (e) {}
}

function setStatus(s) {
  statusFilter.value = s;
  loadCustomers();
}

function statusText(s) {
  return { pending: '待跟进', following: '跟进中', converted: '已成交', lost: '已流失' }[s] || s;
}

function viewCustomer(c) {
  uni.navigateTo({ url: `/pages/card/customerDetail?id=${c.id}` });
}

async function addCustomer() {
  if (!newCustomer.value.name) {
    uni.showToast({ title: '请输入姓名', icon: 'none' });
    return;
  }
  try {
    const tags = tagInput.value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    await cardApi.createCustomer({ ...newCustomer.value, tags });
    uni.showToast({ title: '添加成功', icon: 'success' });
    showAdd.value = false;
    newCustomer.value = { name: '', phone: '', company: '' };
    tagInput.value = '';
    loadCustomers();
  } catch (e) {
    uni.showToast({ title: e.message || '添加失败', icon: 'none' });
  }
}
</script>

<style scoped>
.customers-page {
  min-height: 100vh;
  background: #f2f3f5;
  padding-bottom: 40rpx;
}
.header {
  background: linear-gradient(135deg, #ff7d00, #ff9a2e);
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
.toolbar {
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
.search-icon {
  font-size: 28rpx;
  margin-right: 12rpx;
}
.search-input {
  flex: 1;
  font-size: 26rpx;
  color: #1d2129;
}
.ph { color: #c9cdd4; }
.tag-scroll {
  white-space: nowrap;
  padding: 0 24rpx;
  margin-bottom: 16rpx;
}
.tag-list {
  display: inline-flex;
  gap: 16rpx;
}
.tag {
  padding: 12rpx 28rpx;
  background: #fff;
  border-radius: 32rpx;
  font-size: 24rpx;
  color: #4e5969;
  white-space: nowrap;
}
.tag.active {
  background: #ff7d00;
  color: #fff;
}
.customer-list {
  margin: 0 24rpx;
  background: #fff;
  border-radius: 20px;
  padding: 0 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.customer-item {
  display: flex;
  align-items: center;
  padding: 28rpx 0;
  border-bottom: 1px solid #f7f8fa;
}
.customer-item:last-child { border-bottom: none; }
.customer-avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff7d00, #ff9a2e);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  font-weight: 600;
  margin-right: 20rpx;
}
.customer-info { flex: 1; }
.customer-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #1d2129;
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
}
.status-tag {
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}
.status-tag.pending { background: #fff7e6; color: #ff7d00; }
.status-tag.following { background: #e8f3ff; color: #165dff; }
.status-tag.converted { background: #e8ffea; color: #00b42a; }
.status-tag.lost { background: #f2f3f5; color: #86909c; }
.follow-dot {
  width: 14rpx;
  height: 14rpx;
  background: #f5222d;
  border-radius: 50%;
}
.customer-meta {
  font-size: 24rpx;
  color: #86909c;
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 8rpx;
}
.dot { color: #c9cdd4; }
.customer-tags { display: flex; gap: 8rpx; }
.mini-tag {
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  background: #f2f3f5;
  color: #86909c;
  border-radius: 6rpx;
}
.customer-arrow {
  font-size: 36rpx;
  color: #c9cdd4;
}
.empty-state {
  text-align: center;
  padding: 120rpx 0;
}
.empty-icon { font-size: 80rpx; margin-bottom: 20rpx; }
.empty-text { font-size: 28rpx; color: #4e5969; margin-bottom: 8rpx; }
.empty-hint { font-size: 24rpx; color: #86909c; }
.fab {
  position: fixed;
  right: 32rpx;
  bottom: 60rpx;
  width: 100rpx;
  height: 100rpx;
  background: linear-gradient(135deg, #ff7d00, #ff9a2e);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(255,125,0,0.4);
}
.fab-icon {
  font-size: 48rpx;
  color: #fff;
  font-weight: 300;
}
.modal-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55);
  z-index: 999;
  display: flex;
  align-items: flex-end;
}
.bottom-sheet {
  width: 100%;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  max-height: 80vh;
}
.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1px solid #f2f3f5;
}
.sheet-title { font-size: 32rpx; font-weight: 600; color: #1d2129; }
.sheet-close { font-size: 32rpx; color: #86909c; }
.sheet-body { padding: 32rpx; }
.form-item { margin-bottom: 28rpx; }
.form-label { font-size: 26rpx; color: #4e5969; margin-bottom: 12rpx; }
.form-input {
  height: 80rpx;
  background: #f7f8fa;
  border-radius: 12px;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #1d2129;
}
.sheet-footer { padding: 0 32rpx 36px; }
.submit-btn {
  background: #ff7d00;
  color: #fff;
  border-radius: 40rpx;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 30rpx;
  font-weight: 600;
}
</style>
