<template>
  <!-- 装修页链接选择器（移动端化）
       🔴 反馈 #298：按钮组件要支持「跳转外部小程序」，默认仍是内部链接；
          内部链接需要一个**可视化页面选择框**（参考后台 LinkPicker，但按手机交互重做）。
       UX 取舍（移动端 vs 后台 el-dialog 双栏）：
         - 后台是「左分类 + 右列表」双栏 → 手机上横向空间不够，改成**顶部横向分类胶囊 + 下方列表**；
         - 列表加**搜索框**（48 个页面靠滚动找不动）；
         - 外部小程序不用表单堆叠，而是**分段选择 + 三个输入项**（AppID/路径/版本），
           AppID 提供「粘贴读取剪贴板」快捷按钮（手机上粘贴是主要输入方式）；
         - 每次只能选一个目标（后台的 goods/cat 模式是多选，不适合此处）。 -->
  <view class="lp-mask" :style="[brandVars, brandInkVars]" @click="close">
    <view class="lp-sheet" @click.stop>
      <view class="lp-header">
        <text class="lp-title">选择跳转目标</text>
        <text class="lp-close" @click="close">✕</text>
      </view>

      <!-- 目标类型分段（移动端横向滚动的胶囊，比下拉更快） -->
      <scroll-view scroll-x class="lp-types" :show-scrollbar="false">
        <view class="lp-types-inner">
          <view
            v-for="t in TYPE_OPTIONS"
            :key="t.value"
            class="lp-type"
            :class="{ on: form.linkType === t.value }"
            @click="form.linkType = t.value"
          >{{ t.label }}</view>
        </view>
      </scroll-view>

      <!-- 内部页面：搜索 + 分组列表 -->
      <template v-if="form.linkType === 'internal'">
        <view class="lp-search">
          <input
            class="lp-search-input"
            v-model="kw"
            placeholder="搜索页面名称或路径"
            placeholder-class="lp-ph"
            confirm-type="search"
          />
          <text v-if="kw" class="lp-search-clear" @click="kw = ''">✕</text>
        </view>
        <scroll-view scroll-y class="lp-list">
          <view v-if="!filtered.length" class="lp-empty">没有匹配的页面</view>
          <view
            v-for="p in filtered"
            :key="p.path"
            class="lp-item"
            :class="{ on: form.url === p.path }"
            @click="pickInternal(p)"
          >
            <view class="lp-item-main">
              <text class="lp-item-title">{{ p.title }}</text>
              <text class="lp-item-path">{{ p.path }}</text>
            </view>
            <text v-if="form.url === p.path" class="lp-item-check">✓</text>
          </view>
        </scroll-view>
      </template>

      <!-- 外部小程序：分段 + 三个输入项 -->
      <template v-else-if="form.linkType === 'miniapp'">
        <scroll-view scroll-y class="lp-list lp-list-form">
          <view class="lp-field">
            <view class="lp-field-label">小程序 AppID</view>
            <view class="lp-field-row">
              <input
                class="lp-field-input"
                v-model="form.miniAppId"
                placeholder="wx1234567890abcdef"
                placeholder-class="lp-ph"
              />
              <view class="lp-field-btn" @click="pasteAppId">粘贴</view>
            </view>
            <view class="lp-field-tip">目标小程序须与当前小程序**属于同一微信开放平台**，否则无法跳转</view>
          </view>
          <view class="lp-field">
            <view class="lp-field-label">页面路径</view>
            <input
              class="lp-field-input"
              v-model="form.miniAppPath"
              placeholder="pages/index/index（留空则进首页）"
              placeholder-class="lp-ph"
            />
          </view>
          <view class="lp-field">
            <view class="lp-field-label">跳转版本</view>
            <view class="lp-radios">
              <view
                v-for="e in ENV_OPTIONS"
                :key="e.value"
                class="lp-radio"
                :class="{ on: form.miniAppEnv === e.value }"
                @click="form.miniAppEnv = e.value"
              >{{ e.label }}</view>
            </view>
          </view>
          <view class="lp-warn" v-if="form.miniAppId && !/^wx[0-9a-f]{16}$/i.test(form.miniAppId.trim())">
            AppID 格式看起来不对（应以 wx 开头 + 16 位十六进制）
          </view>
        </scroll-view>
      </template>

      <!-- 网页链接 -->
      <template v-else-if="form.linkType === 'web'">
        <scroll-view scroll-y class="lp-list lp-list-form">
          <view class="lp-field">
            <view class="lp-field-label">网页地址</view>
            <input
              class="lp-field-input"
              v-model="form.url"
              placeholder="https://example.com"
              placeholder-class="lp-ph"
            />
            <view class="lp-field-tip">H5 端用内置浏览器打开；小程序端会复制到剪贴板并在微信中打开</view>
          </view>
        </scroll-view>
      </template>

      <!-- 拨打电话 -->
      <template v-else>
        <scroll-view scroll-y class="lp-list lp-list-form">
          <view class="lp-field">
            <view class="lp-field-label">电话号码</view>
            <input
              class="lp-field-input"
              v-model="form.url"
              type="number"
              placeholder="如 13800138000"
              placeholder-class="lp-ph"
            />
            <view class="lp-field-tip">点击组件时唤起系统拨号盘（小程序端需用户确认）</view>
          </view>
        </scroll-view>
      </template>

      <view class="lp-footer">
        <view class="lp-btn lp-btn-cancel" @click="close">取消</view>
        <view class="lp-btn lp-btn-ok" @click="confirm">确定</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { MINI_PAGES, MINI_PAGE_GROUPS, searchMiniPages } from '../../utils/miniPages.js';
