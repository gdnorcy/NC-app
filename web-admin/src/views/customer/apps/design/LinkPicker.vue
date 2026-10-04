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
              <img v-if="g.thumb || g.image" :src="g.thumb || g.image" class="lk-goods-img" />
              <div class="lk-item-info">
                <div class="lk-item-label">{{ g.title }}</div>
                <div class="lk-item-value">¥{{ g.price }}</div>
              </div>
              <span v-if="isPicked(g.id)" class="lk-check">✓</span>
            </div>
            <div v-if="!filteredGoods.length" class="lk-empty">暂无商品</div>
          </div>
        </template>
        <!-- 分类模式：分类列表 -->
        <template v-else-if="mode === 'cat'">
          <div v-if="goodsLoading" class="lk-empty">加载中...</div>
          <div
            v-for="c in goodsCats"
            :key="c.id"
            class="lk-item"
            :class="{ active: pick === String(c.id) }"
            @click="pick = String(c.id)"
          >
            <span class="lk-dot"></span>
            <div class="lk-item-info">
              <div class="lk-item-label">{{ c.name }}</div>
            </div>
            <span v-if="pick === String(c.id)" class="lk-check">✓</span>
          </div>
          <div v-if="!goodsLoading && !goodsCats.length" class="lk-empty">暂无分类</div>
        </template>
        <!-- 自定义链接：手输 -->
        <div v-else-if="activeCat === CUSTOM_LINK.name" class="lk-custom">
          <div class="lk-label">自定义链接</div>
          <el-input v-model="customVal" placeholder="如 /pages/card/market 或 https://example.com" clearable />
          <div class="lk-help">支持小程序路径（/pages/...）或完整 URL（http/https）</div>
        </div>
        <!-- 分类项列表（含动态分类：超级表单 / 全景方案） -->
        <template v-else>
          <div v-if="activeCatIsDynamic" class="lk-search">
            <el-input v-model="dynSearch" size="small" :placeholder="`搜索${activeCat}`" clearable />
          </div>
          <div v-if="dynLoading" class="lk-empty">加载中...</div>
          <div v-else-if="dynError" class="lk-empty">{{ dynError }}</div>
          <div v-else>
            <div
              v-for="it in currentItems"
              :key="it.value"
              class="lk-item"
              :class="{ active: pick === it.value, disabled: it.disabled }"
              @click="pickItem(it)"
            >
              <span class="lk-dot"></span>
              <div class="lk-item-info">
                <div class="lk-item-label">
                  {{ it.label }}
                  <span v-if="it.tag" class="lk-tag" :class="it.tagClass">{{ it.tag }}</span>
                </div>
                <div class="lk-item-value">{{ it.value }}</div>
                <div v-if="it.desc" class="lk-item-desc">{{ it.desc }}</div>
              </div>
              <span v-if="pick === it.value" class="lk-check">✓</span>
            </div>
            <div v-if="!currentItems.length" class="lk-empty">
              <template v-if="dynEmptyText">
                {{ dynEmptyText }}
                <div class="lk-empty-actions">
                  <el-button v-if="dynManageRoute" size="small" type="primary" plain @click="goManage">去创建</el-button>
                </div>
              </template>
              <template v-else>该分类暂无链接</template>
            </div>
          </div>
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
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { LINK_CATALOG, CUSTOM_LINK, DYNAMIC_SOURCES, parseDynamicLink } from './linkCatalog.js';
import { designCall, fetchSuperForms } from '../../../../api';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  modelLink: { type: String, default: '' },
  // 'link' 普通链接选择器；'goods' 商品选择器（多选商品）；'cat' 商品分类选择
  mode: { type: String, default: 'link' },
});
const emit = defineEmits(['update:modelValue', 'confirm']);
const router = useRouter();

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

// 动态分类（超级表单 / 全景方案）
const dynLoading = ref(false);
const dynError = ref('');
const dynSearch = ref('');
// 已按链接项缓存：key -> { items: [], loaded: bool }
const dynCache = ref({ superform: null, plans: null });
// 各分类的管理页路由（空态「去创建」用），取值对应 router/customer.js
const DYN_MANAGE_ROUTE = {
  superform: '/apps/super-form',
  plans: '/apps/panorama/plans',
};

