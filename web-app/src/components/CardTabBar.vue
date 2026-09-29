<template>
  <view
    v-if="designItems.length || navMode !== 'none'"
    class="mp-tabbar"
    :class="['mp-tabbar-' + tabType, 'mp-corner-' + tabCorner]"
    :style="tabbarStyle()"
  >
    <!-- 设计中心已发布底部导航方案：优先渲染配置项 -->
    <template v-if="designItems.length">
      <!-- 扇形悬浮：中心主按钮 + 点击展开扇形菜单 -->
      <template v-if="tabType === 'fan'">
        <view class="mp-fan-main" :style="{ background: mainBtnBg }" @click="fanOpen = !fanOpen">
          <image v-if="isImgIcon(designItems[0].icon)" :src="iconUrl(designItems[0].icon)" class="mp-fan-main-img" mode="aspectFit" />
          <SIcon v-else :name="designItems[0].icon || fallbackTabIcon(designItems[0].text)" size="xlarge" color="#ffffff" />
          <text class="mp-fan-main-txt">{{ designItems[0].text }}</text>
        </view>
        <view v-if="fanOpen" class="mp-fan-menu" :style="{ background: menuBgColor }">
          <view v-for="(it, i) in designItems.slice(1)" :key="i" class="mp-fan-item" :style="{ background: menuBgColor }" @click="goDesign(it)">
            <image v-if="isImgIcon(it.icon)" :src="iconUrl(it.icon)" class="mp-fan-item-img" mode="aspectFit" />
            <SIcon v-else :name="it.icon || fallbackTabIcon(it.text)" size="default" :color="isOn(it) ? activeColor : menuTextColor" />
            <text class="mp-fan-item-txt" :style="{ color: isOn(it) ? activeColor : menuTextColor }">{{ it.text }}</text>
          </view>
        </view>
      </template>

      <!-- 平铺/悬浮：5 种选中风格 -->
      <template v-else>
        <view
          v-for="(it, i) in designItems"
          :key="i"
          class="mtb"
          :class="[{ on: isOn(it) }, 'mtb-' + tabStyle, { 'mp-mid': isMid(i) }]"
          @click="goDesign(it)"
        >
          <!-- slider：选中项图标后圆形滑块 -->
          <view v-if="tabStyle === 'slider' && isOn(it)" class="mp-slider" :style="{ background: activeSoft }"></view>

          <!-- 按钮居中/凸起/嵌入：中间项渲染突出大按钮 -->
          <view
            v-if="isMid(i) && ['btnCenter', 'btnRaise', 'btnInset'].includes(tabStyle)"
            class="mp-mid-btn"
            :class="'mp-mid-' + tabStyle"
            :style="midBtnStyle"
          >
            <image v-if="isImgIcon(it.icon)" :src="iconUrl(it.icon)" class="mp-mid-img" mode="aspectFit" />
            <SIcon v-else :name="it.icon || fallbackTabIcon(it.text)" size="large" color="#ffffff" />
          </view>

          <!-- 常规项（含 slider 滑块项） -->
          <template v-else>
            <image v-if="isImgIcon(it.icon)" :src="iconUrl(it.icon)" class="tab-icon-img" mode="aspectFit" />
            <SIcon v-else :name="it.icon || fallbackTabIcon(it.text)" size="default" :style="tabIconStyle" :color="tabColor(it)" />
            <text class="mp-tab-txt" :class="{ 'mp-tab-bold': isOn(it) }" :style="{ color: tabColor(it) }">{{ it.text }}</text>
          </template>
        </view>
      </template>
    </template>

    <!-- 默认导航（未发布设计配置） -->
    <template v-else>
      <view class="mtb" :class="{ on: active === 'card' }" @click="goCard">
        <SIcon name="card" size="default" :color="active === 'card' ? '#07c160' : '#9a9a9a'" />
        <text class="mtb-txt">名片</text>
      </view>
      <view class="mtb" :class="{ on: active === 'radar' }" @click="goPage('/pages/card/visitors', 'radar')">
        <SIcon name="radar" size="default" :color="active === 'radar' ? '#07c160' : '#9a9a9a'" />
        <text class="mtb-txt">雷达</text>
      </view>
      <view class="mtb" :class="{ on: active === 'market' }" @click="goPage('/pages/card/market', 'market')">
        <SIcon name="market" size="default" :color="active === 'market' ? '#07c160' : '#9a9a9a'" />
        <text class="mtb-txt">集市</text>
      </view>
      <view class="mtb" :class="{ on: active === 'member' }" @click="goPage('/pages/card/member', 'member')">
        <SIcon name="crown" size="default" :color="active === 'member' ? '#07c160' : '#9a9a9a'" />
        <text class="mtb-txt">会员</text>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { cardApi, API_DOMAIN } from '../utils/cardApi.js';
