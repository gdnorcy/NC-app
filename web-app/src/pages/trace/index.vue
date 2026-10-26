<template>
  <view class="trace-page">
    <!-- PageNav -->
    <PageNav title="防伪溯源" back></PageNav>

    <scroll-view class="trace-scroll" scroll-y :show-scrollbar="false">
      <view class="trace-inner">
        <!-- 查询卡片 -->
        <view class="tr-card">
          <text class="tr-card-title">防伪查询</text>
          <text class="tr-card-desc">{{ welcomeText }}</text>

          <input
            class="tr-input"
            v-model="form.co"
            placeholder="请输入防伪码"
            placeholder-class="tr-ph"
            :maxlength="40"
          />
          <input
            class="tr-input"
            v-model="form.yzm"
            placeholder="验证码 / 暗码（可选）"
            placeholder-class="tr-ph"
            :maxlength="20"
          />

          <view class="tr-btn" :class="{ 'tr-btn-off': loading }" @click="submit">
            <text>{{ loading ? '查询中…' : '立即查询' }}</text>
          </view>
        </view>

        <!-- 查询结果 -->
        <view class="tr-card tr-card-ok" v-if="result">
          <view class="tr-result-head">
            <SIcon name="verify" size="large" :color="ICON_SUCCESS" />
            <text class="tr-result-title">{{ result.first ? '正品验证通过' : '该码已被查询过' }}</text>
          </view>

          <view class="tr-line">
            <text class="tr-line-label">防伪码</text>
            <text class="tr-line-value">{{ result.code || '-' }}</text>
          </view>
          <view class="tr-line">
            <text class="tr-line-label">查询次数</text>
            <text class="tr-line-value">{{ result.num || 0 }} 次</text>
          </view>
          <view class="tr-line">
            <text class="tr-line-label">产品</text>
            <text class="tr-line-value">{{ batchInfo.product || '-' }}</text>
          </view>
          <view class="tr-line">
            <text class="tr-line-label">品牌</text>
            <text class="tr-line-value">{{ batchInfo.brand || '-' }}</text>
          </view>
          <view class="tr-line">
            <text class="tr-line-label">厂家</text>
            <text class="tr-line-value">{{ batchInfo.factory || '-' }}</text>
          </view>
          <view class="tr-line">
            <text class="tr-line-label">产地</text>
            <text class="tr-line-value">{{ originText }}</text>
          </view>
          <view class="tr-line">
            <text class="tr-line-label">销售区域</text>
            <text class="tr-line-value">{{ regionText }}</text>
          </view>

          <text class="tr-tip" v-if="successTip">{{ successTip }}</text>
        </view>

        <!-- 错误卡片 -->
        <view class="tr-card tr-card-err" v-if="errorMsg">
          <view class="tr-result-head">
            <SIcon name="show" size="large" :color="ICON_DANGER" />
            <text class="tr-result-title tr-title-err">{{ errorMsg }}</text>
          </view>
          <text class="tr-tip" v-if="failTip">{{ failTip }}</text>
        </view>

        <view class="tr-bottom-space"></view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import PageNav from '../../components/PageNav.vue';
import SIcon from '../../components/SIcon.vue';
import { getTid } from '../../utils/mallUtil.js';
import { scanEntry, verifyTrace } from '../../utils/traceApi.js';

// 🔴 SIcon 的 color 会被烘焙进产物（SVG data-URI / 预生成 PNG），var() 到不了
//    → 必须传真实 hex。语义与 styles/token.scss 的 $success / $danger 对齐。
const ICON_SUCCESS = '#07c160';
const ICON_DANGER = '#f53f3f';

const loading = ref(false);
const errorMsg = ref('');
const result = ref(null);
const form = reactive({ co: '', yzm: '' });

// 租户标识：公开段只认 URL ?tid= 或登录态，前端必须把 tid 透传过去
const tid = ref('');

const batchInfo = computed(() => (result.value && result.value.batch) || {});

