// 客户（租户）后台逻辑
const $ = (id) => document.getElementById(id);
const API_BASE = '/api/customer';

let state = {
  token: localStorage.getItem('customer_token') || '',
  user: null,
  customer: null,
  view: 'dashboard',
  currentPlan: null,
  plans: [],
  scenes: [],
};

// ===== API 封装 =====
async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    logout();
    throw new Error('登录已过期，请重新登录');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// ===== Toast =====
function toast(msg, type = 'success') {
  const el = $('toast');
  el.textContent = msg;
  el.style.background = type === 'error' ? 'var(--danger)' : 'var(--text-1)';
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

// ===== 登录 =====
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '登录失败');
    // 只允许租户角色登录客户后台
    if (!['tenant_admin', 'tenant_member'].includes(data.user.role)) {
      throw new Error('该账号无权访问客户工作台');
    }
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('customer_token', data.token);
    await loadProfile();
    showApp();
  } catch (err) {
    $('login-error').textContent = err.message;
    $('login-error').classList.remove('hidden');
  }
});

function logout() {
  state.token = '';
  state.user = null;
  state.customer = null;
  localStorage.removeItem('customer_token');
  $('app').classList.add('hidden');
  $('login-page').classList.remove('hidden');
}

$('logout-btn').addEventListener('click', logout);
$('dropdown-logout').addEventListener('click', logout);

// ===== 加载公开设置（系统名称、Logo） =====
async function loadPublicSettings() {
  try {
    const res = await fetch('/api/settings/public');
    const data = await res.json();
    const settings = data.settings || {};
    const siteName = settings['site.name'] || '360 全景平台';
    const siteLogo = settings['site.logo'] || '';
    // 侧边栏品牌区：系统名称和Logo
    $('brand-name').textContent = siteName;
    $('login-title').textContent = siteName;
    if (siteLogo) {
      const img = $('brand-logo-img');
      img.src = siteLogo;
      img.style.display = 'block';
      $('brand-logo').style.display = 'none';
      $('login-logo').style.display = 'none';
      // 登录页也显示图片Logo
      const loginLogo = $('login-logo');
      if (!$('login-logo-img')) {
        const loginImg = document.createElement('img');
        loginImg.id = 'login-logo-img';
        loginImg.src = siteLogo;
        loginImg.style.cssText = 'width:56px;height:56px;border-radius:14px;object-fit:cover;margin:0 auto 16px;display:block;';
        loginLogo.parentNode.insertBefore(loginImg, loginLogo);
      }
    } else {
      $('brand-logo').textContent = siteName.substring(0, 2);
      $('login-logo').textContent = siteName.substring(0, 2);
    }
  } catch { /* 忽略设置加载失败 */ }
}

