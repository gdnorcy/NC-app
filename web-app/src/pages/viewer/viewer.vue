<template>
  <view class="viewer-page">
    <PanoramaViewer
      v-if="currentScene"
      :imageUrl="currentScene.imagePath"
      :hotspots="currentScene.hotspots || []"
      :autoRotate="autoRotate"
      :meta="currentScene.meta || {}"
    />
    <!-- 场景切换 -->
    <view class="scene-tabs" v-if="scenes.length > 1">
      <scroll-view scroll-x class="tabs-scroll">
        <view
          v-for="(scene, idx) in scenes"
          :key="scene.id"
          class="tab-item"
          :class="{ active: currentSceneId === scene.id }"
          @tap="switchScene(scene)"
        >
          <text>{{ scene.title || `场景${idx + 1}` }}</text>
        </view>
      </scroll-view>
    </view>
    <!-- 返回按钮 -->
    <view class="back-btn" @tap="goBack">
      <text>←</text>
    </view>
  </view>
</template>

<script>
import PanoramaViewer from '@/components/PanoramaViewer.vue';

export default {
  components: { PanoramaViewer },
  data() {
    return {
      planId: null,
      scenes: [],
      currentSceneId: null,
      autoRotate: false,
    };
  },
  computed: {
    currentScene() {
      return this.scenes.find(s => s.id === this.currentSceneId);
    },
  },
  onLoad(options) {
    this.planId = options.planId;
    this.loadScenes();
  },
  methods: {
    async loadScenes() {
      try {
        const res = await uni.request({
          url: `/api/plans/${this.planId}/scenes`,
          method: 'GET',
        });
        this.scenes = res.data?.scenes || [];
        if (this.scenes.length) {
          this.currentSceneId = this.scenes[0].id;
        }
      } catch (e) {
        console.error('加载场景失败:', e);
      }
    },
    switchScene(scene) {
      this.currentSceneId = scene.id;
    },
    goBack() {
      uni.navigateBack();
    },
  },
};
</script>

<style scoped>
.viewer-page {
  width: 100%;
  height: 100vh;
  background: #000;
  position: relative;
}
.scene-tabs {
  position: absolute;
  bottom: 100px;
  left: 0;
  right: 0;
  padding: 0 16px;
}
.tabs-scroll {
  white-space: nowrap;
}
.tab-item {
  display: inline-block;
  padding: 8px 16px;
  background: rgba(0,0,0,0.5);
  border-radius: 20px;
  margin-right: 8px;
  color: #fff;
  font-size: 13px;
}
.tab-item.active {
  background: #165DFF;
}
.back-btn {
  position: absolute;
  top: 44px;
  left: 16px;
  width: 36px;
  height: 36px;
  background: rgba(0,0,0,0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
}
</style>
