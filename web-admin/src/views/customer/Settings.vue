<template>
  <div>
    <div class="page-header"><h2 class="page-title">账号设置</h2></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="page-card">
        <h3 style="margin-bottom:16px;">个人信息</h3>
        <el-form :model="profile" label-width="100px">
          <el-form-item label="账号"><el-input v-model="profile.username" disabled /></el-form-item>
          <el-form-item label="手机号"><el-input v-model="profile.phone" /></el-form-item>
          <el-form-item><el-button type="primary" @click="saveProfile">保存修改</el-button></el-form-item>
        </el-form>
      </div>
      <div class="page-card">
        <h3 style="margin-bottom:16px;">修改密码</h3>
        <el-form :model="pwdForm" label-width="100px">
          <el-form-item label="当前密码"><el-input v-model="pwdForm.oldPassword" type="password" /></el-form-item>
          <el-form-item label="新密码"><el-input v-model="pwdForm.newPassword" type="password" /></el-form-item>
          <el-form-item label="确认密码"><el-input v-model="pwdForm.confirmPassword" type="password" /></el-form-item>
          <el-form-item><el-button type="primary" @click="changePwd">确认修改</el-button></el-form-item>
        </el-form>
      </div>
    </div>
    <div class="page-card">
      <h3 style="margin-bottom:16px;">远程附件（存储设置）</h3>
      <el-tabs v-model="storageTab">
        <el-tab-pane label="本地存储" name="local">
          <p style="color:#909399;margin-bottom:16px;">借用平台存储，无需额外配置。</p>
          <el-button type="primary" @click="saveStorage('local')">保存并启用</el-button>
        </el-tab-pane>
        <el-tab-pane label="阿里云OSS" name="aliyun">
          <el-form :model="storage.aliyun" label-width="140px">
            <el-form-item label="AccessKey ID"><el-input v-model="storage.aliyun.accessKeyId" /></el-form-item>
            <el-form-item label="AccessKey Secret"><el-input v-model="storage.aliyun.accessKeySecret" type="password" /></el-form-item>
            <el-form-item label="Region区域"><el-input v-model="storage.aliyun.region" /></el-form-item>
            <el-form-item label="Bucket"><el-input v-model="storage.aliyun.bucket" /></el-form-item>
            <el-form-item label="文件夹前缀"><el-input v-model="storage.aliyun.prefix" /></el-form-item>
            <el-form-item label="CDN域名"><el-input v-model="storage.aliyun.cdnDomain" /></el-form-item>
          </el-form>
          <el-button type="primary" @click="saveStorage('aliyun')">保存并启用</el-button>
        </el-tab-pane>
        <el-tab-pane label="七牛云" name="qiniu">
          <el-form :model="storage.qiniu" label-width="140px">
            <el-form-item label="AccessKey"><el-input v-model="storage.qiniu.accessKey" /></el-form-item>
            <el-form-item label="SecretKey"><el-input v-model="storage.qiniu.secretKey" type="password" /></el-form-item>
            <el-form-item label="所属区域">
              <el-select v-model="storage.qiniu.region" style="width:100%;">
                <el-option label="华东-浙江" value="z0" />
                <el-option label="华北-河北" value="z1" />
                <el-option label="华南-广东" value="z2" />
              </el-select>
            </el-form-item>
            <el-form-item label="空间名"><el-input v-model="storage.qiniu.bucket" /></el-form-item>
            <el-form-item label="文件夹前缀"><el-input v-model="storage.qiniu.prefix" /></el-form-item>
            <el-form-item label="CDN域名"><el-input v-model="storage.qiniu.cdnDomain" /></el-form-item>
          </el-form>
          <el-button type="primary" @click="saveStorage('qiniu')">保存并启用</el-button>
        </el-tab-pane>
      </el-tabs>
    </div>
    <div class="page-card">
      <h3 style="margin-bottom:16px;">短信配置</h3>
      <el-form :model="sms" label-width="140px">
        <el-form-item label="短信模式">
          <el-radio-group v-model="sms.mode">
            <el-radio label="platform">借用平台</el-radio>
            <el-radio label="independent">自主接入</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="sms.mode === 'independent'">
          <el-form-item label="服务商">
            <el-select v-model="sms.provider" style="width:100%;">
              <el-option label="阿里云短信" value="aliyun" />
              <el-option label="腾讯云短信" value="tencent" />
            </el-select>
          </el-form-item>
          <el-form-item label="AccessKey ID"><el-input v-model="sms.accessKeyId" /></el-form-item>
          <el-form-item label="AccessKey Secret"><el-input v-model="sms.accessKeySecret" type="password" /></el-form-item>
          <el-form-item label="签名"><el-input v-model="sms.signName" /></el-form-item>
        </template>
        <el-form-item><el-button type="primary" @click="saveSms">保存设置</el-button></el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { customerApiCall } from '../../api';
import { ElMessage } from 'element-plus';

const profile = reactive({ username: '', phone: '' });
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const storageTab = ref('local');
const storage = reactive({
  aliyun: { accessKeyId: '', accessKeySecret: '', region: '', bucket: '', prefix: '', cdnDomain: '' },
  qiniu: { accessKey: '', secretKey: '', region: 'z0', bucket: '', prefix: '', cdnDomain: '' },
});
const sms = reactive({ mode: 'platform', provider: 'aliyun', accessKeyId: '', accessKeySecret: '', signName: '' });

onMounted(async () => {
  try {
    const data = await customerApiCall.get('/profile');
    Object.assign(profile, data.user || {});
    if (data.customer?.config) {
      if (data.customer.config.storage) Object.assign(storage, data.customer.config.storage);
      if (data.customer.config.sms) Object.assign(sms, data.customer.config.sms);
    }
  } catch (e) {}
});

async function saveProfile() {
  try { await customerApiCall.put('/profile', profile); ElMessage.success('保存成功'); }
  catch (e) { ElMessage.error(e); }
}
async function changePwd() {
  if (pwdForm.newPassword !== pwdForm.confirmPassword) { ElMessage.error('两次密码不一致'); return; }
  try { await customerApiCall.post('/change-password', pwdForm); ElMessage.success('修改成功'); }
  catch (e) { ElMessage.error(e); }
}
async function saveStorage(type) {
  try { await customerApiCall.put('/config', { storage: { type, ...storage[type] } }); ElMessage.success('保存成功'); }
  catch (e) { ElMessage.error(e); }
}
async function saveSms() {
  try { await customerApiCall.put('/config', { sms }); ElMessage.success('保存成功'); }
  catch (e) { ElMessage.error(e); }
}
</script>
