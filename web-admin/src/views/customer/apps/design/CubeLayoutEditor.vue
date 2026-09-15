<template>
  <div class="cl-wrap">
    <div class="cl-grid" :style="gridBgStyle" @mouseleave="onGridLeave">
      <div
        v-for="g in gridCells" :key="g.r + '-' + g.c"
        class="cl-cell" :class="{ 'cell-sel': isSelCell(g), 'cell-cur': isCurCell(g) }"
        @click="onCellClick(g)" @mousemove="onCellMove(g)"
      >
        <span v-if="!isSelCell(g)" class="cl-plus">+</span>
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

    <div class="cl-tip">点击空格子开始框选，按住移动鼠标经过多个格子可多选（实时预览），再次点击确认生成区块；点击区块可修改图片与跳转（自定义风格可删除区块）</div>

    <el-dialog v-model="editOpen" title="魔方块设置" width="420px" append-to-body>
      <div class="cl-edit">
        <div class="cl-edit-label">图片</div>
        <PeImagePicker v-model="editing.url" :clearable="true" />
        <div class="cl-edit-label">跳转链接</div>
        <el-input v-model="editing.link" size="small" placeholder="如 /pages/card/market">
          <template #append><el-button @click="linkTarget = 'edit'; linkOpen = true">选择</el-button></template>
        </el-input>
        <div class="cl-edit-label">圆角</div>
        <div class="cl-edit-slider">
          <el-slider v-model="editing.radius" :min="0" :max="20" :show-tooltip="false" />
          <span class="cl-edit-val">{{ editing.radius ?? 4 }}px</span>
        </div>
        <div class="cl-edit-label">间隔</div>
        <div class="cl-edit-slider">
          <el-slider v-model="editing.gap" :min="0" :max="20" :show-tooltip="false" />
          <span class="cl-edit-val">{{ editing.gap ?? 0 }}px</span>
        </div>
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
const editing = ref({ url: '', link: '', radius: 4, gap: 0 });
// 拖动框选状态（对标 ew cube-right：click 起点 → mousemove 矩形预览 → click 提交）
const selActive = ref(false);
const selStart = ref('');
const selCells = ref([]);

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

function keyOf(g) { return g.r + '-' + g.c; }
function isSelCell(g) { return selCells.value.includes(keyOf(g)); }
function isCurCell(g) { return selStart.value === keyOf(g); }

// 已被区块占用的格子集合（对标 ew uses：已用格不可再选，冲突不更新预览）
function usedCells() {
  const set = new Set();
  if (!props.modelValue.length) return set;
  const w = 312 / cols.value;
  const h = 312 / rows.value;
  props.modelValue.forEach((b) => {
    const c1 = Math.floor(b.x / w) + 1;
    const c2 = Math.floor((b.x + b.w - 1) / w) + 1;
    const r1 = Math.floor(b.y / h) + 1;
    const r2 = Math.floor((b.y + b.h - 1) / h) + 1;
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) set.add(r + '-' + c);
  });
  return set;
}

// 计算 start→end 矩形内的格子集合
function rectCells(k1, k2) {
  const [r1, c1] = k1.split('-').map(Number);
  const [r2, c2] = k2.split('-').map(Number);
  const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
  const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
  const arr = [];
  for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) arr.push(r + '-' + c);
  return arr;
}

// 点击格子：未在选择 → 起点（进入框选）；选择中 → 提交当前矩形生成区块
function onCellClick(g) {
  const k = keyOf(g);
  if (usedCells().has(k)) return;
  if (!selActive.value) {
    selActive.value = true;
    selStart.value = k;
    selCells.value = [k];
  } else {
    const rect = selCells.value.length ? selCells.value : [selStart.value];
    if (rect.some((ck) => usedCells().has(ck))) return;
    mergeCells(rect);
  }
}

// 移动鼠标经过格子：实时更新矩形预览（与已用格冲突则不更新，对标 ew intersection）
function onCellMove(g) {
  if (!selActive.value) return;
  const rect = rectCells(selStart.value, keyOf(g));
  if (rect.some((k) => usedCells().has(k))) return;
  if (rect.length !== selCells.value.length || rect.some((k, i) => selCells.value[i] !== k)) {
    selCells.value = rect;
  }
}

// 移出网格：取消框选（对标 ew mouseleave es-cube）
function onGridLeave() {
  selActive.value = false;
  selStart.value = '';
  selCells.value = [];
}

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

// 合并矩形格子为一个区块（取 min/max 边界）并打开编辑
function mergeCells(rect) {
  if (!rect.length) return;
  const w = 312 / cols.value;
  const h = 312 / rows.value;
  let minR = 99, minC = 99, maxR = 0, maxC = 0;
  rect.forEach((k) => {
    const [r, c] = k.split('-').map(Number);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  });
  const b = {
    x: Math.round((minC - 1) * w),
    y: Math.round((minR - 1) * h),
    w: Math.round((maxC - minC + 1) * w),
    h: Math.round((maxR - minR + 1) * h),
    url: '',
    link: '',
    radius: 4,
    gap: 0,
  };
  const next = [...props.modelValue, b];
  emit('update:modelValue', next);
  selActive.value = false;
  selStart.value = '';
  selCells.value = [];
  selIdx.value = next.length - 1;
  editing.value = { ...b };
  editOpen.value = true;
}

function selectBlock(i) {
  selIdx.value = i;
  editing.value = { radius: 4, gap: 0, ...props.modelValue[i] };
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
    const next = props.modelValue.map((b, i) => (i === selIdx.value ? { ...b, url: editing.value.url, link: editing.value.link, radius: editing.value.radius ?? 4, gap: editing.value.gap ?? 0 } : b));
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
  user-select: none;
  -webkit-user-select: none;
}
.cl-cell {
  border: 1px dashed #d0d3d9;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: #fff;
  transition: background 0.1s;
}
.cl-cell:hover { background: #e8f3ff; }
/* 框选预览态：矩形内实时预览（浅蓝，对标 ew item-selecting）/ 起点（深蓝） */
.cl-cell.cell-sel { background: #dbeafe; border-color: #165dff; }
.cl-cell.cell-cur { background: #bcd4ff; border-color: #165dff; }
.cl-cell.cell-sel .cl-plus { visibility: hidden; }
.cl-plus { color: #c9cdd4; font-size: 16px; line-height: 1; user-select: none; pointer-events: none; }
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
.cl-edit-slider { display: flex; align-items: center; gap: 10px; }
.cl-edit-slider .el-slider { flex: 1; }
.cl-edit-val { font-size: 12px; color: #1d2129; width: 40px; text-align: right; flex: none; }
</style>
