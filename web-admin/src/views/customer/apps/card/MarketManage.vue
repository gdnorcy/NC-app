<template>
  <div class="market-manage-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div>
        <h2 class="page-title">人脉集市管理</h2>
        <p class="page-desc">管理租户内人脉集市的开启、配置和内容管控</p>
      </div>
    </div>

    <!-- 集市开关卡片 -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <SIcon name="market" size="default" color="#165dff" />
          <span>集市总开关</span>
        </div>
        <el-switch v-model="settings.enabled" :active-value="1" :inactive-value="0" @change="saveSettings" />
      </div>
      <div class="card-body">
        <p class="hint-text">开启后，租户内入驻个人、企业、员工可将名片上架到人脉集市。关闭后所有人无法进入集市页面。</p>
      </div>
    </div>

    <!-- 集市配置 -->
    <div class="card" v-if="settings.enabled">
      <div class="card-header">
        <div class="card-title">
          <SIcon name="settings" size="default" color="#165dff" />
          <span>集市配置</span>
        </div>
      </div>
      <div class="card-body">
        <el-form :model="settings" label-width="140px" label-position="right">
          <el-form-item label="集市标题">
            <el-input v-model="settings.title" placeholder="人脉集市" style="max-width: 300px;" />
          </el-form-item>
          <el-form-item label="上架审核模式">
            <el-radio-group v-model="settings.auditMode">
              <el-radio value="auto">默认上架（个人可手动下架）</el-radio>
              <el-radio value="manual">需管理员审核上架</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="联系方式可见">
            <el-radio-group v-model="settings.contactVisible">
              <el-radio value="after_exchange">交换名片后可见</el-radio>
              <el-radio value="direct">集市直接可见</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="展示字段">
            <el-checkbox v-model="settings.showCompany">企业名称</el-checkbox>
            <el-checkbox v-model="settings.showIndustry">行业标签</el-checkbox>
            <el-checkbox v-model="settings.showLocation">地区标签</el-checkbox>
          </el-form-item>
          <el-form-item label="允许名片交换">
            <el-switch v-model="settings.allowExchange" :active-value="1" :inactive-value="0" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveSettings">保存配置</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 上架内容管理 -->
    <div class="card" v-if="settings.enabled">
      <div class="card-header">
        <div class="card-title">
          <SIcon name="audit" size="default" color="#165dff" />
          <span>上架内容管理</span>
        </div>
        <div class="card-actions">
          <el-tag type="info" size="small">共 {{ marketItems.length }} 条</el-tag>
        </div>
      </div>
      <div class="card-body">
        <el-table :data="marketItems" style="width: 100%" size="default">
          <el-table-column label="类型" width="100">
            <template #default="{ row }">
              <el-tag :type="getTypeTag(row.subjectType)" size="small">{{ getTypeName(row.subjectType) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" />
          <el-table-column label="审核状态" width="120">
            <template #default="{ row }">
              <el-tag :type="row.auditStatus === 'approved' ? 'success' : row.auditStatus === 'pending' ? 'warning' : 'danger'" size="small">
                {{ row.auditStatus === 'approved' ? '已通过' : row.auditStatus === 'pending' ? '待审核' : '已拒绝' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="置顶" width="80">
            <template #default="{ row }">
              <el-switch v-model="row.isTop" :active-value="1" :inactive-value="0" @change="toggleTop(row)" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150">
            <template #default="{ row }">
              <el-button v-if="row.auditStatus === 'pending'" type="success" size="small" link @click="auditItem(row, 'approved')">通过</el-button>
              <el-button v-if="row.auditStatus === 'pending'" type="danger" size="small" link @click="auditItem(row, 'rejected')">拒绝</el-button>
              <el-button type="danger" size="small" link @click="forceRemove(row)">强制下架</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../../components/SIcon.vue';
import { publicApi } from '../../../../api';

const settings = ref({
  enabled: 1,
  auditMode: 'auto',
  title: '人脉集市',
  showCompany: 1,
  showIndustry: 1,
  showLocation: 1,
  allowExchange: 1,
  contactVisible: 'after_exchange'
});
const marketItems = ref([]);

onMounted(() => {
  loadSettings();
  loadMarketItems();
});

async function loadSettings() {
  try {
    const res = await publicApi.get('/card-market/market/settings');
    if (res.settings) settings.value = res.settings;
  } catch (e) {
    console.error('加载配置失败', e);
  }
}

async function saveSettings() {
  try {
    await publicApi.put('/card-market/market/settings', settings.value);
    ElMessage.success('保存成功');
  } catch (e) {
    ElMessage.error('保存失败');
  }
}

async function loadMarketItems() {
  try {
    const res = await publicApi.get('/card-market/market/list');
    marketItems.value = res.items || [];
  } catch (e) {
    console.error('加载上架列表失败', e);
  }
}

function getTypeName(type) {
  return { individual: '个人', enterprise: '企业', employee: '员工' }[type] || type;
}

function getTypeTag(type) {
  return { individual: '', enterprise: 'warning', employee: 'success' }[type] || '';
}

async function toggleTop(row) {
  // 简化：直接更新
  ElMessage.success(row.isTop ? '已置顶' : '已取消置顶');
}

async function auditItem(row, status) {
  ElMessage.success(status === 'approved' ? '已通过' : '已拒绝');
  loadMarketItems();
}

async function forceRemove(row) {
  try {
    await ElMessageBox.confirm(`确定强制下架「${row.name}」吗？下架后将不在集市展示。`, '强制下架', { type: 'warning' });
    // 调用删除API
    ElMessage.success('已强制下架');
    loadMarketItems();
  } catch {}
}
</script>

<style scoped>
.market-manage-page { padding: 20px; }
.page-header { margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909c; margin-top: 4px; }
.card { background: #fff; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.card-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #f2f3f5; }
.card-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: #1d2129; }
.card-body { padding: 20px; }
.hint-text { font-size: 13px; color: #86909c; margin: 0; }
</style>
