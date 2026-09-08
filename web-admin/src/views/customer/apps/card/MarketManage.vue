<template>
  <div class="market-manage-page">
    <!-- 统一Tab导航（5个管理功能共用） -->
    <CardTabs />

    <!-- 页面标题 -->
    <AppPageHeader title="人脉集市管理" desc="管理人脉集市的开启、配置和内容管控" />

    <!-- 数据统计 -->
    <div class="stats-row" v-if="settings.enabled">
      <div class="stat-card">
        <div class="stat-icon-wrap"><SIcon name="analytics" size="default" color="#165dff" /></div>
        <div class="stat-info">
          <div class="stat-num">{{ stats.visitCount || 0 }}</div>
          <div class="stat-label">集市访问量</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap"><SIcon name="exchange" size="default" color="#00b42a" /></div>
        <div class="stat-info">
          <div class="stat-num">{{ stats.exchangeCount || 0 }}</div>
          <div class="stat-label">名片交换次数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap"><SIcon name="user" size="default" color="#ff7d00" /></div>
        <div class="stat-info">
          <div class="stat-num">{{ stats.itemCount || 0 }}</div>
          <div class="stat-label">上架名片数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap"><SIcon name="audit" size="default" color="#722ed1" /></div>
        <div class="stat-info">
          <div class="stat-num">{{ stats.pendingCount || 0 }}</div>
          <div class="stat-label">待审核</div>
        </div>
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
        <p class="hint-text">开启后，入驻个人、企业、员工可将名片上架到人脉集市。关闭后所有人无法进入集市页面。</p>
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
          <el-form-item label="集市风格">
            <div class="style-picker">
              <div
                v-for="s in styles"
                :key="s.key"
                class="style-option"
                :class="{ active: settings.style === s.key, locked: !s.purchased }"
                @click="s.purchased && (settings.style = s.key)"
              >
                <div class="style-head">
                  <span class="style-name">{{ s.name }}</span>
                  <el-tag v-if="s.isDefault" size="small" type="success" effect="plain">默认</el-tag>
                  <el-tag v-else-if="s.purchased" size="small" type="primary" effect="plain">已购买</el-tag>
                  <el-tag v-else size="small" effect="plain">{{ formatPrice(s.price) }}</el-tag>
                </div>
                <div class="style-desc">{{ s.description }}</div>
                <div v-if="!s.purchased" class="style-buy">
                  <el-button v-if="isTenantAdmin" type="primary" size="small" :loading="buyingKey === s.key" @click.stop="buyStyle(s)">
                    购买使用
                  </el-button>
                  <span v-else class="buy-tip">需管理员购买</span>
                </div>
              </div>
            </div>
          </el-form-item>
          <el-form-item label="集市公告">
            <el-input v-model="settings.notice" placeholder="例如：欢迎各位会员，对接商务资源，共建人脉网络" style="max-width: 420px;" />
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
            <el-checkbox v-model="settings.showCompany" :true-value="1" :false-value="0">企业名称</el-checkbox>
            <el-checkbox v-model="settings.showIndustry" :true-value="1" :false-value="0">行业标签</el-checkbox>
            <el-checkbox v-model="settings.showLocation" :true-value="1" :false-value="0">地区标签</el-checkbox>
          </el-form-item>
          <el-form-item label="允许名片交换">
            <el-switch v-model="settings.allowExchange" :active-value="1" :inactive-value="0" />
          </el-form-item>
          <el-form-item label="公海上浮方式">
            <el-radio-group v-model="settings.poolFloatMode">
              <el-radio value="soft">软上浮（保留企业记录，可随时收回）</el-radio>
              <el-radio value="recover">限时收回（上浮后 7 天内可收回）</el-radio>
              <el-radio value="hard">直接移交（不可逆）</el-radio>
            </el-radio-group>
            <div class="form-tip">企业公海客户上浮到平台公海的方式：软上浮/限时收回在企业公海保留记录，平台公海未领取时可收回；直接移交后不可撤销。</div>
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
              <el-switch :model-value="row.isTop ? 1 : 0" :active-value="1" :inactive-value="0" @change="toggleTop(row)" />
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
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../../components/SIcon.vue';
import { publicApi } from '../../../../api';
import CardTabs from './CardTabs.vue';

