<template>
  <div class="auth-page">
    <div class="auth-card" v-if="app">
      <div class="auth-header">
        <div class="app-icon">{{ app.icon || '📦' }}</div>
        <h2>{{ app.name }}</h2>
        <p class="app-desc">{{ app.description || '第三方应用' }}</p>
      </div>
      <div class="auth-body">
        <p class="auth-text">该应用请求获取以下权限：</p>
        <ul class="scope-list">
          <li v-for="s in scopeList" :key="s">
            <el-icon><Check /></el-icon>
            <span>{{ scopeText[s] }}</span>
          </li>
        </ul>
        <p class="auth-user">授权账号：<strong>{{ user?.username }}</strong></p>
      </div>
      <div class="auth-footer">
        <el-button size="large" @click="deny">拒绝授权</el-button>
        <el-button type="primary" size="large" @click="allow">同意授权</el-button>
      </div>
    </div>
    <div class="auth-card" v-else-if="error">
      <el-result icon="error" :title="error" sub-title="请检查授权链接是否正确" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';

const route = useRoute();
const router = useRouter();
const app = ref(null);
const user = ref(null);
const error = ref('');

const scopeText = { read: '读取您的方案和场景数据', write: '创建场景和上传全景图' };
const scopeList = ref([]);

onMounted(async () => {
  const token = localStorage.getItem('panorama_token');
  if (!token) {
    // 未登录，先跳转到登录页，登录后回来
    localStorage.setItem('oauth_redirect', location.href);
    router.push('/login');
    return;
  }

  try {
    const { client_id, redirect_uri, scope, state } = route.query;
    const res = await fetch(`/oauth/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&response_type=code&scope=${scope || ''}&state=${state || ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    if (res.error) { error.value = res.error_description || res.error; return; }
    app.value = res.app;
    user.value = res.user;
    scopeList.value = (scope || 'read').split(' ');
    // 保存参数供提交时使用
    window._oauthParams = { client_id, redirect_uri, scope, state };
  } catch (e) {
    error.value = '加载失败';
  }
});

async function allow() {
  const token = localStorage.getItem('panorama_token');
  const params = window._oauthParams || {};
  try {
    const res = await fetch('/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...params, allow: true }),
    }).then(r => r.json());

    if (res.redirect_url) {
      ElMessage.success('授权成功');
      setTimeout(() => { location.href = res.redirect_url; }, 500);
    } else {
      ElMessage.error(res.error || '授权失败');
    }
  } catch (e) { ElMessage.error('授权失败'); }
}

function deny() {
  const params = window._oauthParams || {};
  const sep = params.redirect_uri?.includes('?') ? '&' : '?';
  const url = `${params.redirect_uri}${sep}error=access_denied&state=${encodeURIComponent(params.state || '')}`;
  location.href = url;
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.auth-card {
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  width: 100%;
  max-width: 440px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
.auth-header { text-align: center; margin-bottom: 24px; }
.app-icon { font-size: 56px; margin-bottom: 12px; }
.auth-header h2 { font-size: 22px; color: #1a1b1c; margin-bottom: 4px; }
.app-desc { font-size: 14px; color: #909399; }
.auth-body { margin-bottom: 24px; }
.auth-text { font-size: 14px; color: #606266; margin-bottom: 12px; }
.scope-list { list-style: none; padding: 0; margin: 0 0 16px; }
.scope-list li { display: flex; align-items: center; gap: 8px; padding: 8px 0; color: #303133; font-size: 14px; }
.scope-list li .el-icon { color: #67c23a; }
.auth-user { font-size: 13px; color: #909399; }
.auth-footer { display: flex; gap: 12px; }
.auth-footer .el-button { flex: 1; }
</style>
