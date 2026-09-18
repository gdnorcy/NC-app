<template>
  <div>
    <AppPageHeader title="成员与权限" desc="成员（业务身份）与角色（权限包）统一管理：成员可被授权管理，角色分配仅限租户管理员" />
    <el-tabs v-model="activeTab" class="access-tabs">
      <el-tab-pane label="成员管理" name="members">
        <Members embedded />
      </el-tab-pane>
      <el-tab-pane v-if="isTenantAdmin" label="角色管理" name="roles">
        <Roles embedded />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import AppPageHeader from '../../components/AppPageHeader.vue';
import Members from './Members.vue';
import Roles from './Roles.vue';
import { isTenantAdmin as isTenantAdminFn } from '../../utils/menuPermissions';

const route = useRoute();
const isTenantAdmin = computed(() => isTenantAdminFn(JSON.parse(localStorage.getItem('customer_user') || 'null')));
const activeTab = ref(route.query.tab === 'roles' ? 'roles' : 'members');
</script>

<style scoped>
.access-tabs {
  background: #fff;
  border-radius: 8px;
  padding: 4px 20px 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
</style>