// 🔴 品牌色单一来源（brandCoverage.test.js 守护）：禁手搓 brandVars
import { useBrandOverride } from '../../utils/brand.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // 当前值：{ url, linkType, miniAppId, miniAppPath, miniAppEnv }
  value: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['update:modelValue', 'change']);

const TYPE_OPTIONS = [
  { label: '内部页面', value: 'internal' },
  { label: '外部小程序', value: 'miniapp' },
  { label: '网页链接', value: 'web' },
  { label: '拨打电话', value: 'phone' },
];
const ENV_OPTIONS = [
  { label: '正式版', value: 'release' },
  { label: '体验版', value: 'trial' },
  { label: '开发版', value: 'develop' },
];

const { brandVars, brandInkVars } = useBrandOverride();

const kw = ref('');
const form = ref({ url: '', linkType: 'internal', miniAppId: '', miniAppPath: '', miniAppEnv: 'release' });

// 打开时把外部值灌进本地表单（避免直接改 props）
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    const v = props.value || {};
    form.value = {
      url: v.url || '',
      // 存量数据没有 linkType → 视为 internal（向后兼容）
      linkType: v.linkType || 'internal',
      miniAppId: v.miniAppId || '',
      miniAppPath: v.miniAppPath || '',
      miniAppEnv: v.miniAppEnv || 'release',
    };
    kw.value = '';
  }
);

const filtered = computed(() => {
  const k = kw.value.trim();
  if (!k) return MINI_PAGES;
  return searchMiniPages(k);
});

/** 选内部页面：直接写 url（保留原字段名，存量配置无需迁移） */
function pickInternal(p) {
  form.value.url = p.path;
}

/** 粘贴 AppID（手机上粘贴是主要输入方式） */
function pasteAppId() {
  uni.getClipboardData({
    success: (res) => {
      const t = String(res.data || '').trim();
      if (t) {
        form.value.miniAppId = t;
      } else {
        uni.showToast({ title: '剪贴板为空', icon: 'none' });
      }
    },
    fail: () => uni.showToast({ title: '无法读取剪贴板', icon: 'none' }),
  });
}

function close() {
  emit('update:modelValue', false);
}

function confirm() {
  const f = form.value;
  if (f.linkType === 'internal' && !f.url) {
    return uni.showToast({ title: '请选择一个页面', icon: 'none' });
  }
  if (f.linkType === 'miniapp') {
    if (!f.miniAppId) return uni.showToast({ title: '请填写小程序 AppID', icon: 'none' });
    if (!/^wx[0-9a-f]{16}$/i.test(f.miniAppId.trim())) {
      return uni.showToast({ title: 'AppID 格式不正确', icon: 'none' });
    }
  }
  if (f.linkType === 'web' && !/^https?:\/\//i.test(f.url.trim())) {
    return uni.showToast({ title: '请填写 http(s) 开头的地址', icon: 'none' });
  }
  if (f.linkType === 'phone' && !/^[\d\-+\s]{5,20}$/.test(f.url.trim())) {
    return uni.showToast({ title: '请填写正确的电话号码', icon: 'none' });
  }
  emit('change', { ...f });
  emit('update:modelValue', false);
}
</script>

