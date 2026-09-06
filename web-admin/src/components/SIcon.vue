<template>
  <svg
    class="s-icon"
    :class="[`s-icon--${size}`, { 's-icon--disabled': disabled, 's-icon--active': active }]"
    :style="{ color: color || undefined }"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    v-html="svgContent"
  />
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  name: { type: String, required: true },
  size: { type: String, default: 'default' }, // small(16px) / default(20px) / large(24px)
  color: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
});

// 图标SVG内容映射（从svg文件导入）
const svgModules = import.meta.glob('../assets/icons/svg/*.svg', { eager: true, as: 'raw' });

const svgContent = computed(() => {
  const key = `../assets/icons/svg/${props.name}.svg`;
  const raw = svgModules[key];
  if (!raw) return '';
  // 提取svg内部内容（去掉外层<svg>标签）
  const match = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  return match ? match[1] : '';
});
</script>

<style scoped>
.s-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  transition: color 0.2s;
}
.s-icon--small { width: 16px; height: 16px; }
.s-icon--default { width: 20px; height: 20px; }
.s-icon--large { width: 24px; height: 24px; }
.s-icon--disabled { opacity: 0.4; }
.s-icon--active { color: var(--color-primary, #165dff); }
</style>
