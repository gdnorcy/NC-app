// 客户（租户）后台逻辑
const $ = (id) => document.getElementById(id);
const API_BASE = '/api/customer';

let state = {
  token: localStorage.getItem('customer_token') || '',
  user: null,
  customer: null,
  view: 'dashboard',
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

// ===== 加载租户信息 =====
async function loadProfile() {
  const data = await api('/profile');
  state.customer = data.customer;
  state.user = data.user;
  // 应用品牌色
  if (data.customer.brandColor) {
    document.documentElement.style.setProperty('--brand', data.customer.brandColor);
  }
  // 更新企业名称和 Logo
  $('customer-name').textContent = data.customer.customerName;
  $('brand-name').textContent = data.customer.customerName;
  const logoText = data.customer.customerName.substring(0, 2);
  $('customer-logo').textContent = logoText;
  $('brand-logo').textContent = logoText;
  $('login-logo').textContent = logoText;
  $('login-title').textContent = data.customer.customerName;
  // 用户信息
  $('user-avatar-btn').textContent = (data.user.username || 'U').substring(0, 1).toUpperCase();
  $('dropdown-username').textContent = data.user.username;
  $('dropdown-role').textContent = data.user.role === 'tenant_admin' ? '企业管理员' : '普通成员';
  // 普通成员隐藏成员管理
  if (data.user.role !== 'tenant_admin') {
    document.querySelectorAll('.admin-only').forEach((el) => el.classList.add('hidden'));
  }
}

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
  document.querySelector(`.nav-item[data-nav="${view}"]`)?.classList.add('active');
  // 面包屑
  const names = { dashboard: '工作台', plans: '我的方案', orders: '我的账单', members: '成员管理', settings: '账号设置' };
  $('breadcrumb').innerHTML = `<span>${names[view] || view}</span>`;
  // 加载数据
  if (view === 'dashboard') loadDashboard();
  if (view === 'plans') loadPlans();
  if (view === 'orders') loadOrders();
  if (view === 'members') loadMembers();
  if (view === 'settings') loadSettings();
}

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
async function loadPlans() {
  try {
    const { plans } = await api('/plans');
    if (plans.length) {
      $('plans-tbody').innerHTML = plans.map((p) => `
        <tr>
          <td>${p.name}</td>
          <td>${p.sceneCount || 0}</td>
          <td><span class="tag ${p.shareEnabled ? 'tag-success' : 'tag-default'}">${p.shareEnabled ? '已分享' : '未分享'}</span></td>
          <td style="color:var(--text-3);">${p.createdAt?.substring(0, 10) || ''}</td>
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

// ===== 我的账单 =====
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

// ===== 初始化 =====
(async function init() {
  if (state.token) {
    try {
      await loadProfile();
      showApp();
    } catch {
      logout();
    }
  }
})();
