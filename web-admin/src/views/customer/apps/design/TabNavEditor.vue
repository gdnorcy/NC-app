<template>
  <div class="tab-editor-page" :class="{ 'is-embedded': embedded }">
    <!-- 顶部：返回 + 标题 + 保存导航（嵌入模式由宿主页面提供顶栏，这里隐藏） -->
    <div v-if="!embedded" class="te-top">
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
      <!-- 左栏：导航列表（窄栏优化：操作收进 ··· 菜单，状态用色点，卡片两行） -->
      <aside class="te-left">
        <div class="te-left-head">
          <span class="te-left-title">导航列表<span class="te-left-count">{{ filteredSchemes.length }}</span></span>
          <el-button class="te-add-btn" circle size="small" type="primary" title="创建新导航" @click="createScheme">+</el-button>
        </div>
        <el-input
          v-if="schemes.length > 8"
          v-model="schemeKw"
          size="small"
          placeholder="搜索导航"
          clearable
          class="te-left-search"
        />
        <div class="te-schemes">
          <div
            v-for="s in filteredSchemes" :key="s.id"
            class="te-scheme" :class="{ active: currentId === s.id }"
            @click="selectScheme(s)"
          >
            <div class="te-scheme-row1">
              <span class="te-scheme-name" :title="s.scheme_name">{{ s.scheme_name }}</span>
              <el-tag v-if="s.is_default" size="small" type="success" class="te-tag-default">默认</el-tag>
              <el-dropdown trigger="click" placement="bottom-end" @command="(c) => onSchemeCmd(c, s)">
                <span class="te-scheme-more" title="更多操作" @click.stop>···</span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="copy">复制</el-dropdown-item>
                    <el-dropdown-item command="default" :disabled="!!s.is_default">设为默认</el-dropdown-item>
                    <el-dropdown-item command="toggle">{{ s.enabled ? '停用' : '启用' }}</el-dropdown-item>
                    <el-dropdown-item command="del" divided :disabled="!!s.is_default">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <div class="te-scheme-row2">
              <span
                class="te-dot" :class="{ on: !!s.enabled }"
                :title="s.enabled ? '已启用，点击停用' : '已停用，点击启用'"
                @click.stop="userToggle(s, s.enabled ? 0 : 1)"
              ></span>
              <span class="te-scheme-meta">{{ s.tab_json.items.length }} 项 · {{ s.enabled ? '启用' : '停用' }}</span>
            </div>
          </div>
          <div v-if="!filteredSchemes.length" class="te-scheme-empty">
            {{ schemeKw ? '没有匹配的导航' : '暂无导航方案，点击右上角 + 新建' }}
          </div>
        </div>
      </aside>

      <!-- 中栏：手机预览 -->
      <main class="te-center">
        <div class="te-center-bar"><el-button size="small" @click="openExample">查看示例展示</el-button></div>
        <div class="te-phone">
          <div class="te-phone-screen">
            <div class="ph-page">
              <div class="ph-page-placeholder"></div>
            </div>
            <!-- 底部导航预览（与 C 端 CardTabBar 同构渲染） -->
            <div class="ph-tabbar" :class="['ph-type-' + form.type, 'ph-st-' + form.style]" :style="tabbarStyle()">
              <!-- 扇形悬浮：右下菜单主按钮 + 弧形子菜单（云菜鸟 1:1：子菜单默认展开） -->
              <template v-if="form.type === 'fan'">
                <view v-if="fanOpen" class="ph-fan-menu" :class="'ph-fan-count-' + form.items.length">
                  <view
                    v-for="(it, i) in form.items"
                    :key="i"
                    class="ph-fan-item"
                    :class="'ph-fan-pos-' + i"
                    :style="{ background: form.colors.menuBg || '#ffffff' }"
                    @click="previewIdx = i"
                  >
                    <img v-if="isPreviewImg(it, i)" :src="resolveUrl(previewImg(it, i))" class="ph-fan-item-img" />
                    <SIcon v-else :name="it.icon || fallbackIcon(it.text)" size="default" :color="previewIdx === i ? activeColor : (form.colors.menuText || '#333333')" />
                    <text :style="{ color: previewIdx === i ? activeColor : (form.colors.menuText || '#333333') }">{{ it.text }}</text>
                  </view>
                </view>
                <view class="ph-fan-main" :style="{ background: mainBtnBg }" @click="fanOpen = !fanOpen">
                  <view class="ph-fan-main-icon"><i></i><i></i><i></i></view>
                  <text class="ph-fan-main-txt">菜单</text>
                </view>
              </template>
              <!-- 平铺/悬浮：5 种选中风格（云菜鸟 1:1：普通/滑块/按钮居中/按钮凸起/按钮嵌入） -->
              <template v-else>
                <view
                  v-for="(it, i) in form.items"
                  :key="i"
                  class="ph-tab"
                  :class="[{ on: previewIdx === i }, 'ph-st-' + form.style, { 'ph-is-mid': isMid(i) }]"
                  @click="previewIdx = i"
                >
                  <!-- 中间突出按钮（按钮居中/凸起/嵌入）：圆形大按钮 + 图标 + 文字（云菜鸟 1:1：标签保留） -->
                  <view
                    v-if="isMid(i) && ['btnCenter', 'btnRaise', 'btnInset'].includes(form.style)"
                    class="ph-mid"
                    :class="'ph-mid-' + form.style"
                  >
                    <view class="ph-mid-btn" :style="{ background: mainBtnBg }">
                      <img v-if="isPreviewImg(it, i)" :src="resolveUrl(previewImg(it, i))" class="ph-mid-img" />
                      <SIcon
                        v-else
                        :name="it.icon || fallbackIcon(it.text)"
                        :size="['btnRaise', 'btnInset'].includes(form.style) ? 'large' : 'xlarge'"
                        color="#ffffff"
                      />
                    </view>
                    <text class="ph-mid-txt" :class="{ on: previewIdx === i }" :style="{ color: tabColor(i) }">{{ it.text }}</text>
                  </view>
                  <!-- 常规项 -->
                  <template v-else>
                    <view v-if="form.style === 'slider' && previewIdx === i" class="ph-slider" :style="{ background: activeColor }"></view>
                    <img v-if="isPreviewImg(it, i)" :src="resolveUrl(previewImg(it, i))" class="ph-tab-icon-img" />
                    <SIcon v-else :name="it.icon || fallbackIcon(it.text)" size="large" :color="form.style === 'slider' && previewIdx === i ? '#ffffff' : tabColor(i)" />
                    <text class="ph-tab-txt" :style="{ color: tabColor(i) }" :class="{ 'ph-tab-bold': previewIdx === i }">{{ it.text }}</text>
                  </template>
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
          <div v-if="form.type !== 'fan'" class="te-sub-title">导航风格</div>
          <div v-if="form.type !== 'fan'" class="te-style-grid">
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
          <div v-if="form.type === 'float'" class="te-sub-title">边框圆角</div>
          <div v-if="form.type === 'float'" class="te-radio-row">
            <el-radio-group v-model="form.corner">
              <el-radio-button value="square">直角</el-radio-button>
              <el-radio-button value="round">圆角</el-radio-button>
              <el-radio-button value="arc">弧形</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <!-- 背景（云菜鸟 类型×风格 联动：扇形/平铺普通·滑块·居中=背景颜色；平铺凸起·嵌入=背景图片；悬浮=背景图片） -->
        <div class="te-group">
          <div class="te-group-title">{{ isColorBg ? '背景颜色' : '背景图片' }}</div>
          <template v-if="isColorBg">
            <div class="te-bg-row">
              <PeColorPicker v-model="form.bgColor" />
              <el-button text size="small" @click="form.bgColor = ''">重置</el-button>
            </div>
          </template>
          <template v-else>
            <div class="te-bg-row">
              <el-input v-model="form.bg" placeholder="图片链接" class="flex-1" />
              <el-button @click="openBgPick">选择图片</el-button>
            </div>
            <div class="te-tip">导航背景建议尺寸：{{ bgSizeTip }}</div>
          </template>
        </div>

        <!-- 按钮参数（云菜鸟 平铺×按钮居中：按钮高度/按钮圆角） -->
        <div v-if="showBtnParam" class="te-group">
          <div class="te-group-title">按钮参数</div>
          <div class="te-param-row">
            <span class="te-color-label">按钮高度</span>
            <el-slider v-model="form.btnHeight" :min="20" :max="60" style="flex: 1" />
            <span class="te-param-val">{{ form.btnHeight }}px</span>
          </div>
          <div class="te-param-row">
            <span class="te-color-label">按钮圆角</span>
            <el-slider v-model="form.btnRadius" :min="0" :max="30" style="flex: 1" />
            <span class="te-param-val">{{ form.btnRadius }}px</span>
          </div>
        </div>

        <!-- 颜色设置（云菜鸟 类型×风格 联动：扇形=菜单背景/菜单文字；平铺普通·滑块·居中=导航横线/未选中/已选中；平铺凸起·嵌入=突出颜色；悬浮=无突出色） -->
        <div class="te-group">
          <div class="te-group-title">颜色设置</div>
          <template v-if="form.type === 'fan'">
            <div class="te-color-row">
              <span class="te-color-label">菜单背景</span>
              <PeColorPicker v-model="form.colors.menuBg" />
              <el-button text size="small" @click="form.colors.menuBg = '#ffffff'">重置</el-button>
            </div>
            <div class="te-color-row">
              <span class="te-color-label">菜单文字</span>
              <PeColorPicker v-model="form.colors.menuText" />
              <el-button text size="small" @click="form.colors.menuText = '#333333'">重置</el-button>
            </div>
          </template>
          <template v-if="showNavLine">
            <div class="te-color-row">
              <span class="te-color-label">导航横线</span>
              <PeColorPicker v-model="form.colors.navLine" />
              <el-button text size="small" @click="form.colors.navLine = ''">重置</el-button>
            </div>
            <div class="te-color-hint" style="margin-top: -6px;">白色背景建议设置为#dddddd，不填则不显示</div>
          </template>
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
          <div v-if="showHighlight" class="te-color-row">
            <span class="te-color-label">突出颜色</span>
            <PeColorPicker v-model="form.colors.highlight" />
            <el-button text size="small" @click="form.colors.highlight = ''">重置</el-button>
            <span class="te-color-hint">尽量与样式DIY中"突出色"保持一致</span>
          </div>
          <div v-if="!showNavLine && !showHighlight" class="te-color-hint" style="margin-top: -6px;">尽量与样式DIY中"突出色"保持一致，防止杂乱</div>
        </div>

        <!-- 导航设置：菜单项 -->
        <div class="te-group">
          <div class="te-group-title">导航设置</div>
          <div class="te-nav-toggle">
            <el-radio-group v-model="form.iconMode" size="small">
              <el-radio-button value="icon">图标</el-radio-button>
              <el-radio-button value="img">图片</el-radio-button>
            </el-radio-group>
          </div>
          <div v-for="(it, i) in form.items" :key="i" class="te-nav-item">
            <template v-if="form.iconMode === 'img'">
              <div class="te-nav-icon te-nav-icon-double">
                <div class="te-nav-img-slot" @click="openItemImg(i, 'unsel')">
                  <img v-if="it.imgurl" :src="resolveUrl(it.imgurl)" class="te-nav-img-thumb" />
                  <span v-else class="te-nav-img-ph">未选中<br />图片</span>
                </div>
                <div class="te-nav-img-slot" @click="openItemImg(i, 'sel')">
                  <img v-if="it.imgurlact" :src="resolveUrl(it.imgurlact)" class="te-nav-img-thumb" />
                  <span v-else class="te-nav-img-ph">已选中<br />图片</span>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="te-nav-icon">
                <img v-if="isImgIcon(it.icon)" :src="resolveUrl(it.icon)" class="te-nav-icon-img" @click="openIconSel(i)" />
                <SIcon v-else-if="it.icon" :name="it.icon" size="xlarge" color="#4e5969" @click="openIconSel(i)" />
                <span v-else class="te-nav-icon-empty" @click="openIconSel(i)">选图标</span>
              </div>
            </template>
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
          <div class="te-tip">菜单项 2~5 个（小程序 tabBar 规则），至少保留 2 个；切到「图片」时每个菜单项需分别设置未选中 / 已选中两张图</div>
        </div>
      </aside>
    </div>

    <!-- 示例展示弹层（导航风格大图预览，左右切换） -->
    <el-dialog v-model="example.show" title="示例展示" width="520px" append-to-body>
      <div class="te-example">
        <img :src="exampleImg" class="te-example-img" :alt="exampleLabel" />
        <div class="te-example-meta">{{ exampleLabel }}（{{ example.idx + 1 }} / {{ exampleImgs.length }}）</div>
        <div class="te-example-nav">
          <el-button size="small" @click="examplePrev">上一个</el-button>
          <el-button size="small" @click="exampleNext">下一个</el-button>
        </div>
      </div>
    </el-dialog>

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
// 导航风格示例图（普通/滑块/按钮居中/按钮凸起/按钮嵌入/扇形）
import tabStyle1 from '../../../../assets/design-styles/tabStyle_1.png';
import tabStyle2 from '../../../../assets/design-styles/tabStyle_2.png';
import tabStyle3 from '../../../../assets/design-styles/tabStyle_3.png';
import tabStyle4 from '../../../../assets/design-styles/tabStyle_4.png';
import tabStyle5 from '../../../../assets/design-styles/tabStyle_5.png';
import tabStyle6 from '../../../../assets/design-styles/tabStyle_6.png';

