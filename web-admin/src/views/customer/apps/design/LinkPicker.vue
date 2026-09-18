<template>
  <el-dialog
    :model-value="modelValue"
    title="选择链接"
    width="640px"
    append-to-body
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div class="lk-picker">
      <!-- 左侧分类 -->
      <div class="lk-side">
        <div
          v-for="cat in sideCats"
          :key="cat.name"
          class="lk-cat"
          :class="{ active: activeCat === cat.name }"
          @click="activeCat = cat.name"
        >
          <span class="lk-cat-name">{{ cat.name }}</span>
          <span v-if="cat.count != null" class="lk-cat-count">{{ cat.count }}</span>
        </div>
      </div>

      <!-- 右侧列表 -->
      <div class="lk-main">
        <!-- 自定义链接：手输 -->
        <div v-if="activeCat === CUSTOM_LINK.name" class="lk-custom">
          <div class="lk-label">自定义链接</div>
          <el-input v-model="customVal" placeholder="如 /pages/card/market 或 https://example.com" clearable />
          <div class="lk-help">支持小程序路径（/pages/...）或完整 URL（http/https）</div>
        </div>
        <!-- 分类项列表 -->
        <template v-else>
          <div
            v-for="it in currentItems"
            :key="it.value"
            class="lk-item"
            :class="{ active: pick === it.value }"
            @click="pick = it.value"
          >
            <span class="lk-dot"></span>
            <div class="lk-item-info">
              <div class="lk-item-label">{{ it.label }}</div>
              <div class="lk-item-value">{{ it.value }}</div>
              <div v-if="it.desc" class="lk-item-desc">{{ it.desc }}</div>
            </div>
            <span v-if="pick === it.value" class="lk-check">✓</span>
          </div>
          <div v-if="!currentItems.length" class="lk-empty">该分类暂无链接</div>
        </template>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!confirmValue" @click="doConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { LINK_CATALOG, CUSTOM_LINK } from './linkCatalog.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // 预填当前链接值（可选）
  modelLink: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue', 'confirm']);

const activeCat = ref(CUSTOM_LINK.name);
const pick = ref('');
const customVal = ref('');

const sideCats = computed(() => {
  const cats = LINK_CATALOG.map((c) => ({ name: c.name, count: c.items.length }));
  cats.push({ name: CUSTOM_LINK.name });
  return cats;
});
const currentItems = computed(() => {
  const cat = LINK_CATALOG.find((c) => c.name === activeCat.value);
  return cat ? cat.items : [];
});
const confirmValue = computed(() => (activeCat.value === CUSTOM_LINK.name ? customVal.value.trim() : pick.value));

watch(() => props.modelValue, (v) => {
  if (v) {
    // 打开时：有预填值且能匹配分类项 → 选中该分类与项；否则进自定义
    const link = props.modelLink || '';
    let matched = null;
    for (const c of LINK_CATALOG) {
      const it = c.items.find((x) => x.value === link);
      if (it) { matched = { cat: c.name, it }; break; }
    }
    if (matched) { activeCat.value = matched.cat; pick.value = matched.it.value; }
    else { activeCat.value = CUSTOM_LINK.name; pick.value = ''; customVal.value = link; }
  }
});

function doConfirm() {
  emit('confirm', confirmValue.value);
  emit('update:modelValue', false);
}
</script>

<style scoped>
.lk-picker { display: flex; gap: 12px; height: 360px; }
.lk-side { width: 150px; flex-shrink: 0; border-right: 1px solid #E5E6EB; padding-right: 8px; overflow-y: auto; }
.lk-cat {
  display: flex; align-items: center; justify-content: space-between;
  height: 36px; padding: 0 10px; margin-bottom: 4px; border-radius: 8px;
  font-size: 13px; color: #4E5969; cursor: pointer; transition: all 0.2s;
}
.lk-cat:hover { background: #F2F3F5; color: #1D2129; }
.lk-cat.active { background: #E8F3FF; color: #165DFF; font-weight: 500; }
.lk-cat-count { font-size: 11px; color: #86909C; background: #F2F3F5; border-radius: 8px; padding: 0 6px; }
.lk-main { flex: 1; overflow-y: auto; padding-right: 4px; }
.lk-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border: 1px solid #E5E6EB; border-radius: 8px; margin-bottom: 8px;
  cursor: pointer; transition: all 0.2s;
}
.lk-item:hover { border-color: #165DFF; background: #F7FBFF; }
.lk-item.active { border-color: #165DFF; background: #F7FBFF; }
.lk-dot { width: 8px; height: 8px; border-radius: 50%; background: #C9CDD4; flex-shrink: 0; }
.lk-item.active .lk-dot { background: #165DFF; }
.lk-item-info { flex: 1; min-width: 0; }
.lk-item-label { font-size: 13px; color: #1D2129; line-height: 1.4; }
.lk-item-value { font-size: 11px; color: #86909C; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lk-item-desc { font-size: 11px; color: #C9CDD4; margin-top: 2px; line-height: 1.4; }
.lk-check { color: #165DFF; font-weight: 600; flex-shrink: 0; }
.lk-empty { text-align: center; color: #86909C; font-size: 13px; padding: 40px 0; }
.lk-custom { padding: 4px 0; }
.lk-label { font-size: 13px; color: #1D2129; margin-bottom: 8px; }
.lk-help { font-size: 12px; color: #86909C; margin-top: 8px; }
</style>
