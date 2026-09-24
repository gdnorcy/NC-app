<template>
  <div>
    <div class="sec-title">
      <span>会员套餐</span>
      <el-button type="primary" size="small" @click="openDialog()">新建套餐</el-button>
    </div>
    <el-table :data="packages" size="small" border>
      <el-table-column prop="level" label="等级" width="110" />
      <el-table-column prop="name" label="套餐名" min-width="120" />
      <el-table-column label="价格" width="100" align="center">
        <template #default="{ row }">¥{{ row.price }} / {{ row.duration_days }}天</template>
      </el-table-column>
      <el-table-column label="能力点" min-width="240">
        <template #default="{ row }">
          <el-tag v-for="f in row.features" :key="f" size="small" class="feat-tag">{{ featureLabel(f) }}</el-tag>
          <span v-if="!row.features?.length" class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="模板折扣" width="90" align="center">
        <template #default="{ row }">{{ row.discount < 1 ? (row.discount * 10).toFixed(1) + ' 折' : '无折扣' }}</template>
      </el-table-column>
      <el-table-column label="收藏上限" width="90" align="center">
        <template #default="{ row }">{{ row.collect_limit === 0 ? '不限' : row.collect_limit }}</template>
      </el-table-column>
      <el-table-column label="留资配额" width="90" align="center">
        <template #default="{ row }">{{ row.lead_quota === 0 ? '不限' : row.lead_quota }}</template>
      </el-table-column>
      <el-table-column label="推送配额" width="90" align="center">
        <template #default="{ row }">{{ row.push_quota === 0 ? '不限' : row.push_quota }}</template>
      </el-table-column>
      <el-table-column label="语音" width="70" align="center">
        <template #default="{ row }"><el-tag :type="row.voice_enabled ? 'success' : 'info'" size="small">{{ row.voice_enabled ? '开' : '关' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="建群数" width="80" align="center">
        <template #default="{ row }">{{ row.group_limit === 0 ? '不限' : row.group_limit }}</template>
      </el-table-column>
      <el-table-column label="启用" width="70" align="center">
        <template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '是' : '否' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" link type="danger" @click="removePackage(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog.visible" :title="dialog.id ? '编辑套餐' : '新建套餐'" width="560px">
      <el-form label-width="120px">
        <el-form-item label="等级标识" required>
          <el-input v-model="dialog.form.level" placeholder="如 vip_plus（唯一）" :disabled="!!dialog.id" />
        </el-form-item>
        <el-form-item label="套餐名称" required>
          <el-input v-model="dialog.form.name" placeholder="如 黄金会员" />
        </el-form-item>
        <el-form-item label="价格（元）">
          <el-input-number v-model="dialog.form.price" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="时长（天）">
          <el-input-number v-model="dialog.form.durationDays" :min="1" />
        </el-form-item>
        <el-form-item label="能力点">
          <el-checkbox-group v-model="dialog.form.features">
            <el-checkbox v-for="o in featureOptions" :key="o" :value="o">{{ featureLabel(o) }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="模板折扣">
          <div class="inline-form">
            <el-input-number v-model="dialog.form.discount" :min="0" :max="1" :step="0.05" :precision="2" />
            <span class="hint">1.0=无折扣，0.8=8折</span>
          </div>
        </el-form-item>
        <el-form-item label="收藏上限">
          <div class="inline-form">
            <el-input-number v-model="dialog.form.collectLimit" :min="0" />
            <span class="hint">0=不限</span>
          </div>
        </el-form-item>
        <el-form-item label="留资配额">
          <div class="inline-form">
            <el-input-number v-model="dialog.form.leadQuota" :min="0" />
            <span class="hint">0=不限（有效线索累计）</span>
          </div>
        </el-form-item>
        <el-form-item label="推送配额">
          <div class="inline-form">
            <el-input-number v-model="dialog.form.pushQuota" :min="0" />
            <span class="hint">0=不限（订阅/公众号消息，阶段D联调）</span>
          </div>
        </el-form-item>
        <el-form-item label="语音简介">
          <el-switch v-model="dialog.form.voiceEnabled" />
        </el-form-item>
        <el-form-item label="建群数">
          <div class="inline-form">
            <el-input-number v-model="dialog.form.groupLimit" :min="0" />
            <span class="hint">0=不限</span>
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
import { fetchMemberPackages, fetchMemberFeatureOptions, createMemberPackage, updateMemberPackage, deleteMemberPackage } from '../../api';

const packages = ref([]);
const featureOptions = ref([]);
const featureLabelMap = {
  ai_report: 'AI意向报告', ai_words: 'AI个性化话术', quota_lead: '无感留资配额',
  quota_push: '推送配额', enterprise: '企业席位/报表/CRM',
};
const featureLabel = (f) => featureLabelMap[f] || f;

const load = async () => {
  packages.value = await fetchMemberPackages().then((r) => r.packages);
  featureOptions.value = await fetchMemberFeatureOptions().then((r) => r.options);
};
onMounted(load);

const dialog = ref({ visible: false, id: null, form: {} });
const openDialog = (row) => {
  if (row) {
    dialog.value = {
      visible: true, id: row.id,
      form: {
        level: row.level, name: row.name, price: row.price, durationDays: row.duration_days,
        features: row.features || [], discount: row.discount, collectLimit: row.collect_limit,
        leadQuota: row.lead_quota, pushQuota: row.push_quota,
        voiceEnabled: !!row.voice_enabled, groupLimit: row.group_limit, sortOrder: row.sort_order,
        description: row.description, enabled: !!row.enabled,
      },
    };
  } else {
    dialog.value = {
      visible: true, id: null,
      form: { level: '', name: '', price: 0, durationDays: 30, features: [], discount: 1.0, collectLimit: 0, leadQuota: 0, pushQuota: 0, voiceEnabled: false, groupLimit: 0, sortOrder: 0, description: '', enabled: true },
    };
  }
};

const saving = ref(false);
const savePackage = async () => {
  const f = dialog.value.form;
  if (!f.level || !f.level.trim()) return ElMessage.warning('请填写等级标识');
  if (!f.name || !f.name.trim()) return ElMessage.warning('请填写套餐名称');
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
    await ElMessageBox.confirm(`删除套餐「${row.name}」后，引用该等级的用户将降级为 free，确认删除？`, '删除确认', { type: 'warning' });
    await deleteMemberPackage(row.id);
    ElMessage.success('已删除');
    await load();
  } catch {}
};
</script>

<style scoped>
.sec-title { display: flex; justify-content: space-between; align-items: center; margin: 12px 0; font-weight: 600; font-size: 15px; }
.feat-tag { margin-right: 4px; }
.muted { color: #909399; }
.inline-form { display: flex; align-items: center; gap: 8px; }
.hint { color: #909399; font-size: 12px; }
</style>
