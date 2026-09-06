<template>
  <div>
    <div class="page-header">
      <el-button @click="$router.back()"><el-icon><ArrowLeft /></el-icon>返回</el-button>
      <h2 class="page-title">微信小程序</h2>
    </div>

    <!-- 未授权状态 -->
    <div class="page-card" v-if="!miniChannel?.authorizer_appid">
      <el-empty description="尚未授权微信小程序">
        <el-button type="primary" @click="goAuth">立即授权</el-button>
      </el-empty>
      <el-alert type="info" :closable="false" style="margin-top:16px;">
        授权后可自主上传代码、提交审核、发布版本。通过平台第三方平台代开发，无需微信开发者工具。
      </el-alert>
    </div>

    <!-- 已授权状态 -->
    <template v-else>
      <!-- 小程序信息 -->
      <div class="page-card">
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          <div>
            <div style="font-size:13px;color:#909399;">AppID</div>
            <code style="font-size:14px;">{{ miniChannel.authorizer_appid }}</code>
          </div>
          <div>
            <div style="font-size:13px;color:#909399;">当前版本</div>
            <div style="font-size:14px;font-weight:600;">{{ miniChannel.version || '未发布' }}</div>
          </div>
          <div>
            <div style="font-size:13px;color:#909399;">审核状态</div>
            <el-tag :type="auditStatusType(miniChannel.audit_status)" size="small">{{ auditStatusText(miniChannel.audit_status) }}</el-tag>
          </div>
          <div style="margin-left:auto;">
            <el-button @click="refreshAuditStatus">刷新状态</el-button>
          </div>
        </div>
      </div>

      <!-- 发布操作 -->
      <div class="page-card">
        <h3 style="margin-bottom:16px;">版本发布</h3>
        <el-form :model="publishForm" label-width="100px">
          <el-form-item label="选择模板">
            <el-select v-model="publishForm.templateId" style="width:100%;">
              <el-option v-for="t in templates" :key="t.template_id" :label="`${t.title} (v${t.template_version})`" :value="t.template_id" />
            </el-select>
            <el-button text type="primary" @click="loadTemplates" style="margin-left:8px;">同步模板</el-button>
          </el-form-item>
          <el-form-item label="版本号">
            <el-input v-model="publishForm.userVersion" placeholder="如 1.0.0" />
          </el-form-item>
          <el-form-item label="版本描述">
            <el-input v-model="publishForm.userDesc" type="textarea" :rows="2" placeholder="描述本次更新内容" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="uploadCode" :loading="uploading" :disabled="!publishForm.templateId || !publishForm.userVersion">
              上传代码
            </el-button>
            <el-button type="warning" @click="submitAudit" :disabled="miniChannel.audit_status !== 'draft'" :loading="submitting">
              提交审核
            </el-button>
            <el-button type="success" @click="release" :disabled="miniChannel.audit_status !== 'approved'" :loading="releasing">
              发布
            </el-button>
            <el-button @click="rollback" :loading="rolling">版本回退</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 品牌配置 -->
      <div class="page-card">
        <h3 style="margin-bottom:16px;">品牌配置</h3>
        <el-form :model="brandForm" label-width="100px">
          <el-form-item label="小程序名称">
            <el-input v-model="brandForm.brandName" placeholder="留空使用客户名称" />
          </el-form-item>
          <el-form-item label="主题色">
            <el-color-picker v-model="brandForm.primaryColor" />
          </el-form-item>
          <el-form-item label="启用渠道">
            <el-switch v-model="brandForm.enabled" @change="saveBrand" />
          </el-form-item>
          <el-form-item v-if="brandChanged">
            <el-button type="primary" @click="saveBrand">保存品牌配置</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 发布日志 -->
      <div class="page-card">
        <h3 style="margin-bottom:16px;">发布日志</h3>
        <el-table :data="deployLogs" size="small">
          <el-table-column prop="created_at" label="时间" width="170" />
          <el-table-column prop="action" label="操作" width="120">
            <template #default="{ row }">{{ actionText(row.action) }}</template>
          </el-table-column>
          <el-table-column prop="version" label="版本" width="100" />
          <el-table-column prop="status" label="状态">
            <template #default="{ row }">
              <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">{{ row.status === 'success' ? '成功' : '失败' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!deployLogs.length" description="暂无发布记录" :image-size="60" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import {
  fetchCustomerChannels, updateCustomerChannel,
  fetchCustomerMiniTemplates, getCustomerMiniAuthUrl,
  customerMiniUpload, customerMiniSubmitAudit, customerMiniAuditStatus,
  customerMiniRelease, customerMiniRollback, fetchCustomerMiniDeployLogs,
} from '../../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const miniChannel = ref(null);
const templates = ref([]);
const deployLogs = ref([]);
const uploading = ref(false);
const submitting = ref(false);
const releasing = ref(false);
const rolling = ref(false);
const brandChanged = ref(false);

