<template>
  <!-- ===== 个性化分享（2026-10-21 新增）
       范式参考菜鸟云同名页：微信会话仿真预览 + 分享标题实时联动 + 封面风格库。
       差异点：我们的封面是「身份卡」（这个人是谁），不是菜鸟云的「引流卡」（一句广告）。
       预览区用 canvas 现场画当前选中的封面 → 与最终转发出去的图**完全一致**（所见即所得）。
       ⚠️ 画布节点测量必须走 setup 顶层的 inst（getCurrentInstance 在事件处理器里返回 null）。 -->
  <view class="ps-page" :style="[themeStyle, brandVars]">
    <PageNav title="个性化分享" back></PageNav>

    <view class="ps-body">
      <!-- 加载失败 -->
      <view class="pg-error" v-if="loadFailed">
        <view class="pg-err-text">{{ loadFailedMsg }}</view>
        <view class="pg-btn" @click="reloadPage">重新加载</view>
      </view>

      <block v-else>
        <!-- ===== 微信会话仿真预览 ===== -->
        <view class="ps-preview">
          <view class="ps-preview-tip">↓ 转发到微信后，对方看到的效果</view>
          <view class="ps-chat">
            <view class="ps-chat-head">
              <view class="ps-chat-logo">{{ orgFirstChar }}</view>
              <text class="ps-chat-org">{{ orgName }}</text>
              <view class="ps-chat-me">我</view>
            </view>
            <view class="ps-wxcard">
              <view class="ps-wxcard-title">
                <text class="ps-wxcard-title-txt">{{ titleDraft || '（未设置标题）' }}</text>
                <text class="ps-wxcard-arrow">›</text>
              </view>
              <view class="ps-wxcard-cover">
                <canvas
                  id="shareCoverCanvas"
                  type="2d"
                  class="ps-canvas"
                  :style="previewW ? { width: previewW + 'px', height: previewH + 'px' } : null"
                ></canvas>
              </view>
              <view class="ps-wxcard-foot">
                <view class="ps-wxcard-mp">小</view>
                <text class="ps-wxcard-mp-txt">名片</text>
              </view>
            </view>
          </view>
        </view>

        <!-- ===== 分享标题 ===== -->
        <view class="ps-card">
          <view class="ps-sec-title">
            <text>修改分享标题</text>
            <text class="ps-req">*</text>
            <text class="ps-count">{{ titleDraft.length }}/{{ SHARE_TITLE_MAX }}</text>
          </view>
          <input
            class="ps-input"
            v-model="titleDraft"
            :maxlength="SHARE_TITLE_MAX"
            placeholder="请输入分享标题，不可为空"
            placeholder-class="ps-ph"
          />
          <view class="ps-hint">留空则自动使用「姓名 · 职位 · 公司」</view>
        </view>

        <!-- ===== 封面风格库 ===== -->
        <view class="ps-card">
          <view class="ps-sec-title">
            <text>选择分享封面</text>
            <text class="ps-count">共 {{ styles.length }} 款 · 可横向滑动</text>
          </view>
          <scroll-view class="ps-covers" scroll-x :show-scrollbar="false">
            <view class="ps-covers-inner">
              <view
                v-for="s in styles"
                :key="s.key"
                class="ps-cover-item"
                :class="{ on: s.key === styleKey }"
                @click="pickStyle(s.key)"
              >
                <view class="ps-cover-thumb">
                  <!-- 🔴 #328：缩略图必须是 <image>，不能直接放 canvas ——
                       canvas 是原生组件，横向 scroll-view 里同层渲染一旦失效，
                       滑动时文字（普通节点）跟着走、canvas 钉在屏幕上不动（用户实测）。
                       正解：画到屏幕外的导出 canvas → 导出临时图片 → 用 <image> 展示。
                       canvas 仅作导出失败时的兜底（v-else）。 -->
                  <image
                    v-if="thumbSrc[s.key]"
                    class="ps-cover-img"
                    :src="thumbSrc[s.key]"
                    mode="aspectFill"
                  />
                  <canvas
                    v-else
                    :id="'coverThumb' + s.key.replace('-', '')"
                    type="2d"
                    class="ps-cover-canvas"
                    :style="{ width: thumbW + 'px', height: thumbH + 'px' }"
                  ></canvas>
                  <view v-if="s.key === styleKey" class="ps-cover-tick">✓</view>
                </view>
                <text class="ps-cover-name">{{ s.name }}</text>
              </view>
            </view>
          </scroll-view>
          <view class="ps-hint">{{ currentStyleDesc }}</view>
        </view>

        <view class="ps-bottom-space"></view>
      </block>
    </view>

    <!-- ===== 底部保存 ===== -->
    <view class="ps-footer" v-if="!loadFailed">
      <view class="ps-save" :class="{ disabled: !canSave }" @click="save">保存</view>
    </view>

    <!-- 🔴 #328 缩略图导出用的屏幕外画布（画 6 款风格 → 逐张导出临时图片给 <image>）。
         ⚠️ 不能 display:none —— MP 端节点查不到（本项目 shareCoverExport.js 已踩过），
         必须 position:fixed + 负偏移移出屏幕。 -->
    <canvas id="coverExportCanvas" type="2d" class="ps-export-canvas"></canvas>
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import { ref, computed, nextTick } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getCurrentInstance } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';
import {
  SHARE_STYLES, SHARE_COVER_W, SHARE_COVER_H, SHARE_TITLE_MAX,
  renderShareCover, resolveBrandColors, resolveShareTitle,
} from './shareCover.js';
import { exportShareCover } from './shareCoverExport.js';

