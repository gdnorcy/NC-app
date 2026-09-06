<template>
  <view class="create-page">
    <view class="header">
      <view class="title">{{ isEdit ? '编辑名片' : '创建名片' }}</view>
      <view class="subtitle">完善信息，让别人更了解你</view>
    </view>

    <view class="form">
      <!-- 头像 -->
      <view class="form-item avatar-item">
        <view class="form-label">头像</view>
        <view class="avatar-upload" @click="chooseAvatar">
          <image v-if="form.avatar" :src="form.avatar" class="avatar-img" mode="aspectFill"/>
          <view v-else class="avatar-placeholder">
            <text class="plus">+</text>
            <text class="hint">上传头像</text>
          </view>
        </view>
      </view>

      <view class="form-item">
        <view class="form-label">姓名 <text class="required">*</text></view>
        <input class="form-input" v-model="form.name" placeholder="请输入姓名" placeholder-class="ph"/>
      </view>

      <view class="form-item">
        <view class="form-label">职位</view>
        <input class="form-input" v-model="form.position" placeholder="如：产品经理" placeholder-class="ph"/>
      </view>

      <view class="form-item">
        <view class="form-label">公司</view>
        <input class="form-input" v-model="form.company" placeholder="请输入公司名称" placeholder-class="ph"/>
      </view>

      <view class="form-item">
        <view class="form-label">手机号</view>
        <input class="form-input" v-model="form.phone" type="number" placeholder="请输入手机号" placeholder-class="ph"/>
      </view>

      <view class="form-item">
        <view class="form-label">微信号</view>
        <input class="form-input" v-model="form.wechat" placeholder="请输入微信号" placeholder-class="ph"/>
      </view>

      <view class="form-item">
        <view class="form-label">邮箱</view>
        <input class="form-input" v-model="form.email" placeholder="请输入邮箱" placeholder-class="ph"/>
      </view>

      <view class="form-item">
        <view class="form-label">业务领域</view>
        <input class="form-input" v-model="form.businessField" placeholder="如：互联网/教育/医疗" placeholder-class="ph"/>
      </view>

      <view class="form-item">
        <view class="form-label">个人简介</view>
        <textarea class="form-textarea" v-model="form.bio" placeholder="介绍一下自己吧..." placeholder-class="ph" :maxlength="200"/>
        <view class="char-count">{{ form.bio?.length || 0 }}/200</view>
      </view>

      <view class="form-item">
        <view class="form-label">视频号ID</view>
        <input class="form-input" v-model="form.videoChannel" placeholder="绑定后可在名片展示视频号" placeholder-class="ph"/>
      </view>

      <view class="form-item switch-item">
        <view class="form-label">公开到人脉集市</view>
        <switch :checked="form.isPublic" @change="form.isPublic=$event.detail.value" color="#165dff"/>
      </view>
    </view>

    <view class="footer">
      <button class="submit-btn" @click="submit" :disabled="submitting">
        {{ submitting ? '提交中...' : (isEdit ? '保存修改' : '创建名片') }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';

const isEdit = ref(false);
const submitting = ref(false);
const form = ref({
  name: '', position: '', company: '', phone: '', wechat: '',
  email: '', businessField: '', bio: '', videoChannel: '', isPublic: true, avatar: '',
});

onMounted(async () => {
  const pages = getCurrentPages();
  const id = pages[pages.length - 1].options.id;
  if (id) {
    isEdit.value = true;
    try {
      const res = await cardApi.getCard(id);
      form.value = { ...res.card, isPublic: res.card.isPublic };
    } catch (e) {}
  }
});

function chooseAvatar() {
  uni.chooseImage({
    count: 1,
    success: (res) => {
      form.value.avatar = res.tempFilePaths[0];
    },
  });
}

async function submit() {
  if (!form.value.name) {
    uni.showToast({ title: '请输入姓名', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    if (isEdit.value) {
      await cardApi.updateCard(form.value.id, form.value);
      uni.showToast({ title: '保存成功', icon: 'success' });
    } else {
      await cardApi.createCard(form.value);
      uni.showToast({ title: '创建成功', icon: 'success' });
    }
    setTimeout(() => uni.navigateBack(), 1000);
  } catch (e) {
    uni.showToast({ title: e.message || '操作失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.create-page {
  min-height: 100vh;
  background: #f2f3f5;
  padding-bottom: 160rpx;
}
.header {
  background: linear-gradient(135deg, #165dff, #4080ff);
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
.form {
  margin: -20rpx 24rpx 0;
  background: #fff;
  border-radius: 20px;
  padding: 32rpx 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.form-item {
  margin-bottom: 32rpx;
}
.form-label {
  font-size: 26rpx;
  color: #4e5969;
  margin-bottom: 16rpx;
  font-weight: 500;
}
.required {
  color: #f5222d;
}
.form-input {
  height: 88rpx;
  background: #f7f8fa;
  border-radius: 12px;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #1d2129;
}
.ph {
  color: #c9cdd4;
}
.form-textarea {
  width: 100%;
  height: 160rpx;
  background: #f7f8fa;
  border-radius: 12px;
  padding: 20rpx 24rpx;
  font-size: 28rpx;
  color: #1d2129;
  box-sizing: border-box;
}
.char-count {
  text-align: right;
  font-size: 22rpx;
  color: #c9cdd4;
  margin-top: 8rpx;
}
.avatar-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.avatar-upload {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
  background: #f7f8fa;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.avatar-img {
  width: 100%;
  height: 100%;
}
.avatar-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}
.plus {
  font-size: 48rpx;
  color: #c9cdd4;
}
.hint {
  font-size: 20rpx;
  color: #c9cdd4;
}
.switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
.submit-btn {
  background: #165dff;
  color: #fff;
  border-radius: 44rpx;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 32rpx;
  font-weight: 600;
}
.submit-btn[disabled] {
  opacity: 0.6;
}
</style>
