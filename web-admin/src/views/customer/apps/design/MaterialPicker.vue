<template>
  <el-dialog
    :model-value="modelValue"
    title="素材选择"
    width="760px"
    append-to-body
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <!-- 顶部：模式 + 提示 + 搜索 -->
    <div class="mp-head">
      <div class="mp-tabs">
        <span class="mp-tab" :class="{ active: mode === 'upload' }" @click="switchMode('upload')">本地上传</span>
        <span class="mp-tab" :class="{ active: mode === 'net' }" @click="switchMode('net')">网络提取</span>
      </div>
      <span class="mp-limit">大小不要超过 {{ limits.maxImageSize }}M</span>
      <el-input v-model="q.keyword" placeholder="搜索图片名称" size="small" clearable style="width: 150px" @keyup.enter="reload(1)" @clear="reload(1)" />
      <el-date-picker v-model="q.dateRange" type="daterange" size="small" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" style="width: 230px" @change="reload(1)" />
    </div>

    <!-- 本地上传 / 网络提取 模式体 -->
    <div v-if="mode === 'net'" class="mp-net">
      <el-input v-model="netUrl" placeholder="请在此处粘贴图片地址" clearable>
        <template #append>
          <el-button type="primary" :loading="netLoading" @click="doImport">提取</el-button>
        </template>
      </el-input>
      <div class="mp-net-help">需要 http://…… 大小不要超过 {{ limits.maxImageSize }}M，支持图片类型 .gif，.jpg，.png，.jpeg</div>
    </div>

    <div class="mp-body">
      <!-- 左侧分类 -->
      <div class="mp-side">
        <div class="mp-cat" :class="{ active: q.categoryId === '' }" @click="q.categoryId = ''; reload(1)">全部</div>
        <div
          v-for="c in cats"
          :key="c.id"
          class="mp-cat"
          :class="{ active: q.categoryId === c.id }"
          @click="q.categoryId = c.id; reload(1)"
        >{{ c.category_name }}</div>
        <div class="mp-addcat" @click="addCategory">+ 添加分类</div>
      </div>

      <!-- 网格 -->
      <div class="mp-grid-wrap">
        <div v-loading="loading" class="mp-grid">
          <div
            v-for="m in mats"
            :key="m.id"
            class="mp-item"
            :class="{ picked: pick === m.id }"
            @click="pick = m.id"
          >
            <video v-if="m.file_type === 'mp4'" :src="resolveUrl(m.file_url)" preload="metadata" muted></video>
            <img v-else :src="resolveUrl(m.file_url)" :alt="m.file_name" />
            <span v-if="m.file_type === 'mp4'" class="mp-vtag">视频</span>
            <span v-if="pick === m.id" class="mp-check">✓</span>
            <div class="mp-name">{{ m.file_name }}</div>
          </div>
          <div v-if="!mats.length && !loading" class="mp-empty">素材库为空，可点击「本地上传」或「网络提取」添加</div>
        </div>
      </div>
    </div>

    <!-- 底部：分页 + 按钮 -->
    <div class="mp-foot">
      <div class="mp-page">
        每页显示 {{ pageSize }}
        <el-pagination
          v-model:current-page="page"
          layout="prev, pager, next, jumper"
          :total="total"
          :page-size="pageSize"
          size="small"
          background
          @current-change="reload(page)"
        />
        <span class="mp-total">{{ total ? Math.ceil(total / pageSize) : 0 }} 页</span>
      </div>
      <div class="mp-ops">
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button type="primary" :disabled="!pick" @click="doConfirm">确定</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { designCall } from '../../../../api';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue', 'confirm']);

const mode = ref('upload'); // upload | net
const limits = reactive({ maxImageSize: 2, maxVideoSize: 50 });
const q = reactive({ keyword: '', dateRange: null, categoryId: '' });
const cats = ref([]);
const mats = ref([]);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = 18;
const pick = ref(null);
const netUrl = ref('');
const netLoading = ref(false);
const uploadRef = ref(null);

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}

function switchMode(m) {
  mode.value = m;
  if (m === 'net') { pick.value = null; }
}

async function loadCats() {
  try { const res = await designCall.get('/material/category/list'); cats.value = res.list || []; }
  catch (e) { ElMessage.error(e); }
}

