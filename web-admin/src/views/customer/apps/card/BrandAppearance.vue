<template>
  <div class="brand-appearance">
    <!-- 统一Tab导航（与智能名片其它页面一致，保持选项卡栏不消失） -->
    <CardTabs />
    <AppPageHeader title="品牌外观" desc="品牌 5 色将应用于对外展示的名片页面（名片详情头部），与设计中心「系统风格」配色结构一致">
    </AppPageHeader>

    <div class="card">
      <div class="card-title">品牌配色</div>
      <p class="card-desc">
        品牌 5 色仅作用于名片详情头部（名片业务域的对外观感），结构与设计中心「系统风格」相同：主题/渐变/辅助/主文字/次文字。
        分层规则：自选模板 &gt; 品牌配色 &gt; 装修中心主题色。全部留空时跟随装修中心「配色方案」的主题色。语义色（成功/警示/VIP）不跟随品牌色。
      </p>

      <!-- 色板快选：与设计中心系统风格同一套 14 预设，点击套用整组 5 色 -->
      <div class="scheme-row">
        <div
          v-for="(s, i) in STYLE_SCHEMES"
          :key="s.name"
          class="scheme-card"
          :class="{ on: matchedScheme === i + 1 }"
          :title="s.name"
          @click="applyScheme(i + 1)"
        >
          <div class="scheme-bar">
            <span :style="{ background: s.primaryColor }"></span>
            <span :style="{ background: s.gradientColor }"></span>
            <span :style="{ background: s.secondaryColor }"></span>
          </div>
          <div class="scheme-name">{{ s.name }}</div>
        </div>
      </div>

      <!-- 5 色明细：逐色微调 -->
      <el-form label-width="90px" size="default">
        <el-form-item v-for="f in BRAND_FIELDS" :key="f.key" :label="f.label">
          <div class="brand-row">
            <el-color-picker :model-value="brand[f.key]" @update:model-value="brand[f.key] = $event || ''" />
            <span class="brand-hex">{{ brand[f.key] || '未设置（自动回落）' }}</span>
            <el-button text size="small" @click="brand[f.key] = ''">清除</el-button>
          </div>
          <div class="form-tip">{{ f.tip }}</div>
        </el-form-item>

        <!-- hero 实时预览：所见即所得（渐变辅色留空时预览为主色纯色，C 端会自动推导深色渐变） -->
        <el-form-item label="效果预览">
          <div class="hero-preview" :style="{ background: previewBg }">
            <div class="hp-name" :style="{ color: previewText }">林示例</div>
            <div class="hp-pos" :style="{ color: previewSubText }">产品总监 · 杭州</div>
            <div class="hp-badge" :style="{ color: previewSecondary, borderColor: previewSecondary }">VIP 会员</div>
          </div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="saveBrand" :loading="savingBrand">保存品牌设置</el-button>
          <el-button text class="reset-btn" @click="resetBrand">恢复默认（全部留空）</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="card" style="margin-top: 16px">
      <div class="card-title">新建名片界面皮肤</div>
      <p class="card-desc">新用户创建名片时的界面排版风格（C 端用户无感，默认实时预览）。</p>
      <el-form label-width="100px" size="default">
        <el-form-item label="默认皮肤">
          <div class="skin-row">
            <div
              v-for="sk in skinOptions" :key="sk.value"
              class="skin-option" :class="{ on: createSkin === sk.value }"
              @click="createSkin = sk.value"
            >
              <div class="skin-name">{{ sk.name }}</div>
              <div class="skin-desc">{{ sk.desc }}</div>
            </div>
          </div>
          <div class="form-tip">实时预览：中央名片卡实时预览+紧凑表单（推荐）；分步引导：三步全屏；沉浸双分区：上展示下编辑。</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveSkin" :loading="savingSkin">保存皮肤设置</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { customerApiCall } from '../../../../api';
import { ElMessage } from 'element-plus';
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import CardTabs from './CardTabs.vue';
import { STYLE_SCHEMES } from '../../../../utils/designStyle.js';

// 品牌 5 色字段（键名与 projects.config 一致；'' = 未设置 → C 端按 hero 语义回落）
const BRAND_FIELDS = [
  { key: 'brand_color', label: '主题主色', tip: '名片详情头部渐变主色（留空跟随装修中心主题色）' },
  { key: 'brand_gradient', label: '渐变色', tip: '头部渐变辅色；留空由主色自动推导深色端' },
  { key: 'brand_secondary', label: '辅助色', tip: '头部徽章、强调元素用色（留空白色）' },
  { key: 'brand_text', label: '主文字色', tip: '头部姓名等主文字（留空白色）' },
  { key: 'brand_subtext', label: '次文字色', tip: '职位、城市等次文字（留空半透明白）' },
];
const brand = ref({ brand_color: '', brand_gradient: '', brand_secondary: '', brand_text: '', brand_subtext: '' });
const savingBrand = ref(false);

