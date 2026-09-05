import {
  login,
  sendSmsCode,
  loginByPhone,
  getCurrentUser,
  fetchAdminScenes,
  createScene,
  updateScene,
  deleteScene,
  uploadImage,
  fetchStorageConfig,
  saveStorageConfig,
  testStorage,
  fetchAdminCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  uploadCustomerLogo,
  fetchAdminPlans,
  createPlan,
  updatePlan,
  deletePlan,
  uploadPlanCover,
  fetchAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  resetUserPassword,
  fetchAdminSettings,
  saveAdminSettings,
  fetchOperationLogs,
} from '../api.js';

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'panorama_token';

const loginView = $('login-view');
const adminView = $('admin-view');
const adminError = $('admin-error');
const loginError = $('login-error');

// 三层状态
const state = {
  view: 'customers', // 'customers' | 'plans' | 'scenes'
  currentCustomer: null,
  currentPlan: null,
};
let customers = [];
let plans = [];
let scenes = [];
let users = [];
let currentUser = null;
let customerFilter = 'all'; // all | active | expiring | expired | disabled
let customerSearch = '';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
    await boot();
  } catch (err) {
    showError(loginError, err.message);
  }
});

// 登录 tab 切换
document.querySelectorAll('.login-tabs .tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.login-tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
    const isPhone = tab.dataset.tab === 'phone';
    $('login-form').classList.toggle('hidden', isPhone);
    $('login-phone-form').classList.toggle('hidden', !isPhone);
    loginError.classList.add('hidden');
  });
});

// 发送登录验证码（60秒倒计时）
let smsCountdown = 0;
$('btn-send-login-code').addEventListener('click', async () => {
  const phone = $('login-phone').value.trim();
  if (!/^1\d{10}$/.test(phone)) {
    showError(loginError, '请输入正确的手机号');
    return;
  }
  const btn = $('btn-send-login-code');
  btn.disabled = true;
  try {
    const result = await sendSmsCode(phone, 'login');
    if (result.devCode) {
      showError(loginError, `开发环境验证码：${result.devCode}`, false);
    } else {
      showError(loginError, '验证码已发送', false);
    }
    smsCountdown = 60;
    const timer = setInterval(() => {
      smsCountdown--;
      if (smsCountdown <= 0) {
        clearInterval(timer);
        btn.textContent = '获取验证码';
        btn.disabled = false;
      } else {
        btn.textContent = `${smsCountdown}s 后重发`;
      }
    }, 1000);
  } catch (err) {
    showError(loginError, err.message);
    btn.disabled = false;
  }
});

// 手机号验证码登录
$('login-phone-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  try {
    const { token } = await loginByPhone($('login-phone').value.trim(), $('login-code').value.trim());
    localStorage.setItem(TOKEN_KEY, token);
    renderAdmin();
    await boot();
  } catch (err) {
    // 未注册时提示自动注册
    if (err.message.includes('尚未注册')) {
      showError(loginError, '该手机号未注册，请先在账号密码页注册或联系管理员');
    } else {
      showError(loginError, err.message);
    }
  }
});

$('btn-logout').addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  renderLogin();
});

// ---------- 侧边栏导航 ----------
document.querySelectorAll('.sidebar-nav .nav-item').forEach((t) => {
  t.addEventListener('click', () => {
    if (t.id === 'btn-logout') return;
    document.querySelectorAll('.sidebar-nav .nav-item').forEach((x) => x.classList.toggle('active', x === t));
    if (t.dataset.nav === 'customers') {
      state.view = 'customers';
      state.currentCustomer = null;
      state.currentPlan = null;
      render();
    } else if (t.dataset.nav === 'users') {
      state.view = 'users';
      render();
    } else if (t.dataset.nav === 'storage') {
      state.view = 'storage';
      render();
      loadStorageIntoForm();
    } else if (t.dataset.nav === 'dashboard') {
      state.view = 'dashboard';
      render();
      loadDashboard();
    } else if (t.dataset.nav === 'logs') {
      state.view = 'logs';
      render();
      loadLogs();
    } else if (t.dataset.nav === 'settings-basic') {
      state.view = 'settings-basic';
      render();
      loadSettingsBasic();
    } else if (t.dataset.nav === 'settings-sms') {
      state.view = 'settings-sms';
      render();
      loadSettingsSms();
    } else if (t.dataset.nav === 'settings-payment') {
      state.view = 'settings-payment';
      render();
      loadSettingsPayment();
    } else if (t.dataset.nav === 'settings-security') {
      state.view = 'settings-security';
      render();
      loadSettingsSecurity();
    }
  });
});

// ---------- 面包屑 ----------
function renderBreadcrumb() {
  const bc = $('breadcrumb');
  const parts = [];
  parts.push(`<span class="crumb clickable" data-nav="customers">客户项目</span>`);
  if (state.currentCustomer) {
    parts.push(`<span class="sep">/</span>`);
    if (state.view === 'customers') {
      parts.push(`<span class="crumb">${esc(state.currentCustomer.customerName)}</span>`);
    } else {
      parts.push(`<span class="crumb clickable" data-customer="${state.currentCustomer.id}">${esc(state.currentCustomer.customerName)}</span>`);
    }
  }
  if (state.currentPlan && state.view === 'scenes') {
    parts.push(`<span class="sep">/</span>`);
    parts.push(`<span class="crumb">${esc(state.currentPlan.name)}</span>`);
  }
  bc.innerHTML = parts.join('');
  bc.querySelectorAll('.clickable').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.dataset.nav === 'customers') {
        state.view = 'customers';
        state.currentCustomer = null;
        state.currentPlan = null;
      } else if (el.dataset.customer) {
        state.view = 'plans';
        state.currentCustomer = customers.find((c) => c.id === Number(el.dataset.customer)) || state.currentCustomer;
        state.currentPlan = null;
      }
      render();
    });
  });
}

// ---------- 视图切换 ----------
function render() {
  $('view-customers').classList.toggle('hidden', state.view !== 'customers');
  $('view-plans').classList.toggle('hidden', state.view !== 'plans');
  $('view-scenes').classList.toggle('hidden', state.view !== 'scenes');
  $('view-users').classList.toggle('hidden', state.view !== 'users');
  $('view-storage').classList.toggle('hidden', state.view !== 'storage');
  $('view-dashboard').classList.toggle('hidden', state.view !== 'dashboard');
  $('view-logs').classList.toggle('hidden', state.view !== 'logs');
  $('view-settings-basic').classList.toggle('hidden', state.view !== 'settings-basic');
  $('view-settings-sms').classList.toggle('hidden', state.view !== 'settings-sms');
  $('view-settings-payment').classList.toggle('hidden', state.view !== 'settings-payment');
  $('view-settings-security').classList.toggle('hidden', state.view !== 'settings-security');
  renderBreadcrumb();
  if (state.view === 'customers') renderCustomers();
  else if (state.view === 'plans') renderPlans();
  else if (state.view === 'scenes') renderScenes();
  else if (state.view === 'users') renderUsers();
}