async function reload(p) {
  page.value = p || 1;
  loading.value = true;
  try {
    const params = { page: page.value, pageSize };
    if (q.categoryId) params.categoryId = q.categoryId;
    if (q.keyword) params.keyword = q.keyword;
    if (q.dateRange && q.dateRange.length === 2) { params.dateFrom = q.dateRange[0]; params.dateTo = q.dateRange[1]; }
    const res = await designCall.get('/material/list', { params });
    mats.value = res.list || [];
    total.value = res.total || 0;
    if (res.limits) { limits.maxImageSize = res.limits.maxImageSize || 2; limits.maxVideoSize = res.limits.maxVideoSize || 50; }
    if (pick.value && !mats.value.some((m) => m.id === pick.value)) pick.value = null;
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}

function addCategory() {
  ElMessageBox.prompt('请输入分类名称', '添加分类', { inputValidator: (v) => (v && v.trim() ? true : '分类名称不能为空') })
    .then(async ({ value }) => {
      try { await designCall.post('/material/category/save', { name: value.trim() }); ElMessage.success('已添加'); loadCats(); }
      catch (e) { ElMessage.error(e); }
    })
    .catch(() => {});
}

async function doUpload(evt) {
  const file = evt.target.files?.[0];
  evt.target.value = '';
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  if (q.categoryId) fd.append('categoryId', q.categoryId);
  try {
    await designCall.post('/material/upload', fd);
    ElMessage.success('上传成功');
    reload(page.value);
  } catch (e) { ElMessage.error(e); }
}

async function doImport() {
  const url = netUrl.value.trim();
  if (!url) { ElMessage.warning('请先粘贴图片地址'); return; }
  netLoading.value = true;
  try {
    const res = await designCall.post('/material/import', { url, categoryId: q.categoryId || null });
    if (res?.ok) { ElMessage.success('提取成功'); netUrl.value = ''; reload(page.value); }
    else ElMessage.error(res?.error || '提取失败');
  } catch (e) { ElMessage.error(e); } finally { netLoading.value = false; }
}

function doConfirm() {
  const m = mats.value.find((x) => x.id === pick.value);
  if (m) { emit('confirm', m.file_url, m.id); emit('update:modelValue', false); }
}

watch(() => props.modelValue, (v) => {
  if (v) { pick.value = null; loadCats(); reload(1); }
});
</script>

<style scoped>
.mp-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.mp-tabs { display: flex; background: #F2F3F5; border-radius: 8px; padding: 2px; }
.mp-tab { padding: 4px 14px; font-size: 13px; color: #4E5969; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
.mp-tab.active { background: #FFFFFF; color: #165DFF; font-weight: 500; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.mp-limit { font-size: 12px; color: #86909C; }
.mp-net { margin-bottom: 10px; }
.mp-net-help { font-size: 12px; color: #86909C; margin-top: 6px; }
.mp-body { display: flex; gap: 12px; height: 330px; }
.mp-side { width: 130px; flex-shrink: 0; border-right: 1px solid #E5E6EB; padding-right: 8px; overflow-y: auto; }
.mp-cat {
  height: 34px; line-height: 34px; padding: 0 10px; margin-bottom: 4px;
  border-radius: 8px; font-size: 13px; color: #4E5969; cursor: pointer; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; transition: all 0.2s;
}
.mp-cat:hover { background: #F2F3F5; color: #1D2129; }
.mp-cat.active { background: #E8F3FF; color: #165DFF; font-weight: 500; }
.mp-addcat { font-size: 12px; color: #165DFF; padding: 6px 10px; cursor: pointer; }
.mp-grid-wrap { flex: 1; overflow-y: auto; }
.mp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
.mp-item {
  position: relative; border: 1px solid #E5E6EB; border-radius: 8px; overflow: hidden;
  cursor: pointer; transition: all 0.2s; background: #F7F8FA;
}
.mp-item:hover { border-color: #165DFF; }
.mp-item.picked { border-color: #165DFF; box-shadow: 0 0 0 2px rgba(22,93,255,0.15); }
.mp-item video, .mp-item img { width: 100%; height: 76px; object-fit: cover; display: block; }
.mp-vtag { position: absolute; top: 4px; left: 4px; font-size: 10px; color: #fff; background: rgba(0,0,0,0.55); border-radius: 4px; padding: 1px 5px; }
.mp-check {
  position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; border-radius: 50%;
  background: #165DFF; color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center;
}
.mp-name { font-size: 11px; color: #4E5969; padding: 4px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-empty { grid-column: 1 / -1; text-align: center; color: #86909C; font-size: 13px; padding: 60px 0; }
.mp-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
.mp-page { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #86909C; }
.mp-total { font-size: 12px; color: #86909C; }
.mp-ops { display: flex; gap: 8px; }
</style>
