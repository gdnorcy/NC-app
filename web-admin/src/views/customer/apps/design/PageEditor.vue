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
      <!-- 组件库：分组折叠 + 模糊搜索 + 3列网格卡片（图标上/名称下，仿 eweishop） -->
      <div class="pe-lib">
        <div class="pe-lib-head">
          <div class="pe-lib-title">组件库</div>
          <div class="pe-lib-search">
            <el-input v-model="kw" size="small" placeholder="搜索组件" clearable>
              <template #prefix><span class="pe-search-ico">⌕</span></template>
            </el-input>
          </div>
        </div>
        <div v-for="g in visibleGroups" :key="g.key" class="pe-group">
          <div class="pe-group-head" @click="toggleGroup(g.key)">
            <span class="pe-group-caret" :class="{ open: expanded[g.key] !== false }">▸</span>
            <span class="pe-group-name">{{ g.name }}</span>
            <span class="pe-group-n">({{ filteredCount(g.key) }})</span>
          </div>
          <div v-show="expanded[g.key] !== false" class="pe-group-body">
            <div class="pe-lib-grid">
              <div
                v-for="c in filteredComps(g.key)" :key="c.type"
                class="pe-lib-card" draggable="true"
                @dragstart="onLibDragStart($event, c.type)"
                @click="addComponent(c.type)"
              >
                <span v-if="c.pro" class="pe-lib-tag">高级</span>
                <span class="pe-lib-ico"><img :src="COMP_ICONS[c.icon]" :alt="c.name" /></span>
                <span class="pe-lib-name">{{ c.name }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-if="!visibleGroups.length" class="pe-lib-tip">未找到匹配组件</div>
        <div v-else class="pe-lib-tip">点击或拖拽到画布</div>
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
                <span class="pe-tool" title="上移" @click.stop="moveComp(i, -1)">↑</span>
                <span class="pe-tool" title="下移" @click.stop="moveComp(i, 1)">↓</span>
                <span class="pe-tool" title="复制" @click.stop="dupComp(comp)">⧉</span>
                <span class="pe-tool pe-tool-del" title="删除" @click.stop="removeComp(comp.id)">✕</span>
              </div>
              <ComponentRender :comp="comp" />
            </div>
            <div v-if="!components.length" class="pe-empty">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#86909C" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>
              <span>从左侧拖拽组件到此处，或点击组件库添加</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 属性面板：schema 驱动自动渲染 -->
      <div class="pe-prop">
        <div class="pe-prop-title">{{ selectedComp ? selectedComp.name : '属性' }}</div>
        <div v-if="selectedComp && selectedSchema.length" class="pe-prop-body">
          <el-form label-width="70px" size="small">
            <template v-for="f in selectedSchema" :key="f.key">
              <el-form-item :label="f.label">
                <el-input v-if="f.control === 'input'" v-model="selectedComp.props[f.key]" :placeholder="f.placeholder || ''" />
                <el-color-picker v-else-if="f.control === 'color'" v-model="selectedComp.props[f.key]" />
                <el-radio-group v-else-if="f.control === 'radio'" v-model="selectedComp.props[f.key]">
                  <el-radio v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
                </el-radio-group>
                <el-slider v-else-if="f.control === 'slider'" v-model="selectedComp.props[f.key]" :min="f.min" :max="f.max" show-input />
                <div v-else-if="f.control === 'image'" class="pe-img-field">
                  <el-button size="small" @click="openImgSel">选择素材</el-button>
                  <el-button v-if="selectedComp.props[f.key]" size="small" text type="danger" @click="selectedComp.props[f.key] = ''; selectedComp.props.materialId = null">清除</el-button>
                </div>
                <el-input v-else-if="f.control === 'link'" v-model="selectedComp.props[f.key]" :placeholder="f.placeholder || '如 /pages/card/market'" />
              </el-form-item>
            </template>
          </el-form>
        </div>
        <div v-else class="pe-prop-empty">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#86909C" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 9.5h8M8 13h5"/></svg>
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
import { designCall } from '../../../../api';
import { componentRegistry, componentGroups, COMP_ICONS, findComponent } from './componentRegistry';
import ComponentRender from './ComponentRender.vue';

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
const kw = ref('');
const expanded = reactive({});

let uid = 1;
const selectedComp = computed(() => {
  const c = components.value.find((c) => c.id === selected.value) || null;
  return c ? { ...c, name: findComponent(c.type)?.name || c.type } : null;
});
const selectedSchema = computed(() => (selectedComp.value ? findComponent(selectedComp.value.type)?.schema || [] : []));

// 组件库：搜索 + 分组
const visibleGroups = computed(() => {
  if (!kw.value) return componentGroups.filter((g) => groupCount(g.key) > 0);
  return componentGroups.filter((g) => filteredCount(g.key) > 0);
});
function groupCount(key) {
  return componentRegistry.filter((c) => c.group === key).length;
}
function filteredComps(key) {
  const list = componentRegistry.filter((c) => c.group === key);
  if (!kw.value) return list;
  return list.filter((c) => c.name.includes(kw.value));
}
function filteredCount(key) { return filteredComps(key).length; }
function toggleGroup(key) { expanded[key] = expanded[key] === false ? true : false; }

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function compName(t) { return findComponent(t)?.name || t; }

function newComp(type) {
  const def = findComponent(type);
  return { id: `c${Date.now()}-${uid++}`, type, props: { ...(def?.defaultProps || {}) } };
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
function moveComp(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= components.value.length) return;
  const arr = [...components.value];
  [arr[i], arr[j]] = [arr[j], arr[i]];
  components.value = arr;
}
function dupComp(comp) {
  const c = { ...newComp(comp.type), props: JSON.parse(JSON.stringify(comp.props)), id: `c${Date.now()}-${uid++}` };
  const idx = components.value.findIndex((x) => x.id === comp.id);
  components.value.splice(idx + 1, 0, c);
  selected.value = c.id;
}
function selectComp(comp) { selected.value = comp.id; }
function onLibDragStart(e, type) { e.dataTransfer.setData('text/plain', type); }
function onCanvasDragOver() {}
function onCanvasDrop(e) {
  const type = e.dataTransfer.getData('text/plain');
  if (type && findComponent(type)) addComponent(type);
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
      components.value = (src.design_json?.components || []).map((c) => {
        const def = findComponent(c.type);
        return { ...c, props: { ...(def?.defaultProps || {}), ...(c.props || {}) } };
      });
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

/* 组件库：分组 + 搜索 + 彩色图标 */
.pe-lib { background: #fff; border-radius: 8px; padding: 12px; }
.pe-lib-head { margin-bottom: 8px; }
.pe-lib-title { font-size: 13px; font-weight: 600; color: #1d2129; display: flex; align-items: center; gap: 6px; }
.pe-lib-title::before { content: ''; width: 3px; height: 14px; border-radius: 2px; background: #165dff; }
.pe-lib-search { margin-top: 8px; }
.pe-search-ico { color: #86909c; font-size: 14px; }
.pe-group { margin-bottom: 4px; }
.pe-group-head { display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 8px; border-radius: 6px; cursor: pointer; font-size: 12px; color: #4e5969; }
.pe-group-head:hover { background: #f2f3f5; }
.pe-group-caret { font-size: 10px; transition: transform .2s; color: #86909c; }
.pe-group-caret.open { transform: rotate(90deg); }
.pe-group-name { font-weight: 600; }
.pe-group-n { margin-left: auto; font-size: 11px; color: #86909c; background: #f2f3f5; border-radius: 10px; padding: 0 8px; line-height: 18px; }
.pe-group-body { padding: 2px 0; }
.pe-lib-item {
  display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 10px;
  border-radius: 8px; margin-bottom: 2px; cursor: grab;
  font-size: 13px; color: #1d2129; transition: background .2s;
}
.pe-lib-item:hover { background: #f2f3f5; }
.pe-lib-item:active { cursor: grabbing; }
.pe-lib-icon { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0; }
.pe-lib-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 组件库 3 列网格卡片（仿 eweishop：图标上、名称下） */
.pe-lib-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 2px 0; }
.pe-lib-card {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 12px 4px 10px; border-radius: 8px; cursor: grab;
  border: 1px solid transparent; transition: border-color .15s, background .15s, box-shadow .15s;
}
.pe-lib-card:hover { border-color: #165dff; background: #f7fbff; box-shadow: 0 1px 4px rgba(22,93,255,.12); }
.pe-lib-card:active { cursor: grabbing; }
.pe-lib-ico { width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; }
.pe-lib-ico img { width: 40px; height: 40px; object-fit: contain; display: block; }
.pe-lib-card .pe-lib-name { font-size: 12px; color: #1d2129; max-width: 100%; }
.pe-lib-tag { position: absolute; top: 2px; right: 2px; font-size: 10px; line-height: 1; color: #f53f3f; background: rgba(245,63,63,.08); border-radius: 4px; padding: 2px 4px; }
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
/* hover / 选中即显工具条（仿 eweishop/nshop） */
.pe-comp-tools {
  display: none; position: absolute; top: -22px; right: 4px; background: #165dff; color: #fff;
  border-radius: 6px; font-size: 11px; padding: 2px 8px; z-index: 2; align-items: center; gap: 6px;
  box-shadow: 0 2px 6px rgba(22,93,255,.3); white-space: nowrap;
}
.pe-comp:hover .pe-comp-tools, .pe-comp.active .pe-comp-tools { display: flex; }
.pe-comp-idx { background: rgba(255,255,255,.25); border-radius: 4px; padding: 0 5px; }
.pe-comp-type { color: #fff; }
.pe-tool { cursor: pointer; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; transition: background .15s; font-size: 12px; line-height: 1; }
.pe-tool:hover { background: rgba(255,255,255,.25); }
.pe-tool-del:hover { background: #f53f3f; }

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
.pe-img-field { display: flex; gap: 6px; flex-wrap: wrap; }

/* 素材选择 */
.pe-sel { max-height: 360px; overflow-y: auto; }
.sel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 10px; }
.sel-item { position: relative; border: 1px solid #e5e6eb; border-radius: 6px; overflow: hidden; cursor: pointer; aspect-ratio: 1; }
.sel-item img { width: 100%; height: 100%; object-fit: cover; }
.sel-item.picked { border-color: #165dff; box-shadow: 0 0 0 2px rgba(22,93,255,.15); }
.sel-check { position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; background: #165dff; color: #fff; border-radius: 50%; font-size: 12px; display: flex; align-items: center; justify-content: center; }
</style>