import { readDesignConfig, fetchDesignConfig, fallbackTabIcon } from '../utils/design.js';
import SIcon from './SIcon.vue';

const props = defineProps({
  // 当前高亮tab: card / radar / market / member / home
  active: { type: String, default: '' },
  // 当前页面装修 pageType（决定底部导航读取哪个页面的 nav 配置；空=按首页语义）
  pageType: { type: String, default: '' },
});

const myCardId = ref(null);
const fanOpen = ref(false);

// 设计中心配置：优先响应式本地值（挂载时拉取），回退 storage 缓存
const localCfg = ref(null);
const designConfig = computed(() => localCfg.value || readDesignConfig());
const designItems = computed(() => designConfig.value?.tabItems || []);
const tabStyleCfg = computed(() => designConfig.value?.tabStyle || {});
const tabType = computed(() => tabStyleCfg.value.type || 'flat');
const tabStyle = computed(() => tabStyleCfg.value.style || 'normal');
const tabCorner = computed(() => tabStyleCfg.value.corner || 'square');
const tabBg = computed(() => tabStyleCfg.value.bg || '');
// 背景类型（云菜鸟实测矩阵）：fan、平铺/悬浮(普通/滑块/居中) = 背景颜色；平铺/悬浮(凸起/嵌入) = 背景图片
const isColorBg = computed(() => {
  const st = ['normal', 'slider', 'btnCenter'].includes(tabStyle.value);
  return tabType.value === 'fan' || st;
});
// 选中色：优先导航方案「已选中色」，空则回退主题主色（现状）
const activeColor = computed(() => tabStyleCfg.value.colors?.selected || designConfig.value?.style?.primaryColor || '#165DFF');
const inactiveColor = computed(() => tabStyleCfg.value.colors?.unselected || '#9a9a9a');
// 突出色：优先导航方案「突出颜色」，空则回退选中色
const mainBtnBg = computed(() => tabStyleCfg.value.colors?.highlight || activeColor.value);
// 中间按钮尺寸/形状（云菜鸟：按钮居中=圆角矩形(高=btnHeight 圆角=btnRadius)；凸起/嵌入=圆形）
const midBtnStyle = computed(() => {
  const h = (tabStyleCfg.value.btnHeight || 28) * 2;
  const r = (tabStyleCfg.value.btnRadius || 7) * 2;
  if (tabStyle.value === 'btnCenter') {
    return { background: mainBtnBg.value, width: '76rpx', height: h + 'rpx', borderRadius: r + 'rpx' };
  }
  return { background: mainBtnBg.value };
});
// 导航横线（云菜鸟：平铺普通/滑块/居中 配置项；不填则不显示）
const navLineColor = computed(() => tabStyleCfg.value.colors?.navLine || '');
// 常规图标尺寸（云菜鸟 26px → 52rpx）
const tabIconStyle = { width: '52rpx', height: '52rpx' };
// 扇形悬浮：菜单背景/菜单文字（云菜鸟联动；未配置回退白底/深灰）
const menuBgColor = computed(() => tabStyleCfg.value.colors?.menuBg || '#ffffff');
const menuTextColor = computed(() => tabStyleCfg.value.colors?.menuText || '#333333');
const activeSoft = computed(() => hexA(activeColor.value, 0.18));
const navMode = computed(() => designConfig.value?.navMode || 'default');
const navJumpEnabled = computed(() => designConfig.value?.navJumpEnabled !== false);

