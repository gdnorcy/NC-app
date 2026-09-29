<template>
  <div class="cmpv">
    <div v-if="comp.type !== 'submit'" class="cmpv-label">
      {{ comp.content.label || '未命名' }}
      <span v-if="comp.content.required" class="cmpv-req">*</span>
    </div>

    <template v-if="comp.type === 'text' || comp.type === 'textarea'">
      <input class="cmpv-input" :placeholder="comp.content.placeholder" :value="comp.content.prefill" disabled />
    </template>

    <template v-else-if="comp.type === 'image'">
      <div class="cmpv-upload">+ 上传图片（最多 {{ comp.content.maxCount }} 张）</div>
    </template>

    <template v-else-if="comp.type === 'radio'">
      <div v-for="(opt, i) in comp.content.options" :key="i" class="cmpv-opt"><span class="cmpv-circle" />{{ opt.label }}</div>
    </template>

    <template v-else-if="comp.type === 'checkbox'">
      <div v-for="(opt, i) in comp.content.options" :key="i" class="cmpv-opt"><span class="cmpv-square" />{{ opt.label }}</div>
    </template>

    <template v-else-if="comp.type === 'select'">
      <div class="cmpv-input cmpv-select">{{ comp.content.options?.[0]?.label || '请选择' }} ▾</div>
    </template>

    <template v-else-if="comp.type === 'date'">
      <div class="cmpv-input">选择{{ comp.content.dateType === 'time' ? '日期时间' : '日期' }}</div>
    </template>

    <template v-else-if="comp.type === 'submit'">
      <button class="cmpv-submit">{{ comp.content.label || '确认' }}</button>
    </template>
  </div>
</template>

<script setup>
defineProps({ comp: { type: Object, required: true } });
</script>

<style scoped>
.cmpv-label { font-size: 14px; color: #303133; margin-bottom: 6px; }
.cmpv-req { color: #f56c6c; margin-left: 2px; }
.cmpv-input { width: 100%; border: 1px solid #dcdfe6; border-radius: 4px; padding: 8px 10px; font-size: 14px; background: #fff; color: #909399; box-sizing: border-box; }
.cmpv-select { display: flex; align-items: center; }
.cmpv-upload { border: 1px dashed #c0c4cc; border-radius: 6px; padding: 16px; text-align: center; color: #909399; font-size: 13px; }
.cmpv-opt { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #303133; margin: 6px 0; }
.cmpv-circle { width: 16px; height: 16px; border-radius: 50%; border: 1px solid #c0c4cc; }
.cmpv-square { width: 16px; height: 16px; border-radius: 3px; border: 1px solid #c0c4cc; }
.cmpv-submit { width: 100%; border: none; border-radius: 6px; padding: 10px; background: #409eff; color: #fff; font-size: 15px; }
</style>
