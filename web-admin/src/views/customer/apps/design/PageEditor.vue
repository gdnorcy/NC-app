<template>
  <div class="page-editor">
    <div class="pe-toolbar">
      <div class="pe-title">
        <span class="pe-page-name">{{ pageName }}</span>
        <el-tag v-if="published" type="success" size="small">已发布 v{{ published.version }}</el-tag>
        <el-tag v-if="draft" type="info" size="small">有草稿</el-tag>
      </div>
      <div class="pe-actions">
        <el-button size="small" @click="loadVersions">历史版本</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="saveDraft">保存草稿</el-button>
        <el-button size="small" type="success" :loading="publishing" @click="publish">发布</el-button>
      </div>
    </div>

    <div class="pe-body">
      <!-- 组件库 -->
      <div class="pe-lib">
        <div class="pe-lib-title">组件库</div>
        <div
          v-for="c in componentLib" :key="c.type"
          class="pe-lib-item" draggable="true"
          @dragstart="onLibDragStart($event, c.type)"
          @click="addComponent(c.type)"
        >
          <span class="pe-lib-icon"><SIcon :name="c.icon" size="small" /></span>
          <span class="pe-lib-name">{{ c.name }}</span>
        </div>
        <div class="pe-lib-tip">点击或拖拽到画布</div>
      </div>

      <!-- 画布（手机预览壳） -->
      <div class="pe-canvas-wrap">
        <div class="pe-phone">
          <div class="pe-phone-bar"></div>
          <div class="pe-phone-nav">{{ pageName }}</div>
          <div class="pe-canvas" @dragover.prevent="onCanvasDragOver" @drop="onCanvasDrop">
            <div
              v-for="(comp, i) in components" :key="comp.id"
              class="pe-comp" :class="{ active: selected === comp.id }"
              draggable="true"
              @click.stop="selectComp(comp)"
              @dragstart="onCompDragStart($event, i)"
              @dragover.prevent="onCompDragOver(i)"
              @drop.stop="onCompDrop(i)"
            >
              <div class="pe-comp-tools">
                <span class="pe-comp-idx">{{ i + 1 }}</span>
                <span class="pe-comp-type">{{ compName(comp.type) }}</span>
                <el-button size="small" text type="danger" @click.stop="removeComp(comp.id)">删除</el-button>
              </div>
              <!-- 组件渲染 -->
              <div class="pe-render" :style="compStyle(comp)">
                <template v-if="comp.type === 'title'">
                  <div class="r-title" :style="{ color: comp.props.color, textAlign: comp.props.align }">{{ comp.props.text || '标题文字' }}</div>
                </template>
                <template v-else-if="comp.type === 'text'">
                  <div class="r-text" :style="{ color: comp.props.color, textAlign: comp.props.align, fontSize: comp.props.size + 'px' }">{{ comp.props.text || '文本内容' }}</div>
                </template>
                <template v-else-if="comp.type === 'image'">
                  <div class="r-image">
                    <img v-if="comp.props.url" :src="resolveUrl(comp.props.url)" />
                    <div v-else class="r-image-empty"><SIcon name="storage" size="default" />图片组件（右侧选择素材）</div>
                  </div>
                </template>
                <template v-else-if="comp.type === 'button'">
                  <div class="r-btn" :style="{ color: comp.props.textColor, background: comp.props.bgColor, borderRadius: comp.props.radius + 'px' }">{{ comp.props.text || '按钮' }}</div>
                </template>
                <template v-else-if="comp.type === 'divider'">
                  <div class="r-divider"><span v-if="comp.props.text">{{ comp.props.text }}</span></div>
                </template>
                <template v-else-if="comp.type === 'notice'">
                  <div class="r-notice" :style="{ background: comp.props.bgColor, color: comp.props.color }">
                    <span class="r-notice-tag">公告</span>{{ comp.props.text || '公告内容' }}
                  </div>
                </template>
              </div>
            </div>
            <div v-if="!components.length" class="pe-empty">
              <SIcon name="dynamic" size="xlarge" />
              <span>从左侧拖拽组件到此处，或点击组件库添加</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 属性面板 -->
      <div class="pe-prop">
        <div class="pe-prop-title">属性</div>
        <div v-if="selectedComp" class="pe-prop-body">
          <el-form label-width="70px" size="small">
            <el-form-item label="文字">
              <el-input v-model="selectedComp.props.text" />
            </el-form-item>
            <template v-if="selectedComp.type === 'title' || selectedComp.type === 'text' || selectedComp.type === 'notice'">
              <el-form-item label="颜色">
                <el-color-picker v-model="selectedComp.props.color" />
              </el-form-item>
              <el-form-item v-if="selectedComp.type !== 'notice'" label="对齐">
                <el-radio-group v-model="selectedComp.props.align">
                  <el-radio value="left">左</el-radio>
                  <el-radio value="center">中</el-radio>
                  <el-radio value="right">右</el-radio>
                </el-radio-group>
              </el-form-item>
            </template>
            <el-form-item v-if="selectedComp.type === 'text'" label="字号">
              <el-slider v-model="selectedComp.props.size" :min="12" :max="32" show-input />
            </el-form-item>
            <template v-if="selectedComp.type === 'image'">
              <el-form-item label="图片">
                <el-button size="small" @click="openImgSel">选择素材</el-button>
                <el-button v-if="selectedComp.props.url" size="small" text type="danger" @click="selectedComp.props.url = ''; selectedComp.props.materialId = null">清除</el-button>
              </el-form-item>
            </template>
            <template v-if="selectedComp.type === 'button'">
              <el-form-item label="文字色">
                <el-color-picker v-model="selectedComp.props.textColor" />
              </el-form-item>
              <el-form-item label="背景色">
                <el-color-picker v-model="selectedComp.props.bgColor" />
              </el-form-item>
              <el-form-item label="圆角">
                <el-slider v-model="selectedComp.props.radius" :min="0" :max="24" show-input />
              </el-form-item>
            </template>
            <el-form-item v-if="selectedComp.type === 'button' || selectedComp.type === 'image' || selectedComp.type === 'notice'" label="跳转">
              <el-input v-model="selectedComp.props.url" placeholder="如 /pages/card/market" />
            </el-form-item>
          </el-form>
        </div>
        <div v-else class="pe-prop-empty">
          <SIcon name="palette" size="xlarge" />
          <span>选中画布中的组件后在此编辑属性</span>
        </div>
      </div>
    </div>

    <!-- 历史版本 -->
    <el-dialog v-model="versionShow" title="历史版本（发布保留最近 3 版）" width="560px" append-to-body>
      <el-table :data="versions" size="small" stripe>
        <el-table-column label="版本" prop="version" width="100">
          <template #default="{ row }">v{{ row.version }}</template>
        </el-table-column>
        <el-table-column label="发布时间" prop="created_at" />
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button size="small" type="primary" text @click="rollback(row)">回滚</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!versions.length" class="pe-empty">暂无历史版本（发布后自动生成）</div>
    </el-dialog>

    <!-- 素材选择 -->
    <el-dialog v-model="imgSel.show" title="选择素材" width="720px" append-to-body>
      <div class="pe-sel">
        <div v-loading="selLoading" class="sel-grid">
          <div v-for="m in selMats" :key="m.id" class="sel-item" :class="{ picked: imgSel.pick === m.id }" @click="imgSel.pick = m.id">
            <img :src="resolveUrl(m.file_url)" :alt="m.file_name" />
            <span v-if="imgSel.pick === m.id" class="sel-check">✓</span>
          </div>
          <div v-if="!selMats.length && !selLoading" class="pe-empty">素材库为空，请先到「素材中心」上传</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="imgSel.show = false">取消</el-button>
        <el-button type="primary" :disabled="!imgSel.pick" @click="confirmImgSel">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../../components/SIcon.vue';