const API = '/design';
const router = useRouter();
const route = useRoute();

// embedded：作为页面装修（DesignEditorPage）左侧「底部导航」入口的内嵌内容渲染，
// 隐藏自带顶栏，由宿主顶栏提供保存按钮与未保存标记
defineProps({ embedded: { type: Boolean, default: false } });
const emit = defineEmits(['dirty-change']);

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
const schemeKw = ref('');
// 左栏收窄后不再常驻操作按钮，列表按名称/项数过滤（方案超过 8 个才显示搜索框）
const filteredSchemes = computed(() => {
  const kw = schemeKw.value.trim().toLowerCase();
  if (!kw) return schemes.value;
  return schemes.value.filter((s) => (s.scheme_name || '').toLowerCase().includes(kw));
});
const currentId = ref(null);
const saving = ref(false);
const dirty = ref(false);
const previewIdx = ref(0);
const fanOpen = ref(true); // 扇形子菜单默认展开（云菜鸟 1:1）
// 主题主色 fallback（C 端选中色回退）
const stylePrimary = ref('#165DFF');

const form = reactive({
  id: null,
  scheme_name: '',
  show: { mp: true, h5: true },
  type: 'flat',
  style: 'normal',
  corner: 'square',
  iconMode: 'icon', // icon 图标 / img 图片（全局切换，每个菜单项两张图：未选中/已选中）
  bg: '',
  bgColor: '',
  btnHeight: 28,
  btnRadius: 7,
  colors: { unselected: '#9a9a9a', selected: '', highlight: '', menuBg: '#ffffff', menuText: '#333333', navLine: '' },
  items: [],
});

