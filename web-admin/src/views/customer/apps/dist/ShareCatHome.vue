<template>
  <div>
    <AppPageHeader title="类目股东" desc="按行业类目分红：各行业独立分红比例与独立股东列表，一人可兼任多类目">
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
        <p class="cfg-desc">订单按买家名片行业（business_field）匹配分红池；已建类目见下方分组。</p>
      </template>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="card-head">
          <span>类目分组</span>
          <el-button type="primary" size="small" @click="openAdd('')">新建类目</el-button>
        </div>
      </template>
      <el-table :data="groups" stripe>
        <el-table-column prop="category_id" label="行业类目" min-width="160" />
        <el-table-column label="分红比例" width="120">
          <template #default="{ row }">{{ (Number(row.ratio) * 100).toFixed(1) }}%</template>
        </el-table-column>
        <el-table-column prop="member_count" label="股东数" width="100" />
        <el-table-column label="操作" width="120" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="selectGroup(row)">管理股东</el-button>
            <el-button link type="danger" @click="openAdd(row.category_id)">加股东</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template v-if="currentGroup">
        <el-divider />
        <div class="card-head mb12">
          <span>「{{ currentGroup }}」股东列表</span>
          <el-button type="primary" size="small" @click="openAdd(currentGroup)">添加股东</el-button>
        </div>
        <el-table :data="members" stripe>
          <el-table-column label="用户" min-width="180">
            <template #default="{ row }">
              <div class="user-cell">
                <el-avatar :size="28" :src="row.avatar" />
                <span>{{ row.nickname || '未命名' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="手机号" width="140" />
          <el-table-column label="权重" width="90">
            <template #default="{ row }">{{ row.weight }}</template>
          </el-table-column>
          <el-table-column label="操作" width="90" align="right">
            <template #default="{ row }">
              <el-button link type="danger" @click="remove(row)">移除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-card>

    <el-dialog v-model="addVisible" :title="addForm.categoryId ? `添加股东到「${addForm.categoryId}」` : '新建类目股东'" width="420px">
      <el-form label-width="110px">
        <el-form-item label="行业类目" required>
          <el-input v-model="addForm.categoryId" placeholder="如：制造业 / 服务业" :disabled="!!addForm.fromGroup" />
        </el-form-item>
        <el-form-item label="用户ID" required>
          <el-input v-model="addForm.userId" placeholder="平台用户 ID" />
        </el-form-item>
        <el-form-item label="类目分红比例">
          <el-input-number v-model="addForm.ratio" :min="0" :max="1" :step="0.005" :precision="3" />
          <span class="form-help">该行业订单分红池抽取比例</span>
        </el-form-item>
        <el-form-item label="权重">
          <el-input-number v-model="addForm.weight" :min="0.01" :max="100" :step="1" />
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
const groups = ref([]);
const members = ref([]);
const currentGroup = ref('');
const addVisible = ref(false);
const saving = ref(false);
const addForm = ref({ categoryId: '', fromGroup: '', userId: '', ratio: 0.05, weight: 1 });

async function load() {
  const res = await customerApiCall.get('/distribution/plugins');
  const p = res.list.find((x) => x.plugin_code === 'share-cat') || plugin.value;
  plugin.value = { ...p };
  const d = await customerApiCall.get('/distribution/share-cat');
  groups.value = d.groups || [];
  if (currentGroup.value) await loadMembers(currentGroup.value);
}
async function loadMembers(categoryId) {
  currentGroup.value = categoryId;
  const d = await customerApiCall.get(`/distribution/share-cat?categoryId=${encodeURIComponent(categoryId)}`);
  members.value = d.list || [];
}
async function savePlugin() {
  await customerApiCall.put('/distribution/plugins/share-cat', {
    install: plugin.value.is_install, enable: plugin.value.is_enable,
  });
  ElMessage.success('插件状态已保存');
}
function selectGroup(row) { loadMembers(row.category_id); }
function openAdd(categoryId) {
  addForm.value = { categoryId: categoryId || '', fromGroup: categoryId || '', userId: '', ratio: 0.05, weight: 1 };
  addVisible.value = true;
}
async function submitAdd() {
  if (!addForm.value.categoryId) return ElMessage.warning('请填写行业类目');
  if (!addForm.value.userId) return ElMessage.warning('请填写用户 ID');
  saving.value = true;
  try {
    await customerApiCall.post('/distribution/share-cat', addForm.value);
    ElMessage.success('已添加');
    addVisible.value = false;
    await load();
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}
async function remove(row) {
  await customerApiCall.delete(`/distribution/share-cat/${encodeURIComponent(row.category_id)}/${row.user_id}`);
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
.cfg-desc { margin: 8px 0 0; font-size: 12px; color: #86909c; }
.mb12 { margin-bottom: 12px; }
.form-help { margin-left: 12px; font-size: 12px; color: #86909c; }
.user-cell { display: flex; align-items: center; gap: 8px; }
</style>
