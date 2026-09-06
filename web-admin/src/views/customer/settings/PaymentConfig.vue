<template>
  <div class="payment-config">
    <div class="page-header">
      <h2 class="page-title">支付设置</h2>
      <p class="page-desc">配置客户独立支付体系，会员费等收入可直接进入您的账户</p>
    </div>

    <!-- 支付模式 -->
    <div class="card">
      <div class="card-title">收款模式</div>
      <div class="mode-cards">
        <div class="mode-card" :class="{ active: form.mode === 'platform' }" @click="form.mode = 'platform'">
          <div class="mode-icon">
            <SIcon name="wallet" size="xlarge" :color="form.mode === 'platform' ? '#165dff' : '#4e5969'" />
          </div>
          <div class="mode-name">借用平台支付</div>
          <div class="mode-desc">使用平台商户号代收，平台扣除手续费后定期结算给您</div>
          <div class="mode-tag" v-if="form.mode === 'platform'">当前选择</div>
        </div>
        <div class="mode-card" :class="{ active: form.mode === 'independent' }" @click="form.mode = 'independent'">
          <div class="mode-icon">
            <SIcon name="card" size="xlarge" :color="form.mode === 'independent' ? '#165dff' : '#4e5969'" />
          </div>
          <div class="mode-name">自主接入</div>
          <div class="mode-desc">使用您自己的微信支付/支付宝商户号，资金直接进入您的账户</div>
          <div class="mode-tag" v-if="form.mode === 'independent'">当前选择</div>
        </div>
      </div>
    </div>

    <!-- 借用平台模式配置 -->
    <div class="card" v-if="form.mode === 'platform'">
      <div class="card-title">平台代收配置</div>
      <el-form :model="form" label-width="140px" size="default">
        <el-form-item label="平台手续费率">
          <el-input-number v-model="form.platformFeeRate" :min="0" :max="50" :step="0.5" :precision="1" />
          <span class="unit">%</span>
          <span class="hint">每笔交易平台收取的手续费比例</span>
        </el-form-item>
        <el-form-item label="结算周期">
          <el-select v-model="form.settlementCycle" style="width: 200px">
            <el-option label="T+7" value="T+7" />
            <el-option label="T+15" value="T+15" />
            <el-option label="T+30" value="T+30" />
          </el-select>
        </el-form-item>
      </el-form>
      <div class="notice">
        <el-alert type="info" :closable="false" show-icon>
          借用平台模式下，会员费等收入先进入平台账户，平台按手续费率扣除后，按结算周期定期结算给您。
        </el-alert>
      </div>
    </div>

    <!-- 自主接入模式配置 -->
    <div v-if="form.mode === 'independent'">
      <!-- 微信支付 -->
      <div class="card">
        <div class="card-title">
          <span class="title-with-icon"><SIcon name="wechat" size="default" color="#4e5969" />微信支付</span>
          <el-switch v-model="form.wechat.enabled" active-text="启用" />
        </div>
        <el-form :model="form.wechat" label-width="140px" size="default" v-if="form.wechat.enabled">
          <el-form-item label="商户类型">
            <el-radio-group v-model="form.wechat.merchantType">
              <el-radio value="normal">普通商户号</el-radio>
              <el-radio value="service">服务商模式</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="商户号" required>
            <el-input v-model="form.wechat.mchId" placeholder="请输入微信支付商户号" />
          </el-form-item>
          <el-form-item label="APIv3密钥" required>
            <el-input v-model="form.wechat.apiV3Key" type="password" show-password placeholder="请输入APIv3密钥" />
          </el-form-item>
          <el-form-item label="绑定AppID" required>
            <el-input v-model="form.wechat.appid" placeholder="小程序/公众号AppID" />
          </el-form-item>
          <el-form-item label="证书序列号">
            <el-input v-model="form.wechat.certSerial" placeholder="商户证书序列号" />
          </el-form-item>
          <el-form-item label="商户私钥">
            <el-input v-model="form.wechat.privateKey" type="textarea" :rows="3" placeholder="请粘贴商户私钥内容" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="testConnection('wechat')">测试连接</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 支付宝 -->
      <div class="card">
        <div class="card-title">
          <span class="title-with-icon"><SIcon name="alipay" size="default" color="#4e5969" />支付宝</span>
          <el-switch v-model="form.alipay.enabled" active-text="启用" />
        </div>
        <el-form :model="form.alipay" label-width="140px" size="default" v-if="form.alipay.enabled">
          <el-form-item label="应用AppID" required>
            <el-input v-model="form.alipay.appId" placeholder="请输入支付宝应用AppID" />
          </el-form-item>
          <el-form-item label="应用私钥" required>
            <el-input v-model="form.alipay.privateKey" type="textarea" :rows="3" placeholder="请粘贴应用私钥" />
          </el-form-item>
          <el-form-item label="支付宝公钥" required>
            <el-input v-model="form.alipay.alipayPublicKey" type="textarea" :rows="3" placeholder="请粘贴支付宝公钥" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="testConnection('alipay')">测试连接</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 保存按钮 -->
    <div class="card">
      <div class="save-bar">
        <el-button type="primary" size="large" @click="saveConfig" :loading="saving">保存配置</el-button>
        <el-button size="large" @click="loadConfig">重置</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { customerPaymentCall } from '../../../api';
import SIcon from '../../../components/SIcon.vue';

const saving = ref(false);
const form = ref({
  mode: 'platform',
  wechat: { enabled: false, merchantType: 'normal', mchId: '', apiV3Key: '', appid: '', certSerial: '', privateKey: '' },
  alipay: { enabled: false, appId: '', privateKey: '', alipayPublicKey: '' },
  platformFeeRate: 0,
  settlementCycle: 'T+7',
});

async function loadConfig() {
  try {
    const res = await customerPaymentCall.get('/payment/tenant-config');
    if (res.config) {
      form.value = { ...form.value, ...res.config };
    }
  } catch (e) {
    ElMessage.error(e.message || '加载配置失败');
  }
}

async function saveConfig() {
  saving.value = true;
  try {
    await customerPaymentCall.put('/payment/tenant-config', form.value);
    ElMessage.success('保存成功');
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function testConnection(channel) {
  ElMessage.info('连接测试功能开发中，请保存配置后使用模拟支付验证');
}

onMounted(() => {
  loadConfig();
});
</script>

<style scoped>
.payment-config { padding: 0; }
.page-header { margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0 0 4px; }
.page-desc { font-size: 13px; color: #86909c; margin: 0; }
.card { background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.card-title { font-size: 15px; font-weight: 600; color: #1d2129; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
.title-with-icon { display: inline-flex; align-items: center; gap: 8px; }
.mode-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.mode-card { border: 2px solid #e5e6eb; border-radius: 8px; padding: 20px; cursor: pointer; transition: all 0.2s; position: relative; }
.mode-card:hover { border-color: #165dff; }
.mode-card.active { border-color: #165dff; background: rgba(22,93,255,0.03); }
.mode-icon { margin-bottom: 12px; }
.mode-name { font-size: 16px; font-weight: 600; color: #1d2129; margin-bottom: 8px; }
.mode-desc { font-size: 13px; color: #86909c; line-height: 1.6; }
.mode-tag { position: absolute; top: 12px; right: 12px; background: #165dff; color: #fff; font-size: 12px; padding: 2px 8px; border-radius: 4px; }
.unit { margin-left: 8px; color: #4e5969; }
.hint { margin-left: 12px; font-size: 12px; color: #86909c; }
.notice { margin-top: 16px; }
.save-bar { display: flex; gap: 12px; justify-content: center; }
</style>
