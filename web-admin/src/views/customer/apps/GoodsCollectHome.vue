<template>
  <div class="collect-home">
    <!-- 应用内 Tab（商品采集：采集配置 / 接口 / 采集记录） -->
    <div class="card-tabs">
      <div class="ctab" :class="{ active: activeTab === 'config' }" @click="activeTab = 'config'">
        <SIcon name="dynamic" size="default" :color="activeTab === 'config' ? '#165dff' : '#4e5969'" />
        <span>采集配置</span>
      </div>
      <div class="ctab" :class="{ active: activeTab === 'api' }" @click="activeTab = 'api'">
        <SIcon name="key" size="default" :color="activeTab === 'api' ? '#165dff' : '#4e5969'" />
        <span>接口</span>
      </div>
      <div class="ctab" :class="{ active: activeTab === 'records' }" @click="activeTab = 'records'">
        <SIcon name="template" size="default" :color="activeTab === 'records' ? '#165dff' : '#4e5969'" />
        <span>采集记录</span>
      </div>
    </div>

    <!-- ============ 采集配置（1:1 菜鸟云 goods_collect/goodsadd：商品链接/选择分类/状态/确定） ============ -->
    <div v-if="activeTab === 'config'" class="panel">
      <AppPageHeader title="商品采集" desc="批量采集淘宝/天猫商品链接到商品库（多个链接用 ; 分隔）" />
      <div class="card collect-form">
        <div class="sub-title">添加采集任务</div>
        <el-form label-width="90px" style="max-width: 640px">
          <el-form-item label="商品链接" required>
            <el-input v-model="form.link" type="textarea" :rows="5" placeholder="请输入商品链接，多个链接用 ; 分隔&#10;例如：https://item.taobao.com/item.htm?id=xxx; https://detail.tmall.com/item.htm?id=xxx" />
          </el-form-item>
          <el-form-item label="选择分类" required>
            <el-select v-model="form.categoryId" placeholder="请选择商品分类" style="width: 100%">
              <el-option v-for="c in categories" :key="c.id" :label="c.label" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-radio-group v-model="form.status">
              <el-radio value="off">暂不上架</el-radio>
              <el-radio value="on">立即上架</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
          </el-form-item>
        </el-form>
        <div class="collect-tip">
          说明：采集任务提交后将进入采集记录，真实商品抓取需在「接口」菜单中配置淘宝/天猫 APIKEY 后自动入库。
        </div>
      </div>
    </div>

    <!-- ============ 接口（采集 APIKEY，独立菜单项） ============ -->
    <div v-else-if="activeTab === 'api'" class="panel">
      <AppPageHeader title="接口" desc="配置第三方数据接口 APIKEY（采集淘宝/天猫/京东商品）" />
      <div class="card collect-form">
        <div class="sub-title">采集 APIKEY</div>
        <el-form label-width="90px" style="max-width: 640px">
          <el-form-item label="APIKEY">
            <el-input v-model="apiKey" class="w360" placeholder="数据接口 APIKEY" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="savingKey" @click="saveApiKey">保存</el-button>
          </el-form-item>
        </el-form>
        <div class="collect-tip">采集 APIKEY：点击申请在我的数据接口中添加淘宝、天猫、京东商城接口</div>
      </div>
    </div>

    <!-- ============ 采集记录 ============ -->
    <div v-else class="panel">
      <AppPageHeader title="采集记录" desc="已提交的采集任务列表" />
      <div class="card">
        <el-table :data="records" v-loading="loading">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="link" label="商品链接" min-width="260" show-overflow-tooltip />
          <el-table-column label="归属分类" width="140">
            <template #default="{ row }">{{ catName(row.categoryId) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="row.status === 'on' ? 'success' : 'info'" size="small">{{ row.status === 'on' ? '立即上架' : '暂不上架' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="处理状态" width="110">
            <template #default="{ row }">
              <el-tag :type="row.state === 'done' ? 'success' : row.state === 'failed' ? 'danger' : 'warning'" size="small">
                {{ { pending: '待处理', done: '已完成', failed: '失败' }[row.state] || row.state }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="提交时间" width="180" />
        </el-table>
        <div v-if="!records.length" class="empty-tip">暂无采集记录</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import SIcon from '../../../components/SIcon.vue';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import { customerApiCall } from '../../../api';

const activeTab = ref('config');
const form = ref({ link: '', categoryId: null, status: 'off' });
const categories = ref([]);
const records = ref([]);
const loading = ref(false);
const saving = ref(false);
const apiKey = ref('');
const savingKey = ref(false);

async function loadApiKey() {
  try {
    const res = await customerApiCall.get('/goods/collect-config');
    apiKey.value = res.nineApiKey || '';
  } catch (e) { /* 加载失败不阻塞 */ }
}
async function saveApiKey() {
  savingKey.value = true;
  try {
    await customerApiCall.put('/goods/collect-config', { nineApiKey: apiKey.value });
    ElMessage.success('采集 APIKEY 已保存');
  } catch (e) { ElMessage.error(e); } finally { savingKey.value = false; }
}

async function loadCategories() {
  try {
    const res = await customerApiCall.get('/goods/categories');
    // categories 返回树形：一级/二级，构建平铺选择项
    const flat = [];
    const walk = (nodes, pidLabel) => {
      for (const n of nodes || []) {
        flat.push({ id: n.id, label: pidLabel ? `${pidLabel} / ${n.name}` : n.name });
        walk(n.children, n.name);
      }
    };
    walk(res.list || [], '');
    categories.value = flat;
  } catch (e) { /* 分类加载失败不阻塞 */ }
}

function catName(id) {
  return categories.value.find((c) => c.id === id)?.label || '未分类';
}

async function submit() {
  if (!form.value.link.trim()) { ElMessage.warning('请输入商品链接'); return; }
  if (!form.value.categoryId) { ElMessage.warning('请选择商品分类'); return; }
  saving.value = true;
  try {
    const res = await customerApiCall.post('/goods/collects', { link: form.value.link, categoryId: form.value.categoryId, status: form.value.status });
    ElMessage.success(`已提交 ${res.count || 0} 条采集任务`);
    form.value.link = '';
    loadRecords();
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}

async function loadRecords() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/goods/collects');
    records.value = res.list || [];
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}

onMounted(() => { loadCategories(); loadRecords(); loadApiKey(); });
</script>

<style scoped>
.collect-home { display: flex; flex-direction: column; gap: 16px; }
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
}
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
.panel { display: flex; flex-direction: column; gap: 16px; }
.card { background: #fff; border-radius: 8px; padding: 20px; }
.collect-form { max-width: 860px; }
.sub-title { font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 12px; }
.w360 { width: 360px; }
.collect-tip { font-size: 12px; color: #86909c; margin-top: 8px; line-height: 1.6; }
.empty-tip { color: #86909c; font-size: 13px; padding: 24px 0; text-align: center; }
</style>