const regionText = computed(() => {
  const b = batchInfo.value;
  const parts = [b.province, b.city, b.district].filter(Boolean);
  return parts.length ? parts.join(' / ') : '-';
});

const originText = computed(() => batchInfo.value.origin || '-');

const welcomeText = computed(() => {
  const s = (result.value && result.value.settings) || {};
  return s.welcome || '输入包装上的防伪码，查询产品真伪与溯源信息';
});

const successTip = computed(() => {
  const s = (result.value && result.value.settings) || {};
  const reward = (result.value && result.value.reward) || {};
  if (reward.message) return reward.message;
  if (s.sucOne) return s.sucOne;
  if (s.sucTwo) return s.sucTwo;
  return '';
});

const failTip = computed(() => {
  const s = (result.value && result.value.settings) || {};
  return s.ftel || '';
});

/** 扫码进入：URL 直接带防伪码（?co=xxx）时自动清洗并回填 */
function applyScanCode(co) {
  const raw = String(co || '').trim();
  if (!raw) return;
  scanEntry(raw, tid.value)
    .then((res) => {
      form.co = (res && res.code) || raw;
    })
    .catch(() => {
      form.co = raw;
    });
}

async function submit() {
  if (loading.value) return;
  const co = String(form.co || '').trim();
  if (!co) {
    errorMsg.value = '请输入防伪码';
    result.value = null;
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  result.value = null;
  try {
    result.value = await verifyTrace({ co, yzm: String(form.yzm || '').trim() }, tid.value);
  } catch (e) {
    errorMsg.value = (e && e.message) || '查询失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

onLoad((options) => {
  // 🔴 租户上下文单一来源 = utils/mallUtil.js 的 getTid（分享 query / 启动 query / 扫码 scene / 渠道绑定）
  tid.value = getTid(options);
  if (options && options.co) applyScanCode(options.co);
});
</script>

<style scoped>
.trace-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-page);
  overflow: hidden;
  box-sizing: border-box;
}
/* MP 端滚动必须 scroll-view：父级定高时用 flex:1 + height:0 撑开剩余空间 */
.trace-scroll { flex: 1; height: 0; }
.trace-inner { padding: 20rpx 24rpx 0; }

.tr-card {
  background: var(--card-bg);
  border-radius: var(--radius-md);
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--shadow-sm);
}
.tr-card-title {
  display: block;
  font-size: var(--fs-6);
  font-weight: 600;
  color: var(--t1);
}
.tr-card-desc {
  display: block;
  font-size: var(--fs-3);
  color: var(--t3);
  margin-top: 8rpx;
  margin-bottom: 20rpx;
}
.tr-input {
  height: 88rpx;
  background: var(--bg-page);
  border-radius: var(--radius-md);
  padding: 0 24rpx;
  font-size: var(--fs-5);
  color: var(--t1);
  margin-bottom: 16rpx;
}
.tr-ph { color: var(--t3); }
.tr-btn {
  margin-top: 8rpx;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  background: var(--primary);
  color: var(--white);
  border-radius: var(--radius-md);
  font-size: var(--fs-5);
  font-weight: 600;
}
.tr-btn-off { opacity: 0.6; }

.tr-result-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.tr-result-title {
  font-size: var(--fs-6);
  font-weight: 600;
  color: var(--success);
}
.tr-title-err { color: var(--danger); }
.tr-line {
  display: flex;
  align-items: flex-start;
  padding: 8rpx 0;
}
.tr-line-label {
  width: 140rpx;
  font-size: var(--fs-4);
  color: var(--t3);
  flex-shrink: 0;
}
.tr-line-value {
  flex: 1;
  font-size: var(--fs-4);
  color: var(--t1);
  word-break: break-all;
}
.tr-tip {
  display: block;
  margin-top: 16rpx;
  font-size: var(--fs-3);
  color: var(--t3);
  line-height: 1.6;
}
.tr-bottom-space { height: 60rpx; }
</style>
