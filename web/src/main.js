import { fetchScenes } from './api.js';
import { PanoramaViewer } from './viewer/PanoramaViewer.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;

const viewerEl = $('viewer');
const loadingEl = $('loading');
const loadingFill = $('loading-fill');
const loadingText = $('loading-text');
const titleEl = $('scene-title');
const listEl = $('scene-list');
const errorEl = $('error');
const btnRotate = $('btn-rotate');
const btnGyro = $('btn-gyro');
const btnFullscreen = $('btn-fullscreen');

let scenes = [];
let activeIndex = -1;

const viewer = new PanoramaViewer(viewerEl, {
  onLoad: () => {
    loadingEl.classList.add('hidden');
    titleEl.classList.remove('hidden');
  },
  onProgress: (pct) => {
    loadingEl.classList.remove('hidden');
    loadingFill.style.width = `${pct}%`;
    loadingText.textContent = `加载中 ${pct}%`;
  },
  onError: (err) => {
    loadingEl.classList.add('hidden');
    showError(err.message || '加载失败');
  },
});

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
  setTimeout(() => errorEl.classList.add('hidden'), 4000);
}

function showHint(text) {
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = text;
  document.body.appendChild(hint);
  setTimeout(() => hint.remove(), 4200);
}

function renderSceneList() {
  listEl.innerHTML = '';
  if (scenes.length <= 1) {
    listEl.classList.add('hidden');
    return;
  }
  listEl.classList.remove('hidden');
  scenes.forEach((scene, i) => {
    const item = document.createElement('div');
    item.className = `scene-item${i === activeIndex ? ' active' : ''}`;
    const img = document.createElement('img');
    img.src = scene.previewPath || scene.imagePath;
    img.alt = scene.title;
    img.loading = 'lazy';
    const name = document.createElement('div');
    name.className = 'scene-item-name';
    name.textContent = scene.title;
    item.append(img, name);
    item.addEventListener('click', () => selectScene(i));
    listEl.appendChild(item);
  });
}

async function selectScene(i) {
  if (i === activeIndex && viewer._mesh) return;
  activeIndex = i;
  const scene = scenes[i];
  titleEl.textContent = scene.title;
  titleEl.classList.remove('hidden');
  loadingEl.classList.remove('hidden');
  loadingFill.style.width = '0%';
  loadingText.textContent = '加载中 0%';
  document.querySelectorAll('.scene-item').forEach((el, j) => {
    el.classList.toggle('active', j === i);
  });
  await viewer.load(scene.imagePath);
  if (viewer.gyroEnabled || viewer.autoRotate) {
    // 保留当前模式
  }
}

// ---- 控制按钮 ----
btnRotate.addEventListener('click', () => {
  viewer.autoRotate = !viewer.autoRotate;
  btnRotate.setAttribute('aria-pressed', String(viewer.autoRotate));
  btnRotate.textContent = viewer.autoRotate ? '停止旋转' : '自动旋转';
});

btnGyro.addEventListener('click', async () => {
  if (viewer.gyroEnabled) {
    viewer.disableGyro();
    btnGyro.setAttribute('aria-pressed', 'false');
    btnGyro.textContent = '陀螺仪';
    return;
  }
  const result = await viewer.enableGyro();
  if (result.ok) {
    btnGyro.setAttribute('aria-pressed', 'true');
    btnGyro.textContent = '关闭陀螺仪';
    showHint('晃动手机即可查看四周');
  } else {
    showError(result.reason === 'unsupported' ? '当前设备不支持陀螺仪' : '未获得陀螺仪权限');
  }
});

btnFullscreen.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen?.();
  }
});

// ---- 自适应 ----
function onResize() {
  viewer.onResize();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));

// ---- 启动 ----
async function init() {
  // 陀螺仪按钮仅移动端显示
  if (isTouch && typeof DeviceOrientationEvent !== 'undefined') {
    btnGyro.classList.remove('hidden');
  }
  showHint(isTouch ? '拖动或双指缩放查看全景' : '拖动查看全景，滚轮缩放');
  try {
    scenes = await fetchScenes();
    if (!scenes.length) {
      showError('暂无全景内容，请先到管理后台添加场景');
      return;
    }
    renderSceneList();
    await selectScene(0);
  } catch (err) {
    showError(err.message);
  }
}

init();
