<template>
  <div class="design-home">
    <!-- 应用内 Tab：页面装修 / 系统风格 / 底部导航 / 素材中心 / 系统模板 / 首页跳转 -->
    <div class="card-tabs">
      <div v-for="t in tabs" :key="t.key" class="ctab" :class="{ active: activeTab === t.key }" @click="activeTab = t.key">
        <SIcon :name="t.icon" size="default" :color="activeTab === t.key ? '#165dff' : '#4e5969'" />
        <span>{{ t.label }}</span>
      </div>
    </div>

    <!-- ============ 素材中心 ============ -->
    <section v-if="activeTab === 'media'">
      <AppPageHeader title="素材中心" desc="租户独立素材库：上传、分类、引用追踪（被页面/导航/风格引用的素材不可删除）">
        <div class="hd-actions">
          <el-button type="primary" @click="uploadPick">上传素材</el-button>
          <el-button @click="openNewCategory">新建分类</el-button>
          <el-button v-if="batchMode" :disabled="!batchIds.length" @click="openBatchMove">批量移动</el-button>
          <el-button v-if="batchMode" type="danger" plain :disabled="!batchIds.length" @click="batchDelete">批量删除</el-button>
          <el-button @click="batchMode = !batchMode">{{ batchMode ? '退出批量' : '批量操作' }}</el-button>
        </div>
        <input ref="fileInput" type="file" accept="image/*" multiple class="hide" @change="onFileChange" />
      </AppPageHeader>

      <div class="media-layout">
        <div class="media-side">
          <div class="media-cat" :class="{ active: catFilter === '' }" @click="catFilter = ''">
            全部素材 <span class="cat-n">{{ totalAll }}</span>
          </div>
          <div class="media-cat" :class="{ active: catFilter === 'uncat' }" @click="catFilter = 'uncat'">
            未分类 <span class="cat-n">{{ uncatCount }}</span>
          </div>
          <template v-for="c in categories" :key="c.id">
            <div class="media-cat" :class="{ active: catFilter === String(c.id) }" @click="catFilter = String(c.id)">
              <span class="cat-name">{{ c.category_name }}</span>
              <span class="cat-ops">
                <el-icon @click.stop="renameCat(c)"><EditPen /></el-icon>
                <el-icon @click.stop="delCat(c)"><Delete /></el-icon>
              </span>
            </div>
          </template>
        </div>
        <div class="media-main">
          <div class="media-toolbar">
            <el-input v-model="keyword" placeholder="搜索素材名称" clearable class="w220" @keyup.enter="loadMaterials" @clear="loadMaterials" />
            <span class="media-count">共 {{ total }} 个素材</span>
          </div>
          <div v-loading="loading" class="media-grid">
            <div v-for="m in materials" :key="m.id" class="media-card" :class="{ selected: batchIds.includes(m.id) }" @click="toggleBatch(m)">
              <div class="media-thumb">
                <img :src="resolveUrl(m.file_url)" :alt="m.file_name" loading="lazy" @click.stop="preview(m)" />
                <span v-if="m.ref_count > 0" class="ref-tag">被引用 {{ m.ref_count }}</span>
                <span v-else class="free-tag">闲置</span>
              </div>
              <div class="media-info">
                <div class="media-name" :title="m.file_name">{{ m.file_name }}</div>
                <div class="media-meta">{{ m.category_name || '未分类' }} · {{ fmtSize(m.file_size) }}</div>
              </div>
              <div v-if="!batchMode" class="media-ops" @click.stop>
                <el-button size="small" text type="primary" @click="preview(m)">预览</el-button>
                <el-button size="small" text @click="openMove(m)">移动</el-button>
                <el-button size="small" text @click="copyLink(m)">复制链接</el-button>
                <el-tooltip :disabled="m.ref_count === 0" content="被页面/导航/风格引用，无法删除">
                  <span>
                    <el-button size="small" text type="danger" :disabled="m.ref_count > 0" @click="delMaterial(m)">删除</el-button>
                  </span>
                </el-tooltip>
              </div>
            </div>
            <div v-if="!materials.length && !loading" class="media-empty">暂无素材，点击「上传素材」添加</div>
          </div>
          <el-pagination v-if="total > pageSize" background layout="prev, pager, next" :total="total" :page-size="pageSize" :current-page="page" class="mt16" @current-change="(p) => { page = p; loadMaterials(); }" />
        </div>
      </div>

      <!-- 素材预览 -->
      <el-dialog v-model="previewShow" title="素材预览" width="480px" append-to-body>
        <img :src="previewUrl" class="preview-img" />
        <div class="preview-path">{{ previewUrl }}</div>
        <template #footer>
          <el-button @click="copyLink({ file_url: previewUrl })">复制链接</el-button>
          <el-button type="primary" @click="previewShow = false">关闭</el-button>
        </template>
      </el-dialog>

      <!-- 新建/重命名分类 -->
      <el-dialog v-model="catDialog.show" :title="catDialog.id ? '重命名分类' : '新建分类'" width="420px" append-to-body>
        <el-input v-model="catDialog.name" placeholder="分类名称" maxlength="20" @keyup.enter="saveCat" />
        <template #footer>
          <el-button @click="catDialog.show = false">取消</el-button>
          <el-button type="primary" :loading="catSaving" @click="saveCat">保存</el-button>
        </template>
      </el-dialog>

      <!-- 移动分类 -->
      <el-dialog v-model="moveShow" title="移动素材" width="420px" append-to-body>
        <el-select v-model="moveTarget" placeholder="选择目标分类" style="width: 100%">
          <el-option label="未分类" :value="null" />
          <el-option v-for="c in categories" :key="c.id" :label="c.category_name" :value="c.id" />
        </el-select>
        <template #footer>
          <el-button @click="moveShow = false">取消</el-button>
          <el-button type="primary" :loading="moving" @click="doMove">移动</el-button>
        </template>
      </el-dialog>
    </section>

    <!-- ============ 系统风格 ============ -->
    <section v-if="activeTab === 'style'">
      <AppPageHeader title="系统风格" desc="全局主题色、圆角、按钮样式、页面背景；保存后作用于当前租户全部名片页面">
        <div class="hd-actions"><el-button type="primary" :loading="styleSaving" @click="saveStyle">保存风格</el-button></div>
      </AppPageHeader>
      <div class="card form-card">
        <el-form label-width="140px">
          <el-form-item label="主色调">
            <el-color-picker v-model="style.primaryColor" />
            <span class="form-hint">主题色，按钮/选中态/链接</span>
          </el-form-item>
          <el-form-item label="辅助色">
            <el-color-picker v-model="style.secondaryColor" />
          </el-form-item>
          <el-form-item label="正文文字颜色">
            <el-color-picker v-model="style.textColor" />
          </el-form-item>
          <el-form-item label="次要文字颜色">
            <el-color-picker v-model="style.subTextColor" />
          </el-form-item>
          <el-form-item label="全局圆角(px)">
            <el-slider v-model="style.radius" :min="0" :max="24" show-input />
          </el-form-item>
          <el-form-item label="按钮样式">
            <el-radio-group v-model="style.buttonStyle">
              <el-radio value="filled">填充</el-radio>
              <el-radio value="outline">描边</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="页面背景色">
            <el-color-picker v-model="style.bgColor" />
          </el-form-item>
          <el-form-item label="页面背景图">
            <div class="bg-picker">
              <div v-if="style.bgImage" class="bg-preview">
                <img :src="resolveUrl(style.bgImage)" />
                <el-icon class="bg-del" @click="style.bgImage = ''"><Close /></el-icon>
              </div>
              <el-button @click="openImageSelect('bg')">选择背景图</el-button>
            </div>
            <span class="form-hint">选择后优先于背景色</span>
          </el-form-item>
        </el-form>
      </div>
    </section>

    <!-- ============ 底部导航 ============ -->
    <section v-if="activeTab === 'tabs'">
      <AppPageHeader title="底部导航" desc="多套导航方案管理；小程序读取「默认方案」渲染 Tab（默认方案不可删除）">
        <div class="hd-actions"><el-button type="primary" @click="openTabScheme()">新建导航方案</el-button></div>
      </AppPageHeader>
      <div class="card">
        <el-table :data="tabSchemes" v-loading="tabLoading" stripe>
          <el-table-column label="方案名称" prop="scheme_name" min-width="160" />
          <el-table-column label="Tab 项数" width="100">
            <template #default="{ row }">{{ tabCount(row) }}</template>
          </el-table-column>
          <el-table-column label="默认方案" width="110">
            <template #default="{ row }">
              <el-tag v-if="row.is_default" type="success" size="small">默认</el-tag>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="更新时间" width="150">
            <template #default="{ row }">{{ (row.updated_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="280">
            <template #default="{ row }">
              <el-button v-if="!row.is_default" size="small" text type="primary" @click="setDefault(row)">设为默认</el-button>
              <el-button size="small" text @click="openTabScheme(row)">编辑</el-button>
              <el-button size="small" text @click="copyTabScheme(row)">复制</el-button>
              <el-button size="small" text @click="toggleTabScheme(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
              <el-button size="small" text type="danger" :disabled="row.is_default" @click="delTabScheme(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 编辑导航方案 -->
      <el-dialog v-model="schemeShow" :title="schemeForm.id ? '编辑导航方案' : '新建导航方案'" width="680px" append-to-body>
        <el-form label-width="100px">
          <el-form-item label="方案名称">
            <el-input v-model="schemeForm.scheme_name" maxlength="20" style="width: 260px" />
          </el-form-item>
        </el-form>
        <div class="tab-items">
          <div v-for="(it, i) in schemeForm.items" :key="i" class="tab-item-row">
            <el-input v-model="it.text" placeholder="文字" class="w100" />
            <div class="tab-icon">
              <img v-if="it.icon" :src="resolveUrl(it.icon)" class="tab-icon-img" @click="openImageSelect('tab', i)" />
              <span v-else class="tab-icon-empty" @click="openImageSelect('tab', i)">选图标</span>
            </div>
            <el-input v-model="it.url" placeholder="跳转页面地址，如 /pages/card/market" class="flex-1" />
            <el-button text type="danger" @click="schemeForm.items.splice(i, 1)">删除</el-button>
          </div>
          <el-button size="small" @click="schemeForm.items.push({ text: '', icon: '', url: '' })">+ 添加导航项</el-button>
        </div>
        <template #footer>
          <el-button @click="schemeShow = false">取消</el-button>
          <el-button type="primary" :loading="schemeSaving" @click="saveTabScheme">保存方案</el-button>
        </template>
      </el-dialog>
    </section>

    <!-- ============ 首页跳转 ============ -->
    <section v-if="activeTab === 'home'">
      <AppPageHeader title="首页跳转" desc="设置小程序启动后的默认页面">
        <div class="hd-actions"><el-button type="primary" :loading="homeSaving" @click="saveHome">保存配置</el-button></div>
      </AppPageHeader>
      <div class="card form-card">
        <el-form label-width="140px">
          <el-form-item label="默认首页">
            <el-select v-model="homePage" style="width: 320px">
              <el-option v-for="p in homePages" :key="p.value" :label="p.label" :value="p.value" />
            </el-select>
            <span class="form-hint">选择小程序启动后第一个展示的页面</span>
          </el-form-item>
        </el-form>
      </div>
    </section>

    <!-- ============ 系统模板 ============ -->
    <section v-if="activeTab === 'template'">
      <AppPageHeader title="系统模板" desc="平台公共模板市场 + 租户私有模板；应用模板将覆盖当前风格、导航、首页与页面配置">
        <div class="hd-actions">
          <el-button @click="importTemplate">导入模板 JSON</el-button>
          <el-button type="primary" @click="saveAsTemplate">存为模板</el-button>
        </div>
        <input ref="importInput" type="file" accept="application/json,.json" class="hide" @change="onImport" />
      </AppPageHeader>
      <div class="card">
        <el-radio-group v-model="tplScope" class="mb16">
          <el-radio-button value="public">模板市场</el-radio-button>
          <el-radio-button value="mine">我的模板</el-radio-button>
        </el-radio-group>
        <div v-loading="tplLoading" class="tpl-grid">
          <div v-for="t in templates" :key="t.id" class="tpl-card">
            <div class="tpl-cover">
              <img v-if="t.cover_url" :src="resolveUrl(t.cover_url)" />
              <div v-else class="tpl-cover-empty">{{ t.template_name[0] }}</div>
              <el-tag v-if="t.is_public" size="small" class="tpl-public">平台模板</el-tag>
            </div>
            <div class="tpl-name">{{ t.template_name }}</div>
            <div class="tpl-ops">
              <el-button size="small" type="primary" @click="applyTemplate(t)">应用模板</el-button>
              <el-button size="small" @click="exportTemplate(t)">导出</el-button>
              <el-button v-if="!t.is_public" size="small" text type="danger" @click="delTemplate(t)">删除</el-button>
            </div>
          </div>
          <div v-if="!templates.length && !tplLoading" class="media-empty">暂无模板</div>
        </div>
      </div>
    </section>

    <!-- ============ 页面装修 ============ -->
    <section v-if="activeTab === 'page'">
      <AppPageHeader title="页面装修" desc="可视化拖拽编辑器：从左侧组件库添加标题/文本/图片/按钮等，支持草稿保存、发布与版本回滚">
        <div class="hd-actions">
          <el-radio-group v-model="pageType" size="small">
            <el-radio-button value="home">首页</el-radio-button>
            <el-radio-button value="card">名片详情页</el-radio-button>
            <el-radio-button value="dynamic">个人动态页</el-radio-button>
            <el-radio-button value="mine">个人中心</el-radio-button>
          </el-radio-group>
        </div>
      </AppPageHeader>
      <PageEditor :page-type="pageType" />
    </section>

    <!-- 素材选择弹窗（全局复用：背景图/导航图标等） -->
    <el-dialog v-model="imgSel.show" :title="imgSel.title" width="760px" append-to-body class="img-sel-dialog">
      <div class="img-sel">
        <div class="img-sel-side">
          <div class="media-cat" :class="{ active: imgSel.cat === '' }" @click="imgSel.cat = ''; loadSelMats()">全部素材</div>
          <div v-for="c in categories" :key="c.id" class="media-cat" :class="{ active: imgSel.cat === String(c.id) }" @click="imgSel.cat = String(c.id); loadSelMats()">{{ c.category_name }}</div>
          <el-button size="small" type="primary" class="mt16 w100p" @click="uploadPick()">上传素材</el-button>
        </div>
        <div class="img-sel-main">
          <div v-loading="selLoading" class="sel-grid">
            <div v-for="m in selMats" :key="m.id" class="sel-item" :class="{ picked: imgSel.pick === m.id }" @click="imgSel.pick = m.id">
              <img :src="resolveUrl(m.file_url)" :alt="m.file_name" />
              <span v-if="imgSel.pick === m.id" class="sel-check">✓</span>
            </div>
            <div v-if="!selMats.length && !selLoading" class="media-empty">暂无素材</div>
          </div>
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
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { EditPen, Delete, Close } from '@element-plus/icons-vue';
import SIcon from '../../../../components/SIcon.vue';
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import PageEditor from './PageEditor.vue';
import { designCall } from '../../../../api';

