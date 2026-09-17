<template>
  <div class="video-page">
    <div class="page-toolbar">
      <div class="toolbar-title">视频列表</div>
      <div class="toolbar-ops">
        <el-button type="primary" @click="openAdd">添加短视频</el-button>
        <el-button type="danger" plain :disabled="!selected.length" @click="batchOffline">批量下线</el-button>
      </div>
    </div>

    <div class="filter-bar">
      <el-radio-group v-model="query.online" @change="load">
        <el-radio-button :value="1">已上线</el-radio-button>
        <el-radio-button :value="0">未上线</el-radio-button>
      </el-radio-group>
      <el-input v-model="query.keyword" placeholder="视频标题关键字" clearable style="width: 180px" @keyup.enter="load" />
      <el-button type="primary" plain @click="load">搜索</el-button>
    </div>

    <el-table :data="list" v-loading="loading" @selection-change="(v) => (selected = v)">
      <el-table-column type="selection" width="44" />
      <el-table-column label="排序" width="70" align="center" prop="sort_order" />
      <el-table-column label="ID" width="70" align="center" prop="id" />
      <el-table-column label="封面图" width="100">
        <template #default="{ row }">
          <el-image v-if="row.cover" :src="resolveUrl(row.cover)" fit="cover" class="cover-img" :preview-src-list="[resolveUrl(row.cover)]" preview-teleported />
          <span v-else class="no-img">—</span>
        </template>
      </el-table-column>
      <el-table-column label="标题" min-width="200" prop="title" show-overflow-tooltip />
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="发布人" width="140">
        <template #default="{ row }">
          <span v-if="row.publisher" class="publisher">{{ row.publisher }}</span>
          <span v-else class="no-img">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑短视频 -->
    <el-dialog v-model="dialog.show" :title="dialog.id ? '编辑短视频' : '添加短视频'" width="620px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" controls-position="right" style="width: 160px" />
          <span class="form-hint">数字越大越靠前</span>
        </el-form-item>
        <el-form-item label="视频标题" required>
          <el-input v-model="form.title" maxlength="50" placeholder="请输入视频标题" style="width: 360px" />
        </el-form-item>
        <el-form-item label="封面图" required>
          <div class="img-picker">
            <el-image v-if="form.cover" :src="resolveUrl(form.cover)" fit="cover" class="thumb-box" :preview-src-list="[resolveUrl(form.cover)]" preview-teleported />
            <div v-else class="thumb-box thumb-empty" @click="openPicker('cover')"><el-icon><Plus /></el-icon></div>
            <div class="picker-ops">
              <el-button size="small" @click="openPicker('cover')">选择图片</el-button>
              <el-button v-if="form.cover" size="small" text type="danger" @click="form.cover = ''">移除</el-button>
            </div>
          </div>
          <div class="form-hint">建议尺寸 600x500，不超过 100kb</div>
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="form.intro" type="textarea" :rows="2" maxlength="200" placeholder="请输入简介" style="width: 420px" />
        </el-form-item>
        <el-form-item label="视频地址" required>
          <el-input v-model="form.videoUrl" placeholder="选择视频（腾讯视频/抖音/mp4，上传小于50M）" style="width: 420px" />
        </el-form-item>
        <el-form-item label="设为推荐">
          <el-switch v-model="form.recommend" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="浏览次数">
          <el-input-number v-model="form.views" :min="0" controls-position="right" style="width: 160px" />
          <span class="form-hint">次</span>
        </el-form-item>
        <el-form-item label="点赞量">
          <el-input-number v-model="form.likes" :min="0" controls-position="right" style="width: 160px" />
        </el-form-item>
        <el-form-item label="转发量">
          <el-input-number v-model="form.shares" :min="0" controls-position="right" style="width: 160px" />
        </el-form-item>
        <el-form-item label="分享标题">
          <el-input v-model="form.shareTitle" maxlength="30" placeholder="分享给好友时展示的标题" style="width: 320px" />
        </el-form-item>
        <el-form-item label="分享图">
          <div class="img-picker">
            <el-image v-if="form.shareImg" :src="resolveUrl(form.shareImg)" fit="cover" class="thumb-box" :preview-src-list="[resolveUrl(form.shareImg)]" preview-teleported />
            <div v-else class="thumb-box thumb-empty" @click="openPicker('shareImg')"><el-icon><Plus /></el-icon></div>
            <el-button size="small" @click="openPicker('shareImg')">选择图片</el-button>
            <el-button v-if="form.shareImg" size="small" text type="danger" @click="form.shareImg = ''">移除</el-button>
          </div>
          <div class="form-hint">建议 5:4 比例，不超过 100kb</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.show = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">确定</el-button>
      </template>
    </el-dialog>

    <MaterialPicker v-model="picker.show" @confirm="onPickImg" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { customerApiCall } from '../../../api';
