<template>
  <div class="carmi-home">
    <!-- 应用内 Tab（对齐菜鸟云电子卡密：卡密分类 / 卡密库） -->
    <div class="card-tabs">
      <div class="ctab" :class="{ active: activeTab === 'cates' }" @click="activeTab = 'cates'">
        <SIcon name="apps" size="default" :color="activeTab === 'cates' ? '#165dff' : '#4e5969'" />
        <span>卡密分类</span>
      </div>
      <div class="ctab" :class="{ active: activeTab === 'libs' }" @click="activeTab = 'libs'">
        <SIcon name="template" size="default" :color="activeTab === 'libs' ? '#165dff' : '#4e5969'" />
        <span>卡密库</span>
      </div>
    </div>

    <!-- ============ 卡密分类 ============ -->
    <div v-if="activeTab === 'cates'" class="panel">
      <AppPageHeader title="卡密分类" desc="分类类型：单个卡密（售出减库存）/ 通用卡密（内容一致不消耗）">
        <el-input v-model="cateKw" placeholder="搜索分类名称" clearable style="width: 220px" @keyup.enter="loadCates" />
        <el-button type="primary" @click="openCate()">添加分类</el-button>
      </AppPageHeader>
      <div class="card">
        <el-table :data="cates" v-loading="cateLoading">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="name" label="分类名称" min-width="160" />
          <el-table-column prop="typeLabel" label="类型" width="120">
            <template #default="{ row }">
              <el-tag :type="row.type === 2 ? 'warning' : 'primary'" size="small" effect="light">{{ row.typeLabel }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="libraryCount" label="卡密库数量" width="110" />
          <el-table-column prop="createdAt" label="创建时间" width="180" />
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openCate(row)">编辑</el-button>
              <el-button link type="danger" @click="delCate(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- ============ 卡密库 ============ -->
    <div v-else class="panel">
      <AppPageHeader title="卡密库" desc="卡密库承载卡密数据（编号/密码）；关联商品后，用户购买自动发货">
        <el-input v-model="libKw" placeholder="搜索卡密库名称" clearable style="width: 220px" @keyup.enter="loadLibs" />
        <el-button type="primary" @click="openLib()">添加卡密库</el-button>
      </AppPageHeader>
      <div class="card">
        <el-table :data="libs" v-loading="libLoading">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="name" label="名称" min-width="140" />
          <el-table-column prop="cateName" label="分类" width="120" />
          <el-table-column prop="sold" label="已售" width="80" />
          <el-table-column prop="stock" label="库存" width="80">
            <template #default="{ row }">
              <span :class="{ 'stock-zero': row.stock === 0 }">{{ row.stock }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
          <el-table-column prop="createdAt" label="创建时间" width="180" />
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openData(row)">查看数据</el-button>
              <el-button link type="primary" @click="openLib(row)">编辑</el-button>
              <el-button link type="danger" @click="delLib(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- ============ 分类编辑弹窗 ============ -->
    <el-dialog v-model="cateDlg.show" :title="cateDlg.form.id ? '编辑分类' : '添加分类'" width="520px">
      <el-form label-width="100px">
        <el-form-item label="分类名称" required>
          <el-input v-model="cateDlg.form.name" placeholder="请输入分类名称" maxlength="30" />
        </el-form-item>
        <el-form-item label="分类类型" required>
          <el-radio-group v-model="cateDlg.form.type">
            <el-radio :value="1">单个卡密</el-radio>
            <el-radio :value="2">通用卡密</el-radio>
          </el-radio-group>
          <div class="form-tip">
            <template v-if="cateDlg.form.type === 1">单个卡密：售出后减少库存，例如：激活码、邮箱、充值卡、账号等</template>
            <template v-else>通用卡密：客户收到的卡密信息一致，用于网盘资料、视频、教程等</template>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cateDlg.show = false">取消</el-button>
        <el-button type="primary" :loading="cateDlg.saving" @click="saveCate">确定</el-button>
      </template>
    </el-dialog>

    <!-- ============ 卡密库编辑弹窗 ============ -->
    <el-dialog v-model="libDlg.show" :title="libDlg.form.id ? '编辑卡密库' : '添加卡密库'" width="560px">
      <el-form label-width="130px">
        <el-form-item label="卡密库名称" required>
          <el-input v-model="libDlg.form.name" placeholder="请输入卡密库名称" maxlength="30" />
        </el-form-item>
        <el-form-item label="所属分类" required>
          <el-select v-model="libDlg.form.cateId" placeholder="选择分类" style="width: 100%" :disabled="!!libDlg.form.id">
            <el-option v-for="c in cates" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <div class="form-tip">保存后不可修改分类</div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="libDlg.form.remark" placeholder="仅后台可见备注" maxlength="100" />
        </el-form-item>
        <el-form-item label="使用说明">
          <el-input v-model="libDlg.form.instruction" type="textarea" :rows="2" placeholder="小程序端用户购买后订单详情页可见提示" />
        </el-form-item>
        <el-form-item label="是否可重复购买">
          <el-radio-group v-model="libDlg.form.canRepetition">
            <el-radio :value="0">否</el-radio>
            <el-radio :value="1">是</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="通用展示内容">
          <el-input v-model="libDlg.form.dataContent" type="textarea" :rows="2" placeholder="输入展示内容，例如：网盘地址xxx 提取码xxx" />
          <div class="form-tip">通用卡密：客户收到的卡密信息一致；单个卡密忽略此项</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="libDlg.show = false">取消</el-button>
        <el-button type="primary" :loading="libDlg.saving" @click="saveLib">确定</el-button>
      </template>
    </el-dialog>

    <!-- ============ 卡密数据管理弹窗 ============ -->
    <el-dialog v-model="dataDlg.show" :title="`卡密数据 - ${dataDlg.libName}`" width="860px" top="6vh">
      <div class="data-toolbar">
        <el-radio-group v-model="dataDlg.status" size="small" @change="loadData">
          <el-radio-button :value="''">全部</el-radio-button>
          <el-radio-button :value="0">未使用</el-radio-button>
          <el-radio-button :value="1">已使用</el-radio-button>
        </el-radio-group>
        <el-input v-model="dataDlg.kw" placeholder="搜索编号/密码" clearable size="small" style="width: 200px" @keyup.enter="loadData" />
        <div class="toolbar-right">
          <el-button size="small" type="primary" @click="dataDlg.addShow = true">添加卡密数据</el-button>
          <el-button size="small" @click="dataDlg.importShow = true">批量导入</el-button>
          <el-button size="small" type="danger" plain :disabled="!dataDlg.selection.length" @click="batchDelData">批量删除</el-button>
        </div>
      </div>
      <el-table :data="dataDlg.list" v-loading="dataDlg.loading" height="380" @selection-change="(rows) => (dataDlg.selection = rows)">
        <el-table-column type="selection" width="44" :selectable="(row) => row.status === 0" />
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="code" label="编号" min-width="110" show-overflow-tooltip />
        <el-table-column prop="pwd" label="密码" min-width="140" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small" effect="light">{{ row.status === 1 ? '已使用' : '未使用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170" />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" :disabled="row.status === 1" @click="delData(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="data-pager">
        <el-pagination
          background layout="total, prev, pager, next"
          :total="dataDlg.total" :page-size="dataDlg.pageSize"
          :current-page="dataDlg.page" @current-change="(p) => { dataDlg.page = p; loadData(); }"
        />
      </div>
    </el-dialog>

    <!-- 添加卡密数据（多行） -->
    <el-dialog v-model="dataDlg.addShow" title="添加卡密数据" width="600px" append-to-body>
      <div class="kv-rows">
        <div v-for="(row, i) in dataDlg.newRows" :key="i" class="kv-row">
          <el-input v-model="row.code" placeholder="编号（可空）" style="width: 220px" />
          <el-input v-model="row.pwd" placeholder="密码/卡密" style="width: 240px" />
          <el-button link type="primary" @click="dataDlg.newRows.push({ code: '', pwd: '' })">+</el-button>
          <el-button v-if="dataDlg.newRows.length > 1" link type="danger" @click="dataDlg.newRows.splice(i, 1)">×</el-button>
        </div>
      </div>
      <div class="form-tip">支持一次新增多条：填写编号与密码后点击「确定」</div>
      <template #footer>
        <el-button @click="dataDlg.addShow = false">取消</el-button>
        <el-button type="primary" :loading="dataDlg.saving" @click="saveNewData">确定</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入 -->
    <el-dialog v-model="dataDlg.importShow" title="批量导入卡密" width="600px" append-to-body>
      <el-input v-model="dataDlg.importText" type="textarea" :rows="10" placeholder="每行一条：编号 密码（tab/空格/逗号分隔）&#10;例如：&#10;00001 46357632652346234&#10;00002,35345345345345" />
      <div class="form-tip">导入后立即生效；密码为空时仅记录编号</div>
      <template #footer>
        <el-button @click="dataDlg.importShow = false">取消</el-button>
        <el-button type="primary" :loading="dataDlg.saving" @click="doImport">确定导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../components/SIcon.vue';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import { customerApiCall } from '../../../api';

const activeTab = ref('cates');

// ---------- 卡密分类 ----------
const cates = ref([]);
const cateLoading = ref(false);
const cateKw = ref('');
const cateDlg = reactive({ show: false, saving: false, form: { id: 0, name: '', type: 1 } });

async function loadCates() {
  cateLoading.value = true;
  try {
    cates.value = await customerApiCall.get('/card-key/categories', { params: { key: cateKw.value } });
  } catch (e) { ElMessage.error(e); } finally { cateLoading.value = false; }
}

function openCate(row) {
  cateDlg.form = row ? { id: row.id, name: row.name, type: row.type } : { id: 0, name: '', type: 1 };
  cateDlg.show = true;
}

async function saveCate() {
  const f = cateDlg.form;
  if (!f.name.trim()) return ElMessage.warning('请输入分类名称');
  cateDlg.saving = true;
  try {
    if (f.id) await customerApiCall.put(`/card-key/categories/${f.id}`, { name: f.name, type: f.type });
    else await customerApiCall.post('/card-key/categories', { name: f.name, type: f.type });
    ElMessage.success('保存成功');
    cateDlg.show = false;
    loadCates();
  } catch (e) { ElMessage.error(e); } finally { cateDlg.saving = false; }
}

async function delCate(row) {
  try {
    await ElMessageBox.confirm(`确定删除分类「${row.name}」吗？`, '删除分类', { type: 'warning' });
    await customerApiCall.delete(`/card-key/categories/${row.id}`);
    ElMessage.success('已删除');
    loadCates();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}

// ---------- 卡密库 ----------
const libs = ref([]);
const libLoading = ref(false);
const libKw = ref('');
const libDlg = reactive({ show: false, saving: false, form: emptyLib() });

function emptyLib() {
  return { id: 0, name: '', cateId: null, remark: '', instruction: '', canRepetition: 0, dataContent: '' };
}

async function loadLibs() {
  libLoading.value = true;
  try {
    libs.value = await customerApiCall.get('/card-key/libraries', { params: { key: libKw.value } });
  } catch (e) { ElMessage.error(e); } finally { libLoading.value = false; }
}

function openLib(row) {
  libDlg.form = row ? {
    id: row.id, name: row.name, cateId: row.cateId, remark: row.remark || '',
    instruction: row.instruction || '', canRepetition: row.canRepetition || 0, dataContent: row.dataContent || '',
  } : emptyLib();
  libDlg.show = true;
}

async function saveLib() {
  const f = libDlg.form;
  if (!f.name.trim()) return ElMessage.warning('请输入卡密库名称');
  if (!f.cateId) return ElMessage.warning('请选择所属分类');
  libDlg.saving = true;
  try {
    if (f.id) await customerApiCall.put(`/card-key/libraries/${f.id}`, f);
    else await customerApiCall.post('/card-key/libraries', f);
    ElMessage.success('保存成功');
    libDlg.show = false;
    loadLibs();
  } catch (e) { ElMessage.error(e); } finally { libDlg.saving = false; }
}

async function delLib(row) {
  try {
    await ElMessageBox.confirm(`确定删除卡密库「${row.name}」吗？库内卡密数据将一并删除。`, '删除卡密库', { type: 'warning' });
    await customerApiCall.delete(`/card-key/libraries/${row.id}`);
    ElMessage.success('已删除');
    loadLibs();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}

// ---------- 卡密数据 ----------
const dataDlg = reactive({
  show: false, libName: '', libId: 0, status: '', kw: '', page: 1, pageSize: 10,
  total: 0, list: [], loading: false, selection: [], saving: false,
  addShow: false, newRows: [{ code: '', pwd: '' }],
  importShow: false, importText: '',
});

function openData(row) {
  dataDlg.libId = row.id;
  dataDlg.libName = row.name;
  dataDlg.status = '';
  dataDlg.kw = '';
  dataDlg.page = 1;
  dataDlg.selection = [];
  dataDlg.show = true;
  loadData();
}

async function loadData() {
  dataDlg.loading = true;
  try {
    const r = await customerApiCall.get(`/card-key/libraries/${dataDlg.libId}/data`, {
      params: { status: dataDlg.status, key: dataDlg.kw, page: dataDlg.page, pageSize: dataDlg.pageSize },
    });
    dataDlg.list = r.list;
    dataDlg.total = r.total;
  } catch (e) { ElMessage.error(e); } finally { dataDlg.loading = false; }
}

async function saveNewData() {
  const items = dataDlg.newRows.filter((r) => r.code.trim() || r.pwd.trim());
  if (!items.length) return ElMessage.warning('请至少填写一条编号或密码');
  dataDlg.saving = true;
  try {
    const r = await customerApiCall.post(`/card-key/libraries/${dataDlg.libId}/data`, { items });
    ElMessage.success(`已添加 ${r.added} 条`);
    dataDlg.addShow = false;
    dataDlg.newRows = [{ code: '', pwd: '' }];
    loadData();
  } catch (e) { ElMessage.error(e); } finally { dataDlg.saving = false; }
}

async function doImport() {
  if (!dataDlg.importText.trim()) return ElMessage.warning('请输入导入内容');
  dataDlg.saving = true;
  try {
    const r = await customerApiCall.post(`/card-key/libraries/${dataDlg.libId}/data/import`, { text: dataDlg.importText });
    ElMessage.success(`已导入 ${r.added} 条`);
    dataDlg.importShow = false;
    dataDlg.importText = '';
    loadData();
  } catch (e) { ElMessage.error(e); } finally { dataDlg.saving = false; }
}

async function batchDelData() {
  const ids = dataDlg.selection.map((r) => r.id);
  if (!ids.length) return;
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${ids.length} 条卡密数据吗？`, '批量删除', { type: 'warning' });
    await customerApiCall.post(`/card-key/libraries/${dataDlg.libId}/data/batch-delete`, { ids });
    ElMessage.success('已删除');
    loadData();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}

async function delData(row) {
  try {
    await ElMessageBox.confirm(`确定删除编号「${row.code || row.id}」吗？`, '删除', { type: 'warning' });
    await customerApiCall.delete(`/card-key/libraries/${dataDlg.libId}/data/${row.id}`);
    ElMessage.success('已删除');
    loadData();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}

onMounted(() => {
  loadCates();
  loadLibs();
});
</script>

<style scoped>
.carmi-home { padding: 0 20px 20px; }
.panel { margin-top: 16px; }
.card { background: #fff; border-radius: 8px; padding: 20px; }
.card-tabs { display: flex; gap: 8px; padding: 4px; background: #F2F3F5; border-radius: 8px; width: fit-content; }
.ctab { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; color: #4E5969; }
.ctab.active { background: #fff; color: #165DFF; font-weight: 500; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06); }
.form-tip { font-size: 12px; color: #86909C; line-height: 1.5; margin-top: 4px; }
.stock-zero { color: #F53F3F; }
.data-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.toolbar-right { margin-left: auto; display: flex; gap: 8px; }
.data-pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.kv-rows { display: flex; flex-direction: column; gap: 8px; }
.kv-row { display: flex; gap: 8px; align-items: center; }
</style>
