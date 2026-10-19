<template>
  <div class="card-manage-page">
    <!-- 统一Tab导航（智能名片管理功能共用） -->
    <CardTabs />

    <!-- 页面标题 -->
    <AppPageHeader title="名片管理" desc="本租户全部名片的统一视图：身份归属、公开状态、集市上下架一页说清" />

    <!-- 统计卡片（2026-10-20 主体拆分：个人名片=成员名单，企业名片=主体档案，不再混算） -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon-wrap icon-blue"><SIcon name="team" size="default" color="#165dff" /></div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.personCardCount || 0 }}</div>
          <div class="stat-label">个人名片</div>
          <div class="stat-sub">成员名单（含未认证）</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap icon-purple"><SIcon name="card" size="default" color="#722ed1" /></div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.enterpriseCardCount || 0 }}</div>
          <div class="stat-label">企业名片</div>
          <div class="stat-sub">企业主体档案，不是人</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap icon-green"><SIcon name="show" size="default" color="#00b42a" /></div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.publicCount || 0 }}</div>
          <div class="stat-label">已公开</div>
          <div class="stat-sub">H5/小程序可被访客查看</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap icon-teal"><SIcon name="team" size="default" color="#0d9e8a" /></div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.employeeCount || 0 }}</div>
          <div class="stat-label">企业成员</div>
          <div class="stat-sub">归属本租户的去重自然人</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap icon-cyan"><SIcon name="analytics" size="default" color="#0aa5a5" /></div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalViews || 0 }}</div>
          <div class="stat-label">总访问量</div>
          <div class="stat-sub">在册名片累计访问</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap icon-orange"><SIcon name="market" size="default" color="#ff7d00" /></div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.marketApproved || 0 }}</div>
          <div class="stat-label">已上架集市</div>
          <div class="stat-sub">审核通过、集市可见</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap icon-purple"><SIcon name="audit" size="default" color="#722ed1" /></div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.marketPending || 0 }}</div>
          <div class="stat-label">上架待审核</div>
          <div class="stat-sub">等待管理员审核</div>
        </div>
      </div>
    </div>

    <!-- 口径说明 + 身份图例（2026-10-20 命名统一：徽章回答「认证了没」；入驻降级为流程词） -->
    <div class="scope-note">
      <SIcon name="dynamic" size="small" color="#ff7d00" />
      <span>
        「个人名片 / 企业名片」按<strong>名片主体</strong>统计；「已上架集市」按<strong>上架记录</strong>统计（一个人可有多张名片，但只会上架一条）；
        「入驻管理」里的入驻个人/入驻企业是<strong>账号维度</strong>。几个数字口径不同，对不上是正常的。
      </span>
    </div>
    <div class="identity-legend">
      <span class="lg-dot lg-green"></span><span><strong>正式成员</strong>（企业员工 / 认证个人）＝已认证：可上架集市、可交换名片</span>
      <span class="lg-dot lg-grey"></span><span><strong>未认证个人</strong>＝未认证：完成认证后可上架集市（交换名片随时可用）</span>
      <span class="lg-dot lg-purple"></span><span><strong>企业名片</strong>＝企业主体档案，不是某个人的，不参与成员统计</span>
    </div>

    <!-- 名片列表 -->
    <div class="content-card">
      <div class="toolbar">
        <el-input v-model="keyword" placeholder="搜索姓名/职位/公司" style="width: 240px;" clearable @keyup.enter="loadCards" @clear="loadCards" />
        <!-- 主体切换（2026-10-20 方案 C）：默认只看个人名片（成员），企业名片是档案显式切换 -->
        <el-radio-group v-model="subject" @change="loadCards">
          <el-radio-button value="person">个人名片</el-radio-button>
          <el-radio-button value="enterprise">企业名片</el-radio-button>
          <el-radio-button value="all">全部</el-radio-button>
        </el-radio-group>
        <el-select v-model="identity" placeholder="身份" style="width: 150px;" clearable @change="loadCards">
          <el-option-group label="正式成员（已认证）">
            <el-option label="企业员工" value="employee" />
            <el-option label="认证个人" value="individual" />
          </el-option-group>
          <el-option-group label="未认证 / 主体档案">
            <el-option label="未认证个人" value="personal" />
            <el-option label="企业名片" value="enterprise" />
          </el-option-group>
        </el-select>
        <el-select v-model="market" placeholder="集市状态" style="width: 150px;" clearable @change="loadCards">
          <el-option label="全部状态" value="" />
          <el-option label="已上架" value="approved" />
          <el-option label="待审核" value="pending" />
          <el-option label="已拒绝" value="rejected" />
          <el-option label="未申请上架" value="none" />
        </el-select>
        <el-button type="primary" @click="loadCards">
          <SIcon name="dynamic" size="small" color="#fff" />
          刷新
        </el-button>
      </div>

      <el-table :data="cards" style="width: 100%" size="default" v-loading="loading">
        <el-table-column label="名片" min-width="170">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="avatar">{{ row.name ? row.name[0] : '?' }}</div>
              <div>
                <div class="cell-name">{{ row.name || '未命名' }}</div>
                <div class="cell-sub">{{ row.position || '—' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="身份" width="110">
          <template #default="{ row }">
            <!-- 🔴 2026-10-20 身份模型重构 + 命名统一：徽章显示细粒度身份（企业员工/认证个人/未认证个人/企业名片），
                 颜色只分三组（绿=已认证 / 灰=未认证个人 / 紫=企业档案）；
                 「挂靠成员」类别已取消（账号挂靠企业并入未认证个人）；
                 悬停展示 identityHint：为什么是这个身份 + 怎么升级。 -->
            <el-tag :type="identityGroup(row.identity).type" size="small" effect="plain" :title="row.identityHint || row.identityLabel">
              {{ row.identityLabel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="手机号" width="130">
          <template #default="{ row }">
            <span>{{ row.phone || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="所属企业" min-width="140">
          <template #default="{ row }">
            <span>{{ row.enterpriseName || row.company || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="公开状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isPublic ? 'success' : 'info'" size="small">
              {{ row.isPublic ? '已公开' : '未公开' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="集市状态" width="150">
          <template #default="{ row }">
            <template v-if="row.marketStatus">
              <el-tag :type="marketTagType(row.marketStatus)" size="small">
                {{ marketLabel(row.marketStatus) }}
              </el-tag>
              <el-tag v-if="row.marketIsTop" type="warning" size="small" effect="dark" style="margin-left:4px">顶</el-tag>
            </template>
            <span v-else class="muted">未申请上架</span>
          </template>
        </el-table-column>
        <el-table-column prop="viewCount" label="访问量" width="90" align="center" />
        <el-table-column prop="exchangeCount" label="交换数" width="90" align="center" />
        <el-table-column label="创建时间" width="120">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" link @click="previewCard(row)">预览</el-button>
            <el-button type="primary" size="small" link @click="openEdit(row)">编辑</el-button>
            <template v-if="row.marketStatus === 'pending'">
              <el-button type="success" size="small" link @click="auditItem(row, 'approve')">通过</el-button>
              <el-button type="danger" size="small" link @click="auditItem(row, 'reject')">拒绝</el-button>
            </template>
            <el-button v-else-if="row.marketItemId" type="danger" size="small" link @click="forceRemove(row)">下架</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="empty-state" v-if="!loading && !cards.length">
        <SIcon name="card" size="xlarge" color="#c9cdd4" />
        <div class="empty-text">暂无名片</div>
        <div class="empty-hint">员工通过小程序/H5创建名片后将自动出现在这里</div>
      </div>

      <div class="pager" v-if="total > pageSize">
        <el-pagination
          background
          layout="prev, pager, next"
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          @current-change="onPageChange"
        />
      </div>
    </div>

    <!-- 代编辑名片弹窗：与「员工名片」页共用同一组件与同一接口 -->
    <CardEditDialog v-model="editVisible" :card-id="editId" @saved="loadCards" />
  </div>
</template>

<script setup>
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../../components/SIcon.vue';
import { customerApiCall, publicApi } from '../../../../api';
import CardTabs from './CardTabs.vue';
import CardEditDialog from './CardEditDialog.vue';

const cards = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');
const identity = ref('');
const market = ref('');
const subject = ref('person');
const loading = ref(false);
const stats = ref({ cardCount: 0, personCardCount: 0, enterpriseCardCount: 0, publicCount: 0, marketApproved: 0, marketPending: 0 });

onMounted(() => loadCards());

function formatDate(d) {
  if (!d) return '-';
  return String(d).substring(0, 10);
}

// 身份三组配色（2026-10-20 重构后 identity 四值：employee/individual/enterprise/personal）
// 运营只看颜色：绿=已认证能干活 / 灰=未认证个人 / 紫=企业档案。
// 细粒度身份（企业员工/认证个人）直接显示 identityLabel，悬停有 identityHint 解释。
function identityGroup(id) {
  if (id === 'employee' || id === 'individual') return { label: '正式成员', type: 'success' };
  if (id === 'enterprise') return { label: '企业名片', type: 'danger' };
  return { label: '个人名片', type: 'info' };
}

function marketTagType(s) {
  if (s === 'approved') return 'success';
  if (s === 'pending') return 'warning';
  return 'danger';
}

function marketLabel(s) {
  if (s === 'approved') return '已上架';
  if (s === 'pending') return '待审核';
  return '已拒绝';
}

async function loadCards() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/card/manage', {
      params: {
        page: page.value,
        pageSize: pageSize.value,
        keyword: keyword.value,
        identity: identity.value,
        market: market.value,
        subject: subject.value,
      },
    });
    cards.value = res.cards || [];
    total.value = res.total || 0;
    if (res.stats) stats.value = res.stats;
  } catch (e) {
    console.error('加载名片列表失败', e);
    ElMessage.error(e?.response?.data?.error || '加载名片列表失败');
  } finally {
    loading.value = false;
  }
}

function onPageChange(p) {
  page.value = p;
  loadCards();
}

function previewCard(row) {
  const base = window.location.origin;
  window.open(`${base}/card/#/pages/card/myCard?id=${row.id}`, '_blank');
}

// 代编辑名片
const editVisible = ref(false);
const editId = ref('');
function openEdit(row) {
  editId.value = row.id;
  editVisible.value = true;
}

async function auditItem(row, action) {
  const t = action === 'approve' ? '通过' : '拒绝';
  try {
    await ElMessageBox.confirm(`确定${t}「${row.name}」的集市上架申请吗？`, `${t}上架申请`, {
      type: action === 'approve' ? 'success' : 'warning',
    });
  } catch {
    return;
  }
  try {
    await publicApi.post('/card-market/market/audit', { itemId: row.marketItemId, action });
    ElMessage.success(`已${t}`);
    loadCards();
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '操作失败');
  }
}

async function forceRemove(row) {
  try {
    await ElMessageBox.confirm(`确定将「${row.name}」从人脉集市下架吗？下架后集市内不再展示。`, '下架确认', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await publicApi.post('/card-market/market/force-remove', { itemId: row.marketItemId });
    ElMessage.success('已下架');
    loadCards();
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '操作失败');
  }
}
</script>

<style scoped>
.card-manage-page { padding: 0; }
.stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 16px; }
.stat-card { background: #fff; border-radius: 8px; padding: 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.stat-icon-wrap { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.stat-icon-wrap.icon-blue { background: rgba(22,93,255,0.1); }
.stat-icon-wrap.icon-green { background: rgba(0,180,42,0.1); }
.stat-icon-wrap.icon-orange { background: rgba(255,125,0,0.1); }
.stat-icon-wrap.icon-purple { background: rgba(114,46,209,0.1); }
.stat-icon-wrap.icon-teal { background: rgba(13,158,138,0.1); }
.stat-icon-wrap.icon-cyan { background: rgba(10,165,165,0.1); }
/* 身份三组图例（2026-10-20 身份模型重构：绿=已认证 / 灰=未认证个人 / 紫=企业档案） */
.identity-legend { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; background: #f7f8fa; border: 1px solid #e5e6eb; border-radius: 8px; padding: 10px 16px; font-size: 12px; color: #4e5969; margin-bottom: 16px; line-height: 1.6; }
.identity-legend strong { color: #1d2129; }
.lg-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.lg-green { background: #00b42a; }
.lg-purple { background: #722ed1; }
.lg-grey { background: #86909c; }
.stat-value { font-size: 24px; font-weight: 600; color: #1d2129; }
.stat-label { font-size: 13px; color: #86909c; margin-top: 2px; }
.stat-sub { font-size: 12px; color: #a9aeb8; margin-top: 1px; }
.scope-note { display: flex; align-items: flex-start; gap: 8px; background: #fff7e8; border: 1px solid #ffe1b8; border-radius: 8px; padding: 12px 16px; font-size: 12px; line-height: 1.7; color: #a35c00; margin-bottom: 16px; }
.scope-note strong { color: #d4380d; }
.content-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.user-cell { display: flex; align-items: center; gap: 10px; }
.avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #165dff, #4080ff); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500; flex-shrink: 0; }
.cell-name { font-size: 13px; color: #1d2129; }
.cell-sub { font-size: 12px; color: #86909c; margin-top: 2px; }
.muted { color: #a9aeb8; font-size: 12px; }
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 60px 0; }
.empty-text { font-size: 14px; color: #4e5969; margin-top: 12px; }
.empty-hint { font-size: 12px; color: #86909c; margin-top: 4px; }
.pager { display: flex; justify-content: flex-end; padding: 16px 0 4px; }
</style>