const iconSel = reactive({ show: false, idx: null });
// 示例展示（导航风格大图 1-6，左右切换）
const example = reactive({ show: false, idx: 0 });
const exampleImgs = [tabStyle1, tabStyle2, tabStyle3, tabStyle4, tabStyle5, tabStyle6];
const exampleLabels = ['普通样式', '滑块样式', '按钮居中', '按钮凸起', '按钮嵌入', '扇形悬浮'];
const exampleImg = computed(() => exampleImgs[example.idx]);
const exampleLabel = computed(() => exampleLabels[example.idx]);
function exampleCurrent() {
  const map = { normal: 0, slider: 1, btnCenter: 2, btnRaise: 3, btnInset: 4, fan: 5 };
  return form.type === 'fan' ? 5 : (map[form.style] ?? 0);
}
function openExample() {
  example.idx = exampleCurrent();
  example.show = true;
}
function examplePrev() { example.idx = (example.idx + exampleImgs.length - 1) % exampleImgs.length; }
function exampleNext() { example.idx = (example.idx + 1) % exampleImgs.length; }
const imgSel = reactive({ show: false, target: null, targetIdx: null });
const linkSel = reactive({ show: false, idx: null, val: '' });
const linkVal = computed(() => {
  if (linkSel.idx === null || !form.items[linkSel.idx]) return '';
  return form.items[linkSel.idx].url;
});

