<template>
  <div class="system-settings">
    <el-tabs v-model="active" type="border-card" class="settings-tabs" @tab-change="syncHash">
      <el-tab-pane label="基础设置" name="basic"><div class="tab-body"><Basic /></div></el-tab-pane>
      <el-tab-pane label="存储设置" name="storage"><div class="tab-body"><Storage /></div></el-tab-pane>
      <el-tab-pane label="短信接口" name="sms"><div class="tab-body"><Sms /></div></el-tab-pane>
      <el-tab-pane label="支付设置" name="payment"><div class="tab-body"><Payment /></div></el-tab-pane>
      <el-tab-pane label="安全设置" name="security"><div class="tab-body"><Security /></div></el-tab-pane>
      <el-tab-pane label="开放平台" name="open"><div class="tab-body"><OpenPlatform /></div></el-tab-pane>
      <el-tab-pane label="第三方平台配置" name="component"><div class="tab-body"><WxComponentConfig /></div></el-tab-pane>
      <el-tab-pane label="平台默认配置" name="channel-defaults"><div class="tab-body"><ChannelDefaults embedded /></div></el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Basic from './Basic.vue';
import Storage from './Storage.vue';
import Sms from './Sms.vue';
import Payment from './Payment.vue';
import Security from './Security.vue';
import OpenPlatform from './OpenPlatform.vue';
import WxComponentConfig from './WxComponentConfig.vue';
import ChannelDefaults from '../channel/ChannelDefaults.vue';

const route = useRoute();
const router = useRouter();
const tabMap = {
  basic: 'basic', storage: 'storage', sms: 'sms', payment: 'payment',
  security: 'security', open: 'open', component: 'component', 'channel-defaults': 'channel-defaults',
};
const active = ref('basic');

function syncHash() {
  router.replace({ query: { ...route.query, tab: active.value } });
}

onMounted(() => {
  const t = route.query.tab;
  active.value = tabMap[t] || 'basic';
});
</script>

<style scoped>
.settings-tabs { border-radius: 8px; }
.tab-body { padding: 8px 4px; }
.tab-body :deep(.page-header) { display: none; }
</style>
