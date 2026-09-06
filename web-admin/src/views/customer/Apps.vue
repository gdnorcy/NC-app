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
const apps = ref([{ code: 'panorama', name: '360°全景', icon: '🌐', description: '沉浸式360全景展示，支持热点、音乐、解说' }]);

onMounted(async () => {
  try {
    const data = await customerApiCall.get('/profile');
    if (data.customer?.solutions) {
      apps.value = data.customer.solutions.map(s => ({
        code: s.code || s.name, name: s.name, icon: s.icon || '📦', description: s.description || '',
      }));
    }
  } catch (e) {}
});

function enterApp(app) {
  if (app.code === 'panorama') router.push('/apps/panorama/plans');
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
