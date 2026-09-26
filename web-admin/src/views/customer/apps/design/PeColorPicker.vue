<template>
  <div class="pe-color" ref="rootRef">
    <div class="pe-color-trigger" title="点击选择颜色" @click="toggle">
      <span class="pe-color-box" :style="boxStyle"></span>
      <span class="pe-color-val">{{ display }}</span>
      <svg class="pe-color-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
    </div>

    <!-- 渐变预设：值为渐变时显示，点选即应用 -->
    <div v-if="open && isGradient" class="pc-grads" @mousedown.stop>
      <span class="pc-grads-label">渐变</span>
      <span
        v-for="(g, gi) in gradPresets" :key="gi"
        class="pc-grad" :class="{ 'pc-grad--on': cur === g }"
        :style="{ background: g }" :title="g" @click="onGrad(g)"
      ></span>
    </div>

    <!-- ew/iView ColorPicker 风格：下拉浮层（SV 饱和度面板 + 色相条 + hex 输入 + 清空/确定） -->
    <div v-if="open" class="pc-pop" @mousedown.stop>
      <div class="pc-sv" ref="svRef" :style="{ background: svBg }" @pointerdown="onSvDown">
        <span class="pc-sv-dot" :style="svDotStyle"></span>
      </div>
      <div class="pc-hue" ref="hueRef" @pointerdown="onHueDown">
        <span class="pc-hue-dot" :style="hueDotStyle"></span>
      </div>
      <div class="pc-ft">
        <span class="pc-hex-label">#</span>
        <input ref="hexRef" class="pc-hex-input" :value="hexInput" spellcheck="false" @input="onHexInput" @keydown.enter="onHexEnter" />
        <span class="pc-sp"></span>
        <button class="pc-btn" type="button" @click="onClear">清空</button>
        <button class="pc-btn pc-btn-primary" type="button" @click="onConfirm">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const rootRef = ref(null);
const svRef = ref(null);
const hueRef = ref(null);
const hexRef = ref(null);

const open = ref(false);
const cur = ref(props.modelValue || '');
const hue = ref(0);
const sat = ref(0);
const val = ref(100);
const hexInput = ref('');

watch(() => props.modelValue, (v) => { cur.value = v || ''; syncFromCur(); });
onMounted(() => { syncFromCur(); document.addEventListener('pointerdown', onDocDown, true); });
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDocDown, true); });

const isTransparent = computed(() => !cur.value || cur.value === 'transparent');
const isGradient = computed(() => /^linear-gradient/i.test(cur.value || ''));
const display = computed(() => (isTransparent.value ? 'transparent' : (isGradient.value ? '渐变' : cur.value)));
const boxStyle = computed(() => (isTransparent.value ? {} : { background: cur.value }));
// 渐变预设（方案 A 9 色 + 通用 2 色）
const gradPresets = [
  'linear-gradient(135deg,#2979ff,#00b0ff)', 'linear-gradient(135deg,#00b8a9,#00d68f)',
  'linear-gradient(135deg,#ff6b35,#ff9800)', 'linear-gradient(135deg,#7c4dff,#b388ff)',
  'linear-gradient(135deg,#00b0ff,#536dfe)', 'linear-gradient(135deg,#ff3d3d,#ff7043)',
  'linear-gradient(135deg,#ffb300,#ff8f00)', 'linear-gradient(135deg,#ec407a,#ab47bc)',
  'linear-gradient(135deg,#78909c,#546e7a)', 'linear-gradient(135deg,#00b42a,#52c41a)',
  'linear-gradient(135deg,#13c2c2,#00d0c7)',
];
function onGrad(g) { cur.value = g; emit('update:modelValue', g); open.value = false; }
const svBg = computed(() => `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsla(${hue.value},100%,50%,0)), hsl(${hue.value},100%,50%)`);
const svDotStyle = computed(() => ({
  left: sat.value + '%',
  top: (100 - val.value) + '%',
  background: curHex(),
}));
const hueDotStyle = computed(() => ({ left: (hue.value / 360 * 100) + '%', background: 'hsl(' + hue.value + ',100%,50%)' }));

function curHex() { return isTransparent.value ? '#ffffff' : (cur.value || '#ffffff'); }

function syncFromCur() {
  if (isGradient.value) return; // 渐变值不解析为 hex
  const hsv = hexToHsv(curHex());
  hue.value = hsv.h; sat.value = hsv.s; val.value = hsv.v;
  hexInput.value = curHex().replace('#', '');
}

function toggle() { open.value = !open.value; if (open.value) syncFromCur(); }
function onDocDown(e) {
  if (open.value && rootRef.value && !rootRef.value.contains(e.target)) open.value = false;
}