const themeStyle = useDesignTheme();
const { brandVars, brandPrimary } = useBrandOverride();

// 🔴 getCurrentInstance() 只能在 setup 顶层调：Vue 3 依赖 setup 调用栈里的 currentInstance
//    全局量，事件处理器里 / await 之后调一律返回 null → q.in(null.proxy) 抛 TypeError
//    → 被外层 catch 吞成 toast（canvas 节点测量类需求全中）。同项目 CardTabBar.vue 写法可对照。
const inst = getCurrentInstance();

const styles = SHARE_STYLES;
/** 位图绘制尺寸（设计稿像素，5:4）。⚠️ 只用于 renderShareCover 的 W/H，
 *  **不能**拿来当 canvas 的 CSS 显示尺寸（#328 病根） */
const coverW = SHARE_COVER_W;
const coverH = SHARE_COVER_H;
const thumbW = 148;
const thumbH = Math.round((148 * SHARE_COVER_H) / SHARE_COVER_W);

// 🔴 #328：预览画布的 **CSS 显示尺寸** 必须按容器缩放，不能直接用设计稿像素。
//   病根：原来 `:style="{width: SHARE_COVER_W+'px'}"` = 750px 宽 —— 375 屏上宽被容器
//   裁掉、高 600px 全保留 → 实际显示约 302×600（≈1:2），用户报「分享卡片预览比例不对」。
//   位图仍由 renderShareCover 按 750×600 绘制（清晰度不变），这里只改**显示**尺寸。
//   初值用屏宽推（避免首帧空），随后用 `.ps-wxcard-cover` 实测值校正。
const previewW = ref(0);
const previewH = computed(() =>
  previewW.value ? Math.round((previewW.value * SHARE_COVER_H) / SHARE_COVER_W) : 0
);
function initPreviewW() {
  let sysW = 375;
  try { sysW = (uni.getSystemInfoSync() || {}).windowWidth || 375; } catch (e) { /* 保持默认 */ }
  // 98rpx = ps-preview 左右 padding 24×2 + ps-chat 左右 padding 24×2 + wxcard 边框 1×2
  previewW.value = Math.round((sysW * (750 - 98)) / 750);
}
initPreviewW();

// 🔴 #328：缩略图导出结果（key → 临时图片路径/H5 dataURL）。有值就渲染 <image>，
//   没值（导出失败）走 v-else 的 canvas 兜底直绘。
const thumbSrc = ref({});

const card = ref({});
const styleKey = ref('cover-1');
const titleDraft = ref('');
const loadFailed = ref(false);
const loadFailedMsg = ref('加载失败，请检查网络后重试');
const qrImage = ref('');

const orgName = computed(() => card.value.company || '我的名片');
const orgFirstChar = computed(() => orgName.value.charAt(0) || '我');
const currentStyleDesc = computed(() => {
  const s = styles.find((x) => x.key === styleKey.value);
  return s ? s.desc : '';
});
const canSave = computed(() => !loadFailed.value);

