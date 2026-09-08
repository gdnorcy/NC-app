<template>
  <div>
    <PanoramaTabs />
<AppPageHeader :title="isEdit ? '编辑场景' : '新建场景'" desc="配置场景主图、预览图与金字塔切片，保存后自动构建预览">
<div style="display:flex;gap:8px;">
        <el-button @click="preview">预览</el-button>
        <el-button type="primary" @click="save" :loading="saving">保存</el-button>
      </div>
</AppPageHeader>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 520px;gap:16px;align-items:start;">
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
          <h3 style="margin-bottom:16px;">热点标注</h3>
          <div v-for="(h, i) in form.hotspots" :key="i" class="hotspot-item">
            <span>{{ h.type === 'scene' ? '跳转' : '信息' }}: {{ h.title || '未命名' }} ({{ h.yaw }}°, {{ h.pitch }}°)</span>
            <div>
              <el-button size="small" text @click="editHotspot(i)">编辑</el-button>
              <el-button size="small" text type="danger" @click="form.hotspots.splice(i, 1)">删除</el-button>
            </div>
          </div>
          <el-button size="small" @click="addHotspot"><el-icon><Plus /></el-icon>添加热点</el-button>
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
            <el-divider content-position="left">热点外观</el-divider>
            <el-form-item label="热点动效">
              <el-select v-model="form.meta.hotspotStyle.effect" style="width:100%;">
                <el-option label="呼吸脉冲" value="pulse" />
                <el-option label="波纹扩散" value="ripple" />
                <el-option label="无动效" value="none" />
              </el-select>
              <div class="hs-tip">跳转点显示方位箭头（指向画面中心），信息点显示 i 图标</div>
            </el-form-item>
            <el-form-item label="预设主题">
              <el-select v-model="form.meta.hotspotStyle.theme" style="width:100%;" @change="onThemeChange">
                <el-option label="默认蓝" value="blue" />
                <el-option label="商务金" value="gold" />
                <el-option label="活力橙" value="orange" />
                <el-option label="生态绿" value="green" />
              </el-select>
            </el-form-item>
            <el-form-item label="跳转点颜色">
              <el-color-picker v-model="form.meta.hotspotStyle.jumpColor" />
            </el-form-item>
            <el-form-item label="信息点颜色">
              <el-color-picker v-model="form.meta.hotspotStyle.infoColor" />
            </el-form-item>
          </el-form>
        </div>
      </div>
      <div>
        <div class="page-card">
          <h3 style="margin-bottom:16px;">全景图</h3>
          <template v-if="form.imagePath">
            <HotspotEditor :image-url="panoramaUrl" :preview-url="previewUrl" v-model="form.hotspots" @add-at="onAddHotspotAt" @select="onSelectHotspot" />
            <el-upload class="upload-area" style="margin-top:12px;" :auto-upload="false" :show-file-list="false" accept="image/*" @change="handleUpload">
              <el-button size="small">更换图片</el-button>
            </el-upload>
          </template>
          <el-upload v-else class="upload-area" :auto-upload="false" :show-file-list="false" accept="image/*" @change="handleUpload">
            <div class="upload-placeholder">
              <el-icon :size="40"><Upload /></el-icon>
              <p>点击或拖拽上传全景图</p>
              <p style="font-size:12px;color:#909399;">JPG/PNG/WebP，≤50MB</p>
            </div>
          </el-upload>
        </div>
      </div>
    </div>
    <el-dialog v-model="showHotspot" :title="hotspotIndex >= 0 ? '编辑热点' : '添加热点'" width="500px">
      <el-form :model="hotspotForm" label-width="100px">
        <el-form-item label="热点类型">
          <el-radio-group v-model="hotspotForm.type">
            <el-radio label="info">信息弹窗</el-radio>
            <el-radio label="scene">跳转场景</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="标题"><el-input v-model="hotspotForm.title" /></el-form-item>
        <el-form-item label="内容" v-if="hotspotForm.type === 'info'"><el-input v-model="hotspotForm.content" type="textarea" /></el-form-item>
        <el-form-item label="目标场景" v-if="hotspotForm.type === 'scene'">
          <el-select v-model="hotspotForm.targetSceneId" style="width:100%;">
            <el-option v-for="s in scenes" :key="s.id" :label="s.title" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="水平角度"><el-input-number v-model="hotspotForm.yaw" :min="0" :max="360" />°</el-form-item>
        <el-form-item label="垂直角度"><el-input-number v-model="hotspotForm.pitch" :min="-90" :max="90" />°</el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showHotspot = false">取消</el-button>
        <el-button type="primary" @click="saveHotspot">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import AppPageHeader from '../../../components/AppPageHeader.vue';
