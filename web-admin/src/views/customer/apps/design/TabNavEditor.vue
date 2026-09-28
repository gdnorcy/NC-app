<template>
  <div class="tab-editor-page">
    <!-- 顶部：返回 + 标题 + 保存导航 -->
    <div class="te-top">
      <div class="te-top-left">
        <el-button size="small" @click="goBack">← 返回设计中心</el-button>
        <span class="te-title">底部导航</span>
        <span class="te-sub">独立编辑窗口</span>
      </div>
      <div class="te-top-right">
        <span v-if="dirty" class="te-dirty-tag">● 未保存</span>
        <el-button size="small" type="primary" :loading="saving" @click="save">保存导航</el-button>
      </div>
    </div>

    <div class="te-body">
      <!-- 左栏：导航列表 -->
      <aside class="te-left">
        <div class="te-left-head">
          <span>导航列表</span>
          <el-button size="small" type="primary" plain @click="createScheme">+ 创建新导航</el-button>
        </div>
        <div class="te-schemes">
          <div v-for="s in schemes" :key="s.id" class="te-scheme" :class="{ active: currentId === s.id }" @click="selectScheme(s)">
            <div class="te-scheme-top">
              <span class="te-scheme-name" :title="s.scheme_name">{{ s.scheme_name }}</span>
              <el-tag v-if="s.is_default" size="small" type="success">默认</el-tag>
            </div>
            <div class="te-scheme-meta">{{ s.tab_json.items.length }} 项 · {{ s.enabled ? '启用' : '停用' }}</div>
            <div class="te-scheme-ops" @click.stop>
              <el-button size="small" text @click="copyScheme(s)">复制</el-button>
              <el-button size="small" text type="danger" :disabled="s.is_default" @click="delScheme(s)">删除</el-button>
              <el-switch v-model="s.enabled" size="small" @change="toggleScheme(s)" />
            </div>
          </div>
          <div v-if="!schemes.length" class="te-scheme-empty">暂无导航方案，点击上方「创建新导航」</div>
        </div>
      </aside>

      <!-- 中栏：手机预览 -->
      <main class="te-center">
        <div class="te-phone">
          <div class="te-phone-screen">
            <div class="ph-page">
              <div class="ph-page-placeholder"></div>
            </div>
            <!-- 底部导航预览（与 C 端 CardTabBar 同构渲染） -->
            <div class="ph-tabbar" :class="['ph-type-' + form.type]" :style="tabbarStyle">
              <!-- 扇形悬浮：中心主按钮 + 点击展开扇形菜单 -->
              <template v-if="form.type === 'fan'">
                <view class="ph-fan-main" :style="{ background: mainBtnBg }" @click="fanOpen = !fanOpen">
                  <SIcon :name="form.items[0]?.icon || fallbackIcon(form.items[0]?.text)" size="xlarge" color="#ffffff" />
                  <text class="ph-fan-main-txt">{{ form.items[0]?.text }}</text>
                </view>
                <view v-if="fanOpen" class="ph-fan-menu">
                  <view v-for="(it, i) in form.items.slice(1)" :key="i" class="ph-fan-item" @click="previewIdx = i + 1">
                    <SIcon :name="it.icon || fallbackIcon(it.text)" size="default" :color="previewIdx === i + 1 ? activeColor : form.colors.unselected" />
                    <text :style="{ color: previewIdx === i + 1 ? activeColor : form.colors.unselected }">{{ it.text }}</text>
                  </view>
                </view>
              </template>
              <!-- 平铺/悬浮：5 种选中风格 -->
              <template v-else>
                <view
                  v-for="(it, i) in form.items"
                  :key="i"
                  class="ph-tab"
                  :class="[{ on: previewIdx === i }, 'ph-st-' + form.style]"
                  @click="previewIdx = i"
                >
                  <view v-if="form.style === 'slider' && previewIdx === i" class="ph-slider" :style="{ background: activeColorSoft }"></view>
                  <image v-if="isImgIcon(it.icon)" :src="resolveUrl(it.icon)" class="ph-tab-icon-img" mode="aspectFit" />
                  <SIcon v-else :name="it.icon || fallbackIcon(it.text)" size="default" :color="tabColor(i)" />
                  <text :style="{ color: tabColor(i) }" :class="{ 'ph-tab-bold': previewIdx === i }">{{ it.text }}</text>
                </view>
              </template>
            </div>
          </div>
          <div class="te-phone-label">手机预览</div>
        </div>
      </main>

      <!-- 右栏：配置面板 -->
      <aside class="te-right">
        <!-- 导航名称 -->
        <div class="te-group">
          <div class="te-group-title">导航名称</div>
          <el-input v-model="form.scheme_name" maxlength="20" placeholder="请输入导航名称（便于后台查看）" />
        </div>

        <!-- 显示设置 -->
        <div class="te-group">
          <div class="te-group-title">显示设置</div>
          <div class="te-check-row">
            <el-checkbox v-model="form.show.mp">小程序</el-checkbox>
            <el-checkbox v-model="form.show.h5">H5</el-checkbox>
          </div>
        </div>

        <!-- 风格设置 -->
        <div class="te-group">
          <div class="te-group-title">风格设置</div>
          <div class="te-sub-title">导航类型</div>
          <div class="te-radio-row">
            <el-radio-group v-model="form.type">
              <el-radio-button value="flat">普通平铺</el-radio-button>
              <el-radio-button value="float">底部悬浮</el-radio-button>
              <el-radio-button value="fan">扇形悬浮</el-radio-button>
            </el-radio-group>
          </div>
          <div class="te-sub-title">导航风格</div>
          <div class="te-style-grid">
            <div
              v-for="(st, i) in STYLE_OPTIONS"
              :key="st.value"
              class="te-style-cell"
              :class="{ active: form.style === st.value }"
              @click="form.style = st.value"
            >
              <img :src="styleImgs[i]" class="te-style-img" :alt="st.label" />
              <span class="te-style-label">{{ st.label }}</span>
            </div>
          </div>
          <div class="te-sub-title">边框圆角</div>
          <div class="te-radio-row">
            <el-radio-group v-model="form.corner">
              <el-radio-button value="square">直角</el-radio-button>
              <el-radio-button value="round">圆角</el-radio-button>
              <el-radio-button value="arc">弧形</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <!-- 背景图片 -->
        <div class="te-group">
          <div class="te-group-title">背景图片</div>
          <div class="te-bg-row">
            <el-input v-model="form.bg" placeholder="图片链接" class="flex-1" />
            <el-button @click="openBgPick">选择图片</el-button>
          </div>
          <div class="te-tip">导航背景建议尺寸：750 * 190</div>
        </div>

        <!-- 颜色设置 -->
        <div class="te-group">
          <div class="te-group-title">颜色设置</div>
          <div class="te-color-row">
            <span class="te-color-label">未选中色</span>
            <PeColorPicker v-model="form.colors.unselected" />
            <el-button text size="small" @click="form.colors.unselected = '#9a9a9a'">重置</el-button>
          </div>
          <div class="te-color-row">
            <span class="te-color-label">已选中色</span>
            <PeColorPicker v-model="form.colors.selected" />
            <el-button text size="small" @click="form.colors.selected = ''">重置</el-button>
            <span class="te-color-hint">不填则应用主题主色</span>
          </div>
          <div class="te-color-row">
            <span class="te-color-label">突出颜色</span>
            <PeColorPicker v-model="form.colors.highlight" />
            <el-button text size="small" @click="form.colors.highlight = ''">重置</el-button>
            <span class="te-color-hint">尽量与样式DIY中"突出色"保持一致</span>
          </div>
        </div>

        <!-- 导航设置：菜单项 -->
        <div class="te-group">
          <div class="te-group-title">导航设置</div>
          <div class="te-nav-toggle">
            <el-radio-group v-model="itemIconMode" size="small">
              <el-radio-button value="icon">图标</el-radio-button>
              <el-radio-button value="img">图片</el-radio-button>
            </el-radio-group>
          </div>
          <div v-for="(it, i) in form.items" :key="i" class="te-nav-item">
            <div class="te-nav-icon">
              <image v-if="isImgIcon(it.icon)" :src="resolveUrl(it.icon)" class="te-nav-icon-img" @click="openIconSel(i)" />
              <SIcon v-else-if="it.icon" :name="it.icon" size="xlarge" color="#4e5969" @click="openIconSel(i)" />
              <span v-else class="te-nav-icon-empty" @click="openIconSel(i)">选图标</span>
            </div>
            <div class="te-nav-fields">
              <el-input v-model="it.text" placeholder="文字" class="te-nav-text" />
              <div class="te-nav-link-row">
                <el-input v-model="it.url" placeholder="请选择链接或输入链接地址" class="flex-1" />
                <el-button size="small" @click="openLinkSel(i)">选择链接</el-button>
              </div>
            </div>
            <div class="te-nav-del" @click="removeItem(i)">×</div>
          </div>
          <div v-if="form.items.length < 5" class="te-nav-add" @click="addItem">添加一个</div>
          <div class="te-tip">菜单项 2~5 个（小程序 tabBar 规则），至少保留 2 个</div>
        </div>
      </aside>
    </div>

    <!-- 图标选择弹层 -->
    <el-dialog v-model="iconSel.show" title="选择图标" width="440px" append-to-body>
      <div class="te-icon-grid">
        <div v-for="n in BUILTIN_ICONS" :key="n" class="te-icon-cell" @click="confirmIcon(n)">
          <SIcon :name="n" size="xlarge" color="#4e5969" />
          <span class="te-icon-name">{{ n }}</span>
        </div>
        <div class="te-icon-cell te-icon-upload" @click="openUploadIcon">
          <span class="te-icon-upload-plus">+</span>
          <span class="te-icon-name">上传图片</span>
        </div>
      </div>
    </el-dialog>

    <!-- 素材选择器（背景图/自定义图标上传） -->
    <MaterialPicker v-model="imgSel.show" @confirm="confirmImgSel" />
    <!-- 链接选择器（选择链接） -->
    <LinkPicker v-model="linkSel.show" :model-link="linkVal" @confirm="confirmLink" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../../components/SIcon.vue';
