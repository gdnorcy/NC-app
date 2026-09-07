<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">{{ isEdit ? '编辑套餐' : '新建套餐' }}</h2>
      <el-button @click="$router.back()">返回</el-button>
    </div>

    <div class="page-card form-card">
      <el-form :model="form" label-width="140px" label-position="right" style="max-width: 720px">
        <el-form-item label="套餐标识" required>
          <el-input v-model="form.code" :disabled="isEdit" placeholder="如 pro / flagship（英文标识，唯一）" />
        </el-form-item>
        <el-form-item label="套餐名称" required>
          <el-input v-model="form.name" placeholder="如 专业版" />
        </el-form-item>
        <el-form-item label="套餐描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="一句话说明适用人群" />
        </el-form-item>
        <el-form-item label="价格（元）">
          <el-input-number v-model="form.price" :min="0" :precision="2" style="width:200px" />
        </el-form-item>
        <el-form-item label="计费周期">
          <el-radio-group v-model="form.cycle">
            <el-radio value="year">按年</el-radio>
            <el-radio value="month">按月</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-divider content-position="left">配额（留空或 -1 表示不限）</el-divider>
        <div class="quota-grid">
          <el-form-item v-for="q in quotaFields" :key="q.key" :label="q.label">
            <el-input-number v-model="form.quotas[q.key]" :min="-1" style="width:160px" />
          </el-form-item>
        </div>

        <el-divider content-position="left">功能开关</el-divider>
        <el-form-item label="人脉集市">
          <el-switch v-model="form.features.market_enabled" />
        </el-form-item>
        <el-form-item label="二级分销">
          <el-switch v-model="form.features.distribution_enabled" />
        </el-form-item>
        <el-form-item label="360全景">
          <el-switch v-model="form.features.panorama_enabled" />
        </el-form-item>
        <el-form-item label="智能名片">
          <el-switch v-model="form.features.card_enabled" />
        </el-form-item>

        <el-form-item label="启用状态">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" style="width:160px" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">{{ isEdit ? '保存修改' : '创建套餐' }}</el-button>
          <el-button @click="$router.back()">取消</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminApi } from '../../api';
import { ElMessage } from 'element-plus';

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => !!route.params.id);
const saving = ref(false);

const quotaFields = [
  { key: 'max_individuals', label: '入驻个人上限' },
  { key: 'max_enterprises', label: '入驻企业上限' },
  { key: 'max_employees', label: '员工上限' },
  { key: 'max_scenes', label: '全景场景上限' },
  { key: 'max_storage_mb', label: '存储空间(MB)' },
  { key: 'max_sms', label: '短信条数' },
  { key: 'max_market_items', label: '集市上架上限' },
];

const form = ref({
  code: '', name: '', description: '', price: 0, cycle: 'year', sortOrder: 0, enabled: true,
  quotas: { max_individuals: 0, max_enterprises: 0, max_employees: 0, max_scenes: 0, max_storage_mb: 0, max_sms: 0, max_market_items: 0 },
  features: { market_enabled: false, distribution_enabled: false, panorama_enabled: true, card_enabled: true },
});

onMounted(async () => {
  if (isEdit.value) {
    try {
      const { data } = await adminApi.get('/billing-plans');
      const p = (data.plans || []).find((x) => String(x.id) === String(route.params.id));
      if (p) {
        form.value = {
          code: p.code, name: p.name, description: p.description, price: p.price,
          cycle: p.cycle, sortOrder: p.sortOrder, enabled: p.enabled,
          quotas: { max_individuals: 0, max_enterprises: 0, max_employees: 0, max_scenes: 0, max_storage_mb: 0, max_sms: 0, max_market_items: 0, ...p.quotas },
          features: { market_enabled: false, distribution_enabled: false, panorama_enabled: true, card_enabled: true, ...p.features },
        };
      }
    } catch (e) { ElMessage.error(typeof e === 'string' ? e : '加载套餐失败'); }
  }
});

async function save() {
  if (!form.value.code.trim() || !form.value.name.trim()) { ElMessage.warning('请填写套餐标识和名称'); return; }
  saving.value = true;
  try {
    if (isEdit.value) {
      await adminApi.put(`/billing-plans/${route.params.id}`, form.value);
    } else {
      await adminApi.post('/billing-plans', form.value);
    }
    ElMessage.success('保存成功');
    router.push('/billing-plans');
  } catch (e) { ElMessage.error(typeof e === 'string' ? e : '保存失败'); }
  finally { saving.value = false; }
}
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title { font-size: 18px; font-weight: 600; color: #1D2129; margin: 0; }
.page-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.form-card { padding: 24px; }
.quota-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0 24px; }
</style>
