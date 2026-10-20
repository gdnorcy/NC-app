<template>
  <!-- ===== 装修我的名片 · 自定义组件列表管理（2026-10-20 V1）
       产品形态来自《手机端名片装修模块》文档，实现对齐项目现状：
       uni-app 页面（非原生小程序代码）；type/props 对齐 web-admin componentRegistry
       （视频号是 finderUserName+feedId，不是旧文档的 feedToken）；母版组件由服务端
       注入 isLock，本页只读置灰；保存走 PUT 整存（server card.js 归属校验+白名单）。 ===== -->
  <view class="ce-page" :style="[themeStyle, brandVars]">
    <PageNav title="装修我的名片" back></PageNav>

    <view class="ce-body">
      <view class="ce-desc">
        组件展示在名片详情页「简介」标签下方。企业母版组件由租户统一设置，不可修改。
        <text class="ce-quota" :class="{ full: mine.length >= COMP_MAX }">已添加 {{ mine.length }}/{{ COMP_MAX }} 个</text>
      </view>

      <view class="ce-empty" v-if="!comps.length && !loading">
        <view class="ce-empty-t">还没有自定义组件</view>
        <view class="ce-empty-d">点击下方「添加组件」，放图片、视频号、文本等到名片里</view>
      </view>

      <view class="ce-list">
        <block v-for="(c, i) in comps" :key="c.key">
          <view class="ce-card" :class="{ lock: c.isLock }">
            <view class="ce-head">
              <text class="ce-icon">{{ iconOf(c.type) }}</text>
              <text class="ce-name">{{ nameOf(c.type) }}</text>
              <text v-if="c.props && c.props.hidden" class="ce-hidden-tag">已隐藏</text>
              <text v-if="c.isLock" class="ce-lock-tag">企业母版</text>
            </view>
            <view class="ce-preview">{{ previewOf(c) }}</view>
            <view class="ce-ops">
              <text class="ce-op" :class="{ off: c.isLock }" @click="toggleHide(c)">{{ c.props && c.props.hidden ? '显示' : '隐藏' }}</text>
              <text class="ce-op" :class="{ off: c.isLock || !canMove(i, -1) }" @click="move(i, -1)">上移</text>
              <text class="ce-op" :class="{ off: c.isLock || !canMove(i, 1) }" @click="move(i, 1)">下移</text>
              <text class="ce-op" :class="{ off: c.isLock }" @click="openEdit(c)">编辑</text>
              <text class="ce-op del" :class="{ off: c.isLock }" @click="remove(c)">删除</text>
            </view>
            <view v-if="c.isLock" class="ce-lock-tip">企业母版组件，不可修改</view>
          </view>
        </block>
      </view>

      <view class="ce-preview-btn" @click="openPreview">
        <text class="ce-preview-btn-ico">👁</text>
        <text>预览效果（含未保存修改）</text>
      </view>

      <view class="ce-add" @click="showPanel = true">
        <text class="ce-add-plus">＋</text>
        <text>{{ mine.length >= COMP_MAX ? '已达上限' : '添加组件' }}</text>
      </view>
    </view>

    <!-- 底部组件选择面板 -->
    <view v-if="showPanel" class="ce-mask" @click="showPanel = false"></view>
    <view v-if="showPanel" class="ce-panel">
      <view class="ce-panel-t">选择组件</view>
      <view class="ce-grid">
        <view v-for="t in CARD_COMP_REGISTRY" :key="t.type" class="ce-grid-item" @click="add(t.type)">
          <text class="ce-grid-icon">{{ ICONS[t.type] }}</text>
          <text class="ce-grid-text">{{ t.name }}</text>
        </view>
      </view>
      <view class="ce-cancel" @click="showPanel = false">取消</view>
    </view>

    <!-- 组件配置弹窗（按注册表 schema 渲染控件子集） -->
    <view v-if="editing" class="ce-mask" @click="closeEdit"></view>
    <view v-if="editing" class="ce-modal">
      <view class="ce-modal-t">{{ nameOf(editing.type) }}配置</view>
      <scroll-view scroll-y class="ce-modal-body">
        <!-- v-for + v-if 拆成 template 包裹：同元素上 v-if 拿不到 v-for 作用域变量。
             ce-modal-pad 在 scroll-view 内承载水平 padding（避免 scroll-view 直接 padding
             在 MP 端让子元素尺寸基准退化、输入框溢出）；原生 input/textarea 再用 .ce-input-wrap
             视图包一层：边框/圆角/box-sizing 落在「普通 view」上（MP 对 view 的 box-sizing 可靠），
             原生控件本身去边框去 padding、只 width:100% 填满包层，MP/H5 都不会溢出。 -->
        <view class="ce-modal-pad">
        <!-- 字段按 section 分组：内容段默认展开，样式段默认折叠（按钮配置 12 个字段一屏放不下，
             折叠后默认只露 文字/跳转）；editFields 在样式段前插入一个折叠开关行 -->
        <template v-for="f in editFields" :key="f.__toggle ? '__style-toggle' : f.key">
          <view v-if="f.__toggle" class="ce-section-toggle" @click="styleOpen = !styleOpen">
            <text class="ce-section-t">{{ styleOpen ? '收起样式设置' : '样式设置（颜色/边距/圆角等）' }}</text>
            <text class="ce-section-arrow">{{ styleOpen ? '▴' : '▾' }}</text>
          </view>
          <view v-else-if="fieldVisible(f) && (f.section !== 'style' || styleOpen)" class="ce-field">
            <text class="ce-label">{{ f.label }}</text>
            <view v-if="f.control === 'input' || f.control === 'link'" class="ce-input-wrap">
              <input
                class="ce-input"
                v-model="editing.props[f.key]"
                :placeholder="f.placeholder || ('请输入' + f.label)"
                placeholder-class="ph"
              />
            </view>
            <view v-else-if="f.control === 'richtext'" class="ce-rt-row">
              <view class="ce-input-wrap">
                <textarea
                  class="ce-textarea"
                  v-model="editing.props[f.key]"
                  :placeholder="f.placeholder || '支持 <p> <b> <a> 等简单 HTML'"
                  placeholder-class="ph"
                />
              </view>
              <text class="ce-rt-tip">换行请用 &lt;p&gt; 或 &lt;br&gt; 标签</text>
            </view>
            <view v-else-if="f.control === 'image'" class="ce-img-row" @click="pickImage(f.key)">
              <image
                v-if="editing.props[f.key] && !imgFailed.has(f.key)"
                :src="editing.props[f.key]"
                class="ce-img"
                mode="aspectFill"
                @error="onImgError(f.key)"
              />
              <view v-else class="ce-img-empty">
                <text class="ce-img-empty-ico">📷</text>
                <text class="ce-img-empty-t">上传图片</text>
              </view>
              <text class="ce-img-tip">{{ editing.props[f.key] && !imgFailed.has(f.key) ? '点击更换' : '点击上传' }}</text>
            </view>
          <view v-else-if="f.control === 'color'" class="ce-color-row">
            <view class="ce-swatches">
              <view
                v-for="col in SWATCHES"
                :key="col.name"
                class="ce-sw"
                :class="{ on: (editing.props[f.key] || '') === col.value, none: col.value === '' }"
                :style="{ background: col.value || '#fff' }"
                @click="editing.props[f.key] = col.value"
              ></view>
            </view>
            <view class="ce-input-wrap ce-hex-wrap">
              <input class="ce-hex" v-model="editing.props[f.key]" placeholder="留空=透明，或 #RRGGBB" placeholder-class="ph" />
            </view>
          </view>
          <view v-else-if="f.control === 'slider'" class="ce-slider-row">
            <slider
              class="ce-slider"
              :min="f.min"
              :max="f.max"
              :value="sliderVal(f)"
              :activeColor="activeColor"
              backgroundColor="#e5e6eb"
              block-size="20"
              @change="onSlide(f.key, $event)"
            />
            <text class="ce-slider-v">{{ sliderVal(f) }}</text>
          </view>
          <view v-else-if="f.control === 'radio'" class="ce-radios">
            <view
              v-for="o in f.options"
              :key="String(o.value)"
              class="ce-radio"
              :class="{ on: String(editing.props[f.key]) === String(o.value) }"
              @click="editing.props[f.key] = o.value"
            >{{ o.label }}</view>
          </view>
          <view v-else-if="f.control === 'switch'" class="ce-switch-row">
            <switch :checked="!!editing.props[f.key]" :color="activeColor" @change="editing.props[f.key] = $event.detail.value" />
          </view>
          </view>
        </template>
        </view>
      </scroll-view>
      <view class="ce-modal-btns">
        <view class="ce-mbtn cancel" @click="closeEdit">取消</view>
        <view class="ce-mbtn save" @click="saveEdit">保存</view>
      </view>
    </view>

    <!-- 页内实时预览：全屏遮罩按 comps 内存态渲染（不用退到名片详情页）；
         与 cardDetail 渲染同口径：hidden 组件不显示，母版+个人按序排列，结构对齐 cc-*。
         🔴 本页是 navigationStyle:custom，fixed 层顶到屏幕物理原点：头部必须 JS 实测
         避让状态栏+胶囊（pvHeadStyle），滚动区必须显式定高（MP 不认 flex:1 定高）。 -->
    <view v-if="showPreview" class="ce-preview-layer">
      <view class="ce-preview-head" :style="pvHeadStyle">
        <view class="ce-preview-bar" :style="{ height: pvNavH }">
          <view class="ce-preview-back" @click="closePreview">
            <text class="ce-preview-back-ico">‹</text>
            <text class="ce-preview-back-t">返回</text>
          </view>
          <text class="ce-preview-title">预览效果</text>
          <text class="ce-preview-done" @click="closePreview">完成</text>
        </view>
      </view>
      <scroll-view scroll-y class="ce-preview-body" :style="pvBodyStyle">
        <view class="ce-preview-canvas">
          <view class="ce-preview-hint">含未保存修改 · 已隐藏组件不显示 · 点「返回/完成」退出预览</view>
          <template v-for="c in previewComps" :key="c.key">
            <!-- 图片（对齐 cc-img：widthFix + 内联边距；加载失败给占位，不露灰块/白块） -->
            <image
              v-if="c.type === 'image' && c.props.url && !imgFailed.has('pv:' + c.key)"
              class="pv-img"
              :src="c.props.url"
              mode="widthFix"
              :style="pvMarginStyle(c)"
              @error="pvImgFail('pv:' + c.key)"
              @click="pvJump(c.props.link)"
            />
            <view v-else-if="c.type === 'image'" class="pv-img-fallback" :style="pvMarginStyle(c)">
              <text>图片加载失败，请检查图片地址</text>
            </view>
            <!-- 视频号（对齐 cc-video：深底封面 + 白圈播放键 + 底部渐变标题） -->
            <view
              v-else-if="c.type === 'channel-video'"
              class="pv-video"
              :style="pvMarginStyle(c)"
              @click="pvOpenChannel(c.props)"
            >
              <image
                v-if="c.props.cover && !imgFailed.has('pvc:' + c.key)"
                class="pv-video-cover"
                :src="c.props.cover"
                mode="aspectFill"
                @error="pvImgFail('pvc:' + c.key)"
              />
              <view v-else class="pv-video-cover pv-video-empty"><SIcon name="dynamic" size="large" color="#ffffff" /></view>
              <view class="pv-video-play"><SIcon name="play" size="default" color="#ffffff" /></view>
              <view v-if="c.props.title || c.props.desc" class="pv-video-info">
                <text v-if="c.props.title" class="pv-video-t">{{ c.props.title }}</text>
                <text v-if="c.props.desc" class="pv-video-d">{{ c.props.desc }}</text>
              </view>
            </view>
            <!-- 文本（对齐 cc-notice：圆点 + 文本，圆角固定 radius-xs 不吃 props） -->
            <view
              v-else-if="c.type === 'notice'"
              class="pv-notice"
              :style="[pvMarginStyle(c), { background: c.props.bgColor || 'transparent', color: c.props.color || '#1d2129', fontSize: (c.props.fontSize || 14) + 'px', fontWeight: c.props.bold ? 600 : 400 }]"
              @click="pvJump(c.props.url)"
            >
              <text class="pv-notice-dot"></text>
              <text class="pv-notice-text">{{ c.props.text }}</text>
            </view>
            <!-- 分割线（对齐 cc-divider：单线 + 右侧可选文字） -->
            <view
              v-else-if="c.type === 'divider'"
              class="pv-divider"
              :style="pvMarginStyle(c)"
            >
              <view class="pv-divider-line" :style="{ borderTopWidth: (c.props.thickness || 1) + 'px', borderTopStyle: c.props.lineStyle || 'solid', borderTopColor: c.props.color || '#e5e6eb' }"></view>
              <text v-if="c.props.text" class="pv-divider-text">{{ c.props.text }}</text>
            </view>
            <!-- 空白占位 -->
            <view
              v-else-if="c.type === 'spacer'"
              :style="[pvMarginStyle(c), { height: (c.props.height == null ? 20 : c.props.height) + 'px', background: c.props.bgColor || 'transparent' }]"
            ></view>
            <!-- 跳转按钮（尺寸走共享 buttonSizeStyle，颜色圆角按 props，可试跳站内链接） -->
            <view v-else-if="c.type === 'button'" class="pv-btn-wrap" :style="pvMarginStyle(c)">
              <view class="pv-btn" :style="pvBtnStyle(c.props)" @click="pvJump(c.props.url)">{{ c.props.text || '按钮' }}</view>
            </view>
            <!-- 富文本（对齐 cc-rt-wrap：外层 bottomBg、内层 compBgColor+圆角/描边，HTML 先消毒） -->
            <view
              v-else-if="c.type === 'rich-text'"
              class="pv-rt-wrap"
              :style="[pvMarginStyle(c), { background: (c.props.bottomBg && c.props.bottomBg !== 'transparent') ? c.props.bottomBg : 'transparent' }]"
            >
              <rich-text class="pv-richtext" :nodes="sanitizeRichHtml(c.props.html || '<p>富文本内容</p>')" :style="pvRichStyle(c.props)"></rich-text>
            </view>
          </template>
          <view v-if="!previewComps.length" class="ce-preview-empty">还没有可显示的组件</view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import SIcon from '../../components/SIcon.vue';
