<template>
  <div class="cate-page">
    <div class="page-toolbar">
      <div class="toolbar-title">组图分类</div>
      <div class="toolbar-ops">
        <el-button type="primary" @click="openAdd">新增分类</el-button>
        <el-button type="danger" plain :disabled="!selected.length" @click="batchDelete">批量删除</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" @selection-change="(v) => (selected = v)">
      <el-table-column type="selection" width="44" />
      <el-table-column label="排序" width="70" align="center" prop="sort_order" />
      <el-table-column label="ID" width="70" align="center" prop="id" />
      <el-table-column label="分类图片" width="90">
        <template #default="{ row }">
          <el-image v-if="row.image" :src="resolveUrl(row.image)" fit="cover" class="cate-img" :preview-src-list="[resolveUrl(row.image)]" preview-teleported />
          <span v-else class="no-img">—</span>
        </template>
      </el-table-column>
      <el-table-column label="分类名称" min-width="140">
        <template #default="{ row }">
          <div>{{ row.name }}</div>
          <div v-if="row.pid !== 0" class="sub-tag">子分类</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="参数" min-width="140">
        <template #default="{ row }">
          <span class="param-text">每页{{ row.page_size }}条 · {{ plateStyleLabel(row.plate_style) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="样式" width="110" align="center">
        <template #default="{ row }">
          <el-tag size="small" type="warning" effect="plain">{{ plateStyleLabel(row.plate_style) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑（基础内容 / 样式设置 / 分享设置 / 高级设置） -->
    <el-dialog v-model="dialog.show" :title="dialog.id ? '编辑分类' : '新增分类'" width="640px" destroy-on-close>
      <el-form :model="form" label-width="110px">
        <div class="form-section">基础内容</div>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" controls-position="right" style="width: 160px" />
          <span class="form-hint">数字越大越靠前</span>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="所属分类">
          <el-select v-model="form.pid" style="width: 240px" clearable placeholder="顶级分类">
            <el-option v-for="c in topCates" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类名称" required>
          <el-input v-model="form.name" maxlength="20" placeholder="请输入分类名称" style="width: 320px" />
        </el-form-item>
        <el-form-item label="缩略图">
          <div class="img-picker">
            <el-image v-if="form.image" :src="resolveUrl(form.image)" fit="cover" class="thumb-box" :preview-src-list="[resolveUrl(form.image)]" preview-teleported />
            <div v-else class="thumb-box thumb-empty" @click="openPicker('image')"><el-icon><Plus /></el-icon></div>
            <div class="picker-ops">
              <el-button size="small" @click="openPicker('image')">选择图片</el-button>
              <el-button v-if="form.image" size="small" text type="danger" @click="form.image = ''">移除</el-button>
            </div>
          </div>
          <div class="form-hint">建议尺寸 350*350，不超过 500kb</div>
        </el-form-item>
        <el-form-item label="分类简介">
          <el-input v-model="form.intro" type="textarea" :rows="2" maxlength="100" placeholder="请输入分类简介" style="width: 420px" />
        </el-form-item>

        <div class="form-section">样式设置</div>
        <el-form-item label="列表每页数量">
          <el-input-number v-model="form.pageSize" :min="1" :max="50" controls-position="right" style="width: 160px" />
          <span class="form-hint">不填默认为 10</span>
        </el-form-item>
        <el-form-item label="列表板块样式">
          <el-radio-group v-model="form.plateStyle">
            <el-radio-button value="style1">样式一</el-radio-button>
            <el-radio-button value="style2">样式二</el-radio-button>
            <el-radio-button value="style3">样式三</el-radio-button>
            <el-radio-button value="style4">样式四</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <div class="form-section">分享设置</div>
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

        <div class="form-section">高级设置</div>
        <el-form-item label="会员浏览">
          <el-switch v-model="form.memberView" :active-value="1" :inactive-value="0" />
          <span class="form-hint">开启后必须到达指定等级（包含设置的等级）才可浏览该分类</span>
        </el-form-item>
        <el-form-item label="PC端启用">
          <el-switch v-model="form.pcEnable" :active-value="1" :inactive-value="0" />
          <span class="form-hint">启用后在 PC 官网展示该分类</span>
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
const topCates = ref([]);
const loading = ref(false);
const saving = ref(false);
const selected = ref([]);
const dialog = reactive({ show: false, id: 0 });
const picker = reactive({ show: false, target: '' });
const emptyForm = () => ({
  pid: 0, name: '', image: '', intro: '', sortOrder: 0, status: 1,
  pageSize: 10, plateStyle: 'style1', shareTitle: '', shareImg: '',
  memberView: 0, pcEnable: 1,
});
const form = reactive(emptyForm());

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function plateStyleLabel(p) {
  return ({ style1: '样式一', style2: '样式二', style3: '样式三', style4: '样式四' })[p] || p;
}

async function load() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/content/pic-cates');
    list.value = res.list || [];
    topCates.value = (res.tree || []).map((c) => ({ id: c.id, name: c.name }));
    emit('counts-updated');
  } catch (e) {
    ElMessage.error(e || '分类加载失败');
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
    pid: row.pid, name: row.name, image: row.image, intro: row.intro, sortOrder: row.sort_order,
    status: row.status, pageSize: row.page_size, plateStyle: row.plate_style,
    shareTitle: row.share_title, shareImg: row.share_img, memberView: row.member_view, pcEnable: row.pc_enable,
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
  if (picker.target === 'image') form.image = url;
  else if (picker.target === 'shareImg') form.shareImg = url;
}

async function save() {
  if (!form.name.trim()) { ElMessage.warning('请输入分类名称'); return; }
  saving.value = true;
  try {
    if (dialog.id) await customerApiCall.put(`/content/pic-cates/${dialog.id}`, { ...form });
    else await customerApiCall.post('/content/pic-cates', { ...form });
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
  ElMessageBox.confirm(`确定删除分类「${row.name}」吗？`, '删除确认', { type: 'warning' })
    .then(async () => {
      try {
        await customerApiCall.delete(`/content/pic-cates/${row.id}`);
        ElMessage.success('删除成功');
        load();
      } catch (e) { ElMessage.error(e || '删除失败'); }
    })
    .catch(() => {});
}

async function batchDelete() {
  const ids = selected.value.map((r) => r.id);
  ElMessageBox.confirm(`确定删除选中的 ${ids.length} 个分类吗？`, '批量删除', { type: 'warning' })
    .then(async () => {
      try {
        for (const id of ids) await customerApiCall.delete(`/content/pic-cates/${id}`);
        ElMessage.success('删除成功');
        load();
      } catch (e) { ElMessage.error(e || '删除失败'); }
    })
    .catch(() => {});
}

onMounted(load);
</script>

<style scoped>
.page-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.toolbar-title { font-size: 16px; font-weight: 600; color: #1d2129; }
.toolbar-ops { display: flex; gap: 8px; }
.cate-img { width: 56px; height: 56px; border-radius: 6px; display: block; }
.no-img { color: #c9cdd4; }
.sub-tag { font-size: 12px; color: #86909c; }
.param-text { font-size: 13px; color: #4e5969; }
.form-section {
  font-size: 13px; font-weight: 600; color: #165dff;
  margin: 4px 0 12px; padding: 4px 0; border-bottom: 1px solid #f2f3f5;
}
.form-section:not(:first-child) { margin-top: 16px; }
.form-hint { font-size: 12px; color: #86909c; margin-left: 10px; }
.img-picker { display: flex; align-items: center; gap: 10px; }
.thumb-box { width: 72px; height: 72px; border-radius: 6px; display: block; border: 1px solid #e5e6eb; }
.thumb-empty { border: 1px dashed #c9cdd4; background: #f7f8fa; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #86909c; }
.picker-ops { display: flex; flex-direction: column; gap: 4px; }
</style>
