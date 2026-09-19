<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
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
        <!-- 商品模式：商品列表 -->
        <template v-if="mode === 'goods'">
          <div v-if="goodsLoading" class="lk-empty">加载中...</div>
          <div v-else>
            <div class="lk-search"><el-input v-model="goodsSearch" size="small" placeholder="搜索商品名称" /></div>
            <div
              v-for="g in filteredGoods"
              :key="g.id"
              class="lk-item"
              :class="{ active: pick === String(g.id) }"
              @click="togglePick(g.id)"
            >
              <span class="lk-dot"></span>
              <img v-if="g.image" :src="g.image" class="lk-goods-img" />
              <div class="lk-item-info">
                <div class="lk-item-label">{{ g.title }}</div>
                <div class="lk-item-value">¥{{ g.price }}</div>
              </div>
              <span v-if="isPicked(g.id)" class="lk-check">✓</span>
            </div>
            <div v-if="!filteredGoods.length" class="lk-empty">暂无商品</div>
          </div>
        </template>
        <!-- 自定义链接：手输 -->
        <div v-else-if="activeCat === CUSTOM_LINK.name" class="lk-custom">
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
import { designCall } from '../../../../api';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  modelLink: { type: String, default: '' },
  // 'link' 普通链接选择器；'goods' 商品选择器（多选商品）；'cat' 商品分类选择
  mode: { type: String, default: 'link' },
});
const emit = defineEmits(['update:modelValue', 'confirm']);

const title = computed(() => {
  if (props.mode === 'goods') return '选择商品';
  if (props.mode === 'cat') return '选择分类';
  return '选择链接';
});

const activeCat = ref(CUSTOM_LINK.name);
const pick = ref('');
const customVal = ref('');

// 商品模式
const goodsLoading = ref(false);
const goodsList = ref([]);
const goodsSearch = ref('');
const pickedIds = ref([]);

const sideCats = computed(() => {
  if (props.mode === 'goods') {
    return [{ name: '全部商品', count: goodsList.value.length }];
  }
  if (props.mode === 'cat') {
    return [{ name: '商品分类', count: goodsCats.value.length }];
  }
  const cats = LINK_CATALOG.map((c) => ({ name: c.name, count: c.items.length }));
  cats.push({ name: CUSTOM_LINK.name });
  return cats;
});

const goodsCats = ref([]);

const currentItems = computed(() => {
  const cat = LINK_CATALOG.find((c) => c.name === activeCat.value);
  return cat ? cat.items : [];
});

const filteredGoods = computed(() => {
  if (!goodsSearch.value) return goodsList.value;
  return goodsList.value.filter((g) => g.title && g.title.includes(goodsSearch.value));
});

const confirmValue = computed(() => {
  if (props.mode === 'goods') return pickedIds.value.join(',');
  if (props.mode === 'cat') return pick.value;
  return activeCat.value === CUSTOM_LINK.name ? customVal.value.trim() : pick.value;
});

function isPicked(id) { return pickedIds.value.includes(String(id)); }
function togglePick(id) {
  const sid = String(id);
  const i = pickedIds.value.indexOf(sid);
  if (i >= 0) pickedIds.value.splice(i, 1);
  else pickedIds.value.push(sid);
}

async function loadGoods() {
  goodsLoading.value = true;
  try {
    const res = await designCall.get('/goods/list', { params: { page: 1, pageSize: 200 } });
    goodsList.value = res.list || res.data || [];
  } catch (e) {
    goodsList.value = [];
  }
  goodsLoading.value = false;
}

async function loadCats() {
  goodsLoading.value = true;
  try {
    const res = await designCall.get('/goods/category/list');
    goodsCats.value = res.list || res.data || [];
  } catch (e) {
    goodsCats.value = [];
  }
  goodsLoading.value = false;
}

watch(() => props.modelValue, (v) => {
  if (!v) return;
  const link = props.modelLink || '';
  if (props.mode === 'goods') {
    pickedIds.value = link ? link.split(',').filter(Boolean) : [];
    goodsSearch.value = '';
    loadGoods();
  } else if (props.mode === 'cat') {
    pick.value = link;
    loadCats();
  } else {
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
.lk-search { margin-bottom: 10px; }
.lk-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border: 1px solid #E5E6EB; border-radius: 8px; margin-bottom: 8px;
  cursor: pointer; transition: all 0.2s;
}
.lk-item:hover { border-color: #165DFF; background: #F7FBFF; }
.lk-item.active { border-color: #165DFF; background: #F7FBFF; }
.lk-dot { width: 8px; height: 8px; border-radius: 50%; background: #C9CDD4; flex-shrink: 0; }
.lk-item.active .lk-dot { background: #165DFF; }
.lk-goods-img { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
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