import { ref, computed, onMounted } from 'vue';
import { onBackPress } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';
import { getNavMetrics } from '../../utils/navMetrics.js';
import { buttonSizeStyle } from '../../utils/btnSize.js';
import { CARD_COMP_REGISTRY, getCompDef, compDefaultProps } from './cardCompRegistry.js';

const themeStyle = useDesignTheme();
const { brandVars, brandPrimary } = useBrandOverride();
// slider/switch 的 color 不吃 var()（同 SIcon 纪律），喂真实 hex：品牌色优先，回落主题色
const activeColor = computed(() => brandPrimary.value || themeStyle.value['--design-primary'] || '#FE0137');

// 服务端 card.js COMP_MAX 同源（超限 400）；单测钉两边一致
const COMP_MAX = 20;

const ICONS = { image: '🖼️', 'channel-video': '🎬', notice: '📝', divider: '➖', spacer: '▭', button: '🔘', 'rich-text': '📄' };
const SWATCHES = [
  { name: 'transparent', value: '' },
  { name: 'white', value: '#FFFFFF' },
  { name: 'gray', value: '#F7F8FA' },
  { name: 'line', value: '#E5E6EB' },
  { name: 'cream', value: '#FFF7E8' },
  { name: 'orange', value: '#FF7D00' },
  { name: 'blue', value: '#165DFF' },
  { name: 'green', value: '#00B42A' },
  { name: 'red', value: '#F53F3F' },
  { name: 'ink', value: '#1D2129' },
];

