<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">
        <div class="logo-icon">全景</div>
        <h1>{{ systemName }}</h1>
        <p>企业级360全景管理平台</p>
      </div>
      <el-form @submit.prevent="handleLogin">
        <el-form-item>
          <el-input v-model="form.username" placeholder="账号" size="large" prefix-icon="User" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="密码" size="large" prefix-icon="Lock" show-password />
        </el-form-item>
        <el-button type="primary" size="large" style="width:100%" :loading="loading" @click="handleLogin">登录</el-button>
      </el-form>
      <p v-if="error" class="login-error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const systemName = ref('全景云平台');
const form = reactive({ username: '', password: '' });

onMounted(async () => {
  try {
    const res = await fetch('/api/settings/public').then(r => r.json());
    systemName.value = res.siteName || '全景云平台';
  } catch (e) {}
});

async function handleLogin() {
  if (!form.username || !form.password) { error.value = '请输入账号和密码'; return; }
  loading.value = true; error.value = '';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).then(r => r.json());
    if (!res.token) throw new Error(res.error || '登录失败');
    if (!['tenant_admin', 'tenant_member'].includes(res.user.role)) throw new Error('该账号无权访问客户工作台');
    localStorage.setItem('customer_token', res.token);
    localStorage.setItem('customer_user', JSON.stringify(res.user));
    ElMessage.success('登录成功');
    router.push('/dashboard');
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
</script>

<style scoped>
.login-page { height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.login-card { width: 380px; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
.login-logo { text-align: center; margin-bottom: 24px; }
.logo-icon { width: 56px; height: 56px; background: #165DFF; color: #fff; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; margin-bottom: 12px; }
.login-logo h1 { font-size: 20px; color: #1a1b1c; margin-bottom: 4px; }
.login-logo p { font-size: 13px; color: #909399; }
.login-error { color: #f56c6c; font-size: 13px; text-align: center; margin-top: 12px; }
</style>
