<template>
  <div class="finance-admin">
    <el-tabs v-model="tab" class="finance-tabs" @tab-change="onTabChange">
      <el-tab-pane label="支付管理" name="payment">
        <PaymentAdmin />
      </el-tab-pane>
      <el-tab-pane label="发票管理" name="invoices">
        <Invoices />
      </el-tab-pane>
      <el-tab-pane label="平台支付配置" name="platform">
        <PlatformPayConfig />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PaymentAdmin from './PaymentAdmin.vue';
import Invoices from './Invoices.vue';
import PlatformPayConfig from './PlatformPayConfig.vue';

const route = useRoute();
const router = useRouter();
const tab = ref(
  route.query.tab === 'invoices' || route.path.startsWith('/invoices')
    ? 'invoices'
    : route.query.tab === 'platform'
      ? 'platform'
      : 'payment'
);

function onTabChange(name) {
  router.replace({ path: '/finance', query: { ...route.query, tab: name } });
}
watch(() => [route.path, route.query.tab], () => {
  if (['invoices', 'payment', 'platform'].includes(route.query.tab)) {
    tab.value = route.query.tab;
  } else if (route.path.startsWith('/invoices')) {
    tab.value = 'invoices';
  }
});
</script>

<style scoped>
.finance-tabs {
  background: #fff;
  border-radius: 8px;
  padding: 8px 20px 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.finance-tabs :deep(.el-tabs__content) {
  padding-top: 0;
}
.finance-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}
</style>
