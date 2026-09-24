<template>
  <view class="create-page">
    <view v-if="applyMsg" class="apply-banner" :class="{ 'apply-banner--reject': applyStatus === 'rejected' }">
      {{ applyMsg }}
    </view>
    <!-- 顶部标题 -->
    <view class="header">
      <view class="row1">
        <view class="title">{{ isEdit ? '编辑名片' : '创建你的名片' }}</view>
        <view class="hero-badge">
          <SIcon name="shield" size="small" color="#07c160" />
          微信授权登录
        </view>
      </view>
      <view class="subtitle">{{ isEdit ? '完善信息，让别人更了解你' : '个人也可以创建，无需企业账号 · 2 分钟完成' }}</view>
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
      <!-- 卡片1：选择类型+基本信息 -->
      <view class="card" :class="{ active: currentStep === 0, prev: currentStep > 0 }">
        <view v-if="!isEdit" class="card-title">选择名片类型</view>
        <view v-if="!isEdit" class="card-desc">个人也可以创建，无需企业账号</view>

        <!-- 类型选择（仅新建时） -->
        <view v-if="!isEdit" class="type-cards">
          <view class="type-card" :class="{ active: cardType === 'individual' }" @click="cardType = 'individual'">
            <view class="type-icon" style="background: linear-gradient(135deg,var(--success),#1edc87);">
              <SIcon name="user" size="xlarge" color="#ffffff" />
            </view>
            <view class="type-info">
              <view class="type-name">个人名片</view>
              <view class="type-desc">自由职业者 / 个体从业者 / 普通人</view>
            </view>
            <view class="type-check" v-if="cardType === 'individual'">✓</view>
          </view>
          <view class="type-card" :class="{ active: cardType === 'enterprise' }" @click="cardType = 'enterprise'">
            <view class="type-icon" style="background: linear-gradient(135deg,var(--primary-deep),#3b7bd4);">
              <SIcon name="building" size="xlarge" color="#ffffff" />
            </view>
            <view class="type-info">
              <view class="type-name">企业名片</view>
              <view class="type-desc">企业主体 / 团队 / 门店</view>
            </view>
            <view class="type-check" v-if="cardType === 'enterprise'">✓</view>
          </view>
        </view>

        <!-- 选择模板（公共模板 + 租户私有模板） -->
        <view class="card-title" style="margin-top: 20rpx;">选择模板</view>
        <view class="card-desc">套用模板主题，保存后可在名片详情实时预览</view>
        <scroll-view class="tpl-scroll" scroll-x :show-scrollbar="false">
          <view class="tpl-list">
            <view
              v-for="t in templates" :key="t.id"
              class="tpl-item" :class="{ active: form.templateId === t.id }"
              @click="selectTemplate(t)"
            >
              <view class="tpl-cover" :style="{ background: (t.themeConfig && t.themeConfig.primary) || 'var(--success)' }">
                <image v-if="t.cover" :src="t.cover" class="tpl-cover-img" mode="aspectFill" />
                <text v-else class="tpl-cover-text">{{ t.name.slice(0, 2) }}</text>
                <text class="tpl-layout" v-if="t.layout === 'full'">全屏大图</text>
                <text class="tpl-price-tag" :class="Number(t.price) > 0 ? 'paid' : 'free'">{{ Number(t.price) > 0 ? '¥' + Number(t.price) : '免费' }}</text>
                <view class="tpl-owned" v-if="t.purchased">已购</view>
                <view class="tpl-check" v-if="form.templateId === t.id">✓</view>
              </view>
              <text class="tpl-name">{{ t.name }}</text>
            </view>
          </view>
        </scroll-view>
        <view class="bind-hint">未选择时使用默认名片样式</view>

        <!-- 供需标签（多选≤3） -->
        <view class="card-title" style="margin-top: 20rpx;">供需标签</view>
        <view class="need-row">
          <view
            class="need-item"
            v-for="t in NEED_OPTIONS"
            :key="t"
            :class="{ on: form.needTags.includes(t) }"
            @click="toggleNeed(t)"
          >{{ t }}</view>
        </view>
        <view class="bind-hint">最多选 3 个，展示在名片详情页，帮助别人快速了解你的需求</view>

        <!-- 入驻绑定（仅新建时，可折叠） -->
        <view v-if="!isEdit" class="bind-section">
          <view class="bind-header" @click="showBind = !showBind">
            <view class="bind-title">
              <SIcon name="key" size="small" color="#07c160" />
              入驻绑定（选填）
            </view>
            <view class="bind-arrow">{{ showBind ? '收起' : '展开' }}</view>
          </view>
          <view v-if="showBind" class="bind-body">
            <view class="form-item">
              <view class="form-label">入驻口令</view>
              <input class="form-input" v-model="form.bindCode" placeholder="填入口令同时完成入驻，不填则仅创建名片" placeholder-class="ph" />
            </view>
            <view class="form-item" v-if="cardType === 'enterprise'">
              <view class="form-label">企业名称</view>
              <input class="form-input" v-model="form.enterpriseName" placeholder="请输入企业全称" placeholder-class="ph" />
            </view>
            <view class="form-item" v-if="cardType === 'enterprise'">
              <view class="form-label">所属行业</view>
              <input class="form-input" v-model="form.industry" placeholder="如：互联网/制造/服务" placeholder-class="ph" />
            </view>
            <view class="bind-hint">口令由管理员提供，用于绑定到指定客户项目</view>
          </view>
        </view>

        <view class="card-title" style="margin-top: 20rpx;">填写基本信息</view>

        <view class="form-item">
          <view class="form-label">姓名 <text class="required">*</text></view>
          <input class="form-input" v-model="form.name" placeholder="请输入你的姓名" placeholder-class="ph" />
          <view class="error-tip" v-if="errors.name">请输入姓名</view>
        </view>

        <view class="form-item">
          <view class="form-label">职位/头衔</view>
          <input class="form-input" v-model="form.position" placeholder="自由职业者 / 顾问 / 创始人…" placeholder-class="ph" />
        </view>

        <view class="form-item">
          <view class="form-label">所在城市</view>
          <input class="form-input" v-model="form.city" placeholder="如：东莞" placeholder-class="ph" />
        </view>

        <view class="form-item">
          <view class="form-label">一句话介绍</view>
          <input class="form-input" v-model="form.bio" placeholder="你专注什么、能提供什么" placeholder-class="ph" />
        </view>

        <!-- 头像上传 -->
        <view class="card-title" style="margin-top: 20rpx;">上传头像</view>
        <view class="avatar-row">
          <view class="avatar-upload" @click="chooseAvatar">
            <image v-if="form.avatar" :src="form.avatar" class="avatar-img" mode="aspectFill" />
            <view v-else class="avatar-placeholder">
              <text class="avatar-plus">+</text>
              <text class="avatar-text">上传</text>
            </view>
          </view>
          <view class="avatar-hint">支持 JPG/PNG，建议正方形</view>
        </view>

        <!-- 语音简介（VIP权益：上传音频；克隆语音后续） -->
        <view class="card-title" style="margin-top: 20rpx;">语音简介<text class="vip-tag">VIP</text></view>
        <view class="voice-row" v-if="voiceAllowed">
          <view class="voice-upload" @click="chooseVoice" v-if="!form.voiceUrl">
            <text class="voice-plus">+</text>
            <text class="voice-text">上传音频</text>
          </view>
          <view class="voice-file" v-else>
            <SIcon name="dynamic" size="large" color="#165dff" />
            <view class="vf-info">
              <view class="vf-name">{{ form.voiceName || '语音简介' }}</view>
              <view class="vf-tip">点击播放试听</view>
            </view>
            <audio class="voice-audio" :src="voiceSrc" controls v-if="voiceSrc" />
            <view class="vf-actions">
              <text class="vf-del" @click="clearVoice">删除</text>
              <text class="vf-re" @click="chooseVoice">重传</text>
            </view>
          </view>
          <view class="avatar-hint">支持 mp3/wav/m4a/aac/ogg，≤10MB</view>
        </view>
        <view class="voice-locked" v-else @click="goMember">
          <SIcon name="crown" size="small" color="#ffd21e" />
          <text>开通会员解锁语音简介</text>
        </view>
      </view>

      <!-- 卡片2：联系方式 -->
      <view class="card" :class="{ active: currentStep === 1, prev: currentStep > 1 }">
        <view class="card-title">联系方式</view>
        <view class="card-desc">方便客户找到你</view>

        <view class="form-item" :class="{ error: errors.phone }">
          <view class="form-label">手机号 <text class="required">*</text></view>
          <input class="form-input" v-model="form.phone" type="number" placeholder="请输入手机号" placeholder-class="ph" />
          <view class="error-tip" v-if="errors.phone">请输入手机号</view>
        </view>

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
                <view class="preview-position">{{ form.position || '职位/头衔' }}</view>
                <view class="preview-company">{{ form.city || '所在城市' }}</view>
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
          {{ submitting ? '提交中...' : (isEdit ? '保存修改' : '创建名片') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi, paymentApi } from '../../utils/cardApi.js';
import { track, trackPageView } from '../../utils/analytics.js';
import SIcon from '../../components/SIcon.vue';

const isEdit = ref(false);
const submitting = ref(false);
const applyStatus = ref('');
const applyMsg = ref('');
const currentStep = ref(0);
const cardType = ref('individual');
const showBind = ref(false);
const steps = ['基本信息', '联系方式', '发布设置'];

const form = reactive({
  id: null,
  name: '', position: '', city: '', bio: '', avatar: '',
  phone: '', wechat: '', email: '', businessField: '', videoChannel: '', isPublic: true, needTags: [],
  bindCode: '', enterpriseName: '', industry: '',
  voiceUrl: '', voiceName: '',
});
const voiceAllowed = ref(false);
const voiceSrc = ref('');

const NEED_OPTIONS = ['找渠道', '求合作', '招合伙人', '寻资源', '招代理', '找投资'];
function parseNeedTags(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (!v) return [];
  try { const arr = JSON.parse(v); return Array.isArray(arr) ? arr.filter(Boolean) : []; } catch (e) { return []; }
}
function toggleNeed(t) {
  const i = form.needTags.indexOf(t);
  if (i >= 0) form.needTags.splice(i, 1);
  else if (form.needTags.length < 3) form.needTags.push(t);
  else uni.showToast({ title: '最多选择 3 个', icon: 'none' });
}

const errors = reactive({ name: false, phone: false });

const templates = ref([]);
const templatesLoaded = ref(false);
async function loadTemplates(force = false) {
  if (templatesLoaded.value && !force) return;
  try {
    const res = await cardApi.getTemplates();
    templates.value = res.templates || [];
    // 默认选中第一个可用模板（跳过付费未购）
    if (templates.value.length && !form.templateId) {
      const first = templates.value.find((t) => Number(t.price) <= 0 || t.purchased) || templates.value[0];
      form.templateId = first.id;
    }
    templatesLoaded.value = true;
  } catch (e) {
    console.warn('模板加载失败', e);
  }
}
function selectTemplate(tpl) {
  // 付费未购：先购买再选中
  if (Number(tpl.price) > 0 && !tpl.purchased) {
    uni.showModal({
      title: '购买模板',
      content: `「${tpl.name}」需付费 ¥${Number(tpl.price)}，购买后永久可用。是否购买？`,
      success: async (r) => {
        if (!r.confirm) return;
        uni.showLoading({ title: '创建订单...' });
        try {
          const res = await cardApi.buyTemplate(tpl.id);
          uni.hideLoading();
          uni.showModal({
            title: '确认支付',
            content: `确认支付 ¥${(res.amount / 100).toFixed(2)} 购买「${res.templateName}」？`,
            success: async (r2) => {
              if (!r2.confirm) return;
              uni.showLoading({ title: '支付中...' });
              try {
                await paymentApi.mockPay(res.orderNo);
                uni.hideLoading();
                uni.showToast({ title: '购买成功', icon: 'success' });
                await loadTemplates(true);
                form.templateId = tpl.id;
              } catch (e) {
                uni.hideLoading();
                uni.showToast({ title: e.message || '支付失败', icon: 'none' });
              }
            },
          });
        } catch (e) {
          uni.hideLoading();
          uni.showToast({ title: e.message || '创建订单失败', icon: 'none' });
        }
      },
    });
    return;
  }
  form.templateId = form.templateId === tpl.id ? '' : tpl.id;
}

onShow(() => {
  trackPageView('/pages/card/create');
});

onMounted(async () => {
  // 语音简介会员权限（阶段C）
  if (uni.getStorageSync('card_token')) {
    try {
      const feats = await cardApi.getRadarFeatures();
      voiceAllowed.value = !!(feats && feats.isMember);
    } catch (e) {}
  }
  // 加载模板列表（新建/编辑均可用，编辑时默认选中当前模板）
  loadTemplates();
  const pages = getCurrentPages();
  const id = pages[pages.length - 1].options.id;
  if (id) {
    isEdit.value = true;
    try {
      const res = await cardApi.getCard(id);
      Object.assign(form, res.card);
      form.needTags = parseNeedTags(form.needTags);
    } catch (e) {}
  } else {
    // 新建时展示本人入驻申请审核状态
    try {
      const res = await cardApi.getApplyStatus();
      const st = res.apply?.status;
      if (st === 'pending') {
        applyStatus.value = 'pending';
        applyMsg.value = `入驻申请审核中（${res.apply.customerName || ''}），审核通过后可正常使用平台内功能`;
      } else if (st === 'rejected') {
        applyStatus.value = 'rejected';
        applyMsg.value = '上次入驻申请未通过，可修改资料后重新提交';
      }
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

// 语音简介（H5 端原生 file 选择；小程序端后续按 uni.uploadFile 接入）
function chooseVoice() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!/^(audio\/|.*\.(mp3|wav|m4a|aac|ogg|webm)$)/i.test(file.type)) {
      return uni.showToast({ title: '仅支持 mp3/wav/m4a/aac/ogg 音频', icon: 'none' });
    }
    if (file.size > 10 * 1024 * 1024) {
      return uni.showToast({ title: '音频大小不能超过 10MB', icon: 'none' });
    }
    uni.showLoading({ title: '上传中…' });
    try {
      const res = await cardApi.uploadVoiceFile(file);
      form.voiceUrl = res.url;
      form.voiceName = res.name || file.name || '语音简介';
      voiceSrc.value = res.url;
      uni.showToast({ title: '上传成功', icon: 'success' });
    } catch (e) {
      uni.showToast({ title: e.message || '上传失败', icon: 'none' });
    } finally {
      uni.hideLoading();
    }
  };
  input.click();
}

function clearVoice() {
  form.voiceUrl = '';
  form.voiceName = '';
  voiceSrc.value = '';
}

function goMember() {
  uni.navigateTo({ url: '/pages/card/member' });
}

function validateStep(step) {
  if (step === 0) {
    errors.name = !form.name.trim();
    return !errors.name;
  }
  if (step === 1) {
    errors.phone = !form.phone.trim();
    return !errors.phone;
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
  if (!validateStep(0) || !validateStep(1)) {
    currentStep.value = 0;
    uni.showToast({ title: '请完善必填信息', icon: 'none' });
    return;
  }
  submitting.value = true;
  let newCardId = null;
  try {
    if (isEdit.value) {
      await cardApi.updateCard(form.id, { ...form, needTags: JSON.stringify(form.needTags) });
      uni.showToast({ title: '保存成功', icon: 'success' });
      track('form_submit', { cardId: form.id || newCardId || 0, page: '/pages/card/create', extra: { isEdit: isEdit.value } });
    } else {
      const payload = { ...form, needTags: JSON.stringify(form.needTags) };
      // 入驻绑定：填了口令才同时入驻
      if (payload.bindCode) {
        payload.applyType = cardType.value;
        const res = await cardApi.createCardWithApply(payload);
        newCardId = res && res.card && res.card.id;
        uni.showToast({ title: '名片创建成功，入驻申请已提交', icon: 'success' });
        track('form_submit', { cardId: newCardId || 0, page: '/pages/card/create', extra: { isEdit: false, withApply: true } });
      } else {
        const res = await cardApi.createCard(payload);
        newCardId = res && res.card && res.card.id;
        uni.showToast({ title: '名片创建成功', icon: 'success' });
        track('form_submit', { cardId: newCardId || 0, page: '/pages/card/create', extra: { isEdit: false } });
      }
    }
    setTimeout(() => {
      if (newCardId) {
        // 创建成功直达名片详情；登录页reLaunch进入本页时无返回栈，不能navigateBack
        uni.reLaunch({ url: `/pages/card/myCard?id=${newCardId}` });
      } else {
        uni.navigateBack();
      }
    }, 1200);
  } catch (e) {
    uni.showToast({ title: e.message || '操作失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.apply-banner {
  margin: 16px 16px 0;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: #165DFF;
  background: #E8F3FF;
}
.apply-banner--reject {
  color: #D25F00;
  background: #FFF3E8;
}
.create-page {
  min-height: 100vh;
  background: #f5f7fa;
  padding-bottom: 140rpx;
}

/* 顶部标题 */
.header {
  background: linear-gradient(155deg, #0e2a4e, var(--primary-deep) 55%, #3b7bd4);
  padding: 88rpx 32rpx 32rpx;
}
.row1 {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.title {
  font-size: 40rpx;
  font-weight: 700;
  color: #fff;
}
.hero-badge {
  display: flex;
  align-items: center;
  gap: 6rpx;
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.25);
  padding: 8rpx 16rpx;
  border-radius: 999px;
  font-size: 22rpx;
  color: #fff;
}
.subtitle {
  font-size: 24rpx;
  color: rgba(255,255,255,0.8);
  margin-top: 8rpx;
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
  background: var(--border);
  color: var(--t3);
  font-size: 24rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}
.step-dot.active {
  background: var(--success);
  color: #fff;
  box-shadow: 0 4rpx 12rpx rgba(7,193,96,0.3);
}
.step-dot.done {
  background: #00b42a;
  color: #fff;
}
.step-label {
  font-size: 22rpx;
  color: var(--t3);
  margin-top: 8rpx;
}
.step-label.active {
  color: var(--success);
  font-weight: 600;
}
.progress-line {
  position: absolute;
  top: 52rpx;
  left: 15%;
  right: 15%;
  height: 4rpx;
  background: var(--border);
}
.progress-fill {
  height: 100%;
  background: var(--success);
  transition: width 0.4s;
}

/* 卡片容器 */
.cards-container {
  padding: 0 24rpx;
  position: relative;
  min-height: 560rpx;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.card:not(.active) {
  display: none;
}
.card-title {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--t1);
}
.card-desc {
  font-size: 22rpx;
  color: var(--t3);
  margin-top: 4rpx;
}

/* 类型选择 */
.type-cards {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 20rpx;
}
.type-card {
  display: flex;
  align-items: center;
  gap: 16rpx;
  border: 2rpx solid var(--border);
  border-radius: 14rpx;
  padding: 20rpx;
  transition: all 0.2s;
}
.type-card.active {
  border-color: var(--success);
  background: rgba(7,193,96,0.05);
}
.type-icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.type-info {
  flex: 1;
}
.type-name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--t1);
}
.type-desc {
  font-size: 22rpx;
  color: var(--t3);
  margin-top: 4rpx;
}
.type-check {
  width: 40rpx;
  height: 40rpx;
  border-radius: 20rpx;
  background: var(--success);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  flex-shrink: 0;
}

/* 入驻绑定 */
.bind-section {
  margin-top: 20rpx;
  border: 2rpx dashed var(--border-strong);
  border-radius: 14rpx;
  padding: 16rpx 20rpx;
}
.bind-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.bind-title {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--t1);
}
.bind-arrow {
  font-size: 22rpx;
  color: var(--t3);
}
.bind-body {
  margin-top: 16rpx;
}
.bind-hint {

.need-row { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 16rpx; }
.need-item { padding: 12rpx 28rpx; border-radius: 30rpx; background: var(--bg-card); color: var(--t2); font-size: 26rpx; border: 2rpx solid transparent; }
.need-item.on { background: rgba(22,93,255,0.08); color: var(--primary); border-color: var(--primary); font-weight: 500; }
  font-size: 20rpx;
  color: var(--t3);
  margin-top: 8rpx;
}

/* 表单 */
.form-item {
  margin-top: 20rpx;
}
.form-item:first-child {
  margin-top: 0;
}
.form-label {
  font-size: 26rpx;
  color: var(--t2);
  margin-bottom: 10rpx;
}
.required {
  color: var(--danger);
}
.form-input {
  height: 84rpx;
  background: var(--bg-card);
  border-radius: 12rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: var(--t1);
}
.error-tip {
  font-size: 22rpx;
  color: var(--danger);
  margin-top: 6rpx;
}
.form-item.error .form-input {
  border: 2rpx solid var(--danger);
}
.switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24rpx;
}

/* 头像 */
.avatar-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-top: 16rpx;
}
.avatar-upload {
  width: 112rpx;
  height: 112rpx;
  border-radius: 24rpx;
  background: var(--bg-card);
  border: 2rpx dashed var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.avatar-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}
.avatar-plus {
  font-size: 40rpx;
  color: var(--t3);
}
.avatar-text {
  font-size: 20rpx;
  color: var(--t3);
}
.avatar-img {
  width: 100%;
  height: 100%;
}
.avatar-hint {
  font-size: 22rpx;
  color: var(--t3);
}

/* 预览 */
.preview-section {
  margin-top: 32rpx;
}
.preview-title {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--t2);
  margin-bottom: 12rpx;
}
.preview-card {
  background: linear-gradient(155deg, #0e2a4e, var(--primary-deep) 55%, #3b7bd4);
  border-radius: 16rpx;
  padding: 24rpx;
}
.preview-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.preview-avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 40rpx;
  background: rgba(255,255,255,0.25);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  font-weight: 600;
}
.preview-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #fff;
}
.preview-position {
  font-size: 24rpx;
  color: rgba(255,255,255,0.85);
  margin-top: 4rpx;
}
.preview-company {
  font-size: 22rpx;
  color: rgba(255,255,255,0.65);
  margin-top: 2rpx;
}
.preview-divider {
  height: 2rpx;
  background: rgba(255,255,255,0.2);
  margin: 20rpx 0;
}
.preview-contact {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}
.contact-item {
  display: flex;
  gap: 16rpx;
}
.contact-label {
  font-size: 22rpx;
  color: rgba(255,255,255,0.7);
  width: 72rpx;
}
.contact-value {
  font-size: 22rpx;
  color: #fff;
}