const publishForm = reactive({ templateId: null, userVersion: '', userDesc: '' });
const brandForm = reactive({ brandName: '', primaryColor: '#165DFF', enabled: false });

onMounted(async () => {
  await loadData();
  await loadTemplates();
  await loadDeployLogs();
});

async function loadData() {
  try {
    const res = await fetchCustomerChannels();
    miniChannel.value = (res.channels || []).find(c => c.channel_type === 'mini');
    if (miniChannel.value) {
      brandForm.brandName = miniChannel.value.brand_name || '';
      brandForm.primaryColor = miniChannel.value.primary_color || '#165DFF';
      brandForm.enabled = !!miniChannel.value.enabled;
    }
  } catch (e) {}
}

async function loadTemplates() {
  try {
    const res = await fetchCustomerMiniTemplates();
    templates.value = res.templates || [];
  } catch (e) {}
}

async function loadDeployLogs() {
  try {
    const res = await fetchCustomerMiniDeployLogs();
    deployLogs.value = res.logs || [];
  } catch (e) {}
}

async function goAuth() {
  try {
    const redirectUri = `${location.origin}/customer#/apps/channel/mini`;
    const res = await getCustomerMiniAuthUrl({ redirectUri });
    window.open(res.authUrl, '_blank');
  } catch (e) { ElMessage.error(e); }
}

async function uploadCode() {
  try {
    await ElMessageBox.confirm('确认上传代码到小程序？上传后将创建草稿版本。', '确认上传', { type: 'warning' });
    uploading.value = true;
    await customerMiniUpload(publishForm);
    ElMessage.success('代码上传成功');
    await loadData();
    await loadDeployLogs();
  } catch (e) { ElMessage.error(e); }
  finally { uploading.value = false; }
}

async function submitAudit() {
  try {
    await ElMessageBox.confirm('确认提交审核？审核期间无法修改代码。', '确认提交', { type: 'warning' });
    submitting.value = true;
    await customerMiniSubmitAudit();
    ElMessage.success('已提交审核');
    await loadData();
    await loadDeployLogs();
  } catch (e) { ElMessage.error(e); }
  finally { submitting.value = false; }
}

async function refreshAuditStatus() {
  try {
    const res = await customerMiniAuditStatus();
    ElMessage.success(`审核状态：${auditStatusText(res.auditStatus)}`);
    await loadData();
  } catch (e) { ElMessage.error(e); }
}

async function release() {
  try {
    await ElMessageBox.confirm('确认发布？发布后用户将看到新版本。', '确认发布', { type: 'warning' });
    releasing.value = true;
    await customerMiniRelease();
    ElMessage.success('发布成功');
    await loadData();
    await loadDeployLogs();
  } catch (e) { ElMessage.error(e); }
  finally { releasing.value = false; }
}

async function rollback() {
  try {
    await ElMessageBox.confirm('确认回退到上一版本？', '确认回退', { type: 'warning' });
    rolling.value = true;
    await customerMiniRollback();
    ElMessage.success('回退成功');
    await loadDeployLogs();
  } catch (e) { ElMessage.error(e); }
  finally { rolling.value = false; }
}

async function saveBrand() {
  try {
    await updateCustomerChannel('mini', brandForm);
    ElMessage.success('品牌配置已保存');
    brandChanged.value = false;
    await loadData();
  } catch (e) { ElMessage.error(e); }
}

function auditStatusText(s) {
  return { none: '未上传', draft: '草稿', auditing: '审核中', approved: '审核通过', rejected: '审核拒绝', released: '已发布' }[s] || s;
}
function auditStatusType(s) {
  return { none: 'info', draft: 'warning', auditing: 'warning', approved: 'success', rejected: 'danger', released: 'success' }[s] || 'info';
}
function actionText(a) {
  return { upload: '上传代码', submit_audit: '提交审核', release: '发布', rollback: '回退' }[a] || a;
}
</script>
