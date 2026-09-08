<template>
  <div class="app-center">
    <!-- 左侧：应用分类 -->
    <div class="cat-sidebar">
      <div class="cat-header">
        <span class="cat-title">功能分类</span>
        <el-button text type="primary" size="small" @click="openCatDialog()">
          <el-icon :size="14"><Plus /></el-icon>新增
        </el-button>
      </div>
      <div
        v-for="cat in categories"
        :key="cat.id"
        class="cat-item"
        :class="{ active: activeCat?.id === cat.id }"
        @click="activeCat = cat"
      >
        <span class="cat-icon"><SIcon :name="cat.icon" size="small" /></span>
        <span class="cat-name">{{ cat.name }}</span>
        <span class="cat-count">{{ cat.apps.length }}</span>
        <span class="cat-ops" @click.stop>
          <el-button text size="small" @click="openCatDialog(cat)"><el-icon :size="13"><Edit /></el-icon></el-button>
          <el-button text size="small" type="danger" @click="removeCat(cat)"><el-icon :size="13"><Delete /></el-icon></el-button>
        </span>
      </div>
    </div>

    <!-- 右侧：应用卡片 -->
    <div class="app-main">
      <div class="app-main-header">
        <div class="app-main-title">
          {{ activeCat?.name || '应用中心' }}
          <span class="app-main-sub">{{ catCountText }}</span>
        </div>
        <div class="app-main-actions">
          <el-button type="primary" size="small" @click="openAppDialog()">
            <el-icon :size="14"><Plus /></el-icon>新建应用
          </el-button>
        </div>
      </div>

      <el-empty v-if="!activeCat?.apps.length" description="该分类下暂无应用" :image-size="90" />

      <div class="app-grid">
        <template v-for="(app, idx) in activeCat?.apps || []" :key="app.id">
          <!-- 全端渠道分类：直接展示各端渠道卡片（未开发渠道标注「未开发」） -->
          <template v-if="app.code === 'channel'">
            <div
              v-for="ch in PLATFORM_CHANNELS"
              :key="'ch-' + ch.value"
              class="app-card channel-card"
              :class="{ 'channel-disabled': ch.developing }"
              @click="enterChannel(ch)"
            >
              <div class="app-card-top">
                <span class="app-icon-block"><SIcon :name="ch.icon" size="xlarge" /></span>
                <div class="app-card-title">
                  <div class="app-name">{{ ch.label }}</div>
                  <div class="app-code">{{ ch.value }}</div>
                </div>
              </div>
              <div class="app-desc">{{ ch.desc }}</div>
              <div class="app-card-ops">
                <el-button v-if="!ch.developing" size="small" type="primary" plain @click.stop="enterChannel(ch)">进入管理</el-button>
                <el-tag v-else size="small" type="info" effect="plain">未开发</el-tag>
              </div>
            </div>
          </template>
          <div
            v-else
            class="app-card"
            :draggable="true"
            @dragstart="onDragStart(app, idx, $event)"
            @dragover.prevent
            @drop="onDrop(app, idx, $event)"
            @dragend="onDragEnd"
          >
            <div class="app-card-top">
              <span class="app-icon-block"><SIcon :name="app.icon" size="xlarge" /></span>
              <div class="app-card-title">
                <div class="app-name">{{ app.name }}</div>
                <div class="app-code">{{ app.code }}</div>
              </div>
              <el-tag v-if="app.code === 'channel'" size="small" type="info">渠道</el-tag>
            </div>
            <div class="app-desc">{{ app.description || '暂无描述' }}</div>
            <div class="app-card-ops">
              <el-button v-if="app.code === 'channel'" size="small" type="primary" plain @click="enterApp(app)">进入管理</el-button>
              <el-button size="small" @click="openMoveDialog(app)">修改分类</el-button>
              <el-button size="small" @click="openAppDialog(app)">编辑应用</el-button>
              <el-button size="small" text class="drag-handle" @click="onHintDrag">拖拽位置</el-button>
            </div>
          </div>
        </template>
      </div>
      <div v-if="draggingApp" class="drag-tip">拖拽卡片到目标位置释放，可调整应用顺序</div>
    </div>

    <!-- 分类弹窗 -->
    <el-dialog v-model="catDialog.visible" :title="catDialog.id ? '编辑分类' : '新增分类'" width="420px">
      <el-form :model="catDialog.form" label-width="80px">
        <el-form-item label="分类名称"><el-input v-model="catDialog.form.name" placeholder="如：行业应用" /></el-form-item>
        <el-form-item label="分类图标">
          <div class="icon-picker">
            <span
              v-for="ic in iconOptions"
              :key="ic"
              class="icon-opt"
              :class="{ active: catDialog.form.icon === ic }"
              @click="catDialog.form.icon = ic"
            ><SIcon :name="ic" size="default" /></span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="catDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveCat">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑应用弹窗 -->
    <el-dialog v-model="appDialog.visible" :title="appDialog.id ? '编辑应用' : '新建应用'" width="480px">
      <el-form :model="appDialog.form" label-width="80px">
        <el-form-item label="应用名称"><el-input v-model="appDialog.form.name" placeholder="如：智能名片" /></el-form-item>
        <el-form-item label="应用编码"><el-input v-model="appDialog.form.code" :disabled="!!appDialog.id" placeholder="如：card（新建后不可改）" /></el-form-item>
        <el-form-item label="应用描述"><el-input v-model="appDialog.form.description" type="textarea" :rows="2" placeholder="一句话说明应用能力" /></el-form-item>
        <el-form-item label="应用图标">
          <div class="icon-picker">
            <span
              v-for="ic in iconOptions"
              :key="ic"
              class="icon-opt"
              :class="{ active: appDialog.form.icon === ic }"
              @click="appDialog.form.icon = ic"
            ><SIcon :name="ic" size="default" /></span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="appDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveApp">保存</el-button>
      </template>
    </el-dialog>

    <!-- 修改分类弹窗 -->
    <el-dialog v-model="moveDialog.visible" title="修改应用分类" width="420px">
      <el-form label-width="80px">
        <el-form-item label="应用"><span class="move-app-name">{{ moveDialog.app?.name }}</span></el-form-item>
        <el-form-item label="目标分类">
          <el-select v-model="moveDialog.target" style="width:100%;" placeholder="选择分类">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.name" :disabled="c.name === activeCat?.name" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="moveDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveMove">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi } from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete } from '@element-plus/icons-vue';