// ===== 加载租户信息 =====
async function loadProfile() {
  const data = await api('/profile');
  state.customer = data.customer;
  state.user = data.user;
  // 应用品牌色
  if (data.customer.brandColor) {
    document.documentElement.style.setProperty('--brand', data.customer.brandColor);
  }
  // 顶部显示客户企业名称
  $('customer-name').textContent = data.customer.customerName;
  const logoText = data.customer.customerName.substring(0, 2);
  $('customer-logo').textContent = logoText;
  // 用户信息
  $('user-avatar-btn').textContent = (data.user.username || 'U').substring(0, 1).toUpperCase();
  $('dropdown-username').textContent = data.user.username;
  $('dropdown-role').textContent = data.user.role === 'tenant_admin' ? '企业管理员' : '普通成员';
  // 普通成员隐藏成员管理
  if (data.user.role !== 'tenant_admin') {
    document.querySelectorAll('.admin-only').forEach((el) => el.classList.add('hidden'));
    $('settings-storage-card')?.classList.add('hidden');
    $('settings-sms-card')?.classList.add('hidden');
  }
  // 加载独立配置
  const cfg = data.customer.config || {};
  state.customerConfig = cfg;
  $('storage-mode').value = cfg.storage?.mode || 'platform';
  $('storage-provider').value = cfg.storage?.provider || 'qiniu';
  // 七牛配置
  $('storage-qiniu-ak').value = cfg.storage?.qiniu?.accessKey || cfg.storage?.accessKey || '';
  $('storage-qiniu-sk').value = cfg.storage?.qiniu?.secretKey || cfg.storage?.secretKey || '';
  $('storage-qiniu-zone').value = cfg.storage?.qiniu?.zone || cfg.storage?.region || '';
  $('storage-qiniu-bucket').value = cfg.storage?.qiniu?.bucket || cfg.storage?.bucket || '';
  $('storage-qiniu-folder').value = cfg.storage?.qiniu?.folder || '';
  $('storage-qiniu-domain').value = cfg.storage?.qiniu?.cdnDomain || cfg.storage?.domain || '';
  // 阿里云配置
  $('storage-aliyun-ak').value = cfg.storage?.aliyun?.accessKeyId || '';
  $('storage-aliyun-sk').value = cfg.storage?.aliyun?.accessKeySecret || '';
  $('storage-aliyun-region').value = cfg.storage?.aliyun?.region || '';
  $('storage-aliyun-bucket').value = cfg.storage?.aliyun?.bucket || '';
  $('storage-aliyun-folder').value = cfg.storage?.aliyun?.folder || '';
  $('storage-aliyun-domain').value = cfg.storage?.aliyun?.cdnDomain || '';
  toggleStorageFields();
  toggleStorageProvider();
  $('sms-mode').value = cfg.sms?.mode || 'platform';
  $('sms-provider').value = cfg.sms?.provider || 'aliyun';
  $('sms-ak').value = cfg.sms?.config?.accessKey || '';
  $('sms-sk').value = cfg.sms?.config?.secretKey || '';
  $('sms-sign').value = cfg.sms?.config?.signName || '';
  $('sms-template').value = cfg.sms?.config?.templateCode || '';
  toggleSmsFields();
  // 检测是否从总后台"登录为"进入
  if (localStorage.getItem('admin_token_backup')) {
    $('back-to-admin').classList.remove('hidden');
  }
}

// 返回总后台
$('back-to-admin').addEventListener('click', () => {
  const backup = localStorage.getItem('admin_token_backup');
  if (backup) {
    localStorage.setItem('panorama_token', backup);
  }
  localStorage.removeItem('admin_token_backup');
  localStorage.removeItem('customer_token');
  window.location.href = '/admin';
});

function showApp() {
  $('login-page').classList.add('hidden');
  $('app').classList.remove('hidden');
  switchView('dashboard');
}

// ===== 视图切换 =====
function switchView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $(`view-${view}`).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  // 高亮对应侧边栏
  const activeNav = view === 'plans' || view === 'scenes' ? 'apps' : view;
  document.querySelector(`.nav-item[data-nav="${activeNav}"]`)?.classList.add('active');
  // 面包屑
  const names = { dashboard: '工作台', apps: '应用中心', plans: '360全景', scenes: '场景管理', orders: '我的账单', members: '成员管理', settings: '账号设置' };
  if (view === 'scenes' && state.currentPlan) {
    $('breadcrumb').innerHTML = `<span style="color:var(--text-3);cursor:pointer;" onclick="switchView('apps')">应用中心</span> <span style="color:var(--text-3);">/</span> <span style="color:var(--text-3);cursor:pointer;" onclick="switchView('plans')">360全景</span> <span style="color:var(--text-3);">/</span> <span>${state.currentPlan.name}</span>`;
  } else if (view === 'plans') {
    $('breadcrumb').innerHTML = `<span style="color:var(--text-3);cursor:pointer;" onclick="switchView('apps')">应用中心</span> <span style="color:var(--text-3);">/</span> <span>360全景</span>`;
  } else {
    $('breadcrumb').innerHTML = `<span>${names[view] || view}</span>`;
  }
  // 加载数据
  if (view === 'dashboard') loadDashboard();
  if (view === 'apps') renderApps();
  if (view === 'plans') loadPlans();
  if (view === 'scenes') loadScenes();
  if (view === 'orders') loadOrders();
  if (view === 'members') loadMembers();
  if (view === 'settings') loadSettings();
}
window.switchView = switchView;

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => switchView(item.dataset.nav));
});

