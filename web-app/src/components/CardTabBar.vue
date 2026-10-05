<template>
  <view
    v-if="designItems.length || navMode !== 'none'"
    class="mp-tabbar"
    :class="['mp-tabbar-' + tabType, 'mp-corner-' + tabCorner, 'mp-st-' + tabStyle]"
    :style="tabbarStyle()"
  >
    <!-- 按钮凸起/嵌入：导航背景图独立图层（云菜鸟：contain + center bottom，容器高=背景图高/2） -->
    <view v-if="bgLayerStyle" class="mp-tabbar-bg" :style="bgLayerStyle"></view>
    <!-- 设计中心已发布底部导航方案：优先渲染配置项 -->
    <template v-if="designItems.length">
      <!-- 扇形悬浮：右下菜单主按钮 + 弧形子菜单（云菜鸟 1:1：子菜单默认展开） -->
      <template v-if="tabType === 'fan'">
        <view v-if="fanOpen" class="mp-fan-menu" :class="'mp-fan-count-' + designItems.length">
          <view v-for="(it, i) in designItems" :key="i" class="mp-fan-item" :class="'mp-fan-pos-' + i" :style="{ background: fanBg }" @click="goDesign(it)">
            <image v-if="useItemImg(it)" :src="iconUrl(itemImgSrc(it))" class="mp-fan-item-img" mode="aspectFit" />
            <SIcon v-else :name="it.icon || fallbackTabIcon(it.text)" size="default" :color="isOn(it) ? activeColor : menuTextColor" />
            <text class="mp-fan-item-txt" :style="{ color: isOn(it) ? activeColor : menuTextColor }">{{ it.text }}</text>
          </view>
        </view>
        <view class="mp-fan-main" :style="{ background: fanMainBg }" @click="fanOpen = !fanOpen">
          <view class="mp-fan-main-icon"><i></i><i></i><i></i></view>
          <text class="mp-fan-main-txt">菜单</text>
        </view>
      </template>

      <!-- 平铺/悬浮：5 种选中风格 -->
      <template v-else>
        <view
          v-for="(it, i) in designItems"
          :key="i"
          class="mtb"
          :class="[{ on: isOn(it) }, 'mtb-' + tabStyle, { 'mp-mid': isMid(i) }]"
          :style="itemStyle()"
          @click="goDesign(it)"
        >
          <!-- slider：选中项图标后圆形滑块 -->
          <view v-if="tabStyle === 'slider' && isOn(it)" class="mp-slider" :style="{ background: activeColor }"></view>

          <!-- 按钮居中/凸起/嵌入：中间项渲染突出大按钮 + 文字（云菜鸟 1:1：标签保留） -->
          <view
            v-if="isMid(i) && ['btnCenter', 'btnRaise', 'btnInset'].includes(tabStyle)"
            class="mp-mid"
            :class="'mp-mid-' + tabStyle"
          >
            <view class="mp-mid-btn" :style="midBtnStyle">
              <image v-if="useItemImg(it)" :src="iconUrl(itemImgSrc(it))" class="mp-mid-img" mode="aspectFit" />
              <SIcon v-else :name="it.icon || fallbackTabIcon(it.text)" size="large" color="#ffffff" />
            </view>
            <text class="mp-mid-txt" :class="{ on: isOn(it) }" :style="{ color: tabColor(it) }">{{ it.text }}</text>
          </view>

          <!-- 常规项（含 slider 滑块项） -->
          <template v-else>
            <image v-if="useItemImg(it)" :src="iconUrl(itemImgSrc(it))" class="tab-icon-img" mode="aspectFit" />
            <SIcon v-else :name="it.icon || fallbackTabIcon(it.text)" size="default" :style="tabIconStyle" :color="tabStyle === 'slider' && isOn(it) ? '#ffffff' : tabColor(it)" />
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
const fanOpen = ref(true); // 扇形子菜单默认展开（云菜鸟 1:1）