import SIcon from '../../components/SIcon.vue';

const router = useRouter();

// 平台各端渠道（已开通在前、未开发在后；未开发渠道标注「未开发」不可进入）
const PLATFORM_CHANNELS = [
  { value: 'mini', label: '微信小程序', icon: 'wechat', desc: '客户独立AppID，第三方平台代开发', developing: false },
  { value: 'h5', label: 'H5手机端', icon: 'mobile', desc: '/mobile路径，支持独立域名', developing: false },
  { value: 'mp', label: '微信公众号', icon: 'official', desc: 'OAuth授权 + H5嵌入', developing: false },
  { value: 'pc', label: 'PC网站', icon: 'pc', desc: '独立域名，PC适配', developing: false },
  { value: 'baidu', label: '百度小程序', icon: 'mobile', desc: '百度智能小程序，开发中', developing: true },
  { value: 'ali', label: '支付宝小程序', icon: 'mobile', desc: '支付宝小程序，开发中', developing: true },
  { value: 'qq', label: 'QQ小程序', icon: 'mobile', desc: 'QQ小程序，开发中', developing: true },
  { value: 'tt', label: '字节跳动小程序', icon: 'mobile', desc: '抖音/头条小程序，开发中', developing: true },
];

const catCountText = computed(() => {
  const list = activeCat.value?.apps || [];
  if (list.some(a => a.code === 'channel')) return `共 ${PLATFORM_CHANNELS.length} 个渠道`;
  return `共 ${list.length} 个应用`;
});
const categories = ref([]);
const activeCat = ref(null);
const draggingApp = ref(null);

