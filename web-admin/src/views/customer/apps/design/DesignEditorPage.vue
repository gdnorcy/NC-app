<template>
  <div class="design-editor-page">
    <div class="de-top">
      <div class="de-top-left">
        <el-button size="small" @click="goBack">← 返回设计中心</el-button>
        <span class="de-title">页面装修</span>
        <span class="de-sub">独立编辑窗口</span>
      </div>
      <div class="de-top-right">
        <template v-if="dirty">
          <span class="de-dirty-tag">● 未保存</span>
        </template>
        <el-button size="small" :loading="previewing" @click="saveAndPreview">保存并预览</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="saveDraft">保存草稿</el-button>
        <el-button size="small" type="success" :loading="publishing" @click="publish">发布</el-button>
        <el-button size="small" @click="loadVersions">历史版本</el-button>
        <el-button size="small" @click="saveAsTemplate">另存为模板</el-button>
      </div>
    </div>

    <div class="de-body">
      <!-- 最左侧垂直导航：装修页面 / 启动页 -->
      <div class="de-nav">
        <div class="de-nav-item" :class="{ active: navActive === 'edit' }" @click="switchNav('edit')" :title="'装修页面'">
          <span class="de-nav-ico">▦</span>
          <span class="de-nav-name">装修页面</span>
        </div>
        <div class="de-nav-item" :class="{ active: navActive === 'splash' }" @click="switchNav('splash')" :title="'启动页（广告页）'">
          <span class="de-nav-ico">◉</span>
          <span class="de-nav-name">启动页</span>
        </div>
      </div>

      <!-- 主区：页面装修 或 启动页配置 -->
      <div class="de-main">
        <PageEditor
          v-if="navActive === 'edit'"
          :page-type="pageType"
          @dirty-change="(v) => dirty = v"
          @page-switch="onPageSwitch"
          ref="editorRef"
        />

        <!-- 启动页配置（参考图3+图4：广告页 定时关闭/按钮进入/多图滑动） -->
        <div v-else class="de-splash">
          <div class="card">
            <div class="hp-sec-title">启动页（进入小程序前的广告页）</div>
            <div class="hp-row">
              <div class="hp-label">是否启用</div>
              <el-radio-group v-model="splash.enabled">
                <el-radio :value="true">是</el-radio>
                <el-radio :value="false">否</el-radio>
              </el-radio-group>
            </div>
            <div v-if="splash.enabled">
              <div class="hp-row">
                <div class="hp-label">页面类型</div>
                <el-radio-group v-model="splash.mode">
                  <el-radio value="single">定时关闭</el-radio>
                  <el-radio value="multi">多图滑动</el-radio>
                  <el-radio value="button">按钮进入</el-radio>
                </el-radio-group>
              </div>
              <!-- 单图：定时关闭 / 按钮进入 -->
              <div v-if="splash.mode !== 'multi'">
                <div class="hp-row">
                  <div class="hp-label">启动页图片</div>
                  <div class="splash-img-box">
                    <img v-if="splash.image" :src="resolveUrl(splash.image)" class="splash-img" />
                    <span v-else class="splash-img-empty">750 × 1130px</span>
                    <div class="splash-img-ops">
                      <el-button size="small" @click="openSplashImg('image')">上传图片</el-button>
                      <el-button v-if="splash.image" size="small" text type="danger" @click="splash.image = ''">清除</el-button>
                    </div>
                  </div>
                </div>
                <div v-if="splash.mode === 'single'" class="hp-row">
                  <div class="hp-label">定时秒数</div>
                  <el-input-number v-model="splash.duration" :min="1" :max="60" size="small" /> <span class="hp-hint">秒后自动关闭进入首页</span>
                </div>
              </div>
              <!-- 多图滑动 -->
              <div v-else>
                <div class="hp-row">
                  <div class="hp-label">启动页图片</div>
                  <div class="splash-multi">
                    <div v-for="(img, i) in splash.images" :key="i" class="splash-multi-item">
                      <img :src="resolveUrl(img)" class="splash-multi-img" />
                      <el-icon class="splash-multi-del" @click="splash.images.splice(i, 1)"><Close /></el-icon>
                    </div>
                    <div class="splash-multi-add" @click="openSplashImg('images')">+ 添加</div>
                  </div>
                </div>
              </div>
              <div class="hp-row">
                <div class="hp-label">显示类型</div>
                <el-radio-group v-model="splash.showType">
                  <el-radio value="first">仅首次</el-radio>
                  <el-radio value="every">多次</el-radio>
                </el-radio-group>
                <span class="hp-hint">{{ splash.showType === 'first' ? '仅首次进入小程序时显示' : '每次进入小程序都显示' }}</span>
              </div>
              <div class="hp-row">
                <div class="hp-label">设置链接</div>
                <el-input v-model="splash.link" size="small" placeholder="点击启动页跳转的链接，如 /pages/card/market" style="width: 320px">
                  <template #append><el-button @click="linkSel.show = true">选择</el-button></template>
                </el-input>
              </div>
            </div>
            <div class="hp-actions">
              <el-button type="primary" :loading="splashSaving" @click="saveSplash">保存设置</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 返回三选弹窗（方案A：保存并返回 / 不保存返回 / 取消） -->
    <el-dialog v-model="backDialog.show" title="页面有未保存的修改" width="420px" append-to-body :show-close="false">
      <div class="back-dialog-desc">当前页面有未保存的修改，退出前请选择处理方式：</div>
      <div class="back-dialog-actions">
        <el-button type="primary" :loading="backDialog.saving" @click="backSave">保存并返回</el-button>
        <el-button @click="backLeave">不保存返回</el-button>
        <el-button @click="backDialog.show = false">取消</el-button>
      </div>
    </el-dialog>

    <!-- 素材选择（启动页图片，照抄 eweishop/资源选择器） -->
    <MaterialPicker v-model="imgSel.show" @confirm="confirmImgSel" />
    <!-- 系统链接选择器（启动页跳转） -->
    <LinkPicker v-model="linkSel.show" :model-link="splash.link" @confirm="confirmSplashLink" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Close } from '@element-plus/icons-vue';
