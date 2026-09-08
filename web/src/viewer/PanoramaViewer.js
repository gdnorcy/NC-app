import * as THREE from 'three';
import {
  applyDrag,
  clampFov,
  clampPitch,
  directionFromYawPitch,
} from './controls.js';
import { planProgressiveLoad } from './progressive.js';
import { pickTargetLevel, tileUrl, visibleTiles, expandTiles } from './pyramid.js';
import { normalizeHotspotStyle, hotspotArrowAngle } from './hotspot-style.js';

const RADIUS = 50;
const FOV_MIN = 30;
const FOV_MAX = 110;
const TILE_CONCURRENCY = 4; // 瓦片同时加载数（防移动端连接风暴）

/**
 * 360 全景查看器（Three.js 实现）：
 * - 桌面：鼠标拖拽旋转、滚轮缩放
 * - 移动端：单指拖拽、双指捏合缩放
 * - 可选陀螺仪沉浸模式、自动旋转、全屏
 * - 渐进加载：低清预览先行出画面，主图静默替换
 * - 金字塔瓦片：大图按视角加载目标层可见瓦片，base 低层整球垫底，失败自动回退整图
 */
export class PanoramaViewer {
  constructor(container, { onLoad, onPreviewReady, onProgress, onError } = {}) {
    this.container = container;
    this.onLoad = onLoad;
    this.onPreviewReady = onPreviewReady;
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
    this._loadSeq = 0; // 加载序号，防快速切换场景时旧图覆盖新图
    this._listeners = [];
    // 金字塔状态
    this._pyramid = null;
    this._pyramidTarget = null;
    this._tileMeshes = [];
    this._tileCache = new Map();
    this._tileLoading = new Set();
    this._tileQueue = [];
    this._activeTileLoads = 0;
    this._pyramidTimer = 0;
    this._lastView = { yaw: 0, pitch: 0, fov: 75 };
    // 热点
    this._hotspots = [];
    this._hotspotSprites = [];
    this._hotspotExtras = [];
    this._hotspotStyle = { effect: 'pulse', theme: 'blue', jumpColor: '#165DFF', infoColor: '#FF7D00' };
    this._raycaster = new THREE.Raycaster();
    this._pointerDown = null;
    this.onHotspotClick = null;
    // 小行星
    this._littlePlanet = false;
    this._savedFov = 75;
    this._savedPitch = 0;
    // VR
    this._vrMode = false;

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
  load(imagePath, previewPath, pyramid, options = {}) {
    // 设置初始视角
    if (options.initialView) {
      const viewMap = { north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 };
      if (options.initialView !== 'default') {
        this.yaw = viewMap[options.initialView] || 0;
        this.pitch = 0;
      }
    }
    if (pyramid && Array.isArray(pyramid.levels) && pyramid.levels.length) {
      return this.loadPyramid(imagePath, previewPath, pyramid);
    }
    return this.loadFlat(imagePath, previewPath);
  }

  /** 整图渐进加载（低清先行 → 主图替换） */
  async loadFlat(imagePath, previewPath) {
    this._clearPyramid();
    const steps = planProgressiveLoad(previewPath, imagePath);
    const seq = ++this._loadSeq;
    if (!steps.length) {
      this.onError?.(new Error('缺少图片路径'));
      return;
    }
    try {
      for (const step of steps) {
        const texture = await this._loadTexture(step.url);
        if (seq !== this._loadSeq) {
          // 已切换到其他场景，丢弃迟到纹理
          texture.dispose();
          return;
        }
        this._applyTexture(texture);
        if (step.kind === 'preview') this.onPreviewReady?.();
      }
      this.onLoad?.();
    } catch (err) {
      if (seq !== this._loadSeq) return;
      // 低清已显示时主图失败：保留低清画面，不打断用户
      if (this._mesh) {
        console.warn('主图加载失败，保留预览画质:', err);
        this.onLoad?.();
        return;
      }
      this.onError?.(err);
    }
  }

  /** 金字塔瓦片加载：base 低层整球先行 → 目标层可见瓦片按需加载 */
  async loadPyramid(imagePath, previewPath, pyramid) {
    const seq = ++this._loadSeq;
    this._clearPyramid();
    this._pyramid = pyramid;
    try {
      // 1. 最低层整球（1 张瓦片铺满球面，秒出画面）
      const base = pyramid.levels[pyramid.levels.length - 1];
      const baseTex = await this._loadImageTexture(tileUrl(pyramid.tileUrl, base, 0, 0));
      if (seq !== this._loadSeq) {
        baseTex.dispose();
        return;
      }
      this._applyTexture(baseTex);
      this.onPreviewReady?.();

      // 2. 目标层 + 首屏可见瓦片
      this._pyramidTarget = pickTargetLevel(pyramid.levels, this.container.clientWidth, window.devicePixelRatio || 1);
      this._lastView = { yaw: this.yaw, pitch: this.pitch, fov: this.fov };
      this._refreshTiles();
      this.onLoad?.();
    } catch (err) {
      if (seq !== this._loadSeq) return;
      console.warn('金字塔加载失败，回退整图模式:', err);
      this._clearPyramid();
      await this.loadFlat(imagePath, previewPath);
    }
  }

  _clearPyramid() {
    clearTimeout(this._pyramidTimer);
    this._pyramidTimer = 0;
    this._pyramid = null;
    this._pyramidTarget = null;
    for (const mesh of [...this._tileMeshes]) this._removeTileMesh(mesh);
    this._tileMeshes = [];
    this._tileCache.clear();
    this._tileLoading.clear();
    this._tileQueue = [];
    this._activeTileLoads = 0;
  }

  /** 按当前视角刷新瓦片：可见集 + 周边一圈预取，并发受限加载，卸载远离视口的 */
  _refreshTiles() {
    if (!this._pyramid || !this._pyramidTarget) return;
    const level = this._pyramidTarget;
    const dir = directionFromYawPitch(this.yaw, this.pitch);
    const halfFovX = ((this.fov * Math.PI) / 180) * this.aspect() * 0.5;
    const halfFovY = ((this.fov * Math.PI) / 180) * 0.5;
    const want = expandTiles(visibleTiles(level, dir, halfFovX, halfFovY), level);
    const keep = new Set(want.map((e) => `${e.col}_${e.row}`));

    // 卸载不在保留集（可见 + 预取）的瓦片（释放 GPU 纹理）
    for (const mesh of [...this._tileMeshes]) {
      if (!keep.has(mesh.userData.key)) this._removeTileMesh(mesh);
    }
    // 入队：可见优先、其次预取，同优先级按视角中心距离
    const ordered = [...want].sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return this._tileCenterAngle([a.col, a.row], dir) - this._tileCenterAngle([b.col, b.row], dir);
    });
    for (const e of ordered) {
      const key = `${e.col}_${e.row}`;
      if (this._tileCache.has(key) || this._tileLoading.has(key) || this._tileQueue.some((q) => q.key === key)) continue;
      this._enqueueTile({ col: e.col, row: e.row, key });
    }
  }

  _enqueueTile(entry) {
    this._tileQueue.push(entry);
    this._drainTileQueue();
  }

  /** 并发受限调度：最多 TILE_CONCURRENCY 个同时在途 */
  _drainTileQueue() {
    while (this._tileQueue.length && this._activeTileLoads < TILE_CONCURRENCY) {
      const entry = this._tileQueue.shift();
      if (this._tileCache.has(entry.key) || this._tileLoading.has(entry.key)) continue;
      this._activeTileLoads++;
      this._loadTile(entry.col, entry.row, entry.key).finally(() => {
        this._activeTileLoads--;
        this._drainTileQueue();
      });
    }
  }

  _tileCenterAngle([col, row], dir) {
    const level = this._pyramidTarget;
    const phi = ((col + 0.5) / level.cols) * 2 * Math.PI;
    const theta = ((row + 0.5) / level.rows) * Math.PI;
    const px = -Math.cos(phi) * Math.sin(theta);
    const py = Math.cos(theta);
    const pz = Math.sin(phi) * Math.sin(theta);
    const dot = Math.max(-1, Math.min(1, px * dir.x + py * dir.y + pz * dir.z));
    return Math.acos(dot);
  }

  _scheduleRefresh(delay = 300) {
    clearTimeout(this._pyramidTimer);
    this._pyramidTimer = setTimeout(() => this._refreshTiles(), delay);
  }

  async _loadTile(col, row, key) {
    this._tileLoading.add(key);
    try {
      const texture = await this._loadImageTexture(tileUrl(this._pyramid.tileUrl, this._pyramidTarget, col, row));
      if (!this._pyramid || this._tileCache.has(key)) {
        texture.dispose();
        return;
      }
      this._tileCache.set(key, texture);
      this._addTileMesh(this._pyramidTarget, col, row, texture);
    } catch (err) {
      console.warn('瓦片加载失败，保留低清画面:', key, err);
    } finally {
      this._tileLoading.delete(key);
    }
  }

  /** 单张瓦片 mesh：球面参数化片段（phi/theta 区间），纹理即瓦片图 */
  _addTileMesh(level, col, row, texture) {
    const phiStart = (col / level.cols) * 2 * Math.PI;
    const phiLength = (2 * Math.PI) / level.cols;
    const thetaStart = (row / level.rows) * Math.PI;
    const thetaLength = Math.PI / level.rows;
    const geometry = new THREE.SphereGeometry(RADIUS + 0.01, 12, 12, phiStart, phiLength, thetaStart, thetaLength);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1; // 覆盖 base 整球
    mesh.userData.key = `${col}_${row}`;
    this.scene.add(mesh);
    this._tileMeshes.push(mesh);
  }

  _removeTileMesh(mesh) {
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    const tex = mesh.material.map;
    mesh.material.dispose();
    if (tex) tex.dispose();
    this._tileCache.delete(mesh.userData.key);
    this._tileMeshes = this._tileMeshes.filter((m) => m !== mesh);
  }

  /** 应用新纹理：首帧创建球体，后续仅替换纹理（避免切换黑屏） */
  _applyTexture(texture) {
    if (!this._mesh) {
      const geometry = new THREE.SphereGeometry(RADIUS, 64, 64);
      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthWrite: false });
      this._mesh = new THREE.Mesh(geometry, material);
      this.scene.add(this._mesh);
      return;
    }
    const old = this._mesh.material.map;
    this._mesh.material.map = texture;
    this._mesh.material.needsUpdate = true;
    if (old) old.dispose();
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

  /** 瓦片/低清 base：直接 Image 加载，无需流式进度 */
  async _loadImageTexture(url) {
    const img = await this._loadImageElement(url);
    const texture = new THREE.Texture(img);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
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
      this._pointerDown = { x: e.clientX, y: e.clientY };
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
    this._on('pointerup', el, (e) => {
      // 检测点击热点（移动距离小于5px才算点击）
      if (this._pointerDown) {
        const dx = Math.abs(e.clientX - this._pointerDown.x);
        const dy = Math.abs(e.clientY - this._pointerDown.y);
        if (dx < 5 && dy < 5) {
          const hs = this._pickHotspot(e.clientX, e.clientY);
          if (hs && this.onHotspotClick) {
            this.onHotspotClick(hs);
          }
        }
        this._pointerDown = null;
      }
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

  // ---------- 热点 ----------
  setHotspots(hotspots = [], style) {
    this._clearHotspots();
    this._hotspots = hotspots;
    this._hotspotStyle = normalizeHotspotStyle(style);
    for (const hs of hotspots) {
      const sprite = this._createHotspotSprite(hs);
      if (sprite) {
        this.scene.add(sprite);
        this._hotspotSprites.push(sprite);
      }
    }
  }

  /** 绘制圆角矩形路径（canvas） */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** 十六进制 → rgba 字符串 */
  _hexToRgba(hex, alpha) {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  _createHotspotSprite(hs) {
    const yaw = (hs.yaw || 0) * Math.PI / 180;
    const pitch = (hs.pitch || 0) * Math.PI / 180;
    const dir = directionFromYawPitch(yaw, pitch);
    const dist = RADIUS * 0.92;
    const isScene = hs.type === 'scene';
    const color = isScene ? this._hotspotStyle.jumpColor : this._hotspotStyle.infoColor;
    const title = (hs.title || '').slice(0, 14);

    // ---- 主标记：气泡(标题) + 圆 + 白描边 ----
    const W = 256, H = 176;
    const cx = 128, cy = 118, r = 42;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (title) {
      ctx.font = 'bold 22px "PingFang SC", "Microsoft YaHei", sans-serif';
      const tw = ctx.measureText(title).width;
      const bw = Math.min(tw + 32, W - 28);
      const bx = cx - bw / 2;
      const by = 4, bh = 32;
      this._roundRect(ctx, bx, by, bw, bh, 10);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // 小三角指向标记
      ctx.beginPath();
      ctx.moveTo(cx - 8, by + bh - 1);
      ctx.lineTo(cx + 8, by + bh - 1);
      ctx.lineTo(cx, by + bh + 9);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.fill();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, cx, by + bh / 2);
    }
    // 圆形底（渐变）
    const grad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, this._hexToRgba(color, 0.72));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    // 类型内标：scene=白箭头 / info=白 i
    ctx.fillStyle = '#fff';
    if (isScene) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 23);
      ctx.lineTo(cx + 16, cy + 4);
      ctx.lineTo(cx, cy - 5);
      ctx.lineTo(cx - 16, cy + 4);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.font = 'bold 50px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('i', cx, cy + 4);
    }
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(dir.x * dist, dir.y * dist, dir.z * dist);
    sprite.scale.set(13.5, 9.28, 1);
    // dir 为普通对象，这里包装为 Vector3 供每帧方位计算使用
    const dirV = new THREE.Vector3(dir.x, dir.y, dir.z);
    const userData = { hotspot: hs, dir: dirV };

    // ---- 方位箭头（独立 sprite，每帧旋转指向画面中心） ----
    if (isScene) {
      const ac = document.createElement('canvas');
      ac.width = 128; ac.height = 128;
      const actx = ac.getContext('2d');
      actx.beginPath();
      actx.moveTo(64, 26);
      actx.lineTo(80, 54);
      actx.lineTo(64, 43);
      actx.lineTo(48, 54);
      actx.closePath();
      actx.fillStyle = '#FFFFFF';
      actx.fill();
      actx.shadowColor = 'rgba(0,0,0,0.45)';
      actx.shadowBlur = 10;
      const arrowMat = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(ac), transparent: true, depthTest: false, opacity: 0.9,
      });
      const arrow = new THREE.Sprite(arrowMat);
      arrow.position.copy(sprite.position);
      arrow.scale.set(4.5, 4.5, 1);
      arrow.position.addScaledVector(dir, 4.6);
      this.scene.add(arrow);
      this._hotspotExtras.push(arrow);
      userData.arrow = arrow;
    }

    // ---- 动效外圈（pulse 呼吸 / ripple 波纹 / none 无） ----
    const fx = this._createHotspotFx(color);
    if (fx) {
      fx.position.copy(sprite.position);
      this.scene.add(fx);
      this._hotspotExtras.push(fx);
      userData.fx = fx;
    }

    sprite.userData = userData;
    return sprite;
  }

  _createHotspotFx(color) {
    const effect = this._hotspotStyle.effect;
    if (!effect || effect === 'none') return null;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.stroke();
    const mat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, opacity: 0.5,
    });
    const s = new THREE.Sprite(mat);
    s.scale.set(8.2, 8.2, 1);
    return s;
  }

  /** 每帧：方位感知箭头 + 动效 */
  _updateHotspots(now) {
    if (!this._hotspotSprites.length) return;
    const t = now / 1000;
    const forward = directionFromYawPitch(this.yaw, this.pitch);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    const upV = new THREE.Vector3().crossVectors(right, forward).normalize();
    const style = this._hotspotStyle;

    for (const sprite of this._hotspotSprites) {
      const ud = sprite.userData;
      // 方位感知：箭头指向画面中心，靠近中心渐隐
      if (ud.arrow) {
        const dx = ud.dir.dot(right);
        const dy = ud.dir.dot(upV);
        ud.arrow.material.rotation = hotspotArrowAngle(dx, dy);
        const dist = Math.sqrt(dx * dx + dy * dy);
        ud.arrow.material.opacity = THREE.MathUtils.clamp(1 - dist / 0.45, 0.15, 1);
      }
      // 动效
      if (ud.fx) {
        const fx = ud.fx;
        if (style.effect === 'pulse') {
          const k = 0.5 + 0.5 * Math.sin(t * 2.8);
          const sc = 7.8 + k * 1.4;
          fx.scale.set(sc, sc, 1);
          fx.material.opacity = 0.18 + k * 0.4;
        } else if (style.effect === 'ripple') {
          const cycle = (t % 1.8) / 1.8;
          const sc = 6.6 + cycle * 7.8;
          fx.scale.set(sc, sc, 1);
          fx.material.opacity = 0.55 * (1 - cycle);
        }
      }
    }
  }

  _clearHotspots() {
    for (const sprite of this._hotspotSprites) {
      this.scene.remove(sprite);
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    for (const extra of this._hotspotExtras) {
      this.scene.remove(extra);
      extra.material.map?.dispose();
      extra.material.dispose();
    }
    this._hotspotSprites = [];
    this._hotspotExtras = [];
    this._hotspots = [];
  }

  _pickHotspot(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this._raycaster.setFromCamera(mouse, this.camera);
    const hits = this._raycaster.intersectObjects(this._hotspotSprites);
    return hits.length ? hits[0].object.userData.hotspot : null;
  }

  // ---------- 自动旋转 ----------
  setAutoRotate(enabled, speed = 0.04) {
    this.autoRotate = enabled;
    this.autoRotateSpeed = speed;
  }

  // ---------- 小行星视角 ----------
  setLittlePlanet(enabled) {
    if (enabled === this._littlePlanet) return;
    this._littlePlanet = enabled;
    if (enabled) {
      this._savedFov = this.fov;
      this._savedPitch = this.pitch;
      this.fov = FOV_MAX;
      this.pitch = -Math.PI / 2 + 0.01;
    } else {
      this.fov = this._savedFov;
      this.pitch = this._savedPitch;
    }
  }

  // ---------- VR 模式 ----------
  setVRMode(enabled) {
    this._vrMode = enabled;
    if (enabled) {
      this.renderer.setScissorTest(true);
    } else {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.container.clientWidth, this.container.clientHeight);
    }
  }

  // ---------- 获取当前朝向（用于罗盘） ----------
  getDirection() {
    return { yaw: this.yaw, pitch: this.pitch };
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

      // 热点：方位感知箭头 + 动效（每帧）
      this._updateHotspots(now);

      // 金字塔模式：视角变化后防抖刷新可见瓦片
      if (this._pyramid && this._pyramidTarget) {
        const lv = this._lastView;
        if (
          Math.abs(this.yaw - lv.yaw) > 0.02 ||
          Math.abs(this.pitch - lv.pitch) > 0.02 ||
          Math.abs(this.fov - lv.fov) > 1
        ) {
          this._lastView = { yaw: this.yaw, pitch: this.pitch, fov: this.fov };
          this._scheduleRefresh();
        }
      }

      // VR分屏渲染
      if (this._vrMode) {
        const w = this.container.clientWidth / 2;
        const h = this.container.clientHeight;
        // 左眼
        this.renderer.setViewport(0, 0, w, h);
        this.renderer.setScissor(0, 0, w, h);
        this.camera.position.x = -0.03;
        this.camera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.camera);
        // 右眼
        this.renderer.setViewport(w, 0, w, h);
        this.renderer.setScissor(w, 0, w, h);
        this.camera.position.x = 0.03;
        this.camera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.camera);
        this.camera.position.x = 0;
      } else {
        this.renderer.render(this.scene, this.camera);
      }
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
    this._clearPyramid();
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
