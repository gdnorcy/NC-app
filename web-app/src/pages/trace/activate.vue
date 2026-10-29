<template>
  <view class="act-page">
    <PageNav title="批次激活" back></PageNav>

    <scroll-view class="act-scroll" scroll-y :show-scrollbar="false">
      <view class="act-inner">
        <!-- 说明卡片：经销商第一次用，必须知道要填什么 -->
        <view class="act-card">
          <text class="act-card-title">激活批次</text>
          <text class="act-card-desc">
            货到后用厂家提供的批次号与激活口令完成绑定。激活后消费者扫码才能看到商品溯源详情。
          </text>

          <input
            class="act-input"
            v-model="form.batch"
            placeholder="批次号（如 0000123）"
            placeholder-class="act-ph"
            :maxlength="40"
          />
          <input
            class="act-input"
            v-model="form.pin"
            placeholder="8 位激活口令"
            placeholder-class="act-ph"
            :maxlength="16"
            type="number"
          />

          <view class="act-btn" :class="{ 'act-btn-off': loading }" @click="submit">
            <text>{{ loading ? '激活中…' : '确认激活' }}</text>
          </view>
        </view>

        <!-- 结果卡片 -->
        <view class="act-card act-card-ok" v-if="result">
          <view class="act-result-head">
            <SIcon name="verify" size="large" :color="ICON_SUCCESS" />
            <text class="act-result-title">{{ result.title }}</text>
          </view>
          <text class="act-result-desc">{{ result.desc }}</text>
        </view>

        <view class="act-card act-card-err" v-if="errorMsg">
          <view class="act-result-head">
            <SIcon name="verify" size="large" :color="ICON_DANGER" />
            <text class="act-result-title act-title-err">{{ errorMsg }}</text>
          </view>
        </view>

        <view class="act-bottom-space"></view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import PageNav from '../../components/PageNav.vue';
import SIcon from '../../components/SIcon.vue';
import { getTid } from '../../utils/mallUtil.js';
import { activateBatch } from '../../utils/traceApi.js';

/**
 * 经销商自助激活页（P2 先印后绑）。
 *
 * 🔴 为什么必须有这个页面：后端 `POST /api/trace/public/batch-activate` 早就有了，
 *    但**没有页面入口** → 经销商只能靠线下教他调 API，普通商家根本不会用
 *    → 「先印后绑」这个功能在真实业务里等于走不通。
 *
 * 🔴 租户标识：公开段只认 URL ?tid=（不认 body 里的 tid，否则改个参数就能激活别人家的批次）。
 *    所以本页必须带 tid —— 从链接参数取，取不到就提示联系厂家（不猜、不硬编码）。
 */
const ICON_SUCCESS = '#07c160';
const ICON_DANGER = '#f53f3f';

const loading = ref(false);
const errorMsg = ref('');
const result = ref(null);
const form = reactive({ batch: '', pin: '' });

const tid = ref('');

function showError(msg) {
  errorMsg.value = String(msg || '激活失败');
  result.value = null;
}

async function submit() {
  if (loading.value) return;
  const batch = String(form.batch || '').trim();
  const pin = String(form.pin || '').trim();
  if (!batch) { showError('请输入批次号'); return; }
  if (!pin) { showError('请输入激活口令'); return; }
  if (!tid.value) { showError('缺少租户标识，请通过厂家提供的链接进入本页'); return; }
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await activateBatch(batch, pin, tid.value);
    result.value = {
      title: '批次激活成功',
      desc: `批次 ${batch} 已激活，现在消费者扫码可以查看商品溯源详情。`,
    };
    form.pin = '';
  } catch (e) {
    // 🔴 服务端给的是可操作的中文提示（如口令错误、批次不存在）→ 直接透传，不二次包装
    showError(typeof e === 'string' ? e : (e?.message || '激活失败'));
  } finally {
    loading.value = false;
  }
}

onLoad((options) => {
  const t = options?.tid || getTid();
  tid.value = t ? String(t) : '';
  if (options?.batch) form.batch = String(options.batch);
  // 厂家可以把口令也带上（线下扫码直接激活），但用完即焚：不回显到输入框
  if (options?.pin) {
    form.pin = String(options.pin);
    options.pin = '';
  }
});
</script>

<style scoped>
.act-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-page);
  overflow: hidden;
  box-sizing: border-box;
}
/* MP 端滚动必须 scroll-view：父级定高时用 flex:1 + height:0 撑开剩余空间 */
.act-scroll { flex: 1; height: 0; }
.act-inner { padding: 20rpx 24rpx 0; }

.act-card {
  background: var(--card-bg);
  border-radius: var(--radius-md);
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--shadow-sm);
}
.act-card-title {
  display: block;
  font-size: var(--fs-6);
  font-weight: 600;
  color: var(--t1);
}
.act-card-desc {
  display: block;
  font-size: var(--fs-3);
  color: var(--t3);
  margin-top: 8rpx;
  margin-bottom: 20rpx;
  line-height: 1.6;
}
.act-input {
  height: 88rpx;
  background: var(--bg-page);
  border-radius: var(--radius-md);
  padding: 0 24rpx;
  font-size: var(--fs-5);
  color: var(--t1);
  margin-bottom: 16rpx;
}
.act-ph { color: var(--t3); }
.act-btn {
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
.act-btn-off { opacity: 0.6; }

.act-result-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
}
.act-result-title {
  font-size: var(--fs-5);
  font-weight: 600;
  color: var(--t1);
}
.act-title-err { color: var(--danger); }
.act-result-desc {
  display: block;
  font-size: var(--fs-3);
  color: var(--t3);
  line-height: 1.6;
}
.act-bottom-space { height: 40rpx; }
</style>
