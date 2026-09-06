<template>
  <div>
    <div class="page-header">
      <el-button @click="$router.back()"><el-icon><ArrowLeft /></el-icon>返回</el-button>
      <h2 class="page-title">微信小程序管理</h2>
      <div style="margin-left:auto;display:flex;gap:8px;">
        <el-button @click="loadTemplates(true)">同步模板</el-button>
        <el-button type="primary" @click="showAuth = true">授权新客户</el-button>
      </div>
    </div>

    <!-- 模板选择 -->
    <div class="page-card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:14px;font-weight:600;">当前模板：</span>
        <el-select v-model="selectedTemplate" placeholder="选择模板" style="width:300px;" @change="onTemplateChange">
          <el-option v-for="t in templates" :key="t.template_id" :label="`${t.user_version} - ${t.user_desc}`" :value="t.template_id" />
        </el-select>
        <span style="font-size:12px;color:#909399;">从微信第三方平台同步的模板列表</span>
      </div>
    </div>

    <!-- 已授权客户列表 -->
    <div class="page-card">
      <el-table :data="miniChannels" stripe>
        <el-table-column label="客户" width="200">
          <template #default="{ row }">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:20px;">🏢</span>
              <span>{{ getCustomerName(row.customerId) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="appid" label="AppID" width="200">
          <template #default="{ row }"><code style="font-size:12px;">{{ row.appid }}</code></template>
        </el-table-column>
        <el-table-column label="授权状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.authStatus === 'authorized' ? 'success' : 'danger'" size="small">
              {{ row.authStatus === 'authorized' ? '已授权' : '已失效' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="版本" width="100">
          <template #default="{ row }">{{ row.version || '-' }}</template>
        </el-table-column>
        <el-table-column label="审核状态" width="100">
          <template #default="{ row }">
            <el-tag :type="auditStatusType(row.auditStatus)" size="small">{{ auditStatusText(row.auditStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320">
          <template #default="{ row }">
            <el-button size="small" :disabled="!selectedTemplate" @click="upload(row)">上传代码</el-button>
            <el-button size="small" type="warning" :disabled="row.auditStatus !== 'draft'" @click="submitAudit(row)">提交审核</el-button>
            <el-button size="small" type="success" :disabled="row.auditStatus !== 'approved'" @click="release(row)">发布</el-button>
            <el-button size="small" @click="viewLogs(row)">日志</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!miniChannels.length" description="暂无已授权的小程序，点击右上角授权新客户" />
    </div>

    <!-- 授权弹窗 -->
    <el-dialog v-model="showAuth" title="授权小程序" width="500px">
      <el-form label-width="100px">
        <el-form-item label="选择客户">
          <el-select v-model="authCustomerId" placeholder="选择要授权的客户" style="width:100%;">
            <el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" style="margin-bottom:16px;">
        点击下方按钮后，将跳转到微信授权页面。请使用小程序管理员微信扫码确认授权。
      </el-alert>
      <template #footer>
        <el-button @click="showAuth = false">取消</el-button>
        <el-button type="primary" @click="goAuth" :disabled="!authCustomerId">去授权</el-button>
      </template>
    </el-dialog>

    <!-- 发布日志弹窗 -->
    <el-dialog v-model="showLogs" title="发布日志" width="700px">
      <el-table :data="deployLogs" size="small" max-height="400">
        <el-table-column prop="created_at" label="时间" width="180" />
        <el-table-column prop="action" label="操作" width="120">
          <template #default="{ row }">{{ actionText(row.action) }}</template>
        </el-table-column>
        <el-table-column prop="version" label="版本" width="100" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">{{ row.status === 'success' ? '成功' : '失败' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="error_message" label="错误信息" show-overflow-tooltip />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import {
  fetchChannelTemplates, fetchTenantChannels, getChannelAuthUrl,
  channelUploadCode, channelSubmitAudit, channelRelease, fetchChannelDeployLogs,
  fetchCustomers,
} from '../../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const miniChannels = ref([]);
const templates = ref([]);
const selectedTemplate = ref('');
const customers = ref([]);
const showAuth = ref(false);
const authCustomerId = ref(null);
const showLogs = ref(false);
const deployLogs = ref([]);

async function loadData() {
  try {
    // 加载所有客户
    const res = await fetchCustomers();
    customers.value = res.customers || [];
    // 加载所有租户的小程序渠道
    const all = [];
    for (const c of customers.value) {
      const chRes = await fetchTenantChannels(c.id);
      const mini = (chRes.channels || []).find(ch => ch.channelType === 'mini');
      if (mini) all.push({ ...mini, customerId: c.id });
    }
    miniChannels.value = all;
  } catch (e) { ElMessage.error(e); }
}

async function loadTemplates(showMsg = false) {
  try {
    const res = await fetchChannelTemplates();
    templates.value = res.templates || [];
    if (templates.value.length && !selectedTemplate.value) {
      selectedTemplate.value = templates.value[0].template_id;
    }
    if (showMsg) ElMessage.success(`已同步 ${templates.value.length} 个模板`);
  } catch (e) {
    if (showMsg) ElMessage.error(e);
    // 页面加载时静默失败（可能未配置第三方平台）
  }
}

function onTemplateChange() {
  ElMessage.success(`已选择模板: ${selectedTemplate.value}`);
}

async function goAuth() {
  try {
    const redirectUri = `${location.origin}/admin#/channel/mini`;
    const res = await getChannelAuthUrl({ redirectUri, customerId: authCustomerId.value, authType: 2 });
    window.open(res.authUrl, '_blank');
    showAuth.value = false;
    setTimeout(loadData, 3000);
  } catch (e) { ElMessage.error(e); }
}

async function upload(row) {
  try {
    await ElMessageBox.confirm(`确定为「${getCustomerName(row.customerId)}」上传代码？模板ID: ${selectedTemplate.value}`, '确认', { type: 'warning' });
    await channelUploadCode(row.id, { templateId: selectedTemplate.value, version: '1.0.0' });
    ElMessage.success('代码上传成功');
    loadData();
  } catch (e) { if (e !== 'cancel') ElMessage.error(e); }
}

async function submitAudit(row) {
  try {
    await channelSubmitAudit(row.id);
    ElMessage.success('已提交审核');
    loadData();
  } catch (e) { ElMessage.error(e); }
}

async function release(row) {
  try {
    await ElMessageBox.confirm(`确定发布「${getCustomerName(row.customerId)}」小程序？发布后所有用户可见`, '确认发布', { type: 'warning' });
    await channelRelease(row.id);
    ElMessage.success('发布成功');
    loadData();
  } catch (e) { if (e !== 'cancel') ElMessage.error(e); }
}

async function viewLogs(row) {
  try {
    const res = await fetchChannelDeployLogs(row.id);
    deployLogs.value = res.logs || [];
    showLogs.value = true;
  } catch (e) { ElMessage.error(e); }
}

function getCustomerName(id) {
  return customers.value.find(c => c.id === id)?.name || `客户${id}`;
}
function auditStatusText(s) {
  return { none: '未上传', draft: '草稿', auditing: '审核中', approved: '审核通过', rejected: '审核拒绝', released: '已发布', revoked: '已撤回' }[s] || s;
}
function auditStatusType(s) {
  return { none: 'info', draft: 'warning', auditing: 'warning', approved: 'success', rejected: 'danger', released: 'success', revoked: 'info' }[s] || 'info';
}
function actionText(a) {
  return { upload: '上传代码', submit_audit: '提交审核', release: '发布', rollback: '回退' }[a] || a;
}

onMounted(() => { loadData(); loadTemplates(); });
</script>
