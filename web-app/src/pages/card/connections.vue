<template>
  <view class="connections-page">
    <view class="header">
      <view class="title">我的人脉</view>
      <view class="subtitle">已交换名片的联系人</view>
    </view>

    <!-- 统计 -->
    <view class="stats-bar">
      <view class="stat-item">
        <view class="stat-num">{{ connections.length }}</view>
        <view class="stat-label">人脉总数</view>
      </view>
      <view class="stat-item">
        <view class="stat-num">{{ pendingCount }}</view>
        <view class="stat-label">待处理</view>
      </view>
    </view>

    <!-- Tab切换 -->
    <view class="tabs">
      <view class="tab" :class="{ active: activeTab === 'connections' }" @click="activeTab = 'connections'">人脉库</view>
      <view class="tab" :class="{ active: activeTab === 'pending' }" @click="activeTab = 'pending'">
        待处理
        <view class="tab-badge" v-if="pendingCount">{{ pendingCount }}</view>
      </view>
    </view>

    <!-- 人脉列表 -->
    <view class="list" v-if="activeTab === 'connections'">
      <view class="contact-card" v-for="conn in connections" :key="conn.id">
        <view class="contact-main" @click="viewContact(conn)">
          <view class="contact-avatar">{{ conn.contactName?.[0] || '名' }}</view>
          <view class="contact-info">
            <view class="contact-name">{{ conn.contactName }}</view>
            <view class="contact-position">{{ conn.contactPosition || '未设置职位' }}</view>
            <view class="contact-time">交换于 {{ formatTime(conn.exchangedAt) }}</view>
          </view>
          <SIcon name="customer" size="small" color="#c9cdd4" />
        </view>
        <view class="contact-actions">
          <view class="action-btn convert" @click="convertToCustomer(conn)">转为客户</view>
        </view>
      </view>
      <view class="empty" v-if="!connections.length">
        <SIcon name="exchange" size="xlarge" color="#c9cdd4" />
        <view class="empty-text">还没有人脉</view>
        <view class="empty-hint">去人脉集市交换名片吧</view>
      </view>
    </view>

    <!-- 待处理列表 -->
    <view class="list" v-if="activeTab === 'pending'">
      <view class="request-card" v-for="req in pendingRequests" :key="req.id">
        <view class="request-header">
          <view class="request-avatar">{{ req.fromName?.[0] || '名' }}</view>
          <view class="request-info">
            <view class="request-name">{{ req.fromName }}</view>
            <view class="request-msg" v-if="req.message">{{ req.message }}</view>
            <view class="request-time">{{ formatTime(req.createdAt) }}</view>
          </view>
        </view>
        <view class="request-actions">
          <view class="action-btn reject" @click="handleRequest(req.id, 'reject')">拒绝</view>
          <view class="action-btn accept" @click="handleRequest(req.id, 'accept')">接受</view>
        </view>
      </view>
      <view class="empty" v-if="!pendingRequests.length">
        <SIcon name="audit" size="xlarge" color="#c9cdd4" />
        <view class="empty-text">暂无待处理请求</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import SIcon from '../../components/SIcon.vue';

const connections = ref([]);
const requests = ref([]);
const activeTab = ref('connections');

const pendingRequests = computed(() => requests.value.filter(r => r.status === 'pending' && r.toUserId === currentUserId));
const pendingCount = computed(() => pendingRequests.value.length);
const currentUserId = ref(0);

onMounted(async () => {
  const profile = await cardApi.getProfile().catch(() => ({}));
  currentUserId.value = profile.id || 0;
  loadData();
});

async function loadData() {
  try {
    const [connRes, reqRes] = await Promise.all([
      cardApi.getConnections(),
      cardApi.getExchangeList()
    ]);
    connections.value = connRes.connections || [];
    requests.value = reqRes.requests || [];
  } catch (e) {
    console.error('加载人脉失败', e);
  }
}

