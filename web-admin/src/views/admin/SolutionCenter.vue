<template>
  <div>
    <!-- 顶部二级菜单（图1样式：选中高亮块） -->
    <div class="center-nav">
      <div
        v-for="t in tabs"
        :key="t.key"
        class="center-nav-item"
        :class="{ active: activeTab === t.key }"
        @click="switchTab(t.key)"
      >{{ t.label }}</div>
    </div>

    <!-- 总览：默认首页 -->
    <div v-if="activeTab === 'overview'" class="overview">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-icon"><SIcon name="solutions" size="18" /></div>
          <div>
            <div class="stat-value">{{ stats.total }}</div>
            <div class="stat-label">方案总数</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon success"><SIcon name="badge" size="18" /></div>
          <div>
            <div class="stat-value">{{ stats.on }}</div>
            <div class="stat-label">上架中</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon warn"><SIcon name="no-ads" size="18" /></div>
          <div>
            <div class="stat-value">{{ stats.off }}</div>
            <div class="stat-label">已下架</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple"><SIcon name="chart" size="18" /></div>
          <div>
            <div class="stat-value">{{ stats.usage }}</div>
            <div class="stat-label">使用项目总数</div>
          </div>
        </div>
      </div>

      <div class="sec-title">
        <span>解决方案</span>
        <el-button type="primary" size="small" @click="$router.push('/solutions/new')">新建解决方案</el-button>
      </div>
      <div class="sol-grid">
        <div v-for="s in solutions" :key="s.id" class="sol-card">
          <div class="sol-card-head">
            <span class="sol-icon"><SIcon :name="getAppIcon(s.icon)" size="18" /></span>
            <span class="sol-name">{{ s.name }}</span>
            <el-tag v-if="s.isHot" type="danger" size="small" effect="light">热门</el-tag>
          </div>
          <div class="sol-desc">{{ s.description || '暂无描述' }}</div>
          <div class="sol-meta">
            <el-tag :type="s.status === 'on' ? 'success' : 'info'" size="small">{{ s.status === 'on' ? '上架中' : '已下架' }}</el-tag>
            <span class="sol-use">使用 {{ (s.virtualUseCount || 0) }} 项目</span>
          </div>
          <div class="sol-actions">
            <el-button size="small" @click="$router.push(`/solutions/${s.id}/edit`)">编辑</el-button>
            <el-button size="small" :type="s.status === 'on' ? 'warning' : 'success'" plain @click="toggleStatus(s)">{{ s.status === 'on' ? '下架' : '上架' }}</el-button>
          </div>
        </div>
        <el-empty v-if="!solutions.length" description="暂无解决方案" :image-size="90" />
      </div>
    </div>

    <!-- 解决方案列表 -->
    <div v-else-if="activeTab === 'solutions'" class="sub-page">
      <div class="page-header">
        <div>
          <h2 class="page-title">解决方案</h2>
          <div class="page-sub">管理可售卖的解决方案（基础设置 / 价格设置 / 权限设置）</div>
        </div>
        <el-button type="primary" @click="$router.push('/solutions/new')">新建解决方案</el-button>
      </div>
      <div class="filter-bar">
        <el-select v-model="filterCategory" placeholder="全部分类" clearable style="width:160px;" @change="load">
          <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-radio-group v-model="filterStatus" @change="load">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="on">上架中</el-radio-button>
          <el-radio-button value="off">已下架</el-radio-button>
        </el-radio-group>
      </div>
      <div class="sol-grid">
        <div v-for="s in solutions" :key="s.id" class="sol-card">
          <div class="sol-card-head">
            <span class="sol-icon"><SIcon :name="getAppIcon(s.icon)" size="18" /></span>
            <span class="sol-name">{{ s.name }}</span>
            <el-tag v-if="s.isHot" type="danger" size="small" effect="light">热门</el-tag>
            <el-tag v-if="s.code === 'demo'" type="warning" size="small" effect="light">演示</el-tag>
          </div>
          <div class="sol-desc">{{ s.description || '暂无描述' }}</div>
          <div class="sol-meta">
            <el-tag :type="s.status === 'on' ? 'success' : 'info'" size="small">{{ s.status === 'on' ? '上架中' : '已下架' }}</el-tag>
            <span class="sol-use">使用 {{ (s.virtualUseCount || 0) }} 项目</span>
          </div>
          <div class="sol-actions">
            <el-button size="small" @click="$router.push(`/solutions/${s.id}/edit`)">编辑</el-button>
            <el-button size="small" :type="s.status === 'on' ? 'warning' : 'success'" plain @click="toggleStatus(s)">{{ s.status === 'on' ? '下架' : '上架' }}</el-button>
          </div>
        </div>
        <el-empty v-if="!solutions.length" description="暂无解决方案" :image-size="90" />
      </div>
    </div>

    <!-- 方案分类 / 名片模板：内嵌自包含页面 -->
    <div v-else-if="activeTab === 'categories'">
      <SolutionCategories />
    </div>
    <div v-else-if="activeTab === 'templates'">
      <TemplateLibrary />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { fetchSolutions, fetchSolutionCategories, updateSolution } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../components/SIcon.vue';
