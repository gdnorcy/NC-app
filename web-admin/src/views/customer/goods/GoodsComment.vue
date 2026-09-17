<template>
  <div class="goods-comment">
    <AppPageHeader title="评论管理" desc="商品评价管理（1:1 复刻菜鸟云评论管理）">
      <div class="hd-actions">
        <el-button type="danger" plain :disabled="!selected.length" @click="batchDel">批量删除</el-button>
        <el-button type="primary" @click="openAdd">添加评论</el-button>
      </div>
    </AppPageHeader>

    <div class="filter-bar">
      <el-radio-group v-model="level" @change="load">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="1">好评</el-radio-button>
        <el-radio-button value="2">中评</el-radio-button>
        <el-radio-button value="3">差评</el-radio-button>
      </el-radio-group>
      <el-input v-model="keyword" placeholder="搜索商品名称/订单号/评价人" clearable class="w260" @keyup.enter="load" @clear="load">
        <template #append>
          <el-button @click="load"><el-icon><Search /></el-icon></el-button>
        </template>
      </el-input>
      <span class="p-total">共 {{ total }} 条评论</span>
    </div>

    <el-table v-loading="loading" :data="list" class="mt12" @selection-change="sel => selected = sel">
      <el-table-column type="selection" width="46" />
      <el-table-column label="产品ID" prop="goodsId" width="90" align="center" />
      <el-table-column label="商品名称" prop="goodsName" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.goodsName || '-' }}</template>
      </el-table-column>
      <el-table-column label="订单号" prop="orderNo" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.orderNo || '-' }}</template>
      </el-table-column>
      <el-table-column label="评价人" prop="username" min-width="100">
        <template #default="{ row }">
          <span>{{ row.anonymous ? '匿名' : (row.username || '-') }}</span>
        </template>
      </el-table-column>
      <el-table-column label="评价级别" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.level === 1 ? 'success' : row.level === 2 ? 'warning' : 'danger'" size="small">
            {{ { 1: '好评', 2: '中评', 3: '差评' }[row.level] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="评价内容" prop="content" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.content || '-' }}</template>
      </el-table-column>
      <el-table-column label="评价图片" width="110" align="center">
        <template #default="{ row }">
          <el-popover v-if="row.images && row.images.length" width="220" trigger="hover">
            <div class="img-previews">
              <el-image v-for="(img, i) in row.images" :key="i" :src="img" fit="cover" class="img-preview" :preview-src-list="row.images" :initial-index="i" preview-teleported />
            </div>
            <template #reference><span class="img-count">{{ row.images.length }} 张</span></template>
          </el-popover>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="是否匿名" width="90" align="center">
        <template #default="{ row }">{{ row.anonymous ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'show' ? 'success' : 'info'" size="small">{{ row.status === 'show' ? '显示' : '隐藏' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click="toggleStatus(row)">{{ row.status === 'show' ? '隐藏' : '显示' }}</el-button>
          <el-button size="small" text type="danger" @click="del(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty><div class="empty-tip">暂无评论</div></template>
    </el-table>

    <div class="pager">
      <el-pagination background layout="total, prev, pager, next" :total="total" :page-size="pageSize" :current-page="page" @current-change="p => { page = p; load(); }" />
    </div>

    <el-dialog v-model="dialog.show" title="添加评论" width="560px" append-to-body>
      <el-form label-width="90px">
        <el-form-item label="产品ID">
          <el-input-number v-model="dialog.goodsId" :min="0" style="width: 160px" />
          <span class="sort-hint">对应商品ID，选填</span>
        </el-form-item>
        <el-form-item label="商品名称" required>
          <el-input v-model="dialog.goodsName" placeholder="请输入商品名称" maxlength="60" />
        </el-form-item>
        <el-form-item label="订单号">
          <el-input v-model="dialog.orderNo" placeholder="请输入订单号" maxlength="40" />
        </el-form-item>
        <el-form-item label="评价人" required>
          <el-input v-model="dialog.username" placeholder="请输入评价人昵称" maxlength="20" />
        </el-form-item>
        <el-form-item label="评价级别">
          <el-radio-group v-model="dialog.level">
            <el-radio-button value="1">好评</el-radio-button>
            <el-radio-button value="2">中评</el-radio-button>
            <el-radio-button value="3">差评</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="评价内容">
          <el-input v-model="dialog.content" type="textarea" :rows="3" placeholder="请输入评价内容" maxlength="300" />
        </el-form-item>
        <el-form-item label="是否匿名">
          <el-switch v-model="dialog.anonymous" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.show = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const list = ref([]);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const selected = ref([]);
const level = ref('');
const keyword = ref('');
const page = ref(1);
const pageSize = 20;
const dialog = ref({ show: false, goodsId: 0, goodsName: '', orderNo: '', username: '', level: 1, content: '', anonymous: false });

async function load() {
  loading.value = true;
  try {
    const data = await customerApiCall.get('/goods/comments', { params: { level: level.value, keyword: keyword.value.trim(), page: page.value, pageSize } });
    list.value = data.list || [];
    total.value = data.total || 0;
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}

function openAdd() {
  dialog.value = { show: true, goodsId: 0, goodsName: '', orderNo: '', username: '', level: 1, content: '', anonymous: false };
}

async function save() {
  const d = dialog.value;
  if (!d.goodsName.trim() || !d.username.trim()) { ElMessage.warning('商品名称和评价人为必填'); return; }
  saving.value = true;
  try {
    await customerApiCall.post('/goods/comments', { goodsId: d.goodsId, goodsName: d.goodsName, orderNo: d.orderNo, username: d.username, level: d.level, content: d.content, anonymous: d.anonymous ? 1 : 0 });
    ElMessage.success('已添加');
    dialog.value.show = false;
    load();
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}

async function toggleStatus(row) {
  try {
    const toHide = row.status === 'show';
    await customerApiCall.put(`/goods/comments/${row.id}/status`, { status: toHide ? 'hide' : 'show' });
    row.status = toHide ? 'hide' : 'show';
    ElMessage.success(toHide ? '已隐藏' : '已显示');
  } catch (e) { ElMessage.error(e); }
}

async function del(row) {
  try { await ElMessageBox.confirm(`确认删除该评论？`, '删除确认', { type: 'warning' }); } catch { return; }
  try {
    await customerApiCall.delete(`/goods/comments/${row.id}`);
    ElMessage.success('已删除');
    load();
  } catch (e) { ElMessage.error(e); }
}

async function batchDel() {
  try { await ElMessageBox.confirm(`确认删除选中的 ${selected.value.length} 条评论？`, '批量删除', { type: 'warning' }); } catch { return; }
  try {
    await customerApiCall.post('/goods/comments/batch-delete', { ids: selected.value.map((r) => r.id) });
    ElMessage.success('已删除');
    load();
  } catch (e) { ElMessage.error(e); }
}

onMounted(load);
</script>

<style scoped>
.hd-actions { display: flex; gap: 8px; }
.filter-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.w260 { width: 260px; }
.p-total { font-size: 13px; color: #86909c; }
.mt12 { margin-top: 12px; }
.empty-tip { color: #86909c; font-size: 13px; padding: 24px 0; }
.pager { margin-top: 12px; display: flex; justify-content: flex-end; }
.sort-hint { font-size: 12px; color: #86909c; margin-left: 10px; }
.img-previews { display: flex; gap: 6px; flex-wrap: wrap; }
.img-preview { width: 64px; height: 64px; border-radius: 6px; }
.img-count { font-size: 13px; color: #165dff; cursor: pointer; }
</style>
