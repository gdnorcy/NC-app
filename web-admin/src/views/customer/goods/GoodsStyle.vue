<template>
  <div class="goods-style">
    <AppPageHeader title="商城风格" desc="商品分类页与详情页的展示风格（1:1 复刻菜鸟云商城风格）">
      <div class="hd-actions">
        <el-button type="primary" :loading="saving" @click="save">确定</el-button>
      </div>
    </AppPageHeader>

    <div class="style-section">
      <div class="style-title">分类风格</div>
      <div class="style-options">
        <div v-for="s in cateStyles" :key="s.value" class="style-card" :class="{ active: cateStyle === s.value }" @click="cateStyle = s.value">
          <div class="style-preview cate-preview" :class="'cate-' + s.value">
            <div class="mini-cate">
              <div v-for="i in 4" :key="i" class="mini-cate-item"></div>
            </div>
            <div v-if="s.value === 2" class="mini-goods-grid">
              <div v-for="i in 6" :key="i" class="mini-goods-cell"></div>
            </div>
          </div>
          <div class="style-name">{{ s.label }}</div>
          <div class="style-desc">{{ s.desc }}</div>
          <div v-if="cateStyle === s.value" class="style-check">✓</div>
        </div>
      </div>
    </div>

    <div class="style-section">
      <div class="style-title">详情风格</div>
      <div class="style-options">
        <div v-for="s in detailStyles" :key="s.value" class="style-card" :class="{ active: detailStyle === s.value }" @click="detailStyle = s.value">
          <div class="style-preview detail-preview" :class="'detail-' + s.value">
            <div class="mini-detail-img"></div>
            <div class="mini-detail-lines">
              <div class="mini-line w60"></div>
              <div class="mini-line w40"></div>
              <div class="mini-line w80"></div>
            </div>
            <div v-if="s.value === 2" class="mini-detail-btns">
              <div class="mini-btn"></div><div class="mini-btn"></div>
            </div>
          </div>
          <div class="style-name">{{ s.label }}</div>
          <div class="style-desc">{{ s.desc }}</div>
          <div v-if="detailStyle === s.value" class="style-check">✓</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const cateStyle = ref(1);
const detailStyle = ref(1);
const saving = ref(false);

const cateStyles = [
  { value: 1, label: '风格1', desc: '左侧一级分类、右侧二级分类' },
  { value: 2, label: '风格2', desc: '左侧一级分类、右侧二级分类及商品' },
];
const detailStyles = [
  { value: 1, label: '风格1', desc: '商品图 + 信息' },
  { value: 2, label: '风格2', desc: '商品图 + 信息 + 底部操作按钮' },
];

async function load() {
  try {
    const res = await customerApiCall.get('/goods/category-style');
    cateStyle.value = res.cateStyle || 1;
    detailStyle.value = res.detailStyle || 1;
  } catch (e) { /* 忽略 */ }
}

async function save() {
  saving.value = true;
  try {
    await customerApiCall.put('/goods/category-style', { cateStyle: cateStyle.value, detailStyle: detailStyle.value });
    ElMessage.success('已保存');
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}

onMounted(load);
</script>

<style scoped>
.style-section { margin-bottom: 28px; }
.style-title { font-size: 15px; font-weight: 600; color: #1d2129; margin-bottom: 14px; }
.style-options { display: flex; gap: 16px; flex-wrap: wrap; }
.style-card {
  position: relative;
  width: 240px;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}
.style-card:hover { border-color: #165dff; }
.style-card.active { border-color: #165dff; background: #f7fbff; box-shadow: 0 0 0 1px #165dff; }
.style-check {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 22px;
  height: 22px;
  background: #165dff;
  color: #fff;
  border-radius: 0 8px 0 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.style-name { font-size: 14px; font-weight: 500; color: #1d2129; margin-top: 10px; }
.style-desc { font-size: 12px; color: #86909c; margin-top: 4px; }

/* 风格预览卡（示意） */
.style-preview {
  height: 120px;
  border-radius: 6px;
  background: #f7f8fa;
  border: 1px solid #f0f0f0;
  display: flex;
  gap: 0;
  overflow: hidden;
}
.cate-preview { display: flex; }
.mini-cate { width: 40%; background: #fff; padding: 8px 6px; display: flex; flex-direction: column; gap: 6px; }
.mini-cate-item { height: 14px; border-radius: 4px; background: rgba(22, 93, 255, 0.08); }
.cate-2 .mini-cate { width: 30%; }
.mini-goods-grid { flex: 1; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; padding: 8px; }
.mini-goods-cell { background: #e5e6eb; border-radius: 4px; }
.detail-preview { flex-direction: column; padding: 8px; }
.mini-detail-img { height: 56px; background: #e5e6eb; border-radius: 4px; }
.mini-detail-lines { padding: 8px 2px; display: flex; flex-direction: column; gap: 6px; }
.mini-line { height: 8px; background: #e5e6eb; border-radius: 4px; }
.w60 { width: 60%; } .w40 { width: 40%; } .w80 { width: 80%; }
.mini-detail-btns { display: flex; gap: 8px; margin-top: auto; }
.mini-btn { flex: 1; height: 22px; border-radius: 4px; background: rgba(22, 93, 255, 0.1); }
.mini-btn:last-child { background: rgba(22, 93, 255, 0.35); }
</style>
