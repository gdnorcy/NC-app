<template>
  <div class="card-manage-page">
    <!-- 统一Tab导航（智能名片管理功能共用） -->
    <CardTabs />

    <!-- 页面标题 -->
    <AppPageHeader title="名片管理" desc="本租户名片与入驻主体的一页式管理：个人认证、集市上下架、企业入驻审核" />

    <!-- 统计卡片（2026-10-20 主体拆分：个人名片=成员名单，企业名片=主体档案，不再混算） -->
    <div class="stats-row" v-if="mainTab === 'cards'">
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
    <div class="scope-note" v-if="mainTab === 'cards'">
      <SIcon name="dynamic" size="small" color="#ff7d00" />
      <span>
        「个人名片 / 企业名片」按<strong>名片主体</strong>统计；「已上架集市」按<strong>上架记录</strong>统计（一个人可有多张名片，但只会上架一条）；
        「企业入驻」里的入驻企业是<strong>账号维度的主体</strong>。几个数字口径不同，对不上是正常的。
      </span>
    </div>
    <div class="identity-legend" v-if="mainTab === 'cards'">
      <span class="lg-dot lg-green"></span><span><strong>正式成员</strong>（企业员工 / 认证个人）＝已认证：可上架集市、可交换名片</span>
      <span class="lg-dot lg-grey"></span><span><strong>未认证个人</strong>＝未认证：完成认证后可上架集市（交换名片随时可用）</span>
      <span class="lg-dot lg-purple"></span><span><strong>企业名片</strong>＝企业主体档案，不是某个人的，不参与成员统计</span>
    </div>

    <!-- 主 Tab（第26轮整合）：原「入驻管理」页整体下线——
         个人入驻＝名片列表身份列/编辑弹窗里的认证开关（同一真值 tenant_individuals）；
         企业入驻＝本页第二个主 Tab；入驻兑换码（个人凭证）为页面级操作，常驻 tab 行右侧 -->
    <div class="content-card">
      <div class="tab-bar">
        <div class="tab" :class="{ active: mainTab === 'cards' }" @click="switchTab('cards')">
          <SIcon name="card" size="default" color="#165dff" />
          名片
          <el-tag size="small" type="info">{{ total }}</el-tag>
        </div>
        <div class="tab" :class="{ active: mainTab === 'enterprise' }" @click="switchTab('enterprise')">
          <SIcon name="building" size="default" color="#165dff" />
          企业入驻
          <el-tag size="small" type="info">{{ enterprises.length }}</el-tag>
        </div>
        <!-- 第21轮：入驻凭证改兑换码（当前仅个人入驻）；入口固定在 tab 行右侧，不随 Tab 切换隐藏 -->
        <el-button class="tab-bar-action" @click="router.push('/apps/card/join-codes')">
          <SIcon name="voucher" size="small" color="#4e5969" />
          入驻兑换码
        </el-button>
      </div>

      <div class="tab-content">
        <!-- ===== Tab 1：名片列表 ===== -->
        <template v-if="mainTab === 'cards'">
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
              <!-- 第26轮：入驻管理页已下线，入驻就是这个 Tab 的事（审核/员工/停用均在页内） -->
              <el-tag v-if="row.applyStatus === 'pending'" type="warning" size="small" style="margin-left:4px">待审核</el-tag>
              <el-tag v-else-if="row.applyStatus === 'rejected'" type="danger" size="small" effect="plain" style="margin-left:4px">已拒绝</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="会员套餐" width="160">
            <template #default="{ row }">
              <template v-if="row.memberLevel && row.memberLevel !== 'free' && packageMap[row.memberLevel]">
                <el-tag size="small" effect="plain" :type="isMemberExpired(row) ? 'info' : 'warning'">
                  {{ packageMap[row.memberLevel].name }}
                </el-tag>
                <div class="pkg-sub" v-if="row.memberExpireAt">
                  {{ isMemberExpired(row) ? '已过期' : '有效至 ' + formatDate(row.memberExpireAt) }}
                </div>
              </template>
              <span v-else class="muted">未开通</span>
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
                <!-- 第26轮：个人认证申请行内直审（原「入驻管理-入驻个人」职能已并入本页） -->
              <template v-if="row.applyStatus === 'pending' && row.applyId">
                <el-button type="success" size="small" link @click="auditApply(row, 'approve')">认证</el-button>
                <el-button type="danger" size="small" link @click="auditApply(row, 'reject')">拒绝</el-button>
              </template>
              <template v-else-if="row.marketStatus === 'pending'">
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
        </template>

        <!-- ===== Tab 2：企业入驻（第26轮：原「入驻管理」页整体并入） ===== -->
        <template v-else>
          <div class="toolbar">
            <el-input v-model="entKeyword" placeholder="搜索企业名称" style="width: 240px;" clearable @keyup.enter="loadEnterprises" />
            <el-button type="primary" @click="loadEnterprises">
              <SIcon name="dynamic" size="small" color="#fff" />
              刷新
            </el-button>
          </div>

          <el-table :data="filteredEnterprises" style="width: 100%" size="default">
            <el-table-column label="企业名称" min-width="180">
              <template #default="{ row }">
                <div class="user-cell">
                  <div class="ent-avatar">{{ row.name?.[0] || '企' }}</div>
                  <span>{{ row.name }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="industry" label="行业" width="120" />
            <el-table-column prop="employee_count" label="员工数" width="100" align="center" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag v-if="row.status === 'active'" type="success" size="small">正常</el-tag>
                <el-tag v-else-if="row.status === 'pending'" type="warning" size="small">待审核</el-tag>
                <el-tag v-else-if="row.status === 'rejected'" type="info" size="small">已拒绝</el-tag>
                <el-tag v-else type="danger" size="small">已停用</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="240" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 'pending'">
                  <el-button type="success" size="small" link @click="auditEnterprise(row, 'approve')">通过</el-button>
                  <el-button type="danger" size="small" link @click="auditEnterprise(row, 'reject')">拒绝</el-button>
                </template>
                <template v-else>
                  <el-button type="primary" size="small" link @click="viewEmployees(row)">员工管理</el-button>
                  <el-button v-if="row.status === 'active'" type="danger" size="small" link @click="disableEnterprise(row)">停用</el-button>
                  <el-button v-else-if="row.status !== 'pending' && row.status !== 'rejected'" type="success" size="small" link @click="enableEnterprise(row)">启用</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>

          <div class="empty-state" v-if="!enterprises.length">
            <SIcon name="building" size="xlarge" color="#c9cdd4" />
            <div class="empty-text">暂无入驻企业</div>
          </div>
        </template>
      </div>
    </div>

    <!-- 代编辑名片弹窗：与「员工名片」页共用同一组件与同一接口 -->
    <CardEditDialog v-model="editVisible" :card-id="editId" @saved="loadCards" />

    <!-- 企业员工管理弹窗（第26轮：随企业入驻 Tab 一起迁入） -->
    <el-dialog v-model="showEmployees" title="企业员工管理" width="600px" class="emp-dialog">
      <div class="emp-header">
        <div class="emp-ent-name">{{ currentEnterprise?.name }}</div>
        <el-tag size="small">{{ employees.length }} 名员工</el-tag>
      </div>
      <el-table :data="employees" style="width: 100%" size="small">
        <el-table-column label="姓名" min-width="100">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="user-avatar small">{{ row.name?.[0] || '员' }}</div>
              <span>{{ row.name || '未设置' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="position" label="职位" width="120" />
        <el-table-column prop="department" label="部门" width="100" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '在职' : '离职' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <div class="empty-state" v-if="!employees.length" style="padding: 40px 0;">
        <div class="empty-text">暂无员工</div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../../components/SIcon.vue';
import { customerApiCall, publicApi } from '../../../../api';
import CardTabs from './CardTabs.vue';
import CardEditDialog from './CardEditDialog.vue';

const router = useRouter();

// 第26轮整合：原「入驻管理」页下线，企业入驻作为本页第二个主 Tab 并入；
// 个人入驻（外人进不来也搞不清的差异）就是名片列表里的「认证」动作，三者共用同一真值表。
const mainTab = ref('cards');

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
// 会员套餐等级名映射（level → { name, ... }），用于「会员套餐」列展示
const packageMap = ref({});

// 企业入驻（原 TenantManage.vue 迁入）
const enterprises = ref([]);
const employees = ref([]);
const entKeyword = ref('');
const showEmployees = ref(false);
const currentEnterprise = ref(null);

const filteredEnterprises = computed(() => {
  if (!entKeyword.value) return enterprises.value;
  const kw = entKeyword.value.toLowerCase();
  return enterprises.value.filter(e => (e.name || '').toLowerCase().includes(kw));
});

onMounted(() => { loadCards(); loadPackages(); });

function switchTab(t) {
  mainTab.value = t;
  if (t === 'enterprise' && !enterprises.value.length) loadEnterprises();
}

function formatDate(d) {
  if (!d) return '-';
  return String(d).substring(0, 10);
}

// 会员套餐（名片主人账号级 VIP）：拉套餐等级名映射，用于表格「会员套餐」列
async function loadPackages() {
  try {
    const res = await publicApi.get('/card/member/packages');
    const m = {};
    for (const p of (res.packages || [])) m[p.level] = p;
    packageMap.value = m;
  } catch (e) {
    console.error('加载会员套餐失败', e);
  }
}

// 会员是否过期：无过期时间视为有效（历史上部分账号仅置等级未置过期时间）
function isMemberExpired(row) {
  if (!row.memberExpireAt) return false;
  return new Date(String(row.memberExpireAt).replace(' ', 'T')) < new Date();
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

// 第26轮：个人认证申请行内直审——真值与「入驻管理」页完全一致（同一个 /card-market/apply/audit），
// 只是入口前移到名片管理，免得管理员为审一个人跨两个页面
async function auditApply(row, action) {
  const t = action === 'approve' ? '通过' : '拒绝';
  try {
    await ElMessageBox.confirm(
      `确定${t}「${row.name}」的认证申请吗？${action === 'approve' ? '通过后该用户立即成为认证个人。' : '拒绝后对方可修改资料重新申请，兑换码（如有）将归还。'}`,
      `${t}认证申请`,
      { type: action === 'approve' ? 'success' : 'warning' }
    );
  } catch {
    return;
  }
  try {
    await publicApi.post('/card-market/apply/audit', { type: 'individual', id: row.applyId, action });
    ElMessage.success(`已${t}`);
    loadCards();
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '操作失败');
  }
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

// ===== 企业入驻（第26轮：原 TenantManage.vue 整体迁入，逻辑原样保留） =====

async function loadEnterprises() {
  try {
    const res = await publicApi.get('/card-market/enterprises');
    enterprises.value = res.enterprises || [];
  } catch (e) {
    console.error('加载入驻企业失败', e);
  }
}

function auditEnterprise(row, action) {
  const t = action === 'approve' ? '通过' : '拒绝';
  ElMessageBox.confirm(`确定${t}「${row.name}」的入驻申请吗？${action === 'approve' ? '通过后企业主体及其管理员立即获得平台内权限。' : '拒绝后对方可修改资料重新申请。'}`, `${t}入驻申请`, {
    type: action === 'approve' ? 'success' : 'warning',
  }).then(async () => {
    try {
      await publicApi.post('/card-market/apply/audit', { type: 'enterprise', id: row.id, action });
      ElMessage.success(`已${t}`);
      loadEnterprises();
    } catch (e) {
      ElMessage.error(e.message || '操作失败');
    }
  }).catch(() => {});
}

async function disableEnterprise(row) {
  try {
    await ElMessageBox.confirm(`确定停用「${row.name}」吗？停用后企业及全部员工将从集市移除，客户回收至公海池。`, '停用确认', { type: 'warning' });
    await publicApi.post(`/card-market/enterprises/${row.id}/disable`);
    ElMessage.success('已停用');
    loadEnterprises();
  } catch {}
}

async function enableEnterprise(row) {
  try {
    await ElMessageBox.confirm(`确定启用「${row.name}」吗？启用后恢复企业主体，企业员工需重新加入。`, '启用确认', { type: 'info' });
    await publicApi.post(`/card-market/enterprises/${row.id}/enable`);
    ElMessage.success('已启用');
    loadEnterprises();
  } catch {}
}

async function viewEmployees(row) {
  currentEnterprise.value = row;
  showEmployees.value = true;
  try {
    const res = await publicApi.get(`/card-market/enterprises/${row.id}/employees`);
    employees.value = res.employees || [];
  } catch (e) {
    employees.value = [];
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
/* 主 Tab（第26轮：企业入驻并入后新增）——与普通内容区同一外壳 */
.tab-bar { display: flex; border-bottom: 1px solid #f2f3f5; padding: 0 20px; }
.tab { display: flex; align-items: center; gap: 8px; padding: 16px 20px; font-size: 14px; color: #4e5969; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
.tab.active { color: #165dff; border-bottom-color: #165dff; font-weight: 500; }
/* 页面级操作按钮：靠 tab 行右侧（不随 tab 切换隐藏） */
.tab-bar-action { margin-left: auto; align-self: center; }
.tab-content { padding: 20px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.user-cell { display: flex; align-items: center; gap: 10px; }
.avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #165dff, #4080ff); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500; flex-shrink: 0; }
/* 企业主体方头像（紫），与个人圆形头像区分 */
.ent-avatar { width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #722ed1, #9254de); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; }
.user-avatar.small { width: 28px; height: 28px; border-radius: 14px; background: linear-gradient(135deg, #165dff, #4080ff); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
/* 员工弹窗头部 */
.emp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f2f3f5; }
.emp-ent-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.cell-name { font-size: 13px; color: #1d2129; }
.cell-sub { font-size: 12px; color: #86909c; margin-top: 2px; }
.muted { color: #a9aeb8; font-size: 12px; }
.pkg-sub { font-size: 12px; color: #86909c; margin-top: 2px; }
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 60px 0; }
.empty-text { font-size: 14px; color: #4e5969; margin-top: 12px; }
.empty-hint { font-size: 12px; color: #86909c; margin-top: 4px; }
.pager { display: flex; justify-content: flex-end; padding: 16px 0 4px; }
</style>