const activeCatDef = computed(() => LINK_CATALOG.find((c) => c.name === activeCat.value) || null);
const activeCatIsDynamic = computed(() => !!activeCatDef.value?.dynamic);
const activeDynKey = computed(() => activeCatDef.value?.dynamic || '');
const dynManageRoute = computed(() => DYN_MANAGE_ROUTE[activeDynKey.value] || '');

function catCount(c) {
  if (c.dynamic) return dynCache.value[c.dynamic]?.items.length ?? 0;
  return c.items.length;
}

const sideCats = computed(() => {
  if (props.mode === 'goods') {
    return [{ name: '全部商品', count: goodsList.value.length }];
  }
  if (props.mode === 'cat') {
    return [{ name: '商品分类', count: goodsCats.value.length }];
  }
  const cats = LINK_CATALOG.map((c) => ({ name: c.name, count: catCount(c) }));
  cats.push({ name: CUSTOM_LINK.name });
  return cats;
});

const goodsCats = ref([]);

// 动态分类的链接项（已按关键字过滤）
function buildDynItems(key) {
  const src = DYNAMIC_SOURCES[key];
  const cached = dynCache.value[key];
  if (!src || !cached?.items) return [];
  const kw = String(dynSearch.value || '').trim().toLowerCase();
  return cached.items.filter((it) => !kw || String(it.label || '').toLowerCase().includes(kw));
}

const currentItems = computed(() => {
  const cat = activeCatDef.value;
  if (!cat) return [];
  if (cat.dynamic) return buildDynItems(cat.dynamic);
  return cat.items;
});

