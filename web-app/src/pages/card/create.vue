<template>
  <view class="create-page">
    <!-- 顶部标题 -->
    <view class="header">
      <view class="title">{{ isEdit ? '编辑名片' : '创建名片' }}</view>
      <view class="subtitle">三步完成，快速创建专属名片</view>
    </view>

    <!-- 进度指示器 -->
    <view class="progress-bar">
      <view class="progress-step" v-for="(step, idx) in steps" :key="idx">
        <view class="step-dot" :class="{ active: currentStep >= idx, done: currentStep > idx }">
          <text v-if="currentStep > idx">✓</text>
          <text v-else>{{ idx + 1 }}</text>
        </view>
        <view class="step-label" :class="{ active: currentStep === idx }">{{ step }}</view>
      </view>
      <view class="progress-line">
        <view class="progress-fill" :style="{ width: (currentStep / 2) * 100 + '%' }"></view>
      </view>
    </view>

    <!-- 卡片容器 -->
    <view class="cards-container">
      <!-- 卡片1：基本信息 -->
      <view class="card" :class="{ active: currentStep === 0, prev: currentStep > 0 }">
        <view class="card-title">基本信息</view>
        <view class="card-desc">填写您的核心联系信息</view>

        <view class="form-item avatar-item">
          <view class="form-label">头像</view>
          <view class="avatar-upload" @click="chooseAvatar">
            <image v-if="form.avatar" :src="form.avatar" class="avatar-img" mode="aspectFill" />
            <view v-else class="avatar-placeholder">
              <text class="avatar-plus">+</text>
            </view>
          </view>
        </view>

        <view class="form-item" :class="{ error: errors.name }">
          <view class="form-label">姓名 <text class="required">*</text></view>
          <input class="form-input" v-model="form.name" placeholder="请输入姓名" placeholder-class="ph" />
          <view class="error-tip" v-if="errors.name">请输入姓名</view>
        </view>

        <view class="form-item">
          <view class="form-label">职位</view>
          <input class="form-input" v-model="form.position" placeholder="如：产品经理" placeholder-class="ph" />
        </view>

        <view class="form-item">
          <view class="form-label">公司</view>
          <input class="form-input" v-model="form.company" placeholder="请输入公司名称" placeholder-class="ph" />
        </view>

        <view class="form-item" :class="{ error: errors.phone }">
          <view class="form-label">手机号</view>
          <input class="form-input" v-model="form.phone" type="number" placeholder="请输入手机号" placeholder-class="ph" />
          <view class="error-tip" v-if="errors.phone">请输入手机号</view>
        </view>
      </view>

      <!-- 卡片2：详细信息 -->
      <view class="card" :class="{ active: currentStep === 1, prev: currentStep > 1 }">
        <view class="card-title">详细信息</view>
        <view class="card-desc">丰富您的名片内容（可选）</view>

        <view class="form-item">
          <view class="form-label">微信号</view>
          <input class="form-input" v-model="form.wechat" placeholder="请输入微信号" placeholder-class="ph" />
        </view>

        <view class="form-item">
          <view class="form-label">邮箱</view>
          <input class="form-input" v-model="form.email" placeholder="请输入邮箱" placeholder-class="ph" />
        </view>

        <view class="form-item">
          <view class="form-label">业务领域</view>
          <input class="form-input" v-model="form.businessField" placeholder="如：互联网/教育/医疗" placeholder-class="ph" />
        </view>

        <view class="form-item">
          <view class="form-label">个人简介</view>
          <textarea class="form-textarea" v-model="form.bio" placeholder="介绍一下自己吧..." placeholder-class="ph" :maxlength="200" />
        </view>
      </view>

      <!-- 卡片3：发布设置 -->
      <view class="card" :class="{ active: currentStep === 2 }">
        <view class="card-title">发布设置</view>
        <view class="card-desc">设置名片展示和发布选项</view>

        <view class="form-item">
          <view class="form-label">视频号ID</view>
          <input class="form-input" v-model="form.videoChannel" placeholder="绑定后可在名片展示视频号" placeholder-class="ph" />
        </view>

        <view class="form-item switch-item">
          <view class="form-label">公开到人脉集市</view>
          <switch :checked="form.isPublic" @change="form.isPublic = $event.detail.value" color="#165dff" />
        </view>

        <!-- 名片预览 -->
        <view class="preview-section">
          <view class="preview-title">名片预览</view>
          <view class="preview-card">
            <view class="preview-header">
              <view class="preview-avatar">{{ form.name?.[0] || '名' }}</view>
              <view class="preview-info">
                <view class="preview-name">{{ form.name || '您的姓名' }}</view>
                <view class="preview-position">{{ form.position || '职位' }}</view>
                <view class="preview-company">{{ form.company || '公司名称' }}</view>
              </view>
            </view>
            <view class="preview-divider"></view>
            <view class="preview-contact">
              <view class="contact-item" v-if="form.phone">
                <text class="contact-label">手机</text>
                <text class="contact-value">{{ form.phone }}</text>
              </view>
              <view class="contact-item" v-if="form.wechat">
                <text class="contact-label">微信</text>
                <text class="contact-value">{{ form.wechat }}</text>
              </view>
              <view class="contact-item" v-if="form.email">
                <text class="contact-label">邮箱</text>
                <text class="contact-value">{{ form.email }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view class="footer">
      <view class="footer-btns">
        <button v-if="currentStep > 0" class="btn-secondary" @click="prevStep">上一步</button>
        <button v-if="currentStep === 1" class="btn-skip" @click="skipDetail">跳过</button>
        <button v-if="currentStep < 2" class="btn-primary" @click="nextStep">下一步</button>
        <button v-if="currentStep === 2" class="btn-primary" @click="submit" :disabled="submitting">
          {{ submitting ? '提交中...' : (isEdit ? '保存修改' : '发布名片') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';

const isEdit = ref(false);
const submitting = ref(false);
const currentStep = ref(0);
const steps = ['基本信息', '详细信息', '发布设置'];

const form = reactive({
  id: null,
  name: '', position: '', company: '', phone: '', wechat: '',
  email: '', businessField: '', bio: '', videoChannel: '', isPublic: true, avatar: '',
});

const errors = reactive({ name: false, phone: false });

onMounted(async () => {
  const pages = getCurrentPages();
  const id = pages[pages.length - 1].options.id;
  if (id) {
    isEdit.value = true;
    try {
      const res = await cardApi.getCard(id);
      Object.assign(form, res.card);
    } catch (e) {}
  }
});

function chooseAvatar() {
  uni.chooseImage({
    count: 1,
    success: (res) => {
      form.avatar = res.tempFilePaths[0];
    },
  });
}

function validateStep(step) {
  if (step === 0) {
    errors.name = !form.name.trim();
    errors.phone = !form.phone.trim();
    return !errors.name && !errors.phone;
  }
  return true;
}

function nextStep() {
  if (!validateStep(currentStep.value)) {
    uni.showToast({ title: '请完善必填信息', icon: 'none' });
    return;
  }
  if (currentStep.value < 2) {
    currentStep.value++;
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--;
  }
}

function skipDetail() {
  currentStep.value = 2;
}

async function submit() {
  if (!validateStep(0)) {
    currentStep.value = 0;
    uni.showToast({ title: '请完善必填信息', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    if (isEdit.value) {
      await cardApi.updateCard(form.id, form);
      uni.showToast({ title: '保存成功', icon: 'success' });
    } else {
      await cardApi.createCard(form);
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
  background: #f5f7fa;
  padding-bottom: 140rpx;
}

/* 顶部标题 */
.header {
  background: linear-gradient(135deg, #165dff, #4080ff);
  padding: 88rpx 32rpx 32rpx;
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

/* 进度指示器 */
.progress-bar {
  display: flex;
  justify-content: space-around;
  align-items: flex-start;
  padding: 32rpx 48rpx 16rpx;
  position: relative;
}
.progress-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1;
}
.step-dot {
  width: 48rpx;
  height: 48rpx;
  border-radius: 24rpx;
  background: #e5e6eb;
  color: #86909c;
  font-size: 24rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}
.step-dot.active {
  background: #165dff;
  color: #fff;
  box-shadow: 0 4rpx 12rpx rgba(22,93,255,0.3);
}
.step-dot.done {
  background: #00b42a;
  color: #fff;
}
.step-label {
  font-size: 22rpx;
  color: #86909c;
  margin-top: 8rpx;
}
.step-label.active {
  color: #165dff;
  font-weight: 500;
}
.progress-line {
  position: absolute;
  top: 56rpx;
  left: 80rpx;
  right: 80rpx;
  height: 4rpx;
  background: #e5e6eb;
  border-radius: 2rpx;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #165dff, #4080ff);
  border-radius: 2rpx;
  transition: width 0.3s;
}

/* 卡片容器 */
.cards-container {
  padding: 16rpx 24rpx;
  position: relative;
  min-height: 600rpx;
}
.card {
  background: #fff;
  border-radius: 20rpx;
  padding: 40rpx 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.06);
  position: absolute;
  left: 24rpx;
  right: 24rpx;
  opacity: 0;
  transform: translateX(60rpx);
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}
.card.active {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
  position: relative;
}
.card.prev {
  opacity: 0;
  transform: translateX(-60rpx);
}
.card-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1d2129;
  margin-bottom: 8rpx;
}
.card-desc {
  font-size: 24rpx;
  color: #86909c;
  margin-bottom: 32rpx;
}

/* 表单 */
.form-item {
  margin-bottom: 28rpx;
}
.form-item.error .form-input {
  border-color: #f53f3f;
}
.error-tip {
  font-size: 22rpx;
  color: #f53f3f;
  margin-top: 8rpx;
}
.form-label {
  font-size: 26rpx;
  color: #4e5969;
  margin-bottom: 16rpx;
}
.required {
  color: #f53f3f;
}
.form-input {
  width: 100%;
  height: 80rpx;
  background: #f7f8fa;
  border: 2rpx solid transparent;
  border-radius: 12rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #1d2129;
  box-sizing: border-box;
  transition: all 0.2s;
}
.form-input:focus {
  border-color: #165dff;
  background: #fff;
}
.form-textarea {
  width: 100%;
  height: 160rpx;
  background: #f7f8fa;
  border: 2rpx solid transparent;
  border-radius: 12rpx;
  padding: 20rpx 24rpx;
  font-size: 28rpx;
  color: #1d2129;
  box-sizing: border-box;
}
.ph {
  color: #c9cdd4;
}

/* 头像上传 */
.avatar-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.avatar-upload {
  width: 120rpx;
  height: 120rpx;
  border-radius: 60rpx;
  overflow: hidden;
}
.avatar-img {
  width: 100%;
  height: 100%;
}
.avatar-placeholder {
  width: 100%;
  height: 100%;
  background: #f2f3f5;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed #c9cdd4;
  border-radius: 60rpx;
}
.avatar-plus {
  font-size: 48rpx;
  color: #c9cdd4;
}

/* 开关项 */
.switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.switch-item .form-label {
  margin-bottom: 0;
}

/* 名片预览 */
.preview-section {
  margin-top: 32rpx;
  padding-top: 32rpx;
  border-top: 2rpx solid #f2f3f5;
}
.preview-title {
  font-size: 26rpx;
  color: #86909c;
  margin-bottom: 20rpx;
}
.preview-card {
  background: linear-gradient(135deg, #165dff, #4080ff);
  border-radius: 16rpx;
  padding: 32rpx;
  color: #fff;
}
.preview-header {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.preview-avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 40rpx;
  background: rgba(255,255,255,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  font-weight: 600;
}
.preview-name {
  font-size: 32rpx;
  font-weight: 600;
}
.preview-position {
  font-size: 24rpx;
  opacity: 0.9;
  margin-top: 4rpx;
}
.preview-company {
  font-size: 22rpx;
  opacity: 0.7;
  margin-top: 4rpx;
}
.preview-divider {
  height: 2rpx;
  background: rgba(255,255,255,0.2);
  margin: 24rpx 0;
}
.preview-contact {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.contact-item {
  display: flex;
  font-size: 24rpx;
}
.contact-label {
  width: 80rpx;
  opacity: 0.7;
}
.contact-value {
  flex: 1;
}

/* 底部操作栏 */
.footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  padding: 24rpx 32rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -4rpx 16rpx rgba(0,0,0,0.06);
}
.footer-btns {
  display: flex;
  gap: 20rpx;
}
.btn-primary {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  background: linear-gradient(135deg, #165dff, #4080ff);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  border-radius: 44rpx;
  border: none;
}
.btn-primary[disabled] {
  opacity: 0.6;
}
.btn-secondary {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  background: #f2f3f5;
  color: #4e5969;
  font-size: 30rpx;
  border-radius: 44rpx;
  border: none;
}
.btn-skip {
  width: 160rpx;
  height: 88rpx;
  line-height: 88rpx;
  background: transparent;
  color: #86909c;
  font-size: 28rpx;
  border-radius: 44rpx;
  border: 2rpx solid #e5e6eb;
}
</style>
