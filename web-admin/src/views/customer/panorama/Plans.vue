<template>
  <div>
    <PanoramaTabs />
<AppPageHeader title="方案管理" desc="为每个客户项目创建全景方案，方案下可添加多个场景">
<el-button type="primary" @click="showEdit = true"><el-icon><Plus /></el-icon>新建方案</el-button>
</AppPageHeader>
    <div class="page-card">
      <el-table :data="plans" stripe>
        <el-table-column prop="name" label="方案名称" />
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column prop="sceneCount" label="场景数" width="100" />
        <el-table-column label="操作" width="320">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="$router.push(`/apps/panorama/plans/${row.id}/scenes`)">管理场景</el-button>
            <el-button size="small" @click="edit(row)">编辑</el-button>
            <el-button size="small" @click="share(row)">分享</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-dialog v-model="showEdit" :title="editing ? '编辑方案' : '新建方案'" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="showShare" title="分享方案" width="520px">
      <template v-if="shareRow">
        <el-alert v-if="!shareRow.shareEnabled" type="warning" :closable="false" style="margin-bottom:12px;" title="方案分享未开启，请先在编辑中开启「分享」后生成海报" />
        <el-form label-width="80px">
          <el-form-item label="分享链接">
            <el-input :model-value="shareUrl" readonly>
              <template #append><el-button @click="copyShare">复制</el-button></template>
            </el-input>
          </el-form-item>
          <el-form-item label="分享海报">
            <div style="display:flex;flex-direction:column;gap:8px;">
              <el-button :loading="posterLoading" @click="genPoster">生成 / 刷新海报</el-button>
              <img v-if="posterUrl" :src="posterUrl" alt="分享海报" style="width:220px;border:1px solid #E5E6EB;border-radius:8px;" />
            </div>
          </el-form-item>
        </el-form>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import AppPageHeader from '../../../components/AppPageHeader.vue';
import { ref, reactive, onMounted } from 'vue';
import { customerApiCall } from '../../../api';
import { ElMessage, ElMessageBox } from 'element-plus';
import PanoramaTabs from '../apps/panorama/PanoramaTabs.vue';

const plans = ref([]);
const showEdit = ref(false);
const editing = ref(null);
const form = reactive({ name: '', description: '' });
const showShare = ref(false);
const shareRow = ref(null);
const shareUrl = ref('');
const posterUrl = ref('');
const posterLoading = ref(false);

async function load() {
  try { plans.value = (await customerApiCall.get('/plans')).plans || []; } catch (e) { ElMessage.error(e); }
}
function edit(row) { editing.value = row; Object.assign(form, row); showEdit.value = true; }
async function save() {
  try {
    if (editing.value) await customerApiCall.put(`/plans/${editing.value.id}`, form);
    else await customerApiCall.post('/plans', form);
    ElMessage.success('保存成功'); showEdit.value = false; load();
  } catch (e) { ElMessage.error(e); }
}
async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除方案「${row.name}」？`, '确认', { type: 'warning' });
    await customerApiCall.delete(`/plans/${row.id}`); ElMessage.success('删除成功'); load();
  } catch (e) { ElMessage.error(e); }
}
function share(row) {
  shareRow.value = row;
  shareUrl.value = row.shareEnabled && row.shareToken ? `${location.origin}/s/${row.shareToken}` : '';
  posterUrl.value = '';
  showShare.value = true;
}
async function copyShare() {
  try { await navigator.clipboard.writeText(shareUrl.value); ElMessage.success('链接已复制'); }
  catch { ElMessage.error('复制失败，请手动复制'); }
}
async function genPoster() {
  if (!shareRow.value) return;
  posterLoading.value = true;
  try {
    const { url } = await customerApiCall.post(`/plans/${shareRow.value.id}/poster`);
    posterUrl.value = url; ElMessage.success('海报已生成');
  } catch (e) { ElMessage.error(e); }
  finally { posterLoading.value = false; }
}
onMounted(load);
</script>
