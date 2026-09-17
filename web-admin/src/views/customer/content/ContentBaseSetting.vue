<template>
  <div class="base-setting-page">
    <div class="page-toolbar">
      <div class="toolbar-title">基础设置</div>
      <div class="toolbar-ops">
        <el-button type="primary" :loading="saving" @click="save">确定</el-button>
      </div>
    </div>

    <el-form :model="form" label-width="130px" class="base-form">
      <div class="form-section">全部文章</div>
      <el-form-item label="分享标题">
        <el-input v-model="form.articleShareTitle" maxlength="30" placeholder="文章分享给好友时展示的标题" style="width: 360px" />
      </el-form-item>
      <el-form-item label="分享图">
        <div class="img-picker">
          <el-image v-if="form.articleShareImg" :src="resolveUrl(form.articleShareImg)" fit="cover" class="thumb-box" :preview-src-list="[resolveUrl(form.articleShareImg)]" preview-teleported />
          <div v-else class="thumb-box thumb-empty" @click="openPicker('articleShareImg')"><el-icon><Plus /></el-icon></div>
          <div class="picker-ops">
            <el-button size="small" @click="openPicker('articleShareImg')">选择图片</el-button>
            <el-button v-if="form.articleShareImg" size="small" text type="danger" @click="form.articleShareImg = ''">移除</el-button>
          </div>
        </div>
        <div class="form-hint">建议 5:4 比例，不超过 100kb</div>
      </el-form-item>

      <div class="form-section">全部组图</div>
      <el-form-item label="分享标题">
        <el-input v-model="form.picShareTitle" maxlength="30" placeholder="组图分享给好友时展示的标题" style="width: 360px" />
      </el-form-item>
      <el-form-item label="分享图">
        <div class="img-picker">
          <el-image v-if="form.picShareImg" :src="resolveUrl(form.picShareImg)" fit="cover" class="thumb-box" :preview-src-list="[resolveUrl(form.picShareImg)]" preview-teleported />
          <div v-else class="thumb-box thumb-empty" @click="openPicker('picShareImg')"><el-icon><Plus /></el-icon></div>
          <div class="picker-ops">
            <el-button size="small" @click="openPicker('picShareImg')">选择图片</el-button>
            <el-button v-if="form.picShareImg" size="small" text type="danger" @click="form.picShareImg = ''">移除</el-button>
          </div>
        </div>
        <div class="form-hint">建议 5:4 比例，不超过 100kb</div>
      </el-form-item>
    </el-form>

    <MaterialPicker v-model="picker.show" @confirm="onPickImg" />
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { customerApiCall } from '../../../api';
import MaterialPicker from '../apps/design/MaterialPicker.vue';

const saving = ref(false);
const picker = reactive({ show: false, target: '' });
const form = reactive({ articleShareTitle: '', articleShareImg: '', picShareTitle: '', picShareImg: '' });

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}

async function load() {
  try {
    const res = await customerApiCall.get('/content/settings');
    Object.assign(form, {
      articleShareTitle: res.article_share_title || '',
      articleShareImg: res.article_share_img || '',
      picShareTitle: res.pic_share_title || '',
      picShareImg: res.pic_share_img || '',
    });
  } catch (e) {
    ElMessage.error(e || '设置加载失败');
  }
}

function openPicker(target) {
  picker.target = target;
  picker.show = true;
}
function onPickImg(url) {
  if (!url) return;
  if (picker.target === 'articleShareImg') form.articleShareImg = url;
  else if (picker.target === 'picShareImg') form.picShareImg = url;
}

async function save() {
  saving.value = true;
  try {
    await customerApiCall.put('/content/settings', { ...form });
    ElMessage.success('保存成功');
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.page-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.toolbar-title { font-size: 16px; font-weight: 600; color: #1d2129; }
.base-form { max-width: 720px; }
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
