<template>
  <div>
    <div class="page-header">
      <div>
        <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon>返回</el-button>
        <h2 class="page-title" style="display:inline;margin-left:8px;">{{ isEdit ? '编辑客户' : '新建客户' }}</h2>
      </div>
      <el-button type="primary" @click="save" :loading="saving">保存</el-button>
    </div>
    <div class="page-card">
      <h3 style="margin-bottom:16px;">基本信息</h3>
      <el-form :model="form" label-width="100px">
        <el-form-item label="客户名称" required>
          <el-input v-model="form.customerName" placeholder="如：某某科技有限公司" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contactName" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="form.contactPhone" />
        </el-form-item>
        <el-form-item label="联系邮箱">
          <el-input v-model="form.contactEmail" />
        </el-form-item>
        <el-form-item label="有效期至">
          <el-date-picker v-model="form.validUntil" type="date" value-format="YYYY-MM-DD" style="width:100%;" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" active-value="active" inactive-value="disabled" />
        </el-form-item>
        <el-form-item label="开通解决方案">
          <el-checkbox-group v-model="form.solutions">
            <el-checkbox v-for="s in solutions" :key="s.id" :label="s.id">{{ s.name }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
    </div>
    <div class="page-card" v-if="isEdit">
      <h3 style="margin-bottom:16px;">独立配置</h3>
      <el-form :model="form.config" label-width="120px">
        <el-form-item label="底部版权文字">
          <el-input v-model="form.config.footerCopyright" placeholder="留空则使用平台版权" />
        </el-form-item>
        <el-form-item label="远程附件">
          <el-radio-group v-model="form.config.storageMode">
            <el-radio label="platform">借用平台</el-radio>
            <el-radio label="independent">自主接入</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="短信配置">
          <el-radio-group v-model="form.config.smsMode">
            <el-radio label="platform">借用平台</el-radio>
            <el-radio label="independent">自主接入</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="微信支付模式">
          <el-radio-group v-model="form.config.wechatPayMode">
            <el-radio label="normal">普通商户号</el-radio>
            <el-radio label="service">系统服务商</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="图片上传大小(MB)">
          <el-input-number v-model="form.config.maxImageSize" :min="1" :max="500" />
        </el-form-item>
        <el-form-item label="视频上传大小(MB)">
          <el-input-number v-model="form.config.maxVideoSize" :min="1" :max="2048" />
        </el-form-item>
        <el-form-item label="音频上传大小(MB)">
          <el-input-number v-model="form.config.maxAudioSize" :min="1" :max="500" />
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchCustomers, createCustomer, updateCustomer, fetchSolutions } from '../../api';
import { ElMessage } from 'element-plus';

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => !!route.params.id && route.params.id !== 'new');
const saving = ref(false);
const solutions = ref([]);

const form = reactive({
  customerName: '', contactName: '', contactPhone: '', contactEmail: '',
  validUntil: '', status: 'active', solutions: [],
  config: { footerCopyright: '', storageMode: 'platform', smsMode: 'platform', wechatPayMode: 'normal', maxImageSize: 50, maxVideoSize: 200, maxAudioSize: 50 },
});

onMounted(async () => {
  try { solutions.value = (await fetchSolutions()).solutions || []; } catch (e) {}
  if (isEdit.value) {
    try {
      const res = await fetchCustomers();
      const c = (res.projects || []).find(p => p.id === Number(route.params.id));
      if (c) Object.assign(form, c, { config: { ...form.config, ...(c.config || {}) } });
    } catch (e) { ElMessage.error(e); }
  }
});

async function save() {
  if (!form.customerName) { ElMessage.error('请输入客户名称'); return; }
  saving.value = true;
  try {
    if (isEdit.value) await updateCustomer(route.params.id, form);
    else await createCustomer(form);
    ElMessage.success('保存成功');
    router.push('/customers');
  } catch (e) { ElMessage.error(e); }
  finally { saving.value = false; }
}
</script>
