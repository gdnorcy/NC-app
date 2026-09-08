<template>
  <div class="form-collect-page">
    <CardTabs />

    <!-- 列表视图 -->
    <template v-if="!editing">
<AppPageHeader title="线索收集" desc="名片页表单与全景热点留资的统一线索汇总" />
      <el-tabs v-model="tab" class="lead-tabs">
        <el-tab-pane label="名片表单" name="forms">
          <div class="tab-toolbar">
            <span class="tab-desc">名片页展示的表单，访客填写后线索自动回流到客户列表</span>
            <el-button type="primary" @click="startCreate">
              <SIcon name="template" size="small" color="#fff" />
              新建表单
            </el-button>
          </div>
          <div class="content-card">
            <div v-if="forms.length === 0" class="empty-state">
              <SIcon name="template" size="xlarge" color="#c9cdd4" />
              <p>还没有表单，点击右上角「新建表单」创建第一个线索收集表单</p>
            </div>
            <el-table v-else :data="forms" style="width: 100%">
              <el-table-column label="表单" min-width="220">
                <template #default="{ row }">
                  <div class="f-title">{{ row.title }}</div>
                  <div class="f-desc">{{ row.description || '—' }}</div>
                </template>
              </el-table-column>
              <el-table-column label="字段" width="90">
                <template #default="{ row }">{{ (row.fields || []).length }} 个</template>
              </el-table-column>
              <el-table-column label="挂载" width="120">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.cardId ? '' : 'info'">{{ row.cardId ? '指定名片' : '全平台' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="提交数" width="90">
                <template #default="{ row }">
                  <el-button link type="primary" @click="viewSubmissions(row)">{{ row.submissionCount ?? 0 }}</el-button>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <el-switch :model-value="row.status === 'active'" @change="(v) => toggleForm(row, v)" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="140">
                <template #default="{ row }">
                  <el-button link type="primary" @click="startEdit(row)">编辑</el-button>
                  <el-button link type="danger" @click="removeForm(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
        <el-tab-pane label="全景留资" name="panorama">
          <div class="tab-toolbar">
            <span class="tab-desc">访客通过全景热点留资表单提交的线索，可筛选方案并导出 CSV</span>
            <el-select v-model="panoPlanId" placeholder="全部方案" clearable style="width:180px;" @change="loadPano">
              <el-option v-for="p in panoPlans" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
            <el-button @click="exportCsv">导出 CSV</el-button>
          </div>
          <div class="content-card">
            <el-table :data="panoLeads" stripe>
              <el-table-column prop="id" label="ID" width="70" />
              <el-table-column prop="plan_name" label="方案" width="140" show-overflow-tooltip />
              <el-table-column prop="scene_name" label="场景" width="140" show-overflow-tooltip />
              <el-table-column prop="hotspot_title" label="热点" width="140" show-overflow-tooltip />
              <el-table-column prop="name" label="姓名" width="120" />
              <el-table-column prop="phone" label="手机号" width="140" />
              <el-table-column prop="message" label="留言" show-overflow-tooltip />
              <el-table-column label="自定义字段" width="140">
                <template #default="{ row }">
                  <span v-if="extraList(row).length">{{ extraList(row).map(([k, v]) => `${k}:${v}`).join('; ') }}</span>
                  <span v-else style="color:#86909C;">—</span>
                </template>
              </el-table-column>
              <el-table-column prop="created_at" label="提交时间" width="170" />
            </el-table>
            <div v-if="!panoLeads.length" class="empty-state">
              <SIcon name="template" size="xlarge" color="#c9cdd4" />
              <p>暂无留资线索。请在 360全景 → 场景编辑中为热点开启「留资表单」后，访客提交即可在这里查看。</p>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>

    <!-- 新建/编辑整页表单 -->
    <template v-else>
<AppPageHeader :title="editId ? '编辑表单' : '新建表单'" desc="配置表单标题与字段，保存后名片页即时展示">
<div>
          <el-button @click="editing = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
        </div>