/** 当前 5 色是否恰好等于某套预设（用于色板高亮） */
const matchedScheme = computed(() => {
  const idx = STYLE_SCHEMES.findIndex((s) =>
    s.primaryColor === brand.value.brand_color &&
    s.gradientColor === brand.value.brand_gradient &&
    s.secondaryColor === brand.value.brand_secondary &&
    s.textColor === brand.value.brand_text &&
    s.subTextColor === brand.value.brand_subtext
  );
  return idx >= 0 ? idx + 1 : 0;
});

function applyScheme(n) {
  const s = STYLE_SCHEMES[n - 1];
  if (!s) return;
  brand.value = {
    brand_color: s.primaryColor,
    brand_gradient: s.gradientColor,
    brand_secondary: s.secondaryColor,
    brand_text: s.textColor,
    brand_subtext: s.subTextColor,
  };
}

// hero 预览（与 C 端 heroGradient/nmStyle/subStyle/heroColor 语义对齐；
// 渐变辅色留空时预览主色纯色——C 端会自动推导深色渐变，见表单 tip）
const previewBg = computed(() => {
  const p = brand.value.brand_color;
  if (!p) return 'linear-gradient(155deg, #b45309, #f59e0b)';
  return brand.value.brand_gradient
    ? `linear-gradient(155deg, ${brand.value.brand_gradient}, ${p})`
    : p;
});
const previewText = computed(() => brand.value.brand_text || '#ffffff');
const previewSubText = computed(() => brand.value.brand_subtext || 'rgba(255,255,255,.88)');
const previewSecondary = computed(() => brand.value.brand_secondary || '#ffffff');

function resetBrand() {
  brand.value = { brand_color: '', brand_gradient: '', brand_secondary: '', brand_text: '', brand_subtext: '' };
}

const createSkin = ref('live');
const savingSkin = ref(false);
const skinOptions = [
  { value: 'live', name: '实时预览', desc: '中央名片实时预览 + 紧凑表单' },
  { value: 'step', name: '分步引导', desc: '三步全屏，一屏一焦点' },
  { value: 'split', name: '沉浸双分区', desc: '上展示下编辑' },
];

onMounted(async () => {
  try {
    const cfg = await customerApiCall.get('/config');
    const c = cfg.config || {};
    BRAND_FIELDS.forEach((f) => { brand.value[f.key] = c[f.key] || ''; });
    createSkin.value = ['live', 'step', 'split'].includes(c.card_create_skin) ? c.card_create_skin : 'live';
  } catch (e) {}
});

async function saveBrand() {
  savingBrand.value = true;
  try {
    const payload = {};
    BRAND_FIELDS.forEach((f) => { payload[f.key] = brand.value[f.key]; });
    const res = await customerApiCall.put('/config', payload);
    const c = res.config || {};
    BRAND_FIELDS.forEach((f) => { brand.value[f.key] = c[f.key] || ''; });
    ElMessage.success('品牌设置已保存');
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    savingBrand.value = false;
  }
}

async function saveSkin() {
  savingSkin.value = true;
  try {
    const res = await customerApiCall.put('/config', { card_create_skin: createSkin.value });
    createSkin.value = ['live', 'step', 'split'].includes((res.config || {}).card_create_skin) ? res.config.card_create_skin : 'live';
    ElMessage.success('皮肤设置已保存');
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    savingSkin.value = false;
  }
}
</script>

<style scoped>
.card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.skin-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.skin-option {
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
  min-width: 140px;
  transition: all 0.2s;
}
.skin-option:hover {
  border-color: #165dff;
}
.skin-option.on {
  border-color: #165dff;
  background: rgba(22, 93, 255, 0.06);
  box-shadow: 0 0 0 1px #165dff inset;
}
.skin-name {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
}
.skin-desc {
  font-size: 12px;
  color: #86909c;
  margin-top: 4px;
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
}
.card-desc {
  font-size: 13px;
  color: #86909c;
  margin: 6px 0 16px;
  line-height: 1.6;
}
/* 色板快选：14 套预设（与设计中心系统风格同源） */
.scheme-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.scheme-card {
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  width: 76px;
  transition: all 0.2s;
}
.scheme-card:hover {
  border-color: #165dff;
}
.scheme-card.on {
  border-color: #165dff;
  box-shadow: 0 0 0 1px #165dff inset;
}
.scheme-bar {
  display: flex;
  height: 20px;
  border-radius: 4px;
  overflow: hidden;
}
.scheme-bar span {
  flex: 1;
}
.scheme-name {
  font-size: 12px;
  color: #4e5969;
  margin-top: 6px;
  text-align: center;
}
.brand-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.brand-hex {
  font-size: 12px;
  color: #86909c;
  font-family: monospace;
}
.reset-btn {
  margin-left: 8px;
  color: #86909c;
}
/* hero 预览 */
.hero-preview {
  width: 320px;
  max-width: 100%;
  border-radius: 10px;
  padding: 20px 16px 16px;
  position: relative;
}
.hp-name {
  font-size: 18px;
  font-weight: 700;
}
.hp-pos {
  font-size: 13px;
  margin-top: 4px;
}
.hp-badge {
  display: inline-block;
  margin-top: 10px;
  font-size: 11px;
  border: 1px solid;
  border-radius: 999px;
  padding: 2px 10px;
}
.form-tip {
  font-size: 12px;
  color: #86909c;
  margin-top: 6px;
}
</style>