import { designCall } from '../../../../api';
import PageEditor from './PageEditor.vue';
import MaterialPicker from './MaterialPicker.vue';
import LinkPicker from './LinkPicker.vue';

const route = useRoute();
const router = useRouter();

const navActive = ref('edit');
const pageType = ref(route.query.pageType || 'home');
const dirty = ref(false);
const saving = ref(false);
const publishing = ref(false);
const previewing = ref(false);
const editorRef = ref(null);

// ---- 启动页（全局配置，参考图3+图4） ----
const splash = reactive({ enabled: false, mode: 'single', image: '', images: [], duration: 2, showType: 'first', link: '' });
const splashSaving = ref(false);
const imgSel = reactive({ show: false, pick: null, target: null });
const linkSel = reactive({ show: false });

async function loadGlobal() {
  try {
    const res = await designCall.get('/design/global/get');
    const cfg = res.config || {};
    Object.assign(splash, {
      enabled: false, mode: 'single', image: '', images: [], duration: 2, showType: 'first', link: '',
      ...(cfg.splash || {}),
    });
  } catch (e) { /* 忽略 */ }
}
async function saveSplash() {
  splashSaving.value = true;
  try {
    const res = await designCall.get('/design/global/get');
    const cfg = res.config || {};
    cfg.splash = { ...splash };
    await designCall.post('/design/global/save', { config: cfg });
    ElMessage.success('启动页设置已保存');
  } catch (e) { ElMessage.error(e); } finally { splashSaving.value = false; }
}
async function openSplashImg(target) {
  imgSel.target = target;
  imgSel.show = true;
}
function confirmImgSel(url) {
  if (url) {
    if (imgSel.target === 'image') splash.image = url;
    else if (imgSel.target === 'images') splash.images.push(url);
  }
  imgSel.show = false;
}
function confirmSplashLink(link) {
  if (link) splash.link = link;
  linkSel.show = false;
}

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function switchNav(k) {
  if (k === navActive.value) return;
  // 从装修页切走前检测未保存
  if (k === 'splash' && dirty.value) {
    ElMessageBox.confirm('当前页面有未保存的修改，切换后修改将丢失，是否继续？', '未保存提示', { type: 'warning', confirmButtonText: '继续切换', cancelButtonText: '取消' })
      .then(() => { navActive.value = k; })
      .catch(() => {});
    return;
  }
  navActive.value = k;
}
function onPageSwitch(type) {
  if (dirty.value) {
    ElMessageBox.confirm('当前页面有未保存的修改，切换后修改将丢失，是否继续？', '未保存提示', { type: 'warning', confirmButtonText: '继续切换', cancelButtonText: '取消' })
      .then(() => { pageType.value = type; router.replace({ path: '/design/edit', query: { pageType: type } }); })
      .catch(() => {});
    return;
  }
  pageType.value = type;
  router.replace({ path: '/design/edit', query: { pageType: type } });
}

// ---- 顶部按钮：委托给 PageEditor ----
async function saveDraft() { await editorRef.value?.saveDraft(); }
async function publish() { await editorRef.value?.publish(); }
async function saveAndPreview() { await editorRef.value?.saveAndPreview(); }
async function loadVersions() { await editorRef.value?.loadVersions(); }
async function saveAsTemplate() { await editorRef.value?.saveAsTemplate(); }

