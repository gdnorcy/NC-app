<template>
  <!-- 装修组件渲染器（单一渲染源）
       原来 cardDetail.vue 内联渲染、cardEdit.vue 又抄一份「预览版」——两端必然漂移
       （已多次出现 notice 少圆点 / divider 双线 / rich-text 用错背景字段等）。
       抽成本组件后：详情页与装修页共用同一份结构与样式，装修页就是所见即所得。
       interactive=false 时（装修页）不触发跳转/拉起视频号，只把点击冒泡给父级处理。 -->
  <view class="cci-root">
    <!-- 图片 -->
    <!-- 图片：maxHeight>0 时改用 aspectFit + maxHeight 实现「按比例缩放到不超过限高」
         （widthFix 是宽度固定、高度自适应，**无法限高**；aspectFit 等比缩放不裁切不变形）。
         maxHeight=0 → 保持原 widthFix 行为（向后兼容存量配置）。 -->
    <image
      v-if="type === 'image' && props.url && !imgFailed"
      class="cc-img"
      :src="resolveAssetUrl(props.url)"
      :mode="imgMaxHeight > 0 ? 'aspectFit' : 'widthFix'"
      :style="[ccStyle, imgMaxHeight > 0 ? { maxHeight: imgMaxHeight + 'px', width: 'auto', height: 'auto', maxWidth: '100%', margin: '0 auto' } : null]"
      @error="imgFailed = true"
      @click="onTap('link', props.link)"
    />
    <view v-else-if="type === 'image'" class="cc-img-fallback" :style="ccStyle">
      <text class="cc-img-fallback-t">图片加载失败，请检查图片地址</text>
    </view>

    <!-- 视频号（finderUserName + feedId） -->
    <view v-else-if="type === 'channel-video'" class="cc-video" :style="ccStyle" @click="onTap('video')">
      <image v-if="props.cover && !coverFailed" class="cc-video-cover" :src="resolveAssetUrl(props.cover)" mode="aspectFill" @error="coverFailed = true" />
      <view v-else class="cc-video-cover cc-video-empty"><SIcon name="dynamic" size="large" color="#ffffff" /></view>
      <view class="cc-video-play"><SIcon name="play" size="default" color="#ffffff" /></view>
      <view v-if="props.title || props.desc" class="cc-video-info">
        <text v-if="props.title" class="cc-video-t">{{ props.title }}</text>
        <text v-if="props.desc" class="cc-video-d">{{ props.desc }}</text>
      </view>
    </view>

    <!-- 文本（notice） -->
    <view
      v-else-if="type === 'notice'"
      class="cc-notice"
      :style="[ccStyle, noticeStyle]"
      @click="onTap('link', props.url)"
    >
      <!-- 🔴 #321：原来这里写死一个小圆点（用户输入文字后左边凭空多个点）。
           现在按 symbol 配置渲染，'none'（默认）不渲染任何符号。
           ⚠️ 用字符而非 CSS 伪元素：WXSS 伪元素在小程序普通 view 上不可靠；
           ⚠️ 圆点/方块类符号仍用真实 view 画（形状可控），文字类用 <text>。 -->
      <view v-if="noticeSymbolShape" class="cc-notice-sym" :class="noticeSymbolShape"></view>
      <text v-else-if="noticeSymbolText" class="cc-notice-sym-text">{{ noticeSymbolText }}</text>
      <text class="cc-notice-text" :class="{ 'cc-notice-text-inline': noticeAlign !== 'left' }">{{ props.text }}</text>
    </view>

    <!-- 分割线 -->
    <view v-else-if="type === 'divider'" class="cc-divider" :style="ccStyle">
      <view class="cc-divider-line" :style="{ borderTopWidth: (props.thickness || 1) + 'px', borderTopStyle: props.lineStyle || 'solid', borderTopColor: props.color || '#e5e6eb' }"></view>
      <text v-if="props.text" class="cc-divider-text">{{ props.text }}</text>
    </view>

    <!-- 空白占位 -->
    <view
      v-else-if="type === 'spacer'"
      :style="[ccStyle, { height: (props.height == null ? 20 : props.height) + 'px', background: props.bgColor || 'transparent' }]"
    ></view>

    <!-- 跳转按钮（宽度/偏移走共享 buttonSizeStyle，颜色圆角按 props） -->
    <view v-else-if="type === 'button'" class="cc-btn-wrap" :style="ccStyle">
      <view class="cc-btn" :style="btnStyle" @click="onTap('link', props.url)">{{ props.text || '按钮' }}</view>
    </view>

    <!-- 按钮组（2-5 个横排操作按钮，明细由装修页专属编辑器维护） -->
    <view v-else-if="type === 'button-group'" class="cc-btngrp" :style="btnGrpStyle">
      <view
        v-for="(b, bi) in (props.buttons || [])"
        :key="bi"
        class="cc-btngrp-btn"
        :class="{ outline: b.btnStyle === 'outline' }"
        :style="btnGrpItemStyle(b)"
        @click="onTap('link', b.url, b)"
      >{{ b.text || '按钮' }}</view>
    </view>

    <!-- 富文本（HTML 渲染前消毒：租户自填但访客可见，防 H5 端注入） -->
    <view
      v-else-if="type === 'rich-text'"
      class="cc-rt-wrap"
      :style="[ccStyle, { background: (props.bottomBg && props.bottomBg !== 'transparent') ? props.bottomBg : 'transparent' }]"
    >
      <rich-text class="cc-richtext" :nodes="sanitizeRichHtml(props.html || '<p>富文本内容</p>')" :style="richStyle"></rich-text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
