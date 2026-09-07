<template>
  <view class="conn-page">
    <!-- 顶部导航栏 -->
    <view class="nav-bar">
      <view class="nav-back" @click="goBack">
        <SIcon name="dynamic" size="default" color="#1a1a1a" />
      </view>
      <view class="nav-title">我的人脉库</view>
      <view class="nav-right"></view>
    </view>

    <!-- 统计与筛选 -->
    <view class="stats-row">
      <view class="stat-item">
        <view class="stat-num">{{ list.length }}</view>
        <view class="stat-label">全部人脉</view>
      </view>
      <view class="stat-item">
        <view class="stat-num">{{ enterpriseCount }}</view>
        <view class="stat-label">企业人脉</view>
      </view>
      <view class="stat-item">
        <view class="stat-num">{{ personalCount }}</view>
        <view class="stat-label">个人人脉</view>
      </view>
    </view>

    <view class="filter-tabs">
      <view v-for="t in tabs" :key="t.value" class="filter-tab" :class="{ on: activeTab === t.value }" @click="activeTab = t.value">
        {{ t.label }}
      </view>
    </view>

    <!-- 空状态 -->
    <view v-if="!loading && filtered.length === 0" class="empty">
      <view class="empty-icon"><SIcon name="market" size="large" color="#9a9a9a" /></view>
      <view class="empty-title">还没有人脉</view>
      <view class="empty-desc">去集市逛逛，向感兴趣的人发起名片交换</view>
      <view class="empty-btn" @click="goMarket">去人脉集市</view>
    </view>

    <!-- 列表 -->
    <view v-if="filtered.length" class="conn-list">
      <view v-for="c in filtered" :key="c.id" class="conn-item">
        <view class="avatar" :style="{ background: avatarBg(c) }">
          <image v-if="c.contact_avatar" class="avatar-img" :src="c.contact_avatar" mode="aspectFill" />
          <text v-else class="avatar-text">{{ (c.contact_name || '?').slice(0, 1) }}</text>
        </view>
        <view class="info" @click="editConn(c)">
          <view class="name-row">
            <text class="c-name">{{ c.contact_name }}</text>
            <text v-if="c.group_name" class="group-tag">{{ c.group_name }}</text>
          </view>
          <view class="c-sub">
            <text v-if="c.contact_position">{{ c.contact_position }}</text>
            <text v-if="c.contact_position && c.contact_company"> · </text>
            <text v-if="c.contact_company">{{ c.contact_company }}</text>
            <text v-else-if="!c.contact_position" class="dim">已交换名片</text>
          </view>
          <view class="c-time">{{ fmtTime(c.exchanged_at) }}</view>
        </view>
        <view class="ops">
          <view class="op-btn primary" @click="convert(c)">转客户</view>
          <view class="op-btn danger" @click="remove(c)">删除</view>
        </view>
      </view>
    </view>

    <!-- 编辑弹层：分组/备注 -->
    <view v-if="showEdit" class="mask" @click="closeEdit">
      <view class="sheet" @click.stop>
        <view class="sheet-title">人脉备注</view>
        <view class="field">
          <view class="field-label">分组</view>
          <view class="group-options">
            <view v-for="g in groupOptions" :key="g" class="group-opt" :class="{ on: editForm.groupName === g }" @click="editForm.groupName = editForm.groupName === g ? '' : g">{{ g }}</view>
          </view>
          <input class="field-input" v-model="editForm.groupName" placeholder="自定义分组名称（如：商会老乡）" placeholder-class="ph" />
        </view>
        <view class="field">
          <view class="field-label">备注</view>
          <input class="field-input" v-model="editForm.remark" placeholder="填写备注，方便记住对方" placeholder-class="ph" />
        </view>
        <view class="sheet-actions">
          <view class="sheet-btn cancel" @click="closeEdit">取消</view>
          <view class="sheet-btn ok" @click="saveEdit">保存</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { trackPageView } from '../../utils/analytics.js';

const list = ref([]);
const loading = ref(true);
const activeTab = ref('all');
const tabs = [
  { label: '全部', value: 'all' },
  { label: '企业', value: 'company' },
  { label: '个人', value: 'personal' },
];
const groupOptions = ['商会老乡', '合作伙伴', '客户线索', '亲友'];

