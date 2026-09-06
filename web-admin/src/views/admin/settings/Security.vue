<template>
  <div>
    <div class="page-header"><h2 class="page-title">安全设置</h2></div>
    <div class="page-card">
      <el-form :model="form" label-width="160px">
        <el-form-item label="密码最小长度"><el-input-number v-model="form.minPasswordLength" :min="6" :max="32" /></el-form-item>
        <el-form-item label="登录失败锁定次数"><el-input-number v-model="form.maxLoginAttempts" :min="3" :max="20" /></el-form-item>
        <el-form-item label="锁定时长(分钟)"><el-input-number v-model="form.lockDuration" :min="5" :max="1440" /></el-form-item>
        <el-form-item label="会话超时(分钟)"><el-input-number v-model="form.sessionTimeout" :min="15" :max="1440" /></el-form-item>
        <el-form-item label="强制密码复杂度"><el-switch v-model="form.requireStrongPassword" /></el-form-item>
        <el-form-item label="双因素认证"><el-switch v-model="form.twoFactorEnabled" /></el-form-item>
      </el-form>
      <el-button type="primary" @click="save">保存设置</el-button>
    </div>
  </div>
</template>

<script setup>
import { reactive, onMounted } from 'vue';
import { fetchSettings, saveSettings } from '../../../api';
import { ElMessage } from 'element-plus';

const form = reactive({ minPasswordLength: 6, maxLoginAttempts: 5, lockDuration: 30, sessionTimeout: 120, requireStrongPassword: false, twoFactorEnabled: false });
onMounted(async () => {
  try {
    const res = await fetchSettings();
    if (res.settings?.security) Object.assign(form, res.settings.security);
  } catch (e) {}
});
async function save() {
  try { await saveSettings({ security: form }); ElMessage.success('保存成功'); }
  catch (e) { ElMessage.error(e); }
}
</script>