$('btn-back-from-plans').addEventListener('click', () => {
  state.view = 'customers';
  state.currentCustomer = null;
  render();
});
$('btn-back-from-scenes').addEventListener('click', () => {
  state.view = 'plans';
  state.currentPlan = null;
  render();
});

// ---------- 客户项目卡片 ----------
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const end = new Date(dateStr + 'T23:59:59');
  const now = new Date();
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

function renderCustomers() {
  // 计算各 Tab 数量
  const counts = { all: customers.length, active: 0, expiring: 0, expired: 0, disabled: 0 };
  for (const c of customers) {
    const days = daysUntil(c.validUntil);
    if (c.status === 'disabled') counts.disabled++;
    else if (days !== null && days < 0) counts.expired++;
    else if (days !== null && days <= 30) counts.expiring++;
    else counts.active++;
  }
  $('cnt-all').textContent = counts.all;
  $('cnt-active').textContent = counts.active;
  $('cnt-expiring').textContent = counts.expiring;
  $('cnt-expired').textContent = counts.expired;
  $('cnt-disabled').textContent = counts.disabled;

  // 筛选
  let list = customers.filter((c) => {
    const days = daysUntil(c.validUntil);
    const expired = days !== null && days < 0;
    if (customerSearch && !c.customerName.toLowerCase().includes(customerSearch.toLowerCase())) return false;
    if (customerFilter === 'active') return c.status !== 'disabled' && !expired;
    if (customerFilter === 'expiring') return c.status !== 'disabled' && days !== null && days >= 0 && days <= 30;
    if (customerFilter === 'expired') return expired;
    if (customerFilter === 'disabled') return c.status === 'disabled';
    return true;
  });

  const grid = $('customer-grid');
  if (!list.length) {
    grid.innerHTML = '<p class="muted" style="padding:40px;text-align:center;">暂无符合条件的客户项目</p>';
    return;
  }
  // 置顶优先，然后按 ID
  list.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || a.id - b.id);

  grid.innerHTML = list
    .map((c) => {
      const days = daysUntil(c.validUntil);
      const expired = days !== null && days < 0;
      const disabled = c.status === 'disabled';
      const daysBadge = days === null
        ? '<div class="c-days-badge forever">永久</div>'
        : `<div class="c-days-badge ${expired || disabled ? 'expired' : ''}">${expired ? '已过期' : disabled ? '已停用' : `剩${days}天`}</div>`;
      const initial = c.customerName ? c.customerName.charAt(0) : '?';
      const logoHtml = c.logoPath
        ? `<img src="${esc(c.logoPath)}" alt="" />`
        : `<span class="c-logo-initial">${initial}</span>`;
      const validText = c.validUntil ? `${c.validFrom || '—'} ~ ${c.validUntil}` : '永久有效';
      const statusText = expired ? '已过期' : disabled ? '已停用' : '使用中';
      const statusCls = expired || disabled ? 'c-status-bad' : 'c-status-ok';
      return `
      <div class="c-card ${expired || disabled ? 'c-card-muted' : ''}" data-id="${c.id}">
        <div class="c-card-head">
          <div class="c-logo-wrap">${logoHtml}${daysBadge}</div>
          <div class="c-card-title">
            <div class="c-name-row">
              <span class="c-name">${esc(c.customerName)}</span>
              ${c.isPinned ? '<span class="c-pin-badge">置顶</span>' : ''}
            </div>
            <div class="c-sub-meta">ID: ${c.id} &nbsp;|&nbsp; ${c.planCount ?? 0} 个方案 &nbsp;|&nbsp; ${c.sceneCount ?? 0} 个场景</div>
          </div>
        </div>
        <div class="c-card-body">
          <div class="c-info-col">
            <div class="c-info-row"><span class="c-info-label">方案数</span><span class="c-info-val">${c.planCount ?? 0}</span></div>
            <div class="c-info-row"><span class="c-info-label">场景数</span><span class="c-info-val">${c.sceneCount ?? 0}</span></div>
            <div class="c-info-row"><span class="c-info-label">状态</span><span class="${statusCls}">${statusText}</span></div>
          </div>
          <div class="c-info-col">
            <div class="c-info-row"><span class="c-info-label">有效期</span><span class="c-info-val">${validText}</span></div>
            <div class="c-info-row"><span class="c-info-label">备注</span><span class="c-info-val c-remark">${esc(c.remark || '—')}</span></div>
          </div>
        </div>
        <div class="c-card-footer">
          <button class="c-footer-btn act-enter">进入</button>
          <button class="c-footer-btn act-edit">编辑</button>
          <button class="c-footer-btn act-renew">续费</button>
          <button class="c-footer-btn act-del del">删除</button>
        </div>
      </div>`;
    })
    .join('');
}

$('customer-grid').addEventListener('click', async (e) => {
  const card = e.target.closest('.customer-card');
  if (!card) return;
  const id = Number(card.dataset.id);
  const customer = customers.find((c) => c.id === id);
  if (!customer) return;

  if (e.target.classList.contains('act-edit')) {
    openCustomerDialog(customer);
  } else if (e.target.classList.contains('act-del')) {
    const msg = `确定删除客户项目「${customer.customerName}」？其下 ${customer.planCount ?? 0} 个方案将自动归入默认客户。`;
    if (!window.confirm(msg)) return;
    try {
      await deleteCustomer(id);
      await loadCustomers();
      render();
    } catch (err) {
      showError(adminError, err.message);
    }
  } else if (e.target.classList.contains('act-renew')) {
    openCustomerDialog(customer, true);
  } else {
    // 进入该客户的方案列表
    state.view = 'plans';
    state.currentCustomer = customer;
    state.currentPlan = null;
    render();
  }
});

// 客户 Tab 筛选
document.querySelectorAll('.c-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.c-tab').forEach((t) => t.classList.toggle('active', t === tab));
    customerFilter = tab.dataset.filter;
    renderCustomers();
  });
});

// 客户搜索
$('customer-search')?.addEventListener('input', (e) => {
  customerSearch = e.target.value.trim();
  renderCustomers();
});

// ---------- 客户编辑弹窗 ----------
let editingCustomerId = null;
const customerDialog = $('customer-dialog');

