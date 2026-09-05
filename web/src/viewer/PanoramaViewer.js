import * as THREE from 'three';
import {
  applyDrag,
  clampFov,
  clampPitch,
  directionFromYawPitch,
} from './controls.js';

const RADIUS = 50;
const FOV_MIN = 30;
const FOV_MAX = 110;

/**
 * 360 全景查看器（Three.js 实现）：
 * - 桌面：鼠标拖拽旋转、滚轮缩放
 * - 移动端：单指拖拽、双指捏合缩放
 * - 可选陀螺仪沉浸模式、自动旋转、全屏
 */
export class PanoramaViewer {
  constructor(container, { onLoad, onProgress, onError } = {}) {
    this.container = container;
    this.onLoad = onLoad;
    this.onProgress = onProgress;
    this.onError = onError;

    this.yaw = 0;
    this.pitch = 0;
    this.fov = 75;
    this.autoRotate = false;
    this.autoRotateSpeed = 0.04; // rad/s
    this.gyroEnabled = false;

    this._drag = null;
    this._pinch = null;
    this._gyroTarget = null;
    this._last = 0;
    this._rafId = 0;
    this._mesh = null;
    this._listeners = [];

    this._initRenderer();
    this._initScene();
    this._bindEvents();
    this._startLoop();
  }

  // ---------- 初始化 ----------
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fov, this.aspect(), 0.1, 200);
  }

  aspect() {
    return this.container.clientWidth / this.container.clientHeight || 1;
  }

  // ---------- 全景图加载 ----------
  async load(imagePath) {
    if (this._mesh) {
      this.scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._mesh.material.map?.dispose();
      this._mesh.material.dispose();
      this._mesh = null;
    }
    try {
      const texture = await this._loadTexture(imagePath);
      const geometry = new THREE.SphereGeometry(RADIUS, 64, 64);
      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
      this._mesh = new THREE.Mesh(geometry, material);
      this.scene.add(this._mesh);
      this.onLoad?.();
    } catch (err) {
      this.onError?.(err);
    }
  }

  async _loadTexture(imagePath) {
    const url = imagePath.startsWith('http') ? imagePath : imagePath;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`全景图加载失败 (${resp.status})`);
    const total = Number(resp.headers.get('content-length')) || 0;
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total) this.onProgress?.(Math.round((received / total) * 100));
    }
    const type = resp.headers.get('content-type') || 'image/jpeg';
    const blob = new Blob(chunks, { type });
    const objectUrl = URL.createObjectURL(blob);
    const img = await this._loadImageElement(objectUrl);
    URL.revokeObjectURL(objectUrl);

    const texture = new THREE.Texture(img);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  _loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片解码失败'));
      img.src = src;
    });
  }

  // ---------- 交互事件 ----------
  _on(event, target, fn, opts) {
    target.addEventListener(event, fn, opts);
    this._listeners.push([event, target, fn, opts]);
  }

  _bindEvents() {
    const el = this.container;

    this._on('pointerdown', el, (e) => {
      this._drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
    });
    this._on('pointermove', el, (e) => {
      if (!this._drag || this._pinch) return;
      const dx = e.clientX - this._drag.x;
      const dy = e.clientY - this._drag.y;
      this._drag = { x: e.clientX, y: e.clientY };
      const next = applyDrag(this.yaw, this.pitch, dx, dy);
      this.yaw = next.yaw;
      this.pitch = next.pitch;
    });
    this._on('pointerup', el, () => {
      this._drag = null;
    });
    this._on('pointercancel', el, () => {
      this._drag = null;
    });

    this._on('wheel', el, (e) => {
      e.preventDefault();
      this.fov = clampFov(this.fov + e.deltaY * 0.06, FOV_MIN, FOV_MAX);
    }, { passive: false });

    // 双指捏合缩放
    this._on('touchstart', el, (e) => {
      if (e.touches.length === 2) {
        this._pinch = {
          dist: this._touchDist(e),
          fov: this.fov,
        };
        this._drag = null;
      }
    }, { passive: true });
    this._on('touchmove', el, (e) => {
      if (this._pinch && e.touches.length === 2) {
        e.preventDefault();
        const dist = this._touchDist(e);
        this.fov = clampFov((this._pinch.fov * this._pinch.dist) / dist, FOV_MIN, FOV_MAX);
      }
    }, { passive: false });
    this._on('touchend', el, () => {
      this._pinch = null;
    });
  }

  _touchDist(e) {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  // ---------- 陀螺仪 ----------
  async enableGyro() {
    if (typeof DeviceOrientationEvent === 'undefined') return { ok: false, reason: 'unsupported' };
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const state = await DeviceOrientationEvent.requestPermission();
        if (state !== 'granted') return { ok: false, reason: 'denied' };
      }
    } catch {
      return { ok: false, reason: 'denied' };
    }
    this.gyroEnabled = true;
    this._onDeviceOrientation = (e) => {
      if (e.gamma == null || e.beta == null) return;
      this._gyroTarget = {
        yaw: (-e.gamma * Math.PI) / 180,
        pitch: clampPitch(((e.beta - 90) * Math.PI) / 180),
      };
    };
    this._on('deviceorientation', window, this._onDeviceOrientation);
    return { ok: true };
  }

  disableGyro() {
    this.gyroEnabled = false;
    this._gyroTarget = null;
    if (this._onDeviceOrientation) {
      window.removeEventListener('deviceorientation', this._onDeviceOrientation);
      this._onDeviceOrientation = null;
    }
  }

  // ---------- 渲染循环 ----------
  _startLoop() {
    const loop = (now) => {
      const dt = Math.min((now - this._last) / 1000 || 0, 0.1);
      this._last = now;

      if (this.gyroEnabled && this._gyroTarget) {
        const t = 1 - Math.exp(-8 * dt); // 指数平滑
        this.yaw += (this._gyroTarget.yaw - this.yaw) * t;
        this.pitch += (this._gyroTarget.pitch - this.pitch) * t;
      } else if (this.autoRotate) {
        this.yaw += this.autoRotateSpeed * dt;
      }

      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
      const dir = directionFromYawPitch(this.yaw, this.pitch);
      this.camera.lookAt(dir.x, dir.y, dir.z);
      this.renderer.render(this.scene, this.camera);
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  // ---------- 生命周期 ----------
  onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this._rafId);
    for (const [event, target, fn, opts] of this._listeners) {
      target.removeEventListener(event, fn, opts);
    }
    this._listeners = [];
    if (this._mesh) {
      this.scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._mesh.material.map?.dispose();
      this._mesh.material.dispose();
    }
    this.renderer.dispose();
    this.container.innerHTML = '';
  }
}
