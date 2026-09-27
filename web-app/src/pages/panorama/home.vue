<template>
  <view class="pano-home">
    <view class="ph-topbar">
      <view class="ph-back" @tap="goBack">‹ 返回</view>
      <text class="ph-title">全景首页</text>
    </view>
    <template v-if="comps.length">
      <DesignPage v-for="(c, i) in comps" :key="i" :comps="[c]" :tenant-id="Number(tid)" :global="designGlobal" />
    </template>
    <view v-else class="ph-empty">暂无装修内容</view>
    <CardTabBar active="pano" :page-type="pageType" />
    <view class="tabbar-space"></view>
  </view>
</template>

<script>
import DesignPage from '../../components/DesignPage.vue';
import CardTabBar from '../../components/CardTabBar.vue';
import { cardApi } from '../../utils/cardApi.js';
import { normalizeDesignConfig } from '../../utils/design.js';

export default {
  components: { DesignPage },
  data() {
    return { comps: [], tid: '', designGlobal: {}, pageType: '' };
  },
  onLoad(o) {
    const pageType = String((o && o.pageType) || '').trim();
    this.pageType = pageType;
    this.tid = String((o && o.tid) || '');
    if (!pageType) return;
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
  },
  onShow() {
    uni.$emit('cart:changed'); // 购物车组件（fab-cart）数量刷新
  },
};

</script>

<style scoped>
.pano-home {
  min-height: 100vh;
  background: #f5f7fa;
  padding-bottom: 160rpx;
  box-sizing: border-box;
}
.tabbar-space { height: 20rpx; }
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
</style>
