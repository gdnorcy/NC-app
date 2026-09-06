<template>
  <view class="market-page">
    <view class="header">
      <view class="title">人脉集市</view>
      <view class="subtitle">发现优质人脉，拓展商业机会</view>
    </view>

    <!-- 搜索 -->
    <view class="search-bar">
      <view class="search-box">
        <SIcon name="dynamic" size="small" color="#86909c" />
        <input class="search-input" v-model="keyword" placeholder="搜索姓名/公司/职位" placeholder-class="ph" @confirm="search"/>
      </view>
    </view>

    <!-- 类型筛选 -->
    <view class="type-filter">
      <view class="type-tag" :class="{ active: filterType === 'all' }" @click="selectType('all')">全部</view>
      <view class="type-tag" :class="{ active: filterType === 'individual', 'type-individual': true }" @click="selectType('individual')">个人</view>
      <view class="type-tag" :class="{ active: filterType === 'enterprise', 'type-enterprise': true }" @click="selectType('enterprise')">企业</view>
      <view class="type-tag" :class="{ active: filterType === 'employee', 'type-employee': true }" @click="selectType('employee')">员工</view>
    </view>

    <!-- 名片列表 -->
    <view class="card-list" v-if="items.length">
      <!-- 个人名片 -->
      <view class="market-card card-individual" v-for="item in items.filter(i => i.subjectType === 'individual')" :key="'ind-'+item.id" @click="viewCard(item)">
        <view class="card-left-bar bar-individual"></view>
        <view class="card-badge badge-individual">个人</view>
        <view class="card-header">
          <view class="card-avatar avatar-individual">{{ item.name?.[0] || '名' }}</view>
          <view class="card-info">
            <view class="card-name">{{ item.name }}</view>
            <view class="card-position">{{ item.position || '未设置职位' }}</view>
          </view>
          <view class="exchange-btn" @click.stop="quickExchange(item)">交换</view>
        </view>
        <view class="card-footer">
          <view class="footer-tag">入驻个人</view>
        </view>
      </view>

      <!-- 企业名片 -->
      <view class="market-card card-enterprise" v-for="item in items.filter(i => i.subjectType === 'enterprise')" :key="'ent-'+item.id" @click="viewCard(item)">
        <view class="card-left-bar bar-enterprise"></view>
        <view class="card-badge badge-enterprise">企业 ✓</view>
        <view class="card-header">
          <view class="card-avatar avatar-enterprise">{{ item.name?.[0] || '企' }}</view>
          <view class="card-info">
            <view class="card-name">{{ item.name }}</view>
            <view class="card-position">企业主体 · 已认证</view>
          </view>
          <view class="exchange-btn btn-enterprise" @click.stop="quickExchange(item)">交换</view>
        </view>
        <view class="card-footer">
          <view class="footer-tag">入驻企业</view>
        </view>
      </view>

      <!-- 员工名片 -->
      <view class="market-card card-employee" v-for="item in items.filter(i => i.subjectType === 'employee')" :key="'emp-'+item.id" @click="viewCard(item)">
        <view class="card-left-bar bar-employee"></view>
        <view class="card-badge badge-employee">员工</view>
        <view class="card-header">
          <view class="card-avatar avatar-employee">{{ item.name?.[0] || '员' }}</view>
          <view class="card-info">
            <view class="card-name">{{ item.name }}</view>
            <view class="card-position">{{ item.position || '未设置职位' }}</view>
          </view>
          <view class="exchange-btn btn-employee" @click.stop="quickExchange(item)">交换</view>
        </view>
        <view class="card-footer">
          <view class="footer-tag">所属：{{ item.companyName || '未知企业' }}</view>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <SIcon name="market" size="xlarge" color="#c9cdd4" />
      <view class="empty-text">暂无公开名片</view>
      <view class="empty-hint">成为第一个公开名片的人吧</view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import SIcon from '../../components/SIcon.vue';

const items = ref([]);
const keyword = ref('');
const filterType = ref('all');

onMounted(() => loadMarket());

async function loadMarket() {
  try {
    const res = await cardApi.getMarketList({ type: filterType.value, keyword: keyword.value });
    items.value = res.items || [];
  } catch (e) {
    console.error('加载集市失败', e);
  }
}

function selectType(type) {
  filterType.value = type;
  loadMarket();
}

function search() {
  loadMarket();
}

function viewCard(item) {
  // 查看名片详情
}

function quickExchange(item) {
  // 发起名片交换
}
</script>

<style scoped>
.market-page { min-height: 100vh; background: #f5f7fa; padding-bottom: 40px; }
.header { background: linear-gradient(135deg, #165dff, #4080ff); padding: 40px 20px 30px; }
.title { font-size: 22px; font-weight: 600; color: #fff; }
.subtitle { font-size: 13px; color: rgba(255,255,255,0.8); margin-top: 4px; }

.search-bar { padding: 12px 16px; margin-top: -20px; }
.search-box { background: #fff; border-radius: 10px; padding: 10px 14px; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.search-input { flex: 1; font-size: 14px; }
.ph { color: #c9cdd4; }

.type-filter { display: flex; gap: 8px; padding: 0 16px 12px; }
.type-tag { padding: 6px 14px; border-radius: 16px; font-size: 12px; background: #fff; color: #4e5969; border: 1px solid #e5e6eb; }
.type-tag.active { background: #165dff; color: #fff; border-color: #165dff; }
.type-tag.type-enterprise.active { background: #722ed1; border-color: #722ed1; }
.type-tag.type-employee.active { background: #00b42a; border-color: #00b42a; }

.card-list { padding: 0 16px; }
.market-card { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 12px; position: relative; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.card-left-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
.bar-individual { background: #165dff; }
.bar-enterprise { background: #722ed1; }
.bar-employee { background: #00b42a; }
.card-badge { position: absolute; top: 12px; right: 12px; font-size: 10px; padding: 2px 8px; border-radius: 4px; color: #fff; }
.badge-individual { background: #165dff; }
.badge-enterprise { background: #722ed1; }
.badge-employee { background: #00b42a; }
.card-header { display: flex; align-items: center; gap: 12px; }
.card-avatar { width: 48px; height: 48px; border-radius: 24px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 600; }
.avatar-individual { background: linear-gradient(135deg, #165dff, #4080ff); }
.avatar-enterprise { background: linear-gradient(135deg, #722ed1, #9254de); }
.avatar-employee { background: linear-gradient(135deg, #00b42a, #23c343); }
.card-info { flex: 1; }
.card-name { font-size: 16px; font-weight: 600; color: #1d2129; }
.card-position { font-size: 13px; color: #86909c; margin-top: 2px; }
.exchange-btn { font-size: 12px; padding: 6px 14px; border-radius: 16px; color: #fff; }
.exchange-btn { background: #165dff; }
.btn-enterprise { background: #722ed1; }
.btn-employee { background: #00b42a; }
.card-footer { margin-top: 12px; padding-top: 10px; border-top: 1px solid #f2f3f5; display: flex; align-items: center; }
.footer-tag { font-size: 11px; color: #86909c; background: #f2f3f5; padding: 2px 8px; border-radius: 4px; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 80px 20px; }
.empty-text { font-size: 15px; color: #4e5969; margin-top: 16px; }
.empty-hint { font-size: 13px; color: #86909c; margin-top: 4px; }
</style>