function isImgIcon(u) {
  if (!u) return false;
  return /^https?:|^data:|^\//.test(u) || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(u);
}
function iconUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:/.test(u)) return u;
  return u.startsWith('/') ? API_DOMAIN + u : API_DOMAIN + '/' + u;
}
function currentRoute() {
  const pages = getCurrentPages();
  const cur = pages[pages.length - 1];
  return cur ? '/' + (cur.route || '') : '';
}
function isOn(it) {
  const cur = currentRoute();
  if (!cur || !it.url) return false;
  return cur === it.url || cur.indexOf(it.url) === 0;
}
function tabColor(it) {
  return isOn(it) ? activeColor.value : inactiveColor.value;
}
function isMid(i) {
  // 云菜鸟实测：主按钮在中间菜单项，项数<3 则无主按钮
  // 5 项→第3项(index=2)正中、4 项→第3项(index=2)偏右、3 项→第2项(index=1)正中、2 项→无
  const n = designItems.value.length;
  if (n < 3) return false;
  return i === Math.floor(n / 2);
}
function tabbarStyle() {
  const st = {};
  // 背景类型（云菜鸟矩阵）：颜色型(普通/滑块/居中/扇形) → 背景颜色；图片型(凸起/嵌入) → 背景图片
  if (isColorBg.value) {
    st.background = tabStyleCfg.value.bgColor || '#ffffff';
  } else if (tabBg.value) {
    st.backgroundImage = `url(${iconUrl(tabBg.value)})`;
    st.backgroundSize = 'cover';
    st.backgroundPosition = 'center';
  } else {
    st.background = '#ffffff';
  }
  // 底部悬浮：左右留白 + 底部留白 + 圆角卡片
  if (tabType.value === 'float') {
    st.left = '32rpx';
    st.right = '32rpx';
    st.bottom = '28rpx';
    st.borderRadius = '48rpx';
    st.boxShadow = '0 8rpx 32rpx rgba(0,0,0,0.12)';
  }
  // 导航横线（云菜鸟：平铺 普通/滑块/居中 配置项；有值=显示配置色，空=隐藏）
  if (navLineColor.value) {
    st.borderTop = `1px solid ${navLineColor.value}`;
  } else if (tabType.value !== 'float') {
    st.borderTop = 'none';
  }
  return st;
}

function goDesign(it) {
  if (!navJumpEnabled.value) return;
  if (isOn(it) || !it.url) return;
  fanOpen.value = false;
  uni.reLaunch({ url: it.url });
}

async function loadNav() {
  // 底部导航是全局关键 UI：强制拉最新配置（跳过 5 分钟 storage 缓存）+ 时间戳防浏览器 HTTP 缓存，
  // 设计中心切换方案后刷新页面/返回本页立即生效，无需清缓存
  try {
    const cfg = await fetchDesignConfig(true, false, props.pageType);
    if (cfg) localCfg.value = cfg;
  } catch (e) { /* 拉取失败保持兜底 */ }
  try {
    const res = await cardApi.getCardsSafe();
    if (res.cards && res.cards.length) myCardId.value = res.cards[0].id;
  } catch (e) {}
}

onMounted(loadNav);

function goCard() {
  if (!navJumpEnabled.value) return;
  if (props.active === 'card') return;
  // 优先回到最近查看的名片，避免多张名片时固定跳第一张
  const lastId = uni.getStorageSync('cardLastViewId');
  if (lastId) {
    uni.reLaunch({ url: `/pages/card/myCard?id=${lastId}` });
  } else if (myCardId.value) {
    uni.reLaunch({ url: `/pages/card/myCard?id=${myCardId.value}` });
  } else {
    uni.navigateTo({ url: '/pages/card/create' });
  }
}

