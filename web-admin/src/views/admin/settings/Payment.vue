<template>
  <div>
    <div class="page-header"><h2 class="page-title">支付设置</h2></div>
    <div class="page-card">
      <h3 style="margin-bottom:16px;display:flex;align-items:center;gap:8px;"><SIcon name="wechat" size="default" color="#4E5969" />微信支付</h3>
      <el-form :model="form.wechat" label-width="140px">
        <el-form-item label="支付模式">
          <el-radio-group v-model="form.wechat.mode">
            <el-radio label="normal">普通商户号</el-radio>
            <el-radio label="service">系统服务商</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="AppID"><el-input v-model="form.wechat.appId" /></el-form-item>
        <el-form-item label="商户号"><el-input v-model="form.wechat.mchId" /></el-form-item>
        <el-form-item label="API密钥"><el-input v-model="form.wechat.apiKey" type="password" /></el-form-item>
        <el-form-item label="回调地址"><el-input v-model="form.wechat.notifyUrl" /></el-form-item>
      </el-form>
    </div>
    <div class="page-card">
      <h3 style="margin-bottom:16px;display:flex;align-items:center;gap:8px;"><SIcon name="alipay" size="default" color="#4E5969" />支付宝</h3>
      <el-form :model="form.alipay" label-width="140px">
        <el-form-item label="AppID"><el-input v-model="form.alipay.appId" /></el-form-item>
        <el-form-item label="应用私钥"><el-input v-model="form.alipay.privateKey" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="支付宝公钥"><el-input v-model="form.alipay.publicKey" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="回调地址"><el-input v-model="form.alipay.notifyUrl" /></el-form-item>
      </el-form>
    </div>
    <el-button type="primary" @click="save">保存设置</el-button>
  </div>
</template>

<script setup>
import { reactive, onMounted } from 'vue';
import { fetchSettings, saveSettings } from '../../../api';
import { ElMessage } from 'element-plus';
import SIcon from '../../../components/SIcon.vue';

const form = reactive({
  wechat: { mode: 'normal', appId: '', mchId: '', apiKey: '', notifyUrl: '' },
  alipay: { appId: '', privateKey: '', publicKey: '', notifyUrl: '' },
});
onMounted(async () => {
  try {
    const res = await fetchSettings();
    if (res.settings?.payment) Object.assign(form, res.settings.payment);
  } catch (e) {}
});
async function save() {
  try { await saveSettings({ payment: form }); ElMessage.success('保存成功'); }
  catch (e) { ElMessage.error(e); }
}
</script>