const activeColor = computed(() => (form.colors.selected && form.colors.selected !== 'transparent' ? form.colors.selected : '#ff4d4f'));
const activeColorSoft = computed(() => activeColor.value + '2e');
const mainBtnBg = computed(() => {
  // 中间按钮颜色：优先"突出颜色"，空则用"已选中色"，不自动跟主题色（对齐云菜鸟）
  const h = form.colors.highlight;
  if (h && h !== 'transparent') return h;
  const s = form.colors.selected;
  if (s && s !== 'transparent') return s;
  return '#ff4d4f'; // 云菜鸟默认红色
});
// 预览中间按钮：按钮居中=圆角矩形(高/圆角可调)；凸起/嵌入=圆形
const previewMidBtnStyle = computed(() => {
  const base = { background: mainBtnBg.value };
  if (form.style === 'btnCenter') {
    return { ...base, width: '38px', height: (form.btnHeight || 28) + 'px', borderRadius: (form.btnRadius || 7) + 'px' };
  }
  return base;
});
// 背景联动（云菜鸟实测矩阵）：fan、平铺(普通/滑块/居中)、悬浮(普通/滑块/居中) = 背景颜色；平铺(凸起/嵌入)、悬浮(凸起/嵌入) = 背景图片
const isColorBg = computed(() => {
  const st = ['normal', 'slider', 'btnCenter'].includes(form.style);
  return form.type === 'fan' || (form.type === 'flat' && st) || (form.type === 'float' && st);
});
/**
 * 按钮凸起/嵌入几何（云菜鸟后台实测，预览宽 375px）
 * footnav_4=凸起 / footnav_5=嵌入；foot_styleBox1=普通平铺 / foot_styleBox2=底部悬浮
 * 容器高 = 背景图(750×H)等比到 375 的高；中钮 43×43，凸起 margin-top -30 / 嵌入 -32
 * 缩放系数：.te-phone-screen 宽 320 含 4px 手机边框（border-box）→ tabbar 实际渲染宽 312px
 * 必须按 312/375 换算，否则背景图 contain 等比高度 ≠ 容器高，会露出缝隙
 */
const EW = 312 / 375;
const BTN_BG_METRIC = {
  'flat-btnRaise': { h: 82, padTop: 26, padSide: 0, mt: -30, mb: 8, tip: '750 * 164' },
  'flat-btnInset': { h: 55, padTop: 0, padSide: 0, mt: -32, mb: 11, tip: '750 * 110' },
  'float-btnRaise': { h: 95, padTop: 26, padSide: 20, mt: -30, mb: 8, tip: '750 * 190' },
  'float-btnInset': { h: 69, padTop: 0, padSide: 20, mt: -32, mb: 11, tip: '750 * 138' },
};
const btnMetric = computed(() => BTN_BG_METRIC[`${form.type}-${form.style}`] || null);
const bgSizeTip = computed(() => btnMetric.value?.tip || '750 * 190');
// 背景图：云菜鸟原图 footerbg{1平铺|2悬浮}_{1凸起|2嵌入} / footerbg2_{4凸起|5嵌入}_{1直角|2圆角|3弧形}
const bgImgPath = computed(() => {
  const kind = form.style === 'btnRaise' ? 'raise' : 'inset';
  if (form.type === 'float') {
    const c = form.corner === 'square' ? '-square' : form.corner === 'arc' ? '-arc' : '';
    return `/images/tabbar-bg/btn-${kind}-float${c}.png`;
  }
  return `/images/tabbar-bg/btn-${kind}-flat.png`;
});
// 按钮参数：平铺或悬浮 × 按钮居中
const showBtnParam = computed(() => form.type !== 'fan' && form.style === 'btnCenter');
// 颜色联动（云菜鸟实测矩阵）：导航横线 = 平铺(普通/滑块/居中)；突出颜色 = 平铺或悬浮(居中/凸起/嵌入)；扇形=菜单背景/文字
const showNavLine = computed(() => form.type === 'flat' && ['normal', 'slider', 'btnCenter'].includes(form.style));
const showHighlight = computed(() => form.type !== 'fan' && ['btnCenter', 'btnRaise', 'btnInset'].includes(form.style));

