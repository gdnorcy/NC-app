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
        <input ref="fileInput" type="file" accept="image/*,video/mp4" multiple class="hide" @change="onFileChange" />
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
                <video v-if="m.file_type === 'mp4'" :src="resolveUrl(m.file_url)" class="media-video-thumb" preload="metadata" muted @click.stop="preview(m)"></video>
                <img v-else :src="resolveUrl(m.file_url)" :alt="m.file_name" loading="lazy" @click.stop="preview(m)" />
                <span v-if="m.file_type === 'mp4'" class="video-tag">视频</span>
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
        <video v-if="previewType === 'mp4'" :src="previewUrl" controls class="preview-video" style="width:100%;max-height:420px;background:#000"></video>
        <img v-else :src="previewUrl" class="preview-img" />
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
        <div class="table-scroll">
        <el-table :data="tabSchemes" v-loading="tabLoading" stripe style="min-width: 900px">
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

    <!-- ============ 页面装修（云菜鸟 moban 风格：顶部手机真实预览 + 操作条 + 页面表格） ============ -->
    <section v-if="activeTab === 'page'">
      <AppPageHeader title="页面装修" desc="顶部为当前使用中首页的真实手机预览（可操作）；下方管理全部页面（装修/复制/推广/删除）">
        <div class="hd-actions">
          <el-button type="primary" @click="createPage">新建页面</el-button>
        </div>
      </AppPageHeader>

      <div class="page-manage pm-layout">
        <!-- 左侧：模板名 + 正常手机大小真实预览（iframe 可操作） -->
        <div class="pm-left">
          <div class="pm-tpl-head">
            <span class="pm-tpl-name">{{ homeName }}</span>
            <span class="pm-use-tag">使用中</span>
            <el-button size="small" text type="primary" @click="editHome">立即装修</el-button>
          </div>
          <div class="pm-update">最近更新：{{ homeUpdated }}</div>
          <div class="pm-phone">
            <div class="pm-status">
              <span>10:18</span>
              <span class="pm-ps-icons">
                <svg viewBox="0 0 22 12" width="19" height="12" fill="#1d2129"><circle cx="3" cy="9" r="2.6"/><circle cx="8.5" cy="7.5" r="2.2"/><circle cx="13.5" cy="5.5" r="1.8"/><circle cx="18" cy="3.5" r="1.4"/></svg>
                <svg viewBox="0 0 18 14" width="15" height="13" fill="none" stroke="#1d2129" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 6a9 9 0 0 1 13 0"/><path d="M5.2 9a5.4 5.4 0 0 1 7.6 0"/><path d="M7.8 11.6a2 2 0 0 1 2.4 0"/><circle cx="9" cy="13.2" r="1.1" fill="#1d2129" stroke="none"/></svg>
                <svg viewBox="0 0 26 13" width="23" height="12" fill="none"><rect x="0.5" y="0.5" width="21" height="12" rx="3.5" stroke="#1d2129" stroke-width="1.1"/><rect x="2.5" y="2.5" width="13" height="8" rx="1.8" fill="#1d2129"/><path d="M23.5 4.5v4a2.2 2.2 0 0 0 0-4z" fill="#1d2129"/></svg>
              </span>
            </div>
            <iframe v-if="pagePreviewUrl" :src="pagePreviewUrl" class="pm-iframe" title="首页实时预览" />
            <div v-else class="pm-canvas">
              <div v-for="comp in homePreview" :key="comp.id" class="pm-comp">
                <ComponentRender :comp="comp" />
              </div>
              <div v-if="!homePreview.length" class="pm-empty">首页暂无组件，点击「立即装修」添加内容</div>
            </div>
          </div>
        </div>

        <!-- 右侧：操作条 + 页面列表（云菜鸟 moban：左右布局） -->
        <div class="pm-right">
          <div class="pm-toolbar">
            <el-input v-model="pageSearch" placeholder="页面名称搜索" clearable class="w220" @keyup.enter="pageSearch = pageSearch" @clear="pageSearch = ''" />
            <el-button @click="pageSearch = pageSearch">搜索</el-button>
            <span class="pm-count">共 {{ filteredPages.length }} 个页面</span>
            <div class="pm-toolbar-right">
              <el-button @click="renameTemplate">重命名模板</el-button>
              <el-button @click="openPreview">预览模板</el-button>
              <el-button type="primary" @click="goEdit('home')">立即装修</el-button>
            </div>
          </div>

          <!-- 表格：页面名称 / 是否首页 / 头部展示 / 密码访问 / 会员访问 / 操作 -->
          <div class="table-scroll">
            <el-table :data="pagedPages" v-loading="pageLoading" stripe style="min-width: 820px">
            <el-table-column label="页面名称" min-width="180">
              <template #default="{ row }">
                <span class="pm-row-name">{{ row.page_name }}</span>
                <el-tag v-if="row.isHome" size="small" type="success" class="pm-home-tag">首页</el-tag>
                <el-tag v-if="row.status === 1" size="small" type="info" effect="plain">已发布</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="是否首页" width="110">
              <template #default="{ row }">
                <span class="pm-home-switch" :class="{ 'is-home': row.isHome }" @click="setHome(row)">{{ row.isHome ? '是' : '否' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="头部展示" width="120">
              <template #default="{ row }">
                {{ { custom: '自定义头部', immersive: '沉浸式头部', official: '仿官方头部' }[row.headerType] || '仿官方头部' }}
              </template>
            </el-table-column>
            <el-table-column label="密码访问" width="110">
              <template #default="{ row }">
                <el-tag :type="row.passwordEnabled ? 'warning' : 'info'" size="small" effect="plain">{{ row.passwordEnabled ? '开' : '关' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="会员访问" width="110">
              <template #default="{ row }">
                <el-tag :type="row.memberOnly ? 'warning' : 'info'" size="small" effect="plain">{{ row.memberOnly ? '开' : '关' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="250">
              <template #default="{ row }">
                <div class="pm-ops">
                  <el-button size="small" text type="primary" @click="goEdit(row.page_type)">装修</el-button>
                  <el-button size="small" text @click="copyPage(row)">复制</el-button>
                  <el-button size="small" text @click="sharePage(row)">推广</el-button>
                  <el-button size="small" text type="danger" :disabled="builtinPages.includes(row.page_type)" @click="deletePage(row)">删除</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!filteredPages.length && !pageLoading" class="media-empty">暂无页面，点击「新建页面」创建</div>
          <div v-else-if="filteredPages.length > pmPageSize" class="pm-pager">
            <el-pagination background layout="total, prev, pager, next, jumper" :total="filteredPages.length" :page-size="pmPageSize" :current-page="pageNum" @current-change="pageNum = $event" />
          </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 素材选择弹窗（统一素材选择器：本地上传/网络提取/搜索/分类/分页） -->
    <MaterialPicker v-model="imgSel.show" @confirm="confirmImgSel" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, inject } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { EditPen, Delete, Close } from '@element-plus/icons-vue';
import SIcon from '../../../../components/SIcon.vue';
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import ComponentRender from './ComponentRender.vue';
import MaterialPicker from './MaterialPicker.vue';
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

// 子 Tab 联动面包屑：面包屑随当前 Tab 变化（设计中心 / 页面装修）
const crumbExtra = inject('crumbExtra', null);
watch(activeTab, (k) => {
  const t = tabs.find((x) => x.key === k);
  crumbExtra?.set(t ? t.label : '');
}, { immediate: true });
onUnmounted(() => crumbExtra?.set(''));

const API = '/design';
const MAT = '/material';
const router = useRouter();

// 页面装修（云菜鸟 moban 风格）：顶部手机真实预览 + 操作条 + 页面表格
const pageList = ref([]);
const pageLoading = ref(false);
const pageSearch = ref('');
const homePreview = ref([]);
const homeName = ref('首页');
const homeUpdated = ref('');
const pagePreviewUrl = ref('');
const builtinPages = ['home', 'card', 'dynamic', 'mine'];
async function loadPages() {
  pageLoading.value = true;
  try {
    const res = await designCall.get(`${API}/page/list`);
    pageList.value = res.list || [];
    await loadHomePreview();
  } catch (e) { ElMessage.error(e); } finally { pageLoading.value = false; }
}
async function loadHomePreview() {
  try {
    const home = pageList.value.find((p) => p.isHome) || pageList.value.find((p) => p.page_type === 'home');
    const homeType = home?.page_type || 'home';
    const [pubRes, draftRes, pvRes] = await Promise.all([
      designCall.get(`${API}/page/detail`, { params: { pageType: homeType, published: 1 } }),
      designCall.get(`${API}/page/detail`, { params: { pageType: homeType, published: 0 } }),
      designCall.get(`${API}/previewUrl`),
    ]);
    const src = draftRes.page || pubRes.page;
    if (src) {
      homeName.value = src.page_name || '首页';
      homeUpdated.value = (src.updated_at || '').slice(0, 16);
      homePreview.value = (src.design_json?.components || []).slice(0, 12);
    } else {
      homeName.value = '首页';
      homePreview.value = [];
    }
    if (pvRes && pvRes.url) pagePreviewUrl.value = pvRes.url;
  } catch (e) { /* 预览加载失败不阻塞 */ }
}
const homePageType = computed(() => pageList.value.find((p) => p.isHome)?.page_type || 'home');
function editHome() { goEdit(homePageType.value); }
async function renameTemplate() {
  try {
    const { value } = await ElMessageBox.prompt('请输入模板名称（当前首页名称）', '重命名模板', { inputValue: homeName.value, inputPattern: /\S+/, inputErrorMessage: '名称不能为空' });
    await designCall.post(`${API}/page/rename`, { pageType: homePageType.value, pageName: value });
    ElMessage.success('模板已重命名');
    homeName.value = value;
    loadPages();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}
async function openPreview() {
  try {
    if (!pagePreviewUrl.value) {
      const pv = await designCall.get(`${API}/previewUrl`);
      pagePreviewUrl.value = pv.url || '';
    }
    if (pagePreviewUrl.value) window.open(pagePreviewUrl.value, '_blank');
  } catch (e) { ElMessage.error(e); }
}
async function sharePage(p) {
  try {
    if (!pagePreviewUrl.value) {
      const pv = await designCall.get(`${API}/previewUrl`);
      pagePreviewUrl.value = pv.url || '';
    }
    await ElMessageBox.alert(`页面「${p.page_name}」推广链接（带签名预览，30 分钟内有效）：\n\n${pagePreviewUrl.value || '预览链接生成失败'}`, '推广', { confirmButtonText: '复制链接' }).catch(() => {});
    if (pagePreviewUrl.value) {
      try { await navigator.clipboard.writeText(pagePreviewUrl.value); ElMessage.success('已复制推广链接'); } catch { /* 剪贴板不可用 */ }
    }
  } catch (e) { ElMessage.error(e); }
}
// 同 page_type 合并为一行（发布态优先），避免草稿+发布显示两行
const mergedPages = computed(() => {
  const map = new Map();
  for (const p of pageList.value) {
    const exist = map.get(p.page_type);
    if (!exist || (p.status === 1 && exist.status !== 1)) map.set(p.page_type, p);
  }
  return [...map.values()];
});
const filteredPages = computed(() => {
  const kw2 = pageSearch.value.trim();
  if (!kw2) return mergedPages.value;
  return mergedPages.value.filter((p) => (p.page_name || '').includes(kw2));
});
const pageNum = ref(1);
const pmPageSize = 10;
const pagedPages = computed(() => {
  const start = (pageNum.value - 1) * pmPageSize;
  return filteredPages.value.slice(start, start + pmPageSize);
});
function goEdit(type) {
  router.push({ path: '/design/edit', query: { pageType: type || 'home' } });
}
async function createPage() {
  try {
    const { value } = await ElMessageBox.prompt('请输入页面名称', '新建页面', { inputValue: `新页面 ${pageList.value.length + 1}`, inputPattern: /\S+/, inputErrorMessage: '页面名称不能为空' });
    const res = await designCall.post(`${API}/page/create`, { pageName: value });
    ElMessage.success('页面已创建');
    loadPages();
    if (res.pageType) goEdit(res.pageType);
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}
async function renamePage(p) {
  try {
    const { value } = await ElMessageBox.prompt('请输入新页面名称', '重命名页面', { inputValue: p.page_name, inputPattern: /\S+/, inputErrorMessage: '页面名称不能为空' });
    await designCall.post(`${API}/page/rename`, { pageType: p.page_type, pageName: value });
    ElMessage.success('已重命名');
    loadPages();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}
async function copyPage(p) {
  try {
    const res = await designCall.post(`${API}/page/copy`, { pageType: p.page_type });
    ElMessage.success('已复制');
    loadPages();
    if (res.pageType) goEdit(res.pageType);
  } catch (e) { ElMessage.error(e); }
}
async function deletePage(p) {
  try { await ElMessageBox.confirm(`确认删除页面「${p.page_name}」？删除后不可恢复`, '删除确认', { type: 'warning' }); } catch { return; }
  try {
    await designCall.post(`${API}/page/delete`, { pageType: p.page_type });
    ElMessage.success('已删除');
    loadPages();
  } catch (e) { ElMessage.error(e); }
}
async function setHome(row) {
  if (row.isHome) return;
  try {
    await designCall.post(`${API}/page/setHome`, { id: row.id });
    ElMessage.success(`已切换首页为「${row.page_name}」`);
    pageNum.value = 1;
    loadPages();
  } catch (e) { ElMessage.error(e); }
}
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
const previewType = ref('');
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
function preview(m) { previewUrl.value = resolveUrl(m.file_url); previewType.value = m.file_type || ''; previewShow.value = true; }
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

// ============ 素材选择弹窗 ============
const imgSel = reactive({ show: false, target: null, targetIdx: null });
function openImageSelect(target, idx) {
  imgSel.target = target;
  imgSel.targetIdx = idx ?? null;
  imgSel.show = true;
}
function confirmImgSel(url) {
  if (url) {
    if (imgSel.target === 'bg') style.bgImage = url;
    if (imgSel.target === 'tab' && imgSel.targetIdx !== null) schemeForm.items[imgSel.targetIdx].icon = url;
  }
  imgSel.show = false;
}

onMounted(() => {
  loadCategories(); loadMaterials();
  loadStyle(); loadTabSchemes(); loadHome(); loadTemplates();
  loadPages();
});
</script>

<style scoped>
/* 页面装修（云菜鸟 moban 风格：顶部手机真实预览 + 操作条 + 表格） */
.page-manage { width: 100%; }
.pm-layout { display: grid; grid-template-columns: 300px 789px; gap: 16px; align-items: start; justify-content: center; }
.pm-left { background: #fff; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.pm-tpl-head { display: flex; align-items: center; gap: 8px; width: 100%; }
.pm-use-tag { font-size: 11px; color: #165dff; background: #e8f3ff; border-radius: 10px; padding: 2px 8px; line-height: 16px; flex-shrink: 0; }
.pm-tpl-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.pm-update { font-size: 12px; color: #86909c; width: 100%; }
.pm-phone { width: 270px; background: #fff; border-radius: 18px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,.08), 0 0 0 1px #e5e6eb; }
.pm-status { height: 24px; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; font-size: 11px; font-weight: 600; color: #1d2129; }
.pm-ps-icons { display: flex; align-items: center; gap: 4px; }
.pm-iframe { display: block; width: 100%; height: 480px; border: 0; background: #fff; }
.pm-canvas { min-height: 380px; padding: 10px; background: #fff; }
.pm-comp { margin-bottom: 8px; }
.pm-empty { color: #86909c; text-align: center; padding: 60px 0; font-size: 12px; }
.pm-right { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.pm-toolbar { width: 100%; display: flex; align-items: center; gap: 8px; background: #fff; border-radius: 8px; padding: 12px 16px; box-sizing: border-box; flex-wrap: wrap; }
.pm-count { font-size: 12px; color: #86909c; }
.pm-toolbar-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.table-scroll { width: 100%; background: #fff; border-radius: 8px; padding: 16px; box-sizing: border-box; }
.pm-row-name { font-weight: 500; color: #1d2129; margin-right: 6px; }
.pm-ops { display: flex; align-items: center; white-space: nowrap; }
.pm-ops .el-button { margin-left: 0; margin-right: 2px; padding: 4px 5px; }
.pm-home-tag { margin-right: 4px; }
.pm-home-switch { display: inline-block; min-width: 32px; text-align: center; padding: 2px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; user-select: none; color: #86909c; background: #f2f3f5; border: 1px solid #e5e6eb; }
.pm-home-switch:hover { color: #165dff; border-color: #165dff; background: #e8f3ff; }
.pm-home-switch.is-home { color: #fff; background: #00b42a; border-color: #00b42a; cursor: default; }
.pm-home-switch.is-home:hover { color: #fff; background: #00b42a; }
.pm-pager { display: flex; justify-content: flex-end; margin-top: 12px; }

.design-home { display: flex; flex-direction: column; gap: 16px; }
/* 应用内 Tab：与 CardTabs.vue 一致的圆角块导航、激活主色、横向滚动 */
.card-tabs {
  display: flex;
  align-items: center;
  overflow-x: auto;
  gap: 4px;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
}
.card-tabs::-webkit-scrollbar { display: none; }
.ctab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 14px;
  color: #4e5969;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.ctab:hover { background: #f2f3f5; color: #1d2129; }
.ctab.active { background: #e8f3ff; color: #165dff; font-weight: 500; }
.hide { display: none; }
.w100p { width: 100%; }
.mb16 { margin-bottom: 16px; }
.mt16 { margin-top: 16px; }
.w100 { width: 100px; }
.w220 { width: 220px; }
.flex-1 { flex: 1; }
.text-muted { color: #86909c; font-size: 12px; }
.hd-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.table-scroll { overflow-x: auto; }
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
.media-thumb .media-video-thumb { width: 100%; height: 100%; object-fit: contain; cursor: zoom-in; }
.video-tag { position: absolute; top: 6px; right: 6px; font-size: 11px; padding: 1px 8px; border-radius: 10px; color: #fff; background: rgba(22,93,255,.85); }
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
