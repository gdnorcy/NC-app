<template>
  <view class="dynamic-page">
    <view class="header">
      <view class="title">我的动态</view>
      <view class="publish-btn" @click="showPublish = true">+ 发布</view>
    </view>

    <view class="dynamic-list" v-if="dynamics.length">
      <view class="dynamic-item" v-for="d in dynamics" :key="d.id">
        <view class="dynamic-header">
          <view class="dynamic-avatar">{{ user.nickname?.[0] || '我' }}</view>
          <view class="dynamic-info">
            <view class="dynamic-name">{{ user.nickname || '我' }}</view>
            <view class="dynamic-time">{{ d.createdAt?.slice(0, 16) }}</view>
          </view>
          <view class="visibility-tag">{{ d.visibility === 'public' ? '公开' : '仅自己' }}</view>
        </view>
        <view class="dynamic-content">{{ d.content }}</view>
        <view class="dynamic-images" v-if="d.images?.length">
          <image v-for="(img, i) in d.images" :key="i" :src="img" mode="aspectFill" class="dynamic-img"/>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <view class="empty-icon"><SIcon name="dynamic" size="xlarge" color="#c9cdd4" /></view>
      <view class="empty-text">暂无动态</view>
      <view class="empty-hint">发布第一条动态吧</view>
    </view>

    <!-- 发布弹窗 -->
    <view class="modal-mask" v-if="showPublish" @click="showPublish=false">
      <view class="bottom-sheet" @click.stop>
        <view class="sheet-header">
          <text class="sheet-title">发布动态</text>
          <text class="sheet-close" @click="showPublish=false">✕</text>
        </view>
        <view class="sheet-body">
          <textarea class="publish-input" v-model="newDynamic.content" placeholder="分享你的想法..." placeholder-class="ph" :maxlength="500"/>
          <view class="form-item">
            <view class="form-label">可见范围</view>
            <view class="visibility-options">
              <view class="visibility-option" :class="{ active: newDynamic.visibility === 'public' }" @click="newDynamic.visibility='public'">公开</view>
              <view class="visibility-option" :class="{ active: newDynamic.visibility === 'private' }" @click="newDynamic.visibility='private'">仅自己</view>
            </view>
          </view>
        </view>
        <view class="sheet-footer">
          <button class="submit-btn" @click="publish">发布</button>
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

const dynamics = ref([]);
const user = ref({});
const showPublish = ref(false);
const newDynamic = ref({ content: '', visibility: 'public' });

onShow(() => { trackPageView('/pages/card/dynamic'); });

onMounted(async () => {
  try {
    const res = await cardApi.getDynamics();
    dynamics.value = res.dynamics || [];
    const profile = await cardApi.getProfile();
    user.value = profile.user;
  } catch (e) {}
});

async function publish() {
  if (!newDynamic.value.content) {
    uni.showToast({ title: '请输入内容', icon: 'none' });
    return;
  }
  try {
    await cardApi.createDynamic(newDynamic.value);
    uni.showToast({ title: '发布成功', icon: 'success' });
    showPublish.value = false;
    newDynamic.value = { content: '', visibility: 'public' };
    const res = await cardApi.getDynamics();
    dynamics.value = res.dynamics || [];
  } catch (e) {
    uni.showToast({ title: e.message || '发布失败', icon: 'none' });
  }
}
</script>

<style scoped>
.dynamic-page {
  min-height: 100vh;
  background: #f2f3f5;
  padding-bottom: 40rpx;
}
.header {
  background: linear-gradient(135deg, #eb2f96, #f759ab);
  padding: 88px 32rpx 32rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.title {
  font-size: 36rpx;
  font-weight: 700;
  color: #fff;
}
.publish-btn {
  background: rgba(255,255,255,0.2);
  color: #fff;
  padding: 12rpx 28rpx;
  border-radius: 32rpx;
  font-size: 26rpx;
}
.dynamic-list {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.dynamic-item {
  background: #fff;
  border-radius: 16px;
  padding: 28rpx 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.dynamic-header {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}
.dynamic-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #eb2f96, #f759ab);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  margin-right: 16rpx;
}
.dynamic-info { flex: 1; }
.dynamic-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 4rpx;
}
.dynamic-time {
  font-size: 22rpx;
  color: #c9cdd4;
}
.visibility-tag {
  font-size: 20rpx;
  color: #86909c;
  background: #f2f3f5;
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
}
.dynamic-content {
  font-size: 28rpx;
  color: #1d2129;
  line-height: 1.7;
  margin-bottom: 16rpx;
}
.dynamic-images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8rpx;
}
.dynamic-img {
  width: 100%;
  height: 180rpx;
  border-radius: 8px;
}
.empty-state {
  text-align: center;
  padding: 120rpx 0;
}
.empty-icon { font-size: 80rpx; margin-bottom: 20rpx; }
.empty-text { font-size: 28rpx; color: #4e5969; margin-bottom: 8rpx; }
.empty-hint { font-size: 24rpx; color: #86909c; }
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
.publish-input {
  width: 100%;
  height: 240rpx;
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
.visibility-options {
  display: flex;
  gap: 16rpx;
}
.visibility-option {
  flex: 1;
  text-align: center;
  padding: 20rpx;
  background: #f7f8fa;
  border-radius: 12px;
  font-size: 26rpx;
  color: #4e5969;
  border: 2px solid transparent;
}
.visibility-option.active {
  background: #e8f3ff;
  color: #165dff;
  border-color: #165dff;
}
.sheet-footer { padding: 0 32rpx 36px; }
.submit-btn {
  background: #eb2f96;
  color: #fff;
  border-radius: 40rpx;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 30rpx;
  font-weight: 600;
}
</style>