const iconOptions = [
  'apps', 'panorama', 'card', 'channel', 'devices', 'solutions', 'settings', 'storage',
  'sms', 'wallet', 'key', 'analytics', 'customer', 'team', 'building', 'user',
  'market', 'pool', 'radar', 'dynamic', 'chart', 'template', 'logs', 'badge',
];

const catDialog = reactive({ visible: false, id: null, form: { name: '', icon: 'apps' } });
const appDialog = reactive({ visible: false, id: null, form: { name: '', code: '', description: '', icon: 'apps' } });
const moveDialog = reactive({ visible: false, app: null, target: '' });

async function load() {
  try {
    const res = await adminApi.get('/apps-center');
    categories.value = res.categories || [];
    if (!activeCat.value || !categories.value.some((c) => c.id === activeCat.value.id)) {
      activeCat.value = categories.value[0] || null;
    } else {
      activeCat.value = categories.value.find((c) => c.id === activeCat.value.id);
    }
  } catch (e) { ElMessage.error(e); }
}

function openCatDialog(cat) {
  catDialog.id = cat?.id || null;
  catDialog.form = { name: cat?.name || '', icon: cat?.icon || 'apps' };
  catDialog.visible = true;
}
async function saveCat() {
  if (!catDialog.form.name.trim()) return ElMessage.warning('请输入分类名称');
  try {
    if (catDialog.id) await adminApi.put(`/apps-center/categories/${catDialog.id}`, catDialog.form);
    else await adminApi.post('/apps-center/categories', catDialog.form);
    ElMessage.success('保存成功');
    catDialog.visible = false;
    load();
  } catch (e) { ElMessage.error(e); }
}
async function removeCat(cat) {
  if (cat.name === '默认分类') return ElMessage.warning('默认分类不可删除');
  try {
    await ElMessageBox.confirm(`确定删除分类「${cat.name}」？`, '删除确认', { type: 'warning' });
    await adminApi.delete(`/apps-center/categories/${cat.id}`);
    ElMessage.success('已删除');
    load();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e === 'cancel' ? '' : e);
  }
}

function openAppDialog(app) {
  appDialog.id = app?.id || null;
  appDialog.form = { name: app?.name || '', code: app?.code || '', description: app?.description || '', icon: app?.icon || 'apps' };
  appDialog.visible = true;
}
async function saveApp() {
  const f = appDialog.form;
  if (!f.name.trim()) return ElMessage.warning('请输入应用名称');
  try {
    if (appDialog.id) {
      await adminApi.put(`/apps-center/apps/${appDialog.id}`, { name: f.name, description: f.description, icon: f.icon });
    } else {
      // 新建应用：写入 apps 表并归入当前分类
      await adminApi.post('/apps-center/apps', { code: f.code.trim(), name: f.name.trim(), description: f.description, icon: f.icon, category: activeCat.value?.name });
    }
    ElMessage.success('保存成功');
    appDialog.visible = false;
    load();
  } catch (e) { ElMessage.error(e); }
}

function enterApp(app) {
  const map = { channel: '/channel' };
  if (map[app.code]) router.push(map[app.code]);
}
function enterChannel(ch) {
  if (ch.developing) return;
  router.push(`/channel/${ch.value}`);
}
function openMoveDialog(app) {
  moveDialog.app = app;
  moveDialog.target = '';
  moveDialog.visible = true;
}
async function saveMove() {
  if (!moveDialog.target) return ElMessage.warning('请选择目标分类');
  try {
    await adminApi.put(`/apps-center/apps/${moveDialog.app.id}/category`, { category: moveDialog.target });
    ElMessage.success('已移动');
    moveDialog.visible = false;
    load();
  } catch (e) { ElMessage.error(e); }
}