function goPage(path, key) {
  if (!navJumpEnabled.value) return;
  if (props.active === key) return;
  uni.reLaunch({ url: path });
}

/** 十六进制色转 rgba（滑杆/背景半透明用） */
function hexA(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return 'rgba(22, 93, 255, ' + alpha + ')';
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
</script>

<style scoped>
.mp-tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  display: flex;
  padding: 14rpx 0 calc(14rpx + env(safe-area-inset-bottom));
  border-top: 1px solid #f2f3f5;
  z-index: 50;
}
/* 边框圆角：圆角 / 弧形 */
.mp-corner-round { border-radius: 32rpx 32rpx 0 0; overflow: hidden; }
.mp-corner-arc { border-radius: 60rpx 60rpx 0 0; overflow: hidden; }
/* 底部悬浮（radius 由内联样式控制） */
.mp-tabbar-float { border-top: none; }

.mtb {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 6rpx;
  font-size: 22rpx;
  color: #9a9a9a;
  background: none;
  border: none;
  padding: 0;
  position: relative;
}
.mtb.on { font-weight: 500; }
.mp-tab-txt { line-height: 1.2; font-size: 36rpx; }
.mp-tab-bold { font-weight: 600; }
.tab-icon-img { width: 44rpx; height: 44rpx; }

/* slider：选中项圆形滑块背景 */
.mp-slider {
  position: absolute;
  top: 2rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 68rpx;
  height: 68rpx;
  border-radius: 50%;
  z-index: 0;
}
.mp-slider + image, .mp-slider + .s-icon, .mp-slider ~ .mp-tab-txt { position: relative; z-index: 1; }

/* 中间突出按钮（按钮居中/凸起/嵌入） */
.mp-mid-btn {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 10rpx 24rpx rgba(0, 0, 0, 0.18);
  align-self: flex-start;
  margin-top: -36rpx;
}
.mp-mid-btn .s-icon { margin: 0; }
.mp-mid-img { width: 44rpx; height: 44rpx; }
.mp-mid-txt { font-size: 20rpx; color: #fff; line-height: 1.3; }
/* 按钮居中：居中凸出半个 */
.mp-mid-btnCenter { margin-top: -30rpx; width: 100rpx; height: 100rpx; }
/* 按钮凸起：明显凸出（上移更多 + 阴影加强；直径与云菜鸟 43px 一致） */
.mp-mid-btnRaise { margin-top: -64rpx; width: 88rpx; height: 88rpx; box-shadow: 0 14rpx 32rpx rgba(0, 0, 0, 0.22); }
/* 按钮嵌入：半嵌 bar 内 */
.mp-mid-btnInset { margin-top: -16rpx; width: 88rpx; height: 88rpx; box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.12); }

/* 扇形悬浮 */
.mp-fan-main {
  position: absolute;
  left: 50%;
  bottom: calc(28rpx + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: 108rpx;
  height: 108rpx;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 10rpx 28rpx rgba(0, 0, 0, 0.25);
  z-index: 12;
}
.mp-fan-main-img { width: 52rpx; height: 52rpx; }
.mp-fan-main-txt { font-size: 20rpx; color: #fff; line-height: 1.3; margin-top: 2rpx; }
.mp-fan-menu {
  position: absolute;
  bottom: calc(168rpx + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 24rpx;
  z-index: 12;
}
.mp-fan-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  background: rgba(255, 255, 255, 0.96);
  border-radius: 20rpx;
  padding: 16rpx 20rpx;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.14);
}
.mp-fan-item-img { width: 40rpx; height: 40rpx; }
.mp-fan-item-txt { font-size: 20rpx; }
</style>
