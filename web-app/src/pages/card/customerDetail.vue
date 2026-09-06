<template>
  <view class="detail-page">
    <view class="header">
      <view class="avatar">{{ customer.name?.[0] || '客' }}</view>
      <view class="info">
        <view class="name">{{ customer.name }}</view>
        <view class="meta" v-if="customer.company">{{ customer.company }}</view>
      </view>
      <view class="status-tag" :class="customer.status">{{ statusText }}</view>
    </view>

    <!-- 基本信息 -->
    <view class="section">
      <view class="section-title">基本信息</view>
      <view class="info-list">
        <view class="info-row" v-if="customer.phone" @click="callPhone">
          <view class="info-label">📞 电话</view>
          <view class="info-value">{{ customer.phone }}</view>
        </view>
        <view class="info-row" v-if="customer.wechat" @click="copyWechat">
          <view class="info-label"><SIcon name="wechat" size="small" color="#00b42a" /> 微信</view>
          <view class="info-value">{{ customer.wechat }}</view>
        </view>
        <view class="info-row" v-if="customer.tags?.length">
          <view class="info-label"><SIcon name="template" size="small" color="#ff7d00" /> 标签</view>
          <view class="info-value tags">
            <text class="tag" v-for="t in customer.tags" :key="t">{{ t }}</text>
          </view>
        </view>
        <view class="info-row">
          <view class="info-label">📌 来源</view>
          <view class="info-value">{{ sourceText }}</view>
        </view>
      </view>
    </view>

    <!-- 跟进记录 -->
    <view class="section">
      <view class="section-header">
        <view class="section-title">跟进记录</view>
        <view class="add-btn" @click="showFollow = true">+ 新增</view>
      </view>
      <view class="follow-list" v-if="follows.length">
        <view class="follow-item" v-for="f in follows" :key="f.id">
          <view class="follow-dot"></view>
          <view class="follow-content">
            <view class="follow-text">{{ f.content }}</view>
            <view class="follow-time">{{ f.createdAt?.slice(0, 16) }}</view>
          </view>
        </view>
      </view>
      <view class="empty" v-else>暂无跟进记录</view>
    </view>

    <!-- 底部操作 -->
    <view class="footer">
      <button class="footer-btn" @click="showFollow = true">添加跟进</button>
    </view>

    <!-- 新增跟进弹窗 -->
    <view class="modal-mask" v-if="showFollow" @click="showFollow=false">
      <view class="bottom-sheet" @click.stop>
        <view class="sheet-header">
          <text class="sheet-title">新增跟进</text>
          <text class="sheet-close" @click="showFollow=false">✕</text>
        </view>
        <view class="sheet-body">
          <textarea class="follow-input" v-model="followContent" placeholder="请输入跟进内容..." placeholder-class="ph" :maxlength="500"/>
          <view class="form-item">
            <view class="form-label">下次跟进时间</view>
            <picker mode="date" :value="nextFollow" @change="e => nextFollow = e.detail.value">
              <view class="picker-value">{{ nextFollow || '请选择日期' }}</view>
            </picker>
          </view>
        </view>
        <view class="sheet-footer">
          <button class="submit-btn" @click="addFollow">保存</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import SIcon from '../../components/SIcon.vue';

const customer = ref({});
const follows = ref([]);
const showFollow = ref(false);
const followContent = ref('');
const nextFollow = ref('');

const statusText = computed(() => ({ pending: '待跟进', following: '跟进中', converted: '已成交', lost: '已流失' }[customer.value.status] || ''));
const sourceText = computed(() => ({ exchange: '名片交换', manual: '手动添加', market: '人脉集市' }[customer.value.source] || customer.value.source || ''));

onMounted(async () => {
  const pages = getCurrentPages();
  const id = pages[pages.length - 1].options.id;
  if (id) {
    try {
      const customers = await cardApi.getCustomers();
      customer.value = customers.customers?.find(c => c.id == id) || {};
      const res = await cardApi.getFollows(id);
      follows.value = res.follows || [];
    } catch (e) {}
  }
});

