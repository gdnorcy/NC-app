<template>
  <div class="platform-pay-config">
    <el-form :model="platformConfig" label-width="140px" size="default">
      <el-divider content-position="left">微信支付</el-divider>
      <el-form-item label="启用微信支付">
        <el-switch v-model="platformConfig.wechat.enabled" active-text="启用" />
      </el-form-item>
      <template v-if="platformConfig.wechat.enabled">
        <el-form-item label="商户号" required>
          <el-input v-model="platformConfig.wechat.mchId" placeholder="微信支付商户号" />
        </el-form-item>
        <el-form-item label="APIv3密钥" required>
          <el-input v-model="platformConfig.wechat.apiV3Key" type="password" show-password placeholder="APIv3密钥" />
        </el-form-item>
        <el-form-item label="绑定AppID" required>
          <el-input v-model="platformConfig.wechat.appid" placeholder="小程序/公众号AppID" />
        </el-form-item>
        <el-form-item label="证书序列号">
          <el-input v-model="platformConfig.wechat.certSerial" placeholder="商户证书序列号" />
        </el-form-item>
        <el-form-item label="商户私钥">
          <el-input v-model="platformConfig.wechat.privateKey" type="textarea" :rows="3" placeholder="商户私钥内容" />
        </el-form-item>
      </template>

      <el-divider content-position="left">支付宝</el-divider>
      <el-form-item label="启用支付宝">
        <el-switch v-model="platformConfig.alipay.enabled" active-text="启用" />
      </el-form-item>
      <template v-if="platformConfig.alipay.enabled">
        <el-form-item label="应用AppID" required>
          <el-input v-model="platformConfig.alipay.appId" placeholder="支付宝应用AppID" />
        </el-form-item>
        <el-form-item label="应用私钥" required>
          <el-input v-model="platformConfig.alipay.privateKey" type="textarea" :rows="3" placeholder="应用私钥" />
        </el-form-item>
        <el-form-item label="支付宝公钥" required>
          <el-input v-model="platformConfig.alipay.alipayPublicKey" type="textarea" :rows="3" placeholder="支付宝公钥" />
        </el-form-item>
      </template>

      <el-form-item>
        <el-button type="primary" @click="savePlatformConfig" :loading="saving">保存配置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { paymentApi } from '../../api';

const saving = ref(false);
const platformConfig = ref({
  wechat: { enabled: false, mchId: '', apiV3Key: '', appid: '', certSerial: '', privateKey: '' },
  alipay: { enabled: false, appId: '', privateKey: '', alipayPublicKey: '' },
});

async function loadPlatformConfig() {
  try {
    const res = await paymentApi.get('/payment/platform-config');
    if (res.config) platformConfig.value = res.config;
  } catch (e) { console.error(e); }
}

async function savePlatformConfig() {
  saving.value = true;
  try {
    await paymentApi.put('/payment/platform-config', platformConfig.value);
    ElMessage.success('保存成功');
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(loadPlatformConfig);
</script>

<style scoped>
.platform-pay-config {
  padding: 20px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.platform-pay-config :deep(.el-form-item) {
  margin-bottom: 22px;
}
.platform-pay-config :deep(.el-input) {
  max-width: 420px;
}
.platform-pay-config :deep(.el-textarea) {
  max-width: 420px;
}
</style>