// 设计中心配置：优先响应式本地值（挂载时拉取），回退 storage 缓存
const localCfg = ref(null);
const designConfig = computed(() => localCfg.value || readDesignConfig());
const designItems = computed(() => designConfig.value?.tabItems || []);
const tabStyleCfg = computed(() => designConfig.value?.tabStyle || {});
const tabType = computed(() => tabStyleCfg.value.type || 'flat');
const tabStyle = computed(() => tabStyleCfg.value.style || 'normal');
const tabCorner = computed(() => tabStyleCfg.value.corner || 'square');
const tabBg = computed(() => tabStyleCfg.value.bg || '');
// 图标/图片模式（云菜鸟 iconimgshow：全局切换；图片模式每个菜单项两张图：未选中/已选中）
const iconMode = computed(() => tabStyleCfg.value.iconMode === 'img' ? 'img' : 'icon');
// 背景类型（云菜鸟实测矩阵）：fan、平铺/悬浮(普通/滑块/居中) = 背景颜色；平铺/悬浮(凸起/嵌入) = 背景图片
const isColorBg = computed(() => {
  const st = ['normal', 'slider', 'btnCenter'].includes(tabStyle.value);
  return tabType.value === 'fan' || st;
});
// 选中色：优先导航方案「已选中色」，空则回退主题主色（现状）
const activeColor = computed(() => {
  const s = tabStyleCfg.value.colors?.selected;
  return (s && s !== 'transparent') ? s : '#ff4d4f';
});
const inactiveColor = computed(() => tabStyleCfg.value.colors?.unselected || '#9a9a9a');
// 突出色：优先导航方案「突出颜色」，空则回退选中色
const mainBtnBg = computed(() => {
  // 中间按钮颜色：优先突出颜色，空则已选中色，不自动跟主题色（对齐云菜鸟）
  const c = tabStyleCfg.value.colors || {};
  if (c.highlight && c.highlight !== 'transparent') return c.highlight;
  if (c.selected && c.selected !== 'transparent') return c.selected;
  return '#ff4d4f';
});
/**
 * 按钮凸起/嵌入几何（云菜鸟后台实测，预览宽 375px 1:1；rpx = px × 2）
 * 容器高 = 背景图高/2（图 750 宽 → 375 宽等比），padding 与中钮负边距均按实测值
 * footnav_4=凸起 / footnav_5=嵌入；foot_styleBox1=普通平铺 / foot_styleBox2=底部悬浮
 */