// 返回：保存状态检测（方案A：快照对比脏标记 → 三选：保存并返回 / 不保存返回 / 取消）
const backDialog = reactive({ show: false, saving: false });
let leaveConfirmed = false; // 三选弹窗已确认离开，路由守卫不再二次拦截
function goBack() {
  if (!dirty.value) { router.push('/design'); return; }
  backDialog.show = true;
}
async function backSave() {
  backDialog.saving = true;
  try {
    await saveDraft();
    backDialog.show = false;
    leaveConfirmed = true;
    router.push('/design');
  } catch (e) { ElMessage.error(e); } finally { backDialog.saving = false; }
}
function backLeave() {
  backDialog.show = false;
  leaveConfirmed = true;
  router.push('/design');
}
onBeforeRouteLeave((to, from, next) => {
  // 三选弹窗已确认（保存并返回 / 不保存返回）不再二次拦截
  if (leaveConfirmed) { next(); return; }
  if (dirty.value && to.path === '/design') {
    ElMessageBox.confirm('当前页面有未保存的修改，确定不保存直接离开吗？', '未保存提示', { type: 'warning', confirmButtonText: '直接离开', cancelButtonText: '留下' })
      .then(() => next())
      .catch(() => next(false));
    return;
  }
  next();
});

onMounted(loadGlobal);
</script>

<style scoped>
.design-editor-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f7f8fa;
  padding: 14px 20px 20px;
  box-sizing: border-box;
  overflow: hidden;
}
.de-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.de-top-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.de-title { font-size: 16px; font-weight: 600; color: #1d2129; white-space: nowrap; }
.de-sub { font-size: 12px; color: #165dff; background: #e8f3ff; border-radius: 10px; padding: 2px 10px; line-height: 18px; white-space: nowrap; }
.de-dirty-tag { font-size: 12px; color: #f53f3f; white-space: nowrap; }
.de-top-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.de-body { display: flex; gap: 12px; flex: 1; min-height: 0; }
/* 最左侧垂直导航（装修页面 / 启动页） */
.de-nav {
  width: 64px; background: #fff; border-radius: 8px; padding: 8px 6px;
  display: flex; flex-direction: column; gap: 4px; flex-shrink: 0;
}
.de-nav-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 2px; border-radius: 8px; cursor: pointer;
  color: #4e5969; font-size: 11px; transition: all .2s;
}
.de-nav-item:hover { background: #f2f3f5; color: #1d2129; }
.de-nav-item.active { background: #e8f3ff; color: #165dff; font-weight: 500; }
.de-nav-ico { font-size: 20px; line-height: 1; }
.de-main { flex: 1; min-width: 0; }

/* 启动页配置 */
.de-splash .card { background: #fff; border-radius: 8px; padding: 20px; max-width: 760px; }
.hp-sec-title { font-size: 15px; font-weight: 600; color: #1d2129; margin-bottom: 16px; display: flex; align-items: center; gap: 6px; }
.hp-sec-title::before { content: ''; width: 3px; height: 14px; border-radius: 2px; background: #165dff; }
.hp-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.hp-label { width: 88px; font-size: 13px; color: #4e5969; flex-shrink: 0; }
.hp-hint { font-size: 12px; color: #86909c; }
.hp-actions { margin-top: 8px; display: flex; justify-content: flex-end; }
.back-dialog-desc { font-size: 13px; color: #4e5969; margin-bottom: 18px; line-height: 1.6; }
.back-dialog-actions { display: flex; justify-content: flex-end; gap: 10px; }
.splash-img-box { display: flex; align-items: flex-start; gap: 12px; }
.splash-img { width: 160px; height: 240px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e6eb; }
.splash-img-empty { width: 160px; height: 240px; border: 1px dashed #c9cdd4; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #86909c; font-size: 12px; }
.splash-img-ops { display: flex; flex-direction: column; gap: 6px; }
.splash-multi { display: flex; gap: 10px; flex-wrap: wrap; }
.splash-multi-item { position: relative; width: 90px; height: 135px; border-radius: 6px; overflow: hidden; border: 1px solid #e5e6eb; }
.splash-multi-img { width: 100%; height: 100%; object-fit: cover; }
.splash-multi-del { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,.5); color: #fff; border-radius: 50%; padding: 2px; cursor: pointer; }
.splash-multi-add { width: 90px; height: 135px; border: 1px dashed #c9cdd4; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #86909c; cursor: pointer; font-size: 22px; }
.pe-sel { max-height: 360px; overflow-y: auto; }
.sel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 10px; }
.sel-item { position: relative; border: 1px solid #e5e6eb; border-radius: 6px; overflow: hidden; cursor: pointer; aspect-ratio: 1; }
.sel-item img { width: 100%; height: 100%; object-fit: cover; }
.sel-item.picked { border-color: #165dff; box-shadow: 0 0 0 2px rgba(22,93,255,.15); }
.sel-check { position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; background: #165dff; color: #fff; border-radius: 50%; font-size: 12px; display: flex; align-items: center; justify-content: center; }
</style>
