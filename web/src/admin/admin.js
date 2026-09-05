import {
  login,
  fetchAdminScenes,
  createScene,
  updateScene,
  deleteScene,
  uploadImage,
  fetchStorageConfig,
  saveStorageConfig,
  testStorage,
} from '../api.js';

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'panorama_token';

const loginView = $('login-view');
const adminView = $('admin-view');
const tbody = $('scene-tbody');
const dialog = $('scene-dialog');
const dialogTitle = $('dialog-title');
const form = $('scene-form');
const adminError = $('admin-error');
const loginError = $('login-error');

let scenes = [];

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}

function isLoggedIn() {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}

function renderLogin() {
  adminView.classList.add('hidden');
  loginView.classList.remove('hidden');
}

function renderAdmin() {
  loginView.classList.add('hidden');
  adminView.classList.remove('hidden');
}

// ---------- 登录 ----------
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  try {
    const { token } = await login($('login-username').value, $('login-password').value);
    localStorage.setItem(TOKEN_KEY, token);
    renderAdmin();
    await loadScenes();
  } catch (err) {
    showError(loginError, err.message);
  }
});

$('btn-logout').addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  renderLogin();
});

// ---------- 场景列表 ----------
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderScenes() {
  $('scene-count').textContent = `共 ${scenes.length} 个场景`;
  tbody.innerHTML = scenes
    .map(
      (s, i) => `
      <tr data-id="${s.id}">
        <td><img class="thumb" src="${esc(s.imagePath)}" alt="" loading="lazy" /></td>
        <td>
          <div class="title-cell">${esc(s.title)}</div>
          ${s.description ? `<div class="desc-cell">${esc(s.description)}</div>` : ''}
        </td>
        <td>${s.sortOrder}</td>
        <td><span class="badge ${s.published ? 'badge-on' : 'badge-off'}">${s.published ? '已上架' : '已下架'}</span></td>
        <td>
          <div class="op-cell">
            <button class="btn btn-sm btn-ghost act-edit">编辑</button>
            <button class="btn btn-sm btn-ghost act-toggle">${s.published ? '下架' : '上架'}</button>
            <button class="btn btn-sm btn-ghost act-up" ${i === 0 ? 'disabled' : ''}>上移</button>
            <button class="btn btn-sm btn-ghost act-down" ${i === scenes.length - 1 ? 'disabled' : ''}>下移</button>
            <button class="btn btn-sm btn-danger act-del">删除</button>
          </div>
        </td>
      </tr>`
    )
    .join('');
}

async function loadScenes() {
  try {
    scenes = (await fetchAdminScenes()).scenes;
    renderScenes();
  } catch (err) {
    if (err.message.includes('登录')) {
      localStorage.removeItem(TOKEN_KEY);
      renderLogin();
    } else {
      showError(adminError, err.message);
    }
  }
}

async function swapSort(i, j) {
  const a = scenes[i];
  const b = scenes[j];
  await updateScene(a.id, { ...a, sortOrder: b.sortOrder });
  await updateScene(b.id, { ...b, sortOrder: a.sortOrder });
  await loadScenes();
}

tbody.addEventListener('click', async (e) => {
  const row = e.target.closest('tr');
  if (!row) return;
  const id = Number(row.dataset.id);
  const scene = scenes.find((s) => s.id === id);
  if (!scene) return;
  const idx = scenes.indexOf(scene);

  if (e.target.classList.contains('act-edit')) {
    openDialog(scene);
  } else if (e.target.classList.contains('act-toggle')) {
    try {
      await updateScene(id, { ...scene, published: !scene.published });
      await loadScenes();
    } catch (err) {
      showError(adminError, err.message);
    }
  } else if (e.target.classList.contains('act-up')) {
    try {
      await swapSort(idx, idx - 1);
    } catch (err) {
      showError(adminError, err.message);
    }
  } else if (e.target.classList.contains('act-down')) {
    try {
      await swapSort(idx, idx + 1);
    } catch (err) {
      showError(adminError, err.message);
    }
  } else if (e.target.classList.contains('act-del')) {
    if (!window.confirm(`确定删除场景「${scene.title}」？该操作不可恢复。`)) return;
    try {
      await deleteScene(id);
      await loadScenes();
    } catch (err) {
      showError(adminError, err.message);
    }
  }
});

// ---------- 新增 / 编辑弹窗 ----------
let editingId = null;