import PeColorPicker from './PeColorPicker.vue';
import MaterialPicker from './MaterialPicker.vue';
import LinkPicker from './LinkPicker.vue';
import { designCall } from '../../../../api';
// 导航风格示例图（云菜鸟原版：普通/滑块/按钮居中/按钮凸起/按钮嵌入/扇形）
import tabStyle1 from '../../../../assets/design-styles/tabStyle_1.png';
import tabStyle2 from '../../../../assets/design-styles/tabStyle_2.png';
import tabStyle3 from '../../../../assets/design-styles/tabStyle_3.png';
import tabStyle4 from '../../../../assets/design-styles/tabStyle_4.png';
import tabStyle5 from '../../../../assets/design-styles/tabStyle_5.png';

const API = '/design';
const router = useRouter();
const route = useRoute();

// 导航风格 5 种（云菜鸟 footStyle 1-5；第 6 张示例图「扇形悬浮」属导航类型，不是风格）
const STYLE_OPTIONS = [
  { value: 'normal', label: '普通样式' },
  { value: 'slider', label: '滑块样式' },
  { value: 'btnCenter', label: '按钮居中' },
  { value: 'btnRaise', label: '按钮凸起' },
  { value: 'btnInset', label: '按钮嵌入' },
];
const styleImgs = [tabStyle1, tabStyle2, tabStyle3, tabStyle4, tabStyle5];

