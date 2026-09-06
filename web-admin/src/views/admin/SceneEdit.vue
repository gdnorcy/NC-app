<template>
  <div>
    <div class="page-header">
      <div>
        <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon>返回</el-button>
        <h2 class="page-title" style="display:inline;margin-left:8px;">{{ isEdit ? '编辑场景' : '新建场景' }}</h2>
      </div>
      <el-button type="primary" @click="save" :loading="saving">保存</el-button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 400px;gap:16px;">
      <div>
        <div class="page-card">
          <h3 style="margin-bottom:16px;">基本信息</h3>
          <el-form :model="form" label-width="100px">
            <el-form-item label="场景名称" required><el-input v-model="form.title" /></el-form-item>
            <el-form-item label="描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
            <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" /></el-form-item>
            <el-form-item label="上架"><el-switch v-model="form.published" /></el-form-item>
            <el-form-item label="独立分享"><el-switch v-model="form.shareEnabled" /></el-form-item>
          </el-form>
        </div>
        <div class="page-card">
          <h3 style="margin-bottom:16px;">内容增强</h3>
          <el-form :model="form.meta" label-width="100px">
            <el-form-item label="背景音乐URL"><el-input v-model="form.meta.bgMusic" placeholder="选填" /></el-form-item>
            <el-form-item label="解说音频URL"><el-input v-model="form.meta.voiceover" placeholder="选填" /></el-form-item>
            <el-form-item label="场景介绍"><el-input v-model="form.meta.introText" type="textarea" placeholder="进入场景时显示，5秒后自动隐藏" /></el-form-item>
            <el-form-item label="切换过渡">
              <el-select v-model="form.meta.transition" style="width:100%;">
                <el-option label="无" value="none" />
                <el-option label="淡入淡出" value="fade" />
                <el-option label="滑动" value="slide" />
              </el-select>
            </el-form-item>
            <el-form-item label="初始视角">
              <el-select v-model="form.meta.initialView" style="width:100%;">
                <el-option label="默认" value="default" />
                <el-option label="北" value="north" />
                <el-option label="南" value="south" />
                <el-option label="东" value="east" />
                <el-option label="西" value="west" />
              </el-select>
            </el-form-item>
          </el-form>
        </div>
      </div>
      <div>
        <div class="page-card">
          <h3 style="margin-bottom:16px;">全景图</h3>
          <el-upload
            class="upload-area"
            :auto-upload="false"
            :show-file-list="false"
            accept="image/*"
            @change="handleUpload"
          >
            <div v-if="form.imagePath" class="preview-wrap">
              <img :src="form.previewPath || form.imagePath" style="width:100%;border-radius:8px;" />
              <p style="text-align:center;margin-top:8px;color:#909399;font-size:12px;">点击更换图片</p>
            </div>
            <div v-else class="upload-placeholder">
              <el-icon :size="40"><Upload /></el-icon>
              <p>点击或拖拽上传全景图</p>
              <p style="font-size:12px;color:#909399;">JPG/PNG/WebP，≤50MB</p>
            </div>
          </el-upload>
        </div>
        <div class="page-card">
          <h3 style="margin-bottom:16px;">热点标注</h3>
          <div v-for="(h, i) in form.hotspots" :key="i" class="hotspot-item">
            <span>{{ h.type === 'scene' ? '跳转' : '信息' }}: {{ h.title || '未命名' }} ({{ h.yaw }}°, {{ h.pitch }}°)</span>
            <el-button size="small" text type="danger" @click="form.hotspots.splice(i, 1)">删除</el-button>
          </div>
          <el-button size="small" @click="addHotspot"><el-icon><Plus /></el-icon>添加热点</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchScenes, createScene, updateScene, uploadImage } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => !!route.params.sceneId && route.params.sceneId !== 'new');
const saving = ref(false);

const form = reactive({
  title: '', description: '', imagePath: '', previewPath: '',
  sortOrder: 0, published: true, shareEnabled: false,
  hotspots: [], meta: { bgMusic: '', voiceover: '', introText: '', transition: 'fade', initialView: 'default' },
});

onMounted(async () => {
  if (isEdit.value) {
    try {
      const res = await fetchScenes();
      const s = (res.scenes || []).find(x => x.id === Number(route.params.sceneId));
      if (s) Object.assign(form, s, { meta: { ...form.meta, ...(s.meta || {}) }, hotspots: s.hotspots || [] });
    } catch (e) { ElMessage.error(e); }
  }
});

async function handleUpload(file) {
  try {
    const res = await uploadImage(file.raw);
    form.imagePath = res.path;
    form.previewPath = res.previewPath;
    ElMessage.success('上传成功');
  } catch (e) { ElMessage.error(e); }
}

function addHotspot() {
  form.hotspots.push({ id: Date.now(), type: 'info', yaw: 0, pitch: 0, title: '', content: '' });
}

async function save() {
  if (!form.title) { ElMessage.error('请输入场景名称'); return; }
  if (!form.imagePath) { ElMessage.error('请上传全景图'); return; }
  saving.value = true;
  try {
    const payload = { ...form, planId: Number(route.params.planId) };
    if (isEdit.value) await updateScene(route.params.sceneId, payload);
    else await createScene(payload);
    ElMessage.success('保存成功');
    router.back();
  } catch (e) { ElMessage.error(e); }
  finally { saving.value = false; }
}
</script>

<style scoped>
.upload-area { width: 100%; }
.upload-placeholder {
  border: 2px dashed #dcdfe6; border-radius: 8px; padding: 40px 20px;
  text-align: center; color: #909399; cursor: pointer;
}
.upload-placeholder:hover { border-color: #165DFF; color: #165DFF; }
.hotspot-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;
}
</style>
