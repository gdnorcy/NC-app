<template>
  <el-drawer v-model="visible" :title="`门店商品配置（${storeName || '#' + storeId}）`" size="720px">
    <div class="mode-tip" v-if="modeText">
      <el-tag v-for="m in modeText" :key="m" size="small" effect="plain" style="margin-right: 6px">{{ m }}</el-tag>
    </div>

    <el-form inline class="filter-bar">
      <el-form-item label="商品名称">
        <el-input v-model="keyword" placeholder="搜索商品" clearable style="width: 180px" @keyup.enter="load(1)" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="load(1)">搜索</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="list" size="default">
      <el-table-column label="商品" min-width="170">
        <template #default="{ row }">
          <div class="goods-cell">
            <el-image v-if="row.thumb" :src="resolveUrl(row.thumb)" fit="cover" class="goods-thumb" />
            <div v-else class="goods-thumb goods-thumb-empty">{{ row.title.slice(0, 1) }}</div>
            <div>
              <div class="goods-title">{{ row.title }}</div>
              <div class="muted">总部价 ¥{{ row.price }}<span v-if="row.spec_mode === 'multi'" class="multi-badge">多规格</span></div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="门店价" width="150">
        <template #default="{ row }">
          <el-input-number v-if="customPrice" v-model="row._price" :min="0" :precision="2" :step="0.1" size="small" controls-position="right" style="width: 110px" @change="save(row)" />
          <span v-else class="muted">跟随总部</span>
        </template>
      </el-table-column>
      <el-table-column label="门店库存" width="150">
        <template #default="{ row }">
          <el-input-number v-if="independentStock" v-model="row._stock" :min="-1" size="small" controls-position="right" style="width: 110px" @change="save(row)" />
          <span v-else class="muted">跟随总部</span>
        </template>
      </el-table-column>
      <el-table-column label="本店上下架" width="110" align="center">
        <template #default="{ row }">
          <el-switch v-if="storeShelf" :model-value="row.storeStatus !== 'off'" @change="(v) => toggleShelf(row, v)" />
          <span v-else class="muted">统一管理</span>
        </template>
      </el-table-column>
    </el-table>

    <div class="foot-tip muted">提示：门店价填 0、库存填 -1 表示恢复跟随总部；门店价/库存仅在该门店开启自定义模式时生效</div>
    <el-pagination v-if="total > pageSize" class="pager" layout="prev, pager, next, total" :total="total" :page-size="pageSize" :current-page="page" @current-change="load" />
  </el-drawer>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { customerApiCall } from '../../../api';

const props = defineProps({ visible: { type: Boolean, default: false }, storeId: { type: Number, default: 0 }, storeName: { type: String, default: '' } });
const emit = defineEmits(['update:visible']);

const visible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
});

const keyword = ref('');
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const list = ref([]);
const loading = ref(false);
const storeMode = ref({ priceMode: '', stockMode: '', shelfMode: '' });

const customPrice = computed(() => storeMode.value.priceMode === 'custom');
const independentStock = computed(() => storeMode.value.stockMode === 'independent');
const storeShelf = computed(() => storeMode.value.shelfMode === 'store');
const modeText = computed(() => {
  const t = [];
  if (customPrice.value) t.push('门店自定义价');
  if (independentStock.value) t.push('门店独立库存');
  if (storeShelf.value) t.push('门店独立上下架');
  if (!t.length) t.push('全部跟随总部（可在门店「基础设置」开启自定义模式）');
  return t;
});

function resolveUrl(u) { return u || ''; }

async function load(p = page.value) {
  page.value = p;
  loading.value = true;
  try {
    const r = await customerApiCall.get(`/store/${props.storeId}/goods`, { params: { keyword: keyword.value, page: p, pageSize } });
    list.value = (r.list || []).map((g) => ({
      ...g,
      _price: g.storePrice != null ? g.storePrice : g.price,
      _stock: g.storeStock != null ? g.storeStock : -1,
    }));
    total.value = r.total || 0;
    storeMode.value = r.storeMode || {};
  } catch (e) { ElMessage.error(String(e)); }
  finally { loading.value = false; }
}

async function save(row) {
  try {
    await customerApiCall.put(`/store/${props.storeId}/goods/${row.id}`, {
      price: row._price > 0 ? row._price : 0,
      stock: row._stock >= 0 ? row._stock : -1,
      status: row.storeStatus === 'off' ? 'off' : 'sell',
    });
    ElMessage.success('已保存');
    load(page.value);
  } catch (e) { ElMessage.error(String(e)); }
}

async function toggleShelf(row, v) {
  try {
    await customerApiCall.put(`/store/${props.storeId}/goods/${row.id}`, {
      price: row._price > 0 ? row._price : 0,
      stock: row._stock >= 0 ? row._stock : -1,
      status: v ? 'sell' : 'off',
    });
    ElMessage.success(v ? '已上架' : '已下架（该门店不可售）');
    load(page.value);
  } catch (e) { ElMessage.error(String(e)); }
}

watch(() => props.visible, (v) => { if (v) { keyword.value = ''; load(1); } });
</script>

<style scoped>
.mode-tip { margin-bottom: 12px; }
.filter-bar { margin-bottom: 8px; }
.goods-cell { display: flex; align-items: center; gap: 8px; }
.goods-thumb { width: 36px; height: 36px; border-radius: 4px; flex-shrink: 0; }
.goods-thumb-empty { background: #e8f3ff; color: #165dff; display: flex; align-items: center; justify-content: center; font-size: 14px; }
.goods-title { line-height: 1.4; }
.multi-badge { margin-left: 6px; font-size: 12px; color: #ff7d00; border: 1px solid #ffd591; border-radius: 2px; padding: 0 4px; }
.muted { color: #86909c; font-size: 12px; }
.foot-tip { margin-top: 12px; }
.pager { margin-top: 14px; justify-content: flex-end; }
</style>
