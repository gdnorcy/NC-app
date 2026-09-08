<template>
  <view class="panorama-container">
    <!-- H5端：普通容器 + 动态创建原生canvas（绕开 uni-canvas 组件对 WebGL 的 2D 代理冲突） -->
    <view
      v-if="platform === 'h5'"
      class="canvas-host"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    ></view>
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

    <!-- 热点层：随相机视角实时投影定位 -->
    <view class="hotspot-layer" :class="{ 'hotspot-h5': platform === 'h5' }">
      <view
        v-for="(h, idx) in hotspots"
        :key="h.id || idx"
        class="hotspot-marker"
        :class="'hs-' + hsStyle.effect"
        :style="hotspotStyle(h, idx)"
        @tap.stop="onHotspotTap(h)"
      >
        <view v-if="h.type === 'scene'" class="hotspot-arrow" :style="arrowStyle(idx)"></view>
        <view class="hotspot-dot" :style="{ background: dotColor(h) }">
          <text v-if="h.type !== 'scene'" class="dot-i">i</text>
        </view>
        <view class="hs-ring" :style="{ borderColor: dotColor(h) }"></view>
        <text class="hotspot-label" :style="{ color: dotColor(h) }">{{ h.title }}</text>
      </view>
    </view>

    <!-- 加载提示 -->
    <view v-if="loading" class="loading-overlay">
      <view class="loading-spinner"></view>
      <text class="loading-text">加载中 {{ progress }}%</text>
    </view>
    <!-- 控制按钮 -->
    <view class="controls">
      <view v-if="hasMusic" class="control-btn" @tap="toggleMusic">
        <text>{{ bgmPlaying ? '♪' : '♩' }}</text>
      </view>
      <view v-if="hasVoice" class="control-btn" @tap="playVoice">
        <text>🔊</text>
      </view>
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
      <view v-if="activeHotspot.content" class="hotspot-content">{{ activeHotspot.content }}</view>
      <view v-else-if="activeHotspot.type === 'scene'" class="hotspot-content">提交后将进入目标场景</view>
      <!-- 留资表单 -->
      <block v-if="activeForm">
        <view v-for="(f, fi) in activeForm.fields" :key="f.key" class="hotspot-form-field">
          <text class="hotspot-form-label">{{ f.label }}{{ f.required ? ' *' : '' }}</text>
          <textarea
            v-if="f.key === 'message'"
            class="hotspot-form-input"
            :value="formValues[f.key] || ''"
            placeholder="请输入留言"
            @input="onFormInput(f.key, $event)"
          />
          <input
            v-else
            class="hotspot-form-input"
            :type="f.key === 'phone' ? 'number' : 'text'"
            :value="formValues[f.key] || ''"
            :placeholder="'请输入' + f.label"
            @input="onFormInput(f.key, $event)"
          />
        </view>
        <view class="hotspot-form-msg" :style="{ color: formMsgColor }">{{ formMsg }}</view>
        <view class="hotspot-form-submit" :class="{ disabled: formSubmitting }" @tap="submitHotspotForm">提交</view>
      </block>
      <view class="hotspot-close" @tap="closeHotspot">×</view>
    </view>
  </view>
</template>

<script>
import { hotspotDir, projectHotspots } from '@/utils/panorama.js';
import { normalizeHotspotStyle, hotspotColor } from '@/utils/hotspot-style.js';
import { track } from '@/utils/analytics';

