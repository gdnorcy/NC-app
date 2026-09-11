<template>
  <div class="cl-wrap">
    <div class="cl-grid" :style="gridBgStyle">
      <div v-for="g in gridCells" :key="g.r + '-' + g.c" class="cl-cell" :class="{ 'cell-sel': isSelCell(g), 'cell-cur': isCurCell(g) }" @click="toggleCell(g)">
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

    <!-- 选中操作区（对标 ew：多选格子后出现 图片/链接 设置） -->
    <div v-if="selCells.length > 0" class="cl-sel-bar">
      <div class="cl-sel-info">已选 {{ selCells.length }} 格，设置图片与链接后生成区块</div>
      <div class="cl-sel-row">
        <span class="cl-sel-label">图片</span>
        <PeImagePicker v-model="selImg" :clearable="true" />
      </div>
      <div class="cl-sel-row">
        <span class="cl-sel-label">链接</span>
        <el-input v-model="selLink" size="small" placeholder="请选择链接">
          <template #append><el-button @click="linkTarget = 'sel'; linkOpen = true">选择</el-button></template>
        </el-input>
      </div>
      <div class="cl-sel-actions">
        <el-button size="small" @click="clearSel">清空选中</el-button>
        <el-button size="small" type="primary" @click="mergeSel">生成区块</el-button>
      </div>
    </div>

    <div class="cl-tip">点击 + 格子可多选，选中后设置图片与链接合并生成区块；点击区块可修改图片与跳转（自定义风格可删除区块）</div>

    <el-dialog v-model="editOpen" title="魔方区块设置" width="420px" append-to-body>
      <div class="cl-edit">
        <div class="cl-edit-label">图片</div>
        <PeImagePicker v-model="editing.url" :clearable="true" />
        <div class="cl-edit-label">跳转链接</div>
        <el-input v-model="editing.link" size="small" placeholder="如 /pages/card/market">
          <template #append><el-button @click="linkTarget = 'edit'; linkOpen = true">选择</el-button></template>
        </el-input>
      </div>
      <template #footer>
        <el-button v-if="styleType === 1" type="danger" plain @click="removeEditing">删除区块</el-button>
        <el-button @click="editOpen = false">取消</el-button>
        <el-button type="primary" @click="confirmEdit">确定</el-button>
      </template>
    </el-dialog>

    <LinkPicker v-model="linkOpen" @confirm="(v) => { if (linkTarget === 'sel') selLink = v; else editing.link = v; }" />
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
const linkTarget = ref('edit');
const editing = ref({ url: '', link: '' });
// 多选格子集合（对标 ew：点击格子累积选中，可多选；已选格再点不取消）
const selCells = ref([]);
const selCur = ref('');
const selImg = ref('');
const selLink = ref('');

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
function isCurCell(g) { return selCur.value === keyOf(g); }

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
// 点击空白格子：加入多选集合（不立即生成区块；对标 ew 已选格再点不取消）
function toggleCell(g) {
  const k = keyOf(g);
  if (!selCells.value.includes(k)) {
    selCells.value = [...selCells.value, k];
  }
  selCur.value = k;
}
function clearSel() {
  selCells.value = [];
  selCur.value = '';
}
// 合并选中格子为一个区块（取 min/max 边界）
function mergeSel() {
  if (selCells.value.length === 0) return;
  const w = 312 / cols.value;
  const h = 312 / rows.value;
  let minR = 99, minC = 99, maxR = 0, maxC = 0;
  selCells.value.forEach((k) => {
    const [r, c] = k.split('-').map(Number);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  });
  const b = {
    x: Math.round((minC - 1) * w),
    y: Math.round((minR - 1) * h),
    w: Math.round((maxC - minC + 1) * w),
    h: Math.round((maxR - minR + 1) * h),
    url: selImg.value || '',
    link: selLink.value || '',
  };
  const next = [...props.modelValue, b];
  emit('update:modelValue', next);
  clearSel();
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
/* 多选选中态：已累积选中（浅蓝） / 当前格（更深蓝）——对标 ew item-selected/item-selecting */
.cl-cell.cell-sel { background: #dbeafe; border-color: #165dff; }
.cl-cell.cell-cur { background: #bcd4ff; border-color: #165dff; }
.cl-cell.cell-sel .cl-plus { visibility: hidden; }
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
/* 选中操作区 */
.cl-sel-bar {
  margin-top: 10px;
  border: 1px solid #165dff;
  border-radius: 6px;
  padding: 10px;
  background: #f7fbff;
}
.cl-sel-info { font-size: 12px; color: #165dff; margin-bottom: 8px; }
.cl-sel-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.cl-sel-label { font-size: 12px; color: #4e5969; flex: none; width: 34px; }
.cl-sel-row .el-input { flex: 1; }
.cl-sel-actions { display: flex; justify-content: flex-end; gap: 8px; }
.cl-tip { font-size: 11px; color: #86909c; margin-top: 6px; line-height: 1.5; }
.cl-edit-label { font-size: 12px; color: #4e5969; margin: 10px 0 6px; }
.cl-edit-label:first-child { margin-top: 0; }
</style>
