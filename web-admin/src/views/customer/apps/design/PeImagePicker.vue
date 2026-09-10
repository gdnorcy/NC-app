<template>
  <div class="pe-img">
    <div v-if="help" class="pe-img-help">{{ help }}</div>
    <div v-if="modelValue" class="pe-img-box">
      <img :src="resolveUrl(modelValue)" class="pe-img-main" @click="openPicker" />
      <div class="pe-img-ops">
        <el-button size="small" @click="openPicker">替换</el-button>
        <el-button v-if="clearable !== false" size="small" text type="danger" @click="$emit('update:modelValue', '')">清除</el-button>
      </div>
    </div>
    <div v-else class="pe-img-empty" @click="openPicker">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/></svg>
      <span>添加图片</span>
    </div>
    <MaterialPicker v-model="pickerOpen" @confirm="onPick" />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import MaterialPicker from './MaterialPicker.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  help: { type: String, default: '' },
  clearable: { type: Boolean, default: true },
});
const emit = defineEmits(['update:modelValue']);

const pickerOpen = ref(false);

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function openPicker() { pickerOpen.value = true; }
function onPick(url) {
  if (url) emit('update:modelValue', url);
}
</script>

<style scoped>
.pe-img-help { font-size: 12px; color: #86909C; line-height: 1.5; margin-bottom: 6px; }
.pe-img-box { border: 1px solid #E5E6EB; border-radius: 8px; overflow: hidden; background: #F7F8FA; }
.pe-img-main {
  display: block;
  width: 100%;
  height: 130px;
  object-fit: contain;
  cursor: pointer;
  background: #F7F8FA;
}
.pe-img-ops {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid #F2F3F5;
  background: #fff;
}
.pe-img-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 110px;
  border: 1.5px dashed #C9CDD4;
  border-radius: 8px;
  cursor: pointer;
  color: #86909C;
  font-size: 13px;
  background: #FAFBFC;
  transition: border-color .2s;
}
.pe-img-empty:hover { border-color: #165DFF; color: #165DFF; }
</style>
