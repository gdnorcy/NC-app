<template>
  <view class="create-page" :class="'skin-' + skinType" :style="skinVars">
    <view v-if="applyMsg" class="apply-banner" :class="{ 'apply-banner--reject': applyStatus === 'rejected' }">
      {{ applyMsg }}
    </view>
    <!-- 顶部标题 -->
    <view class="header">
      <view class="page-bar">
        <view class="bar-back" @click="goBack">
          <text class="bar-back-arrow">‹</text>
        </view>
        <view class="bar-title">{{ isEdit ? '编辑名片' : '创建名片' }}</view>
        <view class="bar-right"></view>
      </view>
      <view class="row1">
        <view class="row1-l">
          <view class="title">{{ isEdit ? '编辑名片' : '创建你的名片' }}</view>
          <view class="hero-en" v-if="skinSerif">{{ heroEn }}</view>
          <view class="hero-line" v-if="skinSerif"></view>
          <view class="subtitle">{{ isEdit ? '完善信息，让别人更了解你' : stepSubtitle }}</view>
        </view>
        <view class="stepnum" v-if="!isEdit">{{ currentStep + 1 }} / 3</view>
      </view>
    </view>

    <!-- 卡片容器 -->
    <view class="cards-container">
      <view class="card" :class="{ active: currentStep === 0, prev: currentStep > 0 }">
        <view class="card-title">填写基本信息</view>
        <view class="card-desc">姓名、职位与城市，名片即刻预览</view>

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
          <view class="form-label">公司名称</view>
          <input class="form-input" v-model="form.companyName" placeholder="请输入公司名称" placeholder-class="ph" />
        </view>

        <view class="form-item">
          <view class="form-label">所在城市</view>
          <picker mode="multiSelector" :range="[provinceList, regionCities]" :value="[provinceIndex, cityIndex]" @change="onCityChange" @columnchange="onCityColumnChange">
            <view class="form-input picker-value" :class="{ ph: !form.city }">{{ form.city || '请选择城市' }}</view>
          </picker>
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
          <view class="form-label">业务领域 <text class="required">*</text></view>
          <picker mode="selector" :range="INDUSTRIES" @change="onBusinessChange">
            <view class="form-input picker-value" :class="{ ph: !form.businessField }">{{ form.businessField || '请选择业务领域' }}</view>
          </picker>
          <view class="error-tip" v-if="errors.businessField">请选择业务领域</view>
        </view>

        <view class="form-item">
          <view class="form-label">一句话介绍</view>
          <input class="form-input" v-model="form.bio" placeholder="你专注什么、能提供什么" placeholder-class="ph" />
        </view>
      </view>

      <!-- 卡片3：名片配置 -->
      <view class="card" :class="{ active: currentStep === 2, prev: currentStep > 2 }">
        <view v-if="!isEdit" class="card-title" style="margin-top: 20rpx;">选择名片类型</view>
        <view v-if="!isEdit" class="card-desc">个人也可以创建，无需企业账号</view>

        <!-- 类型选择（仅新建时） -->
        <view v-if="!isEdit" class="type-cards">
          <view class="type-card" :class="{ active: cardType === 'individual' }" @click="cardType = 'individual'">
            <view class="type-check" v-if="cardType === 'individual'">✓</view>
            <view class="type-icon type-icon--personal">
              <SIcon name="user" size="large" color="#ffffff" />
            </view>
            <view class="type-name">个人名片</view>
            <view class="type-desc">自由职业者 / 个体从业者 / 普通人</view>
          </view>
          <view class="type-card" :class="{ active: cardType === 'enterprise' }" @click="cardType = 'enterprise'">
            <view class="type-check" v-if="cardType === 'enterprise'">✓</view>
            <view class="type-icon type-icon--enterprise">
              <SIcon name="building" size="large" color="#ffffff" />
            </view>
            <view class="type-name">企业名片</view>
            <view class="type-desc">企业主体 / 团队 / 门店</view>
          </view>
        </view>

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
              <picker mode="selector" :range="INDUSTRIES" @change="onCompanyIndustryChange">
                <view class="form-input picker-value" :class="{ ph: !form.industry }">{{ form.industry || '请选择所属行业' }}</view>
              </picker>
            </view>
            <view class="bind-hint">口令由管理员提供，用于绑定到指定客户项目</view>
          </view>
        </view>

      </view>

      <!-- 卡片4：发布设置（并入第2步确认发布） -->
      <view class="card" :class="{ active: currentStep === 2, prev: currentStep > 2 }">
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


      </view>
    </view>
    <!-- 底部操作栏 -->
    <view class="footer">
      <view class="footer-btns">
        <button v-if="currentStep > 0" class="btn-secondary" @click="prevStep">上一步</button>
        <button v-if="currentStep === 1" class="btn-skip" @click="skipDetail">跳过</button>
        <button v-if="currentStep < 2" class="btn-primary" @click="nextStep">{{ currentStep === 0 ? '下一步 · 填写联系方式' : '下一步 · 确认发布' }}</button>
        <button v-if="currentStep === 2" class="btn-primary" @click="submit" :disabled="submitting">
          {{ submitting ? '提交中...' : (isEdit ? '保存修改' : '创建名片') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi, paymentApi } from '../../utils/cardApi.js';
import { INDUSTRIES, REGIONS } from './utils/cardOptions.js';
import { track, trackPageView } from '../../utils/analytics.js';
import { parseTheme } from '../../utils/templateTheme.js';
import { shadeHex } from '../../utils/color.js';
import SIcon from '../../components/SIcon.vue';

const isEdit = ref(false);
const submitting = ref(false);
const applyStatus = ref('');
const applyMsg = ref('');
const currentStep = ref(0);
const cardType = ref('individual');
const showBind = ref(false);
const steps = ['基本信息', '联系方式', '确认发布'];
// 创建页皮肤（B1：租户后台配置，C 端无感）live 实时预览 / step 分步引导 / split 沉浸双分区
const skinType = ref('live');

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

const errors = reactive({ name: false, city: false, phone: false, businessField: false });

// —— 行业/城市级联（P0：文档要求行业、城市必填 + 级联选择） ——
const provinceList = Object.keys(REGIONS);
const provinceIndex = ref(0);
const cityIndex = ref(0);
const regionCities = computed(() => REGIONS[provinceList[provinceIndex.value]] || []);
function syncCityIndex() {
  if (form.city) {
    const found = provinceList.findIndex((pv) => (REGIONS[pv] || []).includes(form.city));
    if (found >= 0) {
      provinceIndex.value = found;
      const ci = (REGIONS[provinceList[found]] || []).indexOf(form.city);
      cityIndex.value = ci >= 0 ? ci : 0;
      return;
    }
  }
  provinceIndex.value = 0;
  cityIndex.value = 0;
}
function onCityChange(e) {
  const v = e.detail.value || [];
  provinceIndex.value = v[0] || 0;
  cityIndex.value = v[1] || 0;
  form.city = regionCities.value[cityIndex.value] || '';
  errors.city = false;
}
function onCityColumnChange(e) {
  if (e.detail.column === 0) {
    provinceIndex.value = e.detail.value;
    cityIndex.value = 0;
  }
}
function onBusinessChange(e) {
  form.businessField = INDUSTRIES[e.detail.value] || '';
  errors.businessField = false;
}
function onCompanyIndustryChange(e) {
  form.industry = INDUSTRIES[e.detail.value] || '';
}

const templates = ref([]);
const templatesLoaded = ref(false);
async function loadTemplates(force = false) {
  if (templatesLoaded.value && !force) return;
  try {
    const res = await cardApi.getTemplates();
    templates.value = res.templates || [];
    if (['live', 'step', 'split'].includes(res.skin)) skinType.value = res.skin;
    // 支持 URL ?tpl=<id> 指定模板（深链/验证）；否则默认第一个可用模板（跳过付费未购）
    const pages = getCurrentPages();
    const opts = pages[pages.length - 1].options || {};
    const tplId = Number(opts.tpl);
    if (tplId) {
      const hit = templates.value.find((t) => t.id === tplId && (Number(t.price) <= 0 || t.purchased));
      if (hit) form.templateId = hit.id;
      else form.templateId = '';
    }
    if (!form.templateId && templates.value.length) {
      const first = templates.value.find((t) => Number(t.price) <= 0 || t.purchased) || templates.value[0];
      form.templateId = first.id;
    }
    templatesLoaded.value = true;
  } catch (e) {
    console.warn('模板加载失败', e);
  }
}
// ===== 名片实时预览卡（live 顶部 / split 固定区共用；随选中模板换肤、随输入更新）=====
const currentTemplate = computed(() => templates.value.find((t) => t.id === form.templateId) || null);
const lpTheme = computed(() => parseTheme(currentTemplate.value?.themeConfig));

// 方案A：live 皮肤跟随选中模板整体换肤（页面背景/标题区/按钮/卡片/文字 token 联动）
const skinVars = computed(() => {
  const t = lpTheme.value;
  if (!t) return {};
  const accent = t.accent || '#165dff';
  const bg = t.bgStart || '#165dff';
  const bgEnd = t.bgEnd || bg;
  const light = hexLuma(bg) > 160;
  const vars = {};
  vars['--primary'] = accent;
  vars['--success'] = accent;
  if (light) {
    vars['--sk-bg'] = `linear-gradient(180deg, ${hexA(bg, 0.14)}, transparent 280rpx), #f6f7fb`;
    vars['--sk-header'] = `linear-gradient(135deg, ${accent}, ${shadeHex(accent, 0.28)})`;
    vars['--sk-btn'] = `linear-gradient(135deg, ${accent}, ${shadeHex(accent, 0.28)})`;
    vars['--sk-btn-text'] = '#ffffff';
    vars['--sk-btn-glow'] = `0 4rpx 12rpx ${hexA(accent, 0.35)}`;
    vars['--sk-btn-shine'] = 'inset 0 2rpx 0 rgba(255,255,255,0.35)';
    vars['--bg-card'] = '#ffffff';
    vars['--sk-card-bg'] = '#ffffff';
    vars['--sk-hd-text'] = '#1d2129';
    vars['--sk-hd-sub'] = '#a2a9b5';
    vars['--t1'] = '#1d2129';
    vars['--t2'] = '#4e5969';
    vars['--t3'] = '#86909c';
    vars['--border'] = '#e5e6eb';
    vars['--border-strong'] = '#c9cdd4';
    vars['--sk-skin'] = 'light';
    vars['--sk-input-border'] = '1px solid ' + hexA(accent, 0.45);
    vars['--sk-input-shadow'] = '0 2rpx 8rpx rgba(0,0,0,0.04)';
    vars['--sk-input-bg'] = '#ffffff';
    vars['--sk-input-text'] = '#1d2129';
    vars['--sk-input-ph'] = '#a8b1bd';
    vars['--sk-card-frame'] = `0 0 0 1px ${hexA(accent, 0.16)}, 0 10rpx 24rpx ${hexA(accent, 0.12)}`;
    vars['--sk-line'] = `linear-gradient(90deg, transparent, ${accent}, transparent)`;
    // step 皮肤（品牌方案）：浅色下脱离模板主题色，统一品牌蓝 + Notion 中性细边
    if (skinType.value === 'step') {
      vars['--primary'] = '#165dff';
      vars['--success'] = '#165dff';
      vars['--sk-btn'] = 'linear-gradient(135deg, #165dff, #3b7bff)';
      vars['--sk-btn-glow'] = '0 4rpx 12rpx rgba(22,93,255,0.25)';
      vars['--sk-input-border'] = '1px solid #e5e6eb';
      vars['--sk-input-shadow'] = '0 2rpx 8rpx rgba(0,0,0,0.03)';
      vars['--sk-header'] = 'linear-gradient(180deg, #f6f7fb, #f6f7fb)';
    }
  } else {
    vars['--sk-bg'] = `radial-gradient(120% 55% at 85% -8%, ${hexA(accent, 0.16)}, transparent 62%), radial-gradient(90% 50% at -8% 22%, ${hexA(accent, 0.1)}, transparent 55%), linear-gradient(180deg, ${shadeHex(bg, 0.06)}, ${shadeHex(bgEnd, 0.02)})`;
    vars['--sk-header'] = `linear-gradient(155deg, ${bg}, ${bgEnd})`;
    vars['--sk-btn'] = `linear-gradient(135deg, ${hexA(accent, 0.92)}, ${hexA(accent, 0.55)} 48%, ${shadeHex(accent, 0.1)})`;
    // 鎏金/亮色点缀按钮配深色文字（黑金=金钮深字，方案3 G 同款）
    vars['--sk-btn-text'] = hexLuma(accent) > 170 ? '#1d2129' : '#ffffff';
    vars['--sk-btn-glow'] = `0 6rpx 18rpx ${hexA(accent, 0.4)}`;
    vars['--sk-btn-shine'] = 'inset 0 2rpx 0 rgba(255,255,255,0.35)';
    vars['--bg-card'] = 'rgba(255,255,255,0.09)';
    vars['--sk-card-bg'] = 'rgba(255,255,255,0.08)';
    vars['--sk-hd-text'] = t.textColor || '#ffffff';
    vars['--sk-hd-sub'] = t.text2Color || 'rgba(255,255,255,0.8)';
    vars['--sk-title-font'] = '"Songti SC", "Noto Serif SC", serif';
    vars['--t1'] = t.textColor || '#ffffff';
    vars['--t2'] = t.text2Color || 'rgba(255,255,255,0.8)';
    vars['--t3'] = 'rgba(255,255,255,0.55)';
    vars['--border'] = 'rgba(255,255,255,0.22)';
    vars['--border-strong'] = 'rgba(255,255,255,0.45)';
    vars['--sk-skin'] = 'dark';
    vars['--sk-input-border'] = '1px solid ' + hexA(accent, 0.45);
    vars['--sk-input-shadow'] = 'inset 0 2rpx 10rpx rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)';
    vars['--sk-input-bg'] = 'rgba(255,255,255,0.07)';
    vars['--sk-input-text'] = '#ffffff';
    vars['--sk-input-ph'] = 'rgba(255,255,255,0.45)';
    vars['--sk-card-frame'] = `0 0 0 1px ${hexA(accent, 0.2)}, 0 0 26rpx ${hexA(accent, 0.16)}, inset 0 0 0 1px ${hexA(accent, 0.3)}`;
    vars['--sk-line'] = `linear-gradient(90deg, transparent, ${accent}, transparent)`;
  }
  return vars;
});
const stepSubtitle = computed(() => {
  const m = ['填写基本信息，2 分钟完成发布', '方便客户找到你', '预览无误，即可发布'];
  return m[currentStep.value] || m[0];
});
const skinSerif = computed(() => !!lpTheme.value && skinVars.value['--sk-skin'] === 'dark');
const skinEnMap = { 1: 'CLASSIC BLUE', 3: 'PREMIUM GOLD', 6: 'ELEGANT BUSINESS', 7: 'LIVE EFFECT', 8: 'FOCUS SHOW', 9: 'BLACK & GOLD', 10: 'NIGHT EDITION', 11: 'PAPER ART' };
const heroEn = computed(() => (currentTemplate.value ? (skinEnMap[currentTemplate.value.id] || 'CREATE YOUR CARD') : 'CREATE YOUR CARD'));
function hexLuma(color) {
  let c = String(color || '').trim();
  if (c.startsWith('#')) {
    c = c.slice(1);
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const n = parseInt(c, 16);
    if (!Number.isNaN(n) && c.length === 6) {
      return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255));
    }
  }
  return 200; // 非 hex（rgba 等）按浅色处理
}
function hexA(color, alpha) {
  if (!color) return `rgba(22,93,255,${alpha})`;
  let c = String(color).trim();
  if (c.startsWith('#')) {
    c = c.slice(1);
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const n = parseInt(c, 16);
    if (!Number.isNaN(n) && c.length === 6) {
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
    }
  }
  // rgba(255,255,255,.85) 等：解析原透明度并覆盖
  const m = String(color).match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((x) => x.trim());
    return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
  }
  return color;
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
      syncCityIndex();
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

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.switchTab({ url: '/pages/cardMain/home' });
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
    errors.businessField = !form.businessField.trim();
    return !errors.phone && !errors.businessField;
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

