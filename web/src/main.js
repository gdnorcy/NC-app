import { fetchProjects, fetchProject, fetchShare, fetchPublicSettings } from './api.js';
import { PanoramaViewer } from './viewer/PanoramaViewer.js';
import { parseViewPath } from './routing.js';
import { track } from './analytics.js';

// 生产模式注册 Service Worker：全景图/静态资源缓存，秒开与离线可用
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/pano/sw.js').catch(() => {});
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
window.panoramaViewer = viewer; // 暴露到window方便调试

// 热点点击回调
viewer.onHotspotClick = (hs) => {
  track('hotspot_click', { sceneId: activeIndex >= 0 ? scenes[activeIndex].id : 0, targetSceneId: hs.targetSceneId || null, hotspotType: hs.type || '', hotspotTitle: hs.title || '' });
  if (hs.type === 'scene' && hs.targetSceneId) {
    // 跳转点挂表单：开启后先留资，提交成功再跳转
    if (hs.form && hs.form.enabled) {
      openHotspotPopup(hs, () => jumpScene(hs.targetSceneId));
    } else {
      jumpScene(hs.targetSceneId);
    }
  } else if (hs.type === 'info') {
    openHotspotPopup(hs);
  }
};

// 跳转目标场景
function jumpScene(targetSceneId) {
  const idx = scenes.findIndex((s) => String(s.id) === String(targetSceneId));
  if (idx >= 0) selectScene(idx, { force: true });
}