// 内置图标（与 C 端 SIcon 图标库一致，导航图标在 C 端渲染）
const BUILTIN_ICONS = [
  'dashboard', 'market', 'crown', 'user', 'card', 'radar', 'dynamic', 'sms', 'apps',
  'customer', 'bell', 'orders', 'cart', 'wallet', 'wechat', 'location', 'share',
  'star', 'like', 'settings', 'mail', 'comment', 'exchange', 'building',
];

const schemes = ref([]);
const currentId = ref(null);
const saving = ref(false);
const dirty = ref(false);
const previewIdx = ref(0);
const fanOpen = ref(false);
const itemIconMode = ref('icon');
// 主题主色 fallback（C 端选中色回退）
const stylePrimary = ref('#165DFF');

const form = reactive({
  id: null,
  scheme_name: '',
  show: { mp: true, h5: true },
  type: 'flat',
  style: 'normal',
  corner: 'square',
  bg: '',
  colors: { unselected: '#9a9a9a', selected: '', highlight: '' },
  items: [],
});

const iconSel = reactive({ show: false, idx: null });
const imgSel = reactive({ show: false, target: null, targetIdx: null });
const linkSel = reactive({ show: false, idx: null, val: '' });
const linkVal = computed(() => {
  if (linkSel.idx === null || !form.items[linkSel.idx]) return '';
  return form.items[linkSel.idx].url;
});

