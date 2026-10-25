<template>
  <div>
    <div class="sec-title">
      <span>套餐模板库</span>
      <el-button type="primary" size="small" @click="openDialog()">新建模板</el-button>
    </div>
    <el-alert type="info" :closable="false" show-icon class="tmpl-tip">
      <template #title>模板用途与权益去向</template>
      <div class="tmpl-tip-body">
        <p>新租户开通时，下列模板会拷贝为该租户的<b>标准会员档</b>（档位名 / 购买价 / 集市场席）；修改模板只影响之后开通的租户，<b>不影响存量租户</b>已拥有的等级。</p>
        <p>原「能力点 / 模板折扣 / 收藏上限 / 留资配额 / 推送配额 / 语音简介」等权益字段已统一下移至「平台权益目录 + 租户套餐 × 应用矩阵」模型：由租户在自己后台的「会员套餐」页按应用配置，模板库不再重复配置。</p>
      </div>
    </el-alert>
    <el-table :data="packages" size="small" border>
      <el-table-column prop="level" label="等级标识" width="120" />
      <el-table-column prop="name" label="模板名" min-width="120" />
      <el-table-column label="价格" width="110" align="center">
        <template #default="{ row }">¥{{ row.price }} / {{ row.duration_days }}天</template>
      </el-table-column>
      <el-table-column label="集市场席" width="100" align="center">
        <template #default="{ row }"><el-tag :type="row.market_subject ? 'success' : 'info'" size="small">{{ row.market_subject ? '含' : '—' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="启用" width="80" align="center">
        <template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '是' : '否' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" link type="danger" @click="removePackage(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog.visible" :title="dialog.id ? '编辑模板' : '新建模板'" width="560px">
      <el-form label-width="120px">
        <el-form-item label="等级标识" required>
          <el-input v-model="dialog.form.level" placeholder="如 vip_plus（唯一，对应标准档位）" :disabled="!!dialog.id" />
        </el-form-item>
        <el-form-item label="模板名称" required>
          <el-input v-model="dialog.form.name" placeholder="如 黄金会员" />
        </el-form-item>
        <el-form-item label="价格（元）">
          <el-input-number v-model="dialog.form.price" :min="0" :precision="2" />
          <div class="inline-form">
            <span class="hint">新租户开通时作为该标准档的购买价</span>
          </div>
        </el-form-item>
        <el-form-item label="时长（天）">
          <el-input-number v-model="dialog.form.durationDays" :min="1" />
          <div class="inline-form">
            <span class="hint">历史订单口径（老购买路径已下线，仅用于解析存量订单）；新租户播种的等级默认永久有效，租户可在自己后台调整</span>
          </div>
        </el-form-item>
        <el-form-item label="含集市场席">
          <el-switch v-model="dialog.form.marketSubject" />
          <div class="inline-form">
            <span class="hint">购买后自动入驻租户人脉集市（仅「购买会员套餐」入驻模式的租户生效）；随模板播种进新租户的权益矩阵</span>
          </div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="dialog.form.sortOrder" :min="0" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="dialog.form.description" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="dialog.form.enabled" />
          <div class="inline-form">
            <span class="hint">停用后不再向新租户播种该档；存量租户已有档位不受影响</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="dialog.visible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="savePackage">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchMemberPackages, createMemberPackage, updateMemberPackage, deleteMemberPackage } from '../../api';

const packages = ref([]);

const load = async () => {
  packages.value = await fetchMemberPackages().then((r) => r.packages);
};
onMounted(load);

const dialog = ref({ visible: false, id: null, form: {} });
const openDialog = (row) => {
  if (row) {
    dialog.value = {
      visible: true, id: row.id,
      form: {
        level: row.level, name: row.name, price: row.price, durationDays: row.duration_days,
        sortOrder: row.sort_order,
        marketSubject: !!row.market_subject,
        description: row.description, enabled: !!row.enabled,
      },
    };
  } else {
    dialog.value = {
      visible: true, id: null,
      form: { level: '', name: '', price: 0, durationDays: 30, sortOrder: 0, marketSubject: false, description: '', enabled: true },
    };
  }
};

const saving = ref(false);
const savePackage = async () => {
  const f = dialog.value.form;
  if (!f.level || !f.level.trim()) return ElMessage.warning('请填写等级标识');
  if (!f.name || !f.name.trim()) return ElMessage.warning('请填写模板名称');
  saving.value = true;
  try {
    if (dialog.value.id) await updateMemberPackage(dialog.value.id, f);
    else await createMemberPackage(f);
    ElMessage.success('已保存');
    dialog.value.visible = false;
    await load();
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
};

const removePackage = async (row) => {
  try {
    await ElMessageBox.confirm(`删除模板「${row.name}」后，之后开通的新租户将不再获得该标准档（存量租户不受影响），确认删除？`, '删除确认', { type: 'warning' });
    await deleteMemberPackage(row.id);
    ElMessage.success('已删除');
    await load();
  } catch {}
};
</script>

<style scoped>
.sec-title { display: flex; justify-content: space-between; align-items: center; margin: 12px 0; font-weight: 600; font-size: 15px; }
.tmpl-tip { margin-bottom: 12px; }
.tmpl-tip-body p { margin: 4px 0; font-size: 12px; line-height: 1.6; color: #606266; }
.inline-form { display: flex; align-items: center; gap: 8px; }
.hint { color: #909399; font-size: 12px; line-height: 1.5; }
</style>