// 🔴 反馈 #298：统一跳转执行（外部小程序/网页/电话）
import { execCompLink } from '../utils/compLink.js';
import { normalizeLink } from '../utils/compLinkModel.js';
import SIcon from './SIcon.vue';
import { buttonSizeStyle } from '../utils/btnSize.js';
import { resolveAssetUrl } from '../utils/design.js';

const propsDef = defineProps({
  /** { type, props } 单个装修组件 */
  comp: { type: Object, required: true },
  /** false = 装修页：不跳转，只把点击交给父级（emits tap） */
  interactive: { type: Boolean, default: true },
});
const emit = defineEmits(['tap']);

const type = computed(() => (propsDef.comp && propsDef.comp.type) || '');
const props = computed(() => (propsDef.comp && propsDef.comp.props) || {});

// 图片加载失败：示例图走网络图，域名没配真机会露白块/灰块 → 给占位框（详情页同样受益）
const imgFailed = ref(false);
const coverFailed = ref(false);
watch(() => props.value.url, () => { imgFailed.value = false; });
watch(() => props.value.cover, () => { coverFailed.value = false; });

/** 组件通用外边距（只有图片吃 radius，与历史渲染口径一致） */
const ccStyle = computed(() => {
  const p = props.value;
  const st = { marginTop: (p.marginTop || 0) + 'px', marginBottom: (p.marginBottom || 0) + 'px' };
  if (type.value === 'image' && p.radius) st.borderRadius = p.radius + 'px';
  return st;
});

// 🔴 反馈 #299：文本组件「居中/居左/居右」+「左边偏移」
//   语义判定（用户只说「居中」，需定死）：**整条公告（圆点 + 文字）的对齐方式**，
//   而不是仅文字区——因为文字区是 flex:1 撑满整行的，只对齐文字等于「左对齐 + 后面留白」，
//   视觉上等同于没生效。故居中/居右时改为 justify-content 对应值，且文字区不再 flex:1。
const noticeAlign = computed(() => {
  const a = props.value.align;
  return a === 'center' || a === 'right' ? a : 'left';
});

// 🔴 #321：前置符号（8 种+ 无）。分两类：
//   - shape 类（dot/square/arrow/diamond/bar）：用真实 view 画，形状与尺寸可控；
//   - 字符类（check/star）：直接输出字符（★ 在小程序字体里可显示，⧉ 那种才会豆腐块）。
const NOTICE_SYMBOLS = {
  dot: { shape: 'is-dot' },
  square: { shape: 'is-square' },
  arrow: { shape: 'is-arrow' },
  diamond: { shape: 'is-diamond' },
  bar: { shape: 'is-bar' },
  check: { text: '\u2713' },
  star: { text: '\u2605' },
};
const noticeSymbol = computed(() => NOTICE_SYMBOLS[props.value.symbol] || null);
const noticeSymbolShape = computed(() => (noticeSymbol.value && noticeSymbol.value.shape) || '');
const noticeSymbolText = computed(() => (noticeSymbol.value && noticeSymbol.value.text) || '');

