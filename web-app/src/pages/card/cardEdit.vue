<template>
  <!-- ===== 装修我的名片 · 自定义组件列表管理（2026-10-20 V1）
       产品形态来自《手机端名片装修模块》文档，实现对齐项目现状：
       uni-app 页面（非原生小程序代码）；type/props 对齐 web-admin componentRegistry
       （视频号是 finderUserName+feedId，不是旧文档的 feedToken）；母版组件由服务端
       注入 isLock，本页只读置灰；保存走 PUT 整存（server card.js 归属校验+白名单）。 ===== -->
  <view class="ce-page" :style="[themeStyle, brandVars]">
    <!-- 预览入口放导航栏右侧：组件一多，底部按钮要滚到最后才能点到（用户反馈）。
         PageNav 是 sticky 的（标题层已绝对居中，加右插槽不会把标题挤偏），任何滚动位置都可达。 -->
    <PageNav title="装修我的名片" back>
      <template #right>
        <text class="ce-nav-preview" @click="openPreview">预览</text>
      </template>
    </PageNav>

    <view class="ce-body">
      <view class="ce-desc">
        组件展示在名片详情页「简介」标签下方。点组件可编辑；选中组件后可移动、复制、删除、隐藏。
        <text class="ce-quota" :class="{ full: mine.length >= COMP_MAX }">已添加 {{ mine.length }}/{{ COMP_MAX }} 个</text>
      </view>

      <view class="ce-empty" v-if="!comps.length && !loading">
        <view class="ce-empty-t">还没有自定义组件</view>
        <view class="ce-empty-d">点击下方「添加组件」，放图片、视频号、文本等到名片里</view>
      </view>

      <!-- 所见即所得：列表里直接用名片详情页那套渲染组件（CardCompItem），
           改什么一眼看到什么，不再隔着一套「预览版」自己写的值 = 必然漂移 -->
      <view class="ce-list">
        <block v-for="(c, i) in comps" :key="c.key">
          <view class="ce-card" :class="{ lock: c.isLock, off: c.props && c.props.hidden }">
            <!-- 选中环：独立绝对定位元素，**不画在卡片边框上**——
                 边框会各占 0.5px 把组件捏窄 1px，破坏与真实页的像素对齐 -->
            <view v-if="activeKey === c.key" class="ce-ring"></view>
            <!-- 母版标记**常驻**：操作条只在选中时浮现（对齐 PC 的 hover），
                 但锁状态不能跟着一起隐掉，否则用户不知道这张为何不能改 -->
            <text v-if="c.isLock" class="ce-lock-badge">企业母版</text>
            <!-- 真实渲染区：hidden 的组件按半透明折叠态显示，仍知道它排在哪 -->
            <view class="ce-render" @click="tapCard(c)">
              <CardCompItem :comp="c" :interactive="false" />
              <view v-if="c.props && c.props.hidden" class="ce-render-mask">
                <text class="ce-render-mask-t">已隐藏 · 名片上不显示</text>
              </view>
            </view>
            <!-- 操作条：1:1 对齐设计中心画布的 `.pe-comp-tools` —— 主色浮条 + 序号 + 组件名 + 图标，
                 **浮在组件右上角**（不另占空间，渲染区不会被推走 = 真所见即所得），
                 **选中才浮现**（PC 靠 hover，手机没有 hover，用点选代替）。
                 🔴 为什么不贴组件外沿：组件间距只有 6px（组件自身 marginTop），
                    浮条约 46rpx 高，贴外沿会压到上一张卡；也不放进 .ce-render（它有 overflow:hidden 会被裁）。
                    浮条 4px 内嵌是「压角浮标」：与 PC 设计中心一样允许短暂遮住组件一角，
                    这是选中态才有的临时态，不影响未选中时的所见即所得。
                 🔴 复制图标用两个真实 view 叠出，不用 U+29C9 那个「双联方框」字符：
                    它在小程序系统字体里大概率是豆腐块；SIcon 的 MP 端是预生成 PNG、
                    颜色写死在文件名里，做不出白色变体。（测试禁止本文件出现该字形，
                    注释里也别写——写了就会被后人复制回代码里） -->
            <view v-if="activeKey === c.key" class="ce-tools" @click.stop>
              <text class="ce-tools-idx">{{ i + 1 }}</text>
              <text class="ce-tools-name">{{ nameOf(c.type) }}</text>
              <view class="ce-tool" :class="{ off: c.isLock }" @click.stop="toggleHide(c)">
                <text class="ce-tool-lbl">{{ c.props && c.props.hidden ? '显示' : '隐藏' }}</text>
              </view>
              <view class="ce-tool" :class="{ off: c.isLock || !canMove(i, -1) }" @click.stop="move(i, -1)"><text class="ce-tool-ico">↑</text></view>
              <view class="ce-tool" :class="{ off: c.isLock || !canMove(i, 1) }" @click.stop="move(i, 1)"><text class="ce-tool-ico">↓</text></view>
              <view class="ce-tool" :class="{ off: c.isLock }" @click.stop="dup(i, c)">
                <view class="ce-ico-dup"><view class="ce-dup-b"></view><view class="ce-dup-f"></view></view>
              </view>
              <view class="ce-tool del" :class="{ off: c.isLock }" @click.stop="remove(c)"><text class="ce-tool-ico">✕</text></view>
            </view>
          </view>
        </block>
      </view>

      <!-- 底部入口保留并改为吸底：列表再长也不用滚到最后。
           现两个常驻入口：导航栏右侧「预览」（滚动位置无关）+ 本吸底按钮 -->
      <view class="ce-preview-bar-wrap">
        <view class="ce-preview-btn" @click="openPreview">
          <text class="ce-preview-btn-ico">👁</text>
          <text>预览效果（含未保存修改）</text>
        </view>
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
          <image class="ce-grid-icon" :src="t.icon" mode="aspectFit" />
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
                :src="resolveAssetUrl(editing.props[f.key])"
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

        <!-- 按钮组专属编辑器：移动端 schema 不支持 list 控件，按钮明细（2-5 个）走这里维护 -->
        <view v-if="editing && editing.type === 'button-group'" class="ce-btns-editor">
          <view class="ce-section-t">按钮（{{ editing.props.buttons.length }}/5）</view>
          <view v-for="(b, bi) in editing.props.buttons" :key="bi" class="ce-btn-card">
            <view class="ce-btn-card-head">
              <text class="ce-btn-card-t">按钮 {{ bi + 1 }}</text>
              <text v-if="editing.props.buttons.length > 2" class="ce-btn-del" @click="removeButton(bi)">删除</text>
            </view>
            <view class="ce-field">
              <text class="ce-label">文字</text>
              <view class="ce-input-wrap"><input class="ce-input" v-model="b.text" placeholder="按钮文字" placeholder-class="ph" /></view>
            </view>
            <view class="ce-field">
              <text class="ce-label">跳转</text>
              <view class="ce-input-wrap"><input class="ce-input" v-model="b.url" placeholder="如 /pages/card/market" placeholder-class="ph" /></view>
            </view>
            <view class="ce-field">
              <text class="ce-label">样式</text>
              <view class="ce-radios">
                <view class="ce-radio" :class="{ on: b.btnStyle === 'fill' }" @click="b.btnStyle = 'fill'">填充</view>
                <view class="ce-radio" :class="{ on: b.btnStyle === 'outline' }" @click="b.btnStyle = 'outline'">描边</view>
              </view>
            </view>
            <view class="ce-field">
              <text class="ce-label">按钮色</text>
              <view class="ce-color-row">
                <view class="ce-swatches">
                  <view v-for="col in SWATCHES" :key="col.name" class="ce-sw" :class="{ on: (b.bgColor || '') === col.value, none: col.value === '' }" :style="{ background: col.value || '#fff' }" @click="b.bgColor = col.value"></view>
                </view>
                <view class="ce-input-wrap ce-hex-wrap"><input class="ce-hex" v-model="b.bgColor" placeholder="留空=透明，或 #RRGGBB" placeholder-class="ph" /></view>
              </view>
            </view>
            <view class="ce-field">
              <text class="ce-label">文字色</text>
              <view class="ce-color-row">
                <view class="ce-swatches">
                  <view v-for="col in SWATCHES" :key="col.name" class="ce-sw" :class="{ on: (b.textColor || '') === col.value, none: col.value === '' }" :style="{ background: col.value || '#fff' }" @click="b.textColor = col.value"></view>
                </view>
                <view class="ce-input-wrap ce-hex-wrap"><input class="ce-hex" v-model="b.textColor" placeholder="如 #ffffff" placeholder-class="ph" /></view>
              </view>
            </view>
          </view>
          <view v-if="editing.props.buttons.length < 5" class="ce-btn-add" @click="addButton">+ 添加按钮</view>
        </view>
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
          <!-- 与列表、名片详情页同一套渲染组件：预览 = 真实效果，不存在「预览看着对、发出去不对」 -->
          <view v-for="c in previewComps" :key="c.key" class="pv-item">
            <CardCompItem :comp="c" />
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import CardCompItem from '../../components/CardCompItem.vue';
import { ref, computed, onMounted } from 'vue';
import { onBackPress } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { useDesignTheme, resolveAssetUrl } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';
import { getNavMetrics } from '../../utils/navMetrics.js';
import { CARD_COMP_REGISTRY, getCompDef, compDefaultProps } from './cardCompRegistry.js';

