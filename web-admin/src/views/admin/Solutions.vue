<template>
  <div class="page">
    <div class="page-card">
      <div class="page-header">
        <div>
          <h2 class="page-title">解决方案</h2>
          <p class="page-desc">方案中心：管理可售卖的解决方案（基础设置 / 价格设置 / 权限设置）</p>
        </div>
        <div class="header-actions">
          <el-select v-model="filterCategory" placeholder="全部分类" clearable style="width: 160px" @change="load">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 140px" @change="load">
            <el-option label="上架中" value="on" />
            <el-option label="已下架" value="off" />
          </el-select>
          <el-button type="primary" @click="$router.push('/solutions/new')">
            <el-icon style="margin-right: 4px"><Plus /></el-icon>新建解决方案
          </el-button>
        </div>
      </div>

      <div class="solution-grid" v-loading="loading">
        <div v-for="s in solutions" :key="s.id" class="solution-card" :class="{ off: s.status === 'off' }">
          <div class="solution-icon-wrap">
            <SIcon :name="getIconName(s)" size="xlarge" class="solution-icon" />
          </div>
          <div class="solution-name">
            {{ s.name }}
            <el-tag v-if="s.isHot" type="danger" size="small" class="hot-tag">热门</el-tag>
          </div>
          <div class="solution-cat">{{ categoryName(s.categoryId) }}</div>
          <div class="solution-desc">{{ s.description }}</div>
          <div class="solution-status">
            <el-tag :type="s.status === 'on' ? 'success' : 'info'" size="small">
              {{ s.status === 'on' ? '上架中' : '已下架' }}
            </el-tag>
            <el-tag type="info" size="small" effect="plain" class="use-tag">使用 {{ s.virtualUseCount + actualUseCount(s) }} 项目</el-tag>
          </div>
          <div class="solution-actions">
            <el-button size="small" type="primary" plain @click="$router.push(`/solutions/${s.id}/edit`)">编辑</el-button>
            <el-button size="small" :type="s.status === 'on' ? 'warning' : 'success'" @click="toggleStatus(s)">
              {{ s.status === 'on' ? '下架' : '上架' }}
            </el-button>
          </div>
        </div>
        <el-empty v-if="!loading && !solutions.length" description="暂无解决方案" style="grid-column: 1 / -1" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { fetchSolutions, fetchSolutionCategories } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import SIcon from '../../components/SIcon.vue';
import { updateSolution } from '../../api';

const solutions = ref([]);
const categories = ref([]);
const loading = ref(false);
const filterCategory = ref(null);
const filterStatus = ref(null);

function getIconName(s) {
  const codeMap = { panorama: 'panorama', card: 'card', channel: 'devices' };
  return codeMap[s.code] || s.icon || 'template';
}
function categoryName(id) {
  const c = categories.value.find((x) => x.id === id);
  return c ? c.name : '';
}
function actualUseCount(s) {
  // 实际使用项目数 = 已开通该方案的客户项目数（由虚拟+实际展示，实际数前端近似取 app_config 或 0）
  return 0;
}

async function load() {
  loading.value = true;
  try {
    const params = {};
    if (filterCategory.value) params.categoryId = filterCategory.value;
    if (filterStatus.value) params.status = filterStatus.value;
    solutions.value = (await fetchSolutions(params)).solutions || [];
  } catch (e) {
    ElMessage.error(e);
  } finally {
    loading.value = false;
  }
}

async function loadCategories() {
  try {
    categories.value = (await fetchSolutionCategories()).categories || [];
  } catch (e) { /* 分类加载失败不阻塞 */ }
}

async function toggleStatus(s) {
  const action = s.status === 'on' ? '下架' : '上架';
  try {
    await ElMessageBox.confirm(
      `确定${action}「${s.name}」？${s.status === 'on' ? '下架后租户应用中心不再展示，已开通客户不受影响。' : ''}`,
      '确认',
      { type: 'warning' }
    );
    await updateSolution(s.id, { status: s.status === 'on' ? 'off' : 'on' });
    ElMessage.success(`${action}成功`);
    load();
  } catch (e) { /* 取消或失败 */ }
}

onMounted(() => {
  loadCategories();
  load();
});
</script>

<style scoped>
.page { padding: 20px; }
.page-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.page-title { font-size: 18px; font-weight: 600; color: #1D2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909C; margin: 6px 0 0; }
.header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.solution-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.solution-card { background: #fff; border: 1px solid #E5E6EB; border-radius: 10px; padding: 24px; text-align: center; transition: all 0.2s; }
.solution-card:hover { box-shadow: 0 4px 16px rgba(22,93,255,0.10); border-color: rgba(22,93,255,0.2); }
.solution-card:hover .solution-icon-wrap { background: rgba(22,93,255,0.12); }
.solution-card:hover .solution-icon { color: #165DFF; }
.solution-card.off { opacity: 0.6; background: #FAFAFA; }
.solution-icon-wrap {
  width: 56px; height: 56px; border-radius: 14px; background: rgba(22,93,255,0.06);
  display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; transition: all 0.2s;
}
.solution-icon { color: #4E5969; transition: color 0.2s; }
.solution-name { font-size: 16px; font-weight: 600; color: #1D2129; margin-bottom: 4px; }
.hot-tag { margin-left: 6px; }
.solution-cat { font-size: 12px; color: #86909C; margin-bottom: 8px; }
.solution-desc { font-size: 13px; color: #86909C; margin-bottom: 12px; min-height: 40px; line-height: 1.5; }
.solution-status { margin-bottom: 14px; display: flex; gap: 6px; justify-content: center; align-items: center; }
.use-tag { font-weight: 400; }
.solution-actions { display: flex; gap: 8px; justify-content: center; }
</style>