const noticeStyle = computed(() => {
  const p = props.value;
  const st = {
    background: p.bgColor || 'transparent',
    color: p.color || '#1d2129',
    fontSize: (p.fontSize || 14) + 'px',
    fontWeight: p.bold ? 600 : 400,
  };
  if (noticeAlign.value === 'center') st.justifyContent = 'center';
  else if (noticeAlign.value === 'right') st.justifyContent = 'flex-end';
  // 左边偏移：整条公告相对容器左边平移（负数向左）。用 marginLeft 而非 transform，
  // 避免 transform 造层叠上下文影响点击热区。
  const off = Number(p.offsetX) || 0;
  if (off) st.marginLeft = off + 'px';
  return st;
});

// 🔴 反馈 #299：图片组件限高（按比例缩放）
//   maxHeight = 0 → 不限制（保持原 mode="widthFix" 行为，向后兼容存量配置）
//   maxHeight > 0 → 固定高容器 + aspectFit 等比缩放（不裁切、不变形）
const imgMaxHeight = computed(() => Math.max(0, Number(props.value.maxHeight) || 0));

const btnStyle = computed(() => {
  const p = props.value;
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
});

// 按钮组：外层横向 flex + 间距；每个按钮等分宽度、按自身样式着色
const btnGrpStyle = computed(() => {
  const p = props.value;
  return {
    marginTop: (p.marginTop || 0) + 'px',
    marginBottom: (p.marginBottom || 0) + 'px',
    gap: (p.gap || 0) + 'px',
  };
});
function btnGrpItemStyle(b) {
  const s = { flex: '1 1 0', minWidth: 0, borderRadius: '8px' };
  if (b.btnStyle === 'outline') {
    s.color = b.bgColor || '#165DFF';
    s.border = '1px solid ' + (b.bgColor || '#165DFF');
    s.background = 'transparent';
  } else {
    s.color = b.textColor || '#ffffff';
    s.background = b.bgColor || '#165DFF';
  }
  return s;
}

const richStyle = computed(() => {
  const p = props.value;
  const s = { background: p.compBgColor || 'transparent' };
  s.borderRadius = (p.radiusTop == null ? 0 : p.radiusTop) + 'px ' + (p.radiusTop == null ? 0 : p.radiusTop) + 'px ' + (p.radiusBottom == null ? 0 : p.radiusBottom) + 'px ' + (p.radiusBottom == null ? 0 : p.radiusBottom) + 'px';
  if (p.style === 'shadow') s.boxShadow = '0 2px 8px rgba(31,35,41,0.1)';
  if (p.style === 'border') s.border = '1px solid ' + (p.borderColor || '#E5E6EB');
  return s;
});

// 富文本 HTML 消毒：内容由租户在后台填写、但被所有访客渲染，必须防注入。
// MP 的 rich-text 本就不执行脚本，这里是防 H5 端解析 nodes 时带入 on* 事件/javascript: 协议。
// 🔴 正则用 (script|style) 分组 + \1 反向引用，勿拆成两条含 script/style 开标签字面量的正则——
//    测试的样式块提取会误匹配这些字面量（把 script 段吞进「CSS」计数）。
function sanitizeRichHtml(h) {
  let s = String(h || '');
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/javascript\s*:/gi, '');
  return s;
}

/** 组件内链接：站内页面路径跳转；外链/空值忽略 */
/**
 * 组件链接跳转（🔴 反馈 #298：支持外部小程序 / 网页 / 电话，默认内部页面）
 * 与 DesignPage.vue 的 onJump 走同一套语义（utils/compLink.js）→ 两条 C 端路径不分裂。
 */
function jumpCompLink(link) {
  const l = String(link || '').trim();
  if (!l || !l.startsWith('/')) return;
  uni.navigateTo({ url: l, fail: () => {} });
}

/** 从组件 props 构造链接配置（🔴 反馈 #298/#301） */
function compLinkOf(p) {
  return normalizeLink(p || {});
}

function openChannelVideo(v) {
  if (!v || !v.finderUserName || !v.feedId) return;
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && wx.openChannelsActivity) {
    wx.openChannelsActivity({ finderUserName: v.finderUserName, feedId: v.feedId, fail: () => {} });
  }
  // #endif
}

function onTap(kind, extra, linkCfg) {
  emit('tap', { kind, value: extra, comp: propsDef.comp });
  if (!propsDef.interactive) return; // 装修页：不跳转，交给列表处理选中/编辑
  if (kind === 'video') {
    openChannelVideo(props.value);
    return;
  }
  // 🔴 反馈 #298：link 类跳转统一走 execCompLink（内部页面/外部小程序/网页/电话）
  // 🔴 #301：按钮组里每个按钮有**自己的**链接配置（linkCfg），
  //   组件级 props 里没有 linkType（button-group 的类型在 buttons 数组里）
  //   → 不传 linkCfg 时会退化成按组件级 internal 跳（= 永远跳不对）。
  const cfg = linkCfg || compLinkOf(props.value);
  if (execCompLink(cfg)) return;
  jumpCompLink(extra);
}
</script>