const activeColor = computed(() => form.colors.selected || stylePrimary.value || '#165DFF');
const activeColorSoft = computed(() => activeColor.value + '2e');
const mainBtnBg = computed(() => form.colors.highlight || activeColor.value);

watch(
  [
    () => form.scheme_name,
    () => form.show.mp,
    () => form.show.h5,
    () => form.type,
    () => form.style,
    () => form.corner,
    () => form.bg,
    () => form.colors.unselected,
    () => form.colors.selected,
    () => form.colors.highlight,
    () => form.items.map((x) => x.text + x.icon + x.url).join('|'),
  ],
  () => { if (currentId.value !== null || form.items.length) dirty.value = true; }
);

function fallbackIcon(text) {
  const m = { '首页': 'dashboard', '集市': 'market', '会员': 'crown', '我的': 'user', '名片': 'card', '人脉': 'market', '动态': 'dynamic', '消息': 'sms' };
  return m[text] || 'apps';
}
function isImgIcon(u) {
  if (!u) return false;
  return /^https?:|^data:|^\//.test(u) || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(u);
}
function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function tabColor(i) {
  return previewIdx === i ? activeColor.value : (form.colors.unselected || '#9a9a9a');
}
function tabbarStyle() {
  const st = {};
  if (form.bg) {
    st.backgroundImage = `url(${resolveUrl(form.bg)})`;
    st.backgroundSize = 'cover';
    st.backgroundPosition = 'center';
  } else {
    st.background = '#ffffff';
  }
  if (form.type === 'float') {
    st.left = '16px';
    st.right = '16px';
    st.bottom = '14px';
    st.borderRadius = '24px';
    st.boxShadow = '0 4px 16px rgba(0,0,0,0.10)';
  } else if (form.corner === 'round') {
    st.borderRadius = '16px 16px 0 0';
  } else if (form.corner === 'arc') {
    st.borderRadius = '30px 30px 0 0';
  }
  return st;
}

// ============ 加载与选中 ============
async function load() {
  try {
    const res = await designCall.get(`${API}/tab/list`);
    schemes.value = res.list || [];
  } catch (e) { ElMessage.error(e); }
  try {
    const st = await designCall.get(`${API}/style/get`);
    if (st && st.style && st.style.primaryColor) stylePrimary.value = st.style.primaryColor;
  } catch { /* 忽略 */ }
  const id = Number(route.query.id) || 0;
  const isNew = route.query.new === '1';
  if (isNew) {
    createScheme();
  } else if (id) {
    const s = schemes.value.find((x) => x.id === id);
    if (s) selectScheme(s);
  } else if (schemes.value.length) {
    selectScheme(schemes.value[0]);
  }
}