// ===== 侧边栏折叠 =====
$('sidebar-toggle').addEventListener('click', () => {
  $('sidebar').classList.toggle('collapsed');
});

// ===== 用户下拉菜单 =====
$('user-avatar-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('user-dropdown').classList.toggle('hidden');
});
document.addEventListener('click', () => $('user-dropdown').classList.add('hidden'));

// ===== 工作台 =====
async function loadDashboard() {
  try {
    const data = await api('/dashboard');
    const { stats, recentScenes, recentOrders } = data;
    $('dashboard-stats').innerHTML = `
      <div class="stat-card"><div class="stat-label">方案总数</div><div class="stat-value">${stats.planCount}</div></div>
      <div class="stat-card"><div class="stat-label">场景总数</div><div class="stat-value">${stats.sceneCount}</div></div>
      <div class="stat-card"><div class="stat-label">团队成员</div><div class="stat-value">${stats.memberCount}</div></div>
      <div class="stat-card"><div class="stat-label">累计消费</div><div class="stat-value">¥${Number(stats.totalAmount).toFixed(2)}<span class="unit">元</span></div></div>
    `;
    // 最近场景
    if (recentScenes.length) {
      $('recent-scenes').innerHTML = recentScenes.map((s) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-light);">
          <span style="font-size:14px;">${s.title || '未命名场景'}</span>
          <span style="font-size:12px;color:var(--text-3);">${s.createdAt?.substring(0, 10) || ''}</span>
        </div>
      `).join('');
    } else {
      $('recent-scenes').innerHTML = '<div class="empty-state" style="padding:24px;"><p>暂无场景</p></div>';
    }
    // 最近订单
    if (recentOrders.length) {
      $('recent-orders').innerHTML = recentOrders.map((o) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-light);">
          <div><div style="font-size:14px;">${o.title}</div><div style="font-size:12px;color:var(--text-3);">${o.orderNo}</div></div>
          <span class="tag ${o.status === 'paid' ? 'tag-success' : 'tag-default'}">${o.status === 'paid' ? '已支付' : '待支付'}</span>
        </div>
      `).join('');
    } else {
      $('recent-orders').innerHTML = '<div class="empty-state" style="padding:24px;"><p>暂无订单</p></div>';
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ===== 我的方案 =====
// ===== 应用中心 =====
const SOLUTION_META = {
  panorama: {
    name: '360全景',
    desc: '沉浸式360度全景展示，支持手机端和Web端浏览',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="10" ry="4"/><path d="M12 2v20"/></svg>',
    color: '#165DFF',
    action: () => switchView('plans'),
  },
};

function renderApps() {
  const enabled = state.customer?.solutions || ['panorama'];
  const apps = enabled.map((code) => SOLUTION_META[code]).filter(Boolean);
  if (!apps.length) {
    $('apps-grid').innerHTML = '';
    $('apps-empty').classList.remove('hidden');
    return;
  }
  $('apps-empty').classList.add('hidden');
  $('apps-grid').innerHTML = apps.map((app, i) => `
    <div class="app-card" data-index="${i}" style="--app-color:${app.color}">
      <div class="app-icon">${app.icon}</div>
      <div class="app-info">
        <div class="app-name">${app.name}</div>
        <div class="app-desc">${app.desc}</div>
      </div>
      <button class="app-enter">进入应用</button>
    </div>
  `).join('');
  $('apps-grid').querySelectorAll('.app-card').forEach((card, i) => {
    card.querySelector('.app-enter').addEventListener('click', () => apps[i].action());
  });
}

$('btn-back-to-apps')?.addEventListener('click', () => switchView('apps'));

async function loadPlans() {
  try {
    const { plans } = await api('/plans');
    state.plans = plans;
    const isAdmin = state.user?.role === 'tenant_admin';
    if (plans.length) {
      $('plans-tbody').innerHTML = plans.map((p) => `
        <tr data-id="${p.id}">
          <td><a href="javascript:void(0)" class="plan-name-link" data-id="${p.id}" style="color:var(--brand);font-weight:500;">${p.name}</a></td>
          <td>${p.sceneCount || 0}</td>
          <td><span class="tag ${p.shareEnabled ? 'tag-success' : 'tag-default'}">${p.shareEnabled ? '已分享' : '未分享'}</span></td>
          <td style="color:var(--text-3);">${p.createdAt?.substring(0, 10) || ''}</td>
          <td>
            <div style="display:flex;gap:8px;">
              <button class="btn-ghost btn-sm act-enter-scenes" data-id="${p.id}">管理场景</button>
              ${isAdmin ? `<button class="btn-ghost btn-sm act-edit-plan" data-id="${p.id}">编辑</button>` : ''}
              ${isAdmin ? `<button class="btn-ghost btn-sm act-del-plan" data-id="${p.id}" style="color:var(--danger);">删除</button>` : ''}
            </div>
          </td>
        </tr>
      `).join('');
      $('plans-empty').classList.add('hidden');
    } else {
      $('plans-tbody').innerHTML = '';
      $('plans-empty').classList.remove('hidden');
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ===== 方案 CRUD =====
let editingPlanId = null;

function openPlanDialog(plan) {
  editingPlanId = plan ? plan.id : null;
  $('plan-dialog-title').textContent = plan ? '编辑方案' : '新建方案';
  $('pf-id').value = plan ? plan.id : '';
  $('pf-name').value = plan ? plan.name : '';
  $('pf-desc').value = plan ? plan.description || '' : '';
  $('pf-cover').value = plan ? plan.coverPath || '' : '';
  $('pf-share').checked = plan ? plan.shareEnabled : true;
  $('plan-dialog').showModal();
}

$('btn-add-plan')?.addEventListener('click', () => openPlanDialog(null));
$('plan-cancel').addEventListener('click', () => $('plan-dialog').close());

$('plan-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const payload = {
      name: $('pf-name').value.trim(),
      description: $('pf-desc').value.trim(),
      coverPath: $('pf-cover').value.trim(),
      shareEnabled: $('pf-share').checked,
    };
    if (editingPlanId) {
      await api(`/plans/${editingPlanId}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('方案已更新');
    } else {
      await api('/plans', { method: 'POST', body: JSON.stringify(payload) });
      toast('方案已创建');
    }
    $('plan-dialog').close();
    loadPlans();
  } catch (err) {
    toast(err.message, 'error');
  }
});

// 方案列表点击事件
$('plans-tbody').addEventListener('click', (e) => {
  const id = Number(e.target.dataset.id || e.target.closest('[data-id]')?.dataset.id);
  if (!id) return;
  const plan = state.plans.find((p) => p.id === id);
  if (!plan) return;
  if (e.target.classList.contains('act-enter-scenes') || e.target.classList.contains('plan-name-link')) {
    state.currentPlan = plan;
    $('scenes-title').textContent = plan.name;
    $('scenes-desc').textContent = `管理「${plan.name}」下的全景场景`;
    switchView('scenes');
  } else if (e.target.classList.contains('act-edit-plan')) {
    openPlanDialog(plan);
  } else if (e.target.classList.contains('act-del-plan')) {
    showConfirm('删除方案', `确定删除方案「${plan.name}」？其下场景将归入默认方案。`, async () => {
      try {
        await api(`/plans/${id}`, { method: 'DELETE' });
        toast('方案已删除');
        loadPlans();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
});

// ===== 场景管理 =====
async function loadScenes() {
  if (!state.currentPlan) return;
  try {
    const { scenes } = await api(`/plans/${state.currentPlan.id}/scenes`);
    state.scenes = scenes;
    const isAdmin = state.user?.role === 'tenant_admin';
    if (scenes.length) {
      $('scenes-tbody').innerHTML = scenes.map((s) => `
        <tr data-id="${s.id}">
          <td>${s.title || '未命名场景'}</td>
          <td>${s.previewPath ? `<img src="${s.previewPath}" style="width:40px;height:24px;object-fit:cover;border-radius:4px;" />` : '<span style="color:var(--text-3);">—</span>'}</td>
          <td>${s.sortOrder || 0}</td>
          <td><span class="tag ${s.published ? 'tag-success' : 'tag-default'}">${s.published ? '已上架' : '未上架'}</span></td>
          <td style="color:var(--text-3);">${s.createdAt?.substring(0, 10) || ''}</td>
          <td>
            <div style="display:flex;gap:8px;">
              ${isAdmin ? `<button class="btn-ghost btn-sm act-edit-scene" data-id="${s.id}">编辑</button>` : ''}
              ${isAdmin ? `<button class="btn-ghost btn-sm act-del-scene" data-id="${s.id}" style="color:var(--danger);">删除</button>` : ''}
            </div>
          </td>
        </tr>
      `).join('');
      $('scenes-empty').classList.add('hidden');
    } else {
      $('scenes-tbody').innerHTML = '';
      $('scenes-empty').classList.remove('hidden');
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

$('btn-back-to-plans').addEventListener('click', () => switchView('plans'));

let editingSceneId = null;

// ===== 图片上传 =====
async function uploadSceneImage(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '上传失败');
  return data;
}

function resetUploadArea() {
  $('sf-upload-area').querySelector('.upload-placeholder').classList.remove('hidden');
  $('sf-upload-area').querySelector('.upload-progress').classList.add('hidden');
  $('sf-upload-area').querySelector('.upload-preview').classList.add('hidden');
  $('sf-file').value = '';
}

function showUploadPreview(url) {
  $('sf-upload-area').querySelector('.upload-placeholder').classList.add('hidden');
  $('sf-upload-area').querySelector('.upload-progress').classList.add('hidden');
  const preview = $('sf-upload-area').querySelector('.upload-preview');
  preview.classList.remove('hidden');
  $('sf-preview-img').src = url;
}

async function handleImageFile(file) {
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    toast('图片大小不能超过 50MB', 'error');
    return;
  }
  $('sf-upload-area').querySelector('.upload-placeholder').classList.add('hidden');
  $('sf-upload-area').querySelector('.upload-progress').classList.remove('hidden');
  $('sf-progress-fill').style.width = '10%';
  $('sf-progress-text').textContent = '上传中...';
  try {
    const result = await uploadSceneImage(file);
    $('sf-image').value = result.imagePath || result.url || '';
    if (result.previewPath) $('sf-preview').value = result.previewPath;
    showUploadPreview(result.imagePath || result.url);
    toast('上传成功');
  } catch (err) {
    toast(err.message, 'error');
    resetUploadArea();
  }
}

// 上传区域事件
$('sf-upload-area').addEventListener('click', (e) => {
  if (e.target.closest('.upload-remove')) return;
  $('sf-file').click();
});
$('sf-file').addEventListener('change', (e) => handleImageFile(e.target.files[0]));
$('sf-upload-area').addEventListener('dragover', (e) => {
  e.preventDefault();
  $('sf-upload-area').classList.add('dragover');
});
$('sf-upload-area').addEventListener('dragleave', () => {
  $('sf-upload-area').classList.remove('dragover');
});
$('sf-upload-area').addEventListener('drop', (e) => {
  e.preventDefault();
  $('sf-upload-area').classList.remove('dragover');
  handleImageFile(e.dataTransfer.files[0]);
});
$('sf-remove-img').addEventListener('click', (e) => {
  e.stopPropagation();
  $('sf-image').value = '';
  resetUploadArea();
});

function openSceneDialog(scene) {
  editingSceneId = scene ? scene.id : null;
  $('scene-dialog-title').textContent = scene ? '编辑场景' : '新建场景';
  $('sf-id').value = scene ? scene.id : '';
  $('sf-title').value = scene ? scene.title : '';
  $('sf-desc').value = scene ? scene.description || '' : '';
  $('sf-image').value = scene ? scene.imagePath || '' : '';
  $('sf-preview').value = scene ? scene.previewPath || '' : '';
  $('sf-sort').value = scene ? scene.sortOrder || 0 : 0;
  $('sf-published').checked = scene ? scene.published : true;
  resetUploadArea();
  if (scene?.imagePath) showUploadPreview(scene.imagePath);
  $('scene-dialog').showModal();
}

$('btn-add-scene')?.addEventListener('click', () => openSceneDialog(null));
$('scene-cancel').addEventListener('click', () => $('scene-dialog').close());

$('scene-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const imagePath = $('sf-image').value.trim();
  if (!imagePath) {
    toast('请上传或输入全景图', 'error');
    return;
  }
  try {
    const payload = {
      planId: state.currentPlan.id,
      title: $('sf-title').value.trim(),
      description: $('sf-desc').value.trim(),
      imagePath,
      previewPath: $('sf-preview').value.trim(),
      sortOrder: Number($('sf-sort').value) || 0,
      published: $('sf-published').checked,
    };
    if (editingSceneId) {
      await api(`/scenes/${editingSceneId}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('场景已更新');
    } else {
      await api('/scenes', { method: 'POST', body: JSON.stringify(payload) });
      toast('场景已创建');
    }
    $('scene-dialog').close();
    loadScenes();
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('scenes-tbody').addEventListener('click', (e) => {
  const id = Number(e.target.dataset.id);
  if (!id) return;
  const scene = state.scenes.find((s) => s.id === id);
  if (!scene) return;
  if (e.target.classList.contains('act-edit-scene')) {
    openSceneDialog(scene);
  } else if (e.target.classList.contains('act-del-scene')) {
    showConfirm('删除场景', `确定删除场景「${scene.title || '未命名'}」？此操作不可恢复。`, async () => {
      try {
        await api(`/scenes/${id}`, { method: 'DELETE' });
        toast('场景已删除');
        loadScenes();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
});
async function loadOrders() {
  try {
    const { orders } = await api('/orders');
    if (orders.length) {
      $('orders-tbody').innerHTML = orders.map((o) => `
        <tr>
          <td style="font-family:monospace;font-size:13px;">${o.orderNo}</td>
          <td>${o.title}</td>
          <td>¥${Number(o.amount).toFixed(2)}</td>
          <td><span class="tag ${o.status === 'paid' ? 'tag-success' : o.status === 'pending' ? 'tag-warning' : 'tag-default'}">${o.status === 'paid' ? '已支付' : o.status === 'pending' ? '待支付' : o.status}</span></td>
          <td style="color:var(--text-3);">${o.createdAt?.substring(0, 10) || ''}</td>
        </tr>
      `).join('');
      $('orders-empty').classList.add('hidden');
    } else {
      $('orders-tbody').innerHTML = '';
      $('orders-empty').classList.remove('hidden');
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ===== 成员管理 =====
async function loadMembers() {
  try {
    const { members } = await api('/members');
    if (members.length) {
      $('members-tbody').innerHTML = members.map((m) => `
        <tr>
          <td>${m.username}</td>
          <td>${m.phone || '-'}</td>
          <td><span class="tag ${m.role === 'tenant_admin' ? 'tag-success' : 'tag-default'}">${m.role === 'tenant_admin' ? '管理员' : '普通成员'}</span></td>
          <td><span class="tag ${m.status === 'active' ? 'tag-success' : 'tag-danger'}">${m.status === 'active' ? '正常' : '已停用'}</span></td>
          <td>
            ${m.id !== state.user.id ? `<button class="btn-ghost btn-sm" onclick="deleteMember(${m.id}, '${m.username}')">移除</button>` : '<span style="color:var(--text-3);font-size:13px;">当前账号</span>'}
          </td>
        </tr>
      `).join('');
      $('members-empty').classList.add('hidden');
    } else {
      $('members-tbody').innerHTML = '';
      $('members-empty').classList.remove('hidden');
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

// 添加成员弹窗
$('btn-add-member').addEventListener('click', () => {
  $('member-form').reset();
  $('member-dialog').showModal();
});
$('member-cancel').addEventListener('click', () => $('member-dialog').close());
$('member-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/members', {
      method: 'POST',
      body: JSON.stringify({
        username: $('m-username').value.trim(),
        password: $('m-password').value,
        phone: $('m-phone').value.trim() || null,
        role: $('m-role').value,
      }),
    });
    $('member-dialog').close();
    toast('成员添加成功');
    loadMembers();
  } catch (err) {
    toast(err.message, 'error');
  }
});

// 删除成员（二次确认）
window.deleteMember = function (id, username) {
  showConfirm('移除成员', `确定要移除成员「${username}」吗？移除后该账号将无法登录。`, async () => {
    try {
      await api(`/members/${id}`, { method: 'DELETE' });
      toast('成员已移除');
      loadMembers();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
};

// ===== 确认弹窗 =====
let confirmCallback = null;
function showConfirm(title, message, callback) {
  $('confirm-title').textContent = title;
  $('confirm-message').textContent = message;
  confirmCallback = callback;
  $('confirm-dialog').showModal();
}
$('confirm-cancel').addEventListener('click', () => $('confirm-dialog').close());
$('confirm-form').addEventListener('submit', (e) => {
  e.preventDefault();
  $('confirm-dialog').close();
  if (confirmCallback) confirmCallback();
});

// ===== 账号设置 =====
async function loadSettings() {
  $('settings-username').value = state.user.username;
  $('settings-phone').value = state.user.phone || '';
}

$('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { user } = await api('/profile', {
      method: 'PUT',
      body: JSON.stringify({ phone: $('settings-phone').value.trim() || null }),
    });
    state.user = user;
    toast('个人信息已更新');
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const oldPwd = $('old-password').value;
  const newPwd = $('new-password').value;
  const confirmPwd = $('confirm-password').value;
  if (newPwd !== confirmPwd) {
    toast('两次输入的新密码不一致', 'error');
    return;
  }
  try {
    await api('/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
    });
    $('password-form').reset();
    toast('密码修改成功');
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ===== 存储设置 =====
function toggleStorageFields() {
  const mode = $('storage-mode').value;
  $('storage-independent-fields').classList.toggle('hidden', mode !== 'independent');
}
function toggleStorageProvider() {
  const provider = $('storage-provider').value;
  $('storage-qiniu-fields').classList.toggle('hidden', provider !== 'qiniu');
  $('storage-aliyun-fields').classList.toggle('hidden', provider !== 'aliyun');
}
$('storage-mode').addEventListener('change', toggleStorageFields);
$('storage-provider').addEventListener('change', toggleStorageProvider);
$('storage-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const mode = $('storage-mode').value;
  const provider = $('storage-provider').value;
  let storageConfig = { mode, provider };
  if (mode === 'independent') {
    if (provider === 'qiniu') {
      storageConfig.qiniu = {
        accessKey: $('storage-qiniu-ak').value.trim(),
        secretKey: $('storage-qiniu-sk').value.trim(),
        zone: $('storage-qiniu-zone').value,
        bucket: $('storage-qiniu-bucket').value.trim(),
        folder: $('storage-qiniu-folder').value.trim(),
        cdnDomain: $('storage-qiniu-domain').value.trim(),
      };
    } else {
      storageConfig.aliyun = {
        accessKeyId: $('storage-aliyun-ak').value.trim(),
        accessKeySecret: $('storage-aliyun-sk').value.trim(),
        region: $('storage-aliyun-region').value.trim(),
        bucket: $('storage-aliyun-bucket').value.trim(),
        folder: $('storage-aliyun-folder').value.trim(),
        cdnDomain: $('storage-aliyun-domain').value.trim(),
      };
    }
  }
  try {
    await api('/config', {
      method: 'PUT',
      body: JSON.stringify({ storage: storageConfig }),
    });
    toast('存储设置已保存');
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ===== 短信配置 =====
function toggleSmsFields() {
  const mode = $('sms-mode').value;
  $('sms-independent-fields').classList.toggle('hidden', mode !== 'independent');
}
$('sms-mode').addEventListener('change', toggleSmsFields);
$('sms-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const mode = $('sms-mode').value;
  const config = mode === 'independent' ? {
    provider: $('sms-provider').value,
    accessKey: $('sms-ak').value.trim(),
    secretKey: $('sms-sk').value.trim(),
    signName: $('sms-sign').value.trim(),
    templateCode: $('sms-template').value.trim(),
  } : {};
  try {
    await api('/config', {
      method: 'PUT',
      body: JSON.stringify({ sms: { mode, ...config } }),
    });
    toast('短信配置已保存');
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ===== 初始化 =====
(async function init() {
  // 先加载系统设置（名称、Logo），登录页也需要
  await loadPublicSettings();
  if (state.token) {
    try {
      await loadProfile();
      showApp();
    } catch {
      logout();
    }
  }
})();