<style scoped>
.cci-root { width: 100%; display: block; }
.cc-img { width: 100%; display: block; }
/* 图片失败占位：真机没配图片域名时不再露白块 */
.cc-img-fallback {
  width: 100%; height: 200rpx; display: flex; align-items: center; justify-content: center;
  background: var(--bg-card); border: 1rpx dashed var(--border);
  border-radius: var(--radius-sm); box-sizing: border-box;
}
.cc-img-fallback-t { font-size: var(--fs-3); color: var(--decor); }
/* 跳转按钮：静态尺寸走令牌类，颜色/宽度由内联（props 驱动） */
.cc-btn-wrap { width: 100%; }
.cc-btn {
  height: 72rpx; line-height: 72rpx; font-size: var(--fs-4); font-weight: 500;
  border-radius: var(--radius-sm); overflow: hidden;
  white-space: nowrap; text-overflow: ellipsis;
}
/* 按钮组：横排等分，间距由 props.gap 驱动 */
.cc-btngrp { width: 100%; display: flex; }
.cc-btngrp-btn {
  height: 72rpx; line-height: 72rpx; font-size: var(--fs-4); font-weight: 500;
  border-radius: var(--radius-sm); text-align: center; overflow: hidden;
  white-space: nowrap; text-overflow: ellipsis;
}
/* 富文本：外层 bottomBg、内层 compBgColor（与 admin 两层结构一致） */
.cc-rt-wrap { width: 100%; }
.cc-richtext { display: block; font-size: var(--fs-4); line-height: 1.6; }
.cc-video {
  position: relative;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--t1);
}
.cc-video-cover { width: 100%; height: 360rpx; display: block; }
.cc-video-empty { display: flex; align-items: center; justify-content: center; background: var(--t2); }
.cc-video-play {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 72rpx; height: 72rpx;
  border-radius: var(--radius-pill);
  background: var(--bg-mask);
  display: flex; align-items: center; justify-content: center;
}
.cc-video-info {
  position: absolute; left: 0; right: 0; bottom: 0;
  padding: 40rpx var(--space-r4) var(--space-r3);
  background: linear-gradient(transparent, var(--bg-mask));
  display: flex; flex-direction: column; gap: var(--space-r1);
}
.cc-video-t { font-size: var(--fs-4); color: var(--white); font-weight: 500; }
.cc-video-d { font-size: var(--fs-2); color: var(--white); }
.cc-notice {
  display: flex;
  align-items: center;
  gap: var(--space-r2);
  padding: var(--space-r3) var(--space-r4);
  border-radius: var(--radius-xs);
  line-height: 1.5;
}
/* 前置符号（🔴 #321：替代原来写死的 .cc-notice-dot 圆点）。
   全部用 currentColor，跟随公告文字色；flex-shrink:0 防止被压扁。 */
.cc-notice-sym { flex-shrink: 0; }
.cc-notice-sym-text { flex-shrink: 0; }
.cc-notice-sym.is-dot { width: 8rpx; height: 8rpx; border-radius: var(--radius-pill); background: currentColor; }
.cc-notice-sym.is-square { width: 10rpx; height: 10rpx; background: currentColor; }
.cc-notice-sym.is-bar { width: 4rpx; height: 20rpx; background: currentColor; }
/* 菱形：45° 旋转的方块 */
.cc-notice-sym.is-diamond {
  width: 9rpx; height: 9rpx; background: currentColor;
  transform: rotate(45deg);
}
/* 箭头：用两条边拼出的直角折角（border 画实心三角，WXSS 可靠） */
.cc-notice-sym.is-arrow {
  width: 0; height: 0;
  border-top: 7rpx solid transparent;
  border-bottom: 7rpx solid transparent;
  border-left: 11rpx solid currentColor;
}
.cc-notice-text { flex: 1; }
/* 🔴 反馈 #299：居中/居右时文字区不再 flex:1 撑满（否则文字永远贴左，等于没生效） */
.cc-notice-text-inline { flex: none; }

.cc-divider {
  display: flex;
  align-items: center;
  gap: var(--space-r3);
}
.cc-divider-line { flex: 1; border-top-width: 1px; }
.cc-divider-text { font-size: var(--fs-2); color: var(--decor); flex-shrink: 0; }
</style>
