<template>
  <div>
    <div class="page-header"><h2 class="page-title">应用中心</h2></div>
    <div class="app-grid">
      <div v-for="app in apps" :key="app.code" class="app-card" @click="enterApp(app)">
        <div class="app-icon">{{ app.icon }}</div>
        <div class="app-name">{{ app.name }}</div>
        <div class="app-desc">{{ app.description }}</div>
        <el-button type="primary" size="small">进入应用</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { customerApiCall } from '../../api';

const router = useRouter();
// 平台内置应用
const builtinApps = [
  { code: 'channel', name: '全端渠道', icon: '📱', description: '管理H5、小程序、公众号、PC网站各端渠道配置与发布', builtin: true },
];
// 解决方案应用映射（code -> 显示信息）
const solutionMap = {
  panorama: { code: 'panorama', name: '360°全景', icon: '🌐', description: '沉浸式360全景展示，支持热点、音乐、解说' },
  card: { code: 'card', name: '智能名片', icon: '💼', description: '平台型智能名片，个人自主创建+企业统一管理' },
};
const apps = ref([]);

onMounted(async () => {
  const list = [...builtinApps];
  try {
    const data = await customerApiCall.get('/profile');
    const solutions = data.customer?.solutions || [];
    solutions.forEach(s => {
      // 兼容字符串和对象两种格式
      const code = typeof s === 'string' ? s : (s.code || s.name);
      const app = solutionMap[code] || { code, name: s.name || code, icon: s.icon || '📦', description: s.description || '' };
      list.push(app);
    });
  } catch (e) {}
  apps.value = list;
});

function enterApp(app) {
  if (app.code === 'panorama') router.push('/apps/panorama/plans');
  else if (app.code === 'channel') router.push('/apps/channel');
  else if (app.code === 'card') window.open('/card/', '_blank');
}
</script>

<style scoped>
.app-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.app-card { background: #fff; border-radius: 10px; padding: 24px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); cursor: pointer; transition: all 0.2s; }
.app-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.1); }
.app-icon { font-size: 48px; margin-bottom: 12px; }
.app-name { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
.app-desc { font-size: 13px; color: #909399; margin-bottom: 16px; min-height: 40px; }
</style>
