<template>
  <div class="settings-page">
    <div class="page-header">
      <h2 class="page-title">账号设置</h2>
      <p class="page-desc">管理您的个人信息和登录密码</p>
    </div>

    <div class="card-grid">
      <div class="card">
        <div class="card-title">个人信息</div>
        <el-form :model="profile" label-width="100px" size="default">
          <el-form-item label="账号">
            <el-input v-model="profile.username" disabled />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="profile.phone" placeholder="请输入手机号" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveProfile" :loading="savingProfile">保存修改</el-button>
          </el-form-item>
        </el-form>
      </div>

      <div class="card">
        <div class="card-title">修改密码</div>
        <el-form :model="pwdForm" label-width="100px" size="default">
          <el-form-item label="当前密码">
            <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入当前密码" />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="请输入新密码" />
          </el-form-item>
          <el-form-item label="确认密码">
            <el-input v-model="pwdForm.confirmPassword" type="password" show-password placeholder="请再次输入新密码" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="changePwd" :loading="changingPwd">确认修改</el-button>
          </el-form-item>
        </el-form>
      </div>

      <div class="card">
        <div class="card-title">品牌外观</div>
        <p class="card-desc">品牌主色将应用于对外展示的名片页面（名片详情头部）。</p>
        <el-form label-width="100px" size="default">
          <el-form-item label="品牌主色">
            <div class="brand-row">
              <div
                v-for="c in brandPresets" :key="c"
                class="brand-swatch" :class="{ on: brandColor === c }"
                :style="{ background: c }" @click="brandColor = c"
              ></div>
              <el-color-picker v-model="brandColor" />
              <el-button text @click="brandColor = ''">恢复默认</el-button>
            </div>
            <div class="form-tip">留空时使用默认橙色风格</div>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveBrand" :loading="savingBrand">保存品牌设置</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { customerApiCall } from '../../../api';
import { ElMessage } from 'element-plus';

const profile = reactive({ username: '', phone: '' });
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const savingProfile = ref(false);
const changingPwd = ref(false);
const brandColor = ref('');
const savingBrand = ref(false);
const brandPresets = ['#165DFF', '#07C160', '#F59E0B', '#F53F3F', '#722ED1', '#13C2C2', '#2F54EB', '#FA8C16'];

onMounted(async () => {
  try {
    const data = await customerApiCall.get('/profile');
    Object.assign(profile, data.user || {});
  } catch (e) {}
  try {
    const cfg = await customerApiCall.get('/config');
    brandColor.value = (cfg.config || {}).brand_color || '';
  } catch (e) {}
});

async function saveBrand() {
  savingBrand.value = true;
  try {
    const res = await customerApiCall.put('/config', { brand_color: brandColor.value });
    brandColor.value = (res.config || {}).brand_color || '';
    ElMessage.success('品牌设置已保存');
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    savingBrand.value = false;
  }
}

async function saveProfile() {
  savingProfile.value = true;
  try {
    await customerApiCall.put('/profile', profile);
    ElMessage.success('保存成功');
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    savingProfile.value = false;
  }
}

async function changePwd() {
  if (!pwdForm.oldPassword) { ElMessage.warning('请输入当前密码'); return; }
  if (!pwdForm.newPassword) { ElMessage.warning('请输入新密码'); return; }
  if (pwdForm.newPassword !== pwdForm.confirmPassword) { ElMessage.error('两次密码不一致'); return; }
  if (pwdForm.newPassword.length < 6) { ElMessage.warning('新密码至少6位'); return; }
  changingPwd.value = true;
  try {
    await customerApiCall.post('/change-password', pwdForm);
    ElMessage.success('修改成功');
    pwdForm.oldPassword = '';
    pwdForm.newPassword = '';
    pwdForm.confirmPassword = '';
  } catch (e) {
    ElMessage.error(e.message || '修改失败');
  } finally {
    changingPwd.value = false;
  }
}
</script>

<style scoped>
.settings-page { padding: 0; }
.page-header { margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0 0 4px; }
.page-desc { font-size: 13px; color: #86909c; margin: 0; }
.card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.card-title { font-size: 15px; font-weight: 600; color: #1d2129; margin-bottom: 16px; }
.card-desc { font-size: 13px; color: #86909c; margin: 0 0 16px; }
.brand-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.brand-swatch { width: 28px; height: 28px; border-radius: 6px; cursor: pointer; border: 2px solid transparent; box-sizing: border-box; }
.brand-swatch.on { border-color: #165DFF; }
.form-tip { font-size: 12px; color: #86909c; margin-top: 6px; }
</style>