const cardId = ref(null);
const comps = ref([]); // 合并列表：母版(isLock) 在前，个人组件随后（与服务端返回顺序一致）
const loading = ref(false);
const loadFailed = ref(false);
const loadFailedMsg = ref('加载失败，请检查网络后重试');
const showPanel = ref(false);
const editing = ref(null); // { key, type, props } 编辑中的副本
const saving = ref(false);
// 弹窗样式段折叠态（每次打开重置为收起，默认只露内容字段）
const styleOpen = ref(false);
// 页内实时预览（含未保存修改，不用退到名片详情页）
const showPreview = ref(false);
// 预览层导航度量：custom nav 页面的 fixed 层顶到屏幕物理原点，必须 JS 实测避让
// 状态栏+胶囊（禁写死百分比，真机上「完成」曾被胶囊盖住 → 用户以为没有返回入口）
const navM = getNavMetrics();
const pvHeadStyle = { paddingTop: navM.statusBarHeight + 'px', paddingRight: navM.capsuleRightPad + 'px' };
const pvNavH = navM.navBarHeight + 'px';
// MP 的 scroll-view 不认 flex:1+min-height:0 定高（H5 有效 MP 无效，同弹窗 46vh 的坑），
// 显式给 calc 定高：头部总高 = 状态栏 + 导航行
const pvBodyStyle = { height: `calc(100vh - ${navM.statusBarHeight + navM.navBarHeight}px)` };
// 图片加载失败的 key 集合：示例图走网络图（需 request 合法域名），真机域名没配时
// <image> 会露出 background 灰底像「灰块」——失败即回退到上传占位，不展示灰块
const imgFailed = ref(new Set());