const tabs = [
  { key: 'page', label: '页面装修', icon: 'dynamic' },
  { key: 'style', label: '系统风格', icon: 'palette' },
  { key: 'tabs', label: '底部导航', icon: 'apps' },
  { key: 'media', label: '素材中心', icon: 'storage' },
  { key: 'template', label: '系统模板', icon: 'template' },
  { key: 'home', label: '首页跳转', icon: 'dashboard' },
];
const activeTab = ref('page');

const API = '/design';
const MAT = '/material';
const pageType = ref('home');
function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function fmtSize(b) {
  const n = Number(b) || 0;
  if (n < 1024) return n + 'B';
  if (n < 1048576) return (n / 1024).toFixed(1) + 'KB';
  return (n / 1048576).toFixed(1) + 'MB';
}

// ============ 素材中心 ============
const categories = ref([]);
const materials = ref([]);
const total = ref(0);
const totalAll = ref(0);
const uncatCount = ref(0);
const page = ref(1);
const pageSize = 20;
const catFilter = ref('');
const keyword = ref('');
const loading = ref(false);
const batchMode = ref(false);
const batchIds = ref([]);
const fileInput = ref(null);
const previewShow = ref(false);
const previewUrl = ref('');
const catDialog = reactive({ show: false, id: null, name: '' });
const catSaving = ref(false);
const moveShow = ref(false);
const moveTarget = ref(null);
const moveIds = ref([]);
const moving = ref(false);

