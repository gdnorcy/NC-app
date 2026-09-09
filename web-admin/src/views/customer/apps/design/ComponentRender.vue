<template>
  <div class="comp-render">
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
  </div>
</template>

<script setup>
defineProps({ comp: { type: Object, required: true } });

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
</style>