import SolutionCategories from './SolutionCategories.vue';
import TemplateLibrary from './TemplateLibrary.vue';

const tabs = [
  { key: 'overview', label: '总览' },
  { key: 'solutions', label: '解决方案' },
  { key: 'categories', label: '方案分类' },
  { key: 'templates', label: '名片模板' },
];
const activeTab = ref('overview');
const solutions = ref([]);
const categories = ref([]);
const filterCategory = ref(null);
const filterStatus = ref('');
const stats = reactive({ total: 0, on: 0, off: 0, usage: 0 });

const iconMap = {
  panorama: 'panorama', card: 'card', devices: 'devices', template: 'template',
  market: 'market', chart: 'chart', building: 'building', dynamic: 'dynamic', apps: 'apps',
};
function getAppIcon(icon) { return iconMap[icon] || 'apps'; }

function switchTab(key) { activeTab.value = key; }

async function load() {
  try {
    const params = {};
    if (filterCategory.value) params.categoryId = filterCategory.value;
    if (filterStatus.value) params.status = filterStatus.value;
    solutions.value = (await fetchSolutions(params)).solutions || [];
    stats.total = solutions.value.length;
    stats.on = solutions.value.filter((s) => s.status === 'on').length;
    stats.off = solutions.value.filter((s) => s.status === 'off').length;
    stats.usage = solutions.value.reduce((acc, s) => acc + (s.virtualUseCount || 0), 0);
  } catch (e) {}
}

async function toggleStatus(s) {
  const action = s.status === 'on' ? '下架' : '上架';
  const confirmed = await ElMessageBox.confirm(`确认${action}「${s.name}」？${s.status === 'on' ? '下架后不再向新租户开放。' : ''}`, '提示', {
    confirmButtonText: action, cancelButtonText: '取消', type: 'warning',
  }).catch(() => false);
  if (!confirmed) return;
  try {
    await updateSolution(s.id, { status: s.status === 'on' ? 'off' : 'on' });
    ElMessage.success(`已${action}`);
    load();
  } catch (e) { ElMessage.error(e); }
}

onMounted(async () => {
  try { categories.value = (await fetchSolutionCategories()).categories || []; } catch (e) {}
  load();
});
</script>

<style scoped>
.center-nav { display:flex; gap:4px; background:#fff; border-radius:8px; padding:8px 12px; box-shadow:0 2px 8px rgba(0,0,0,0.06); margin-bottom:16px; }
.center-nav-item { padding:8px 20px; border-radius:8px; font-size:14px; color:#4E5969; cursor:pointer; transition:all .2s; }
.center-nav-item:hover { background:#F2F3F5; color:#1D2129; }
.center-nav-item.active { background:#E8F3FF; color:#165DFF; font-weight:500; }

.stat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; }
.stat-card { display:flex; align-items:center; gap:14px; background:#fff; border-radius:8px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
.stat-icon { width:44px; height:44px; border-radius:10px; background:rgba(22,93,255,0.1); color:#165DFF; display:flex; align-items:center; justify-content:center; }
.stat-icon.success { background:rgba(0,180,42,0.1); color:#00B42A; }
.stat-icon.warn { background:rgba(255,125,0,0.1); color:#FF7D00; }
.stat-icon.purple { background:rgba(114,46,209,0.1); color:#722ED1; }
.stat-value { font-size:24px; font-weight:600; color:#1D2129; line-height:1.2; }
.stat-label { font-size:13px; color:#86909C; margin-top:2px; }

.sec-title { display:flex; align-items:center; justify-content:space-between; font-size:16px; font-weight:600; color:#1D2129; margin:24px 0 16px; }
.sol-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
.sol-card { background:#fff; border-radius:8px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
.sol-card-head { display:flex; align-items:center; gap:10px; }
.sol-icon { width:40px; height:40px; border-radius:10px; background:rgba(22,93,255,0.06); display:flex; align-items:center; justify-content:center; color:#4E5969; }
.sol-name { font-size:15px; font-weight:600; color:#1D2129; }
.sol-card-head .el-tag { margin-left:auto; }
.sol-desc { font-size:13px; color:#86909C; margin:10px 0 14px; min-height:38px; line-height:1.5; }
.sol-meta { display:flex; align-items:center; gap:10px; }
.sol-use { font-size:12px; color:#909399; }
.sol-actions { display:flex; gap:8px; margin-top:14px; }

.page-sub { font-size:13px; color:#86909C; margin-top:4px; }
.filter-bar { display:flex; gap:12px; align-items:center; margin-bottom:16px; }
</style>
