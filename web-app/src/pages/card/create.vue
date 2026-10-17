<template>
  <view class="create-page" :class="'skin-' + skinType" :style="[skinVars, themeStyle, brandVars, navVars]">
    <view v-if="applyMsg" class="apply-banner" :class="{ 'apply-banner--reject': applyStatus === 'rejected' }">
      {{ applyMsg }}
    </view>
    <!-- 顶部标题 -->
    <view class="header">
      <!-- 沉浸式导航：背景透明融入 header 渐变；负 margin 抵消 .header 的 32rpx 左右内边距实现通栏
           （否则 PageNav 白底只覆盖中间区域，渐变 header 两侧露白 → 视觉"白块"） -->
      <view class="header-nav">
        <PageNav :title="isEdit ? '编辑名片' : '创建名片'" back bg="transparent" :color="hdText" font-size="30rpx" />
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
          <view class="error-tip" :class="{ on: errors.name }">请输入姓名</view>
        </view>

        <view class="form-item">
          <view class="form-label">职位/头衔</view>
          <input class="form-input" v-model="form.position" placeholder="自由职业者 / 顾问 / 创始人…" placeholder-class="ph" />
        </view>

        <view class="form-item">
          <view class="form-label">公司名称</view>
          <input class="form-input" v-model="form.companyName" placeholder="请输入公司名称" placeholder-class="ph" />
        </view>

        <!-- 多公司任职（本期新增：模板市场多公司展示的数据来源） -->
        <view class="form-item" v-if="form.companies.length">
          <view class="form-label">其他任职公司</view>
          <view class="co-list">
            <view class="co-row" v-for="(c, i) in form.companies" :key="i">
              <input class="form-input co-name" v-model="c.name" placeholder="公司名称" placeholder-class="ph" />
              <input class="form-input co-pos" v-model="c.position" placeholder="职务（选填）" placeholder-class="ph" />
              <!-- 删除任职公司：X 用 ICON_T2（次文本级）而非 ICON_DECOR ——
                   DECOR 语义是「空态/占位/禁用」，可交互控件用它会被读成「按钮是灰的/点不了」
                   （2026-10-21 用户反馈「后面的删除按钮是全灰，是设计还是误」）。 -->
              <view class="co-del" @click="removeCompany(i)"><SIcon name="close" size="small" :color="ICON_T2" /></view>
            </view>
          </view>
        </view>
        <view class="form-item" v-if="form.companies.length < 5">
          <view class="form-label"></view>
          <view class="add-co" @click="addCompany">＋ 添加任职公司</view>
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
          <view class="error-tip" :class="{ on: errors.phone }">{{ phoneErrorMsg }}</view>
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
          <view class="error-tip" :class="{ on: errors.businessField }">请选择业务领域</view>
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
              <SIcon name="user" size="large" :color="brandInk" />
            </view>
            <view class="type-name">个人名片</view>
            <view class="type-desc">自由职业者 / 个体从业者 / 普通人</view>
          </view>
          <view class="type-card" :class="{ active: cardType === 'enterprise' }" @click="cardType = 'enterprise'">
            <view class="type-check" v-if="cardType === 'enterprise'">✓</view>
            <view class="type-icon type-icon--enterprise">
              <SIcon name="enterprise" size="large" :color="brandInk" />
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
              <SIcon name="key" size="small" :color="themeColor" />
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


        <view class="card-title" style="margin-top: 24rpx;">发布设置</view>
        <view class="card-desc">设置名片展示和发布选项</view>

        <view class="form-item switch-item">
          <view class="form-label">公开到人脉集市</view>
          <switch :checked="form.isPublic" @change="form.isPublic = $event.detail.value" :color="themeColor" />
        </view>
        <!-- 高级选项（默认收起：语音简介 + 视频号ID） -->
        <view class="bind-section adv-section" style="margin-top: 40rpx;">
          <view class="bind-header" @click="showAdv = !showAdv">
            <view class="bind-title">
              <SIcon name="settings" size="small" :color="themeColor" />
              高级选项
            </view>
            <view class="bind-arrow">{{ showAdv ? '收起' : '展开' }}</view>
          </view>
          <view v-if="showAdv" class="bind-body">
                    <view class="card-title" style="margin-top: 20rpx;">语音简介<text class="vip-tag">VIP</text></view>
            <view class="voice-row" v-if="voiceAllowed">
              <view class="voice-upload" @click="chooseVoice" v-if="!form.voiceUrl">
                <text class="voice-plus">+</text>
                <text class="voice-text">上传音频</text>
              </view>
              <view class="voice-file" v-else>
                <SIcon name="dynamic" size="large" :color="themeColor" />
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
              <SIcon name="crown" size="small" :color="themeColor" />
              <text>开通会员解锁语音简介</text>
            </view>
        <view class="form-item">
              <view class="form-label">视频号ID</view>
              <input class="form-input" v-model="form.videoChannel" placeholder="绑定后可在名片展示视频号" placeholder-class="ph" />
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
        <button v-if="currentStep < 2" class="btn-primary" @click="nextStep">{{ currentStep === 0 ? '下一步 · 填写联系方式' : '下一步 · 确认发布' }}</button>
        <button v-if="currentStep === 2" class="btn-primary" @click="submit" :disabled="submitting">
          {{ submitting ? '提交中...' : (isEdit ? '保存修改' : '创建名片') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ICON_T2 } from '../../utils/iconColor.js';
import PageNav from '../../components/PageNav.vue';
import { ref, reactive, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi, paymentApi } from '../../utils/cardApi.js';
import { syncMarketWithIsPublic } from './utils/marketLink.js';
import { loginEntryUrl, LOGIN_PATH } from '../../utils/loginEntry.js';
import { INDUSTRIES, REGIONS } from './utils/cardOptions.js';
import { track, trackPageView } from '../../utils/analytics.js';
import { buildCreateSkinVars } from './utils/createSkin.js';
import SIcon from '../../components/SIcon.vue';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';
import { navVarsStyle } from '../../utils/navMetrics.js';

const isEdit = ref(false);
const submitting = ref(false);
const applyStatus = ref('');
const applyMsg = ref('');
const currentStep = ref(0);
const cardType = ref('individual');
const showBind = ref(false);
const showAdv = ref(false);
const steps = ['基本信息', '联系方式', '确认发布'];
// 创建页皮肤（B1：租户后台配置，C 端无感）live 实时预览 / step 分步引导
// （原第三档 split「沉浸双分区」从未实现布局、与 live 视觉无差，2026-10-16 移除）
const skinType = ref('live');
// 系统主题（设计中心「系统风格」）：表单 UI 外壳跟随它；名片预览卡仍按所选模板真实配色渲染。
// 小程序端不能运行时注入 <style>，故必须由根视图内联下发（CSS 变量向下继承）。
const themeStyle = useDesignTheme();
const { brandVars, brandPrimary } = useBrandOverride();
const navVars = navVarsStyle();
// SIcon / switch 不能消费 var()（构建期烘焙 hex），这类需真实 hex 的地方用这个
const themeColor = computed(() => brandPrimary.value || (themeStyle.value && themeStyle.value['--design-primary']) || '#165dff');
// 🔴 皮肤必须吃「品牌覆盖后的主题」：--sk-header / --sk-btn 是**已烘焙的色值串**
//    （hex 在 createSkin.js 里就写死了），若仍按系统主题生成，brandVars 在 :style 里
//    排得再靠后也盖不掉 → 创建页永远停在设计中心蓝（真机报修）。
const skinTheme = computed(() => ({ ...(themeStyle.value || {}), ...(brandVars.value || {}) }));

const form = reactive({
  id: null,
  name: '', position: '', city: '', bio: '', avatar: '',
  phone: '', wechat: '', email: '', businessField: '', videoChannel: '', isPublic: true, needTags: [],
  bindCode: '', enterpriseName: '', industry: '',
  voiceUrl: '', voiceName: '',
  companyName: '', companies: [],
});
// 多公司：公司名+职务，最多 5 个
function addCompany() {
  if (form.companies.length >= 5) return;
  form.companies.push({ name: '', position: '' });
}
function removeCompany(i) {
  form.companies.splice(i, 1);
}
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
    if (['live', 'step'].includes(res.skin)) skinType.value = res.skin;
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
// 当前选中模板（仅用于英文副标题映射；配色已不再跟随模板，见下方skinVars 注释）
const currentTemplate = computed(() => templates.value.find((t) => t.id === form.templateId) || null);

// 创建页整体配色 = 品牌主色覆盖后的系统主题，逻辑见 ./utils/createSkin.js
// （原本取自名片模板 themeConfig，但预览卡已删除，页面里已无「按模板真实色渲染」的元素）
const skinVars = computed(() => buildCreateSkinVars(skinTheme.value));
// 坐在品牌渐变上的前景色（类型图标 / 勾选徽章）：亮黄底用深字，深底用白字。
// 🔴 SIcon 的 color 不能消费 var()（构建期烘焙 hex）→ 必须由 JS 给出真实 hex
const brandInk = computed(() => skinVars.value['--sk-btn-text'] || '#ffffff');
const stepSubtitle = computed(() => {
  const m = ['填写基本信息，2 分钟完成发布', '方便客户找到你', '预览无误，即可发布'];
  return m[currentStep.value] || m[0];
});
// 衬线装饰 + 英文小标题：仅暗色皮肤启用（原本还要求选了模板，现在只由系统主题明暗决定）
const skinSerif = computed(() => skinVars.value['--sk-skin'] === 'dark');
// 导航标题/返回箭头颜色：跟随皮肤（深色皮肤白字，浅色皮肤深字），否则浅色皮肤上白字不可见
// PageNav 文字色：live 头部是主题色渐变 → 用 --sk-hd-text（对色后的白/深字）；
// step 皮肤头部透明、直接落在浅色画布上 → 固定深字（白字会消失）
const hdText = computed(() => (skinType.value === 'step' ? '#1d2129' : (skinVars.value['--sk-hd-text'] || '#ffffff')));
// 手机号报错文案：空 →「请输入手机号」；填了但格式不对 →「请输入正确的手机号」
const phoneErrorMsg = computed(() => (form.phone.trim() ? '请输入正确的手机号' : '请输入手机号'));
const skinEnMap = { 1: 'CLASSIC BLUE', 3: 'PREMIUM GOLD', 6: 'ELEGANT BUSINESS', 7: 'LIVE EFFECT', 8: 'FOCUS SHOW', 9: 'BLACK & GOLD', 10: 'NIGHT EDITION', 11: 'PAPER ART' };
const heroEn = computed(() => (currentTemplate.value ? (skinEnMap[currentTemplate.value.id] || 'CREATE YOUR CARD') : 'CREATE YOUR CARD'));
// hexLuma / hexA 已随配色逻辑一并移入 ./utils/createSkin.js（勿在此重复定义）

onShow(() => {
  trackPageView('/pages/card/create');
});

onMounted(async () => {
  // 🔴 门禁：创建/编辑名片必须有登录态。游客可以浏览名片首页，但名片归属账号，
  // 放开会导致「填完三步提交才 401 失败」。未登录统一跳登录页（manual=1 + redirect 回跳本页，
  // 编辑场景必须带上 id，否则登录后会变成新建名片）。
  const curOpts = (getCurrentPages()[getCurrentPages().length - 1] || {}).options || {};
  const cachedMe = uni.getStorageSync('card_user') || {};
  if (!cachedMe.id && !uni.getStorageSync('card_token')) {
    uni.redirectTo({ url: loginEntryUrl(LOGIN_PATH, curOpts.id ? `/pages/card/create?id=${curOpts.id}` : '/pages/card/create') });
    return;
  }
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
      // 公司回填：单公司 companyName + 多公司 companies（后端已解析为数组）
      if (res.card.company) form.companyName = res.card.company;
      if (!Array.isArray(form.companies)) form.companies = [];
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

function goMember() {
  uni.showModal({
    title: '语音简介为会员权益',
    content: '开通会员后可上传语音简介（≤10MB）。是否前往会员中心开通？',
    confirmText: '去开通',
    cancelText: '暂不',
    success: (res) => {
      if (res.confirm) uni.navigateTo({ url: '/pages/card/member' });
    },
  });
}

function validateStep(step) {
  if (step === 0) {
    errors.name = !form.name.trim();
    return !errors.name;
  }
  if (step === 1) {
    // 真机反馈：原先只查非空不查格式。11 位、1[3-9] 开头才放行（input type=number 挡不住乱填）
    const phone = form.phone.trim();
    errors.phone = !phone || !/^1[3-9]\d{9}$/.test(phone);
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
  // 多公司：过滤空行后提交（name 非空才保留）
  const cleanCompanies = form.companies
    .map((c) => ({ name: String(c.name || '').trim(), position: String(c.position || '').trim() }))
    .filter((c) => c.name);
  try {
    if (isEdit.value) {
      // 表单字段为 companyName，后端列名是 company —— 必须显式映射，否则 {...form} 只带
      // companyName 而缺 company，服务端 company ?? card.company 永远回落旧值，公司名无法保存
      await cardApi.updateCard(form.id, { ...form, company: form.companyName, companies: cleanCompanies, needTags: JSON.stringify(form.needTags) });
      uni.showToast({ title: '保存成功', icon: 'success' });
      track('form_submit', { cardId: form.id || newCardId || 0, page: '/pages/card/create', extra: { isEdit: isEdit.value } });
    } else {
      // 表单字段 companyName → 后端列 company（同 edit 分支，缺映射则不保存）
      const payload = { ...form, company: form.companyName, companies: cleanCompanies, needTags: JSON.stringify(form.needTags) };
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
    // 集市联动：表单「公开到人脉集市」与 displaySettings 是同款开关——只写 is_public
    // 不上架 = 空头支票（myCard 集市状态恒「未上架」，2026-10-15 真机报修）。
    // 与 displaySettings 共用 utils/marketLink.js，防止两端各写一份漂移。
    syncMarketAfterSave(!!form.isPublic);
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

/**
 * 保存成功后把「公开到人脉集市」开关同步到集镇上架记录（与 displaySettings 同一联动模块）。
 * best-effort：名片已保存成功，集市同步不阻断导航，仅延迟补一条轻提示；
 * no-subject（未入驻/审核中）静默——主体还不存在，本就不能上架，myCard 的「未上架」就是真实状态。
 */
async function syncMarketAfterSave(isPublic) {
  try {
    const r = await syncMarketWithIsPublic(cardApi, isPublic);
    if (r.ok && r.changed) {
      setTimeout(() => uni.showToast({
        title: isPublic ? (r.auditStatus === 'pending' ? '集市上架申请已提交，等待审核' : '已同步上架到集市') : '已同步关闭集市展示',
        icon: 'none',
      }), 1000);
    } else if (!r.ok && !r.soft && r.reason !== 'no-subject') {
      setTimeout(() => uni.showToast({ title: `名片已保存，${r.error || '集市同步失败'}`, icon: 'none' }), 1000);
    }
  } catch (e) { /* 静默：集市状态以 myCard 为准 */ }
}
</script>

<style scoped>
/* 入驻审核状态横幅：pending=信息态（跟随系统文字辅色），rejected=警示态（语义橙，不跟主题） */
.apply-banner {
  margin: 32rpx 32rpx 0;
  padding: 20rpx 28rpx;
  border-radius: var(--radius-sm);
  font-size: 26rpx;
  line-height: 1.6;
  color: var(--design-subtext, #165DFF);
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.06);
}
.apply-banner--reject {
  color: #D25F00;
  background: #FFF3E8;
}

/* ===== 三皮肤布局差异 ===== */
/* step 分步引导：卡片全屏化 + 焦点感 */
/* 🔴 2026-10-21 真机报修「标题栏和返回键换行」：这 56rpx 原是给旧版扁平 .page-bar
   （无状态栏占位）的呼吸感；2b85bd1 换成 PageNav 后它自带 44px 状态栏占位，
   两者叠加把导航条推到胶囊行下方 28px → 返回键/标题独立成行、与大标题重复。
   修正：额外间距只作用于标题区 .row1，导航条保持与胶囊行对齐。 */
.skin-step .row1 { padding-top: 56rpx; }
/* （cards-container 的顶部间隔已在基础样式统一为 24rpx，step/split 不再各写一份 ——
    曾 split 只给 8rpx、step 为 0，同一页面换步/换皮肤灰缝忽有忽无） */
.skin-step .card {
  border-radius: var(--radius-lg);
  padding: 40rpx 32rpx;
  min-height: 640rpx;
  box-shadow: 0 12rpx 40rpx rgba(0,0,0,0.08);
}
.skin-step .btn-primary {
  height: 104rpx;
  font-size: var(--fs-6);
  border-radius: 28rpx;
  letter-spacing: 4rpx;
}
.skin-step .btn-secondary,
.skin-step .btn-skip { height: 104rpx; border-radius: 28rpx; }
/* live：紧凑表单 */
.skin-live .form-item { margin-top: 16rpx; }
.skin-live .card-title { font-size: var(--fs-5); }
.create-page {
  min-height: 100vh;
  box-sizing: border-box;
  background: var(--sk-bg, #f5f7fa);
  /* 底部留白 = footer高 + 视觉间距(约20rpx)。H5 footer约120rpx → 140rpx 间隙舒适 */
  padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
  /* #ifdef MP-WEIXIN */
  /* 小程序 button 默认 margin 使 footer 更高 → 148rpx 与 H5(140rpx) 视觉间隙一致(~17px)，safe-area 兜底真机 */
  padding-bottom: calc(148rpx + env(safe-area-inset-bottom));
  /* #endif */
}

/* 顶部标题（v3.1 头部透明：主题色氛围由页面 --sk-bg 顶部晕染承担，标题恒深字） */
.header {
  background: var(--sk-header, transparent);
  padding: 0 32rpx 32rpx;
}
/* PageNav 通栏：抵消 .header 的左右内边距，使导航背景/点击区真正铺满整行 */
.header-nav {
  margin: 0 -32rpx;
}
.row1 {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
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
  line-height: 1.3;
}
.stepnum {
  font-size: 30rpx;
  font-weight: 700;
  /* 步骤数字与头部同色系（用户反馈：灰色在渐变头上「跟页面不配」）——
     渐变头部=半透明白，浅金主色/step 透明头部=深灰，随 --sk-hd-sub 走 */
  color: var(--sk-hd-sub, var(--t3, #86909c));
  letter-spacing: 1rpx;
  flex-shrink: 0;
  margin-left: 20rpx;
  /* 与大标题顶部对齐（此前 align-items:baseline 会把步数拉到大标题基线，视觉上像浮在标题中间） */
  line-height: 1.3;
  padding-top: 6rpx;
}
.hero-en {
  font-size: var(--fs-1);
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
.skin-live .title {
  font-family: "Songti SC", "Noto Serif SC", serif;
  letter-spacing: 4rpx;
}
.skin-step .title {
  font-family: var(--sk-title-font, inherit);
  letter-spacing: 2rpx;
  /* step 皮肤头部透明，标题落在浅色画布上 → 固定深字（--sk-hd-text 是渐变头部的对色，浅底上会看不清） */
  color: var(--t1);
}
.subtitle {
  font-size: var(--fs-4);
  color: var(--sk-hd-sub, rgba(255,255,255,0.8));
  margin-top: 10rpx;
}
/* step 皮肤：副标题同标题一样落在浅底上 → 深灰 */
.skin-step .subtitle {
  color: var(--t2);
}

/* 卡片容器：顶部 24rpx 间隔——白卡与头部之间必须留出灰缝（真机反馈：贴死看不出层次） */
.cards-container {
  padding: 24rpx 24rpx 0;
  position: relative;
  min-height: 560rpx;
}
.card {
  background: var(--sk-card-bg, #fff);
  border-radius: 32rpx;
  padding: 20rpx 36rpx 32rpx;
  /* 勿加 transition：卡片显隐靠 display:none 切换，过渡从未生效；且真机上容器带 transition
     时插入 v-if 节点（校验报错）会因合成滞后把后续内容画在旧位置 → 提示词错位（开发者工具不复现） */
}
.card + .card {
  margin-top: 28rpx;
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
  font-size: var(--fs-2);
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
  border-radius: var(--radius-lg);
  padding: 32rpx 16rpx 28rpx;
  background: var(--sk-input-bg, var(--bg-card));
  position: relative;
  transition: all 0.2s;
}
.type-card.active {
  border-color: var(--design-primary, #165dff);
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.06);
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
  box-shadow: 0 6rpx 16rpx rgba(var(--design-primary-rgb, 22, 93, 255), 0.22);
}
/* 个人/企业两枚类型图标同源同色（v3.1：企业原先 brightness(0.72) 压深被用户否——
   「太暗」，红主题下成暗红更难看；区分靠下方名称/描述与选中勾，不靠图标色） */
.type-icon--personal { background: linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4d8dff)); }
.type-icon--enterprise { background: linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4d8dff)); }
.type-name {
  font-size: var(--fs-5);
  font-weight: 600;
  color: var(--t1);
}
.type-desc {
  font-size: var(--fs-2);
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
  background: var(--design-primary, #165dff);
  /* 品牌色为亮色（如亮黄）时白勾会消失 → 跟主按钮文字同一裁决口径 */
  color: var(--sk-btn-text, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-2);
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
  font-size: var(--fs-4);
  font-weight: 600;
  color: var(--t1);
}
.bind-arrow {
  font-size: var(--fs-2);
  color: var(--t3);
}
.bind-body {
  margin-top: 16rpx;
}
.bind-hint {
  font-size: var(--fs-1);
  color: var(--t3);
  margin-top: 8rpx;
}

.need-row { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 16rpx; }
.need-item { padding: 12rpx 28rpx; border-radius: 30rpx; background: var(--bg-card); color: var(--t3); font-size: var(--fs-4); border: 2rpx dashed var(--border-strong); }
.need-item.on { background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08); color: var(--design-primary, #165dff); border-color: var(--design-primary, #165dff); font-weight: 500; }

/* 表单 */
.form-item {
  margin-top: 24rpx;
}
.form-item:first-child {
  margin-top: 0;
}
.form-label {
  font-size: var(--fs-3);
  color: var(--t2);
  margin-bottom: 12rpx;
  letter-spacing: 1rpx;
}
.required {
  color: var(--danger);
}
.form-input {
  height: 96rpx;
  line-height: 96rpx;
  background: var(--sk-input-bg, var(--bg-card));
  border-radius: var(--radius-lg);
  padding: 0 32rpx;
  font-size: var(--fs-5);
  color: var(--sk-input-text, var(--t1));
  border: var(--sk-input-border, 2rpx solid transparent);
  box-shadow: var(--sk-input-shadow, none);
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.form-input:focus {
  border-color: var(--sk-input-focus, var(--design-primary, #165dff)) !important;
  box-shadow: 0 0 0 6rpx rgba(var(--design-primary-rgb, 22, 93, 255), 0.12);
}
.form-input.ph, .picker-value.ph {
  color: var(--sk-input-ph, #9a9a9a);
}
/* 报错行：常驻节点 + 预留固定高度，visibility 切换（勿改回 v-if 插入/移除！）
   真机（仅真机）上 v-if 插入节点引发重排时，后续内容会被画到旧位置——报错提示词
   与下一字段标签重叠；删 .card transition 治不住，开发者工具永不复现。
   visibility 隐藏不改变布局，显示时零重排；文案更新走既有文本节点。 */
.error-tip {
  display: block;
  width: 100%;
  height: 34rpx;
  line-height: 34rpx;
  font-size: var(--fs-2);
  color: var(--danger);
  margin-top: 4rpx;
  visibility: hidden;
}
.error-tip.on {
  visibility: visible;
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
  border-radius: var(--radius-lg);
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
  font-size: var(--fs-1);
  color: var(--t3);
}
.avatar-img {
  width: 100%;
  height: 100%;
}
.avatar-hint {
  font-size: var(--fs-2);
  color: var(--t3);
}


/* 底部操作栏 */
.footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  /* 跟皮肤走：暗色主题下写死 #fff 会横出一条白带（--sk-card-bg 在明暗两支都有值） */
  background: var(--sk-card-bg, #fff);
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
  padding: 0;
  background: var(--sk-btn, var(--success));
  color: var(--sk-btn-text, #fff);
  font-size: 30rpx;
  font-weight: 600;
  border-radius: 28rpx;
  border: none;
  line-height: 96rpx;
  /* 顶部内高光：用真实 box-shadow 实现（此前误用 background 传 inset 语法 → 声明无效） */
  box-shadow: var(--sk-btn-shine, none), var(--sk-btn-glow, 0 4rpx 12rpx rgba(var(--design-primary-rgb, 22, 93, 255), 0.3));
}
/* 抹掉微信原生 button::after 的 1px 黑色边框（即用户看到的"黑线"） */
.btn-primary::after,
.btn-secondary::after,
.btn-skip::after {
  border: none;
}
.btn-primary[disabled] {
  opacity: 0.6;
}
.btn-secondary {
  width: 144rpx;
  height: 96rpx;
  padding: 0;
  background: var(--bg-hover);
  color: var(--t2);
  font-size: var(--fs-4);
  font-weight: 500;
  border-radius: 28rpx;
  border: none;
  line-height: 96rpx;
}
.btn-skip {
  width: 144rpx;
  height: 96rpx;
  padding: 0;
  /* 原写死 #fff → 暗色皮肤下白底白字 */
  background: var(--sk-card-bg, #fff);
  color: var(--t3);
  font-size: var(--fs-4);
  font-weight: 500;
  border-radius: 28rpx;
  border: 2rpx solid var(--border);
  line-height: 96rpx;
}

.voice-row { margin-top: 16rpx; }
.voice-upload {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 100%; height: 160rpx; border: 2rpx dashed var(--border-strong); border-radius: var(--radius-md);
  background: var(--bg-card); gap: 8rpx;
}
.voice-plus { font-size: 48rpx; color: var(--t3); line-height: 1; }
.voice-text { font-size: var(--fs-4); color: var(--t3); }
.voice-file {
  display: flex; align-items: center; gap: 18rpx;
  background: var(--bg-card); border-radius: var(--radius-md); padding: 20rpx 24rpx;
}
.vf-info { flex: 1; min-width: 0; }
.vf-name { font-size: var(--fs-5); font-weight: 600; color: var(--t1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-tip { font-size: var(--fs-2); color: var(--t3); margin-top: 4rpx; }
.vf-actions { display: flex; flex-direction: column; gap: 8rpx; }
.vf-del { font-size: var(--fs-2); color: var(--danger); }
.vf-re { font-size: var(--fs-2); color: var(--design-primary, #165dff); }
.voice-audio { width: 200rpx; height: 64rpx; }
.voice-locked {
  display: flex; align-items: center; gap: 12rpx;
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.06);
  border: 2rpx dashed var(--design-primary, #165dff); border-radius: var(--radius-md);
  padding: 24rpx; color: var(--design-primary, #165dff); font-size: var(--fs-4); margin-top: 16rpx;
}

/* picker 容器与 .form-input 完全同高同内边距（此前 88rpx vs 96rpx，同一表单内出现两种高度） */
.picker-value {
  display: flex;
  align-items: center;
  height: 96rpx;
  line-height: 96rpx;
  box-sizing: border-box;
}
/* 占位文字：必须走 --sk-input-ph，否则暗色皮肤下浅灰字配深色输入框看不清
   （旧代码写死 #9a9a9a，与上面 .form-input.ph 的变量化不一致 → 同一表单两种占位色） */
.picker-value.ph { color: var(--sk-input-ph, #9a9a9a); }
/* 多公司任职（本期新增：模板市场多公司展示的数据来源） */
.co-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.co-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.co-name {
  flex: 1.4;
}
.co-pos {
  flex: 1;
}
.co-del {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: rgba(0,0,0,0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.add-co {
  font-size: var(--fs-4);
  color: var(--design-primary, #165dff);
  padding: 10rpx 0;
}
</style>