/* ===== 三皮肤布局差异 ===== */
/* step 分步引导：卡片全屏化 + 焦点感 */
.skin-step .header { padding-top: 56rpx; background: transparent; }
.skin-step .cards-container { padding: 0 24rpx; }
.skin-step .card {
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
  min-height: 640rpx;
  box-shadow: 0 12rpx 40rpx rgba(0,0,0,0.08);
}
.skin-step .btn-primary {
  height: 104rpx;
  font-size: 32rpx;
  border-radius: 28rpx;
  letter-spacing: 4rpx;
}
.skin-step .btn-secondary,
.skin-step .btn-skip { height: 104rpx; border-radius: 28rpx; }
/* split：表单全屏 */
.skin-split .cards-container { padding-top: 8rpx; }
/* live：紧凑表单 */
.skin-live .form-item { margin-top: 16rpx; }
.skin-live .card-title { font-size: 28rpx; }
.create-page {
  min-height: 100vh;
  background: var(--sk-bg, #f5f7fa);
  /* 底部留白 = footer高 + 视觉间距(约20rpx)。H5 footer约120rpx → 140rpx 间隙舒适 */
  padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
  /* #ifdef MP-WEIXIN */
  /* 小程序 button 默认 margin 使 footer 更高 → 148rpx 与 H5(140rpx) 视觉间隙一致(~17px)，safe-area 兜底真机 */
  padding-bottom: calc(148rpx + env(safe-area-inset-bottom));
  /* #endif */
}

/* 顶部标题 */
.header {
  background: var(--sk-header, linear-gradient(155deg, #0e2a4e, var(--primary-deep) 55%, #3b7bd4));
  padding: 0 32rpx 32rpx;
}
.page-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0 16rpx;
}
.bar-back {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}
.bar-back-arrow {
  font-size: 56rpx;
  line-height: 1;
  color: #fff;
  font-weight: 300;
}
.bar-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #fff;
  flex: 1;
  text-align: center;
  margin-right: 64rpx;
}
.bar-right {
  width: 64rpx;
}
.row1 {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.row1-l {
  flex: 1;
  min-width: 0;
}
.title {
  font-size: 40rpx;
  font-weight: 800;
  color: var(--sk-hd-text, #fff);
  letter-spacing: 1rpx;
}
.stepnum {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--t3, #86909c);
  letter-spacing: 1rpx;
  flex-shrink: 0;
  margin-left: 20rpx;
}
.hero-en {
  font-size: 20rpx;
  letter-spacing: 8rpx;
  color: var(--sk-en-c, rgba(255,255,255,0.72));
  margin-bottom: 10rpx;
  font-family: "Songti SC", "Noto Serif SC", serif;
}
.hero-line {
  width: 72rpx;
  height: 2rpx;
  background: var(--sk-line, rgba(255,255,255,0.5));
  margin-top: 14rpx;
}
.skin-live .title,
.skin-split .title {
  font-family: "Songti SC", "Noto Serif SC", serif;
  letter-spacing: 4rpx;
}
.skin-step .title {
  font-family: var(--sk-title-font, inherit);
  letter-spacing: 2rpx;
  color: var(--sk-hd-text, #1d2129);
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
  font-size: 26rpx;
  color: var(--sk-hd-sub, rgba(255,255,255,0.8));
  margin-top: 10rpx;
}

/* 卡片容器 */
.cards-container {
  padding: 0 24rpx;
  position: relative;
  min-height: 560rpx;
}
.card {
  background: var(--sk-card-bg, #fff);
  border-radius: 32rpx;
  padding: 20rpx 36rpx;
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

/* 类型选择（两列并排） */
.type-cards {
  display: flex;
  gap: 20rpx;
  margin-top: 20rpx;
}
.type-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border: 2rpx solid var(--border);
  border-radius: 24rpx;
  padding: 32rpx 16rpx 28rpx;
  background: var(--sk-input-bg, var(--bg-card));
  position: relative;
  transition: all 0.2s;
}
.type-card.active {
  border-color: var(--primary);
  background: rgba(22,93,255,0.06);
}
.type-icon {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-bottom: 20rpx;
  box-shadow: 0 6rpx 16rpx rgba(22,93,255,0.22);
}
.type-icon--personal { background: linear-gradient(135deg, #165dff, #4d8dff); }
.type-icon--enterprise { background: linear-gradient(135deg, #1D4E8F, #3b7bd4); }
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
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
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
  font-size: 20rpx;
  color: var(--t3);
  margin-top: 8rpx;
}

.need-row { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 16rpx; }
.need-item { padding: 12rpx 28rpx; border-radius: 30rpx; background: var(--bg-card); color: var(--t2); font-size: 26rpx; border: 2rpx solid transparent; }
.need-item.on { background: rgba(22,93,255,0.08); color: var(--primary); border-color: var(--primary); font-weight: 500; }

/* 表单 */
.form-item {
  margin-top: 24rpx;
}
.form-item:first-child {
  margin-top: 0;
}
.form-label {
  font-size: 24rpx;
  color: var(--t2);
  margin-bottom: 12rpx;
  letter-spacing: 1rpx;
}
.required {
  color: var(--danger);
}
.form-input {
  height: 96rpx;
  background: var(--sk-input-bg, var(--bg-card));
  border-radius: 24rpx;
  padding: 0 32rpx;
  font-size: 28rpx;
  color: var(--sk-input-text, var(--t1));
  border: var(--sk-input-border, 2rpx solid transparent);
  box-shadow: var(--sk-input-shadow, none);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.form-input:focus {
  border-color: var(--sk-input-focus, #2f6bff) !important;
  box-shadow: 0 0 0 6rpx rgba(47,107,255,0.12);
}
.form-input.ph, .picker-value.ph {
  color: var(--sk-input-ph, #9a9a9a);
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
  height: 96rpx;
  background: var(--sk-btn, var(--success));
  color: var(--sk-btn-text, #fff);
  font-size: 32rpx;
  font-weight: 600;
  border-radius: 28rpx;
  border: none;
  line-height: 96rpx;
  box-shadow: var(--sk-btn-glow, 0 4rpx 12rpx rgba(7,193,96,0.3));
  position: relative;
}
.btn-primary::after {
  content: '';
  position: absolute;
  left: 24rpx;
  right: 24rpx;
  top: 6rpx;
  height: 2rpx;
  border-radius: 2rpx;
  background: var(--sk-btn-shine, transparent);
  pointer-events: none;
}
.btn-primary[disabled] {
  opacity: 0.6;
}
.btn-secondary {
  width: 176rpx;
  height: 96rpx;
  background: var(--bg-hover);
  color: var(--t2);
  font-size: 28rpx;
  font-weight: 500;
  border-radius: 28rpx;
  border: none;
  line-height: 96rpx;
}
.btn-skip {
  width: 176rpx;
  height: 96rpx;
  background: #fff;
  color: var(--t3);
  font-size: 28rpx;
  font-weight: 500;
  border-radius: 28rpx;
  border: 2rpx solid var(--border);
  line-height: 96rpx;
}

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

.picker-value { display: flex; align-items: center; min-height: 88rpx; }
.picker-value.ph { color: #9a9a9a; }
</style>