/* 底部操作栏 */
.footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -4rpx 16rpx rgba(0,0,0,0.06);
}
.footer-btns {
  display: flex;
  gap: 16rpx;
}
.btn-primary {
  flex: 1;
  height: 88rpx;
  background: var(--success);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  border-radius: 44rpx;
  border: none;
  box-shadow: 0 4rpx 12rpx rgba(7,193,96,0.3);
}
.btn-primary[disabled] {
  opacity: 0.6;
}
.btn-secondary {
  width: 160rpx;
  height: 88rpx;
  background: var(--bg-hover);
  color: var(--t2);
  font-size: 28rpx;
  border-radius: 44rpx;
  border: none;
}
.btn-skip {
  width: 160rpx;
  height: 88rpx;
  background: #fff;
  color: var(--t3);
  font-size: 28rpx;
  border-radius: 44rpx;
  border: 2rpx solid var(--border);
}

/* ===== 模板选择 ===== */
.tpl-scroll { width: 100%; white-space: nowrap; margin-top: 16rpx; }
.tpl-list { display: inline-flex; gap: 20rpx; padding: 4rpx 2rpx 12rpx; }
.tpl-item { width: 200rpx; flex-shrink: 0; border-radius: 16rpx; border: 3rpx solid transparent; overflow: hidden; background: var(--bg-card); }
.tpl-item.active { border-color: var(--success); background: #f0faf5; }
.tpl-cover { position: relative; height: 150rpx; display: flex; align-items: center; justify-content: center; }
.tpl-cover-img { width: 100%; height: 100%; }
.tpl-cover-text { color: #fff; font-size: 44rpx; font-weight: 600; }
.tpl-layout {
  position: absolute; right: 8rpx; top: 8rpx; z-index: 2;
  font-size: 18rpx; color: #fff; background: rgba(0,0,0,0.45);
  padding: 4rpx 10rpx; border-radius: 8rpx;
}
.tpl-check { position: absolute; top: 8rpx; right: 8rpx; width: 40rpx; height: 40rpx; border-radius: 50%; background: var(--success); color: #fff; font-size: 24rpx; display: flex; align-items: center; justify-content: center; }
.tpl-price-tag { position: absolute; left: 8rpx; bottom: 8rpx; z-index: 2; font-size: 18rpx; padding: 4rpx 10rpx; border-radius: 8rpx; color: #fff; }
.tpl-price-tag.free { background: rgba(0,180,42,0.85); }
.tpl-price-tag.paid { background: rgba(255,125,0,0.92); }
.tpl-owned { position: absolute; right: 8rpx; bottom: 8rpx; z-index: 2; font-size: 18rpx; color: #fff; background: rgba(22,93,255,0.85); padding: 4rpx 10rpx; border-radius: 8rpx; }
.tpl-name { display: block; padding: 12rpx 10rpx 14rpx; font-size: 24rpx; color: var(--t1); text-align: center; white-space: normal; word-break: break-all; }
.vip-tag {
  display: inline-block; font-size: 20rpx; color: #fff; background: var(--gold);
  border-radius: 6rpx; padding: 2rpx 10rpx; margin-left: 12rpx; vertical-align: middle;
}
.voice-row { margin-top: 16rpx; }
.voice-upload {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 100%; height: 160rpx; border: 2rpx dashed var(--border-strong); border-radius: 16rpx;
  background: var(--bg-card); gap: 8rpx;
}
.voice-plus { font-size: 48rpx; color: var(--t3); line-height: 1; }
.voice-text { font-size: 26rpx; color: var(--t3); }
.voice-file {
  display: flex; align-items: center; gap: 18rpx;
  background: var(--bg-card); border-radius: 16rpx; padding: 20rpx 24rpx;
}
.vf-info { flex: 1; min-width: 0; }
.vf-name { font-size: 28rpx; font-weight: 600; color: var(--t1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-tip { font-size: 22rpx; color: var(--t3); margin-top: 4rpx; }
.vf-actions { display: flex; flex-direction: column; gap: 8rpx; }
.vf-del { font-size: 22rpx; color: var(--danger); }
.vf-re { font-size: 22rpx; color: var(--primary); }
.voice-audio { width: 200rpx; height: 64rpx; }
.voice-locked {
  display: flex; align-items: center; gap: 12rpx;
  background: #fffbe8; border: 2rpx dashed var(--gold); border-radius: 16rpx;
  padding: 24rpx; color: #b8860b; font-size: 26rpx; margin-top: 16rpx;
}
</style>