const themeStyle = useDesignTheme();
const { brandVars, brandPrimary } = useBrandOverride();
// slider/switch 的 color 不吃 var()（同 SIcon 纪律），喂真实 hex：品牌色优先，回落主题色
const activeColor = computed(() => brandPrimary.value || themeStyle.value['--design-primary'] || '#FE0137');

// 服务端 card.js COMP_MAX 同源（超限 400）；单测钉两边一致
const COMP_MAX = 20;

// 组件图标直接取注册表 t.icon（设计中心同款 PNG，避免 emoji 与设计中心不一致，反馈 #279）
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
// 当前选中组件的 key：操作条只在选中时浮现（对齐 PC 的 hover 触发）
const activeKey = ref(null);
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

// 组件名进了浮条（对齐 PC `.pe-comp-type`），不再有独立标题行，故 iconOf 已无用：
// 列表里认类型靠浮条上的文字名 + 组件自身渲染结果，比一个 emoji 图标更准。
function nameOf(type) { const d = getCompDef(type); return d ? d.name : '组件'; }
function schemaOf(type) { const d = getCompDef(type); return d ? d.schema : []; }



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
  activeKey.value = item.key; // 新增后选中它，操作条直接可见（对齐 PC 复制后选中新组件）
  openEdit(item); // 新增后直接进配置，必填项（视频号ID/视频ID）当场补
}

