<template>
  <div class="pe-ig">
    <div class="pe-ig-grid">
      <!-- 主图：竖版 346x380 -->
      <div class="pe-ig-item pe-ig-main" :class="{ filled: !!mainImage }" @click="openPicker('main')">
        <img v-if="mainImage" :src="resolveUrl(mainImage)" class="pe-ig-thumb" />
        <template v-else>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#A9B0BC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/></svg>
          <span class="pe-ig-size">346x380</span>
        </template>
        <span v-if="mainImage" class="pe-ig-size">{{ mainSize }}</span>
        <span v-if="mainImage" class="pe-ig-replace">替换</span>
      </div>
      <!-- 副图1/2：横版 340x184 -->
      <div class="pe-ig-col">
        <div class="pe-ig-item pe-ig-sub" :class="{ filled: !!sub1Image }" @click="openPicker('sub1')">
          <img v-if="sub1Image" :src="resolveUrl(sub1Image)" class="pe-ig-thumb" />
          <template v-else>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#A9B0BC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/></svg>
            <span class="pe-ig-size">340x184</span>
          </template>
          <span v-if="sub1Image" class="pe-ig-size">{{ subSize }}</span>
        </div>
        <div class="pe-ig-item pe-ig-sub" :class="{ filled: !!sub2Image }" @click="openPicker('sub2')">
          <img v-if="sub2Image" :src="resolveUrl(sub2Image)" class="pe-ig-thumb" />
          <template v-else>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#A9B0BC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/></svg>
            <span class="pe-ig-size">340x184</span>
          </template>
          <span v-if="sub2Image" class="pe-ig-size">{{ subSize }}</span>
        </div>
      </div>
    </div>
    <MaterialPicker v-model="pickerOpen" @confirm="onPick" />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import MaterialPicker from './MaterialPicker.vue';

const props = defineProps({
  mainImage: { type: String, default: '' },
  sub1Image: { type: String, default: '' },
  sub2Image: { type: String, default: '' },
  mainSize: { type: String, default: '346x380' },
  subSize: { type: String, default: '340x184' },
});
const emit = defineEmits(['update:mainImage', 'update:sub1Image', 'update:sub2Image']);

const pickerOpen = ref(false);
const current = ref('main');

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function openPicker(kind) { current.value = kind; pickerOpen.value = true; }
function onPick(url) {
  if (!url) return;
  const map = { main: 'update:mainImage', sub1: 'update:sub1Image', sub2: 'update:sub2Image' };
  emit(map[current.value], url);
}
</script>

<style scoped>
.pe-ig-grid { display: flex; gap: 8px; }
.pe-ig-main { flex: 0 0 88px; }
.pe-ig-col { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.pe-ig-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1.5px dashed #C9CDD4;
  border-radius: 8px;
  background: #F7FBFF;
  cursor: pointer;
  overflow: hidden;
  transition: border-color .2s;
}
.pe-ig-item:hover { border-color: #165DFF; }
.pe-ig-main { height: 128px; }
.pe-ig-sub { height: 60px; }
.pe-ig-thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
.pe-ig-size { font-size: 10px; color: #A9B0BC; line-height: 1; }
.pe-ig-item.filled { border-style: solid; border-color: #E5E6EB; background: #fff; }
.pe-ig-item.filled .pe-ig-size {
  position: absolute; left: 4px; bottom: 4px; z-index: 1;
  background: rgba(0,0,0,.5); color: #fff; padding: 1px 4px; border-radius: 4px;
}
.pe-ig-replace {
  position: absolute; right: 4px; top: 4px; z-index: 1;
  font-size: 10px; color: #165DFF; background: rgba(255,255,255,.92);
  padding: 1px 6px; border-radius: 4px; border: 1px solid #E5E6EB;
}
</style>
