<template>
  <view class="dyn-link" @click="open" hover-class="dyn-link-hover">
    <image v-if="img" :src="img" mode="aspectFill" class="dyn-link-img" />
    <view class="dyn-link-info">
      <view class="dyn-link-title">{{ title || hostText }}</view>
      <view class="dyn-link-desc" v-if="desc">{{ desc }}</view>
      <view class="dyn-link-host">
        <text class="dyn-link-badge">{{ badge }}</text>
        <text class="dyn-link-url">{{ hostText }}</text>
      </view>
    </view>
    <view class="dyn-link-arrow">›</view>
  </view>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  d: { type: Object, default: () => ({}) },
  // 🔴 #312-3：名片模块引用（服务端回查拼好的 {type,id,title,cover,url}）。
  //   传了 refObj 就优先渲染引用卡片，否则渲染 d 上的链接卡片（#312-2）。
  refObj: { type: Object, default: null },
});

const isRef = computed(() => !!props.refObj);
const img = computed(() => isRef.value ? (props.refObj.cover || '') : (props.d.linkImg || ''));
const title = computed(() => isRef.value ? (props.refObj.title || '') : (props.d.linkTitle || ''));
const desc = computed(() => isRef.value ? '' : (props.d.linkDesc || ''));
const url = computed(() => isRef.value ? (props.refObj.url || '') : (props.d.linkUrl || ''));
const badge = computed(() => {
  if (isRef.value) return props.refObj.type === 'goods' ? '产品' : '案例';
  return props.d.linkType === 'url' ? '外链' : '小程序';
});
// 卡片底部来源行：引用卡片统一显示「名片内页」；链接卡片显示域名或内页路径。
const hostText = computed(() => {
  if (isRef.value) return '名片内页';
  if (props.d.linkType === 'url') {
    try {
      return new URL(props.d.linkUrl).host || props.d.linkUrl;
    } catch {
      return props.d.linkUrl.replace(/^https?:\/\//, '');
    }
  }
  return (props.d.linkUrl || '').split('?')[0] || '小程序内页';
});

function open() {
  const u = url.value;
  if (!u) return;
  // 🔴 引用卡片与『跳内页』链接卡片都走 uni.navigateTo；外链走复制兜底
  //   （web-view 需小程序后台业务域名白名单，一期未配会被拦截）。
  if (isRef.value || props.d.linkType !== 'url') {
    if (!u.startsWith('/')) {
      uni.showToast({ title: '内页路径格式错误', icon: 'none' });
      return;
    }
    uni.navigateTo({ url: u, fail: () => uni.showToast({ title: '页面不存在', icon: 'none' }) });
    return;
  }
  uni.setClipboardData({
    data: u,
    success: () => uni.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' }),
    fail: () => uni.showToast({ title: '复制失败', icon: 'none' }),
  });
}
</script>

<style scoped>
.dyn-link {
  display: flex;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--bg-hover);
  border-radius: var(--radius-sm);
  padding: 16rpx;
  margin-bottom: 16rpx;
  gap: 16rpx;
}
.dyn-link-hover { background: var(--bg-hover); }
.dyn-link-img {
  width: 120rpx;
  height: 120rpx;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
  background: var(--bg-hover);
}
.dyn-link-info { flex: 1; min-width: 0; }
.dyn-link-title {
  font-size: var(--fs-4);
  font-weight: 600;
  color: var(--t1);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.dyn-link-desc {
  font-size: var(--fs-2);
  color: var(--t2);
  margin-top: 4rpx;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.dyn-link-host {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 8rpx;
}
.dyn-link-badge {
  font-size: 18rpx;
  color: var(--design-primary, #165dff);
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
}
.dyn-link-url {
  font-size: var(--fs-1);
  color: var(--t3);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.dyn-link-arrow {
  color: var(--t3);
  font-size: 40rpx;
  flex-shrink: 0;
}
</style>