function onDragStart(app, idx, e) {
  draggingApp.value = { app, fromIdx: idx, fromCat: activeCat.value?.name };
  e.dataTransfer.effectAllowed = 'move';
}
function onHintDrag() {
  ElMessage.info('直接按住卡片拖动到目标位置释放，即可调整顺序');
}
function onDrop(app, idx, e) {
  e.preventDefault();
  if (!draggingApp.value || draggingApp.value.fromCat !== activeCat.value?.name) return;
  const from = draggingApp.value.fromIdx;
  const to = idx;
  if (from === to) return;
  const list = [...(activeCat.value?.apps || [])];
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  activeCat.value.apps = list;
  draggingApp.value = null;
  persistSort();
}
function onDragEnd() {
  draggingApp.value = null;
}
async function persistSort() {
  try {
    const ids = (activeCat.value?.apps || []).map((a) => a.id);
    await adminApi.put('/apps-center/sort', { category: activeCat.value?.name, ids });
    ElMessage.success('顺序已保存');
  } catch (e) { ElMessage.error(e); }
}

onMounted(load);
</script>

<style scoped>
.app-center { display: flex; gap: 16px; align-items: flex-start; }
.cat-sidebar {
  width: 200px; background: #fff; border-radius: 8px; padding: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06); flex-shrink: 0;
}
.cat-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px 12px; border-bottom: 1px solid #f0f0f0; margin-bottom: 6px;
}
.cat-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.cat-item {
  display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 10px;
  border-radius: 8px; cursor: pointer; color: #4e5969; margin-bottom: 2px; position: relative;
}
.cat-item:hover { background: #f2f3f5; }
.cat-item.active { background: #e8f3ff; color: #165dff; font-weight: 500; }
.cat-icon { display: flex; }
.cat-name { flex: 1; font-size: 13px; }
.cat-count { font-size: 11px; color: #86909c; }
.cat-ops { display: none; position: absolute; right: 4px; background: inherit; }
.cat-item:hover .cat-ops { display: flex; }

.app-main { flex: 1; background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); min-width: 0; }
.app-main-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.app-main-title { font-size: 16px; font-weight: 600; color: #1d2129; }
.app-main-sub { font-size: 12px; color: #86909c; margin-left: 8px; font-weight: 400; }
.app-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
.app-card {
  background: #fff; border: 1px solid #e5e6eb; border-radius: 8px; padding: 16px;
  cursor: pointer; transition: all 0.2s; position: relative;
}
.app-card:hover { border-color: #165dff; box-shadow: 0 4px 16px rgba(22,93,255,0.10); }
.app-card-top { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.app-icon-block {
  width: 56px; height: 56px; border-radius: 14px; background: rgba(22,93,255,0.06);
  display: flex; align-items: center; justify-content: center; color: #4e5969; flex-shrink: 0;
  transition: all 0.2s;
}
.app-card:hover .app-icon-block { background: rgba(22,93,255,0.12); color: #165dff; }
.app-card-title { min-width: 0; }
.app-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.app-code { font-size: 12px; color: #86909c; margin-top: 2px; }
.app-desc {
  font-size: 12px; color: #86909c; line-height: 1.5; min-height: 36px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  align-items: center;
}
.channel-card { cursor: pointer; }
.channel-card:hover { border-color: rgba(22, 93, 255, 0.4); box-shadow: 0 4px 16px rgba(22, 93, 255, 0.08); }
.channel-disabled { cursor: not-allowed; opacity: 0.6; }
.channel-disabled:hover { border-color: #e5e6eb; box-shadow: none; }
.app-card-ops {
  display: flex; gap: 4px; border-top: 1px solid #f0f0f0; padding-top: 10px; margin-top: 10px;
}
.app-card-ops .el-button { margin-left: 0; }
.drag-handle { cursor: grab; color: #86909c; }
.drag-tip { margin-top: 12px; font-size: 12px; color: #165dff; }
.move-app-name { font-size: 13px; color: #1d2129; }
.icon-picker { display: flex; flex-wrap: wrap; gap: 8px; }
.icon-opt {
  width: 36px; height: 36px; border-radius: 8px; border: 1px solid #e5e6eb;
  display: flex; align-items: center; justify-content: center; color: #4e5969; cursor: pointer;
}
.icon-opt.active { border-color: #165dff; background: #e8f3ff; color: #165dff; }
</style>
