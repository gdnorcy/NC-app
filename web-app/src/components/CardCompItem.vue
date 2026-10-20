<template>
  <!-- 装修组件渲染器（单一渲染源）
       原来 cardDetail.vue 内联渲染、cardEdit.vue 又抄一份「预览版」——两端必然漂移
       （已多次出现 notice 少圆点 / divider 双线 / rich-text 用错背景字段等）。
       抽成本组件后：详情页与装修页共用同一份结构与样式，装修页就是所见即所得。
       interactive=false 时（装修页）不触发跳转/拉起视频号，只把点击冒泡给父级处理。 -->
  <block>
    <!-- 图片 -->
    <image
      v-if="type === 'image' && props.url && !imgFailed"
      class="cc-img"
      :src="props.url"
      mode="widthFix"
      :style="ccStyle"
      @error="imgFailed = true"
      @click="onTap('link', props.link)"
    />
    <view v-else-if="type === 'image'" class="cc-img-fallback" :style="ccStyle">
      <text class="cc-img-fallback-t">图片加载失败，请检查图片地址</text>
    </view>

    <!-- 视频号（finderUserName + feedId） -->
    <view v-else-if="type === 'channel-video'" class="cc-video" :style="ccStyle" @click="onTap('video')">
      <image v-if="props.cover && !coverFailed" class="cc-video-cover" :src="props.cover" mode="aspectFill" @error="coverFailed = true" />
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
      :style="[ccStyle, { background: props.bgColor || 'transparent', color: props.color || '#1d2129', fontSize: (props.fontSize || 14) + 'px', fontWeight: props.bold ? 600 : 400 }]"
      @click="onTap('link', props.url)"
    >
      <text class="cc-notice-dot"></text>
      <text class="cc-notice-text">{{ props.text }}</text>
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

    <!-- 富文本（HTML 渲染前消毒：租户自填但访客可见，防 H5 端注入） -->
    <view
      v-else-if="type === 'rich-text'"
      class="cc-rt-wrap"
      :style="[ccStyle, { background: (props.bottomBg && props.bottomBg !== 'transparent') ? props.bottomBg : 'transparent' }]"
    >
      <rich-text class="cc-richtext" :nodes="sanitizeRichHtml(props.html || '<p>富文本内容</p>')" :style="richStyle"></rich-text>
    </view>
  </block>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import SIcon from './SIcon.vue';
import { buttonSizeStyle } from '../utils/btnSize.js';

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

const richStyle = computed(() => {
  const p = props.value;
  const s = { background: p.compBgColor || 'transparent' };
  s.borderRadius = (p.radiusTop ?? 0) + 'px ' + (p.radiusTop ?? 0) + 'px ' + (p.radiusBottom ?? 0) + 'px ' + (p.radiusBottom ?? 0) + 'px';
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
function jumpCompLink(link) {
  const l = String(link || '').trim();
  if (!l || !l.startsWith('/')) return;
  uni.navigateTo({ url: l, fail: () => {} });
}

function openChannelVideo(v) {
  if (!v || !v.finderUserName || !v.feedId) return;
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && wx.openChannelsActivity) {
    wx.openChannelsActivity({ finderUserName: v.finderUserName, feedId: v.feedId, fail: () => {} });
  }
  // #endif
}

function onTap(kind, extra) {
  emit('tap', { kind, value: extra, comp: propsDef.comp });
  if (!propsDef.interactive) return; // 装修页：不跳转，交给列表处理选中/编辑
  if (kind === 'video') openChannelVideo(props.value);
  else jumpCompLink(extra);
}
</script>

<style scoped>
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
.cc-notice-dot {
  width: 8rpx; height: 8rpx;
  border-radius: var(--radius-pill);
  background: currentColor;
  flex-shrink: 0;
}
.cc-notice-text { flex: 1; }
.cc-divider {
  display: flex;
  align-items: center;
  gap: var(--space-r3);
}
.cc-divider-line { flex: 1; border-top-width: 1px; }
.cc-divider-text { font-size: var(--fs-2); color: var(--decor); flex-shrink: 0; }
</style>
