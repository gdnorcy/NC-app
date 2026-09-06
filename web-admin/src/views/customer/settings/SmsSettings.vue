<template>
  <div class="settings-page">
    <div class="page-header">
      <h2 class="page-title">短信配置</h2>
      <p class="page-desc">配置短信发送方式，用于验证码、通知等短信服务</p>
    </div>

    <div class="card">
      <el-form :model="sms" label-width="140px" size="default">
        <el-form-item label="短信模式">
          <el-radio-group v-model="sms.mode">
            <el-radio value="platform">借用平台</el-radio>
            <el-radio value="independent">自主接入</el-radio>
          </el-radio-group>
        </el-form-item>

        <template v-if="sms.mode === 'platform'">
          <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px;">
            借用平台短信服务，无需额外配置，短信费用由平台统一结算。
          </el-alert>
        </template>

        <template v-if="sms.mode === 'independent'">
          <el-form-item label="服务商" required>
            <el-select v-model="sms.provider" style="width: 100%;">
              <el-option label="阿里云短信" value="aliyun" />
              <el-option label="腾讯云短信" value="tencent" />
            </el-select>
          </el-form-item>
          <el-form-item label="AccessKey ID" required>
            <el-input v-model="sms.accessKeyId" placeholder="请输入AccessKey ID" />
          </el-form-item>
          <el-form-item label="AccessKey Secret" required>
            <el-input v-model="sms.accessKeySecret" type="password" show-password placeholder="请输入AccessKey Secret" />
          </el-form-item>
          <el-form-item label="短信签名" required>
            <el-input v-model="sms.signName" placeholder="请输入短信签名" />
          </el-form-item>
          <el-form-item v-if="sms.provider === 'aliyun'" label="模板CODE">
            <el-input v-model="sms.templateCode" placeholder="如：SMS_123456789" />
          </el-form-item>
          <el-form-item v-if="sms.provider === 'tencent'" label="SDK AppID">
            <el-input v-model="sms.sdkAppId" placeholder="请输入SDK AppID" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveSms" :loading="saving">保存设置</el-button>
            <el-button @click="testSms">测试发送</el-button>
          </el-form-item>
        </template>

        <el-form-item v-if="sms.mode === 'platform'">
          <el-button type="primary" @click="saveSms" :loading="saving">保存设置</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { customerApiCall } from '../../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const saving = ref(false);
const sms = reactive({
  mode: 'platform',
  provider: 'aliyun',
  accessKeyId: '',
  accessKeySecret: '',
  signName: '',
  templateCode: '',
  sdkAppId: '',
});

onMounted(async () => {
  try {
    const data = await customerApiCall.get('/profile');
    if (data.customer?.config?.sms) {
      Object.assign(sms, data.customer.config.sms);
    }
  } catch (e) {}
});

async function saveSms() {
  if (sms.mode === 'independent') {
    if (!sms.accessKeyId) { ElMessage.warning('请输入AccessKey ID'); return; }
    if (!sms.accessKeySecret) { ElMessage.warning('请输入AccessKey Secret'); return; }
    if (!sms.signName) { ElMessage.warning('请输入短信签名'); return; }
  }
  saving.value = true;
  try {
    await customerApiCall.put('/config', { sms });
    ElMessage.success('保存成功');
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function testSms() {
  try {
    const { value } = await ElMessageBox.prompt('请输入测试手机号', '测试短信发送', {
      confirmButtonText: '发送',
      cancelButtonText: '取消',
      inputPattern: /^1[3-9]\d{9}$/,
      inputErrorMessage: '请输入正确的手机号',
    });
    ElMessage.success(`测试短信已发送至 ${value}`);
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '发送失败');
  }
}
</script>

<style scoped>
.settings-page { padding: 0; }
.page-header { margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0 0 4px; }
.page-desc { font-size: 13px; color: #86909c; margin: 0; }
.card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
</style>