async function handleRequest(id, action) {
  try {
    await cardApi.exchangeHandle({ connectionId: id, action });
    loadData();
  } catch (e) {
    console.error('处理失败', e);
  }
}

function viewContact(conn) {
  // 查看联系人详情
}

async function convertToCustomer(conn) {
  try {
    uni.showModal({
      title: '转为客户',
      content: `确定将「${conn.contactName}」转为您的客户吗？`,
      success: async (res) => {
        if (res.confirm) {
          await cardApi.convertConnectionToCustomer(conn.id);
          uni.showToast({ title: '已转为客户', icon: 'success' });
        }
      }
    });
  } catch (e) {
    uni.showToast({ title: e.message || '转换失败', icon: 'none' });
  }
}

function formatTime(time) {
  if (!time) return '';
  return time.replace('T', ' ').substring(0, 16);
}
</script>

<style scoped>
.connections-page { min-height: 100vh; background: #f5f7fa; padding-bottom: 40px; }
.header { background: linear-gradient(135deg, #165dff, #4080ff); padding: 40px 20px 30px; }
.title { font-size: 22px; font-weight: 600; color: #fff; }
.subtitle { font-size: 13px; color: rgba(255,255,255,0.8); margin-top: 4px; }

.stats-bar { display: flex; background: #fff; margin: -20px 16px 0; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.stat-item { flex: 1; text-align: center; }
.stat-num { font-size: 24px; font-weight: 600; color: #165dff; }
.stat-label { font-size: 12px; color: #86909c; margin-top: 4px; }

.tabs { display: flex; padding: 16px; gap: 8px; }
.tab { flex: 1; text-align: center; padding: 10px; font-size: 14px; color: #4e5969; background: #fff; border-radius: 8px; position: relative; }
.tab.active { background: #165dff; color: #fff; }
.tab-badge { position: absolute; top: 4px; right: 20px; background: #f53f3f; color: #fff; font-size: 10px; min-width: 16px; height: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 4px; }

.list { padding: 0 16px; }
.contact-card { background: #fff; border-radius: 12px; padding: 14px; margin-bottom: 10px; }
.contact-main { display: flex; align-items: center; gap: 12px; }
.contact-actions { display: flex; justify-content: flex-end; margin-top: 10px; padding-top: 10px; border-top: 1px solid #f2f3f5; }
.action-btn.convert { background: rgba(22,93,255,0.08); color: #165dff; padding: 6px 16px; border-radius: 14px; font-size: 12px; }
.contact-avatar { width: 44px; height: 44px; border-radius: 22px; background: linear-gradient(135deg, #165dff, #4080ff); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; }
.contact-info { flex: 1; }
.contact-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.contact-position { font-size: 12px; color: #86909c; margin-top: 2px; }
.contact-time { font-size: 11px; color: #c9cdd4; margin-top: 2px; }

.request-card { background: #fff; border-radius: 12px; padding: 14px; margin-bottom: 10px; }
.request-header { display: flex; gap: 12px; }
.request-avatar { width: 44px; height: 44px; border-radius: 22px; background: linear-gradient(135deg, #722ed1, #9254de); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; }
.request-info { flex: 1; }
.request-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.request-msg { font-size: 13px; color: #4e5969; margin-top: 4px; }
.request-time { font-size: 11px; color: #c9cdd4; margin-top: 4px; }
.request-actions { display: flex; gap: 10px; margin-top: 12px; justify-content: flex-end; }
.action-btn { padding: 6px 20px; border-radius: 16px; font-size: 13px; }
.action-btn.reject { background: #f2f3f5; color: #4e5969; }
.action-btn.accept { background: #165dff; color: #fff; }

.empty { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; }
.empty-text { font-size: 15px; color: #4e5969; margin-top: 16px; }
.empty-hint { font-size: 13px; color: #86909c; margin-top: 4px; }
</style>
