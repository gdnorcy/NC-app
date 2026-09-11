<template>
  <div class="cl-wrap">
    <div class="cl-grid" :style="gridBgStyle">
      <div v-for="g in gridCells" :key="g.r + '-' + g.c" class="cl-cell" @click="addBlock(g)">
        <span class="cl-plus">+</span>
      </div>
      <div
        v-for="(b, i) in modelValue" :key="i"
        class="cl-block" :class="{ sel: selIdx === i }"
        :style="blockStyle(b)"
        @click.stop="selectBlock(i)"
      >
        <img v-if="b.url" :src="resolveUrl(b.url)" class="cl-block-img" />
        <span v-else class="cl-block-plus">+</span>
        <span v-if="selIdx === i && styleType === 1" class="cl-del" @click.stop="removeBlock(i)">×</span>
      </div>
    </div>
    <div class="cl-tip">点击 + 添加图片区块，点击区块可修改图片与跳转（自定义风格可删除区块）</div>

    <el-dialog v-model="editOpen" title="魔方区块设置" width="420px" append-to-body>
      <div class="cl-edit">
        <div class="cl-edit-label">图片</div>
        <PeImagePicker v-model="editing.url" :clearable="true" />
        <div class="cl-edit-label">跳转链接</div>
        <el-input v-model="editing.link" size="small" placeholder="如 /pages/card/market">
          <template #append><el-button @click="linkOpen = true">选择</el-button></template>
        </el-input>
      </div>
      <template #footer>
        <el-button v-if="styleType === 1" type="danger" plain @click="removeEditing">删除区块</el-button>
        <el-button @click="editOpen = false">取消</el-button>
        <el-button type="primary" @click="confirmEdit">确定</el-button>
      </template>
    </el-dialog>

    <LinkPicker v-model="linkOpen" @confirm="(v) => { editing.link = v; }" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { CUBE_LAYOUTS } from './cubeLayouts';
import PeImagePicker from './PeImagePicker.vue';
import LinkPicker from './LinkPicker.vue';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  styleType: { type: Number, default: 1 },
});
const emit = defineEmits(['update:modelValue']);

const selIdx = ref(-1);
const editOpen = ref(false);
const linkOpen = ref(false);
const editing = ref({ url: '', link: '' });

const lay = computed(() => CUBE_LAYOUTS[props.styleType] || CUBE_LAYOUTS[1]);
const rows = computed(() => lay.value.grid[0]);
const cols = computed(() => lay.value.grid[1]);
const gridCells = computed(() => {
  const arr = [];
  for (let r = 1; r <= rows.value; r++) for (let c = 1; c <= cols.value; c++) arr.push({ r, c });
  return arr;
});
const gridBgStyle = computed(() => ({
  gridTemplateColumns: `repeat(${cols.value}, 1fr)`,
  gridTemplateRows: `repeat(${rows.value}, 1fr)`,
}));

function blockStyle(b) {
  return {
    left: (b.x / 312 * 100) + '%',
    top: (b.y / 312 * 100) + '%',
    width: (b.w / 312 * 100) + '%',
    height: (b.h / 312 * 100) + '%',
  };
}
function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function addBlock(g) {
  const w = 312 / cols.value;
  const h = 312 / rows.value;
  const b = { x: Math.round((g.c - 1) * w), y: Math.round((g.r - 1) * h), w: Math.round(w), h: Math.round(h), url: '', link: '' };
  const next = [...props.modelValue, b];
  emit('update:modelValue', next);
  selIdx.value = next.length - 1;
  editing.value = { ...b };
  editOpen.value = true;
}
function selectBlock(i) {
  selIdx.value = i;
  editing.value = { ...props.modelValue[i] };
  editOpen.value = true;
}
function removeBlock(i) {
  const next = props.modelValue.filter((_, idx) => idx !== i);
  emit('update:modelValue', next);
  selIdx.value = -1;
  editOpen.value = false;
}
function removeEditing() {
  if (selIdx.value >= 0) removeBlock(selIdx.value);
}
function confirmEdit() {
  if (selIdx.value >= 0) {
    const next = props.modelValue.map((b, i) => (i === selIdx.value ? { ...b, url: editing.value.url, link: editing.value.link } : b));
    emit('update:modelValue', next);
  }
  editOpen.value = false;
}
</script>

<style scoped>
.cl-wrap { width: 100%; }
.cl-grid {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: #f2f3f5;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  overflow: hidden;
  display: grid;
  gap: 2px;
  padding: 2px;
  box-sizing: border-box;
}
.cl-cell {
  border: 1px dashed #d0d3d9;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: #fff;
  transition: background 0.15s;
}
.cl-cell:hover { background: #e8f3ff; }
.cl-plus { color: #c9cdd4; font-size: 16px; line-height: 1; user-select: none; }
.cl-block {
  position: absolute;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  background: #fff;
  box-sizing: border-box;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
.cl-block.sel { border-color: #165dff; }
.cl-block-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cl-block-plus { display: flex; align-items: center; justify-content: center; height: 100%; color: #c9cdd4; font-size: 18px; }
.cl-del {
  position: absolute; right: -6px; top: -6px; width: 16px; height: 16px; border-radius: 50%;
  background: #f53f3f; color: #fff; font-size: 11px; line-height: 16px; text-align: center; cursor: pointer;
}
.cl-tip { font-size: 11px; color: #86909c; margin-top: 6px; line-height: 1.5; }
.cl-edit-label { font-size: 12px; color: #4e5969; margin: 10px 0 6px; }
.cl-edit-label:first-child { margin-top: 0; }
</style>
