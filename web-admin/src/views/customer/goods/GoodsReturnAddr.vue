<template>
  <div class="goods-return-addr">
    <AppPageHeader title="退货地址" desc="买家退货时使用的收货地址（1:1 复刻菜鸟云退货地址）">
      <div class="hd-actions">
        <el-button type="primary" :disabled="!selected.length" @click="batchDel">批量删除</el-button>
        <el-button type="primary" @click="openAdd">新增地址</el-button>
      </div>
    </AppPageHeader>

    <el-table v-loading="loading" :data="list" class="mt12" @selection-change="sel => selected = sel">
      <el-table-column type="selection" width="46" />
      <el-table-column label="ID" prop="id" width="90" align="center" />
      <el-table-column label="收件人姓名" prop="name" min-width="120" />
      <el-table-column label="手机号" prop="phone" min-width="140" />
      <el-table-column label="详细地址" prop="address" min-width="260" show-overflow-tooltip />
      <el-table-column label="备注" prop="remark" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.remark || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="danger" @click="del(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty><div class="empty-tip">暂无退货地址，点击「新增地址」添加</div></template>
    </el-table>

    <el-dialog v-model="dialog.show" title="新增退货地址" width="480px" append-to-body>
      <el-form label-width="90px">
        <el-form-item label="收件人姓名" required>
          <el-input v-model="dialog.name" placeholder="请输入收件人姓名" maxlength="20" />
        </el-form-item>
        <el-form-item label="手机号" required>
          <el-input v-model="dialog.phone" placeholder="请输入手机号" maxlength="20" />
        </el-form-item>
        <el-form-item label="详细地址" required>
          <el-input v-model="dialog.address" type="textarea" :rows="2" placeholder="请输入详细地址" maxlength="120" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="dialog.remark" placeholder="选填" maxlength="60" />
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
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const list = ref([]);
const loading = ref(false);
const saving = ref(false);
const selected = ref([]);
const dialog = ref({ show: false, name: '', phone: '', address: '', remark: '' });

async function load() {
  loading.value = true;
  try {
    const data = await customerApiCall.get('/goods/return-addresses');
    list.value = data.list || [];
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}

function openAdd() { dialog.value = { show: true, name: '', phone: '', address: '', remark: '' }; }

async function save() {
  const d = dialog.value;
  if (!d.name.trim()) { ElMessage.warning('请输入收件人姓名'); return; }
  if (!d.phone.trim()) { ElMessage.warning('请输入手机号'); return; }
  if (!d.address.trim()) { ElMessage.warning('请输入详细地址'); return; }
  saving.value = true;
  try {
    await customerApiCall.post('/goods/return-addresses', { name: d.name, phone: d.phone, address: d.address, remark: d.remark });
    ElMessage.success('已添加');
    dialog.value.show = false;
    load();
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}

async function del(row) {
  try { await ElMessageBox.confirm(`确认删除地址「${row.name} ${row.phone}」？`, '删除确认', { type: 'warning' }); } catch { return; }
  try {
    await customerApiCall.delete(`/goods/return-addresses/${row.id}`);
    ElMessage.success('已删除');
    load();
  } catch (e) { ElMessage.error(e); }
}

async function batchDel() {
  try { await ElMessageBox.confirm(`确认删除选中的 ${selected.value.length} 条地址？`, '批量删除', { type: 'warning' }); } catch { return; }
  try {
    await customerApiCall.post('/goods/return-addresses/batch-delete', { ids: selected.value.map((r) => r.id) });
    ElMessage.success('已删除');
    load();
  } catch (e) { ElMessage.error(e); }
}

onMounted(load);
</script>

<style scoped>
.hd-actions { display: flex; gap: 8px; }
.mt12 { margin-top: 12px; }
.empty-tip { color: #86909c; font-size: 13px; padding: 24px 0; }
</style>
