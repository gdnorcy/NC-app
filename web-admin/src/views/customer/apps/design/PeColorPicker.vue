<template>
  <div class="pe-color">
    <div class="pe-color-trigger" title="点击选择颜色" @click="open = true">
      <span class="pe-color-box" :style="boxStyle"></span>
      <span class="pe-color-val">{{ display }}</span>
      <svg class="pe-color-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
    </div>

    <el-dialog v-model="open" title="选择颜色" width="330px" append-to-body :close-on-click-modal="true">
      <div class="pe-color-presets">
        <div class="pe-color-cell" :class="{ on: !cur }" title="透明" @click="set('')">
          <span class="pe-checker"></span>
        </div>
        <div
          v-for="c in PRESETS"
          :key="c"
          class="pe-color-cell"
          :class="{ on: cur === c }"
          :style="{ background: c }"
          @click="set(c)"
        ></div>
      </div>
      <div class="pe-color-pickrow">
        <label class="pe-color-native">
          <span class="pe-color-box pe-color-box-lg" :style="boxStyle"></span>
          <input type="color" :value="hexOnly" @input="onNative" />
        </label>
        <el-input v-model="cur" size="small" class="pe-color-input" placeholder="#FFFFFF" @keyup.enter="open = false" />
      </div>
      <div class="pe-color-ft">
        <el-button size="small" @click="set('')">透明</el-button>
        <span class="pe-color-sp"></span>
        <el-button size="small" @click="open = false">取消</el-button>
        <el-button type="primary" size="small" @click="open = false">确定</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const cur = ref(props.modelValue || '');

const PRESETS = [
  '#FFFFFF', '#1D2129', '#86909C', '#E5E6EB', '#F7F8FA',
  '#165DFF', '#00B42A', '#FF7D00', '#F53F3F', '#722ED1', '#FADB14', '#F53F3F',
];

watch(() => props.modelValue, (v) => { cur.value = v || ''; });

const isTransparent = computed(() => !cur.value || cur.value === 'transparent');
const display = computed(() => (isTransparent.value ? 'transparent' : cur.value));
const boxStyle = computed(() => (isTransparent.value ? {} : { background: cur.value }));
const hexOnly = computed(() => {
  const v = String(cur.value || '#FFFFFF').toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : '#FFFFFF';
});

function set(v) {
  cur.value = v || '';
  emit('update:modelValue', cur.value);
}
function onNative(e) {
  set(e.target.value);
}
</script>

<style scoped>
.pe-color-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #E5E6EB;
  border-radius: 6px;
  padding: 3px 8px 3px 4px;
  cursor: pointer;
  background: #fff;
  transition: border-color .2s;
}
.pe-color-trigger:hover { border-color: #165DFF; }
.pe-color-box {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid #E5E6EB;
  background-image: conic-gradient(#E5E6EB 0 25%, #fff 0 50%, #E5E6EB 0 75%, #fff 0);
  background-size: 10px 10px;
  flex-shrink: 0;
}
.pe-color-box-lg { width: 30px; height: 30px; }
.pe-color-val { font-size: 12px; color: #4E5969; min-width: 20px; }
.pe-color-arrow { flex-shrink: 0; }
.pe-color-presets { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 12px; }
.pe-color-cell {
  height: 28px;
  border-radius: 6px;
  border: 1px solid #E5E6EB;
  cursor: pointer;
  position: relative;
  transition: transform .1s;
}
.pe-color-cell:hover { transform: scale(1.06); }
.pe-color-cell.on { outline: 2px solid #165DFF; outline-offset: 1px; }
.pe-checker {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 5px;
  background-image: conic-gradient(#E5E6EB 0 25%, #fff 0 50%, #E5E6EB 0 75%, #fff 0);
  background-size: 10px 10px;
}
.pe-color-pickrow { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.pe-color-native { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.pe-color-native input[type='color'] {
  width: 30px;
  height: 30px;
  border: none;
  padding: 0;
  background: none;
  cursor: pointer;
}
.pe-color-input { flex: 1; }
.pe-color-ft { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.pe-color-sp { flex: 1; }
</style>
