<template>
  <div class="apps-center">
    <!-- 左侧分类导航（与总后台应用中心一致） -->
    <aside class="cat-sidebar">
      <div class="cat-header">功能分类</div>
      <div
        v-for="cat in categories"
        :key="cat.name"
        class="cat-item"
        :class="{ active: activeCat?.name === cat.name }"
        @click="activeCat = cat"
      >
        <SIcon :name="cat.icon || 'apps'" size="default" />
        <span class="cat-name">{{ cat.name }}</span>
        <span class="cat-count">{{ cat.apps.length }}</span>
      </div>
    </aside>

    <!-- 右侧应用卡片区 -->
    <main class="cat-content">
      <div class="content-head">
        <div class="content-title">{{ activeCat?.name || '' }} <span class="content-sub">{{ catCountText }}</span></div>
        <div class="drag-tip" v-if="draggingApp">拖拽卡片到目标位置释放，可调整应用顺序</div>
      </div>
      <div v-if="!activeCat?.apps.length" class="empty">该分类下暂无应用</div>
      <div class="app-grid">
        <template v-for="(app, idx) in activeCat?.apps || []" :key="app.code">
          <!-- 全端渠道分类：直接展示各端渠道卡片，进入即到对应渠道配置 -->
          <template v-if="app.code === 'channel'">
            <div v-for="ch in CUST_CHANNELS" :key="'ch-' + ch.type" class="app-card channel-card">
              <div class="app-icon-wrap">
                <SIcon :name="ch.icon" size="xlarge" class="app-icon" />
              </div>
              <div class="app-name">{{ ch.name }}</div>
              <div class="app-code">{{ ch.type }}</div>
              <div class="app-desc">{{ ch.desc }}</div>
              <el-button type="primary" size="small" class="enter-btn" @click="enterChannel(ch)">进入应用</el-button>
            </div>
          </template>
          <div
            v-else
            class="app-card"
            :draggable="true"
            @dragstart="onDragStart(app, idx, $event)"
            @dragover.prevent
            @drop="onDrop(app, idx, $event)"
            @dragend="onDragEnd"
          >
            <div class="app-icon-wrap">
              <SIcon :name="app.icon" size="xlarge" class="app-icon" />
            </div>
            <div class="app-name">{{ app.name }}</div>
            <div class="app-code">{{ app.code }}</div>
            <div class="app-desc">{{ app.description }}</div>
            <el-button type="primary" size="small" class="enter-btn" @click="enterApp(app)">进入应用</el-button>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { customerApiCall } from '../../api';
import SIcon from '../../components/SIcon.vue';
import { ElMessage } from 'element-plus';

const router = useRouter();
const route = useRoute();
const apps = ref([]);
const categories = ref([]);
const activeCat = ref(null);
const draggingApp = ref(null);

// 租户端各端渠道（已开通/已开发渠道直开，不再经「全端渠道 → 进入应用」中间层）
const CUST_CHANNELS = [
  { type: 'mini', name: '微信小程序', icon: 'wechat', desc: '独立小程序，自主发布' },
  { type: 'h5', name: 'H5手机端', icon: 'mobile', desc: '移动端网页，支持自定义域名' },
  { type: 'mp', name: '微信公众号', icon: 'official', desc: '公众号内嵌H5' },
  { type: 'pc', name: 'PC网站', icon: 'pc', desc: '桌面端网站，支持自定义域名' },
];

const catCountText = computed(() => {
  const list = activeCat.value?.apps || [];
  if (list.some(a => a.code === 'channel')) return `共 ${CUST_CHANNELS.length} 个渠道`;
  return `共 ${list.length} 个应用`;
});

// 分类图标映射（与总后台预置分类一致）
const catIconMap = {
  '默认分类': 'apps',
  '基础功能': 'settings',
  '全端渠道': 'channel',
  '营销引流': 'analytics',
  '客群维护': 'customer',
  '行业应用': 'apps',
  '高级功能': 'badge',
  '管理工具': 'logs',
};

// 分类顺序与总后台一致
const catOrder = ['默认分类', '基础功能', '全端渠道', '营销引流', '客群维护', '行业应用', '高级功能', '管理工具'];

