<template>
  <view class="pano-home">
    <view class="ph-topbar">
      <view class="ph-back" @tap="goBack">‹ 返回</view>
      <text class="ph-title">全景首页</text>
    </view>
    <!-- 编辑预览（设计中心 iframe）组件槽：点击选中 + 高亮，仅 H5 编辑模式生效 -->
    <template v-if="comps.length">
      <view
        v-for="(c, i) in comps"
        :key="i"
        class="dp-slot"
        :class="{ 'dp-slot-sel': editorSel === i }"
        <!-- #ifdef H5 -->
        @click.capture.stop="onSlotClick($event, i)"
        <!-- #endif -->
      >
        <DesignPage :comps="[c]" :tenant-id="Number(tid)" :global="designGlobal" />
      </view>
    </template>
    <view v-else class="ph-empty">暂无装修内容</view>
  </view>
</template>

<script>
import DesignPage from '../../components/DesignPage.vue';
import { cardApi } from '../../utils/cardApi.js';
import { normalizeDesignConfig } from '../../utils/design.js';

export default {
  components: { DesignPage },
  data() {
    return { comps: [], tid: '', designGlobal: {}, editorMode: false, editorSel: -1 };
  },
  onLoad(o) {
    const pageType = String((o && o.pageType) || '').trim();
    this.tid = String((o && o.tid) || '');
    this.detectEditorMode();
    if (this.editorMode) this.bindEditorBridge();
    if (!pageType) return;
    // 编辑预览（iframe 画布）：装修稿由编辑器 design-json 实时推送，跳过后端拉取避免竞态覆盖
    if (this.editorMode) return;
    cardApi.designConfig(false, pageType, this.tid)
      .then((raw) => {
        const cfg = normalizeDesignConfig(raw);
        this.comps = (cfg.pages && cfg.pages.components) || [];
      })
      .catch(() => { this.comps = []; });
  },
  methods: {
    goBack() {
      uni.navigateBack({ delta: 1, fail: () => uni.reLaunch({ url: '/pages/panorama/index' }) });
    },
    // ---- 设计中心编辑预览模式（iframe，仅 H5）：接收 designJson / 选中高亮 / 点击上报 / 高度上报 ----
    detectEditorMode() {
      // #ifdef H5
      try {
        const q = (window.location.hash.split('?')[1] || '');
        if (new URLSearchParams(q).get('editor') === '1') this.editorMode = true;
      } catch { /* 忽略 */ }
      // #endif
    },
    reportEditorHeight() {
      // #ifdef H5
      if (!this.editorMode) return;
      try {
        const h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        window.parent.postMessage({ source: 'nc-c-iframe', type: 'resize', height: h }, '*');
      } catch { /* 忽略 */ }
      // #endif
    },
    bindEditorBridge() {
      // #ifdef H5
      if (this._bridgeBound) return;
      this._bridgeBound = true;
      const that = this;
      window.addEventListener('message', (e) => {
        const d = e && e.data;
        if (!d || d.source !== 'nc-admin') return;
        if (d.type === 'design-json') {
          const j = d.json || {};
          that.comps = Array.isArray(j.components) ? j.components.filter((x) => x && x.type) : [];
          const meta = j.meta || {};
          that.designGlobal = meta.global || {};
          that.$nextTick(() => that.reportEditorHeight());
        } else if (d.type === 'set-selected') {
          that.editorSel = typeof d.index === 'number' ? d.index : -1;
        }
      });
      window.addEventListener('resize', this.reportEditorHeight);
      if (typeof MutationObserver !== 'undefined') {
        const mo = new MutationObserver(() => {
          clearTimeout(this._hTimer);
          this._hTimer = setTimeout(() => that.reportEditorHeight(), 200);
        });
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      }
      setTimeout(() => this.reportEditorHeight(), 300);
      // #endif
    },
    onSlotClick(e, i) {
      // #ifdef H5
      if (!this.editorMode) return;
      e.stopPropagation();
      try { window.parent.postMessage({ source: 'nc-c-iframe', type: 'component-click', index: i }, '*'); } catch { /* 忽略 */ }
      // #endif
    },
  },
};
</script>

<style scoped>
.pano-home {
  min-height: 100vh;
  background: #f5f7fa;
  padding-bottom: 20px;
  box-sizing: border-box;
}
.ph-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 24rpx;
  background: #ffffff;
  border-bottom: 1rpx solid #eee;
  box-sizing: border-box;
}
.ph-back {
  font-size: 28rpx;
  color: #165dff;
  margin-right: 16rpx;
}
.ph-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1d2129;
}
.ph-empty {
  padding: 120rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: #86909c;
}
/* 编辑预览组件槽：点击选中高亮 */
.dp-slot { position: relative; }
.dp-slot-sel { outline: 3px solid #165dff; outline-offset: -1px; box-shadow: 0 0 0 1px #165dff inset; }
.dp-slot-sel::after { content: '已选中'; position: absolute; top: 0; right: 0; z-index: 99; padding: 2px 8px; font-size: 20rpx; color: #fff; background: #165dff; border-radius: 0 0 0 8rpx; pointer-events: none; }
</style>