const isTenantAdmin = computed(() => ['tenant_admin', 'admin'].includes(JSON.parse(localStorage.getItem('customer_user') || 'null')?.role));

const settings = ref({
  enabled: 1,
  auditMode: 'auto',
  title: '人脉集市',
  showCompany: 1,
  showIndustry: 1,
  showLocation: 1,
  allowExchange: 1,
  contactVisible: 'after_exchange',
  style: 'A',
  notice: '',
  poolFloatMode: 'soft'
});
const styles = ref([]);
const buyingKey = ref('');
const marketItems = ref([]);
const stats = ref({ visitCount: 0, exchangeCount: 0, itemCount: 0, pendingCount: 0 });

onMounted(() => {
  loadSettings();
  loadMarketItems();
  loadStats();
});

function formatPrice(v) {
  const n = Number(v || 0);
  return n > 0 ? `¥${n}` : '免费';
}

async function buyStyle(s) {
  if (buyingKey.value) return;
  buyingKey.value = s.key;
  try {
    await publicApi.post('/card-market/market/assets/purchase', { style: s.key });
    ElMessage.success(`已购买「${s.name}」，可立即切换使用`);
    await loadSettings();
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '购买失败');
  } finally {
    buyingKey.value = '';
  }
}

async function loadStats() {
  try {
    const res = await publicApi.get('/card-market/market/stats');
    if (res.stats) stats.value = res.stats;
  } catch (e) {}
}

async function loadSettings() {
  try {
    const res = await publicApi.get('/card-market/market/settings');
    if (res.settings) settings.value = res.settings;
    if (Array.isArray(res.styles)) styles.value = res.styles;
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
    // 管理视图：scope=admin 返回全部状态（含待审核/已拒绝），供管理员审核/置顶/强制下架
    const res = await publicApi.get('/card-market/market/list?scope=admin');
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
  try {
    await publicApi.post('/card-market/market/top', { itemId: row.id, isTop: row.isTop ? 0 : 1 });
    ElMessage.success(row.isTop ? '已取消置顶' : '已置顶');
    loadMarketItems();
  } catch (e) {
    ElMessage.error('操作失败');
  }
}

async function auditItem(row, action) {
  try {
    await publicApi.post('/card-market/market/audit', { itemId: row.id, action });
    ElMessage.success(action === 'approve' ? '已通过' : '已拒绝');
    loadMarketItems();
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '审核失败');
  }
}

async function forceRemove(row) {
  try {
    await ElMessageBox.confirm(`确定强制下架「${row.name}」吗？下架后将不在集市展示。`, '强制下架', { type: 'warning' });
    await publicApi.post('/card-market/market/force-remove', { itemId: row.id });
    ElMessage.success('已强制下架');
    loadMarketItems();
  } catch {}
}
</script>

<style scoped>
.market-manage-page { padding: 0; }

/* 数据统计 */
.stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 16px; }
.stat-card { background: #fff; border-radius: 8px; padding: 20px; display: flex; align-items: center; gap: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.stat-icon-wrap { width: 44px; height: 44px; border-radius: 10px; background: rgba(22,93,255,0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.stat-info { flex: 1; }
.stat-num { font-size: 24px; font-weight: 700; color: #1d2129; }
.stat-label { font-size: 12px; color: #86909c; margin-top: 2px; }

.card { background: #fff; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.card-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #f2f3f5; }
.card-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: #1d2129; }
.card-body { padding: 20px; }
.style-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; max-width: 860px; }
.style-option { padding: 14px 16px; border: 1px solid #e5e6eb; border-radius: 8px; cursor: pointer; transition: all .2s; position: relative; }
.style-option:hover { border-color: #165dff; }
.style-option.active { border-color: #165dff; background: #e8f3ff; box-shadow: 0 2px 8px rgba(22,93,255,0.08); }
.style-option.locked { cursor: default; background: #fafafc; }
.style-head { display: flex; align-items: center; gap: 8px; }
.style-name { font-size: 14px; font-weight: 600; color: #1d2129; }
.style-desc { font-size: 12px; color: #86909c; margin-top: 4px; line-height: 1.5; }
.style-buy { margin-top: 10px; }
.buy-tip { font-size: 12px; color: #86909c; }
.hint-text { font-size: 13px; color: #86909c; margin: 0; }
.form-tip { font-size: 12px; color: #86909c; line-height: 1.6; margin-top: 6px; width: 100%; }
</style>
