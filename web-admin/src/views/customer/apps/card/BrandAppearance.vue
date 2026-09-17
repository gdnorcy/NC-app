<template>
  <div class="brand-appearance">
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { customerApiCall } from '../../../../api';
import { ElMessage } from 'element-plus';
import AppPageHeader from '../../../../components/AppPageHeader.vue';

const brandColor = ref('');
const savingBrand = ref(false);
const brandPresets = ['#165DFF', '#07C160', '#F59E0B', '#F53F3F', '#722ED1', '#13C2C2', '#2F54EB', '#FA8C16'];

onMounted(async () => {
  try {
    const cfg = await customerApiCall.get('/config');
    brandColor.value = (cfg.config || {}).brand_color || '';
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
</script>

<style scoped>
.card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
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
