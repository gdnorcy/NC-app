<template>
  <div>
    <div class="page-header"><h2 class="page-title">开放平台</h2></div>
    <div class="page-card">
      <h3 style="margin-bottom:16px;">平台凭证</h3>
      <el-form :model="form" label-width="140px">
        <el-form-item label="AppID"><el-input v-model="form.appId" readonly><template #append><el-button text @click="copy(form.appId)">复制</el-button></template></el-input></el-form-item>
        <el-form-item label="AppSecret"><el-input v-model="form.appSecret" type="password" readonly><template #append><el-button text @click="copy(form.appSecret)">复制</el-button></template></el-input></el-form-item>
        <el-form-item label="回调地址白名单"><el-input v-model="form.redirectUris" type="textarea" :rows="3" placeholder="每行一个URL" /></el-form-item>
        <el-form-item label="IP白名单"><el-input v-model="form.ipWhitelist" type="textarea" :rows="3" placeholder="每行一个IP，留空不限制" /></el-form-item>
      </el-form>
      <div style="display:flex;gap:8px;">
        <el-button @click="resetSecret">重置AppSecret</el-button>
        <el-button type="primary" @click="save">保存设置</el-button>
      </div>
    </div>
    <div class="page-card">
      <h3 style="margin-bottom:16px;">API文档</h3>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="基础URL"><code>http://your-domain.com/api</code></el-descriptions-item>
        <el-descriptions-item label="认证方式"><code>Authorization: Bearer {token}</code></el-descriptions-item>
        <el-descriptions-item label="获取Token"><code>POST /auth/login</code></el-descriptions-item>
        <el-descriptions-item label="响应格式"><code>{ "code": 0, "data": {}, "message": "ok" }</code></el-descriptions-item>
      </el-descriptions>
    </div>
  </div>
</template>

<script setup>
import { reactive, onMounted } from 'vue';
import { fetchSettings, saveSettings } from '../../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const form = reactive({ appId: '', appSecret: '', redirectUris: '', ipWhitelist: '' });
onMounted(async () => {
  try {
    const res = await fetchSettings();
    if (res.settings?.openPlatform) Object.assign(form, res.settings.openPlatform);
    if (!form.appId) form.appId = 'app_' + Math.random().toString(36).slice(2, 18);
    if (!form.appSecret) form.appSecret = 'sk_' + Math.random().toString(36).slice(2, 34);
  } catch (e) {}
});
function copy(text) {
  navigator.clipboard.writeText(text);
  ElMessage.success('已复制');
}
async function resetSecret() {
  try {
    await ElMessageBox.confirm('确定重置AppSecret？重置后旧凭证将失效', '确认', { type: 'warning' });
    form.appSecret = 'sk_' + Math.random().toString(36).slice(2, 34);
    ElMessage.success('已生成新AppSecret，请保存');
  } catch (e) {}
}
async function save() {
  try { await saveSettings({ openPlatform: form }); ElMessage.success('保存成功'); }
  catch (e) { ElMessage.error(e); }
}
</script>
