<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">
        <div class="logo-icon">全景</div>
        <h1>360全景管理后台</h1>
        <p>企业级360全景管理平台</p>
      </div>
      <el-tabs v-model="loginType" class="login-tabs">
        <el-tab-pane label="账号登录" name="account">
          <el-form @submit.prevent="handleLogin">
            <el-form-item>
              <el-input v-model="form.username" placeholder="账号" size="large" prefix-icon="User" />
            </el-form-item>
            <el-form-item>
              <el-input v-model="form.password" type="password" placeholder="密码" size="large" prefix-icon="Lock" show-password />
            </el-form-item>
            <el-button type="primary" size="large" style="width:100%" :loading="loading" @click="handleLogin">
              登录
            </el-button>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="手机号登录" name="phone">
          <el-form @submit.prevent="handlePhoneLogin">
            <el-form-item>
              <el-input v-model="phoneForm.phone" placeholder="手机号" size="large" prefix-icon="Phone" />
            </el-form-item>
            <el-form-item>
              <div style="display:flex;gap:8px;">
                <el-input v-model="phoneForm.code" placeholder="验证码" size="large" prefix-icon="Key" />
                <el-button :disabled="countdown > 0" @click="sendCode">
                  {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
                </el-button>
              </div>
            </el-form-item>
            <el-button type="primary" size="large" style="width:100%" :loading="loading" @click="handlePhoneLogin">
              登录
            </el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>
      <p v-if="error" class="login-error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { sendSmsCode } from '../../api';
import { ElMessage } from 'element-plus';

const router = useRouter();
const authStore = useAuthStore();

const loginType = ref('account');
const loading = ref(false);
const error = ref('');
const countdown = ref(0);
const form = reactive({ username: '', password: '' });
const phoneForm = reactive({ phone: '', code: '' });

async function handleLogin() {
  if (!form.username || !form.password) { error.value = '请输入账号和密码'; return; }
  loading.value = true; error.value = '';
  try {
    await authStore.login(form.username, form.password);
    ElMessage.success('登录成功');
    router.push('/dashboard');
  } catch (e) { error.value = e; }
  finally { loading.value = false; }
}

async function sendCode() {
  if (!phoneForm.phone) { error.value = '请输入手机号'; return; }
  try {
    await sendSmsCode(phoneForm.phone);
    ElMessage.success('验证码已发送');
    countdown.value = 60;
    const timer = setInterval(() => {
      countdown.value--;
      if (countdown.value <= 0) clearInterval(timer);
    }, 1000);
  } catch (e) { error.value = e; }
}

async function handlePhoneLogin() {
  if (!phoneForm.phone || !phoneForm.code) { error.value = '请输入手机号和验证码'; return; }
  loading.value = true; error.value = '';
  try {
    await authStore.loginByPhone(phoneForm.phone, phoneForm.code);
    ElMessage.success('登录成功');
    router.push('/dashboard');
  } catch (e) { error.value = e; }
  finally { loading.value = false; }
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.login-card {
  width: 400px;
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
.login-logo { text-align: center; margin-bottom: 24px; }
.logo-icon {
  width: 56px; height: 56px;
  background: #165DFF;
  color: #fff;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 12px;
}
.login-logo h1 { font-size: 20px; color: #1a1b1c; margin-bottom: 4px; }
.login-logo p { font-size: 13px; color: #909399; }
.login-tabs { margin-top: 16px; }
.login-error { color: #f56c6c; font-size: 13px; text-align: center; margin-top: 12px; }
</style>
