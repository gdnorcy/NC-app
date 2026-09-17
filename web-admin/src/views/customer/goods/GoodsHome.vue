<template>
  <div class="goods-home">
    <!-- 顶部横向分类（设计中心 CardTabs 样式）：商品管理 / 订单配送 / 营销运营 / 商城设置 -->
    <div class="card-tabs">
      <div v-for="t in topTabs" :key="t.key" class="ctab" :class="{ active: activeTop === t.key }" @click="switchTop(t.key)">
        <SIcon :name="t.icon" size="default" :color="activeTop === t.key ? '#165dff' : '#4e5969'" />
        <span>{{ t.label }}</span>
      </div>
    </div>

    <div class="goods-body">
      <!-- 左侧竖向二级菜单（应用中心 cat-item 样式：圆角背景块 + 数量角标） -->
      <aside class="cat-sidebar">
        <div class="cat-header">{{ activeTopLabel }}</div>
        <div
          v-for="s in subMenus"
          :key="s.key"
          class="cat-item"
          :class="{ active: activeSub === s.key }"
          @click="switchSub(s.key)"
        >
          <SIcon :name="s.icon" size="default" />
          <span class="cat-name">{{ s.label }}</span>
          <span v-if="s.count !== null" class="cat-count">{{ s.count }}</span>
          <span v-else-if="s.disabled" class="cat-tag">开发中</span>
        </div>
      </aside>

      <!-- 右侧内容区（默认页 = 商品列表首页） -->
      <main class="goods-content">
        <component :is="activeComp" :key="activeSub" />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SIcon from '../../../components/SIcon.vue';
import { customerApiCall } from '../../../api';
import GoodsInsight from './GoodsInsight.vue';
import GoodsList from './GoodsList.vue';
import GoodsCategory from './GoodsCategory.vue';
import GoodsParams from './GoodsParams.vue';
import GoodsSettings from './GoodsSettings.vue';
import GoodsOrders from './GoodsOrders.vue';
import GoodsAfterSale from './GoodsAfterSale.vue';
import GoodsPlaceholder from './GoodsPlaceholder.vue';

const route = useRoute();
const router = useRouter();

const topTabs = [
  { key: 'goods', label: '商品管理', icon: 'template' },
  { key: 'order', label: '订单配送', icon: 'orders' },
  { key: 'marketing', label: '营销运营', icon: 'analytics' },
  { key: 'shop', label: '商城设置', icon: 'settings' },
];

// 二级菜单（对齐菜鸟云「东莞同城通」duoproducts 12 子项；count=null 不显示角标）
const subDefs = {
  goods: [
    { key: 'insight', label: '数据洞察', icon: 'analytics' },
    { key: 'list', label: '商品列表', icon: 'template', countKey: 'goods' },
    { key: 'category', label: '商品分类', icon: 'apps', countKey: 'category' },
    { key: 'param', label: '商品参数', icon: 'logs', countKey: 'param' },
    { key: 'collect', label: '商品采集', icon: 'dynamic', disabled: true },
  ],
  order: [
    { key: 'order', label: '商品订单', icon: 'orders' },
    { key: 'afterSale', label: '售后订单', icon: 'orders' },
    { key: 'returns', label: '退货地址', icon: 'storage', disabled: true },
  ],
  marketing: [
    { key: 'comment', label: '评论管理', icon: 'customer', disabled: true },
    { key: 'brand', label: '品牌标签', icon: 'badge', disabled: true },
    { key: 'tag', label: '标题标签', icon: 'template', disabled: true },
    { key: 'service', label: '服务保障', icon: 'crown', disabled: true },
    { key: 'supplier', label: '供应厂商', icon: 'building', disabled: true },
  ],
  shop: [
    { key: 'settings', label: '商城设置', icon: 'settings' },
    { key: 'style', label: '商城风格', icon: 'palette', disabled: true },
  ],
};