// 动态分类空态文案（区分「没有数据」与「搜索无结果」）
const dynEmptyText = computed(() => {
  if (!activeCatIsDynamic.value) return '';
  if (String(dynSearch.value || '').trim()) return `没有匹配「${dynSearch.value}」的${activeCat.value}`;
  if (activeDynKey.value === 'superform') return '还没有超级表单，请先在「应用中心-高级功能-超级表单」中创建';
  if (activeDynKey.value === 'plans') return '还没有全景方案，请先在「360全景」中创建方案';
  return `暂无${activeCat.value}`;
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

/** 灰显项（草稿/未发布）不可选，避免选了 C 端打不开 */
function pickItem(it) {
  if (it.disabled) return;
  pick.value = it.value;
}

function goManage() {
  const to = dynManageRoute.value;
  if (!to) return;
  emit('update:modelValue', false);
  // LinkPicker 被多个模块复用，兜底防止无 router 上下文时报错
  try {
    router.push(to);
  } catch (e) {
    window.location.hash = `#${to}`;
  }
}

async function loadGoods() {
  goodsLoading.value = true;
  try {
    const res = await designCall.get('/customer/goods', { params: { page: 1, pageSize: 200 } });
    goodsList.value = res.list || res.data || [];
  } catch (e) {
    goodsList.value = [];
  }
  goodsLoading.value = false;
}

async function loadCats() {
  goodsLoading.value = true;
  try {
    const res = await designCall.get('/customer/goods/categories');
    goodsCats.value = res.list || res.data || [];
  } catch (e) {
    goodsCats.value = [];
  }
  goodsLoading.value = false;
}

/**
 * 动态分类数据源：真实表单 / 真实全景方案，不再硬编码示例 id。
 * force=true 时忽略缓存重新拉：用户可能刚新建/删除了表单，
 * 沿用旧缓存会让已删除的目标仍显示在列表里（回显兜底也会误判）。
 */
async function loadDynamic(key, force = false) {
  if (!force && dynCache.value[key]?.loaded) return;
  dynLoading.value = true;
  dynError.value = '';
  try {
    let items = [];
    if (key === 'superform') {
      const { forms } = await fetchSuperForms();
      items = (forms || []).map((f) => {
        const published = f.status === 'published';
        const statusText = { published: '已发布', draft: '草稿', disabled: '已停用' }[f.status] || f.status || '未知';
        return {
          label: f.name || '未命名表单',
          value: DYNAMIC_SOURCES.superform.path(f),
          tag: statusText,
          tagClass: published ? 'is-ok' : 'is-warn',
          // 草稿/停用：C 端 public 接口取不到，列出来也填不了
          disabled: !published,
          desc: published
            ? `已提交 ${Number(f.submissionCount) || 0} 份`
            : `${statusText} · C 端不可访问`,
        };
      });
    } else if (key === 'plans') {
      const { plans } = await designCall.get('/design/plans');
      items = (plans || []).map((p) => {
        const online = !!p.published && !!p.shareEnabled;
        return {
          label: p.name || '未命名方案',
          value: DYNAMIC_SOURCES.plans.path(p),
          tag: online ? '可访问' : '未开放',
          tagClass: online ? 'is-ok' : 'is-warn',
          disabled: !online,
          desc: online
            ? `${Number(p.sceneCount) || 0} 个已上架场景`
            : '未发布或未开启分享 · C 端不可访问',
        };
      });
    }
    dynCache.value[key] = { items, loaded: true };
  } catch (e) {
    dynCache.value[key] = { items: [], loaded: true };
    dynError.value = e?.message || '加载失败，请稍后重试';
    ElMessage.error(dynError.value);
  } finally {
    dynLoading.value = false;
  }
}

/** 预加载所有动态分类，让侧栏计数与空态判断准确（静默失败）。每次打开都强制刷新。 */
function preloadDynamic() {
  return Promise.all(
    LINK_CATALOG.filter((c) => c.dynamic).map((c) => loadDynamic(c.dynamic, true).catch(() => {}))
  );
}

/**
 * 打开弹窗时把已有链接归位到对应分类。
 * 静态目录匹配不到时，尝试按 ?formId= / ?planId= 解析动态链接；
 * 目标已删除时保留原值不动（不清空），避免用户点「确定」丢配置。
 */
function resolveLink(link) {
  let matched = null;
  for (const c of LINK_CATALOG) {
    const it = c.items.find((x) => x.value === link);
    if (it) { matched = { cat: c.name, it }; break; }
  }
  if (matched) { activeCat.value = matched.cat; pick.value = matched.it.value; return null; }

  for (const c of LINK_CATALOG) {
    if (!c.dynamic) continue;
    const hit = parseDynamicLink(c.dynamic, link);
    if (!hit) continue;
    // 先切分类并回填，异步数据到位后由 syncDynamicPick 校正选中态
    activeCat.value = c.name;
    pick.value = link;
    return c.dynamic;
  }

  activeCat.value = CUSTOM_LINK.name;
  pick.value = '';
  customVal.value = link;
  return null;
}

/** 动态数据到位后校正：目标被删则回退自定义链接并原样保留 value */
function syncDynamicPick(key, link) {
  if (activeCatDef.value?.dynamic !== key || pick.value !== link) return;
  const cached = dynCache.value[key];
  if (!cached?.loaded) return;
  if (!cached.items.some((it) => it.value === link)) {
    activeCat.value = CUSTOM_LINK.name;
    pick.value = '';
    customVal.value = link;
    ElMessage.warning('原来选中的目标已不存在，已切换到自定义链接（值已保留）');
  }
}

watch(() => props.modelValue, async (v) => {
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
    dynSearch.value = '';
    const dynKey = resolveLink(link);
    await preloadDynamic();
    if (dynKey) syncDynamicPick(dynKey, link);
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
.lk-item.disabled { cursor: not-allowed; opacity: 0.6; background: #FAFBFC; }
.lk-item.disabled:hover { border-color: #E5E6EB; background: #FAFBFC; }
.lk-item.disabled .lk-dot { background: #C9CDD4; }
.lk-tag {
  display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 4px;
  font-size: 11px; font-weight: 400; line-height: 1.6;
}
.lk-tag.is-ok { color: #00875A; background: #E8F7F0; }
.lk-tag.is-warn { color: #B76E00; background: #FFF4E0; }
.lk-dot { width: 8px; height: 8px; border-radius: 50%; background: #C9CDD4; flex-shrink: 0; }
.lk-item.active .lk-dot { background: #165DFF; }
.lk-goods-img { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
.lk-item-info { flex: 1; min-width: 0; }
.lk-item-label { font-size: 13px; color: #1D2129; line-height: 1.4; }
.lk-item-value { font-size: 11px; color: #86909C; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lk-item-desc { font-size: 11px; color: #C9CDD4; margin-top: 2px; line-height: 1.4; }
.lk-check { color: #165DFF; font-weight: 600; flex-shrink: 0; }
.lk-empty { text-align: center; color: #86909C; font-size: 13px; padding: 40px 0; line-height: 1.7; }
.lk-empty-actions { margin-top: 12px; }
.lk-custom { padding: 4px 0; }
.lk-label { font-size: 13px; color: #1D2129; margin-bottom: 8px; }
.lk-help { font-size: 12px; color: #86909C; margin-top: 8px; }
</style>