function openCustomerDialog(customer, renewOnly = false) {
  editingCustomerId = customer ? customer.id : null;
  $('customer-dialog-title').textContent = renewOnly ? '续费 / 修改有效期' : customer ? '编辑客户项目' : '新建客户项目';
  $('cf-id').value = customer ? customer.id : '';
  $('cf-name').value = customer ? customer.customerName : '';
  $('cf-desc').value = customer ? customer.description || '' : '';
  $('cf-valid-from').value = customer ? customer.validFrom || '' : '';
  $('cf-valid-until').value = customer ? customer.validUntil || '' : '';
  $('cf-pinned').checked = customer ? customer.isPinned : false;
  $('cf-status').value = customer ? customer.status : 'active';
  $('cf-file').value = '';
  $('cf-upload-state').textContent = customer && customer.logoPath ? '已有 Logo，可选择新图替换' : '';
  const prev = $('cf-preview');
  if (customer && customer.logoPath) {
    prev.src = customer.logoPath;
    $('cf-preview-wrap').classList.remove('hidden');
  } else {
    $('cf-preview-wrap').classList.add('hidden');
  }
  if (renewOnly) {
    $('cf-name').focus();
  }
  customerDialog.showModal();
}

$('btn-add-customer').addEventListener('click', () => openCustomerDialog(null));
$('customer-dialog-cancel').addEventListener('click', () => customerDialog.close());

$('cf-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $('cf-preview').src = reader.result;
    $('cf-preview-wrap').classList.remove('hidden');
    $('cf-upload-state').textContent = `已选择：${file.name}`;
  };
  reader.readAsDataURL(file);
});

$('customer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = $('customer-form').querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    let logoPath = '';
    const fileInput = $('cf-file');
    if (fileInput.files.length) {
      $('cf-upload-state').textContent = 'Logo 上传中…';
      const uploaded = await uploadCustomerLogo(fileInput.files[0]);
      logoPath = uploaded.logoPath;
    }
    const payload = {
      customerName: $('cf-name').value.trim(),
      description: $('cf-desc').value.trim(),
      validFrom: $('cf-valid-from').value,
      validUntil: $('cf-valid-until').value,
      isPinned: $('cf-pinned').checked,
      status: $('cf-status').value,
    };
    if (logoPath) payload.logoPath = logoPath;
    if (editingCustomerId) {
      await updateCustomer(editingCustomerId, payload);
    } else {
      await createCustomer(payload);
    }
    customerDialog.close();
    await loadCustomers();
    render();
  } catch (err) {
    showError(adminError, err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- 方案列表 ----------
function renderPlans() {
  const list = state.currentCustomer
    ? plans.filter((p) => p.projectId === state.currentCustomer.id)
    : plans;
  $('plan-count').textContent = `共 ${list.length} 个方案`;
  $('plan-tbody').innerHTML = list
    .map(
      (p, i) => `
      <tr data-id="${p.id}">
        <td>
          ${p.coverPath ? `<img class="thumb" src="${esc(p.coverPath)}" alt="" loading="lazy" />` : '<div class="thumb-placeholder">—</div>'}
        </td>
        <td>
          <div class="title-cell">${esc(p.name)}</div>
          ${p.description ? `<div class="desc-cell">${esc(p.description)}</div>` : ''}
        </td>
        <td>${p.sceneCount ?? 0}</td>
        <td><span class="badge ${p.shareEnabled ? 'badge-on' : 'badge-off'}">${p.shareEnabled ? '已开启' : '关闭'}</span></td>
        <td>${p.sortOrder}</td>
        <td><span class="badge ${p.published ? 'badge-on' : 'badge-off'}">${p.published ? '已上架' : '已下架'}</span></td>
        <td>
          <div class="op-cell">
            <button class="btn btn-sm btn-primary act-enter">管理场景</button>
            <button class="btn btn-sm btn-ghost act-edit">编辑</button>
            <button class="btn btn-sm btn-ghost act-share">分享</button>
            <button class="btn btn-sm btn-ghost act-toggle">${p.published ? '下架' : '上架'}</button>
            <button class="btn btn-sm btn-danger act-del">删除</button>
          </div>
        </td>
      </tr>`
    )
    .join('');
}

$('plan-tbody').addEventListener('click', async (e) => {
  const row = e.target.closest('tr');
  if (!row) return;
  const id = Number(row.dataset.id);
  const plan = plans.find((p) => p.id === id);
  if (!plan) return;

  if (e.target.classList.contains('act-enter')) {
    state.view = 'scenes';
    state.currentPlan = plan;
    render();
  } else if (e.target.classList.contains('act-edit')) {
    openPlanDialog(plan);
  } else if (e.target.classList.contains('act-share')) {
    openShareDialog({ type: 'project', project: plan });
  } else if (e.target.classList.contains('act-toggle')) {
    try {
      await updatePlan(id, { ...plan, published: !plan.published });
      await loadPlans();
      render();
    } catch (err) {
      showError(adminError, err.message);
    }
  } else if (e.target.classList.contains('act-del')) {
    const msg = (plan.sceneCount ?? 0) > 0
      ? `确定删除方案「${plan.name}」？其下 ${plan.sceneCount} 个场景将自动归入默认方案。`
      : `确定删除方案「${plan.name}」？`;
    if (!window.confirm(msg)) return;
    try {
      await deletePlan(id);
      await loadPlans();
      render();
    } catch (err) {
      showError(adminError, err.message);
    }
  }
});

// ---------- 方案编辑弹窗 ----------
let editingPlanId = null;
const planDialog = $('plan-dialog');

function fillCustomerOptions(selectedId) {
  const sel = $('plf-customer');
  sel.innerHTML = '';
  for (const c of customers) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.customerName;
    if (c.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  }
}

function openPlanDialog(plan) {
  editingPlanId = plan ? plan.id : null;
  $('plan-dialog-title').textContent = plan ? '编辑方案' : '新建方案';
  $('plf-id').value = plan ? plan.id : '';
  $('plf-name').value = plan ? plan.name : '';
  $('plf-desc').value = plan ? plan.description : '';
  $('plf-sort').value = plan ? plan.sortOrder : 0;
  $('plf-published').checked = plan ? plan.published : true;
  $('plf-share').checked = plan ? plan.shareEnabled : true;
  $('plf-file').value = '';
  fillCustomerOptions(plan ? plan.projectId : (state.currentCustomer ? state.currentCustomer.id : null));
  $('plf-upload-state').textContent = plan && plan.coverPath ? '已有一张封面，可选择新图替换' : '';
  const prev = $('plf-preview');
  if (plan && plan.coverPath) {
    prev.src = plan.coverPath;
    $('plf-preview-wrap').classList.remove('hidden');
  } else {
    $('plf-preview-wrap').classList.add('hidden');
  }
  planDialog.showModal();
}

$('btn-add-plan').addEventListener('click', () => openPlanDialog(null));
$('plan-dialog-cancel').addEventListener('click', () => planDialog.close());

$('plf-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $('plf-preview').src = reader.result;
    $('plf-preview-wrap').classList.remove('hidden');
    $('plf-upload-state').textContent = `已选择：${file.name}`;
  };
  reader.readAsDataURL(file);
});