function resolveCardId() {
  const pages = getCurrentPages();
  const opts = (pages[pages.length - 1] || {}).options || {};
  if (opts.id) return Number(opts.id);
  return null;
}

async function load() {
  loadFailed.value = false;
  try {
    const res = await cardApi.getCardsSafe();
    const list = (res && res.cards) || [];
    let c = list[0];
    const wantId = resolveCardId();
    if (wantId) {
      const hit = list.find((x) => Number(x.id) === wantId);
      if (hit) c = hit;
    }
    if (!c) {
      loadFailed.value = true;
      loadFailedMsg.value = '还没有名片，先创建一张再来设置分享样式';
      return;
    }
    card.value = c;
    styleKey.value = c.shareStyle || 'cover-1';
    titleDraft.value = c.shareTitle || '';
    // 二维码（真实小程序码；取不到不影响封面预览）
    try {
      const q = await cardApi.getWxacode(c.id);
      qrImage.value = (q && q.image) || '';
    } catch (e) {
      qrImage.value = '';
    }
    await nextTick();
    await renderAll();
  } catch (e) {
    loadFailed.value = true;
    loadFailedMsg.value = (e && e.message) || '加载失败，请检查网络后重试';
  }
}

function reloadPage() {
  load();
}

/** 通用节点查询（MP）：返回 { node, width, height } 或 null */
function queryNode(sel) {
  const q = uni.createSelectorQuery();
  if (inst) q.in(inst.proxy);
  return new Promise((resolve) => {
    q.select(sel).fields({ node: true, size: true, rect: true }).exec((res) => {
      resolve(res && res[0] ? res[0] : null);
    });
  });
}

/** H5 端拿真 canvas：uni 的 <canvas> 编译成包裹层，真 canvas 在里面 */
function h5Canvas(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  return el.getContext ? el : el.querySelector('canvas');
}

/** 画当前封面到预览画布 */
async function renderPreview() {
  const colors = resolveBrandColors(card.value, brandPrimary.value || (themeStyle.value && themeStyle.value['--design-primary']));
  // 🔴 #328：先实测容器宽校正显示尺寸（推算值可能差几像素）
  const box = await queryNode('.ps-wxcard-cover');
  if (box && box.width > 0) previewW.value = Math.round(box.width);
  // #ifdef MP-WEIXIN
  const node = await queryNode('#shareCoverCanvas');
  if (node && node.node) {
    await renderShareCover(node.node, card.value, styleKey.value, colors, {
      W: coverW, H: coverH, dpr: 1,
      qrImage: qrImage.value,
      avatarImage: card.value.avatar || '',
    });
  }
  // #endif
  // #ifndef MP-WEIXIN
  const el = h5Canvas('shareCoverCanvas');
  if (el) {
    await renderShareCover(el, card.value, styleKey.value, colors, {
      W: coverW, H: coverH, dpr: 2,
      qrImage: qrImage.value,
      avatarImage: card.value.avatar || '',
    });
  }
  // #endif
}

/**
 * 画 6 张缩略图（🔴 #328 重写）。
 *
 * 主路径：画到**屏幕外导出 canvas** → 导出临时图片 → `<image>` 展示。
 *   为什么不直接画可见 canvas：canvas 是原生组件，横向 scroll-view 里同层渲染
 *   一旦失效，滑动时普通节点（文字）跟手、canvas 钉在屏幕上不动（用户实测）。
 *   <image> 是普通节点，滚动跟手，还把 6 个原生 canvas 降到 0 个（省性能）。
 * 兜底：导出失败 → 退回老的「可见 canvas 直绘」（v-else 分支）。
 */