</AppPageHeader>

      <div class="content-card form-edit">
        <el-form label-width="110px">
          <el-form-item label="表单标题" required>
            <el-input v-model="draft.title" placeholder="例如：预约咨询 / 商务合作意向" maxlength="40" />
          </el-form-item>
          <el-form-item label="表单说明">
            <el-input v-model="draft.description" type="textarea" :rows="2" placeholder="展示在表单顶部，引导访客填写" />
          </el-form-item>
          <el-form-item label="挂载名片">
            <el-select v-model="draft.cardId" clearable placeholder="默认全平台展示（选择名片则仅该名片展示）" style="width: 320px">
              <el-option v-for="c in cards" :key="c.id" :label="`${c.name}（${c.position || '—'}）`" :value="c.id" />
            </el-select>
          </el-form-item>

          <el-divider content-position="left">表单字段</el-divider>
          <div v-for="(f, idx) in draft.fields" :key="idx" class="field-row">
            <el-input v-model="f.name" placeholder="字段名（如 name/phone）" style="width: 160px" />
            <el-input v-model="f.label" placeholder="显示标签（如 姓名/电话）" style="width: 160px" />
            <el-select v-model="f.type" style="width: 120px">
              <el-option label="文本" value="text" />
              <el-option label="电话" value="tel" />
              <el-option label="多行" value="textarea" />
              <el-option label="选择" value="select" />
            </el-select>
            <el-input v-if="f.type === 'select'" v-model="f.optionsText" placeholder="选项，逗号分隔" style="width: 200px" />
            <el-input v-else v-model="f.placeholder" placeholder="占位提示" style="width: 160px" />
            <el-checkbox v-model="f.required">必填</el-checkbox>
            <el-button link type="danger" @click="draft.fields.splice(idx, 1)">
              <SIcon name="users" size="small" color="#f53f3f" />
              删除
            </el-button>
          </div>
          <el-button plain @click="addField">
            <SIcon name="dynamic" size="small" />
            添加字段
          </el-button>
        </el-form>
      </div>
    </template>

    <!-- 提交记录抽屉 -->
    <el-drawer v-model="drawer.show" :title="`提交记录（${drawer.form?.title || ''}）`" size="560px">
      <div v-if="drawer.items.length === 0" class="empty-state">
        <SIcon name="template" size="xlarge" color="#c9cdd4" />
        <p>暂无提交记录</p>
      </div>
      <div v-for="s in drawer.items" :key="s.id" class="sub-item">
        <div class="sub-time">{{ s.submittedAt }}</div>
        <div class="sub-data">
          <div v-for="(v, k) in JSON.parse(s.data || '{}')" :key="k" class="sub-line">
            <span class="sub-k">{{ k }}：</span><span class="sub-v">{{ v }}</span>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../../components/SIcon.vue';
import { publicApi, customerApiCall } from '../../../../api';
import CardTabs from './CardTabs.vue';

const forms = ref([]);
const cards = ref([]);
const editing = ref(false);
const editId = ref(null);
const saving = ref(false);
const draft = ref({ title: '', description: '', cardId: null, fields: [] });
const drawer = ref({ show: false, form: null, items: [] });
const tab = ref('forms');
// 全景留资线索
const panoPlans = ref([]);
const panoPlanId = ref('');
const panoLeads = ref([]);

const extraList = (row) => {
  try { return Object.entries(JSON.parse(row.extra || '{}')); } catch { return []; }
};

async function loadPano() {
  try {
    const q = panoPlanId.value ? `?planId=${panoPlanId.value}` : '';
    const [ps, ls] = await Promise.all([
      customerApiCall.get('/plans'),
      customerApiCall.get(`/panorama/leads${q}`),
    ]);
    panoPlans.value = ps.plans || [];
    panoLeads.value = ls.leads || [];
  } catch (e) { ElMessage.error(e); }
}

function exportCsv() {
  window.open(`/api/customer/panorama/leads?export=csv${panoPlanId.value ? `&planId=${panoPlanId.value}` : ''}`, '_blank');
}