// 个人自建组件（母版不含）；保存只提交这部分
const mine = computed(() => comps.value.filter((c) => !c.isLock));

// 预览列表：过滤掉隐藏组件（与 cardDetail 渲染口径一致）
const previewComps = computed(() => comps.value.filter((c) => !(c.props && c.props.hidden)));

// 弹窗字段按 section 分组：在第一个样式字段前插入折叠开关行（无样式段的组件如视频号不插）
const editFields = computed(() => {
  if (!editing.value) return [];
  const out = [];
  let toggleAdded = false;
  for (const f of schemaOf(editing.value.type)) {
    if (f.section === 'style' && !toggleAdded) { out.push({ __toggle: true }); toggleAdded = true; }
    out.push(f);
  }
  return out;
});

function iconOf(type) { return ICONS[type] || '📦'; }
function nameOf(type) { const d = getCompDef(type); return d ? d.name : '组件'; }
function schemaOf(type) { const d = getCompDef(type); return d ? d.schema : []; }

function previewOf(c) {
  const p = c.props || {};
  switch (c.type) {
    case 'image': return p.url ? '图片' : '未设置图片';
    case 'channel-video': return p.title || (p.finderUserName ? `视频号 ${p.finderUserName}` : '未设置视频号');
    case 'notice': return p.text || '未设置文字';
    case 'divider': return p.text ? `分割线（${p.text}）` : '分割线';
    case 'spacer': return `空白 ${p.height ?? 20}px`;
    case 'button': return p.text || '按钮';
    case 'rich-text': {
      const t = String(p.html || '').replace(/<[^>]*>/g, '').trim();
      return t ? (t.length > 24 ? t.slice(0, 24) + '…' : t) : '未设置内容';
    }
    default: return '';
  }
}

// 预览按钮样式（与 cardDetail.ccBtnStyle 完全同口径：颜色/描边/圆角按 props，
// 尺寸/偏移走共享 buttonSizeStyle——预览和详情页两套算法必然漂移，必须共用一份）
function pvBtnStyle(p) {
  p = p || {};
  const s = {};
  if (p.btnStyle === 'outline') {
    s.color = p.strokeColor || '#165DFF';
    s.background = 'transparent';
    s.border = '1px solid ' + (p.strokeColor || '#165DFF');
  } else {
    s.color = p.textColor || '#ffffff';
    s.background = p.bgColor || '#165DFF';
  }
  s.borderRadius = (p.radius == null ? 8 : p.radius) + 'px';
  return Object.assign(s, buttonSizeStyle(p), { maxWidth: '100%' });
}

// schema 条件显隐（对齐 admin 的 when：依赖字段不匹配时整行隐藏，如「描边色」仅描边样式显示）
function fieldVisible(f) {
  if (!f || !f.when) return true;
  const p = (editing.value && editing.value.props) || {};
  return Object.keys(f.when).every((k) => String(p[k]) === String(f.when[k]));
}

// 母版永远排在个人组件前（服务端注入顺序），上移/下移只在个人组件区间内发生
function canMove(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= comps.value.length) return false;
  return !comps.value[i].isLock && !comps.value[j].isLock;
}

async function resolveCardId() {
  const pages = getCurrentPages();
  const opts = (pages[pages.length - 1] || {}).options || {};
  if (opts.id) return opts.id;
  try {
    const safe = await cardApi.getCardsSafe();
    return (safe.cards && safe.cards[0] && safe.cards[0].id) || null;
  } catch (e) { return null; }
}

async function load() {
  loading.value = true;
  const id = await resolveCardId();
  if (!id) {
    loadFailed.value = true;
    loadFailedMsg.value = '未找到你的名片，请先创建名片';
    loading.value = false;
    return;
  }
  cardId.value = id;
  try {
    const res = await cardApi.getCardComponents(id);
    comps.value = (res.components || []).map((c, i) => ({ ...c, key: c.id != null ? `s${c.id}` : `t${i}` }));
    loadFailed.value = false;
  } catch (e) {
    loadFailed.value = true;
    loadFailedMsg.value = '组件加载失败，请检查网络后重试';
  } finally {
    loading.value = false;
  }
}

