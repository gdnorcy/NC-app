<template>
  <div class="pic-list-page">
    <div class="page-toolbar">
      <div class="toolbar-title">组图列表</div>
      <div class="toolbar-ops">
        <el-button type="primary" @click="openAdd">添加图片</el-button>
        <el-button type="danger" plain :disabled="!selected.length" @click="batchDelete">批量删除</el-button>
      </div>
    </div>

    <div class="filter-bar">
      <el-select v-model="query.cateId" placeholder="全部分类" clearable style="width: 150px" @change="load">
        <el-option v-for="c in cateOptions" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-radio-group v-model="query.status" @change="load">
        <el-radio-button :value="''">全部</el-radio-button>
        <el-radio-button :value="1">上架</el-radio-button>
        <el-radio-button :value="0">下架</el-radio-button>
      </el-radio-group>
      <el-input v-model="query.keyword" placeholder="标题关键字" clearable style="width: 180px" @keyup.enter="load" />
      <el-button type="primary" plain @click="load">搜索</el-button>
    </div>

    <el-table :data="list" v-loading="loading" @selection-change="(v) => (selected = v)">
      <el-table-column type="selection" width="44" />
      <el-table-column label="排序" width="70" align="center" prop="sort_order" />
      <el-table-column label="ID" width="70" align="center" prop="id" />
      <el-table-column label="缩略图" width="90">
        <template #default="{ row }">
          <el-image v-if="row.thumb" :src="resolveUrl(row.thumb)" fit="cover" class="thumb-img" :preview-src-list="[resolveUrl(row.thumb)]" preview-teleported />
          <span v-else class="no-img">—</span>
        </template>
      </el-table-column>
      <el-table-column label="标题" min-width="200" prop="title" show-overflow-tooltip />
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '上架' : '下架' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="170" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="success" @click="openPromote(row)">推广</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑组图（基础设置 / 高级设置） -->
    <el-dialog v-model="dialog.show" :title="dialog.id ? '编辑图片' : '添加图片'" width="680px" destroy-on-close>
      <el-tabs v-model="dlgTab">
        <el-tab-pane label="基础设置" name="base">
          <el-form :model="form" label-width="110px">
            <el-form-item label="排序">
              <el-input-number v-model="form.sortOrder" :min="0" controls-position="right" style="width: 160px" />
              <span class="form-hint">数字越大越靠前</span>
            </el-form-item>
            <el-form-item label="所属分类" required>
              <el-select v-model="form.cateId" style="width: 260px" placeholder="请选择所属分类">
                <el-option v-for="c in cateOptions" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="标题" required>
              <el-input v-model="form.title" maxlength="50" placeholder="请输入标题" style="width: 360px" />
            </el-form-item>
            <el-form-item label="浏览次数">
              <el-input-number v-model="form.views" :min="0" controls-position="right" style="width: 160px" />
              <span class="form-hint">次</span>
            </el-form-item>
            <el-form-item label="展示样式" required>
              <el-radio-group v-model="form.showStyle">
                <el-radio value="one">单列大图</el-radio>
                <el-radio value="two">双列瀑布流</el-radio>
                <el-radio value="three">三列小图</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="缩略图">
              <div class="img-picker">
                <el-image v-if="form.thumb" :src="resolveUrl(form.thumb)" fit="cover" class="thumb-box" :preview-src-list="[resolveUrl(form.thumb)]" preview-teleported />
                <div v-else class="thumb-box thumb-empty" @click="openPicker('thumb')"><el-icon><Plus /></el-icon></div>
                <div class="picker-ops">
                  <el-button size="small" @click="openPicker('thumb')">选择图片</el-button>
                  <el-button v-if="form.thumb" size="small" text type="danger" @click="form.thumb = ''">移除</el-button>
                </div>
              </div>
              <div class="form-hint">建议尺寸 750*750，不超过 500kb</div>
            </el-form-item>
            <el-form-item label="组图" required>
              <div class="img-list">
                <div v-for="(img, i) in form.images" :key="i" class="img-item">
                  <el-image :src="resolveUrl(img)" fit="cover" class="img-box" :preview-src-list="form.images.map(resolveUrl)" preview-teleported />
                  <span class="img-del" @click="form.images.splice(i, 1)"><el-icon><Close /></el-icon></span>
                </div>
                <div class="img-item img-add" @click="openPicker('images')"><el-icon><Plus /></el-icon></div>
              </div>
              <div class="form-hint">建议尺寸 750x1200，不超过 500kb</div>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="高级设置" name="advanced">
          <el-form :model="form" label-width="110px">
            <el-form-item label="设为推荐">
              <el-switch v-model="form.recommend" :active-value="1" :inactive-value="0" />
            </el-form-item>
            <el-form-item label="组图背景">
              <el-switch v-model="form.blurBg" :active-value="1" :inactive-value="0" />
              <span class="form-hint">开启后以当前图片作为模糊背景</span>
            </el-form-item>
            <el-form-item label="分享积分">
              <el-switch v-model="form.sharePoints" :active-value="1" :inactive-value="0" />
              <span class="form-hint">分享后，好友点击你可获得积分</span>
            </el-form-item>
            <el-form-item label="积分数量">
              <el-input-number v-model="form.points" :min="0" controls-position="right" style="width: 160px" />
              <span class="form-hint">积分</span>
            </el-form-item>
            <el-form-item label="积分限制">
              <el-input-number v-model="form.pointsLimit" :min="0" controls-position="right" style="width: 160px" />
              <span class="form-hint">次/每天</span>
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
              <div class="form-hint">建议 5:4 比例</div>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
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
import { Plus, Close } from '@element-plus/icons-vue';
import { customerApiCall } from '../../../api';
import MaterialPicker from '../apps/design/MaterialPicker.vue';

