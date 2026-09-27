<template>
  <div class="brand-appearance">
    <!-- 统一Tab导航（与智能名片其它页面一致，保持选项卡栏不消失） -->
    <CardTabs />
    <AppPageHeader title="品牌外观" desc="品牌主色将应用于对外展示的名片页面（名片详情头部）">
    </AppPageHeader>

    <div class="card">
      <div class="card-title">品牌主色</div>
      <p class="card-desc">选择品牌主色后，名片详情头部会按该色渲染；留空时使用默认橙色风格。</p>
      <el-form label-width="100px" size="default">
        <el-form-item label="品牌主色">
          <div class="brand-row">
            <div
              v-for="c in brandPresets" :key="c"
              class="brand-swatch" :class="{ on: brandColor === c }"
              :style="{ background: c }" @click="brandColor = c"
            ></div>
            <el-color-picker v-model="brandColor" />
            <el-button text @click="brandColor = ''">恢复默认</el-button>
          </div>
          <div class="form-tip">留空时使用默认橙色风格</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveBrand" :loading="savingBrand">保存品牌设置</el-button>
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
import { ref, onMounted } from 'vue';
import { customerApiCall } from '../../../../api';
import { ElMessage } from 'element-plus';
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import CardTabs from './CardTabs.vue';

const brandColor = ref('');
const savingBrand = ref(false);
const brandPresets = ['#165DFF', '#07C160', '#F59E0B', '#F53F3F', '#722ED1', '#13C2C2', '#2F54EB', '#FA8C16'];

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
    brandColor.value = (cfg.config || {}).brand_color || '';
    createSkin.value = ['live', 'step', 'split'].includes((cfg.config || {}).card_create_skin) ? cfg.config.card_create_skin : 'live';
  } catch (e) {}
});

async function saveBrand() {
  savingBrand.value = true;
  try {
    const res = await customerApiCall.put('/config', { brand_color: brandColor.value });
    brandColor.value = (res.config || {}).brand_color || '';
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
}
.brand-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.brand-swatch {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
}
.brand-swatch.on {
  border-color: #165dff;
  box-shadow: 0 0 0 2px rgba(22, 93, 255, 0.15);
}
.form-tip {
  font-size: 12px;
  color: #86909c;
  margin-top: 6px;
}
</style>
