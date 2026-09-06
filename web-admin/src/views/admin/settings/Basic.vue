<template>
  <div>
    <div class="page-header"><h2 class="page-title">基础设置</h2></div>
    <div class="page-card">
      <h3 style="margin-bottom:16px;">站点信息</h3>
      <el-form :model="form" label-width="120px">
        <el-form-item label="站点名称"><el-input v-model="form.siteName" /></el-form-item>
        <el-form-item label="系统Logo">
          <el-upload :auto-upload="false" :show-file-list="false" accept="image/*" @change="uploadLogo">
            <el-button>选择图片</el-button>
            <span style="margin-left:8px;font-size:12px;color:#909399;">建议200×200px，显示在客户后台左上角</span>
          </el-upload>
        </el-form-item>
        <el-form-item label="前台首页标题"><el-input v-model="form.homeTitle" /></el-form-item>
        <el-form-item label="前台首页副标题"><el-input v-model="form.homeSubtitle" /></el-form-item>
        <el-form-item label="ICP备案号"><el-input v-model="form.icp" /></el-form-item>
        <el-form-item label="联系电话"><el-input v-model="form.contactPhone" /></el-form-item>
        <el-form-item label="联系邮箱"><el-input v-model="form.contactEmail" /></el-form-item>
      </el-form>
    </div>
    <div class="page-card">
      <h3 style="margin-bottom:16px;">平台版权</h3>
      <el-form :model="form" label-width="120px">
        <el-form-item label="版权所有者"><el-input v-model="form.copyrightOwner" /></el-form-item>
        <el-form-item label="版权年份"><el-input v-model="form.copyrightYear" /></el-form-item>
        <el-form-item label="自定义版权文字"><el-input v-model="form.customCopyright" placeholder="留空则自动生成" /></el-form-item>
      </el-form>
    </div>
    <el-button type="primary" @click="save" :loading="saving">保存设置</el-button>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { fetchSettings, saveSettings, uploadCustomerLogo } from '../../../api';
import { ElMessage } from 'element-plus';

const saving = ref(false);
const form = reactive({ siteName: '', logo: '', homeTitle: '', homeSubtitle: '', icp: '', contactPhone: '', contactEmail: '', copyrightOwner: '', copyrightYear: '', customCopyright: '' });

onMounted(async () => {
  try { Object.assign(form, (await fetchSettings()).settings || {}); } catch (e) {}
});
async function uploadLogo(file) {
  try {
    const res = await uploadCustomerLogo(file.raw);
    form.logo = res.url;
    ElMessage.success('上传成功');
  } catch (e) { ElMessage.error(e); }
}
async function save() {
  saving.value = true;
  try { await saveSettings(form); ElMessage.success('保存成功'); }
  catch (e) { ElMessage.error(e); }
  finally { saving.value = false; }
}
</script>
