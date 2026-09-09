<template>
  <view class="design-page">
    <view v-for="(c, i) in comps" :key="i" class="dp-item" :style="containerStyle(c)">
      <!-- 标题 -->
      <view v-if="c.type === 'title'" class="dp-title" :style="{ color: c.props.color, textAlign: c.props.align }">
        <text>{{ c.props.text || '标题文字' }}</text>
      </view>
      <!-- 文本 -->
      <view v-else-if="c.type === 'text'" class="dp-text" :style="{ color: c.props.color, textAlign: c.props.align, fontSize: c.props.size + 'px' }">
        <text>{{ c.props.text || '文本内容' }}</text>
      </view>
      <!-- 图片 -->
      <view v-else-if="c.type === 'image'" class="dp-image" @click="onJump(c.props.link)">
        <image v-if="c.props.url" :src="resolveUrl(c.props.url)" mode="widthFix" class="dp-image-img" />
        <view v-else class="dp-image-empty"><text>图片</text></view>
      </view>
      <!-- 按钮 -->
      <view v-else-if="c.type === 'button'" class="dp-btn" :style="{ color: c.props.textColor, background: c.props.bgColor, borderRadius: c.props.radius + 'px' }" @click="onJump(c.props.url)">
        <text>{{ c.props.text || '按钮' }}</text>
      </view>
      <!-- 分割线 -->
      <view v-else-if="c.type === 'divider'" class="dp-divider">
        <view class="dp-divider-line"></view>
        <text v-if="c.props.text" class="dp-divider-text">{{ c.props.text }}</text>
      </view>
      <!-- 公告 -->
      <view v-else-if="c.type === 'notice'" class="dp-notice" :style="{ background: c.props.bgColor, color: c.props.color }" @click="onJump(c.props.url)">
        <text class="dp-notice-tag">公告</text>
        <text class="dp-notice-text">{{ c.props.text || '公告内容' }}</text>
      </view>
      <!-- 倒计时 -->
      <view v-else-if="c.type === 'countdown'" class="dp-countdown" :style="{ '--cd': c.props.color || '#165dff' }">
        <text class="dp-cd-title">{{ c.props.title || '限时活动' }}</text>
        <view class="dp-cd-cols">
          <view class="dp-cd-cell"><text class="dp-cd-num">{{ c.props.days || '00' }}</text><text class="dp-cd-unit">天</text></view>
          <text class="dp-cd-colon">:</text>
          <view class="dp-cd-cell"><text class="dp-cd-num">{{ c.props.hours || '00' }}</text><text class="dp-cd-unit">时</text></view>
          <text class="dp-cd-colon">:</text>
          <view class="dp-cd-cell"><text class="dp-cd-num">{{ c.props.minutes || '00' }}</text><text class="dp-cd-unit">分</text></view>
          <text class="dp-cd-colon">:</text>
          <view class="dp-cd-cell"><text class="dp-cd-num">{{ c.props.seconds || '00' }}</text><text class="dp-cd-unit">秒</text></view>
        </view>
      </view>
      <!-- 表单 -->
      <view v-else-if="c.type === 'form'" class="dp-form">
        <text class="dp-form-title">{{ c.props.title || '留资表单' }}</text>
        <view class="dp-form-input"><text>{{ c.props.namePlaceholder || '请输入姓名' }}</text></view>
        <view class="dp-form-input"><text>{{ c.props.phonePlaceholder || '请输入手机号' }}</text></view>
        <view class="dp-form-btn" :style="{ background: c.props.btnColor || '#165dff' }"><text>{{ c.props.submitText || '提交' }}</text></view>
      </view>
      <!-- 视频 -->
      <view v-else-if="c.type === 'video'" class="dp-video">
        <video v-if="c.props.url" :src="resolveUrl(c.props.url)" :poster="resolveUrl(c.props.poster)" class="dp-video-player" controls></video>
        <view v-else class="dp-video-empty"><text>视频</text></view>
      </view>
    </view>
  </view>
</template>

<script setup>
defineProps({ comps: { type: Array, default: () => [] } });

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function containerStyle(c) {
  const p = c.props || {};
  const s = {};
  if (p.padding !== undefined && p.padding !== '') s.padding = `${p.padding}px`;
  if (p.radius !== undefined && p.radius !== '') s.borderRadius = `${p.radius}px`;
  if (p.bgColor) s.background = p.bgColor;
  return s;
}
function onJump(url) {
  if (!url) return;
  if (/^https?:/.test(url)) {
    // #ifdef H5
    window.open(url, '_blank');
    // #endif
    // #ifndef H5
    uni.setClipboardData({ data: url, success: () => uni.showToast({ title: '链接已复制', icon: 'none' }) });
    // #endif
    return;
  }
  const path = url.startsWith('/') ? url : `/${url}`;
  uni.navigateTo({ url: path, fail: () => uni.showToast({ title: '页面不存在', icon: 'none' }) });
}
</script>

<style scoped>
.design-page { width: 100%; box-sizing: border-box; }
.dp-item { box-sizing: border-box; }
.dp-title { font-size: 22px; font-weight: 700; line-height: 1.4; }
.dp-text { line-height: 1.6; }
.dp-image { width: 100%; }
.dp-image-img { width: 100%; display: block; border-radius: 8px; }
.dp-image-empty { height: 120px; background: #f7f8fa; border: 1px dashed #c9cdd4; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #86909c; font-size: 13px; }
.dp-btn { display: inline-block; padding: 10px 24px; font-size: 14px; text-align: center; }
.dp-divider { position: relative; height: 1px; background: #e5e6eb; margin: 14px 0; display: flex; align-items: center; justify-content: center; }
.dp-divider-line { height: 1px; width: 100%; }
.dp-divider-text { position: absolute; background: #fff; padding: 0 10px; font-size: 12px; color: #86909c; }
.dp-notice { padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.dp-notice-tag { font-weight: 600; flex-shrink: 0; }
.dp-notice-text { flex: 1; }
.dp-countdown { padding: 14px; border-radius: 8px; background: #fff; border: 1px solid #f0f1f3; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.dp-cd-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.dp-cd-cols { display: flex; align-items: center; gap: 6px; }
.dp-cd-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.dp-cd-num { font-size: 18px; font-weight: 700; color: #fff; background: var(--cd, #165dff); border-radius: 6px; padding: 2px 8px; line-height: 1.4; }
.dp-cd-unit { font-size: 11px; color: #86909c; }
.dp-cd-colon { color: var(--cd, #165dff); font-weight: 700; font-size: 16px; }
.dp-form { padding: 14px; border-radius: 8px; border: 1px solid #f0f1f3; display: flex; flex-direction: column; gap: 10px; background: #fff; }
.dp-form-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.dp-form-input { height: 34px; border-radius: 6px; background: #f7f8fa; border: 1px solid #e5e6eb; display: flex; align-items: center; padding: 0 12px; font-size: 12px; color: #86909c; }
.dp-form-btn { height: 36px; border-radius: 8px; color: #fff; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.dp-video { border-radius: 8px; overflow: hidden; background: #000; }
.dp-video-player { width: 100%; height: 200px; display: block; }
.dp-video-empty { height: 120px; background: #000; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,.5); font-size: 13px; }
</style>
