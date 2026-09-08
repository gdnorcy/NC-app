<template>
  <div class="hotspot-editor">
    <div ref="host" class="he-canvas" :class="{ 'he-loading': loading }">
      <div v-if="loading" class="he-loading-mask">
        <el-icon class="is-loading"><Loading /></el-icon> 全景图加载中…{{ progress ? ' ' + progress + '%' : '' }}
      </div>
      <div v-if="!loading" class="he-tip">
        <span class="he-tip-item">🖱️ 拖动旋转画面</span>
        <span class="he-tip-item">📍 点击画面添加热点</span>
        <span class="he-tip-item">✋ 拖动热点标记微调位置</span>
      </div>
      <div v-if="!loading" class="he-pos">视角 {{ Math.round(viewLon) }}° / {{ Math.round(viewLat) }}°</div>
    </div>
    <!-- 角度精调滑杆（方案C） -->
    <div class="he-sliders">
      <div class="he-slider-row">
        <span class="he-slider-label">水平</span>
        <el-slider v-model="viewLon" :min="0" :max="360" :step="1" size="small" @input="syncLon" />
        <span class="he-slider-val">{{ Math.round(viewLon) }}°</span>
      </div>
      <div class="he-slider-row">
        <span class="he-slider-label">垂直</span>
        <el-slider v-model="viewLat" :min="-85" :max="85" :step="1" size="small" @input="syncLat" />
        <span class="he-slider-val">{{ Math.round(viewLat) }}°</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';

