<template>
  <view class="apply-page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <view class="nav-back" @click="goBack">
        <SIcon name="dynamic" size="default" color="#1d2129" />
      </view>
      <view class="nav-title">入驻申请</view>
      <view class="nav-right"></view>
    </view>

    <!-- 入驻类型选择 -->
    <view class="type-section">
      <view class="type-title">选择入驻类型</view>
      <view class="type-cards">
        <view class="type-card" :class="{ active: applyType === 'individual' }" @click="applyType = 'individual'">
          <view class="type-icon"><SIcon name="user" size="xlarge" :color="applyType === 'individual' ? '#165dff' : '#86909c'" /></view>
          <view class="type-name">个人入驻</view>
          <view class="type-desc">个体/顾问/会员</view>
        </view>
        <view class="type-card" :class="{ active: applyType === 'enterprise' }" @click="applyType = 'enterprise'">
          <view class="type-icon"><SIcon name="building" size="xlarge" :color="applyType === 'enterprise' ? '#165dff' : '#86909c'" /></view>
          <view class="type-name">企业入驻</view>
          <view class="type-desc">企业单位+员工</view>
        </view>
      </view>
    </view>

    <!-- 口令绑定 -->
    <view class="form-card">
      <view class="form-title">
        <SIcon name="key" size="default" color="#165dff" />
        <text>租户绑定</text>
      </view>
      <view class="form-item">
        <view class="form-label">入驻口令 <text class="required">*</text></view>
        <input class="form-input" v-model="bindCode" placeholder="请输入租户管理员提供的入驻口令" />
      </view>
      <view class="form-hint">口令由租户管理员在后台生成，用于绑定到指定租户项目</view>
    </view>

    <!-- 个人信息 -->
    <view class="form-card" v-if="applyType === 'individual'">
      <view class="form-title">
        <SIcon name="user" size="default" color="#165dff" />
        <text>个人信息</text>
      </view>
      <view class="form-item">
        <view class="form-label">姓名 <text class="required">*</text></view>
        <input class="form-input" v-model="form.name" placeholder="请输入真实姓名" />
      </view>
      <view class="form-item">
        <view class="form-label">手机号 <text class="required">*</text></view>
        <input class="form-input" v-model="form.phone" type="number" placeholder="请输入手机号" />
      </view>
      <view class="form-item">
        <view class="form-label">职位</view>
        <input class="form-input" v-model="form.position" placeholder="请输入职位（选填）" />
      </view>
      <view class="form-item">
        <view class="form-label">公司</view>
        <input class="form-input" v-model="form.company" placeholder="请输入公司名称（选填）" />
      </view>
    </view>

    <!-- 企业信息 -->
    <view class="form-card" v-if="applyType === 'enterprise'">
      <view class="form-title">
        <SIcon name="building" size="default" color="#165dff" />
        <text>企业信息</text>
      </view>
      <view class="form-item">
        <view class="form-label">企业名称 <text class="required">*</text></view>
        <input class="form-input" v-model="form.enterpriseName" placeholder="请输入企业全称" />
      </view>
      <view class="form-item">
        <view class="form-label">行业</view>
        <input class="form-input" v-model="form.industry" placeholder="请输入所属行业（选填）" />
      </view>
      <view class="form-item">
        <view class="form-label">管理员姓名 <text class="required">*</text></view>
        <input class="form-input" v-model="form.name" placeholder="企业管理员姓名" />
      </view>
      <view class="form-item">
        <view class="form-label">管理员手机号 <text class="required">*</text></view>
        <input class="form-input" v-model="form.phone" type="number" placeholder="管理员手机号" />
      </view>
    </view>

    <!-- 提交按钮 -->
    <view class="submit-section">
      <button class="submit-btn" :disabled="submitting" @click="submitApply">
        {{ submitting ? '提交中...' : '提交入驻申请' }}
      </button>
      <view class="submit-hint">提交后需租户管理员审核通过即可入驻</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import SIcon from '../../components/SIcon.vue';
import { cardApi } from '../../utils/cardApi.js';

const applyType = ref('individual');
const bindCode = ref('');
const submitting = ref(false);
const form = ref({
  name: '',
  phone: '',
  position: '',
  company: '',
  enterpriseName: '',
  industry: '',
});

function goBack() {
  uni.navigateBack();
}

async function submitApply() {
  if (!bindCode.value) {
    uni.showToast({ title: '请输入入驻口令', icon: 'none' });
    return;
  }
  if (!form.value.name || !form.value.phone) {
    uni.showToast({ title: '请填写必填项', icon: 'none' });
    return;
  }

  submitting.value = true;
  try {
    await cardApi.submitApply({
      type: applyType.value,
      bindCode: bindCode.value,
      ...form.value,
    });
    uni.showToast({ title: '申请已提交，请等待审核', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 1500);
  } catch (e) {
    uni.showToast({ title: e.message || '提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.apply-page { min-height: 100vh; background: #f5f7fa; padding-bottom: 120rpx; }

/* 导航栏 */
.nav-bar { display: flex; align-items: center; justify-content: space-between; height: 88rpx; padding: 88rpx 32rpx 0; background: #fff; }
.nav-back { width: 64rpx; height: 64rpx; display: flex; align-items: center; justify-content: center; }
.nav-title { font-size: 32rpx; font-weight: 600; color: #1d2129; }
.nav-right { width: 64rpx; }

/* 类型选择 */
.type-section { padding: 32rpx 24rpx; }
.type-title { font-size: 28rpx; font-weight: 600; color: #1d2129; margin-bottom: 20rpx; }
.type-cards { display: flex; gap: 20rpx; }
.type-card { flex: 1; background: #fff; border-radius: 16rpx; padding: 32rpx 20rpx; text-align: center; border: 4rpx solid transparent; transition: all 0.2s; }
.type-card.active { border-color: #165dff; background: rgba(22,93,255,0.04); }
.type-icon { margin-bottom: 12rpx; }
.type-name { font-size: 28rpx; font-weight: 600; color: #1d2129; }
.type-desc { font-size: 22rpx; color: #86909c; margin-top: 4rpx; }

/* 表单卡片 */
.form-card { background: #fff; margin: 0 24rpx 16rpx; border-radius: 16rpx; padding: 28rpx; }
.form-title { display: flex; align-items: center; gap: 10rpx; font-size: 28rpx; font-weight: 600; color: #1d2129; margin-bottom: 24rpx; }
.form-item { margin-bottom: 24rpx; }
.form-item:last-child { margin-bottom: 0; }
.form-label { font-size: 26rpx; color: #4e5969; margin-bottom: 10rpx; }
.required { color: #f53f3f; }
.form-input { height: 80rpx; background: #f7f8fa; border-radius: 10rpx; padding: 0 24rpx; font-size: 28rpx; color: #1d2129; }
.form-hint { font-size: 22rpx; color: #86909c; margin-top: 12rpx; }

/* 提交 */
.submit-section { padding: 40rpx 24rpx; }
.submit-btn { width: 100%; height: 88rpx; background: #165dff; color: #fff; font-size: 30rpx; font-weight: 600; border-radius: 44rpx; border: none; }
.submit-btn[disabled] { opacity: 0.6; }
.submit-hint { text-align: center; font-size: 22rpx; color: #86909c; margin-top: 16rpx; }
</style>