import HotspotEditor from '../../../components/HotspotEditor.vue';
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { customerApiCall } from '../../../api';
import PanoramaTabs from '../apps/panorama/PanoramaTabs.vue';
import { themeColors, normalizeHotspotStyle } from '../../../utils/hotspot-style';
import { ElMessage } from 'element-plus';

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => !!route.params.sceneId && route.params.sceneId !== 'new');
const panoramaUrl = computed(() => {
  if (!form.imagePath) return '';
  return form.imagePath.startsWith('http') ? form.imagePath : (location.origin + form.imagePath);
});
const previewUrl = computed(() => {
  if (!form.previewPath) return '';
  return form.previewPath.startsWith('http') ? form.previewPath : (location.origin + form.previewPath);
});
const saving = ref(false);
const scenes = ref([]);
const showHotspot = ref(false);
const hotspotIndex = ref(-1);
const hotspotForm = reactive({ type: 'info', title: '', content: '', targetSceneId: null, yaw: 0, pitch: 0 });

const form = reactive({
  title: '', description: '', imagePath: '', previewPath: '',
  sortOrder: 0, published: true, shareEnabled: false,
  hotspots: [], meta: { bgMusic: '', voiceover: '', introText: '', transition: 'fade', initialView: 'default', hotspotStyle: { effect: 'pulse', theme: 'blue', jumpColor: '#165DFF', infoColor: '#FF7D00' } },
});

onMounted(async () => {
  try { scenes.value = (await customerApiCall.get(`/plans/${route.params.id}/scenes`)).scenes || []; } catch (e) {}
  if (isEdit.value) {
    try {
      const s = scenes.value.find(x => x.id === Number(route.params.sceneId));
      if (s) {
        Object.assign(form, s, { meta: { ...form.meta, ...(s.meta || {}) }, hotspots: s.hotspots || [] });
        form.meta.hotspotStyle = normalizeHotspotStyle(form.meta.hotspotStyle);
      }
    } catch (e) { ElMessage.error(e); }
  }
});

async function handleUpload(file) {
  try {
    const fd = new FormData();
    fd.append('file', file.raw);
    const res = await customerApiCall.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    form.imagePath = res.path; form.previewPath = res.previewPath;
    ElMessage.success('上传成功');
  } catch (e) { ElMessage.error(e); }
}

function addHotspot() {
  hotspotIndex.value = -1;
  Object.assign(hotspotForm, { type: 'info', title: '', content: '', targetSceneId: null, yaw: 0, pitch: 0 });
  showHotspot.value = true;
}
// 画面点击添加：角度由 3D 编辑器自动计算
function onAddHotspotAt({ yaw, pitch }) {
  hotspotIndex.value = -1;
  Object.assign(hotspotForm, { type: 'info', title: '', content: '', targetSceneId: null, yaw, pitch });
  showHotspot.value = true;
}
// 预设主题切换：自动填充跳转/信息点颜色
function onThemeChange(theme) {
  const c = themeColors(theme);
  form.meta.hotspotStyle.jumpColor = c.jump;
  form.meta.hotspotStyle.infoColor = c.info;
}
// 点击热点标记编辑
function onSelectHotspot(h, idx) {
  editHotspot(idx);
}
function editHotspot(i) {
  hotspotIndex.value = i;
  Object.assign(hotspotForm, form.hotspots[i]);
  showHotspot.value = true;
}
function saveHotspot() {
  if (hotspotIndex.value >= 0) Object.assign(form.hotspots[hotspotIndex.value], hotspotForm);
  else form.hotspots.push({ ...hotspotForm, id: Date.now() });
  showHotspot.value = false;
}

function preview() {
  if (form.imagePath) window.open(`/?plan=${route.params.id}&scene=${form.id || ''}`, '_blank');
  else ElMessage.warning('请先上传全景图');
}

async function save() {
  if (!form.title) { ElMessage.error('请输入场景名称'); return; }
  if (!form.imagePath) { ElMessage.error('请上传全景图'); return; }
  saving.value = true;
  try {
    const payload = { ...form, planId: Number(route.params.id) };
    if (isEdit.value) await customerApiCall.put(`/scenes/${route.params.sceneId}`, payload);
    else await customerApiCall.post('/scenes', payload);
    ElMessage.success('保存成功');
    router.back();
  } catch (e) { ElMessage.error(e); }
  finally { saving.value = false; }
}
</script>

<style scoped>
.upload-area { width: 100%; }
.hs-tip { font-size: 12px; color: #86909C; line-height: 1.6; margin-top: 4px; }
.upload-placeholder { border: 2px dashed #dcdfe6; border-radius: 8px; padding: 40px 20px; text-align: center; color: #909399; cursor: pointer; }
.upload-placeholder:hover { border-color: #165DFF; color: #165DFF; }
.hotspot-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
</style>