export default {
  name: 'PanoramaViewer',
  props: {
    imageUrl: { type: String, required: true },
    hotspots: { type: Array, default: () => [] },
    autoRotate: { type: Boolean, default: false },
    meta: { type: Object, default: () => ({}) },
    sceneId: { type: [Number, String], default: 0 },
  },
  emits: ['update:autoRotate', 'scene-hotspot'],
  data() {
    return {
      platform: '',
      loading: true,
      progress: 0,
      activeHotspot: null,
      formValues: {},
      formMsg: '',
      formMsgColor: '#f53f3f',
      formSubmitting: false,
      _vpW: 0,
      _vpH: 0,
      viewer: null,
      touchStartX: 0,
      touchStartY: 0,
      // 热点投影结果：{x, y, visible}
      hotspotPos: {},
      bgmPlaying: false,
      bgmTouched: false,
      audioCtx: null,
    };
  },
  computed: {
    hsStyle() {
      return normalizeHotspotStyle(this.meta.hotspotStyle);
    },
    activeForm() {
      return this.activeHotspot && this.activeHotspot.form && this.activeHotspot.form.enabled ? this.activeHotspot.form : null;
    },
    hasMusic() {
      return !!(this.meta && this.meta.bgMusic);
    },
    hasVoice() {
      return !!(this.meta && this.meta.voiceover);
    },
  },
  watch: {
    imageUrl() {
      // 切换场景：重置热点弹窗与音频状态
      this.activeHotspot = null;
      this.stopAudio();
      this.loading = true;
      this.progress = 0;
    },
  },
  mounted() {
    this.platform = uni.getSystemInfoSync().platform === 'devtools' ? 'mp-weixin' : (typeof window !== 'undefined' ? 'h5' : 'mp-weixin');
    this.$nextTick(() => this.initViewer());
  },
  beforeUnmount() {
    this.destroyViewer();
    this.stopAudio();
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
      // H5端动态加载Three.js：本地副本优先，CDN兜底（国内网络 jsdelivr 不稳定）
      if (typeof window.THREE === 'undefined') {
        const srcs = [
          './static/three/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js',
        ];
        for (const src of srcs) {
          try {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = src;
              script.onload = resolve;
              script.onerror = reject;
              document.head.appendChild(script);
            });
            break;
          } catch (e) { /* 尝试下一个源 */ }
        }
        if (typeof window.THREE === 'undefined') {
          throw new Error('Three.js 加载失败（本地与CDN均不可用）');
        }
      }
      const THREE = window.THREE;
      // H5端：动态创建原生 canvas，绕开 uni-canvas 组件的 2D context 代理
      const host = document.querySelector('.canvas-host');
      if (!host) throw new Error('全景画布容器不存在');
      const canvas = document.createElement('canvas');
      canvas.className = 'panorama-canvas';
      host.appendChild(canvas);
      const w = host.clientWidth || 300;
      const h = host.clientHeight || 300;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setSize(w, h);

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
          this.animate(scene, camera, renderer, w, h);
        },
        (xhr) => {
          this.progress = Math.round((xhr.loaded / xhr.total) * 100);
        },
        (err) => console.error('纹理加载失败:', err)
      );

      this.viewer = { scene, camera, renderer, THREE, isDragging: false, lon: 0, lat: 0 };
    },
    initMiniProgramViewer() {
      // 小程序端：threejs-miniprogram 适配（webgl canvas）
      // 纹理/手势投影逻辑与 H5 共用 projectHotspots；three 渲染由页面按需接入
      this.loading = false;
      this.viewer = { isDragging: false, lon: 0, lat: 0, miniProgram: true };
    },
    // 热点世界方向向量（纯函数，见 utils/panorama.js）
    hotspotDir(h) {
      return hotspotDir(h);
    },
    projectHotspots(w, h) {
      if (!this.viewer) return;
      this._vpW = w;
      this._vpH = h;
      this.hotspotPos = projectHotspots(this.hotspots, this.viewer.lon, this.viewer.lat, w, h);
    },
    hotspotStyle(h, idx) {
      const p = this.hotspotPos[idx] || { visible: false, x: 0, y: 0 };
      return {
        display: p.visible ? 'flex' : 'none',
        left: p.x + 'px',
        top: p.y + 'px',
      };
    },
    dotColor(h) {
      return hotspotColor(this.hsStyle, h.type);
    },
    arrowStyle(idx) {
      const p = this.hotspotPos[idx] || { visible: false, x: 0, y: 0 };
      if (!p.visible || !this._vpW || !this._vpH) return { opacity: 0 };
      // 方位感知：箭头指向画面中心；越靠近中心越透明
      const dx = p.x - this._vpW / 2;
      const dy = p.y - this._vpH / 2;
      const angle = (Math.atan2(-dy, -dx) * 180) / Math.PI;
      const dist = Math.sqrt(dx * dx + dy * dy) / Math.max(this._vpW, this._vpH);
      const op = Math.max(0.2, Math.min(1, 1 - dist / 0.5));
      return { transform: 'rotate(' + angle + 'deg)', opacity: op };
    },
    onHotspotTap(h) {
      // scene 跳转点：开启留资表单时先弹表单，提交成功后跳转；否则直接跳转
      if (h.type === 'scene' && h.targetSceneId) {
        if (h.form && h.form.enabled) {
          this.openHotspot(h);
        } else {
          this.$emit('scene-hotspot', h);
        }
        return;
      }
      this.openHotspot(h);
    },
    openHotspot(h) {
      this.activeHotspot = h;
      this.formValues = {};
      this.formMsg = '';
      this.formMsgColor = '#f53f3f';
      this.formSubmitting = false;
    },
    closeHotspot() {
      this.activeHotspot = null;
      this.formValues = {};
      this.formMsg = '';
    },
    onFormInput(key, e) {
      this.formValues[key] = e.detail.value;
    },
    async submitHotspotForm() {
      if (this.formSubmitting) return;
      const h = this.activeHotspot;
      const form = h.form;
      if (!form || !form.fields) return;
      const fields = {};
      for (const f of form.fields) {
        const val = (this.formValues[f.key] || '').trim();
        if (f.required && !val) {
          this.formMsg = `请填写${f.label}`;
          this.formMsgColor = '#f53f3f';
          return;
        }
        if (val) fields[f.key] = val;
      }
      this.formSubmitting = true;
      this.formMsg = '提交中…';
      this.formMsgColor = '#86909c';
      try {
        const res = await uni.request({
          url: '/api/card/panorama/leads',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { sceneId: h.sceneId || this.sceneId, hotspotTitle: h.title || '', fields },
        });
        const data = res.data || {};
        if (res.statusCode !== 200) throw new Error(data.error || '提交失败');
        this.formMsg = data.message || '提交成功';
        this.formMsgColor = '#00b42a';
        this.formValues = {};
        track('form_submit', { sceneId: h.sceneId || this.sceneId, hotspotTitle: h.title || '' });
        // 跳转点挂表单：提交成功后跳转目标场景
        if (h.type === 'scene' && h.targetSceneId) {
          setTimeout(() => {
            this.closeHotspot();
            this.$emit('scene-hotspot', h);
          }, 800);
        }
      } catch (e) {
        this.formMsg = (e && e.message) || '提交失败，请稍后重试';
        this.formMsgColor = '#f53f3f';
      } finally {
        this.formSubmitting = false;
      }
    },
    animate(scene, camera, renderer, w, h) {
      const render = () => {
        if (this._destroyed) return;
        requestAnimationFrame(render);
        if (this.autoRotate && !this.viewer.isDragging) {
          this.viewer.lon += 0.1;
        }
        this.viewer.lat = Math.max(-85, Math.min(85, this.viewer.lat));
        const phi = this.viewer.THREE.MathUtils.degToRad(90 - this.viewer.lat);
        const theta = this.viewer.THREE.MathUtils.degToRad(this.viewer.lon);
        camera.position.x = 100 * Math.sin(phi) * Math.cos(theta);
        camera.position.y = 100 * Math.cos(phi);
        camera.position.z = 100 * Math.sin(phi) * Math.sin(theta);
        camera.lookAt(scene.position);
        renderer.render(scene, camera);
        // 热点随视角实时投影
        this.projectHotspots(w, h);
      };
      render();
    },
    onTouchStart(e) {
      if (!this.viewer) return;
      this.viewer.isDragging = true;
      const touch = e.touches[0];
      this.touchStartX = touch.clientX || touch.x;
      this.touchStartY = touch.clientY || touch.y;
      // 浏览器自动播放限制兜底：首次交互启动背景音乐
      if (!this.bgmTouched && this.hasMusic) {
        this.bgmTouched = true;
        this.playMusic();
      }
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
    // ===== 音频：背景音乐 / 解说（双端 uni.createInnerAudioContext） =====
    ensureAudio() {
      if (this.audioCtx) return this.audioCtx;
      this.audioCtx = uni.createInnerAudioContext();
      return this.audioCtx;
    },
    playMusic() {
      if (!this.hasMusic) return;
      const ctx = this.ensureAudio();
      if (this.bgmPlaying) { ctx.pause(); this.bgmPlaying = false; return; }
      ctx.stop();
      ctx.src = this.meta.bgMusic;
      ctx.loop = true;
      ctx.play();
      this.bgmPlaying = true;
    },
    toggleMusic() {
      this.playMusic();
    },
    playVoice() {
      if (!this.hasVoice) return;
      const ctx = this.ensureAudio();
      ctx.stop();
      ctx.src = this.meta.voiceover;
      ctx.loop = false;
      ctx.play();
    },
    stopAudio() {
      if (this.audioCtx) {
        try { this.audioCtx.stop(); } catch (e) {}
      }
      this.bgmPlaying = false;
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
      this._destroyed = true;
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
.canvas-host {
  width: 100%;
  height: 100%;
  position: relative;
}
/* 热点层 */
.hotspot-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
}
.hotspot-h5 {
  pointer-events: none;
}
.hotspot-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  flex-direction: column;
  align-items: center;
  pointer-events: auto;
  z-index: 6;
}
.hotspot-dot {
  position: relative;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(22, 93, 255, 0.85);
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.dot-i {
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}
.hotspot-arrow {
  position: absolute;
  left: 50%;
  top: -7px;
  width: 0;
  height: 0;
  margin-left: -6px;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 11px solid #ffffff;
  transform-origin: 6px 18px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
  z-index: 2;
}
.hs-ring {
  position: absolute;
  left: 50%;
  top: 11px;
  width: 26px;
  height: 26px;
  margin-left: -13px;
  margin-top: -13px;
  border-radius: 50%;
  border: 2px solid #165dff;
  opacity: 0;
  pointer-events: none;
}
.hs-pulse .hs-ring {
  animation: hsPulse 2.2s ease-in-out infinite;
}
.hs-ripple .hs-ring {
  animation: hsRipple 1.8s ease-out infinite;
}
@keyframes hsPulse {
  0%, 100% { transform: scale(0.85); opacity: 0.5; }
  50% { transform: scale(1.35); opacity: 0.15; }
}
@keyframes hsRipple {
  0% { transform: scale(0.6); opacity: 0.55; }
  100% { transform: scale(1.9); opacity: 0; }
}
.hotspot-label {
  margin-top: 3px;
  padding: 1px 7px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  border-radius: 8px;
  white-space: nowrap;
}
.loading-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.7);
  z-index: 20;
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
  bottom: 60px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 15;
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
/* 热点信息弹窗 */
.hotspot-popup {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 120px;
  background: rgba(255, 255, 255, 0.96);
  border-radius: 12px;
  padding: 16px;
  z-index: 30;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}
.hotspot-title {
  font-size: 16px;
  font-weight: 600;
  color: #1D2129;
}
.hotspot-content {
  margin-top: 8px;
  font-size: 14px;
  color: #4E5969;
  line-height: 1.6;
}
.hotspot-close {
  position: absolute;
  top: 8px;
  right: 14px;
  font-size: 20px;
  color: #86909C;
  padding: 4px;
}
.hotspot-form-field {
  margin-top: 12px;
}
.hotspot-form-label {
  display: block;
  font-size: 13px;
  color: #4E5969;
  margin-bottom: 4px;
}
.hotspot-form-input {
  width: 100%;
  box-sizing: border-box;
  height: 40px;
  border: 1px solid #E5E6EB;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 14px;
  background: #fff;
}
.hotspot-form-field textarea.hotspot-form-input {
  height: 72px;
  padding: 8px 12px;
}
.hotspot-form-msg {
  margin-top: 8px;
  font-size: 12px;
  min-height: 16px;
}
.hotspot-form-submit {
  margin-top: 8px;
  height: 40px;
  border-radius: 8px;
  background: #165DFF;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hotspot-form-submit.disabled {
  opacity: 0.6;
}
</style>