function onSvDown(e) {
  e.preventDefault();
  const rect = svRef.value.getBoundingClientRect();
  const move = (ev) => {
    let x = (ev.clientX - rect.left) / rect.width * 100;
    let y = (ev.clientY - rect.top) / rect.height * 100;
    x = Math.max(0, Math.min(100, x)); y = Math.max(0, Math.min(100, y));
    sat.value = x; val.value = 100 - y;
    cur.value = hsvToHex(hue.value, sat.value, val.value);
    hexInput.value = cur.value.replace('#', '');
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  move(e);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function onHueDown(e) {
  e.preventDefault();
  const rect = hueRef.value.getBoundingClientRect();
  const move = (ev) => {
    let x = (ev.clientX - rect.left) / rect.width * 360;
    x = Math.max(0, Math.min(360, x));
    hue.value = x;
    cur.value = hsvToHex(hue.value, sat.value, val.value);
    hexInput.value = cur.value.replace('#', '');
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  move(e);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function onHexInput(e) {
  hexInput.value = e.target.value;
}
function onHexEnter() {
  const h = normalizeHex(hexInput.value);
  if (h) {
    cur.value = h;
    syncFromCur();
  }
}
function onClear() {
  cur.value = '';
  emit('update:modelValue', '');
  open.value = false;
}
function onConfirm() {
  const h = normalizeHex(hexInput.value);
  if (h) { cur.value = h; syncFromCur(); }
  emit('update:modelValue', cur.value || '');
  open.value = false;
}

function normalizeHex(v) {
  let s = String(v || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map(c => c + c).join('');
  if (/^[0-9a-fA-F]{6}$/.test(s)) return '#' + s.toLowerCase();
  return null;
}

function hsvToHex(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

function hexToHsv(hex) {
  let s = String(hex || '').replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return { h: 0, s: 0, v: 100 };
  const r = parseInt(s.slice(0, 2), 16) / 255, g = parseInt(s.slice(2, 4), 16) / 255, b = parseInt(s.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s2 = max ? d / max : 0;
  return { h, s: Math.round(s2 * 100), v: Math.round(max * 100) };
}
</script>

<style scoped>
.pc-grads {
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  padding: 8px 10px; border-bottom: 1px solid #e5e6eb;
  background: #fff; border-radius: 4px 4px 0 0;
}
.pc-grads-label { font-size: 12px; color: #86909c; margin-right: 2px; }
.pc-grad { width: 22px; height: 22px; border-radius: 6px; cursor: pointer; border: 2px solid transparent; }
.pc-grad:hover { border-color: #165dff; }
.pc-grad--on { border-color: #165dff; box-shadow: 0 0 0 2px rgba(22,93,255,.2); }
.pe-color { position: relative; display: inline-flex; }
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
.pe-color-val { font-size: 12px; color: #4E5969; min-width: 20px; }
.pe-color-arrow { flex-shrink: 0; transition: transform .2s; }

/* 下拉浮层（iView ColorPicker 风格） */
.pc-pop {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 2100;
  width: 232px;
  padding: 12px;
  background: #fff;
  border: 1px solid #E5E6EB;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(29, 33, 41, .12);
}
.pc-sv {
  position: relative;
  height: 130px;
  border-radius: 6px;
  cursor: crosshair;
  touch-action: none;
  border: 1px solid rgba(0, 0, 0, .06);
}
.pc-sv-dot {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, .25), 0 1px 3px rgba(0, 0, 0, .3);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.pc-hue {
  position: relative;
  height: 12px;
  margin-top: 10px;
  border-radius: 6px;
  background: linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);
  cursor: pointer;
  touch-action: none;
}
.pc-hue-dot {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, .25);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.pc-ft { display: flex; align-items: center; gap: 6px; margin-top: 12px; }
.pc-hex-label { font-size: 13px; color: #86909C; }
.pc-hex-input {
  width: 88px;
  height: 28px;
  border: 1px solid #E5E6EB;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 13px;
  color: #1D2129;
  outline: none;
  box-sizing: border-box;
}
.pc-hex-input:focus { border-color: #165DFF; }
.pc-sp { flex: 1; }
.pc-btn {
  height: 28px;
  line-height: 1;
  padding: 0 12px;
  border: 1px solid #E5E6EB;
  border-radius: 6px;
  background: #fff;
  color: #4E5969;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex-shrink: 0;
  white-space: nowrap;
}
.pc-btn:hover { border-color: #165DFF; color: #165DFF; }
.pc-btn-primary { background: #165DFF; border-color: #165DFF; color: #fff; }
.pc-btn-primary:hover { background: #4080FF; color: #fff; }
</style>