const props = defineProps({
  imageUrl: { type: String, default: '' },
  modelValue: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:modelValue', 'add-at', 'select']);

const host = ref(null);
const loading = ref(true);
const progress = ref(0);
const viewLon = ref(0);
const viewLat = ref(0);

let viewer = null; // { scene, camera, renderer, sphere, marks: Map(idx->mesh), raycaster }
let rafId = 0;
let isDragging = false;
let dragMode = null; // 'rotate' | 'mark'
let lastX = 0, lastY = 0;
let downX = 0, downY = 0;
let downTime = 0;
let hitMarkIdx = null;

// 热点方向 → yaw/pitch（与 H5 端 hotspotDir 互逆）
function dirToAngles(dir) {
  const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
  let pitch = Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI;
  let yaw = Math.atan2(-d.z, -d.x) * 180 / Math.PI;
  if (yaw < 0) yaw += 360;
  return { yaw: Math.round(yaw), pitch: Math.round(pitch) };
}
function hotspotDir(h) {
  const yaw = ((Number(h.yaw) || 0) % 360) * Math.PI / 180;
  const pitch = Math.max(-89, Math.min(89, Number(h.pitch) || 0)) * Math.PI / 180;
  const cp = Math.cos(pitch);
  return new THREE.Vector3(-cp * Math.cos(yaw), Math.sin(pitch), -cp * Math.sin(yaw));
}

function initThree() {
  const el = host.value;
  const w = el.clientWidth || 640;
  const h = el.clientHeight || 360;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1200);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  el.appendChild(renderer.domElement);

  const loader = new THREE.TextureLoader();
  loader.load(
    props.imageUrl,
    (texture) => {
      const geometry = new THREE.SphereGeometry(500, 60, 40);
      geometry.scale(-1, 1, 1);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      const sphere = new THREE.Mesh(geometry, material);
      scene.add(sphere);
      viewer = { scene, camera, renderer, sphere, marks: new Map(), raycaster: new THREE.Raycaster(), THREE };
      loading.value = false;
      renderMarks();
      animate();
    },
    (xhr) => { progress.value = xhr.total ? Math.round((xhr.loaded / xhr.total) * 100) : 0; },
    (err) => {
      console.error('全景图加载失败:', err);
      loading.value = false;
      el.innerHTML = '<div class="he-error">全景图加载失败，请检查图片地址</div>';
    }
  );

  // 事件
  el.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function renderMarks() {
  if (!viewer) return;
  const { scene } = viewer;
  // 移除旧标记
  viewer.marks.forEach((m) => scene.remove(m));
  viewer.marks.clear();
  (props.modelValue || []).forEach((h, idx) => {
    const dir = hotspotDir(h).multiplyScalar(485);
    // 标记球体：info 14 / scene 16（在 460px 画布上视觉约 20px+，便于点选与拖拽）
    const r = h.type === 'scene' ? 16 : 14;
    const geo = new THREE.SphereGeometry(r, 24, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: h.type === 'scene' ? 0x165dff : 0xff7d00,
      transparent: true,
      opacity: 0.95,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(dir);
    mesh.userData.hotspotIdx = idx;
    scene.add(mesh);
    viewer.marks.set(idx, mesh);
  });
}

function animate() {
  rafId = requestAnimationFrame(animate);
  if (!viewer) return;
  const phi = THREE.MathUtils.degToRad(90 - viewLat.value);
  const theta = THREE.MathUtils.degToRad(viewLon.value);
  viewer.camera.position.set(
    100 * Math.sin(phi) * Math.cos(theta),
    100 * Math.cos(phi),
    100 * Math.sin(phi) * Math.sin(theta)
  );
  viewer.camera.lookAt(0, 0, 0);
  viewer.renderer.render(viewer.scene, viewer.camera);
}

function raycastSphere(px, py) {
  const el = host.value;
  const rect = el.getBoundingClientRect();
  const ndcX = ((px - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((py - rect.top) / rect.height) * 2 + 1;
  viewer.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), viewer.camera);
  const hits = viewer.raycaster.intersectObject(viewer.sphere);
  if (!hits.length) return null;
  return hits[0].point.clone().normalize();
}
function raycastMarks(px, py) {
  const el = host.value;
  const rect = el.getBoundingClientRect();
  const ndcX = ((px - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((py - rect.top) / rect.height) * 2 + 1;
  viewer.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), viewer.camera);
  const meshes = [...viewer.marks.values()];
  const hits = viewer.raycaster.intersectObjects(meshes);
  if (!hits.length) return null;
  return hits[0].object.userData.hotspotIdx;
}

function onPointerDown(e) {
  if (!viewer || loading.value) return;
  const px = e.clientX, py = e.clientY;
  downX = px; downY = py; downTime = Date.now();
  // 先判定是否点到热点标记：进入拖拽模式（不立即弹编辑框）
  const markIdx = raycastMarks(px, py);
  if (markIdx !== null && markIdx !== undefined) {
    dragMode = 'mark';
    hitMarkIdx = markIdx;
    return;
  }
  dragMode = 'rotate';
  isDragging = true;
  lastX = px; lastY = py;
}

function onPointerMove(e) {
  if (!viewer) return;
  const px = e.clientX, py = e.clientY;
  if (dragMode === 'mark') {
    // 拖拽热点标记：跟随球面
    const dir = raycastSphere(px, py);
    if (dir) {
      const { yaw, pitch } = dirToAngles(dir);
      const list = [...(props.modelValue || [])];
      if (list[hitMarkIdx]) {
        list[hitMarkIdx] = { ...list[hitMarkIdx], yaw, pitch };
        emit('update:modelValue', list);
        renderMarks();
      }
    }
    return;
  }
  if (dragMode === 'rotate' && isDragging) {
    const dx = px - lastX, dy = py - lastY;
    viewLon.value = (viewLon.value - dx * 0.25 + 360) % 360;
    viewLat.value = Math.max(-85, Math.min(85, viewLat.value + dy * 0.25));
    lastX = px; lastY = py;
  }
}

function onPointerUp(e) {
  // 标记模式：位移小 = 点击 → 打开编辑；位移大 = 拖动完成（位置已实时更新）
  if (dragMode === 'mark' && hitMarkIdx !== null) {
    const moved = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
    if (moved < 6) {
      const h = props.modelValue[hitMarkIdx];
      if (h) emit('select', h, hitMarkIdx);
    }
    dragMode = null;
    isDragging = false;
    hitMarkIdx = null;
    return;
  }
  // 旋转模式：判定点击（无位移、短时间）→ 添加热点
  if (dragMode === 'rotate' && hitMarkIdx === null) {
    const moved = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
    const dt = Date.now() - downTime;
    if (moved < 6 && dt < 400) {
      const dir = raycastSphere(e.clientX, e.clientY);
      if (dir) {
        const { yaw, pitch } = dirToAngles(dir);
        emit('add-at', { yaw, pitch });
      }
    }
  }
  dragMode = null;
  isDragging = false;
  hitMarkIdx = null;
}

function syncLon() { /* 滑杆已直接绑定 viewLon，animate 自动跟随 */ }
function syncLat() { /* 同上 */ }

// 外部更新 hotspots 时重建标记（拖拽/编辑/删除后）
watch(() => props.modelValue, () => {
  if (viewer) renderMarks();
}, { deep: true });

onMounted(() => {
  if (props.imageUrl) {
    initThree();
  } else {
    loading.value = false;
  }
});
onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  if (viewer) {
    viewer.renderer.dispose();
    const el = host.value;
    if (el) {
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      while (el.firstChild) el.removeChild(el.firstChild);
    }
  }
});
</script>

<style scoped>
.hotspot-editor { width: 100%; }
.he-canvas {
  position: relative;
  width: 100%;
  height: 460px;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
  cursor: grab;
  touch-action: none;
}
.he-canvas:active { cursor: grabbing; }
.he-loading-mask {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 13px; gap: 8px;
  background: rgba(0,0,0,0.55);
}
.he-error { color: #f53f3f; font-size: 13px; text-align: center; padding: 120px 20px; }
.he-tip {
  position: absolute; top: 10px; left: 10px;
  display: flex; gap: 10px; flex-wrap: wrap;
  background: rgba(0,0,0,0.45);
  color: #fff; font-size: 12px;
  padding: 6px 10px; border-radius: 6px;
  pointer-events: none;
}
.he-tip-item { white-space: nowrap; }
.he-pos {
  position: absolute; bottom: 10px; right: 10px;
  background: rgba(0,0,0,0.45);
  color: #fff; font-size: 12px;
  padding: 4px 8px; border-radius: 4px;
  pointer-events: none;
}
.he-sliders {
  margin-top: 12px;
  display: flex; flex-direction: column; gap: 6px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  padding: 12px 16px;
}
.he-slider-row { display: flex; align-items: center; gap: 12px; }
.he-slider-label { width: 32px; font-size: 13px; color: #4e5969; flex-shrink: 0; }
.he-slider-row .el-slider { flex: 1; }
.he-slider-val { width: 44px; text-align: right; font-size: 12px; color: #86909c; flex-shrink: 0; }
</style>
