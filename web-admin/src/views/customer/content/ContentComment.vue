<template>
  <div class="comment-page">
    <div class="page-toolbar">
      <div class="toolbar-title">文章评论</div>
      <div class="toolbar-ops">
        <el-button type="danger" plain :disabled="!selected.length" @click="batchDelete">批量删除</el-button>
      </div>
    </div>

    <div class="filter-bar">
      <el-select v-model="query.type" style="width: 140px" @change="load">
        <el-option label="全部类型" value="" />
        <el-option label="文章" value="article" />
        <el-option label="视频" value="video" />
        <el-option label="音频" value="audio" />
      </el-select>
      <el-input v-model="query.keyword" placeholder="评论内容关键字" clearable style="width: 180px" @keyup.enter="load" />
      <el-button type="primary" plain @click="load">搜索</el-button>
    </div>

    <el-table :data="list" v-loading="loading" @selection-change="(v) => (selected = v)">
      <el-table-column type="selection" width="44" />
      <el-table-column label="ID" width="70" prop="id" />
      <el-table-column label="文章ID" width="80" prop="article_id" />
      <el-table-column label="文章标题" min-width="200" prop="article_title" show-overflow-tooltip />
      <el-table-column label="文章类型" width="90" align="center">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ typeLabel(row.article_type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="评论内容" min-width="220" prop="content" show-overflow-tooltip />
      <el-table-column label="评论时间" width="160" prop="created_at" />
      <el-table-column label="是否审核" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.audit === 1 ? 'success' : 'warning'" size="small">{{ row.audit === 1 ? '已审核' : '待审核' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" align="center" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.audit !== 1" link type="success" @click="audit(row, 1)">通过</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="query.page"
      :page-size="20"
      :total="total"
      layout="total, prev, pager, next"
      class="pager"
      @current-change="load"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customerApiCall } from '../../../api';

const list = ref([]);
const total = ref(0);
const loading = ref(false);
const selected = ref([]);
const query = reactive({ type: '', keyword: '', page: 1 });

function typeLabel(t) { return { article: '文章', video: '视频', audio: '音频' }[t] || t; }

async function load() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/content/comments', {
      params: { page: query.page, pageSize: 20, type: query.type || undefined, keyword: query.keyword || undefined },
    });
    list.value = res.list || [];
    total.value = res.total || 0;
  } catch (e) {
    ElMessage.error(e || '评论加载失败');
  } finally {
    loading.value = false;
  }
}

async function audit(row, v) {
  try {
    await customerApiCall.put(`/content/comments/${row.id}`, { audit: v });
    ElMessage.success('操作成功');
    load();
  } catch (e) { ElMessage.error(e || '操作失败'); }
}

function remove(row) {
  ElMessageBox.confirm('确定删除该评论吗？', '删除确认', { type: 'warning' })
    .then(async () => {
      try {
        await customerApiCall.delete(`/content/comments/${row.id}`);
        ElMessage.success('删除成功');
        load();
      } catch (e) { ElMessage.error(e || '删除失败'); }
    })
    .catch(() => {});
}

async function batchDelete() {
  const ids = selected.value.map((r) => r.id);
  ElMessageBox.confirm(`确定删除选中的 ${ids.length} 条评论吗？`, '批量删除', { type: 'warning' })
    .then(async () => {
      try {
        await customerApiCall.post('/content/comments/batch', { ids, action: 'delete' });
        ElMessage.success('删除成功');
        load();
      } catch (e) { ElMessage.error(e || '删除失败'); }
    })
    .catch(() => {});
}

onMounted(load);
</script>

<style scoped>
.page-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.toolbar-title { font-size: 16px; font-weight: 600; color: #1d2129; }
.toolbar-ops { display: flex; gap: 8px; }
.filter-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; }
.pager { margin-top: 14px; justify-content: flex-end; }
</style>
