<template>
  <div class="template-market">
    <!-- 统一Tab导航 -->
    <CardTabs />

    <!-- 页头 -->
    <div class="page-header">
      <div>
        <h2 class="page-title">模板市场</h2>
        <p class="page-desc">选用平台公共模板或自建品牌模板，员工创建名片时可一键应用主题</p>
      </div>
      <button class="btn-primary" @click="openCreate">自建模板</button>
    </div>

    <div class="tpl-grid" v-if="templates.length">
      <div
        class="tpl-card"
        v-for="t in templates"
        :key="t.id"
        :class="{ platform: t.tenantId === 0 }"
      >
        <div class="tpl-cover" :style="coverStyle(t)">
          <div class="tpl-cover-inner">
            <div class="tpl-avatar" :style="{ background: t.themeConfig.primary || '#165dff' }">名</div>
            <div class="tpl-name">姓名</div>
            <div class="tpl-pos">职位 · 公司</div>
          </div>
          <span class="tpl-badge" v-if="t.tenantId === 0">平台</span>
          <span class="tpl-badge mine" v-else>自建</span>
        </div>
        <div class="tpl-body">
          <div class="tpl-title">{{ t.name }}</div>
          <div class="tpl-desc">{{ t.description || (t.tenantId === 0 ? '平台提供 · 全员可用' : '本租户私有模板') }}</div>
          <div class="tpl-price-line">
            <span v-if="t.tenantId === 0" class="tpl-price" :class="Number(t.price || 0) > 0 ? 'paid' : 'free'">
              {{ Number(t.price || 0) > 0 ? `¥${Number(t.price)}` : '免费' }}
            </span>
            <el-tag v-if="t.tenantId === 0 && Number(t.price || 0) > 0 && t.purchased" size="small" type="success" effect="plain">已购买</el-tag>
          </div>
          <div class="tpl-status" :class="t.enabled ? 'on' : 'off'">{{ t.enabled ? '已启用' : '已停用' }}</div>
        </div>
        <div class="tpl-actions" v-if="t.tenantId !== 0">
          <button class="btn-text" @click="toggleEnable(t)">{{ t.enabled ? '停用' : '启用' }}</button>
          <button class="btn-text" @click="openEdit(t)">编辑</button>
          <button class="btn-text danger" @click="remove(t)">删除</button>
        </div>
        <div class="tpl-actions disabled-note" v-else>
          <span v-if="Number(t.price || 0) > 0 && !t.purchased" class="buy-wrap">
            <button v-if="isTenantAdmin" class="btn-buy" :disabled="buyingId === t.id" @click="buyTemplate(t)">{{ buyingId === t.id ? '购买中…' : '购买使用' }}</button>
            <span v-else class="use-hint">需租户管理员购买</span>
          </span>
          <span v-else class="use-hint">{{ Number(t.price || 0) > 0 ? '已购买 · 全员可用' : '免费 · 租户全员可用' }}</span>
        </div>
      </div>
    </div>
    <div class="empty" v-else>暂无可用模板，点击右上角「自建模板」创建品牌模板</div>

    <!-- 自建/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑模板' : '自建模板'"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="90px">
        <el-form-item label="模板名称" required>
          <el-input v-model="form.name" placeholder="如：企业商务蓝" maxlength="64" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="模板说明（可选）" />
        </el-form-item>
        <el-form-item label="主题色">
          <div class="color-row">
            <el-color-picker v-model="form.themeConfig.primary" />
            <span class="color-label">主色 primary</span>
          </div>
          <div class="color-row" style="margin-top:8px;">
            <el-color-picker v-model="form.themeConfig.background" />
            <span class="color-label">背景 background</span>
          </div>
          <div class="color-row" style="margin-top:8px;">
            <el-input-number v-model="form.themeConfig.radius" :min="0" :max="24" size="small" />
            <span class="color-label">圆角 radius</span>
          </div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" />
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="form.enabled" />
          <span class="enable-hint">{{ form.enabled ? '员工创建名片时可选' : '停用后员工不可选用' }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customerApiCall } from '../../../../api';
import CardTabs from './CardTabs.vue';

const isTenantAdmin = computed(() => ['tenant_admin', 'admin'].includes(JSON.parse(localStorage.getItem('customer_user') || 'null')?.role));

const templates = ref([]);
const buyingId = ref(null);
const dialogVisible = ref(false);
const isEdit = ref(false);
const saving = ref(false);
const form = ref({ name: '', description: '', themeConfig: { primary: '#165dff', background: '#f5f7fa', radius: 8 }, sortOrder: 0, enabled: true });

async function load() {
  const res = await customerApiCall.get('/card/templates');
  templates.value = res.templates || [];
}

