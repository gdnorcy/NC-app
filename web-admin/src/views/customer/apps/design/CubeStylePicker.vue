<template>
  <div class="cs-wrap">
    <div class="cs-row">
      <span class="cs-label">当前：{{ CUBE_STYLE_NAMES[modelValue] || ('风格' + modelValue) }}</span>
      <el-button size="small" type="primary" plain @click="open = true">修改风格</el-button>
    </div>
    <el-dialog v-model="open" title="风格选择器" width="620px" append-to-body>
      <div class="cs-grid">
        <div
          v-for="(st, i) in 11" :key="st"
          class="cs-item"
          :class="{ active: cur === st }"
          @click="cur = st"
        >
          <div class="cs-thumb" :class="{ active: cur === st }">
            <img :src="thumb(st)" />
            <span v-if="cur === st" class="cs-check">✓</span>
          </div>
          <div class="cs-title">{{ CUBE_STYLE_NAMES[st] }}</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" @click="confirm">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { CUBE_STYLE_NAMES } from './cubeLayouts';

const props = defineProps({ modelValue: { type: Number, default: 1 } });
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const cur = ref(props.modelValue);

function thumb(st) {
  const map = {
    1: 'cube-custom', 2: 'cube-style1', 3: 'cube-style2', 4: 'cube-style3', 5: 'cube-style4',
    6: 'cube-style5', 7: 'cube-style6', 8: 'cube-style7', 9: 'cube-style8', 10: 'cube-style9', 11: 'cube-style10',
  };
  return new URL(`../../../assets/comp-icons/cube/${map[st] || 'cube-custom'}.png`, import.meta.url).href;
}
function confirm() {
  if (cur.value !== props.modelValue) emit('update:modelValue', cur.value);
  open.value = false;
}
</script>

<style scoped>
.cs-wrap { width: 100%; }
.cs-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cs-label { font-size: 12px; color: #86909C; }
.cs-grid { display: flex; flex-wrap: wrap; gap: 12px; }
.cs-item { width: 96px; cursor: pointer; text-align: center; }
.cs-thumb { width: 96px; height: 72px; border-radius: 6px; overflow: hidden; position: relative; border: 2px solid transparent; background: #0b0f1a; }
.cs-thumb.active { border-color: #165DFF; }
.cs-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cs-check { position: absolute; right: 4px; top: 4px; width: 18px; height: 18px; border-radius: 50%; background: #165DFF; color: #fff; font-size: 12px; line-height: 18px; text-align: center; }
.cs-title { font-size: 12px; color: #4E5969; margin-top: 4px; }
</style>