function openDialog(scene) {
  editingId = scene ? scene.id : null;
  dialogTitle.textContent = scene ? '编辑场景' : '新增场景';
  $('f-id').value = scene ? scene.id : '';
  $('f-image-path').value = scene ? scene.imagePath : '';
  $('f-preview-path').value = scene ? scene.previewPath || '' : '';
  $('f-title').value = scene ? scene.title : '';
  $('f-desc').value = scene ? scene.description : '';
  $('f-sort').value = scene ? scene.sortOrder : 0;
  $('f-published').checked = scene ? scene.published : true;
  $('f-file').value = '';
  const preview = $('f-preview');
  if (scene) {
    preview.src = scene.previewPath || scene.imagePath;
    $('f-preview-wrap').classList.remove('hidden');
  } else {
    $('f-preview-wrap').classList.add('hidden');
  }
  $('f-upload-state').textContent = scene ? '已有一张全景图，可选择新图替换' : '';
  dialog.showModal();
}

$('btn-add').addEventListener('click', () => openDialog(null));
$('dialog-cancel').addEventListener('click', () => dialog.close());

$('f-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $('f-preview').src = reader.result;
    $('f-preview-wrap').classList.remove('hidden');
    $('f-upload-state').textContent = `已选择：${file.name}`;
  };
  reader.readAsDataURL(file);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = $('f-file');
  const uploadState = $('f-upload-state');
  let imagePath = $('f-image-path').value;
  let previewPath = $('f-preview-path').value;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    if (fileInput.files.length) {
      uploadState.textContent = '上传中…';
      const uploaded = await uploadImage(fileInput.files[0]);
      imagePath = uploaded.path;
      previewPath = uploaded.previewPath;
    }
    if (!imagePath) throw new Error('请先上传全景图');

    const payload = {
      title: $('f-title').value.trim(),
      description: $('f-desc').value.trim(),
      imagePath,
      previewPath,
      sortOrder: Number($('f-sort').value) || 0,
      published: $('f-published').checked,
    };

    if (editingId) {
      await updateScene(editingId, payload);
    } else {
      await createScene(payload);
    }
    dialog.close();
    await loadScenes();
  } catch (err) {
    showError(adminError, err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- 存储设置 ----------
const storageDialog = $('storage-dialog');
const storageMsg = $('s-msg');
const cloudFields = $('s-cloud-fields');

function showStorageMsg(msg, isError = true) {
  storageMsg.textContent = msg;
  storageMsg.style.color = isError ? 'var(--danger)' : '#189a56';
  storageMsg.classList.remove('hidden');
  setTimeout(() => storageMsg.classList.add('hidden'), 4000);
}

function syncCloudFields() {
  cloudFields.style.display = $('s-provider').value === 'local' ? 'none' : 'block';
}

async function openStorageDialog() {
  storageMsg.classList.add('hidden');
  try {
    const { config: cfg } = await fetchStorageConfig();
    $('s-provider').value = cfg.provider;
    $('s-access-key').value = cfg.accessKey;
    $('s-secret-key').value = '';
    $('s-bucket').value = cfg.bucket;
    $('s-region').value = cfg.region;
    $('s-cdn-domain').value = cfg.cdnDomain;
    $('s-msg').textContent = cfg.hasSecretKey ? '已配置密钥（出于安全不直接展示）' : '';
    $('s-msg').classList.toggle('hidden', !cfg.hasSecretKey);
    syncCloudFields();
    storageDialog.showModal();
  } catch (err) {
    showError(adminError, err.message);
  }
}

$('btn-storage').addEventListener('click', openStorageDialog);
$('s-cancel').addEventListener('click', () => storageDialog.close());
$('s-provider').addEventListener('change', syncCloudFields);

$('s-test').addEventListener('click', async () => {
  const btn = $('s-test');
  btn.disabled = true;
  btn.textContent = '测试中…';
  try {
    const result = await testStorage({
      provider: $('s-provider').value,
      accessKey: $('s-access-key').value.trim(),
      secretKey: $('s-secret-key').value,
      bucket: $('s-bucket').value.trim(),
      region: $('s-region').value.trim(),
      cdnDomain: $('s-cdn-domain').value.trim(),
    });
    showStorageMsg(result.ok ? `✓ ${result.message}` : `✗ ${result.message}`, !result.ok);
  } catch (err) {
    showStorageMsg(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '测试连接';
  }
});

$('storage-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = $('storage-form').querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await saveStorageConfig({
      provider: $('s-provider').value,
      accessKey: $('s-access-key').value.trim(),
      secretKey: $('s-secret-key').value,
      bucket: $('s-bucket').value.trim(),
      region: $('s-region').value.trim(),
      cdnDomain: $('s-cdn-domain').value.trim(),
    });
    storageDialog.close();
    showError(adminError, '存储设置已保存');
  } catch (err) {
    showStorageMsg(err.message, true);
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- 启动 ----------
if (isLoggedIn()) {
  renderAdmin();
  loadScenes();
} else {
  renderLogin();
}