let keySeq = 0;
function add(type) {
  if (mine.value.length >= COMP_MAX) {
    uni.showToast({ title: `自定义组件最多 ${COMP_MAX} 个`, icon: 'none' });
    return;
  }
  showPanel.value = false;
  // hidden 显式初始化：显示/隐藏开关的数据位（服务端 props 整包透传，无需白名单变更）
  const item = { key: `n${Date.now()}${keySeq++}`, type, props: { ...compDefaultProps(type), hidden: false }, isLock: false };
  comps.value.push(item);
  openEdit(item); // 新增后直接进配置，必填项（视频号ID/视频ID）当场补
}

// 显示/隐藏开关：hidden 存 props（cardDetail 渲染过滤），母版不可切换
function toggleHide(c) {
  if (c.isLock) return;
  const next = !(c.props && c.props.hidden);
  c.props = { ...(c.props || {}), hidden: next };
  saveAll(next ? '已隐藏' : '已显示');
}

function move(i, dir) {
  if (!canMove(i, dir)) return;
  const arr = comps.value.slice();
  const tmp = arr[i];
  arr[i] = arr[i + dir];
  arr[i + dir] = tmp;
  comps.value = arr;
  saveAll('已保存');
}

function remove(c) {
  if (c.isLock) return;
  uni.showModal({
    title: '删除组件',
    content: `确定删除「${nameOf(c.type)}」吗？`,
    success: async (r) => {
      if (!r.confirm) return;
      comps.value = comps.value.filter((x) => x.key !== c.key);
      saveAll('已删除');
    },
  });
}

function openEdit(c) {
  if (c.isLock) return;
  // 深拷贝 props：弹窗内改动不直接落列表，点保存才生效
  editing.value = { key: c.key, type: c.type, props: JSON.parse(JSON.stringify(c.props || {})) };
  styleOpen.value = false; // 每次打开默认收起样式段
}
function closeEdit() { editing.value = null; }

function openPreview() { showPreview.value = true; }
function closePreview() { showPreview.value = false; }

// Android 物理返回/侧滑手势：先关预览层 → 编辑弹窗 → 组件面板，都不开着才真的退页
// （否则用户在预览里侧滑返回会直接退出装修页，未保存修改全丢）
onBackPress(() => {
  if (showPreview.value) { showPreview.value = false; return true; }
  if (editing.value) { editing.value = null; return true; }
  if (showPanel.value) { showPanel.value = false; return true; }
  return false;
});

// 预览画布渲染辅助（与 cardDetail cc-* 同口径）
function pvMarginStyle(c) {
  const p = c.props || {};
  return { marginTop: (p.marginTop || 0) + 'px', marginBottom: (p.marginBottom || 0) + 'px' };
}
function pvImgFail(key) {
  imgFailed.value.add(key);
  imgFailed.value = new Set(imgFailed.value); // 触发响应式（Set 原地改不更新）
}
// 预览内可试跳站内链接（与 cardDetail.jumpCompLink 同口径：仅站内路径，外链忽略）
function pvJump(link) {
  const l = String(link || '').trim();
  if (!l || !l.startsWith('/')) return;
  uni.navigateTo({ url: l, fail: () => {} });
}
// 视频号试跳：MP 直接拉起视频号活动页（与 cardDetail.openChannelsActivity 同参）
function pvOpenChannel(p) {
  if (!p || !p.finderUserName || !p.feedId) return;
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && wx.openChannelsActivity) {
    wx.openChannelsActivity({ finderUserName: p.finderUserName, feedId: p.feedId, fail: () => {} });
  }
  // #endif
}
// 富文本消毒：与 cardDetail.sanitizeRichHtml 同一份逻辑（预览看到的也是消毒后的最终效果）。
// 🔴 正则用 (script|style) 分组 + \1 反向引用，勿拆成两条含 script/style 开标签字面量的正则——
//    测试的样式块提取会误匹配这些字面量（把 script 段吞进「CSS」计数）。
function sanitizeRichHtml(h) {
  let s = String(h || '');
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/javascript\s*:/gi, '');
  return s;
}
// 对齐 cardDetail.ccRichStyle：内层背景/圆角/描边/投影按 props
function pvRichStyle(p) {
  p = p || {};
  const s = { background: p.compBgColor || 'transparent' };
  s.borderRadius = (p.radiusTop ?? 0) + 'px ' + (p.radiusTop ?? 0) + 'px ' + (p.radiusBottom ?? 0) + 'px ' + (p.radiusBottom ?? 0) + 'px';
  if (p.style === 'shadow') s.boxShadow = '0 2px 8px rgba(31,35,41,0.1)';
  if (p.style === 'border') s.border = '1px solid ' + (p.borderColor || '#E5E6EB');
  return s;
}

function saveEdit() {
  const target = comps.value.find((x) => x.key === editing.value.key);
  if (target) target.props = editing.value.props;
  closeEdit();
  saveAll('已保存');
}

function sliderVal(f) {
  const v = Number(editing.value && editing.value.props[f.key]);
  return Number.isFinite(v) ? v : f.min;
}
function onSlide(key, e) {
  if (editing.value) editing.value.props[key] = e.detail.value;
}

