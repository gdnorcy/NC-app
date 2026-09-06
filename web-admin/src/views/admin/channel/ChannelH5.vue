<template>
  <div>
    <div class="page-header">
      <el-button @click="$router.back()"><el-icon><ArrowLeft /></el-icon>返回</el-button>
      <h2 class="page-title">{{ channelName }}管理</h2>
    </div>

    <div class="page-card">
      <el-table :data="channelList" stripe>
        <el-table-column label="客户" width="200">
          <template #default="{ row }">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:20px;">🏢</span>
              <span>{{ getCustomerName(row.customerId) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '已开通' : '已关闭' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="brandName" label="品牌名称" width="160" />
        <el-table-column prop="primaryColor" label="主题色" width="120">
          <template #default="{ row }">
            <span style="display:inline-flex;align-items:center;gap:6px;">
              <span :style="{ background: row.primaryColor, width: '16px', height: '16px', borderRadius: '4px', display: 'inline-block' }"></span>
              <code style="font-size:11px;">{{ row.primaryColor }}</code>
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="customDomain" label="自定义域名" show-overflow-tooltip />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" @click="edit(row)">配置</el-button>
            <el-button size="small" type="danger" @click="unbind(row)">解除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!channelList.length" :description="`暂无已配置的${channelName}渠道`" />
    </div>

    <!-- 配置弹窗 -->
    <el-dialog v-model="showEdit" :title="`配置${channelName}`" width="500px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="品牌名称"><el-input v-model="editForm.brandName" placeholder="留空使用客户名称" /></el-form-item>
        <el-form-item label="品牌Logo"><el-input v-model="editForm.brandLogo" placeholder="Logo图片URL" /></el-form-item>
        <el-form-item label="主题色"><el-color-picker v-model="editForm.primaryColor" /></el-form-item>
        <el-form-item label="自定义域名"><el-input v-model="editForm.customDomain" placeholder="如：vr.example.com" /></el-form-item>
        <el-form-item label="启用渠道"><el-switch v-model="editForm.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { fetchCustomers, fetchTenantChannels, updateTenantChannel, unbindTenantChannel } from '../../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const route = useRoute();
const channelType = computed(() => route.path.split('/').pop());
const channelNameMap = { h5: 'H5手机端', mp: '微信公众号', pc: 'PC网站' };
const channelName = computed(() => channelNameMap[channelType.value] || channelType.value);

const customers = ref([]);
const channelList = ref([]);
const showEdit = ref(false);
const editingCustomerId = ref(null);
const editForm = reactive({ brandName: '', brandLogo: '', primaryColor: '#165DFF', customDomain: '', enabled: true });

async function loadData() {
  try {
    const res = await fetchCustomers();
    customers.value = res.customers || [];
    const list = [];
    for (const c of customers.value) {
      const chRes = await fetchTenantChannels(c.id);
      const ch = (chRes.channels || []).find(x => x.channelType === channelType.value);
      if (ch) list.push({ ...ch, customerId: c.id });
    }
    channelList.value = list;
  } catch (e) { ElMessage.error(e); }
}

function edit(row) {
  editingCustomerId.value = row.customerId;
  Object.assign(editForm, { brandName: row.brandName, brandLogo: row.brandLogo, primaryColor: row.primaryColor, customDomain: row.customDomain, enabled: row.enabled });
  showEdit.value = true;
}

async function save() {
  try {
    await updateTenantChannel(editingCustomerId.value, channelType.value, editForm);
    ElMessage.success('保存成功');
    showEdit.value = false;
    loadData();
  } catch (e) { ElMessage.error(e); }
}

async function unbind(row) {
  try {
    await ElMessageBox.confirm(`确定解除「${getCustomerName(row.customerId)}」的${channelName}配置？`, '确认', { type: 'warning' });
    await unbindTenantChannel(row.customerId, channelType.value);
    ElMessage.success('已解除');
    loadData();
  } catch (e) { if (e !== 'cancel') ElMessage.error(e); }
}

function getCustomerName(id) {
  return customers.value.find(c => c.id === id)?.name || `客户${id}`;
}

onMounted(loadData);
</script>
