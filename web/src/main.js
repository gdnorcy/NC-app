import { fetchProjects, fetchProject, fetchShare, fetchPublicSettings } from './api.js';
import { PanoramaViewer } from './viewer/PanoramaViewer.js';
import { parseViewPath } from './routing.js';

// 生产模式注册 Service Worker：全景图/静态资源缓存，秒开与离线可用
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

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

// 项目视图元素
const projectsViewEl = $('projects-view');
const projectsGridEl = $('projects-grid');
const projectBarEl = $('project-bar');
const projectNameEl = $('project-name');
const btnBack = $('btn-back');

const viewer = new PanoramaViewer(viewerEl, {
  onLoad: () => {
    loadingEl.classList.add('hidden');
    titleEl.classList.remove('hidden');
  },
  // 低清预览图已渲染，画面可看：提前结束等待
  onPreviewReady: () => {
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

let scenes = [];
let activeIndex = -1;
let project = null; // 当前项目（展示端上下文）

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

// ---- 视图切换 ----
function enterProjectsView() {
  projectsViewEl.classList.remove('hidden');
  viewerEl.classList.add('hidden');
  projectBarEl.classList.add('hidden');
  listEl.classList.add('hidden');
  titleEl.classList.add('hidden');
}

function enterProjectView(projectData, scenesData, initialIndex = 0) {
  project = projectData;
  scenes = scenesData;
  projectsViewEl.classList.add('hidden');
  viewerEl.classList.remove('hidden');
  projectBarEl.classList.remove('hidden');
  projectNameEl.textContent = project.name;
  viewer.onResize(); // 从隐藏态变为可见后校正渲染尺寸
  renderSceneList();
  return selectScene(initialIndex, { force: true });
}

// ---- 项目列表 ----
async function renderProjects() {
  projectsGridEl.innerHTML = '';
  let projects;
  try {
    projects = await fetchProjects();
  } catch (err) {
    enterProjectsView();
    showError(err.message || '加载项目失败');
    return;
  }
  if (!projects.length) {
    projectsGridEl.innerHTML = `<div class="projects-empty">暂无公开项目，请先到管理后台创建并开启分享</div>`;
    return;
  }
  for (const p of projects) {
    const card = document.createElement('div');
    card.className = 'project-card';
    const cover = document.createElement('div');
    cover.className = 'project-cover';
    if (p.coverPath) {
      const img = document.createElement('img');
      img.src = p.coverPath;
      img.alt = p.name;
      img.loading = 'lazy';
      cover.appendChild(img);
    } else {
      cover.textContent = p.name.slice(0, 1);
    }
    const meta = document.createElement('div');
    meta.className = 'project-meta';
    const name = document.createElement('div');
    name.className = 'project-name';
    name.textContent = p.name;
    const desc = document.createElement('div');
    desc.className = 'project-desc';
    desc.textContent = p.description || `${p.sceneCount} 个全景场景`;
    const count = document.createElement('div');
    count.className = 'project-count';
    count.textContent = `${p.sceneCount} 场景`;
    meta.append(name, desc, count);
    card.append(cover, meta);
    card.addEventListener('click', () => openProject(p.id));
    projectsGridEl.appendChild(card);
  }
}

async function openProject(id) {
  try {
    const { project: p, scenes: s } = await fetchProject(id);
    if (!s.length) {
      enterProjectsView();
      showError('该项目暂无公开场景');
      return;
    }
    await enterProjectView(p, s, 0);
  } catch (err) {
    showError(err.message || '打开项目失败');
  }
}

// ---- 场景列表 ----
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

async function selectScene(i, { force = false } = {}) {
  if (!force && i === activeIndex && viewer._mesh) return;
  activeIndex = i;
  const scene = scenes[i];
  if (!scene) return;
  titleEl.textContent = scene.title;
  loadingEl.classList.remove('hidden');
  loadingFill.style.width = '0%';
  loadingText.textContent = '加载中 0%';
  document.querySelectorAll('.scene-item').forEach((el, j) => {
    el.classList.toggle('active', j === i);
  });
  await viewer.load(scene.imagePath, scene.previewPath, scene.pyramid);
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

btnBack.addEventListener('click', async () => {
  if (history.state && history.state.share) {
    // 分享直达的入口：返回浏览器上一个页面
    history.back();
    return;
  }
  await renderProjects();
  enterProjectsView();
  viewer.reset?.();
});

// ---- 自适应 ----
function onResize() {
  viewer.onResize();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));

// ---- 启动 ----
async function init() {
  // 加载公开设置（站点名称、版权）
  try {
    const { settings } = await fetchPublicSettings();
    if (settings['site.name']) document.title = settings['site.name'];
    if (settings['site.title']) {
      const logo = document.querySelector('.projects-logo');
      if (logo) logo.textContent = settings['site.title'];
    }
    if (settings['site.subtitle']) {
      const sub = document.querySelector('.projects-subtitle');
      if (sub) sub.textContent = settings['site.subtitle'];
    }
    if (settings['copyright.enabled'] !== false) {
      const footer = $('site-footer');
      const year = settings['copyright.year'] || new Date().getFullYear();
      const owner = settings['copyright.owner'] || '';
      const text = settings['copyright.text'] || (owner ? `© ${year} ${owner} 版权所有` : `© ${year}`);
      footer.textContent = text;
      footer.classList.remove('hidden');
    }
  } catch { /* 公开设置加载失败不影响主流程 */ }

  // 陀螺仪按钮仅移动端显示
  if (isTouch && typeof DeviceOrientationEvent !== 'undefined') {
    btnGyro.classList.remove('hidden');
  }
  showHint(isTouch ? '拖动或双指缩放查看全景' : '拖动查看全景，滚轮缩放');

  const route = parseViewPath(location.pathname);
  if (route.type === 'share') {
    // 分享链接直达：项目级或场景级
    try {
      const data = await fetchShare(route.token);
      history.replaceState({ share: true }, '', location.pathname);
      if (data.type === 'scene') {
        const idx = Math.max(
          0,
          data.scenes.findIndex((s) => s.id === data.scene.id)
        );
        await enterProjectView(data.project, data.scenes, idx);
      } else {
        await enterProjectView(data.project, data.scenes, 0);
      }
    } catch (err) {
      enterProjectsView();
      showError(err.message || '链接无效或已关闭');
    }
    return;
  }

  // 默认：项目列表首页
  enterProjectsView();
  await renderProjects();
}

init();