async function buyTemplate(t) {
  if (buyingId.value) return;
  buyingId.value = t.id;
  try {
    await customerApiCall.post(`/card/templates/${t.id}/purchase`);
    ElMessage.success(`已购买「${t.name}」，租户全员可用`);
    await load();
  } catch (e) {
    ElMessage.error(e || '购买失败');
  } finally {
    buyingId.value = null;
  }
}

const coverStyle = (t) => {
  const cfg = t.themeConfig || {};
  return { background: cfg.background || '#f5f7fa', '--tpl-primary': cfg.primary || '#165dff' };
};

function openCreate() {
  isEdit.value = false;
  form.value = { name: '', description: '', themeConfig: { primary: '#165dff', background: '#f5f7fa', radius: 8 }, sortOrder: 0, enabled: true };
  dialogVisible.value = true;
}
function openEdit(t) {
  isEdit.value = true;
  form.value = { id: t.id, name: t.name, description: t.description, themeConfig: { ...t.themeConfig }, sortOrder: t.sortOrder, enabled: !!t.enabled };
  dialogVisible.value = true;
}
async function save() {
  if (!form.value.name) return ElMessage.warning('请填写模板名称');
  saving.value = true;
  try {
    const payload = { ...form.value, themeConfig: form.value.themeConfig || {} };
    if (isEdit.value) await customerApiCall.put(`/card/templates/${form.value.id}`, payload);
    else await customerApiCall.post('/card/templates', payload);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saving.value = false;
  }
}
async function toggleEnable(t) {
  try {
    await customerApiCall.put(`/card/templates/${t.id}`, { enabled: !t.enabled });
    ElMessage.success(t.enabled ? '已停用' : '已启用');
    load();
  } catch (e) {
    ElMessage.error(e || '操作失败');
  }
}
async function remove(t) {
  try {
    await ElMessageBox.confirm(`删除模板「${t.name}」？删除后员工不可再选用。`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch { return; }
  try {
    await customerApiCall.delete(`/card/templates/${t.id}`);
    ElMessage.success('已删除');
    load();
  } catch (e) {
    ElMessage.error(e || '删除失败');
  }
}

onMounted(load);
</script>

<style scoped>
.template-market { display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909c; margin: 4px 0 0; }
.btn-primary { background: #165dff; color: #fff; border: none; border-radius: 8px; padding: 9px 20px; font-size: 14px; cursor: pointer; transition: opacity 0.2s; }
.btn-primary:hover { opacity: 0.85; }

.tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.tpl-card { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); overflow: hidden; display: flex; flex-direction: column; }
.tpl-card.platform { border: 1px solid #e8f3ff; }
.tpl-cover { position: relative; height: 140px; display: flex; align-items: center; justify-content: center; }
.tpl-cover-inner { text-align: center; }
.tpl-avatar { width: 42px; height: 42px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 17px; margin: 0 auto 8px; }
.tpl-name { font-size: 14px; font-weight: 600; color: #1d2129; }
.tpl-pos { font-size: 12px; color: #86909c; margin-top: 2px; }
.tpl-badge { position: absolute; top: 10px; right: 10px; font-size: 11px; padding: 2px 10px; border-radius: 999px; background: rgba(22,93,255,0.1); color: #165dff; }
.tpl-badge.mine { background: rgba(114,46,209,0.1); color: #722ed1; }
.tpl-body { padding: 12px 16px; flex: 1; }
.tpl-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.tpl-desc { font-size: 12px; color: #86909c; margin-top: 4px; }
.tpl-status { display: inline-block; margin-top: 8px; font-size: 11px; padding: 2px 10px; border-radius: 999px; }
.tpl-status.on { background: rgba(0,180,42,0.1); color: #00b42a; }
.tpl-status.off { background: rgba(134,144,156,0.1); color: #86909c; }
.enable-hint { margin-left: 10px; font-size: 12px; color: #86909c; }
.tpl-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; border-top: 1px solid #f2f3f5; }
.tpl-price-line { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.tpl-price { display: inline-block; font-size: 13px; font-weight: 600; }
.tpl-price.free { color: #00b42a; }
.tpl-price.paid { color: #ff7d00; }
.tpl-actions.disabled-note { justify-content: center; }
.use-hint { font-size: 12px; color: #86909c; }
.btn-buy { background: #165dff; color: #fff; border: none; border-radius: 6px; padding: 6px 16px; font-size: 13px; cursor: pointer; transition: opacity 0.2s; }
.btn-buy:hover { opacity: 0.85; }
.btn-buy:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-text { background: none; border: none; color: #165dff; font-size: 13px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.btn-text:hover { background: #f2f3f5; }
.btn-text.danger { color: #f53f3f; }
.color-row { display: flex; align-items: center; gap: 10px; }
.color-label { font-size: 12px; color: #86909c; }
.empty { font-size: 13px; color: #86909c; padding: 48px 0; text-align: center; background: #fff; border-radius: 8px; }
</style>