const emit = defineEmits(['counts-updated']);

const list = ref([]);
const cateOptions = ref([]);
const loading = ref(false);
const saving = ref(false);
const selected = ref([]);
const dialog = reactive({ show: false, id: 0 });
const dlgTab = ref('base');
const picker = reactive({ show: false, target: '' });
const query = reactive({ cateId: '', status: '', keyword: '' });
const emptyForm = () => ({
  cateId: 0, title: '', sortOrder: 0, status: 1, views: 0, showStyle: 'two',
  thumb: '', images: [], recommend: 0, blurBg: 0, sharePoints: 0, points: 0, pointsLimit: 0,
  shareTitle: '', shareImg: '',
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
    const params = { page: 1, pageSize: 100 };
    if (query.cateId) params.cateId = query.cateId;
    if (query.status !== '') params.status = query.status;
    if (query.keyword) params.keyword = query.keyword;
    const res = await customerApiCall.get('/content/pics', { params });
    list.value = res.list || [];
    emit('counts-updated');
  } catch (e) {
    ElMessage.error(e || '组图加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadCates() {
  try {
    const res = await customerApiCall.get('/content/pic-cates');
    const flatten = [];
    for (const c of res.tree || []) {
      flatten.push({ id: c.id, name: c.name });
      for (const s of c.children || []) flatten.push({ id: s.id, name: `└ ${s.name}` });
    }
    cateOptions.value = flatten;
  } catch (e) { /* 分类失败不阻断 */ }
}

function openAdd() {
  Object.assign(form, emptyForm());
  dialog.id = 0;
  dlgTab.value = 'base';
  dialog.show = true;
}
function openEdit(row) {
  Object.assign(form, emptyForm(), {
    cateId: row.cate_id, title: row.title, sortOrder: row.sort_order, status: row.status,
    views: row.views, showStyle: row.show_style, thumb: row.thumb, images: JSON.parse(row.images || '[]'),
    recommend: row.recommend, blurBg: row.blur_bg, sharePoints: row.share_points,
    points: row.points, pointsLimit: row.points_limit, shareTitle: row.share_title, shareImg: row.share_img,
  });
  dialog.id = row.id;
  dlgTab.value = 'base';
  dialog.show = true;
}

function openPicker(target) {
  picker.target = target;
  picker.show = true;
}
function onPickImg(url) {
  if (!url) return;
  if (picker.target === 'thumb') form.thumb = url;
  else if (picker.target === 'images') form.images.push(url);
  else if (picker.target === 'shareImg') form.shareImg = url;
}

async function save() {
  if (!form.title.trim()) { ElMessage.warning('请输入标题'); dlgTab.value = 'base'; return; }
  if (!form.cateId) { ElMessage.warning('请选择所属分类'); dlgTab.value = 'base'; return; }
  if (!form.images.length) { ElMessage.warning('请上传组图'); dlgTab.value = 'base'; return; }
  saving.value = true;
  try {
    if (dialog.id) await customerApiCall.put(`/content/pics/${dialog.id}`, { ...form });
    else await customerApiCall.post('/content/pics', { ...form });
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
  ElMessageBox.confirm(`确定删除图片「${row.title}」吗？`, '删除确认', { type: 'warning' })
    .then(async () => {
      try {
        await customerApiCall.delete(`/content/pics/${row.id}`);
        ElMessage.success('删除成功');
        load();
      } catch (e) { ElMessage.error(e || '删除失败'); }
    })
    .catch(() => {});
}

async function batchDelete() {
  const ids = selected.value.map((r) => r.id);
  ElMessageBox.confirm(`确定删除选中的 ${ids.length} 张图片吗？`, '批量删除', { type: 'warning' })
    .then(async () => {
      try {
        await customerApiCall.post('/content/pics/batch', { ids, action: 'delete' });
        ElMessage.success('删除成功');
        load();
      } catch (e) { ElMessage.error(e || '删除失败'); }
    })
    .catch(() => {});
}

function openPromote(row) {
  ElMessage.info(`推广链接：${location.origin}/card/#/pagesReads/showPictures/showPictures?id=${row.id}&tid=${localStorage.getItem('customer_tid') || ''}`);
}

onMounted(() => { load(); loadCates(); });
</script>

<style scoped>
.page-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.toolbar-title { font-size: 16px; font-weight: 600; color: #1d2129; }
.toolbar-ops { display: flex; gap: 8px; }
.filter-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.thumb-img { width: 56px; height: 56px; border-radius: 6px; display: block; }
.no-img { color: #c9cdd4; }
.form-hint { font-size: 12px; color: #86909c; margin-left: 10px; }
.img-picker { display: flex; align-items: center; gap: 10px; }
.thumb-box { width: 72px; height: 72px; border-radius: 6px; display: block; border: 1px solid #e5e6eb; }
.thumb-empty { border: 1px dashed #c9cdd4; background: #f7f8fa; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #86909c; }
.picker-ops { display: flex; flex-direction: column; gap: 4px; }
.img-list { display: flex; gap: 8px; flex-wrap: wrap; }
.img-item { position: relative; width: 72px; height: 72px; }
.img-box { width: 72px; height: 72px; border-radius: 6px; display: block; border: 1px solid #e5e6eb; }
.img-del {
  position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; border-radius: 50%;
  background: #f53f3f; color: #fff; display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 12px;
}
.img-add {
  width: 72px; height: 72px; border: 1px dashed #c9cdd4; border-radius: 6px; background: #f7f8fa;
  display: flex; align-items: center; justify-content: center; color: #86909c; cursor: pointer;
}
</style>