$('plan-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = $('plan-form').querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    let coverPath = '';
    const fileInput = $('plf-file');
    if (fileInput.files.length) {
      $('plf-upload-state').textContent = '封面上传中…';
      const uploaded = await uploadPlanCover(fileInput.files[0]);
      coverPath = uploaded.coverPath;
    }
    const payload = {
      name: $('plf-name').value.trim(),
      description: $('plf-desc').value.trim(),
      projectId: Number($('plf-customer').value),
      sortOrder: Number($('plf-sort').value) || 0,
      published: $('plf-published').checked,
      shareEnabled: $('plf-share').checked,
    };
    if (coverPath) payload.coverPath = coverPath;
    if (editingPlanId) {
      await updatePlan(editingPlanId, payload);
    } else {
      await createPlan(payload);
    }
    planDialog.close();
    await loadPlans();
    render();
  } catch (err) {
    showError(adminError, err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- 场景列表 ----------
function renderScenes() {
  const list = state.currentPlan
    ? scenes.filter((s) => s.planId === state.currentPlan.id)
    : scenes;
  $('scene-count').textContent = `共 ${list.length} 个场景`;
  $('scene-tbody').innerHTML = list
    .map(
      (s, i) => `
      <tr data-id="${s.id}">
        <td><img class="thumb" src="${esc(s.imagePath)}" alt="" loading="lazy" /></td>
        <td>
          <div class="title-cell">${esc(s.title)}</div>
          ${s.description ? `<div class="desc-cell">${esc(s.description)}</div>` : ''}
        </td>
        <td>${s.shareEnabled ? '<span class="badge badge-on">已开启</span>' : '<span class="badge badge-off">关闭</span>'}</td>
        <td>${s.sortOrder}</td>
        <td><span class="badge ${s.published ? 'badge-on' : 'badge-off'}">${s.published ? '已上架' : '已下架'}</span></td>
        <td>
          <div class="op-cell">
            <button class="btn btn-sm btn-ghost act-edit">编辑</button>
            <button class="btn btn-sm btn-ghost act-share">分享</button>
            <button class="btn btn-sm btn-ghost act-toggle">${s.published ? '下架' : '上架'}</button>
            <button class="btn btn-sm btn-ghost act-up" ${i === 0 ? 'disabled' : ''}>上移</button>
            <button class="btn btn-sm btn-ghost act-down" ${i === list.length - 1 ? 'disabled' : ''}>下移</button>
            <button class="btn btn-sm btn-danger act-del">删除</button>
          </div>
        </td>
      </tr>`
    )
    .join('');
}

async function swapSceneSort(i, j) {
  const list = state.currentPlan ? scenes.filter((s) => s.planId === state.currentPlan.id) : scenes;
  const a = list[i];
  const b = list[j];
  await updateScene(a.id, { ...a, sortOrder: b.sortOrder });
  await updateScene(b.id, { ...b, sortOrder: a.sortOrder });
  await loadScenes();
  render();
}

$('scene-tbody').addEventListener('click', async (e) => {
  const row = e.target.closest('tr');
  if (!row) return;
  const id = Number(row.dataset.id);
  const scene = scenes.find((s) => s.id === id);
  if (!scene) return;
  const list = state.currentPlan ? scenes.filter((s) => s.planId === state.currentPlan.id) : scenes;
  const idx = list.indexOf(scene);

  if (e.target.classList.contains('act-edit')) {
    openSceneDialog(scene);
  } else if (e.target.classList.contains('act-share')) {
    openShareDialog({ type: 'scene', scene });
  } else if (e.target.classList.contains('act-toggle')) {
    try {
      await updateScene(id, { ...scene, published: !scene.published });
      await loadScenes();
      render();
    } catch (err) {
      showError(adminError, err.message);
    }
  } else if (e.target.classList.contains('act-up')) {
    try { await swapSceneSort(idx, idx - 1); } catch (err) { showError(adminError, err.message); }
  } else if (e.target.classList.contains('act-down')) {
    try { await swapSceneSort(idx, idx + 1); } catch (err) { showError(adminError, err.message); }
  } else if (e.target.classList.contains('act-del')) {
    if (!window.confirm(`确定删除场景「${scene.title}」？该操作不可恢复。`)) return;
    try {
      await deleteScene(id);
      await loadScenes();
      render();
    } catch (err) {
      showError(adminError, err.message);
    }
  }
});

// ---------- 场景编辑弹窗 ----------
let editingSceneId = null;
const sceneDialog = $('scene-dialog');

function fillPlanOptions(selectedId) {
  const sel = $('f-plan');
  sel.innerHTML = '';
  const list = state.currentCustomer ? plans.filter((p) => p.projectId === state.currentCustomer.id) : plans;
  if (!list.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '默认方案';
    sel.appendChild(opt);
    return;
  }
  for (const p of list) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  }
}

function openSceneDialog(scene) {
  editingSceneId = scene ? scene.id : null;
  $('scene-dialog-title').textContent = scene ? '编辑场景' : '新增场景';
  $('f-id').value = scene ? scene.id : '';
  $('f-image-path').value = scene ? scene.imagePath : '';
  $('f-preview-path').value = scene ? scene.previewPath || '' : '';
  $('f-title').value = scene ? scene.title : '';
  $('f-desc').value = scene ? scene.description : '';
  $('f-sort').value = scene ? scene.sortOrder : 0;
  $('f-published').checked = scene ? scene.published : true;
  $('f-file').value = '';
  fillPlanOptions(scene ? scene.planId : (state.currentPlan ? state.currentPlan.id : null));
  $('f-share').checked = scene ? scene.shareEnabled : false;
  const shareLinkEl = $('f-share-link');
  if (scene && scene.shareEnabled && scene.shareToken) {
    shareLinkEl.textContent = `分享链接：${location.origin}/s/${scene.shareToken}`;
    shareLinkEl.classList.remove('hidden');
  } else {
    shareLinkEl.classList.add('hidden');
  }
  const preview = $('f-preview');
  if (scene) {
    preview.src = scene.previewPath || scene.imagePath;
    $('f-preview-wrap').classList.remove('hidden');
  } else {
    $('f-preview-wrap').classList.add('hidden');
  }
  $('f-upload-state').textContent = scene ? '已有一张全景图，可选择新图替换' : '';
  sceneDialog.showModal();
}

$('btn-add-scene').addEventListener('click', () => openSceneDialog(null));
$('scene-dialog-cancel').addEventListener('click', () => sceneDialog.close());

$('f-share').addEventListener('change', (e) => {
  const el = $('f-share-link');
  if (e.target.checked) {
    el.textContent = '保存后将生成独立分享链接';
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
});

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

$('scene-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = $('f-file');
  const uploadState = $('f-upload-state');
  let imagePath = $('f-image-path').value;
  let previewPath = $('f-preview-path').value;

  const submitBtn = $('scene-form').querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    if (fileInput.files.length) {
      const file = fileInput.files[0];
      const willTile = file.size >= 3 * 1024 * 1024;
      uploadState.textContent = willTile ? '上传中…大图将自动生成金字塔切片，请耐心等待' : '上传中…';
      const uploaded = await uploadImage(file);
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
      planId: $('f-plan').value ? Number($('f-plan').value) : null,
      shareEnabled: $('f-share').checked,
    };

    if (editingSceneId) {
      await updateScene(editingSceneId, payload);
    } else {
      await createScene(payload);
    }
    sceneDialog.close();
    await loadScenes();
    render();
  } catch (err) {
    showError(adminError, err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- 用户管理 ----------
const ROLE_LABELS = { admin: '管理员', manager: '运营', editor: '编辑', viewer: '只读' };

function renderUsers() {
  $('user-count').textContent = `共 ${users.length} 个用户`;
  $('user-tbody').innerHTML = users
    .map(
      (u) => `
      <tr data-id="${u.id}">
        <td>${u.id}</td>
        <td>${esc(u.username)}${u.id === currentUser?.id ? ' <span class="muted">(我)</span>' : ''}</td>
        <td>${esc(u.phone || '—')}</td>
        <td><span class="role-badge role-${u.role}">${ROLE_LABELS[u.role] || u.role}</span></td>
        <td><span class="badge ${u.status === 'active' ? 'badge-on' : 'badge-off'}">${u.status === 'active' ? '正常' : '停用'}</span></td>
        <td>${u.createdAt}</td>
        <td>
          <div class="op-cell">
            <button class="btn btn-sm btn-ghost act-edit">编辑</button>
            <button class="btn btn-sm btn-ghost act-reset">重置密码</button>
            <button class="btn btn-sm btn-ghost act-toggle">${u.status === 'active' ? '停用' : '启用'}</button>
            <button class="btn btn-sm btn-danger act-del">删除</button>
          </div>
        </td>
      </tr>`
    )
    .join('');
}

$('user-tbody').addEventListener('click', async (e) => {
  const row = e.target.closest('tr');
  if (!row) return;
  const id = Number(row.dataset.id);
  const user = users.find((u) => u.id === id);
  if (!user) return;

  if (e.target.classList.contains('act-edit')) {
    openUserDialog(user);
  } else if (e.target.classList.contains('act-reset')) {
    openResetPasswordDialog(user);
  } else if (e.target.classList.contains('act-toggle')) {
    try {
      await updateAdminUser(id, { status: user.status === 'active' ? 'disabled' : 'active' });
      await loadUsers();
      render();
    } catch (err) {
      showError(adminError, err.message);
    }
  } else if (e.target.classList.contains('act-del')) {
    if (!window.confirm(`确定删除用户「${user.username}」？`)) return;
    try {
      await deleteAdminUser(id);
      await loadUsers();
      render();
    } catch (err) {
      showError(adminError, err.message);
    }
  }
});

// 用户编辑弹窗
let editingUserId = null;
const userDialog = $('user-dialog');

function openUserDialog(user) {
  editingUserId = user ? user.id : null;
  $('user-dialog-title').textContent = user ? '编辑用户' : '新建用户';
  $('uf-id').value = user ? user.id : '';
  $('uf-username').value = user ? user.username : '';
  $('uf-phone').value = user ? user.phone : '';
  $('uf-role').value = user ? user.role : 'editor';
  $('uf-status').value = user ? user.status : 'active';
  $('uf-password').value = '';
  $('uf-password').required = !user;
  $('uf-password-field').style.opacity = user ? '0.6' : '1';
  userDialog.showModal();
}

$('btn-add-user').addEventListener('click', () => openUserDialog(null));
$('user-dialog-cancel').addEventListener('click', () => userDialog.close());

$('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = $('user-form').querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    const payload = {
      username: $('uf-username').value.trim(),
      phone: $('uf-phone').value.trim() || null,
      role: $('uf-role').value,
      status: $('uf-status').value,
    };
    const password = $('uf-password').value;
    if (editingUserId) {
      if (password) payload.password = password;
      await updateAdminUser(editingUserId, payload);
    } else {
      if (!password || password.length < 6) throw new Error('密码至少 6 位');
      payload.password = password;
      await createAdminUser(payload);
    }
    userDialog.close();
    await loadUsers();
    render();
  } catch (err) {
    showError(adminError, err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// 重置密码弹窗
const resetPasswordDialog = $('reset-password-dialog');
let resetUserId = null;

function openResetPasswordDialog(user) {
  resetUserId = user.id;
  $('rp-user-name').textContent = `为用户「${user.username}」设置新密码`;
  $('rp-password').value = '';
  resetPasswordDialog.showModal();
}

$('rp-cancel').addEventListener('click', () => resetPasswordDialog.close());

$('reset-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = $('reset-password-form').querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await resetUserPassword(resetUserId, $('rp-password').value);
    resetPasswordDialog.close();
    showError(adminError, '密码已重置', false);
  } catch (err) {
    showError(adminError, err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- 分享弹窗（方案级 / 场景级共用） ----------
const shareDialog = $('share-dialog');
let shareTarget = null;

function shareUrlOf(token) {
  return token ? `${location.origin}/s/${token}` : '';
}

function openShareDialog(target) {
  shareTarget = target;
  const kind = target.type === 'project' ? target.project : target.scene;
  $('share-title').textContent = target.type === 'project' ? `分享方案「${kind.name}」` : `分享场景「${kind.title}」`;
  const enabled = target.type === 'project' ? target.project.shareEnabled : target.scene.shareEnabled;
  const token = target.type === 'project' ? target.project.shareToken : target.scene.shareToken;
  const url = shareUrlOf(token);
  $('share-url').value = url;
  $('share-url').placeholder = enabled ? '' : '尚未开启分享，点击下方「开启分享」';
  if (enabled && token) {
    $('share-qr').src = `/api/s/${token}/qr?size=300`;
    $('share-qr').style.opacity = '1';
    $('share-qr-note').textContent = '手机扫码即可打开';
  } else {
    $('share-qr').removeAttribute('src');
    $('share-qr').style.opacity = '0.15';
    $('share-qr-note').textContent = '开启分享后可生成二维码';
  }
  $('share-toggle').textContent = enabled ? '关闭分享' : '开启分享';
  shareDialog.showModal();
}

$('share-close').addEventListener('click', () => shareDialog.close());

$('share-copy').addEventListener('click', async () => {
  const url = $('share-url').value;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    showError(adminError, '已复制分享链接');
  } catch {
    $('share-url').select();
    document.execCommand('copy');
    showError(adminError, '已复制分享链接');
  }
});

$('share-refresh').addEventListener('click', async () => {
  if (!shareTarget) return;
  if (!window.confirm('刷新令牌后，旧链接将立即失效，确定继续？')) return;
  try {
    if (shareTarget.type === 'project') {
      const { plan } = await updatePlan(shareTarget.project.id, { regenerateShareToken: true });
      shareTarget.project = plan;
      const idx = plans.findIndex((p) => p.id === plan.id);
      if (idx >= 0) plans[idx] = plan;
    } else {
      const { scene } = await updateScene(shareTarget.scene.id, { regenerateShareToken: true });
      shareTarget.scene = scene;
      const idx = scenes.findIndex((s) => s.id === scene.id);
      if (idx >= 0) scenes[idx] = scene;
    }
    openShareDialog(shareTarget);
    render();
  } catch (err) {
    showError(adminError, err.message);
  }
});

$('share-toggle').addEventListener('click', async () => {
  if (!shareTarget) return;
  try {
    if (shareTarget.type === 'project') {
      const { plan } = await updatePlan(shareTarget.project.id, { shareEnabled: !shareTarget.project.shareEnabled });
      shareTarget.project = plan;
      const idx = plans.findIndex((p) => p.id === plan.id);
      if (idx >= 0) plans[idx] = plan;
    } else {
      const { scene } = await updateScene(shareTarget.scene.id, { shareEnabled: !shareTarget.scene.shareEnabled });
      shareTarget.scene = scene;
      const idx = scenes.findIndex((s) => s.id === scene.id);
      if (idx >= 0) scenes[idx] = scene;
    }
    openShareDialog(shareTarget);
    render();
  } catch (err) {
    showError(adminError, err.message);
  }
});

// ---------- 存储设置 ----------
const storageMsg = $('s-msg');
const FIELD_MAP = {
  'access-key': 'accessKey',
  'secret-key': 'secretKey',
  bucket: 'bucket',
  region: 'region',
  zone: 'zone',
  folder: 'folder',
  'cdn-domain': 'cdnDomain',
};
const PANE_FIELDS = {
  local: [],
  oss: ['access-key', 'secret-key', 'region', 'bucket', 'folder', 'cdn-domain'],
  qiniu: ['access-key', 'secret-key', 'zone', 'bucket', 'folder', 'cdn-domain'],
};
let activeProvider = 'local';

function showStorageMsg(msg, isError = true) {
  storageMsg.textContent = msg;
  storageMsg.style.color = isError ? 'var(--danger)' : '#189a56';
  storageMsg.classList.remove('hidden');
  setTimeout(() => storageMsg.classList.add('hidden'), 4000);
}

function switchTab(provider) {
  activeProvider = provider;
  document.querySelectorAll('.storage-tabs .tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.provider === provider);
  });
  document.querySelectorAll('.storage-pane').forEach((p) => {
    p.hidden = p.id !== `storage-pane-${provider}`;
  });
  storageMsg.classList.add('hidden');
}

function currentProviderConfig() {
  const cfg = { provider: activeProvider };
  for (const kebab of PANE_FIELDS[activeProvider]) {
    const el = $(`${activeProvider}-${kebab}`);
    cfg[FIELD_MAP[kebab]] = el ? el.value.trim() : '';
  }
  return cfg;
}

async function loadStorageIntoForm() {
  storageMsg.classList.add('hidden');
  try {
    const { config: cfg } = await fetchStorageConfig();
    for (const provider of ['oss', 'qiniu']) {
      const saved = cfg.providers[provider] || {};
      for (const kebab of PANE_FIELDS[provider]) {
        const el = $(`${provider}-${kebab}`);
        if (!el) continue;
        const field = FIELD_MAP[kebab];
        if (field === 'secretKey') el.value = '';
        else el.value = saved[field] || '';
      }
    }
    const active = ['local', 'oss', 'qiniu'].includes(cfg.provider) ? cfg.provider : 'local';
    switchTab(active);
  } catch (err) {
    showError(adminError, err.message);
  }
}

document.querySelectorAll('.storage-tabs .tab').forEach((t) => {
  t.addEventListener('click', () => switchTab(t.dataset.provider));
});
$('s-cancel')?.addEventListener('click', () => storageDialog?.close?.());
$('btn-back-from-storage').addEventListener('click', () => {
  state.view = 'customers';
  state.currentCustomer = null;
  state.currentPlan = null;
  render();
});

$('s-test').addEventListener('click', async () => {
  const btn = $('s-test');
  btn.disabled = true;
  btn.textContent = '测试中…';
  try {
    const result = await testStorage(currentProviderConfig());
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
    await saveStorageConfig(currentProviderConfig());
    showError(adminError, `「${$(`.storage-tabs .tab[data-provider="${activeProvider}"]`).textContent}」已保存并启用`, false);
  } catch (err) {
    showStorageMsg(err.message, true);
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- 数据加载 ----------
async function loadCustomers() {
  try {
    customers = (await fetchAdminCustomers()).projects;
  } catch (err) {
    if (err.message.includes('登录') || err.message.includes('401')) {
      localStorage.removeItem(TOKEN_KEY);
      renderLogin();
    } else {
      showError(adminError, err.message);
    }
  }
}

async function loadPlans() {
  try {
    plans = (await fetchAdminPlans()).plans;
  } catch (err) {
    if (err.message.includes('登录') || err.message.includes('401')) {
      localStorage.removeItem(TOKEN_KEY);
      renderLogin();
    } else {
      showError(adminError, err.message);
    }
  }
}

async function loadScenes() {
  try {
    scenes = (await fetchAdminScenes()).scenes;
  } catch (err) {
    if (err.message.includes('登录') || err.message.includes('401')) {
      localStorage.removeItem(TOKEN_KEY);
      renderLogin();
    } else {
      showError(adminError, err.message);
    }
  }
}

async function loadUsers() {
  try {
    users = (await fetchAdminUsers()).users;
  } catch (err) {
    if (err.message.includes('登录') || err.message.includes('401')) {
      localStorage.removeItem(TOKEN_KEY);
      renderLogin();
    } else {
      showError(adminError, err.message);
    }
  }
}

// ---------- 启动 ----------
// ---------- 工作台 ----------
async function loadDashboard() {
  try {
    $('stat-customers').textContent = customers.length;
    $('stat-plans').textContent = plans.length;
    $('stat-scenes').textContent = scenes.length;
    $('stat-users').textContent = users.length;
    // 系统状态
    const settings = await fetchAdminSettings().catch(() => ({ settings: {} }));
    const storageCfg = await fetchStorageConfig().catch(() => ({ config: { provider: 'unknown' } }));
    const smsProvider = settings.settings['sms.provider'] || 'mock';
    const wxEnabled = settings.settings['payment.wechat.enabled'] || false;
    const aliEnabled = settings.settings['payment.alipay.enabled'] || false;
    $('dashboard-status').innerHTML = `
      <div class="status-row"><span>存储</span><span class="badge badge-ok">${storageCfg.config.provider === 'local' ? '本地' : storageCfg.config.provider === 'qiniu' ? '七牛云' : '阿里云OSS'}</span></div>
      <div class="status-row"><span>短信</span><span class="badge ${smsProvider === 'mock' ? 'badge-warn' : 'badge-ok'}">${smsProvider === 'mock' ? 'Mock（开发）' : smsProvider === 'aliyun' ? '阿里云' : '腾讯云'}</span></div>
      <div class="status-row"><span>微信支付</span><span class="badge ${wxEnabled ? 'badge-ok' : 'badge-muted'}">${wxEnabled ? '已启用' : '未配置'}</span></div>
      <div class="status-row"><span>支付宝</span><span class="badge ${aliEnabled ? 'badge-ok' : 'badge-muted'}">${aliEnabled ? '已启用' : '未配置'}</span></div>
    `;
    // 最近操作
    const logs = await fetchOperationLogs({ limit: 8 }).catch(() => ({ logs: [] }));
    if (!logs.logs.length) {
      $('dashboard-logs').innerHTML = '<p class="muted">暂无操作记录</p>';
    } else {
      $('dashboard-logs').innerHTML = logs.logs.map((l) => `
        <div class="log-item">
          <span class="log-time">${l.created_at?.slice(5, 16) || ''}</span>
          <span class="log-user">${l.username || '系统'}</span>
          <span class="log-action">${l.detail || l.action}</span>
        </div>
      `).join('');
    }
  } catch (e) {
    console.error(e);
  }
}

// ---------- 操作日志 ----------
let logState = { offset: 0, total: 0, limit: 50 };
async function loadLogs() {
  const action = $('log-filter-action').value;
  const from = $('log-filter-from').value;
  const to = $('log-filter-to').value;
  try {
    const data = await fetchOperationLogs({ action, from, to, limit: logState.limit, offset: logState.offset });
    logState.total = data.total;
    $('log-tbody').innerHTML = data.logs.map((l) => `
      <tr>
        <td>${l.created_at || ''}</td>
        <td>${l.username || '-'}</td>
        <td><span class="badge badge-muted">${l.action}</span></td>
        <td>${l.target_type ? `${l.target_type}#${l.target_id || ''}` : '-'}</td>
        <td>${l.detail || ''}</td>
        <td>${l.ip || '-'}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px;">暂无记录</td></tr>';
    renderLogPagination();
  } catch (e) {
    showError(adminError, e.message);
  }
}
function renderLogPagination() {
  const pages = Math.ceil(logState.total / logState.limit);
  if (pages <= 1) { $('log-pagination').innerHTML = ''; return; }
  const cur = Math.floor(logState.offset / logState.limit) + 1;
  let html = `<span class="muted">共 ${logState.total} 条</span>`;
  if (cur > 1) html += `<button class="btn btn-ghost btn-sm" data-log-page="${cur - 2}">上一页</button>`;
  html += `<span class="muted">第 ${cur}/${pages} 页</span>`;
  if (cur < pages) html += `<button class="btn btn-ghost btn-sm" data-log-page="${cur}">下一页</button>`;
  $('log-pagination').innerHTML = html;
}
$('log-pagination')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-log-page]');
  if (!btn) return;
  logState.offset = Number(btn.dataset.logPage) * logState.limit;
  loadLogs();
});
$('btn-log-filter')?.addEventListener('click', () => { logState.offset = 0; loadLogs(); });
$('btn-log-export')?.addEventListener('click', async () => {
  try {
    const data = await fetchOperationLogs({ limit: 5000 });
    const rows = [['时间', '用户', '操作', '对象类型', '对象ID', '详情', 'IP']];
    for (const l of data.logs) rows.push([l.created_at, l.username, l.action, l.target_type, l.target_id, l.detail, l.ip]);
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `operation-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  } catch (e) { showError(adminError, e.message); }
});

// ---------- 基础设置 ----------
async function loadSettingsBasic() {
  try {
    const { settings } = await fetchAdminSettings();
    $('set-site-name').value = settings['site.name'] || '';
    $('set-site-title').value = settings['site.title'] || '';
    $('set-site-subtitle').value = settings['site.subtitle'] || '';
    $('set-site-icp').value = settings['site.icp'] || '';
    $('set-site-phone').value = settings['site.phone'] || '';
    $('set-site-email').value = settings['site.email'] || '';
    $('set-copyright-owner').value = settings['copyright.owner'] || '';
    $('set-copyright-year').value = settings['copyright.year'] || '';
    $('set-copyright-text').value = settings['copyright.text'] || '';
    $('set-copyright-enabled').checked = settings['copyright.enabled'] !== false;
  } catch (e) { showError(adminError, e.message); }
}
$('btn-save-basic')?.addEventListener('click', async () => {
  try {
    await saveAdminSettings({
      'site.name': $('set-site-name').value,
      'site.title': $('set-site-title').value,
      'site.subtitle': $('set-site-subtitle').value,
      'site.icp': $('set-site-icp').value,
      'site.phone': $('set-site-phone').value,
      'site.email': $('set-site-email').value,
      'copyright.owner': $('set-copyright-owner').value,
      'copyright.year': $('set-copyright-year').value,
      'copyright.text': $('set-copyright-text').value,
      'copyright.enabled': $('set-copyright-enabled').checked,
    });
    showError(adminError, '基础设置已保存', false);
  } catch (e) { showError(adminError, e.message); }
});

// ---------- 短信接口 ----------
async function loadSettingsSms() {
  try {
    const { settings } = await fetchAdminSettings();
    $('set-sms-provider').value = settings['sms.provider'] || 'mock';
    toggleSmsProviderFields();
    $('set-sms-aliyun-ak').value = settings['sms.aliyun.accessKey'] || '';
    $('set-sms-aliyun-sk').value = '';
    $('set-sms-aliyun-sign').value = settings['sms.aliyun.signName'] || '';
    $('set-sms-aliyun-tpl').value = settings['sms.aliyun.templateCode'] || '';
    $('set-sms-tencent-ak').value = settings['sms.tencent.secretId'] || '';
    $('set-sms-tencent-sk').value = '';
    $('set-sms-tencent-appid').value = settings['sms.tencent.appId'] || '';
    $('set-sms-tencent-sign').value = settings['sms.tencent.signName'] || '';
    $('set-sms-tencent-tpl').value = settings['sms.tencent.templateId'] || '';
  } catch (e) { showError(adminError, e.message); }
}
function toggleSmsProviderFields() {
  const p = $('set-sms-provider').value;
  $('sms-aliyun-fields').hidden = p !== 'aliyun';
  $('sms-tencent-fields').hidden = p !== 'tencent';
}
$('set-sms-provider')?.addEventListener('change', toggleSmsProviderFields);
$('btn-save-sms')?.addEventListener('click', async () => {
  try {
    const provider = $('set-sms-provider').value;
    const pairs = { 'sms.provider': provider };
    if (provider === 'aliyun') {
      pairs['sms.aliyun.accessKey'] = $('set-sms-aliyun-ak').value;
      if ($('set-sms-aliyun-sk').value) pairs['sms.aliyun.secretKey'] = $('set-sms-aliyun-sk').value;
      pairs['sms.aliyun.signName'] = $('set-sms-aliyun-sign').value;
      pairs['sms.aliyun.templateCode'] = $('set-sms-aliyun-tpl').value;
    } else if (provider === 'tencent') {
      pairs['sms.tencent.secretId'] = $('set-sms-tencent-ak').value;
      if ($('set-sms-tencent-sk').value) pairs['sms.tencent.secretKey'] = $('set-sms-tencent-sk').value;
      pairs['sms.tencent.appId'] = $('set-sms-tencent-appid').value;
      pairs['sms.tencent.signName'] = $('set-sms-tencent-sign').value;
      pairs['sms.tencent.templateId'] = $('set-sms-tencent-tpl').value;
    }
    await saveAdminSettings(pairs);
    showError(adminError, '短信接口已保存', false);
  } catch (e) { showError(adminError, e.message); }
});

// ---------- 支付设置 ----------
let currentPayTab = 'wechat';
async function loadSettingsPayment() {
  try {
    const { settings } = await fetchAdminSettings();
    $('set-wx-mch').value = settings['payment.wechat.mchId'] || '';
    $('set-wx-key').value = '';
    $('set-wx-appid').value = settings['payment.wechat.appId'] || '';
    $('set-wx-callback').value = settings['payment.wechat.callbackUrl'] || '';
    $('set-wx-enabled').checked = !!settings['payment.wechat.enabled'];
    $('set-ali-appid').value = settings['payment.alipay.appId'] || '';
    $('set-ali-privatekey').value = settings['payment.alipay.privateKey'] || '';
    $('set-ali-publickey').value = settings['payment.alipay.publicKey'] || '';
    $('set-ali-callback').value = settings['payment.alipay.callbackUrl'] || '';
    $('set-ali-enabled').checked = !!settings['payment.alipay.enabled'];
  } catch (e) { showError(adminError, e.message); }
}
document.querySelectorAll('.payment-tabs .tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.payment-tabs .tab').forEach((x) => x.classList.toggle('active', x === t));
    currentPayTab = t.dataset.pay;
    $('pay-wechat-fields').hidden = currentPayTab !== 'wechat';
    $('pay-alipay-fields').hidden = currentPayTab !== 'alipay';
  });
});
$('btn-save-payment')?.addEventListener('click', async () => {
  try {
    const pairs = {
      'payment.wechat.mchId': $('set-wx-mch').value,
      'payment.wechat.appId': $('set-wx-appid').value,
      'payment.wechat.callbackUrl': $('set-wx-callback').value,
      'payment.wechat.enabled': $('set-wx-enabled').checked,
      'payment.alipay.appId': $('set-ali-appid').value,
      'payment.alipay.privateKey': $('set-ali-privatekey').value,
      'payment.alipay.publicKey': $('set-ali-publickey').value,
      'payment.alipay.callbackUrl': $('set-ali-callback').value,
      'payment.alipay.enabled': $('set-ali-enabled').checked,
    };
    if ($('set-wx-key').value) pairs['payment.wechat.apiKey'] = $('set-wx-key').value;
    await saveAdminSettings(pairs);
    showError(adminError, '支付设置已保存', false);
  } catch (e) { showError(adminError, e.message); }
});

// ---------- 安全设置 ----------
async function loadSettingsSecurity() {
  try {
    const { settings } = await fetchAdminSettings();
    $('set-sec-fail-limit').value = settings['security.loginFailLimit'] ?? 5;
    $('set-sec-session').value = settings['security.sessionTimeout'] ?? 0;
    $('set-sec-pwd-min').value = settings['security.passwordMinLength'] ?? 6;
    $('set-sec-pwd-complex').checked = !!settings['security.passwordComplex'];
  } catch (e) { showError(adminError, e.message); }
}
$('btn-save-security')?.addEventListener('click', async () => {
  try {
    await saveAdminSettings({
      'security.loginFailLimit': Number($('set-sec-fail-limit').value),
      'security.sessionTimeout': Number($('set-sec-session').value),
      'security.passwordMinLength': Number($('set-sec-pwd-min').value),
      'security.passwordComplex': $('set-sec-pwd-complex').checked,
    });
    showError(adminError, '安全设置已保存', false);
  } catch (e) { showError(adminError, e.message); }
});

async function boot() {
  currentUser = getCurrentUser();
  // 用户头像
  $('user-avatar-text').textContent = (currentUser?.username || '?').charAt(0).toUpperCase();
  $('user-dropdown-name').textContent = currentUser?.username || '';
  const roleMap = { admin: '管理员', manager: '运营经理', editor: '编辑', viewer: '只读' };
  $('user-dropdown-role').textContent = roleMap[currentUser?.role] || currentUser?.role || '';

  // 仅 admin 可见用户管理、操作日志和系统设置
  const isAdmin = currentUser?.role === 'admin';
  $('nav-users').style.display = isAdmin ? '' : 'none';
  document.querySelector('.nav-item[data-nav="logs"]').style.display = isAdmin ? '' : 'none';
  document.querySelector('.nav-group-title').style.display = isAdmin ? '' : 'none';
  ['storage', 'settings-basic', 'settings-sms', 'settings-payment', 'settings-security'].forEach((n) => {
    document.querySelector(`.nav-item[data-nav="${n}"]`).style.display = isAdmin ? '' : 'none';
  });

  await Promise.all([loadCustomers(), loadPlans(), loadScenes()]);
  if (isAdmin) await loadUsers();
  state.view = 'dashboard';
  state.currentCustomer = null;
  state.currentPlan = null;
  render();
  loadDashboard();
}

// 侧边栏折叠
$('btn-collapse')?.addEventListener('click', () => {
  $('sidebar').classList.toggle('collapsed');
});

// 用户头像下拉
$('btn-user-menu')?.addEventListener('click', (e) => {
  e.stopPropagation();
  $('user-dropdown').classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.user-menu-wrap')) {
    $('user-dropdown')?.classList.add('hidden');
  }
});
$('btn-user-logout')?.addEventListener('click', () => {
  $('user-dropdown').classList.add('hidden');
  logout();
});

if (isLoggedIn()) {
  renderAdmin();
  boot();
} else {
  renderLogin();
}