async function loadCategories() {
  try {
    const res = await designCall.get(`${MAT}/category/list`);
    categories.value = res.list || [];
  } catch (e) { ElMessage.error(e); }
}
async function loadMaterials() {
  loading.value = true;
  try {
    const res = await designCall.get(`${MAT}/list`, { params: { categoryId: catFilter.value === 'uncat' ? 0 : catFilter.value || undefined, keyword: keyword.value || undefined, page: page.value, pageSize } });
    materials.value = res.list || [];
    total.value = res.total || 0;
    const all = await designCall.get(`${MAT}/list`, { params: { page: 1, pageSize: 1 } });
    totalAll.value = all.total || 0;
    const uncat = await designCall.get(`${MAT}/list`, { params: { categoryId: 0, page: 1, pageSize: 1 } });
    uncatCount.value = uncat.total || 0;
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}
function uploadPick() { fileInput.value?.click(); }
async function onFileChange(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (!files.length) return;
  for (const f of files) {
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('categoryId', catFilter.value && catFilter.value !== 'uncat' ? catFilter.value : '');
      await designCall.post(`${MAT}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    } catch (err) { ElMessage.error(`${f.name} 上传失败：${err}`); }
  }
  ElMessage.success(`已上传 ${files.length} 个素材`);
  loadMaterials();
}
function toggleBatch(m) {
  if (!batchMode.value) return;
  const i = batchIds.value.indexOf(m.id);
  if (i >= 0) batchIds.value.splice(i, 1); else batchIds.value.push(m.id);
}
function preview(m) { previewUrl.value = resolveUrl(m.file_url); previewShow.value = true; }
async function copyLink(m) {
  try { await navigator.clipboard.writeText(resolveUrl(m.file_url)); ElMessage.success('链接已复制'); }
  catch { ElMessage.warning('复制失败，请手动复制地址'); }
}
async function delMaterial(m) {
  if (m.ref_count > 0) { ElMessage.warning('该素材正被页面/导航/风格引用，无法删除'); return; }
  try { await ElMessageBox.confirm(`确认删除素材「${m.file_name}」？`, '删除确认', { type: 'warning' }); } catch { return; }
  try { await designCall.post(`${MAT}/delete`, { id: m.id }); ElMessage.success('已删除'); loadMaterials(); } catch (e) { ElMessage.error(e); }
}
function openNewCategory() { Object.assign(catDialog, { show: true, id: null, name: '' }); }
function renameCat(c) { Object.assign(catDialog, { show: true, id: c.id, name: c.category_name }); }
async function saveCat() {
  if (!catDialog.name.trim()) { ElMessage.warning('请输入分类名称'); return; }
  catSaving.value = true;
  try {
    await designCall.post(`${MAT}/category/save`, { id: catDialog.id || undefined, name: catDialog.name });
    catDialog.show = false; ElMessage.success('已保存'); loadCategories();
  } catch (e) { ElMessage.error(e); } finally { catSaving.value = false; }
}
async function delCat(c) {
  try { await ElMessageBox.confirm(`确认删除分类「${c.category_name}」？`, '删除确认', { type: 'warning' }); } catch { return; }
  try { await designCall.post(`${MAT}/category/delete`, { id: c.id }); ElMessage.success('已删除'); loadCategories(); loadMaterials(); } catch (e) { ElMessage.error(e); }
}
function openMove(m) { moveIds.value = [m.id]; moveTarget.value = m.category_id; moveShow.value = true; }
function openBatchMove() { moveIds.value = [...batchIds.value]; moveTarget.value = null; moveShow.value = true; }
async function doMove() {
  moving.value = true;
  try {
    await designCall.post(`${MAT}/move`, { ids: moveIds.value, categoryId: moveTarget.value });
    ElMessage.success('已移动'); moveShow.value = false; batchIds.value = []; loadMaterials();
  } catch (e) { ElMessage.error(e); } finally { moving.value = false; }
}
async function batchDelete() {
  try { await ElMessageBox.confirm(`确认删除选中的 ${batchIds.value.length} 个素材？被引用的素材将跳过`, '批量删除', { type: 'warning' }); } catch { return; }
  let ok = 0, skip = 0;
  for (const id of batchIds.value) {
    try { await designCall.post(`${MAT}/delete`, { id }); ok++; } catch { skip++; }
  }
  ElMessage.success(`删除 ${ok} 个${skip ? `，跳过 ${skip} 个被引用素材` : ''}`);
  batchIds.value = []; loadMaterials();
}

// ============ 系统风格 ============
const style = reactive({ primaryColor: '#165DFF', secondaryColor: '#00B42A', textColor: '#1D2129', subTextColor: '#86909C', radius: 8, buttonStyle: 'filled', bgColor: '#F7F8FA', bgImage: '' });
const styleSaving = ref(false);
async function loadStyle() {
  try {
    const res = await designCall.get(`${API}/style/get`);
    Object.assign(style, res.style || {});
  } catch (e) { /* 风格加载失败不阻塞 */ }
}
async function saveStyle() {
  styleSaving.value = true;
  try {
    await designCall.post(`${API}/style/save`, { style: { ...style } });
    ElMessage.success('风格已保存，小程序端将按最新配置渲染');
  } catch (e) { ElMessage.error(e); } finally { styleSaving.value = false; }
}

// ============ 底部导航 ============
const tabSchemes = ref([]);
const tabLoading = ref(false);
const schemeShow = ref(false);
const schemeSaving = ref(false);
const schemeForm = reactive({ id: null, scheme_name: '', items: [] });
async function loadTabSchemes() {
  tabLoading.value = true;
  try {
    const res = await designCall.get(`${API}/tab/list`);
    tabSchemes.value = res.list || [];
  } catch (e) { ElMessage.error(e); } finally { tabLoading.value = false; }
}
function tabCount(row) {
  try { return JSON.parse(row.tab_json || '[]').length; } catch { return 0; }
}
function openTabScheme(row) {
  if (row) {
    let items = [];
    try { items = JSON.parse(row.tab_json || '[]'); } catch { items = []; }
    Object.assign(schemeForm, { id: row.id, scheme_name: row.scheme_name, items });
  } else {
    Object.assign(schemeForm, { id: null, scheme_name: '', items: [{ text: '首页', icon: '', url: '/pages/card/myCard' }, { text: '集市', icon: '', url: '/pages/card/market' }] });
  }
  schemeShow.value = true;
}
async function saveTabScheme() {
  if (!schemeForm.scheme_name.trim()) { ElMessage.warning('请输入方案名称'); return; }
  schemeSaving.value = true;
  try {
    await designCall.post(`${API}/tab/save`, { id: schemeForm.id || undefined, name: schemeForm.scheme_name, tabJson: schemeForm.items });
    schemeShow.value = false; ElMessage.success('已保存'); loadTabSchemes();
  } catch (e) { ElMessage.error(e); } finally { schemeSaving.value = false; }
}
async function setDefault(row) {
  try { await designCall.post(`${API}/tab/setDefault`, { id: row.id }); ElMessage.success('已设为默认导航'); loadTabSchemes(); } catch (e) { ElMessage.error(e); }
}
async function copyTabScheme(row) {
  try { await designCall.post(`${API}/tab/copy`, { id: row.id }); ElMessage.success('已复制'); loadTabSchemes(); } catch (e) { ElMessage.error(e); }
}
async function toggleTabScheme(row) {
  try { await designCall.post(`${API}/tab/save`, { id: row.id, enabled: row.enabled ? 0 : 1 }); loadTabSchemes(); } catch (e) { ElMessage.error(e); }
}
async function delTabScheme(row) {
  try { await ElMessageBox.confirm(`确认删除导航方案「${row.scheme_name}」？`, '删除确认', { type: 'warning' }); } catch { return; }
  try { await designCall.post(`${API}/tab/delete`, { id: row.id }); ElMessage.success('已删除'); loadTabSchemes(); } catch (e) { ElMessage.error(e); }
}

// ============ 首页跳转 ============
const homePage = ref('card');
const homeSaving = ref(false);
const homePages = [
  { value: 'card', label: '名片（默认）' },
  { value: 'market', label: '人脉集市' },
  { value: 'radar', label: '访客雷达' },
  { value: 'member', label: '会员中心' },
  { value: 'distribution', label: '分销中心' },
];
async function loadHome() {
  try { const res = await designCall.get(`${API}/home/get`); homePage.value = res.homePage || 'card'; } catch (e) { /* 忽略 */ }
}
async function saveHome() {
  homeSaving.value = true;
  try { await designCall.post(`${API}/home/save`, { homePage: homePage.value }); ElMessage.success('已保存'); } catch (e) { ElMessage.error(e); } finally { homeSaving.value = false; }
}

// ============ 系统模板 ============
const tplScope = ref('public');
const templates = ref([]);
const tplLoading = ref(false);
const importInput = ref(null);
async function loadTemplates() {
  tplLoading.value = true;
  try {
    const res = await designCall.get(`${API}/template/${tplScope.value === 'public' ? 'publicList' : 'myList'}`);
    templates.value = res.list || [];
  } catch (e) { ElMessage.error(e); } finally { tplLoading.value = false; }
}
function buildTemplateJson() {
  return {
    style: { ...style },
    homePage: homePage.value,
    tabs: tabSchemes.value.filter((t) => t.is_default).map((t) => ({ name: t.scheme_name, items: (() => { try { return JSON.parse(t.tab_json); } catch { return []; } })() })),
    pages: {},
    materialIds: [],
  };
}
async function saveAsTemplate() {
  try {
    const { value } = await ElMessageBox.prompt('请输入模板名称', '存为模板', { inputValue: `我的模板 ${new Date().toISOString().slice(0, 10)}`, inputPattern: /\S+/, inputErrorMessage: '模板名称不能为空' });
    await designCall.post(`${API}/template/saveMy`, { name: value, templateJson: buildTemplateJson() });
    ElMessage.success('模板已保存到「我的模板」');
  } catch (e) { if (e !== 'cancel') ElMessage.error(e); }
}
async function exportTemplate(t) {
  try {
    const detail = await designCall.post(`${API}/template/export`, { id: t.id });
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${detail.template_name || t.template_name}.json`; a.click();
    URL.revokeObjectURL(url);
  } catch (e) { ElMessage.error(e); }
}
function importTemplate() { importInput.value?.click(); }
async function onImport(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    const text = await f.text();
    const json = JSON.parse(text);
    const { value } = await ElMessageBox.prompt('请输入模板名称', '导入模板', { inputValue: json.template_name || f.name.replace(/\.json$/, ''), inputPattern: /\S+/, inputErrorMessage: '模板名称不能为空' });
    const payload = { name: value, templateJson: { style: json.style, homePage: json.homePage, tabs: json.tabs, pages: json.pages } };
    await designCall.post(`${API}/template/import`, payload);
    ElMessage.success('模板导入成功');
  } catch (err) { ElMessage.error('导入失败：' + (err || 'JSON 格式不正确')); }
}
async function applyTemplate(t) {
  try { await ElMessageBox.confirm(`应用模板「${t.template_name}」将覆盖当前风格、导航、首页与页面配置，确认继续？`, '应用模板', { type: 'warning' }); } catch { return; }
  try {
    await designCall.post(`${API}/template/apply`, { id: t.id });
    ElMessage.success('模板已应用');
    loadStyle(); loadHome(); loadTabSchemes();
  } catch (e) { ElMessage.error(e); }
}
async function delTemplate(t) {
  try { await ElMessageBox.confirm(`确认删除模板「${t.template_name}」？`, '删除确认', { type: 'warning' }); } catch { return; }
  try { await designCall.post(`${API}/template/delete`, { id: t.id }); ElMessage.success('已删除'); loadTemplates(); } catch (e) { ElMessage.error(e); }
}

// ============ 页面装修（PageEditor 组件承载，页面类型切换） ============
// pageType 已在脚本顶部声明（页面类型 radio 绑定）

// ============ 素材选择弹窗 ============
const imgSel = reactive({ show: false, title: '选择素材', cat: '', pick: null, target: null, targetIdx: null });
const selMats = ref([]);
const selLoading = ref(false);
function openImageSelect(target, idx) {
  Object.assign(imgSel, { show: true, cat: '', pick: null, target, targetIdx: idx ?? null });
  loadSelMats();
}
async function loadSelMats() {
  selLoading.value = true;
  try {
    const res = await designCall.get(`${API}/materials`, { params: { categoryId: imgSel.cat || undefined, page: 1, pageSize: 50 } });
    selMats.value = res.list || [];
  } catch (e) { ElMessage.error(e); } finally { selLoading.value = false; }
}
function confirmImgSel() {
  const m = selMats.value.find((x) => x.id === imgSel.pick);
  if (!m) return;
  if (imgSel.target === 'bg') style.bgImage = m.file_url;
  if (imgSel.target === 'tab' && imgSel.targetIdx !== null) schemeForm.items[imgSel.targetIdx].icon = m.file_url;
  imgSel.show = false;
}

onMounted(() => {
  loadCategories(); loadMaterials();
  loadStyle(); loadTabSchemes(); loadHome(); loadTemplates();
});
</script>

<style scoped>
.design-home { display: flex; flex-direction: column; gap: 16px; }
.hide { display: none; }
.w100p { width: 100%; }
.mb16 { margin-bottom: 16px; }
.mt16 { margin-top: 16px; }
.w100 { width: 100px; }
.w220 { width: 220px; }
.flex-1 { flex: 1; }
.text-muted { color: #86909c; font-size: 12px; }
.hd-actions { display: flex; gap: 12px; align-items: center; }
.form-card { max-width: 720px; }
.form-hint { font-size: 12px; color: #86909c; margin-left: 12px; }
.bg-picker { display: flex; align-items: center; gap: 12px; }
.bg-preview { position: relative; width: 120px; height: 68px; border-radius: 8px; overflow: hidden; border: 1px solid #e5e6eb; }
.bg-preview img { width: 100%; height: 100%; object-fit: cover; }
.bg-del { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,.5); color: #fff; border-radius: 50%; padding: 2px; cursor: pointer; }

.media-layout { display: grid; grid-template-columns: 200px 1fr; gap: 16px; align-items: start; }
.media-side { background: #fff; border-radius: 8px; padding: 12px; }
.media-cat { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 8px; cursor: pointer; color: #4e5969; font-size: 13px; margin-bottom: 4px; }
.media-cat:hover { background: #f2f3f5; }
.media-cat.active { background: #e8f3ff; color: #165dff; font-weight: 500; }
.cat-n { font-size: 12px; color: #86909c; }
.cat-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-ops { display: none; gap: 4px; color: #86909c; }
.media-cat:hover .cat-ops { display: inline-flex; }
.media-main { background: #fff; border-radius: 8px; padding: 16px; }
.media-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.media-count { font-size: 12px; color: #86909c; }
.media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; min-height: 120px; }
.media-card { border: 1px solid #e5e6eb; border-radius: 8px; overflow: hidden; cursor: default; position: relative; transition: border-color .2s; }
.media-card.selected { border-color: #165dff; box-shadow: 0 0 0 2px rgba(22,93,255,.15); }
.media-thumb { position: relative; height: 110px; background: #f7f8fa; }
.media-thumb img { width: 100%; height: 100%; object-fit: contain; cursor: zoom-in; }
.ref-tag, .free-tag { position: absolute; top: 6px; left: 6px; font-size: 11px; padding: 1px 8px; border-radius: 10px; color: #fff; }
.ref-tag { background: rgba(245,63,63,.85); }
.free-tag { background: rgba(134,144,156,.75); }
.media-info { padding: 8px 10px; }
.media-name { font-size: 12px; color: #1d2129; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.media-meta { font-size: 11px; color: #86909c; margin-top: 2px; }
.media-ops { display: none; padding: 6px 8px; border-top: 1px solid #f2f3f5; gap: 2px; flex-wrap: wrap; }
.media-card:hover .media-ops { display: flex; }
.media-empty { grid-column: 1 / -1; text-align: center; color: #86909c; padding: 40px 0; font-size: 13px; }
.preview-img { width: 100%; max-height: 420px; object-fit: contain; background: #f7f8fa; border-radius: 8px; }
.preview-path { font-size: 12px; color: #86909c; word-break: break-all; margin-top: 8px; }

.tab-items { display: flex; flex-direction: column; gap: 10px; margin-bottom: 8px; }
.tab-item-row { display: flex; gap: 10px; align-items: center; }
.tab-icon-img { width: 32px; height: 32px; object-fit: contain; border: 1px dashed #c9cdd4; border-radius: 6px; cursor: pointer; }
.tab-icon-empty { width: 32px; height: 32px; border: 1px dashed #c9cdd4; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; color: #86909c; cursor: pointer; }

.tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.tpl-card { border: 1px solid #e5e6eb; border-radius: 8px; overflow: hidden; }
.tpl-cover { position: relative; height: 120px; background: #f7f8fa; }
.tpl-cover img { width: 100%; height: 100%; object-fit: cover; }
.tpl-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 36px; color: #c9cdd4; background: linear-gradient(135deg, #e8f3ff, #f7f8fa); }
.tpl-public { position: absolute; top: 8px; right: 8px; }
.tpl-name { padding: 10px 12px 4px; font-size: 13px; color: #1d2129; font-weight: 500; }
.tpl-ops { padding: 8px 12px 12px; display: flex; gap: 8px; }

.img-sel { display: grid; grid-template-columns: 160px 1fr; gap: 16px; min-height: 360px; }
.img-sel-side { border-right: 1px solid #f2f3f5; padding-right: 12px; }
.img-sel-main { overflow-y: auto; max-height: 400px; }
.sel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 10px; }
.sel-item { position: relative; border: 1px solid #e5e6eb; border-radius: 6px; overflow: hidden; cursor: pointer; aspect-ratio: 1; }
.sel-item img { width: 100%; height: 100%; object-fit: cover; }
.sel-item.picked { border-color: #165dff; box-shadow: 0 0 0 2px rgba(22,93,255,.15); }
.sel-check { position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; background: #165dff; color: #fff; border-radius: 50%; font-size: 12px; display: flex; align-items: center; justify-content: center; }
</style>