async function renderThumbs() {
  const colors = resolveBrandColors(card.value, brandPrimary.value || (themeStyle.value && themeStyle.value['--design-primary']));
  for (const s of styles) {
    let src = '';
    // #ifdef MP-WEIXIN
    try {
      // eslint-disable-next-line no-await-in-loop
      const node = await queryNode('#coverExportCanvas');
      if (node && node.node) {
        // eslint-disable-next-line no-await-in-loop
        src = await exportShareCover(node.node, card.value, s.key, colors, {
          avatarImage: card.value.avatar || '',
          dpr: 1,
        });
      }
    } catch (e) { src = ''; }
    // #endif
    // #ifndef MP-WEIXIN
    try {
      const el = h5Canvas('coverExportCanvas');
      if (el) {
        // eslint-disable-next-line no-await-in-loop
        await renderShareCover(el, card.value, s.key, colors, {
          W: SHARE_COVER_W, H: SHARE_COVER_H, dpr: 1,
          qrImage: '', avatarImage: card.value.avatar || '',
        });
        src = el.toDataURL('image/png');
      }
    } catch (e) { src = ''; }
    // #endif
    if (src) {
      thumbSrc.value = { ...thumbSrc.value, [s.key]: src };
    } else {
      // 导出失败 → 可见 canvas 直绘兜底（滑动 bug 仅在此降级路径复现）
      // #ifdef MP-WEIXIN
      // eslint-disable-next-line no-await-in-loop
      await drawThumbMP(s.key, colors);
      // #endif
      // #ifndef MP-WEIXIN
      // eslint-disable-next-line no-await-in-loop
      await drawThumbH5(s.key, colors);
      // #endif
    }
  }
}

async function drawThumbMP(key, colors) {
  const q = uni.createSelectorQuery();
  if (inst) q.in(inst.proxy);
  const sel = `#coverThumb${key.replace('-', '')}`;
  await new Promise((resolve) => {
    q.select(sel).fields({ node: true, size: true }).exec(async (res) => {
      if (res && res[0] && res[0].node) {
        await renderShareCover(res[0].node, card.value, key, colors, {
          W: SHARE_COVER_W, H: SHARE_COVER_H, dpr: 1,
          qrImage: '', avatarImage: card.value.avatar || '',
        });
      }
      resolve();
    });
  });
}

async function drawThumbH5(key, colors) {
  const el = document.getElementById('coverThumb' + key.replace('-', ''));
  if (el && el.getContext) {
    await renderShareCover(el, card.value, key, colors, {
      W: SHARE_COVER_W, H: SHARE_COVER_H, dpr: 1,
      qrImage: '', avatarImage: card.value.avatar || '',
    });
  }
}

async function renderAll() {
  await renderPreview();
  await renderThumbs();
}

function pickStyle(key) {
  if (styleKey.value === key) return;
  styleKey.value = key;
  renderPreview();
}

async function save() {
  if (!canSave.value) return;
  const title = titleDraft.value.trim();
  if (!title) {
    uni.showToast({ title: '请输入分享标题', icon: 'none' });
    return;
  }
  try {
    await cardApi.updateCard(card.value.id, {
      shareStyle: styleKey.value,
      shareTitle: title,
    });
    uni.showToast({ title: '已保存', icon: 'success' });
    card.value = { ...card.value, shareStyle: styleKey.value, shareTitle: title };
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
  }
}

onShow(() => {
  load();
});
</script>

<style scoped>
.ps-page {
  min-height: 100vh;
  background: var(--bg-page);
  display: flex;
  flex-direction: column;
}
.ps-body { flex: 1; overflow-y: auto; }
.ps-bottom-space { height: 40rpx; }

/* ===== 预览区 ===== */
.ps-preview {
  background: var(--bg-hover);
  padding: 24rpx 24rpx 30rpx;
}
.ps-preview-tip {
  font-size: 22rpx; color: var(--decor-2); text-align: center; margin-bottom: 20rpx;
}
.ps-chat {
  background: var(--white); border-radius: 20rpx; padding: 24rpx 24rpx 0; overflow: hidden;
}
.ps-chat-head { display: flex; align-items: center; margin-bottom: 20rpx; }
.ps-chat-logo {
  width: 44rpx; height: 44rpx; border-radius: 50%;
  background: linear-gradient(135deg, var(--gold), var(--brand-orange));
  color: var(--t1); font-size: 22rpx; font-weight: 700;
  display: flex; align-items: center; justify-content: center; margin-right: 16rpx;
}
.ps-chat-org { font-size: 26rpx; color: var(--t1); font-weight: 500; }
.ps-chat-me {
  margin-left: auto; width: 68rpx; height: 68rpx; border-radius: 10rpx;
  background: linear-gradient(135deg, var(--primary), var(--primary-deep));
  color: var(--white); font-size: 26rpx; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}