import MaterialPicker from '../apps/design/MaterialPicker.vue';

const emit = defineEmits(['counts-updated']);

const list = ref([]);
const loading = ref(false);
const saving = ref(false);
const selected = ref([]);
const dialog = reactive({ show: false, id: 0 });
const picker = reactive({ show: false, target: '' });
const query = reactive({ online: 1, keyword: '' });
const emptyForm = () => ({
  status: 1, sortOrder: 0, title: '', cover: '', intro: '', videoUrl: '',
  recommend: 0, views: 0, likes: 0, shares: 0, shareTitle: '', shareImg: '',
});
const form = reactive(emptyForm());

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}

async function load() {
  loading.value = true;
  try {
    const params = { page: 1, pageSize: 100, online: query.online };
    if (query.keyword) params.keyword = query.keyword;
    const res = await customerApiCall.get('/content/videos', { params });
    list.value = res.list || [];
    emit('counts-updated');
  } catch (e) {
    ElMessage.error(e || '视频加载失败');
  } finally {
    loading.value = false;
  }
}

function openAdd() {
  Object.assign(form, emptyForm());
  dialog.id = 0;
  dialog.show = true;
}
function openEdit(row) {
  Object.assign(form, emptyForm(), {
    status: row.status, sortOrder: row.sort_order, title: row.title, cover: row.cover,
    intro: row.intro, videoUrl: row.video_url, recommend: row.recommend, views: row.views,
    likes: row.likes, shares: row.shares, shareTitle: row.share_title, shareImg: row.share_img,
  });
  dialog.id = row.id;
  dialog.show = true;
}

function openPicker(target) {
  picker.target = target;
  picker.show = true;
}
function onPickImg(url) {
  if (!url) return;
  if (picker.target === 'cover') form.cover = url;
  else if (picker.target === 'shareImg') form.shareImg = url;
}

async function save() {
  if (!form.title.trim()) { ElMessage.warning('请输入视频标题'); return; }
  if (!form.cover) { ElMessage.warning('请上传封面图'); return; }
  if (!form.videoUrl.trim()) { ElMessage.warning('请输入视频地址'); return; }
  saving.value = true;
  try {
    if (dialog.id) await customerApiCall.put(`/content/videos/${dialog.id}`, { ...form });
    else await customerApiCall.post('/content/videos', { ...form });
    ElMessage.success('保存成功');
    dialog.show = false;
    load();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saving.value = false;
  }
}

function remove(row) {
  ElMessageBox.confirm(`确定删除视频「${row.title}」吗？`, '删除确认', { type: 'warning' })
    .then(async () => {
      try {
        await customerApiCall.delete(`/content/videos/${row.id}`);
        ElMessage.success('删除成功');
        load();
      } catch (e) { ElMessage.error(e || '删除失败'); }
    })
    .catch(() => {});
}

async function batchOffline() {
  const ids = selected.value.map((r) => r.id);
  ElMessageBox.confirm(`确定将选中的 ${ids.length} 个视频下线吗？`, '批量下线', { type: 'warning' })
    .then(async () => {
      try {
        await customerApiCall.post('/content/videos/batch', { ids, action: 'offline' });
        ElMessage.success('操作成功');
        load();
      } catch (e) { ElMessage.error(e || '操作失败'); }
    })
    .catch(() => {});
}

onMounted(load);
</script>

<style scoped>
.page-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.toolbar-title { font-size: 16px; font-weight: 600; color: #1d2129; }
.toolbar-ops { display: flex; gap: 8px; }
.filter-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.cover-img { width: 72px; height: 60px; border-radius: 6px; display: block; object-fit: cover; }
.no-img { color: #c9cdd4; }
.publisher { font-size: 13px; color: #4e5969; }
.form-hint { font-size: 12px; color: #86909c; margin-left: 10px; }
.img-picker { display: flex; align-items: center; gap: 10px; }
.thumb-box { width: 72px; height: 72px; border-radius: 6px; display: block; border: 1px solid #e5e6eb; }
.thumb-empty { border: 1px dashed #c9cdd4; background: #f7f8fa; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #86909c; }
.picker-ops { display: flex; flex-direction: column; gap: 4px; }
</style>