async function load() {
  try {
    const res = await publicApi.get('/card-market/forms');
    forms.value = res.forms;
    const c = await publicApi.get('/card-market/cards');
    cards.value = c.cards || [];
  } catch (e) { ElMessage.error(e || '加载失败'); }
}

function startCreate() {
  editId.value = null;
  draft.value = { title: '', description: '', cardId: null, fields: [] };
  addField();
  editing.value = true;
}
function startEdit(row) {
  editId.value = row.id;
  draft.value = {
    title: row.title,
    description: row.description || '',
    cardId: row.cardId || null,
    fields: (row.fields || []).map((f) => ({ ...f, optionsText: (f.options || []).join(',') })),
  };
  if (draft.value.fields.length === 0) addField();
  editing.value = true;
}
function addField() {
  draft.value.fields.push({ name: '', label: '', type: 'text', required: false, placeholder: '', optionsText: '' });
}
function fieldsToPayload() {
  return draft.value.fields
    .filter((f) => f.name && f.label)
    .map((f) => ({
      name: f.name.trim(),
      label: f.label.trim(),
      type: f.type,
      required: !!f.required,
      placeholder: f.placeholder || '',
      options: f.type === 'select' ? (f.optionsText || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [],
    }));
}
async function saveForm() {
  if (!draft.value.title.trim()) { ElMessage.warning('请填写表单标题'); return; }
  if (fieldsToPayload().length === 0) { ElMessage.warning('请至少配置一个完整字段'); return; }
  saving.value = true;
  try {
    if (editId.value) {
      const res = await publicApi.get(`/card-market/forms/${editId.value}/submissions`);
      if (res.submissions?.length) { ElMessage.warning('已有提交记录的表单暂不支持修改，请新建表单'); return; }
      await publicApi.put(`/card-market/forms/${editId.value}`, {
        title: draft.value.title, description: draft.value.description, fields: fieldsToPayload(),
      });
    } else {
      await publicApi.post('/card-market/forms', {
        title: draft.value.title, description: draft.value.description, cardId: draft.value.cardId || undefined, fields: fieldsToPayload(),
      });
    }
    ElMessage.success('已保存');
    editing.value = false;
    load();
  } catch (e) { ElMessage.error(e || '保存失败'); } finally { saving.value = false; }
}

async function toggleForm(row, on) {
  try {
    await publicApi.put(`/card-market/forms/${row.id}`, { status: on ? 'active' : 'disabled' });
    ElMessage.success(on ? '已启用' : '已停用');
    load();
  } catch (e) { ElMessage.error(e || '操作失败'); }
}
async function removeForm(row) {
  try {
    await ElMessageBox.confirm(`确认删除表单「${row.title}」？提交记录将一并删除。`, '删除确认', { type: 'warning' });
  } catch { return; }
  try {
    await publicApi.delete(`/card-market/forms/${row.id}`);
    ElMessage.success('已删除');
    load();
  } catch (e) { ElMessage.error(e || '删除失败'); }
}
async function viewSubmissions(row) {
  drawer.value = { show: true, form: row, items: [] };
  try {
    const res = await publicApi.get(`/card-market/forms/${row.id}/submissions`);
    drawer.value.items = res.submissions || [];
  } catch (e) { ElMessage.error(e || '加载失败'); }
}

onMounted(() => { load(); loadPano(); });
</script>

<style scoped>
.lead-tabs { margin-top: 16px; }
.tab-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.tab-desc { font-size: 13px; color: #86909c; }
.content-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04); }
.f-title { font-size: 14px; font-weight: 500; color: #1d2129; }
.f-desc { font-size: 12px; color: #86909c; margin-top: 4px; }
.empty-state { text-align: center; padding: 48px 0; color: #86909c; font-size: 13px; }
.empty-state p { margin-top: 12px; }
.form-edit { max-width: 860px; }
.field-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.sub-item { border: 1px solid #f2f3f5; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; }
.sub-time { font-size: 12px; color: #86909c; margin-bottom: 8px; }
.sub-line { font-size: 13px; color: #1d2129; line-height: 1.8; }
.sub-k { color: #86909c; }
</style>
