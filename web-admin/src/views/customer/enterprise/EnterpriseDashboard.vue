<template>
  <div class="ent-dashboard">
    <!-- 页头 -->
    <div class="page-header">
      <div>
        <h2 class="page-title">企业工作台</h2>
        <p class="page-desc">本企业数据概览，仅包含本企业员工与客户，与其他企业数据隔离</p>
      </div>
      <button class="btn-primary" @click="router.push('/enterprise/settings')">企业设置</button>
    </div>

    <div v-if="enterprise" class="ent-banner">
      <div class="ent-logo" v-if="enterprise.logo">
        <img :src="enterprise.logo" alt="logo" />
      </div>
      <div class="ent-logo placeholder" v-else>{{ (enterprise.name || '企')[0] }}</div>
      <div class="ent-info">
        <div class="ent-name">{{ enterprise.name }}</div>
        <div class="ent-meta">
          <span>{{ enterprise.industry || '未设置行业' }}</span>
          <span v-if="enterprise.scale">· {{ enterprise.scale }}</span>
          <span v-if="enterprise.inviteCode">· 口令 {{ enterprise.inviteCode }}</span>
        </div>
        <div class="ent-desc">{{ enterprise.description || '暂无企业简介' }}</div>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(0,180,42,0.1); color: #00b42a;">
          <SIcon name="team" size="default" />
        </div>
        <div class="stat-num">{{ stats.employeeCount }}</div>
        <div class="stat-label">企业员工</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(22,93,255,0.1); color: #165dff;">
          <SIcon name="card" size="default" />
        </div>
        <div class="stat-num">{{ stats.cardCount }}</div>
        <div class="stat-label">员工名片</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(255,125,0,0.1); color: #ff7d00;">
          <SIcon name="customer" size="default" />
        </div>
        <div class="stat-num">{{ stats.customerCount }}</div>
        <div class="stat-label">企业客户</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(114,46,209,0.1); color: #722ed1;">
          <SIcon name="pool" size="default" />
        </div>
        <div class="stat-num">{{ stats.poolAvailable }}<span class="stat-sub">/{{ stats.poolClaimed }}</span></div>
        <div class="stat-label">企业公海（可用/已领）</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(0,131,143,0.1); color: #00838f;">
          <SIcon name="radar" size="default" />
        </div>
        <div class="stat-num">{{ stats.totalViews }}</div>
        <div class="stat-label">名片总访问</div>
      </div>
    </div>

    <!-- 快捷操作 -->
    <div class="quick-grid">
      <div class="quick-card" @click="router.push('/enterprise/employees')">
        <div class="quick-icon"><SIcon name="team" size="large" /></div>
        <div class="quick-title">员工管理</div>
        <div class="quick-desc">添加员工、设置企业管理员、查看名片数据</div>
      </div>
      <div class="quick-card" @click="router.push('/enterprise/pool')">
        <div class="quick-icon"><SIcon name="pool" size="large" /></div>
        <div class="quick-title">企业公海</div>
        <div class="quick-desc">查看公海客户，领取分配给员工跟进</div>
      </div>
      <div class="quick-card" @click="router.push('/enterprise/settings')">
        <div class="quick-icon"><SIcon name="settings" size="large" /></div>
        <div class="quick-title">企业设置</div>
        <div class="quick-desc">企业品牌信息、加入口令、公海回流规则</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { customerApiCall } from '../../../api';
import SIcon from '../../../components/SIcon.vue';

const router = useRouter();
const enterprise = ref(null);
const stats = ref({ employeeCount: 0, cardCount: 0, customerCount: 0, poolAvailable: 0, poolClaimed: 0, totalViews: 0 });

onMounted(async () => {
  try {
    const res = await customerApiCall.get('/enterprise/me');
    enterprise.value = res.enterprise;
    stats.value = res.stats;
  } catch (e) {
    ElMessage.error(e || '加载失败');
  }
});
</script>

<style scoped>
.ent-dashboard { display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909c; margin: 4px 0 0; }
.btn-primary { background: #165dff; color: #fff; border: none; border-radius: 8px; padding: 9px 20px; font-size: 14px; cursor: pointer; transition: opacity 0.2s; }
.btn-primary:hover { opacity: 0.85; }

.ent-banner { background: #fff; border-radius: 8px; padding: 20px; display: flex; gap: 16px; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.ent-logo { width: 56px; height: 56px; border-radius: 14px; overflow: hidden; flex-shrink: 0; }
.ent-logo img { width: 100%; height: 100%; object-fit: cover; }
.ent-logo.placeholder { background: rgba(22,93,255,0.08); color: #165dff; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 600; }
.ent-name { font-size: 18px; font-weight: 600; color: #1d2129; }
.ent-meta { font-size: 12px; color: #86909c; margin-top: 4px; display: flex; gap: 8px; }
.ent-desc { font-size: 13px; color: #4e5969; margin-top: 6px; }

.stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.stat-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); display: flex; flex-direction: column; gap: 8px; }
.stat-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
.stat-num { font-size: 26px; font-weight: 600; color: #1d2129; line-height: 1.2; }
.stat-sub { font-size: 14px; color: #86909c; font-weight: 400; }
.stat-label { font-size: 13px; color: #86909c; }

.quick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.quick-card { background: #fff; border-radius: 8px; padding: 20px; cursor: pointer; border: 1px solid #f2f3f5; transition: box-shadow 0.2s, border-color 0.2s; }
.quick-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-color: #e8f3ff; }
.quick-icon { color: #165dff; margin-bottom: 12px; }
.quick-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.quick-desc { font-size: 12px; color: #86909c; margin-top: 4px; }
</style>
