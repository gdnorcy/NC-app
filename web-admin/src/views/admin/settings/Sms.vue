<template>
  <div>
    <div class="page-header"><h2 class="page-title" style="display:flex;align-items:center;gap:8px;"><SIcon name="sms" size="default" color="#4E5969" />短信接口</h2></div>
    <div class="page-card">
      <el-form :model="form" label-width="140px">
        <el-form-item label="短信服务商">
          <el-select v-model="form.provider" style="width:100%;">
            <el-option label="Mock（开发）" value="mock" />
            <el-option label="阿里云短信" value="aliyun" />
            <el-option label="腾讯云短信" value="tencent" />
          </el-select>
        </el-form-item>
        <el-form-item label="AccessKey ID" v-if="form.provider !== 'mock'"><el-input v-model="form.accessKeyId" /></el-form-item>
        <el-form-item label="AccessKey Secret" v-if="form.provider !== 'mock'"><el-input v-model="form.accessKeySecret" type="password" /></el-form-item>
        <el-form-item label="签名" v-if="form.provider !== 'mock'"><el-input v-model="form.signName" placeholder="如：全景云平台" /></el-form-item>
        <el-form-item label="登录模板CODE" v-if="form.provider !== 'mock'"><el-input v-model="form.loginTemplate" placeholder="如：SMS_123456789" /></el-form-item>
      </el-form>
      <el-button type="primary" @click="save">保存设置</el-button>
    </div>
  </div>
</template>

<script setup>
import { reactive, onMounted } from 'vue';
import { fetchSettings, saveSettings } from '../../../api';
import { ElMessage } from 'element-plus';
import SIcon from '../../../components/SIcon.vue';

const form = reactive({ provider: 'mock', accessKeyId: '', accessKeySecret: '', signName: '', loginTemplate: '' });
onMounted(async () => {
  try {
    const res = await fetchSettings();
    if (res.settings?.sms) Object.assign(form, res.settings.sms);
  } catch (e) {}
});
async function save() {
  try { await saveSettings({ sms: form }); ElMessage.success('保存成功'); }
  catch (e) { ElMessage.error(e); }
}
</script>