watch(
  [
    () => form.scheme_name,
    () => form.show.mp,
    () => form.show.h5,
    () => form.type,
    () => form.style,
    () => form.corner,
    () => form.bg,
    () => form.bgColor,
    () => form.btnHeight,
    () => form.btnRadius,
    () => form.colors.navLine,
    () => form.colors.unselected,
    () => form.colors.selected,
    () => form.colors.highlight,
    () => form.colors.menuBg,
    () => form.colors.menuText,
    () => form.items.map((x) => x.text + x.icon + x.imgurl + x.imgurlact + x.url).join('|') + '|' + form.iconMode,
  ],
  () => { if (currentId.value !== null || form.items.length) dirty.value = true; }
);
// 切到扇形类型时默认展开子菜单（云菜鸟 1:1）
watch(() => form.type, (t) => { if (t === 'fan') fanOpen.value = true; });
// 凸起/嵌入切风格时自动带默认背景图（云菜鸟 1:1：风格×类型×圆角联动默认 footerbg；已有自定义 bg 不覆盖）
watch([() => form.style, () => form.type, () => form.corner], () => {
  const s = form.style;
  if (s === 'btnRaise' || s === 'btnInset') {
    // 仅当 bg 为空或仍为内置默认图之一时跟随联动；用户自定义 bg 保留
    if (!form.bg || form.bg.includes('/images/tabbar-bg/btn-')) form.bg = bgImgPath.value;
  } else if (form.bg.includes('/images/tabbar-bg/btn-')) {
    // 切回普通/滑块/居中时，默认背景图残留清空（修复切回后圆槽残留 bug）
    form.bg = '';
  }
});

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
function normItem(it) {
  return {
    text: it?.text || '',
    icon: it?.icon || '',
    imgurl: it?.imgurl || '',
    imgurlact: it?.imgurlact || '',
    url: it?.url || '',
  };
}
// 预览：图片模式按选中态返回 已选中图(imgurlact) / 未选中图(imgurl)，无图返回 null（回落图标）
function previewImg(it, i) {
  if (form.iconMode !== 'img') return null;
  const active = previewIdx.value === i;
  return (active && it.imgurlact) ? it.imgurlact : it.imgurl;
}
function isPreviewImg(it, i) {
  return !!previewImg(it, i);
}
function openItemImg(i, which) {
  imgSel.target = which === 'sel' ? 'itemImgSelected' : 'itemImgUnselected';
  imgSel.targetIdx = i;
  imgSel.show = true;
}
function tabColor(i) {
  return previewIdx === i ? activeColor.value : (form.colors.unselected || '#9a9a9a');
}
// 中间项索引（云菜鸟实测：主按钮在中间菜单项，项数<3 则无主按钮）
// 5 项→第3项(index=2)正中、4 项→第3项(index=2)偏右、3 项→第2项(index=1)正中、2 项→无
// 云菜鸟实测：偶数项（4 项）无主按钮凸起（退化均分），仅奇数项（3/5 项）中间主按钮
const midIdx = computed(() => (form.items.length >= 3 && form.items.length % 2 === 1 ? Math.floor(form.items.length / 2) : -1));
function isMid(i) { return i === midIdx.value; }
function tabbarStyle() {
  const st = {};
  const useBgImg = ['btnRaise', 'btnInset'].includes(form.style);
  if (useBgImg) {
    // 云菜鸟 1:1：背景图 contain + center bottom（不拉伸），容器高=背景图等比高度，
    // 悬浮内缩由背景图自带透明边 + padding 决定，不再手动偏移 left/right/bottom
    let bgPath = form.bg;
    if (!bgPath || bgPath.includes('/images/tabbar-bg/btn-')) bgPath = bgImgPath.value;
    st.backgroundImage = `url(${resolveUrl(bgPath)})`;
    st.backgroundSize = 'contain';
    st.backgroundRepeat = 'no-repeat';
    st.backgroundPosition = 'center bottom';
    const m = btnMetric.value;
    if (m) {
      st.boxSizing = 'border-box'; // 高度含 padding（云菜鸟 .diymenu 实测为 border-box）
      st.height = (m.h * EW).toFixed(2) + 'px';
      st.paddingTop = (m.padTop * EW).toFixed(2) + 'px';
      st.paddingLeft = (m.padSide * EW).toFixed(2) + 'px';
      st.paddingRight = (m.padSide * EW).toFixed(2) + 'px';
    }
    return st;
  }
  st.background = '#ffffff';
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
    toggleReady = false;
    setTimeout(() => { toggleReady = true; }, 500);
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
    bgColor: s.tab_json.bgColor || '',
    btnHeight: s.tab_json.btnHeight || 28,
    btnRadius: s.tab_json.btnRadius || 7,
    colors: { unselected: '#9a9a9a', selected: '', highlight: '', menuBg: '#ffffff', menuText: '#333333', navLine: '', ...(s.tab_json.colors || {}) },
    items: (s.tab_json.items || []).map(normItem),
    iconMode: s.tab_json.iconMode === 'img' ? 'img' : 'icon',
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
    iconMode: 'icon',
    bg: '',
    bgColor: '',
    btnHeight: 28,
    btnRadius: 7,
    colors: { unselected: '#9a9a9a', selected: '', highlight: '', menuBg: '#ffffff', menuText: '#333333', navLine: '' },
    items: [
      normItem({ text: '首页', icon: 'dashboard', url: '/pages/cardMain/home' }),
      normItem({ text: '我的', icon: 'user', url: '/pages/card/profile' }),
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
        style: form.type === 'fan' ? 'normal' : form.style,
        corner: form.corner,
        iconMode: form.iconMode,
        bg: form.bg,
        bgColor: form.bgColor,
        btnHeight: form.btnHeight,
        btnRadius: form.btnRadius,
        colors: { ...form.colors },
        items: form.items.map((it) => ({ text: it.text, icon: it.icon, imgurl: it.imgurl || '', imgurlact: it.imgurlact || '', url: it.url })),
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
// el-switch 的 change 在初始化/外部赋值时也会派发（会把 enabled 误写成 0），
// 列表加载完成并稳定渲染后才放行真实交互；期间 change 一律忽略
let toggleReady = false;
function userToggle(s, v) {
  if (!toggleReady) return;
  const next = v ? 1 : 0;
  if (s.enabled === next) return;
  const prev = s.enabled;
  s.enabled = next; // 乐观更新
  designCall.post(`${API}/tab/save`, { id: s.id, enabled: next }).catch((e) => {
    s.enabled = prev;
    ElMessage.error(e);
  });
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
  form.items.push(normItem({ text: '', icon: '', url: '' }));
  // 云菜鸟 1:1：新增菜单后默认仍选中第一项（滑块选中项不应跳到新增项）
  if (previewIdx.value < 0) previewIdx.value = 0;
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
  } else if ((imgSel.target === 'itemImgUnselected' || imgSel.target === 'itemImgSelected') && imgSel.targetIdx !== null && form.items[imgSel.targetIdx]) {
    form.items[imgSel.targetIdx][imgSel.target === 'itemImgUnselected' ? 'imgurl' : 'imgurlact'] = url;
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

// 左栏 ··· 菜单统一入口（复制 / 设为默认 / 启停 / 删除）
async function onSchemeCmd(cmd, s) {
  if (cmd === 'copy') return copyScheme(s);
  if (cmd === 'del') return delScheme(s);
  if (cmd === 'toggle') return userToggle(s, s.enabled ? 0 : 1);
  if (cmd === 'default') return setDefault(s);
}
async function setDefault(s) {
  try {
    await designCall.post(`${API}/tab/setDefault`, { id: s.id });
    ElMessage.success('已设为默认导航');
    await load();
  } catch (e) { ElMessage.error(e); }
}

function goBack() {
  router.push('/design');
}

// 未保存状态上行给宿主（嵌入模式下由宿主顶栏展示）
watch(dirty, (v) => emit('dirty-change', v));
defineExpose({ save });

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
/* 嵌入模式（页面装修左侧「底部导航」入口）：占满宿主主区，不限制最小宽度 */
.tab-editor-page.is-embedded {
  height: 100%;
  min-width: 0;
  background: transparent;
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
  /* 左栏 216（操作已收纳）；右栏加宽到 440 给密集属性控件留空间；中间列限宽 520，避免超宽屏被拉伸导致左右显得更小；整组居中保持平衡 */
  grid-template-columns: 216px minmax(0, 520px) 440px;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
}
.te-left, .te-center, .te-right { background: #fff; border-radius: 8px; }
.te-left { padding: 12px; overflow-y: auto; }
.te-right { padding: 18px; overflow-y: auto; }
.te-center { display: flex; align-items: center; justify-content: center; padding: 12px; overflow: auto; }

/* 左栏：导航列表（窄栏优化版：两行卡片 + ··· 菜单 + 状态色点） */
.te-left-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.te-left-title { display: flex; align-items: baseline; gap: 4px; font-size: 14px; font-weight: 600; color: #1d2129; }
.te-left-count { font-size: 12px; font-weight: 400; color: #86909c; }
.te-add-btn { width: 24px; height: 24px; padding: 0; font-size: 15px; line-height: 1; }
.te-left-search { margin-bottom: 8px; }
.te-scheme {
  position: relative;
  border: 1px solid #e5e6eb; border-radius: 8px;
  padding: 8px 10px; margin-bottom: 8px; cursor: pointer;
  overflow: hidden; transition: background .15s, border-color .15s;
}
.te-scheme:hover { border-color: #c9cdd4; }
/* 选中：左侧竖条 + 浅蓝底（比只换边框更好认） */
.te-scheme.active { border-color: #165dff; background: #e8f3ff; }
.te-scheme.active::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px; background: #165dff;
}
.te-scheme-row1 { display: flex; align-items: center; gap: 6px; }
.te-scheme-name { font-size: 13px; font-weight: 600; color: #1d2129; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.te-tag-default { flex-shrink: 0; height: 18px; padding: 0 5px; font-size: 11px; line-height: 16px; }
/* ··· 默认隐藏，hover/选中时显示，避免常驻占宽度 */
.te-scheme-more {
  flex-shrink: 0; width: 18px; text-align: center; cursor: pointer;
  color: #86909c; font-size: 14px; line-height: 14px; letter-spacing: 1px;
  opacity: 0; transition: opacity .15s;
}
.te-scheme:hover .te-scheme-more, .te-scheme.active .te-scheme-more { opacity: 1; }
.te-scheme-more:hover { color: #165dff; }
.te-scheme-row2 { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
/* 状态色点：替代 el-switch，点击可切换启停 */
.te-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  background: #c9cdd4; cursor: pointer; transition: background .15s;
}
.te-dot.on { background: #00b42a; }
.te-dot:hover { box-shadow: 0 0 0 3px rgba(0, 180, 42, .15); }
.te-scheme-meta { font-size: 12px; color: #86909c; }
.te-scheme-empty { color: #86909c; font-size: 12px; text-align: center; padding: 24px 8px; line-height: 1.6; }

/* 中栏：手机预览 */
.te-center { flex-direction: column; }
.te-center-bar { align-self: stretch; display: flex; justify-content: flex-end; margin-bottom: 10px; }
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

/* 预览 tabbar（与 C 端 CardTabBar 同构）
   --ew：tabbar 实际渲染宽 312px（320 屏宽 - 4px×2 手机边框）/ 云菜鸟实测预览宽 375px
   凸起/嵌入尺寸按此等比换算，须与 JS 的 EW 常量保持一致 */
.ph-tabbar {
  --ew: 0.832;
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
.ph-type-fan { background: transparent !important; border-top: none; box-shadow: none !important; }
/* 凸起/嵌入：整个导航背景替换为背景图（不叠加白底、去顶部分隔线）
   高度/内边距由 tabbarStyle() 按云菜鸟实测值写入（容器高=背景图等比高，contain + center bottom） */
.ph-tabbar.ph-st-btnRaise, .ph-tabbar.ph-st-btnInset {
  background: transparent;
  border-top: none;
  overflow: visible;
}
/* 菜单项：云菜鸟 .item 为 flex 居中（无 gap） */
.ph-tabbar.ph-st-btnRaise .ph-tab,
.ph-tabbar.ph-st-btnInset .ph-tab { justify-content: center; gap: 0; }
.ph-tabbar.ph-st-btnRaise .ph-tab-txt,
.ph-tabbar.ph-st-btnInset .ph-tab-txt,
.ph-mid-btnRaise .ph-mid-txt,
.ph-mid-btnInset .ph-mid-txt { font-size: calc(12px * var(--ew)); line-height: calc(18px * var(--ew)); }
.ph-tabbar.ph-st-btnRaise .ph-tab-icon-img,
.ph-tabbar.ph-st-btnInset .ph-tab-icon-img,
.ph-mid-btnRaise .ph-mid-img,
.ph-mid-btnInset .ph-mid-img { width: calc(28px * var(--ew)); height: calc(28px * var(--ew)); }
.ph-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 7px 0;
  font-size: 13px;
  color: #9a9a9a;
  position: relative;
  cursor: pointer;
}
/* 中间项（按钮凸起时 bar 增高，复刻云菜鸟 footnav_4=82px） */
.ph-tab.ph-is-mid { justify-content: flex-start; }
.ph-tab-bold { font-weight: 600; }
.ph-tab-icon-img { width: 22px; height: 22px; object-fit: contain; }
.ph-slider {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  z-index: 0;
  box-shadow: 0 0 0 3px #ffffff, 0 4px 10px rgba(0, 0, 0, 0.2);
}
/* slider 选中项：图标上移居中到圆钮中央（对齐云菜鸟） */
.ph-st-slider.on .s-icon,
.ph-st-slider.on .ph-tab-icon-img { position: relative; top: -12px; z-index: 1; }
.ph-slider ~ .ph-tab-txt { position: relative; z-index: 1; }
/* 中间突出项容器：圆形按钮 + 下方文字（云菜鸟 1:1：主按钮标签保留） */
.ph-mid { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
.ph-mid-btn { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18); align-self: center; }
.ph-mid-txt { font-size: 10px; line-height: 1; margin-top: 2px; white-space: nowrap; }
.ph-mid-txt.on { font-weight: 600; }
/* 中间突出按钮（云菜鸟：43px 圆，红底白图标；按 320/375 缩放） */
.ph-mid-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
  align-self: flex-start;
  margin-top: -15px;
}
.ph-mid-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
  align-self: flex-start;
  margin-top: -15px;
}
.ph-mid-btn .s-icon { margin: 0; }
.ph-mid-img { width: 22px; height: 22px; }
/* 按钮居中：红色圆角矩形(pill)，凸出半个（对齐云菜鸟：高28px圆角7px） */
.ph-mid-btnCenter .ph-mid-btn {
  margin-top: -14px;
  width: 56px;
  height: 28px;
  border-radius: 7px;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
}
/* 按钮凸起/嵌入（云菜鸟 1:1：navNum_icon 43×43px，阴影 0 3px 2px rgba(165,178,195,.22)，
   凸起 margin-top -30px / 嵌入 -32px，配 .item flex 居中实现骑在凸台/凹槽上） */
.ph-mid-btnRaise, .ph-mid-btnInset { height: auto; justify-content: flex-start; }
.ph-mid-btnRaise .ph-mid-btn,
.ph-mid-btnInset .ph-mid-btn {
  width: calc(43px * var(--ew));
  height: calc(43px * var(--ew));
  align-self: center;
  box-shadow: 0 calc(3px * var(--ew)) calc(2px * var(--ew)) rgba(165, 178, 195, 0.22);
}
.ph-mid-btnRaise .ph-mid-btn { margin-top: calc(-30px * var(--ew)); margin-bottom: calc(8px * var(--ew)); }
.ph-mid-btnInset .ph-mid-btn { margin-top: calc(-32px * var(--ew)); margin-bottom: calc(11px * var(--ew)); }
.ph-mid-btnRaise .ph-mid-txt, .ph-mid-btnInset .ph-mid-txt { margin-top: 0; }
.ph-slider + image, .ph-slider + svg { position: relative; z-index: 1; }
.ph-slider + image ~ text, .ph-slider + svg ~ text { position: relative; z-index: 1; }

/* 扇形悬浮（云菜鸟 1:1：右下菜单主按钮 + 弧形子菜单） */
.ph-fan-main {
  position: absolute;
  right: 40px;
  bottom: 220px;
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
.ph-fan-main-txt { font-size: 9px; color: #fff; margin-top: 2px; }
.ph-fan-main-icon { display: flex; flex-direction: column; gap: 3px; align-items: center; }
.ph-fan-main-icon i { display: block; width: 16px; height: 2px; border-radius: 1px; background: #fff; }
.ph-fan-menu { position: absolute; inset: 0; z-index: 11; pointer-events: none; }
/* 4 项与 5 项扇形弧线统一（菜鸟云：右上1+左弧3，5项加右下） */
.ph-fan-item {
  position: absolute;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  font-size: 9px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  pointer-events: auto;
  line-height: 1.1;
}
.ph-fan-item-img { width: 20px; height: 20px; object-fit: contain; }
.ph-fan-pos-0 { right: 20px; bottom: 315px; }
.ph-fan-pos-1 { right: 80px; bottom: 300px; }
.ph-fan-pos-2 { right: 120px; bottom: 225px; }
.ph-fan-pos-3 { right: 80px; bottom: 150px; }
.ph-fan-pos-4 { right: 15px; bottom: 135px; }

/* 右栏：配置面板 */
.te-group { margin-bottom: 24px; }
.te-group-title { font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 12px; }
.te-sub-title { font-size: 12px; color: #86909c; margin: 12px 0 10px; }
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

.te-bg-row { display: flex; align-items: center; gap: 8px; }
.te-param-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.te-param-val { font-size: 13px; color: #4e5969; width: 42px; text-align: right; }
.te-tip { font-size: 11px; color: #86909c; margin-top: 6px; line-height: 16px; }

.te-color-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
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
/* 图片模式：每个菜单项两张图（未选中 / 已选中），竖向均分、放大并留出间距（高度自适应，不再被父级 40px 裁切） */
.te-nav-icon-double { flex-direction: column; align-items: center; gap: 10px; width: 48px; height: auto; }
.te-nav-img-slot {
  width: 44px;
  height: 44px;
  border: 1px dashed #c9cdd4;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
}
.te-nav-img-slot:hover { border-color: #165dff; }
.te-nav-img-thumb { width: 42px; height: 42px; object-fit: contain; }
.te-nav-img-ph { font-size: 11px; color: #86909c; text-align: center; line-height: 1.25; }
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

/* 示例展示弹层 */
.te-example { text-align: center; }
.te-example-img { max-width: 100%; border-radius: 8px; border: 1px solid #e5e6eb; }
.te-example-meta { font-size: 13px; color: #4e5969; margin: 10px 0; }
.te-example-nav { display: flex; justify-content: center; gap: 10px; }

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