const BTN_BG_METRIC = {
  'flat-btnRaise': { h: 164, padTop: 52, padSide: 0, mt: -60, mb: 16 },   // 82px / padding-top 26 / 中钮 -30 / 8
  'flat-btnInset': { h: 110, padTop: 0, padSide: 0, mt: -64, mb: 22 },    // 55px / 0 / -32 / 11
  'float-btnRaise': { h: 190, padTop: 52, padSide: 40, mt: -60, mb: 16 }, // 95px / 26+左右20 / -30 / 8
  'float-btnInset': { h: 138, padTop: 0, padSide: 40, mt: -64, mb: 22 },  // 69px / 左右20 / -32 / 11
};
const btnMetric = computed(() => BTN_BG_METRIC[`${tabType.value}-${tabStyle.value}`] || null);
// 背景图：云菜鸟原图命名 footerbg{1平铺|2悬浮}_{1凸起|2嵌入} / footerbg2_{4凸起|5嵌入}_{1直角|2圆角|3弧形}
const bgImgPath = computed(() => {
  const kind = tabStyle.value === 'btnRaise' ? 'raise' : 'inset';
  if (tabType.value === 'float') {
    const c = tabCorner.value === 'square' ? '-square' : tabCorner.value === 'arc' ? '-arc' : '';
    return `/images/tabbar-bg/btn-${kind}-float${c}.png`;
  }
  return `/images/tabbar-bg/btn-${kind}-flat.png`;
});
// 背景图独立图层：高度=导航条高度（不含安全区），contain + center bottom 对齐云菜鸟
const bgLayerStyle = computed(() => {
  if (isColorBg.value || !btnMetric.value) return null;
  let bgPath = tabBg.value;
  if (!bgPath || bgPath.includes('/images/tabbar-bg/btn-')) bgPath = bgImgPath.value;
  return {
    height: btnMetric.value.h + 'rpx',
    backgroundImage: `url(${iconUrl(bgPath)})`,
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center bottom',
  };
});
// 菜单项高度（凸起/嵌入时按云菜鸟实测：容器高 - padding-top）
function itemStyle() {
  const m = btnMetric.value;
  return m ? { height: m.h - m.padTop + 'rpx' } : {};
}
// 中间按钮尺寸/形状（云菜鸟：按钮居中=圆角矩形(高=btnHeight 圆角=btnRadius)；凸起/嵌入=圆形）
const midBtnStyle = computed(() => {
  const h = (tabStyleCfg.value.btnHeight || 28) * 2;
  const r = (tabStyleCfg.value.btnRadius || 7) * 2;
  const isCenter = tabStyle.value === 'btnCenter';
  if (isCenter) {
    // 按钮居中：红色pill圆角矩形（对齐云菜鸟：高28px圆角7px）
    return { background: mainBtnBg.value, width: '112rpx', height: h + 'rpx', borderRadius: r + 'rpx', boxShadow: '0 6rpx 16rpx rgba(0,0,0,0.15)' };
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
// 扇形悬浮：背景颜色(bgColor，云菜鸟扇形专用)优先作菜单/主按钮背景，回落菜单背景/突出色
const fanBg = computed(() => tabStyleCfg.value.bgColor || menuBgColor.value);
const fanMainBg = computed(() => tabStyleCfg.value.bgColor || mainBtnBg.value);
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
// 图片模式：按选中态返回 已选中图(imgurlact) / 未选中图(imgurl)，非图片模式或无图返回 null（回落图标）
function itemImgSrc(it) {
  if (iconMode.value !== 'img') return null;
  return (isOn(it) && it.imgurlact) ? it.imgurlact : it.imgurl;
}
function useItemImg(it) { return !!itemImgSrc(it); }
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
  // 云菜鸟实测：仅奇数项（5/3 项）中间菜单项有主按钮凸起，偶数项（4/2 项）无主按钮（退化均分）
  const n = designItems.value.length;
  if (n < 3 || n % 2 === 0) return false;
  return i === Math.floor(n / 2);
}
function tabbarStyle() {
  const st = {};
  // 背景类型（云菜鸟矩阵）：颜色型(普通/滑块/居中/扇形) → 背景颜色；图片型(凸起/嵌入) → 背景图片
  if (isColorBg.value) {
    st.background = tabStyleCfg.value.bgColor || '#ffffff';
  } else {
    // 按钮凸起/嵌入：云菜鸟 1:1 —— 背景图由独立图层渲染（contain + center bottom），
    // 容器只负责内边距（内缩由背景图自带透明边 + padding 共同决定），不再拉伸背景、不再手动偏移悬浮位置
    const m = btnMetric.value;
    if (m) {
      st.paddingTop = m.padTop + 'rpx';
      st.paddingLeft = m.padSide + 'rpx';
      st.paddingRight = m.padSide + 'rpx';
      st.paddingBottom = 'env(safe-area-inset-bottom)';
      // 无菜单项时兜底撑住导航条（菜单项高度由 itemStyle 给出）
      st.minHeight = m.h - m.padTop + 'rpx';
    }
    return st;
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

/* 菜单项文字：官方原生 tabBar 文字 10px 固定不可配；官方字号梯度 22/17/15/14/12pt，
   18px(36rpx) 不在梯度内且远大于原生观感。这里取 12pt(24rpx)——在官方梯度内，
   同时与云菜鸟后台实测的菜单文字 12px 一致（下方 btnRaise/btnInset 覆盖值同源）。 */
.mtb {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 6rpx;
  font-size: 24rpx;
  color: #9a9a9a;
  background: none;
  border: none;
  padding: 0;
  position: relative;
}
.mtb.on { font-weight: 500; }
.mp-tab-txt { line-height: 1.2; font-size: 24rpx; }
/* 图标水平居中：
   SIcon 根节点自带 `flex: 0 0 auto`（小程序端是 `<image>` **原生组件**），
   而 `margin: 0 auto` 对原生 `<image>` 的水平居中**不可靠**——H5 端量到
   `margin:0px 68.3px` 能居中，小程序端同一份样式却不居中（原生组件不吃 auto margin）。
   → 改由**父容器** `.mtb` 的 `align-items:center` 负责水平居中（已在 .mtb 里），
     图标自身只需 `display:block`（去掉 `display:inline-block` 的基线对齐问题），
     并显式 `flex: none` + `align-self:center` 防止 flex-shrink 把它压窄。
   SIcon 是子组件，须用 :deep() 穿透 scoped 才能命中其根节点。 */
.mtb :deep(.s-icon),
.mtb .tab-icon-img { display: block; flex: none; align-self: center; margin: 0; }
.mp-tab-txt { display: block; width: 100%; text-align: center; }
.mp-tab-bold { font-weight: 600; }
.tab-icon-img { width: 44rpx; height: 44rpx; }

/* slider：选中项圆形滑块背景（凸出导航条上沿，对齐云菜鸟） */
.mp-slider {
  position: absolute;
  top: -28rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  z-index: 0;
  box-shadow: 0 0 0 6rpx #ffffff, 0 8rpx 20rpx rgba(0, 0, 0, 0.2);
}
/* slider 选中项：图标上移居中到圆钮中央（对齐云菜鸟） */
.mtb-slider.on :deep(.s-icon), .mtb-slider.on .tab-icon-img { position: relative; top: -24rpx; z-index: 1; }
.mp-slider + image, .mp-slider + :deep(.s-icon), .mp-slider ~ .mp-tab-txt { position: relative; z-index: 1; }

/* 按钮凸起/嵌入：云菜鸟 1:1 图层与排版修正 */
.mp-tabbar.mp-st-btnRaise, .mp-tabbar.mp-st-btnInset { overflow: visible; }
.mp-tabbar-bg {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  z-index: 0;
  pointer-events: none;
}
/* 菜单项：云菜鸟 .item 为 flex 居中（无 gap），常规图标 26px→52rpx，文字 12px→24rpx */
.mp-tabbar.mp-st-btnRaise .mtb,
.mp-tabbar.mp-st-btnInset .mtb { justify-content: center; gap: 0; position: relative; z-index: 1; }
/* 字号已与基础 .mp-tab-txt 同为 24rpx（12pt 官方梯度内），此处只补行高 */
.mp-tabbar.mp-st-btnRaise .mp-tab-txt,
.mp-tabbar.mp-st-btnInset .mp-tab-txt { line-height: 36rpx; }
.mp-tabbar.mp-st-btnRaise .tab-icon-img,
.mp-tabbar.mp-st-btnInset .tab-icon-img { width: 56rpx; height: 56rpx; }
/* 中钮：云菜鸟 navNum_icon 43×43px → 86rpx，阴影 0 3px 2px rgba(165,178,195,.22)
   凸起 margin-top -30px / 嵌入 -32px，配 flex 居中实现"骑在导航条凹槽/凸台上" */
.mp-mid-btnRaise, .mp-mid-btnInset { height: auto; justify-content: flex-start; }
.mp-mid-btnRaise .mp-mid-btn,
.mp-mid-btnInset .mp-mid-btn {
  width: 86rpx;
  height: 86rpx;
  box-shadow: 0 6rpx 4rpx rgba(165, 178, 195, 0.22);
}
.mp-mid-btnRaise .mp-mid-btn { margin-top: -60rpx; margin-bottom: 16rpx; }
.mp-mid-btnInset .mp-mid-btn { margin-top: -64rpx; margin-bottom: 22rpx; }
/* 中间突出项容器：圆形按钮 + 下方文字（云菜鸟 1:1：主按钮标签保留） */
.mp-mid { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
.mp-mid-btn {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 10rpx 24rpx rgba(0, 0, 0, 0.18);
  align-self: center;
}
/* 中钮图标同样要`flex:none`，否则 SIcon 的 flex-basis 在小程序 `<image>` 上不居中 */
.mp-mid-btn :deep(.s-icon) { margin: 0; flex: none; align-self: center; }
.mp-mid-img { width: 44rpx; height: 44rpx; }
.mp-mid-txt { font-size: 20rpx; line-height: 1.2; margin-top: 2rpx; white-space: nowrap; }
.mp-mid-txt.on { font-weight: 600; }
.mp-mid-btnRaise .mp-mid-txt, .mp-mid-btnInset .mp-mid-txt { margin-top: 0; }
/* 按钮居中：红色pill圆角矩形 */
.mp-mid-btnCenter .mp-mid-btn { margin-top: -28rpx; width: 112rpx; height: 56rpx; border-radius: 14rpx; }
/* 凸起/嵌入：中钮图标 23px→46rpx、图片图标 28px→56rpx（云菜鸟 .item img） */
.mp-mid-btnRaise .mp-mid-img, .mp-mid-btnInset .mp-mid-img { width: 56rpx; height: 56rpx; }

/* 扇形悬浮（云菜鸟 1:1：右下菜单主按钮 + 弧形子菜单） */
.mp-fan-main {
  position: absolute;
  right: 94rpx;
  bottom: calc(515rpx + env(safe-area-inset-bottom));
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
.mp-fan-main-icon { display: flex; flex-direction: column; gap: 7rpx; align-items: center; }
.mp-fan-main-icon i { display: block; width: 34rpx; height: 4rpx; border-radius: 2rpx; background: #fff; }
.mp-fan-main-txt { font-size: 20rpx; color: #fff; line-height: 1.3; margin-top: 4rpx; }
.mp-tabbar-fan { background: transparent !important; border-top: none; box-shadow: none !important; }
.mp-tabbar.mp-st-btnRaise, .mp-tabbar.mp-st-btnInset {
  background: transparent;
  border-top: none;
}
/* 高度由菜单项撑起（= 背景图高/2 - padding-top），不再写死 min-height */
.mp-fan-menu { position: absolute; inset: 0; z-index: 11; pointer-events: none; }
/* 4 项与 5 项扇形弧线统一（菜鸟云：右上1+左弧3，5项加右下） */
.mp-fan-item {
  position: absolute;
  width: 92rpx;
  height: 92rpx;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rpx;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  line-height: 1.2;
}
.mp-fan-item-img { width: 40rpx; height: 40rpx; }
.mp-fan-item-txt { font-size: 20rpx; }
/* 子按钮以主按钮圆心为基准沿左半圆弧均匀分布，互不重叠（对齐新菜鸟 1:1，与 admin 预览同比例） */
.mp-fan-pos-0 { right: 40rpx; bottom: 630rpx; }   /* 右上：选中态 */
.mp-fan-pos-1 { right: 160rpx; bottom: 600rpx; } /* 正上偏左 */
.mp-fan-pos-2 { right: 240rpx; bottom: 450rpx; } /* 正左 */
.mp-fan-pos-3 { right: 160rpx; bottom: 300rpx; } /* 左下 */
.mp-fan-pos-4 { right: 30rpx; bottom: 270rpx; }  /* 右下 */
</style>