function selectScheme(s) {
  currentId.value = s.id;
  previewIdx.value = 0;
  fanOpen.value = false;
  Object.assign(form, {
    id: s.id,
    scheme_name: s.scheme_name,
    show: { mp: true, h5: true, ...(s.tab_json.show || {}) },
    type: s.tab_json.type || 'flat',
    style: s.tab_json.style || 'normal',
    corner: s.tab_json.corner || 'square',
    bg: s.tab_json.bg || '',
    colors: { unselected: '#9a9a9a', selected: '', highlight: '', ...(s.tab_json.colors || {}) },
    items: (s.tab_json.items || []).map((it) => ({ text: it.text, icon: it.icon, url: it.url })),
  });
  dirty.value = false;
}

function createScheme() {
  currentId.value = null;
  previewIdx.value = 0;
  Object.assign(form, {
    id: null,
    scheme_name: '',
    show: { mp: true, h5: true },
    type: 'flat',
    style: 'normal',
    corner: 'square',
    bg: '',
    colors: { unselected: '#9a9a9a', selected: '', highlight: '' },
    items: [
      { text: '首页', icon: 'dashboard', url: '/pages/cardMain/home' },
      { text: '我的', icon: 'user', url: '/pages/card/profile' },
    ],
  });
  dirty.value = false;
}