import { designCall } from '../../../../api';

const props = defineProps({
  pageType: { type: String, default: 'home' },
});
const pageName = ref('首页');
const components = ref([]);
const selected = ref(null);
const draft = ref(null);
const published = ref(null);
const saving = ref(false);
const publishing = ref(false);
const versionShow = ref(false);
const versions = ref([]);
const selMats = ref([]);
const selLoading = ref(false);
const imgSel = reactive({ show: false, pick: null });

const componentLib = [
  { type: 'title', name: '标题', icon: 'template' },
  { type: 'text', name: '文本', icon: 'dynamic' },
  { type: 'image', name: '图片', icon: 'storage' },
  { type: 'button', name: '按钮', icon: 'apps' },
  { type: 'divider', name: '分割线', icon: 'palette' },
  { type: 'notice', name: '公告', icon: 'dashboard' },
];
let uid = 1;
const selectedComp = computed(() => components.value.find((c) => c.id === selected.value) || null);

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function compName(t) {
  return componentLib.find((c) => c.type === t)?.name || t;
}
function defaultProps(type) {
  const base = { text: '', color: '#1d2129', align: 'center', url: '' };
  if (type === 'title') return { ...base, text: '页面标题', size: 22 };
  if (type === 'text') return { ...base, text: '这里填写文本内容', size: 14 };
  if (type === 'image') return { url: '', materialId: null };
  if (type === 'button') return { text: '立即查看', textColor: '#ffffff', bgColor: '#165DFF', radius: 8, url: '' };
  if (type === 'divider') return { text: '' };
  if (type === 'notice') return { text: '欢迎来到本店', bgColor: '#FFF7E8', color: '#FF7D00', url: '' };
  return { ...base };
}
function newComp(type) {
  return { id: `c${Date.now()}-${uid++}`, type, props: defaultProps(type) };
}
function addComponent(type) {
  const c = newComp(type);
  components.value.push(c);
  selected.value = c.id;
}
function removeComp(id) {
  components.value = components.value.filter((c) => c.id !== id);
  if (selected.value === id) selected.value = null;
}
function selectComp(comp) { selected.value = comp.id; }
function onLibDragStart(e, type) { e.dataTransfer.setData('text/plain', type); }
function onCanvasDragOver() {}
function onCanvasDrop(e) {
  const type = e.dataTransfer.getData('text/plain');
  if (type && componentLib.some((c) => c.type === type)) addComponent(type);
}
let dragIdx = -1;
function onCompDragStart(e, i) { dragIdx = i; e.dataTransfer.effectAllowed = 'move'; }
function onCompDragOver(i) {
  if (dragIdx >= 0 && dragIdx !== i) {
    const arr = [...components.value];
    const [moved] = arr.splice(dragIdx, 1);
    arr.splice(i, 0, moved);
    components.value = arr;
    dragIdx = i;
  }
}
function onCompDrop() { dragIdx = -1; }