// 按钮组：维护 2-5 个按钮（移动端 schema 无 list 控件，走专属编辑器）
function addButton() {
  const list = editing.value && editing.value.props && editing.value.props.buttons;
  if (!list || list.length >= 5) return;
  list.push({ text: '按钮' + (list.length + 1), url: '', btnStyle: 'fill', bgColor: '#165DFF', textColor: '#ffffff' });
}
function removeButton(i) {
  const list = editing.value && editing.value.props && editing.value.props.buttons;
  if (!list || list.length <= 2) return;
  list.splice(i, 1);
}

/**
 * 点卡片：手机没有 hover，用「点选」代替 PC 的 hover 浮现。
 * 已选中时再点一次 = 进配置（保留原来「点组件即编辑」的手感，只是先确认选中）。
 * 母版也允许选中——浮条整体置灰，比一句「不可修改」的文字更能说明它为何动不了。
 */
function tapCard(c) {
  if (activeKey.value === c.key) { openEdit(c); return; }
  activeKey.value = c.key;
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
      // 删的正是选中项：选中态跟着清掉，否则浮条会挂在一个已不存在的 key 上
      if (activeKey.value === c.key) activeKey.value = null;
      saveAll('已删除');
    },
  });
}

// 复制：对齐 PC 端 dupComp——插到原组件**后面**、props 深拷贝、母版不可复制、受 COMP_MAX 约束。
// 不自动弹配置（不同于 add）：复制通常是「改一点」，弹窗会打断连续复制；列表里已能直接看到结果。
function dup(i, c) {
  if (c.isLock) return;
  if (mine.value.length >= COMP_MAX) {
    uni.showToast({ title: `自定义组件最多 ${COMP_MAX} 个`, icon: 'none' });
    return;
  }
  const item = {
    key: `n${Date.now()}${keySeq++}`,
    type: c.type,
    props: JSON.parse(JSON.stringify(c.props || {})),
    isLock: false,
  };
  const arr = comps.value.slice();
  arr.splice(i + 1, 0, item);
  comps.value = arr;
  activeKey.value = item.key; // 选中新复制的这份（对齐 PC dupComp 后 selected = 新组件）
  saveAll('已复制');
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
        // 复用通用图片上传（/user/avatar-upload 只做存储，返回 URL）。
        // 🔴 H5 端 chooseMedia 的 tempFiles[i] 同时带 file（File 对象），必须一并传给上传器——
        //    H5 的 uni.uploadFile 对 blob URL 无效，要靠 FormData 携带真实 File 才能把图发出去。
        const data = await cardApi.uploadUserAvatar(f.tempFilePath, f.file);
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
/* 🔴 间距口径（2026-10-21 三轮返工后定稿）：装修页 = 预览层 = 真实名片页，三者逐像素一致。
   真实页 `.cc-list { margin: 0 28rpx }`（14px）+ 组件自身 marginTop（默认 6px）就是全部间距。
   本页曾因 `.ce-card` 带 padding(4px)×2 + margin-bottom(6px)，组件间距被撑到 20px，
   用户报「设计和预览差距大，主要是组件与组件的间隔」——**外壳每层都合理，加起来就失真**。
   所以：ce-body 左右直接写 28rpx（与 .cc-list 同值，补偿掉卡片原有的 4px padding），
   ce-card 零 padding 零 margin-bottom，间距只由组件自身 marginTop 决定。 */
.ce-body { padding: var(--space-r5) 28rpx 160rpx; }

.ce-desc {
  font-size: var(--fs-3); color: var(--decor); line-height: 1.6;
  background: var(--white); border-radius: var(--radius-md); padding: var(--space-r5); margin-bottom: var(--space-r5);
}
.ce-quota { float: right; color: var(--t2); }
.ce-quota.full { color: var(--danger); }

.ce-empty { text-align: center; padding: 120rpx 0; }
.ce-empty-t { font-size: var(--fs-5); color: var(--t2); font-weight: 500; }
.ce-empty-d { font-size: var(--fs-3); color: var(--decor); margin-top: var(--space-r2); }

/* 🔴 卡片不再是「预览盒子」，也不再是「间距外壳」：无底色（母版 lock 除外）、无边框、
   **零 padding、零 margin-bottom**。组件间距 100% 由组件自身 marginTop（默认 6px）决定，
   与真实名片页 `.cc-list` 逐像素一致（headless 实测：三场景 x/width/gap 全等）。
   旧版 padding 4px×2 + margin-bottom 6px 把间距撑到 20px（真实页 6px）→「设计预览两张皮」。
   🔴 选中框**不画在卡片边框上**：那会各占 0.5px 把组件捏窄 1px，
     改用独立绝对定位的 .ce-ring（见下），零布局影响。 */
.ce-card {
  position: relative;
  border-radius: var(--radius-sm);
}
/* 选中环：absolute + inset 0，只描边不占布局（对齐 PC `.pe-comp.active` 的选中框）。
   pointer-events:none 让点击穿过去打到卡片；z-index 1 压在渲染区之上、操作条(3)之下 */
.ce-ring {
  position: absolute; left: 0; top: 0; right: 0; bottom: 0;
  border: 1rpx solid var(--design-primary); border-radius: var(--radius-sm);
  pointer-events: none; z-index: 1;
}
/* 渲染区不再自带「盒子」：无背景、无圆角、无内外距——
   组件直接贴在卡片内沿，与真实渲染（.cc-item { width:100% }）完全一致 */
.ce-render { position: relative; overflow: hidden; }
.ce-card.off .ce-render { opacity: 0.5; }
.ce-render-mask {
  position: absolute; left: 0; right: 0; top: 0; bottom: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-mask);
}
.ce-render-mask-t { font-size: var(--fs-3); color: var(--white); }
.pv-item { width: 100%; }
.ce-card.lock { background: var(--bg-card); }
/* 母版标记常驻左上角：操作条是选中才浮现的，锁状态不能跟着隐掉。
   卡片已零 padding，徽标 4px 内嵌 = 压角浮标（与操作条同思路，PC 设计中心的锁标记也是压角的） */
