<template>
  <view class="panorama-container">
    <!-- H5端：使用canvas + Three.js -->
    <canvas
      v-if="platform === 'h5'"
      id="panorama-canvas"
      class="panorama-canvas"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    ></canvas>
    <!-- 小程序端：使用type="webgl"的canvas -->
    <canvas
      v-else
      type="webgl"
      id="panorama-canvas"
      class="panorama-canvas"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    ></canvas>
    <!-- 加载提示 -->
    <view v-if="loading" class="loading-overlay">
      <view class="loading-spinner"></view>
      <text class="loading-text">加载中 {{ progress }}%</text>
    </view>
    <!-- 控制按钮 -->
    <view class="controls">
      <view class="control-btn" @tap="toggleAutoRotate">
        <text>{{ autoRotate ? '⏸' : '▶' }}</text>
      </view>
      <view class="control-btn" @tap="toggleVR">
        <text>VR</text>
      </view>
      <view class="control-btn" @tap="resetView">
        <text>⟲</text>
      </view>
    </view>
    <!-- 热点弹窗 -->
    <view v-if="activeHotspot" class="hotspot-popup">
      <view class="hotspot-title">{{ activeHotspot.title }}</view>
      <view class="hotspot-content">{{ activeHotspot.content }}</view>
      <view class="hotspot-close" @tap="activeHotspot = null">×</view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'PanoramaViewer',
  props: {
    imageUrl: { type: String, required: true },
    hotspots: { type: Array, default: () => [] },
    autoRotate: { type: Boolean, default: false },
    meta: { type: Object, default: () => ({}) },
  },
  data() {
    return {
      platform: '',
      loading: true,
      progress: 0,
      activeHotspot: null,
      viewer: null,
      touchStartX: 0,
      touchStartY: 0,
    };
  },
  mounted() {
    this.platform = uni.getSystemInfoSync().platform === 'devtools' ? 'mp-weixin' : (typeof window !== 'undefined' ? 'h5' : 'mp-weixin');
    this.$nextTick(() => this.initViewer());
  },
  beforeUnmount() {
    this.destroyViewer();
  },
  methods: {
    async initViewer() {
      try {
        if (this.platform === 'h5') {
          await this.initH5Viewer();
        } else {
          await this.initMiniProgramViewer();
        }
      } catch (err) {
        console.error('全景初始化失败:', err);
      }
    },
    async initH5Viewer() {
      // H5端动态加载Three.js
      if (typeof window.THREE === 'undefined') {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      const THREE = window.THREE;
      const canvas = document.getElementById('panorama-canvas');
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);

      // 加载全景纹理
      const loader = new THREE.TextureLoader();
      loader.load(
        this.imageUrl,
        (texture) => {
          const geometry = new THREE.SphereGeometry(500, 60, 40);
          geometry.scale(-1, 1, 1);
          const material = new THREE.MeshBasicMaterial({ map: texture });
          const sphere = new THREE.Mesh(geometry, material);
          scene.add(sphere);
          this.loading = false;
          this.animate(scene, camera, renderer);
        },
        (xhr) => {
          this.progress = Math.round((xhr.loaded / xhr.total) * 100);
        },
        (err) => console.error('纹理加载失败:', err)
      );

      this.viewer = { scene, camera, renderer, THREE, isDragging: false, lon: 0, lat: 0 };
    },
    async initMiniProgramViewer() {
      // 小程序端：使用threejs-miniprogram（需在小程序项目中安装）
      // 这里提供基础canvas初始化，实际项目需引入threejs-miniprogram
      const query = uni.createSelectorQuery().in(this);
      query.select('#panorama-canvas').fields({ node: true, size: true }).exec((res) => {
        if (!res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('webgl');
        // 小程序WebGL上下文初始化
        // 实际项目中使用 threejs-miniprogram 的 createScopedThreejs(canvas)
        this.loading = false;
        this.viewer = { canvas, ctx, isDragging: false, lon: 0, lat: 0 };
      });
    },
    animate(scene, camera, renderer) {
      const render = () => {
        requestAnimationFrame(render);
        if (this.autoRotate && !this.viewer.isDragging) {
          this.viewer.lon += 0.1;
        }
        this.viewer.lat = Math.max(-85, Math.min(85, this.viewer.lat));
        const phi = THREE.MathUtils.degToRad(90 - this.viewer.lat);
        const theta = THREE.MathUtils.degToRad(this.viewer.lon);
        camera.position.x = 100 * Math.sin(phi) * Math.cos(theta);
        camera.position.y = 100 * Math.cos(phi);
        camera.position.z = 100 * Math.sin(phi) * Math.sin(theta);
        camera.lookAt(scene.position);
        renderer.render(scene, camera);
      };
      render();
    },
    onTouchStart(e) {
      if (!this.viewer) return;
      this.viewer.isDragging = true;
      const touch = e.touches[0];
      this.touchStartX = touch.clientX || touch.x;
      this.touchStartY = touch.clientY || touch.y;
    },
    onTouchMove(e) {
      if (!this.viewer || !this.viewer.isDragging) return;
      const touch = e.touches[0];
      const x = touch.clientX || touch.x;
      const y = touch.clientY || touch.y;
      this.viewer.lon += (x - this.touchStartX) * 0.2;
      this.viewer.lat -= (y - this.touchStartY) * 0.2;
      this.touchStartX = x;
      this.touchStartY = y;
    },
    onTouchEnd() {
      if (this.viewer) this.viewer.isDragging = false;
    },
    toggleAutoRotate() {
      this.autoRotate = !this.autoRotate;
      this.$emit('update:autoRotate', this.autoRotate);
    },
    toggleVR() {
      uni.showToast({ title: 'VR模式开发中', icon: 'none' });
    },
    resetView() {
      if (this.viewer) {
        this.viewer.lon = 0;
        this.viewer.lat = 0;
      }
    },
    destroyViewer() {
      if (this.viewer?.renderer) {
        this.viewer.renderer.dispose();
      }
      this.viewer = null;
    },
  },
};
</script>

<style scoped>
.panorama-container {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: #000;
}
.panorama-canvas {
  width: 100%;
  height: 100%;
}
.loading-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.7);
}
.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text {
  color: #fff;
  margin-top: 12px;
  font-size: 14px;
}
.controls {
  position: absolute;
  bottom: 40px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.control-btn {
  width: 44px;
  height: 44px;
  background: rgba(0,0,0,0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
}
.hotspot-popup {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  width: 80%;
  max-width: 320px;
}
.hotspot-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}
.hotspot-content {
  font-size: 14px;
  color: #666;
  line-height: 1.6;
}
.hotspot-close {
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 20px;
  color: #999;
}
</style>