function compStyle(comp) {
  const s = {};
  if (comp.type === 'image') s.padding = '8px';
  return s;
}

async function load() {
  try {
    const [pubRes, draftRes] = await Promise.all([
      designCall.get('/design/page/detail', { params: { pageType: props.pageType, published: 1 } }),
      designCall.get('/design/page/detail', { params: { pageType: props.pageType, published: 0 } }),
    ]);
    published.value = pubRes.page || null;
    draft.value = draftRes.page || null;
    const src = draft.value || published.value;
    if (src) {
      pageName.value = src.page_name || '页面';
      components.value = (src.design_json?.components || []).map((c) => ({ ...c, props: { ...defaultProps(c.type), ...(c.props || {}) } }));
    }
  } catch (e) { ElMessage.error(e); }
}
async function saveDraft() {
  saving.value = true;
  try {
    const res = await designCall.post('/design/page/saveDraft', {
      pageType: props.pageType, pageName: pageName.value,
      designJson: { components: components.value },
      baseVersion: draft.value?.version ?? published.value?.version ?? 1,
    });
    draft.value = { ...draft.value, version: res.version };
    ElMessage.success('草稿已保存');
  } catch (e) {
    if (typeof e === 'string' && e.includes('已被其他成员修改')) {
      try {
        await ElMessageBox.confirm(e + '，是否重新加载最新版本？', '版本冲突', { type: 'warning' });
        await load();
      } catch { /* 用户取消 */ }
    } else ElMessage.error(e);
  } finally { saving.value = false; }
}
async function publish() {
  if (!draft.value) { ElMessage.warning('请先保存草稿再发布'); return; }
  try {
    await ElMessageBox.confirm('发布后小程序端将立即按最新配置渲染，确认发布？', '发布确认', { type: 'warning' });
  } catch { return; }
  publishing.value = true;
  try {
    const res = await designCall.post('/design/page/publish', { pageType: props.pageType });
    ElMessage.success(`已发布 v${res.version}`);
    draft.value = null;
    await load();
  } catch (e) { ElMessage.error(e); } finally { publishing.value = false; }
}
async function loadVersions() {
  try {
    const res = await designCall.get('/design/page/versionList', { params: { pageType: props.pageType } });
    versions.value = res.list || [];
    versionShow.value = true;
  } catch (e) { ElMessage.error(e); }
}
async function rollback(row) {
  try { await ElMessageBox.confirm(`回滚到 v${row.version}？将生成一份草稿，需再次发布生效`, '版本回滚', { type: 'warning' }); } catch { return; }
  try {
    const res = await designCall.post('/design/page/rollback', { pageType: props.pageType, version: row.version });
    if (res.ok) {
      ElMessage.success('已生成回滚草稿');
      versionShow.value = false;
      await load();
    }
  } catch (e) { ElMessage.error(e); }
}
async function openImgSel() {
  imgSel.pick = null;
  imgSel.show = true;
  selLoading.value = true;
  try {
    const res = await designCall.get('/material/list', { params: { page: 1, pageSize: 60 } });
    selMats.value = res.list || [];
  } catch (e) { ElMessage.error(e); } finally { selLoading.value = false; }
}
function confirmImgSel() {
  const m = selMats.value.find((x) => x.id === imgSel.pick);
  if (m && selectedComp.value) {
    selectedComp.value.props.url = m.file_url;
    selectedComp.value.props.materialId = m.id;
  }
  imgSel.show = false;
}

