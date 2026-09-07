<template>
  <div>
    <div class="page-header"><h2 class="page-title">应用中心</h2></div>
    <div class="app-grid">
      <div v-for="app in apps" :key="app.code" class="app-card" @click="enterApp(app)">
        <div class="app-icon-wrap">
          <SIcon :name="app.icon" size="xlarge" class="app-icon" />
        </div>
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
import SIcon from '../../components/SIcon.vue';

const router = useRouter();
// 平台内置应用
const builtinApps = [
  { code: 'channel', name: '全端渠道', icon: 'devices', description: '管理H5、小程序、公众号、PC网站各端渠道配置与发布', builtin: true },
];
// 解决方案应用映射（code -> 显示信息）
const solutionMap = {
  panorama: { code: 'panorama', name: '360°全景', icon: 'panorama', description: '沉浸式360全景展示，支持热点、音乐、解说' },
  card: { code: 'card', name: '智能名片', icon: 'card', description: '平台型智能名片，个人自主创建+企业统一管理' },
};
const apps = ref([]);

onMounted(async () => {
  const list = [...builtinApps];
  try {
    const data = await customerApiCall.get('/profile');
    const solutions = data.customer?.solutions || [];
    solutions.forEach(s => {
      const code = typeof s === 'string' ? s : (s.code || s.name);
      if (!code || typeof code !== 'string') return;
      const app = solutionMap[code] || { code, name: s.name || code, icon: 'template', description: s.description || '' };
      list.push(app);
    });
  } catch (e) {}
  apps.value = list;
});

function enterApp(app) {
  if (app.code === 'panorama') router.push('/apps/panorama');
  else if (app.code === 'channel') router.push('/apps/channel');
  else if (app.code === 'card') router.push('/apps/card');
}
</script>

<style scoped>
.app-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.app-card { background: #fff; border-radius: 10px; padding: 28px 24px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); cursor: pointer; transition: all 0.2s; }
.app-card:hover { box-shadow: 0 4px 16px rgba(22,93,255,0.12); }
.app-card:hover .app-icon-wrap { background: rgba(22,93,255,0.12); }
.app-card:hover .app-icon { color: #165dff; }
.app-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: rgba(22,93,255,0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  transition: all 0.2s;
}
.app-icon { color: #4e5969; transition: color 0.2s; }
.app-name { font-size: 16px; font-weight: 600; color: #1d2129; margin-bottom: 8px; }
.app-desc { font-size: 13px; color: #86909c; margin-bottom: 16px; min-height: 40px; line-height: 1.5; }
</style>
