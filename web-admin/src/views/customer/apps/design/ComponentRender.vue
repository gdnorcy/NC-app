<template>
  <div class="comp-render" :style="containerStyle">
    <template v-if="comp.type === 'title'">
      <div class="r-title" :style="{ color: comp.props.color, textAlign: comp.props.align }">{{ comp.props.text || '标题文字' }}</div>
    </template>
    <template v-else-if="comp.type === 'text'">
      <div class="r-text" :style="{ color: comp.props.color, textAlign: comp.props.align, fontSize: comp.props.size + 'px' }">{{ comp.props.text || '文本内容' }}</div>
    </template>
    <template v-else-if="comp.type === 'image'">
      <div class="r-image" @click.stop>
        <img v-if="comp.props.url" :src="resolveUrl(comp.props.url)" />
        <div v-else class="r-image-empty"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 17l5-6 4 5 3-3 4 4"/></svg>图片组件（右侧选择素材）</div>
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
    <template v-else-if="comp.type === 'countdown'">
      <div class="r-countdown" :style="{ '--cd': comp.props.color || '#165DFF' }">
        <div class="r-cd-title">{{ comp.props.title || '限时活动' }}</div>
        <div class="r-cd-cols">
          <span class="r-cd-cell"><b>{{ comp.props.days || '00' }}</b><i>天</i></span>
          <em>:</em>
          <span class="r-cd-cell"><b>{{ comp.props.hours || '00' }}</b><i>时</i></span>
          <em>:</em>
          <span class="r-cd-cell"><b>{{ comp.props.minutes || '00' }}</b><i>分</i></span>
          <em>:</em>
          <span class="r-cd-cell"><b>{{ comp.props.seconds || '00' }}</b><i>秒</i></span>
        </div>
      </div>
    </template>
    <template v-else-if="comp.type === 'form'">
      <div class="r-form">
        <div class="r-form-title">{{ comp.props.title || '留资表单' }}</div>
        <div class="r-form-input">{{ comp.props.namePlaceholder || '请输入姓名' }}</div>
        <div class="r-form-input">{{ comp.props.phonePlaceholder || '请输入手机号' }}</div>
        <div class="r-form-btn" :style="{ background: comp.props.btnColor || '#165DFF' }">{{ comp.props.submitText || '提交' }}</div>
      </div>
    </template>
    <template v-else-if="comp.type === 'video'">
      <div class="r-video">
        <img v-if="comp.props.poster" :src="resolveUrl(comp.props.poster)" />
        <div v-else class="r-video-empty"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/></svg></div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({ comp: { type: Object, required: true } });

const containerStyle = computed(() => {
  const p = props.comp.props || {};
  const s = {};
  if (p.padding !== undefined && p.padding !== '') s.padding = `${p.padding}px`;
  if (p.radius !== undefined && p.radius !== '') s.borderRadius = `${p.radius}px`;
  if (p.bgColor) s.background = p.bgColor;
  return s;
});

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
</script>

<style scoped>
.comp-render { pointer-events: none; }
.r-title { font-size: 22px; font-weight: 700; line-height: 1.4; }
.r-text { line-height: 1.6; }
.r-image img { width: 100%; border-radius: 8px; display: block; }
.r-image-empty { height: 88px; display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; color: #86909c; font-size: 12px; background: #f7f8fa; border: 1px dashed #c9cdd4; border-radius: 8px; }
.r-btn { display: inline-block; padding: 10px 24px; border-radius: 8px; font-size: 14px; }
.r-divider { height: 1px; background: #e5e6eb; margin: 14px 0; position: relative; }
.r-divider span { position: absolute; left: 50%; top: -8px; transform: translateX(-50%); background: #fff; padding: 0 10px; font-size: 12px; color: #86909c; }
.r-notice { padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; gap: 8px; }
.r-notice-tag { flex-shrink: 0; font-weight: 600; }
.r-countdown { padding: 14px; border-radius: 8px; background: #fff; border: 1px solid #f0f1f3; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.r-cd-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.r-cd-cols { display: flex; align-items: center; gap: 6px; }
.r-cd-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.r-cd-cell b { font-size: 18px; font-weight: 700; color: #fff; background: var(--cd, #165dff); border-radius: 6px; padding: 2px 8px; line-height: 1.4; }
.r-cd-cell i { font-style: normal; font-size: 11px; color: #86909c; }
.r-cd-cols em { font-style: normal; color: var(--cd, #165dff); font-weight: 700; font-size: 16px; }
.r-form { padding: 14px; border-radius: 8px; border: 1px solid #f0f1f3; display: flex; flex-direction: column; gap: 10px; background: #fff; }
.r-form-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.r-form-input { height: 34px; border-radius: 6px; background: #f7f8fa; border: 1px solid #e5e6eb; display: flex; align-items: center; padding: 0 12px; font-size: 12px; color: #86909c; }
.r-form-btn { height: 36px; border-radius: 8px; color: #fff; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.r-video { position: relative; border-radius: 8px; overflow: hidden; background: #000; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; }
.r-video img { width: 100%; height: 100%; object-fit: cover; }
.r-video-empty { opacity: .6; }
</style>
