<template>
  <div class="article-list-page">
    <div class="page-toolbar">
      <div class="toolbar-title">文章列表</div>
      <div class="toolbar-ops">
        <el-button type="primary" @click="goAdd">添加文章</el-button>
        <el-button type="success" plain @click="openAi">AI生成文章</el-button>
        <el-button type="warning" plain @click="openCollect">采集文章</el-button>
        <el-button type="danger" plain :disabled="!selected.length" @click="batch('delete')">批量删除</el-button>
        <el-button type="success" plain :disabled="!selected.length" @click="batch('onsale')">批量上架</el-button>
        <el-button type="info" plain :disabled="!selected.length" @click="batch('offsale')">批量下架</el-button>
      </div>
    </div>

    <!-- 筛选区 -->
    <div class="filter-bar">
      <el-select v-model="query.cateId" placeholder="全部分类" clearable style="width: 150px" @change="load">
        <el-option v-for="c in cateOptions" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-radio-group v-model="query.status" @change="load">
        <el-radio-button :value="''">全部</el-radio-button>
        <el-radio-button :value="1">上架</el-radio-button>
        <el-radio-button :value="0">下架</el-radio-button>
      </el-radio-group>
      <el-input v-model="query.keyword" placeholder="文章标题关键字" clearable style="width: 180px" @keyup.enter="load" />
      <el-date-picker v-model="query.range" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始时间" end-placeholder="结束时间" style="width: 260px" @change="load" />
      <el-select v-model="query.sort" style="width: 130px" @change="load">
        <el-option label="时间倒序" value="time" />
        <el-option label="数字序号" value="sort" />
      </el-select>
      <el-button type="primary" plain @click="load">搜索</el-button>
    </div>

    <el-table :data="list" v-loading="loading" @selection-change="(v) => (selected = v)">
      <el-table-column type="selection" width="44" />
      <el-table-column label="排序" width="70" align="center" prop="sort_order" />
      <el-table-column label="缩略图" width="90">
        <template #default="{ row }">
          <el-image v-if="row.thumb" :src="resolveUrl(row.thumb)" fit="cover" class="thumb-img" :preview-src-list="[resolveUrl(row.thumb)]" preview-teleported />
          <span v-else class="no-img">—</span>
        </template>
      </el-table-column>
      <el-table-column label="标题" min-width="240">
        <template #default="{ row }">
          <div class="title-cell">
            <span class="art-title">{{ row.title }}</span>
            <span v-for="n in row.cateNames" :key="n" class="cate-tag">{{ n }}</span>
          </div>
          <div class="title-meta">ID: {{ row.id }} · 更新时间: {{ row.update_at || formatTime(row.updated_at) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '上架' : '下架' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goEdit(row)">编辑</el-button>
          <el-button link type="success" @click="openPromote(row)">推广</el-button>
          <el-button link type="primary" @click="duplicate(row)">复制</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="table-footer">一共查询到 {{ total }} 条数据</div>

    <!-- AI 生成文章 -->
    <el-dialog v-model="ai.show" title="AI 生成文章" width="560px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="文章主题" required>
          <el-input v-model="ai.topic" placeholder="输入文章主题，如：企业数字化转型趋势" />
        </el-form-item>
        <el-form-item label="生成数量">
          <el-radio-group v-model="ai.count">
            <el-radio-button :value="1">1 篇</el-radio-button>
            <el-radio-button :value="3">3 篇</el-radio-button>
            <el-radio-button :value="5">5 篇</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <div v-if="ai.result.length" class="ai-result">
          <div v-for="(r, i) in ai.result" :key="i" class="ai-item">
            <div class="ai-item-head">
              <span class="ai-item-title">{{ r.title }}</span>
              <div>
                <el-button size="small" type="primary" plain @click="saveAiResult(r)">入库</el-button>
                <el-button size="small" text type="danger" @click="ai.result.splice(i, 1)">移除</el-button>
              </div>
            </div>
            <div class="ai-item-intro">{{ r.intro }}</div>
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="ai.show = false">取消</el-button>
        <el-button type="primary" :loading="ai.loading" @click="generate">生成</el-button>
      </template>
    </el-dialog>

    <!-- 采集文章 -->
    <el-dialog v-model="collect.show" title="采集文章" width="560px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="文章链接" required>
          <el-input v-model="collect.url" placeholder="输入要采集的文章网页链接" />
        </el-form-item>
        <el-form-item label="文章标题">
          <el-input v-model="collect.title" placeholder="可选，留空用采集到的标题" />
        </el-form-item>
        <div v-if="collect.result.title" class="collect-preview">
          <div class="cp-title">{{ collect.result.title }}</div>
          <div class="cp-intro">{{ collect.result.intro }}</div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="collect.show = false">取消</el-button>
        <el-button type="primary" :loading="collect.loading" @click="doCollect">采集</el-button>
        <el-button v-if="collect.result.title" type="success" :loading="collect.saving" @click="saveCollectResult">入库</el-button>
      </template>
    </el-dialog>

    <!-- 推广弹窗（微信/H5/公众号） -->
    <el-dialog v-model="promote.show" title="推广文章" width="520px" destroy-on-close>
      <el-tabs v-model="promote.tab">
        <el-tab-pane label="微信" name="wx">
          <div class="promote-qr">
            <el-image v-if="promote.qr" :src="promote.qr" fit="contain" class="qr-img" />
            <div v-else class="qr-empty">点击下方按钮生成二维码</div>
          </div>
          <div class="promote-ops">
            <el-button size="small" @click="downloadQr">下载二维码</el-button>
            <el-button size="small" plain @click="loadQr">重新获取</el-button>
          </div>
          <div class="promote-link">
            <span>页面链接：</span>
            <code>{{ promote.link }}</code>
            <el-button size="small" link type="primary" @click="copyLink">复制</el-button>
          </div>
        </el-tab-pane>
        <el-tab-pane label="H5" name="h5">
          <div class="promote-link">
            <span>页面链接：</span>
            <code>{{ promote.link }}</code>
            <el-button size="small" link type="primary" @click="copyLink">复制</el-button>
          </div>
        </el-tab-pane>
        <el-tab-pane label="公众号" name="mp">
          <div class="promote-link">
            <span>页面链接：</span>
            <code>{{ promote.link }}</code>
            <el-button size="small" link type="primary" @click="copyLink">复制</el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customerApiCall } from '../../../api';

const emit = defineEmits(['counts-updated']);
const router = useRouter();

const list = ref([]);
const total = ref(0);
const loading = ref(false);
const selected = ref([]);
const cateOptions = ref([]);
const query = reactive({ cateId: '', status: '', keyword: '', range: null, sort: 'time' });

const ai = reactive({ show: false, topic: '', count: 1, loading: false, result: [] });
const collect = reactive({ show: false, url: '', title: '', loading: false, saving: false, result: {} });
const promote = reactive({ show: false, tab: 'wx', qr: '', link: '' });

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function formatTime(t) {
  if (!t) return '';
  return String(t).slice(0, 16).replace('T', ' ');
}

async function load() {
  loading.value = true;
  try {
    const params = {
      page: 1, pageSize: 100,
      sort: query.sort,
    };
    if (query.cateId) params.cateId = query.cateId;
    if (query.status !== '') params.status = query.status;
    if (query.keyword) params.keyword = query.keyword;
    if (query.range && query.range.length === 2) {
      params.from = query.range[0];
      params.to = query.range[1];
    }
    const res = await customerApiCall.get('/content/articles', { params });
    list.value = res.list || [];
    total.value = res.total || 0;
  } catch (e) {
    ElMessage.error(e || '文章列表加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadCates() {
  try {
    const res = await customerApiCall.get('/content/article-cates');
    const flatten = [];
    for (const c of res.tree || []) {
      flatten.push({ id: c.id, name: c.name });
      for (const s of c.children || []) flatten.push({ id: s.id, name: `└ ${s.name}` });
    }
    cateOptions.value = flatten;
  } catch (e) { /* 分类失败不阻断 */ }
}

function goAdd() { router.push('/content/article/edit'); }
function goEdit(row) { router.push(`/content/article/edit?id=${row.id}`); }

function remove(row) {
  ElMessageBox.confirm(`确定删除文章「${row.title}」吗？`, '删除确认', { type: 'warning' })
    .then(async () => {
      try {
        await customerApiCall.delete(`/content/articles/${row.id}`);
        ElMessage.success('删除成功');
        load();
      } catch (e) { ElMessage.error(e || '删除失败'); }
    })
    .catch(() => {});
}

function duplicate(row) {
  ElMessageBox.confirm(`确定复制文章「${row.title}」吗？`, '复制确认')
    .then(async () => {
      try {
        await customerApiCall.post(`/content/articles/${row.id}/duplicate`);
        ElMessage.success('复制成功');
        load();
      } catch (e) { ElMessage.error(e || '复制失败'); }
    })
    .catch(() => {});
}

async function batch(action) {
  const ids = selected.value.map((r) => r.id);
  const label = { delete: '删除', onsale: '上架', offsale: '下架' }[action];
  ElMessageBox.confirm(`确定对选中的 ${ids.length} 篇文章执行「${label}」吗？`, '批量操作', { type: action === 'delete' ? 'warning' : 'info' })
    .then(async () => {
      try {
        await customerApiCall.post('/content/articles/batch', { ids, action });
        ElMessage.success('操作成功');
        load();
      } catch (e) { ElMessage.error(e || '操作失败'); }
    })
    .catch(() => {});
}

// ---- AI 生成 ----
function openAi() {
  ai.show = true;
  ai.topic = '';
  ai.result = [];
}
async function generate() {
  if (!ai.topic.trim()) { ElMessage.warning('请输入文章主题'); return; }
  ai.loading = true;
  try {
    const res = await customerApiCall.post('/content/articles/ai-generate', { topic: ai.topic, count: ai.count });
    ai.result = res.list || [];
    if (!ai.result.length) ElMessage.info('生成完成，但没有返回内容');
  } catch (e) {
    ElMessage.error(e || '生成失败');
  } finally {
    ai.loading = false;
  }
}
async function saveAiResult(r) {
  try {
    await customerApiCall.post('/content/articles', {
      title: r.title, intro: r.intro || '', detail: r.detail || '',
      status: 1, sortOrder: 0, cateIds: [],
    });
    ElMessage.success('已入库');
    load();
    ai.result = ai.result.filter((x) => x !== r);
  } catch (e) { ElMessage.error(e || '入库失败'); }
}

// ---- 采集 ----
function openCollect() {
  collect.show = true;
  collect.url = '';
  collect.title = '';
  collect.result = {};
}
async function doCollect() {
  if (!collect.url.trim()) { ElMessage.warning('请输入文章链接'); return; }
  collect.loading = true;
  try {
    const res = await customerApiCall.post('/content/articles/collect', { url: collect.url, title: collect.title });
    collect.result = res;
  } catch (e) {
    ElMessage.error(e || '采集失败');
  } finally {
    collect.loading = false;
  }
}
async function saveCollectResult() {
  collect.saving = true;
  try {
    await customerApiCall.post('/content/articles', {
      title: collect.result.title || collect.title || '采集文章',
      intro: collect.result.intro || '',
      detail: collect.result.detail || '',
      thumb: collect.result.thumb || '',
      status: 1, sortOrder: 0, cateIds: [],
    });
    ElMessage.success('已入库');
    collect.show = false;
    load();
  } catch (e) {
    ElMessage.error(e || '入库失败');
  } finally {
    collect.saving = false;
  }
}

// ---- 推广 ----
function openPromote(row) {
  promote.show = true;
  promote.tab = 'wx';
  promote.qr = '';
  promote.link = `${location.origin}/card/#/pagesReads/showArt/showArt?id=${row.id}&tid=${localStorage.getItem('customer_tid') || ''}`;
  loadQr();
}
async function loadQr() {
  try {
    const m = promote.link.match(/id=(\d+)/);
    const id = m ? m[1] : '';
    const res = await customerApiCall.get('/content/articles/qr', { params: { id } }).catch(() => null);
    promote.qr = res?.qr || '';
  } catch (e) { /* 二维码失败不阻断 */ }
}
async function downloadQr() {
  if (!promote.qr) { ElMessage.warning('二维码尚未生成'); return; }
  const a = document.createElement('a');
  a.href = promote.qr;
  a.download = `article-qr-${Date.now()}.png`;
  a.click();
}
function copyLink() {
  navigator.clipboard?.writeText(promote.link).then(() => ElMessage.success('链接已复制')).catch(() => ElMessage.warning('复制失败，请手动复制'));
}

onMounted(() => { load(); loadCates(); });
</script>

<style scoped>
.page-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.toolbar-title { font-size: 16px; font-weight: 600; color: #1d2129; }
.toolbar-ops { display: flex; gap: 8px; flex-wrap: wrap; }
.filter-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.thumb-img { width: 56px; height: 56px; border-radius: 6px; display: block; }
.no-img { color: #c9cdd4; }
.title-cell { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.art-title { font-size: 14px; color: #1d2129; }
.cate-tag { font-size: 11px; color: #165dff; background: rgba(22, 93, 255, 0.08); border-radius: 4px; padding: 1px 6px; }
.title-meta { font-size: 12px; color: #86909c; margin-top: 2px; }
.table-footer { font-size: 13px; color: #86909c; margin-top: 12px; }
.ai-result { display: flex; flex-direction: column; gap: 10px; max-height: 320px; overflow-y: auto; }
.ai-item { border: 1px solid #e5e6eb; border-radius: 8px; padding: 12px; }
.ai-item-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ai-item-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.ai-item-intro { font-size: 13px; color: #4e5969; margin-top: 6px; }
.collect-preview { border: 1px solid #e5e6eb; border-radius: 8px; padding: 12px; }
.cp-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.cp-intro { font-size: 13px; color: #4e5969; margin-top: 6px; }
.promote-qr { display: flex; justify-content: center; padding: 8px 0 4px; }
.qr-img { width: 180px; height: 180px; }
.qr-empty { width: 180px; height: 180px; border: 1px dashed #c9cdd4; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #86909c; font-size: 13px; }
.promote-ops { display: flex; justify-content: center; gap: 8px; margin: 8px 0; }
.promote-link { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #4e5969; word-break: break-all; }
.promote-link code { background: #f7f8fa; padding: 4px 8px; border-radius: 4px; font-size: 12px; flex: 1; }
</style>