.ce-lock-badge {
  position: absolute; left: var(--space-r1); top: var(--space-r1); z-index: 2;
  font-size: var(--fs-1); color: var(--brand-orange); background: var(--bg-hover);
  border-radius: var(--radius-sm); padding: 2rpx 8rpx;
}

/* 操作条：1:1 对齐设计中心画布的 `.pe-comp-tools`（主色浮条 + 序号 + 组件名 + 图标）。
   🔴 浮在卡片**右上角**而不是另起一行：渲染区不会被推走，才是真所见即所得；
      也不贴卡片外沿——卡片间距仅 20rpx，浮条约 46rpx 高会压到上一张卡。
   🔴 整条只有 46rpx 高（PC 同款量级）：图标 26rpx、按钮 40rpx，
      比上一版 84rpx 的胶囊条小一半，手指点选时它是刻意交互而非常驻噪音。 */
.ce-tools {
  position: absolute; top: var(--space-r1); right: var(--space-r1); z-index: 3;
  display: flex; align-items: center; gap: var(--space-r1);
  background: var(--design-primary); color: #fff;
  border-radius: var(--radius-sm); padding: 3rpx 6rpx;
  white-space: nowrap;
  /* 🔴 复用项目已有的「卡片浮起」投影写法（0 4rpx 16rpx rgba(0,0,0,.04)，白卡同款），
     不另写一种：tokenAudit 按写法**种类**计数，为一个小浮条新增一种投影会直接顶破基线。 */
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04);
}
.ce-tools-idx {
  font-size: var(--fs-2); background: rgba(255,255,255,.25);
  border-radius: 4rpx; padding: 0 6rpx;
}
.ce-tools-name { font-size: var(--fs-3); }
.ce-tool {
  height: 40rpx; min-width: 40rpx; padding: 0 4rpx;
  display: flex; align-items: center; justify-content: center; border-radius: 6rpx;
}
.ce-tool-ico { font-size: 26rpx; color: #fff; line-height: 1; }
.ce-tool-lbl { font-size: var(--fs-2); color: #fff; }
.ce-tool.del { background: var(--danger); }
/* 置灰：母版组件整条不可操作（pointer-events 写法 MP 实测有效）
   🔴 置灰时删除键退回透明底：否则 opacity 会把红底混成暗紫（红+蓝=脏色） */
.ce-tool.off { opacity: 0.35; pointer-events: none; }
.ce-tool.del.off { background: transparent; }
/* 复制图标：两个方框叠出「两份」的意向。
   🔴 用真实 view，不用伪元素也不用 U+29C9 那个「双联方框」字符：WXSS 伪元素在普通
      view 上不可靠，而该字符在系统字体里常是豆腐块。前块背景必须 = 浮条底色，
      才能遮出 L 形边。 */
.ce-ico-dup { position: relative; width: 24rpx; height: 24rpx; }
.ce-dup-b {
  position: absolute; left: 0; top: 0; width: 16rpx; height: 16rpx;
  border: 2rpx solid #fff; border-radius: 3rpx; box-sizing: border-box;
}
.ce-dup-f {
  position: absolute; left: 8rpx; top: 8rpx; width: 16rpx; height: 16rpx;
  border: 2rpx solid #fff; border-radius: 3rpx; box-sizing: border-box;
  background: var(--design-primary);
}
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
.ce-grid-icon { width: 56rpx; height: 56rpx; margin-bottom: var(--space-r2); }
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
/* 按钮组专属编辑器（移动端 schema 无 list 控件，按钮明细走这里） */
.ce-btns-editor { margin-top: var(--space-r5); }
.ce-btn-card { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-r4); margin-bottom: var(--space-r4); }
.ce-btn-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-r3); }
.ce-btn-card-t { font-size: var(--fs-4); font-weight: 600; color: var(--t1); }
.ce-btn-del { font-size: var(--fs-3); color: var(--danger, #f53f3f); }
.ce-btn-add { text-align: center; padding: var(--space-r4); border: 1px dashed var(--border); border-radius: var(--radius-sm); color: var(--primary, #165dff); font-size: var(--fs-4); }
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
/* 导航栏右侧「预览」入口：列表再长也不用滚，PageNav 是 sticky 的 */
.ce-nav-preview {
  font-size: var(--fs-4);
  color: var(--design-primary);
  padding: var(--space-r3) var(--space-r2);
}
/* 底部入口吸底包裹层：自带页面底色，避免列表内容从胶囊按钮两侧透出来 */
.ce-preview-bar-wrap {
  position: sticky;
  bottom: 0;
  z-index: 5;
  padding: var(--space-r3) 0;
  background: var(--bg-page);
}
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
/* 预览画布：左右 28rpx 与真实页 `.cc-list { margin: 0 28rpx }` 同值——
   预览 = 真实效果的最后一块拼图（旧值 24rpx 会让组件比真实页宽 4px） */
.ce-preview-canvas { padding: var(--space-r2) 28rpx var(--space-r6); }
.ce-preview-hint { font-size: var(--fs-2); color: var(--decor); text-align: center; padding: var(--space-r2) 0 var(--space-r4); }
.ce-preview-empty { text-align: center; color: var(--decor); font-size: var(--fs-3); padding: 120rpx 0; }

</style>