const activeTop = ref('goods');
const activeSub = ref('insight');
const counts = ref({ goods: 0, category: 0, param: 0 });

const activeTopLabel = computed(() => topTabs.find((t) => t.key === activeTop.value)?.label || '');
const subMenus = computed(() =>
  (subDefs[activeTop.value] || []).map((s) => ({
    ...s,
    count: s.disabled ? null : (s.countKey ? counts.value[s.countKey] : null),
  }))
);

const compMap = {
  insight: GoodsInsight,
  list: GoodsList,
  category: GoodsCategory,
  param: GoodsParams,
  settings: GoodsSettings,
  order: GoodsOrders,
  afterSale: GoodsAfterSale,
};
const activeComp = computed(() => compMap[activeSub.value] || GoodsPlaceholder);

function switchTop(key) {
  if (activeTop.value === key) return;
  activeTop.value = key;
  const first = (subDefs[key] || [])[0];
  activeSub.value = first?.key || '';
  syncQuery();
}

function switchSub(key) {
  const s = subMenus.value.find((x) => x.key === key);
  if (s?.disabled) return; // 开发中占位不切换
  activeSub.value = key;
  syncQuery();
}

function syncQuery() {
  router.replace({ query: { ...route.query, top: activeTop.value, m: activeSub.value } });
}

async function loadCounts() {
  try {
    const [g, c, p] = await Promise.all([
      customerApiCall.get('/goods', { params: { page: 1, pageSize: 1 } }),
      customerApiCall.get('/goods/categories'),
      customerApiCall.get('/goods/params'),
    ]);
    counts.value = {
      goods: g.total || 0,
      category: c.total || 0,
      param: p.total || 0,
    };
  } catch (e) { /* 角标失败不阻塞 */ }
}

onMounted(async () => {
  const qTop = String(route.query.top || '');
  const qM = String(route.query.m || '');
  if (topTabs.some((t) => t.key === qTop)) activeTop.value = qTop;
  if ((subDefs[activeTop.value] || []).some((s) => s.key === qM)) activeSub.value = qM;
  else activeSub.value = (subDefs[activeTop.value] || [])[0]?.key || 'list';
  loadCounts();
});
</script>

<style scoped>
.goods-home { display: flex; flex-direction: column; gap: 16px; }
/* 顶部横向分类（设计中心 CardTabs 样式） */
.card-tabs {
  display: flex;
  align-items: center;
  overflow-x: auto;
  gap: 4px;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
}
.card-tabs::-webkit-scrollbar { display: none; }
.ctab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 14px;
  color: #4e5969;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.ctab:hover { background: #f2f3f5; color: #1d2129; }
.ctab.active { background: #e8f3ff; color: #165dff; font-weight: 500; }

.goods-body { display: flex; gap: 16px; align-items: flex-start; }
/* 左侧竖向二级菜单（应用中心 cat-item 样式） */
.cat-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 8px;
  padding: 12px;
}
.cat-header {
  font-size: 11px;
  color: #909399;
  text-transform: uppercase;
  padding: 8px 12px 8px;
  letter-spacing: 0.5px;
}
.cat-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  color: #4e5969;
  transition: all 0.2s;
}
.cat-item:hover { background: #f2f3f5; color: #1d2129; }
.cat-item.active { background: #e8f3ff; color: #165dff; font-weight: 500; }
.cat-name { flex: 1; font-size: 14px; }
.cat-count {
  font-size: 12px;
  color: #86909c;
  background: #f2f3f5;
  border-radius: 10px;
  padding: 0 8px;
  line-height: 20px;
}
.cat-item.active .cat-count { background: rgba(22, 93, 255, 0.1); color: #165dff; }
.cat-tag { font-size: 11px; color: #86909c; border: 1px solid #e5e6eb; border-radius: 6px; padding: 0 6px; line-height: 18px; }

/* 右侧内容区 */
.goods-content { flex: 1; min-width: 0; background: #fff; border-radius: 8px; padding: 20px; }
</style>
