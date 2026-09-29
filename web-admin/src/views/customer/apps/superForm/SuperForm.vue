<template>
  <div v-if="!editing" class="sf-list">
    <el-tabs v-model="tab">
      <el-tab-pane label="表单列表" name="forms">
        <div class="sf-toolbar">
          <el-button type="primary" @click="addForm">+ 添加表单</el-button>
        </div>
        <el-table :data="forms" border stripe v-loading="loading">
          <el-table-column prop="name" label="表单名称" min-width="160" />
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="row.status === 'published' ? 'success' : row.status === 'disabled' ? 'info' : 'warning'">
                {{ { draft: '草稿', published: '已发布', disabled: '已停用' }[row.status] || row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="submissionCount" label="提交数" width="90" />
          <el-table-column prop="createdAt" label="创建时间" min-width="170" />
          <el-table-column label="操作" min-width="260">
            <template #default="{ row }">
              <el-button link type="primary" @click="editForm(row)">编辑</el-button>
              <el-button link type="primary" @click="openInfo(row)">信息列表</el-button>
              <el-button v-if="row.status !== 'published'" link type="success" @click="setStatus(row, 'published')">发布</el-button>
              <el-button v-if="row.status === 'published'" link type="warning" @click="setStatus(row, 'disabled')">停用</el-button>
              <el-button link type="danger" @click="removeForm(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="信息列表" name="info">
        <div class="sf-toolbar">
          <el-select v-model="infoFormId" placeholder="选择表单" style="width: 260px" @change="loadSubmissions">
            <el-option v-for="f in forms" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
          <el-button :disabled="!infoFormId" @click="loadSubmissions">刷新</el-button>
        </div>
        <el-table v-if="infoFormId" :data="submissions" border stripe v-loading="infoLoading">
          <el-table-column type="index" label="#" width="60" />
          <el-table-column prop="createdAt" label="提交时间" min-width="170" />
          <el-table-column label="提交内容" min-width="420">
            <template #default="{ row }">
              <div v-for="(val, k) in row.data" :key="k" class="sf-info-row">
                <span class="sf-info-k">{{ k }}</span>
                <span class="sf-info-v">{{ formatVal(val) }}</span>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="请选择表单查看提交信息" />
      </el-tab-pane>
    </el-tabs>
  </div>

  <SuperFormDesigner v-else :form-id="editing.id" :form-name="editing.name" @close="onDesignerClose" />
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  fetchSuperForms, createSuperForm, getSuperForm, updateSuperForm, deleteSuperForm,
  fetchSuperFormSubmissions,
} from '../../../../api/index.js';
import SuperFormDesigner from './SuperFormDesigner.vue';

const tab = ref('forms');
const forms = ref([]);
const loading = ref(false);
const editing = ref(null);

const infoFormId = ref(null);
const submissions = ref([]);
const infoLoading = ref(false);

async function loadForms() {
  loading.value = true;
  try {
    const { forms: list } = await fetchSuperForms();
    forms.value = list || [];
  } catch (e) { ElMessage.error(e.message || '加载失败'); }
  finally { loading.value = false; }
}

async function addForm() {
  try {
    const { id } = await createSuperForm({ name: '未命名表单', config: { components: [], settings: { basic: { name: '未命名表单' } } } });
    editing.value = { id, name: '未命名表单' };
  } catch (e) { ElMessage.error(e.message || '创建失败'); }
}

async function editForm(row) {
  editing.value = { id: row.id, name: row.name };
}

async function setStatus(row, status) {
  try {
    await updateSuperForm(row.id, { status });
    ElMessage.success(status === 'published' ? '已发布' : '已停用');
    loadForms();
  } catch (e) { ElMessage.error(e.message || '操作失败'); }
}

async function removeForm(row) {
  try {
    await ElMessageBox.confirm(`确认删除表单「${row.name}」及其全部提交记录？`, '提示', { type: 'warning' });
  } catch { return; }
  try {
    await deleteSuperForm(row.id);
    ElMessage.success('已删除');
    loadForms();
  } catch (e) { ElMessage.error(e.message || '删除失败'); }
}

async function openInfo(row) {
  tab.value = 'info';
  infoFormId.value = row.id;
  await loadSubmissions();
}

async function loadSubmissions() {
  if (!infoFormId.value) { submissions.value = []; return; }
  infoLoading.value = true;
  try {
    const { submissions: list } = await fetchSuperFormSubmissions(infoFormId.value);
    submissions.value = list || [];
  } catch (e) { ElMessage.error(e.message || '加载失败'); }
  finally { infoLoading.value = false; }
}

function formatVal(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join('、');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function onDesignerClose() { editing.value = null; loadForms(); }

onMounted(loadForms);
</script>

<style scoped>
.sf-toolbar { margin-bottom: 14px; display: flex; gap: 10px; align-items: center; }
.sf-info-row { line-height: 22px; font-size: 13px; }
.sf-info-k { color: #909399; margin-right: 8px; }
.sf-info-v { color: #303133; }
</style>