function callPhone() {
  if (customer.value.phone) uni.makePhoneCall({ phoneNumber: customer.value.phone });
}
function copyWechat() {
  if (customer.value.wechat) uni.setClipboardData({ data: customer.value.wechat });
}

async function addFollow() {
  if (!followContent.value) {
    uni.showToast({ title: '请输入跟进内容', icon: 'none' });
    return;
  }
  try {
    const pages = getCurrentPages();
    const id = pages[pages.length - 1].options.id;
    await cardApi.addFollow(id, { content: followContent.value, nextFollowAt: nextFollow.value });
    uni.showToast({ title: '添加成功', icon: 'success' });
    showFollow.value = false;
    followContent.value = '';
    nextFollow.value = '';
    const res = await cardApi.getFollows(id);
    follows.value = res.follows || [];
  } catch (e) {
    uni.showToast({ title: e.message || '添加失败', icon: 'none' });
  }
}
</script>

<style scoped>
.detail-page {
  min-height: 100vh;
  background: #f2f3f5;
  padding-bottom: 140rpx;
}
.header {
  background: linear-gradient(135deg, #ff7d00, #ff9a2e);
  padding: 88px 32rpx 40rpx;
  display: flex;
  align-items: center;
}
.avatar {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background: #fff;
  color: #ff7d00;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  font-weight: 700;
  margin-right: 20rpx;
}
.info { flex: 1; }
.name {
  font-size: 36rpx;
  font-weight: 700;
  color: #fff;
  margin-bottom: 6rpx;
}
.meta {
  font-size: 24rpx;
  color: rgba(255,255,255,0.8);
}
.status-tag {
  background: rgba(255,255,255,0.2);
  color: #fff;
  padding: 8rpx 20rpx;
  border-radius: 24rpx;
  font-size: 22rpx;
}
.section {
  margin: 24rpx;
  background: #fff;
  border-radius: 16px;
  padding: 28rpx 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}
.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 20rpx;
}
.section-header .section-title { margin-bottom: 0; }
.add-btn {
  font-size: 24rpx;
  color: #ff7d00;
}
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1px solid #f7f8fa;
}
.info-row:last-child { border-bottom: none; }
.info-label {
  font-size: 26rpx;
  color: #86909c;
}
.info-value {
  font-size: 26rpx;
  color: #1d2129;
}
.tags { display: flex; gap: 8rpx; flex-wrap: wrap; }
.tag {
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  background: #fff7e6;
  color: #ff7d00;
  border-radius: 6rpx;
}
.follow-list { position: relative; }
.follow-item {
  display: flex;
  padding: 20rpx 0;
  position: relative;
}
.follow-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #ff7d00;
  margin-right: 20rpx;
  margin-top: 8rpx;
  flex-shrink: 0;
}
.follow-text {
  font-size: 26rpx;
  color: #1d2129;
  margin-bottom: 6rpx;
  line-height: 1.6;
}
.follow-time {
  font-size: 22rpx;
  color: #c9cdd4;
}
.empty {
  text-align: center;
  padding: 40rpx 0;
  font-size: 24rpx;
  color: #86909c;
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
.footer-btn {
  background: #ff7d00;
  color: #fff;
  border-radius: 40rpx;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 30rpx;
  font-weight: 600;
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
.follow-input {
  width: 100%;
  height: 200rpx;
  background: #f7f8fa;
  border-radius: 12px;
  padding: 20rpx 24rpx;
  font-size: 28rpx;
  box-sizing: border-box;
  margin-bottom: 24rpx;
}
.ph { color: #c9cdd4; }
.form-item { margin-bottom: 20rpx; }
.form-label { font-size: 26rpx; color: #4e5969; margin-bottom: 12rpx; }
.picker-value {
  height: 80rpx;
  background: #f7f8fa;
  border-radius: 12px;
  padding: 0 24rpx;
  line-height: 80rpx;
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