// 打开热点弹窗：标题/内容 + 留资表单（afterSubmit 为提交成功后的回调）
function openHotspotPopup(hs, afterSubmit) {
  $('hotspot-title').textContent = hs.title || '信息';
  $('hotspot-content').textContent = hs.content || '';
  const formBox = $('hotspot-form');
  const formCfg = hs.form && hs.form.enabled ? hs.form : null;
  formBox.classList.toggle('hidden', !formCfg);
  $('hotspot-form-msg').textContent = '';
  $('hotspot-form-msg').style.color = '#f53f3f';
  if (formCfg) {
    const fields = Array.isArray(formCfg.fields) ? formCfg.fields : [{ key: 'name', label: '姓名' }, { key: 'phone', label: '手机号' }, { key: 'message', label: '留言' }];
    const fieldEls = formBox.querySelectorAll('.hotspot-form-field');
    fieldEls.forEach((el) => {
      const key = el.dataset.key;
      const cfg = fields.find((f) => f.key === key);
      el.classList.toggle('hidden', !cfg);
      if (cfg) {
        const label = el.querySelector('label');
        const input = el.querySelector('input, textarea');
        label.textContent = cfg.label || key;
        input.placeholder = `请输入${cfg.label || key}`;
        input.required = Boolean(cfg.required);
        input.value = '';
      }
    });
    formBox._hs = { sceneId: activeIndex >= 0 ? scenes[activeIndex].id : 0, hotspotTitle: hs.title || '', afterSubmit: afterSubmit || null };
  }
  $('hotspot-popup').classList.remove('hidden');
}
// 热点表单提交
$('hotspot-form-submit').addEventListener('click', async () => {
  const formBox = $('hotspot-form');
  const hs = formBox._hs;
  if (!hs) return;
  const fields = {};
  let ok = true;
  formBox.querySelectorAll('.hotspot-form-field:not(.hidden)').forEach((el) => {
    const input = el.querySelector('input, textarea');
    const key = el.dataset.key;
    const val = (input.value || '').trim();
    if (input.required && !val) { ok = false; input.style.borderColor = '#f53f3f'; }
    else { input.style.borderColor = ''; if (val) fields[key] = val; }
  });
  if (!ok) { $('hotspot-form-msg').textContent = '请填写必填项'; return; }
  const msg = $('hotspot-form-msg');
  msg.textContent = '提交中…';
  try {
    const r = await fetch('/api/card/panorama/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneId: hs.sceneId, hotspotTitle: hs.hotspotTitle, fields }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || '提交失败');
    msg.textContent = data.message || '提交成功';
    msg.style.color = '#00b42a';
    formBox.querySelectorAll('input, textarea').forEach((el) => { el.value = ''; });
    track('form_submit', { sceneId: hs.sceneId, hotspotTitle: hs.hotspotTitle });
    // 跳转点挂表单：提交成功后跳转目标场景
    if (hs.afterSubmit) hs.afterSubmit();
  } catch (e) {
    msg.textContent = e.message || '提交失败，请稍后重试';
    msg.style.color = '#f53f3f';
  }
});
$('hotspot-close').addEventListener('click', () => {
  $('hotspot-popup').classList.add('hidden');
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
  track('panorama_view', { planId: project.id, sceneCount: scenes.length });
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
    const { project: p, scenes: s, customer } = await fetchProject(id);
    applyCustomerCopyright(customer);
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

// 客户自定义版权优先于平台版权
function applyCustomerCopyright(customer) {
  const text = customer?.config?.copyright;
  if (text) {
    const footer = $('site-footer');
    footer.textContent = text;
    footer.classList.remove('hidden');
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
  // 场景切换过渡
  const meta = scene.meta || {};
  if (meta.transition === 'fade') {
    viewerEl.classList.add('viewer-transition');
    setTimeout(() => viewerEl.classList.remove('viewer-transition'), 500);
  }
  // 停止上一个场景的音频
  stopSceneAudio();
  await viewer.load(scene.imagePath, scene.previewPath, scene.pyramid, { initialView: meta.initialView });
  track('scene_view', { sceneId: scene.id, planId: project ? project.id : 0 });
  // 记录场景停留起点，页面隐藏/卸载时补发 scene_leave（含停留时长）
  window.__panoSceneStay = { sceneId: scene.id, at: Date.now() };
  // 加载热点
  viewer.setHotspots(scene.hotspots || [], scene.meta?.hotspotStyle);
  // 内容增强
  applySceneMeta(meta);
}

// 场景内容增强
let bgmAudio = null;
let voiceoverAudio = null;

function stopSceneAudio() {
  if (bgmAudio) { bgmAudio.pause(); bgmAudio = null; }
  if (voiceoverAudio) { voiceoverAudio.pause(); voiceoverAudio = null; }
  $('btn-bgm').classList.add('hidden');
  $('btn-voiceover').classList.add('hidden');
  $('scene-intro').classList.add('hidden');
}

function applySceneMeta(meta) {
  // 背景音乐
  if (meta.bgMusic) {
    $('btn-bgm').classList.remove('hidden');
    bgmAudio = new Audio(meta.bgMusic);
    bgmAudio.loop = true;
    bgmAudio.volume = 0.4;
    // 浏览器自动播放限制：尝试播放，失败则等待用户交互
    bgmAudio.play().catch(() => {
      // 自动播放被阻止，显示音乐按钮提示
    });
  }
  // 解说音频
  if (meta.voiceover) {
    $('btn-voiceover').classList.remove('hidden');
    voiceoverAudio = new Audio(meta.voiceover);
  }
  // 场景介绍文字
  if (meta.introText) {
    $('scene-intro-text').textContent = meta.introText;
    $('scene-intro').classList.remove('hidden');
    // 5秒后自动隐藏
    setTimeout(() => $('scene-intro').classList.add('hidden'), 5000);
  }
}

// 背景音乐控制
$('btn-bgm').addEventListener('click', () => {
  if (!bgmAudio) return;
  if (bgmAudio.paused) {
    bgmAudio.play();
    $('btn-bgm').textContent = '♪ 音乐开';
  } else {
    bgmAudio.pause();
    $('btn-bgm').textContent = '♪ 音乐关';
  }
});

// 解说播放
$('btn-voiceover').addEventListener('click', () => {
  if (!voiceoverAudio) return;
  if (voiceoverAudio.paused) {
    voiceoverAudio.play();
    $('btn-voiceover').textContent = '⏸ 解说中';
  } else {
    voiceoverAudio.pause();
    $('btn-voiceover').textContent = '▶ 解说';
  }
});

// 关闭介绍文字
$('scene-intro-close').addEventListener('click', () => {
  $('scene-intro').classList.add('hidden');
});

// ---- 控制按钮 ----
btnRotate.addEventListener('click', () => {
  viewer.setAutoRotate(!viewer.autoRotate);
  btnRotate.setAttribute('aria-pressed', String(viewer.autoRotate));
  btnRotate.textContent = viewer.autoRotate ? '停止旋转' : '自动旋转';
});

// 小行星视角
const btnPlanet = $('btn-planet');
btnPlanet?.addEventListener('click', () => {
  const enabled = !viewer._littlePlanet;
  viewer.setLittlePlanet(enabled);
  btnPlanet.setAttribute('aria-pressed', String(enabled));
  btnPlanet.textContent = enabled ? '退出小行星' : '小行星';
});

// VR模式
const btnVR = $('btn-vr');
btnVR?.addEventListener('click', () => {
  const enabled = !viewer._vrMode;
  viewer.setVRMode(enabled);
  btnVR.setAttribute('aria-pressed', String(enabled));
  btnVR.textContent = enabled ? '退出VR' : 'VR';
});

// 罗盘显示
const compassEl = $('compass');
const compassNeedle = $('compass-needle');
if (compassEl) compassEl.classList.remove('hidden');
// 罗盘更新（用requestAnimationFrame节流）
let _compassRaf = 0;
function updateCompass() {
  const dir = viewer.getDirection();
  const deg = ((dir.yaw * 180 / Math.PI) % 360 + 360) % 360;
  if (compassNeedle) compassNeedle.style.transform = `translate(-50%, -100%) rotate(${deg}deg)`;
  _compassRaf = requestAnimationFrame(updateCompass);
}
updateCompass();

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
  track('page_view');
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

  const route = parseViewPath(location.pathname, Object.fromEntries(new URLSearchParams(location.search)));
  if (route.type === 'share') {
    // 分享链接直达：项目级或场景级
    try {
      const data = await fetchShare(route.token);
      history.replaceState({ share: true }, '', location.pathname);
      applyCustomerCopyright(data.customer);
      if (data.type === 'scene' || route.sceneId) {
        const idx = Math.max(
          0,
          data.scenes.findIndex((s) => String(s.id) === String(route.sceneId || data.scene?.id))
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

  if (route.type === 'project') {
    // 场景编辑「预览」直达：?plan=X&scene=Y（无 scene 则进方案第一个场景）
    try {
      const data = await fetchProject(route.planId);
      if (!data || !data.project) throw new Error('项目不存在或未公开');
      applyCustomerCopyright(data.customer);
      let idx = 0;
      if (route.sceneId) {
        idx = Math.max(0, data.scenes.findIndex((s) => String(s.id) === String(route.sceneId)));
      }
      await enterProjectView(data.project, data.scenes, idx);
    } catch (err) {
      enterProjectsView();
      showError(err.message || '项目不存在或未公开');
    }
    return;
  }

  // 默认：项目列表首页
  enterProjectsView();
  await renderProjects();
}

init();
