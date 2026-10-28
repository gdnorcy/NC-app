<template>
  <div v-if="open" class="conn-wrap"><slot /></div>
  <div v-else class="locked-wrap">
    <div class="locked-hint">
      <div class="locked-icon">🔒</div>
      <h3 class="locked-title">{{ title }}</h3>
      <p class="locked-reason">{{ reason }}</p>
      <el-button type="primary" plain @click="$emit('goto')">前往接入设置</el-button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  open: Boolean,
  title: String,
  reason: String,
});
defineEmits(['goto']);
</script>

<style scoped>
.locked-wrap { max-width: 960px; }
.locked-hint {
  text-align: center;
  padding: 56px 24px;
  background: #f7f8fa;
  border: 1px dashed #dcdfe6;
  border-radius: 10px;
  color: #86909c;
}
.locked-icon { font-size: 40px; filter: grayscale(1); opacity: 0.55; }
.locked-title { margin: 12px 0 6px; color: #4e5969; font-weight: 600; }
.locked-reason { margin: 0 auto 18px; max-width: 480px; line-height: 1.7; font-size: 13px; }
</style>