// ============ 保存/复制/删除/开关 ============
async function save() {
  if (!form.scheme_name.trim()) { ElMessage.warning('请输入导航名称'); return; }
  if (form.items.length < 2 || form.items.length > 5) { ElMessage.warning('菜单项数量需为 2~5 个（小程序 tabBar 规则）'); return; }
  saving.value = true;
  try {
    const payload = {
      id: form.id || undefined,
      name: form.scheme_name.trim(),
      tabJson: {
        show: { ...form.show },
        type: form.type,
        style: form.style,
        corner: form.corner,
        bg: form.bg,
        colors: { ...form.colors },
        items: form.items.map((it) => ({ text: it.text, icon: it.icon, url: it.url })),
      },
    };
    await designCall.post(`${API}/tab/save`, payload);
    ElMessage.success('已保存');
    dirty.value = false;
    await load();
    // 保持当前编辑项（新建保存后切到新方案）
    const target = form.id ? form.id : (schemes.value[0] ? schemes.value[0].id : null);
    const s = schemes.value.find((x) => x.id === target) || schemes.value[0];
    if (s) selectScheme(s);
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}

async function copyScheme(s) {
  try { await designCall.post(`${API}/tab/copy`, { id: s.id }); ElMessage.success('已复制'); load(); } catch (e) { ElMessage.error(e); }
}
async function toggleScheme(s) {
  try { await designCall.post(`${API}/tab/save`, { id: s.id, enabled: s.enabled ? 1 : 0 }); } catch (e) { ElMessage.error(e); }
}
async function delScheme(s) {
  try { await ElMessageBox.confirm(`确认删除导航方案「${s.scheme_name}」？`, '删除确认', { type: 'warning' }); } catch { return; }
  try {
    await designCall.post(`${API}/tab/delete`, { id: s.id });
    ElMessage.success('已删除');
    await load();
    if (currentId.value === s.id) {
      if (schemes.value.length) selectScheme(schemes.value[0]);
      else createScheme();
    }
  } catch (e) { ElMessage.error(e); }
}

// ============ 菜单项 ============
function addItem() {
  if (form.items.length >= 5) return;
  form.items.push({ text: '', icon: '', url: '' });
  previewIdx.value = form.items.length - 1;
}
function removeItem(i) {
  if (form.items.length <= 2) { ElMessage.warning('至少保留 2 个菜单项（小程序 tabBar 规则）'); return; }
  ElMessageBox.confirm('确定删除吗？', '提示', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
    .then(() => {
      form.items.splice(i, 1);
      if (previewIdx.value >= form.items.length) previewIdx.value = form.items.length - 1;
      dirty.value = true;
    })
    .catch(() => {});
}

// ============ 图标 / 图片 / 链接 ============
function openIconSel(i) {
  iconSel.idx = i;
  iconSel.show = true;
}
function confirmIcon(name) {
  if (iconSel.idx !== null && form.items[iconSel.idx]) form.items[iconSel.idx].icon = name;
  iconSel.show = false;
}
function openUploadIcon() {
  iconSel.show = false;
  imgSel.target = 'itemIcon';
  imgSel.targetIdx = iconSel.idx;
  imgSel.show = true;
}
function openBgPick() {
  imgSel.target = 'bg';
  imgSel.targetIdx = null;
  imgSel.show = true;
}
function confirmImgSel(url) {
  if (!url) { imgSel.show = false; return; }
  if (imgSel.target === 'bg') {
    form.bg = url;
  } else if (imgSel.target === 'itemIcon' && imgSel.targetIdx !== null && form.items[imgSel.targetIdx]) {
    form.items[imgSel.targetIdx].icon = url;
  }
  imgSel.show = false;
}
function openLinkSel(i) {
  linkSel.idx = i;
  linkSel.val = form.items[i].url;
  linkSel.show = true;
}
function confirmLink(link) {
  if (link && linkSel.idx !== null && form.items[linkSel.idx]) form.items[linkSel.idx].url = link;
  linkSel.show = false;
}

function goBack() {
  router.push('/design');
}

onMounted(load);
</script>

<style scoped>
.tab-editor-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f2f3f5;
  min-width: 1100px;
}

/* 顶部 */
.te-top {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid #e5e6eb;
  flex-shrink: 0;
}
.te-top-left { display: flex; align-items: center; gap: 10px; }
.te-title { font-size: 16px; font-weight: 600; color: #1d2129; }
.te-sub { font-size: 12px; color: #86909c; }
.te-top-right { display: flex; align-items: center; gap: 10px; }
.te-dirty-tag { font-size: 12px; color: #ff7d00; }

/* 三栏主体 */
.te-body {
  flex: 1;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 360px;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
}
.te-left, .te-center, .te-right { background: #fff; border-radius: 8px; }
.te-left { padding: 12px; overflow-y: auto; }
.te-right { padding: 16px; overflow-y: auto; }
.te-center { display: flex; align-items: center; justify-content: center; padding: 12px; overflow: auto; }

/* 左栏：导航列表 */
.te-left-head { display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 10px; }
.te-scheme { border: 1px solid #e5e6eb; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; }
.te-scheme.active { border-color: #165dff; background: #e8f3ff; }
.te-scheme-top { display: flex; align-items: center; gap: 6px; }
.te-scheme-name { font-size: 13px; font-weight: 600; color: #1d2129; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.te-scheme-meta { font-size: 12px; color: #86909c; margin: 4px 0 6px; }
.te-scheme-ops { display: flex; align-items: center; gap: 2px; }
.te-scheme-ops :deep(.el-button + .el-button) { margin-left: 0; }
.te-scheme-empty { color: #86909c; font-size: 12px; text-align: center; padding: 30px 0; }

/* 中栏：手机预览 */
.te-phone { width: 320px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.te-phone-screen {
  width: 320px;
  height: 620px;
  background: #f7f8fa;
  border: 4px solid #1d2129;
  border-radius: 30px;
  position: relative;
  overflow: hidden;
}
.te-phone-label { font-size: 12px; color: #86909c; }
.ph-page { height: 100%; }
.ph-page-placeholder {
  height: 100%;
  background: repeating-linear-gradient(45deg, #f2f3f5, #f2f3f5 12px, #f7f8fa 12px, #f7f8fa 24px);
}

/* 预览 tabbar（与 C 端 CardTabBar 同构） */
.ph-tabbar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: #ffffff;
  display: flex;
  border-top: 1px solid #f2f3f5;
  z-index: 10;
}
.ph-type-float { position: absolute; }
.ph-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 0;
  font-size: 11px;
  color: #9a9a9a;
  position: relative;
  cursor: pointer;
}
.ph-tab-bold { font-weight: 600; }
.ph-tab-icon-img { width: 20px; height: 20px; object-fit: contain; }
.ph-slider {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  z-index: 0;
}
.ph-slider + image, .ph-slider + svg { position: relative; z-index: 1; }
.ph-slider + image ~ text, .ph-slider + svg ~ text { position: relative; z-index: 1; }

/* 扇形悬浮 */
.ph-fan-main {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  z-index: 12;
  cursor: pointer;
}
.ph-fan-main-txt { font-size: 9px; color: #fff; margin-top: -2px; }
.ph-fan-menu {
  position: absolute;
  bottom: 84px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 14px;
  z-index: 12;
}
.ph-fan-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 10px;
  padding: 8px 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  cursor: pointer;
}

/* 右栏：配置面板 */
.te-group { margin-bottom: 22px; }
.te-group-title { font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 10px; }
.te-sub-title { font-size: 12px; color: #86909c; margin: 10px 0 8px; }
.te-check-row { display: flex; gap: 16px; }
.te-radio-row { display: flex; }
.te-radio-row :deep(.el-radio-button__inner) { font-size: 12px; padding: 8px 12px; }

.te-style-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.te-style-cell {
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  padding: 6px;
  cursor: pointer;
  text-align: center;
}
.te-style-cell.active { border-color: #165dff; box-shadow: 0 0 0 1px #165dff; }
.te-style-img { width: 100%; border-radius: 4px; display: block; }
.te-style-label { font-size: 11px; color: #4e5969; display: block; margin-top: 4px; }

.te-bg-row { display: flex; gap: 8px; }
.te-tip { font-size: 11px; color: #86909c; margin-top: 6px; line-height: 16px; }

.te-color-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.te-color-label { font-size: 12px; color: #1d2129; width: 60px; flex-shrink: 0; }
.te-color-hint { font-size: 11px; color: #86909c; margin-left: auto; }

.te-nav-toggle { margin-bottom: 10px; }
.te-nav-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
  position: relative;
}
.te-nav-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.te-nav-icon-img { width: 36px; height: 36px; object-fit: contain; border: 1px dashed #c9cdd4; border-radius: 6px; }
.te-nav-icon-empty {
  width: 36px;
  height: 36px;
  border: 1px dashed #c9cdd4;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #86909c;
}
.te-nav-fields { flex: 1; min-width: 0; }
.te-nav-text { margin-bottom: 6px; }
.te-nav-link-row { display: flex; gap: 6px; }
.te-nav-del {
  position: absolute;
  top: 4px;
  right: 8px;
  color: #f53f3f;
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}
.te-nav-add {
  border: 1px dashed #c9cdd4;
  border-radius: 8px;
  text-align: center;
  padding: 8px 0;
  color: #4e5969;
  font-size: 13px;
  cursor: pointer;
  margin-bottom: 6px;
}
.te-nav-add:hover { border-color: #165dff; color: #165dff; }

/* 图标选择弹层 */
.te-icon-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; max-height: 380px; overflow-y: auto; }
.te-icon-cell {
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  cursor: pointer;
}
.te-icon-cell:hover { border-color: #165dff; }
.te-icon-name { font-size: 10px; color: #86909c; }
.te-icon-upload { justify-content: center; color: #165dff; }
.te-icon-upload-plus { font-size: 22px; line-height: 1; }
</style>