const showEdit = ref(false);
const editConnId = ref(null);
const editForm = ref({ groupName: '', remark: '' });

const filtered = computed(() => {
  if (activeTab.value === 'all') return list.value;
  if (activeTab.value === 'company') return list.value.filter((c) => c.contact_company);
  return list.value.filter((c) => !c.contact_company);
});

const enterpriseCount = computed(() => list.value.filter((c) => c.contact_company).length);
const personalCount = computed(() => list.value.filter((c) => !c.contact_company).length);

const avatarBg = (c) => {
  const colors = ['#E9F1FB', '#E8F7EF', '#FDF0E3', '#F3ECFE', '#FDECEC'];
  const idx = Math.abs(String(c.contact_name || '').charCodeAt(0) || 0) % colors.length;
  return colors[idx];
};

const fmtTime = (t) => {
  if (!t) return '';
  const d = new Date(String(t).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(t).slice(0, 10);
  const now = new Date();
  const diff = now - d;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 3600 * 1000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 24 * 3600 * 1000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 7 * 24 * 3600 * 1000) return Math.floor(diff / 86400000) + '天前';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const load = async () => {
  loading.value = true;
  try {
    const res = await cardApi.getConnections();
    list.value = res.connections || [];
  } catch (e) {
    uni.showToast({ title: String(e || '加载失败'), icon: 'none' });
  } finally {
    loading.value = false;
  }
};

const editConn = (c) => {
  editConnId.value = c.id;
  editForm.value = { groupName: c.group_name || '', remark: c.remark || '' };
  showEdit.value = true;
};

const closeEdit = () => {
  showEdit.value = false;
  editConnId.value = null;
};

const saveEdit = async () => {
  if (!editConnId.value) return;
  try {
    await cardApi.updateConnection(editConnId.value, {
      groupName: editForm.value.groupName || '',
      remark: editForm.value.remark || '',
    });
    uni.showToast({ title: '已保存', icon: 'success' });
    closeEdit();
    load();
  } catch (e) {
    uni.showToast({ title: String(e || '保存失败'), icon: 'none' });
  }
};

const convert = (c) => {
  uni.showModal({
    title: '转为客户线索',
    content: `将「${c.contact_name}」转为我的客户线索？转为客户后仍可保留人脉关系。`,
    confirmText: '转为客户',
    confirmColor: '#07C160',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        const res = await cardApi.convertConnectionToCustomer(c.id);
        uni.showToast({ title: res.message || '已转为客户线索', icon: 'success' });
        load();
      } catch (e) {
        uni.showToast({ title: String(e || '操作失败'), icon: 'none' });
      }
    },
  });
};

const remove = (c) => {
  uni.showModal({
    title: '删除人脉',
    content: `确认删除「${c.contact_name}」？已转客户不受影响。`,
    confirmText: '删除',
    confirmColor: '#FF4D4F',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await cardApi.deleteConnection(c.id);
        uni.showToast({ title: '已删除', icon: 'success' });
        load();
      } catch (e) {
        uni.showToast({ title: String(e || '操作失败'), icon: 'none' });
      }
    },
  });
};

const goBack = () => uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/cardMain/home' }) });
const goMarket = () => uni.redirectTo({ url: '/pages/card/market' });

onShow(() => {
  trackPageView('/pages/card/connections');
  load();
});
onMounted(load);
</script>

