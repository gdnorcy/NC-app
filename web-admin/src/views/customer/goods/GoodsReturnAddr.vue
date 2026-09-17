<template>
  <div class="goods-return-addr">
    <!-- 列表模式（1:1 复刻菜鸟云 returnadd/index：新增地址/批量删除，表格 ID/收件人/手机号/详细地址/备注/操作） -->
    <template v-if="mode === 'list'">
      <AppPageHeader title="退货地址" desc="买家退货时使用的收货地址">
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
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" text type="danger" @click="del(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty><div class="empty-tip">暂无退货地址，点击「新增地址」添加</div></template>
      </el-table>
    </template>

    <!-- 表单模式（1:1 复刻菜鸟云 returnadd/add.html：收件人名/收件电话/收件地区/收件地址/备注 + 右侧说明） -->
    <template v-else>
      <AppPageHeader title="退货地址" desc="新增 / 编辑买家退货收货地址">
        <div class="hd-actions">
          <el-button @click="mode = 'list'">返回列表</el-button>
        </div>
      </AppPageHeader>

      <div class="return-form-wrap">
        <el-form label-width="90px" label-position="left" class="return-form">
          <el-form-item label="收件人名" required>
            <el-input v-model="form.name" placeholder="请输入收件人名" maxlength="20" class="w360" />
          </el-form-item>
          <el-form-item label="收件电话" required>
            <el-input v-model="form.phone" placeholder="请输入收件电话" maxlength="20" class="w360" />
          </el-form-item>
          <el-form-item label="收件地区" required>
            <div class="region-row">
              <el-select v-model="form.province" placeholder="==省==" class="region-sel" @change="onProvince">
                <el-option v-for="p in AREA_DATA" :key="p.value" :label="p.label" :value="p.value" />
              </el-select>
              <el-select v-model="form.city" placeholder="==市==" class="region-sel">
                <el-option v-for="c in cityOptions" :key="c.value" :label="c.label" :value="c.value" />
              </el-select>
            </div>
          </el-form-item>
          <el-form-item label="收件地址" required>
            <el-input v-model="form.address" placeholder="请输入收件地址" maxlength="120" class="w360" />
          </el-form-item>
          <el-form-item label="备注说明">
            <el-input v-model="form.remark" placeholder="选填" maxlength="60" class="w360" />
          </el-form-item>
          <el-form-item>
            <div class="form-actions">
              <el-button type="primary" :loading="saving" @click="save">确定</el-button>
              <el-button @click="mode = 'list'">取消</el-button>
            </div>
          </el-form-item>
        </el-form>
        <div class="return-form-aside">
          <div class="aside-title">说明</div>
          <div class="aside-text">售后订单选择退货地址</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import { AREA_DATA } from './area-data.js';

const mode = ref('list');
const list = ref([]);
const loading = ref(false);
const saving = ref(false);
const selected = ref([]);
const form = ref({ id: null, name: '', phone: '', province: '', city: '', address: '', remark: '' });

const cityOptions = computed(() => {
  const p = AREA_DATA.find((x) => x.value === form.value.province);
  return p ? p.children : [];
});

function onProvince() { form.value.city = ''; }

async function load() {
  loading.value = true;
  try {
    const data = await customerApiCall.get('/goods/return-addresses');
    list.value = data.list || [];
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}

function openAdd() {
  form.value = { id: null, name: '', phone: '', province: '', city: '', address: '', remark: '' };
  mode.value = 'form';
}

function openEdit(row) {
  const parts = String(row.address || '').split(' ');
  form.value = {
    id: row.id,
    name: row.name,
    phone: row.phone,
    province: parts[0] || '',
    city: parts[1] || '',
    address: parts.slice(2).join(' '),
    remark: row.remark || '',
  };
  mode.value = 'form';
}

async function save() {
  const f = form.value;
  if (!f.name.trim()) { ElMessage.warning('请输入收件人名'); return; }
  if (!f.phone.trim()) { ElMessage.warning('请输入收件电话'); return; }
  if (!f.province || !f.city) { ElMessage.warning('请选择收件地区'); return; }
  if (!f.address.trim()) { ElMessage.warning('请输入收件地址'); return; }
  const address = `${f.province} ${f.city} ${f.address.trim()}`;
  saving.value = true;
  try {
    const body = { name: f.name.trim(), phone: f.phone.trim(), address, remark: f.remark.trim() };
    if (f.id) {
      await customerApiCall.put(`/goods/return-addresses/${f.id}`, body);
      ElMessage.success('已保存');
    } else {
      await customerApiCall.post('/goods/return-addresses', body);
      ElMessage.success('已添加');
    }
    mode.value = 'list';
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
.return-form-wrap { display: flex; gap: 32px; align-items: flex-start; background: #fff; border-radius: 8px; padding: 24px; margin-top: 16px; }
.return-form { flex: 1; min-width: 0; }
.w360 { width: 360px; }
.region-row { display: flex; gap: 12px; }
.region-sel { width: 170px; }
.form-actions { display: flex; gap: 12px; margin-top: 8px; }
.return-form-aside { width: 220px; flex-shrink: 0; border-left: 1px solid #f2f3f5; padding-left: 24px; }
.aside-title { font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 8px; }
.aside-text { font-size: 13px; color: #86909c; line-height: 1.6; }
</style>