function onImgError(key) {
  imgFailed.value.add(key);
  imgFailed.value = new Set(imgFailed.value); // 触发响应式（Set 原地改不更新）
}

async function pickImage(key) {
  uni.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sizeType: ['compressed'],
    success: async (res) => {
      const f = (res.tempFiles && res.tempFiles[0]) || {};
      if (!f.tempFilePath) return;
      uni.showLoading({ title: '上传中…', mask: true });
      try {
        // 复用通用图片上传（/user/avatar-upload 只做存储，返回 URL）
        const data = await cardApi.uploadUserAvatar(f.tempFilePath);
        uni.hideLoading();
        if (data && data.url && editing.value) {
          editing.value.props[key] = data.url;
          imgFailed.value.delete(key); // 新图可能加载成功，清失败标记
          imgFailed.value = new Set(imgFailed.value);
        }
      } catch (e) {
        uni.hideLoading();
        uni.showToast({ title: e.message || '上传失败', icon: 'none' });
      }
    },
  });
}

// 整存：只提交个人组件（剥离 id/isLock/sortOrder，服务端按数组序重排）
// 个人名片单编辑场景，last-write-wins 可接受；多端同编冲突留 V1.2 加版本号
async function saveAll(okText) {
  if (!cardId.value || saving.value) return;
  saving.value = true;
  try {
    const payload = mine.value.map((c) => ({ type: c.type, props: c.props || {} }));
    await cardApi.saveCardComponents(cardId.value, payload);
    uni.showToast({ title: okText || '已保存', icon: 'success' });
  } catch (e) {
    uni.showToast({ title: e.message || '保存失败', icon: 'none' });
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
/* 设计令牌纪律：新页面一律 var(--token)（tokenAudit.test.js 扫裸值）；
   --design-primary 由页面根 themeStyle/brandVars 注入，无需 hex 兜底 */
.ce-page { min-height: 100vh; background: var(--bg-page); }
.ce-body { padding: var(--space-r5) var(--space-r5) 160rpx; }

.ce-desc {
  font-size: var(--fs-3); color: var(--decor); line-height: 1.6;
  background: var(--white); border-radius: var(--radius-md); padding: var(--space-r5); margin-bottom: var(--space-r5);
}
.ce-quota { float: right; color: var(--t2); }
.ce-quota.full { color: var(--danger); }

.ce-empty { text-align: center; padding: 120rpx 0; }
.ce-empty-t { font-size: var(--fs-5); color: var(--t2); font-weight: 500; }
.ce-empty-d { font-size: var(--fs-3); color: var(--decor); margin-top: var(--space-r2); }

.ce-card {
  background: var(--white); border: 1rpx solid var(--border); border-radius: var(--radius-md);
  padding: var(--space-r5); margin-bottom: var(--space-r4);
}
.ce-card.lock { background: var(--bg-card); }
.ce-head { display: flex; align-items: center; }
.ce-icon { font-size: var(--fs-7); margin-right: var(--space-r2); }
.ce-name { font-size: var(--fs-5); color: var(--t1); font-weight: 500; flex: 1; }
.ce-lock-tag {
  font-size: var(--fs-1); color: var(--brand-orange); background: var(--bg-hover);
  border-radius: var(--radius-sm); padding: var(--space-r1) var(--space-r2);
}
.ce-preview { font-size: var(--fs-3); color: var(--decor); margin: var(--space-r2) 0 var(--space-r3); }
.ce-ops { display: flex; gap: var(--space-r2); }
.ce-op {
  font-size: var(--fs-3); color: var(--design-primary);
  border: 1rpx solid var(--design-primary); border-radius: var(--radius-sm);
  padding: var(--space-r1) var(--space-r5);
}
.ce-op.off { color: var(--decor-2); border-color: var(--border); pointer-events: none; }
.ce-op.del { color: var(--danger); border-color: var(--danger); }
.ce-op.del.off { color: var(--decor-2); border-color: var(--border); }
.ce-lock-tip { font-size: var(--fs-2); color: var(--danger); margin-top: var(--space-r2); }

.ce-add {
  margin-top: var(--space-r1); height: 88rpx; border-radius: var(--radius-pill);
  background: var(--design-primary); color: var(--white);
  display: flex; align-items: center; justify-content: center; gap: var(--space-r2);
  font-size: var(--fs-5);
}
.ce-add-plus { font-size: var(--fs-7); }

/* 遮罩 / 底部面板 / 弹窗：同层 var(--z-popup) 靠 DOM 顺序分层（myCard 同款纪律） */
.ce-mask { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-mask); z-index: var(--z-popup); }
.ce-panel {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--z-popup);
  background: var(--white); border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: var(--space-r6) var(--space-r5) calc(var(--space-r5) + env(safe-area-inset-bottom));
}
.ce-panel-t { text-align: center; font-size: var(--fs-6); font-weight: 500; color: var(--t1); margin-bottom: var(--space-r6); }
.ce-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-r5); margin-bottom: var(--space-r5); }
.ce-grid-item { display: flex; flex-direction: column; align-items: center; }
.ce-grid-icon { font-size: var(--fs-8); margin-bottom: var(--space-r2); }
.ce-grid-text { font-size: var(--fs-3); color: var(--t1); }
.ce-cancel {
  text-align: center; height: 80rpx; line-height: 80rpx;
  font-size: var(--fs-5); color: var(--t2); border-top: 1rpx solid var(--bg-hover);
}