<style scoped>
.conn-page { min-height: 100vh; background: var(--bg, #f5f6f7); padding-bottom: 60rpx; }

.nav-bar { display: flex; align-items: center; height: 88rpx; padding: 88rpx 32rpx 0; background: #fff; position: sticky; top: 0; z-index: 10; }
.nav-back { width: 64rpx; height: 64rpx; display: flex; align-items: center; justify-content: center; margin-left: -12rpx; }
.nav-title { flex: 1; font-size: 34rpx; font-weight: 600; color: #1a1a1a; }
.nav-right { width: 64rpx; }

.stats-row { display: flex; background: #fff; margin: 20rpx 24rpx 0; border-radius: 24rpx; padding: 28rpx 0; box-shadow: var(--shadow, 0 4rpx 14rpx rgba(20, 40, 70, 0.08)); }
.stat-item { flex: 1; text-align: center; }
.stat-num { font-size: 40rpx; font-weight: 700; color: #1a1a1a; }
.stat-label { font-size: 22rpx; color: #9a9a9a; margin-top: 4rpx; }

.filter-tabs { display: flex; gap: 12rpx; padding: 20rpx 24rpx 4rpx; }
.filter-tab { padding: 10rpx 30rpx; border-radius: 999rpx; background: #fff; font-size: 24rpx; color: #5b5b5b; border: 1rpx solid #eee; }
.filter-tab.on { background: var(--blue-soft, #e9f1fb); color: var(--blue, #1d4e8f); border-color: transparent; font-weight: 500; }

.empty { padding: 120rpx 40rpx; text-align: center; }
.empty-icon { width: 96rpx; height: 96rpx; margin: 0 auto 24rpx; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow, 0 4rpx 14rpx rgba(20, 40, 70, 0.08)); }
.empty-title { font-size: 30rpx; font-weight: 600; color: #1a1a1a; }
.empty-desc { font-size: 24rpx; color: #9a9a9a; margin-top: 10rpx; }
.empty-btn { display: inline-block; margin-top: 36rpx; padding: 16rpx 56rpx; background: var(--wx, #07c160); color: #fff; font-size: 28rpx; border-radius: 999rpx; }

.conn-list { padding: 16rpx 24rpx; display: flex; flex-direction: column; gap: 16rpx; }
.conn-item { background: #fff; border-radius: 24rpx; padding: 24rpx; display: flex; align-items: center; gap: 20rpx; box-shadow: var(--shadow, 0 4rpx 14rpx rgba(20, 40, 70, 0.06)); }
.avatar { width: 88rpx; height: 88rpx; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.avatar-img { width: 100%; height: 100%; }
.avatar-text { font-size: 34rpx; font-weight: 600; color: var(--blue, #1d4e8f); }
.info { flex: 1; min-width: 0; }
.name-row { display: flex; align-items: center; gap: 12rpx; }
.c-name { font-size: 30rpx; font-weight: 600; color: #1a1a1a; }
.group-tag { font-size: 20rpx; color: var(--blue, #1d4e8f); background: var(--blue-soft, #e9f1fb); padding: 4rpx 14rpx; border-radius: 999rpx; }
.c-sub { font-size: 24rpx; color: #5b5b5b; margin-top: 6rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c-sub .dim { color: #9a9a9a; }
.c-time { font-size: 20rpx; color: #9a9a9a; margin-top: 6rpx; }
.ops { display: flex; flex-direction: column; gap: 12rpx; flex-shrink: 0; }
.op-btn { font-size: 24rpx; padding: 10rpx 26rpx; border-radius: 999rpx; text-align: center; }
.op-btn.primary { color: #07c160; background: #e8f7ef; }
.op-btn.danger { color: #ff4d4f; background: #fdecec; }

.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); z-index: 100; display: flex; align-items: flex-end; }
.sheet { width: 100%; background: #fff; border-radius: 32rpx 32rpx 0 0; padding: 36rpx 32rpx 40rpx; box-sizing: border-box; }
.sheet-title { font-size: 32rpx; font-weight: 600; color: #1a1a1a; text-align: center; margin-bottom: 28rpx; }
.field { margin-bottom: 24rpx; }
.field-label { font-size: 24rpx; color: #5b5b5b; margin-bottom: 12rpx; }
.group-options { display: flex; flex-wrap: wrap; gap: 14rpx; margin-bottom: 16rpx; }
.group-opt { padding: 10rpx 28rpx; border-radius: 999rpx; background: #f5f6f7; font-size: 24rpx; color: #5b5b5b; border: 1rpx solid #eee; }
.group-opt.on { background: var(--blue-soft, #e9f1fb); color: var(--blue, #1d4e8f); border-color: transparent; }
.field-input { background: #f5f6f7; border-radius: 16rpx; padding: 20rpx 24rpx; font-size: 28rpx; color: #1a1a1a; }
.ph { color: #9a9a9a; }
.sheet-actions { display: flex; gap: 20rpx; margin-top: 32rpx; }
.sheet-btn { flex: 1; text-align: center; padding: 22rpx 0; border-radius: 999rpx; font-size: 30rpx; }
.sheet-btn.cancel { background: #f5f6f7; color: #5b5b5b; }
.sheet-btn.ok { background: var(--wx, #07c160); color: #fff; font-weight: 500; }
</style>
