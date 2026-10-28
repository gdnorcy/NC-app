<template>
  <div class="wechat-home">
    <el-tabs v-model="activeTab" class="wt-tabs">
      <el-tab-pane label="接入设置" name="connect" />
      <el-tab-pane label="自定义菜单" name="menu" :disabled="!status.bound" />
    </el-tabs>

    <!-- ============ 接入设置 ============ -->
    <div v-if="activeTab === 'connect'" class="conn-wrap">
      <div v-if="loading" class="tip-loading">加载中…</div>

      <!-- 未绑定：提供两种接入方式 -->
      <template v-else-if="!status.bound">
        <el-alert type="info" :closable="false" show-icon title="微信公众号接入方式（二选一）"
          description="开放平台授权：在平台总后台配置好微信开放平台第三方平台后，一键授权，菜单/消息等接口自动可用；手动对接：填写公众号 AppID 与 AppSecret 直接接入（仅认证服务号可用自定义菜单）。" />

        <el-card class="conn-card" shadow="never">
          <template #header><span class="conn-title">方式一 · 开放平台授权</span></template>
          <p class="conn-desc">需平台总后台已完成「第三方平台配置」。授权后本公众号将与你的租户自动关联。</p>
          <el-button type="primary" :loading="authBusy" @click="goAuth">获取授权链接并授权</el-button>
          <p class="conn-hint">点击后将打开微信授权页，完成授权后点击下方按钮刷新状态。</p>
          <el-button link type="primary" :loading="loading" @click="loadStatus">刷新状态</el-button>
        </el-card>

        <el-card class="conn-card" shadow="never">
          <template #header><span class="conn-title">方式二 · 手动对接</span></template>
          <el-form :model="bindForm" label-width="110px" class="bind-form">
            <el-form-item label="AppID" required>
              <el-input v-model="bindForm.appid" placeholder="公众号 AppID（wx 开头）" />
            </el-form-item>
            <el-form-item label="AppSecret" required>
              <el-input v-model="bindForm.appSecret" type="password" show-password placeholder="公众号 AppSecret" />
            </el-form-item>
            <el-form-item label="账号类型">
              <el-radio-group v-model="bindForm.accountType">
                <el-radio label="service">服务号</el-radio>
                <el-radio label="subscription">订阅号</el-radio>
              </el-radio-group>
              <div class="conn-hint">系统会按接口权限自动校正；订阅号无法使用自定义菜单。</div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="bindBusy" @click="doBind">保存并绑定</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </template>

      <!-- 已绑定：展示状态 + 解绑 -->
      <el-card v-else class="conn-card" shadow="never">
        <template #header><span class="conn-title">已接入公众号</span></template>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="接入方式">
            <el-tag :type="status.bindMode === 'open' ? 'success' : 'warning'">
              {{ status.bindMode === 'open' ? '开放平台授权' : '手动对接' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="AppID">{{ status.appid }}</el-descriptions-item>
          <el-descriptions-item label="账号类型">
            <el-tag v-if="status.accountType === 'service'" type="success">服务号</el-tag>
            <el-tag v-else-if="status.accountType === 'subscription'" type="info">订阅号</el-tag>
            <span v-else>未知</span>
          </el-descriptions-item>
          <el-descriptions-item label="自定义菜单">
            <span v-if="status.accountType === 'service'">支持（认证服务号）</span>
            <span v-else class="text-warn">不支持（仅认证服务号可用）</span>
          </el-descriptions-item>
        </el-descriptions>
        <div class="conn-actions">
          <el-button type="primary" @click="activeTab = 'menu'">前往自定义菜单</el-button>
          <el-button type="danger" plain :loading="unbindBusy" @click="doUnbind">解绑公众号</el-button>
        </div>
      </el-card>
    </div>

    <!-- ============ 自定义菜单 ============ -->
    <div v-else-if="activeTab === 'menu'" class="menu-wrap">
      <el-alert v-if="!status.canMenu" type="warning" :closable="false"
        title="当前账号为订阅号或未认证服务号，微信不支持自定义菜单，仅可编辑并保存草稿。" />

      <div class="menu-toolbar">
        <span class="menu-tip">一级菜单最多 3 个，每个最多 5 个子菜单。一级名称 ≤4 字，子菜单名称 ≤8 字。</span>
        <div class="menu-ops">
          <el-button @click="loadMenu" :loading="menuLoading">拉取线上菜单</el-button>
          <el-button type="primary" @click="saveDraft" :loading="saveBusy">保存草稿</el-button>
          <el-button type="success" @click="pushMenu" :loading="pushBusy" :disabled="!status.canMenu">发布到微信</el-button>
        </div>
      </div>
      <div v-if="status.syncedAt" class="synced-tip">最近发布：{{ status.syncedAt }}</div>

      <div class="menu-editor">
        <div v-for="(b, bi) in buttons" :key="bi" class="menu-top">
          <div class="menu-top-head">
            <el-input v-model="b.name" maxlength="4" placeholder="一级菜单名" class="menu-name" />
            <el-radio-group v-model="b.hasSub" size="small" @change="onToggleSub(b)">
              <el-radio :label="false">直接动作</el-radio>
              <el-radio :label="true">含子菜单</el-radio>
            </el-radio-group>
            <el-button type="danger" link :disabled="buttons.length <= 1" @click="removeTop(bi)">删除</el-button>
          </div>

          <div v-if="!b.hasSub" class="leaf-fields">
            <el-select v-model="b.type" class="leaf-type" placeholder="动作类型">
              <el-option label="跳转网页(view)" value="view" />
              <el-option label="点击推事件(click)" value="click" />
              <el-option label="打开小程序(miniprogram)" value="miniprogram" />
            </el-select>
            <el-input v-if="b.type === 'view'" v-model="b.url" placeholder="跳转链接 URL" />
            <el-input v-else-if="b.type === 'click'" v-model="b.key" placeholder="事件 Key（如 V1001_HOME）" />
            <template v-else-if="b.type === 'miniprogram'">
              <el-input v-model="b.appid" placeholder="小程序 AppID" />
              <el-input v-model="b.url" placeholder="备用网页 URL" />
              <el-input v-model="b.pagepath" placeholder="小程序页面路径（如 pages/index/index）" />
            </template>
          </div>

          <div v-else class="sub-list">
            <div v-for="(s, si) in b.sub" :key="si" class="menu-sub">
              <el-input v-model="s.name" maxlength="8" placeholder="子菜单名" class="menu-name" />
              <el-select v-model="s.type" class="leaf-type" placeholder="动作">
                <el-option label="跳转网页(view)" value="view" />
                <el-option label="点击推事件(click)" value="click" />
                <el-option label="打开小程序(miniprogram)" value="miniprogram" />
              </el-select>
              <el-input v-if="s.type === 'view'" v-model="s.url" placeholder="URL" />
              <el-input v-else-if="s.type === 'click'" v-model="s.key" placeholder="Key" />
              <template v-else-if="s.type === 'miniprogram'">
                <el-input v-model="s.appid" placeholder="小程序 AppID" />
                <el-input v-model="s.url" placeholder="备用 URL" />
                <el-input v-model="s.pagepath" placeholder="页面路径" />
              </template>
              <el-button type="danger" link :disabled="b.sub.length <= 1" @click="b.sub.splice(si, 1)">删</el-button>
            </div>
            <el-button size="small" :disabled="b.sub.length >= 5" @click="addSub(b)">+ 添加子菜单</el-button>
          </div>
        </div>
        <el-button class="add-top" :disabled="buttons.length >= 3" @click="addTop">+ 添加一级菜单（{{ buttons.length }}/3）</el-button>
      </div>

      <el-collapse v-if="liveMenu" class="live-box">
        <el-collapse-item title="线上当前菜单（只读）" name="live">
          <pre class="live-json">{{ JSON.stringify(liveMenu, null, 2) }}</pre>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  mpStatus, mpBind, mpUnbind, mpAuthUrl, mpGetMenu, mpSaveMenu, mpPushMenu,
} from '../../api/index.js';

const activeTab = ref('connect');
const loading = ref(false);
const status = reactive({
  bound: false, canMenu: false, accountType: '', bindMode: 'none', appid: '', authStatus: '', menuSaved: false, syncedAt: null,
});

const bindForm = reactive({ appid: '', appSecret: '', accountType: 'service' });
const bindBusy = ref(false);
const authBusy = ref(false);
const unbindBusy = ref(false);

// 菜单编辑器状态
const buttons = ref([]);
const menuLoading = ref(false);
const saveBusy = ref(false);
const pushBusy = ref(false);
const liveMenu = ref(null);

function emptyLeaf() {
  return { name: '', type: 'view', key: '', url: '', appid: '', pagepath: '', sub: [] };
}

async function loadStatus() {
  loading.value = true;
  try {
    const r = await mpStatus();
    Object.assign(status, r);
  } catch (e) {
    ElMessage.error(e || '状态获取失败');
  } finally {
    loading.value = false;
  }
}

async function doBind() {
  if (!bindForm.appid || !bindForm.appSecret) return ElMessage.warning('请填写 AppID 与 AppSecret');
  bindBusy.value = true;
  try {
    const r = await mpBind({ ...bindForm });
    ElMessage.success(`绑定成功（${r.accountType === 'subscription' ? '订阅号' : '服务号'}）`);
    bindForm.appSecret = '';
    await loadStatus();
  } catch (e) {
    ElMessage.error(e || '绑定失败');
  } finally {
    bindBusy.value = false;
  }
}

async function goAuth() {
  authBusy.value = true;
  try {
    const r = await mpAuthUrl();
    window.open(r.authUrl, '_blank');
    ElMessage.info('已打开微信授权页，完成授权后点击「刷新状态」');
  } catch (e) {
    ElMessage.error(e || '获取授权链接失败');
  } finally {
    authBusy.value = false;
  }
}

async function doUnbind() {
  try {
    await ElMessageBox.confirm('解绑后将清除公众号配置与本地菜单草稿，确认？', '解绑公众号', { type: 'warning' });
  } catch { return; }
  unbindBusy.value = true;
  try {
    await mpUnbind();
    ElMessage.success('已解绑');
    buttons.value = [emptyLeaf()];
    liveMenu.value = null;
    await loadStatus();
  } catch (e) {
    ElMessage.error(e || '解绑失败');
  } finally {
    unbindBusy.value = false;
  }
}

// —— 菜单序列化 / 反序列化 ——
function serializeLeaf(x) {
  const o = { name: x.name, type: x.type };
  if (x.type === 'view') o.url = x.url;
  else if (x.type === 'click') o.key = x.key;
  else if (x.type === 'miniprogram') { o.appid = x.appid; o.url = x.url; o.pagepath = x.pagepath; }
  return o;
}
function deserLeaf(x) {
  return {
    name: x.name || '', type: x.type || 'view', key: x.key || '', url: x.url || '',
    appid: x.appid || '', pagepath: x.pagepath || '', sub: [],
  };
}
function serialize() {
  return {
    button: buttons.value.map((b) => {
      if (b.hasSub && b.sub.length) {
        return { name: b.name, sub_button: b.sub.map(serializeLeaf) };
      }
      return serializeLeaf(b);
    }),
  };
}
function deserialize(saved) {
  if (!saved || !Array.isArray(saved.button)) return [emptyLeaf()];
  return saved.button.map((b) => {
    if (b.sub_button && b.sub_button.length) {
      return { name: b.name || '', type: 'view', key: '', url: '', appid: '', pagepath: '', hasSub: true, sub: b.sub_button.map(deserLeaf) };
    }
    const leaf = deserLeaf(b);
    leaf.hasSub = false;
    return leaf;
  });
}

function addTop() { if (buttons.value.length < 3) buttons.value.push(emptyLeaf()); }
function removeTop(i) { buttons.value.splice(i, 1); }
function addSub(b) { if (b.sub.length < 5) b.sub.push(emptyLeaf()); }
function onToggleSub(b) {
  if (b.hasSub && b.sub.length === 0) b.sub.push(emptyLeaf());
}

async function loadMenu() {
  menuLoading.value = true;
  try {
    const r = await mpGetMenu();
    if (r.saved) buttons.value = deserialize(r.saved);
    liveMenu.value = r.live && !r.live.error ? r.live : (r.live?.error ? null : null);
    if (r.syncedAt) status.syncedAt = r.syncedAt;
    ElMessage.success('已拉取菜单数据');
  } catch (e) {
    ElMessage.error(e || '拉取失败');
  } finally {
    menuLoading.value = false;
  }
}

function validate() {
  for (const b of buttons.value) {
    if (!b.name) return '一级菜单名称不能为空';
    if (!b.hasSub) {
      if (!b.type) return `菜单「${b.name}」未选择动作类型`;
      if (b.type === 'view' && !b.url) return `菜单「${b.name}」缺少跳转链接`;
      if (b.type === 'click' && !b.key) return `菜单「${b.name}」缺少事件 Key`;
      if (b.type === 'miniprogram' && (!b.appid || !b.pagepath)) return `菜单「${b.name}」缺少小程序参数`;
    } else {
      if (!b.sub.length) return `菜单「${b.name}」的子菜单为空`;
      for (const s of b.sub) {
        if (!s.name) return '子菜单名称不能为空';
        if (!s.type) return `子菜单「${s.name}」未选择动作类型`;
        if (s.type === 'view' && !s.url) return `子菜单「${s.name}」缺少跳转链接`;
        if (s.type === 'click' && !s.key) return `子菜单「${s.name}」缺少事件 Key`;
        if (s.type === 'miniprogram' && (!s.appid || !s.pagepath)) return `子菜单「${s.name}」缺少小程序参数`;
      }
    }
  }
  return null;
}

async function saveDraft() {
  const err = validate();
  if (err) return ElMessage.warning(err);
  saveBusy.value = true;
  try {
    await mpSaveMenu(serialize());
    ElMessage.success('草稿已保存');
    await loadStatus();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saveBusy.value = false;
  }
}

async function pushMenu() {
  const err = validate();
  if (err) return ElMessage.warning(err);
  pushBusy.value = true;
  try {
    const r = await mpPushMenu();
    status.syncedAt = r.syncedAt;
    ElMessage.success('已发布到微信');
    await loadMenu();
  } catch (e) {
    ElMessage.error(e || '发布失败');
  } finally {
    pushBusy.value = false;
  }
}

onMounted(loadStatus);
</script>

<style scoped>
.wechat-home { padding: 4px; }
.conn-wrap { max-width: 760px; }
.conn-card { margin-top: 16px; }
.conn-title { font-weight: 600; }
.conn-desc { color: #4e5969; margin: 0 0 12px; font-size: 13px; }
.conn-hint { color: #86909c; font-size: 12px; margin: 8px 0 0; }
.bind-form { margin-top: 8px; max-width: 480px; }
.conn-actions { margin-top: 16px; display: flex; gap: 12px; }
.tip-loading { color: #86909c; padding: 40px 0; text-align: center; }
.text-warn { color: #e37318; }

.menu-wrap { max-width: 880px; }
.menu-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
.menu-tip { color: #86909c; font-size: 12px; }
.menu-ops { display: flex; gap: 8px; }
.synced-tip { color: #00b42a; font-size: 12px; margin-bottom: 8px; }
.menu-editor { border: 1px solid #e5e6eb; border-radius: 8px; padding: 16px; background: #fafbfc; }
.menu-top { border: 1px solid #e5e6eb; border-radius: 8px; padding: 12px; margin-bottom: 12px; background: #fff; }
.menu-top-head { display: flex; align-items: center; gap: 12px; }
.menu-name { width: 180px; }
.leaf-fields { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.leaf-type { width: 220px; }
.sub-list { margin-top: 10px; padding-left: 16px; border-left: 2px solid #e5e6eb; }
.menu-sub { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; flex-wrap: wrap; }
.add-top { margin-top: 4px; }
.live-box { margin-top: 16px; }
.live-json { background: #1d2129; color: #e5e6eb; padding: 12px; border-radius: 6px; font-size: 12px; overflow: auto; max-height: 320px; }
</style>