.ce-modal {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 85%; max-height: 76vh; z-index: var(--z-popup);
  background: var(--white); border-radius: var(--radius-lg); display: flex; flex-direction: column;
}
.ce-modal-t { text-align: center; font-size: var(--fs-6); font-weight: 500; color: var(--t1); padding: var(--space-r6) 0 var(--space-r1); }
/* MP 的 scroll-view 必须显式定高才滚动：flex:1+min-height:0 在 MP 端不定高 → 不滚、
   内容顶出弹窗压住底部按钮（真机截图实证）。46vh ≈ 弹窗 max-height 76vh 减标题/按钮区；
   样式段默认折叠后内容更短，多余空间在滚动区内留白即可 */
.ce-modal-body { flex: none; height: 46vh; }
.ce-modal-pad { padding: var(--space-r3) var(--space-r6) var(--space-r1); }
.ce-field { margin-bottom: var(--space-r5); }
.ce-label { display: block; font-size: var(--fs-4); color: var(--t1); margin-bottom: var(--space-r2); }
/* 🔴 原生 input/textarea 不吃 box-sizing:border-box、也不吃「父 scroll-view 的 padding」，
   width:100% 或「不设宽」在 MP 上都溢出弹窗。解法是「视图包一层」：边框/背景/圆角/box-sizing
   落在普通 view（.ce-input-wrap，MP 对 view 的 box-sizing 可靠），原生控件本身去边框去 padding、
   只 width:100% 填满包层，MP/H5 都不会溢出。 */
.ce-input-wrap {
  width: 100%; box-sizing: border-box; display: flex;
  border: 1rpx solid var(--border); border-radius: var(--radius-sm); background: var(--white);
}
.ce-input {
  flex: 1; width: 100%; box-sizing: border-box;
  height: 80rpx; line-height: 80rpx; border: none;
  padding: 0 var(--space-r4); font-size: var(--fs-4); background: transparent; color: var(--t1);
}
.ph { color: var(--decor-2); }

.ce-rt-row { width: 100%; }
.ce-textarea {
  flex: 1; width: 100%; box-sizing: border-box;
  min-height: 180rpx; border: none; padding: var(--space-r3) var(--space-r4);
  font-size: var(--fs-4); background: transparent; line-height: 1.5;
}
.ce-rt-tip { display: block; font-size: var(--fs-2); color: var(--decor); margin-top: var(--space-r1); }

.ce-img-row { display: flex; align-items: center; gap: var(--space-r4); }
.ce-img { width: 160rpx; height: 120rpx; border-radius: var(--radius-sm); flex-shrink: 0; }
/* 无图/加载失败占位：浅底 + 虚线框 + 相机图标 + 文案，明确「可点击上传」，
   不再是不带背景的空白块（真机域名没配时示例图裂了也走这里） */
.ce-img-empty {
  width: 160rpx; height: 120rpx; border-radius: var(--radius-sm);
  border: 1rpx dashed var(--border); background: var(--bg-card);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--space-r1); flex-shrink: 0;
}
.ce-img-empty-ico { font-size: var(--fs-5); }
.ce-img-empty-t { font-size: var(--fs-2); color: var(--decor); }
.ce-img-tip { font-size: var(--fs-2); color: var(--decor); }

.ce-color-row { display: flex; align-items: center; gap: var(--space-r3); }
.ce-swatches { display: flex; flex-wrap: wrap; gap: var(--space-r1); flex: 1; }
.ce-sw { width: 40rpx; height: 40rpx; border-radius: var(--radius-sm); border: 1rpx solid var(--border); }
.ce-sw.on { outline: 3rpx solid var(--design-primary); }
.ce-sw.none { background: var(--white); border-style: dashed; }
/* hex 输入框显式定宽：补 box-sizing 让 200rpx 含边框+内边距，避免内容盒叠加 padding 后总宽溢出弹窗 */
/* hex 输入框显式定宽：包层 ce-hex-wrap 用 box-sizing 让 200rpx 为总宽，内层 .ce-hex 去边框去 padding 不会溢出 */
.ce-hex-wrap { width: 200rpx; flex: none; flex-shrink: 0; }
.ce-hex {
  flex: 1; width: 100%; box-sizing: border-box;
  height: 80rpx; line-height: 80rpx; border: none;
  padding: 0 var(--space-r4); font-size: var(--fs-4); background: transparent; color: var(--t1);
}

.ce-slider-row { display: flex; align-items: center; gap: var(--space-r4); }
.ce-slider { flex: 1; }
.ce-slider-v { font-size: var(--fs-3); color: var(--t2); width: 72rpx; text-align: right; }

.ce-radios { display: flex; flex-wrap: wrap; gap: var(--space-r3); }
.ce-radio {
  font-size: var(--fs-3); color: var(--t2); border: 1rpx solid var(--border);
  border-radius: var(--radius-sm); padding: var(--space-r1) var(--space-r5);
}
.ce-radio.on { color: var(--design-primary); border-color: var(--design-primary); background: var(--bg-tag); }

.ce-switch-row { display: flex; justify-content: flex-end; }

