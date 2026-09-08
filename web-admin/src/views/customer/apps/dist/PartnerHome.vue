<template>
  <div>
    <AppPageHeader title="合伙人分红" desc="顶层运营 / 会长 / 秘书长团队分红：支持团队流水与租户全局流水两种模式">
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
        <el-form-item label="分红模式">
          <el-radio-group v-model="config.mode" @change="saveConfig">
            <el-radio :label="1">团队流水分红（仅统计合伙人下级团队订单）</el-radio>
            <el-radio :label="2">租户全局流水分红（全租户订单参与）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="分红池抽取比例">
          <el-input-number v-model="config.poolRatio" :min="0" :max="1" :step="0.005" :precision="3" @change="saveConfig" />
          <span class="form-help">每笔订单按此比例提取分红池，再按合伙人权重分配</span>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="card-head">
          <span>合伙人列表（{{ list.length }}）</span>
          <el-button type="primary" size="small" @click="openAdd">添加合伙人</el-button>
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
        <el-table-column label="分红权重" width="100">
          <template #default="{ row }">{{ row.ratio }}</template>
        </el-table-column>
        <el-table-column label="模式" width="130">
          <template #default="{ row }">{{ row.mode === 2 ? '全局流水' : '团队流水' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="right">
          <template #default="{ row }">
            <el-button link type="danger" @click="remove(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="addVisible" title="添加合伙人" width="420px">
      <el-form label-width="110px">
        <el-form-item label="用户ID" required>
          <el-input v-model="addForm.userId" placeholder="平台用户 ID" />
        </el-form-item>
        <el-form-item label="分红权重">
          <el-input-number v-model="addForm.ratio" :min="0.01" :max="100" :step="1" />
          <span class="form-help">同一订单多合伙人按权重比例分池</span>
        </el-form-item>
        <el-form-item label="模式">
          <el-radio-group v-model="addForm.mode">
            <el-radio :label="1">团队流水</el-radio>
            <el-radio :label="2">全局流水</el-radio>
          </el-radio-group>
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
const config = ref({ mode: 1, poolRatio: 0.03 });
const list = ref([]);
const addVisible = ref(false);
const saving = ref(false);
const addForm = ref({ userId: '', ratio: 1, mode: 1 });

async function load() {
  const res = await customerApiCall.get('/distribution/plugins');
  const p = res.list.find((x) => x.plugin_code === 'partner') || plugin.value;
  plugin.value = { ...p };
  try { config.value = { ...config.value, ...JSON.parse(p.config || '{}') }; } catch {}
  const m = await customerApiCall.get('/distribution/partners');
  list.value = m.list || [];
}
async function savePlugin() {
  await customerApiCall.put('/distribution/plugins/partner', {
    install: plugin.value.is_install, enable: plugin.value.is_enable,
  });
  ElMessage.success('插件状态已保存');
}
async function saveConfig() {
  await customerApiCall.put('/distribution/plugins/partner/config', config.value);
  ElMessage.success('配置已保存');
}
function openAdd() { addForm.value = { userId: '', ratio: 1, mode: 1 }; addVisible.value = true; }
async function submitAdd() {
  if (!addForm.value.userId) return ElMessage.warning('请填写用户 ID');
  saving.value = true;
  try {
    await customerApiCall.post('/distribution/partners', addForm.value);
    ElMessage.success('已添加');
    addVisible.value = false;
    await load();
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}
async function remove(row) {
  await customerApiCall.delete(`/distribution/partners/${row.user_id}`);
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