<style scoped>
.lp-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-mask);
  z-index: var(--z-popup);
  display: flex; align-items: flex-end;
}
.lp-sheet {
  width: 100%;
  background: var(--white);
  border-radius: 32rpx 32rpx 0 0;
  max-height: 86vh;
  display: flex; flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
}
.lp-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 32rpx 32rpx 16rpx;
}
.lp-title { font-size: var(--fs-6); font-weight: 600; color: var(--t1); }
.lp-close { font-size: var(--fs-6); color: var(--t3); padding: 0 8rpx; }
/* 目标类型：横向滚动胶囊（手机端比下拉快） */
.lp-types { white-space: nowrap; padding: 8rpx 24rpx 16rpx; }
.lp-types-inner { display: inline-flex; gap: 12rpx; }
.lp-type {
  padding: 14rpx 28rpx;
  border-radius: 32rpx;
  background: var(--bg-card);
  font-size: var(--fs-3);
  color: var(--t2);
  flex-shrink: 0;
}
.lp-type.on {
  background: rgba(var(--design-primary-rgb), 0.1);
  color: var(--design-primary);
  font-weight: 600;
}
/* 搜索 */
.lp-search {
  display: flex; align-items: center;
  margin: 0 32rpx 16rpx;
  padding: 0 20rpx;
  height: 72rpx;
  background: var(--bg-card);
  border-radius: var(--radius-sm);
}
.lp-search-input { flex: 1; font-size: var(--fs-3); color: var(--t1); }
.lp-ph { color: var(--t3); }
.lp-search-clear { font-size: 26rpx; color: var(--t3); padding: 0 8rpx; }
/* 列表 */
.lp-list { flex: 1; min-height: 320rpx; padding: 0 32rpx; }
.lp-list-form { padding-top: 8rpx; }
.lp-empty { padding: 80rpx 0; text-align: center; font-size: var(--fs-3); color: var(--t3); }
.lp-item {
  display: flex; align-items: center;
  padding: 24rpx 0;
  border-bottom: 1rpx solid var(--bg-hover);
}
.lp-item-main { flex: 1; min-width: 0; }
.lp-item-title { display: block; font-size: var(--fs-4); color: var(--t1); }
.lp-item-path {
  display: block; font-size: var(--fs-2); color: var(--t3);
  margin-top: 4rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lp-item.on .lp-item-title { color: var(--design-primary); font-weight: 600; }
.lp-item-check { font-size: 30rpx; color: var(--design-primary); }
/* 表单区 */
.lp-field { margin-bottom: 28rpx; }
.lp-field-label { font-size: var(--fs-3); color: var(--t2); margin-bottom: 12rpx; }
.lp-field-row { display: flex; align-items: center; gap: 12rpx; }
.lp-field-input {
  flex: 1; height: 88rpx; padding: 0 24rpx;
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  font-size: var(--fs-3);
  color: var(--t1);
  box-sizing: border-box;
}
.lp-field-btn {
  height: 88rpx; line-height: 88rpx; padding: 0 24rpx;
  background: rgba(var(--design-primary-rgb), 0.1);
  color: var(--design-primary);
  border-radius: var(--radius-sm);
  font-size: var(--fs-3);
}
.lp-field-tip { font-size: var(--fs-2); color: var(--t3); margin-top: 8rpx; }
.lp-radios { display: flex; gap: 12rpx; }
.lp-radio {
  flex: 1; text-align: center; padding: 20rpx 0;
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  font-size: var(--fs-3); color: var(--t2);
  border: 2rpx solid transparent;
}
.lp-radio.on {
  background: rgba(var(--design-primary-rgb), 0.08);
  color: var(--design-primary);
  border-color: var(--design-primary);
}
.lp-warn {
  font-size: var(--fs-2); color: var(--danger);
  background: rgba(var(--danger-rgb), 0.08);
  padding: 16rpx 20rpx; border-radius: var(--radius-sm);
}
.lp-footer {
  display: flex; gap: 16rpx;
  padding: 24rpx 32rpx 32rpx;
  border-top: 1rpx solid var(--bg-hover);
}
.lp-btn {
  flex: 1; height: 88rpx; line-height: 88rpx; text-align: center;
  border-radius: 40rpx; font-size: 30rpx;
}
.lp-btn-cancel { background: var(--bg-card); color: var(--t2); }
.lp-btn-ok { background: var(--design-primary); color: var(--white); font-weight: 600; }
</style>