onMounted(async () => {
  let list = [];
  try {
    const data = await customerApiCall.get('/apps');
    list = (data.apps || []).map(a => ({ ...a, icon: a.icon || 'apps' }));
  } catch (e) {}
  if (!list.length) {
    // 接口异常兜底：平台内置应用
    list = [
      { code: 'channel', name: '全端渠道', icon: 'channel', description: '管理H5、小程序、公众号、PC网站各端渠道配置与发布', category: '全端渠道' },
    ];
  }
  const seen = new Set();
  list = list.filter(a => { if (seen.has(a.code)) return false; seen.add(a.code); return true; });
  apps.value = list;
  // 按分类分组（保持平台分类顺序，只显示有应用的分类）
  const byCat = {};
  list.forEach(a => {
    const c = a.category || '默认分类';
    if (!byCat[c]) byCat[c] = [];
    byCat[c].push(a);
  });
  const cats = [];
  catOrder.forEach(name => {
    if (byCat[name]?.length) cats.push({ name, icon: catIconMap[name] || 'apps', apps: byCat[name] });
  });
  // 未预置分类（如未来新增）排最后
  Object.keys(byCat).forEach(name => {
    if (!cats.some(c => c.name === name)) cats.push({ name, icon: 'apps', apps: byCat[name] });
  });
  categories.value = cats;
  // 面包屑带分类参数（如 /apps?cat=分销体系）时直接定位到对应分类
  const q = route.query.cat;
  activeCat.value = (q ? cats.find(c => c.name === String(q)) : null) || cats[0] || null;
});

function enterApp(app) {
  if (app.code === 'panorama') router.push('/apps/panorama');
  else if (app.code === 'card') router.push('/apps/card');
  else router.push('/apps/' + app.code);
}

function enterChannel(ch) {
  if (ch.type === 'mini') router.push('/apps/channel/mini');
  else router.push(`/apps/channel/config?type=${ch.type}`);
}

function onDragStart(app, idx, e) {
  draggingApp.value = { app, fromIdx: idx };
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function onDrop(app, idx, e) {
  e.preventDefault();
  if (!draggingApp.value) return;
  const from = draggingApp.value.fromIdx;
  const to = idx;
  if (from === to) return;
  const list = [...(activeCat.value?.apps || [])];
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  activeCat.value.apps = list;
  draggingApp.value = null;
  persistSort();
}
function onDragEnd() {
  draggingApp.value = null;
}
async function persistSort() {
  try {
    const codes = (activeCat.value?.apps || []).map(a => a.code);
    await customerApiCall.put('/apps/sort', { codes });
    ElMessage.success('应用顺序已保存');
  } catch (e) { ElMessage.error(e); }
}
</script>

<style scoped>
.apps-center {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
/* 左侧分类导航 */
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

/* 右侧内容 */
.cat-content { flex: 1; min-width: 0; background: #fff; border-radius: 8px; padding: 20px; }
.content-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.content-title { font-size: 16px; font-weight: 600; color: #1d2129; }
.content-sub { font-size: 13px; color: #86909c; font-weight: 400; margin-left: 8px; }
.drag-tip { font-size: 12px; color: #165dff; }
.empty {
  text-align: center;
  color: #86909c;
  font-size: 13px;
  padding: 60px 0;
}
.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.app-card {
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  padding: 24px 20px;
  text-align: center;
  transition: all 0.2s;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.app-card:hover {
  border-color: rgba(22, 93, 255, 0.4);
  box-shadow: 0 4px 16px rgba(22, 93, 255, 0.08);
}
.app-card[draggable='true'] { cursor: grab; }
.app-card[draggable='true']:active { cursor: grabbing; }
.app-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: rgba(22, 93, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
  transition: all 0.2s;
}
.app-card:hover .app-icon-wrap { background: rgba(22, 93, 255, 0.12); }
.app-card:hover .app-icon { color: #165dff; }
.app-icon { color: #4e5969; transition: color 0.2s; }
.app-name { font-size: 16px; font-weight: 600; color: #1d2129; }
.app-code { font-size: 11px; color: #86909c; margin-top: 2px; font-family: monospace; }
.app-desc {
  font-size: 13px; color: #86909c; margin: 8px 0 0; min-height: 38px; line-height: 1.5;
  flex: 1 1 auto; width: 100%;
  display: flex; align-items: center; justify-content: center;
}
.enter-btn { margin-top: 16px; }
.channel-card { cursor: pointer; }
.channel-card:hover .app-icon-wrap { background: rgba(22, 93, 255, 0.12); }
.channel-card:hover .app-icon { color: #165dff; }
</style>
