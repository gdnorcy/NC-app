<template>
  <div class="template-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">名片模板</h2>
        <p class="page-desc">平台公共模板库：为客户提供统一品牌模板，支持启停与主题配置</p>
      </div>
      <button class="btn-primary" @click="openCreate">新建模板</button>
    </div>

    <div class="tpl-grid" v-if="templates.length">
      <div class="tpl-card" v-for="t in templates" :key="t.id">
        <div class="tpl-cover" :style="coverStyle(t)">
          <div class="tpl-cover-inner">
            <div class="tpl-avatar" :style="{ background: t.themeConfig.primary || '#165dff' }">名</div>
            <div class="tpl-name">姓名</div>
            <div class="tpl-pos">职位 · 公司</div>
          </div>
          <span class="tpl-status" :class="t.enabled ? 'on' : 'off'">{{ t.enabled ? '已启用' : '已停用' }}</span>
        </div>
        <div class="tpl-body">
          <div class="tpl-title">{{ t.name }}</div>
          <div class="tpl-desc">{{ t.description || '—' }}</div>
          <div class="tpl-price" :class="Number(t.price || 0) > 0 ? 'paid' : 'free'">
            {{ Number(t.price || 0) > 0 ? `¥${Number(t.price)}` : '免费' }}
            <span v-if="Number(t.price || 0) > 0" class="paid-hint">客户需购买</span>
          </div>
          <div class="tpl-theme" v-if="Object.keys(t.themeConfig || {}).length">
            <span class="theme-item" v-for="(v, k) in t.themeConfig" :key="k">
              <i class="color-dot" :style="{ background: isColor(v) ? v : '#e5e6eb' }"></i>{{ k }}
            </span>
          </div>
        </div>
        <div class="tpl-actions">
          <button class="btn-text" @click="openEdit(t)">编辑</button>
          <button class="btn-text danger" @click="toggleEnable(t)">{{ t.enabled ? '停用' : '启用' }}</button>
        </div>
      </div>
    </div>
    <div class="empty" v-else>暂无平台模板，点击右上角「新建模板」创建</div>

    <!-- 编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑模板' : '新建模板'"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="90px">
        <el-form-item label="模板名称" required>
          <el-input v-model="form.name" placeholder="如：商务蓝" maxlength="64" />
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
        <el-form-item label="价格">
          <el-input-number v-model="form.price" :min="0" :precision="2" size="small" style="width: 160px" />
          <span class="color-label" style="margin-left:8px;">0 元为免费模板，>0 元客户端按需购买</span>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" />
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
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi } from '../../api';

const templates = ref([]);
const dialogVisible = ref(false);
const isEdit = ref(false);
const saving = ref(false);
const form = ref({ name: '', description: '', themeConfig: { primary: '#165dff', background: '#f5f7fa', radius: 8 }, price: 0, sortOrder: 0 });

async function load() {
  const res = await adminApi.get('/card/templates');
  templates.value = res.templates || [];
}

const coverStyle = (t) => {
  const cfg = t.themeConfig || {};
  return {
    background: cfg.background || '#f5f7fa',
    '--tpl-primary': cfg.primary || '#165dff',
  };
};
const isColor = (v) => typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);

function openCreate() {
  isEdit.value = false;
  form.value = { name: '', description: '', themeConfig: { primary: '#165dff', background: '#f5f7fa', radius: 8 }, sortOrder: 0 };
  dialogVisible.value = true;
}
function openEdit(t) {
  isEdit.value = true;
  form.value = {
    id: t.id,
    name: t.name,
    description: t.description,
    themeConfig: { ...t.themeConfig },
    sortOrder: t.sortOrder,
  };
  dialogVisible.value = true;
}
async function save() {
  if (!form.value.name) return ElMessage.warning('请填写模板名称');
  saving.value = true;
  try {
    const payload = { ...form.value, themeConfig: form.value.themeConfig || {} };
    if (isEdit.value) await adminApi.put(`/card/templates/${form.value.id}`, payload);
    else await adminApi.post('/card/templates', payload);
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
    await adminApi.put(`/card/templates/${t.id}`, { enabled: !t.enabled });
    ElMessage.success(t.enabled ? '已停用' : '已启用');
    load();
  } catch (e) {
    ElMessage.error(e || '操作失败');
  }
}

onMounted(load);
</script>

<style scoped>
.template-page { display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909c; margin: 4px 0 0; }
.btn-primary { background: #165dff; color: #fff; border: none; border-radius: 8px; padding: 9px 20px; font-size: 14px; cursor: pointer; transition: opacity 0.2s; }
.btn-primary:hover { opacity: 0.85; }

.tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.tpl-card { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); overflow: hidden; display: flex; flex-direction: column; }
.tpl-cover { position: relative; height: 150px; display: flex; align-items: center; justify-content: center; }
.tpl-cover-inner { text-align: center; color: var(--tpl-primary); }
.tpl-avatar { width: 44px; height: 44px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; margin: 0 auto 8px; }
.tpl-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.tpl-pos { font-size: 12px; color: #86909c; margin-top: 2px; }
.tpl-status { position: absolute; top: 10px; right: 10px; font-size: 11px; padding: 2px 10px; border-radius: 999px; }
.tpl-status.on { background: rgba(0,180,42,0.1); color: #00b42a; }
.tpl-status.off { background: rgba(134,144,156,0.1); color: #86909c; }
.tpl-body { padding: 14px 16px; flex: 1; }
.tpl-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.tpl-desc { font-size: 12px; color: #86909c; margin-top: 4px; min-height: 32px; }
.tpl-theme { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.theme-item { font-size: 11px; color: #4e5969; background: #f7f8fa; border-radius: 4px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px; }
.color-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.tpl-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; border-top: 1px solid #f2f3f5; }
.btn-text { background: none; border: none; color: #165dff; font-size: 13px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.btn-text:hover { background: #f2f3f5; }
.btn-text.danger { color: #f53f3f; }
.color-row { display: flex; align-items: center; gap: 10px; }
.color-label { font-size: 12px; color: #86909c; }
.empty { font-size: 13px; color: #86909c; padding: 48px 0; text-align: center; background: #fff; border-radius: 8px; }
</style>
