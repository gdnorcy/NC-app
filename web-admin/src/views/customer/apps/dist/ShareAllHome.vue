<template>
  <div>
    <AppPageHeader title="全民股东" desc="全站付费订单池式分红：均等分配或按权重分配">
      <div class="hd-actions">
        <el-tag v-if="plugin.is_enable" type="success">已启用</el-tag>
        <el-tag v-else type="info">已停用</el-tag>
      </div>
    </AppPageHeader>

    <el-card shadow="never" class="mb16">
      <template #header>
        <div class="card-head">
          <span>插件开关</span>
          <div class="switches">
            <span class="sw-item">
              安装：<el-switch v-model="plugin.is_install" @change="savePlugin" />
            </span>
            <span class="sw-item">
              启用：<el-switch v-model="plugin.is_enable" :disabled="!plugin.is_install" @change="savePlugin" />
            </span>
          </div>
        </div>
      </template>
      <el-form :model="config" label-width="140px" label-position="right" class="cfg-form">
        <el-form-item label="分配方式">
          <el-radio-group v-model="config.mode" @change="saveConfig">
            <el-radio :label="1">均等分配</el-radio>
            <el-radio :label="2">权重分配（按股东权重比例）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="分红池抽取比例">
          <el-input-number v-model="config.poolRatio" :min="0" :max="1" :step="0.005" :precision="3" @change="saveConfig" />
          <span class="form-help">每笔订单按此比例提取全站分红池</span>
        </el-form-item>
        <el-form-item label="股东资格门槛">
          <el-switch v-model="config.requireDist" @change="saveConfig" />
          <span class="form-help">开启后仅分销商可成为股东</span>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="card-head">
          <span>股东列表（{{ list.length }}）</span>
          <el-button type="primary" size="small" @click="openAdd">添加股东</el-button>
        </div>
      </template>
      <el-table :data="list" stripe>
        <el-table-column label="用户" min-width="180">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :size="28" :src="row.avatar" />
              <span>{{ row.nickname || '未命名' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column prop="identity_type" label="身份" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.identity_type === 'employee' ? 'primary' : 'success'">
              {{ row.identity_type === 'employee' ? '企业员工' : '入驻个人' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="权重" width="90">
          <template #default="{ row }">{{ row.weight }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="right">
          <template #default="{ row }">
            <el-button link type="danger" @click="remove(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="addVisible" title="添加全民股东" width="420px">
      <el-form label-width="110px">
        <el-form-item label="用户ID" required>
          <el-input v-model="addForm.userId" placeholder="平台用户 ID" />
        </el-form-item>
        <el-form-item label="权重">
          <el-input-number v-model="addForm.weight" :min="0.01" :max="100" :step="1" />
          <span class="form-help">权重分配模式生效</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitAdd">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { customerApiCall } from '../../../../api';
import AppPageHeader from '../../../../components/AppPageHeader.vue';

const plugin = ref({ is_install: 0, is_enable: 0 });
const config = ref({ mode: 1, poolRatio: 0.02, requireDist: 0 });
const list = ref([]);
const addVisible = ref(false);
const saving = ref(false);
const addForm = ref({ userId: '', weight: 1 });

async function load() {
  const res = await customerApiCall.get('/distribution/plugins');
  const p = res.list.find((x) => x.plugin_code === 'share-all') || plugin.value;
  plugin.value = { ...p };
  try { config.value = { ...config.value, ...JSON.parse(p.config || '{}') }; } catch {}
  const m = await customerApiCall.get('/distribution/share-all');
  list.value = m.list || [];
}
async function savePlugin() {
  await customerApiCall.put('/distribution/plugins/share-all', {
    install: plugin.value.is_install, enable: plugin.value.is_enable,
  });
  ElMessage.success('插件状态已保存');
}
async function saveConfig() {
  await customerApiCall.put('/distribution/plugins/share-all/config', config.value);
  ElMessage.success('配置已保存');
}
function openAdd() { addForm.value = { userId: '', weight: 1 }; addVisible.value = true; }
async function submitAdd() {
  if (!addForm.value.userId) return ElMessage.warning('请填写用户 ID');
  saving.value = true;
  try {
    await customerApiCall.post('/distribution/share-all', addForm.value);
    ElMessage.success('已添加');
    addVisible.value = false;
    await load();
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}
async function remove(row) {
  await customerApiCall.delete(`/distribution/share-all/${row.user_id}`);
  ElMessage.success('已移除（历史收益保留）');
  await load();
}
onMounted(load);
</script>

<style scoped>
.mb16 { margin-bottom: 16px; }
.hd-actions { display: flex; gap: 12px; align-items: center; }
.card-head { display: flex; justify-content: space-between; align-items: center; }
.switches { display: flex; gap: 16px; align-items: center; }
.sw-item { font-size: 13px; color: #4e5969; }
.cfg-form { max-width: 720px; padding-top: 8px; }
.form-help { margin-left: 12px; font-size: 12px; color: #86909c; }
.user-cell { display: flex; align-items: center; gap: 8px; }
</style>