.ce-modal-btns { display: flex; gap: var(--space-r4); padding: var(--space-r3) var(--space-r6) var(--space-r6); }
.ce-mbtn { flex: 1; height: 80rpx; line-height: 80rpx; text-align: center; border-radius: var(--radius-sm); font-size: var(--fs-5); }
.ce-mbtn.cancel { background: var(--bg-hover); color: var(--t2); }
.ce-mbtn.save { background: var(--design-primary); color: var(--white); }

/* ===== 组件显示/隐藏开关 ===== */
.ce-hidden-tag {
  font-size: var(--fs-1); color: var(--decor-2); background: var(--bg-hover);
  border-radius: var(--radius-sm); padding: var(--space-r1) var(--space-r2); margin-right: var(--space-r2);
}

/* ===== 弹窗 section 折叠开关行 ===== */
.ce-section-toggle {
  display: flex; align-items: center; justify-content: center; gap: var(--space-r1);
  padding: var(--space-r3) 0; margin-bottom: var(--space-r4);
  border-top: 1rpx dashed var(--border);
  color: var(--design-primary); font-size: var(--fs-3);
}
.ce-section-arrow { font-size: var(--fs-2); }

/* ===== 页内预览按钮 + 全屏预览层（z 与弹窗同层 var(--z-popup)，DOM 顺序靠后自然压顶） ===== */
.ce-preview-btn {
  margin-top: var(--space-r4); margin-bottom: var(--space-r3); height: 80rpx;
  border-radius: var(--radius-pill); background: var(--white);
  border: 1rpx solid var(--design-primary); color: var(--design-primary);
  display: flex; align-items: center; justify-content: center; gap: var(--space-r2);
  font-size: var(--fs-4);
}
.ce-preview-btn-ico { font-size: var(--fs-5); }
.ce-preview-layer {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  z-index: var(--z-popup); background: var(--bg-page);
  display: flex; flex-direction: column;
}
.ce-preview-head { background: var(--white); border-bottom: 1rpx solid var(--border); }
.ce-preview-bar { display: flex; align-items: center; padding-left: var(--space-r2); box-sizing: border-box; }
.ce-preview-back { display: flex; align-items: center; padding: 0 var(--space-r2); height: 100%; }
.ce-preview-back-ico { font-size: var(--fs-6); color: var(--t1); line-height: 1; margin-right: var(--space-r1); }
.ce-preview-back-t { font-size: var(--fs-4); color: var(--t1); }
.ce-preview-title { flex: 1; text-align: center; font-size: var(--fs-5); color: var(--t1); font-weight: 500; }
.ce-preview-done { font-size: var(--fs-4); color: var(--design-primary); padding: var(--space-r3); }
.ce-preview-body { flex: none; }
.ce-preview-canvas { padding: var(--space-r2) var(--space-r5) var(--space-r6); }
.ce-preview-hint { font-size: var(--fs-2); color: var(--decor); text-align: center; padding: var(--space-r2) 0 var(--space-r4); }
.ce-preview-empty { text-align: center; color: var(--decor); font-size: var(--fs-3); padding: 120rpx 0; }

/* 预览画布内的轻量渲染（与 cardDetail cc-* 同口径：结构/边距/配色一致；
   差异点：图片加载失败给占位框，不露灰块/白块——示例图走网络图，域名没配真机必挂） */
.pv-img { width: 100%; display: block; }
.pv-img-fallback {
  width: 100%; height: 200rpx; display: flex; align-items: center; justify-content: center;
  background: var(--bg-card); color: var(--decor); font-size: var(--fs-3);
  border: 1rpx dashed var(--border); border-radius: var(--radius-sm); box-sizing: border-box;
}
.pv-video { position: relative; border-radius: var(--radius-md); overflow: hidden; background: var(--t1); }
.pv-video-cover { width: 100%; height: 360rpx; display: block; }
.pv-video-empty { display: flex; align-items: center; justify-content: center; background: var(--t2); }
.pv-video-play {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 72rpx; height: 72rpx; border-radius: var(--radius-pill);
  background: var(--bg-mask); display: flex; align-items: center; justify-content: center;
}
.pv-video-info {
  position: absolute; left: 0; right: 0; bottom: 0;
  padding: 40rpx var(--space-r4) var(--space-r3);
  background: linear-gradient(transparent, var(--bg-mask));
  display: flex; flex-direction: column; gap: var(--space-r1);
}
.pv-video-t { font-size: var(--fs-4); color: var(--white); font-weight: 500; }
.pv-video-d { font-size: var(--fs-2); color: var(--white); }
.pv-notice {
  display: flex; align-items: center; gap: var(--space-r2);
  padding: var(--space-r3) var(--space-r4);
  border-radius: var(--radius-xs); line-height: 1.5;
}
.pv-notice-dot { width: 8rpx; height: 8rpx; border-radius: var(--radius-pill); background: currentColor; flex-shrink: 0; }
.pv-notice-text { flex: 1; }
.pv-divider { display: flex; align-items: center; gap: var(--space-r3); }
.pv-divider-line { flex: 1; border-top-width: 1px; }
.pv-divider-text { font-size: var(--fs-2); color: var(--decor); flex-shrink: 0; }
.pv-btn-wrap { width: 100%; }
.pv-btn {
  height: 72rpx; line-height: 72rpx; font-size: var(--fs-4); font-weight: 500; text-align: center;
  border-radius: var(--radius-sm); overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.pv-rt-wrap { width: 100%; }
.pv-richtext { display: block; font-size: var(--fs-4); line-height: 1.6; }
</style>