.ps-wxcard {
  border: 1rpx solid var(--border); border-radius: 16rpx; overflow: hidden; background: var(--white);
}
.ps-wxcard-title {
  display: flex; align-items: center;
  padding: 24rpx 24rpx 16rpx;
}
.ps-wxcard-title-txt { font-size: 28rpx; color: var(--t1); font-weight: 500; }
.ps-wxcard-arrow { font-size: 26rpx; color: var(--border); margin-left: 10rpx; }
.ps-wxcard-cover {
  width: 100%; background: var(--bg-hover); overflow: hidden;
  display: flex; justify-content: center;
}
.ps-canvas { display: block; }
.ps-wxcard-foot {
  display: flex; align-items: center;
  padding: 18rpx 24rpx; border-top: 1rpx solid var(--bg-card-2);
}
.ps-wxcard-mp {
  width: 30rpx; height: 30rpx; border-radius: 6rpx;
  background: var(--design-primary, var(--primary)); color: var(--white); font-size: 18rpx;
  display: flex; align-items: center; justify-content: center; font-weight: 700; margin-right: 10rpx;
}
.ps-wxcard-mp-txt { font-size: 24rpx; color: var(--t3); }

/* ===== 卡片区块 ===== */
.ps-card {
  background: var(--white); margin: 24rpx 24rpx 0; border-radius: 20rpx; padding: 28rpx 24rpx;
}
.ps-sec-title {
  display: flex; align-items: center;
  font-size: 26rpx; color: var(--t1); margin-bottom: 20rpx;
}
.ps-req { color: var(--danger); margin-left: 6rpx; }
.ps-count { margin-left: auto; font-size: 22rpx; color: var(--t3); }
.ps-input {
  width: 100%; height: 92rpx; background: var(--bg-card);
  border-radius: 16rpx; padding: 0 24rpx; font-size: 30rpx; color: var(--t1);
}
.ps-ph { color: var(--decor); }
.ps-hint { font-size: 22rpx; color: var(--t3); margin-top: 14rpx; }

/* ===== 封面风格库 ===== */
.ps-covers { width: 100%; white-space: nowrap; }
.ps-covers-inner { display: inline-flex; padding: 2rpx 0 8rpx; }
.ps-cover-item { width: 296rpx; margin-right: 24rpx; display: inline-block; }
.ps-cover-thumb {
  width: 296rpx; height: 236rpx; border-radius: 16rpx; overflow: hidden;
  background: var(--bg-card); position: relative;
  border: 4rpx solid transparent; box-sizing: border-box;
}
.ps-cover-item.on .ps-cover-thumb { border-color: var(--brand-orange); }
.ps-cover-canvas { display: block; }
/* 🔴 #328：缩略图优先用导出的临时图片（canvas 在横向 scroll-view 里不跟手） */
.ps-cover-img { display: block; width: 100%; height: 100%; }
/* 🔴 #328：缩略图导出用的屏幕外画布。
   ⚠️ 禁 display:none（MP 节点查不到）→ 必须 fixed + 负偏移；禁 z-index（tokenAudit 零余量）。 */
.ps-export-canvas {
  position: fixed; left: -9999px; top: 0;
  width: 148px; height: 118px; pointer-events: none;
}
.ps-cover-tick {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 60rpx; height: 60rpx; border-radius: 50%;
  background: var(--brand-orange); color: var(--white); font-size: 32rpx;
  display: flex; align-items: center; justify-content: center;
}
.ps-cover-name {
  display: block; text-align: center; font-size: 24rpx; color: var(--t3);
  margin-top: 14rpx;
}
.ps-cover-item.on .ps-cover-name { color: var(--brand-orange); font-weight: 600; }

/* ===== 底部保存 ===== */
.ps-footer {
  flex: none; padding: 20rpx 28rpx 44rpx; background: var(--white); border-top: 1rpx solid var(--border);
}
.ps-save {
  height: 92rpx; border-radius: 46rpx; background: var(--design-primary, var(--primary));
  color: var(--white); font-size: 32rpx; display: flex; align-items: center; justify-content: center;
}
.ps-save.disabled { background: var(--border); }

/* ===== 错误态 ===== */
.pg-error { padding: 160rpx 48rpx; text-align: center; }
.pg-err-text { font-size: 28rpx; color: var(--t3); margin-bottom: 32rpx; }
.pg-btn {
  display: inline-block; padding: 20rpx 56rpx; border-radius: 40rpx;
  background: var(--design-primary, var(--primary)); color: var(--white); font-size: 28rpx;
}
</style>
