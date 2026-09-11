<template>
  <div class="member-home">
    <!-- 会员体系 6 Tab：数据统计 / 会员列表 / 会员等级 / 会员设置 / 申请记录 / 开卡记录 -->
    <div class="card-tabs">
      <div v-for="t in tabs" :key="t.key" class="ctab" :class="{ active: activeTab === t.key }" @click="activeTab = t.key">
        <SIcon :name="t.icon" size="default" :color="activeTab === t.key ? '#165dff' : '#4e5969'" />
        <span>{{ t.label }}</span>
      </div>
    </div>

    <!-- ================= 数据统计 ================= -->
    <section v-if="activeTab === 'stats'">
      <AppPageHeader title="数据统计" desc="会员体系核心数据一览（1:1 复刻菜鸟云「用户-数据统计」）">
        <div class="hd-actions">
          <el-button type="primary" :loading="loading" @click="loadAll">刷新</el-button>
        </div>
      </AppPageHeader>
      <div class="stat-grid">
        <div v-for="c in statCards" :key="c.label" class="stat-card">
          <div class="stat-ico" :style="{ background: c.bg }">
            <SIcon :name="c.icon" size="default" :color="c.color" />
          </div>
          <div class="stat-body">
            <div class="stat-num">{{ c.value }}</div>
            <div class="stat-label">{{ c.label }}</div>
          </div>
        </div>
      </div>
      <el-card shadow="never" class="mt16">
        <template #header><b>会员等级分布</b></template>
        <el-table :data="summary.levelCounts || []" size="default">
          <el-table-column prop="levelNo" label="等级" width="80">
            <template #default="{ row }"><span class="lv-badge">Lv{{ row.levelNo }}</span></template>
          </el-table-column>
          <el-table-column prop="name" label="等级名称" />
          <el-table-column prop="count" label="会员数" width="120" />
          <el-table-column prop="expiring" label="即将到期" width="120" />
        </el-table>
        <div v-if="!(summary.levelCounts || []).length" class="empty-tip">暂无会员等级，请先在「会员等级」中新建</div>
      </el-card>
      <el-card v-if="(summary.labelCounts || []).length" shadow="never" class="mt16">
        <template #header><b>标签人数</b></template>
        <div class="label-chips">
          <el-tag v-for="l in summary.labelCounts" :key="l.name" effect="plain">{{ l.name }}（{{ l.count }}）</el-tag>
        </div>
      </el-card>
    </section>

    <!-- ================= 会员列表 ================= -->
    <section v-if="activeTab === 'users'">
      <AppPageHeader title="会员列表" desc="全部用户（个人用户 + 企业员工）会员身份管理">
        <div class="hd-actions">
          <el-button :loading="exporting" @click="exportUsers">导出</el-button>
        </div>
      </AppPageHeader>
      <el-card shadow="never">
        <div class="filter-bar">
          <el-input v-model="userQuery.keyword" placeholder="昵称 / 手机号 / 卡号" clearable class="w220" @keyup.enter="loadUsers" />
          <el-select v-model="userQuery.identity" placeholder="身份" clearable class="w130" @change="loadUsers">
            <el-option label="非会员" value="nonmember" />
            <el-option label="会员" value="member" />
            <el-option v-for="l in levels" :key="l.id" :label="l.name" :value="String(l.id)" />
          </el-select>
          <el-select v-model="userQuery.label" placeholder="标签" clearable class="w130" @change="loadUsers">
            <el-option v-for="l in labels" :key="l.id" :label="l.name" :value="l.id" />
          </el-select>
          <el-select v-model="userQuery.source" placeholder="来源" clearable class="w130" @change="loadUsers">
            <el-option label="个人用户" value="individual" />
            <el-option label="企业员工" value="employee" />
          </el-select>
          <el-button type="primary" @click="loadUsers">查询</el-button>
        </div>
        <el-table :data="users" v-loading="loading" class="mt12">
          <el-table-column label="用户" min-width="160">
            <template #default="{ row }">
              <div class="user-cell">
                <el-avatar :size="32" :src="row.avatar">{{ (row.nickname || '?')[0] }}</el-avatar>
                <div>
                  <div class="u-name">{{ row.nickname || '未命名' }}</div>
                  <div class="u-sub">{{ row.phone || '—' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="身份" width="90">
            <template #default="{ row }">
              <el-tag v-if="row.identityType === 'employee'" size="small" effect="plain">企业员工</el-tag>
              <el-tag v-else size="small" type="info" effect="plain">个人用户</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="会员等级" width="120">
            <template #default="{ row }">
              <el-tag v-if="row.levelId" type="primary" effect="light">Lv{{ row.memberLevelNo }} {{ row.levelName }}</el-tag>
              <span v-else class="muted">非会员</span>
            </template>
          </el-table-column>
          <el-table-column prop="cardNo" label="卡号" width="150" show-overflow-tooltip />
          <el-table-column label="到期时间" width="120">
            <template #default="{ row }">{{ row.expireAt || '永久' }}</template>
          </el-table-column>
          <el-table-column prop="score" label="积分" width="80" />
          <el-table-column label="标签" min-width="120">
            <template #default="{ row }">
              <el-tag v-for="l in row.labels" :key="l.id" size="small" class="mr4">{{ l.name }}</el-tag>
              <span v-if="!row.labels.length" class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination background layout="total, prev, pager, next" :total="userTotal" :page-size="userQuery.pageSize" :current-page="userQuery.page" @current-change="(p) => { userQuery.page = p; loadUsers(); }" />
        </div>
      </el-card>
    </section>

    <!-- ================= 会员等级 ================= -->
    <section v-if="activeTab === 'levels'">
      <AppPageHeader title="会员等级" desc="等级设置（基础信息 / 升级模式 / 会员权益）">
        <div class="hd-actions">
          <el-button type="primary" @click="openLevelEdit()">新建等级</el-button>
        </div>
      </AppPageHeader>
      <el-row :gutter="16">
        <el-col v-for="lv in levels" :key="lv.id" :span="8">
          <el-card shadow="never" class="lv-card">
            <div class="lv-head" :style="{ background: lv.bg_color || 'linear-gradient(135deg,#2f6bff,#5b8cff)' }">
              <div class="lv-name">{{ lv.name }}</div>
              <div class="lv-no">Lv{{ lv.level_no }}</div>
            </div>
            <div class="lv-body">
              <div class="lv-row"><span class="muted">升级模式</span><span>{{ lv.upgrade_mode === 'apply' ? '申请模式' : '消费模式' }}</span></div>
              <div v-if="lv.upgrade_mode === 'consume'" class="lv-row"><span class="muted">累计消费</span><span>¥{{ (lv.consume_amount / 100).toFixed(2) }}</span></div>
              <div class="lv-row"><span class="muted">购买价格</span><span>{{ lv.buy_price ? '¥' + (lv.buy_price / 100).toFixed(2) : '不可购买' }}</span></div>
              <div class="lv-row"><span class="muted">状态</span><el-tag :type="lv.status ? 'success' : 'info'" size="small">{{ lv.status ? '启用' : '停用' }}</el-tag></div>
              <div class="lv-row"><span class="muted">等级说明</span><span class="ellipsis">{{ lv.description || '—' }}</span></div>
            </div>
            <div class="lv-foot">
              <el-button size="small" @click="openLevelEdit(lv)">编辑</el-button>
              <el-button size="small" type="danger" plain @click="delLevel(lv)">删除</el-button>
            </div>
          </el-card>
        </el-col>
      </el-row>
      <el-empty v-if="!levels.length" description="暂无会员等级，点击右上角「新建等级」创建" />
    </section>

    <!-- ================= 会员设置 ================= -->
    <section v-if="activeTab === 'settings'">
      <AppPageHeader title="会员设置" desc="会员卡 / 到期提醒 / 信息展示 / 功能权限">
        <div class="hd-actions">
          <el-button type="primary" :loading="saving" @click="saveSettings">保存设置</el-button>
        </div>
      </AppPageHeader>
      <el-card shadow="never" class="w720">
        <el-form label-width="140px" label-position="right">
          <el-divider content-position="left">基础设置</el-divider>
          <el-form-item label="会员卡开关">
            <el-switch v-model="settingsForm.cardEnabled" />
            <span class="form-tip">关闭后 C 端不再展示/购买/申请会员卡</span>
          </el-form-item>
          <el-form-item label="到期提醒">
            <el-input-number v-model="settingsForm.expireRemindDays" :min="0" :max="90" />
            <span class="form-tip">会员到期前 N 天提醒（天）</span>
          </el-form-item>
          <el-divider content-position="left">信息展示</el-divider>
          <el-form-item label="姓名">
            <el-switch v-model="settingsForm.showName" />
          </el-form-item>
          <el-form-item label="有效期">
            <el-switch v-model="settingsForm.showExpire" />
          </el-form-item>
          <el-divider content-position="left">功能权限</el-divider>
          <el-form-item v-for="p in permOptions" :key="p.key" :label="p.label">
            <el-radio-group v-model="settingsForm.permissions[p.key]">
              <el-radio value="all">所有用户</el-radio>
              <el-radio value="member">仅会员</el-radio>
            </el-radio-group>
            <span class="form-tip">{{ p.tip }}</span>
          </el-form-item>
        </el-form>
      </el-card>
    </section>

    <!-- ================= 申请记录 ================= -->
    <section v-if="activeTab === 'applies'">
      <AppPageHeader title="申请记录" desc="申请模式会员的升级申请审核" />
      <el-card shadow="never">
        <el-radio-group v-model="applyStatus" class="mb12" @change="loadApplies">
          <el-radio-button value="pending">待审核</el-radio-button>
          <el-radio-button value="approved">已通过</el-radio-button>
          <el-radio-button value="rejected">已驳回</el-radio-button>
        </el-radio-group>
        <el-table :data="applies" v-loading="loading">
          <el-table-column label="用户" min-width="140">
            <template #default="{ row }">
              <div class="user-cell">
                <el-avatar :size="30" :src="row.avatar">{{ (row.nickname || '?')[0] }}</el-avatar>
                <span>{{ row.nickname || '未命名' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="姓名" width="100" />
          <el-table-column prop="phone" label="手机号" width="130" />
          <el-table-column prop="level_name" label="申请等级" width="120" />
          <el-table-column prop="created_at" label="申请时间" width="170" />
          <el-table-column prop="reason" label="驳回原因" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'" size="small">
                {{ row.status === 'approved' ? '已通过' : row.status === 'rejected' ? '已驳回' : '待审核' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === 'pending'">
                <el-button link type="primary" @click="reviewApply(row, 'approve')">通过</el-button>
                <el-button link type="danger" @click="reviewApply(row, 'reject')">驳回</el-button>
              </template>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination background layout="total, prev, pager, next" :total="applyTotal" :page-size="20" :current-page="applyPage" @current-change="(p) => { applyPage = p; loadApplies(); }" />
        </div>
      </el-card>
    </section>

    <!-- ================= 开卡记录 ================= -->
    <section v-if="activeTab === 'cards'">
      <AppPageHeader title="开卡记录" desc="全部开卡记录（自动 / 申请通过 / 直接购买）" />
      <el-card shadow="never">
        <el-input v-model="cardKeyword" placeholder="昵称 / 卡号" clearable class="w220 mb12" @keyup.enter="loadCards" />
        <el-table :data="cards" v-loading="loading">
          <el-table-column label="用户" min-width="140">
            <template #default="{ row }">
              <div class="user-cell">
                <el-avatar :size="30" :src="row.avatar">{{ (row.nickname || '?')[0] }}</el-avatar>
                <span>{{ row.nickname || '未命名' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="card_no" label="卡号" width="160" show-overflow-tooltip />
          <el-table-column prop="level_name" label="等级" width="120" />
          <el-table-column label="来源" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.source === 'buy' ? 'primary' : row.source === 'apply' ? 'warning' : 'info'">
                {{ row.source === 'buy' ? '购买' : row.source === 'apply' ? '申请' : '自动' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="opened_at" label="开卡时间" width="170" />
        </el-table>
        <div class="pager">
          <el-pagination background layout="total, prev, pager, next" :total="cardTotal" :page-size="20" :current-page="cardPage" @current-change="(p) => { cardPage = p; loadCards(); }" />
        </div>
      </el-card>
    </section>

    <!-- ===== 等级编辑弹窗 ===== -->
    <el-dialog v-model="levelDlg.show" :title="levelDlg.form.id ? '编辑等级' : '新建等级'" width="640px" top="4vh">
      <el-form label-width="120px" label-position="right">
        <el-divider content-position="left">基础信息</el-divider>
        <el-form-item label="等级名称" required>
          <el-input v-model="levelDlg.form.name" maxlength="32" placeholder="如：黄金会员" />
        </el-form-item>
        <el-form-item label="等级图标">
          <el-input v-model="levelDlg.form.icon" placeholder="图片 URL（建议 5:3 630x378）" />
        </el-form-item>
        <el-form-item label="背景颜色">
          <el-color-picker v-model="levelDlg.form.bgColor" />
          <span class="form-tip">等级卡背景颜色</span>
        </el-form-item>
        <el-form-item label="文字颜色">
          <el-color-picker v-model="levelDlg.form.textColor" />
        </el-form-item>
        <el-form-item label="等级文字展示">
          <el-switch v-model="levelDlg.form.textShow" />
        </el-form-item>
        <el-divider content-position="left">升级模式</el-divider>
        <el-form-item label="升级模式" required>
          <el-radio-group v-model="levelDlg.form.upgradeMode">
            <el-radio value="consume">消费模式</el-radio>
            <el-radio value="apply">申请模式</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="levelDlg.form.upgradeMode === 'consume'" label="累计消费金额" required>
          <el-input-number v-model="levelDlg.form.consumeAmount" :min="0" :step="100" />
          <span class="form-tip">累计消费满该金额自动升级（单位：分）</span>
        </el-form-item>
        <el-form-item label="购买价格">
          <el-input-number v-model="levelDlg.form.buyPrice" :min="0" :step="100" />
          <span class="form-tip">0 表示不可直接购买；支付成功自动开卡（单位：分）</span>
        </el-form-item>
        <el-divider content-position="left">会员权益</el-divider>
        <el-form-item label="会员折扣">
          <el-switch v-model="levelDlg.form.benefits.discount.enabled" />
          <span v-if="levelDlg.form.benefits.discount.enabled" class="ml8">
            <el-input-number v-model="levelDlg.form.benefits.discount.value" :min="0" :max="100" size="small" /> 折
          </span>
        </el-form-item>
        <el-form-item label="买送积分">
          <el-switch v-model="levelDlg.form.benefits.scoreMultiple.enabled" />
          <span v-if="levelDlg.form.benefits.scoreMultiple.enabled" class="ml8">
            <el-input-number v-model="levelDlg.form.benefits.scoreMultiple.value" :min="0" size="small" /> 倍
          </span>
        </el-form-item>
        <el-form-item label="积分回馈">
          <el-switch v-model="levelDlg.form.benefits.pointBack.enabled" />
          <span v-if="levelDlg.form.benefits.pointBack.enabled" class="ml8">
            <el-input-number v-model="levelDlg.form.benefits.pointBack.value" :min="0" :max="100" size="small" /> %
          </span>
        </el-form-item>
        <el-form-item label="查看会员价">
          <el-switch v-model="levelDlg.form.benefits.viewPrice.enabled" />
        </el-form-item>
        <el-form-item label="等级说明">
          <el-input v-model="levelDlg.form.description" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="最多 200 字" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="levelDlg.show = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveLevel">保存</el-button>
      </template>
    </el-dialog>

    <!-- ===== 用户详情弹窗 ===== -->
    <el-dialog v-model="detail.show" title="用户详情" width="720px">
      <template v-if="detail.user">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="昵称">{{ detail.user.nickname || '未命名' }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ detail.user.phone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="身份">{{ detail.user.identity_type === 'employee' ? '企业员工' : '个人用户' }}</el-descriptions-item>
          <el-descriptions-item label="注册时间">{{ detail.user.created_at }}</el-descriptions-item>
          <el-descriptions-item label="会员等级">{{ detail.level ? 'Lv' + detail.level.level_no + ' ' + detail.level.name : '非会员' }}</el-descriptions-item>
          <el-descriptions-item label="卡号">{{ detail.member?.card_no || '—' }}</el-descriptions-item>
          <el-descriptions-item label="积分">{{ detail.member?.score || 0 }}</el-descriptions-item>
          <el-descriptions-item label="余额">¥{{ ((detail.member?.balance || 0) / 100).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="名片数">{{ detail.user.cardCount || 0 }}</el-descriptions-item>
          <el-descriptions-item label="订单数">{{ detail.user.orderCount || 0 }}</el-descriptions-item>
        </el-descriptions>
        <div class="mt16">
          <b>用户标签</b>
          <div class="mt8">
            <el-tag v-for="l in detail.user.labels" :key="l.id" closable class="mr4" @close="removeLabel(l)">{{ l.name }}</el-tag>
            <el-select v-model="newLabelId" placeholder="添加标签" size="small" class="w160" @change="addLabelToUser">
              <el-option v-for="l in labels.filter((x) => !detail.user.labels.some((y) => y.id === x.id))" :key="l.id" :label="l.name" :value="l.id" />
            </el-select>
          </div>
        </div>
        <div class="mt16">
          <b>最近消费流水</b>
          <el-table :data="detail.logs" size="small" class="mt8">
            <el-table-column label="金额" width="90">
              <template #default="{ row }">
                <span :class="row.amount < 0 ? 'danger' : 'success'">{{ row.amount > 0 ? '+' : '' }}{{ (row.amount / 100).toFixed(2) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="note" label="说明" show-overflow-tooltip />
            <el-table-column prop="created_at" label="时间" width="160" />
          </el-table>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import { customerApiCall } from '../../../api';

const tabs = [
  { key: 'stats', label: '数据统计', icon: 'chart' },
  { key: 'users', label: '会员列表', icon: 'users' },
  { key: 'levels', label: '会员等级', icon: 'crown' },
  { key: 'settings', label: '会员设置', icon: 'settings' },
  { key: 'applies', label: '申请记录', icon: 'audit' },
  { key: 'cards', label: '开卡记录', icon: 'badge' },
];
const activeTab = ref('stats');
const loading = ref(false);
const saving = ref(false);
const exporting = ref(false);

// ---------- 统计 ----------
const summary = ref({ levelCounts: [], labelCounts: [] });
const statCards = computed(() => {
  const s = summary.value;
  return [
    { label: '会员总数', value: s.totalUsers ?? 0, icon: 'users', color: '#165DFF', bg: 'rgba(22,93,255,0.08)' },
    { label: '等级会员', value: s.levelUsers ?? 0, icon: 'crown', color: '#722ED1', bg: 'rgba(114,46,209,0.08)' },
    { label: '活跃会员', value: s.activeUsers ?? 0, icon: 'radar', color: '#00B42A', bg: 'rgba(0,180,42,0.08)' },
    { label: '本月生日', value: s.monthBirthday ?? 0, icon: 'badge', color: '#FF7D00', bg: 'rgba(255,125,0,0.08)' },
    { label: '即将到期', value: s.expiring ?? 0, icon: 'chart', color: '#F53F3F', bg: 'rgba(245,63,63,0.08)' },
    { label: '本月新增', value: s.newUsers?.d30 ?? 0, icon: 'dynamic', color: '#2F6BFF', bg: 'rgba(47,107,255,0.08)' },
  ];
});

// ---------- 会员列表 ----------
const users = ref([]);
const userTotal = ref(0);
const userQuery = reactive({ page: 1, pageSize: 20, keyword: '', identity: '', label: '', source: '' });
async function loadUsers() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/member/users', { params: userQuery });
    users.value = res.users || [];
    userTotal.value = res.total || 0;
  } catch (e) {
    ElMessage.error(e || '加载失败');
  } finally {
    loading.value = false;
  }
}
async function exportUsers() {
  exporting.value = true;
  try {
    const blob = await customerApiCall.get('/member/users', { params: { ...userQuery, export: 'csv' }, responseType: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `会员列表-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    ElMessage.error(e || '导出失败');
  } finally {
    exporting.value = false;
  }
}

// ---------- 等级 ----------
const levels = ref([]);
const levelDlg = reactive({ show: false, form: {} });
const emptyBenefits = () => ({ discount: { enabled: false, value: 0 }, scoreMultiple: { enabled: false, value: 0 }, pointBack: { enabled: false, value: 0 }, viewPrice: { enabled: false } });
async function loadLevels() {
  const res = await customerApiCall.get('/member/levels');
  levels.value = res.levels || [];
}
function openLevelEdit(lv) {
  levelDlg.form = lv
    ? { ...lv, benefits: { ...emptyBenefits(), ...(lv.benefits || {}) } }
    : { id: null, name: '', icon: '', bgColor: '', textColor: '#ffffff', textShow: 1, upgradeMode: 'consume', consumeAmount: 0, buyPrice: 0, description: '', benefits: emptyBenefits() };
  levelDlg.show = true;
}
async function saveLevel() {
  const f = levelDlg.form;
  if (!f.name) return ElMessage.warning('请填写等级名称');
  saving.value = true;
  try {
    if (f.id) await customerApiCall.put(`/member/levels/${f.id}`, f);
    else await customerApiCall.post('/member/levels', f);
    ElMessage.success('保存成功');
    levelDlg.show = false;
    await loadLevels();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saving.value = false;
  }
}
async function delLevel(lv) {
  await ElMessageBox.confirm(`确定删除等级「${lv.name}」？`, '删除确认', { type: 'warning' });
  try {
    await customerApiCall.delete(`/member/levels/${lv.id}`);
    ElMessage.success('已删除');
    await loadLevels();
  } catch (e) {
    ElMessage.error(e || '删除失败');
  }
}

// ---------- 标签 ----------
const labels = ref([]);
async function loadLabels() {
  const res = await customerApiCall.get('/member/labels');
  labels.value = res.labels || [];
}

// ---------- 设置 ----------
const settingsForm = reactive({ cardEnabled: true, expireRemindDays: 7, showName: true, showExpire: true, permissions: {} });
const permOptions = [
  { key: 'balance_recharge', label: '余额充值', tip: '余额充值入口（待接入）' },
  { key: 'product', label: '商品会员价', tip: '商城商品会员价（待接入）' },
  { key: 'coupon', label: '优惠券', tip: '会员优惠券（待接入）' },
  { key: 'post_free', label: '包邮', tip: '会员包邮（待接入）' },
  { key: 'score_sign', label: '积分签到', tip: '每日签到积分（当前生效）' },
  { key: 'score_exchange', label: '积分兑换', tip: '积分商城兑换（待接入）' },
  { key: 'score_reduce', label: '积分抵扣', tip: '下单积分抵扣（待接入）' },
  { key: 'seckill', label: '秒杀', tip: '会员专享秒杀（待接入）' },
  { key: 'group', label: '拼团', tip: '会员拼团（待接入）' },
];
async function loadSettings() {
  const res = await customerApiCall.get('/member/settings');
  const s = res.settings || {};
  settingsForm.cardEnabled = !!s.card_enabled;
  settingsForm.expireRemindDays = s.expire_remind_days ?? 7;
  settingsForm.showName = !!s.show_name;
  settingsForm.showExpire = !!s.show_expire;
  settingsForm.permissions = { ...(s.permissions || {}) };
  for (const p of permOptions) if (settingsForm.permissions[p.key] === undefined) settingsForm.permissions[p.key] = 'all';
}
async function saveSettings() {
  saving.value = true;
  try {
    await customerApiCall.put('/member/settings', settingsForm);
    ElMessage.success('设置已保存');
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saving.value = false;
  }
}

// ---------- 申请记录 ----------
const applies = ref([]);
const applyTotal = ref(0);
const applyStatus = ref('pending');
const applyPage = ref(1);
async function loadApplies() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/member/applies', { params: { status: applyStatus.value, page: applyPage.value, pageSize: 20 } });
    applies.value = res.applies || [];
    applyTotal.value = res.total || 0;
  } finally {
    loading.value = false;
  }
}
async function reviewApply(row, action) {
  if (action === 'reject') {
    const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回申请', { inputPlaceholder: '必填', inputValidator: (v) => (v ? true : '请填写驳回原因') });
    await customerApiCall.post(`/member/applies/${row.id}/review`, { action, reason: value });
  } else {
    await customerApiCall.post(`/member/applies/${row.id}/review`, { action });
  }
  ElMessage.success(action === 'approve' ? '已通过并开卡' : '已驳回');
  await loadApplies();
}

// ---------- 开卡记录 ----------
const cards = ref([]);
const cardTotal = ref(0);
const cardKeyword = ref('');
const cardPage = ref(1);
async function loadCards() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/member/cards', { params: { keyword: cardKeyword.value, page: cardPage.value, pageSize: 20 } });
    cards.value = res.cards || [];
    cardTotal.value = res.total || 0;
  } finally {
    loading.value = false;
  }
}

// ---------- 用户详情 ----------
const detail = reactive({ show: false, user: null, level: null, member: null, logs: [] });
const newLabelId = ref('');
async function openDetail(row) {
  const res = await customerApiCall.get(`/member/users/${row.id}`);
  detail.user = res.user;
  detail.level = res.level;
  detail.member = res.member;
  const logs = await customerApiCall.get('/member/logs', { params: { page: 1, pageSize: 5, keyword: '' } });
  detail.logs = (logs.logs || []).filter((l) => l.user_id === row.id);
  detail.show = true;
  newLabelId.value = '';
}
async function addLabelToUser(id) {
  if (!id) return;
  await customerApiCall.put(`/member/users/${detail.user.id}/labels`, { labelIds: [...detail.user.labels.map((l) => l.id), id] });
  ElMessage.success('已添加标签');
  await openDetail(detail.user);
}
async function removeLabel(l) {
  await customerApiCall.put(`/member/users/${detail.user.id}/labels`, { labelIds: detail.user.labels.filter((x) => x.id !== l.id).map((x) => x.id) });
  await openDetail(detail.user);
}

async function loadAll() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/member/summary');
    summary.value = res.summary || {};
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadAll();
  loadLevels();
  loadLabels();
  loadSettings();
  loadUsers();
  loadApplies();
  loadCards();
});
</script>

<style scoped>
.card-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.ctab { display: flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 8px; background: #fff; color: #4e5969; cursor: pointer; font-size: 14px; border: 1px solid #e5e6eb; }
.ctab.active { background: #e8f3ff; color: #165dff; font-weight: 500; border-color: #165dff; }
.hd-actions { display: flex; gap: 12px; align-items: center; }
.mt16 { margin-top: 16px; }
.mt12 { margin-top: 12px; }
.mt8 { margin-top: 8px; }
.mb12 { margin-bottom: 12px; }
.mr4 { margin-right: 4px; }
.ml8 { margin-left: 8px; }
.muted { color: #86909c; }
.danger { color: #f53f3f; }
.success { color: #00b42a; }
.w220 { width: 220px; }
.w160 { width: 160px; }
.w130 { width: 130px; }
.w720 { max-width: 720px; }
.filter-bar { display: flex; gap: 10px; flex-wrap: wrap; }
.pager { display: flex; justify-content: flex-end; margin-top: 14px; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 16px; }
.stat-card { display: flex; align-items: center; gap: 12px; background: #fff; border-radius: 8px; padding: 20px; border: 1px solid #e5e6eb; }
.stat-ico { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
.stat-num { font-size: 24px; font-weight: 600; color: #1d2129; line-height: 1.2; }
.stat-label { font-size: 13px; color: #86909c; }
.user-cell { display: flex; align-items: center; gap: 8px; }
.u-name { font-size: 14px; color: #1d2129; }
.u-sub { font-size: 12px; color: #86909c; }
.lv-badge { display: inline-block; background: #e8f3ff; color: #165dff; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
.lv-card { margin-bottom: 16px; }
.lv-head { border-radius: 8px 8px 0 0; padding: 18px 16px; color: #fff; display: flex; justify-content: space-between; align-items: center; }
.lv-name { font-size: 18px; font-weight: 600; }
.lv-no { font-size: 13px; opacity: 0.85; }
.lv-body { padding: 14px 16px; }
.lv-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
.lv-foot { border-top: 1px solid #f2f3f5; padding: 10px 16px; display: flex; justify-content: flex-end; gap: 8px; }
.ellipsis { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty-tip { text-align: center; color: #86909c; padding: 24px 0; }
.label-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.form-tip { margin-left: 10px; color: #86909c; font-size: 12px; }
</style>