watch(() => props.pageType, () => { selected.value = null; load(); });
onMounted(load);
</script>

<style scoped>
.page-editor { display: flex; flex-direction: column; gap: 12px; }
.pe-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.pe-title { display: flex; align-items: center; gap: 10px; }
.pe-page-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.pe-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.pe-body { display: grid; grid-template-columns: 168px minmax(0, 1fr) 260px; gap: 12px; align-items: start; }

/* 组件库：卡片化 */
.pe-lib { background: #fff; border-radius: 8px; padding: 12px; }
.pe-lib-title { font-size: 13px; font-weight: 600; color: #1d2129; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
.pe-lib-title::before { content: ''; width: 3px; height: 14px; border-radius: 2px; background: #165dff; }
.pe-lib-item {
  display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 12px;
  border-radius: 8px; margin-bottom: 4px; cursor: grab;
  font-size: 13px; color: #4e5969; transition: background .2s, color .2s;
}
.pe-lib-item:hover { background: #f2f3f5; color: #1d2129; }
.pe-lib-item:active { cursor: grabbing; }
.pe-lib-icon { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: rgba(22,93,255,.06); color: #165dff; flex-shrink: 0; }
.pe-lib-item:hover .pe-lib-icon { background: rgba(22,93,255,.12); }
.pe-lib-tip { font-size: 11px; color: #86909c; margin-top: 8px; text-align: center; }

/* 画布：手机预览壳 */
.pe-canvas-wrap { background: #f2f3f5; border-radius: 8px; padding: 20px 16px; min-height: 520px; }
.pe-phone {
  background: #fff; border-radius: 16px; max-width: 375px; margin: 0 auto;
  box-shadow: 0 4px 16px rgba(0,0,0,.08), 0 0 0 1px #e5e6eb;
  overflow: hidden;
}
.pe-phone-bar { height: 24px; background: #f7f8fa; border-bottom: 1px solid #f0f1f3; }
.pe-phone-nav { height: 40px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; color: #1d2129; background: #fff; border-bottom: 1px solid #f0f1f3; }
.pe-canvas { min-height: 420px; padding: 14px; background: #fff; }
.pe-comp { position: relative; border: 1px dashed transparent; border-radius: 8px; margin-bottom: 10px; padding: 6px; transition: border-color .15s; }
.pe-comp:hover { border-color: #c9cdd4; }
.pe-comp.active { border-color: #165dff; box-shadow: 0 0 0 1px rgba(22,93,255,.25); background: rgba(22,93,255,.02); }
.pe-comp-tools { display: none; position: absolute; top: -20px; right: 4px; background: #165dff; color: #fff; border-radius: 6px; font-size: 11px; padding: 2px 10px; z-index: 2; align-items: center; gap: 8px; }
.pe-comp.active .pe-comp-tools { display: flex; }
.pe-comp-idx { background: rgba(255,255,255,.25); border-radius: 4px; padding: 0 6px; }
.pe-comp-type { color: #fff; }
.pe-comp-tools :deep(.el-button) { color: #fff; }
.pe-render { pointer-events: none; }
.r-title { font-size: 22px; font-weight: 700; line-height: 1.4; }
.r-text { line-height: 1.6; }
.r-image img { width: 100%; border-radius: 8px; display: block; }
.r-image-empty { height: 88px; display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; color: #86909c; font-size: 12px; background: #f7f8fa; border: 1px dashed #c9cdd4; border-radius: 8px; }
.r-btn { display: inline-block; padding: 10px 24px; border-radius: 8px; font-size: 14px; }
.r-divider { height: 1px; background: #e5e6eb; margin: 14px 0; position: relative; }
.r-divider span { position: absolute; left: 50%; top: -8px; transform: translateX(-50%); background: #fff; padding: 0 10px; font-size: 12px; color: #86909c; }
.r-notice { padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; gap: 8px; }
.r-notice-tag { flex-shrink: 0; font-weight: 600; }

/* 空态 */
.pe-empty { color: #86909c; text-align: center; padding: 80px 0; font-size: 13px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.pe-empty :deep(svg), .pe-empty :deep(img) { opacity: .4; }

/* 属性面板 */
.pe-prop { background: #fff; border-radius: 8px; padding: 12px; }
.pe-prop-title { font-size: 13px; font-weight: 600; color: #1d2129; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
.pe-prop-title::before { content: ''; width: 3px; height: 14px; border-radius: 2px; background: #165dff; }
.pe-prop-body :deep(.el-form-item) { margin-bottom: 12px; }
.pe-prop-empty { color: #86909c; font-size: 12px; padding: 40px 0; text-align: center; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.pe-prop-empty :deep(svg), .pe-prop-empty :deep(img) { opacity: .4; }

/* 素材选择 */
.pe-sel { max-height: 360px; overflow-y: auto; }
.sel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 10px; }
.sel-item { position: relative; border: 1px solid #e5e6eb; border-radius: 6px; overflow: hidden; cursor: pointer; aspect-ratio: 1; }
.sel-item img { width: 100%; height: 100%; object-fit: cover; }
.sel-item.picked { border-color: #165dff; box-shadow: 0 0 0 2px rgba(22,93,255,.15); }
.sel-check { position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; background: #165dff; color: #fff; border-radius: 50%; font-size: 12px; display: flex; align-items: center; justify-content: center; }
</style>
