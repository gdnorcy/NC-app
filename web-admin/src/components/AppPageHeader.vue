<template>
  <div class="app-page-header">
    <div class="app-page-header-left">
      <h2 class="app-page-title">{{ title }}</h2>
      <p v-if="desc" class="app-page-desc">{{ desc }}</p>
    </div>
    <div v-if="$slots.default" class="app-page-header-extra">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  desc: { type: String, default: '' },
});
</script>

<style scoped>
/* 应用内二级页统一页头（图1规范：与 CardTabs 间距 16px、标题 20px/600、描述 13px 辅助色） */
.app-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.app-page-header-left {
  flex: 0 0 auto;
  min-width: 0;
}
.app-page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1D2129;
  margin: 0;
  line-height: 1.4;
  white-space: nowrap;
}
.app-page-desc {
  font-size: 13px;
  color: #86909C;
  margin: 4px 0 0;
  line-height: 1.5;
}
.app-page-header-extra {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  row-gap: 8px;
}
</style>
